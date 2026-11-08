// test/unconfirmed-time-calendar-map.test.js
// T5/T6: calendar.html "Dates not confirmed" section and map.html evtRowHtml show "Time not confirmed" (11px) for
// schedule-unverified rows instead of an unverified start time. Confirmed rows keep their time. Eligibility untouched.
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const cal = fs.readFileSync(`${REPO_DIR}/calendar.html`, "utf8");
const map = fs.readFileSync(`${REPO_DIR}/map.html`, "utf8");
const m = cal.match(/function renderUnconfirmedResults\(\)\{[\s\S]*?\n\}\n/);
assert.ok(m, "renderUnconfirmedResults not found");
assert.ok(/<small class="evt-time-unconfirmed">Time not confirmed<\/small>/.test(m[0]), "calendar section uses the label");
assert.ok(!/escapeHtml\(e\.time\)/.test(m[0]), "calendar unconfirmed section no longer prints e.time");
const f = map.match(/function evtRowHtml\(e\)\{[\s\S]*?\n\}\n/);
assert.ok(f, "evtRowHtml not found");
assert.ok(/scheduleState\(e\) === 'unverified' \? '<small class="evt-time-unconfirmed">Time not confirmed<\/small>' : escapeHtml\(e\.time\)/.test(f[0]), "map row switches on unverified");
for (const [n, h] of [["calendar", cal], ["map", map]]) {
  assert.ok(/\.evt-time small\.evt-time-unconfirmed\{[^}]*font-size:11px/.test(h), n + ": 11px floor");
  assert.ok(/overflow-wrap:normal;word-break:normal/.test(h), n + ": wraps only between words");
}
console.log("unconfirmed-time-calendar-map: ok");
// Popups/pins (pe-meta) must not expose the stored time for unverified rows.
for (const [n, h] of [["calendar", cal], ["map", map]]) {
  assert.ok(/pe-meta[^\n]*scheduleState\(e\) === 'unverified' \? ' · Time not confirmed' : e\.time/.test(h), n + ": popup meta hides unverified time");
}
console.log("popup guard ok");
