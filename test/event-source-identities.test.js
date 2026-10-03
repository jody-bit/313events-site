// test/event-source-identities.test.js — api/_lib/event-source-identities.js
//
// General-purpose cross-source identity crosswalk (see
// supabase/migration_045_event_source_identities.sql). Plain Node assert,
// no dependencies, matching this repo's existing style (see
// test/status-lookup.test.js).
// Run: node test/event-source-identities.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshLib() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/event-source-identities.js`)];
  return require(`${REPO_DIR}/api/_lib/event-source-identities.js`);
}

const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "test-key";

async function run() {
  const lib = freshLib();

  // ============================================================
  // lookupKnownSourceIds
  // ============================================================

  // 1. happy path -- only the ids that actually have a row come back,
  //    and the request is scoped to the right source + bare ids.
  {
    let capturedUrl = null;
    const fetchFn = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => [{ source_id: "2547930" }, { source_id: "2512641" }] };
    };
    const known = await lib.lookupKnownSourceIds(SUPABASE_URL, SUPABASE_KEY, "ra", ["2547930", "2512641", "2524562"], { fetchFn });
    assert.deepStrictEqual([...known].sort(), ["2512641", "2547930"]);
    assert.ok(capturedUrl.includes("event_source_identities"));
    assert.ok(capturedUrl.includes("source=eq.ra"));
    assert.ok(!capturedUrl.includes("ra-2547930"), "source_id must be queried bare, never re-prefixed with 'ra-'");
  }
  console.log("PASS: lookupKnownSourceIds -- returns exactly the ids with a matching row, scoped by source, bare ids");

  // 2. empty input -- no network call at all.
  {
    let called = false;
    const fetchFn = async () => { called = true; return { ok: true, json: async () => [] }; };
    const known = await lib.lookupKnownSourceIds(SUPABASE_URL, SUPABASE_KEY, "ra", [], { fetchFn });
    assert.strictEqual(known.size, 0);
    assert.strictEqual(called, false);
  }
  console.log("PASS: lookupKnownSourceIds -- empty id list short-circuits, no network call");

  // 3. chunking -- more than MAX_IDS_PER_CHUNK ids split across multiple requests, all combined.
  {
    const calls = [];
    const fetchFn = async (url) => {
      calls.push(url);
      const m = /source_id=in\.\(([^)]*)\)/.exec(url);
      const requested = m ? m[1].split(",").map((s) => s.replace(/"/g, "")) : [];
      // every third id "matches"
      const rows = requested.filter((id) => Number(id) % 3 === 0).map((id) => ({ source_id: id }));
      return { ok: true, json: async () => rows };
    };
    const ids = Array.from({ length: 250 }, (_, i) => String(i));
    const known = await lib.lookupKnownSourceIds(SUPABASE_URL, SUPABASE_KEY, "ra", ids, { fetchFn });
    assert.ok(calls.length >= 3, "250 ids at 100/chunk must issue at least 3 requests");
    assert.strictEqual(known.size, ids.filter((id) => Number(id) % 3 === 0).length);
  }
  console.log("PASS: lookupKnownSourceIds -- chunks large id lists, combines results from every chunk");

  // 4. fails soft on network error, non-OK response, and malformed body --
  //    never throws, always an empty-or-partial Set, same posture for all three.
  {
    const known1 = await lib.lookupKnownSourceIds(SUPABASE_URL, SUPABASE_KEY, "ra", ["1"], {
      fetchFn: async () => { throw new Error("network down"); },
    });
    assert.strictEqual(known1.size, 0);

    const known2 = await lib.lookupKnownSourceIds(SUPABASE_URL, SUPABASE_KEY, "ra", ["1"], {
      fetchFn: async () => ({ ok: false, status: 500 }),
    });
    assert.strictEqual(known2.size, 0);

    const known3 = await lib.lookupKnownSourceIds(SUPABASE_URL, SUPABASE_KEY, "ra", ["1"], {
      fetchFn: async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }),
    });
    assert.strictEqual(known3.size, 0);
  }
  console.log("PASS: lookupKnownSourceIds -- fails soft (empty Set, never throws) on network error, non-OK response, or malformed body");

  // 5. missing config (no SUPABASE_URL/KEY) -- empty Set, no throw.
  {
    const known = await lib.lookupKnownSourceIds(null, null, "ra", ["1"], { fetchFn: async () => { throw new Error("must not be called"); } });
    assert.strictEqual(known.size, 0);
  }
  console.log("PASS: lookupKnownSourceIds -- missing SUPABASE_URL/KEY returns empty Set without ever calling fetchFn");

  // ============================================================
  // recordSourceIdentity
  // ============================================================

  // 6. happy path -- correct URL (on_conflict + ignore-duplicates), correct body shape.
  {
    let captured = null;
    const fetchFn = async (url, opts) => {
      captured = { url, opts };
      return { ok: true };
    };
    const ok = await lib.recordSourceIdentity(SUPABASE_URL, SUPABASE_KEY, { eventId: "evt-1", source: "ra", sourceId: "2547930" }, { fetchFn });
    assert.strictEqual(ok, true);
    assert.ok(captured.url.includes("event_source_identities"));
    assert.ok(captured.url.includes("on_conflict=source,source_id"));
    assert.strictEqual(captured.opts.method, "POST");
    assert.ok(captured.opts.headers.Prefer.includes("ignore-duplicates"));
    const body = JSON.parse(captured.opts.body);
    assert.deepStrictEqual(body, [{ event_id: "evt-1", source: "ra", source_id: "2547930" }]);
  }
  console.log("PASS: recordSourceIdentity -- posts the right shape with on_conflict=source,source_id and ignore-duplicates");

  // 7. fails soft -- network error, non-OK response, missing args: always false, never throws.
  {
    const r1 = await lib.recordSourceIdentity(SUPABASE_URL, SUPABASE_KEY, { eventId: "evt-1", source: "ra", sourceId: "1" }, {
      fetchFn: async () => { throw new Error("network down"); },
    });
    assert.strictEqual(r1, false);

    const r2 = await lib.recordSourceIdentity(SUPABASE_URL, SUPABASE_KEY, { eventId: "evt-1", source: "ra", sourceId: "1" }, {
      fetchFn: async () => ({ ok: false, status: 409 }),
    });
    assert.strictEqual(r2, false);

    const r3 = await lib.recordSourceIdentity(SUPABASE_URL, SUPABASE_KEY, { eventId: null, source: "ra", sourceId: "1" }, {
      fetchFn: async () => { throw new Error("must not be called -- missing eventId"); },
    });
    assert.strictEqual(r3, false);
  }
  console.log("PASS: recordSourceIdentity -- fails soft (false, never throws) on network error, non-OK response, or missing required field");

  console.log("\nAll event-source-identities tests passed.");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
