// test/admin-needs-followup-self-healing-2.test.js — Needs Follow-up
// self-healing pass 2 (2026-09-28): the three admin.html-level behavior
// changes for the two new false-positive patterns Jody reported.
//
// Proves, against the REAL inline <script> from admin.html (same vm-sandbox
// technique as test/admin-needs-followup-actionable.test.js):
//   1. no_fixed_venue=true suppresses "venue address/city" even with zero
//      venue signal at all -- the real Christmas Cookie Coach Tour /
//      Original Detroit Christmas Bakery Bus Tour shape (venue_name_raw,
//      venue_address_raw, venue_city_raw all null, no linked venue).
//   2. ticket_status in {door, rsvp_no_advance_sale, free,
//      registration_required} suppresses "ticket/event link" even with a
//      null ticket_url/event_url -- the real HOT ASH CIGAR & PIPE SOCIAL
//      shape (ticket_status='rsvp_no_advance_sale' after the cron-halo.js
//      fix, though that specific event now also gets a real event_url --
//      this proves the ticket_status exemption works independently, for a
//      source/event that has NEITHER field populated).
//   3. link_check_status='dead' surfaces a NEW, always-actionable "dead
//      event/ticket link" reason, with the correct DEAD_TICKET_LINK /
//      DEAD_EVENT_LINK explainRemainingGap() code -- independent of
//      whether the source is in SOURCE_FIELD_LIMITATIONS.
//
// Run: node test/admin-needs-followup-self-healing-2.test.js
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
    no_fixed_venue: false, ticket_status: null, link_check_status: null,
    ...overrides,
  };
}

