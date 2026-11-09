// test/press-queue-filter.test.js
//
// Stage 3 admin queue modernization: read-side filter for the "Article-event links to verify" list (owner
// decisions 2026-10-16). Ended / removed / out-of-Orbit rows are hidden by rule with a reason; an unresolved row with a
// documented VERIFIED recommendation is never hidden for ending alone; recommendations stay separate from statuses;
// counts are dynamic; nothing is written.
//
// Run: node test/press-queue-filter.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2026-10-16T16:00:00Z");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { annotateLinks } = require("../api/_lib/press-queue-filter.js");
const RECS = require("../data/press-link-recommendations.json");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const ev = (extra) => ({ id: "e", title: "t", status: "approved", start_date: "2026-11-01", end_date: null, is_recurring: false, venues: { name: "v", city: "Detroit", lat: 42.33, lng: -83.05 }, ...extra });
const row = (article_id, event_id, status, event) => ({ article_id, event_id, verification_status: status, events: event });
const by = (links, a) => links.find((l) => l.article_id === a);

// 1. Hidden-by-rule reasons, nothing dropped.
{
  const rows = [
    row("a-future", "e1", "candidate", ev({})),
    row("a-ended", "e2", "candidate", ev({ start_date: "2026-09-12" })),
    row("a-today", "e3", "needs_follow_up", ev({ start_date: "2026-10-16" })),
    row("a-span", "e4", "candidate", ev({ start_date: "2026-10-01", end_date: "2026-10-31" })),
    row("a-recurring", "e5", "candidate", ev({ start_date: "2026-01-05", is_recurring: true })),
    row("a-nodate", "e6", "candidate", ev({ start_date: null })),
    row("a-removed", "e7", "candidate", ev({ status: "rejected", start_date: "2026-11-20" })),
    row("a-far", "e8", "candidate", ev({ venues: { name: "v", city: "Cleveland", lat: 41.5, lng: -81.7 } })),
    row("a-nolatlng", "e9", "candidate", ev({ venues: { name: "v", city: "Toledo", lat: null, lng: null } })),
    row("a-bowling", "e10", "candidate", ev({ venues: { name: "v", city: "Bowling Green", lat: 41.3748, lng: -83.6513 } })),
  ];
  const { links, counts } = annotateLinks(rows, { recommendations: [] });
  assert.strictEqual(links.length, rows.length, "no row is dropped");
  assert.strictEqual(by(links, "a-future").queue.hidden, false);
  assert.strictEqual(by(links, "a-ended").queue.reason, "ended");
  assert.match(by(links, "a-ended").queue.reasonText, /Event ended Sep 12/);
  assert.strictEqual(by(links, "a-today").queue.hidden, false, "today is still active");
  assert.strictEqual(by(links, "a-span").queue.hidden, false, "multi-day event uses its end date");
  assert.strictEqual(by(links, "a-recurring").queue.hidden, false);
  assert.strictEqual(by(links, "a-nodate").queue.hidden, false, "unreadable date never hidden");
  assert.strictEqual(by(links, "a-removed").queue.reason, "removed");
  assert.strictEqual(by(links, "a-far").queue.reason, "outside_orbit");
  assert.strictEqual(by(links, "a-nolatlng").queue.hidden, false, "unknown location never hidden");
  assert.strictEqual(by(links, "a-bowling").queue.hidden, false, "Bowling Green is 65.7 mi from the border: inside the Orbit");
  assert.deepStrictEqual(counts, { active: 7, hidden: 3, ended: 1, removed: 1, outside_orbit: 1 }, "counts are computed from the rows");
  for (const l of links) assert.ok(!("verification_status_changed" in l));
  assert.strictEqual(by(links, "a-ended").verification_status, "candidate", "status untouched");
}

