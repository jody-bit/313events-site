// test/cron-feeds-category.test.js — per-event category derivation for the
// generic ICS pipeline (2026-09-29 correction, see FEED_SUBMISSIONS.md's
// "Production track record" and api/cron-feeds.js's icsEventsToRows()).
//
// Contract under test:
//   category: extractCategory(ev.summary, ev.description) || feedSource.default_category
// reusing scripts/press-coverage-linking.js's existing extractCategory()
// UNCHANGED — this suite does not touch CATEGORY_KEYWORDS, does not add
// community/gaming rules, does not reorder dance/family, and does not lock
// in the exact category of all 30 real Congregation production events (the
// shared taxonomy/keyword list is expected to evolve; only the CONTRACT —
// confident match wins, no match falls back to the feed's own default — is
// pinned here, via a representative handful of fixtures).
//
// Run: node test/cron-feeds-category.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ics-location.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/press-coverage-linking.js`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

function icsEscape(str) {
  return str.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

// Builds one VEVENT with SUMMARY (+ optional DESCRIPTION/LOCATION), same
// shape as test/cron-feeds-location-per-event.test.js's own helper.
function icsFor(summary, uid, { description, location } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTART:20261201T190000Z",
    `SUMMARY:${icsEscape(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  if (location) lines.push(`LOCATION:${icsEscape(location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

function baseMocks({ feedSources, venues = [], icsText }) {
  return async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => feedSources };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => venues };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
    if (url === "https://feed.example/cal.ics") return { ok: true, status: 200, text: async () => icsText };
    if (url.includes("/rest/v1/events") && opts.method === "POST") {
      baseMocks._capturedUpsertBody = JSON.parse(opts.body);
      return { ok: true, status: 201, text: async () => "" };
    }
    throw new Error("unmocked URL: " + url);
  };
}

async function runOne({ feedSources, venues, icsText }) {
  const handler = freshHandler();
  global.fetch = baseMocks({ feedSources, venues, icsText });
  const res = makeRes();
  await handler({ headers: {} }, res);
  assert.strictEqual(res._status, 200, "handler should return 200 for a healthy poll");
  return baseMocks._capturedUpsertBody;
}

const SINGLE_VENUE_FEED = {
  id: "fs-single",
  venue_name: "Trinosophes",
  default_category: "nightlife",
  feed_url: "https://feed.example/cal.ics",
  feed_format: "ics",
  status: "approved",
  location_per_event: false,
};

const AGGREGATOR_FEED = {
  id: "fs-agg",
  venue_name: "Tourism Windsor Essex",
  default_category: "nightlife",
  feed_url: "https://feed.example/cal.ics",
  feed_format: "ics",
  status: "approved",
  location_per_event: true,
};

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 1. A confident derived category overrides the feed's own default. ---
  {
    const icsText = icsFor("New Gallery Opening", "evt-visual", {
      description: "Join us for an exhibition opening reception in our gallery space.",
    });
    const rows = await runOne({ feedSources: [SINGLE_VENUE_FEED], venues: [], icsText });
    assert.strictEqual(rows[0].category, "visual", "a confident keyword match must override feedSource.default_category");
    assert.notStrictEqual(rows[0].category, SINGLE_VENUE_FEED.default_category);
  }
  console.log("PASS: a confident derived category overrides the feed's own default_category");

  // --- 2. No confident result falls back to default_category (never null,
  //     never invented). ---
  {
    const icsText = icsFor("Norm and Sandy | Live", "evt-fallback", {
      description: "An evening with Norm and Sandy at our place, doors at 7.",
    });
    const rows = await runOne({ feedSources: [SINGLE_VENUE_FEED], venues: [], icsText });
    assert.strictEqual(rows[0].category, SINGLE_VENUE_FEED.default_category, "no confident keyword match must fall back exactly to feedSource.default_category");
    assert.notStrictEqual(rows[0].category, null);
  }
  console.log("PASS: no confident keyword match falls back exactly to feedSource.default_category");

  // --- 3. Identical behavior whether location_per_event is true or false —
  //     category derivation doesn't depend on which venue-resolution branch
  //     ran. Same title/description through both feed shapes. ---
  {
    const title = "Free Film Screening Night";
    const description = "A community screening of a locally made documentary.";
    const singleVenueRows = await runOne({
      feedSources: [SINGLE_VENUE_FEED],
      venues: [],
      icsText: icsFor(title, "evt-film-single", { description }),
    });
    const aggregatorRows = await runOne({
      feedSources: [AGGREGATOR_FEED],
      venues: [],
      icsText: icsFor(title, "evt-film-agg", { description, location: "Some Hall, 1 Main St, Windsor, ON, N9A 1A1, Canada" }),
    });
    assert.strictEqual(singleVenueRows[0].category, "film");
    assert.strictEqual(aggregatorRows[0].category, "film");
    assert.strictEqual(singleVenueRows[0].category, aggregatorRows[0].category, "category derivation must be identical regardless of location_per_event");
  }
  console.log("PASS: category derivation is identical whether location_per_event is true or false");

  // --- 4. Representative real Congregation fixtures (titles/descriptions as
  //     actually captured in production 2026-09-29) — workshop -> training,
  //     market -> vendor, cinema -> film, and a genuine no-signal fallback.
  //     Deliberately NOT asserting the full 30-event distribution — only
  //     these few, so the shared taxonomy can evolve without fossilizing
  //     today's exact result. ---
  const congregationFeed = { ...SINGLE_VENUE_FEED, id: "fs-congregation", venue_name: "The Congregation", default_category: "nightlife" };
  {
    const rows = await runOne({
      feedSources: [congregationFeed],
      venues: [],
      icsText: icsFor("Nail Art Workshop Hosted by REDD's Nails", "evt-nail-workshop", {
        description: "Drop-in Nail Art Workshop hosted by REDD's Nails. No experience needed. Supplies provided.",
      }),
    });
    assert.strictEqual(rows[0].category, "training");
  }
  {
    const rows = await runOne({
      feedSources: [congregationFeed],
      venues: [],
      icsText: icsFor("Wednesday Night Markets @ The Congregation", "evt-night-market", {
        description: "Join us every Wednesday evening for our Night Market, hosted by Ryan Brown & Co.",
      }),
    });
    assert.strictEqual(rows[0].category, "vendor");
  }
  {
    const rows = await runOne({
      feedSources: [congregationFeed],
      venues: [],
      icsText: icsFor("Detroit New Wave - The Rise of Cinema Culture in Metro Detroit - Part 3", "evt-cinema-culture", {
        description: "Cinema, community, connection. Our three-part series creates a space for Metro Detroit filmmakers.",
      }),
    });
    assert.strictEqual(rows[0].category, "film");
  }
  {
    const rows = await runOne({
      feedSources: [congregationFeed],
      venues: [],
      icsText: icsFor("Donation Based Yoga @ The Congregation", "evt-yoga-fallback", {
        description: "Join us every Saturday at 9:00 am for donation-based yoga with rotating teachers. Rain or shine!",
      }),
    });
    assert.strictEqual(rows[0].category, "nightlife", "a genuinely unmatched real Congregation title/description must fall back to the feed's own default, not be forced into a guessed bucket");
  }
  console.log("PASS: representative real Congregation fixtures derive workshop/market/film categories and a genuine no-signal fallback");

  console.log("\nAll cron-feeds.js per-event category derivation tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
