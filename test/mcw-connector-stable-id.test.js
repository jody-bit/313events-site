// test/mcw-connector-stable-id.test.js -- PR #69: the MotorCity Wine connector names every row
// mcw-uid-<sha1(UID)[0..12]>-<original instance date>. Real handler, stubbed calendar, shared fake
// database. Covers recurring series, renames, cancelled and rescheduled instances, repeat ingestion,
// preservation of stored data and moderation, and the migration guard.
// Run: node test/mcw-connector-stable-id.test.js
"use strict";
const assert = require("assert");
const { world, page, runConnector, eventWrites, sentRows } = require("./fixtures/connector-harness.js");
const { stableExternalId, legacyExternalId } = require("../api/_lib/mcw-identity.js");

const HOST = "https://calendar.google.com/calendar/ical/";
const TZ = "TZID=America/Detroit";
const ics = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const venues = [{ id: "venue-mcw", name: "MotorCity Wine" }];
const up = (text) => (u) => (u.startsWith(HOST) ? page(text) : null);
const stored = (external_id, start_date, title, extra) => ({ id: "r-" + external_id, external_id, title, category: "music", start_date, status: "approved", source: "MotorCity Wine (public Google Calendar)", ...extra });
const run = async (text, events) => { const w = world({ venues, events, upstream: up(text) }); const res = await runConnector("cron-motorcitywine.js"); return { ...w, res }; };

