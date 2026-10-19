// test/source-calendar-links.test.js — api/_lib/source-calendar-links.js: the blank-only source calendar-page fallback link.
//
// DQ sweep 2026-10-19: events from municipal/venue feeds that carry no per-event link have neither ticket_url nor event_url.
// The fix gives them the source's own calendar page as event_url, and only when BOTH link fields are blank. The overwrite
// guarantee is enforced by the database filter, so these tests pin the filter and the payload, not just the helper's logic.
//
// Plain Node assert, no dependencies. Run: node test/source-calendar-links.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { SOURCE_CALENDAR_PAGES, FEED_CALENDAR_PAGE_OVERRIDES, looksLikeCalendarPage, calendarFallbackFor, fillBlankSourceCalendarLinks } = require(`${REPO_DIR}/api/_lib/source-calendar-links.js`);
const { upsertEventRows } = require(`${REPO_DIR}/api/_lib/event-upsert.js`);

const BASE = "https://example.supabase.co";
const KEY = "service-role-key";

// A recording fake: answers PATCH with the ids the filter "matched" (count given per call order) and records everything.
function recorder(matchedCounts) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), method: opts && opts.method, body: opts && opts.body ? JSON.parse(opts.body) : null, headers: opts && opts.headers });
    const n = matchedCounts ? matchedCounts[i++] : 0;
    return { ok: true, status: 200, json: async () => Array.from({ length: n || 0 }, (_, k) => ({ id: k + 1 })), text: async () => "" };
  };
  return { calls, fetchImpl };
}

