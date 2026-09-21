// test/cron-feeds-venue-repair.test.js — SH.1 (Metadata Self-Healing).
//
// Demonstrates the "newly ingested event can receive known venue
// address/city" half of SH.1's required dual demonstration (Product
// Owner's 2026-09-21 review, refinement 7). cron-feeds.js is the
// integration point: unlike every single-venue cron, it already resolves
// venue_id per row from feedSource.venue_name via
// api/_lib/venue-lookup.js's resolveVenueId, but — before this change —
// never populated venue_address_raw/venue_city_raw even when that same
// venue's address/city was already known to 313.events. This proves the
// SH.1 repair now fills those fields end-to-end through the real handler,
// with a mocked Supabase/fetch layer (same approach as the WP 0.5
// *-runlog.test.js files), and that it still correctly leaves an
// unresolvable venue's fields blank rather than guessing.
//
// Run: node test/cron-feeds-venue-repair.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
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

function icsFor(summary, uid) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTART:20261201T190000Z",
    `SUMMARY:${summary}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 1. a feed's venue exactly matches an existing canonical venue ->
  //     venue_address_raw/venue_city_raw get filled in automatically ---
  {
    const handler = freshHandler();
    const feedSources = [
      { id: "fs1", venue_name: "The Loft", default_category: "music", feed_url: "https://theloft.example/cal.ics", feed_format: "ics", status: "approved" },
    ];
    const venues = [{ id: "v1", name: "The Loft", address: "123 Main St", city: "Detroit" }];
    let capturedUpsertBody = null;

    global.fetch = async (url, opts = {}) => {
      if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => feedSources };
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => venues };
      if (url === "https://theloft.example/cal.ics") return { ok: true, status: 200, text: async () => icsFor("Open Mic Night", "evt-1") };
      if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/events") && opts.method === "POST") {
        capturedUpsertBody = JSON.parse(opts.body);
        return { ok: true, status: 201, text: async () => "" };
      }
      throw new Error("unmocked URL: " + url);
    };

    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(capturedUpsertBody) && capturedUpsertBody.length === 1);
    const row = capturedUpsertBody[0];
    assert.strictEqual(row.venue_id, "v1", "exact canonical venue_name match should also resolve venue_id, same as before this change");
    assert.strictEqual(row.venue_address_raw, "123 Main St", "SH.1 should fill venue_address_raw from the matching canonical venue");
    assert.strictEqual(row.venue_city_raw, "Detroit", "SH.1 should fill venue_city_raw from the matching canonical venue");
    // Unrelated fields must still be exactly what this connector always produced.
    assert.strictEqual(row.title, "Open Mic Night");
    assert.strictEqual(row.status, "approved");
  }
  console.log("PASS: a feed venue that exactly matches a canonical venue gets venue_address_raw/venue_city_raw filled automatically");

  // --- 2. a feed's venue does NOT match anything known -> fields stay
  //     null, no guessing, ingestion still succeeds normally ---
  {
    const handler = freshHandler();
    const feedSources = [
      { id: "fs2", venue_name: "Totally Unknown Pop-Up Space", default_category: "art", feed_url: "https://unknown.example/cal.ics", feed_format: "ics", status: "approved" },
    ];
    let capturedUpsertBody = null;

    global.fetch = async (url, opts = {}) => {
      if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => feedSources };
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] }; // no canonical venues at all
      if (url === "https://unknown.example/cal.ics") return { ok: true, status: 200, text: async () => icsFor("Pop-Up Show", "evt-2") };
      if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/events") && opts.method === "POST") {
        capturedUpsertBody = JSON.parse(opts.body);
        return { ok: true, status: 201, text: async () => "" };
      }
      throw new Error("unmocked URL: " + url);
    };

    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    const row = capturedUpsertBody[0];
    assert.strictEqual(row.venue_id, null);
    assert.strictEqual(row.venue_address_raw, null, "an unresolvable venue must stay null, never a guess");
    assert.strictEqual(row.venue_city_raw, null);
  }
  console.log("PASS: an unresolvable feed venue leaves venue_address_raw/venue_city_raw null (no fuzzy guessing), ingestion still succeeds");

  console.log("\nAll cron-feeds.js SH.1 ingestion-time repair tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
