// test/today-unconfirmed-ranges.test.js
//
// P1 discovery incident (2026-11-07): 25 of the 129 events whose range included Nov 7 were multiday rows with no
// date_semantics (schedule-unverified). Today dropped them, so Planet 9 Film Fest (Nov 7-8, 2 PM) and The World of
// Anna Sui were unreachable except at the foot of the whole upcoming list. Rule kept (owner decision 2026-10-16):
// they are NOT attendable days and are never counted or exported as such. Today / Tomorrow now also list them under
// "Dates not confirmed", after the dated rows. Runs the real streamRows() / Discovery / EventDates.
// Run: node test/today-unconfirmed-ranges.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");
const { Discovery } = require(`${REPO_DIR}/test/fixtures/load-discovery.js`);
const EventDates = require(`${REPO_DIR}/event-dates.js`);
global.EventDates = EventDates;
const m = html.match(/function streamRows\(ctx\)\{[\s\S]*?\n\}\n/);
assert.ok(m, "streamRows not found");

const NOW = new Date("2026-11-07T18:00:00Z"); // Sat 1:00 PM Detroit (EST)
const ev = (o) => Object.assign({ id: o.title, venue: "V", cat: "community", free: false, source: "Manual", time: "", dateSemantics: null, occurrenceDates: null }, o,
  { date: o.start, endDate: o.end || o.start });
const EVENTS = [
  ev({ title: "Planet 9 Film Fest", cat: "film", start: "2026-11-07", end: "2026-11-08", time: "2:00 PM" }),
  ev({ title: "The World of Anna Sui", cat: "visual", start: "2026-10-21", end: "2027-02-28", time: "Regular museum hours (closed Mon-Tue)" }),
  ev({ title: "Glenn Barr", cat: "visual", start: "2026-10-09", end: "2026-12-30", dateSemantics: "continuous" }),
  ev({ title: "Firm That Built Detroit", cat: "museum", start: "2026-11-07", time: "2:00 PM – 3:30 PM" }),
  ev({ title: "DISKO overnight (started Nov 6)", cat: "nightlife", start: "2026-11-06", end: "2026-11-07", time: "10:00 PM–2:00 AM" }),
  ev({ title: "Ended last day", cat: "visual", start: "2026-10-01", end: "2026-11-07", time: "9:00 AM – 12:00 PM" }),
  ev({ title: "Over yesterday", cat: "visual", start: "2026-10-01", end: "2026-11-06" }),
  ev({ title: "Starts tomorrow only", cat: "fest", start: "2026-11-08", end: "2026-11-09" }),
];
const stateFor = (patch) => Discovery.change(Discovery.defaults(), patch);
const run = (state) => {
  const sb = { Discovery, EventDates, EVENTS, state, loadFloorISO: () => "2026-10-08", timeSortMinutes: () => 0, console };
  vm.createContext(sb);
  return Array.from(vm.runInContext(`${m[0]}\n;streamRows`, sb)({ now: NOW })).map((r) => `${r.day}|${r.event.title}`);
};
const ctx = { now: NOW };

// TODAY
const today = stateFor({ when: "today" });
const rows = run(today);
assert.deepStrictEqual(rows.filter((r) => !r.startsWith("null|")).sort(),
  ["2026-11-07|Firm That Built Detroit", "2026-11-07|Glenn Barr"].sort(), "dated rows unchanged: confirmed + continuous only");
assert.deepStrictEqual(rows.filter((r) => r.startsWith("null|")).sort(),
  ["null|Planet 9 Film Fest", "null|The World of Anna Sui"].sort(), "unclassified ranges covering today are offered, unconfirmed");
assert.ok(rows.findIndex((r) => r.startsWith("null|")) > rows.findIndex((r) => r.endsWith("Firm That Built Detroit")), "unconfirmed group comes after dated rows");
assert.ok(!rows.some((r) => /DISKO|Ended last day|Over yesterday|Starts tomorrow/.test(r)), "over, ended-today and not-yet-started ranges stay out");

// The count and matches() contract is unchanged: unconfirmed is never a confirmed event.
assert.strictEqual(Discovery.count(EVENTS, today, ctx), 2, "Today count = confirmed events only");
assert.ok(!Discovery.matches(EVENTS[0], today, ctx), "matches() still false for an unverified range");
assert.ok(Discovery.unconfirmedOn(EVENTS[0], today, ctx));

