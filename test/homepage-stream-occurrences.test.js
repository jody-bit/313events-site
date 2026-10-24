// test/homepage-stream-occurrences.test.js
//
// P0 date reliability (R&Q release blocker, 2026-10-16): with no filter, the homepage listed Cider in the City and
// Harvest Festival under "Today, Fri Oct 16" although neither is open that day. An event with evidenced
// occurrence dates is listed under its NEXT occurrence on or after the window start; a continuous event stays under
// the window start. Extracts the real streamRows() from index.html and runs it with the real Discovery / EventDates.
// Run: node test/homepage-stream-occurrences.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");
const { Discovery } = (require(`${REPO_DIR}/search-match.js`), require(`${REPO_DIR}/discovery.js`));
const EventDates = require(`${REPO_DIR}/event-dates.js`);
global.EventDates = EventDates;
const m = html.match(/function streamRows\(ctx\)\{[\s\S]*?\n\}\n/);
assert.ok(m, "streamRows not found");

const FRI_NOW = new Date("2026-10-16T16:00:00Z"); // Fri 12:00 PM Detroit
const ev = (o) => Object.assign({ id: o.title, venue: "V", cat: "music", free: false, source: "Manual", time: "", dateSemantics: null, occurrenceDates: null }, o,
  { date: o.start, endDate: o.end });
const EVENTS = [
  ev({ title: "Cider in the City", start: "2026-10-11", end: "2026-10-18", time: "1:00 PM", dateSemantics: "recurring", occurrenceDates: ["2026-10-17", "2026-10-18"] }),
  ev({ title: "Harvest Festival", start: "2026-10-03", end: "2026-10-31", time: "10:00 AM", dateSemantics: "recurring", occurrenceDates: ["2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18", "2026-10-24", "2026-10-25", "2026-10-31"] }),
  ev({ title: "Greenfield Village", start: "2026-10-16", end: "2026-11-09", time: "6:00 PM", dateSemantics: "recurring", occurrenceDates: ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"] }),
  ev({ title: "Dearborn Haunted Trail", start: "2026-10-16", end: "2026-10-18", time: "7:00 PM", dateSemantics: "continuous" }),
  ev({ title: "Glenn Barr", start: "2026-10-09", end: "2026-12-30", dateSemantics: "continuous" }),
  ev({ title: "Unclassified Month", start: "2026-10-01", end: "2026-10-31", time: "9:00 AM" }),
];
const state = Discovery.defaults();
const ctx = { now: FRI_NOW };
const sb = { Discovery, EventDates, EVENTS, state, loadFloorISO: () => "2026-10-08", timeSortMinutes: () => 0, console };
vm.createContext(sb);
const streamRows = vm.runInContext(`${m[0]}\n;streamRows`, sb);
const rows = streamRows(ctx).map((r) => `${r.day}|${r.event.title}`);

assert.ok(rows.includes("2026-10-17|Cider in the City"), "Cider is under its next occurrence (Sat Oct 17), not today");
assert.ok(rows.includes("2026-10-17|Harvest Festival"), "Harvest Festival is under Sat Oct 17, not today");
assert.ok(!rows.some((r) => r.startsWith("2026-10-16|Cider") || r.startsWith("2026-10-16|Harvest")), "neither is listed for Friday");
assert.ok(rows.includes("2026-10-16|Greenfield Village"), "an event open today stays under today");
assert.ok(rows.includes("2026-10-16|Dearborn Haunted Trail"), "continuous stays under the window start");
assert.ok(rows.includes("2026-10-16|Glenn Barr"), "continuous exhibit stays under today");
assert.ok(rows.includes("null|Unclassified Month"), "unverified range is still discoverable, in Dates not confirmed");
console.log("PASS: occurrence-dated events are listed under their next occurrence; continuous and open-today events stay under today");
