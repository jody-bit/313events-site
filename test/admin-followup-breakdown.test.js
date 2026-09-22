// test/admin-followup-breakdown.test.js — Needs follow-up breakdown diagnostic (2026-09-22)
//
// Pure operational visibility, added on top of the EXISTING Needs
// follow-up load path -- no new API, no new database query, no connector
// work, no change to getMissingFields()'s rules or to Auto-Repair. It
// groups the exact same `flagged` array loadIncomplete() already builds
// (the one that already drives the badge count and the individual cards)
// by SOURCE + MISSING FIELD COMBINATION.
//
// This file proves, against the REAL inline <script> from admin.html
// (extracted and run in a Node vm context, not a hand-copied
// reproduction -- same technique as test/admin-auto-repair-venue.test.js
// and test/admin-needs-followup-refresh.test.js):
//   1. the grouped breakdown is computed from the same flagged events that
//      produce the Needs follow-up badge/cards (built via the real
//      getMissingFields(), the real followup_dismissed filter -- not a
//      hand-crafted stand-in)
//   2. the group counts sum EXACTLY to the displayed Needs follow-up count
//   3. the aggregate per-field totals are correct
//   4. dismissed follow-up events are excluded from the breakdown exactly
//      as they already are from the existing queue (same filter, not a
//      second independent one that could drift from the first)
//
// Run: node test/admin-followup-breakdown.test.js
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

// Minimal-but-realistic row shape -- same fields getMissingFields() and
// renderIncompleteList() actually read. Defaults describe a fully-complete
// event; each test overrides only what it needs blank/missing.
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

// ============================================================
// Part 1: computeFollowupBreakdown() as a pure function, fed the SAME
// flagged array loadIncomplete() itself builds (real getMissingFields(),
// real followup_dismissed filter -- reproduced here identically to how
// loadIncomplete() builds it, not hand-crafted missing[] arrays).
// ============================================================

function buildFlagged(sandbox, events) {
  return events
    .map((e) => ({ e, missing: sandbox.getMissingFields(e) }))
    .filter((x) => x.missing.length > 0 && !x.e.followup_dismissed);
}

function runPart1() {
  const sandbox = buildSandbox();

  const events = [
    // Trinosophes x2, both missing description + ticket/event link (same
    // combination -- must group together with count 2).
    eventRow({ id: "e1", source: "Trinosophes", description: "", ticket_url: null, event_url: null }),
    eventRow({ id: "e2", source: "Trinosophes", description: "", ticket_url: null, event_url: null }),
    // Outer Limits Lounge x2, DIFFERENT combinations -- must NOT merge.
    eventRow({ id: "e3", source: "Outer Limits Lounge", description: "" }),
    eventRow({ id: "e4", source: "Outer Limits Lounge", venue_address_raw: null, venue_city_raw: null }),
    // Dossin, dismissed -- would be missing everything, must be excluded
    // entirely (same filter loadIncomplete() already applies).
    eventRow({
      id: "e5", source: "Dossin", description: "", venue_address_raw: null, venue_city_raw: null,
      ticket_url: null, event_url: null, time_display: null, followup_dismissed: true,
    }),
    // A fully-complete event -- getMissingFields() returns [], so it's
    // never even a candidate for `flagged` in the first place.
    eventRow({ id: "e6", source: "Trinosophes" }),
  ];

  const flagged = buildFlagged(sandbox, events);
  assert.strictEqual(flagged.length, 4, "e1,e2,e3,e4 are flagged; e5 is dismissed, e6 is complete");
  assert.ok(!flagged.some((x) => x.e.id === "e5"), "a dismissed event must never reach computeFollowupBreakdown() in the first place -- same filter as the existing queue");

  const { rows, totals } = sandbox.computeFollowupBreakdown(flagged);

  // --- requirement: group counts sum exactly to the flagged count ---
  const rowCountSum = rows.reduce((sum, r) => sum + r.count, 0);
  assert.strictEqual(rowCountSum, flagged.length, "grouped row counts must sum exactly to the Needs follow-up count");
  assert.strictEqual(rowCountSum, 4);

  // --- requirement: correct SOURCE + MISSING FIELD COMBINATION grouping ---
  const trinosophesGroup = rows.find((r) => r.source === "Trinosophes");
  assert.ok(trinosophesGroup, "Trinosophes group must exist");
  // .fields is an Array built inside the vm sandbox's own realm, so
  // deepStrictEqual against a host-realm array literal would spuriously
  // fail on constructor identity alone (cross-realm gotcha) even though
  // the contents are identical -- compare the joined string instead,
  // which is realm-safe since strings are primitives.
  assert.strictEqual(Array.from(trinosophesGroup.fields).join(" + "), "DESCRIPTION + TICKET/EVENT LINK");
  assert.strictEqual(trinosophesGroup.count, 2, "e1 and e2 share the identical combination and must merge into one group of 2");

  const outerLimitsGroups = rows.filter((r) => r.source === "Outer Limits Lounge");
  assert.strictEqual(outerLimitsGroups.length, 2, "e3 (description only) and e4 (venue address/city only) are different combinations -- must NOT merge");
  assert.ok(outerLimitsGroups.some((r) => r.count === 1 && r.fields.join("+") === "DESCRIPTION"));
  assert.ok(outerLimitsGroups.some((r) => r.count === 1 && r.fields.join("+") === "VENUE ADDRESS/CITY"));

  assert.ok(!rows.some((r) => r.source === "Dossin"), "the dismissed Dossin event must not appear as its own group at all");

  // --- requirement: aggregate per-field totals correct ---
  assert.strictEqual(totals["DESCRIPTION"], 3, "e1, e2, e3 are each missing description");
  assert.strictEqual(totals["TICKET/EVENT LINK"], 2, "e1 and e2 are each missing ticket/event link");
  assert.strictEqual(totals["VENUE ADDRESS/CITY"], 1, "only e4 is missing venue address/city");
  assert.strictEqual(totals["START TIME"], 0, "nothing in this fixture is missing start time");
  const totalsSum = Object.values(totals).reduce((a, b) => a + b, 0);
  // Each of e1/e2 contributes 2 fields, e3 and e4 each contribute 1 -- 6 field-level hits across 4 events.
  assert.strictEqual(totalsSum, 6);

  console.log("PASS: computeFollowupBreakdown() groups by source+combination correctly, sums to the flagged count, and computes correct per-field totals");
}

