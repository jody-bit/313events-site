// test/admin-auto-repair-venue.test.js — Needs Follow-up "Auto-Repair" (V1, 2026-09-22)
//
// Auto-Repair V1 adds NO new repair logic anywhere: it only exposes the
// existing, already-tested SH.1 mechanism (api/_lib/venue-lookup.js's
// resolveVenueAddressCityRepair(), via
// scripts/sh1-repair-existing-venue-address-city.js's repairExistingEvents(),
// unmodified except for an additive `fieldsWritten` counter) through a new
// api/admin-events.js POST action and a new admin.html button. This file's
// job is therefore to prove the WIRING, not to re-prove SH.1's own repair
// decision correctness (see test/venue-address-repair.test.js,
// test/sh1-repair-existing-events.test.js for that -- already passing,
// untouched here).
//
// Part 1 exercises the real api/admin-events.js "auto_repair_venue" action
// end-to-end against a mocked Supabase layer (global.fetch), proving the
// endpoint actually calls the existing script and returns its counts,
// including the new fieldsWritten field. Part 2 runs the REAL inline
// <script> from admin.html in a Node vm context (same technique as
// test/admin-needs-followup-refresh.test.js -- not a hand-copied
// reproduction), proving the button's before/after diff, its success and
// failure messaging, and that a card only ever leaves the list because a
// real reload+recompute found it clear.
//
// Run: node test/admin-auto-repair-venue.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const ADMIN_SECRET = "test-admin-secret";

// ============================================================
// Part 1: api/admin-events.js's "auto_repair_venue" action
// ============================================================

function freshAdminEventsHandler() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/admin-events.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/scripts/sh1-repair-existing-venue-address-city.js`)];
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  return require(`${REPO_DIR}/api/admin-events.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

function makeReq(body, { auth = `Bearer ignored`, secretHeader = ADMIN_SECRET } = {}) {
  return {
    method: "POST",
    headers: secretHeader === undefined ? {} : { "x-admin-secret": secretHeader },
    body,
  };
}

// Serves the exact 4 request shapes repairExistingEvents() issues:
// 1. GET  /rest/v1/venues?select=id,name,address,city...          (canonical venues)
// 2. GET  /rest/v1/events?venue_address_raw=not.is.null...        (learned map)
// 3. GET  /rest/v1/events?start_date=gte...&or=(...is.null...)... (repair candidates)
// 4. PATCH /rest/v1/events?id=eq.<id>&...                         (the write)
function makeSupabaseMock({ venues = [], learnedRows = [], candidates = [], patchable = true } = {}) {
  const patchedIds = [];
  const patchBodies = [];
  const fn = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    if (method === "PATCH" && url.includes("/rest/v1/events")) {
      const idMatch = /id=eq\.([^&]+)/.exec(url);
      const id = idMatch ? decodeURIComponent(idMatch[1]) : null;
      const body = JSON.parse(opts.body);
      patchBodies.push({ id, body, url });
      if (!patchable) return { ok: true, status: 200, json: async () => [] }; // simulate concurrent-write loss
      patchedIds.push(id);
      return { ok: true, status: 200, json: async () => [{ id, ...body }] };
    }
    if (url.includes("/rest/v1/venues")) {
      return { ok: true, status: 200, json: async () => venues };
    }
    if (url.includes("/rest/v1/events") && url.includes("venue_address_raw=not.is.null")) {
      return { ok: true, status: 200, json: async () => learnedRows };
    }
    if (url.includes("/rest/v1/events") && url.includes("start_date=gte.")) {
      return { ok: true, status: 200, json: async () => candidates };
    }
    throw new Error("unmocked URL in test: " + method + " " + url);
  };
  return { fn, patchedIds, patchBodies };
}

