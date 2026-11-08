// test/cron-halo-venue-website-writer.test.js: the held HALO venue-website writer (fillVenueWebsite), local mock only.
// Pins: approved-only, owner/EDITORIAL-HOLD/Manual protection, blank/empty/whitespace link guard, ticket link kept,
// optimistic preimage filter (concurrent edit), source scoping, failure status. No network, no cron.
// Run: node test/cron-halo-venue-website-writer.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.CRON_SECRET = "x";
const { fillVenueWebsite, HALO_WEBSITE_URL } = require(`${REPO_DIR}/api/cron-halo.js`);

const V1 = "2026-11-01T00:00:00+00:00";
const mk = (id, extra) => ({ id, external_id: "slug-" + id, source: "HALO Detroit", status: "approved", event_url: null, ticket_url: null, internal_note: null, updated_at: V1, ...extra });

// Tiny PostgREST stand-in for exactly the filters the writer uses: eq., is.null, in.(...), select.
function makeDb(rows, opts = {}) {
  const log = [];
  const match = (row, params) => {
    for (const [k, v] of params) {
      if (k === "select" || k === "limit") continue;
      if (k === "external_id" && v.startsWith("in.(")) { if (!v.slice(4, -1).split(",").includes(row.external_id)) return false; continue; }
      if (v === "is.null") { if (row[k] !== null && row[k] !== undefined) return false; continue; }
      if (v.startsWith("eq.")) { const want = v.slice(3); if (String(row[k] === null || row[k] === undefined ? "\u0000null" : row[k]) !== want) return false; continue; }
      throw new Error("unsupported filter " + k + "=" + v);
    }
    return true;
  };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method || "GET";
    log.push({ method, url: String(url) });
    if (opts.failRead && method === "GET") return { ok: false, status: 500, json: async () => ({}) };
    if (opts.failPatch && method === "PATCH") return { ok: false, status: 500, json: async () => ({}) };
    const params = [...u.searchParams.entries()];
    const hit = rows.filter((r) => match(r, params));
    if (method === "GET") return { ok: true, status: 200, json: async () => hit.map((r) => ({ ...r })) };
    if (opts.onBeforePatch) opts.onBeforePatch(rows);
    const again = rows.filter((r) => match(r, params));
    const body = JSON.parse(init.body);
    for (const r of again) Object.assign(r, body);
    return { ok: true, status: 200, json: async () => again.map((r) => ({ ...r })) };
  };
  return { log, fetchImpl };
}
const run = async (rows, ids, opts) => {
  const db = makeDb(rows, opts);
  global.fetch = db.fetchImpl;
  const stats = await fillVenueWebsite("https://example.supabase.co", "test-key", ids || rows.map((r) => r.external_id));
  return { stats, db, rows };
};

