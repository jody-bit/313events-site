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
// helper it calls, inventoryCtx) is extracted verbatim from index.html via
// regex and actually EXECUTED against synthetic events — proving real
// behavior, not just structure — and (b) the DOM-touching
// renderNeighborhoodsRail(), which only wraps (a) in markup, is checked
// structurally (regex over its own source text) rather than executed,
// since it needs a real document.
//
// 2026-10-03 — the homepage adopted the shared discovery layer (DEC-022).
// computeNeighborhoodCounts() no longer walks the page's own per-day index
// applying its own "today or later" and blocked-name rules; it asks
// Discovery.facets() for the neighborhoods of the site's current + upcoming
// inventory. Every guarantee below still holds and is still proven by
// executing the real function (now together with the real discovery.js).
// Two things about the NUMBER on a card changed with that, both approved:
// an event is counted once however many days it runs (it used to be
// counted once per day), and an event that started earlier and is still
// running is counted (it used to be skipped) — scenarios 9 and 10.
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

const SRC_INVENTORY_CTX = extract(/function inventoryCtx\(\)\{[\s\S]*?\n\}/, "inventoryCtx");
const SRC_DISCOVERY = fs.readFileSync(`${REPO_DIR}/discovery.js`, "utf8");
const SRC_RAIL_LIMIT = extract(/const NEIGHBORHOOD_RAIL_LIMIT = \d+;/, "NEIGHBORHOOD_RAIL_LIMIT");
const SRC_COMPUTE_COUNTS = extract(/function computeNeighborhoodCounts\(\)\{[\s\S]*?\n\}/, "computeNeighborhoodCounts");
const SRC_RENDER_RAIL = extract(/function renderNeighborhoodsRail\(\)\{[\s\S]*?\n\}/, "renderNeighborhoodsRail");
const SRC_NEIGHBORHOOD_PHOTOS = extract(/const NEIGHBORHOOD_PHOTOS = \{[\s\S]*?\n\};/, "NEIGHBORHOOD_PHOTOS");

// --- Build a real, executable sandbox from the actual extracted source and
//     the real discovery.js, with only the loaded events injectable per
//     scenario (the same EVENTS global the real page fills in
//     loadSupabaseEvents()). The scenarios are still written as "which
//     events are on which date", and turned into events here. ---
function runComputeNeighborhoodCounts(byDate, { now = new Date("2026-10-01T12:00:00-04:00") } = {}) {
  const EVENTS = [];
  Object.keys(byDate).forEach((iso) => byDate[iso].forEach((e) => { if (!EVENTS.includes(e)) EVENTS.push(Object.assign(e, { date: e.date || iso })); }));
  const sandbox = { console };
  vm.createContext(sandbox);
  // A Date whose no-arg constructor returns a fixed instant, so "today" is
  // deterministic — every other Date behavior is untouched.
  vm.runInContext(`
    var __RealDate = Date;
    Date = class extends __RealDate {
      constructor(...a){ if(a.length === 0) super(${now.getTime()}); else super(...a); }
      static now(){ return ${now.getTime()}; }
    };`, sandbox);
  sandbox.__events = EVENTS;
  vm.runInContext(
    [SRC_DISCOVERY, "var EVENTS = __events, editorialByEvent = {};", SRC_INVENTORY_CTX, SRC_COMPUTE_COUNTS].join("\n"),
    sandbox
  );
  // JSON round trip: values built inside the sandbox belong to another realm.
  return JSON.parse(JSON.stringify(vm.runInContext("computeNeighborhoodCounts()", sandbox)));
}

let nextId = 1;
function evt(title, neighborhood, { note = null, date = null, endDate = null } = {}) {
  return { id: "e" + nextId++, title, neighborhood, note, cat: "community", date, endDate };
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
  assert.ok(/Discovery\.facets\(EVENTS, .*'neighborhood'\)/.test(SRC_COMPUTE_COUNTS), "counts come from the loaded events' own resolved neighborhood (Discovery.facets over EVENTS), not a separately maintained directory");
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

// --- 9. (2026-10-03, shared discovery layer) A card's number is a count of
//     EVENTS, not of event-days: a three-day festival is one event. ---
{
  const festival = evt("Three-Day Festival", "Eastern Market", { date: "2026-10-09", endDate: "2026-10-11" });
  const counts = runComputeNeighborhoodCounts({ "2026-10-09": [festival], "2026-10-10": [festival], "2026-10-11": [festival, evt("Sunday Market", "Eastern Market")] });
  assert.strictEqual(countFor(counts, "Eastern Market"), 2, "a festival listed under three days is still one event: festival + market = 2 (was 4 when each day counted)");
}
console.log("PASS (9): an event that runs for several days is counted once on its neighborhood's card");

// --- 10. (2026-10-03) An event that started before today and is still
//     running keeps its neighborhood on the rail; once its last day has
//     passed it no longer does. ---
{
  const running = runComputeNeighborhoodCounts({ "2026-09-25": [evt("Exhibition", "Midtown", { date: "2026-09-25", endDate: "2026-10-20" })] });
  assert.strictEqual(countFor(running, "Midtown"), 1, "an event in progress (started Sep 25, runs to Oct 20) counts on Oct 1");
  const finished = runComputeNeighborhoodCounts({ "2026-09-20": [evt("Exhibition", "Midtown", { date: "2026-09-20", endDate: "2026-09-30" })] });
  assert.strictEqual(countFor(finished, "Midtown"), 0, "an event whose last day was yesterday does not");
}
console.log("PASS (10): an event in progress counts until its last day has passed");

// --- 11. Most events first; equal counts in name order (a stable, explainable order). ---
{
  const counts = runComputeNeighborhoodCounts({ "2026-10-05": [evt("A", "Midtown"), evt("B", "Corktown"), evt("C", "Bagley"), evt("D", "Corktown")] });
  assert.deepStrictEqual(counts, [["Corktown", 2], ["Bagley", 1], ["Midtown", 1]]);
}
console.log("PASS (11): the rail is ordered by event count, ties by name");

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
