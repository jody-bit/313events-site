// "Tickets available" filter keys on EventLinks primary label, not on any ticketUrl (calendar.html, map.html).
"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path");
for (const f of ["calendar.html", "map.html"]) {
  const s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  assert.ok(!/has\('tickets'\)\s*&&\s*!e\.ticketUrl/.test(s), f + ": no raw ticketUrl test");
  assert.ok(/has\('tickets'\)\s*&&\s*!hasTicketLink\(e\)/.test(s), f + ": filter uses hasTicketLink");
  assert.ok(/label === 'Get tickets'/.test(s), f + ": helper checks the Get tickets label");
}
const { EventLinks } = require("../event-links.js");
const has = (e) => { const L = EventLinks.resolve(e); return !!(L.primary && L.primary.label === "Get tickets"); };
assert.strictEqual(has({ ticketUrl: "https://ra.co/events/123" }), true, "vendor link counts");
assert.strictEqual(has({ ticketUrl: "https://venue.example/" }), false, "venue homepage does not");
assert.strictEqual(has({ ticketUrl: "https://www.visitdetroit.com/events/x/" }), false, "listing page (Event details) does not");
assert.strictEqual(has({ eventPageUrl: "https://venue.example/e/1" }), false, "event page only does not");
assert.strictEqual(has({}), false);
console.log("ok tickets-filter-primary");
