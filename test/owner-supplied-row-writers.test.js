// test/owner-supplied-row-writers.test.js — every automated enrichment/repair writer leaves an owner-supplied row alone.
// Owner-supplied = a private note carrying OWNER-CORRECTION or EDITORIAL-HOLD (Manual-source handling is a pending owner decision for
// generic-metadata-enrichment and duplicate-consolidation; the source-specific repairs and the re-parse treat Manual as owner-supplied too).
// Each writer gets a control row (proves it WOULD write) and a protected row (must not be touched).
// Run: node test/owner-supplied-row-writers.test.js
"use strict";
const assert = require("assert");
const REPO = process.env.REPO_DIR || process.cwd();
const { isOwnerSuppliedRow } = require(`${REPO}/api/_lib/owner-supplied-row`);
const silent = { log() {}, warn() {}, error() {} };
const URL_ = "https://example.supabase.co", KEY = "k";
const HOLD = "EDITORIAL-HOLD 2026-11-04 owner: leave blank on purpose";
const CORR = 'OWNER-CORRECTION 2026-11-04 jody fields=description | description: "" -> ""';

(async () => {
  // helper rule
  assert.ok(isOwnerSuppliedRow({ internal_note: "x " + HOLD }));
  assert.ok(isOwnerSuppliedRow({ internal_note: CORR }));
  assert.ok(isOwnerSuppliedRow({ source: "Manual" }));
  assert.ok(!isOwnerSuppliedRow({ source: "Manual" }, { includeManualSource: false }));
  assert.ok(isOwnerSuppliedRow({ source: "Manual", internal_note: HOLD }, { includeManualSource: false }));
  assert.ok(!isOwnerSuppliedRow({ source: "Dossin", internal_note: "ordinary note" }) && !isOwnerSuppliedRow(null));

  // Dossin
  {
    const patched = [];
    const c = await require(`${REPO}/scripts/dossin-metadata-repair.js`).repairDossinMetadata({
      SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, logger: silent,
      fetchCandidates: async () => [
        { id: "ctl", external_id: "a", ticket_url: null, event_url: null, source: "Dossin", internal_note: null },
        { id: "hold", external_id: "b", ticket_url: null, event_url: null, source: "Dossin", internal_note: HOLD },
        { id: "corr", external_id: "c", ticket_url: null, event_url: null, source: "Dossin", internal_note: CORR },
      ],
      fetchEventUrls: async () => ({ map: new Map([["a", "https://x/a"], ["b", "https://x/b"], ["c", "https://x/c"]]), genericLinksSkipped: 0 }),
      applyPatchFn: async (u, h, id) => { patched.push(id); return true; },
    });
    assert.deepStrictEqual(patched, ["ctl"]); assert.strictEqual(c.skippedOwnerSupplied, 2);
  }
  // Redford
  {
    const patched = [];
    const base = { description: null, ticket_url: null, event_url: null, source: "Redford Theatre" };
    const c = await require(`${REPO}/scripts/redford-metadata-repair.js`).repairRedfordMetadata({
      SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, logger: silent,
      fetchCandidates: async () => [{ ...base, id: "ctl", external_id: "a" }, { ...base, id: "hold", external_id: "b", internal_note: HOLD }],
      fetchArchivePage: async () => ({ eventUrlsByExternalId: new Map([["a", "https://x/a"], ["b", "https://x/b"]]) }),
      fetchDetail: async () => ({ description: "A real description", ticket_url: null }),
      applyPatchFn: async (u, h, id) => { patched.push(id); return true; },
    });
    assert.deepStrictEqual(patched, ["ctl"]); assert.strictEqual(c.skippedOwnerSupplied, 1);
  }
  // Outer Limits
  {
    const patched = [];
    const c = await require(`${REPO}/scripts/outerlimits-description-repair.js`).repairOuterLimitsDescriptions({
      SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, logger: silent,
      fetchCandidates: async () => [
        { id: "ctl", external_id: "a", description: null, source: "Outer Limits Lounge" },
        { id: "corr", external_id: "b", description: null, source: "Outer Limits Lounge", internal_note: CORR },
      ],
      fetchDescriptions: async () => new Map([["a", "Doors at nine."], ["b", "Doors at nine."]]),
      applyPatchFn: async (u, h, id) => { patched.push(id); return true; },
    });
    assert.deepStrictEqual(patched, ["ctl"]); assert.strictEqual(c.skippedOwnerSupplied, 1);
  }
  // Venue raw re-parse
  {
    const patched = [];
    const raw = "Majestic Theatre, 4140 Woodward Ave, Detroit, MI 48201";
    const mk = (id, extra) => ({ id, venue_id: null, venue_name_raw: raw, venue_address_raw: null, venue_city_raw: null, source: "Some Feed", ...extra });
    const c = await require(`${REPO}/scripts/venue-raw-reparse-repair.js`).repairVenueRawReparse({
      SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, logger: silent,
      buildCanonicalMaps: async () => ({}),
      fetchCandidates: async () => [mk("ctl"), mk("hold", { internal_note: HOLD }), mk("man", { source: "Manual" })],
      applyPatchFn: async (u, h, id) => { patched.push(id); return true; },
    });
    assert.deepStrictEqual(patched, ["ctl"], JSON.stringify(c)); assert.strictEqual(c.skippedOwnerSupplied, 2);
  }
  // Generic metadata enrichment (marker rows protected; Manual-source rows are an owner decision, see header)
  {
    const patches = [];
    const base = { category: "nightlife", start_date: "2099-10-20", time_display: "9:00 PM", is_all_day: false, venue_id: null, venue_name_raw: "Some Venue",
      venue_address_raw: null, venue_city_raw: null, ticket_url: null, event_url: "https://example.com/e", source: "Some Feed", description: null };
    const cands = [{ ...base, id: "ctl", title: "Control Night" }, { ...base, id: "hold", title: "Held Night", internal_note: HOLD }, { ...base, id: "corr", title: "Corrected Night", internal_note: CORR }];
    global.fetch = async (url, opts = {}) => {
      const method = opts.method || "GET";
      if (url.includes("/rest/v1/venues") && method === "GET") return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/events") && method === "GET") return { ok: true, status: 200, json: async () => cands, headers: { get: () => null } };
      if (url.includes("/rest/v1/events") && method === "PATCH") {
        patches.push(decodeURIComponent((url.match(/id=eq\.([^&]+)/) || [])[1] || ""));
        return { ok: true, status: 200, json: async () => [{ id: "x" }] };
      }
      throw new Error("unmocked URL: " + url);
    };
    const c = await require(`${REPO}/scripts/generic-metadata-enrichment.js`).repairGenericMetadata({
      SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, logger: silent, isExternalDiscoveryConfiguredFn: () => false });
    assert.ok(patches.includes("ctl"), "control row is enriched: " + JSON.stringify(patches));
    assert.ok(!patches.includes("hold") && !patches.includes("corr"), "protected rows are not patched: " + JSON.stringify(patches));
    assert.strictEqual(c.skippedOwnerSupplied, 2);
  }
  // Duplicate consolidation: a pair that would merge by rule goes to review when either row is protected
  {
    const { planConsolidation } = require(`${REPO}/scripts/duplicate-consolidation.js`);
    let n = 0;
    const row = (o) => ({ id: `e${++n}`, status: "approved", created_at: `2026-09-${10 + n}T00:00:00Z`, venue_id: "v-dsc", description: null, image_url: null, ticket_url: null, event_url: null, venue_address_raw: null, internal_note: null, is_free: null, price_from: null, end_date: null, ...o });
    const ra = { title: "Grave Rave", start_date: "2026-10-31", time_display: "Evening", source: "Resident Advisor", external_id: null, venue_name_raw: "Venue TBA (Detroit)", venue_city_raw: "Detroit" };
    const vd = { title: "Grave Rave", start_date: "2026-10-31", time_display: "10:00 PM", source: "VisitDetroit", external_id: "vd-50187643", venue_name_raw: "Detroit Shipping Company", venue_city_raw: "Detroit" };
    assert.strictEqual(planConsolidation([row(ra), row(vd)]).merges.length, 1, "control pair merges by rule");
    for (const note of [HOLD, CORR]) {
      for (const protectedSide of [0, 1]) {
        const rows = [row(ra), row(vd)]; rows[protectedSide].internal_note = note;
        const p = planConsolidation(rows);
        assert.strictEqual(p.merges.length, 0); assert.deepStrictEqual(p.reviews.map((r) => r.reason), ["owner_supplied_row"]);
      }
    }
  }
  console.log("PASS: every enrichment/repair writer and the duplicate consolidator leave owner-supplied rows untouched");
})().catch((e) => { console.error(e); process.exit(1); });
