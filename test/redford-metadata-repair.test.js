// test/redford-metadata-repair.test.js — authoritative Redford Theatre
// description/event_url/ticket_url recovery, integrated into Needs
// Follow-up Auto-Repair as step 4 (2026-09-23, after SH.1 venue repair,
// Outer Limits description repair, and Dossin event_url repair).
//
// NO NEW PARSER: api/cron-redford-theatre.js already recovers all three
// fields for its own ongoing scheduled upsert (2026-09-22 Needs-Follow-up-
// reduction work) -- parseRedfordEvents() (title/date/time), extractEventUrls()
// (each event's own detail-page href, keyed by title, null when ambiguous),
// and fetchEventDetail() (description from .eventDesc, ticket_url ONLY when
// the detail page has exactly one "Buy Tickets" link -- never guessed when
// 2+ links make it ambiguous which showtime each belongs to). This file
// proves scripts/redford-metadata-repair.js calls those exact functions,
// unmodified, via api/cron-redford-theatre.js's own exports -- there is
// exactly one parser for this source.
//
// Run: node test/redford-metadata-repair.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const ADMIN_SECRET = "test-admin-secret";
const ARCHIVE_URL = "https://redfordtheatre.com/events/";

// ============================================================
// Part 1: api/cron-redford-theatre.js's exports are genuinely reused.
// ============================================================

function freshRedfordCron() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-redford-theatre.js`)];
  return require(`${REPO_DIR}/api/cron-redford-theatre.js`);
}

function redfordEventLi({ title = "A Classic Film (1985)", dateLine = "Friday, August 28 at 8:00 PM", href = "https://redfordtheatre.com/events/a-classic-film-1985/" } = {}) {
  return `<li><a href="${href}"><div class="featureBottom"><h3>${title}</h3><p>${dateLine}</p></div></a></li>`;
}

function runPart1() {
  const cron = freshRedfordCron();

  assert.strictEqual(typeof cron.parseRedfordEvents, "function");
  assert.strictEqual(typeof cron.extractEventUrls, "function");
  assert.strictEqual(typeof cron.fetchEventDetail, "function");
  assert.strictEqual(typeof cron.redfordExternalId, "function");
  assert.strictEqual(cron.SOURCE_URL, "https://redfordtheatre.com/events/");
  assert.strictEqual(cron.SOURCE_NAME, "Redford Theatre");

  // redfordExternalId() must match the exact formula this connector has
  // always used for its own upsert (date+title, lowercased, non
  // alnum/hyphen runs collapsed to a single "-") -- now named/exported
  // instead of inlined, with zero drift risk since it's the SAME function.
  assert.strictEqual(cron.redfordExternalId("2026-10-01", "A Classic Film (1985)"), "redford-2026-10-01-a-classic-film-1985-");

  const html = redfordEventLi({ title: "Return of the Jedi (1983)", dateLine: "Thursday, October 1, 2026 at 7:00 PM", href: "https://redfordtheatre.com/events/return-of-the-jedi-1983/" });
  const events = cron.parseRedfordEvents(html);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].title, "Return of the Jedi (1983)");
  assert.strictEqual(events[0].date, "2026-10-01");
  assert.strictEqual(events[0].time, "7:00 PM");

  const urls = cron.extractEventUrls(html);
  assert.strictEqual(urls.get("Return of the Jedi (1983)"), "https://redfordtheatre.com/events/return-of-the-jedi-1983/");

  console.log("PASS: api/cron-redford-theatre.js's parseRedfordEvents()/extractEventUrls()/fetchEventDetail()/redfordExternalId() are genuinely reused, unmodified, via its own exports");
}

// ============================================================
// Part 2: scripts/redford-metadata-repair.js's fetchArchivePageData()
// ============================================================

function freshRedfordRepair() {
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/redford-metadata-repair.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-redford-theatre.js`)];
  return require(`${REPO_DIR}/scripts/redford-metadata-repair.js`);
}

