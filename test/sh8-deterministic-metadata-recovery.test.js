// test/sh8-deterministic-metadata-recovery.test.js — SH.8 (Metadata
// Self-Healing).
//
// Covers cron-cinema-detroit.js's SH.8 addition: event_url recovered from
// page.link, WordPress core REST API's own canonical permalink field on
// every fetched `pages` object (the same guarantee title.rendered/
// content.rendered already rely on) — never fabricated when absent, and
// never overwriting an existing nonblank value a moderator may have set
// by hand via admin.html's update_fields (the same WP 0.7-class hazard
// SH.4 already guarded against for cron-metrotimes.js's address/city).
//
// SH.8's discovery pass evaluated five candidate fields across three
// connectors (Cinema Detroit description + event_url, Metro Times
// og:description, WDET description + venue address) and excluded four of
// them for lack of demonstrable source evidence — this connector's own
// event_url is the only field implemented. See EPIC-006's SH.8 note for
// the full exclusion reasoning.
//
// Two layers, same convention as test/cron-metrotimes-sh4.test.js:
//   1. parsePage() directly — pure extraction unit tests.
//   2. the full handler with a mocked Supabase/fetch layer — proves the
//      existing-value-wins precedence and every other required behavior
//      end to end.
//
// Run: node test/sh5-deterministic-metadata-recovery.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const API_URL = "https://cinemadetroit.org/wp-json/wp/v2/pages?per_page=100&status=publish";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-cinema-detroit.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  return require(`${REPO_DIR}/api/cron-cinema-detroit.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// Divi shortcode content with an embedded "Weekday, Month D, YYYY | H:MM a.m/p.m."
// string — the same fixture shape test/cron-cinema-detroit-runlog.test.js
// already uses, plus an optional `link` (WP core REST API's own permalink
// field on every page object).
function divPage({ id, title = "A Film", dateLine = "Saturday, December 5, 2026 | 3:30 p.m.", link }) {
  const page = {
    id,
    title: { rendered: title },
    content: { rendered: `[et_pb_section][et_pb_row][et_pb_text]${dateLine}[/et_pb_text][/et_pb_row][/et_pb_section]` },
  };
  if (link !== undefined) page.link = link;
  return page;
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url === API_URL) return routes.source();
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return routes.runInsert ? routes.runInsert() : { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return routes.runUpdate ? routes.runUpdate() : { ok: true, status: 204, json: async () => ({}) };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return routes.statusLookup ? routes.statusLookup() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && opts.method === "POST") {
      if (routes.upsertCapture) routes.upsertCapture.body = JSON.parse(opts.body);
      return routes.upsert ? routes.upsert() : { ok: true, status: 201, text: async () => "" };
    }
    throw new Error("unmocked URL in test: " + url + " " + (opts.method || "GET"));
  };
  return { fetchFn, calls };
}

