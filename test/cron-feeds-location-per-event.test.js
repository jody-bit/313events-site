// test/cron-feeds-location-per-event.test.js — Phase 6 per-event
// venue-resolution shared infrastructure (2026-09-29).
//
// Demonstrates, end-to-end through the real cron-feeds.js handler with a
// mocked Supabase/fetch layer (same approach as
// test/cron-feeds-venue-repair.test.js), the full
//   VEVENT LOCATION -> normalize -> venue resolver -> canonical venue when
//   confidently matched -> honest raw venue/location when unmatched
// pipeline, and — the specific regression this suite was written to
// guard — that a feed_source's own organization name is NEVER substituted
// for a real per-event location, in any of location_per_event's four
// distinct outcomes (canonical match / honest unmatched candidate / blank
// / unparseable-but-real).
//
// Run: node test/cron-feeds-location-per-event.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ics-location.js`)];
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

// Builds one VEVENT with an optional LOCATION line, folded/escaped the
// same way a real ICS export would be. `location` is passed through
// RFC 5545 TEXT escaping (backslash-escaping commas/semicolons) so this
// exercises the exact same unescape path a real feed does — the test
// fixtures below are written as the ALREADY-unescaped text a human would
// read, matching how the real captured samples were documented.
function icsEscape(str) {
  return str.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsFor(summary, uid, location) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTART:20261201T190000Z",
    `SUMMARY:${summary}`,
  ];
  if (location !== undefined && location !== null) {
    lines.push(`LOCATION:${icsEscape(location)}`);
  }
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

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  const AGGREGATOR_FEED = {
    id: "fs-agg",
    venue_name: "Tourism Windsor Essex", // an ORGANIZATION, not a venue -- must never land in venue_name_raw below
    default_category: "community",
    feed_url: "https://feed.example/cal.ics",
    feed_format: "ics",
    status: "approved",
    location_per_event: true,
  };

  // --- 1. Backward compatibility: location_per_event absent/false ->
  //     byte-identical legacy behavior. A VEVENT LOCATION is present but
  //     must be completely IGNORED — venue_name_raw stays the feed's own
  //     venue_name, exactly as every already-approved single-venue feed
  //     (Trinosophes-style) has always worked. This is the core
  //     regression guard: nothing already live changes. ---
  {
    const feedSources = [{ ...AGGREGATOR_FEED, id: "fs-legacy", location_per_event: false, venue_name: "Trinosophes" }];
    const icsText = icsFor("Open Mic Night", "evt-legacy", "Some Other Room, 123 Elsewhere St");
    const rows = await runOne({ feedSources, venues: [], icsText });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].venue_name_raw, "Trinosophes", "location_per_event=false must keep using feedSource.venue_name, ignoring VEVENT LOCATION entirely");
  }
  console.log("PASS: location_per_event=false (default) is byte-identical to legacy single-venue behavior");

  // --- 2. location_per_event=true, LOCATION confidently resolves to a
  //     canonical venue -> canonical venue's own name/address/city/id are
  //     used, never the feed organization's name. ---
  {
    const venues = [{ id: "v-capitol", name: "The Capitol Theatre", address: "121 University Ave. W.", city: "Windsor" }];
    const icsText = icsFor(
      "Fall Gala Concert",
      "evt-canonical",
      "The Capitol Theatre, 121 University Ave. W., Windsor, ON, N9A 5P4, Canada"
    );
    const rows = await runOne({ feedSources: [AGGREGATOR_FEED], venues, icsText });
    const row = rows[0];
    assert.strictEqual(row.venue_id, "v-capitol");
    assert.strictEqual(row.venue_name_raw, "The Capitol Theatre");
    assert.strictEqual(row.venue_address_raw, "121 University Ave. W.");
    assert.strictEqual(row.venue_city_raw, "Windsor");
    assert.notStrictEqual(row.venue_name_raw, "Tourism Windsor Essex");
  }
  console.log("PASS: a confidently-parsed LOCATION resolves to its canonical venue, never the feed organization's name");

  // --- 3. location_per_event=true, LOCATION parses into a structured
  //     candidate but matches no canonical venue -> the honest PARSED
  //     candidate is preserved (not "Venue TBA", not the feed org name). ---
  {
    const icsText = icsFor(
      "Vendor Pop-Up",
      "evt-unmatched",
      "Some Brand New Spot, 42 Fresh Ave, Windsor, ON, N9A 1A1, Canada"
    );
    const rows = await runOne({ feedSources: [AGGREGATOR_FEED], venues: [], icsText });
    const row = rows[0];
    assert.strictEqual(row.venue_id, null);
    assert.strictEqual(row.venue_name_raw, "Some Brand New Spot");
    assert.strictEqual(row.venue_address_raw, "42 Fresh Ave");
    assert.strictEqual(row.venue_city_raw, "Windsor");
    assert.notStrictEqual(row.venue_name_raw, "Venue TBA");
    assert.notStrictEqual(row.venue_name_raw, "Tourism Windsor Essex");
  }
  console.log("PASS: a parsed-but-unmatched LOCATION preserves the honest candidate name/address/city, never Venue TBA or the feed org name");

  // --- 4. location_per_event=true, LOCATION blank/missing -> Venue TBA,
  //     never the feed organization's name (there's truly no per-event
  //     signal at all here, so this is the one case where TBA is
  //     correct). ---
  {
    const icsText = icsFor("Mystery Meetup", "evt-blank", null); // no LOCATION line at all
    const rows = await runOne({ feedSources: [AGGREGATOR_FEED], venues: [], icsText });
    const row = rows[0];
    assert.strictEqual(row.venue_id, null);
    assert.strictEqual(row.venue_name_raw, "Venue TBA");
    assert.notStrictEqual(row.venue_name_raw, "Tourism Windsor Essex");
  }
  console.log("PASS: a blank/missing LOCATION falls back to Venue TBA, never the feed organization's name");

  // --- 5. THE REQUIRED REGRESSION TEST: real Royal Oak "Downtown Events"
  //     LOCATION (romi.gov, captured live 2026-09-29) — present, real,
  //     human-written location text that matches neither recognized
  //     grammar. Must survive, sanitized, as venue_name_raw — NOT become
  //     "Venue TBA" and NOT become the feed organization's own name. ---
  {
    const feedSources = [{ ...AGGREGATOR_FEED, id: "fs-royaloak", venue_name: "City of Royal Oak" }];
    // Real raw LOCATION text as captured (already reflects ICS unescaping
    // of the live feed's own \, escaping); icsFor() re-escapes it for the
    // wire, exactly mirroring what romi.gov's real feed transmits.
    const realLocationText =
      "<p>Meet at Pronto/Five 15: 600 S Washington Ave, Royal Oak, MI 48067</p> -   Royal Oak MI 48067";
    const icsText = icsFor("Downtown Royal Oak Small Business Tours", "evt-8570", realLocationText);
    const rows = await runOne({ feedSources, venues: [], icsText });
    const row = rows[0];
    assert.strictEqual(row.venue_id, null);
    assert.notStrictEqual(row.venue_name_raw, "Venue TBA", "a present, real, unparseable LOCATION must NOT collapse to Venue TBA");
    assert.notStrictEqual(row.venue_name_raw, "City of Royal Oak", "a present, real, unparseable LOCATION must NOT be replaced by the feed organization's own name");
    assert.ok(!row.venue_name_raw.includes("<p>") && !row.venue_name_raw.includes("</p>"), "HTML markup must not survive into the published field");
    assert.strictEqual(
      row.venue_name_raw,
      "Meet at Pronto/Five 15: 600 S Washington Ave, Royal Oak, MI 48067 - Royal Oak MI 48067",
      "the real, useful location text must survive sanitized rather than being discarded"
    );
  }
  console.log("PASS: the real Royal Oak unparseable-LOCATION fixture survives sanitized as venue_name_raw, not Venue TBA and not the feed org name (required regression test)");

  // --- 6. Duplicate-safety: external_id construction is unaffected by
  //     location_per_event — still scoped by feed_source_id + UID
  //     regardless of which venue-resolution branch ran. ---
  {
    const rows = await runOne({
      feedSources: [AGGREGATOR_FEED],
      venues: [],
      icsText: icsFor("Repeat Event", "evt-dedupe-check", "Venue Name, 1 Some St, Windsor, ON, N9A 1A1, Canada"),
    });
    assert.strictEqual(rows[0].external_id, "feed-fs-agg-evt-dedupe-check");
  }
  console.log("PASS: external_id construction is unchanged by location_per_event (dedup key untouched)");

  console.log("\nAll cron-feeds.js per-event location resolution tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
