// Ticket/event links that are not absolute web URLs (calendar-feed paths, "Pay at the door") must never
// become a "Tickets & info" button: they resolve against 313.events and land on a broken page.
// Runs the shipped absWebUrl from each page that maps events rows.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const files = ["calendar.html", "event-template.html", "index.html", "map.html"];

function load(file) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  const m = src.match(/function absWebUrl\(u\)\{[\s\S]*?\n\}\n/);
  assert.ok(m, `${file}: absWebUrl is defined`);
  const ctx = { URL };
  vm.createContext(ctx);
  vm.runInContext(m[0] + "\nthis.f = absWebUrl;", ctx);
  return { src, f: ctx.f };
}

const GOOD = ["https://tickets.example.com/e/1", "http://example.org/x?y=1", "  https://example.com/a  "];
const BAD = ["/calendar.aspx?EID=1&month=11&year=2026", "calendar.aspx?EID=1", "Pay at the door", "", "   ", null, undefined, 5,
  "javascript:alert(1)", "mailto:a@b.c", "//example.com/x", "ftp://example.com/f", "https://"];

for (const file of files) {
  const { src, f } = load(file);
  for (const g of GOOD) assert.strictEqual(f(g), g.trim(), `${file}: keeps ${JSON.stringify(g)}`);
  for (const b of BAD) assert.strictEqual(f(b), undefined, `${file}: drops ${JSON.stringify(b)}`);
  assert.ok(src.includes("ticketUrl: absWebUrl(row.ticket_url),"), `${file}: ticketUrl is guarded at the row mapping`);
  assert.ok(src.includes("eventPageUrl: absWebUrl(row.event_url),"), `${file}: eventPageUrl is guarded at the row mapping`);
  assert.ok(!/ticketUrl: row\.ticket_url/.test(src) && !/eventPageUrl: row\.event_url/.test(src), `${file}: no unguarded mapping remains`);
}
console.log("ticket-link-render-guard: all assertions passed");
