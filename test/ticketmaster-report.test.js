// test/ticketmaster-report.test.js -- the read-only Ticketmaster report (2026-10-11).
//
// The report must say what a synchronisation WOULD do (new, changed, cancelled-by-
// Ticketmaster, absent, duplicates, incomplete pagination, protected descriptions)
// while performing no write of any kind. Run: node test/ticketmaster-report.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.TICKETMASTER_API_KEY = "test-key";
const connector = require("../api/cron-ticketmaster.js");
const { buildReport } = require("../api/_lib/ticketmaster-report.js");
const { planConsolidation } = require("../scripts/duplicate-consolidation.js");
const { readExistingFromSupabase } = require("../scripts/ticketmaster-report.js");

const TODAY = "2026-10-12";
const ev = (id, name, extra = {}) => ({
  id, name, url: `https://www.ticketmaster.com/event/${id}`, info: extra.info,
  classifications: extra.classifications || [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
  dates: { start: { localDate: extra.date || "2026-10-20", localTime: extra.time || "19:30:00" }, status: { code: extra.status || "onsale" } },
  priceRanges: [{ min: extra.price ?? 35, max: 90 }],
  _embedded: { venues: [{ name: extra.venue || "Fixture Hall", city: { name: "Detroit" }, location: extra.location || { latitude: "42.3387", longitude: "-83.0524" } }] },
});
const stored = (external_id, extra = {}) => ({
  id: `row-${external_id}`, external_id, source: "Ticketmaster", status: "approved", title: `Band ${external_id}`, category: "music",
  start_date: "2026-10-20", time_display: "7:30 PM", venue_name_raw: "Fixture Hall", price_from: 35, ticket_status: "onsale", description: null, created_at: "2026-09-04", ...extra,
});
const run = (fetched, existing) => buildReport({ fetched, existing, today: TODAY, shapeForDb: connector.shapeForDb, mapCategory: connector.mapCategory, planConsolidation });
const fetchedOf = (events, info) => ({ events, info: { complete: true, pagesFetched: 1, totalElements: events.length, httpStatus: 200, reason: null, ...info } });

// ---- 1. the estimate -------------------------------------------------------
{
  const events = [
    ev("same", "Band same"),                                              // unchanged
    ev("moved", "Band moved", { time: "20:00:00", info: "Doors at 7." }),    // time changed; stored description must be protected
    ev("gone-cancelled", "Band gone-cancelled", { status: "cancelled" }),  // Ticketmaster says cancelled
    ev("fresh", "Fresh Band", { venue: "Brand New Hall" }),                 // new
    ev("fresh-dup", "Joint Show", { venue: "Majestic Theatre", time: "20:00:00" }), // new, also on the site from another source
    ev("suite", "Fresh Band - Suite Rental"),                              // filtered: not an event
    ev("sport-unmapped", "Thing", { classifications: [{ segment: { name: "Undefined" } }] }),
    ev("far", "Far Away", { location: { latitude: "40.0", longitude: "-88.0" } }),
    ev("rej", "Band rej"),                                                  // stored but rejected by a moderator
  ];
  const existing = [
    stored("same"),
    stored("moved", { description: "Hand-written description." }),
    stored("gone-cancelled", { ticket_status: "onsale" }),
    stored("vanished", { start_date: "2026-11-01" }),                       // approved, upcoming, not in the fetch
    stored("old-past", { start_date: "2026-09-01" }),                       // past: not "absent"
    stored("rej", { status: "rejected" }),
    { id: "vd-1", external_id: "vd-9", source: "VisitDetroit", status: "approved", title: "Joint Show", start_date: "2026-10-20", time_display: "8:00 PM", venue_name_raw: "Majestic Theatre", description: "x", created_at: "2026-09-01" },
  ];
  const snapshot = JSON.stringify([events, existing]);
  const r = run(fetchedOf(events), existing);

  assert.strictEqual(JSON.stringify([events, existing]), snapshot, "inputs are not modified");
  assert.strictEqual(r.read_only, true); assert.strictEqual(r.writes_performed, 0);
  assert.strictEqual(r.shaping.raw_events, 9);
  assert.deepStrictEqual(r.shaping.skipped, { non_event_listing: 1, unmapped_category: 1, outside_service_area: 1 });
  assert.strictEqual(r.estimate.new, 2, "fresh + fresh-dup");
  assert.strictEqual(r.estimate.changed, 2, "moved (time) + gone-cancelled (ticket_status)");
  assert.strictEqual(r.estimate.unchanged, 1);
  assert.strictEqual(r.estimate.already_rejected_left_alone, 1, "a moderator's rejection stands");
  assert.strictEqual(r.estimate.flagged_cancelled_by_ticketmaster, 1);
  assert.strictEqual(r.estimate.stored_not_returned_verify, 1, "only the upcoming approved row that was not returned");
  assert.deepStrictEqual(r.samples.stored_not_returned.map((s) => s.external_id), ["vanished"]);
  assert.strictEqual(r.descriptions.stored_descriptions_protected_from_overwrite, 1);
  assert.deepStrictEqual(r.changes_by_field, { time_display: 1, ticket_status: 1 });
  assert.strictEqual(r.estimate.new_with_potential_duplicate, 1, "the Majestic Theatre listing duplicates the VisitDetroit row");
  assert.strictEqual(r.duplicates.certain.length + r.duplicates.needs_review.length, 1);
  assert.strictEqual(r.estimate.new_without_duplicate_signal, 1);
  assert.deepStrictEqual(r.flags, [], "a complete, small fetch raises no flag");
  console.log("PASS: report counts new / changed / cancelled / absent / duplicates / protected descriptions; inputs untouched");

  assert.deepStrictEqual(run(fetchedOf(events), existing), r, "same input, same report");
  console.log("PASS: report is deterministic");
}

// ---- 2. incomplete pagination is detected and makes "absent" unreliable -----
{
  const events = [ev("a", "Band a")];
  const existing = [stored("a"), stored("b", { start_date: "2026-11-02" })];
  const r = run(fetchedOf(events, { complete: false, pagesFetched: 1, totalElements: 600, reason: "page 1 failed: HTTP 500" }), existing);
  assert.strictEqual(r.retrieval.complete, false);
  assert.strictEqual(r.retrieval.fetched_matches_api_total, false);
  assert.strictEqual(r.estimate.stored_not_returned_reliable, false);
  assert.ok(r.flags.some((f) => /INCOMPLETE FETCH: page 1 failed: HTTP 500/.test(f)));
  assert.ok(r.flags.some((f) => /Fetched 1 of 600/.test(f)));
  assert.ok(!r.flags.some((f) => /deep-paging cap/.test(f)), "600 < 1000 does not trigger the cap flag");
  console.log("PASS: incomplete pagination is flagged and makes the absent count unreliable");
}
{
  const r = run(fetchedOf([ev("a", "Band a")], { totalElements: 1800, complete: false, reason: "result set has 9 pages; only the first 5 were fetched" }), []);
  assert.strictEqual(r.retrieval.deep_paging_capped, true);
  assert.ok(r.flags.some((f) => /1800 events/.test(f)));
  const small = run(fetchedOf([ev("a", "Band a")], { totalElements: 1 }), []);
  assert.strictEqual(small.retrieval.deep_paging_capped, false);
  console.log("PASS: a result set beyond the 1,000-result cap is flagged");
}

// ---- 3. a large catch-up is called out -------------------------------------
{
  const many = Array.from({ length: 200 }, (_, i) => ev(`n${i}`, `New Band ${i}`));
  const r = run(fetchedOf(many), []);
  assert.strictEqual(r.estimate.new, 200);
  assert.ok(r.flags.some((f) => /200 new events would be published as approved/.test(f)));
  console.log("PASS: a large first-run catch-up is flagged");
}

// ---- 4. nothing can write ---------------------------------------------------
{
  const calls = [];
  const stub = async (url, init) => { calls.push({ url, method: init && init.method }); return { ok: true, status: 200, json: async () => [] }; };
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  readExistingFromSupabase(TODAY, stub).then((rows) => {
    assert.deepStrictEqual(rows, []);
    assert.ok(calls.length >= 2 && calls.every((c) => c.method === "GET" && c.url.includes("/rest/v1/events?")), "only GETs of the events table");
    console.log("PASS: the Supabase reader issues GET requests only");
  }).catch((e) => { console.error(e); process.exit(1); });

  const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "ticketmaster-report.js"), "utf8") + fs.readFileSync(path.join(__dirname, "..", "api", "_lib", "ticketmaster-report.js"), "utf8");
  assert.ok(!/method:\s*["'](POST|PATCH|PUT|DELETE)/i.test(src), "no write verb appears in the report code");
  assert.ok(!/upsertEventRows|startRun|finishRun|source_runs/.test(src), "the report neither upserts nor logs a run");
  console.log("PASS: the report code contains no write path");
}

// ---- 5. the CLI works offline, and refuses a live run without a key ---------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tm-report-"));
  const tmFile = path.join(dir, "tm.json"), exFile = path.join(dir, "ex.json"), out = path.join(dir, "out.json");
  fs.writeFileSync(tmFile, JSON.stringify(fetchedOf([ev("a", "Band a"), ev("b", "Band b")])));
  fs.writeFileSync(exFile, JSON.stringify([stored("a")]));
  const env = { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" };
  const ok = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "ticketmaster-report.js"), "--tm", tmFile, "--existing", exFile, "--out", out, "--today", TODAY], { env, encoding: "utf8" });
  assert.strictEqual(ok.status, 0, ok.stderr);
  const report = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.strictEqual(report.estimate.new, 1); assert.strictEqual(report.writes_performed, 0);
  assert.strictEqual(report.preflight.mode, "offline discovery file");
  assert.ok(!JSON.stringify(report).includes("test-key"), "the key is never printed");

  const noKey = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "ticketmaster-report.js"), "--existing", exFile], { env: { ...env, TICKETMASTER_API_KEY: "" }, encoding: "utf8" });
  assert.strictEqual(noKey.status, 2, "no key: refuses to attempt a live run");
  assert.match(noKey.stderr, /TICKETMASTER_API_KEY is not set/);
  console.log("PASS: CLI runs offline with no credentials and refuses a live run without the key");
}
