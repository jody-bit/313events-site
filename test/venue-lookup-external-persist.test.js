// test/venue-lookup-external-persist.test.js — api/_lib/venue-lookup.js's
// 2026-09-23 additions: upsertVenueKnowledge and mergeVenueIntoMaps, the
// write path for "KNOWLEDGE MUST COMPOUND... stored ONCE and automatically
// benefit every existing and future <venue> event."
//
// Plain Node assert, no dependencies. Never a real network call.
// Run: node test/venue-lookup-external-persist.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "test-key";

function freshLib() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/_lib/venue-lookup.js`);
}

async function run() {
  const { upsertVenueKnowledge, mergeVenueIntoMaps, buildVenueDetailsMap } = freshLib();

  // --- 1. No existing canonical row -> creates a new one, using the
  //     discovery's own city (or the schema default 'Detroit' only when
  //     genuinely unresolved). ---
  {
    const calls = [];
    const fetchFn = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || "GET" });
      if (url.includes("/rest/v1/venues") && (!opts.method || opts.method === "GET")) {
        return { ok: true, status: 200, json: async () => [] }; // no existing row
      }
      if (url.includes("/rest/v1/venues") && opts.method === "POST") {
        const body = JSON.parse(opts.body);
        return { ok: true, status: 201, json: async () => [{ id: "new-venue-id", ...body }] };
      }
      throw new Error("unmocked URL: " + url);
    };
    const result = await upsertVenueKnowledge(SUPABASE_URL, SUPABASE_KEY, {
      name: "Garden Bowl", website: "https://majesticdetroit.com", address: "4140 Woodward Ave", city: "Detroit", sourceUrl: "https://majesticdetroit.com/garden-bowl",
    }, fetchFn);
    assert.deepStrictEqual(result, { id: "new-venue-id", name: "Garden Bowl", address: "4140 Woodward Ave", city: "Detroit", website: "https://majesticdetroit.com", facebook_url: null });
    const postCall = calls.find((c) => c.method === "POST");
    assert.ok(postCall, "a new venue row must be created when none exists");
  }
  console.log("PASS: upsertVenueKnowledge creates a new canonical venue row when none exists yet");

  // --- 2. Existing canonical row with blank fields -> only the blank
  //     fields are filled in, via PATCH. ---
  {
    const patchBodies = [];
    const fetchFn = async (url, opts = {}) => {
      if (url.includes("/rest/v1/venues") && (!opts.method || opts.method === "GET")) {
        return { ok: true, status: 200, json: async () => [{ id: "existing-id", name: "Garden Bowl", address: null, city: null, website: null, facebook_url: null }] };
      }
      if (url.includes("/rest/v1/venues") && opts.method === "PATCH") {
        const body = JSON.parse(opts.body);
        patchBodies.push(body);
        return { ok: true, status: 200, json: async () => [{ id: "existing-id", name: "Garden Bowl", ...body }] };
      }
      throw new Error("unmocked URL: " + url);
    };
    const result = await upsertVenueKnowledge(SUPABASE_URL, SUPABASE_KEY, {
      name: "Garden Bowl", website: "https://majesticdetroit.com", address: "4140 Woodward Ave", city: "Detroit",
    }, fetchFn);
    assert.strictEqual(patchBodies.length, 1);
    assert.deepStrictEqual(patchBodies[0], { address: "4140 Woodward Ave", city: "Detroit", website: "https://majesticdetroit.com" });
    assert.strictEqual(result.id, "existing-id");
  }
  console.log("PASS: upsertVenueKnowledge fills in only the blank fields of an existing canonical row");

  // --- 3. Existing canonical row with fields ALREADY populated -> never
  //     overwritten, no PATCH even attempted. ---
  {
    let patchCalled = false;
    const fetchFn = async (url, opts = {}) => {
      if (url.includes("/rest/v1/venues") && (!opts.method || opts.method === "GET")) {
        return { ok: true, status: 200, json: async () => [{ id: "existing-id", name: "Garden Bowl", address: "A Different Confirmed Address", city: "Detroit", website: "https://a-human-confirmed-this.example.com", facebook_url: null }] };
      }
      if (opts.method === "PATCH") { patchCalled = true; return { ok: true, status: 200, json: async () => [] }; }
      throw new Error("unmocked URL: " + url);
    };
    const result = await upsertVenueKnowledge(SUPABASE_URL, SUPABASE_KEY, {
      name: "Garden Bowl", website: "https://majesticdetroit.com", address: "4140 Woodward Ave", city: "Detroit",
    }, fetchFn);
    assert.strictEqual(patchCalled, false, "a canonical row with every field already populated must never be PATCHed");
    assert.strictEqual(result.address, "A Different Confirmed Address", "an existing, already-populated field must never be overwritten by external discovery");
    assert.strictEqual(result.website, "https://a-human-confirmed-this.example.com");
  }
  console.log("PASS: upsertVenueKnowledge never overwrites an already-populated field on an existing venue");

  // --- 4. Fails soft to null on a network/HTTP problem, never throws. ---
  {
    const failFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const result = await upsertVenueKnowledge(SUPABASE_URL, SUPABASE_KEY, { name: "Garden Bowl" }, failFetch);
    assert.strictEqual(result, null);

    const throwFetch = async () => { throw new Error("network down"); };
    const result2 = await upsertVenueKnowledge(SUPABASE_URL, SUPABASE_KEY, { name: "Garden Bowl" }, throwFetch);
    assert.strictEqual(result2, null);
  }
  console.log("PASS: upsertVenueKnowledge fails soft to null on any network/HTTP problem, never throws");

  // --- 5. Missing required arguments -> null, no call attempted. ---
  {
    let called = false;
    const fetchFn = async () => { called = true; return { ok: true, json: async () => [] }; };
    assert.strictEqual(await upsertVenueKnowledge(null, SUPABASE_KEY, { name: "X" }, fetchFn), null);
    assert.strictEqual(await upsertVenueKnowledge(SUPABASE_URL, SUPABASE_KEY, null, fetchFn), null);
    assert.strictEqual(await upsertVenueKnowledge(SUPABASE_URL, SUPABASE_KEY, {}, fetchFn), null);
    assert.strictEqual(called, false);
  }
  console.log("PASS: upsertVenueKnowledge makes no call at all when required arguments are missing");

  // --- 6. mergeVenueIntoMaps: folds a freshly-persisted venue into all
  //     three canonicalMaps so the SAME pass can revalidate against it. ---
  {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
    const canonicalMaps = await buildVenueDetailsMap(SUPABASE_URL, SUPABASE_KEY); // empty maps
    mergeVenueIntoMaps(canonicalMaps, { id: "new-id", name: "Garden Bowl", address: "4140 Woodward Ave", city: "Detroit", website: "https://majesticdetroit.com", facebook_url: null });
    assert.strictEqual(canonicalMaps.byId.get("new-id").name, "Garden Bowl");
    assert.strictEqual(canonicalMaps.byName.get("garden bowl").id, "new-id");
    assert.strictEqual(canonicalMaps.byAddress.get("4140 woodward ave|detroit").id, "new-id");
  }
  console.log("PASS: mergeVenueIntoMaps folds a freshly-persisted venue into byId/byName/byAddress for same-pass revalidation");

  // --- 7. mergeVenueIntoMaps: never overwrites an existing map entry. ---
  {
    const canonicalMaps = { byId: new Map([["id-1", { id: "id-1", name: "Original" }]]), byName: new Map([["original", { id: "id-1", name: "Original" }]]), byAddress: new Map() };
    mergeVenueIntoMaps(canonicalMaps, { id: "id-1", name: "Renamed Somehow", address: null, city: null, website: null, facebook_url: null });
    assert.strictEqual(canonicalMaps.byId.get("id-1").name, "Original", "an existing map entry must never be overwritten by a merge");
  }
  console.log("PASS: mergeVenueIntoMaps never overwrites an existing map entry");

  console.log("\nAll venue-lookup.js external-persistence tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
