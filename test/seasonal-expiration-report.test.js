// test/seasonal-expiration-report.test.js — report-only seasonal expiration safeguard (owner decision 2026-10-20).
//   * three separate states: SEASON_ENDED, REVIEW_DUE, INSUFFICIENT_EVIDENCE
//   * the only failure is a verified-ended, still-PUBLISHED entry with no valid disposition
//   * never infers season.end; never hides, unpublishes or changes published counts
"use strict";
const assert = require("assert");
const path = require("path");
const ED = require(path.join(__dirname, "..", "api/_lib/seasonal-editorial/editorial.js"));
const X = require(path.join(__dirname, "..", "api/_lib/seasonal-editorial/expiration.js"));
const pub = (o) => Object.assign({ id: "x", name: "X", status: "PUBLISHED" }, o);
const rep = (list, today) => X.expirationReport({ halloween: list }, today);
const one = (r, id) => r.items.find((i) => i.id === id);
const DISP = { action: "unpublish", by: "Editorial", at: "2026-11-01", note: "Final night Oct 31 per the official site" };

// verified final operating date
let r = rep([pub({ id: "a", season: { end: "2026-10-31", endSource: "official site read 2026-10-20" } })], "2026-11-01");
assert.deepStrictEqual(one(r, "a").states, ["SEASON_ENDED"]);
assert.strictEqual(r.failures.length, 1, "ended + published + no disposition fails");
assert.strictEqual(one(r, "a").needsDisposition, true);
// the final operating day itself is not ended
r = rep([pub({ id: "a", season: { end: "2026-10-31", endSource: "s" } })], "2026-10-31");
assert.strictEqual(one(r, "a"), undefined, "on the last day nothing is reported");
// valid dispositions clear the failure but the state is still reported
{
  r = rep([pub({ id: "a", season: { end: "2026-10-31", endSource: "s" }, expiryDisposition: Object.assign({}, DISP, { action: "keep-published" }) })], "2026-11-02");
  assert.deepStrictEqual(one(r, "a").states, ["SEASON_ENDED"]); assert.strictEqual(r.failures.length, 0, "keep-published");
  // an `unpublish` decision on an entry that is STILL PUBLISHED fails: the status change must land in the same PR
  r = rep([pub({ id: "a", season: { end: "2026-10-31", endSource: "s" }, expiryDisposition: Object.assign({}, DISP, { action: "unpublish" }) })], "2026-11-02");
  assert.deepStrictEqual(one(r, "a").states, ["SEASON_ENDED"]);
  assert.strictEqual(r.failures.length, 1);
  assert.ok(/unpublish but is still PUBLISHED/.test(r.failures[0]));
  assert.strictEqual(r.counts.unpublishNotApplied, 1);
  // once the status change lands (no longer PUBLISHED) the entry is not reported and nothing fails
  r = rep([Object.assign(pub({ id: "a", season: { end: "2026-10-31", endSource: "s" }, expiryDisposition: Object.assign({}, DISP, { action: "unpublish" }) }), { status: "HOLD_UNVERIFIED" })], "2026-11-02");
  assert.strictEqual(r.failures.length, 0); assert.strictEqual(one(r, "a"), undefined);
  // not yet ended: an unpublish decision recorded early does not fail
  r = rep([pub({ id: "a", season: { end: "2026-10-31", endSource: "s" }, expiryDisposition: Object.assign({}, DISP, { action: "unpublish" }) })], "2026-10-30");
  assert.strictEqual(r.failures.length, 0);
}
// invalid dispositions do not count
for (const bad of [{}, { action: "hide", by: "e", at: "2026-11-01", note: "n" }, { action: "unpublish", by: "", at: "2026-11-01", note: "n" }, { action: "unpublish", by: "e", at: "11/1", note: "n" }, { action: "unpublish", by: "e", at: "2026-11-01", note: " " }]) {
  r = rep([pub({ id: "a", season: { end: "2026-10-31", endSource: "s" }, expiryDisposition: bad })], "2026-11-02");
  assert.strictEqual(r.failures.length, 1, JSON.stringify(bad));
}
// missing final operating dates: informational only, never a failure
r = rep([pub({ id: "m" }), pub({ id: "m2", season: { end: "2026-10-31" } }), pub({ id: "m3", season: { end: "2026-02-30", endSource: "s" } })], "2027-01-01");
assert.strictEqual(r.failures.length, 0);
for (const id of ["m", "m2", "m3"]) { assert.deepStrictEqual(one(r, id).states, ["INSUFFICIENT_EVIDENCE"], id); assert.strictEqual(one(r, id).needsDisposition, false); }
assert.ok(/endSource/.test(one(r, "m2").reasons[0]) && /valid/.test(one(r, "m3").reasons[0]));
// future and past-due review dates
r = rep([pub({ id: "f", reviewOn: "2026-11-01" }), pub({ id: "p", reviewOn: "2026-10-26" }), pub({ id: "t", reviewOn: "2026-10-30" })], "2026-10-30");
assert.ok(!one(r, "f").states.includes("REVIEW_DUE"), "future review is not due");
assert.ok(one(r, "p").states.includes("REVIEW_DUE") && one(r, "t").states.includes("REVIEW_DUE"), "past and same-day reviews are due");
assert.strictEqual(r.failures.length, 0, "review due never fails");
// states are separate and can combine
r = rep([pub({ id: "c", season: { end: "2026-10-31", endSource: "s" }, reviewOn: "2026-10-30", expiryDisposition: DISP })], "2026-11-01");
assert.deepStrictEqual(one(r, "c").states, ["SEASON_ENDED", "REVIEW_DUE"]);
// unpublished entries are out of scope
assert.strictEqual(rep([{ id: "h", status: "HOLD_UNVERIFIED", season: { end: "2020-01-01", endSource: "s" } }], "2026-11-01").items.length, 0);
// multi-date attractions, seasonal closures and dark days: dark days inside the season never end it; a private schedule alone never sets season.end
const sched = { season: { start: "2026-09-18", end: "2026-11-07" }, darkDays: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"], weeklyHours: {} };
for (const day of ["2026-10-19", "2026-11-02", "2026-11-05", "2026-11-06"]) {
  r = rep([pub({ id: "s", schedule: sched })], day);
  assert.deepStrictEqual(one(r, "s").states, ["INSUFFICIENT_EVIDENCE"], day + ": schedule end is never promoted to season.end");
  assert.ok(/private schedule has an end date/.test(one(r, "s").reasons[0]));
  assert.strictEqual(r.failures.length, 0);
}
r = rep([pub({ id: "s", schedule: sched, season: { end: "2026-11-07", endSource: "official site" } })], "2026-11-05");
assert.strictEqual(one(r, "s"), undefined, "dark day inside the season is not an ending");
assert.ok(one(rep([pub({ id: "s", schedule: sched, season: { end: "2026-11-07", endSource: "official site" } })], "2026-11-08"), "s").states.includes("SEASON_ENDED"));
// today must be a real date
assert.throws(() => X.expirationReport({}, "tomorrow"));
assert.strictEqual(X.detroitToday(new Date("2026-11-01T03:30:00Z")), "2026-10-31", "Detroit date, not UTC");

// Erebus through November 7 on the real data: published, not ended, never failing, even on its last night
const real = ED.entries();
const erebus = real.halloween.find((x) => x.id === "erebus");
assert.strictEqual(erebus.status, "PUBLISHED");
for (const day of ["2026-10-20", "2026-11-02", "2026-11-07", "2026-11-09"]) {
  const rr = X.expirationReport(real, day);
  assert.ok(!(one(rr, "erebus") || { states: [] }).states.includes("SEASON_ENDED"), "erebus is not marked ended on " + day + " without a verified season.end");
  assert.strictEqual(rr.failures.length, 0, "real data never fails today: " + day);
}
// Erebus with a verified end of Nov 7: reported ended only AFTER Nov 7, and only then needs a disposition
const withEnd = JSON.parse(JSON.stringify(real));
withEnd.halloween.find((x) => x.id === "erebus").season = { end: "2026-11-07", endSource: "official site (example)" };
assert.strictEqual(X.expirationReport(withEnd, "2026-11-07").failures.length, 0, "open on its last night");
assert.strictEqual(X.expirationReport(withEnd, "2026-11-08").failures.length, 1, "needs a disposition the day after");

// No unintended public suppression, no change to published counts, no leak of the private fields
const before = ED.publishedProjection();
const counts = (p) => Object.fromEntries(Object.keys(p).map((k) => [k, p[k].length]));
const e0 = ED.entries();
for (const slug of Object.keys(e0)) for (const e of e0[slug]) if (e.status === "PUBLISHED") { e.season = { end: "2020-01-01", endSource: "test" }; e.reviewOn = "2020-01-01"; e.expiryDisposition = Object.assign({}, DISP, { action: "keep-published" }); }
const fs = require("fs");
for (const slug of Object.keys(e0)) {
  const projected = e0[slug].filter(ED.COLLECTIONS.isPublic).map(ED.publicEntry);
  assert.deepStrictEqual(projected, before[slug], slug + ": identical public projection with the new private fields set (ended entries still shown, nothing leaked)");
}
assert.deepStrictEqual(counts(before), { fall: 38, halloween: 25, "fall-color": 41 }, "published counts unchanged (38/25/41 on main)");
assert.ok(!/"(season|reviewOn|expiryDisposition|schedule)":/.test(fs.readFileSync(path.join(__dirname, "..", "seasonal/published-entries.js"), "utf8")), "private fields absent from the generated public file");
// the committed data carries no season.end yet, so today the report changes nothing
const nowReport = X.expirationReport(real, "2026-11-08");
assert.strictEqual(nowReport.counts.SEASON_ENDED, 0); assert.strictEqual(nowReport.counts.published, 104);

// ---- ENDED status (owner decision 2026-10-20, option A) ----
{
  const C = ED.COLLECTIONS, clone = (o) => JSON.parse(JSON.stringify(o));
  const base = ED.entries().halloween.find((x) => x.status === "PUBLISHED");
  const endedData = { season: { end: "2026-10-31", endSource: "official site (example)" }, expiryDisposition: DISP };
  // a verified, previously publishable record with a verified end + unpublish decision derives ENDED and is never public
  const ended = Object.assign(clone(base), endedData, { status: "ENDED" });
  assert.strictEqual(C.readiness(ended).state, "ENDED");
  assert.ok(!C.isPublic(ended), "ENDED is never public");
  assert.ok(ED.publishedProjection !== undefined);
  assert.ok(C.STATES.includes("ENDED"));
  // it keeps its provenance, approval and evidence (publication history preserved)
  assert.deepStrictEqual(ended.approval, base.approval); assert.deepStrictEqual(ended.evidence, base.evidence);
  // the declared status cannot be used to bypass the gate: still declared PUBLISHED, the decision derives ENDED, so declared != derived (fails the shipped-data test) and it is not public
  const stillPublished = Object.assign(clone(base), endedData, { status: "PUBLISHED" });
  assert.strictEqual(C.readiness(stillPublished).state, "ENDED"); assert.ok(!C.isPublic(stillPublished));
  // a data-quality failure is not ENDED: without verification it stays HOLD_UNVERIFIED whatever it declares
  const failing = Object.assign(clone(base), endedData, { status: "ENDED", evidence: [] });
  assert.strictEqual(C.readiness(failing).state, "HOLD_UNVERIFIED");
  // an unapproved record is not ENDED (it never was published)
  const unapproved = Object.assign(clone(base), endedData); delete unapproved.approval;
  assert.strictEqual(C.readiness(unapproved).state, "READY_FOR_REVIEW");
  // an unverified end date (no endSource) or a keep-published decision does not make it ENDED
  assert.strictEqual(C.readiness(Object.assign(clone(base), { season: { end: "2026-10-31" }, expiryDisposition: DISP })).state, "PUBLISHED");
  assert.strictEqual(C.readiness(Object.assign(clone(base), { season: endedData.season, expiryDisposition: Object.assign({}, DISP, { action: "keep-published" }) })).state, "PUBLISHED");
  // reactivation: next season, set it back to PUBLISHED with a new verified end and a keep decision; everything else is intact
  const reactivated = Object.assign(clone(ended), { status: "PUBLISHED", season: { end: "2027-10-31", endSource: "official site 2027" }, expiryDisposition: Object.assign({}, DISP, { action: "keep-published", note: "2027 season confirmed" }) });
  assert.strictEqual(C.readiness(reactivated).state, "PUBLISHED"); assert.ok(C.isPublic(reactivated));
  // the report: ENDED after the end date is clean and counted; ENDED before the end date (or without a verified end) fails
  const r1 = X.expirationReport({ halloween: [ended] }, "2026-11-02");
  assert.strictEqual(r1.counts.ENDED, 1); assert.strictEqual(r1.failures.length, 0); assert.strictEqual(r1.counts.published, 0);
  assert.strictEqual(X.expirationReport({ halloween: [ended] }, "2026-10-31").failures.length, 1, "not ended yet on the last day");
  assert.strictEqual(X.expirationReport({ halloween: [Object.assign(clone(ended), { season: { end: "2026-10-31" } })] }, "2026-11-02").failures.length, 1, "ENDED needs a verified end");
  // the public projection does not contain an ENDED record and the shipped projection is unchanged
  const withEndedEntry = ED.entries(); withEndedEntry.halloween = withEndedEntry.halloween.map((x) => x.id === base.id ? ended : x);
  const proj = withEndedEntry.halloween.filter(C.isPublic).map((x) => x.id);
  assert.ok(!proj.includes(base.id) && proj.length === before.halloween.length - 1);
}
console.log("PASS: ENDED status derives only from verified end + unpublish decision, is never public, keeps history, reactivates");
console.log("seasonal-expiration-report: all assertions passed");

// The Halloween release tooling treats `disposition` on an entry as its EXCLUSION marker (closed / duplicate). The expiry
// safeguard must never reuse that key: its decision field is `expiryDisposition`.
{
  const src = fs.readFileSync(path.join(__dirname, "..", "api/_lib/seasonal-editorial/expiration.js"), "utf8");
  assert.ok(!/[.\s]disposition\b\s*[;,)=\]]/.test(src.replace(/\/\/.*$/gm, "").replace(/"[^"\n]*"/g, '""')), "expiration.js must not read an entry's `disposition` key");
  const e = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "api/_lib/seasonal-editorial/entries.json"), "utf8"));
  for (const slug of Object.keys(e)) for (const x of e[slug]) if (x.expiryDisposition) assert.strictEqual(x.disposition, undefined, "an expiryDisposition must not come with an exclusion marker");
}
console.log("PASS: expiry decision key does not collide with the Halloween exclusion marker");
