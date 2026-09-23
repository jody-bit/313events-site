// test/cron-healthcheck-source-health.test.js — Admin stabilization, Problem 2
// (2026-09-23): source health must answer "did the connector run and
// complete successfully", not "did an event row get touched recently".
//
// Exercises the new source_runs-backed health functions exposed by
// api/cron-healthcheck.js (evaluateRunHealth, fetchLatestSourceRun,
// checkSourceHealth, checkSourceFreshnessAdvisory) — never the full handler,
// which would require mocking ~30 unrelated page/auth/upload checks.
//
// Plain Node assert, no dependencies.
// Run: node test/cron-healthcheck-source-health.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshModule() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-healthcheck.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  return require(`${REPO_DIR}/api/cron-healthcheck.js`);
}

function isoMinutesAgo(mins) {
  return new Date(Date.now() - mins * 60 * 1000).toISOString();
}
function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  delete process.env.ADMIN_SECRET;

  const mod = freshModule();
  const {
    evaluateRunHealth,
    fetchLatestSourceRun,
    checkSourceHealth,
    checkSourceFreshnessAdvisory,
    SOURCE_NAME_TO_SLUG,
    SOURCE_FRESHNESS_TARGETS,
    STARTED_RUN_TIMEOUT_MINUTES,
  } = mod;

  // --- 1. success outcome, events_seen=20/inserted=0/updated=0-equivalent (records_written=0), within window -- HEALTHY ---
  {
    const row = { started_at: isoMinutesAgo(30), finished_at: isoMinutesAgo(29), outcome: "success", http_status: 200, records_fetched: 20, records_parsed: 20, records_written: 0 };
    const detail = evaluateRunHealth(row, { source: "Belle Isle Nature Center", days: 7 });
    assert.ok(/success/.test(detail), "a successful run with zero writes must be reported healthy, not failed");
  }
  console.log("PASS: outcome=success with records_written=0 is healthy (zero new/changed events is not a failure)");

  // --- 2. partial outcome within window -- also healthy ---
  {
    const row = { started_at: isoMinutesAgo(10), finished_at: isoMinutesAgo(9), outcome: "partial", records_written: 3 };
    const detail = evaluateRunHealth(row, { source: "Cinema Detroit", days: 7 });
    assert.ok(/partial/.test(detail));
  }
  console.log("PASS: outcome=partial within window is healthy");

  // --- 3. success outcome but the run itself is older than the source's expected interval -- the CONNECTOR is stale, must fail ---
  {
    const row = { started_at: isoDaysAgo(10), finished_at: isoDaysAgo(10), outcome: "success", records_written: 5 };
    assert.throws(
      () => evaluateRunHealth(row, { source: "Belle Isle Nature Center", days: 7 }),
      /no successful run started .* in the last 7d/,
      "a run older than the source's own window must fail even though its outcome was success"
    );
  }
  console.log("PASS: a stale run (outcome=success but started outside the expected interval) fails — connector staleness, not event staleness");

  // --- 4. outcome=failed -- always a failure, http_status/error_sample surfaced ---
  {
    const row = { started_at: isoMinutesAgo(5), finished_at: isoMinutesAgo(4), outcome: "failed", http_status: 401, error_sample: "unauthorized" };
    assert.throws(() => evaluateRunHealth(row, { source: "Redford Theatre", days: 7 }), /FAILED \(HTTP 401\): unauthorized/);
  }
  console.log("PASS: outcome=failed fails regardless of recency, and surfaces http_status/error_sample");

  // --- 5. outcome=blocked -- always a failure ---
  {
    const row = { started_at: isoMinutesAgo(5), finished_at: isoMinutesAgo(4), outcome: "blocked", http_status: 403 };
    assert.throws(() => evaluateRunHealth(row, { source: "Trinosophes", days: 7 }), /BLOCKED by upstream \(HTTP 403\)/);
  }
  console.log("PASS: outcome=blocked fails as blocked/degraded, not a generic error");

  // --- 6. outcome=started, still recent -- in progress, not a failure ---
  {
    const row = { started_at: isoMinutesAgo(2), finished_at: null, outcome: "started" };
    const detail = evaluateRunHealth(row, { source: "WDET", days: 3 });
    assert.ok(/in progress/.test(detail));
  }
  console.log("PASS: a fresh outcome=started row (still running) is not a failure");

  // --- 7. outcome=started, stuck well past the timeout budget -- abandoned/probable timeout, a failure ---
  {
    const row = { started_at: isoMinutesAgo(STARTED_RUN_TIMEOUT_MINUTES + 5), finished_at: null, outcome: "started" };
    assert.throws(() => evaluateRunHealth(row, { source: "WDET", days: 3 }), /never finished -- probable timeout\/abandoned run/);
  }
  console.log("PASS: a started run stuck past the timeout budget is reported as abandoned/probable timeout");

  // --- 8. fetchLatestSourceRun: migration_035 not applied (PGRST205) -> 'no_table', never throws ---
  {
    global.fetch = async (url) => {
      assert.ok(url.includes("/rest/v1/source_runs"));
      return { ok: false, status: 404, json: async () => ({ code: "PGRST205", message: "Could not find the table 'public.source_runs' in the schema cache" }) };
    };
    const result = await fetchLatestSourceRun("wdet");
    assert.deepStrictEqual(result, { status: "no_table" });
  }
  console.log("PASS: fetchLatestSourceRun reports 'no_table' (not a thrown error) when migration_035 isn't applied yet — matches live production evidence confirmed 2026-09-23");

  // --- 9. fetchLatestSourceRun: table exists, nothing logged for this slug -- 'no_rows' ---
  {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
    const result = await fetchLatestSourceRun("wdet");
    assert.deepStrictEqual(result, { status: "no_rows" });
  }
  console.log("PASS: fetchLatestSourceRun reports 'no_rows' when the table exists but this slug has no logged runs yet");

  // --- 10. fetchLatestSourceRun: a real row comes back ---
  {
    const fakeRow = { started_at: isoMinutesAgo(1), finished_at: isoMinutesAgo(0.5), outcome: "success", http_status: 200, error_sample: null };
    global.fetch = async () => ({ ok: true, status: 200, json: async () => [fakeRow] });
    const result = await fetchLatestSourceRun("wdet");
    assert.strictEqual(result.status, "row");
    assert.strictEqual(result.row.outcome, "success");
  }
  console.log("PASS: fetchLatestSourceRun returns the most recent row when one exists");

  // --- 11. fetchLatestSourceRun: a genuine non-404 Supabase REST error still throws ---
  {
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: "invalid key" }) });
    await assert.rejects(() => fetchLatestSourceRun("wdet"), /source_runs REST HTTP 401/);
  }
  console.log("PASS: a genuine Supabase REST failure (not a missing table) still fails the check");

  // --- 12. checkSourceFreshnessAdvisory: zero rows is ADVISORY, never throws ---
  {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
    const detail = await checkSourceFreshnessAdvisory("Metro Times", 3);
    assert.ok(/ADVISORY ONLY \(not a failure\)/.test(detail));
  }
  console.log("PASS: checkSourceFreshnessAdvisory never fails on zero recently-updated rows");

  // --- 13. checkSourceFreshnessAdvisory: a genuine Supabase REST HTTP error (e.g. Redford's 401) still fails ---
  {
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await assert.rejects(() => checkSourceFreshnessAdvisory("Redford Theatre", 7), /Supabase REST HTTP 401/);
  }
  console.log("PASS: checkSourceFreshnessAdvisory still fails on a real HTTP error — Redford's HTTP 401 stays classified as an actual failure");

  // --- 14. checkSourceHealth: source has a mapped slug, source_runs has no table -> falls back to advisory, never a hard failure just from that ---
  {
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/source_runs")) return { ok: false, status: 404, json: async () => ({ code: "PGRST205" }) };
      if (url.includes("/rest/v1/events")) return { ok: true, status: 200, json: async () => [] };
      throw new Error("unmocked: " + url);
    };
    const detail = await checkSourceHealth({ source: "Belle Isle Nature Center", days: 7 });
    assert.ok(/ADVISORY ONLY/.test(detail));
  }
  console.log("PASS: checkSourceHealth falls back to the advisory freshness check when source_runs has no table yet, for a source with a mapped slug");

  // --- 15. checkSourceHealth: source has a mapped slug, a real healthy row exists -> uses source_runs, not events freshness ---
  {
    let eventsQueried = false;
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/source_runs")) {
        return { ok: true, status: 200, json: async () => [{ started_at: isoMinutesAgo(20), finished_at: isoMinutesAgo(19), outcome: "success", records_written: 0 }] };
      }
      if (url.includes("/rest/v1/events")) { eventsQueried = true; return { ok: true, status: 200, json: async () => [] }; }
      throw new Error("unmocked: " + url);
    };
    const detail = await checkSourceHealth({ source: "Cinema Detroit", days: 7 });
    assert.ok(/success/.test(detail));
    assert.strictEqual(eventsQueried, false, "events.updated_at must not be queried once real source_runs evidence exists");
  }
  console.log("PASS: checkSourceHealth prefers real source_runs evidence over the events-freshness fallback, and doesn't fail on zero records written");

  // --- 16. checkSourceHealth: source has a mapped slug, a real failed row exists -> propagates the failure (Redford stays failing) ---
  {
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/source_runs")) {
        return { ok: true, status: 200, json: async () => [{ started_at: isoMinutesAgo(5), finished_at: isoMinutesAgo(4), outcome: "failed", http_status: 401, error_sample: "Supabase REST HTTP 401" }] };
      }
      throw new Error("unmocked: " + url);
    };
    await assert.rejects(() => checkSourceHealth({ source: "Redford Theatre", days: 7 }), /FAILED \(HTTP 401\)/);
  }
  console.log("PASS: checkSourceHealth propagates a genuine failed source_runs row (Redford's HTTP 401 stays an actual failure once instrumented)");

  // --- 17. checkSourceHealth: source with NO mapped slug never queries source_runs at all -- goes straight to advisory ---
  {
    let sourceRunsQueried = false;
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/source_runs")) { sourceRunsQueried = true; return { ok: true, status: 200, json: async () => [] }; }
      if (url.includes("/rest/v1/events")) return { ok: true, status: 200, json: async () => [{ id: "x" }] };
      throw new Error("unmocked: " + url);
    };
    assert.strictEqual(SOURCE_NAME_TO_SLUG["Metro Times"], undefined, "Metro Times' connector doesn't call startRun/finishRun yet — no slug should be mapped for it");
    const detail = await checkSourceHealth({ source: "Metro Times", days: 3 });
    assert.strictEqual(sourceRunsQueried, false);
    assert.ok(/row\(s\) updated within/.test(detail));
  }
  console.log("PASS: an unmapped source (no calling connector yet) skips source_runs entirely and uses the advisory freshness check directly");

  // --- 18. every SOURCE_NAME_TO_SLUG entry is a real registered slug (regression guard against typos) ---
  {
    const { isKnownSourceSlug } = require(`${REPO_DIR}/api/_lib/source-slugs.js`);
    for (const [source, slug] of Object.entries(SOURCE_NAME_TO_SLUG)) {
      assert.ok(isKnownSourceSlug(slug), `SOURCE_NAME_TO_SLUG["${source}"] = "${slug}" is not a known slug in api/_lib/source-slugs.js`);
    }
    // And every mapped source is actually one of the freshness targets (no orphan entries).
    const targetNames = new Set(SOURCE_FRESHNESS_TARGETS.map((t) => t.source));
    for (const source of Object.keys(SOURCE_NAME_TO_SLUG)) {
      assert.ok(targetNames.has(source), `SOURCE_NAME_TO_SLUG has an entry for "${source}" that isn't in SOURCE_FRESHNESS_TARGETS`);
    }
  }
  console.log("PASS: SOURCE_NAME_TO_SLUG entries are all real registered slugs and all correspond to an actual freshness target");

  console.log("\nAll cron-healthcheck source-health tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
