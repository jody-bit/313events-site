// test/list-card-ticket-status-note.test.js
//
// Regression guard for the 2026-10-01 fast-follow to the Needs Follow-up
// remaining-gap pass: extending the visitor-facing ticket-status fallback
// note (door / RSVP / free / registration-required) from event-template.html
// (the event detail page, where it originally shipped) out to the three
// list-card views -- index.html, calendar.html, map.html -- per Jody's
// "yes extend it" answer to the open question at the end of that pass.
//
// index.html reads through the events_public view (an explicit-column-list
// view), which did NOT expose ticket_status before this change -- fixed by
// supabase/migration_042_events_public_ticket_status.sql. calendar.html and
// map.html query the raw events table directly, so they only needed their
// own select list, mapping function, and card template updated.
//
// This is a structural/source-text check (regex over the raw HTML), not a
// DOM test -- same established convention as sh-n-venue-display.test.js and
// admin-followup-hide-button.test.js (no DOM harness in this project).
//
// Run: node test/list-card-ticket-status-note.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function run() {
  const HTML_FILES = ["index.html", "calendar.html", "map.html"];

  for (const f of HTML_FILES) {
    const html = fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");

    // --- 1. TICKET_STATUS_NOTES dictionary + ticketStatusNoteHtml() exist,
    //     with the same four keys as event-template.html's version. ---
    assert.ok(/const TICKET_STATUS_NOTES = \{/.test(html), `${f} is missing TICKET_STATUS_NOTES`);
    for (const key of ["door", "rsvp_no_advance_sale", "free", "registration_required"]) {
      assert.ok(new RegExp(`${key}:\\s*'`).test(html), `${f}'s TICKET_STATUS_NOTES is missing the "${key}" entry`);
    }
    assert.ok(/function ticketStatusNoteHtml\(e\)\{/.test(html), `${f} is missing ticketStatusNoteHtml()`);
    console.log(`PASS: ${f} defines TICKET_STATUS_NOTES and ticketStatusNoteHtml()`);

    // --- 2. The function only returns a note when there's truly no
    //     ticketUrl/eventPageUrl to show instead -- a real link always wins. ---
    const fnMatch = html.match(/function ticketStatusNoteHtml\(e\)\{[\s\S]*?\n\}/);
    assert.ok(fnMatch, `${f}'s ticketStatusNoteHtml() body not found`);
    const fnBody = fnMatch[0];
    assert.ok(/if\(e\.ticketUrl && safeUrl\(e\.ticketUrl\)\) return '';/.test(fnBody), `${f}'s ticketStatusNoteHtml() must bail out when a real ticketUrl exists`);
    assert.ok(/if\(e\.eventPageUrl && safeUrl\(e\.eventPageUrl\)\) return '';/.test(fnBody), `${f}'s ticketStatusNoteHtml() must bail out when a real eventPageUrl exists`);
    console.log(`PASS: ${f}'s ticketStatusNoteHtml() defers to a real ticket/event link when one exists`);

    // --- 3. The mapping function captures ticketStatus from the row. ---
    assert.ok(/ticketStatus: row\.ticket_status \|\| undefined,/.test(html), `${f}'s row-mapping function doesn't capture ticketStatus`);
    console.log(`PASS: ${f}'s mapping function captures ticketStatus from row.ticket_status`);

    // --- 4. The card template actually calls ticketStatusNoteHtml(e). ---
    assert.ok(/\$\{ticketStatusNoteHtml\(e\)\}/.test(html), `${f}'s card template doesn't call ticketStatusNoteHtml(e)`);
    console.log(`PASS: ${f}'s card template renders ticketStatusNoteHtml(e)`);

    // --- 5. The query actually selects ticket_status, so the field isn't
    //     silently undefined in production. ---
    assert.ok(/select=[^"'`]*\bticket_status\b/.test(html), `${f}'s Supabase query is missing ticket_status in its select list`);
    console.log(`PASS: ${f}'s query selects ticket_status`);
  }

  // --- calendar.html specifically has two separate card-template render
  //     sites (day-panel view and list view) -- both must be wired, not
  //     just one of them. ---
  const calendarHtml = fs.readFileSync(`${REPO_DIR}/calendar.html`, "utf8");
  const calendarCallSites = (calendarHtml.match(/\$\{ticketStatusNoteHtml\(e\)\}/g) || []).length;
  assert.strictEqual(calendarCallSites, 2, "calendar.html must call ticketStatusNoteHtml(e) from both its day-panel and list-view card templates");
  console.log("PASS: calendar.html wires ticketStatusNoteHtml(e) into both of its card-template render sites");

  // --- index.html reads through events_public (explicit-column-list view)
  //     -- the migration adding ticket_status to that view must exist and
  //     must follow migration_034's append-only-at-the-end pattern (not
  //     inserted in the middle, which Postgres would read as a rename). ---
  const migrationPath = `${REPO_DIR}/supabase/migration_042_events_public_ticket_status.sql`;
  assert.ok(fs.existsSync(migrationPath), "migration_042_events_public_ticket_status.sql is missing -- index.html's events_public query will 400 without it");
  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(/create or replace view events_public as/i.test(migrationSql), "migration_042 doesn't recreate events_public");
  const colListMatch = migrationSql.match(/select\s+([\s\S]*?)\nfrom events e/i);
  assert.ok(colListMatch, "migration_042's events_public column list not found");
  const lastColLine = colListMatch[1].trim().split("\n").map(l => l.trim()).filter(Boolean).pop();
  assert.ok(/e\.ticket_status\s*$/.test(lastColLine), "migration_042 must add e.ticket_status as the LAST column in the view's select list (Postgres reads a mid-list insert as a column rename)");
  console.log("PASS: migration_042 adds ticket_status to events_public, appended at the end of the column list per the established safe pattern");

  console.log("\nlist-card-ticket-status-note.test.js: all assertions passed");
}

run();