async function runPart1() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  // --- 1. auth: missing/incorrect x-admin-secret -> 401, no repair attempted ---
  {
    const handler = freshAdminEventsHandler();
    let fetchCalled = false;
    global.fetch = async () => { fetchCalled = true; return { ok: true, status: 200, json: async () => [] }; };
    const res = makeRes();
    await handler(makeReq({ action: "auto_repair_venue" }, { secretHeader: "wrong-secret" }), res);
    assert.strictEqual(res._status, 401);
    assert.ok(!fetchCalled, "an unauthorized auto_repair_venue call must never touch the database");
  }
  console.log("PASS: auto_repair_venue requires a correct x-admin-secret (401 otherwise, no DB access)");

  // --- 2. a fully blank event resolved by canonical venue_id gets both
  //     fields repaired; fieldsWritten counts 2 for this one event ---
  {
    const handler = freshAdminEventsHandler();
    const venues = [{ id: "v-1", name: "Trinosophes", address: "1464 Gratiot Ave", city: "Detroit" }];
    const candidates = [
      { id: "evt-1", venue_id: "v-1", venue_name_raw: "Trinosophes", venue_address_raw: null, venue_city_raw: null, start_date: "2026-10-01", status: "approved" },
    ];
    const { fn, patchedIds, patchBodies } = makeSupabaseMock({ venues, candidates });
    global.fetch = fn;
    const res = makeRes();
    await handler(makeReq({ action: "auto_repair_venue" }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.written, 1);
    assert.strictEqual(res._body.fieldsWritten, 2, "both venue_address_raw and venue_city_raw were blank -- 2 fields, 1 event");
    assert.deepStrictEqual(patchedIds, ["evt-1"]);
    assert.deepStrictEqual(patchBodies[0].body, { venue_address_raw: "1464 Gratiot Ave", venue_city_raw: "Detroit" });
    assert.ok(!("status" in patchBodies[0].body), "the PATCH body must never include status");
    assert.ok(!("venue_id" in patchBodies[0].body) || patchBodies[0].body.venue_id === undefined, "venue_id was already set on this event -- must not be re-sent");
  }
  console.log("PASS: a fully-blank event with a canonical venue_id match is repaired, both fields counted");

  // --- 3. a partially-blank event (only city blank) gets exactly 1 field
  //     repaired; total fieldsWritten across 2 events sums correctly ---
  {
    const handler = freshAdminEventsHandler();
    const venues = [{ id: "v-1", name: "Trinosophes", address: "1464 Gratiot Ave", city: "Detroit" }];
    const candidates = [
      { id: "evt-1", venue_id: "v-1", venue_name_raw: "Trinosophes", venue_address_raw: null, venue_city_raw: null, start_date: "2026-10-01", status: "approved" },
      { id: "evt-2", venue_id: "v-1", venue_name_raw: "Trinosophes", venue_address_raw: "1464 Gratiot Ave", venue_city_raw: null, start_date: "2026-10-02", status: "pending_review" },
    ];
    const { fn, patchBodies } = makeSupabaseMock({ venues, candidates });
    global.fetch = fn;
    const res = makeRes();
    await handler(makeReq({ action: "auto_repair_venue" }), res);
    assert.strictEqual(res._body.written, 2);
    assert.strictEqual(res._body.fieldsWritten, 3, "event 1 contributes 2 fields, event 2 contributes 1 (city only) -- 3 total");
    const evt2Patch = patchBodies.find((p) => p.id === "evt-2");
    assert.deepStrictEqual(evt2Patch.body, { venue_city_raw: "Detroit" }, "event 2 already had venue_address_raw -- must not be resent or overwritten");
  }
  console.log("PASS: fieldsWritten correctly sums per-event field counts, including a partially-blank event");

  // --- 4. an event with no canonical/learned match is left completely
  //     alone -- no PATCH issued, counted unresolved, nonblank fields would
  //     never be at risk here anyway since this connector never proposes a
  //     patch for it ---
  {
    const handler = freshAdminEventsHandler();
    const candidates = [
      { id: "evt-unmatched", venue_id: null, venue_name_raw: "Some Unlisted Venue", venue_address_raw: null, venue_city_raw: null, start_date: "2026-10-01", status: "approved" },
    ];
    const { fn, patchedIds } = makeSupabaseMock({ venues: [], learnedRows: [], candidates });
    global.fetch = fn;
    const res = makeRes();
    await handler(makeReq({ action: "auto_repair_venue" }), res);
    assert.strictEqual(res._body.written, 0);
    assert.strictEqual(res._body.fieldsWritten, 0);
    assert.strictEqual(res._body.unresolved, 1);
    assert.deepStrictEqual(patchedIds, [], "an unresolved event must never be PATCHed");
  }
  console.log("PASS: an event with no canonical/learned venue match is left unresolved, never patched");

  // --- 5. a concurrent write (PATCH filter no longer matches -- field was
  //     no longer null at write time) is counted as skipped, never as a
  //     silent success, and never reported as written ---
  {
    const handler = freshAdminEventsHandler();
    const venues = [{ id: "v-1", name: "Trinosophes", address: "1464 Gratiot Ave", city: "Detroit" }];
    const candidates = [
      { id: "evt-1", venue_id: "v-1", venue_name_raw: "Trinosophes", venue_address_raw: null, venue_city_raw: null, start_date: "2026-10-01", status: "approved" },
    ];
    const { fn } = makeSupabaseMock({ venues, candidates, patchable: false });
    global.fetch = fn;
    const res = makeRes();
    await handler(makeReq({ action: "auto_repair_venue" }), res);
    assert.strictEqual(res._body.written, 0);
    assert.strictEqual(res._body.fieldsWritten, 0, "a skipped-by-concurrent-write patch must not be counted as fields written");
    assert.strictEqual(res._body.skippedConcurrentChange, 1);
  }
  console.log("PASS: a concurrent-write conflict is skipped honestly, never counted as written");

  // --- 6. a lookup failure (candidates fetch itself fails) surfaces as a
  //     clear error response, never a 200 with misleading counts ---
  {
    const handler = freshAdminEventsHandler();
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("venue_address_raw=not.is.null")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("start_date=gte.")) return { ok: false, status: 500, text: async () => "boom" };
      throw new Error("unexpected URL: " + url);
    };
    const res = makeRes();
    await handler(makeReq({ action: "auto_repair_venue" }), res);
    assert.strictEqual(res._status, 500);
    assert.ok(res._body.error, "a candidate-fetch failure must return a visible error");
  }
  console.log("PASS: a candidate-fetch failure surfaces as an explicit error response");

  console.log("\nAll Part 1 (api/admin-events.js auto_repair_venue) tests passed.");
}