function run() {
  const sandbox = buildSandbox();

  // ============================================================
  // Part 1: no_fixed_venue — the real Christmas Cookie Coach Tour /
  // Bakery Bus Tour shape (zero venue signal of any kind)
  // ============================================================
  {
    const e = eventRow({
      title: "Christmas Cookie Coach Tour",
      source: "VisitDetroit",
      venue_name_raw: null, venue_address_raw: null, venue_city_raw: null, venue_id: null, venues: null,
      no_fixed_venue: true,
      ticket_url: "https://visitdetroit.com/events/christmas-cookie-coach-tour/",
    });
    const missing = sandbox.getMissingFields(e);
    assert.ok(!missing.includes("venue address/city"), "no_fixed_venue=true must suppress the venue gap even with zero venue signal");
  }
  console.log("PASS: no_fixed_venue=true suppresses 'venue address/city' for the real Christmas Cookie Coach Tour shape");

  {
    // Control: the SAME zero-signal shape but no_fixed_venue=false (an
    // ordinary event that genuinely has an unresolved venue) still flags —
    // proves this isn't a blanket exemption for null venue fields.
    const e = eventRow({
      venue_name_raw: null, venue_address_raw: null, venue_city_raw: null, venue_id: null, venues: null,
      no_fixed_venue: false,
    });
    const missing = sandbox.getMissingFields(e);
    assert.ok(missing.includes("venue address/city"), "an ordinary unresolved-venue event must still flag — this is not a blanket exemption");
  }
  console.log("PASS: an ordinary event with no_fixed_venue=false and no venue signal still flags 'venue address/city' (control case)");

  // ============================================================
  // Part 2: ticket_status — no advance ticket link expected
  // ============================================================
  for (const status of ["door", "rsvp_no_advance_sale", "free", "registration_required"]) {
    const e = eventRow({ title: "HOT ASH CIGAR & PIPE SOCIAL", source: "HALO Detroit", ticket_url: null, event_url: null, ticket_status: status });
    const missing = sandbox.getMissingFields(e);
    assert.ok(!missing.includes("ticket/event link"), `ticket_status='${status}' must suppress the ticket/event link gap`);
  }
  console.log("PASS: each no-advance-ticket ticket_status value suppresses 'ticket/event link' with both fields null");

  {
    // Control: a null ticket_status with both link fields null still
    // flags — proves this isn't a blanket HALO exemption.
    const e = eventRow({ source: "HALO Detroit", ticket_url: null, event_url: null, ticket_status: null });
    const missing = sandbox.getMissingFields(e);
    assert.ok(missing.includes("ticket/event link"), "a genuinely unknown ticket status must still flag — this is not a blanket source exemption");
  }
  console.log("PASS: a null ticket_status with both links null still flags 'ticket/event link' (control case)");

  {
    // An event_url populated (the real post-fix HOT ASH shape) already
    // satisfies the plain link check on its own, independent of
    // ticket_status -- both mechanisms lead to the same "not flagged"
    // outcome via different, independently-testable paths.
    const e = eventRow({ ticket_url: null, event_url: "https://www.thehalodetroit.com/events/hot-ash-cigar-pipe-social-7", ticket_status: "rsvp_no_advance_sale" });
    const missing = sandbox.getMissingFields(e);
    assert.ok(!missing.includes("ticket/event link"));
  }
  console.log("PASS: the real post-fix HOT ASH shape (event_url populated AND ticket_status set) is not flagged");

  // ============================================================
  // Part 3: dead event/ticket link — new, always-actionable reason
  // ============================================================
  {
    const e = eventRow({
      title: "Christmas Cookie Coach Tour",
      source: "VisitDetroit",
      ticket_url: "https://visitdetroit.com/christmas-cookie-coach-tour/", // the real dead URL, still populated
      link_check_status: "dead",
    });
    const missing = sandbox.getMissingFields(e);
    assert.ok(missing.includes("dead event/ticket link"), "link_check_status='dead' must surface as an actionable gap");
    assert.ok(!missing.includes("ticket/event link"), "a POPULATED-but-dead link must never also show as plain 'missing' -- it IS present, just broken");

    const { actionable, sourceLimited } = sandbox.classifyMissingFields(e, missing);
    assert.ok(actionable.includes("dead event/ticket link"), "a dead link is always actionable, regardless of source");
    assert.strictEqual(sandbox.explainRemainingGap("dead event/ticket link", e), "DEAD_TICKET_LINK");
  }
  console.log("PASS: link_check_status='dead' surfaces 'dead event/ticket link' as always-actionable, with reason DEAD_TICKET_LINK");

  {
    // event_url variant (e.g. a future non-VisitDetroit source) gets the
    // DEAD_EVENT_LINK reason code instead.
    const e = eventRow({ ticket_url: null, event_url: "https://example.com/dead-page", link_check_status: "dead" });
    const missing = sandbox.getMissingFields(e);
    assert.ok(missing.includes("dead event/ticket link"));
    assert.strictEqual(sandbox.explainRemainingGap("dead event/ticket link", e), "DEAD_EVENT_LINK");
  }
  console.log("PASS: a dead event_url (rather than ticket_url) gets the DEAD_EVENT_LINK reason code");

  {
    // Control: link_check_status='ok' or null never surfaces this reason.
    const okEvent = eventRow({ link_check_status: "ok" });
    assert.ok(!sandbox.getMissingFields(okEvent).includes("dead event/ticket link"));
    const uncheckedEvent = eventRow({ link_check_status: null });
    assert.ok(!sandbox.getMissingFields(uncheckedEvent).includes("dead event/ticket link"));
  }
  console.log("PASS: link_check_status='ok' or null (never checked) never surfaces the dead-link reason");

  // ============================================================
  // Part 4: the breakdown UI (computeFollowupBreakdown, which reads
  // MISSING_FIELD_ORDER/LABELS internally) accounts for the new field --
  // MISSING_FIELD_ORDER/LABELS are script-scoped consts, not reachable
  // directly from the vm sandbox object, so this exercises them through
  // the one function that actually uses them.
  // ============================================================
  {
    const e = eventRow({ ticket_url: 'https://visitdetroit.com/christmas-cookie-coach-tour/', link_check_status: 'dead' });
    const missing = sandbox.getMissingFields(e);
    const { rows, totals } = sandbox.computeFollowupBreakdown([{ e, missing }]);
    assert.strictEqual(totals['DEAD EVENT/TICKET LINK'], 1, 'the breakdown totals must include the new label, not silently drop it');
    assert.ok(rows.some((r) => r.fields.includes('DEAD EVENT/TICKET LINK')));
  }
  console.log('PASS: computeFollowupBreakdown accounts for the new dead-link reason (MISSING_FIELD_ORDER/LABELS wired correctly)');

  console.log("\nadmin-needs-followup-self-healing-2.test.js: all assertions passed");
}

run();
