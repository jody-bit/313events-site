// test/homepage-calendar-export.test.js
//
// Homepage Add to Calendar under the P0 date rule (owner decision 2026-10-17), same behavior as the event page:
//   - unverified-date events (a multiday range with no verified schedule) get NO calendar export; Share and Tickets
//     are separate controls in the row and stay
//   - recurring events with evidenced occurrence_dates export their next occurrence, never the stored first date
//   - single-day, overnight and continuous events export exactly as before
// Runs the real shipped code from index.html ("Add to Calendar" block). Fixtures mirror the production row shapes
// named in the owner request (STG Season-Long, America: 250 Years). "Today" is pinned to Fri 2026-10-16 (Detroit).
// Run: node test/homepage-calendar-export.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");
const a = html.indexOf("// ---- Add to Calendar ----");
const b = html.indexOf("// ---- Share ----", a);
assert.ok(a >= 0 && b > a, "Add to Calendar block not found");

// `at` pins the instant (ISO, UTC) the page sees as "now"; default is noon Detroit (16:00Z, EDT) on `today`.
function load(today, at) {
  const blobs = [];
  const NOW = new Date(at || `${today}T16:00:00Z`).getTime();
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const ctx = {
    CalendarLocation: require(`${REPO_DIR}/calendar-location.js`).CalendarLocation, EventDates: require(`${REPO_DIR}/event-dates.js`),
    getTodayISO: () => today,
    URL: Object.assign(class extends URL {}, { createObjectURL: () => "blob:test" }), URLSearchParams, Date: FakeDate, Math, String, Array, Object, JSON, Number, RegExp,
    Blob: class { constructor(parts) { this.text = parts.join(""); blobs.push(this.text); } },
    window: { location: { href: "https://313.events/" }, open: () => null },
    EVENTS: [], setTimeout, document: undefined,
    truncateText: (s) => s, shouldShowSource: () => false,
    safeUrl: (u) => (/^https?:\/\//.test(u) ? u : null), eventUrl: () => "event.html?id=abc",
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"),
  };
  vm.createContext(ctx);
  const api = vm.runInContext(`${html.slice(a, b)}\n;({ buildICS, buildGoogleCalUrl, addToCalendarHtml, markCalendarLocationsReady, calendarExportAvailable, nextCalendarOccurrence })`, ctx);
  api.blobs = blobs;
  return api;
}
const ev = (o) => Object.assign({ id: "e1", title: "Fixture", venue: "Somewhere", date: "2026-10-01", endDate: "2026-10-31", time: "10:00 AM", dateSemantics: null, occurrenceDates: null, source: "Manual" }, o);
const prop = (ics, k) => (ics.replace(/\r\n[ \t]/g, "").split("\r\n").find((l) => l.startsWith(k)) || "").split(":").slice(1).join(":");

const stg = ev({ id: "stg", title: "STG Season-Long Exhibition", date: "2026-09-06", endDate: "2026-12-05", time: "10:00 AM" });
const america = ev({ id: "am250", title: "America: 250 Years", date: "2026-01-01", endDate: "2026-12-31", time: "9:30 AM" });
const cider = ev({ id: "cider", title: "Cider in the City", date: "2026-10-11", endDate: "2026-10-18", time: "1:00 PM", dateSemantics: "recurring", occurrenceDates: ["2026-10-17", "2026-10-18"] });
const single = ev({ id: "one", date: "2026-10-17", endDate: "2026-10-17", time: "7:30 PM" });
const overnight = ev({ id: "night", date: "2026-10-16", endDate: "2026-10-17", time: "10:00 PM–2:00 AM" });
const continuous = ev({ id: "cont", date: "2026-10-01", endDate: "2026-10-31", time: null, dateSemantics: "continuous" });

// 1. Unverified rows: no Add to Calendar markup at all, before and after the location data is ready.
{
  const P = load("2026-10-16");
  [stg, america].forEach((e) => assert.strictEqual(P.addToCalendarHtml(e), "", `${e.title}: no calendar controls while location data is pending`));
  P.markCalendarLocationsReady();
  [stg, america].forEach((e) => assert.strictEqual(P.addToCalendarHtml(e), "", `${e.title}: no calendar controls once ready`));
  const rec = ev({ dateSemantics: "recurring", occurrenceDates: null });
  assert.strictEqual(P.addToCalendarHtml(rec), "", "recurring without occurrence dates is unverified: no export");
}
console.log("PASS: STG Season-Long and America: 250 Years (unverified) get no Add to Calendar controls");

// 2. Share and Tickets are separate row controls and are not conditional on the calendar span.
{
  const row = html.slice(html.indexOf("function streamRowHtml("));
  const actions = row.slice(row.indexOf('<div class="evt-actions">'), row.indexOf("${affiliateDisclosureHtml(e)}"));
  assert.ok(/eventLinksHtml\(e\)/.test(actions) && /\$\{shareButtonHtml\(e\)\}/.test(actions), "tickets link and Share render in the row");
  assert.ok(/\$\{addToCalendarHtml\(e\)\}/.test(actions), "the calendar span is the only control that goes away");
}
console.log("PASS: Share and Tickets stay in the row");

// 3. Confirmed recurring: next evidenced occurrence, not the stored first date.
{
  const P = load("2026-10-16");
  P.markCalendarLocationsReady();
  const ics = P.buildICS(cider);
  assert.strictEqual(prop(ics, "DTSTART"), "20261017T130000", "Cider exports Oct 17 1 PM, not Oct 11");
  assert.strictEqual(prop(ics, "DTEND"), "20261017T150000");
  assert.ok(/dates=20261017T130000%2F20261017T150000/.test(P.buildGoogleCalUrl(cider)), "Google link agrees");
  assert.ok(/data-cal="google"/.test(P.addToCalendarHtml(cider)) && /data-cal="ics"/.test(P.addToCalendarHtml(cider)), "both controls present");
  // today past the first occurrence: moves on; all past: the last evidenced one; never invents a time.
  assert.strictEqual(prop(load("2026-10-18").buildICS(cider), "DTSTART"), "20261018T130000");
  assert.strictEqual(prop(load("2026-11-30").buildICS(cider), "DTSTART"), "20261018T130000", "all past: last evidenced occurrence");
  const noTime = ev({ dateSemantics: "recurring", occurrenceDates: ["2026-10-24"], time: "Varies" });
  assert.strictEqual(prop(P.buildICS(noTime), "DTSTART;VALUE=DATE"), "20261024", "no parseable time: all-day on the occurrence, no invented hours");
}
console.log("PASS: confirmed recurring exports its next evidenced occurrence");

// 4. Single-day, overnight and continuous: unchanged.
{
  const P = load("2026-10-16");
  P.markCalendarLocationsReady();
  const s = P.buildICS(single);
  assert.strictEqual(prop(s, "DTSTART"), "20261017T193000");
  assert.strictEqual(prop(s, "DTEND"), "20261017T213000");
  const n = P.buildICS(overnight);
  assert.strictEqual(prop(n, "DTSTART"), "20261016T220000");
  assert.strictEqual(prop(n, "DTEND"), "20261017T020000", "overnight ends the next morning");
  [single, overnight, continuous].forEach((e) => assert.ok(/data-cal="google"/.test(P.addToCalendarHtml(e)) && /data-cal="ics"/.test(P.addToCalendarHtml(e)), `${e.title || e.id}: both controls kept`));
  assert.strictEqual(prop(P.buildICS(continuous), "DTSTART;VALUE=DATE"), "20261001");
}
console.log("PASS: single-day, overnight and continuous exports are unchanged");

// 5. Once every verified occurrence has ended (Detroit time) there is nothing to add: both controls disappear.
{
  const show = (e, today, at) => { const P = load(today, at); P.markCalendarLocationsReady(); return /data-cal="google"/.test(P.addToCalendarHtml(e)) && /data-cal="ics"/.test(P.addToCalendarHtml(e)); };
  const hidden = (e, today, at) => { const P = load(today, at); P.markCalendarLocationsReady(); return P.addToCalendarHtml(e) === ""; };
  const greenfield = ev({ id: "gf", title: "Greenfield Village Halloween", date: "2026-10-09", endDate: "2026-10-25", time: "5:00 PM-9:00 PM", dateSemantics: "recurring", occurrenceDates: ["2026-10-09", "2026-10-10", "2026-10-24", "2026-10-25"] });
  // (1) final verified occurrence in the future: kept, exports the next one.
  assert.ok(show(greenfield, "2026-10-20"), "future final occurrence: buttons stay");
  assert.strictEqual(prop(load("2026-10-20").buildICS(greenfield), "DTSTART"), "20261024T170000");
  // (2) final occurrence today: respects the stated end time (EDT: 9 PM = 01:00Z next day).
  assert.ok(show(greenfield, "2026-10-25", "2026-10-25T23:00:00Z"), "Oct 25 7 PM: still running or ahead, buttons stay");
  assert.ok(hidden(greenfield, "2026-10-25", "2026-10-26T01:00:00Z"), "Oct 25 9:00 PM: ended, buttons gone");
  const lateNight = ev({ id: "ln", date: "2026-10-24", endDate: "2026-10-25", time: "10:00 PM-2:00 AM", dateSemantics: "recurring", occurrenceDates: ["2026-10-24", "2026-10-25"] });
  assert.ok(show(lateNight, "2026-10-26", "2026-10-26T05:30:00Z"), "overnight: Oct 26 1:30 AM EDT the final show is still running");
  assert.ok(hidden(lateNight, "2026-10-26", "2026-10-26T06:00:00Z"), "overnight: Oct 26 2:00 AM EDT it has ended");
  // (3) final occurrence ended: both gone, including the Oct 26 example (no stated end: the whole day counts).
  const noEnd = ev({ id: "gf2", date: "2026-10-20", endDate: "2026-10-25", time: "5:00 PM", dateSemantics: "recurring", occurrenceDates: ["2026-10-24", "2026-10-25"] });
  assert.ok(show(noEnd, "2026-10-25", "2026-10-26T03:59:00Z"), "no end time: Oct 25 11:59 PM EDT still counts as the day");
  assert.ok(hidden(noEnd, "2026-10-26", "2026-10-26T04:00:00Z"), "no end time: Oct 26 00:00 EDT, buttons gone");
  // (4) past and future dates: the next verified future occurrence is exported.
  assert.strictEqual(prop(load("2026-10-24", "2026-10-25T01:30:00Z").buildICS(greenfield), "DTSTART"), "20261025T170000", "Oct 24 9:30 PM: ended, next is Oct 25");
  // (5) unverified: hidden whatever the clock says.
  assert.ok(hidden(stg, "2026-10-16") && hidden(america, "2026-10-16"), "unverified: hidden");
  // (6) Share and Tickets are not touched by this change.
  const row = html.slice(html.indexOf("function streamRowHtml("));
  assert.ok(/\$\{shareButtonHtml\(e\)\}/.test(row) && /eventLinksHtml\(e\)/.test(row));
  // (7) Detroit midnight and DST: Nov 1 2026 falls back (EDT -> EST), Mar 14 2027 springs forward.
  const fall = ev({ id: "fb", date: "2026-10-31", endDate: "2026-11-01", time: "7:00 PM", dateSemantics: "recurring", occurrenceDates: ["2026-10-31", "2026-11-01"] });
  assert.ok(show(fall, "2026-11-01", "2026-11-02T04:30:00Z"), "Nov 1 11:30 PM EST: day not over");
  assert.ok(hidden(fall, "2026-11-02", "2026-11-02T05:00:00Z"), "Nov 2 00:00 EST: over (05:00Z, not 04:00Z)");
  const spring = ev({ id: "sp", date: "2027-03-13", endDate: "2027-03-14", time: "7:00 PM", dateSemantics: "recurring", occurrenceDates: ["2027-03-13", "2027-03-14"] });
  assert.ok(show(spring, "2027-03-14", "2027-03-15T03:30:00Z"), "Mar 14 11:30 PM EDT: day not over");
  assert.ok(hidden(spring, "2027-03-15", "2027-03-15T04:00:00Z"), "Mar 15 00:00 EDT: over");
}
console.log("PASS: calendar export is hidden once every verified occurrence has ended (Detroit time, end times, overnight, DST)");
