// test/admin-needs-followup-actionable.test.js — Needs Follow-up closure
// (2026-09-23): "actionable" vs. "source-limited" classification.
//
// PRODUCT DECISION under test: "Needs follow-up" means Jody can actually do
// something about it, not "one of our preferred fields happens to be
// blank." getMissingFields() (unchanged by this closure -- still 100%
// truthful about what's actually blank) is now paired with
// classifyMissingFields(), which splits that truthful list into what's
// actionable vs. what a confirmed source limitation already explains (see
// admin.html's SOURCE_FIELD_LIMITATIONS / isVenueTbaByDesign() for the
// exact, small, source-keyed rules and their rationale).
//
// This file proves, against the REAL inline <script> from admin.html (same
// vm-sandbox technique as every other admin.html test in this project):
//   1. an ordinary actionable gap still flags an event, unchanged
//   2/3. a confirmed source-limited description AND/OR ticket/event link
//        (Trinosophes, Detroit Historical Society, Outer Limits Lounge)
//        does NOT appear as actionable
//   4. a genuine missing start time is never source-limited for any source
//      -- stays actionable until real evidence (a nonblank time_display)
//      resolves it
//   5. an EXACT "Venue TBA" venue_name_raw is source-limited for venue
//      address/city -- and Resident Advisor's own differently-worded
//      TBA/secret-venue rows are explicitly proven NOT to match, so RA's
//      existing manual-dismiss workflow is untouched by this closure
//   6. a mixed event (one actionable gap + one source-limited gap) shows
//      ONLY the actionable gap in its Missing: badges and in the breakdown
//   7. classification is pure and read-only -- it never fetches, never
//      writes, never mutates the event object handed to it
//
// Run: node test/admin-needs-followup-actionable.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

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
    id: "evt-1", title: "Some Event", category: "music", status: "approved",
    start_date: "2026-10-10", time_display: "7:00 PM", is_all_day: false,
    venue_name_raw: "Some Venue", venue_address_raw: "123 Main St", venue_city_raw: "Detroit",
    venue_id: null, venues: null, description: "A real description.",
    ticket_url: "https://example.com/tickets", event_url: null,
    source: "Manual", followup_dismissed: false,
    ...overrides,
  };
}

// ============================================================
// Part 1: classifyMissingFields() as a pure function.
// ============================================================