async function run() {
  const { parsePage } = freshHandler();

  // ===== Layer 1: parsePage() direct unit tests =====

  // --- 1. page.link present and non-blank -> event_url captured verbatim ---
  {
    const e = parsePage(divPage({ id: 1, link: "https://cinemadetroit.org/a-film/" }));
    assert.strictEqual(e.event_url, "https://cinemadetroit.org/a-film/");
  }
  console.log("PASS: a non-blank page.link is captured verbatim as event_url");

  // --- 2. page.link absent entirely -> event_url null, never fabricated ---
  {
    const e = parsePage(divPage({ id: 1 })); // no `link` key at all
    assert.strictEqual(e.event_url, null);
  }
  console.log("PASS: a missing page.link produces event_url: null, never fabricated from another field");

  // --- 3. page.link present but blank/whitespace-only -> treated as absent ---
  {
    const e1 = parsePage(divPage({ id: 1, link: "" }));
    assert.strictEqual(e1.event_url, null, "an empty page.link must read as absent");
    const e2 = parsePage(divPage({ id: 1, link: "   " }));
    assert.strictEqual(e2.event_url, null, "a whitespace-only page.link must read as absent");
  }
  console.log("PASS: blank/whitespace-only page.link is treated as absent, not a malformed value");

  // --- 4. page.link present but not a string (malformed API response) -> null, no throw ---
  {
    const e = parsePage(divPage({ id: 1, link: 12345 }));
    assert.strictEqual(e.event_url, null);
  }
  console.log("PASS: a non-string page.link degrades safely to null without throwing");

  // --- 5. surrounding fields (title/start_date/time_display) unaffected ---
  {
    const e = parsePage(divPage({ id: 7, title: "Another Film", link: "https://cinemadetroit.org/another-film/" }));
    assert.strictEqual(e.title, "Another Film");
    assert.strictEqual(e.external_id, "cinemadetroit-7");
    assert.strictEqual(e.start_date, "2026-12-05");
    assert.strictEqual(e.time_display, "3:30 p.m.");
    assert.strictEqual(e.event_url, "https://cinemadetroit.org/another-film/");
  }
  console.log("PASS: existing parsePage() fields (title/external_id/start_date/time_display) are unchanged by the SH.8 addition");

  // ===== Layer 2: full handler, mocked Supabase/fetch =====

  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 6. no existing row -> this run's parsed page.link is used ---
  {
    const handler = freshHandler();
    const upsertCapture = {};
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => [divPage({ id: 1, link: "https://cinemadetroit.org/a-film/" })] }),
      statusLookup: () => ({ ok: true, status: 200, json: async () => [] }), // no existing row at all
      upsertCapture,
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200);
    const row = upsertCapture.body[0];
    assert.strictEqual(row.event_url, "https://cinemadetroit.org/a-film/");
    assert.strictEqual(row.status, "approved", "unrelated field (default status) must be unchanged");
    assert.strictEqual(row.category, "film", "unrelated field (category) must be unchanged");
  }
  console.log("PASS: with no existing row, this run's parsed page.link fills event_url");

  // --- 7. existing nonblank event_url (moderator's own correction) is
  //     preserved, never overwritten by a differing freshly-parsed value —
  //     the WP 0.7-class hazard this addition must not introduce ---
  {
    const handler = freshHandler();
    const upsertCapture = {};
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => [divPage({ id: 1, link: "https://cinemadetroit.org/a-film-NEW-URL/" })] }),
      statusLookup: () => ({
        ok: true, status: 200,
        json: async () => [{ external_id: "cinemadetroit-1", status: "approved", event_url: "https://cinemadetroit.org/moderator-corrected-url/" }],
      }),
      upsertCapture,
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    const row = upsertCapture.body[0];
    assert.strictEqual(row.event_url, "https://cinemadetroit.org/moderator-corrected-url/", "an existing nonblank event_url must never be overwritten by this run's freshly-parsed page.link");
    assert.strictEqual(row.status, "approved");
  }
  console.log("PASS: an existing nonblank event_url (e.g. a moderator's manual correction) is preserved, not overwritten");

  // --- 8. existing row has a blank/null event_url -> this run's parsed
  //     value fills it (existing blank does not block the fill) ---
  {
    const handler = freshHandler();
    const upsertCapture = {};
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => [divPage({ id: 1, link: "https://cinemadetroit.org/a-film/" })] }),
      statusLookup: () => ({
        ok: true, status: 200,
        json: async () => [{ external_id: "cinemadetroit-1", status: "pending_review", event_url: null }],
      }),
      upsertCapture,
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    const row = upsertCapture.body[0];
    assert.strictEqual(row.event_url, "https://cinemadetroit.org/a-film/", "a blank existing event_url must still be filled from this run's parsed page.link");
    assert.strictEqual(row.status, "pending_review", "existing status must still be preserved unchanged");
  }
  console.log("PASS: an existing blank/null event_url is filled from this run's parsed page.link");

  // --- 9. neither existing value nor page.link available -> event_url
  //     stays null, never guessed ---
  {
    const handler = freshHandler();
    const upsertCapture = {};
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => [divPage({ id: 1 })] }), // no link
      statusLookup: () => ({ ok: true, status: 200, json: async () => [] }),
      upsertCapture,
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    const row = upsertCapture.body[0];
    assert.strictEqual(row.event_url, null);
  }
  console.log("PASS: with no page.link and no existing value, event_url stays null — never guessed");

  // --- 10. lookup request itself fails -> WP 0.17 (2026-09-22): the
  //     shared existing-value/status lookup is now fail-CLOSED, not
  //     fail-soft. A failed lookup must abort the whole run -- zero event
  //     writes, HTTP 502 -- never fall through to this run's parsed value
  //     the way it used to (that fail-soft fallback was itself an
  //     instance of the D7 bug WP 0.17 closes: it could silently reset a
  //     previously-rejected row's status to DEFAULT_STATUS just as easily
  //     as it filled in event_url). ---
  {
    const handler = freshHandler();
    const upsertCapture = {};
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => [divPage({ id: 1, link: "https://cinemadetroit.org/a-film/" })] }),
      statusLookup: () => ({ ok: false, status: 500, json: async () => ({}) }),
      upsertCapture,
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 502, "a failed existing-value/status lookup must now abort with HTTP 502");
    assert.strictEqual(res._body.upserted, 0, "a failed lookup must result in zero event writes");
    const upsertCall = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    assert.strictEqual(upsertCall, undefined, "no POST to /rest/v1/events may occur when the lookup fails");
  }
  console.log("PASS: WP 0.17 -- a failed existing-value/status lookup now aborts with zero event writes and HTTP 502 (no longer fails soft)");

  // --- 11. only one extra select field on the existing lookup request —
  //     no new network request is introduced ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => [divPage({ id: 1, link: "https://cinemadetroit.org/a-film/" })] }),
      statusLookup: () => ({ ok: true, status: 200, json: async () => [] }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    const lookupCalls = calls.filter((c) => c.url.includes("/rest/v1/events") && (!c.opts.method || c.opts.method === "GET"));
    assert.strictEqual(lookupCalls.length, 1, "exactly one existing-value lookup request, same as before SH.8");
    assert.ok(lookupCalls[0].url.includes("select=external_id,status,event_url"), "event_url is fetched via the same existing request, not a new one");
  }
  console.log("PASS: event_url is fetched via one extra select field on the existing lookup request — no new network call");

  // --- 12. unrelated fields (title, start_date, time_display, venue_id,
  //     venue_name_raw, is_free, source, category) remain exactly what
  //     this connector always produced ---
  {
    const handler = freshHandler();
    const upsertCapture = {};
    const { fetchFn } = makeMockFetch({
      source: () => ({ ok: true, status: 200, json: async () => [divPage({ id: 1, title: "Trivia Night Screening", link: "https://cinemadetroit.org/trivia/" })] }),
      statusLookup: () => ({ ok: true, status: 200, json: async () => [] }),
      upsertCapture,
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    const row = upsertCapture.body[0];
    assert.strictEqual(row.title, "Trivia Night Screening");
    assert.strictEqual(row.venue_name_raw, "Cinema Detroit");
    assert.strictEqual(row.category, "film");
    assert.strictEqual(row.is_free, false);
    assert.strictEqual(row.source, "Cinema Detroit");
    assert.strictEqual(row.start_date, "2026-12-05");
    assert.strictEqual(row.time_display, "3:30 p.m.");
    assert.strictEqual(row.description, undefined, "description is explicitly excluded from SH.8 — must never be populated by this WP");
  }
  console.log("PASS: unrelated fields are unaffected, and description remains unpopulated (excluded from SH.8's scope)");

  console.log("\nAll SH.8 (cron-cinema-detroit.js event_url) tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
