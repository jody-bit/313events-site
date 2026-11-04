// test/sh1-owner-markers-and-test-scope.test.js — #312 follow-up (Nov 4 owner direction):
//  1. owner/Editorial markers match regardless of surrounding whitespace, case, non-breaking/zero-width spaces and separator variants;
//  2. every automated fill carries a run id (generated when none is given), including the learned-tier note;
//  3. proposed fills carry the proposed VALUES, so a reviewer sees what would have been written;
//  4. the staging test scope narrows SH.1 to the named ids, and refuses production, a wrong host, a missing expected host and non-test ids.
// Run: node test/sh1-owner-markers-and-test-scope.test.js
"use strict";
const assert = require("assert");
const REPO = process.env.REPO_DIR || process.cwd();
const { PRODUCTION_SUPABASE_URL: PROD_URL, PRODUCTION_SUPABASE_HOST: PROD_HOST } = require(`${REPO}/api/_lib/environment.js`);
const URL_ = "https://example.supabase.co";
const fresh = () => { for (const m of ["scripts/sh1-repair-existing-venue-address-city.js", "api/_lib/venue-lookup.js"]) delete require.cache[require.resolve(`${REPO}/${m}`)]; return require(`${REPO}/scripts/sh1-repair-existing-venue-address-city.js`); };
const quiet = { log() {}, warn() {}, error() {} };
const base = { venue_id: "v1", venue_name_raw: "The Loft", venue_address_raw: null, venue_city_raw: null, start_date: "2026-12-01", status: "approved" };
const mockFetch = () => async (url) => {
  if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [{ id: "v1", name: "The Loft", address: "123 Main St", city: "Detroit" }] };
  if (url.includes("/rest/v1/events")) return { ok: true, status: 200, json: async () => [] };
  throw new Error("unmocked: " + url);
};

