// test/calendar-search-unconfirmed.test.js
//
// Owner decision 2026-10-16: calendar date cells stay confirmed-occurrence-only; a search also offers matching
// schedule-unverified events in a separate "Dates not confirmed" section outside the grid.
// Extracts the real renderUnconfirmedResults() from calendar.html.
// Run: node test/calendar-search-unconfirmed.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/calendar.html`, "utf8");
const EventDates = require(`${REPO_DIR}/event-dates.js`);
const m = html.match(/function renderUnconfirmedResults\(\)\{[\s\S]*?\n\}\n/);
assert.ok(m, "renderUnconfirmedResults not found");
assert.ok(/<div id="unconfirmedResults"><\/div>/.test(html), "container is outside the grid and list view");
assert.ok(/renderUnconfirmedResults\(\);\n  syncURL\(\);/.test(html), "render() calls it");

const ev = (o) => Object.assign({ cat: "fest", venue: "V", city: "Detroit", time: "", dateSemantics: null, occurrenceDates: null, source: "Manual" }, o, { date: o.start, endDate: o.end });
const EVENTS = [
  ev({ id: "1", title: "Cider in the City", start: "2026-10-01", end: "2026-10-31" }),                       // unverified
  ev({ id: "2", title: "Cider Weekend", start: "2026-10-01", end: "2026-10-31", dateSemantics: "recurring", occurrenceDates: ["2026-10-17"] }), // confirmed
  ev({ id: "3", title: "Cider Tasting Night", start: "2026-10-17", end: "2026-10-17" }),                      // single date
  ev({ id: "4", title: "Cider Old Fair", start: "2026-09-01", end: "2026-09-30" }),                          // ended
  ev({ id: "5", title: "Pottery Show", start: "2026-10-01", end: "2026-10-31" }),                             // no match
];
function run(extra) {
  const el = { innerHTML: "" };
  const sb = Object.assign({ EventDates, EVENTS, query: "cider", mode: "month", el,
    document: { getElementById: () => el }, getTodayISO: () => "2026-10-16",
    matchesFilters: (e) => e.title.toLowerCase().includes("cider"), CATS: { fest: { color: "#000", label: "Fest" } },
    escapeHtml: (x) => String(x == null ? "" : x), eventUrl: (e) => "event.html?id=" + e.id }, extra || {});
  vm.createContext(sb);
  vm.runInContext(`${m[0]}\nrenderUnconfirmedResults();`, sb);
  return el.innerHTML;
}
let out = run();
assert.ok(/Dates not confirmed/.test(out));
assert.ok(/Cider in the City/.test(out) && /Published Oct 1 – Oct 31/.test(out), "unverified match, with its published range");
assert.ok(!/Cider Weekend|Cider Tasting Night|Cider Old Fair|Pottery/.test(out), "confirmed, single-date, ended and non-matching rows are not in the section");
assert.strictEqual(run({ query: "" }), "", "no search: no section");
assert.strictEqual(run({ mode: "map" }), "", "map view: no section");
assert.strictEqual(run({ matchesFilters: () => false }), "", "filters that reject the row hide it (date filters reject unverified rows)");
console.log("PASS: search shows matching unverified events in a separate Dates not confirmed section; nothing else changes");
