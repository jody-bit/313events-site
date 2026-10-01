// test/dynamic-explore-neighborhoods.test.js
//
// GENERIC (not Bagley-specific) regression guard for the 2026-10-01
// amendment to the Bagley work: "EXPLORE NEIGHBORHOODS SHOULD BECOME
// ACTIVITY-DRIVEN FOR ALL NEIGHBORHOOD CARDS." Investigation found this
// requirement was ALREADY fully implemented by index.html's existing
// computeNeighborhoodCounts()/renderNeighborhoodsRail() pair (no new
// product logic was written for this amendment) — this file's job is to
// prove that against the REAL source text, not a reimplementation, so a
// future edit to that code can't silently regress the guarantee.
//
// Same established convention as test/list-card-ticket-status-note.test.js
// and test/cron-dossin-parse.test.js: this project has no DOM harness, so
// (a) the pure-data function (computeNeighborhoodCounts, plus the small
// helpers it calls: getTodayISO/toISO/isBlockedEvent) is extracted
// verbatim from index.html via regex and actually EXECUTED against
// synthetic byDate fixtures — proving real behavior, not just structure —
// and (b) the DOM-touching renderNeighborhoodsRail(), which only wraps (a)
// in markup, is checked structurally (regex over its own source text)
// rather than executed, since it needs a real document.
//
// Run: node test/dynamic-explore-neighborhoods.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");

function extract(pattern, label) {
  const m = html.match(pattern);
  assert.ok(m, `could not extract ${label} from index.html — source may have moved/changed shape`);
  return m[0];
}

const SRC_TO_ISO = extract(/function toISO\(y,m,d\)\{[^\n]*\}/, "toISO");
const SRC_GET_TODAY_ISO = extract(/function getTodayISO\(\)\{[\s\S]*?\n\}/, "getTodayISO");
const SRC_BLOCKED_NAMES = extract(/const BLOCKED_NAMES = \[[^\]]*\];/, "BLOCKED_NAMES");
const SRC_IS_BLOCKED_EVENT = extract(/function isBlockedEvent\(e\)\{[\s\S]*?\n\}/, "isBlockedEvent");
const SRC_RAIL_LIMIT = extract(/const NEIGHBORHOOD_RAIL_LIMIT = \d+;/, "NEIGHBORHOOD_RAIL_LIMIT");
const SRC_COMPUTE_COUNTS = extract(/function computeNeighborhoodCounts\(\)\{[\s\S]*?\n\}/, "computeNeighborhoodCounts");
const SRC_RENDER_RAIL = extract(/function renderNeighborhoodsRail\(\)\{[\s\S]*?\n\}/, "renderNeighborhoodsRail");
const SRC_NEIGHBORHOOD_PHOTOS = extract(/const NEIGHBORHOOD_PHOTOS = \{[\s\S]*?\n\};/, "NEIGHBORHOOD_PHOTOS");

// --- Build a real, executable sandbox from the actual extracted source,
//     with only `byDate` injectable per scenario (same global the real
//     page mutates via loadSupabaseEvents()/addToByDate()). ---
function runComputeNeighborhoodCounts(byDate, { now = new Date("2026-10-01T12:00:00") } = {}) {
  const sandbox = { byDate, console, Map, Date: makeFixedDate(now) };
  vm.createContext(sandbox);
  vm.runInContext(
    [SRC_TO_ISO, SRC_GET_TODAY_ISO, SRC_BLOCKED_NAMES, SRC_IS_BLOCKED_EVENT, SRC_COMPUTE_COUNTS].join("\n"),
    sandbox
  );
  return vm.runInContext("computeNeighborhoodCounts()", sandbox);
}

// A Date subclass whose no-arg constructor returns a fixed instant, so
// getTodayISO()'s `new Date()` is deterministic in the test — every other
// Date behavior (explicit-arg construction, etc.) is untouched.
function makeFixedDate(fixedNow) {
  class FixedDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(fixedNow.getTime());
      else super(...args);
    }
  }
  return FixedDate;
}

function evt(title, neighborhood, { note = null } = {}) {
  return { title, neighborhood, note };
}

// =======================================================================
// Scenarios 1–4, 7: executed against the REAL extracted
// computeNeighborhoodCounts() — this is the actual function the homepage
// calls after every data load; visibility is "does this neighborhood
// appear in its output with count >= 1", exactly what renderNeighborhoodsRail
// uses to decide whether a card renders.
// =======================================================================

function countFor(counts, name) {
  const row = counts.find(([n]) => n === name);
  return row ? row[1] : 0;
}

// --- 1. A canonical neighborhood with >=1 upcoming live event is eligible
//     to appear. ---
{
  const byDate = { "2026-10-15": [evt("Fall Festival", "Fitzgerald")] };
  const counts = runComputeNeighborhoodCounts(byDate);
  assert.strictEqual(countFor(counts, "Fitzgerald"), 1, "a neighborhood with one upcoming event must appear with count 1");
}
console.log("PASS (1): a canonical neighborhood with >=1 upcoming live event is eligible to appear");

