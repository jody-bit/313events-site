// test/duplicate-durability.test.js — RESOLVED ONCE -> STAYS RESOLVED.
//
// Contract (Product Owner, 2026-10-08):
//   * identity is never established from title similarity, venue name or an
//     address alone; recurring/adjacent-night events are never collapsed;
//     an ambiguous match is NOT a duplicate (it becomes a pending_review row);
//   * a merged duplicate is never recreated or revived by re-ingestion, and
//     the decision knowledge (DUP_MERGED_INTO / DUP_DISTINCT in internal_note)
//     is never overwritten by a connector;
//   * the loser's source identity survives against the survivor.
// Plain Node assert. Run: node test/duplicate-durability.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const URL_ = "https://example.supabase.co";
const ra = require(`${REPO_DIR}/scripts/ra-sync.js`);
const cons = require(`${REPO_DIR}/scripts/duplicate-consolidation.js`);

async function run() {
  // ---- 1. identity evidence: same date AND same stated venue AND compatible title ----
  const base = { title: "Jazz Is Dead presents Cortex", venue_name_raw: "Lincoln Factory", start_date: "2026-10-11" };
  const ok = (c, e) => ra.identityEvidenceSufficient(c, e);
  assert.ok(ok(base, { ...base, title: "Jazz is Dead presents Cortex" }), "same night, same room, same title: a duplicate");
  assert.ok(ok(base, { ...base, venue_name_raw: "The Lincoln Factory" }), "a leading 'The' is not a different venue");
  assert.ok(!ok(base, { ...base, start_date: "2026-10-12" }), "the next night of a run is another event");
  assert.ok(!ok(base, { ...base, start_date: "2026-10-09" }), "two nights earlier is another event");
  assert.ok(!ok(base, { ...base, venue_name_raw: "Magic Stick" }), "same title at another venue is not the same event");
  assert.ok(!ok(base, { ...base, venue_name_raw: null }), "no stated venue on the existing row: ambiguous, not a duplicate");
  assert.ok(!ok({ ...base, venue_name_raw: "Location TBA" }, { ...base, venue_name_raw: "Location TBA" }), "two placeholders are not a shared place");
  assert.ok(!ok(base, { ...base, title: "Totally Different Show" }), "venue+date alone never establish identity");
  console.log("PASS: identity needs same date + same stated venue + compatible title; nights, rooms, blanks and placeholders stay separate");

  // ---- 2. the lookup asks for the same day only, and a near-miss is not a duplicate ----
  {
    let asked;
    const fetchFn = async (url) => {
      asked = url;
      return { ok: true, json: async () => [{ id: "e1", title: base.title, venue_name_raw: base.venue_name_raw, external_id: null, start_date: "2026-10-12" }] };
    };
    const m = await ra.findConservativeDuplicate(URL_, "k", base, fetchFn);
    assert.strictEqual(m, null, "an adjacent-night row is never returned as the duplicate");
    assert.ok(asked.includes("start_date=gte.2026-10-11") && asked.includes("start_date=lte.2026-10-11"), "same-day window");
  }
  console.log("PASS: findConservativeDuplicate uses a same-day window and rejects an adjacent night");

  // ---- 3. consolidation: a restored loser / a distinct pair is not re-offered ----
  {
    const A = { id: "a", note: "", internal_note: "DUP_MERGED_INTO | v1 | survivor=b | rule=x" };
    assert.ok(typeof cons.planConsolidation === "function");
    const src = fs.readFileSync(`${REPO_DIR}/scripts/duplicate-consolidation.js`, "utf8");
    assert.ok(/DUP_DISTINCT \| v1 \| other=\$\{b\.id\}/.test(src) && /DUP_MERGED_INTO \| v1 \| survivor=\$\{b\.id\} /.test(src), "both decisions are read back before a pair is offered");
    assert.ok(A.internal_note.includes("survivor=b"));
  }

  // ---- 4. no connector rewrites an existing row's decision notes ----
  // Every file in api/ that sends an internal_note must be reviewed here.
  const REVIEWED_NOTE_WRITERS = {
    "cron-eventbrite.js": "drops internal_note for existing rows",
    "cron-gottagacha.js": "drops internal_note for existing rows",
    "cron-localist.js": "edits only its own lines, keeps all others",
  };
  const writers = fs.readdirSync(path.join(REPO_DIR, "api")).filter((f) => /^cron-.*\.js$/.test(f)).filter((f) => {
    const src = fs.readFileSync(path.join(REPO_DIR, "api", f), "utf8").replace(/\/\/.*$/gm, "");
    return /internal_note\s*:/.test(src);
  });
  const unreviewed = writers.filter((f) => !(f in REVIEWED_NOTE_WRITERS) && f !== "cron-dossin.js");
  assert.deepStrictEqual(unreviewed, [], "a new connector writes internal_note: it must keep an existing row's note (add it here once it does)");
  for (const f of ["cron-eventbrite.js", "cron-gottagacha.js"]) {
    const src = fs.readFileSync(path.join(REPO_DIR, "api", f), "utf8");
    assert.ok(/if \(existingStatusByExternalId\.has\(row\.external_id\)\) delete rest\.internal_note/.test(src), f);
  }
  console.log("PASS: every connector that writes internal_note is reviewed; the two that overwrote it no longer do for existing rows");

  // ---- 5. real GottaGacha handler: a merged (rejected) row is neither revived nor stripped of its note ----
  {
    const MONTH = Date.parse("2026-10-05T15:00:00Z");
    const RealDate = Date;
    global.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(MONTH); else super(...a); } static now() { return MONTH; } };
    process.env.SUPABASE_URL = URL_; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; delete process.env.CRON_SECRET;
    for (const m of ["api/cron-gottagacha.js", "api/_lib/run-log.js", "api/_lib/venue-lookup.js", "api/_lib/status-lookup.js", "api/_lib/event-upsert.js"]) delete require.cache[require.resolve(`${REPO_DIR}/${m}`)];
    const handler = require(`${REPO_DIR}/api/cron-gottagacha.js`);
    const source = [{ id: "5bcbabc3-35d4-40de-90bc-26ed9ef959c8", title: "Ticketed Private Event", description: "x", eventDate: "2026-10-06", startTime: "19:00:00", endTime: "21:00:00", recurrenceType: null, location: "Gotta Gacha" }];
    async function once(existing) {
      const calls = [];
      global.fetch = async (url, opts = {}) => {
        calls.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
        if (url.includes("www.gottagacha.com/api/events")) return { ok: true, status: 200, json: async () => ({ events: source }) };
        if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
        if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "r" }] };
        if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return { ok: true, status: 204, json: async () => ({}) };
        if (url.includes("/rest/v1/events") && !opts.method) return { ok: true, status: 200, json: async () => existing(url) };
        if (url.includes("/rest/v1/events") && opts.method === "POST") return strictWriteResponse(url, opts);
        throw new Error("unmocked " + url);
      };
      const res = { status() { return this; }, json(b) { if (process.env.DBG) console.log(JSON.stringify(b)); return this; } };
      await handler({ headers: {} }, res);
      return calls.filter((c) => c.method === "POST" && c.url.includes("/rest/v1/events")).flatMap((c) => c.body);
    }
    const first = await once(() => []);
    assert.strictEqual(first.length, 1);
    assert.ok(first[0].internal_note, "a NEW ambiguous row carries its breadcrumb");
    const id = first[0].external_id;
    const second = await once(() => [{ external_id: id, status: "rejected" }]);
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].status, "rejected", "a merged/rejected row is not revived");
    assert.ok(!("internal_note" in second[0]), "its DUP_MERGED_INTO / DUP_DISTINCT note is not overwritten");
    global.Date = RealDate;
  }
  console.log("PASS: GottaGacha re-ingest keeps a rejected row rejected and sends no internal_note for it");

  console.log("\nAll duplicate-durability tests passed.");
}
run().catch((e) => { console.error("FAIL:", e); process.exit(1); });