function runPart1() {
  const sandbox = buildSandbox();

  // --- 1. an ordinary actionable gap (no source-limitation entry at all
  //     for this source) is untouched -- fully actionable. ---
  {
    const e = eventRow({ source: "Manual", description: "" });
    const missing = sandbox.getMissingFields(e);
    const { actionable, sourceLimited } = sandbox.classifyMissingFields(e, missing);
    assert.deepStrictEqual(Array.from(actionable), ["description"]);
    assert.deepStrictEqual(Array.from(sourceLimited), []);
  }
  console.log("PASS: an ordinary missing field with no confirmed source limitation is fully actionable");

  // --- 2/3. Trinosophes: description AND ticket/event link are BOTH
  //     confirmed source-limited -- neither is actionable. ---
  {
    const e = eventRow({ source: "Trinosophes", description: "", ticket_url: null, event_url: null });
    const missing = sandbox.getMissingFields(e);
    const { actionable, sourceLimited } = sandbox.classifyMissingFields(e, missing);
    assert.deepStrictEqual(Array.from(actionable), [], "Trinosophes structurally has neither field -- nothing actionable");
    assert.deepStrictEqual(Array.from(sourceLimited).sort(), ["description", "ticket/event link"].sort());
  }
  console.log("PASS: Trinosophes's confirmed structural gap (description + ticket/event link) is never actionable");

  // --- Detroit Historical Society (Dossin): description is source-limited,
  //     but the link stays fully actionable -- Auto-Repair already
  //     recovers it when the source has real per-event data. ---
  {
    const e = eventRow({ source: "Detroit Historical Society", description: "", ticket_url: null, event_url: null });
    const missing = sandbox.getMissingFields(e);
    const { actionable, sourceLimited } = sandbox.classifyMissingFields(e, missing);
    assert.deepStrictEqual(Array.from(actionable), ["ticket/event link"], "the link is real, recoverable per-event data -- still actionable");
    assert.deepStrictEqual(Array.from(sourceLimited), ["description"]);
  }
  console.log("PASS: Dossin's confirmed structural gap is description only -- its ticket/event link stays actionable");

  // --- Outer Limits Lounge: description alone is source-limited. ---
  {
    const e = eventRow({ source: "Outer Limits Lounge", description: "" });
    const missing = sandbox.getMissingFields(e);
    const { actionable, sourceLimited } = sandbox.classifyMissingFields(e, missing);
    assert.deepStrictEqual(Array.from(actionable), []);
    assert.deepStrictEqual(Array.from(sourceLimited), ["description"]);
  }
  console.log("PASS: Outer Limits Lounge's confirmed description gap is source-limited");

  // --- 4. a genuine missing start time is NEVER source-limited for any of
  //     the above sources -- stays actionable until real evidence
  //     (a nonblank time_display) resolves it. is_all_day still correctly
  //     suppresses it (2026-09-16 rule, unchanged and untouched by this
  //     closure). ---
  {
    const trinosophes = eventRow({ source: "Trinosophes", time_display: null, is_all_day: false });
    const { actionable } = sandbox.classifyMissingFields(trinosophes, sandbox.getMissingFields(trinosophes));
    assert.ok(actionable.includes("start time"), "a missing start time must remain actionable even for a source with other confirmed limitations");

    const resolved = eventRow({ source: "Trinosophes", time_display: "Doors 7:00 PM", is_all_day: false });
    const { actionable: actionableAfter } = sandbox.classifyMissingFields(resolved, sandbox.getMissingFields(resolved));
    assert.ok(!actionableAfter.includes("start time"), "once time_display is genuinely filled in, start time is no longer missing at all -- resolved by real evidence, not suppressed");

    const allDay = eventRow({ source: "Trinosophes", time_display: null, is_all_day: true });
    const { actionable: actionableAllDay } = sandbox.classifyMissingFields(allDay, sandbox.getMissingFields(allDay));
    assert.ok(!actionableAllDay.includes("start time"), "a genuinely all-day event was never missing a start time to begin with (pre-existing 2026-09-16 rule, unchanged)");
  }
  console.log("PASS: a genuine missing start time stays actionable regardless of source, resolved only by real time_display evidence (or a genuine is_all_day listing)");

  // --- 5. EXACT "Venue TBA" is source-limited for venue address/city;
  //     Resident Advisor's differently-worded TBA/secret-venue rows are
  //     explicitly NOT matched -- RA's existing manual-dismiss workflow is
  //     untouched by this closure. ---
  {
    const tbaExact = eventRow({ venue_name_raw: "Venue TBA", venue_address_raw: null, venue_city_raw: null });
    assert.strictEqual(sandbox.isVenueTbaByDesign(tbaExact), true);
    const { actionable, sourceLimited } = sandbox.classifyMissingFields(tbaExact, sandbox.getMissingFields(tbaExact));
    assert.ok(!actionable.includes("venue address/city"), "an exact 'Venue TBA' listing has no real address to chase");
    assert.ok(sourceLimited.includes("venue address/city"));

    // Case-insensitive / whitespace-tolerant, since connectors don't all
    // normalize casing identically.
    const tbaCased = eventRow({ venue_name_raw: "  venue TBA  ", venue_address_raw: null, venue_city_raw: null });
    assert.strictEqual(sandbox.isVenueTbaByDesign(tbaCased), true);

    // Resident Advisor's real, current wordings (taken directly from
    // supabase/*.sql) -- none of these are an exact "Venue TBA" match, so
    // all stay fully actionable, exactly as before this closure. RA is not
    // touched by this change in any way.
    const raVariants = [
      "Venue TBA (secret loft, revealed to ticket holders)",
      "TBA - 51 Harper Ave",
      "TBA - The Social Brew",
      "Location TBA",
      "TBA",
    ];
    for (const venueNameRaw of raVariants) {
      const raEvent = eventRow({ source: "Resident Advisor", venue_name_raw: venueNameRaw, venue_address_raw: null, venue_city_raw: null });
      assert.strictEqual(sandbox.isVenueTbaByDesign(raEvent), false, `"${venueNameRaw}" must NOT match the exact venue-TBA rule -- RA is untouched by this closure`);
      const { actionable: raActionable } = sandbox.classifyMissingFields(raEvent, sandbox.getMissingFields(raEvent));
      assert.ok(raActionable.includes("venue address/city"), `"${venueNameRaw}" must remain actionable, same as before this closure`);
    }
  }
  console.log("PASS: an exact 'Venue TBA' listing is source-limited for venue address/city; Resident Advisor's own differently-worded TBA/secret-venue rows are explicitly unaffected");

  // --- 6. a mixed event (one actionable gap + one source-limited gap)
  //     reports ONLY the actionable one. ---
  {
    const e = eventRow({ source: "Trinosophes", description: "", ticket_url: null, event_url: null, time_display: null });
    const { actionable, sourceLimited } = sandbox.classifyMissingFields(e, sandbox.getMissingFields(e));
    assert.deepStrictEqual(Array.from(actionable), ["start time"], "only the genuinely actionable gap is reported");
    assert.deepStrictEqual(Array.from(sourceLimited).sort(), ["description", "ticket/event link"].sort());
  }
  console.log("PASS: a mixed event reports only its actionable gap, keeping the source-limited ones separate");

  // --- 7. classification is pure and read-only. ---
  {
    const e = eventRow({ source: "Trinosophes", description: "" });
    const before = JSON.stringify(e);
    sandbox.fetch = async () => { throw new Error("classifyMissingFields()/getMissingFields() must never touch the network"); };
    sandbox.classifyMissingFields(e, sandbox.getMissingFields(e));
    assert.strictEqual(JSON.stringify(e), before, "the event object handed to classification must never be mutated");
  }
  console.log("PASS: classification never fetches and never mutates the event it's given");

  console.log("\nAll Part 1 (classifyMissingFields, pure function) tests passed.");
}