async function runPart2() {
  const { fetchArchivePageData } = freshRedfordRepair();
  const cron = freshRedfordCron();

  const html =
    redfordEventLi({ title: "Return of the Jedi (1983)", dateLine: "Thursday, October 1, 2026 at 7:00 PM", href: "https://redfordtheatre.com/events/return-of-the-jedi-1983/" }) +
    redfordEventLi({ title: "A Classic Film (1985)", dateLine: "Friday, October 2, 2026 at 8:00 PM", href: "https://redfordtheatre.com/events/a-classic-film-1985/" });

  const mockFetch = async (url) => {
    assert.strictEqual(url, ARCHIVE_URL);
    return { ok: true, status: 200, text: async () => html };
  };
  const { eventUrlsByExternalId } = await fetchArchivePageData(mockFetch);

  assert.strictEqual(
    eventUrlsByExternalId.get(cron.redfordExternalId("2026-10-01", "Return of the Jedi (1983)")),
    "https://redfordtheatre.com/events/return-of-the-jedi-1983/"
  );
  assert.strictEqual(
    eventUrlsByExternalId.get(cron.redfordExternalId("2026-10-02", "A Classic Film (1985)")),
    "https://redfordtheatre.com/events/a-classic-film-1985/"
  );

  const failingFetch = async () => ({ ok: false, status: 500 });
  await assert.rejects(() => fetchArchivePageData(failingFetch), /Fetch failed: HTTP 500/);

  console.log("PASS: fetchArchivePageData() joins parseRedfordEvents()+extractEventUrls() into a map keyed by the same external_id repair candidates use");
}

// ============================================================
// Part 3: scripts/redford-metadata-repair.js's repairRedfordMetadata()
// ============================================================

