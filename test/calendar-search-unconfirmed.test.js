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
const hitsFn = html.match(/function unconfirmedSearchHits\(\)\{[\s\S]*?\n\}\n/);
const m = html.match(/function renderUnconfirmedResults\(\)\{[\s\S]*?\n\}\n/);
assert.ok(hitsFn && m, "unconfirmedSearchHits / renderUnconfirmedResults not found");
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
    matchesFilters: (e) => e.title.toLowerCase().includes("cider"), CATS: { fest: { color: "#000", label: "Fest" } }, Categories: require("../categories.js"),
    unmappedTagHtml: () => "", escapeHtml: (x) => String(x == null ? "" : x), eventUrl: (e) => "event.html?id=" + e.id }, extra || {});
  vm.createContext(sb);
  vm.runInContext(`${hitsFn[0]}\n${m[0]}\nrenderUnconfirmedResults();`, sb);
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

// ---- Empty state (owner GO 2026-10-17): new copy, TRY AGAIN / RESET FILTERS, submission link; shown only when nothing
// matches at all, including nothing in "Dates not confirmed".
const emptyFn = html.match(/function emptyStateMessage\(\)\{[\s\S]*?\n\}\n/);
const tryFn = html.match(/function tryAgainSearch\(\)\{[\s\S]*?\n\}\n/);
const listFn = html.match(/function renderList\(dateList\)\{[\s\S]*?\n\}\n/);
assert.ok(emptyFn && tryFn && listFn, "empty-state functions found");
const msg = vm.runInNewContext(`${emptyFn[0]}\nemptyStateMessage()`, {});
assert.ok(msg.includes("NOTHING FOUND IN THE DETROIT ORBIT."), "headline");
assert.ok(msg.includes("Try a different search or reset your filters."), "supporting copy");
assert.ok(/>TRY AGAIN<\/button>/.test(msg) && /onclick="tryAgainSearch\(\)"/.test(msg), "TRY AGAIN action");
assert.ok(/>RESET FILTERS<\/button>/.test(msg) && /onclick="clearAllFilters\(\)"/.test(msg), "RESET FILTERS action");
assert.ok(msg.includes("Don't see your event?") && /<a href="submit\.html">SUBMIT AN EVENT &rarr;<\/a>/.test(msg), "secondary CTA links the existing submission workflow");
assert.ok(!/Nothing on the signal/.test(html), "old copy is gone from the page");
assert.ok(fs.existsSync(`${REPO_DIR}/submit.html`), "submission page exists");
// TRY AGAIN focuses the search box and selects its text.
{
  const calls = [];
  const input = { scrollIntoView: () => calls.push("scroll"), focus: () => calls.push("focus"), select: () => calls.push("select") };
  vm.runInNewContext(`${tryFn[0]}\ntryAgainSearch()`, { document: { getElementById: (id) => (id === "search" ? input : null) } });
  assert.deepStrictEqual(calls, ["scroll", "focus", "select"]);
}
// renderList: empty state only when no listed results AND no Dates-not-confirmed hits.
function renderEmpty(hits) {
  const el = { innerHTML: "" };
  const sb = { document: { getElementById: () => el }, current: new Date(2026, 9, 1), toISO: (y, mo, d) => `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    byDate: {}, matchesFilters: () => true, fmtMonth: () => "October 2026", unconfirmedSearchHits: () => hits, emptyStateMessage: () => "EMPTY-STATE" };
  vm.runInNewContext(`${listFn[0]}\nrenderList()`, sb);
  return el.innerHTML;
}
assert.ok(/EMPTY-STATE/.test(renderEmpty([])), "nothing anywhere: empty state");
assert.strictEqual(renderEmpty([{ id: "1" }]), "", "unverified hits exist: no empty state (the Dates not confirmed section shows instead)");
// The day panel never claims "nothing found" while the section has results.
assert.ok(/unconfirmedSearchHits\(\)\.length \? 'No confirmed events on this day/.test(html), "day panel defers to the section");
console.log("PASS: calendar empty state copy, actions and submit link; drawn only when no results and no Dates not confirmed hits");
