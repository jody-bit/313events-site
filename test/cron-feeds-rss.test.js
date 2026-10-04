// test/cron-feeds-rss.test.js — RSS best-effort polling, added 2026-10-03
// (migration_044, Jody: "do we have in the submit form... the multitude of
// ways we are seeing events feeds but being blocked?"). See
// api/cron-feeds.js's own header for the full tradeoff this accepts:
// generic RSS has no reliable event-date semantics, so this is explicitly
// best-effort, never silently as trustworthy as a real ICS DTSTART.
//
// Contract under test:
//   - An item with an explicit, fully-qualified date (month+day+year) in
//     its own title/description is used as-is, lands at the feed's normal
//     trust tier (DEFAULT_STATUS), category derivation reused unchanged.
//   - An item with NO explicit date falls back to its RSS <pubDate>, but
//     is forced to status='pending_review' regardless of the feed's own
//     trust tier, with a visible note asking for human verification.
//   - An item with no date signal at all (no explicit date, no pubDate) is
//     skipped entirely — never guessed at.
//   - An existing row's admin-set status (approved/rejected) is never
//     clobbered by a re-poll, same fail-closed status-lookup guarantee
//     ICS already had (upsertParsedRows is now shared by both).
//
// Run: node test/cron-feeds-rss.test.js
"use strict";
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-feeds.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/ics-location.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/status-lookup.js`)];
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

const RSS_FEED = {
  id: "fs-rss-1",
  venue_name: "Some Blog-Only Venue",
  default_category: "nightlife",
  feed_url: "https://feed.example/rss.xml",
  feed_format: "rss",
  status: "approved",
};

function rssXml(items) {
  const itemXml = items.map((it) => `
    <item>
      <title>${it.title}</title>
      <link>${it.link || "https://example.com/event"}</link>
      <description>${it.description || ""}</description>
      ${it.pubDate ? `<pubDate>${it.pubDate}</pubDate>` : ""}
      ${it.guid ? `<guid>${it.guid}</guid>` : ""}
    </item>`).join("\n");
  return `<?xml version="1.0"?><rss version="2.0"><channel>${itemXml}</channel></rss>`;
}

function baseMocks({ feedSources, rssText, existingEvents = [] }) {
  return async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => feedSources };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) {
      return { ok: true, status: 200, json: async () => existingEvents };
    }
    if (url === "https://feed.example/rss.xml") return { ok: true, status: 200, text: async () => rssText };
    if (url.includes("/rest/v1/events") && opts.method === "POST") {
      baseMocks._capturedUpsertBody = JSON.parse(opts.body);
      return strictWriteResponse(url, opts);
    }
    throw new Error("unmocked URL: " + url);
  };
}

async function runOne({ feedSources, rssText, existingEvents }) {
  // Reset leftover state from a prior call — baseMocks._capturedUpsertBody
  // is a property on the shared named function, not on each returned
  // closure, so a run that produces no upsert at all must not silently
  // inherit the previous run's captured body.
  baseMocks._capturedUpsertBody = undefined;
  const handler = freshHandler();
  global.fetch = baseMocks({ feedSources, rssText, existingEvents });
  const res = makeRes();
  await handler({ headers: {} }, res);
  return { res, rows: baseMocks._capturedUpsertBody };
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 1. An explicit, fully-qualified date in the item's own text is used
  //     and lands at the feed's normal trust tier (approved). ---
  {
    const xml = rssXml([{
      title: "Fall Market",
      description: "Join us on October 15, 2026 for our annual fall market.",
      guid: "rss-fall-market-1",
    }]);
    const { res, rows } = await runOne({ feedSources: [RSS_FEED], rssText: xml });
    assert.strictEqual(res._status, 200);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].start_date, "2026-10-15", "explicit date in text must be used verbatim");
    assert.strictEqual(rows[0].status, "approved", "an explicit-date row lands at the feed's normal (approved) trust tier");
    assert.ok(/auto-extracted/i.test(rows[0].note), "note must disclose the date came from auto-extraction");
  }
  console.log("PASS: an explicit month/day/year date in an RSS item's own text is extracted and trusted at the feed's normal tier");

  // --- 2. No explicit date -> falls back to pubDate, forced to
  //     pending_review regardless of the feed's own approved status, with a
  //     visible low-confidence note. ---
  {
    const xml = rssXml([{
      title: "Weekly Trivia Night",
      description: "Come hang out for trivia, drinks, and prizes.",
      pubDate: "Tue, 03 Oct 2026 14:00:00 GMT",
      guid: "rss-trivia-1",
    }]);
    const { res, rows } = await runOne({ feedSources: [RSS_FEED], rssText: xml });
    assert.strictEqual(res._status, 200);
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].start_date, "pubDate fallback must still produce SOME date, not null");
    assert.strictEqual(rows[0].status, "pending_review", "a pubDate-fallback row must never auto-publish at the feed's normal trust tier");
    assert.ok(/verify/i.test(rows[0].note) && /pubDate|publish date/i.test(rows[0].note), "note must honestly flag this as a low-confidence placeholder needing verification");
  }
  console.log("PASS: no explicit date falls back to pubDate but is forced to pending_review with a visible low-confidence note");

  // --- 3. No date signal at all (no explicit date, no pubDate) -> skipped
  //     entirely, never guessed at. ---
  {
    const xml = rssXml([{
      title: "Mystery Event With No Date Anywhere",
      description: "Some vague teaser copy with no date in it at all.",
      guid: "rss-no-date-1",
    }]);
    const { res, rows } = await runOne({ feedSources: [RSS_FEED], rssText: xml });
    assert.strictEqual(res._status, 200);
    assert.strictEqual(rows, undefined, "an item with no date signal at all must never reach the upsert — nothing to capture");
    assert.strictEqual(res._body.upserted, 0);
  }
  console.log("PASS: an RSS item with no extractable date and no pubDate is skipped entirely, never upserted with a guessed date");

  // --- 4. Re-polling never clobbers an admin's existing approve/reject
  //     decision on a previously-ingested row (status-lookup guard, shared
  //     with ICS via upsertParsedRows). ---
  {
    const xml = rssXml([{
      title: "Fall Market",
      description: "Join us on October 15, 2026 for our annual fall market.",
      guid: "rss-fall-market-1",
    }]);
    const externalId = `feed-${RSS_FEED.id}-rss-fall-market-1`;
    const { rows } = await runOne({
      feedSources: [RSS_FEED],
      rssText: xml,
      existingEvents: [{ external_id: externalId, status: "rejected" }],
    });
    assert.strictEqual(rows[0].status, "rejected", "an admin's prior rejection must survive a re-poll even though this row would otherwise default to approved");
  }
  console.log("PASS: re-polling an RSS feed never clobbers an admin's existing status decision on a known row");

  // --- 5. Category derivation is reused unchanged (extractCategory first,
  //     feed default as fallback) — same contract as the ICS pipeline. ---
  {
    const xml = rssXml([{
      title: "Gallery Opening Reception",
      description: "Join us for an exhibition opening in our gallery space, October 20, 2026.",
      guid: "rss-gallery-1",
    }]);
    const { rows } = await runOne({ feedSources: [RSS_FEED], rssText: xml });
    assert.strictEqual(rows[0].category, "visual", "a confident keyword match must override the feed's own default_category, same as ICS");
  }
  console.log("PASS: category derivation for RSS items reuses the same extractCategory()-then-default contract as ICS");

  console.log("\nAll cron-feeds.js RSS best-effort polling tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
