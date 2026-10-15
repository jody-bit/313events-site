// test/link-integrity-merge.test.js -- event-specific ticket/info links are
// never degraded by a later fill-only write (P0 "Restricted", 2026-10-15).
// Run: node test/link-integrity-merge.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { decideLinkMerge } = require(path.join(REPO_DIR, "api/_lib/ra-links"));

const HOME = "https://russellindustrialcenter.com/";
const SPECIFIC = "https://www.prekindle.com/event/restricted";
const OTHER = "https://tickets.example.com/restricted-2026";

// 1. A generic stored URL is replaced by a specific one.
assert.deepStrictEqual(decideLinkMerge(HOME, SPECIFIC), { action: "replace_generic" });
assert.deepStrictEqual(decideLinkMerge("https://paxahau.com", SPECIFIC), { action: "replace_generic" });
// 2. A specific stored URL is never replaced by a generic one.
assert.strictEqual(decideLinkMerge(SPECIFIC, HOME).action, "keep");
assert.strictEqual(decideLinkMerge(SPECIFIC, "https://russellindustrialcenter.com").action, "keep");
// 3. A missing incoming value never erases an existing one.
for (const missing of [null, undefined, "", "   "]) {
  assert.strictEqual(decideLinkMerge(SPECIFIC, missing).action, "keep");
  assert.strictEqual(decideLinkMerge(HOME, missing).action, "keep");
}
// 4. Conflicting specific URLs are flagged, stored one kept (action is not a replace).
assert.deepStrictEqual(decideLinkMerge(SPECIFIC, OTHER), { action: "flag" });
// Same URL (trailing slash/case) is not a conflict.
assert.strictEqual(decideLinkMerge(SPECIFIC, SPECIFIC + "/").action, "keep");
// Blank stored is filled; generic incoming never fills.
assert.strictEqual(decideLinkMerge(null, SPECIFIC).action, "fill");
assert.strictEqual(decideLinkMerge(null, HOME).action, "keep");
console.log("PASS: decideLinkMerge rules");

// Generic enrichment only ever writes event_url when BOTH links are blank.
const gen = fs.readFileSync(path.join(REPO_DIR, "scripts/generic-metadata-enrichment.js"), "utf8");
assert.ok(/if \(isBlank\(event\.ticket_url\) && isBlank\(event\.event_url\)\)/.test(gen),
  "digital-home fallback must stay gated on both links blank");
console.log("PASS: generic enrichment link write stays gated on both links blank");

(async () => {
  const raSync = require(path.join(REPO_DIR, "scripts/ra-sync.js"));
  const SUPABASE_URL = "https://example.supabase.co";
  const KEY = "k";
  const run = {
    id: "run-1", source_slug: "resident-advisor", outcome: "started",
    started_at: new Date().toISOString(),
    session_data: { phase: "started", newIds: ["ra-300"], candidateCount: 1, knownCount: 0, allNewCount: 1 },
  };
  async function runMerge(storedTicket, raw) {
    const calls = [];
    const fetchFn = async (url, opts) => {
      const method = (opts && opts.method) || "GET";
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      calls.push({ url, method, body });
      if (url.includes("/source_runs?id=eq.")) {
        return method === "PATCH" ? { ok: true, text: async () => "" } : { ok: true, json: async () => [run] };
      }
      if (url.includes("/rest/v1/events?start_date=gte.")) return { ok: true, json: async () => [] };
      if (url.includes("/rest/v1/events?external_id=eq.") && method === "PATCH") return { ok: true, json: async () => [body] };
      throw new Error("unexpected fetch: " + url);
    };
    const result = await raSync.completeRaSyncSession({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, runId: "run-1",
      events: [{ id: "ra-300", title: "Restricted", startDate: "2026-10-16T22:00:00-04:00", ...raw }],
      fetchFn, finishRunFn: async () => {},
      buildVenueNameToIdMapFn: async () => new Map(),
      lookupExistingRowsFn: async () => new Map([["ra-300", {
        external_id: "ra-300", status: "approved", description: "x", venue_id: "v", venue_name_raw: "V",
        venue_address_raw: "a", venue_city_raw: "Detroit", ticket_url: storedTicket, event_url: "https://ra.co/events/300",
        image_url: "i", end_date: "2026-10-17", time_display: "10 PM", is_free: false, price_from: 20,
      }]]),
    });
    return { result, patch: calls.find((c) => c.method === "PATCH" && c.url.includes("external_id=eq.ra-300")) };
  }

  // generic stored -> replaced by specific incoming, guarded by an eq filter on the old value
  let r = await runMerge(HOME, { ticketUrl: SPECIFIC });
  assert.strictEqual(r.patch.body.ticket_url, SPECIFIC);
  assert.ok(r.patch.url.includes("ticket_url.eq.") && !r.patch.url.includes("ticket_url.is.null"), "race guard on the old generic value");
  // specific stored + no incoming -> untouched
  r = await runMerge(SPECIFIC, {});
  assert.strictEqual(r.patch.body.ticket_url, undefined);
  // specific stored + generic incoming (never derived, but must be inert)
  r = await runMerge(SPECIFIC, { ticketUrl: HOME });
  assert.strictEqual(r.patch.body.ticket_url, undefined);
  // generic stored + missing incoming -> untouched (nothing erased)
  r = await runMerge(HOME, {});
  assert.strictEqual(r.patch.body.ticket_url, undefined);
  // conflict -> stored kept, flagged in result
  r = await runMerge(SPECIFIC, { ticketUrl: OTHER });
  assert.strictEqual(r.patch.body.ticket_url, undefined);
  assert.strictEqual(r.result.linkConflicts.length, 1);
  assert.strictEqual(r.result.linkConflicts[0].stored, SPECIFIC);
  assert.strictEqual(r.result.linkConflicts[0].incoming, OTHER);
  console.log("PASS: completeRaSyncSession ticket_url merge (replace generic, keep specific, never erase, flag conflict)");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