// ============================================================
// Part 2: admin.html's real Auto-Repair button (the actual inline <script>)
// ============================================================

function extractMainScript() {
  const html = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  blocks.sort((a, b) => b.length - a.length);
  return blocks[0];
}

function makeElement(id) {
  return {
    id,
    _text: "",
    _html: "",
    style: { display: "" },
    disabled: false,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) {
        const has = this._set.has(c);
        const want = force === undefined ? !has : force;
        if (want) this._set.add(c); else this._set.delete(c);
      },
    },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v == null ? "" : String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v == null ? "" : String(v); },
  };
}

function makeDocument() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(tag) {
      const el = makeElement(null);
      Object.defineProperty(el, "textContent", {
        get() { return el._text; },
        set(v) {
          el._text = v == null ? "" : String(v);
          el._html = el._text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },
      });
      return el;
    },
    querySelectorAll() { return []; },
    _elements: elements,
  };
}

function buildSandbox() {
  const sandbox = {
    document: makeDocument(),
    console,
    fetch: undefined,
    alert() {},
    prompt() { return ""; },
    URLSearchParams,
    encodeURIComponent,
    Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(extractMainScript(), sandbox, { filename: "admin.html (inline script)" });
  for (const name of ["loadQueue", "loadFeedQueue", "loadEditorial", "loadHidden", "loadHealthcheck", "loadVenues"]) {
    sandbox[name] = async () => {};
  }
  return sandbox;
}

function eventRow(overrides) {
  return {
    id: "evt-1",
    title: "Some Event",
    category: "music",
    status: "approved",
    start_date: "2026-10-10",
    time_display: "7:00 PM",
    is_all_day: false,
    venue_name_raw: "Some Venue",
    venue_address_raw: "123 Main St",
    venue_city_raw: "Detroit",
    venue_id: null,
    venues: null,
    description: "A real description.",
    ticket_url: "https://example.com/tickets",
    event_url: null,
    source: "Manual",
    followup_dismissed: false,
    ...overrides,
  };
}

async function runPart2() {
  // --- 7. before/after diff: a fully-repaired card leaves the list, a
  //     partially-repaired card stays but with fewer missing fields, and
  //     an untouched card is unaffected -- proven via the REAL
  //     loadIncomplete()/getMissingFields(), called twice, exactly as
  //     autoRepairFollowup() itself calls them. ---
  {
    const sandbox = buildSandbox();
    // BEFORE: 3 flagged events.
    //   evt-repaired:  missing only "venue address/city" -> will be fully cleared
    //   evt-partial:   missing "venue address/city" AND "description" -> only address/city clears
    //   evt-untouched: missing "start time" (not something Auto-Repair V1 touches) -> unchanged
    const before = [
      eventRow({ id: "evt-repaired", venue_address_raw: null, venue_city_raw: null }),
      eventRow({ id: "evt-partial", venue_address_raw: null, venue_city_raw: null, description: "" }),
      eventRow({ id: "evt-untouched", time_display: null }),
    ];
    let callCount = 0;
    sandbox.fetch = async (url, opts) => {
      callCount++;
      if (callCount === 1) {
        // Initial load, populating lastFlaggedIncomplete "before" state.
        assert.ok(url.includes("incomplete=1"));
        return { ok: true, status: 200, json: async () => ({ events: before }) };
      }
      if (callCount === 2) {
        // The Auto-Repair POST itself.
        assert.strictEqual(opts.method, "POST");
        const body = JSON.parse(opts.body);
        assert.strictEqual(body.action, "auto_repair_venue");
        // Mid-flight: button disabled, status shows the "Auto-repairing N"
        // message, captured synchronously here since this mock runs before
        // autoRepairFollowup() proceeds past its own first await.
        assert.strictEqual(sandbox.document.getElementById("autoRepairBtn").disabled, true);
        assert.strictEqual(sandbox.document.getElementById("autoRepairStatus").textContent, "Auto-repairing 3 events…");
        return { ok: true, status: 200, json: async () => ({ ok: true, written: 2, fieldsWritten: 3, unresolved: 1, skippedConcurrentChange: 0 }) };
      }
      if (callCount === 3) {
        // The reload after repair -- reflects the DB state AFTER the patch:
        // evt-repaired is now fully clear (dropped from server response
        // entirely is unrealistic for a real DB, so simulate it as
        // present but now fully populated), evt-partial has address/city
        // filled but description still blank, evt-untouched unchanged.
        assert.ok(url.includes("incomplete=1"));
        const after = [
          eventRow({ id: "evt-repaired", venue_address_raw: "1 Real St", venue_city_raw: "Detroit" }), // fully clear now
          eventRow({ id: "evt-partial", venue_address_raw: "1 Real St", venue_city_raw: "Detroit", description: "" }), // still missing description
          eventRow({ id: "evt-untouched", time_display: null }), // unchanged
        ];
        return { ok: true, status: 200, json: async () => ({ events: after }) };
      }
      throw new Error("unexpected extra fetch call #" + callCount);
    };

    // NOTE: lastFlaggedIncomplete is declared with `let` at the script's
    // top level, so (same as a real browser <script> tag, and unlike
    // `var`) it never becomes a property of the vm sandbox object itself,
    // even though every function in the script closes over it correctly.
    // So this test observes it the same way a moderator would: through the
    // rendered DOM (#incompleteList / #badge-followup) and by calling the
    // real getMissingFields() directly on known row shapes, not by poking
    // a private variable.
    await sandbox.loadIncomplete(); // establish "before" state
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "3");

    await sandbox.autoRepairFollowup();

    // evt-repaired must be gone from the flagged list entirely; the other
    // two must still be rendered as cards.
    const listHtml = sandbox.document.getElementById("incompleteList").innerHTML;
    assert.ok(!listHtml.includes('id="incomplete-evt-repaired"'), "a fully-repaired card must leave Needs follow-up");
    assert.ok(listHtml.includes('id="incomplete-evt-partial"'), "a partially-repaired card must remain");
    assert.ok(listHtml.includes('id="incomplete-evt-untouched"'), "an event Auto-Repair V1 cannot touch (start time) must remain, unaffected");
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "2", "2 of the original 3 remain flagged");
    // Confirm, via the real getMissingFields() itself, that evt-partial's
    // remaining gap is exactly "description" -- venue address/city cleared.
    const partialAfterRow = eventRow({ id: "evt-partial", venue_address_raw: "1 Real St", venue_city_raw: "Detroit", description: "" });
    assert.deepStrictEqual(Array.from(sandbox.getMissingFields(partialAfterRow)), ["description"]);

    const status = sandbox.document.getElementById("autoRepairStatus").textContent;
    assert.ok(status.includes("Before: 3"), status);
    assert.ok(status.includes("Events repaired: 2"), status);
    assert.ok(status.includes("Missing fields repaired: 3"), status);
    assert.ok(status.includes("Remaining Needs follow-up: 2"), status);
    assert.ok(status.includes("1 event improved"), status);
    assert.ok(status.includes("1 no longer needs follow-up"), status);
    assert.ok(status.includes("2 remain"), status);
    assert.strictEqual(sandbox.document.getElementById("autoRepairBtn").disabled, false, "the button must be re-enabled after completion");
    assert.strictEqual(callCount, 3, "exactly 3 fetches: initial load, the repair POST, the post-repair reload");
  }
  console.log("PASS: a full before/after Auto-Repair cycle correctly removes a fully-repaired card, improves a partial one, leaves an untouched one alone, and reports accurate counts");

  // --- 8. repair failure (the POST itself fails) is shown explicitly and
  //     never masquerades as success -- the list is left exactly as it
  //     was, no reload is even attempted. ---
  {
    const sandbox = buildSandbox();
    const before = [eventRow({ id: "evt-1", venue_address_raw: null, venue_city_raw: null })];
    let callCount = 0;
    sandbox.fetch = async (url, opts) => {
      callCount++;
      if (callCount === 1) return { ok: true, status: 200, json: async () => ({ events: before }) };
      if (callCount === 2) return { ok: false, status: 500, json: async () => ({ error: "simulated auto-repair failure" }) };
      throw new Error("a failed repair must never proceed to reload -- unexpected fetch #" + callCount);
    };
    await sandbox.loadIncomplete();
    await sandbox.autoRepairFollowup();

    const status = sandbox.document.getElementById("autoRepairStatus").textContent;
    assert.ok(status.startsWith("Auto-repair failed:"), "a failed repair must be reported as a failure, never a success summary: " + status);
    assert.ok(status.includes("simulated auto-repair failure"), status);
    assert.ok(sandbox.document.getElementById("autoRepairStatus").classList.contains("refresh-error"), "the failure must be visually flagged as an error");
    assert.strictEqual(callCount, 2, "no reload should be attempted after the repair call itself failed");
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "1", "the list must be left exactly as it was before the failed attempt");
    assert.ok(sandbox.document.getElementById("incompleteList").innerHTML.includes('id="incomplete-evt-1"'), "the original card must still be rendered, untouched");
    assert.strictEqual(sandbox.document.getElementById("autoRepairBtn").disabled, false);
  }
  console.log("PASS: a failed Auto-Repair call is reported as a failure, never a false success, and leaves the list untouched");

  // --- 9. repair succeeds, but the post-repair reload itself fails -- also
  //     surfaced explicitly, distinguished from total failure. ---
  {
    const sandbox = buildSandbox();
    const before = [eventRow({ id: "evt-1", venue_address_raw: null, venue_city_raw: null })];
    let callCount = 0;
    sandbox.fetch = async (url, opts) => {
      callCount++;
      if (callCount === 1) return { ok: true, status: 200, json: async () => ({ events: before }) };
      if (callCount === 2) return { ok: true, status: 200, json: async () => ({ ok: true, written: 1, fieldsWritten: 2 }) };
      if (callCount === 3) return { ok: false, status: 500, json: async () => ({ error: "reload boom" }) };
      throw new Error("unexpected fetch #" + callCount);
    };
    await sandbox.loadIncomplete();
    await sandbox.autoRepairFollowup();

    const status = sandbox.document.getElementById("autoRepairStatus").textContent;
    assert.ok(status.includes("reloading Needs follow-up afterward failed"), status);
    assert.ok(sandbox.document.getElementById("autoRepairStatus").classList.contains("refresh-error"));
  }
  console.log("PASS: a repair that succeeds but whose post-repair reload fails is reported distinctly, not as a clean success");

  console.log("\nAll Part 2 (admin.html Auto-Repair button, real inline script) tests passed.");
}

async function run() {
  await runPart1();
  await runPart2();
  console.log("\nAll admin-auto-repair-venue tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
