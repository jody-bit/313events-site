// test/cron-bagleycommunity.test.js
//
// Covers api/cron-bagleycommunity.js — the Bagley Community Council
// connector added 2026-10-01 (Product Owner request: "Add Bagley as a
// first-class neighborhood... Add Bagley Community Council as an event
// source"). Two concerns, both exercised here:
//
//   1. PARSING UNIT TESTS — Tier 1 (event_listing General Meeting prose,
//      "third Saturday" date math) and Tier 2 (posts title-pattern
//      matching, including its required exclusions: General Meeting dupes,
//      and real non-event titles from the live site that must NOT match).
//
//   2. HANDLER INTEGRATION TESTS — venue/neighborhood resolution for BOTH
//      curated venues (including the Fitzgerald-not-Bagley case, the single
//      most important correctness property of this whole connector),
//      category defaulting, telemetry outcomes, and an explicit
//      non-regression proof that this connector contains no "Bagley"
//      substring/text-matching logic anywhere in its neighborhood
//      assignment — neighborhood is only ever reached structurally via
//      venue_id -> venues.neighborhood_id, same as every other connector.
//
// Plain Node assert, no dependencies, same convention as every other test
// file in this project. Run: node test/cron-bagleycommunity.test.js

"use strict";
// Clock pinned (these fixtures name specific calendar dates; see
// test/fixtures/freeze-clock.js). Before the code under test loads.
require("./fixtures/freeze-clock.js").freezeClock("2026-10-08T15:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshConnector() {
  for (const f of [
    "api/cron-bagleycommunity.js",
    "api/_lib/run-log.js",
    "api/_lib/venue-lookup.js",
    "api/_lib/source-slugs.js",
    "api/_lib/status-lookup.js",
  ]) {
    const p = `${REPO_DIR}/${f}`;
    try { delete require.cache[require.resolve(p)]; } catch { /* fine to skip */ }
  }
  return require(`${REPO_DIR}/api/cron-bagleycommunity.js`);
}

const connector = freshConnector();
const {
  parseGeneralMeetingPost,
  parseTier2Post,
  mapTier2Category,
  thirdSaturdayOf,
  parseFirstTime,
  EVENT_LISTING_URL,
  POSTS_URL,
  SOURCE_NAME,
} = connector;

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// =======================================================================
// 1. PARSING UNIT TESTS
// =======================================================================

// thirdSaturdayOf — spot-checked against a real calendar: October 2026's
// first day is a Thursday, so the first Saturday is Oct 3, third Saturday
// is Oct 17. September 2026 starts on a Tuesday — first Saturday Sep 5,
// third Sep 19.
assert.strictEqual(thirdSaturdayOf(2026, 9), "2026-10-17", "third Saturday of October 2026");
assert.strictEqual(thirdSaturdayOf(2026, 8), "2026-09-19", "third Saturday of September 2026");
console.log("PASS: thirdSaturdayOf computes the correct date for two independently-checked months");

// parseFirstTime
assert.deepStrictEqual(parseFirstTime("Third Saturday @ 10:00 a.m."), { hour: 10, minute: 0 });
assert.deepStrictEqual(parseFirstTime("October 31st at 6 p.m."), { hour: 18, minute: 0 });
assert.deepStrictEqual(parseFirstTime("12-4 p.m."), { hour: 12, minute: 0 }, "takes the FIRST time in a range");
assert.strictEqual(parseFirstTime("no time mentioned here"), null);
console.log("PASS: parseFirstTime extracts the first 12-hour time and returns null when none is present");

// --- Tier 1: parseGeneralMeetingPost ---
function eventListingPost({ id = 1, title = "October 2026 General Meeting", date = "2026-10-05T09:00:00", content } = {}) {
  return {
    id,
    date,
    title: { rendered: title },
    content: {
      rendered:
        content ||
        "<p>Please join us on the third Saturday of every month for our General Meeting. " +
        "Third Saturday @ 10:00 a.m. Neighborhood Home Base located at 7426 W. McNichols Rd. (aka Live6 Alliance).</p>",
    },
    link: `https://bagleycommunity.org/event/general-meeting-${id}/`,
  };
}