(async () => {
  // 1. Recurring series: one distinct stable id per occurrence; repeat ingestion is idempotent.
  const weekly = ics(["UID:tango@x", `DTSTART;${TZ}:20261007T190000`, "RRULE:FREQ=WEEKLY;BYDAY=WE", "SUMMARY:Tango Night"]);
  let r = await run(weekly, []);
  assert.strictEqual(r.res._status, 200);
  const ids = r.tables.events.map((e) => e.external_id);
  assert.ok(ids.length >= 8 && new Set(ids).size === ids.length, "each occurrence has its own id");
  assert.ok(ids.every((id) => /^mcw-uid-[0-9a-f]{12}-\d{4}-\d{2}-\d{2}$/.test(id)));
  assert.ok(ids.includes(stableExternalId("tango@x", "2026-10-07")));
  await runConnector("cron-motorcitywine.js");
  assert.strictEqual(r.tables.events.length, ids.length, "repeat ingestion creates no duplicates");
  console.log("PASS: recurring series: distinct stable ids, idempotent");

  // 2. Rename keeps the row: same id, new title, moderation and reviewer text survive.
  const id = stableExternalId("sun@x", "2026-10-18");
  r = await run(ics(["UID:sun@x", `DTSTART;${TZ}:20261018T150000`, "SUMMARY:Beautiful Sunday with Rick Wilhite"]),
    [stored(id, "2026-10-18", "Beautiful Sunday", { status: "rejected", description: "Reviewer text." })]);
  assert.strictEqual(r.tables.events.length, 1, "a rename does not create a second row");
  assert.strictEqual(r.tables.events[0].title, "Beautiful Sunday with Rick Wilhite");
  assert.strictEqual(r.tables.events[0].status, "rejected", "a human decision survives");
  assert.strictEqual(r.tables.events[0].description, "Reviewer text.", "the calendar has no description; the stored one is kept");
  assert.strictEqual(r.tables.events[0].ticket_url, "https://motorcitywine.com/calendar/", "authoritative source link unchanged");
  console.log("PASS: rename keeps one row, status and description preserved");

  // 3. Cancelled instance: not ingested, a stored row is left alone (flagged elsewhere, never cancelled here).
  const cid = stableExternalId("wk@x", "2026-10-14");
  const cal = ics(["UID:wk@x", `DTSTART;${TZ}:20261007T190000`, "RRULE:FREQ=WEEKLY;BYDAY=WE", "SUMMARY:Weekly"],
    ["UID:wk@x", `RECURRENCE-ID;${TZ}:20261014T190000`, `DTSTART;${TZ}:20261014T190000`, "STATUS:CANCELLED", "SUMMARY:Weekly"]);
  r = await run(cal, [stored(cid, "2026-10-14", "Weekly")]);
  assert.ok(!sentRows(r.db).some((x) => x.external_id === cid), "cancelled instance is not written");
  assert.strictEqual(r.tables.events.find((e) => e.external_id === cid).status, "approved", "the stored row is untouched, not cancelled");
  assert.ok(r.tables.events.some((e) => e.external_id === stableExternalId("wk@x", "2026-10-07")), "other occurrences still ingest");
  console.log("PASS: cancelled instance not written; stored row untouched");

  // 4. Rescheduled occurrence: id stays tied to the ORIGINAL date, so the row moves instead of duplicating.
  const mid = stableExternalId("mv@x", "2026-10-14");
  const moved = ics(["UID:mv@x", `DTSTART;${TZ}:20261007T190000`, "RRULE:FREQ=WEEKLY;BYDAY=WE", "SUMMARY:Moved Show"],
    ["UID:mv@x", `RECURRENCE-ID;${TZ}:20261014T190000`, `DTSTART;${TZ}:20261016T200000`, "SUMMARY:Moved Show"]);
  r = await run(moved, [stored(mid, "2026-10-14", "Moved Show")]);
  const row = r.tables.events.find((e) => e.external_id === mid);
  assert.strictEqual(row.start_date, "2026-10-16", "the stored row moved to its new date");
  assert.strictEqual(r.tables.events.filter((e) => e.title === "Moved Show" && e.start_date === "2026-10-14").length, 0, "nothing left on the old date");
  assert.strictEqual(r.tables.events.filter((e) => e.external_id === mid).length, 1);
  console.log("PASS: rescheduled occurrence moves the same row");

  // 5. Migration guard: rows still on legacy ids block the run before anything is written.
  const legacy = legacyExternalId("2026-10-18", "Jazz Night");
  r = await run(ics(["UID:j@x", `DTSTART;${TZ}:20261018T200000`, "SUMMARY:Jazz Night"]), [stored(legacy, "2026-10-18", "Jazz Night")]);
  assert.strictEqual(r.res._status, 409);
  assert.strictEqual(eventWrites(r.db).length, 0, "nothing written while the id migration is pending");
  const run1 = r.tables.source_runs.find((x) => x.source_slug === "motorcitywine");
  assert.strictEqual(run1.outcome, "blocked"); assert.match(run1.error_sample, /Id migration pending: 1/);
  console.log("PASS: pending id migration blocks the run, writes nothing");

  // 6. Guard lookup failure fails closed.
  const w = world({ venues, events: [], upstream: up(ics(["UID:j@x", `DTSTART;${TZ}:20261018T200000`, "SUMMARY:Jazz"])), failure: (q) => (q.table === "events" && q.method === "GET" ? 500 : undefined) });
  const res = await runConnector("cron-motorcitywine.js");
  assert.strictEqual(eventWrites(w.db).length, 0); assert.ok(res._status >= 500);
  console.log("PASS: guard lookup failure fails closed");

  // 7. The proposed migration files are consistent: 59 pairs, rollback is the exact inverse, no collisions.
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "supabase", "proposed");
  const pairsOf = (file, re) => [...fs.readFileSync(path.join(dir, file), "utf8").split("-- 2. Apply")[0].matchAll(re)].map((m) => [m[1], m[2]]);
  const fwd = pairsOf("2026-10-11_mcw_stable_identity.sql", /\('(mcw-ical[^']+)', '(mcw-uid[^']+)'\)/g);
  const back = [...fs.readFileSync(path.join(dir, "2026-10-11_mcw_stable_identity_rollback.sql"), "utf8").matchAll(/\('(mcw-uid[^']+)', '(mcw-ical[^']+)'\)/g)].map((m) => [m[2], m[1]]);
  assert.strictEqual(fwd.length, 59); assert.strictEqual(new Set(fwd.map((p) => p[1])).size, 59);
  assert.deepStrictEqual(back.slice().sort(), fwd.slice().sort(), "rollback is the exact inverse of the migration");
  console.log("PASS: migration and rollback files are consistent (59 pairs, exact inverse)");
})().catch((e) => { console.error(e); process.exit(1); });