// TOMORROW
const tomorrowRows = run(stateFor({ when: "tomorrow" }));
assert.ok(tomorrowRows.includes("null|Planet 9 Film Fest") && tomorrowRows.includes("null|Starts tomorrow only"), "Tomorrow lists ranges covering Nov 8");
assert.ok(!tomorrowRows.includes("null|Ended last day"));

// P0 2026-11-09 (approved events missing from a picked date): a picked date or range (like Today / Tomorrow) offers a range
// covering it under "Dates not confirmed".
assert.ok(!Discovery.unconfirmedOn(EVENTS[0], stateFor({ when: "tonight" }), ctx), "tonight: no unconfirmed group (needs a verified evening)");
["weekend", "next7", "week"].forEach((mode) => {
  assert.ok(Discovery.unconfirmedOn(EVENTS[0], stateFor({ when: mode }), ctx), `${mode}: range overlapping the window is offered`);
  assert.ok(!Discovery.unconfirmedOn(EVENTS[6], stateFor({ when: mode }), ctx), `${mode}: a range already over is not`);
  assert.ok(!Discovery.matches(EVENTS[0], stateFor({ when: mode }), ctx), `${mode}: still never counted as confirmed`);
});
// Kent Myers shape (null semantics, Sat Nov 14 -> Jan 6, 7 PM, Ferndale, visual): in every Saturday view, filters and search apply.
const KENT = ev({ title: "The Worst of Kent Myers", cat: "visual", start: "2026-11-14", end: "2027-01-06", time: "7:00 PM", venue: "Flip Salon", city: "Ferndale" });
const SAT = { now: new Date("2026-11-09T18:00:00Z") };
["weekend", "next7", "week"].forEach((mode) => {
  const st = (patch) => Discovery.change(Discovery.defaults(), Object.assign({ when: mode }, patch));
  const inRange = mode !== "week"; // Mon Nov 9 week ends Sun Nov 15: Nov 14 is inside; weekend Nov 13-15 too; next7 ends Nov 15
  assert.ok(Discovery.unconfirmedOn(KENT, st({}), SAT) === true, `${mode}: Kent Myers offered`);
  assert.ok(Discovery.unconfirmedOn(KENT, st({ what: { only: "visual" } }), SAT), `${mode}: Visual filter keeps it`);
  assert.ok(!Discovery.unconfirmedOn(KENT, st({ what: { only: "music" } }), SAT), `${mode}: Music filter drops it`);
  assert.ok(Discovery.unconfirmedOn(KENT, st({ q: "kent myers" }), SAT), `${mode}: search finds it`);
  assert.ok(Discovery.unconfirmedOn(KENT, st({ q: "ferndale" }), SAT), `${mode}: search by city finds it`);
});
// Unlinked venue / null category_id: the page reads events_public (category enum, venue_name = coalesce(venue, venue_name_raw)); nothing here depends on either link.
const UNLINKED = ev({ title: "Unlinked venue run", cat: "visual", start: "2026-11-14", end: "2026-12-20", venueId: null, venue: "Raw Venue Name" });
assert.ok(Discovery.unconfirmedOn(UNLINKED, Discovery.change(Discovery.defaults(), { when: { mode: "dates", from: "2026-11-14", to: "2026-11-14" } }), SAT), "unlinked venue is offered on a picked date");
// Radius with an unplaced row ("Show them"): the unconfirmed group follows the same includeUnplaced rule as matches().
const UNPLACED = ev({ title: "No city run", cat: "visual", start: "2026-11-14", end: "2026-12-20", venue: "Somewhere", city: "Zzzville" });
const radiusState = Discovery.change(Discovery.defaults(), { when: { mode: "dates", from: "2026-11-14", to: "2026-11-14" }, where: { place: "Detroit", radius: 10 } });
assert.ok(!Discovery.unconfirmedOn(UNPLACED, radiusState, SAT), "radius set, unplaced row hidden by default");
assert.ok(Discovery.unconfirmedOn(UNPLACED, radiusState, Object.assign({ includeUnplaced: true }, SAT)), "radius set + Show them: unplaced row offered (ctx passed through)");
// Cancellation: discovery.js and the client have no cancellation model (events_public has no such column), so there is nothing to test or invent.
const picked = (from, to) => stateFor({ when: { mode: "dates", from, to } });
assert.ok(Discovery.unconfirmedOn(EVENTS[0], picked("2026-11-07", "2026-11-07"), ctx), "picked date inside the range is offered");
assert.ok(Discovery.unconfirmedOn(EVENTS[1], picked("2026-11-14", "2026-11-14"), ctx), "picked future date inside a long run is offered");
assert.ok(Discovery.unconfirmedOn(EVENTS[0], picked("2026-11-08", "2026-11-20"), ctx), "picked range overlapping the run is offered");
assert.ok(!Discovery.unconfirmedOn(EVENTS[0], picked("2026-11-09", "2026-11-09"), ctx), "picked date after the run: not offered");
assert.ok(!Discovery.unconfirmedOn(EVENTS[7], picked("2026-11-07", "2026-11-07"), ctx), "picked date before the run starts: not offered");
assert.ok(!Discovery.matches(EVENTS[1], picked("2026-11-14", "2026-11-14"), ctx), "picked date: matches() still false, never counted");
assert.strictEqual(Discovery.count(EVENTS, picked("2026-11-14", "2026-11-14"), ctx), 1, "picked date count = confirmed only (Glenn Barr)");
const pickedRows = run(picked("2026-11-14", "2026-11-14"));
assert.deepStrictEqual(pickedRows.filter((r) => r.startsWith("null|")), ["null|The World of Anna Sui"], "picked date lists the unconfirmed run in its own group");
assert.deepStrictEqual(run(Object.assign(picked("2026-11-14", "2026-11-14"), {})).filter((r) => !r.startsWith("null|")), ["2026-11-14|Glenn Barr"]);
const visualPicked = run(stateFor({ when: { mode: "dates", from: "2026-11-14", to: "2026-11-14" }, what: { only: "visual" } }));
assert.deepStrictEqual(visualPicked.sort(), ["2026-11-14|Glenn Barr", "null|The World of Anna Sui"].sort(), "Visual + picked date: confirmed plus unconfirmed, nothing silently dropped");