{
  const row = parseGeneralMeetingPost(eventListingPost({}));
  assert.ok(row, "a real General Meeting post must parse");
  assert.strictEqual(row.external_id, "bagleycc-event-1");
  assert.strictEqual(row.start_date, "2026-10-17", "month from the title, third Saturday computed");
  assert.strictEqual(row.time_display, "10:00 AM");
  assert.strictEqual(row.venue_name_raw, "Neighborhood Home Base");
  assert.strictEqual(row.category, "community");
  assert.strictEqual(row.source, SOURCE_NAME);
}
console.log("PASS: a real General Meeting post parses to the correct third-Saturday date, time, and venue");

{
  // No month named in the title at all — falls back to the post's own
  // publish month/year (September 2026 -> third Saturday Sep 19).
  const row = parseGeneralMeetingPost(eventListingPost({ id: 2, title: "General Meeting", date: "2026-09-10T09:00:00" }));
  assert.ok(row, "a title with no month must still parse via the publish-date fallback");
  assert.strictEqual(row.start_date, "2026-09-19");
}
console.log("PASS: a General Meeting post with no month in its title falls back to its own publish month");

{
  // Confidence-anchored: content that doesn't contain the recurring
  // "third Saturday" template must be skipped, not force-parsed.
  const row = parseGeneralMeetingPost(eventListingPost({ id: 3, content: "<p>The board voted to approve the budget.</p>" }));
  assert.strictEqual(row, null, "content without the known recurring template must be skipped, never guessed");
}
console.log("PASS: event_listing content that doesn't match the known recurring template is skipped, not guessed");

// --- Tier 2: parseTier2Post ---
function post({ id = 10, title, date = "2026-10-20T08:00:00", content = "<p>Some event description.</p>" } = {}) {
  return { id, title: { rendered: title }, content: { rendered: content }, date, link: `https://bagleycommunity.org/${id}/` };
}

{
  // Real confirmed title from the live site.
  const row = parseTier2Post(post({
    id: 11,
    title: "Bagley Community Council Annual Trunk or Treat – October 31st at 6 p.m.",
    date: "2026-10-20T08:00:00",
    content: "<p>It is that time of year again... annual Trunk or Treat on October 31st on Greenlawn St. at Bagley Elementary school. Set up is at 5 p.m. and the activities begin at 6 p.m.</p>",
  }));
  assert.ok(row, "the real confirmed Trunk or Treat title must match");
  assert.strictEqual(row.external_id, "bagleycc-post-11");
  assert.strictEqual(row.start_date, "2026-10-31");
  assert.strictEqual(row.time_display, "6:00 PM");
  assert.strictEqual(row.venue_name_raw, "Bagley Elementary School", "Trunk or Treat resolves to the known Bagley Elementary venue via its own text, not via title-matching 'Bagley'");
  assert.strictEqual(row.category, "family");
}
console.log("PASS: the real Trunk or Treat title parses to the correct date/time/venue/category");

{
  // Real confirmed title from the live site — different shape (day-of-week
  // included, time range instead of single time).
  const row = parseTier2Post(post({
    id: 12,
    title: "Bagley Blooms Tool Shed Reveal – Sunday September 6th 12-4 p.m.",
    date: "2026-08-20T08:00:00",
  }));
  assert.ok(row, "the real confirmed Bagley Blooms title must match");
  assert.strictEqual(row.start_date, "2026-09-06");
  assert.strictEqual(row.time_display, "12:00 PM");
}
console.log("PASS: the real Bagley Blooms title (with day-of-week and a time range) parses correctly");

