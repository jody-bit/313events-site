// test/pending-classifier.test.js
//
// Admin queue modernization, Stage 2: read-side classification of pending submissions (owner decision 2026-10-16).
// Regression fixture = the real upcoming pending City of Dearborn rows read 2026-10-16 (120 rows, 87 distinct
// title/venue/category combinations; ids and personal data are not included). The classifier never rejects, hides or
// changes a row: every row keeps its status and is returned.
//
// Run: node test/pending-classifier.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2026-10-16T16:00:00Z");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { classifyPendingRow: classifyAny, classifyRows, CLASSES } = require("../api/_lib/pending-classifier.js");
const FX = require("./fixtures/dearborn-pending-titles-2026-10-16.json");
// The fixture and the cases below are City of Dearborn rows.
const classifyPendingRow = (r) => classifyAny(Object.assign({ source: "City of Dearborn" }, r));
const REPO_DIR = process.env.REPO_DIR || process.cwd();

// 1. Every real title lands in the expected class.
const counts = Object.fromEntries(CLASSES.map((c) => [c, 0]));
let total = 0;
for (const r of FX) {
  const got = classifyPendingRow(r);
  assert.strictEqual(got.class, r.expected, `${r.title} (${r.venue_name_raw}) -> ${got.class}, expected ${r.expected}`);
  assert.ok(got.reason, "every class carries a reason");
  counts[got.class] += r.count;
  total += r.count;
}
assert.strictEqual(total, 120, "the fixture covers all 120 rows");
assert.deepStrictEqual(counts, { public_event: 48, civic_meeting: 46, service: 12, observance: 11, ambiguous: 3 });

// 2. Legitimate meetings stay meetings (Civic & Community), including cancelled and Venue TBD ones.
for (const t of ["City Council Meeting", "Planning Commission", "Pension Board Meeting", "Zoning Board of Appeals", "Joint DDA Executive Committee Meeting", "Mayor Hammoud's Briefing Session", "Senior Citizen Commission Meets"]) {
  assert.strictEqual(classifyPendingRow({ title: t, venue_name_raw: "16901 Michigan Avenue, Dearborn", category: "community" }).class, "civic_meeting", t);
}
const cancelled = classifyPendingRow({ title: "CANCELED - Demolition Board of Appeals Meeting", venue_name_raw: "x", category: "community" });
assert.strictEqual(cancelled.class, "civic_meeting");
assert.strictEqual(cancelled.cancelled, true, "a cancelled meeting stays a meeting and is flagged");
assert.strictEqual(classifyPendingRow({ title: "Housing Commission Meeting", venue_name_raw: "TBD", category: "community" }).class, "civic_meeting", "a missing venue does not change a meeting");

// 3. A meeting word does not swallow a real event; an observance is not forced into events; Venue TBA alone decides nothing.
assert.strictEqual(classifyPendingRow({ title: "Festival of Trees Preview Party", venue_name_raw: "Venue TBA", category: "fest" }).class, "public_event");
assert.strictEqual(classifyPendingRow({ title: "Board Game Night Festival", venue_name_raw: "x", category: "community" }).class, "public_event", "event wording wins over a meeting word");
assert.strictEqual(classifyPendingRow({ title: "Diwali", venue_name_raw: "Venue TBA", category: "community" }).class, "observance");
assert.strictEqual(classifyPendingRow({ title: "Something Unlisted", venue_name_raw: "Venue TBA", category: "community" }).class, "ambiguous", "no venue and no wording: a person decides");
assert.strictEqual(classifyPendingRow({ title: "Something Unlisted", venue_name_raw: "1 Main St", category: "community" }).class, "public_event", "a real venue defaults to events, where a person decides");
assert.strictEqual(classifyPendingRow({}).class, "ambiguous");

