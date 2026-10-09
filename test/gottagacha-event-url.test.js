// test/gottagacha-event-url.test.js — Admin Hardening slice 1 (2026-10-08).
//
// GottaGacha's 90 "TICKET/EVENT LINK" cards in Admin > Needs follow-up were
// one systemic gap, not 90 tasks: the connector wrote event_url: null for
// every row, although the source's own site has a page per occurrence at
// /events/<series id>?date=<eventDate> -- the link its own /events calendar
// uses for "See full details", built from the same two fields as the
// connector's external_id (see eventDetailUrl() in api/cron-gottagacha.js
// for the evidence).
//
// Proves:
//   1. the URL is derived exactly as the source links it, for the real
//      production series ids observed 2026-10-08
//   2. occurrences of one recurring series get distinct, date-specific links
//   3. anything not shaped like the API's own fields yields null -- never a
//      guess, never the bare site root
//   4. rows go out with event_url and WITHOUT a ticket_url key, so the daily
//      merge-duplicates upsert can no longer erase a ticket link entered by
//      hand (it sent ticket_url: null before)
//   6. a stored event link is never replaced, except a blank one or the bare
//      GottaGacha homepage; generic enrichment's venue-website fallback can
//      never put the homepage over an occurrence link
//   5. admin.html, unchanged, stops flagging such a row; the same row without
//      a link is still flagged (GottaGacha is NOT a source limitation -- the
//      queue shrinks because the gap is filled, not because it is hidden)
//
// Run: node test/gottagacha-event-url.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const RealDate = Date;
const FROZEN_NOW = RealDate.parse("2026-10-08T12:00:00Z");
global.Date = class extends RealDate {
  constructor(...args) { if (args.length === 0) super(FROZEN_NOW); else super(...args); }
  static now() { return FROZEN_NOW; }
};

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
delete process.env.CRON_SECRET;
const gg = require(`${REPO_DIR}/api/cron-gottagacha.js`);
const { eventDetailUrl, parseEvent, buildExternalId, keepEventUrl } = gg;
const { resolveDigitalHomeLink } = require(`${REPO_DIR}/api/_lib/venue-lookup.js`);

const FNM = "d1eeabd3-3385-44af-a25d-406c8a544bf9"; // Friday Night Magic (weekly)
const COUNTERHIT = "88284bee-c852-482c-9407-063eac5c2788"; // CounterHit: Tourney of Terror
const ZAMS = "5d87b5bf-0d9d-445c-b6bd-b787ec10980d"; // Zam's Club: Melee #7

function apiEvent(o = {}) {
  return { id: FNM, title: "Friday Night Magic", description: "Casual Magic The Gathering!", eventDate: "2026-10-09", startTime: "21:00:00", endTime: "02:00:00", recurrenceType: "weekly", location: "Gotta Gacha", ...o };
}