(async () => {
  // 1. the registry: only the four single-venue connectors, each a valid absolute page, none a calendar-feed endpoint
  assert.deepStrictEqual(Object.keys(SOURCE_CALENDAR_PAGES).sort(), ["GottaGacha", "HALO Detroit", "Redford Theatre", "Trinosophes"]);
  for (const [src, url] of Object.entries(SOURCE_CALENDAR_PAGES)) {
    assert.ok(/^https:\/\/[^/]+\.[a-z]+\//i.test(url), src + " is an absolute https page");
    assert.ok(!/\.ics|icalendar/i.test(url), src + " is not a feed endpoint");
  }
  // the registry matches what each connector actually writes as `source` and uses as its own events page
  const read = (f) => fs.readFileSync(path.join(REPO_DIR, "api", f), "utf8");
  assert.ok(read("cron-halo.js").includes('source: "HALO Detroit"') && read("cron-halo.js").includes(`SOURCE_URL = "${SOURCE_CALENDAR_PAGES["HALO Detroit"]}"`));
  assert.ok(read("cron-trinosophes.js").includes('source: "Trinosophes"') && read("cron-trinosophes.js").includes(`SOURCE_URL = "${SOURCE_CALENDAR_PAGES["Trinosophes"]}"`));
  assert.ok(read("cron-gottagacha.js").includes('source: "GottaGacha"') && read("cron-gottagacha.js").includes(`OFFICIAL_EVENTS_PAGE = "${SOURCE_CALENDAR_PAGES["GottaGacha"]}"`));
  assert.ok(read("cron-redford-theatre.js").includes('SOURCE_NAME = "Redford Theatre"') && read("cron-redford-theatre.js").includes(`SOURCE_URL = "${SOURCE_CALENDAR_PAGES["Redford Theatre"]}"`));
  console.log("PASS: registry holds exactly the four single-venue connectors and matches their own source name and page");

  // 2. which rows get a target (pure)
  assert.deepStrictEqual(
    calendarFallbackFor({ source: "City of Livonia - Community Events", feed_source_id: "fs-1", _calendarUrl: "https://www.livonia.gov/calendar" }),
    { by: "feed_source_id", key: "fs-1", url: "https://www.livonia.gov/calendar", label: "City of Livonia - Community Events" });
  assert.deepStrictEqual(calendarFallbackFor({ source: "HALO Detroit" }).url, SOURCE_CALENDAR_PAGES["HALO Detroit"]);
  assert.strictEqual(calendarFallbackFor({ source: "HALO Detroit" }).by, "source");
  for (const bad of [null, undefined, "x", {}, { source: "Eventbrite" }, { source: "constructor" }, { source: "__proto__" },
    { feed_source_id: "fs-1", source: "X", _calendarUrl: null },
    { feed_source_id: "fs-1", source: "X", _calendarUrl: "" },
    { feed_source_id: "fs-1", source: "X", _calendarUrl: "livonia.gov/calendar" },                     // not absolute
    { feed_source_id: "fs-1", source: "X", _calendarUrl: "/calendar" },                                // site-relative: never resolved or guessed
    { feed_source_id: "fs-1", source: "X", _calendarUrl: "javascript:alert(1)" },
    { feed_source_id: "fs-1", source: "X", _calendarUrl: "ftp://x.gov/cal" },
    { feed_source_id: "fs-1", source: "X", _calendarUrl: "https://x.gov/common/modules/iCalendar/iCalendar.aspx?feed=calendar" }, // a feed endpoint
    { feed_source_id: "fs-1", source: "X", _calendarUrl: "https://x.gov/feed.ics" },
    { feed_source_id: "fs-1", source: "X", _calendarUrl: "https://www.livonia.gov/" },                  // a bare homepage is never filled
    { feed_source_id: "fs-1", source: "X", _calendarUrl: "https://www.livonia.gov" },
    { feed_source_id: "fs-1", source: "X", _calendarUrl: "https://www.livonia.gov/departments/parks" }, // a section page, not a calendar
    { source: "X", _calendarUrl: "https://x.gov/calendar" }]) {                                         // marker without a feed id: no target
    assert.strictEqual(calendarFallbackFor(bad), null, "no target for " + JSON.stringify(bad));
  }
  console.log("PASS: only a valid absolute http(s) calendar page, from an approved feed or the registry, becomes a target");

  // 2b. what counts as a calendar page, the override map, and precedence
  {
    for (const ok of ["https://www.dearborn.gov/calendar", "https://www.romi.gov/calendar.aspx", "https://x.gov/events/", "https://x.gov/Calendar/Month", "https://x.gov/community-calendar", "https://x.gov/whats-on"]) assert.ok(looksLikeCalendarPage(ok), ok);
    for (const no of ["https://www.livonia.gov/", "https://www.livonia.gov", "https://x.gov/home", "https://x.gov/index.html", "https://x.gov/departments/parks", "https://x.gov/events-and-programs", "https://x.gov/?page=calendar", "x.gov/calendar", "/calendar", "", null, 5]) assert.ok(!looksLikeCalendarPage(no), String(no));
    assert.deepStrictEqual(FEED_CALENDAR_PAGE_OVERRIDES, { "redfordtwp.gov": "https://www.redfordtwp.gov/calendar.aspx" }, "only EI-confirmed pages are hard-coded");
    assert.ok(Object.isFrozen(FEED_CALENDAR_PAGE_OVERRIDES));
    // Redford: its homepage website resolves to the confirmed calendar page, scoped to that feed
    const red = { source: "Redford Township Community Events", feed_source_id: "fs-red", _calendarUrl: "https://www.redfordtwp.gov/" };
    assert.deepStrictEqual(calendarFallbackFor(red), { by: "feed_source_id", key: "fs-red", url: "https://www.redfordtwp.gov/calendar.aspx", label: "Redford Township Community Events" });
    assert.strictEqual(calendarFallbackFor({ ...red, _calendarUrl: "https://redfordtwp.gov" }).url, "https://www.redfordtwp.gov/calendar.aspx", "host match ignores www and path");
    assert.strictEqual(calendarFallbackFor({ ...red, feed_source_id: null }), null, "no feed id: no target");
    // the held cities get nothing while their website is a bare homepage
    for (const site of ["https://www.livonia.gov/", "https://www.romi.gov/", "https://www.cantonmi.gov/", "https://www.madisonheightsmi.gov/", "https://www.sterlingheights.gov/", "https://www.gardencitymi.org/", "https://www.macomb-mi.gov/"]) {
      assert.strictEqual(calendarFallbackFor({ source: "City", feed_source_id: "fs-x", _calendarUrl: site }), null, site);
    }
    // an override wins over the feed's own website, and must itself be a valid page
    const ov = { "livonia.gov": "https://www.livonia.gov/calendar.aspx" };
    const liv = { source: "City of Livonia - Community Events", feed_source_id: "fs-1", _calendarUrl: "https://www.livonia.gov/" };
    assert.strictEqual(calendarFallbackFor(liv), null, "homepage website and no override: no fallback");
    assert.strictEqual(calendarFallbackFor(liv, ov).url, "https://www.livonia.gov/calendar.aspx");
    assert.strictEqual(calendarFallbackFor({ ...liv, _calendarUrl: "https://www.livonia.gov/events" }, ov).url, "https://www.livonia.gov/calendar.aspx", "override beats the website");
    assert.strictEqual(calendarFallbackFor(liv, { "livonia.gov": "https://www.livonia.gov/feed.ics" }), null, "an override that is a feed endpoint is ignored");
    console.log("PASS: a bare homepage is never filled; only a calendar-looking website or an explicit verified override is");
  }

  // 3. the write: blank-only filter on BOTH link fields, event_url only, scoped to the source, one PATCH per source
  {
    const { calls, fetchImpl } = recorder([5, 3]);
    const rows = [
      { source: "City of Livonia - Community Events", feed_source_id: "fs-1", _calendarUrl: "https://www.livonia.gov/calendar" },
      { source: "City of Livonia - Community Events", feed_source_id: "fs-1", _calendarUrl: "https://www.livonia.gov/calendar" },
      { source: "HALO Detroit" },
      { source: "Some other connector", ticket_url: "https://x.org/t" },
    ];
    const out = await fillBlankSourceCalendarLinks(BASE, KEY, rows, fetchImpl, new Date("2026-10-19T23:30:00Z"));
    assert.strictEqual(calls.length, 2, "one PATCH per source, none for a source with no registered page");
    for (const c of calls) {
      assert.strictEqual(c.method, "PATCH");
      const q = decodeURIComponent(c.url);
      assert.ok(q.includes("and=(or(ticket_url.is.null,ticket_url.eq.),or(event_url.is.null,event_url.eq.),or(start_date.gte.2026-10-19,end_date.gte.2026-10-19))"), "BOTH fields blank, and not past: " + q);
      assert.ok(q.includes("status=eq.approved"), "approved rows only: " + q);
      assert.deepStrictEqual(Object.keys(c.body), ["event_url"], "the payload is event_url alone; ticket_url is never written");
      assert.ok(!/ticket_url["']?\s*:/.test(JSON.stringify(c.body)));
    }
    assert.ok(decodeURIComponent(calls[0].url).includes("feed_source_id=eq.fs-1"));
    assert.strictEqual(calls[0].body.event_url, "https://www.livonia.gov/calendar");
    assert.ok(decodeURIComponent(calls[1].url).includes("source=eq.HALO Detroit"));
    assert.strictEqual(calls[1].body.event_url, SOURCE_CALENDAR_PAGES["HALO Detroit"]);
    assert.deepStrictEqual(out, { patched: 8, bySource: { "City of Livonia - Community Events": 5, "HALO Detroit": 3 } }, "affected rows are counted per source from what the database changed");
    console.log("PASS: blank-only on both fields, event_url only, scoped per source, counted per source");
  }

  // 4. the guarantee as the database sees it: a row with a ticket link, an event link, or both is outside the filter
  {
    // Evaluate the exact predicate the request sends, over rows in every link state.
    const blank = (v) => v === null || v === undefined || v === "";
    const TODAY = "2026-10-19";
    const matches = (r) => r.status === "approved" && blank(r.ticket_url) && blank(r.event_url) && ((r.start_date || "") >= TODAY || (r.end_date || "") >= TODAY);
    const live = { status: "approved", start_date: "2026-10-30", ticket_url: null, event_url: null };
    const states = [
      [live, true], [{ ...live, ticket_url: "", event_url: "" }, true], [{ status: "approved", start_date: "2026-10-30" }, true],
      [{ ...live, start_date: "2026-10-19" }, true],                               // today is not past
      [{ ...live, start_date: "2026-09-01", end_date: "2026-11-01" }, true],       // a run still in progress
      [{ ...live, start_date: "2026-10-18" }, false],                              // over yesterday
      [{ ...live, start_date: "2026-01-01", end_date: "2026-01-02" }, false],
      [{ ...live, status: "pending_review" }, false], [{ ...live, status: "rejected" }, false],
      [{ ...live, ticket_url: "https://t.example/1" }, false],
      [{ ...live, event_url: "https://e.example/1" }, false],
      [{ ...live, ticket_url: "https://t.example/1", event_url: "https://e.example/1" }, false],
      [{ ...live, ticket_url: "", event_url: "https://e.example/1" }, false],
    ];
    for (const [r, want] of states) assert.strictEqual(matches(r), want, JSON.stringify(r));
    console.log("PASS: a row with either link set, a non-approved row, or a past event is never in the PATCH's reach");
  }

  // 5. failure never fails a run; a non-ok response counts nothing
  {
    const boom = async () => { throw new Error("network"); };
    assert.deepStrictEqual(await fillBlankSourceCalendarLinks(BASE, KEY, [{ source: "HALO Detroit" }], boom), { patched: 0, bySource: {} });
    const notOk = async () => ({ ok: false, status: 500, json: async () => { throw new Error("no body"); } });
    assert.deepStrictEqual(await fillBlankSourceCalendarLinks(BASE, KEY, [{ source: "HALO Detroit" }], notOk), { patched: 0, bySource: {} });
    assert.deepStrictEqual(await fillBlankSourceCalendarLinks(BASE, KEY, [], boom), { patched: 0, bySource: {} });
    assert.deepStrictEqual(await fillBlankSourceCalendarLinks(BASE, KEY, null, boom), { patched: 0, bySource: {} });
    console.log("PASS: a failed back-fill is swallowed and counts nothing");
  }

  // 6. wired into the shared upsert for single-venue connectors: after a successful write, never after a failed one
  {
    const log = [];
    const mk = (status) => async (url, opts) => {
      log.push({ url: String(url), method: opts.method, body: opts.body });
      if (opts.method === "PATCH") return { ok: true, status: 200, json: async () => [{ id: 1 }], text: async () => "" };
      if (opts.method === "GET" || !opts.method) return { ok: true, status: 200, json: async () => [], text: async () => "[]" }; // owner-corrections lookup
      return { ok: status < 300, status, json: async () => ({}), text: async () => "err" };
    };
    const row = { external_id: "halo-1", title: "Show", category: "music", start_date: "2026-10-30", status: "approved", source: "HALO Detroit" };
    const saved = global.fetch;
    try {
      global.fetch = mk(201);
      const ok = await upsertEventRows(BASE, KEY, [row]);
      assert.ok(ok.ok);
      const patches = log.filter((l) => l.method === "PATCH" && decodeURIComponent(l.url).includes("source=eq.HALO Detroit"));
      assert.strictEqual(patches.length, 1, "one fallback PATCH after a successful write");
      assert.ok(!log.filter((l) => l.method === "POST").some((l) => /event_url/.test(l.body || "")), "the upsert itself never carries the fallback link");

      log.length = 0;
      global.fetch = mk(500);
      const bad = await upsertEventRows(BASE, KEY, [row]);
      assert.ok(!bad.ok);
      assert.strictEqual(log.filter((l) => l.method === "PATCH").length, 0, "no fallback PATCH when nothing was written");
    } finally { global.fetch = saved; }
    console.log("PASS: the shared upsert back-fills after a successful write only; the write itself never carries the link");
  }

  // 7. cron-feeds: the marker is stripped before any write, and the feed builders set it from the approved website
  {
    const src = read("cron-feeds.js");
    assert.ok(/const \{ _dateConfidence, _publication, _enrichment, _recurring, _calendarUrl, \.\.\.cleanRow \} = row;/.test(src), "marker stripped before the write");
    assert.strictEqual((src.match(/_calendarUrl: feedSource\.website \|\| null/g) || []).length, 2, "ICS and RSS builders set the marker from feed_sources.website");
    assert.ok(/fillBlankSourceCalendarLinks\(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, keep\)/.test(src));
    console.log("PASS: cron-feeds strips the marker before the write and back-fills only after it");
  }
  console.log("ALL source-calendar-links tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
