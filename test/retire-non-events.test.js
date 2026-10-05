"use strict";
// test/retire-non-events.test.js — scripts/retire-non-events.js: entries that
// are not events leave the public inventory, reversibly, and a reviewer's
// restore is final. The rows are production's on 2026-10-05; the rule itself
// (and the titles it must not match) is tested in non-event-filter.test.js.
//
// Run: node test/retire-non-events.test.js
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { makeMockPostgrest, eventsSchema } = require("./fixtures/mock-postgrest.js");
const { retireNonEvents, planRetirement, NOTE_TAG } = require(`${REPO_DIR}/scripts/retire-non-events.js`);
const { nonEventRule } = require(`${REPO_DIR}/api/_lib/non-event-filter.js`);

const URL_ = "https://example.supabase.co";
let n = 0;
const row = (o) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, external_id: `x-${n}`, status: "approved", category: "community", source: "Sterling Heights - Library", start_date: "2026-11-11", end_date: null, internal_note: null, ...o });
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Detroit" });
const future = (days) => new Date(Date.now() + days * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Detroit" });

(async function run() {
  // --- What is planned, and what is left alone.
  const closedA = row({ title: "City Buildings Closed", source: "Sterling Heights - Library", start_date: future(7) });
  const closedB = row({ title: "City Buildings Closed", source: "Sterling Heights - Parks and Recreation", start_date: future(7) });
  const library = row({ title: "Library Closed", source: "City of Madison Heights - Events", start_date: future(50), internal_note: "feed row" });
  const township = row({ title: "Macomb Township Offices Closed", source: "Macomb Township Events", start_date: future(50) });
  const suite = row({ title: "Leanne Morgan - Suite Rental", source: "Ticketmaster", start_date: future(10) });
  const running = row({ title: "Library Closed", source: "City of Madison Heights - Events", start_date: future(-1), end_date: future(2) });
  const past = row({ title: "City Buildings Closed", start_date: future(-3) });
  const pending = row({ title: "Library Closed", source: "Venue Submission", status: "pending_review", start_date: future(9) });
  const byHand = row({ title: "Library Closed", source: "Manual", start_date: future(9) });
  const submitted = row({ title: "Library Closed", source: "Venue Submission", start_date: future(9) });
  const alreadyHidden = row({ title: "City Buildings Closed", status: "rejected", start_date: future(9), internal_note: "Not for us." });
  const restored = row({ title: "City Buildings Closed", start_date: future(12), internal_note: `${NOTE_TAG} | rule=closure_notice | at=2026-10-05` });
  const real = [
    row({ title: "Bocce Barn Closing Day", source: "Sterling Heights - Parks and Recreation", start_date: future(20) }),
    row({ title: "Community Blood Drive", source: "Sterling Heights - Parks and Recreation", start_date: future(8) }),
    row({ title: "Senior Scams with the Macomb County Prosecutor's Office", start_date: future(40) }),
    row({ title: "Holiday Church Tour (Bianco Tours) SOLD OUT (WAIT LIST)", source: "City of Royal Oak", start_date: future(60) }),
    row({ title: "Recreation Board Meeting at 7pm", source: "Richmond Recreation Calendar", start_date: future(55) }),
    row({ title: "Case Closed: A Murder Mystery Dinner", source: "Ticketmaster", start_date: future(30) }),
    row({ title: "Brand New", source: "Ticketmaster", start_date: future(1) }),
  ];
  const events = [closedA, closedB, library, township, suite, running, past, pending, byHand, submitted, alreadyHidden, restored, ...real];
  assert.deepStrictEqual(planRetirement(events).map((p) => [p.row.id, p.rule]), [
    [closedA.id, "closure_notice"], [closedB.id, "closure_notice"], [library.id, "closure_notice"], [township.id, "closure_notice"], [suite.id, "suite_rental"], [running.id, "closure_notice"], [past.id, "closure_notice"],
  ], "(the caller only ever passes upcoming rows; `past` is here to show the plan itself does not look at dates)");
  assert.deepStrictEqual([nonEventRule("CLOSED FOR PRIVATE EVENT"), nonEventRule("Board of Trustees Meeting"), nonEventRule("Bocce Barn Closing Day"), nonEventRule(null)], ["closed_for_private_event", null, null, null]);

  const tables = { events };
  const db = makeMockPostgrest(tables, { schema: { events: eventsSchema() } });
  const fetchFn = (url, init) => db.fetch(String(url), init);
  const quiet = { error() {} };
  const before = JSON.stringify(tables);

  // --- Dry run: the count, and nothing written.
  const dry = await retireNonEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", dryRun: true, fetchFn, logger: quiet });
  assert.strictEqual(JSON.stringify(tables), before);
  assert.ok(!db.log.some((r) => r.method !== "GET"));
  assert.deepStrictEqual([dry.matched, dry.retired, dry.byRule], [6, 0, { closure_notice: 5, suite_rental: 1 }], "upcoming and still-running public rows only: not the past row, the pending one, the hand-entered one, the hidden one or the restored one");
  assert.ok(dry.detail.every((d) => d.dryRun));

  // --- The real run.
  const live = await retireNonEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", fetchFn, logger: quiet });
  assert.deepStrictEqual([live.matched, live.retired, live.failed, live.writtenIds.length], [6, 6, 0, 6]);
  for (const r of [closedA, closedB, library, township, suite, running]) assert.strictEqual(r.status, "rejected", r.title);
  assert.strictEqual(library.internal_note, `feed row\n${NOTE_TAG} | rule=closure_notice | at=${TODAY}`, "the note that was there is kept; the line says which rule and when");
  assert.ok(suite.internal_note.includes("rule=suite_rental"));
  assert.deepStrictEqual([past.status, pending.status, byHand.status, submitted.status, restored.status, alreadyHidden.internal_note], ["approved", "pending_review", "approved", "approved", "approved", "Not for us."], "a row a person entered or submitted, and a person approved, is theirs");
  assert.ok(real.every((r) => r.status === "approved"), "a closing day, a blood drive, a sold-out trip and a mystery dinner are events");
  assert.strictEqual(tables.events.length, events.length, "nothing is deleted");
  assert.ok(!db.log.some((r) => r.method === "DELETE"));
  assert.strictEqual((await retireNonEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", fetchFn, logger: quiet })).matched, 0, "a second run finds nothing");

  // --- A reviewer restores one (Admin's Restore: approved, note untouched): it is not retired again.
  library.status = "approved";
  const after = await retireNonEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", fetchFn, logger: quiet });
  assert.deepStrictEqual([after.matched, library.status], [0, "approved"]);

  // --- A row someone changed between the read and the write is left as they left it; a failure is counted; the cap defers.
  const raced = row({ title: "City Hall Closed", start_date: future(5) });
  const racing = makeMockPostgrest({ events: [raced] }, { schema: { events: eventsSchema() }, failure: (request) => { if (request.method === "PATCH") Object.assign(raced, { status: "pending_review" }); return null; } });
  const r1 = await retireNonEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", fetchFn: (u, i) => racing.fetch(String(u), i), logger: quiet });
  assert.deepStrictEqual([r1.retired, raced.status, raced.internal_note], [0, "pending_review", null]);
  const stuck = row({ title: "City Hall Closed", start_date: future(5) });
  const failing = makeMockPostgrest({ events: [stuck] }, { schema: { events: eventsSchema() }, failure: (request) => (request.method === "PATCH" ? 500 : null) });
  const r2 = await retireNonEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", fetchFn: (u, i) => failing.fetch(String(u), i), logger: quiet });
  assert.deepStrictEqual([r2.retired, r2.failed, stuck.status], [0, 1, "approved"]);
  const many = Array.from({ length: 5 }, () => row({ title: "City Hall Closed", start_date: future(5) }));
  const capped = await retireNonEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", maxPerRun: 2, fetchRows: async () => many, fetchFn: async () => ({ ok: true, status: 200, json: async () => [{}] }), logger: quiet });
  assert.deepStrictEqual([capped.matched, capped.retired, capped.deferredByCap], [5, 2, 3]);
  // The environment switch is a dry run however it is spelled.
  for (const spelling of ["true", "TRUE", "1"]) {
    process.env.NON_EVENT_RETIREMENT_DRY_RUN = spelling;
    delete require.cache[require.resolve(`${REPO_DIR}/scripts/retire-non-events.js`)];
    const mod = require(`${REPO_DIR}/scripts/retire-non-events.js`);
    const one = [row({ title: "City Hall Closed", start_date: future(5) })];
    const envDry = await mod.retireNonEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", fetchRows: async () => one, fetchFn: async () => { throw new Error("a dry run must not write"); }, logger: quiet });
    assert.deepStrictEqual([envDry.dryRun, envDry.matched, envDry.retired], [true, 1, 0], spelling);
  }
  delete process.env.NON_EVENT_RETIREMENT_DRY_RUN;
  // No configuration: nothing happens.
  assert.strictEqual((await retireNonEvents({ SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", logger: quiet })).considered, 0);

  console.log("PASS: closure notices and suite-rental upsells are retired (kept, noted, never deleted); pending, hand-entered and real events are left alone; a reviewer's restore is final; a dry run only counts");
  console.log("\nAll retire-non-events.test.js checks passed.");
})().catch((e) => { console.error(e); process.exit(1); });
