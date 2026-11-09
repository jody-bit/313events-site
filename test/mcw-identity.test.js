// test/mcw-identity.test.js -- MotorCity Wine stable identity (proposal, 2026-10-11).
//
// The connector's current id is mcw-ical-<date>-<md5(title)>. api/_lib/mcw-identity.js
// proposes <calendar UID>+<instance date> instead. This runs the REAL parser and
// recurrence expansion (cron-motorcitywine.js collectOccurrences) over ICS fixtures and
// shows, for each case, what the current scheme does and what the proposal does:
// title changes, recurring series, cancelled/moved instances, repeated ingestion and
// rows that already exist under the old ids. The planner is pure; it writes nothing.
// Run: node test/mcw-identity.test.js
"use strict";
const assert = require("assert");
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
const mcw = require("../api/cron-motorcitywine.js");
const { legacyExternalId, stableExternalId, planIdentity, STABLE_PREFIX } = require("../api/_lib/mcw-identity.js");

const ics = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const TZ = "TZID=America/New_York";
// Window: 2026-10-05 .. 2026-12-04.
const WINDOW_START = new Date(Date.UTC(2026, 9, 5));
const WINDOW_END = new Date(Date.UTC(2026, 11, 4));
const isoOf = (d) => d.toISOString().slice(0, 10);

function occurrencesOf(text) {
  const { occurrences, cancelled } = mcw.collectOccurrences(mcw.parseICS(text), WINDOW_END);
  return { occurrences: occurrences.filter((o) => o.dateNaive >= WINDOW_START && o.dateNaive <= WINDOW_END), cancelled };
}
// What the current connector would store for the same occurrences (dedupe by id, first wins).
function legacyIds(occurrences) {
  const m = new Map();
  for (const o of occurrences) { const id = legacyExternalId(isoOf(o.dateNaive), o.summary); if (!m.has(id)) m.set(id, o); }
  return [...m.keys()];
}
const storeFrom = (rows) => rows.map((r) => ({ external_id: r.stableId, start_date: r.startDate, title: r.title, status: "approved" }));

const weekly = (uid, title, summary) => [`UID:${uid}`, `DTSTART;${TZ}:20261007T190000`, "RRULE:FREQ=WEEKLY;BYDAY=WE", `SUMMARY:${summary || title}`];

// -------------------------------------------------------------------------
{
  const { occurrences } = occurrencesOf(ics(weekly("tango@x", "Tango Night")));
  assert.ok(occurrences.length >= 8, "a weekly series expands across the window");
  const plan = planIdentity(occurrences, [], []);
  const ids = plan.rows.map((r) => r.stableId);
  assert.strictEqual(new Set(ids).size, occurrences.length, "every occurrence of a recurring series gets its own id");
  assert.ok(ids.every((id) => id.startsWith(STABLE_PREFIX)));
  assert.ok(plan.rows.every((r) => r.action === "new"));
  assert.strictEqual(stableExternalId("tango@x", "2026-10-07"), ids[0], "the id is a pure function of UID + instance date");
  console.log("PASS: recurring series: one distinct, deterministic id per occurrence");
}

// -------------------------------------------------------------------------
{ // Title change on one instance (override) and on the whole series.
  const series = weekly("sun@x", "Beautiful Sunday");
  const before = occurrencesOf(ics(series));
  const plan1 = planIdentity(before.occurrences, [], []);
  const stored = storeFrom(plan1.rows);

  const renamedSeries = occurrencesOf(ics(weekly("sun@x", "x", "Beautiful Sunday (Fall Edition)")));
  const plan2 = planIdentity(renamedSeries.occurrences, renamedSeries.cancelled, stored);
  assert.ok(plan2.rows.every((r) => r.action === "keep"), "renaming a series keeps every id");
  assert.strictEqual(plan2.flagged.length, 0, "…and strands no row");
  const before2 = new Set(legacyIds(before.occurrences)), after2 = legacyIds(renamedSeries.occurrences);
  assert.ok(after2.every((id) => !before2.has(id)), "(current scheme: every renamed instance is a NEW id -> duplicates)");

  const d = before.occurrences[2];
  const overrideDate = isoOf(d.dateNaive).replace(/-/g, "");
  const ov = occurrencesOf(ics(series, ["UID:sun@x", `RECURRENCE-ID;${TZ}:${overrideDate}T190000`, `DTSTART;${TZ}:${overrideDate}T190000`, "SUMMARY:Beautiful Sunday with Rick Wilhite"]));
  const plan3 = planIdentity(ov.occurrences, ov.cancelled, stored);
  const changed = plan3.rows.find((r) => r.occurrence.originalDateISO === isoOf(d.dateNaive));
  assert.strictEqual(changed.title, "Beautiful Sunday with Rick Wilhite");
  assert.strictEqual(changed.action, "keep", "a renamed single instance keeps its row");
  assert.strictEqual(plan3.rows.filter((r) => r.action === "new").length, 0);
  console.log("PASS: title changes (whole series and single instance) keep their ids; the current scheme duplicates them");
}

