// test/dossin-metadata-repair.test.js — authoritative Detroit Historical
// Society / Dossin Great Lakes Museum EVENT URL recovery, integrated into
// Needs Follow-up Auto-Repair as step 3 (2026-09-23, after SH.1 venue
// repair and Outer Limits description repair).
//
// WHAT THIS SOURCE ACTUALLY OFFERS: api/cron-dossin.js's own
// parseDossinEvents() header comment documents (from a real, previously
// verified live fetch during the 2026-09-21 BUG-002 incident) that each
// event renders as TITLE, VENUE, a date/time block, then a "LEARN MORE"
// link. There is no description/excerpt anywhere in that block, and no
// link distinct from "LEARN MORE" that could honestly be called a ticket
// URL. So this repair ONLY EVER fills event_url -- never description,
// never a fabricated ticket_url. This file proves that limitation is
// respected as much as it proves the repair itself works.
//
// Also proves the GENERIC-LINK GUARD: since this environment cannot
// live-verify each event's "LEARN MORE" href is genuinely event-specific
// rather than a repeated link, every fetch rejects any href shared by more
// than one event, for every event that shares it -- never guessing either
// way.
//
// Run: node test/dossin-metadata-repair.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const ADMIN_SECRET = "test-admin-secret";

// ============================================================
// Part 1: api/cron-dossin.js's extended parsing -- event_url extraction
// and dossinExternalId(), proving this reuses the cron's REAL parser
// (and does not change its existing title/date/time behavior).
// ============================================================

function freshDossinCron() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-dossin.js`)];
  return require(`${REPO_DIR}/api/cron-dossin.js`);
}

function runPart1() {
  const cron = freshDossinCron();

  // Realistic per-event markup: an anchor with extra attributes (class,
  // target) wrapping the exact "Learn More" text, same shape a real
  // Drupal/WordPress card button would use.
  const html = `
<div>Dossin After Dark</div>
<div>Dossin Great Lakes Museum</div>
<div>September 19, 2026, 10:00am</div>
<div>- 2:00pm</div>
<div><a class="btn" href="https://www.detroithistorical.org/events/dossin-after-dark" target="_blank">Learn More</a></div>

<div>Guided tour</div>
<div>Dossin Great Lakes Museum</div>
<div>September 20, 2026, 11:00am</div>
<div><a href="https://www.detroithistorical.org/events/guided-tour">Learn More</a></div>

<div>No Link Event</div>
<div>Dossin Great Lakes Museum</div>
<div>September 21, 2026, 1:00pm</div>
<div>Some other unrelated line</div>
`;
  const events = cron.parseDossinEvents(html);

  const afterDark = events.find((e) => e.title === "Dossin After Dark");
  assert.ok(afterDark, "must still parse the event itself");
  assert.strictEqual(afterDark.date, "2026-09-19");
  assert.strictEqual(afterDark.time, "10:00am – 2:00pm", "existing date/time extraction must be completely unaffected by the new href capture");
  assert.strictEqual(afterDark.event_url, "https://www.detroithistorical.org/events/dossin-after-dark", "the split-line (end-time-continuation) event must still find its LEARN MORE link one line further out");

  const guidedTour = events.find((e) => e.title === "Guided tour");
  assert.ok(guidedTour);
  assert.strictEqual(guidedTour.event_url, "https://www.detroithistorical.org/events/guided-tour", "a single-line date event finds its LEARN MORE link at the very next line");

  const noLink = events.find((e) => e.title === "No Link Event");
  assert.ok(noLink);
  assert.strictEqual(noLink.event_url, null, "an event with no real 'learn more' anchor at that position must get null, never a guess");

  // Backward compatibility: the EXISTING test fixture (test/cron-dossin-
  // parse.test.js) uses plain `<div>Learn More</div>` with no anchor at
  // all -- must still yield event_url: null, never throw, never break
  // title/date/time extraction.
  const legacyHtml = `