// Confirmed real NON-event titles from the live site that must NOT match —
// see this connector's own header comment for why these were checked.
const REAL_NON_EVENT_TITLES = [
  "Successful Sidewalk Sale",
  "Maintain The Beautiful Area We Moved Into",
  "Detroit Home Repair Pre-Application Portal is open from September 9 through September 22, 2026",
  "Bagley Community Yard Sale Locations Announced",
  "Detroit Women's Commission Resource Fair & Networking Event",
];
for (const title of REAL_NON_EVENT_TITLES) {
  const row = parseTier2Post(post({ id: 99, title }));
  assert.strictEqual(row, null, `must NOT match (no parseable date in title): "${title}"`);
}
console.log("PASS: all confirmed real non-event titles from the live site correctly fail to match Tier 2's pattern");

{
  // General Meeting dupe exclusion — even if some future General Meeting
  // post happened to also carry a dash-dated title shape, it must never be
  // double-ingested via Tier 2.
  const row = parseTier2Post(post({ id: 13, title: "General Meeting – October 17th at 10 a.m." }));
  assert.strictEqual(row, null, "a title containing 'General Meeting' must be excluded from Tier 2 — already covered by Tier 1, never duplicated");
}
console.log("PASS: a General Meeting-titled post is excluded from Tier 2 (no self-duplication with Tier 1)");

{
  // Unknown venue — never guessed, left null, but the row is still written
  // (a null venue means "real event, unconfirmed location," not "drop it").
  const row = parseTier2Post(post({
    id: 14,
    title: "Bagley Community Council Neighborhood Cleanup – November 7th at 9 a.m.",
    content: "<p>Join us for a neighborhood cleanup. Meet at the corner.</p>",
  }));
  assert.ok(row, "a plausible one-off event must still parse even with no identifiable venue");
  assert.strictEqual(row.venue_name_raw, null, "an unmatched venue must be left null, never guessed");
}
console.log("PASS: a real one-off event with no identifiable venue is still written, with venue left null rather than guessed");

// mapTier2Category
assert.strictEqual(mapTier2Category("Bagley Community Yard Sale", ""), "vendor");
assert.strictEqual(mapTier2Category("Annual Trunk or Treat", ""), "family");
assert.strictEqual(mapTier2Category("Neighborhood Cleanup", ""), "community", "default category, not force-fit into anything else");
console.log("PASS: mapTier2Category applies narrow keyword overrides before defaulting to community");

// =======================================================================
// 2. HANDLER INTEGRATION TESTS
// =======================================================================

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    let body = null;
    if (opts.body) { try { body = JSON.parse(opts.body); } catch { body = opts.body; } }
    calls.push({ url, method, body });

    if (url === EVENT_LISTING_URL) return routes.eventListing ? routes.eventListing() : { ok: true, status: 200, json: async () => [] };
    if (url === POSTS_URL) return routes.posts ? routes.posts() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/venues")) {
      return routes.venues
        ? routes.venues()
        : {
            ok: true,
            status: 200,
            json: async () => [
              { id: "venue-fitzgerald-home-base", name: "Neighborhood Home Base" },
              { id: "venue-bagley-elementary", name: "Bagley Elementary School" },
            ],
          };
    }
    if (url.includes("/rest/v1/source_runs") && method === "POST") return routes.runInsert ? routes.runInsert() : { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && method === "PATCH") return routes.runUpdate ? routes.runUpdate() : { ok: true, status: 204, json: async () => ({}) };
    if (url.includes("/rest/v1/events") && method === "GET") return routes.statusLookup ? routes.statusLookup() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && method === "POST") return routes.upsert ? routes.upsert() : strictWriteResponse(url, opts);
    throw new Error("unmocked URL in test: " + method + " " + url);
  };
  return { fetchFn, calls };
}

