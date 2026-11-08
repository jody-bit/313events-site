// test/cron-halo-ticket-status.test.js — HALO Detroit action-link capture
// (2026-09-28, Needs Follow-up self-healing pass 2, no-advance-ticket-link
// false positive).
//
// Root problem: HOT ASH CIGAR & PIPE SOCIAL was flagged "missing ticket/
// event link" purely because cron-halo.js discarded every anchor href
// before its line-scan ever ran -- even though HALO's own Wix event system
// visibly shows a real per-event link, labeled "RSVP" rather than "Buy
// Tickets" specifically BECAUSE no advance-ticket-purchase flow is
// configured for that event. That label distinction is real, non-invented
// source evidence -- confirmed live 2026-09-28 against
// thehalodetroit.com/currentevents, where HOT ASH CIGAR & PIPE SOCIAL
// shows "RSVP" (href .../events/hot-ash-cigar-pipe-social-7) while a
// different listing on the same page shows "Details" for the same
// structural reason.
//
// Run: node test/cron-halo-ticket-status.test.js
"use strict";
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshHalo() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-halo.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/run-log.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/source-slugs.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/status-lookup.js`)];
  return require(`${REPO_DIR}/api/cron-halo.js`);
}

// Mirrors the REAL confirmed live structure (thehalodetroit.com, checked
// 2026-09-28): short date, title, venue name, an <a href> action link,
// then the full date+time anchor line.
function haloBlockHtml({ title, actionLabel, actionHref, fullDateTime }) {
  return [
    "<div>Sat, Oct 10</div>",
    `<div>${title} /</div>`,
    "<div>HALO DETROIT - Bar and Lounge</div>",
    `<a href="${actionHref}">${actionLabel}</a>`,
    `<div>${fullDateTime}</div>`,
  ].join("");
}

async function run() {
  const { parseHaloEvents, resolveHaloUrl } = freshHalo();

  // --- resolveHaloUrl: relative/absolute/junk handling ---
  assert.strictEqual(resolveHaloUrl("/events/hot-ash-cigar-pipe-social-7"), "https://www.thehalodetroit.com/events/hot-ash-cigar-pipe-social-7");
  assert.strictEqual(resolveHaloUrl("https://www.thehalodetroit.com/events/x"), "https://www.thehalodetroit.com/events/x");
  assert.strictEqual(resolveHaloUrl("javascript:void(0)"), null, "never guesses a base for an unrecognized href shape");
  assert.strictEqual(resolveHaloUrl(null), null);
  console.log("PASS: resolveHaloUrl handles relative/absolute/junk hrefs correctly, never invents a URL");

  // --- HOT ASH CIGAR & PIPE SOCIAL's real structure: RSVP button ---
  {
    const html = haloBlockHtml({
      title: "HOT ASH CIGAR & PIPE SOCIAL",
      actionLabel: "RSVP",
      actionHref: "/events/hot-ash-cigar-pipe-social-7",
      fullDateTime: "Oct 10, 2026, 8:00 PM – 10:00 PM",
    });
    const parsed = parseHaloEvents(html);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].title, "HOT ASH CIGAR & PIPE SOCIAL");
    assert.strictEqual(parsed[0].actionLabel, "rsvp");
    assert.strictEqual(parsed[0].actionHref, "/events/hot-ash-cigar-pipe-social-7");
  }
  console.log("PASS: HOT ASH CIGAR & PIPE SOCIAL's real RSVP button + href is captured, not discarded");

  // --- "Details" button (a different real HALO listing's structure) is
  // captured the same way as RSVP -- both mean "no advance ticketing" ---
  {
    const html = haloBlockHtml({
      title: "BLUF DETROIT MONTHLY SOCIAL",
      actionLabel: "Details",
      actionHref: "https://www.thehalodetroit.com/events/bluf-detroit-monthly-social-1-3",
      fullDateTime: "Oct 10, 2026, 9:00 PM – 11:00 PM",
    });
    const parsed = parseHaloEvents(html);
    assert.strictEqual(parsed[0].actionLabel, "details");
    assert.strictEqual(parsed[0].actionHref, "https://www.thehalodetroit.com/events/bluf-detroit-monthly-social-1-3");
  }
  console.log("PASS: \"Details\" button + href captured the same way as RSVP");

  // --- "Buy Tickets" button (a genuinely ticketed HALO event) ---
  {
    const html = haloBlockHtml({
      title: "CURTAIN CALL CABARET",
      actionLabel: "Buy Tickets",
      actionHref: "https://www.thehalodetroit.com/events/curtain-call",
      fullDateTime: "Aug 23, 2026, 7:00 PM – 11:00 PM",
    });
    const parsed = parseHaloEvents(html);
    assert.strictEqual(parsed[0].actionLabel, "buy tickets");
    assert.strictEqual(parsed[0].actionHref, "https://www.thehalodetroit.com/events/curtain-call");
  }
  console.log("PASS: \"Buy Tickets\" button + href captured");

  // --- No action link at all: candidateActionLabel/Href stay null, no
  // crash, matches pre-2026-09-28 behavior exactly (backward compatible
  // with the existing bracket-text fixture in
  // test/cron-halo-runlog.test.js, which has no real <a href> at all). ---
  {
    const html = [
      "<div>Sun, Aug 23</div>",
      "<div>Curtain Call Cabaret /</div>",
      "<div>HALO DETROIT - Bar and Lounge</div>",
      "<div>[Buy Tickets]</div>",
      "<div>Aug 23, 2026, 7:00 PM – 11:00 PM</div>",
    ].join("");
    const parsed = parseHaloEvents(html);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].actionLabel, null);
    assert.strictEqual(parsed[0].actionHref, null);
  }
  console.log("PASS: a block with no real <a href> action link (old-style fixture) still parses cleanly with null action fields");

  // --- Full handler integration: the actual row POSTed to Supabase has
  // the right ticket_url/event_url/ticket_status combination for each
  // button type. Same mock-fetch convention as test/cron-halo-runlog.test.js. ---
  {
    const SOURCE_URL = "https://www.thehalodetroit.com/currentevents";
    const SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    delete process.env.CRON_SECRET;

    const handler = freshHalo();
    let upsertedRows = null;
    const html = haloBlockHtml({
      title: "HOT ASH CIGAR & PIPE SOCIAL",
      actionLabel: "RSVP",
      actionHref: "/events/hot-ash-cigar-pipe-social-7",
      fullDateTime: "Oct 10, 2026, 8:00 PM \u2013 10:00 PM",
    });
    global.fetch = async (url, opts = {}) => {
      if (url === SOURCE_URL) return { ok: true, status: 200, text: async () => html };
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
      if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return { ok: true, status: 204, json: async () => ({}) };
      if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/events") && opts.method === "POST") {
        upsertedRows = JSON.parse(opts.body);
        return strictWriteResponse(url, opts);
      }
      throw new Error("unmocked URL in test: " + url);
    };
    const res = { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(upsertedRows) && upsertedRows.length === 1);
    const row = upsertedRows[0];
    assert.strictEqual(row.ticket_url, null, "RSVP-only listing must never get a ticket_url (no advance purchase exists)");
    assert.strictEqual(row.event_url, "https://www.thehalodetroit.com/events/hot-ash-cigar-pipe-social-7", "the real per-event RSVP page is retained as event_url");
    assert.strictEqual(row.ticket_status, "rsvp_no_advance_sale");
  }
  console.log("PASS: full handler run for HOT ASH CIGAR & PIPE SOCIAL's real RSVP structure produces event_url + ticket_status='rsvp_no_advance_sale', no ticket_url");

  // --- 2026-10-01 (Jody, site owner): HALO Detroit is confirmed pay-at-
  // the-door across the board -- when a listing has no action button/link
  // AT ALL (the old-style bracket-text fixture shape, no real <a href>),
  // ticket_status now defaults to migration_041's 'door' value instead of
  // staying null, so this isn't mistaken for an unexplained gap in
  // admin.html's Needs Follow-up queue or left with nothing to show a
  // visitor on the public site. ---
  {
    const SOURCE_URL = "https://www.thehalodetroit.com/currentevents";
    const SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    delete process.env.CRON_SECRET;

    const handler = freshHalo();
    let upsertedRows = null;
    const html = [
      "<div>Sun, Aug 23</div>",
      "<div>Curtain Call Cabaret /</div>",
      "<div>HALO DETROIT - Bar and Lounge</div>",
      "<div>[Buy Tickets]</div>",
      "<div>Aug 23, 2026, 7:00 PM – 11:00 PM</div>",
    ].join("");
    global.fetch = async (url, opts = {}) => {
      if (url === SOURCE_URL) return { ok: true, status: 200, text: async () => html };
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
      if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return { ok: true, status: 204, json: async () => ({}) };
      if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/events") && opts.method === "POST") {
        upsertedRows = JSON.parse(opts.body);
        return strictWriteResponse(url, opts);
      }
      throw new Error("unmocked URL in test: " + url);
    };
    const res = { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(upsertedRows) && upsertedRows.length === 1);
    const row = upsertedRows[0];
    assert.strictEqual(row.ticket_url, null);
    assert.strictEqual(row.event_url, null);
    assert.strictEqual(row.ticket_status, "door", "no action link at all must default to ticket_status='door', not null");
  }
  console.log("PASS: a listing with no action link at all defaults to ticket_status='door' (confirmed HALO site-wide pay-at-the-door characteristic)");

  console.log("\ncron-halo-ticket-status.test.js: all assertions passed");
}

run().catch((err) => { console.error(err); process.exitCode = 1; });