// 4. classifyRows: nothing dropped, nothing written, original fields untouched.
const rows = FX.map((r, i) => ({ id: "id" + i, source: "City of Dearborn", status: "pending_review", title: r.title, venue_name_raw: r.venue_name_raw, category: r.category }));
const snap = JSON.stringify(rows);
const out = classifyRows(rows);
assert.strictEqual(JSON.stringify(rows), snap, "input rows are not mutated");
assert.strictEqual(out.events.length, rows.length);
assert.ok(out.events.every((e, i) => e.id === rows[i].id && e.status === "pending_review"), "order and status preserved");
assert.strictEqual(Object.values(out.class_counts).reduce((a, b) => a + b, 0), rows.length);

// 4b. Other sources are never grouped as meetings, observances or services (R&Q finding, #138).
for (const title of ["Bagley Community Council Annual Trunk or Treat", "Board Game Night", "Authority Comedy Night", "Book Club Meeting", "Commission Hill Jazz Brunch", "Diwali Festival of Lights Gala", "Gleaners Food Pantry Volunteer Day", "City Council Meeting"]) {
  for (const source of ["Eventbrite", "Ticketmaster", "Public submission", "", undefined]) {
    const got = classifyAny({ title, source, venue_name_raw: "Venue TBA", category: "community" });
    assert.strictEqual(got.class, "public_event", `${title} from ${source} must stay an ordinary submission`);
  }
}
assert.strictEqual(classifyAny({ title: "Pension Board Meeting", source: "City of Dearborn" }).class, "civic_meeting");

// 5. Endpoint: annotated, no writes; admin.html groups, collapses only the three standing classes.
async function endpoint() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.ADMIN_SECRET = "fixture-admin-secret"; // a test value for this fixture only
  const calls = [];
  const pending = [
    { id: "a", source: "City of Dearborn", title: "City Council Meeting", category: "community", status: "pending_review", start_date: "2026-11-01", end_date: null, is_recurring: false, venue_name_raw: "16901 Michigan Avenue, Dearborn", created_at: "2026-10-13T22:01:18Z" },
    { id: "b", source: "City of Dearborn", title: "The Nutcracker 1", category: "community", status: "pending_review", start_date: "2026-12-05", end_date: null, is_recurring: false, venue_name_raw: "15801 Michigan Avenue, Dearborn", created_at: "2026-10-13T22:01:18Z" },
  ];
  const { makeMockPostgrest } = require("./fixtures/mock-postgrest.js");
  const db = makeMockPostgrest({ events: pending }, { cap: 1000 });
  global.fetch = async (url, init) => { calls.push({ method: (init && init.method) || "GET" }); return db.fetch(String(url), init); };
  for (const m of ["admin-events.js", "_lib/pending-classifier.js", "_lib/pending-queue.js"]) delete require.cache[require.resolve(`${REPO_DIR}/api/${m}`)];
  const handler = require(`${REPO_DIR}/api/admin-events.js`);
  const res = { status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
  await handler({ method: "GET", query: {}, headers: { "x-admin-secret": process.env.ADMIN_SECRET } }, res);
  assert.strictEqual(res._status, 200, JSON.stringify(res._body));
  assert.strictEqual(res._body.events.length, 2, "no row dropped");
  assert.strictEqual(res._body.events.find((e) => e.id === "a").queue_class.class, "civic_meeting");
  assert.strictEqual(res._body.events.find((e) => e.id === "b").queue_class.class, "public_event");
  assert.deepStrictEqual(res._body.class_counts, { public_event: 1, civic_meeting: 1, service: 0, observance: 0, ambiguous: 0 });
  assert.ok(calls.every((c) => c.method === "GET"), "classification performs no writes");
}
function page() {
  const html = fs.readFileSync(path.join(REPO_DIR, "admin.html"), "utf8");
  assert.ok(html.includes("Civic & Community: public meetings"));
  assert.ok(html.includes("QUEUE_CLASS_ORDER"));
  assert.ok(html.includes("onclick=\"review('${e.id}','approve')\"") && html.includes("onclick=\"review('${e.id}','reject')\""), "Approve and Reject remain on every card");
}
endpoint().then(() => { page(); console.log("pending-classifier: all assertions passed"); }, (e) => { console.error(e); process.exit(1); });