// Filters still apply.
const filmOnly = run(stateFor({ when: "today", what: { only: "film" } }));
assert.deepStrictEqual(filmOnly, ["null|Planet 9 Film Fest"], "category filter applies to the unconfirmed group");
assert.deepStrictEqual(run(stateFor({ when: "today", q: "anna sui" })), ["null|The World of Anna Sui"], "search applies too");

// A range that ends today at a known end time that has passed is not offered.
assert.ok(!Discovery.unconfirmedOn(EVENTS[5], today, ctx));
assert.ok(Discovery.unconfirmedOn(EVENTS[5], today, { now: new Date("2026-11-07T15:00:00Z") }), "still offered before its end time (10 AM)");

// Default view unchanged: each exactly once.
const all = run(Discovery.defaults());
assert.strictEqual(all.filter((r) => r.endsWith("Planet 9 Film Fest")).length, 1);
console.log("PASS: Today/Tomorrow offer unclassified ranges as 'Dates not confirmed'; counts and filters unchanged; picked dates and other day windows included");

// FOLLOW-UP (owner decision 2026-11-08): a row listed under "Dates not confirmed" (dayIso === null) never exposes its
// start time; it says "Time not confirmed". Dated rows keep their time. The published range is untouched.
const rowM = html.match(/function streamRowHtml\(e, dayIso, ctx\)\{[\s\S]*?\n\}\n/);
assert.ok(rowM, "streamRowHtml not found");
assert.ok(/dayIso === null \? '<small class="evt-time-unconfirmed">Time not confirmed<\/small>' : timeCellHtml\(e\.time\)/.test(rowM[0]), "unconfirmed rows show 'Time not confirmed', dated rows show their time");
assert.ok(/Published \$\{escapeHtml\(formatRangeLabel/.test(html), "published range label preserved");
console.log("PASS: unconfirmed rows say 'Time not confirmed'");
// Experience 375px defect: the label must wrap at word boundaries only, and be at least 11px (owner: 9px not accepted) and sit in a 64px column on tablet/phone (Space Mono 'confirmed' = 9 x 0.612em = 60.6px at 11px).
assert.ok(/\.evt-time small\.evt-time-unconfirmed\{[^}]*overflow-wrap:normal[^}]*hyphens:none[^}]*font-size:11px/.test(html), "unconfirmed time label is 11px and wraps only between words at 375px");
assert.ok(/@media \(max-width:640px\)\{ \.evt-row--unconfirmed\{grid-template-columns:64px /.test(html) && /@media \(max-width:980px\)\{ \.evt-row--unconfirmed\{grid-template-columns:64px /.test(html), "unconfirmed rows widen the time column to fit the 11px label");
assert.ok(/class="evt-row\$\{dayIso === null \? ' evt-row--unconfirmed' : ''\}"/.test(html), "unconfirmed rows carry the modifier class");
console.log("PASS: unconfirmed time label never breaks mid-word");