<div>Guided tour</div>
<div>Dossin Great Lakes Museum</div>
<div>September 19, 2026, 11:00am</div>
<div>- 12:30pm</div>
<div>Learn More</div>
`;
  const legacyEvents = cron.parseDossinEvents(legacyHtml);
  assert.strictEqual(legacyEvents.length, 1);
  assert.strictEqual(legacyEvents[0].date, "2026-09-19");
  assert.strictEqual(legacyEvents[0].time, "11:00am – 12:30pm");
  assert.strictEqual(legacyEvents[0].event_url, null, "a plain 'Learn More' text line with no anchor must yield null, not throw or misparse");

  // dossinExternalId() -- same formula the cron's own upsert always used,
  // now named/exported instead of inlined, so the repair script can
  // compute an identical id with zero drift risk.
  assert.strictEqual(cron.dossinExternalId("2026-09-19", "Dossin After Dark"), "dossin-2026-09-19-dossin-after-dark");
  assert.strictEqual(cron.SOURCE_NAME, "Detroit Historical Society");
  assert.strictEqual(cron.SOURCE_URL, "https://www.detroithistorical.org/events");

  console.log("PASS: parseDossinEvents() captures a real per-event LEARN MORE href without affecting existing title/date/time extraction, and safely yields null when no anchor is present");
}

// ============================================================
// Part 2: scripts/dossin-metadata-repair.js's fetchEventUrlsByExternalId()
// -- the generic-link guard, proven against real fetched HTML.
// ============================================================

function freshDossinRepair() {
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/dossin-metadata-repair.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/cron-dossin.js`)];
  return require(`${REPO_DIR}/scripts/dossin-metadata-repair.js`);
}

async function runPart2() {
  const { fetchEventUrlsByExternalId } = freshDossinRepair();

  const html = `
<div>Dossin After Dark</div>
<div>Dossin Great Lakes Museum</div>
<div>September 19, 2026, 10:00am</div>
<div><a href="https://www.detroithistorical.org/events/dossin-after-dark">Learn More</a></div>

<div>Guided tour</div>
<div>Dossin Great Lakes Museum</div>
<div>September 20, 2026, 11:00am</div>
<div><a href="https://www.detroithistorical.org/events">Learn More</a></div>

<div>Free Admission 5-8pm</div>
<div>Dossin Great Lakes Museum</div>
<div>September 21, 2026, 5:00pm</div>
<div><a href="https://www.detroithistorical.org/events">Learn More</a></div>
`;
  const mockFetch = async (url) => {
    assert.ok(url.includes("detroithistorical.org/events"));
    return { ok: true, status: 200, text: async () => html };
  };
  const { map, genericLinksSkipped } = await fetchEventUrlsByExternalId(mockFetch);

  assert.strictEqual(map.get("dossin-2026-09-19-dossin-after-dark"), "https://www.detroithistorical.org/events/dossin-after-dark", "a unique-per-event link is kept");
  assert.ok(!map.has("dossin-2026-09-20-guided-tour"), "a link shared by 2+ events must be rejected as generic, never kept for any of them");
  assert.ok(!map.has("dossin-2026-09-21-free-admission-5-8pm"), "the same generic link rejected for the other event sharing it");
  assert.strictEqual(genericLinksSkipped, 2, "both events sharing the generic link are counted, honestly, as skipped");

  const failingFetch = async () => ({ ok: false, status: 500 });
  await assert.rejects(() => fetchEventUrlsByExternalId(failingFetch), /Fetch failed: HTTP 500/);

  console.log("PASS: fetchEventUrlsByExternalId() keeps only hrefs unique to one event and rejects any link shared across multiple events as generic");
}

// ============================================================
// Part 3: scripts/dossin-metadata-repair.js's repairDossinMetadata()
// ============================================================