// -------------------------------------------------------------------------
{ // Rescheduled instance: moved to another day keeps its id and updates its date.
  const series = weekly("jazz@x", "Jazz Wednesday");
  const base = occurrencesOf(ics(series));
  const stored = storeFrom(planIdentity(base.occurrences, [], []).rows);
  const orig = isoOf(base.occurrences[1].dateNaive);
  const movedTo = "20261109";
  const moved = occurrencesOf(ics(series, ["UID:jazz@x", `RECURRENCE-ID;${TZ}:${orig.replace(/-/g, "")}T190000`, `DTSTART;${TZ}:${movedTo}T200000`, "SUMMARY:Jazz Wednesday"]));
  const plan = planIdentity(moved.occurrences, moved.cancelled, stored);
  const row = plan.rows.find((r) => r.occurrence.originalDateISO === orig);
  assert.strictEqual(row.startDate, "2026-11-09", "the row follows the instance to its new date");
  assert.strictEqual(row.action, "keep");
  assert.strictEqual(plan.flagged.length, 0);
  console.log("PASS: a rescheduled instance keeps its row and takes the new date");
}

// -------------------------------------------------------------------------
{ // Cancelled instances (EXDATE, STATUS:CANCELLED override, cancelled single) are flagged, never removed.
  const series = weekly("tango@x", "Tango Night");
  const base = occurrencesOf(ics(series));
  const stored = storeFrom(planIdentity(base.occurrences, [], []).rows);
  const exDate = isoOf(base.occurrences[2].dateNaive).replace(/-/g, "");
  const cancelOv = isoOf(base.occurrences[3].dateNaive).replace(/-/g, "");
  const cur = occurrencesOf(ics(
    [...series, `EXDATE;${TZ}:${exDate}T190000`],
    ["UID:tango@x", `RECURRENCE-ID;${TZ}:${cancelOv}T190000`, `DTSTART;${TZ}:${cancelOv}T190000`, "SUMMARY:Tango Night", "STATUS:CANCELLED"],
  ));
  assert.strictEqual(cur.cancelled.length, 2);
  const plan = planIdentity(cur.occurrences, cur.cancelled, stored);
  const reasons = Object.fromEntries(plan.flagged.map((f) => [f.external_id, f.reason]));
  assert.strictEqual(reasons[stableExternalId("tango@x", isoOf(base.occurrences[2].dateNaive))], "cancelled-in-feed");
  assert.strictEqual(reasons[stableExternalId("tango@x", isoOf(base.occurrences[3].dateNaive))], "cancelled-in-feed");
  assert.strictEqual(plan.flagged.length, 2);
  assert.ok(plan.rows.every((r) => r.action === "keep"), "the rest is untouched");
  assert.ok(!plan.rows.some((r) => r.action === "cancel"), "the planner has no cancel action: a person decides");
  // A rejected row is a moderator's decision and is not flagged again.
  const rej = stored.map((r) => (r.external_id === stableExternalId("tango@x", isoOf(base.occurrences[2].dateNaive)) ? { ...r, status: "rejected" } : r));
  const missing = planIdentity(cur.occurrences, [], rej);
  assert.ok(!missing.flagged.some((f) => f.external_id === rej.find((r) => r.status === "rejected").external_id));
  console.log("PASS: cancelled instances are flagged for review, never removed; rejected rows are left alone");
}

