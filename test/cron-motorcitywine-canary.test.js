// test/cron-motorcitywine-canary.test.js — TEMPORARY, for the MotorCity Wine
// controlled recovery canary (BUG-007; Product Owner, 2026-10-04).
//
// This file exists only while the canary commit is deployed and is removed by
// the same `git revert` that removes the override and the schedule entry.
//
// The experiment: run the MotorCity Wine connector ONCE in production, by
// hand, to prove the uniform-batch fix on the 68-row, two-shape batch that
// was rejected on 2026-10-03 — without publishing anything, and without
// putting the connector back on a schedule. This test pins the three things
// that make that safe:
//   1. an event the connector has not written before lands as
//      `pending_review` (never `approved`), in every row shape;
//   2. an event that already exists keeps its stored status — approved stays
//      approved, rejected stays rejected;
//   3. the schedule entry cannot fire on its own during the experiment
//      (1 January only), and the other three held sources stay unscheduled;
// and that the connector's permanent policy line is untouched.
//
// Plain Node assert, no dependencies. Run: node test/cron-motorcitywine-canary.test.js
"use strict";
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { world, page, runConnector, eventWrites, sentRows, shapeCount, byId } = require("./fixtures/connector-harness.js");

const REPO = path.join(__dirname, "..");
const idFor = (dateISO, title) => `mcw-ical-${dateISO}-${crypto.createHash("md5").update(title).digest("hex").slice(0, 10)}`;

