// test/link-check-run.test.js — rotating link check (Decision 7).
//
// Run: node test/link-check-run.test.js
"use strict";
const assert = require("assert");
const { recheckIntervalDays, primaryLink, selectDue, run } = require("../api/_lib/link-check-run");

const NOW = Date.parse("2026-10-24T12:00:00Z");
const day = (n) => new Date(NOW + n * 86400000).toISOString().slice(0, 10);
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const ev = (id, inDays, extra = {}) => ({ id, start_date: day(inDays), ticket_url: `https://example.com/e/${id}-spring-show`, event_url: null, link_checked_at: null, link_check_status: null, ...extra });

async function main() {
  assert.deepStrictEqual([0, 3, 4, 14, 15, 30, 31, 90].map(recheckIntervalDays), [1, 1, 2, 2, 7, 7, 14, 14]);
  console.log("PASS: interval tightens as the event approaches");

  assert.strictEqual(primaryLink({ ticket_url: "https://venue.com/", event_url: null }), null);
  assert.strictEqual(primaryLink({ ticket_url: null, event_url: null }), null);
  assert.strictEqual(primaryLink({ ticket_url: "/relative", event_url: "https://example.com/e/9-spring-show" }).field, "event_url");
  console.log("PASS: homepages, missing and invalid links are never checked");

  const rows = [
    ev("far-fresh", 60, { link_checked_at: ago(5) }),
    ev("far-due", 60, { link_checked_at: ago(15) }),
    ev("soon-due", 2, { link_checked_at: ago(1.5) }),
    ev("soon-fresh", 2, { link_checked_at: ago(0.2) }),
    ev("never-far", 90),
    ev("never-near", 5),
  ];
  assert.deepStrictEqual(selectDue(rows, NOW, 10).map((d) => d.row.id), ["never-near", "never-far", "soon-due", "far-due"]);
  assert.strictEqual(selectDue(rows, NOW, 2).length, 2);
  console.log("PASS: never-checked first, then soonest; fresh rows skipped; cap applied");

  const responses = { "a": 200, "b": 404, "c": 410, "d": 403, "e": 429, "f": 503, "g": "throw" };
  const rs = Object.keys(responses).map((k) => ev(k, 5, { link_check_status: "ok", ticket_url: `https://example.com/e/${k}-spring-show` }));
  const fetchFn = async (url) => {
    const v = responses[url.match(/\/e\/(\w)-/)[1]];
    if (v === "throw") throw new Error("timeout");
    return { status: v };
  };
  const writes = [];
  const dry = await run({ rows: rs, now: NOW, fetchFn, patchFn: async (i, f) => writes.push([i.row.id, f]), apply: false });
  assert.strictEqual(writes.length, 0);
  assert.deepStrictEqual([dry.mode, dry.checked, dry.ok, dry.dead, dry.inconclusive], ["dry", 7, 1, 2, 4]);
  assert.deepStrictEqual(dry.dead_ids.sort(), ["b", "c"]);
  console.log("PASS: dry mode checks and counts, writes nothing");

  const applied = await run({ rows: rs, now: NOW, fetchFn, patchFn: async (i, f) => writes.push([i.row.id, f]), apply: true });
  assert.strictEqual(applied.mode, "apply");
  const byId = Object.fromEntries(writes);
  assert.strictEqual(byId.a.link_check_status, "ok");
  assert.strictEqual(byId.b.link_check_status, "dead");
  assert.strictEqual(byId.c.link_check_status, "dead");
  for (const k of ["d", "e", "f", "g"]) {
    assert.ok(byId[k].link_checked_at);
    assert.ok(!("link_check_status" in byId[k]), `${k}: an inconclusive result must not touch link_check_status`);
  }
  assert.deepStrictEqual(applied.inconclusive_by_status, { 403: 1, 429: 1, 503: 1, null: 1 });
  console.log("PASS: 404/410 recorded dead; 403/429/5xx/timeout only move link_checked_at");

  const late = await run({ rows: rs, now: NOW, fetchFn, deadlineMs: -1 });
  assert.strictEqual(late.checked, 0);
  assert.strictEqual(late.skipped_deadline > 0, true);
  console.log("PASS: deadline stops new checks");

  const urls = [];
  const orig = global.fetch;
  global.fetch = async (u, o) => { urls.push([u, o && o.method]); return { ok: true }; };
  process.env.SUPABASE_URL = "https://staging.example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  try {
    const { patchRow } = require("../api/cron-link-check");
    await patchRow({ row: { id: "id1" }, field: "ticket_url", url: "https://example.com/e/x?a=1&b=2" }, { link_checked_at: "t" });
  } finally { global.fetch = orig; }
  assert.ok(urls[0][0].includes("id=eq.id1&ticket_url=eq.https%3A%2F%2Fexample.com%2Fe%2Fx%3Fa%3D1%26b%3D2"), urls[0][0]);
  assert.strictEqual(urls[0][1], "PATCH");
  console.log("PASS: write is filtered on id and the checked URL");

  console.log("\nAll link-check-run.test.js checks passed.");
}
main().catch((e) => { console.error("FAIL:", e); process.exitCode = 1; });