// --- 2. Zero upcoming live events -> the neighborhood does not appear at
//     all (no zero-count entry sitting around to accidentally render). ---
{
  const byDate = { "2026-09-15": [evt("Past Thing", "Fitzgerald")] }; // in the past relative to fixed "now"
  const counts = runComputeNeighborhoodCounts(byDate);
  assert.strictEqual(countFor(counts, "Fitzgerald"), 0, "a neighborhood with zero upcoming events must not appear");
  assert.ok(!counts.some(([n]) => n === "Fitzgerald"), "no entry at all should exist for a neighborhood with nothing upcoming");
}
console.log("PASS (2): zero upcoming live events -> the neighborhood produces no entry (card would not appear)");

// --- 3. Adding a qualifying future event makes the neighborhood appear --
//     proves this is a live recomputation, not a cached/static snapshot:
//     the exact same function call, given different byDate state, returns
//     a different answer. ---
{
  const before = runComputeNeighborhoodCounts({});
  assert.ok(!before.some(([n]) => n === "North Corktown"), "sanity: starts absent with no events at all");
  const after = runComputeNeighborhoodCounts({ "2026-11-01": [evt("New Pop-Up", "North Corktown")] });
  assert.strictEqual(countFor(after, "North Corktown"), 1, "adding a qualifying future event must make the neighborhood newly eligible");
}
console.log("PASS (3): adding a qualifying future event makes a previously-absent neighborhood appear");

// --- 4. The last qualifying event expiring (its date moves into the past
//     relative to "today") makes the neighborhood disappear again — same
//     recomputation property as (3), the other direction. ---
{
  const stillUpcoming = runComputeNeighborhoodCounts({ "2026-10-02": [evt("Meeting", "Fitzgerald")] });
  assert.strictEqual(countFor(stillUpcoming, "Fitzgerald"), 1);
  const nowExpired = runComputeNeighborhoodCounts({ "2026-09-20": [evt("Meeting", "Fitzgerald")] }); // same event, date now in the past
  assert.strictEqual(countFor(nowExpired, "Fitzgerald"), 0, "once its date is in the past, the event no longer counts and the neighborhood disappears");
}
console.log("PASS (4): an event moving into the past makes its neighborhood disappear from the rail again");

// --- 5. The rail computation is read-only with respect to any canonical
//     neighborhood directory — it only ever reads byDate (event data) and
//     never mutates, deletes from, or even references a neighborhoods
//     table/array. The real canonical list lives server-side in Supabase's
//     `neighborhoods` table (see supabase/migration_002), which this
//     client-side computation has no way to touch — so a neighborhood
//     disappearing from the rail can never also remove it from the
//     canonical geography. ---
{
  assert.ok(!/neighborhoods\s*\.\s*(delete|splice|pop|shift)/i.test(SRC_COMPUTE_COUNTS), "computeNeighborhoodCounts must never mutate/delete from any neighborhoods collection");
  assert.ok(!/DELETE|delete\s+from\s+neighborhoods/i.test(SRC_RENDER_RAIL), "renderNeighborhoodsRail must never issue a delete against the neighborhoods table");
  assert.ok(/e\.neighborhood/.test(SRC_COMPUTE_COUNTS), "counts are read from each event's own resolved .neighborhood field, not a separately maintained directory");
}
console.log("PASS (5): the rail computation is read-only — it cannot remove a neighborhood from the canonical geography, only from its own visible output");

// --- 6. Existing behavior this amendment must not disturb: the
//     today-or-later floor, and the hard content blocklist
//     (isBlockedEvent/BLOCKED_NAMES) still apply exactly as before. ---
{
  const byDate = {
    "2026-10-15": [evt("Augustus Williams Presents...", "Downtown")], // blocked by title
  };
  const counts = runComputeNeighborhoodCounts(byDate);
  assert.strictEqual(countFor(counts, "Downtown"), 0, "a blocklisted event must still be excluded from neighborhood counts, unchanged by this amendment");
}
console.log("PASS (6): existing filters (today-or-later floor, hard content blocklist) are unaffected by the dynamic-visibility behavior");

// --- 7. Bagley follows EXACTLY the same generic code path as every other
//     neighborhood — same assertions as scenarios 1–4, just naming Bagley,
//     run through the identical computeNeighborhoodCounts() with no
//     Bagley-specific branch anywhere in it. ---
{
  const withEvent = runComputeNeighborhoodCounts({ "2026-10-20": [evt("Bagley Blooms Tool Shed Reveal", "Bagley")] });
  assert.strictEqual(countFor(withEvent, "Bagley"), 1, "Bagley appears via the exact same generic logic as any other neighborhood");
  const withoutEvent = runComputeNeighborhoodCounts({});
  assert.strictEqual(countFor(withoutEvent, "Bagley"), 0, "Bagley disappears via the exact same generic logic when it has no qualifying events");
}
console.log("PASS (7): Bagley appears/disappears through the identical generic computeNeighborhoodCounts() path as every other neighborhood");

