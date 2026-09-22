// test/cron-redford-theatre-runlog.test.js — WP 0.5 Batch 2.
//
// Redford Theatre's parser (parseRedfordEvents / parseDateLine / findDates /
// findTimes) is treated as immutable for this WP -- see cron-redford-theatre.js's
// own 2026-09-16 rewrite header comment -- this suite only exercises the
// run-log wrapper around it, never its parsing rules. Like Dossin/HALO, the
// parser produces final event objects directly with no separate "raw
// candidate" stage, so records_fetched is always null by design, and there
// is no fetched>0/parsed=0 case or malformed-upstream-response case this
// connector's architecture can produce -- both intentionally omitted.
//
// Plain Node assert, no dependencies.
// Run: node test/cron-redford-theatre-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SOURCE_URL = "https://redfordtheatre.com/events/";

function freshHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-redford-theatre.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  return require(`${REPO_DIR}/api/cron-redford-theatre.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// A title line followed by a single-date/time line -- the simplest shape
// parseDateLine handles (see its own header comment for the other shapes).
function redfordEventHtml({ title = "A Classic Film (1985)", dateLine = "Friday, August 28 at 8:00 PM" } = {}) {
  return `<div>${title}</div><div>${dateLine}</div>`;
}

// 2026-09-22, Needs-Follow-up reduction: the archive page's REAL markup for
// each listing -- confirmed live via direct DOM inspection (32/32 current
// listings share this exact structure). extractEventUrls() reads this
// shape specifically; the simplified redfordEventHtml() fixture above
// deliberately has no <a href> at all, so it doubles as the "no link found"
// regression case (test 6 below).
function redfordEventLi({ title = "A Classic Film (1985)", dateLine = "Friday, August 28 at 8:00 PM", href = "https://redfordtheatre.com/events/a-classic-film-1985/" } = {}) {
  return `<li><a href="${href}"><div class="featureBottom"><h3>${title}</h3><p>${dateLine}</p></div></a></li>`;
}

function makeMockFetch(routes) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url === SOURCE_URL) return routes.source();
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return routes.runInsert ? routes.runInsert() : { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return routes.runUpdate ? routes.runUpdate() : { ok: true, status: 204, json: async () => ({}) };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return routes.statusLookup ? routes.statusLookup() : { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/events") && opts.method === "POST") return routes.upsert ? routes.upsert() : { ok: true, status: 201, text: async () => "" };
    // fetchEventDetail()'s per-event detail-page fetch (2026-09-22). Any
    // redfordtheatre.com/events/<slug>/ URL that isn't the archive page
    // itself. Defaults to a benign empty 200 (no eventDesc/buy-link found,
    // so description/ticket_url both stay null) unless a test supplies
    // routes.detail -- keeps tests 1-5/9, which don't care about detail
    // pages, working unmodified.
    if (url.startsWith("https://redfordtheatre.com/events/") && url !== SOURCE_URL) {
      return routes.detail ? routes.detail(url) : { ok: true, status: 200, text: async () => "<html></html>" };
    }
    throw new Error("unmocked URL in test: " + url);
  };
  return { fetchFn, calls };
}

function patchCalls(calls) {
  return calls.filter((c) => c.url.includes("/rest/v1/source_runs") && c.opts.method === "PATCH");
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 1. normal success ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => redfordEventHtml() }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success");
    assert.strictEqual(patches[0].body.records_fetched, null, "records_fetched is genuinely unavailable for this connector, by design");
    assert.strictEqual(patches[0].body.records_parsed, 1);
    assert.strictEqual(patches[0].body.records_written, 1);
  }
  console.log("PASS: normal success logs outcome=success with records_fetched=null (by design) and matching parsed/written counts");

  // --- 2. legitimate zero candidates ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => "<div>Nothing playing right now.</div>" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 0);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "success", "a genuinely empty parse is success, not failed");
    assert.strictEqual(patches[0].body.records_parsed, 0);
  }
  console.log("PASS: zero Redford events parsed logs outcome=success with records_parsed=0");

  // --- 3. write failure ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => redfordEventHtml() }),
      upsert: () => ({ ok: false, status: 500, text: async () => "internal server error" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 502);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "failed");
    assert.strictEqual(patches[0].body.records_written, 0);
    assert.ok(patches[0].body.error_sample.includes("internal server error"));
  }
  console.log("PASS: a failed upsert logs outcome=failed with records_written=0 and an error_sample");

  // --- 4. upstream blocked/auth failure ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: false, status: 403, text: async () => "" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "blocked");
    assert.strictEqual(patches[0].body.http_status, 403);
  }
  console.log("PASS: an upstream 403 logs outcome=blocked");

  // --- 5. logging failure does not break ingestion ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => redfordEventHtml() }),
      runInsert: () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 0, "no PATCH is attempted when startRun() never produced a runId");
  }
  console.log("PASS: a source_runs logging failure does not affect ingestion's own success/response");

  // --- 6. event_url recovered from the archive page's own <a href> ---
  // (SH.8-class fix, 2026-09-22 -- see extractEventUrls()'s header comment
  // in cron-redford-theatre.js). This is the actual Needs-Follow-up repair:
  // Redford rows previously never set event_url or ticket_url at all, so
  // every single event was flagged for "ticket/event link" unconditionally.
  {
    const handler = freshHandler();
    const href = "https://redfordtheatre.com/events/a-classic-film-1985/";
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => redfordEventLi({ href }) }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const upsertCall = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    assert.strictEqual(upsertCall.body[0].event_url, href, "event_url must be recovered from the archive page's own <a href>, not left null");
  }
  console.log("PASS: event_url is recovered from the archive page's own <a href> for a single-date listing");

  // --- 7. LIST case (two showtimes, one <li>/href) -- both events get the SAME event_url ---
  {
    const handler = freshHandler();
    const href = "https://redfordtheatre.com/events/two-night-run/";
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({
        ok: true, status: 200,
        text: async () => redfordEventLi({
          title: "Two Night Run",
          dateLine: "Sat., Dec. 12 at 8:00PM & Sun., Dec. 13 at 2:00 PM",
          href,
        }),
      }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 2, "the LIST case (two dates, & or \"and\"-joined) must still produce two rows, unchanged by this fix");
    const upsertCall = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    assert.strictEqual(upsertCall.body.length, 2);
    assert.strictEqual(upsertCall.body[0].event_url, href);
    assert.strictEqual(upsertCall.body[1].event_url, href, "both showtimes of the same production must share the one real detail-page link, not just the first");
  }
  console.log("PASS: LIST-case (two showtimes from one listing) events both get the same event_url");

  // --- 8. ambiguous title (same title, two different hrefs) -- never guessed ---
  {
    const handler = freshHandler();
    const html =
      redfordEventLi({ title: "Repeat Title", dateLine: "Friday, August 28 at 8:00 PM", href: "https://redfordtheatre.com/events/repeat-title-a/" }) +
      redfordEventLi({ title: "Repeat Title", dateLine: "Saturday, September 5 at 8:00 PM", href: "https://redfordtheatre.com/events/repeat-title-b/" });
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => html }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 2);
    const upsertCall = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    for (const row of upsertCall.body) {
      assert.strictEqual(row.event_url, null, "a title mapping to two different hrefs is genuinely ambiguous -- NO EVIDENCE -> NO ENRICHMENT, never guess which one is right");
    }
  }
  console.log("PASS: a title with conflicting hrefs across listings gets event_url: null rather than a guess");

  // --- 9. no <a href> in the source markup at all -- event_url stays null, no crash ---
  // (regression safety: confirms this fix is purely additive and doesn't
  // require the new markup shape to function -- the original simplified
  // fixture, with no anchor at all, still upserts cleanly.)
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => redfordEventHtml() }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const upsertCall = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    assert.strictEqual(upsertCall.body[0].event_url, null, "no <a href> in the source markup means event_url stays null, exactly as before this fix -- never invented");
  }
  console.log("PASS: source markup with no <a href> at all leaves event_url null (no crash, no invented link)");

  // --- 10. description + ticket_url recovered from the event's own detail page ---
  {
    const handler = freshHandler();
    const href = "https://redfordtheatre.com/events/a-classic-film-1985/";
    const ticketHref = "https://ticketing.useast.veezi.com/purchase/125?siteToken=abc123";
    const detailHtml = `<html><body><div class="eventDesc"><p>A double feature you won't want to miss.</p></div><div><a href="${ticketHref}">Buy Tickets</a></div></body></html>`;
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => redfordEventLi({ href }) }),
      detail: (url) => { assert.strictEqual(url, href); return { ok: true, status: 200, text: async () => detailHtml }; },
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1);
    const upsertCall = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    assert.strictEqual(upsertCall.body[0].description, "A double feature you won't want to miss.", "description must be recovered from the event's own detail page (.eventDesc)");
    assert.strictEqual(upsertCall.body[0].ticket_url, ticketHref, "ticket_url must be recovered when the detail page has exactly one Buy Tickets link");
    assert.strictEqual(upsertCall.body[0].event_url, href, "event_url (from the archive page) is unaffected by detail-page recovery");
  }
  console.log("PASS: description and ticket_url are recovered from the event's own detail page");

  // --- 11. LIST case: both showtimes share the SAME description, but multiple Buy Tickets links means ticket_url stays null (never guessed) ---
  {
    const handler = freshHandler();
    const href = "https://redfordtheatre.com/events/two-night-run/";
    const detailHtml = `<html><body><div class="eventDesc"><p>Two nights only.</p></div>` +
      `<a href="https://ticketing.useast.veezi.com/purchase/1?siteToken=a">Buy Tickets</a>` +
      `<a href="https://ticketing.useast.veezi.com/purchase/2?siteToken=b">Buy Tickets</a></body></html>`;
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({
        ok: true, status: 200,
        text: async () => redfordEventLi({
          title: "Two Night Run",
          dateLine: "Sat., Dec. 12 at 8:00PM & Sun., Dec. 13 at 2:00 PM",
          href,
        }),
      }),
      detail: () => ({ ok: true, status: 200, text: async () => detailHtml }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 2);
    const upsertCall = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    assert.strictEqual(upsertCall.body[0].description, "Two nights only.");
    assert.strictEqual(upsertCall.body[1].description, "Two nights only.", "both showtimes share the one real description from their shared detail page");
    assert.strictEqual(upsertCall.body[0].ticket_url, null, "two different Buy Tickets links on one shared page is genuinely ambiguous per-showtime -- never guess which is which");
    assert.strictEqual(upsertCall.body[1].ticket_url, null);
    assert.strictEqual(upsertCall.body[0].event_url, href, "event_url still satisfies the ticket/event-link condition even when ticket_url can't be");
  }
  console.log("PASS: LIST-case showtimes share one recovered description; ambiguous multi-link ticket_url stays null");

  // --- 12. detail-page fetch failure -- base row still writes, description/ticket_url stay null, no crash ---
  {
    const handler = freshHandler();
    const href = "https://redfordtheatre.com/events/a-classic-film-1985/";
    const { fetchFn, calls } = makeMockFetch({
      source: () => ({ ok: true, status: 200, text: async () => redfordEventLi({ href }) }),
      detail: () => ({ ok: false, status: 500, text: async () => "server error" }),
    });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 1, "a detail-page fetch failure must not block the base row from writing");
    const upsertCall = calls.find((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    assert.strictEqual(upsertCall.body[0].description, null);
    assert.strictEqual(upsertCall.body[0].ticket_url, null);
    assert.strictEqual(upsertCall.body[0].event_url, href, "event_url (recovered from the archive page, not the detail page) is unaffected by a detail-page fetch failure");
  }
  console.log("PASS: a detail-page fetch failure fails soft -- base row still writes, description/ticket_url stay null");

  console.log("\nAll cron-redford-theatre.js WP 0.5 integration tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