// ============================================================
// Part 2: end-to-end through the REAL loadIncomplete() -> renderFollowupBreakdown()
// wiring, proving the breakdown reads the identical flagged set that
// drives the badge and the cards (not a second independent computation).
// ============================================================

async function runPart2() {
  // --- same fixture as Part 1, but driven through the real fetch -> loadIncomplete() path --
  //     2026-09-23 closure update: e1/e2 (Trinosophes: description +
  //     ticket/event link are BOTH confirmed source-limited for that
  //     source) and e3 (Outer Limits Lounge: description alone is
  //     confirmed source-limited) now have ZERO actionable fields each,
  //     so all three are excluded from the queue entirely -- not just
  //     de-emphasized. e4 (Outer Limits Lounge, missing venue
  //     address/city -- NOT in that source's limited-field list) is
  //     unaffected and stays actionable. e5 stays excluded via the
  //     existing followup_dismissed filter, unrelated to this change. ---
  {
    const sandbox = buildSandbox();
    const events = [
      eventRow({ id: "e1", source: "Trinosophes", description: "", ticket_url: null, event_url: null }),
      eventRow({ id: "e2", source: "Trinosophes", description: "", ticket_url: null, event_url: null }),
      eventRow({ id: "e3", source: "Outer Limits Lounge", description: "" }),
      eventRow({ id: "e4", source: "Outer Limits Lounge", venue_address_raw: null, venue_city_raw: null }),
      eventRow({
        id: "e5", source: "Dossin", description: "", venue_address_raw: null, venue_city_raw: null,
        ticket_url: null, event_url: null, time_display: null, followup_dismissed: true,
      }),
      eventRow({ id: "e6", source: "Trinosophes" }),
    ];
    sandbox.fetch = async (url) => {
      assert.ok(url.includes("incomplete=1"));
      return { ok: true, status: 200, json: async () => ({ events }) };
    };

    const ok = await sandbox.loadIncomplete();
    assert.strictEqual(ok, true);

    const badgeCount = sandbox.document.getElementById("badge-followup").textContent;
    assert.strictEqual(badgeCount, "1", "only e4 (venue address/city, not a source-limited field for Outer Limits Lounge) has anything actionable left");

    const breakdownHtml = sandbox.document.getElementById("followupBreakdown").innerHTML;
    assert.ok(breakdownHtml.includes("Needs follow-up breakdown"), "the breakdown box must render");
    assert.ok(breakdownHtml.includes("(1 event)"), "the breakdown's own header count must match the badge count exactly: " + breakdownHtml);
    assert.ok(!breakdownHtml.includes("Dossin"), "a dismissed event's source must never appear in the breakdown");
    assert.ok(!breakdownHtml.includes("Trinosophes"), "Trinosophes (fully source-limited here) must not appear in the breakdown at all");
    assert.ok(breakdownHtml.includes("VENUE ADDRESS/CITY"), "e4's genuinely actionable gap must still appear");

    // Every count printed in the rendered rows (the "— N" pattern) must sum
    // to the same 1 -- proves the DOM output, not just the underlying
    // object, matches the badge. computeFollowupBreakdown()'s own `totals`
    // object (not a regex over the rendered HTML, which always lists every
    // field name at count 0 in its totals line) confirms DESCRIPTION and
    // TICKET/EVENT LINK genuinely have zero actionable occurrences left --
    // Trinosophes's and Outer Limits Lounge's description-only group are
    // not just missing their own row, they contribute nothing to the totals.
    // `lastFlaggedIncomplete` is a module-scoped `let` inside the real
    // script -- not reachable from outside the vm sandbox (only its
    // function declarations are) -- so this recomputes the identical
    // actionable-only flagged array loadIncomplete() itself builds, the
    // same way buildFlagged() above reproduces the pre-closure version.
    const recomputedActionableFlagged = events
      .filter((e) => !e.followup_dismissed)
      .map((e) => {
        const missing = sandbox.getMissingFields(e);
        const { actionable } = sandbox.classifyMissingFields(e, missing);
        return { e, missing: actionable };
      })
      .filter((x) => x.missing.length > 0);
    const { rows, totals } = sandbox.computeFollowupBreakdown(recomputedActionableFlagged);
    const sum = rows.reduce((s, r) => s + r.count, 0);
    assert.strictEqual(sum, 1, "recomputing the same actionable-only flagged array loadIncomplete() itself builds must also sum to 1");
    assert.strictEqual(recomputedActionableFlagged.length, parseInt(badgeCount, 10), "the flagged array driving the breakdown is the exact same one driving the badge");
    assert.strictEqual(totals["DESCRIPTION"], 0, "no actionable description gap remains -- e1/e2/e3's description gaps were all source-limited");
    assert.strictEqual(totals["TICKET/EVENT LINK"], 0, "no actionable ticket/event link gap remains -- e1/e2's link gap was source-limited (Trinosophes)");
    assert.strictEqual(totals["VENUE ADDRESS/CITY"], 1, "only e4's venue address/city gap is actionable");

    // The 3 fully-source-limited events (e1, e2, e3) are surfaced via the
    // tiny informational note, not silently dropped with no trace.
    const noteText = sandbox.document.getElementById("sourceLimitedNote").textContent;
    assert.ok(noteText.includes("3 additional events omitted"), "the 3 fully source-limited events must be accounted for in the note: " + noteText);
  }
  console.log("PASS: loadIncomplete() wires the same actionable-only flagged array into both the badge and the breakdown; fully source-limited events (Trinosophes, Outer-Limits-description-only) are excluded entirely and accounted for in the source-limited note, dismissed events excluded from both identically");

  // --- empty case: nothing flagged -> breakdown box is cleared, not left showing stale/zero rows ---
  {
    const sandbox = buildSandbox();
    sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => ({ events: [eventRow({ id: "e1" })] }) }); // fully complete -- not flagged
    await sandbox.loadIncomplete();
    assert.strictEqual(sandbox.document.getElementById("badge-followup").textContent, "0");
    assert.strictEqual(sandbox.document.getElementById("followupBreakdown").innerHTML, "", "an empty Needs follow-up queue must render an empty breakdown, not a stale or zeroed-out box");
  }
  console.log("PASS: an empty Needs follow-up queue renders an empty breakdown box");
}

async function run() {
  runPart1();
  await runPart2();
  console.log("\nAll admin-followup-breakdown tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
