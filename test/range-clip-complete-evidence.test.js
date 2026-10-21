// test/range-clip-complete-evidence.test.js — MC-RANGE end clip: a recurring row whose organizer run is FULLY evidenced
// (recurrence_evidence.complete === true) is not stretched by the VisitDetroit rolling window (Greenfield Hallowe'en: last
// night Oct 25, feed end rolled to Nov 15). Without the explicit flag nothing is clipped (Zoo Boo: partial evidence).
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { preserveRange } = require(`${REPO_DIR}/api/_lib/range-preservation.js`);
const TODAY = "2026-10-19";
const occ = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
const row = (ev) => ({ start_date: "2026-10-22", end_date: "2026-11-15", date_semantics: "recurring", occurrence_dates: occ, recurrence_evidence: ev });
const inc = { start_date: "2026-10-22", end_date: "2026-11-15" };

// 1. complete:true clips the end to the last evidenced occurrence and reports it
{
  const r = preserveRange(inc, row({ complete: true }), TODAY);
  assert.deepStrictEqual([r.start_date, r.end_date, r.action], ["2026-10-22", "2026-10-25", "clipped-to-evidence"]);
  assert.strictEqual(r.conflict.kind, "incoming-end-beyond-complete-evidenced-occurrences");
  assert.deepStrictEqual(r.conflict.incoming, ["2026-10-22", "2026-11-15"]);
}
// 2. nothing else counts as complete: false, absent, null, strings, a non-object, no evidence column
for (const ev of [{ complete: false }, {}, null, undefined, { complete: "true" }, { complete: 1 }, "complete", [true]]) {
  const r = preserveRange(inc, row(ev), TODAY);
  assert.deepStrictEqual([r.end_date, r.action], ["2026-11-15", "incoming"], "not clipped for " + JSON.stringify(ev));
}
// 3. Zoo Boo shape: partial evidence (Oct 23-24 only, complete:false) keeps the old max(incoming, last) rule
{
  const zoo = { start_date: "2026-10-23", end_date: "2026-10-25", date_semantics: "recurring", occurrence_dates: ["2026-10-23", "2026-10-24"], recurrence_evidence: { complete: false } };
  const r = preserveRange({ start_date: "2026-10-23", end_date: "2026-10-25" }, zoo, TODAY);
  assert.deepStrictEqual([r.end_date, r.action], ["2026-10-25", "incoming"]);
}
// 4. complete rows are still widened to evidence where the source is too short, never past it
{
  const r = preserveRange({ start_date: "2026-10-23", end_date: "2026-10-24" }, row({ complete: true }), TODAY);
  assert.deepStrictEqual([r.start_date, r.end_date, r.action], ["2026-10-22", "2026-10-25", "widened-to-evidence"]);
}
// 5. a feed end already at or inside the last occurrence passes through unchanged
{
  const r = preserveRange({ start_date: "2026-10-22", end_date: "2026-10-25" }, row({ complete: true }), TODAY);
  assert.deepStrictEqual([r.end_date, r.action, r.conflict], ["2026-10-25", "incoming", null]);
}
// 6. only recurring rows are ever clipped
for (const sem of ["continuous", "single", null]) {
  const r = preserveRange(inc, { ...row({ complete: true }), date_semantics: sem }, TODAY);
  assert.notStrictEqual(r.action, "clipped-to-evidence", sem + ": never clipped");
}
// 7. the connector reads the evidence column for the lookup, and still never writes it
const src = fs.readFileSync(`${REPO_DIR}/api/cron-visitdetroit.js`, "utf8");
assert.ok(/select: "[^"]*occurrence_dates,recurrence_evidence"/.test(src), "lookup selects recurrence_evidence");
assert.ok(!/recurrence_evidence\s*:/.test(src.replace(/\/\/.*$/gm, "")), "recurrence_evidence is never in a payload");
console.log("range clip (complete evidence): ok");
