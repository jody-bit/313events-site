// test/admin-hardening-slice2.test.js — Admin Hardening Slice 2 (issue #13):
// the integrity engine (api/_lib/integrity.js), source health and currency
// (api/_lib/source-health.js), the control-tower report
// (api/_lib/control-tower.js), the truthful healthcheck check
// (api/cron-healthcheck.js sourceOutputCheck) and the gated currency stamp
// (api/_lib/event-upsert.js).
//
// Every fixture is synthetic: invented titles, venues and ids. No network.
// Plain Node assert. Run: node test/admin-hardening-slice2.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const REPO_DIR = path.resolve(__dirname, "..");
const integrity = require(`${REPO_DIR}/api/_lib/integrity.js`);
const health = require(`${REPO_DIR}/api/_lib/source-health.js`);
const tower = require(`${REPO_DIR}/api/_lib/control-tower.js`);

const NOW = Date.parse("2026-10-09T12:00:00Z");
const HOUR = 3600000;
const iso = (ms) => new Date(ms).toISOString();

function ev(overrides) {
  return Object.assign({
    id: "e-" + Math.random().toString(36).slice(2, 10),
    title: "Synthetic Test Night",
    start_date: "2026-10-20",
    end_date: null,
    time_display: "7:00 PM",
    is_all_day: false,
    source: "Example Venue Feed",
    external_id: "example-1",
    status: "approved",
    venue_id: null,
    venue_name_raw: "Example Hall",
    venue_address_raw: "100 Example St",
    venue_city_raw: "Detroit",
    description: "An invented evening used only by this test.",
    description_source: "authoritative",
    ticket_url: null,
    event_url: "https://example-venue.test/events/synthetic-test-night",
    ticket_status: null,
    no_fixed_venue: false,
    updated_at: iso(NOW - 2 * HOUR),
    venues: null,
  }, overrides);
}
const codes = (r) => r.reasons.map((x) => x.code);

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("PASS: " + name);
}