// --- 8. No neighborhood-specific hardcoded visibility rules exist anywhere
//     in computeNeighborhoodCounts() or renderNeighborhoodsRail() — no
//     neighborhood name is referenced as a string literal inside either
//     function body (the only neighborhood-name text in this whole file
//     lives in NEIGHBORHOOD_PHOTOS, a photography lookup consulted AFTER
//     visibility is already decided, never a gate on visibility itself). ---
{
  const NEIGHBORHOOD_NAME_SAMPLE = ["Bagley", "Downtown", "Midtown", "Fitzgerald", "Eastern Market", "North Corktown"];
  for (const name of NEIGHBORHOOD_NAME_SAMPLE) {
    assert.ok(!SRC_COMPUTE_COUNTS.includes(`"${name}"`) && !SRC_COMPUTE_COUNTS.includes(`'${name}'`), `computeNeighborhoodCounts must not hardcode "${name}"`);
    assert.ok(!SRC_RENDER_RAIL.includes(`"${name}"`) && !SRC_RENDER_RAIL.includes(`'${name}'`), `renderNeighborhoodsRail must not hardcode "${name}"`);
  }
}
console.log("PASS (8): neither computeNeighborhoodCounts nor renderNeighborhoodsRail hardcodes any individual neighborhood name");

// =======================================================================
// Structural checks on renderNeighborhoodsRail() (DOM-touching, not
// executed) and NEIGHBORHOOD_PHOTOS (photography policy).
// =======================================================================

// --- Event-count display is derived dynamically from the same count
//     computation, never a hardcoded number -- it's a template
//     interpolation of the `count` destructured straight from
//     computeNeighborhoodCounts()'s own [name, count] tuples. ---
assert.ok(/\$\{count\}/.test(SRC_RENDER_RAIL), "the card's event count must be a dynamic template interpolation of the real computed count, not hardcoded");
assert.ok(/computeNeighborhoodCounts\(\)\.slice\(0,\s*NEIGHBORHOOD_RAIL_LIMIT\)/.test(SRC_RENDER_RAIL), "renderNeighborhoodsRail must derive its visible cards from computeNeighborhoodCounts(), not a separately maintained list");
console.log("PASS: the rendered event count is a live interpolation of the real computed count, never hardcoded");

// --- Zero qualifying neighborhoods -> the whole section hides itself
//     (not just an empty rail with a dangling heading). ---
assert.ok(/if\(!counts\.length\)\{\s*section\.style\.display\s*=\s*'none'/.test(SRC_RENDER_RAIL), "the Explore Neighborhoods section itself must hide when there are zero eligible neighborhoods, not just render an empty rail");
console.log("PASS: the Explore Neighborhoods section hides itself entirely when there are zero currently-eligible neighborhoods");

// --- Photography fallback: a neighborhood with no NEIGHBORHOOD_PHOTOS
//     entry still renders (photoHtml falls back to '', no 'has-photo'
//     class, no generic stock image substituted) — same policy for every
//     qualifying neighborhood including Bagley, which deliberately has no
//     entry yet. ---
assert.ok(!new RegExp(`["']Bagley["']\\s*:`).test(SRC_NEIGHBORHOOD_PHOTOS), "Bagley must not have a NEIGHBORHOOD_PHOTOS entry yet -- Jody will add an approved photo separately");
assert.ok(/const photoHtml = photoSrc\s*\n?\s*\?/.test(SRC_RENDER_RAIL), "a missing photo must fall back to the plain typographic card, never a substituted/generic image");
console.log("PASS: Bagley (and any other neighborhood with no approved photo) falls back to the existing plain typographic card -- dynamic visibility never triggers fetching or substituting an image");

// --- The rail is recomputed after every real data load, not just once at
//     page load -- the actual "zero manual maintenance" property. ---
const renderCallSites = (html.match(/renderNeighborhoodsRail\(\);/g) || []).length;
assert.ok(renderCallSites >= 3, `renderNeighborhoodsRail() should be called from multiple real data-changing sites (found ${renderCallSites}), proving it's a live recomputation, not a one-time render`);
console.log(`PASS: renderNeighborhoodsRail() is called from ${renderCallSites} real sites (recomputed after every data load, not a one-time render)`);

console.log("\ndynamic-explore-neighborhoods.test.js: all assertions passed (generic — Bagley is exercised only as one case of the shared, non-hardcoded logic)");