// ============================================================
// Part 2: end-to-end through the real loadIncomplete() -> badge/list wiring.
// ============================================================

async function runPart2() {
  // --- an actionable event (Manual source) remains flagged; a fully
  //     source-limited event (Trinosophes, both fields) never appears at
  //     all; a partially source-limited event (Dossin, description +
  //     link, link still blank) stays flagged for its real gap only. ---
  {
    const sandbox = buildSandbox();
    const events = [
      eventRow({ id: "actionable-1", source: "Manual", description: "" }),
      eventRow({ id: "trinosophes-1", source: "Trinosophes", description: "", ticket_url: null, event_url: null }),
      eventRow({ id: "dossin-1", source: "Detroit Historical Society", description: "", ticket_url: null, event_url: null }),
    ];
    sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => ({ events }) });
    await sandbox.loadIncomplete();

    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "2", "actionable-1 (real gap) and dossin-1 (real link gap) are flagged; trinosophes-1 has nothing actionable");
    const listHtml = sandbox.document.getElementById("incompleteList").innerHTML;
    assert.ok(listHtml.includes('id="incomplete-actionable-1"'));
    assert.ok(listHtml.includes('id="incomplete-dossin-1"'));
    assert.ok(!listHtml.includes('id="incomplete-trinosophes-1"'), "a fully source-limited event must never appear in the list");
    // dossin-1's card must show only its actionable gap (the link), never
    // a "description" badge for a field that's confirmed source-limited.
    const dossinCardStart = listHtml.indexOf('id="incomplete-dossin-1"');
    const dossinCardHtml = listHtml.slice(dossinCardStart, dossinCardStart + 1200);
    assert.ok(dossinCardHtml.includes("ticket/event link"), "dossin-1's real gap must be shown");
    assert.ok(!dossinCardHtml.includes(">description<"), "dossin-1 must not show a 'description' Missing: badge -- that gap is source-limited");

    const noteText = sandbox.document.getElementById("sourceLimitedNote").textContent;
    assert.ok(noteText.includes("1 additional event omitted"), "trinosophes-1 must be accounted for in the source-limited note: " + noteText);
  }
  console.log("PASS: loadIncomplete() end-to-end -- actionable events stay flagged, a fully source-limited event is excluded, a partially source-limited event shows only its real gap");

  // --- Auto-Repair itself is untouched: this classification layer adds no
  //     new fetch, no new action, no new write path -- autoRepairFollowup()
  //     still POSTs exactly one auto_repair_venue call. ---
  {
    const sandbox = buildSandbox();
    const events = [eventRow({ id: "actionable-1", source: "Manual", venue_address_raw: null, venue_city_raw: null })];
    let postCount = 0;
    sandbox.fetch = async (url, opts) => {
      if (opts && opts.method === "POST") {
        postCount++;
        assert.strictEqual(JSON.parse(opts.body).action, "auto_repair_venue");
        return { ok: true, status: 200, json: async () => ({ ok: true, written: 0, fieldsWritten: 0, venue: {}, outerLimitsDescription: null, outerLimitsDescriptionError: null, dossinMetadata: null, dossinMetadataError: null, redfordMetadata: null, redfordMetadataError: null }) };
      }
      return { ok: true, status: 200, json: async () => ({ events }) };
    };
    await sandbox.loadIncomplete();
    await sandbox.autoRepairFollowup();
    assert.strictEqual(postCount, 1, "Auto-Repair still makes exactly one auto_repair_venue call -- this closure adds no new write path");
  }
  console.log("PASS: Auto-Repair's own wiring is unaffected by the actionable/source-limited classification layer");

  console.log("\nAll Part 2 (real loadIncomplete() end-to-end) tests passed.");
}

async function run() {
  runPart1();
  await runPart2();
  console.log("\nAll admin-needs-followup-actionable tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