async function runPart3() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

  // --- 1. authoritative event/ticket link fills a blank link ---
  {
    const { repairDossinMetadata } = freshDossinRepair();
    const candidates = [{ id: "evt-1", external_id: "dossin-2026-10-01-dossin-after-dark", ticket_url: null, event_url: null, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([["dossin-2026-10-01-dossin-after-dark", "https://www.detroithistorical.org/events/dossin-after-dark"]]);
    const patchBodies = [];
    const counts = await repairDossinMetadata({
      fetchCandidates: async () => candidates,
      fetchEventUrls: async () => ({ map, genericLinksSkipped: 0 }),
      applyPatchFn: async (_url, _headers, id, eventUrl) => { patchBodies.push({ id, eventUrl }); return true; },
    });
    assert.strictEqual(counts.written, 1);
    assert.deepStrictEqual(counts.writtenIds, ["evt-1"]);
    assert.strictEqual(patchBodies[0].eventUrl, "https://www.detroithistorical.org/events/dossin-after-dark");
  }
  console.log("PASS: a blank ticket/event link is filled from the authoritative per-event link");

  // --- 2. existing nonblank value is never overwritten, even defensively ---
  {
    const { repairDossinMetadata } = freshDossinRepair();
    const candidates = [{ id: "evt-1", external_id: "dossin-2026-10-01-dossin-after-dark", ticket_url: "https://tickets.example.com/already-set", event_url: null, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([["dossin-2026-10-01-dossin-after-dark", "https://www.detroithistorical.org/events/dossin-after-dark"]]);
    let patchCalled = false;
    const counts = await repairDossinMetadata({
      fetchCandidates: async () => candidates,
      fetchEventUrls: async () => ({ map, genericLinksSkipped: 0 }),
      applyPatchFn: async () => { patchCalled = true; return true; },
    });
    assert.strictEqual(counts.written, 0);
    assert.ok(!patchCalled, "an event with either link already set must never be patched");
  }
  console.log("PASS: an event with an existing nonblank ticket_url or event_url is never overwritten");

  // --- 3. source-missing value (no matching link at all) remains blank ---
  {
    const { repairDossinMetadata } = freshDossinRepair();
    const candidates = [{ id: "evt-1", external_id: "dossin-2026-10-01-free-admission", ticket_url: null, event_url: null, start_date: "2026-10-01", status: "approved" }];
    const map = new Map(); // no link recovered for this event at all
    let patchCalled = false;
    const counts = await repairDossinMetadata({
      fetchCandidates: async () => candidates,
      fetchEventUrls: async () => ({ map, genericLinksSkipped: 0 }),
      applyPatchFn: async () => { patchCalled = true; return true; },
    });
    assert.strictEqual(counts.unmatched, 1);
    assert.strictEqual(counts.written, 0);
    assert.ok(!patchCalled);
  }
  console.log("PASS: an event with no authoritative link at all is left blank, never fabricated");

  // --- 4. unmatched events (external_id not present, e.g. no longer on
  //     the live page) remain untouched ---
  {
    const { repairDossinMetadata } = freshDossinRepair();
    const candidates = [{ id: "evt-gone", external_id: "dossin-2020-01-01-old-event", ticket_url: null, event_url: null, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([["dossin-2026-10-01-dossin-after-dark", "https://www.detroithistorical.org/events/dossin-after-dark"]]);
    let patchCalled = false;
    const counts = await repairDossinMetadata({
      fetchCandidates: async () => candidates,
      fetchEventUrls: async () => ({ map, genericLinksSkipped: 0 }),
      applyPatchFn: async () => { patchCalled = true; return true; },
    });
    assert.strictEqual(counts.unmatched, 1);
    assert.ok(!patchCalled);
  }
  console.log("PASS: an event with no matching source entry is left untouched");

  // --- 5. status and all unrelated fields remain unchanged -- the write
  //     touches event_url ONLY ---
  {
    const { repairDossinMetadata } = freshDossinRepair();
    const candidates = [{ id: "evt-1", external_id: "dossin-2026-10-01-dossin-after-dark", ticket_url: null, event_url: null, start_date: "2026-10-01", status: "pending_review" }];
    const map = new Map([["dossin-2026-10-01-dossin-after-dark", "https://www.detroithistorical.org/events/dossin-after-dark"]]);
    let capturedArgs = null;
    await repairDossinMetadata({
      fetchCandidates: async () => candidates,
      fetchEventUrls: async () => ({ map, genericLinksSkipped: 0 }),
      applyPatchFn: async (_url, _headers, id, eventUrl) => { capturedArgs = { id, eventUrl }; return true; },
    });
    assert.deepStrictEqual(capturedArgs, { id: "evt-1", eventUrl: "https://www.detroithistorical.org/events/dossin-after-dark" }, "the write must touch event_url only -- never status or any other column");
  }
  console.log("PASS: status and all unrelated fields are left untouched -- the write is event_url-only");

  // --- 6. a concurrent-write conflict is skipped honestly ---
  {
    const { repairDossinMetadata } = freshDossinRepair();
    const candidates = [{ id: "evt-1", external_id: "dossin-2026-10-01-dossin-after-dark", ticket_url: null, event_url: null, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([["dossin-2026-10-01-dossin-after-dark", "https://www.detroithistorical.org/events/dossin-after-dark"]]);
    const counts = await repairDossinMetadata({
      fetchCandidates: async () => candidates,
      fetchEventUrls: async () => ({ map, genericLinksSkipped: 0 }),
      applyPatchFn: async () => false,
    });
    assert.strictEqual(counts.written, 0);
    assert.strictEqual(counts.skippedConcurrentChange, 1);
  }
  console.log("PASS: a concurrent-write conflict is skipped honestly, never counted as written");

  // --- 7. the REAL applyPatch() -- correct URL filter (both link columns
  //     re-asserted null) and event_url-only body ---
  {
    const { repairDossinMetadata } = freshDossinRepair();
    const candidates = [{ id: "evt-1", external_id: "dossin-2026-10-01-dossin-after-dark", ticket_url: null, event_url: null, start_date: "2026-10-01", status: "approved" }];
    const map = new Map([["dossin-2026-10-01-dossin-after-dark", "https://www.detroithistorical.org/events/dossin-after-dark"]]);
    let sawPatch = null;
    global.fetch = async (url, opts = {}) => {
      if ((opts.method || "GET").toUpperCase() === "PATCH") {
        sawPatch = { url, body: JSON.parse(opts.body) };
        assert.ok(url.includes("ticket_url=is.null"), "must re-assert ticket_url.is.null");
        assert.ok(url.includes("event_url=is.null"), "must re-assert event_url.is.null");
        return { ok: true, status: 200, json: async () => [{ id: "evt-1", event_url: "https://www.detroithistorical.org/events/dossin-after-dark" }] };
      }
      throw new Error("unexpected fetch: " + url);
    };
    const counts = await repairDossinMetadata({
      fetchCandidates: async () => candidates,
      fetchEventUrls: async () => ({ map, genericLinksSkipped: 0 }),
    });
    assert.strictEqual(counts.written, 1);
    assert.deepStrictEqual(sawPatch.body, { event_url: "https://www.detroithistorical.org/events/dossin-after-dark" });
  }
  console.log("PASS: the real applyPatch() re-asserts both link columns null at write time and writes event_url only");

  console.log("\nAll Part 3 (repairDossinMetadata) tests passed.");
}

// ============================================================
// Part 4: api/admin-events.js's "auto_repair_venue" action, extended to a
// third step -- proves Auto-Repair actually invokes the Dossin repair,
// unions it into the combined counts, and isolates its failure.
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

// Serves every request shape all three repair steps issue.
function makeCombinedMock({
  venues = [], learnedRows = [], venueCandidates = [],
  ollCandidates = [], squarespaceItems = [], squarespaceOk = true,
  dossinCandidates = [], dossinHtml = "", dossinOk = true,
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

  // --- 8. Auto-Repair actually invokes the Dossin repair as a real third
  //     step, and its written event is included in the combined union. ---
  {
    const handler = freshAdminEventsHandler();
    const dossinCandidates = [{ id: "evt-dossin-1", external_id: "dossin-2026-10-01-dossin-after-dark", ticket_url: null, event_url: null, start_date: "2026-10-01", status: "approved" }];
    const dossinHtml = `
<div>Dossin After Dark</div>
<div>Dossin Great Lakes Museum</div>
<div>October 1, 2026, 7:00pm</div>
<div><a href="https://www.detroithistorical.org/events/dossin-after-dark">Learn More</a></div>
`;
    const { fn, patchBodies } = makeCombinedMock({ venueCandidates: [], ollCandidates: [], dossinCandidates, dossinHtml });
    global.fetch = fn;
    const res = makeRes();
    await handler(makeReq({ action: "auto_repair_venue" }), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.ok, true);
    assert.strictEqual(res._body.dossinMetadata.written, 1);
    assert.strictEqual(res._body.written, 1, "the Dossin step's written event must be included in the combined union");
    assert.strictEqual(res._body.fieldsWritten, 1);
    assert.strictEqual(res._body.dossinMetadataError, null);
    const dossinPatch = patchBodies.find((p) => "event_url" in p.body);
    assert.ok(dossinPatch, "the Dossin PATCH must actually have been issued");
    assert.strictEqual(dossinPatch.body.event_url, "https://www.detroithistorical.org/events/dossin-after-dark");
  }
  console.log("PASS: Auto-Repair invokes the Dossin metadata repair as a real third step, and its result is folded into the combined counts");

  // --- 9. a Dossin-step failure (live page unreachable) surfaces
  //     explicitly, without discarding steps 1/2's real results. ---
  {
    const handler = freshAdminEventsHandler();
    const venues = [{ id: "v-1", name: "Trinosophes", address: "1464 Gratiot Ave", city: "Detroit" }];
    const venueCandidates = [{ id: "evt-v", venue_id: "v-1", venue_name_raw: "Trinosophes", venue_address_raw: null, venue_city_raw: null, start_date: "2026-10-01", status: "approved" }];
    const { fn } = makeCombinedMock({ venues, venueCandidates, ollCandidates: [], dossinCandidates: [], dossinOk: false });
    global.fetch = fn;
    const res = makeRes();
    await handler(makeReq({ action: "auto_repair_venue" }), res);
    assert.strictEqual(res._status, 200, "a Dossin-step failure must not fail the whole action");
    assert.strictEqual(res._body.written, 1, "the real venue-repair result must still be reported");
    assert.strictEqual(res._body.dossinMetadata, null);
    assert.ok(res._body.dossinMetadataError, "the Dossin-step failure must be visibly surfaced, never silently swallowed");
  }
  console.log("PASS: a Dossin-repair failure is surfaced explicitly without discarding or masking the other steps' real results");

  console.log("\nAll Part 4 (api/admin-events.js auto_repair_venue, 3-step) tests passed.");
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
    id: "evt-1", title: "Dossin After Dark", category: "museum", status: "approved",
    start_date: "2026-10-10", time_display: "7:00 PM", is_all_day: false,
    venue_name_raw: "Dossin Great Lakes Museum", venue_address_raw: "100 Strand Dr", venue_city_raw: "Detroit",
    venue_id: null, venues: null, description: "A real description.",
    ticket_url: "https://example.com/tickets", event_url: null,
    source: "Detroit Historical Society", followup_dismissed: false,
    ...overrides,
  };
}

async function runPart5() {
  // --- 10. a card missing ONLY the ticket/event link leaves Needs
  //     follow-up once the Dossin step fills it and the reload confirms. ---
  {
    const sandbox = buildSandbox();
    const before = [eventRow({ id: "evt-link-only", ticket_url: null, event_url: null })];
    let callCount = 0;
    sandbox.fetch = async (url, opts) => {
      callCount++;
      if (callCount === 1) return { ok: true, status: 200, json: async () => ({ events: before }) };
      if (callCount === 2) {
        const body = JSON.parse(opts.body);
        assert.strictEqual(body.action, "auto_repair_venue");
        return { ok: true, status: 200, json: async () => ({ ok: true, written: 1, fieldsWritten: 1, venue: {}, outerLimitsDescription: null, outerLimitsDescriptionError: null, dossinMetadata: { written: 1 }, dossinMetadataError: null }) };
      }
      if (callCount === 3) {
        const after = [eventRow({ id: "evt-link-only", ticket_url: null, event_url: "https://www.detroithistorical.org/events/dossin-after-dark" })];
        return { ok: true, status: 200, json: async () => ({ events: after }) };
      }
      throw new Error("unexpected fetch #" + callCount);
    };
    await sandbox.loadIncomplete();
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "1");
    await sandbox.autoRepairFollowup();
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "0");
    assert.ok(!sandbox.document.getElementById("incompleteList").innerHTML.includes('id="incomplete-evt-link-only"'), "a link-only card must leave Needs follow-up once the Dossin repair fills it");
  }
  console.log("PASS: a card missing only the ticket/event link leaves Needs follow-up once Dossin repair fills it");

  // --- 11. 2026-09-23 closure update: a card missing BOTH description and
  //     the link (the realistic current Dossin case) now fully LEAVES
  //     Needs Follow-up once the link is filled -- Dossin's own parsed
  //     block structurally never has a description (see api/cron-dossin.js
  //     's own header comment), so description is a confirmed source
  //     limitation for this source (see admin.html's
  //     SOURCE_FIELD_LIMITATIONS), not an actionable gap. Only the link
  //     was ever actionable here; once Dossin's own repair fills it, there
  //     is nothing left for Jody to act on. getMissingFields() itself is
  //     untouched (still truthfully reports description as missing) --
  //     only the actionable-queue classification changed. ---
  {
    const sandbox = buildSandbox();
    const before = [eventRow({ id: "evt-both-missing", description: "", ticket_url: null, event_url: null })];
    let callCount = 0;
    sandbox.fetch = async (url, opts) => {
      callCount++;
      if (callCount === 1) return { ok: true, status: 200, json: async () => ({ events: before }) };
      if (callCount === 2) return { ok: true, status: 200, json: async () => ({ ok: true, written: 1, fieldsWritten: 1, venue: {}, outerLimitsDescription: null, outerLimitsDescriptionError: null, dossinMetadata: { written: 1 }, dossinMetadataError: null }) };
      if (callCount === 3) {
        const after = [eventRow({ id: "evt-both-missing", description: "", ticket_url: null, event_url: "https://www.detroithistorical.org/events/dossin-after-dark" })];
        return { ok: true, status: 200, json: async () => ({ events: after }) };
      }
      throw new Error("unexpected fetch #" + callCount);
    };
    await sandbox.loadIncomplete();
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "1", "the link gap is genuinely actionable, so the card starts flagged");
    await sandbox.autoRepairFollowup();
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "0", "once the link is filled, the only remaining gap (description) is source-limited for Dossin -- nothing actionable is left");
    assert.ok(!sandbox.document.getElementById("incompleteList").innerHTML.includes('id="incomplete-evt-both-missing"'), "the card must leave Needs follow-up entirely");
    const status = sandbox.document.getElementById("autoRepairStatus").textContent;
    assert.ok(status.includes("1 no longer needs follow-up"), status);
    // getMissingFields() itself stays 100% truthful -- description really
    // is still blank, this just isn't asked of Jody anymore.
    const afterRow = eventRow({ id: "evt-both-missing", description: "", ticket_url: null, event_url: "https://www.detroithistorical.org/events/dossin-after-dark" });
    assert.deepStrictEqual(Array.from(sandbox.getMissingFields(afterRow)), ["description"], "getMissingFields() must still truthfully report description as missing, even though it's no longer actionable");
  }
  console.log("PASS: a card missing both description and the link now leaves Needs follow-up once the link is filled -- description alone is a confirmed Dossin source limitation, not an action item, though getMissingFields() still reports it truthfully");

  // --- 12. a Dossin-step failure is shown explicitly without masking a
  //     real concurrent success from an earlier step. ---
  {
    const sandbox = buildSandbox();
    const before = [eventRow({ id: "evt-venue", venue_address_raw: null, venue_city_raw: null })];
    let callCount = 0;
    sandbox.fetch = async (url) => {
      callCount++;
      if (callCount === 1) return { ok: true, status: 200, json: async () => ({ events: before }) };
      if (callCount === 2) return { ok: true, status: 200, json: async () => ({ ok: true, written: 1, fieldsWritten: 2, venue: { written: 1 }, outerLimitsDescription: null, outerLimitsDescriptionError: null, dossinMetadata: null, dossinMetadataError: "Fetch failed: HTTP 500" }) };
      if (callCount === 3) {
        const after = [eventRow({ id: "evt-venue", venue_address_raw: "1 Real St", venue_city_raw: "Detroit" })];
        return { ok: true, status: 200, json: async () => ({ events: after }) };
      }
      throw new Error("unexpected fetch #" + callCount);
    };
    await sandbox.loadIncomplete();
    await sandbox.autoRepairFollowup();
    const status = sandbox.document.getElementById("autoRepairStatus").textContent;
    assert.ok(status.includes("Dossin metadata repair failed: Fetch failed: HTTP 500"), status);
    assert.ok(status.includes("1 no longer needs follow-up"), "the real venue-repair success must still be reported accurately: " + status);
    assert.strictEqual(sandbox.document.getElementById("autoRepairStatus").classList.contains("refresh-error"), true);
  }
  console.log("PASS: a Dossin-repair failure surfaces visibly without erasing or masking a real concurrent success from an earlier step");

  console.log("\nAll Part 5 (admin.html Auto-Repair button, real inline script) tests passed.");
}

async function run() {
  runPart1();
  await runPart2();
  await runPart3();
  await runPart4();
  await runPart5();
  console.log("\nAll dossin-metadata-repair tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
