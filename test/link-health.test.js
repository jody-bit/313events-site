// test/link-health.test.js — api/_lib/link-health.js's generic dead-link
// detect/recover/verify/persist framework (2026-09-28, Needs Follow-up
// self-healing pass 2).
//
// Root problem: a non-null ticket_url/event_url was always treated as
// healthy purely because the DB field wasn't blank. This proves the
// classify/check/heal pipeline's decision logic in isolation, with
// injected fetch (no real network) -- see
// test/visitdetroit-dead-link-repair.test.js for the DB-write layer on
// top of this, and api/_lib/visitdetroit-link-recovery.js for the one
// registered real-world recovery strategy.
//
// Run: node test/link-health.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshLinkHealth() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/link-health.js`)];
  return require(`${REPO_DIR}/api/_lib/link-health.js`);
}

async function run() {
  // ============================================================
  // Part 1: classifyUrlCheck — the core status-bucketing rule
  // ============================================================
  {
    const { classifyUrlCheck } = freshLinkHealth();
    assert.strictEqual(classifyUrlCheck(200), "ok");
    assert.strictEqual(classifyUrlCheck(301), "ok", "a redirect status alone (already followed by fetch) is ok");
    assert.strictEqual(classifyUrlCheck(399), "ok");
    assert.strictEqual(classifyUrlCheck(404), "dead");
    assert.strictEqual(classifyUrlCheck(410), "dead");
    // The whole point of this rule: none of these are evidence of death.
    assert.strictEqual(classifyUrlCheck(401), "inconclusive");
    assert.strictEqual(classifyUrlCheck(403), "inconclusive");
    assert.strictEqual(classifyUrlCheck(429), "inconclusive");
    assert.strictEqual(classifyUrlCheck(500), "inconclusive");
    assert.strictEqual(classifyUrlCheck(503), "inconclusive");
    assert.strictEqual(classifyUrlCheck(null), "inconclusive", "a thrown network error/timeout (no status) is never dead");
    assert.strictEqual(classifyUrlCheck(undefined), "inconclusive");
  }
  console.log("PASS: classifyUrlCheck — only 404/410 are 'dead'; 401/403/429/5xx/network-error are all 'inconclusive', never 'dead'");

  // ============================================================
  // Part 2: checkUrl — single live check, injected fetch
  // ============================================================
  {
    const { checkUrl } = freshLinkHealth();
    const ok = await checkUrl("https://x.com/a", { fetchFn: async (url) => ({ status: 200, url }) });
    assert.deepStrictEqual(ok, { classification: "ok", status: 200, finalUrl: "https://x.com/a" });

    const redirected = await checkUrl("https://x.com/old", { fetchFn: async () => ({ status: 200, url: "https://x.com/new" }) });
    assert.strictEqual(redirected.finalUrl, "https://x.com/new", "reports the FINAL resolved URL after a followed redirect");

    const dead = await checkUrl("https://x.com/gone", { fetchFn: async (url) => ({ status: 404, url }) });
    assert.strictEqual(dead.classification, "dead");

    const thrown = await checkUrl("https://x.com/timeout", { fetchFn: async () => { throw new Error("network timeout"); } });
    assert.strictEqual(thrown.classification, "inconclusive");

    const blank = await checkUrl(null, {});
    assert.strictEqual(blank.classification, "inconclusive");
  }
  console.log("PASS: checkUrl — ok/redirect-final-url/dead/thrown-error/blank-url all handled correctly");

  // ============================================================
  // Part 3: healEventUrl — full pipeline, using the REAL two-event
  // scenario (Christmas Cookie Coach Tour) with a registered strategy
  // ============================================================
  {
    const { healEventUrl, registerRecoveryStrategy } = freshLinkHealth();
    registerRecoveryStrategy("example.com", async (deadUrl, { title }) => {
      if (deadUrl === "https://example.com/old-slug/" && title === "Known Event") return "https://example.com/events/old-slug/";
      return null;
    });

    // dead -> strategy recovers a candidate -> candidate re-verified ok -> repaired
    {
      const fetchFn = async (url) => {
        if (url === "https://example.com/old-slug/") return { status: 404, url };
        if (url === "https://example.com/events/old-slug/") return { status: 200, url };
        throw new Error("unexpected url " + url);
      };
      const result = await healEventUrl({ url: "https://example.com/old-slug/", title: "Known Event", fetchFn });
      assert.deepStrictEqual(result, { checked: true, classification: "dead", repaired: true, newUrl: "https://example.com/events/old-slug/" });
    }

    // dead -> strategy's own candidate itself turns out dead on
    // revalidation -> NOT repaired (never trusts the strategy alone)
    {
      const fetchFn = async (url) => {
        if (url === "https://example.com/old-slug/") return { status: 404, url };
        if (url === "https://example.com/events/old-slug/") return { status: 404, url }; // candidate is ALSO dead
        throw new Error("unexpected url " + url);
      };
      const result = await healEventUrl({ url: "https://example.com/old-slug/", title: "Known Event", fetchFn });
      assert.deepStrictEqual(result, { checked: true, classification: "dead", repaired: false, newUrl: null });
    }

    // dead -> no registered strategy for this host -> stays dead, unrepaired
    {
      const fetchFn = async () => ({ status: 404, url: "https://unregistered-host.example/x" });
      const result = await healEventUrl({ url: "https://unregistered-host.example/x", title: "Whatever", fetchFn });
      assert.deepStrictEqual(result, { checked: true, classification: "dead", repaired: false, newUrl: null });
    }

    // inconclusive -> never touches recovery at all, never repaired
    {
      const fetchFn = async () => ({ status: 429, url: "https://example.com/old-slug/" });
      const result = await healEventUrl({ url: "https://example.com/old-slug/", title: "Known Event", fetchFn });
      assert.deepStrictEqual(result, { checked: true, classification: "inconclusive", repaired: false, newUrl: null });
    }

    // ok -> no recovery attempted at all
    {
      const fetchFn = async (url) => ({ status: 200, url });
      const result = await healEventUrl({ url: "https://example.com/events/old-slug/", title: "Known Event", fetchFn });
      assert.deepStrictEqual(result, { checked: true, classification: "ok", repaired: false, newUrl: null });
    }
  }
  console.log("PASS: healEventUrl — dead+recovered+revalidated (repaired), dead+candidate-also-dead (not repaired), dead+no-strategy, inconclusive, and already-ok all behave correctly");

  console.log("\nlink-health.test.js: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
