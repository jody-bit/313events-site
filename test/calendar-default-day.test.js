// Calendar (#157 owner defects): today's event list opens by default without scrolling; only an
// explicit date choice scrolls the list into view (instantly when the visitor prefers reduced motion).
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/calendar.html`, "utf8");

// One-shot scroll flag, off by default.
assert.ok(/let scrollToDayPanel = false;/.test(html), "scroll flag defaults to false");

// showDayPanel scrolls only when the flag is set, clears it, starts the list at the top of the
// viewport, and respects reduced motion.
const show = html.slice(html.indexOf("function showDayPanel"), html.indexOf("function closeDayPanel"));
assert.ok(/if\(scrollToDayPanel\)\{\s*scrollToDayPanel = false;/.test(show), "scroll only when flagged, then clear");
assert.ok(/prefers-reduced-motion: reduce/.test(show), "reduced motion is checked");
assert.ok(/behavior: reduceMotion \? 'auto' : 'smooth', block:'start'/.test(show), "scrolls to the start of the list");
assert.strictEqual((show.match(/scrollIntoView/g) || []).length, 1, "exactly one scroll call");

// Explicit choices set the flag: a day cell, and the WHEN shortcuts for today (month view only).
assert.ok(/const openDay = \(\)=>\{ selectedDate = iso; scrollToDayPanel = true; showDayPanel\(iso\); \};/.test(html), "day cell sets the flag");
assert.ok(/selectedDate = todayIso;\s*scrollToDayPanel = \(mode === 'month'\);/.test(html), "WHEN today shortcut sets the flag in month view only");
// A render that re-draws the panel (filters, live-data refresh) never leaves a stale flag behind.
assert.ok(/if\(selectedDate\) showDayPanel\(selectedDate\);\s*scrollToDayPanel = false;/.test(html), "render clears the flag");

// Default: after the URL is read, a month view of the current month selects today (no flag, no scroll).
const init = html.slice(html.indexOf("readStateFromURL();\n"), html.indexOf("// ---- Live database"));
assert.ok(/if\(!selectedDate && mode === 'month' && !whenMode\)/.test(init), "default only for a plain month view");
assert.ok(/selectedDate = todayIso;/.test(init) && !/scrollToDayPanel = true/.test(init), "default selects today without scrolling");
console.log("calendar default day and scroll OK");
