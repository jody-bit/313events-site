"use strict";
// Owner decision 2026-11-20 (Today/Tonight): today's rows read not-started, then "Happening now", then no time; and
// Morning / Afternoon / Evening chips filter Today, Tomorrow and This Weekend, counting the rows hidden for having no time.
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const grab = (re, what) => { const m = html.match(re); assert.ok(m, what + " not found"); return m[0]; };
const code = [
  grab(/function parseTimeRange\(timeStr\)\{[\s\S]*?\n\}\n/, "parseTimeRange"),
  grab(/function timeSortMinutes\(timeStr\)\{[\s\S]*?\n\}\n/, "timeSortMinutes"),
  grab(/function todayRank\(timeStr, nowMins\)\{[\s\S]*?\n\}\n/, "todayRank"),
  grab(/function todBucket\(timeStr\)\{[\s\S]*?\n\}\n/, "todBucket"),
  grab(/const TOD_MODES = .*\n/, "TOD_MODES"),
  grab(/const TOD_LABELS = .*\n/, "TOD_LABELS"),
  "let timeOfDay = null; let todHiddenNoTime = 0;",
  grab(/function todChipsHtml\(mode\)\{[\s\S]*?\n\}\n/, "todChipsHtml"),
  grab(/function arrangeStreamRows\(rows, ctx\)\{[\s\S]*?\n\}\n/, "arrangeStreamRows"),
].join("\n");
const mk = (mode, nowMins) => {
  const sb = { Discovery: { window: () => ({ mode }) }, state: {}, detroitNow: () => ({ iso: "2026-11-21", mins: nowMins }), console };
  vm.createContext(sb); vm.runInContext(code, sb);
  return sb;
};
const row = (title, time, day) => ({ day: day === undefined ? "2026-11-21" : day, event: { title, time } });
const rows = () => [row("Noon show", "12:00 PM"), row("No time", ""), row("Morning run", "9:00 AM"), row("Late set", "9:30 PM"),
  row("Seven", "7:00 PM"), row("Placeholder", "Evening"), row("Unconfirmed range", "", null)];
const titles = (a) => a.map((r) => r.event.title);

// Today, 1:00 PM: not started first (by start time), then happening now, then no time (original order kept).
let sb = mk("today", 13 * 60);
assert.deepStrictEqual(titles(sb.arrangeStreamRows(rows(), {})), ["Seven", "Late set", "Morning run", "Noon show", "No time", "Placeholder", "Unconfirmed range"]);
// Tomorrow is never reordered by this rule.
sb = mk("tomorrow", 13 * 60);
assert.deepStrictEqual(titles(sb.arrangeStreamRows(rows(), {})), titles(rows()));
// Chips
sb = mk("today", 13 * 60); sb.eval = (s) => vm.runInContext(s, sb);
sb.eval("timeOfDay = 'evening'");
assert.deepStrictEqual(titles(sb.arrangeStreamRows(rows(), {})), ["Seven", "Late set", "Placeholder"], "Evening: 5 PM on, and the Evening placeholder");
assert.strictEqual(sb.eval("todHiddenNoTime"), 1, "one dated row has no time (the unconfirmed range is not counted)");
assert.ok(/1 event with no time hidden/.test(sb.eval("todChipsHtml('today')")), "visible count of rows hidden for having no time");
sb.eval("timeOfDay = 'morning'");
assert.deepStrictEqual(titles(sb.arrangeStreamRows(rows(), {})), ["Morning run"]);
sb.eval("timeOfDay = 'afternoon'");
assert.deepStrictEqual(titles(sb.arrangeStreamRows(rows(), {})), ["Noon show"]);
assert.strictEqual(sb.eval("todChipsHtml('all')"), "", "no chips outside Today, Tomorrow and This Weekend");
assert.strictEqual((sb.eval("todChipsHtml('weekend')").match(/class="tod-chip/g) || []).length, 3);
console.log("PASS: Today ordering and the time-of-day chips");
