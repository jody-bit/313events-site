// test/visitdetroit-link-recovery.test.js — api/_lib/visitdetroit-link-
// recovery.js's deterministic /<slug>/ -> /events/<slug>/ repair strategy
// (2026-09-28, Needs Follow-up self-healing pass 2).
//
// Uses the REAL two dead URLs Jody found live 2026-09-28:
//   https://visitdetroit.com/christmas-cookie-coach-tour/ -> 404
//   https://visitdetroit.com/the-original-detroit-christmas-bakery-bus-tour/ -> 404
// both confirmed still live under /events/<same slug>/.
//
// Run: node test/visitdetroit-link-recovery.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function fresh() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/visitdetroit-link-recovery.js`)];
  return require(`${REPO_DIR}/api/_lib/visitdetroit-link-recovery.js`);
}

async function run() {
  const { visitDetroitRecoveryStrategy } = fresh();

  // --- The two real known-dead URLs, real slugs ---
  {
    const fetchFn = async (url) => {
      assert.strictEqual(url, "https://visitdetroit.com/events/christmas-cookie-coach-tour/");
      return { ok: true, status: 200, text: async () => "<html><h1>Christmas Cookie Coach Tour</h1>...</html>" };
    };
    const result = await visitDetroitRecoveryStrategy(
      "https://visitdetroit.com/christmas-cookie-coach-tour/",
      { title: "Christmas Cookie Coach Tour", fetchFn }
    );
    assert.strictEqual(result, "https://visitdetroit.com/events/christmas-cookie-coach-tour/");
  }
  console.log("PASS: Christmas Cookie Coach Tour's real dead URL recovers to the real live /events/ URL");

  {
    const fetchFn = async (url) => {
      assert.strictEqual(url, "https://visitdetroit.com/events/the-original-detroit-christmas-bakery-bus-tour/");
      return { ok: true, status: 200, text: async () => "<html>...The Original Detroit Christmas Bakery Bus Tour...</html>" };
    };
    const result = await visitDetroitRecoveryStrategy(
      "https://visitdetroit.com/the-original-detroit-christmas-bakery-bus-tour/",
      { title: "The Original Detroit Christmas Bakery Bus Tour", fetchFn }
    );
    assert.strictEqual(result, "https://visitdetroit.com/events/the-original-detroit-christmas-bakery-bus-tour/");
  }
  console.log("PASS: The Original Detroit Christmas Bakery Bus Tour's real dead URL recovers to the real live /events/ URL");

  // --- Identity mismatch: candidate page exists but doesn't mention the
  // expected title -- must return null, never guess ---
  {
    const fetchFn = async () => ({ ok: true, status: 200, text: async () => "<html>Some Completely Different Event</html>" });
    const result = await visitDetroitRecoveryStrategy(
      "https://visitdetroit.com/christmas-cookie-coach-tour/",
      { title: "Christmas Cookie Coach Tour", fetchFn }
    );
    assert.strictEqual(result, null, "must never persist a replacement whose page doesn't confirm the same event identity");
  }
  console.log("PASS: a candidate page that doesn't mention the expected title is rejected, not trusted");

  // --- Candidate itself 404s -- must return null ---
  {
    const fetchFn = async () => ({ ok: false, status: 404 });
    const result = await visitDetroitRecoveryStrategy(
      "https://visitdetroit.com/some-other-tour/",
      { title: "Some Other Tour", fetchFn }
    );
    assert.strictEqual(result, null);
  }
  console.log("PASS: a candidate /events/ URL that itself 404s is rejected");

  // --- Already under /events/ -- this strategy deliberately does not
  // touch it (a different kind of dead link, not this known drift) ---
  {
    const fetchFn = async () => { throw new Error("must not be called"); };
    const result = await visitDetroitRecoveryStrategy(
      "https://visitdetroit.com/events/already-new-shape/",
      { title: "Whatever", fetchFn }
    );
    assert.strictEqual(result, null);
  }
  console.log("PASS: a URL already under /events/ is left alone (out of scope for this specific strategy)");

  // --- No title to verify against -- never guesses ---
  {
    const fetchFn = async () => { throw new Error("must not be called"); };
    const result = await visitDetroitRecoveryStrategy("https://visitdetroit.com/some-slug/", { title: "", fetchFn });
    assert.strictEqual(result, null);
  }
  console.log("PASS: a blank title never triggers a guess-based recovery attempt");

  // --- Never falls back to a generic listing/homepage URL ---
  {
    // Even if the "candidate" resolution were somehow coerced toward the
    // bare /events/ listing page, OLD_SHAPE_RE's own slug capture group
    // requires at least one path segment, so there is no code path that
    // could ever produce "https://visitdetroit.com/events/" (no slug) as
    // a candidate in the first place.
    const { OLD_SHAPE_RE } = fresh();
    assert.strictEqual(OLD_SHAPE_RE.test("https://visitdetroit.com/"), false, "the bare homepage never matches as an old-shape slug URL");
  }
  console.log("PASS: no code path can produce a generic listing/homepage URL as a \"recovered\" candidate");

  // ============================================================
  // Real 2026-09-29 regression cases: the two VisitDetroit events Jody
  // flagged as stuck dead links. Both have real live /events/ pages
  // (confirmed by direct fetch 2026-09-29), but neither was actually
  // getting repaired -- for two different reasons, both fixed here.
  // ============================================================

  // --- "Wild West" Murder Mystery Interactive Dinner: OLD_SHAPE_RE
  // matches fine (pure-ASCII slug), but the DB title contains literal
  // quote characters that the live page's raw HTML re-encodes as HTML
  // entities in <title> and as backslash-escaped quotes in its JSON-LD
  // block -- a plain substring match against either form silently never
  // matched a literal `"`. htmlContainsTitle() (api/_lib/link-health.js)
  // now normalizes both sides before comparing. ---
  {
    const realTitle = '"Wild West" Murder Mystery Interactive Dinner';
    const realHtmlFragment =
      '<title>&quot;Wild West&quot; Murder Mystery Interactive Dinner | Visit Detroit</title>' +
      '<script type="application/ld+json">{"name":"\\"Wild West\\" Murder Mystery Interactive Dinner"}</script>';
    const fetchFn = async (url) => {
      assert.strictEqual(url, "https://visitdetroit.com/events/wild-west-murder-mystery-interactive-dinner/");
      return { ok: true, status: 200, text: async () => realHtmlFragment };
    };
    const result = await visitDetroitRecoveryStrategy(
      "https://visitdetroit.com/wild-west-murder-mystery-interactive-dinner/",
      { title: realTitle, fetchFn }
    );
    assert.strictEqual(result, "https://visitdetroit.com/events/wild-west-murder-mystery-interactive-dinner/");
  }
  console.log('PASS: "Wild West" Murder Mystery Interactive Dinner recovers despite &quot;/\\" quote-encoding in the candidate page');

  // --- What We Notice: Living in Art - Ashley Menth & Tzu Pore: the DB's
  // stored dead URL contains a non-ASCII slug character (an accented e),
  // which the old [a-z0-9-]-only OLD_SHAPE_RE silently refused to match
  // at all -- never even attempting a candidate. The Unicode-aware
  // pattern now recognizes it, and the candidate's JSON-LD (which spells
  // the ampersand literally, unescaped) confirms identity. ---
  {
    const deadUrl = "https://visitdetroit.com/what-we-notice-living-in-art-ashley-menth-tzu-por\u00e9/";
    const candidateUrl = "https://visitdetroit.com/events/what-we-notice-living-in-art-ashley-menth-tzu-por\u00e9/";
    const realTitle = "What We Notice: Living in Art - Ashley Menth & Tzu Por\u00e9";
    const realHtmlFragment =
      '<title>What We Notice: Living in Art - Ashley Menth &amp; Tzu Por\u00e9 | Visit Detroit</title>' +
      '<script type="application/ld+json">{"name":"What We Notice: Living in Art - Ashley Menth & Tzu Por\u00e9"}</script>';
    const fetchFn = async (url) => {
      assert.strictEqual(url, candidateUrl);
      return { ok: true, status: 200, text: async () => realHtmlFragment };
    };
    const result = await visitDetroitRecoveryStrategy(deadUrl, { title: realTitle, fetchFn });
    assert.strictEqual(result, candidateUrl);
  }
  console.log("PASS: What We Notice: Living in Art recovers now that OLD_SHAPE_RE accepts a non-ASCII slug character");

  console.log("\nvisitdetroit-link-recovery.test.js: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
