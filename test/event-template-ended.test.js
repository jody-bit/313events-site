// test/event-template-ended.test.js
//
// BL-ENDED-MSG (owner build GO 2026-10-17 18:40Z): the event page keeps its dates and adds "This event has ended" once the
// FINAL VERIFIED occurrence has ended, in America/Detroit time. Extracts the real shipped code from event-template.html.
// Run: node test/event-template-ended.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/event-template.html`, "utf8");
const grab = (re, label) => { const m = html.match(re); if (!m) throw new Error(label + " not found"); return m[0]; };
global.window = { location: { href: "https://313.events/event.html?id=x" } };
global.EventDates = require(`${REPO_DIR}/event-dates.js`);
const src = [
  grab(/function parseTimeRange\([\s\S]*?\n\}\n/, "parseTimeRange"),
  grab(/function detroitNow\([\s\S]*?\n\}\n/, "detroitNow"),
  grab(/function isoPlusOneDay\([\s\S]*?\n\}\n/, "isoPlusOneDay"),
  grab(/function occurrenceEnded\([\s\S]*?\n\}\n/, "occurrenceEnded"),
  grab(/function occurrenceDays\([\s\S]*?\n\}\n/, "occurrenceDays"),
  grab(/function isDatesUnconfirmed\([\s\S]*?\n\}\n/, "isDatesUnconfirmed"),
  grab(/function eventHasEnded\([\s\S]*?\n\}\n/, "eventHasEnded"),
].join("\n");
const RealDate = Date;
let NOW = "2026-10-16T16:00:00Z";
const at = (iso) => { NOW = iso; };
class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } }
const { eventHasEnded } = new Function("Date", `${src}\nreturn { eventHasEnded };`)(FakeDate);
const ev = (o) => Object.assign({ date: "2026-10-16", endDate: "2026-10-16", time: "", dateSemantics: null, occurrenceDates: null }, o);

// Single day, no stated end: ended only after the Detroit day is over.
at("2026-10-16T16:00:00Z"); // Fri noon Detroit
assert.strictEqual(eventHasEnded(ev({ time: "7:00 PM" })), false, "today, no end time: not ended");
at("2026-10-17T03:59:00Z"); // Fri 11:59 PM Detroit
assert.strictEqual(eventHasEnded(ev({ time: "7:00 PM" })), false, "11:59 PM same day: not ended");
at("2026-10-17T04:00:00Z"); // Sat 12:00 AM Detroit
assert.strictEqual(eventHasEnded(ev({ time: "7:00 PM" })), true, "after midnight Detroit: ended");
assert.strictEqual(eventHasEnded(ev({})), true, "no time at all, next day: ended");
// Stated end time ends it then.
at("2026-10-16T23:30:00Z"); // 7:30 PM Detroit
assert.strictEqual(eventHasEnded(ev({ time: "5:00 PM - 7:00 PM" })), true, "stated end passed: ended");
assert.strictEqual(eventHasEnded(ev({ time: "5:00 PM - 8:00 PM" })), false, "stated end not reached: not ended");
// Overnight single night: ends the next morning, never at midnight.
const night = ev({ time: "10:00 PM - 2:00 AM", date: "2026-10-16", endDate: "2026-10-17" });
at("2026-10-17T05:30:00Z"); // 1:30 AM Sat Detroit
assert.strictEqual(eventHasEnded(night), false, "1:30 AM, overnight run still going");
at("2026-10-17T06:00:00Z"); // 2:00 AM
assert.strictEqual(eventHasEnded(night), true, "2:00 AM: overnight run over");
// Recurring with evidenced occurrences: ended only after the LAST one.
const rec = ev({ date: "2026-10-01", endDate: "2026-10-31", dateSemantics: "recurring", occurrenceDates: ["2026-10-02", "2026-10-09", "2026-10-16"], time: "7:00 PM" });
at("2026-10-16T16:00:00Z");
assert.strictEqual(eventHasEnded(rec), false, "last occurrence is today");
at("2026-10-17T04:00:00Z");
assert.strictEqual(eventHasEnded(rec), true, "after the last occurrence");
at("2026-10-10T16:00:00Z");
assert.strictEqual(eventHasEnded(rec), false, "occurrences remain");
// Continuous run: ended after its end date, not its start.
const cont = ev({ date: "2026-10-01", endDate: "2026-10-20", dateSemantics: "continuous" });
at("2026-10-19T16:00:00Z");
assert.strictEqual(eventHasEnded(cont), false, "inside a continuous run");
at("2026-10-21T04:00:00Z");
assert.strictEqual(eventHasEnded(cont), true, "after a continuous run's end date");
// Unverified dates are never "ended", however old the stored range is.
const unv = ev({ date: "2026-09-01", endDate: "2026-09-30", time: "9:00 AM" });
at("2026-10-16T16:00:00Z");
assert.strictEqual(eventHasEnded(unv), false, "unverified multi-day range: no ended claim");
// DST: Nov 1 2026 fall back (1:00-2:00 AM happens twice). An event ending at 1:30 AM Nov 1 ends at the first 1:30 AM? Uses Detroit clock minutes, so the 1:30 hour is treated as one clock time.
const dst = ev({ date: "2026-10-31", endDate: "2026-11-01", time: "10:00 PM - 1:30 AM" });
at("2026-11-01T05:29:00Z"); // 1:29 AM EDT
assert.strictEqual(eventHasEnded(dst), false, "DST night before 1:30 AM");
at("2026-11-01T06:30:00Z"); // 1:30 AM EST (second pass) or 2:30 AM EDT-equivalent: Detroit clock past 1:30
assert.strictEqual(eventHasEnded(dst), true, "DST night after 1:30 AM");
// Spring forward Mar 14 2027: day-end rule still holds around the gap.
const spring = ev({ date: "2027-03-14", endDate: "2027-03-14", time: "9:00 PM" });
at("2027-03-15T03:59:00Z"); // 11:59 PM EDT Mar 14
assert.strictEqual(eventHasEnded(spring), false, "spring-forward day, before midnight");
at("2027-03-15T04:00:00Z");
assert.strictEqual(eventHasEnded(spring), true, "spring-forward day, after midnight");
// Malformed or missing date: no claim.
assert.strictEqual(eventHasEnded(ev({ date: "" })), false, "missing date: no ended claim");

// Wiring: the message element exists, is hidden by default, and the dates heading is untouched.
assert.ok(/<div class="evt-ended" id="evtEnded" style="display:none;">This event has ended<\/div>/.test(html), "message element, hidden by default");
assert.ok(/getElementById\('evtEnded'\)\.style\.display = eventHasEnded\(e\)/.test(html), "shown only when eventHasEnded(e)");
assert.ok(/document\.getElementById\('evtWhen'\)\.innerHTML = `<strong>\$\{escapeHtml\(dateLabel\)\}<\/strong>/.test(html), "dates heading still rendered, unchanged");
assert.ok(/id="evtShareBtn"/.test(html) && /EventLinks\.resolve\(e\)/.test(html) && /if\(L\.primary\) actionsHtml/.test(html), "Share and Tickets are unchanged");
console.log("PASS: event page ended message (verified final occurrence only, Detroit time)");