function patchCalls(calls) {
  return calls.filter((c) => c.url.includes("/rest/v1/source_runs") && c.method === "PATCH");
}
function upsertBody(calls) {
  const c = calls.find((c) => c.url.includes("/rest/v1/events") && c.method === "POST");
  return c ? c.body : null;
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- A. THE critical correctness property: a General Meeting event
  //     resolves venue_id to Neighborhood Home Base — and this connector
  //     never writes a neighborhood_id, source text match, or anything
  //     else that could put it in Bagley instead. Neighborhood is left to
  //     be inherited downstream via venue_id -> venues.neighborhood_id
  //     (Fitzgerald), exactly like every other connector in this project. ---
  {
    const handler = freshConnector();
    const { fetchFn, calls } = makeMockFetch({
      eventListing: () => ({ ok: true, status: 200, json: async () => [eventListingPost({ id: 1 })] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    const body = upsertBody(calls);
    assert.ok(body && body.length === 1);
    assert.strictEqual(body[0].venue_id, "venue-fitzgerald-home-base", "General Meeting must resolve to the Neighborhood Home Base venue row");
    assert.strictEqual(body[0].venue_name_raw, "Neighborhood Home Base");
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(body[0], "neighborhood_id"),
      false,
      "this connector must never set events.neighborhood_id directly — neighborhood is inherited only via venue_id, never by source/title text"
    );
    assert.ok(body[0].source === "Bagley Community Council", "source reads Bagley Community Council even though the venue is NOT in the Bagley neighborhood");
  }
  console.log("PASS: a General Meeting event resolves to Neighborhood Home Base (Fitzgerald), with no neighborhood_id or Bagley-text-matching written directly");

  // --- B. A Trunk-or-Treat-style Tier 2 event resolves to Bagley
  //     Elementary School — the genuinely-in-Bagley venue — proving venue
  //     resolution is driven by the event's own content, not by the
  //     organizing council's name. ---
  {
    const handler = freshConnector();
    const { fetchFn, calls } = makeMockFetch({
      posts: () => ({
        ok: true,
        status: 200,
        json: async () => [post({
          id: 21,
          title: "Bagley Community Council Annual Trunk or Treat – October 31st at 6 p.m.",
          date: "2026-10-20T08:00:00",
          content: "<p>...annual Trunk or Treat on October 31st on Greenlawn St. at Bagley Elementary school...</p>",
        })],
      }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    const body = upsertBody(calls);
    assert.ok(body && body.length === 1);
    assert.strictEqual(body[0].venue_id, "venue-bagley-elementary");
    assert.strictEqual(body[0].venue_name_raw, "Bagley Elementary School");
  }
  console.log("PASS: Trunk or Treat resolves to Bagley Elementary School, the venue genuinely inside the Bagley boundary");

  // --- C. Non-regression: scanning this connector's own source file text
  //     confirms there is no code path that sets neighborhood based on the
  //     word "Bagley" appearing in a title, source, or address — the exact
  //     Bagley-Street-vs-Bagley-neighborhood confusion the Product Owner
  //     explicitly warned against. ---
  {
    const src = fs.readFileSync(`${REPO_DIR}/api/cron-bagleycommunity.js`, "utf8");
    assert.ok(!/neighborhood_id\s*[:=]/.test(src), "cron-bagleycommunity.js must never assign events.neighborhood_id directly");
    assert.ok(!/includes\(["']bagley["']\)/i.test(src), "cron-bagleycommunity.js must never branch on a 'bagley' substring match");
  }
  console.log("PASS: static check confirms no direct neighborhood_id assignment and no 'bagley'-substring branching anywhere in the connector");

  // --- D. Both tiers combined, category defaulting, telemetry success ---
  {
    const handler = freshConnector();
    const { fetchFn, calls } = makeMockFetch({
      eventListing: () => ({ ok: true, status: 200, json: async () => [eventListingPost({ id: 2 })] }),
      posts: () => ({
        ok: true,
        status: 200,
        json: async () => [
          post({ id: 22, title: "Bagley Community Council Annual Trunk or Treat – October 31st at 6 p.m.", date: "2026-10-20T08:00:00" }),
          post({ id: 23, title: "Successful Sidewalk Sale" }), // must not match, excluded from counts
        ],
      }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 2, "one Tier 1 + one matching Tier 2 row; the non-matching post is silently excluded, not an error");
    assert.strictEqual(res._body.tier1, 1);
    assert.strictEqual(res._body.tier2, 1);

    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success");
    assert.strictEqual(patches[0].body.records_written, 2);
  }
  console.log("PASS: a combined Tier 1 + Tier 2 run upserts both and logs source_runs outcome=success");

  // --- E. Both endpoints fail -> outcome=failed, HTTP 200 response (same
  //     "don't crash the cron invocation itself" convention as every other
  //     connector) with an honest error note. ---
  {
    const handler = freshConnector();
    const { fetchFn, calls } = makeMockFetch({
      eventListing: () => ({ ok: false, status: 500, text: async () => "upstream error" }),
      posts: () => ({ ok: false, status: 500, text: async () => "upstream error" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "failed");
  }
  console.log("PASS: both endpoints failing logs source_runs outcome=failed with zero writes");

  // --- E2. Eligibility floor: unlike most sources in this project,
  //     /wp-json/wp/v2/posts is the site's whole blog history, not a
  //     pre-filtered "upcoming" feed (confirmed live -- ordinary browsing
  //     of this endpoint returns posts well over a year old). A long-past
  //     post with a Tier-2-shaped title must be excluded as stale, not
  //     re-upserted as if it were still upcoming. ---
  {
    const handler = freshConnector();
    const { fetchFn, calls } = makeMockFetch({
      posts: () => ({
        ok: true,
        status: 200,
        json: async () => [
          post({ id: 31, title: "Right to Counsel Public Meeting – March 5th", date: "2026-02-24T09:00:00" }), // real title shape, long-past event
          post({ id: 32, title: "Bagley Community Council Annual Trunk or Treat – October 31st at 6 p.m.", date: "2026-10-20T08:00:00" }), // still upcoming
        ],
      }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1, "only the still-upcoming event should be written");
    assert.strictEqual(res._body.excludedAsPast, 1, "the stale event must be reported as excluded, not silently dropped");
    const body = upsertBody(calls);
    assert.ok(!body.some((r) => r.external_id === "bagleycc-post-31"), "a long-past event must never be upserted");
  }
  console.log("PASS: a long-past post (this source's blog stream is not pre-filtered to upcoming) is excluded as stale, and the exclusion is reported, not silent");

  // --- F. One endpoint fails, the other succeeds -> outcome=partial,
  //     still writes what it could. ---
  {
    const handler = freshConnector();
    const { fetchFn, calls } = makeMockFetch({
      eventListing: () => ({ ok: true, status: 200, json: async () => [eventListingPost({ id: 3 })] }),
      posts: () => ({ ok: false, status: 500, text: async () => "upstream error" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "partial", "one tier succeeding and the other failing is a partial run, not a clean success or a total failure");
  }
  console.log("PASS: one endpoint failing while the other succeeds logs outcome=partial and still writes the successful tier's rows");

  // --- G. Status-preserving upsert: an existing rejected row must stay
  //     rejected on re-run, same WP 0.17 fail-closed convention as every
  //     other connector. ---
  {
    const handler = freshConnector();
    const { fetchFn, calls } = makeMockFetch({
      eventListing: () => ({ ok: true, status: 200, json: async () => [eventListingPost({ id: 4 })] }),
      statusLookup: () => ({ ok: true, status: 200, json: async () => [{ external_id: "bagleycc-event-4", status: "rejected", description: null }] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const body = upsertBody(calls);
    assert.strictEqual(body[0].status, "rejected", "a moderator's rejected decision must survive a re-run, not be reset to approved");
  }
  console.log("PASS: an existing rejected row's status survives a re-run (status-preserving upsert)");

  // --- H. Fail-closed status lookup: a failed status lookup must abort the
  //     whole run (HTTP 502, zero writes) rather than silently defaulting
  //     every row back to approved. ---
  {
    const handler = freshConnector();
    const { fetchFn, calls } = makeMockFetch({
      eventListing: () => ({ ok: true, status: 200, json: async () => [eventListingPost({ id: 5 })] }),
      statusLookup: () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 502);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "failed");
  }
  console.log("PASS: a failed status lookup aborts the run entirely (fail-closed, zero writes) rather than defaulting status");

  console.log("\nAll cron-bagleycommunity.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