async function run() {
  // 1. exactly the source's own links
  assert.strictEqual(eventDetailUrl(COUNTERHIT, "2026-10-10"), "https://www.gottagacha.com/events/88284bee-c852-482c-9407-063eac5c2788?date=2026-10-10", "the /events calendar's own 'See full details' href");
  assert.strictEqual(eventDetailUrl(ZAMS, "2026-10-15"), "https://www.gottagacha.com/events/5d87b5bf-0d9d-445c-b6bd-b787ec10980d?date=2026-10-15");
  assert.strictEqual(eventDetailUrl(FNM, "2026-10-09"), "https://www.gottagacha.com/events/d1eeabd3-3385-44af-a25d-406c8a544bf9?date=2026-10-09", "the value entered by hand in production for Friday Night Magic");
  console.log("PASS: event_url is the source's own per-occurrence page, for the real production series ids");

  // 2. one series, distinct dates -> distinct links, each matching its external_id
  {
    const a = parseEvent(apiEvent({ eventDate: "2026-10-09" }));
    const b = parseEvent(apiEvent({ eventDate: "2026-10-16" }));
    assert.notStrictEqual(a.event_url, b.event_url);
    assert.ok(a.event_url.endsWith("?date=2026-10-09") && b.event_url.endsWith("?date=2026-10-16"));
    assert.strictEqual(a.external_id, buildExternalId(FNM, "2026-10-09"));
    assert.ok(a.event_url.includes(FNM) && a.external_id.includes(FNM), "link and identity are built from the same two fields");
  }
  console.log("PASS: occurrences of one recurring series each get their own date-specific link");

  // 3. never a guess
  for (const [id, date] of [
    [null, "2026-10-09"], [undefined, "2026-10-09"], ["", "2026-10-09"], ["youmacon-1", "2026-10-09"],
    [FNM + "x", "2026-10-09"], ["../" + FNM, "2026-10-09"], [12345, "2026-10-09"],
    [FNM, null], [FNM, "10/09/2026"], [FNM, "2026-10-09T21:00:00"], [FNM, "2026-10-09&x=1"],
  ]) {
    assert.strictEqual(eventDetailUrl(id, date), null, `no link for (${id}, ${date})`);
  }
  for (const id of [FNM, COUNTERHIT, ZAMS]) {
    const u = eventDetailUrl(id, "2026-11-01");
    assert.ok(!/^https:\/\/www\.gottagacha\.com\/?$/.test(u), "never the bare site root");
  }
  assert.strictEqual(eventDetailUrl(FNM.toUpperCase(), "2026-10-09"), eventDetailUrl(FNM, "2026-10-09"), "id case does not create a second URL");
  console.log("PASS: malformed ids or dates yield null -- never a guessed link, never the bare site root");

  // 4. the wire: event_url present, ticket_url key absent
  {
    const parsed = parseEvent(apiEvent());
    assert.ok(!Object.prototype.hasOwnProperty.call(parsed, "ticket_url"), "ticket_url is omitted, not null");
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, opts });
      if (url.includes("www.gottagacha.com/api/events")) return { ok: true, status: 200, json: async () => ({ events: [apiEvent(), apiEvent({ eventDate: "2026-10-16" }), apiEvent({ id: COUNTERHIT, title: "CounterHit: Tourney of Terror", eventDate: "2026-10-10", recurrenceType: null, description: "https://www.start.gg/tournament/x" })] }) };
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
      if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return { ok: true, status: 204, json: async () => ({}) };
      if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) {
        // Friday Night Magic 10/09 already exists (approved), as in production.
        return { ok: true, status: 200, json: async () => [{ external_id: buildExternalId(FNM, "2026-10-09"), status: "approved" }] };
      }
      if (url.includes("/rest/v1/events") && opts.method === "POST") return strictWriteResponse(url, opts);
      throw new Error("unmocked URL in test: " + url);
    };
    const res = { status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
    await gg({ headers: {} }, res);
    const posts = calls.filter((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST");
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const rows = posts.flatMap((c) => JSON.parse(c.opts.body));
    assert.strictEqual(rows.length, 3);
    for (const r of rows) {
      assert.ok(!("ticket_url" in r), "no row tells the database to blank ticket_url");
      assert.ok(/^https:\/\/www\.gottagacha\.com\/events\/[0-9a-f-]{36}\?date=\d{4}-\d{2}-\d{2}$/.test(r.event_url), r.event_url);
    }
    assert.strictEqual(rows.find((r) => r.title.startsWith("CounterHit")).event_url, eventDetailUrl(COUNTERHIT, "2026-10-10"), "a description's start.gg link is still never extracted");
  }
  console.log("PASS: every row carries its event_url and omits ticket_url, so a hand-entered ticket link survives the daily run");

  // 6. better stored links win; the homepage never wins
  {
    const derived = eventDetailUrl(FNM, "2026-10-09");
    assert.strictEqual(keepEventUrl(undefined, derived), derived, "new row: the occurrence link");
    assert.strictEqual(keepEventUrl(null, derived), derived, "stored blank: filled");
    assert.strictEqual(keepEventUrl("  ", derived), derived, "stored whitespace: filled");
    assert.strictEqual(keepEventUrl("https://www.gottagacha.com/", derived), derived, "stored homepage: replaced by the occurrence link");
    assert.strictEqual(keepEventUrl("https://gottagacha.com", derived), derived);
    assert.strictEqual(keepEventUrl("https://www.start.gg/tournament/x/details", derived), undefined, "a stored specific link a person chose is kept (key omitted)");
    assert.strictEqual(keepEventUrl(derived, derived), undefined, "an existing occurrence link is left as it is");
    assert.strictEqual(keepEventUrl(null, null), undefined, "nothing derivable: no key, so nothing is blanked");
    assert.strictEqual(keepEventUrl("https://www.start.gg/x", null), undefined);

    // end to end: one row keeps a hand-set link, one has its homepage replaced
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, opts });
      if (url.includes("www.gottagacha.com/api/events")) return { ok: true, status: 200, json: async () => ({ events: [apiEvent(), apiEvent({ eventDate: "2026-10-16" }), apiEvent({ id: "not-a-uuid", eventDate: "2026-10-23" })] }) };
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
      if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return { ok: true, status: 204, json: async () => ({}) };
      if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) {
        assert.ok(url.includes("select=external_id,status,event_url"), "the existing event_url is read before writing");
        return { ok: true, status: 200, json: async () => [
          { external_id: buildExternalId(FNM, "2026-10-09"), status: "approved", event_url: "https://www.start.gg/tournament/fnm/details" },
          { external_id: buildExternalId(FNM, "2026-10-16"), status: "approved", event_url: "https://www.gottagacha.com/" },
          { external_id: buildExternalId("not-a-uuid", "2026-10-23"), status: "approved", event_url: "https://example.org/kept" },
        ] };
      }
      if (url.includes("/rest/v1/events") && opts.method === "POST") return strictWriteResponse(url, opts);
      throw new Error("unmocked URL in test: " + url);
    };
    const res = { status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
    await gg({ headers: {} }, res);
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const rows = calls.filter((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST").flatMap((c) => JSON.parse(c.opts.body));
    const byDate = (d) => rows.find((r) => r.start_date === d);
    assert.ok(!("event_url" in byDate("2026-10-09")), "the hand-set start.gg link is not overwritten");
    assert.strictEqual(byDate("2026-10-16").event_url, eventDetailUrl(FNM, "2026-10-16"), "the homepage is replaced by the occurrence link");
    assert.ok(!("event_url" in byDate("2026-10-23")), "no derivable link: nothing sent, the stored link survives");
    assert.ok(rows.every((r) => !("ticket_url" in r)));
  }
  // generic enrichment's last-resort venue-website link cannot touch a row that has its occurrence link
  {
    const venue = { id: "v1", name: "GottaGacha", website: "https://www.gottagacha.com/" };
    const maps = { byId: new Map([["v1", venue]]) };
    assert.strictEqual(resolveDigitalHomeLink({ venue_id: "v1", event_url: eventDetailUrl(FNM, "2026-10-09"), ticket_url: null }, maps), null, "an occurrence link is never replaced by the homepage");
    assert.strictEqual(resolveDigitalHomeLink({ venue_id: "v1", event_url: null, ticket_url: null }, maps), "https://www.gottagacha.com/", "(the fallback only ever fills a link that is blank)");
  }
  console.log("PASS: stored specific links are kept, the homepage is replaced, and enrichment's homepage fallback cannot override an occurrence link");

  // 5. admin.html (unchanged) stops flagging it -- because the gap is filled
  {
    const html = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
    const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, textContent: "", innerHTML: "" });
    const sandbox = { document: { getElementById: el, createElement: el, querySelectorAll: () => [] }, console, alert() {}, prompt() { return ""; }, URLSearchParams, encodeURIComponent, Promise };
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    // Shape of a production GottaGacha row on 2026-10-08.
    const prodRow = { title: "Friday Night Magic", source: "GottaGacha", description: "Casual Magic The Gathering!", time_display: "9:00 PM – 2:00 AM", is_all_day: false, venue_name_raw: "GottaGacha", venue_address_raw: "29200 Dequindre Rd, Suite 2B", venue_city_raw: "Warren, MI 48092", venue_id: null, venues: null, ticket_url: null, event_url: null, ticket_status: null, link_check_status: null, no_fixed_venue: false };
    assert.deepStrictEqual(Array.from(sandbox.getMissingFields(prodRow)), ["ticket/event link"], "today: one actionable gap");
    const after = { ...prodRow, event_url: parseEvent(apiEvent()).event_url };
    assert.deepStrictEqual(Array.from(sandbox.getMissingFields(after)), [], "after the next run: nothing missing");
    const { actionable, sourceLimited } = sandbox.classifyMissingFields(prodRow, sandbox.getMissingFields(prodRow));
    assert.deepStrictEqual([Array.from(actionable), Array.from(sourceLimited)], [["ticket/event link"], []], "GottaGacha is not suppressed as a source limitation -- a row still without a link stays visible");
  }
  console.log("PASS: the Needs follow-up definition is unchanged; the GottaGacha row leaves the queue because its link is filled, not hidden");
}

run().then(() => console.log("gottagacha-event-url: ok")).catch((err) => { console.error(err); process.exit(1); });