// 2. Verified-recommendation exemption.
{
  const recs = { recommendations: [
    { article_id: "a-v", event_id: "e1", recommended_verdict: "verified", basis: "quote", recommended_by: "05", recommended_on: "2026-10-16" },
    { article_id: "a-r", event_id: "e2", recommended_verdict: "rejected", basis: "quote", recommended_by: "05", recommended_on: "2026-10-16" },
  ] };
  const ended = ev({ start_date: "2026-09-12" });
  const { links } = annotateLinks([row("a-v", "e1", "candidate", ended), row("a-r", "e2", "candidate", ended), row("a-v", "e1b", "candidate", ended)], recs);
  assert.strictEqual(links[0].queue.hidden, false, "ended row with a Verified recommendation stays visible");
  assert.strictEqual(links[0].queue.recommendation.verdict, "verified");
  assert.strictEqual(links[1].queue.hidden, true, "a Rejected recommendation does not exempt");
  assert.strictEqual(links[1].queue.recommendation.verdict, "rejected", "still shown as a recommendation when revealed");
  assert.strictEqual(links[2].queue.hidden, true, "recommendation is keyed to the exact article/event pair");
  // Once a person acts, the exemption ends; the recommendation never changes the status.
  const done = annotateLinks([row("a-v", "e1", "verified", ended)], recs).links[0];
  assert.strictEqual(done.queue.hidden, true);
  assert.strictEqual(done.verification_status, "verified");
  // Exemption never overrides a removed event.
  const gone = annotateLinks([row("a-v", "e1", "candidate", ev({ status: "rejected", start_date: "2026-09-12" }))], recs).links[0];
  assert.strictEqual(gone.queue.reason, "removed");
}

// 3. The checked-in recommendation list: shape, 7 Verified, Sweet Endings held.
{
  const verified = RECS.recommendations.filter((r) => r.recommended_verdict === "verified");
  assert.strictEqual(verified.length, 7);
  assert.strictEqual(RECS.recommendations.length, 18);
  for (const r of RECS.recommendations) {
    assert.ok(/^[0-9a-f-]{36}$/.test(r.article_id) && /^[0-9a-f-]{36}$/.test(r.event_id), "full ids");
    assert.ok(["verified", "rejected"].includes(r.recommended_verdict));
    assert.ok(r.basis && r.recommended_by && r.recommended_on);
  }
  assert.ok(!RECS.recommendations.some((r) => r.article_id.startsWith("6a2458a4")), "Sweet Endings is held, not recommended");
  assert.ok(!RECS.recommendations.some((r) => r.article_id.startsWith("128b5fcd")), "Stevie Wonder is unresolved");
}

// 4. Endpoint: annotated rows, counts, and no write of any kind.
async function endpoint() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.ADMIN_SECRET = "fixture-admin-secret"; // a test value for this fixture only
  const calls = [];
  const rows = [row("a-ended", "e2", "candidate", ev({ start_date: "2026-09-12" })), row("a-future", "e1", "needs_follow_up", ev({}))];
  global.fetch = async (url, init) => { calls.push({ url: String(url), method: (init && init.method) || "GET" }); return { ok: true, status: 200, json: async () => rows, text: async () => "" }; };
  for (const m of ["admin-editorial.js", "_lib/press-queue-filter.js"]) delete require.cache[require.resolve(`${REPO_DIR}/api/${m}`)];
  const handler = require(`${REPO_DIR}/api/admin-editorial.js`);
  const res = { status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
  await handler({ method: "GET", query: { view: "links" }, headers: { "x-admin-secret": process.env.ADMIN_SECRET } }, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._body.links.length, 2);
  assert.deepStrictEqual(res._body.counts, { active: 1, hidden: 1, ended: 1, removed: 0, outside_orbit: 0 });
  assert.ok(calls.every((c) => c.method === "GET"), "filtering performs no writes");
  assert.ok(/end_date/.test(calls[0].url) && /lat,lng/.test(calls[0].url), "query reads the fields the rules need");
}

// 5. admin.html: Show hidden control, live-count line, recommendation labeled as not a status.
function page() {
  const html = fs.readFileSync(path.join(REPO_DIR, "admin.html"), "utf8");
  assert.ok(html.includes('id="linkShowHidden"') && html.includes("Show hidden"));
  assert.ok(html.includes('id="linkHiddenLine"'));
  assert.ok(html.includes("(a recommendation, not a status)"));
  assert.ok(html.includes("Hidden by rule:"));
  assert.ok(html.includes("function linkHiddenLineText(c)"), "hidden line is generated from counts");
  assert.ok(!/\b72 links hidden\b|\b20 active\b/.test(html), "counts are not hard-coded");
}

endpoint().then(() => { page(); console.log("press-queue-filter: all assertions passed"); }, (e) => { console.error(e); process.exit(1); });
