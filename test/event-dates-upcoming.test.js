// test/event-dates-upcoming.test.js — EventDates.isUpcoming / nextDate (one "upcoming" rule on Detroit's date)
// and the two consumers that used a start-date-only rule: radar.html and the event page's JSON-LD.
// Run: node test/event-dates-upcoming.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const ED = require(`${REPO_DIR}/event-dates.js`);
const read = (f) => fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
const T = "2026-11-09";

const single = (d) => ({ date: d, endDate: null, dateSemantics: "single" });
const cont = (s, e) => ({ date: s, endDate: e, dateSemantics: "continuous" });
const rec = (s, e, occ) => ({ date: s, endDate: e, dateSemantics: "recurring", occurrenceDates: occ });
const unver = (s, e) => ({ date: s, endDate: e, dateSemantics: null });

// isUpcoming
assert.strictEqual(ED.isUpcoming(single("2026-11-09"), T), true, "today's single event is upcoming");
assert.strictEqual(ED.isUpcoming(single("2026-11-08"), T), false, "yesterday's single event is past");
assert.strictEqual(ED.isUpcoming(single("2026-12-01"), T), true);
assert.strictEqual(ED.isUpcoming(cont("2026-09-01", "2026-12-31"), T), true, "running exhibition is upcoming (old start-only rule said past)");
assert.strictEqual(ED.isUpcoming(cont("2026-09-01", "2026-11-08"), T), false, "ended exhibition is past");
assert.strictEqual(ED.isUpcoming(cont("2026-09-01", "2026-11-09"), T), true, "last day counts");
assert.strictEqual(ED.isUpcoming(rec("2026-10-01", "2026-12-31", ["2026-10-03", "2026-11-14"]), T), true, "recurring with a future date");
assert.strictEqual(ED.isUpcoming(rec("2026-10-01", "2026-12-31", ["2026-10-03", "2026-11-07"]), T), false, "recurring, all occurrences past, even though the range runs on");
assert.strictEqual(ED.isUpcoming(unver("2026-11-01", "2026-11-20"), T), true, "unverified range still open stays discoverable");
assert.strictEqual(ED.isUpcoming(unver("2026-10-01", "2026-11-05"), T), false, "unverified range over");
assert.strictEqual(ED.isUpcoming({ date: null }, T), false, "no start date");
assert.strictEqual(ED.isUpcoming({ start_date: "2026-11-09", date_semantics: "single" }, T), true, "snake_case rows work (api/ reuse)");
// default today is the Detroit date
const dToday = ED.detroitClock().iso;
assert.strictEqual(ED.isUpcoming(single(dToday)), true);
assert.strictEqual(ED.isUpcoming(single("2000-01-01")), false);

// nextDate
assert.strictEqual(ED.nextDate(single("2026-11-20"), T), "2026-11-20");
assert.strictEqual(ED.nextDate(single("2026-11-01"), T), null);
assert.strictEqual(ED.nextDate(cont("2026-09-01", "2026-12-31"), T), T, "running continuous: today");
assert.strictEqual(ED.nextDate(cont("2026-12-01", "2026-12-31"), T), "2026-12-01", "continuous not yet open: its start");
assert.strictEqual(ED.nextDate(cont("2026-09-01", "2026-11-01"), T), null);
assert.strictEqual(ED.nextDate(rec("2026-10-01", "2026-12-31", ["2026-10-03", "2026-11-14", "2026-11-21"]), T), "2026-11-14");
assert.strictEqual(ED.nextDate(rec("2026-10-01", "2026-12-31", ["2026-10-03"]), T), null);
assert.strictEqual(ED.nextDate(unver("2026-11-01", "2026-11-20"), T), null, "unverified range has no attendable date");

// radar.html uses the shared rule, Detroit today, and loads the module
const radar = read("radar.html");
assert.ok(/<script src="\/event-dates\.js"><\/script>/.test(radar), "radar loads event-dates.js");
assert.ok(/end_date,date_semantics,occurrence_dates/.test(radar), "radar selects the schedule columns");
assert.ok(!/event\.date\s*(>=|<)\s*todayIso/.test(radar), "radar has no start-date-only comparison left");
assert.ok(/EventDates\.detroitClock\(\)\.iso/.test(radar), "radar today is the Detroit date");
assert.ok(!/new Date\(\);\s*return `\$\{d\.getFullYear/.test(radar), "radar no longer uses the device clock");

// event page JSON-LD
const tpl = read("event-template.html");
assert.ok(/ldState !== 'unverified'/.test(tpl), "JSON-LD withheld for schedule-unverified ranges");
assert.ok(/EventDates\.nextDate\(e\)/.test(tpl), "recurring JSON-LD states the next occurrence");
assert.ok(/ldRecurring[\s\S]{0,200}ldEnd = null/.test(tpl), "recurring JSON-LD has no span endDate");

console.log("PASS: event-dates-upcoming — isUpcoming/nextDate rule and radar/JSON-LD consumers");
