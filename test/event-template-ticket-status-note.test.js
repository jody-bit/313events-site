// test/event-template-ticket-status-note.test.js
//
// Regression guard for ticketStatusNoteHtml() in event-template.html
// (2026-10-01, Jody: HALO Detroit events with no ticket/event link aren't
// a data gap -- "they do not have tickets, you pay at the door" -- so a
// blank actions area there reads as broken rather than as "nothing to buy
// here"). migration_041's ticket_status column (door /
// rsvp_no_advance_sale / free / registration_required) already recorded
// this distinction cross-source, but until this change it was only ever
// read internally by admin.html's Needs Follow-up queue, never surfaced
// to an actual visitor.
//
// Extracts the real shipped source (TICKET_STATUS_NOTES, safeUrl,
// ticketStatusNoteHtml) out of event-template.html via regex and eval()s
// it, same technique as test/sh-n-venue-display.test.js — testing the
// real shipped code, not a reimplementation.
//
// Run: node test/event-template-ticket-status-note.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function extract(html, re, label) {
  const m = html.match(re);
  if (!m) throw new Error(`${label} not found in event-template.html`);
  return m[0];
}

function run() {
  const html = fs.readFileSync(`${REPO_DIR}/event-template.html`, "utf8");

  const safeUrlSrc = extract(html, /function safeUrl\([\s\S]*?\n\}\n/, "safeUrl()");
  const notesSrc = extract(html, /const TICKET_STATUS_NOTES = \{[\s\S]*?\n\};\n/, "TICKET_STATUS_NOTES");
  const fnSrc = extract(html, /function ticketStatusNoteHtml\([\s\S]*?\n\}\n/, "ticketStatusNoteHtml()");

  // safeUrl() reads window.location.href — stub just enough of `window`
  // for new URL(url, base) resolution to work the same way a browser's
  // would for an absolute http(s) URL (the only shape these tests pass).
  global.window = { location: { href: "https://313.events/event.html" } };

  // eslint-disable-next-line no-new-func
  const ticketStatusNoteHtml = new Function(
    `${safeUrlSrc}\n${notesSrc}\n${fnSrc}\nreturn ticketStatusNoteHtml;`
  )();

  // --- 1. No ticket/event link, ticket_status='door' (the real HALO
  //     Detroit case this was built for) -> the plain-text "pay at the
  //     door" note, no link. ---
  {
    const note = ticketStatusNoteHtml({ ticketUrl: null, eventPageUrl: null, ticketStatus: "door" });
    assert.strictEqual(note, "Pay at the door — no advance tickets for this one.");
  }
  console.log("PASS: ticket_status='door' with no links shows the pay-at-the-door note");

  // --- 2. Every other known ticket_status value, same no-links shape. ---
  {
    assert.strictEqual(
      ticketStatusNoteHtml({ ticketUrl: null, eventPageUrl: null, ticketStatus: "free" }),
      "Free — no ticket required."
    );
    assert.strictEqual(
      ticketStatusNoteHtml({ ticketUrl: null, eventPageUrl: null, ticketStatus: "registration_required" }),
      "Registration required — check with the organizer for how to sign up."
    );
    assert.strictEqual(
      ticketStatusNoteHtml({ ticketUrl: null, eventPageUrl: null, ticketStatus: "rsvp_no_advance_sale" }),
      "RSVP required — no advance ticket purchase for this one."
    );
  }
  console.log("PASS: free / registration_required / rsvp_no_advance_sale each show their own note");

  // --- 3. A real link always wins — the note must never show ALONGSIDE a
  //     real ticketUrl or eventPageUrl, even if ticket_status happens to be
  //     set (defensive — shouldn't happen given how the status is set
  //     server-side, but the display function must not assume that). ---
  {
    assert.strictEqual(
      ticketStatusNoteHtml({ ticketUrl: "https://tickets.example/buy", eventPageUrl: null, ticketStatus: "door" }),
      null,
      "a real ticketUrl must suppress the note"
    );
    assert.strictEqual(
      ticketStatusNoteHtml({ ticketUrl: null, eventPageUrl: "https://venue.example/info", ticketStatus: "door" }),
      null,
      "a real eventPageUrl must suppress the note"
    );
  }
  console.log("PASS: a real ticketUrl or eventPageUrl always suppresses the note");

  // --- 4. No links and no ticket_status at all (the overwhelming majority
  //     of events with a genuine, unexplained missing-link gap) -> no
  //     note, never an invented explanation. ---
  {
    assert.strictEqual(ticketStatusNoteHtml({ ticketUrl: null, eventPageUrl: null, ticketStatus: null }), null);
    assert.strictEqual(ticketStatusNoteHtml({ ticketUrl: null, eventPageUrl: null }), null);
  }
  console.log("PASS: no ticket_status at all shows no note — never an invented explanation");

  // --- 5. An unrecognized ticket_status value (future-proofing — a status
  //     this function doesn't know about yet) -> no note, never garbled
  //     output. ---
  {
    assert.strictEqual(
      ticketStatusNoteHtml({ ticketUrl: null, eventPageUrl: null, ticketStatus: "some_future_value" }),
      null
    );
  }
  console.log("PASS: an unrecognized ticket_status value shows no note rather than garbled output");

  console.log("All event-template.html ticketStatusNoteHtml() tests passed.");
}

run();