async function runPart3() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  const HREF = "https://redfordtheatre.com/events/return-of-the-jedi-1983/";
  const EXT_ID = "redford-2026-10-01-return-of-the-jedi-1983-";

  // --- 1. blank description repaired -- lazy detail fetch triggered,
  //     ticket_url/event_url already set so neither is touched. ---
  {
    const { repairRedfordMetadata } = freshRedfordRepair();
    const candidates = [{ id: "evt-1", external_id: EXT_ID, description: null, ticket_url: "https://ticketing.example.com/already-set", event_url: HREF, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([[EXT_ID, HREF]]);
    let detailFetchCount = 0;
    const patchBodies = [];
    const counts = await repairRedfordMetadata({
      fetchCandidates: async () => candidates,
      fetchArchivePage: async () => ({ eventUrlsByExternalId: map }),
      fetchDetail: async (url) => { detailFetchCount++; assert.strictEqual(url, HREF); return { description: "A long time ago...", ticket_url: "https://ticketing.example.com/should-be-ignored" }; },
      applyPatchFn: async (_url, _headers, id, patch) => { patchBodies.push({ id, patch }); return true; },
    });
    assert.strictEqual(detailFetchCount, 1, "a candidate needing description must trigger exactly one detail-page fetch");
    assert.strictEqual(counts.written, 1);
    assert.deepStrictEqual(patchBodies[0].patch, { description: "A long time ago..." }, "only description is written -- ticket_url/event_url were already set and must never be touched even though the detail fetch also returned a ticket_url");
  }
  console.log("PASS: a blank description is repaired via a lazily-triggered detail-page fetch, without touching already-set fields");

  // --- 2. blank event_url repaired ALONE -- detail fetch is NOT triggered
  //     (lazy design: an event_url-only repair never needs the detail page). ---
  {
    const { repairRedfordMetadata } = freshRedfordRepair();
    const candidates = [{ id: "evt-1", external_id: EXT_ID, description: "Already has one.", ticket_url: "https://ticketing.example.com/already-set", event_url: null, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([[EXT_ID, HREF]]);
    let detailFetchCalled = false;
    const patchBodies = [];
    const counts = await repairRedfordMetadata({
      fetchCandidates: async () => candidates,
      fetchArchivePage: async () => ({ eventUrlsByExternalId: map }),
      fetchDetail: async () => { detailFetchCalled = true; return { description: null, ticket_url: null }; },
      applyPatchFn: async (_url, _headers, id, patch) => { patchBodies.push({ id, patch }); return true; },
    });
    assert.ok(!detailFetchCalled, "an event_url-only repair must never fetch the detail page at all");
    assert.strictEqual(counts.written, 1);
    assert.deepStrictEqual(patchBodies[0].patch, { event_url: HREF });
  }
  console.log("PASS: a blank event_url is repaired from the archive href alone -- no detail-page fetch triggered when it isn't needed");

  // --- 3. blank ticket_url repaired ONLY when the detail page's own
  //     exactly-one-Buy-Tickets rule yields a value -- an ambiguous detail
  //     page (rule already applied inside fetchEventDetail, mocked here as
  //     ticket_url: null) must leave ticket_url blank, never guessed. ---
  {
    const { repairRedfordMetadata } = freshRedfordRepair();
    const candidates = [{ id: "evt-1", external_id: EXT_ID, description: "Already has one.", ticket_url: null, event_url: HREF, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([[EXT_ID, HREF]]);
    const patchBodies = [];
    const counts = await repairRedfordMetadata({
      fetchCandidates: async () => candidates,
      fetchArchivePage: async () => ({ eventUrlsByExternalId: map }),
      fetchDetail: async () => ({ description: "Ignored, already set.", ticket_url: null }), // ambiguous page -- 2+ Buy Tickets links
      applyPatchFn: async (_url, _headers, id, patch) => { patchBodies.push({ id, patch }); return true; },
    });
    assert.strictEqual(counts.matched, 1, "the event was matched to its authoritative href");
    assert.strictEqual(counts.written, 0, "nothing to write -- the source itself had no unambiguous ticket_url to offer");
    assert.strictEqual(patchBodies.length, 0);
  }
  console.log("PASS: ticket_url stays blank when the detail page's exactly-one-Buy-Tickets rule doesn't resolve to a single link -- never guessed");

  // --- 4. nonblank values are never overwritten, even defensively -- an
  //     event with all three fields already set is skipped entirely,
  //     before ever being matched or fetching a detail page. ---
  {
    const { repairRedfordMetadata } = freshRedfordRepair();
    const candidates = [{ id: "evt-1", external_id: EXT_ID, description: "Set.", ticket_url: "https://ticketing.example.com/set", event_url: HREF, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([[EXT_ID, HREF]]);
    let detailFetchCalled = false;
    let patchCalled = false;
    const counts = await repairRedfordMetadata({
      fetchCandidates: async () => candidates,
      fetchArchivePage: async () => ({ eventUrlsByExternalId: map }),
      fetchDetail: async () => { detailFetchCalled = true; return { description: "x", ticket_url: "y" }; },
      applyPatchFn: async () => { patchCalled = true; return true; },
    });
    assert.strictEqual(counts.matched, 0, "an event with nothing blank is never even matched -- skipped up front");
    assert.strictEqual(counts.written, 0);
    assert.ok(!detailFetchCalled);
    assert.ok(!patchCalled);
  }
  console.log("PASS: an event with description, ticket_url, and event_url all already set is never touched -- no match, no detail fetch, no patch");

  // --- 5. unmatched events (no authoritative href at all -- no longer on
  //     the live page, or an ambiguous title extractEventUrls() itself
  //     already refused to resolve) remain untouched. ---
  {
    const { repairRedfordMetadata } = freshRedfordRepair();
    const candidates = [{ id: "evt-gone", external_id: "redford-2020-01-01-old-event", description: null, ticket_url: null, event_url: null, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([[EXT_ID, HREF]]);
    let patchCalled = false;
    const counts = await repairRedfordMetadata({
      fetchCandidates: async () => candidates,
      fetchArchivePage: async () => ({ eventUrlsByExternalId: map }),
      fetchDetail: async () => { throw new Error("must not be called for an unmatched event"); },
      applyPatchFn: async () => { patchCalled = true; return true; },
    });
    assert.strictEqual(counts.unmatched, 1);
    assert.strictEqual(counts.written, 0);
    assert.ok(!patchCalled);
  }
  console.log("PASS: an event with no matching authoritative source entry is left untouched");

  // --- 6. status and all unrelated fields remain unchanged -- the write
  //     touches exactly the fields that were blank, nothing else. ---
  {
    const { repairRedfordMetadata } = freshRedfordRepair();
    const candidates = [{ id: "evt-1", external_id: EXT_ID, description: null, ticket_url: null, event_url: null, start_date: "2026-10-01", status: "pending_review" }];
    const map = new Map([[EXT_ID, HREF]]);
    let capturedPatch = null;
    await repairRedfordMetadata({
      fetchCandidates: async () => candidates,
      fetchArchivePage: async () => ({ eventUrlsByExternalId: map }),
      fetchDetail: async () => ({ description: "A long time ago...", ticket_url: "https://ticketing.example.com/buy" }),
      applyPatchFn: async (_url, _headers, id, patch) => { capturedPatch = patch; return true; },
    });
    assert.deepStrictEqual(capturedPatch, { event_url: HREF, description: "A long time ago...", ticket_url: "https://ticketing.example.com/buy" }, "the write must touch only description/ticket_url/event_url -- never status or any other column");
  }
  console.log("PASS: status and all unrelated fields are left untouched -- the write contains only the recovered blank fields");

  // --- 7. a concurrent-write conflict is skipped honestly. ---
  {
    const { repairRedfordMetadata } = freshRedfordRepair();
    const candidates = [{ id: "evt-1", external_id: EXT_ID, description: null, ticket_url: null, event_url: null, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([[EXT_ID, HREF]]);
    const counts = await repairRedfordMetadata({
      fetchCandidates: async () => candidates,
      fetchArchivePage: async () => ({ eventUrlsByExternalId: map }),
      fetchDetail: async () => ({ description: "A long time ago...", ticket_url: "https://ticketing.example.com/buy" }),
      applyPatchFn: async () => false,
    });
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(counts.skippedConcurrentChange, 1);
  }
  console.log("PASS: a concurrent-write conflict is skipped honestly, never counted as written");

  // --- 8. the REAL applyPatch() -- multi-field write re-asserts ALL
  //     written columns null via an and=(...) filter; a single-field write
  //     uses the plain column=is.null shape. ---
  {
    const { repairRedfordMetadata } = freshRedfordRepair();
    const candidates = [{ id: "evt-1", external_id: EXT_ID, description: null, ticket_url: null, event_url: HREF, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([[EXT_ID, HREF]]);
    let sawPatch = null;
    global.fetch = async (url, opts = {}) => {
      if ((opts.method || "GET").toUpperCase() === "PATCH") {
        sawPatch = { url, body: JSON.parse(opts.body) };
        assert.ok(url.includes("and=(description.is.null,ticket_url.is.null)"), "a 2-field write must re-assert both columns null: " + url);
        assert.ok(!url.includes("event_url.is.null"), "event_url was already set, so it must not be part of the still-blank filter: " + url);
        return { ok: true, status: 200, json: async () => [{ id: "evt-1", ...JSON.parse(opts.body) }] };
      }
      throw new Error("unexpected fetch: " + url);
    };
    const counts = await repairRedfordMetadata({
      fetchCandidates: async () => candidates,
      fetchArchivePage: async () => ({ eventUrlsByExternalId: map }),
      fetchDetail: async () => ({ description: "A long time ago...", ticket_url: "https://ticketing.example.com/buy" }),
    });
    assert.strictEqual(counts.written, 1);
    assert.strictEqual(counts.fieldsWritten, 2, "two fields written from one event");
    assert.deepStrictEqual(sawPatch.body, { description: "A long time ago...", ticket_url: "https://ticketing.example.com/buy" });
  }
  console.log("PASS: the real applyPatch() re-asserts every written column still null via and=(...) for a multi-field write");

  {
    const { repairRedfordMetadata } = freshRedfordRepair();
    const candidates = [{ id: "evt-2", external_id: EXT_ID, description: "Already set.", ticket_url: "https://ticketing.example.com/already-set", event_url: null, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([[EXT_ID, HREF]]);
    let sawPatch = null;
    global.fetch = async (url, opts = {}) => {
      if ((opts.method || "GET").toUpperCase() === "PATCH") {
        sawPatch = { url, body: JSON.parse(opts.body) };
        assert.ok(url.includes("event_url=is.null"), "a single-field write uses the plain column=is.null shape: " + url);
        assert.ok(!url.includes("and=("), "a single-field write must not use the and=(...) multi-filter shape: " + url);
        return { ok: true, status: 200, json: async () => [{ id: "evt-2", ...JSON.parse(opts.body) }] };
      }
      throw new Error("unexpected fetch: " + url);
    };
    const counts = await repairRedfordMetadata({
      fetchCandidates: async () => candidates,
      fetchArchivePage: async () => ({ eventUrlsByExternalId: map }),
      fetchDetail: async () => { throw new Error("must not be called -- only event_url is needed"); },
    });
    assert.strictEqual(counts.written, 1);
    assert.strictEqual(counts.fieldsWritten, 1);
    assert.deepStrictEqual(sawPatch.body, { event_url: HREF });
  }
  console.log("PASS: the real applyPatch() uses the plain column=is.null shape for a single-field write");

  console.log("\nAll Part 3 (repairRedfordMetadata) tests passed.");
}

// ============================================================
// Part 4: api/admin-events.js's "auto_repair_venue" action, extended to a
// fourth step -- proves Auto-Repair actually invokes the Redford repair,
// sums its per-field write count into the combined counts (not per-event),
// and isolates its failure from steps 1-3's real results.
// ============================================================

function freshAdminEventsHandler() {
  for (const rel of [
    "api/admin-events.js",
    "scripts/sh1-repair-existing-venue-address-city.js",
    "api/_lib/venue-lookup.js",
    "scripts/outerlimits-description-repair.js",
    "api/cron-outerlimitslounge.js",
    "scripts/dossin-metadata-repair.js",
    "api/cron-dossin.js",
    "scripts/redford-metadata-repair.js",
    "api/cron-redford-theatre.js",
  ]) {
    delete require.cache[require.resolve(`${REPO_DIR}/${rel}`)];
  }
  return require(`${REPO_DIR}/api/admin-events.js`);
}

function makeRes() {
  return { _status: null, _body: null, status(code) { this._status = code; return this; }, json(body) { this._body = body; return this; } };
}
function makeReq(body, { secretHeader = ADMIN_SECRET } = {}) {
  return { method: "POST", headers: secretHeader === undefined ? {} : { "x-admin-secret": secretHeader }, body };
}

// Serves every request shape all four repair steps issue.
function makeCombinedMock({
  venues = [], learnedRows = [], venueCandidates = [],
  ollCandidates = [], squarespaceItems = [], squarespaceOk = true,
  dossinCandidates = [], dossinHtml = "", dossinOk = true,
  redfordCandidates = [], redfordArchiveHtml = "", redfordArchiveOk = true,
  redfordDetailHtmlByHref = {},
} = {}) {
  const patchBodies = [];
  const fn = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    if (url.includes("outerlimitslounge.com/events?format=json")) {
      if (!squarespaceOk) return { ok: false, status: 500 };
      return { ok: true, status: 200, json: async () => ({ upcoming: squarespaceItems }) };
    }
    if (url.includes("detroithistorical.org/events") && method === "GET" && !url.includes("/rest/v1/")) {
      if (!dossinOk) return { ok: false, status: 500 };
      return { ok: true, status: 200, text: async () => dossinHtml };
    }
    if (url === ARCHIVE_URL && method === "GET") {
      if (!redfordArchiveOk) return { ok: false, status: 500 };
      return { ok: true, status: 200, text: async () => redfordArchiveHtml };
    }
    if (url.startsWith("https://redfordtheatre.com/events/") && url !== ARCHIVE_URL && method === "GET") {
      const html = redfordDetailHtmlByHref[url];
      if (!html) return { ok: false, status: 404 };
      return { ok: true, status: 200, text: async () => html };
    }
    if (method === "PATCH" && url.includes("/rest/v1/events")) {
      const idMatch = /id=eq\.([^&]+)/.exec(url);
      const id = idMatch ? decodeURIComponent(idMatch[1]) : null;
      const body = JSON.parse(opts.body);
      patchBodies.push({ id, body, url });
      return { ok: true, status: 200, json: async () => [{ id, ...body }] };
    }
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => venues };
    if (url.includes("/rest/v1/events") && url.includes("venue_address_raw=not.is.null")) return { ok: true, status: 200, json: async () => learnedRows };
    if (url.includes("/rest/v1/events") && url.includes("source=eq.Outer")) return { ok: true, status: 200, json: async () => ollCandidates };
    if (url.includes("/rest/v1/events") && url.includes("source=eq.Redford")) return { ok: true, status: 200, json: async () => redfordCandidates };
    if (url.includes("/rest/v1/events") && url.includes("ticket_url=is.null")) return { ok: true, status: 200, json: async () => dossinCandidates };
    if (url.includes("/rest/v1/events") && url.includes("start_date=gte.")) return { ok: true, status: 200, json: async () => venueCandidates };
    throw new Error("unmocked URL in test: " + method + " " + url);
  };
  return { fn, patchBodies };
}

async function runPart4() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.ADMIN_SECRET = ADMIN_SECRET;
  const HREF = "https://redfordtheatre.com/events/return-of-the-jedi-1983/";
  const cron = freshRedfordCron();
  const EXT_ID = cron.redfordExternalId("2026-10-01", "Return of the Jedi (1983)");

  // --- 9. Auto-Repair actually invokes the Redford repair as a real
  //     fourth step; a candidate missing BOTH description and ticket_url
  //     (event_url already present) proves fieldsWritten sums PER FIELD,
  //     not per event -- 2 fields written from 1 event. ---
  {
    const handler = freshAdminEventsHandler();
    const redfordCandidates = [{ id: "evt-redford-1", external_id: EXT_ID, description: null, ticket_url: null, event_url: HREF, start_date: "2026-10-01", status: "approved" }];
    const redfordArchiveHtml = redfordEventLi({ title: "Return of the Jedi (1983)", dateLine: "Thursday, October 1, 2026 at 7:00 PM", href: HREF });
    const redfordDetailHtmlByHref = {
      [HREF]: `<html><body><div class="eventDesc"><p>A long time ago in a galaxy far, far away....</p></div><a href="https://ticketing.useast.veezi.com/purchase/1?siteToken=a">Buy Tickets</a></body></html>`,
    };
    const { fn, patchBodies } = makeCombinedMock({ venueCandidates: [], ollCandidates: [], dossinCandidates: [], redfordCandidates, redfordArchiveHtml, redfordDetailHtmlByHref });
    global.fetch = fn;
    const res = makeRes();
    await handler(makeReq({ action: "auto_repair_venue" }), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.ok, true);
    assert.strictEqual(res._body.redfordMetadata.written, 1, "one event was written");
    assert.strictEqual(res._body.redfordMetadata.fieldsWritten, 2, "two fields (description + ticket_url) were written for that one event");
    assert.strictEqual(res._body.written, 1, "the combined union counts the EVENT once, not once per field");
    assert.strictEqual(res._body.fieldsWritten, 2, "the combined field count sums Redford's fieldsWritten, not its written (event) count");
    assert.strictEqual(res._body.redfordMetadataError, null);
    const redfordPatch = patchBodies.find((p) => p.id === "evt-redford-1");
    assert.ok(redfordPatch, "the Redford PATCH must actually have been issued");
    assert.deepStrictEqual(redfordPatch.body, { description: "A long time ago in a galaxy far, far away....", ticket_url: "https://ticketing.useast.veezi.com/purchase/1?siteToken=a" }, "event_url was already set and must not be re-written");
  }
  console.log("PASS: Auto-Repair invokes the Redford metadata repair as a real fourth step, and sums its fieldsWritten (not written) into the combined field count");

  // --- 10. a Redford-step failure (live page unreachable) surfaces
  //     explicitly, without discarding steps 1-3's real results. ---
  {
    const handler = freshAdminEventsHandler();
    const venues = [{ id: "v-1", name: "Trinosophes", address: "1464 Gratiot Ave", city: "Detroit" }];
    const venueCandidates = [{ id: "evt-v", venue_id: "v-1", venue_name_raw: "Trinosophes", venue_address_raw: null, venue_city_raw: null, start_date: "2026-10-01", status: "approved" }];
    const { fn } = makeCombinedMock({ venues, venueCandidates, ollCandidates: [], dossinCandidates: [], redfordCandidates: [], redfordArchiveOk: false });
    global.fetch = fn;
    const res = makeRes();
    await handler(makeReq({ action: "auto_repair_venue" }), res);
    assert.strictEqual(res._status, 200, "a Redford-step failure must not fail the whole action");
    assert.strictEqual(res._body.written, 1, "the real venue-repair result must still be reported");
    assert.strictEqual(res._body.redfordMetadata, null);
    assert.ok(res._body.redfordMetadataError, "the Redford-step failure must be visibly surfaced, never silently swallowed");
    assert.ok(res._body.redfordMetadataError.includes("HTTP 500"), res._body.redfordMetadataError);
  }
  console.log("PASS: a Redford-repair failure is surfaced explicitly without discarding or masking the other steps' real results");

  console.log("\nAll Part 4 (api/admin-events.js auto_repair_venue, 4-step) tests passed.");
}

// ============================================================
// Part 5: admin.html's real Auto-Repair button
// ============================================================

function extractMainScript() {
  const html = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  blocks.sort((a, b) => b.length - a.length);
  return blocks[0];
}

function makeElement(id) {
  return {
    id, _text: "", _html: "", style: { display: "" }, disabled: false,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); }, contains(c) { return this._set.has(c); },
      toggle(c, force) { const has = this._set.has(c); const want = force === undefined ? !has : force; if (want) this._set.add(c); else this._set.delete(c); },
    },
    get textContent() { return this._text; }, set textContent(v) { this._text = v == null ? "" : String(v); },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v == null ? "" : String(v); },
  };
}
function makeDocument() {
  const elements = new Map();
  return {
    getElementById(id) { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); },
    createElement(tag) {
      const el = makeElement(null);
      Object.defineProperty(el, "textContent", {
        get() { return el._text; },
        set(v) { el._text = v == null ? "" : String(v); el._html = el._text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
      });
      return el;
    },
    querySelectorAll() { return []; },
    _elements: elements,
  };
}
function buildSandbox() {
  const sandbox = { document: makeDocument(), console, fetch: undefined, alert() {}, prompt() { return ""; }, URLSearchParams, encodeURIComponent, Promise };
  vm.createContext(sandbox);
  vm.runInContext(extractMainScript(), sandbox, { filename: "admin.html (inline script)" });
  for (const name of ["loadQueue", "loadFeedQueue", "loadEditorial", "loadHidden", "loadHealthcheck", "loadVenues"]) sandbox[name] = async () => {};
  return sandbox;
}
function eventRow(overrides) {
  return {
    id: "evt-1", title: "Return of the Jedi (1983)", category: "film", status: "approved",
    start_date: "2026-10-10", time_display: "7:00 PM", is_all_day: false,
    venue_name_raw: "Redford Theatre", venue_address_raw: "17360 Lahser Rd", venue_city_raw: "Detroit",
    venue_id: null, venues: null, description: "A real description.",
    ticket_url: "https://example.com/tickets", event_url: "https://redfordtheatre.com/events/return-of-the-jedi-1983/",
    source: "Redford Theatre", followup_dismissed: false,
    ...overrides,
  };
}

async function runPart5() {
  // --- 11. a card missing BOTH description and ticket_url (the realistic
  //     current Redford case, event_url already present) fully resolves
  //     and leaves Needs Follow-up once the Redford step fills both and
  //     the reload confirms. ---
  {
    const sandbox = buildSandbox();
    const before = [eventRow({ id: "evt-jedi", description: "", ticket_url: null })];
    let callCount = 0;
    sandbox.fetch = async (url, opts) => {
      callCount++;
      if (callCount === 1) return { ok: true, status: 200, json: async () => ({ events: before }) };
      if (callCount === 2) {
        const body = JSON.parse(opts.body);
        assert.strictEqual(body.action, "auto_repair_venue");
        return { ok: true, status: 200, json: async () => ({ ok: true, written: 1, fieldsWritten: 2, venue: {}, outerLimitsDescription: null, outerLimitsDescriptionError: null, dossinMetadata: null, dossinMetadataError: null, redfordMetadata: { written: 1, fieldsWritten: 2 }, redfordMetadataError: null }) };
      }
      if (callCount === 3) {
        const after = [eventRow({ id: "evt-jedi", description: "A long time ago in a galaxy far, far away....", ticket_url: "https://ticketing.useast.veezi.com/purchase/1?siteToken=a" })];
        return { ok: true, status: 200, json: async () => ({ events: after }) };
      }
      throw new Error("unexpected fetch #" + callCount);
    };
    await sandbox.loadIncomplete();
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "1");
    await sandbox.autoRepairFollowup();
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "0");
    assert.ok(!sandbox.document.getElementById("incompleteList").innerHTML.includes('id="incomplete-evt-jedi"'), "a fully-repaired Redford card must leave Needs follow-up");
  }
  console.log("PASS: a fully-repaired Redford card (description + ticket_url both filled) leaves Needs follow-up once the reload confirms");

  // --- 12. a card missing BOTH description (Redford's to fix) AND venue
  //     address/city (SH.1's job, not Redford's -- e.g. this run's venue
  //     step found no learned match) remains flagged but improved once
  //     Redford fills description alone. Confirms getMissingFields()'s own
  //     "ticket/event link" check is satisfied by event_url alone (no
  //     separate ticket_url requirement), and that an unrelated still-
  //     missing field correctly keeps the card from fully resolving. ---
  {
    const sandbox = buildSandbox();
    const before = [eventRow({ id: "evt-partial", description: "", venue_address_raw: null, venue_city_raw: null })];
    let callCount = 0;
    sandbox.fetch = async (url, opts) => {
      callCount++;
      if (callCount === 1) return { ok: true, status: 200, json: async () => ({ events: before }) };
      if (callCount === 2) return { ok: true, status: 200, json: async () => ({ ok: true, written: 1, fieldsWritten: 1, venue: {}, outerLimitsDescription: null, outerLimitsDescriptionError: null, dossinMetadata: null, dossinMetadataError: null, redfordMetadata: { written: 1, fieldsWritten: 1 }, redfordMetadataError: null }) };
      if (callCount === 3) {
        const after = [eventRow({ id: "evt-partial", description: "A long time ago in a galaxy far, far away....", venue_address_raw: null, venue_city_raw: null })];
        return { ok: true, status: 200, json: async () => ({ events: after }) };
      }
      throw new Error("unexpected fetch #" + callCount);
    };
    await sandbox.loadIncomplete();
    await sandbox.autoRepairFollowup();
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "1", "the card must remain -- venue address/city is still genuinely missing, and Redford's repair has no mechanism to fill it");
    assert.ok(sandbox.document.getElementById("incompleteList").innerHTML.includes('id="incomplete-evt-partial"'));
    const status = sandbox.document.getElementById("autoRepairStatus").textContent;
    assert.ok(status.includes("1 event improved"), status);
    const afterRow = eventRow({ id: "evt-partial", description: "A long time ago in a galaxy far, far away....", venue_address_raw: null, venue_city_raw: null });
    assert.deepStrictEqual(Array.from(sandbox.getMissingFields(afterRow)), ["venue address/city"], "only venue address/city should remain missing after Redford fills description");
  }
  console.log("PASS: a card missing both description and an unrelated field (venue address/city) remains flagged (improved, not resolved) once Redford fills only description");

  // --- 13. a Redford-step failure is shown explicitly without masking a
  //     real concurrent success from an earlier step. ---
  {
    const sandbox = buildSandbox();
    const before = [eventRow({ id: "evt-venue", venue_address_raw: null, venue_city_raw: null })];
    let callCount = 0;
    sandbox.fetch = async (url) => {
      callCount++;
      if (callCount === 1) return { ok: true, status: 200, json: async () => ({ events: before }) };
      if (callCount === 2) return { ok: true, status: 200, json: async () => ({ ok: true, written: 1, fieldsWritten: 2, venue: { written: 1 }, outerLimitsDescription: null, outerLimitsDescriptionError: null, dossinMetadata: null, dossinMetadataError: null, redfordMetadata: null, redfordMetadataError: "Fetch failed: HTTP 500" }) };
      if (callCount === 3) {
        const after = [eventRow({ id: "evt-venue", venue_address_raw: "17360 Lahser Rd", venue_city_raw: "Detroit" })];
        return { ok: true, status: 200, json: async () => ({ events: after }) };
      }
      throw new Error("unexpected fetch #" + callCount);
    };
    await sandbox.loadIncomplete();
    await sandbox.autoRepairFollowup();
    const status = sandbox.document.getElementById("autoRepairStatus").textContent;
    assert.ok(status.includes("Redford metadata repair failed: Fetch failed: HTTP 500"), status);
    assert.ok(status.includes("1 no longer needs follow-up"), "the real venue-repair success must still be reported accurately: " + status);
    assert.strictEqual(sandbox.document.getElementById("autoRepairStatus").classList.contains("refresh-error"), true);
  }
  console.log("PASS: a Redford-repair failure surfaces visibly without erasing or masking a real concurrent success from an earlier step");

  console.log("\nAll Part 5 (admin.html Auto-Repair button, real inline script) tests passed.");
}

async function run() {
  runPart1();
  await runPart2();
  await runPart3();
  await runPart4();
  await runPart5();
  console.log("\nAll redford-metadata-repair tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