// -------------------------------------------------------------------------
{ // Two different series, same title, same day: current scheme merges them, proposal keeps both.
  const a = ["UID:a@x", `DTSTART;${TZ}:20261015T180000`, "SUMMARY:Wine Tasting"];
  const b = ["UID:b@x", `DTSTART;${TZ}:20261015T200000`, "SUMMARY:Wine Tasting"];
  const { occurrences } = occurrencesOf(ics(a, b));
  assert.strictEqual(occurrences.length, 2);
  assert.strictEqual(legacyIds(occurrences).length, 1, "(current scheme: one row for two events)");
  const plan = planIdentity(occurrences, [], []);
  assert.strictEqual(new Set(plan.rows.map((r) => r.stableId)).size, 2, "the proposal keeps two distinct rows");
  console.log("PASS: distinct events that share a title and a day are not merged");
}

// -------------------------------------------------------------------------
{ // Existing rows under the old ids are adopted, not duplicated.
  const text = ics(weekly("tango@x", "Tango Night"), ["UID:wine@x", `DTSTART;${TZ}:20261018T150000`, "SUMMARY:Wine Tasting"]);
  const { occurrences, cancelled } = occurrencesOf(text);
  const legacyStored = legacyIds(occurrences).map((id) => ({ external_id: id, start_date: id.slice(9, 19), title: "x", status: "approved" }));
  const plan = planIdentity(occurrences, cancelled, legacyStored);
  assert.ok(plan.rows.every((r) => r.action === "adopt"), "every old row is recognised");
  assert.strictEqual(new Set(plan.rows.map((r) => r.from)).size, plan.rows.length, "each old row is claimed once");
  assert.strictEqual(plan.rows.filter((r) => r.action === "new").length, 0, "no duplicate row is created");
  assert.strictEqual(plan.flagged.length, 0);
  console.log("PASS: existing rows under the old ids are adopted (id rewritten on the same row), never duplicated");
}

// -------------------------------------------------------------------------
{ // A title edit made BEFORE migration: the old row cannot be matched by title; adopt only if unambiguous.
  const { occurrences: nowOcc } = occurrencesOf(ics(["UID:one@x", `DTSTART;${TZ}:20261022T190000`, "SUMMARY:New Title"]));
  const oldRow = { external_id: legacyExternalId("2026-10-22", "Old Title"), start_date: "2026-10-22", title: "Old Title", status: "approved" };
  let plan = planIdentity(nowOcc, [], [oldRow]);
  assert.strictEqual(plan.rows[0].action, "adopt-by-date");
  assert.strictEqual(plan.rows[0].from, oldRow.external_id);

  // Ambiguous: two unmatched instances that day -> nothing is guessed.
  const { occurrences: two } = occurrencesOf(ics(["UID:one@x", `DTSTART;${TZ}:20261022T190000`, "SUMMARY:New Title"], ["UID:two@x", `DTSTART;${TZ}:20261022T210000`, "SUMMARY:Other"]));
  plan = planIdentity(two, [], [oldRow]);
  assert.ok(plan.rows.every((r) => r.action === "new"), "ambiguous: both are new");
  assert.deepStrictEqual(plan.flagged, [{ external_id: oldRow.external_id, reason: "missing-from-feed" }], "…and the old row is flagged for a person");
  console.log("PASS: a pre-migration title edit is adopted only when unambiguous, otherwise flagged");
}

// -------------------------------------------------------------------------
{ // Repeated ingestion converges: after applying the plan, planning again changes nothing.
  const text = ics(weekly("tango@x", "Tango Night"));
  const { occurrences, cancelled } = occurrencesOf(text);
  const legacy = legacyIds(occurrences).map((id) => ({ external_id: id, start_date: id.slice(9, 19), title: "Tango Night", status: "approved" }));
  const first = planIdentity(occurrences, cancelled, legacy);
  const applied = first.rows.map((r) => ({ external_id: r.stableId, start_date: r.startDate, title: r.title, status: "approved" }));
  const second = planIdentity(occurrences, cancelled, applied);
  assert.ok(second.rows.every((r) => r.action === "keep"));
  assert.strictEqual(second.flagged.length, 0);
  const third = planIdentity(occurrences, cancelled, applied);
  assert.deepStrictEqual(third.rows.map((r) => r.stableId), second.rows.map((r) => r.stableId));
  console.log("PASS: repeated ingestion is idempotent after adoption");
}