(async () => {
  // 1. valid fill: approved door event, empty link -> HALO page, event_url only, ticket_url untouched
  {
    const rows = [mk("a")];
    const { stats, db } = await run(rows);
    assert.strictEqual(rows[0].event_url, HALO_WEBSITE_URL);
    assert.strictEqual(rows[0].ticket_url, null);
    assert.strictEqual(stats.filled, 1);
    const patch = db.log.find((l) => l.method === "PATCH");
    assert.ok(patch.url.includes("status=eq.approved") && patch.url.includes("source=eq.HALO%20Detroit") && patch.url.includes("updated_at=eq."), "conditional PATCH: " + patch.url);
  }
  console.log("PASS: valid door event gets the venue website, conditional PATCH");

  // 2. empty-string and whitespace-only links count as blank and are filled (exact preimage in the filter)
  {
    const rows = [mk("b", { event_url: "" }), mk("c", { event_url: "   " })];
    const { stats } = await run(rows);
    assert.deepStrictEqual(rows.map((r) => r.event_url), [HALO_WEBSITE_URL, HALO_WEBSITE_URL]);
    assert.strictEqual(stats.filled, 2);
  }
  console.log("PASS: NULL, empty and whitespace links are filled");

  // 3. a real stored link of either kind is never replaced
  {
    const rows = [mk("d", { event_url: "https://halo.example/e/1" }), mk("e", { ticket_url: "https://tix.example/1" })];
    const { stats, db } = await run(rows);
    assert.strictEqual(rows[0].event_url, "https://halo.example/e/1");
    assert.strictEqual(rows[1].event_url, null);
    assert.strictEqual(stats.skippedHasLink, 2);
    assert.ok(!db.log.some((l) => l.method === "PATCH"), "no write");
  }
  console.log("PASS: a stored event or ticket link is kept");

  // 4. protected rows: OWNER-CORRECTION, EDITORIAL-HOLD spellings, Manual source
  {
    const notes = ["OWNER-CORRECTION 2026-11-01T00:00:00Z e-1 fields=title | {}", "EDITORIAL-HOLD", "editorial_hold", "EDITORIAL HOLD"];
    const rows = notes.map((n, i) => mk("p" + i, { internal_note: n }));
    rows.push(mk("pm", { source: "Manual" }));
    const { stats, db } = await run(rows, rows.map((r) => r.external_id));
    assert.ok(rows.every((r) => r.event_url === null), "no protected row changed");
    assert.ok(!db.log.some((l) => l.method === "PATCH"));
    assert.strictEqual(stats.skippedProtected + 0, 4, "four marker rows protected (the Manual row is outside the HALO source scope)");
  }
  console.log("PASS: owner, EDITORIAL-HOLD and Manual rows are never touched");

  // 5. pending_review and rejected rows are not eligible
  {
    const rows = [mk("q", { status: "pending_review" }), mk("r", { status: "rejected" })];
    const { stats } = await run(rows);
    assert.ok(rows.every((r) => r.event_url === null));
    assert.strictEqual(stats.skippedNotApproved, 2);
  }
  console.log("PASS: pending and rejected rows are not written");

  // 6. concurrent edit between read and write: the PATCH matches nothing, counted as a conflict
  {
    const rows = [mk("s")];
    const { stats } = await run(rows, null, { onBeforePatch: (rs) => { rs[0].event_url = "https://person.example/typed"; rs[0].updated_at = "2026-11-08T22:00:00+00:00"; } });
    assert.strictEqual(rows[0].event_url, "https://person.example/typed", "the concurrent edit survives");
    assert.strictEqual(stats.conflicts, 1);
    assert.strictEqual(stats.filled, 0);
  }
  console.log("PASS: an edit made after the read is not overwritten (conflict counted)");

  // 7. source-scoped batch: a non-HALO row with a matching external_id is never read or written
  {
    const rows = [mk("t"), mk("u", { source: "Some Other Source", external_id: "slug-t" })];
    rows[1].external_id = "slug-t";
    const { stats } = await run(rows, ["slug-t"]);
    assert.strictEqual(rows[0].event_url, HALO_WEBSITE_URL);
    assert.strictEqual(rows[1].event_url, null, "other source untouched");
    assert.strictEqual(stats.filled, 1);
  }
  console.log("PASS: batch is scoped to source=HALO Detroit");

  // 8. null updated_at is guarded as updated_at=is.null (never unguarded)
  {
    const rows = [mk("v", { updated_at: null })];
    const { stats, db } = await run(rows);
    assert.strictEqual(stats.filled, 1);
    assert.ok(db.log.find((l) => l.method === "PATCH").url.includes("updated_at=is.null"));
  }
  console.log("PASS: a row with no updated_at is still guarded");

  // 9. failure status: a failed read throws (caller reports non-fatal); a failed PATCH is counted, not thrown
  {
    global.fetch = makeDb([mk("w")], { failRead: true }).fetchImpl;
    await assert.rejects(() => fillVenueWebsite("https://example.supabase.co", "k", ["slug-w"]), /read HTTP 500/);
    const rows = [mk("x")];
    const { stats } = await run(rows, null, { failPatch: true });
    assert.strictEqual(stats.failed, 1);
    assert.strictEqual(rows[0].event_url, null);
  }
  console.log("PASS: read failure throws, write failure is counted, nothing is written");
  console.log("cron-halo-venue-website-writer: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
