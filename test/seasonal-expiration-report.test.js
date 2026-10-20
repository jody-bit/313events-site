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
for (const action of ["unpublish", "keep-published"]) {
  r = rep([pub({ id: "a", season: { end: "2026-10-31", endSource: "s" }, expiryDisposition: Object.assign({}, DISP, { action }) })], "2026-11-02");
  assert.deepStrictEqual(one(r, "a").states, ["SEASON_ENDED"]); assert.strictEqual(r.failures.length, 0, action);
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
for (const slug of Object.keys(e0)) for (const e of e0[slug]) if (e.status === "PUBLISHED") { e.season = { end: "2020-01-01", endSource: "test" }; e.reviewOn = "2020-01-01"; e.expiryDisposition = DISP; }
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