async function run() {
  // -------------------------------------------------------------------------
  // 1 + 2. New rows are pending_review in both shapes; stored statuses survive
  // -------------------------------------------------------------------------
  {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "UID:weekly-jazz@fixture", "SUMMARY:Monday Night Jazz", "DESCRIPTION:House band\\, no cover.",
      "DTSTART;TZID=America/Detroit:20260907T190000", "RRULE:FREQ=WEEKLY;BYDAY=MO", "END:VEVENT",
      "BEGIN:VEVENT", "UID:single-1@fixture", "SUMMARY:The Fixture Quartet", "DTSTART;TZID=America/Detroit:20261003T200000", "END:VEVENT",
      "BEGIN:VEVENT", "UID:single-2@fixture", "SUMMARY:Rhone Wine Tasting", "DESCRIPTION:Six pours with the importer.", "DTSTART:20261004T220000Z", "END:VEVENT",
      "BEGIN:VEVENT", "UID:single-3@fixture", "SUMMARY:DJ Fixture", "DTSTART;TZID=America/Detroit:20261010T210000", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const alreadyApproved = idFor("2026-10-03", "The Fixture Quartet");
    const alreadyRejected = idFor("2026-10-05", "Monday Night Jazz");
    const { tables, db } = world({
      venues: [{ id: "venue-mcw", name: "MotorCity Wine" }],
      events: [
        { id: "row-1", external_id: alreadyApproved, title: "The Fixture Quartet", category: "music", start_date: "2026-10-03", status: "approved" },
        { id: "row-2", external_id: alreadyRejected, title: "Monday Night Jazz", category: "music", start_date: "2026-10-05", status: "rejected" },
        { id: "row-3", external_id: "someone-elses-event", title: "Unrelated", category: "music", start_date: "2026-10-06", status: "approved" },
      ],
      upstream: (url) => (url.startsWith("https://calendar.google.com/calendar/ical/") ? page(ics) : null),
    });
    const unrelatedBefore = JSON.stringify(byId(tables, "someone-elses-event"));

    const res = await runConnector("cron-motorcitywine.js");
    const sent = sentRows(db);

    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    assert.strictEqual(sent.length, 12, "9 Mondays in the window + 3 single events");
    assert.strictEqual(res._body.upserted, 12);
    assert.strictEqual(shapeCount(sent), 2, "rows with and without a description — the two shapes production sends");
    assert.strictEqual(eventWrites(db).length, 2, "one request per shape");
    for (const request of eventWrites(db)) assert.strictEqual(shapeCount(JSON.parse(request.body)), 1, "every request is uniform");

    const existing = new Set([alreadyApproved, alreadyRejected]);
    const fresh = sent.filter((r) => !existing.has(r.external_id));
    assert.strictEqual(fresh.length, 10);
    for (const row of fresh) {
      assert.strictEqual(row.status, "pending_review", `${row.external_id} is sent as pending_review`);
      assert.strictEqual(byId(tables, row.external_id).status, "pending_review", `${row.external_id} is stored as pending_review`);
    }
    assert.ok(fresh.some((r) => "description" in r) && fresh.some((r) => !("description" in r)), "new rows of BOTH shapes are covered");
    assert.strictEqual(sent.filter((r) => r.status === "approved").length, 1, "the only approved row sent is the one that was already approved");

    assert.strictEqual(byId(tables, alreadyApproved).status, "approved", "a stored approval is preserved");
    assert.strictEqual(byId(tables, alreadyRejected).status, "rejected", "a stored rejection is preserved");
    assert.strictEqual(JSON.stringify(byId(tables, "someone-elses-event")), unrelatedBefore, "a row that is not this connector's is not touched");
    assert.strictEqual(tables.events.length, 13, "10 inserted, 2 updated, 1 unrelated");
    assert.ok(tables.events.filter((r) => String(r.external_id).startsWith("mcw-ical-")).every((r) => r.status !== "approved" || r.external_id === alreadyApproved),
      "nothing new from this run is public");
  }
  console.log("PASS: a new MotorCity Wine event lands as pending_review in both row shapes; stored approved/rejected statuses are kept; unrelated rows are untouched");

  // -------------------------------------------------------------------------
  // The permanent publication policy is not what was changed
  // -------------------------------------------------------------------------
  {
    const source = fs.readFileSync(path.join(REPO, "api/cron-motorcitywine.js"), "utf8");
    assert.ok(source.includes('const DEFAULT_STATUS = "approved";'), "the connector's permanent policy line is untouched");
    assert.ok(source.includes('const CANARY_NEW_ROW_STATUS = "pending_review";'), "the override is its own, named constant");
    assert.ok(/TEMPORARY — CONTROLLED RECOVERY CANARY/.test(source), "and is marked temporary where it is defined");
    assert.strictEqual((source.match(/\|\| DEFAULT_STATUS,/g) || []).length, 0, "no write path still falls back to approved while the canary is in place");
  }
  console.log("PASS: DEFAULT_STATUS is still \"approved\"; the override is a separate, marked, temporary constant");

  // -------------------------------------------------------------------------
  // 3. The schedule entry cannot fire on its own; the hold is otherwise intact
  // -------------------------------------------------------------------------
  {
    const crons = JSON.parse(fs.readFileSync(path.join(REPO, "vercel.json"), "utf8")).crons;
    const mcw = crons.filter((c) => c.path === "/api/cron-motorcitywine");
    assert.strictEqual(mcw.length, 1, "exactly one MotorCity Wine entry");
    const [minute, hour, dayOfMonth, month, dayOfWeek] = mcw[0].schedule.split(/\s+/);
    assert.deepStrictEqual([minute, hour, dayOfMonth, month, dayOfWeek], ["0", "9", "1", "1", "*"], "09:00 UTC on 1 January only");
    assert.notStrictEqual(mcw[0].schedule, "0 9 * * *", "this is not the connector's recurring daily schedule");

    // The next moment that expression matches, from the day the canary was prepared.
    const from = new Date("2026-10-04T00:00:00Z");
    let next = new Date(Date.UTC(from.getUTCFullYear(), 0, 1, 9, 0, 0));
    if (next <= from) next = new Date(Date.UTC(from.getUTCFullYear() + 1, 0, 1, 9, 0, 0));
    assert.strictEqual(next.toISOString(), "2027-01-01T09:00:00.000Z", "it cannot fire on its own before 1 January 2027");

    for (const held of ["/api/cron-ticketmaster", "/api/cron-detroittraining", "/api/cron-detroitmonthofdesign"]) {
      assert.strictEqual(crons.filter((c) => c.path === held).length, 0, `${held} stays unscheduled`);
    }
    assert.strictEqual(crons.length, 25, "the 24 schedules that were running, plus this one entry");
  }
  console.log("PASS: the only added schedule is MotorCity Wine on 1 January; Ticketmaster, Detroit Training Center and Detroit Month of Design stay held");

  console.log("\nAll cron-motorcitywine-canary.test.js checks passed.");
}

run().catch((err) => { console.error("FAIL:", err && err.stack || err); process.exit(1); });
