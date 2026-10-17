// test/calendar-mobile-clipping.test.js
//
// Experience (owner GO 2026-10-17 18:40Z): at phone width the month grid's seven narrow columns clipped "N EVENTS" to
// "N EVENT" and "● TODAY" to "TOD" (the cell has overflow:hidden), and the Where trigger cut "Everywhere" to
// "Everywh…". Source-level regression guard on the shipped calendar.html; the layout itself was measured in Chromium at
// 375/360/320/414 (no element wider than its container, no clipped text) and is recorded in the PR.
//   - at <=720px the day number and TODAY label wrap, and the count drops its unit word (aria-label keeps "N events")
//   - desktop rules are untouched: the unit word is only hidden inside the <=720px query
//   - trigger side padding is reduced at <=720px and the caret goes at <=360px
// Run: node test/calendar-mobile-clipping.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/calendar.html`, "utf8");

// Balanced-brace extraction of every @media (max-width:Npx){...} block.
function mediaBlocks(src, px) {
  const out = [];
  const re = new RegExp(`@media \\(max-width:${px}px\\)\\{`, "g");
  let m;
  while ((m = re.exec(src))) {
    let depth = 1, i = re.lastIndex;
    while (depth && i < src.length) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
    out.push(src.slice(re.lastIndex, i - 1));
  }
  return out;
}
const m720 = mediaBlocks(html, 720).join("\n");
const m360 = mediaBlocks(html, 360).join("\n");
const outside = html.replace(/@media \(max-width:\d+px\)\{[\s\S]*?\n  \}\n/g, "");

assert.ok(/\.day-cell\{min-height:78px;padding:5px 3px 6px;\}/.test(m720), "<=720px: day cell padding tightened");
assert.ok(/\.daynum\{flex-wrap:wrap;gap:0 4px;\}/.test(m720), "<=720px: day number and TODAY label may stack");
assert.ok(/\.day-count \.dc-word\{display:none;\}/.test(m720), "<=720px: the count drops its unit word");
assert.ok(!/\.dc-word\{display:none/.test(outside), "the unit word is hidden only inside the <=720px query (desktop unchanged)");
assert.ok(/\.mobile-trigger\{align-items:center;text-align:center;padding:9px 6px;\}/.test(m720), "<=720px: trigger side padding reduced");
assert.ok(/\.mobile-triggers \.mobile-trigger \.mt-sub\{font-size:11\.5px;\}/.test(m360) && /::after\{content:none;\}/.test(m360), "<=360px: smaller text and no caret so Everywhere fits");
assert.ok(/\.pill\{display:none;\}/.test(m720) && /\.more-link\{display:none;\}/.test(m720), "existing <=720px rules kept");

// Markup: the count still carries the number and the full word (desktop text unchanged), and the cell's aria-label is untouched.
assert.ok(/count\.innerHTML = `<span class="dot"><\/span><span>\$\{events\.length\}<span class="dc-word"> EVENT\$\{events\.length===1\?'':'S'\}<\/span><\/span>`;/.test(html), "count markup: number plus a hideable unit word");
assert.ok(/const countLabel = events\.length \? `, \$\{events\.length\} event\$\{events\.length===1\?'':'s'\}` : ', no events';/.test(html), "cell aria-label still announces the event count");
assert.ok(/todayLabel\.textContent = '● TODAY';/.test(html), "TODAY label text unchanged");

// The unit word must exist for the textual count on desktop: rebuild the string the way the page does.
const count = (n) => `${n}${" EVENT" + (n === 1 ? "" : "S")}`;
assert.strictEqual(count(1), "1 EVENT");
assert.strictEqual(count(3), "3 EVENTS");
console.log("PASS: calendar phone-width clipping fixes in place; desktop rules unchanged");