(async () => {
  // ---- H1. a wrong-looking populated link -----------------------------------
  check("a populated link to a DIFFERENT event (RA id mismatch) is Repairable, never counted as a good link", () => {
    const r = integrity.evaluateEvent(ev({ source: "Resident Advisor", external_id: "ra-1000001", event_url: null, ticket_url: "https://ra.co/events/1000002" }));
    assert.strictEqual(r.linkClass, "wrong_event");
    const why = r.reasons.find((x) => x.code === "link.wrong_event");
    assert.ok(why, "link.wrong_event reported");
    assert.strictEqual(why.state, "repairable");
    assert.strictEqual(why.canonical, "https://ra.co/events/1000001");
    assert.strictEqual(r.state, "repairable");
    // and a populated link that matches is fine
    const ok = integrity.evaluateEvent(ev({ source: "Resident Advisor", external_id: "ra-1000001", event_url: "https://ra.co/events/1000001" }));
    assert.strictEqual(ok.linkClass, "specific");
  });
  check("text in a link field is not a link (needs a decision)", () => {
    const r = integrity.evaluateEvent(ev({ ticket_url: "Pay at the door" }));
    assert.ok(codes(r).includes("link.malformed"));
    assert.strictEqual(r.state, "needs_decision");
  });

  // ---- H2. a relative feed URL ----------------------------------------------
  check("a relative CivicPlus feed URL is Repairable and not a usable link", () => {
    const r = integrity.evaluateEvent(ev({ event_url: null, ticket_url: "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=99" }));
    assert.strictEqual(r.linkClass, "relative");
    assert.ok(codes(r).includes("link.relative_feed"));
    assert.strictEqual(r.state, "repairable");
    assert.ok(!codes(r).includes("link.none"), "present-but-useless is reported as what it is, not as missing");
  });
  check("an absolute calendar export (.ics) is a feed link, not an event page", () => {
    assert.strictEqual(integrity.classifyLink("https://city.example.test/calendar/export.ics").linkClass, "feed_export");
  });

  // ---- H3. a bare homepage ---------------------------------------------------
  check("a bare homepage is Advisory and not counted as an event link", () => {
    for (const url of ["https://example-venue.test", "https://example-venue.test/", "https://www.example-venue.test/index.html"]) {
      assert.strictEqual(integrity.classifyLink(url).linkClass, "homepage", url);
    }
    const r = integrity.evaluateEvent(ev({ event_url: "https://example-venue.test/" }));
    assert.ok(codes(r).includes("link.homepage"));
    assert.strictEqual(r.state, "advisory");
  });
  check("one URL carried by 3+ different events is a shared page; one series sharing a page is not", () => {
    const shared = [1, 2, 3].map((n) => ev({ title: `Different Event ${n}`, event_url: "https://example-venue.test/calendar" }));
    const series = [1, 2, 3].map(() => ev({ title: "Weekly Synthetic Trivia", event_url: "https://example-venue.test/trivia" }));
    const s = integrity.summarizeInventory(shared.concat(series));
    assert.strictEqual(s.linkClasses.shared_generic, 3);
    assert.strictEqual(s.linkClasses.specific, 3);
  });

  // ---- H4. a placeholder venue is not trusted as a place ---------------------
  check("a placeholder venue row does not get to assert a city", () => {
    const r = integrity.evaluateEvent(ev({ venue_id: "v-tba", venue_name_raw: "Venue TBA", venue_city_raw: "Example Shores", venue_address_raw: null, venues: { name: "Venue TBA", city: "Detroit", address: null } }));
    assert.ok(codes(r).includes("place.placeholder_asserts_city"));
    assert.ok(!codes(r).includes("place.city_conflict"), "a placeholder is not a place, so there is no 'conflict' between two places");
    assert.strictEqual(r.state, "needs_decision");
  });
  check("an unlinked placeholder venue is flagged as not-a-place, not as a missing address", () => {
    for (const name of ["Venue TBA", "TBA - Somewhere Downtown", "Location TBD", "Multiple Locations", "Parade route to be announced!"]) {
      const r = integrity.evaluateEvent(ev({ venue_name_raw: name, venue_address_raw: null, venue_city_raw: null }));
      assert.ok(codes(r).includes("venue.placeholder"), name);
      assert.ok(!codes(r).includes("place.address_missing"), name);
    }
    const region = integrity.evaluateEvent(ev({ venue_name_raw: "ON", venue_city_raw: null }));
    assert.ok(codes(region).includes("venue.not_a_place"));
  });
  check("a real venue whose two cities disagree needs a decision; a state/ZIP in a city is repairable", () => {
    const conflict = integrity.evaluateEvent(ev({ venue_id: "v1", venue_city_raw: "Ferndale", venues: { name: "Example Hall", city: "Detroit", address: "100 Example St" } }));
    assert.ok(codes(conflict).includes("place.city_conflict"));
    const zip = integrity.evaluateEvent(ev({ venue_city_raw: "Warren, MI 48092" }));
    assert.ok(codes(zip).includes("place.city_state_zip"));
    assert.strictEqual(zip.state, "repairable");
    assert.ok(!codes(integrity.evaluateEvent(ev({ venue_city_raw: "Detroit, MI", venues: { name: "Example Hall", city: "Detroit", address: "x" }, venue_id: "v1" }))).includes("place.city_conflict"), "Detroit, MI and Detroit are the same city");
  });

  // ---- H5. a long legitimate exhibit is not Blocked ---------------------------
  check("a 4-month exhibit is Advisory, never Blocked; an end before the start is Blocked", () => {
    const exhibit = integrity.evaluateEvent(ev({ title: "Synthetic Gallery Exhibit", start_date: "2026-09-01", end_date: "2026-12-31", time_display: null, is_all_day: true }));
    assert.ok(codes(exhibit).includes("date.long_range"));
    assert.notStrictEqual(exhibit.state, "blocked");
    assert.strictEqual(exhibit.state, "advisory");
    const backwards = integrity.evaluateEvent(ev({ start_date: "2026-10-20", end_date: "2026-10-19" }));
    assert.strictEqual(backwards.state, "blocked");
    assert.ok(codes(backwards).includes("date.end_before_start"));
    const notADate = integrity.evaluateEvent(ev({ start_date: "2026-02-31" }));
    assert.strictEqual(notADate.state, "blocked");
  });

  // ---- every non-cleared state says why --------------------------------------
  check("every non-Cleared verdict carries at least one reason with a message; Cleared carries none", () => {
    const s = integrity.summarizeInventory([ev({}), ev({ description: null }), ev({ event_url: "/x" }), ev({ venue_name_raw: null, venue_address_raw: null, venue_city_raw: null })]);
    for (const r of s.results) {
      if (r.state === "cleared") assert.strictEqual(r.reasons.length, 0);
      else {
        assert.ok(r.reasons.length > 0);
        for (const why of r.reasons) assert.ok(why.code && why.message && integrity.STATES.includes(why.state));
      }
    }
    assert.strictEqual(s.counts.cleared, 1);
  });
  check("a systemic problem is ONE class with an affected count, not one task per event", () => {
    const rows = [];
    for (let i = 0; i < 40; i++) rows.push(ev({ source: i % 2 ? "City A" : "City B", event_url: null, ticket_url: "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=1" }));
    const s = integrity.summarizeInventory(rows);
    const feed = s.classes.filter((c) => c.code === "link.relative_feed");
    assert.strictEqual(feed.length, 1);
    assert.strictEqual(feed[0].count, 40);
    assert.deepStrictEqual(feed[0].bySource, { "City A": 20, "City B": 20 });
    assert.strictEqual(feed[0].message, integrity.CLASS_DESCRIPTIONS["link.relative_feed"], "a class is described generically, not by one event's message");
    const src = require("fs").readFileSync(`${REPO_DIR}/api/_lib/integrity.js`, "utf8");
    for (const m of src.matchAll(/"((?:title|date|time|venue|place|link|description|provenance|duplicate|currency)\.[a-z_]+)"/g)) {
      assert.ok(integrity.CLASS_DESCRIPTIONS[m[1]], `every reason code has a class description: ${m[1]}`);
    }
  });
  check("the engine never mutates an event (no status change, no repair)", () => {
    const row = ev({ status: "approved", ticket_url: "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=1", start_date: "2026-10-20", end_date: "2026-10-01" });
    const before = JSON.stringify(row);
    integrity.evaluateEvent(row, { currency: () => ({ state: "stale", message: "x" }) });
    assert.strictEqual(JSON.stringify(row), before);
  });

  // ---- H6. run success with zero useful output is not Healthy -----------------
  const vercelConfig = { crons: [{ path: "/api/cron-cinema-detroit", schedule: "0 20 * * *" }, { path: "/api/cron-belle-isle-nature-center", schedule: "0 17 * * *" }, { path: "/api/cron-planetanttheatre", schedule: "0 2 * * *" }, { path: "/api/cron-lagerhouse", schedule: "0 0 * * *" }] };
  const runsFor = (slug, list) => list.map(([hoursAgo, outcome, fetched, written]) => ({ source_slug: slug, outcome, started_at: iso(NOW - hoursAgo * HOUR), finished_at: iso(NOW - hoursAgo * HOUR + 60000), records_fetched: fetched, records_written: written }));
  check("'success' runs that fetch 38 and write 0, three days running, are FAILING — not healthy", () => {
    const runs = runsFor("cinema-detroit", [[16, "success", 38, 0], [40, "success", 38, 0], [64, "success", 38, 0]]);
    const { bySlug } = health.evaluateSources({ runs, events: [], vercelConfig, now: NOW });
    const s = bySlug.get("cinema-detroit");
    assert.strictEqual(s.status, "failing");
    assert.strictEqual(s.dimensions.execution, "ok", "execution itself succeeded");
    assert.strictEqual(s.dimensions.retrieval, "ok");
    assert.strictEqual(s.dimensions.written, "fail");
    const hc = require(`${REPO_DIR}/api/cron-healthcheck.js`).sourceOutputCheck(s);
    assert.strictEqual(hc.ok, false, "the healthcheck fails this source");
    assert.ok(/no useful output/.test(hc.detail));
  });
  check("one zero-write run is degraded (WARN), still not healthy; zero fetched x3 is failing", () => {
    const one = health.evaluateSources({ runs: runsFor("cinema-detroit", [[16, "success", 38, 0], [40, "success", 38, 5], [64, "success", 38, 5]]), events: [], vercelConfig, now: NOW }).bySlug.get("cinema-detroit");
    assert.strictEqual(one.status, "degraded");
    const hc = require(`${REPO_DIR}/api/cron-healthcheck.js`).sourceOutputCheck(one);
    assert.strictEqual(hc.level, "warn");
    const zero = health.evaluateSources({ runs: runsFor("belle-isle-nature-center", [[19, "success", 0, 0], [43, "success", 0, 0], [67, "success", 0, 0]]), events: [], vercelConfig, now: NOW }).bySlug.get("belle-isle-nature-center");
    assert.strictEqual(zero.status, "failing");
    assert.strictEqual(zero.dimensions.retrieval, "fail");
  });
  check("a connector with no run log is 'insufficient evidence', never 'healthy'", () => {
    const events = [ev({ external_id: "lagerhouse-2026-10-20-x", source: "Lager House", updated_at: iso(NOW - 3 * HOUR) })];
    const s = health.evaluateSources({ runs: [], events, vercelConfig, now: NOW }).bySlug.get("lagerhouse");
    assert.strictEqual(s.status, "insufficient_evidence");
    assert.strictEqual(s.dimensions.execution, "unknown");
    assert.strictEqual(require(`${REPO_DIR}/api/cron-healthcheck.js`).sourceOutputCheck(s).level, "unknown");
  });

  // ---- H7. stale is not cancelled ---------------------------------------------
  check("an event not re-seen on schedule is STALE — advisory, with 'not cancelled' — and nothing else happens to it", () => {
    const old = ev({ external_id: "crowdwork-planet-1-2026-10-20", source: "Planet Ant Theatre", updated_at: "2026-09-14T01:56:39Z" });
    const fresh = ev({ external_id: "crowdwork-planet-2-2026-10-21", source: "Planet Ant Theatre", updated_at: "2026-09-14T01:56:39Z" });
    const res = health.evaluateSources({ runs: [], events: [old, fresh, ev({ external_id: "crowdwork-planet-3", source: "Planet Ant Theatre", updated_at: "2026-09-14T01:56:39Z" })], vercelConfig, now: NOW });
    const s = res.bySlug.get("planetanttheatre");
    assert.strictEqual(s.status, "stale");
    const c = res.currencyOf(old);
    assert.strictEqual(c.state, "stale");
    assert.ok(/not cancelled/.test(c.message));
    const r = integrity.evaluateEvent(old, { currency: res.currencyOf });
    assert.ok(codes(r).includes("currency.not_reseen"));
    assert.strictEqual(r.state, "advisory", "stale never escalates to blocked");
    assert.strictEqual(old.status, "approved", "status untouched");
    assert.ok(!r.reasons.some((x) => /cancel(l)?ed$/i.test(x.code)), "no cancellation code exists");
  });
  check("an event re-upserted by the latest retrieving run is current", () => {
    const runs = runsFor("lagerhouse", [[12, "success", 35, 10], [36, "success", 35, 10]]);
    const e = ev({ external_id: "lagerhouse-2026-10-20-x", source: "Lager House", updated_at: iso(NOW - 12 * HOUR + 30000) });
    const res = health.evaluateSources({ runs, events: [e], vercelConfig, now: NOW });
    assert.strictEqual(res.currencyOf(e).state, "current");
    const missed = ev({ external_id: "lagerhouse-2026-10-21-y", source: "Lager House", updated_at: iso(NOW - 60 * HOUR) });
    assert.strictEqual(res.currencyOf(missed).state, "stale");
  });
  check("last_seen_at_source wins over updated_at when present (Admin edits do not make a row look seen)", () => {
    const runs = runsFor("lagerhouse", [[12, "success", 35, 10]]);
    const e = ev({ external_id: "lagerhouse-2026-10-22-z", source: "Lager House", updated_at: iso(NOW - HOUR), last_seen_at_source: iso(NOW - 80 * HOUR) });
    const res = health.evaluateSources({ runs, events: [e], vercelConfig, now: NOW });
    const c = res.currencyOf(e);
    assert.strictEqual(c.state, "stale");
    assert.strictEqual(c.basis, "last_seen_at_source");
  });

  // ---- H8. unknown cadence is not falsely declared stale -----------------------
  check("an unscheduled source's month-old events are currency UNKNOWN, not stale; the source itself is flagged", () => {
    const tm = [1, 2, 3, 4].map((n) => ev({ source: "Ticketmaster", external_id: `Z${n}vSynthetic${n}`, updated_at: "2026-09-04T00:00:00Z" }));
    const res = health.evaluateSources({ runs: [], events: tm, vercelConfig, now: NOW });
    const s = res.bySlug.get("ticketmaster");
    assert.strictEqual(s.scheduled, false);
    assert.strictEqual(s.status, "unscheduled");
    assert.strictEqual(s.dimensions.currency, "unknown");
    for (const e of tm) {
      const c = res.currencyOf(e);
      assert.strictEqual(c.state, "unknown");
      assert.ok(!codes(integrity.evaluateEvent(e, { currency: res.currencyOf })).includes("currency.not_reseen"));
    }
    assert.strictEqual(require(`${REPO_DIR}/api/cron-healthcheck.js`).sourceOutputCheck(s).ok, false, "public inventory with no schedule fails the healthcheck");
  });
  check("a source that only imports NEW events (RA) is never called stale from old timestamps", () => {
    const runs = runsFor("resident-advisor", [[2, "success", 4, 4]]);
    const e = ev({ source: "Resident Advisor", external_id: "ra-1000009", updated_at: "2026-09-20T00:00:00Z" });
    const res = health.evaluateSources({ runs, events: [e], vercelConfig, now: NOW });
    assert.strictEqual(res.currencyOf(e).state, "unknown");
  });
  check("manual / one-off rows have no recurring source and unknown currency", () => {
    const e = ev({ source: "Manual", external_id: null, updated_at: "2026-08-01T00:00:00Z" });
    const res = health.evaluateSources({ runs: [], events: [e], vercelConfig, now: NOW });
    assert.strictEqual(res.currencyOf(e).state, "unknown");
  });
  check("cadence is only read from shapes we understand", () => {
    assert.strictEqual(health.parseCronCadenceHours("0 14 * * *"), 24);
    assert.strictEqual(health.parseCronCadenceHours("15 12 * * *"), 24);
    assert.strictEqual(health.parseCronCadenceHours("0 */6 * * *"), 6);
    assert.strictEqual(health.parseCronCadenceHours("0 9 * * 1"), 168);
    assert.strictEqual(health.parseCronCadenceHours("0 9 1 * *"), null);
    assert.strictEqual(health.parseCronCadenceHours("nonsense"), null);
  });
  check("the real vercel.json: the 2026-10-04 hold is visible (Ticketmaster and MotorCity Wine unscheduled)", () => {
    const sched = health.schedulesFromVercel(require(`${REPO_DIR}/vercel.json`));
    assert.ok(!sched.has("ticketmaster"));
    assert.ok(!sched.has("motorcitywine"));
    assert.strictEqual(sched.get("cinema-detroit").cadenceHours, 24);
  });
  check("an unreadable cron schedule never makes a source 'unscheduled'", () => {
    const tm = [ev({ source: "Ticketmaster", external_id: "Z1vSynthetic", updated_at: "2026-09-04T00:00:00Z" })];
    const s = health.evaluateSources({ runs: [], events: tm, vercelConfig: null, now: NOW }).bySlug.get("ticketmaster");
    assert.strictEqual(s.status, "insufficient_evidence");
  });
  check("volume anomalies compare against completed runs only", () => {
    const runs = runsFor("lagerhouse", [[1, "success", 35, 10], [25, "failed", 35, 0], [49, "failed", 35, 0], [73, "success", 35, 10], [97, "success", 35, 10]]);
    const s = health.evaluateSources({ runs, events: [], vercelConfig, now: NOW }).bySlug.get("lagerhouse");
    assert.ok(!Object.values(s.volume || {}).some((v) => v.deviates), "a recovery after failed runs is not a volume spike");
  });

  // ---- control tower report ------------------------------------------------------
  check("buildReport keeps system health and human decisions apart and reads only what it is given", () => {
    const events = [
      ev({ source: "City A", external_id: "feed-aaaa-1", event_url: null, ticket_url: "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=1" }),
      ev({ source: "City A", external_id: "feed-aaaa-2", event_url: null, ticket_url: "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=1" }),
      ev({ source: "Planet Ant Theatre", external_id: "crowdwork-x-1", updated_at: "2026-09-14T00:00:00Z" }),
      ev({ status: "pending_review" }),
    ];
    const report = tower.buildReport({ now: NOW, today: "2026-10-09", events, runs: [], runsError: null, lastSeenColumn: false, vercelConfig }, { includeEvents: true });
    assert.ok(report.system && report.decisions);
    assert.strictEqual(report.decisions.evaluated, 3, "public (approved) only");
    assert.strictEqual(report.decisions.pendingReview, 1);
    const feed = report.decisions.classes.find((c) => c.code === "link.relative_feed");
    assert.strictEqual(feed.count, 2);
    assert.ok(/proxy/.test(report.currencyBasis));
    const planet = report.system.sources.find((s) => s.slug === "planetanttheatre");
    assert.strictEqual(planet.status, "insufficient_evidence", "one event is below the stale minimum — no claim made");
    assert.ok(report.decisions.events.every((e) => e.state !== "cleared"));
  });
  {
    const calls = [];
    const fakeFetch = async (url) => {
      calls.push(url);
      if (url.includes("/events?") && url.includes("last_seen_at_source")) return { ok: false, status: 400, json: async () => ({ code: "42703", message: "column events.last_seen_at_source does not exist" }) };
      if (url.includes("/events?")) return { ok: true, status: 200, json: async () => [ev({})] };
      if (url.includes("/source_runs?")) return { ok: true, status: 200, json: async () => [] };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const snap = await tower.loadSnapshot({ supabaseUrl: "https://example.test", serviceRoleKey: "k", fetchFn: fakeFetch, now: NOW, vercelConfig });
    assert.strictEqual(snap.lastSeenColumn, false);
    assert.strictEqual(snap.events.length, 1);
    assert.ok(calls.every((u) => !/method=|PATCH|POST/.test(u)));
    assert.ok(calls.some((u) => u.includes("or=(start_date.gte.2026-10-09,end_date.gte.2026-10-09)")), "scope includes events still running");
    console.log("PASS: loadSnapshot falls back cleanly before migration_046, and the scope includes running exhibits");
    passed += 1;
  }

  // ---- currency stamp in the shared upsert helper ------------------------------
  {
    const { upsertEventRows } = require(`${REPO_DIR}/api/_lib/event-upsert.js`);
    const rows = [{ external_id: "x-1", title: "A" }, { external_id: "x-2", title: "B" }];
    const realFetch = global.fetch;
    const bodies = [];
    try {
      delete process.env.EVENTS_LAST_SEEN_AT_SOURCE;
      global.fetch = async (url, init) => { bodies.push(init.body); return { ok: true, status: 201, text: async () => "" }; };
      await upsertEventRows("https://example.test", "k", rows);
      assert.ok(!bodies[0].includes("last_seen_at_source"), "OFF by default: request body unchanged");

      process.env.EVENTS_LAST_SEEN_AT_SOURCE = "on";
      bodies.length = 0;
      const r = await upsertEventRows("https://example.test", "k", rows);
      assert.strictEqual(r.written, 2);
      const sent = JSON.parse(bodies[0]);
      assert.ok(sent.every((row) => row.last_seen_at_source && row.last_seen_at_source === sent[0].last_seen_at_source), "one observation time on every row");
      assert.ok(!("last_seen_at_source" in rows[0]), "the caller's rows are not mutated");

      bodies.length = 0;
      let n = 0;
      global.fetch = async (url, init) => {
        bodies.push(init.body);
        n += 1;
        if (n === 1) return { ok: false, status: 400, text: async () => '{"code":"PGRST204","message":"Could not find the \'last_seen_at_source\' column of \'events\' in the schema cache"}' };
        return { ok: true, status: 201, text: async () => "" };
      };
      const fb = await upsertEventRows("https://example.test", "k", rows);
      assert.strictEqual(fb.ok, true);
      assert.strictEqual(fb.written, 2);
      assert.strictEqual(bodies.length, 2);
      assert.ok(!bodies[1].includes("last_seen_at_source"), "resent without the column");

      global.fetch = async () => ({ ok: false, status: 400, text: async () => "some other validation error" });
      const other = await upsertEventRows("https://example.test", "k", rows);
      assert.strictEqual(other.ok, false);
      assert.strictEqual(await other.text(), "some other validation error", "other errors are reported unchanged");
      assert.ok(!("last_seen_at_source" in other.failedRows[0]), "failed rows are the caller's own rows");
    } finally {
      delete process.env.EVENTS_LAST_SEEN_AT_SOURCE;
      global.fetch = realFetch;
    }
    console.log("PASS: the currency stamp is off by default, uniform when on, and survives a missing column");
    passed += 1;
  }

  console.log(`\nAll ${passed} admin-hardening-slice2 checks passed.`);
})().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
