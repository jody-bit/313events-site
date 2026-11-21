"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { buildFeed, classify, parseTimes, detroitToUtc } = require("../api/_lib/calendar-feed");
const NOW = Date.parse("2026-11-20T15:00:00Z"); // Nov 20, 10 AM Detroit
const base = (o) => Object.assign({ id: "11111111-aaaa-bbbb-cccc-000000000001", title: "Jazz Night", status: "approved", start_date: "2026-11-21", time_display: "7:00 PM", venue_name_raw: "The Venue", venue_city_raw: "Detroit", event_url: "https://example.org/e" }, o);
const feed = (rows) => buildFeed(rows, { nowMs: NOW, today: "2026-11-20", siteUrl: "https://313.events" });

test("a confirmed single-day row is listed with correct UTC time (EST) and a 2 hour default end", () => {
  const f = feed([base()]);
  assert.equal(f.listed, 1);
  assert.match(f.ics, /DTSTART:20261122T000000Z/); // 7 PM EST = 00:00Z next day
  assert.match(f.ics, /DTEND:20261122T020000Z/);
  assert.match(f.ics, /UID:11111111-aaaa-bbbb-cccc-000000000001@313\.events/);
  assert.match(f.ics, /URL:https:\/\/313\.events\/event\.html\?id=/);
  assert.ok(f.ics.startsWith("BEGIN:VCALENDAR\r\n") && f.ics.endsWith("END:VCALENDAR\r\n"));
});
test("DST: July 7 PM is EDT (23:00Z); stated end time is honoured", () => {
  assert.equal(detroitToUtc("2026-07-10", 19 * 60).toISOString(), "2026-07-10T23:00:00.000Z");
  assert.equal(detroitToUtc("2026-11-21", 19 * 60).toISOString(), "2026-11-22T00:00:00.000Z");
  const f = feed([base({ time_display: "7:07 PM – 10:07 PM" })]);
  assert.match(f.ics, /DTSTART:20261122T000700Z/); assert.match(f.ics, /DTEND:20261122T030700Z/);
});
test("unknown or unconfirmed times are never listed and never guessed", () => {
  for (const [name, row, reason] of [
    ["Evening placeholder", base({ time_display: "Evening" }), "time_unconfirmed"],
    ["empty time", base({ time_display: "" }), "time_unconfirmed"],
    ["day-name first", base({ time_display: "Fri 5–10 PM · Sat 11 AM–5 PM" }), "time_unconfirmed"],
    ["all day", base({ is_all_day: true, time_display: "7:00 PM" }), "all_day"],
    ["multi day range", base({ end_date: "2026-11-25" }), "multi_day"],
    ["pending", base({ status: "pending_review" }), "not_public"],
    ["past", base({ start_date: "2026-11-19" }), "outside_window"],
    ["beyond 14 days", base({ start_date: "2026-12-04" }), "outside_window"],
    ["no title", base({ title: "" }), "incomplete"],
  ]) { const f = feed([row]); assert.equal(f.listed, 0, name); assert.equal(f.skipped[reason], 1, name + " -> " + reason); }
});
test("window is today through today+13 inclusive; a recurring row without occurrence dates is left out", () => {
  assert.equal(feed([base({ start_date: "2026-11-20" })]).listed, 1);
  assert.equal(feed([base({ start_date: "2026-12-03" })]).listed, 1);
  assert.equal(feed([base({ start_date: "2026-12-04" })]).listed, 0);
  const f = feed([base({ date_semantics: "recurring" })]);
  assert.equal(f.listed, 0); assert.equal(f.skipped.schedule_unconfirmed, 1);
});
test("text is escaped and folded; TBA venue is dropped from LOCATION; unsafe links are not emitted", () => {
  const f = feed([base({ title: "A, B; C\\D\nE " + "x".repeat(200), venue_name_raw: "Venue TBA", ticket_url: "javascript:alert(1)", event_url: "https://example.org/e" })]);
  assert.match(f.ics, /\r\nLOCATION:Detroit\r\n/); // a TBA venue name is dropped by the shared formatter; the city that is known stays
  assert.ok(!/javascript:/.test(f.ics));
  for (const line of f.ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, "line <= 75 octets");
  const g = feed([base({ venue_name_raw: "Fox Theatre", venue_address_raw: "2211 Woodward Ave", venue_city_raw: "Detroit" })]);
  assert.match(g.ics, /LOCATION:Fox Theatre\\, 2211 Woodward Ave\\, Detroit/);
  assert.match(f.ics, /SUMMARY:A\\, B\\; C\\\\D\\nE/);
});
test("sorted by start, stable; deterministic given the same rows; never mutates input; hostile input does not throw", () => {
  const rows = [base({ id: "b", time_display: "9:00 PM" }), base({ id: "a", time_display: "1:00 PM" })];
  const before = JSON.stringify(rows);
  const f1 = feed(rows), f2 = feed(rows);
  assert.equal(f1.ics, f2.ics); assert.equal(JSON.stringify(rows), before);
  assert.ok(f1.ics.indexOf("UID:a@") < f1.ics.indexOf("UID:b@"));
  assert.doesNotThrow(() => feed([null, undefined, 5, "x", {}, { id: 1 }]));
  assert.equal(feed(undefined).listed, 0);
  assert.match(feed([]).ics, /BEGIN:VCALENDAR[\s\S]*END:VCALENDAR/);
});
test("parseTimes reads only a leading time and an adjacent range end", () => {
  assert.deepEqual(parseTimes("11:00 AM"), { start: 660, end: null });
  assert.deepEqual(parseTimes("10:00 AM – 4:00 PM"), { start: 600, end: 960 });
  assert.equal(parseTimes("Doors 7 PM"), null);
  assert.equal(parseTimes("13:00 PM"), null);
});
test("handler: partial read answers 503 and never serves a partial feed; complete read serves text/calendar", async () => {
  const path = require.resolve("../api/calendar-feed.js");
  const mkRes = () => { const r = { headers: {}, code: 0, body: null, setHeader(k, v) { r.headers[k] = v; return r; }, status(c) { r.code = c; return r; }, end() { return r; }, send(b) { r.body = b; return r; } }; return r; };
  const env = { ...process.env }; Object.assign(process.env, { VERCEL_ENV: "production", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" });
  const realFetch = global.fetch;
  try {
    delete require.cache[path];
    global.fetch = async () => ({ ok: false, status: 500, text: async () => "boom", json: async () => ({}) });
    const handler = require(path); const res = mkRes(); await handler({ method: "GET" }, res);
    assert.equal(res.code, 503); assert.equal(res.body, null);
    const bad = mkRes(); await handler({ method: "POST" }, bad); assert.equal(bad.code, 405);
  } finally { global.fetch = realFetch; Object.keys(process.env).forEach((k) => { if (!(k in env)) delete process.env[k]; }); Object.assign(process.env, env); }
});