(async () => {
  // 1. marker normalization
  const { isOwnerSuppliedRow } = fresh();
  const owner = [
    { source: "Manual" }, { source: "manual" }, { source: "MANUAL" }, { source: " Manual " }, { source: " manual " }, { source: "Manual\n" },
    { source: "Ｍａｎｕａｌ" }, { source: "man​ual" },
    { source: "feed", internal_note: "OWNER-CORRECTION" }, { source: "feed", internal_note: "  owner-correction  " }, { source: "feed", internal_note: "Owner Correction 2026" },
    { source: "feed", internal_note: "owner_correction" }, { source: "feed", internal_note: "OWNERCORRECTION" }, { source: "feed", internal_note: "x\n\tEDITORIAL-HOLD\n" },
    { source: "feed", internal_note: "editorial_hold" }, { source: "feed", internal_note: "Editorial Hold" }, { source: "feed", internal_note: "EDITORIAL HOLD" }, { source: "feed", internal_note: "editorialhold" },
  ];
  for (const r of owner) assert.ok(isOwnerSuppliedRow(r), "must be protected: " + JSON.stringify(r));
  const feed = [{ source: "VisitDetroit" }, { source: "Manual Import Bot" }, { source: "" }, { source: null }, {}, { source: "feed", internal_note: "ordinary note about a hold on tickets" }, { source: "feed", internal_note: "correction of owner list" }, { source: "feed", internal_note: null }];
  for (const r of feed) assert.ok(!isOwnerSuppliedRow(r), "must NOT be protected: " + JSON.stringify(r));
  console.log("PASS: owner/Editorial markers are matched regardless of whitespace, case and separators; ordinary rows are not caught");

  // 2/3. run id, proposed values, protected variants are skipped end to end
  {
    const { repairExistingEvents } = fresh(); global.fetch = mockFetch();
    const patches = [];
    const rows = [
      { id: "p1", source: " MANUAL ", ...base }, { id: "p2", source: "feed", ...base, internal_note: "  editorial_hold " }, { id: "p3", source: "feed", ...base, internal_note: "Owner Correction" },
      { id: "e1", source: "feed", ...base },
    ];
    const counts = await repairExistingEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", logger: quiet, fetchCandidates: async () => rows, applyPatchFn: async (u, h, id, patch) => { patches.push({ id, patch }); return true; } });
    assert.deepStrictEqual(patches.map((p) => p.id), ["e1"], "only the unprotected feed row is patched");
    assert.strictEqual(counts.ownerRowSkipped, 3);
    assert.ok(/^sh1-\d{8}T\d{6}Z$/.test(counts.runId), "a run id is generated when none is given: " + counts.runId);
    assert.ok(patches[0].patch.internal_note.includes(`; run ${counts.runId}`), "the AUTO-FILL line names the run");
    assert.deepStrictEqual(counts.proposedFills.map((p) => p.id).sort(), ["p1", "p2", "p3"]);
    for (const p of counts.proposedFills) assert.deepStrictEqual(p.values, { venue_address_raw: "123 Main St", venue_city_raw: "Detroit" }, "proposed values are listed");
    const given = await repairExistingEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", logger: quiet, runId: "uuid-from-source-runs", fetchCandidates: async () => rows.slice(3), applyPatchFn: async () => true });
    assert.strictEqual(given.runId, "uuid-from-source-runs", "a supplied run id is kept");
  }
  console.log("PASS: variants are skipped end to end, every fill names its run, proposed fills carry their values");

  // 4a. onlyIds
  {
    const { repairExistingEvents } = fresh(); global.fetch = mockFetch();
    const patches = [];
    const rows = [{ id: "a3120000-0000-4000-8000-000000000006", source: "feed", ...base }, { id: "real-1", source: "feed", ...base }, { id: "real-2", source: "VisitDetroit", ...base }];
    const counts = await repairExistingEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", logger: quiet, onlyIds: ["a3120000-0000-4000-8000-000000000006"], fetchCandidates: async () => rows, applyPatchFn: async (u, h, id) => { patches.push(id); return true; } });
    assert.deepStrictEqual(patches, ["a3120000-0000-4000-8000-000000000006"]);
    assert.strictEqual(counts.totalConsidered, 1, "rows outside the scope are not considered at all");
    const all = await repairExistingEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", logger: quiet, fetchCandidates: async () => rows, applyPatchFn: async () => true });
    assert.strictEqual(all.totalConsidered, 3, "without onlyIds (production) every candidate is considered, unchanged");
    const none = await repairExistingEvents({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "k", logger: quiet, onlyIds: [], fetchCandidates: async () => rows, applyPatchFn: async () => { throw new Error("must not write"); } });
    assert.strictEqual(none.totalConsidered, 0, "an empty scope considers nothing");
  }
  console.log("PASS: onlyIds restricts the run to the named events; absent, behavior is unchanged");

  // 4b. resolveTestScope
  {
    const { resolveTestScope } = require(`${REPO}/scripts/enrichment-test-scope.js`);
    const ID = "a3120000-0000-4000-8000-000000000001", ST = "stg1234567890.supabase.co";
    const ok = { VERCEL_ENV: "preview", SUPABASE_URL: `https://${ST}`, ENRICHMENT_TEST_ONLY_EVENT_IDS: ID, ENRICHMENT_TEST_EXPECT_SUPABASE_HOST: ST };
    assert.deepStrictEqual(resolveTestScope({}, "https://x.supabase.co"), { active: false });
    assert.deepStrictEqual(resolveTestScope({ ENRICHMENT_TEST_ONLY_EVENT_IDS: "  " }, "https://x"), { active: false });
    assert.deepStrictEqual(resolveTestScope(ok, ok.SUPABASE_URL), { active: true, ids: [ID], host: ST });
    const refuses = (env, url, why) => assert.throws(() => resolveTestScope(env, url), /enrichment test scope refused/, why);
    refuses({ ...ok, VERCEL_ENV: "production" }, ok.SUPABASE_URL, "production");
    refuses({ ...ok, VERCEL_ENV: undefined, APP_ENV: "production" }, ok.SUPABASE_URL, "APP_ENV production");
    refuses(ok, PROD_URL, "production database host");
    refuses({ ...ok, ENRICHMENT_TEST_EXPECT_SUPABASE_HOST: PROD_HOST }, PROD_URL, "expected host cannot be production");
    refuses({ ...ok, ENRICHMENT_TEST_EXPECT_SUPABASE_HOST: undefined }, ok.SUPABASE_URL, "missing expected host");
    refuses({ ...ok, ENRICHMENT_TEST_EXPECT_SUPABASE_HOST: "other.supabase.co" }, ok.SUPABASE_URL, "host mismatch");
    refuses(ok, "", "no url");
    refuses({ ...ok, ENRICHMENT_TEST_ONLY_EVENT_IDS: "b3120000-0000-4000-8000-000000000001" }, ok.SUPABASE_URL, "not a test id");
    refuses({ ...ok, ENRICHMENT_TEST_ONLY_EVENT_IDS: "00000000-0000-4000-8000-000000000001" }, ok.SUPABASE_URL, "real-looking id");
    refuses({ ...ok, ENRICHMENT_TEST_ONLY_EVENT_IDS: `${ID},${ID}` }, ok.SUPABASE_URL, "duplicate");
    refuses({ ...ok, ENRICHMENT_TEST_ONLY_EVENT_IDS: Array.from({ length: 10 }, (_, i) => `a3120000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`).join(",") }, ok.SUPABASE_URL, "more than nine");
  }
  console.log("PASS: test scope is inactive by default and refuses production, wrong or missing host, and non-test ids");
})().catch((e) => { console.error(e); process.exit(1); });
