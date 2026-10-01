// test/admin-followup-hide-button.test.js
//
// Regression guard for the 2026-10-01 "Hide button in Needs Follow-up view"
// product decision (Jody, via the AskUserQuestion multiSelect answer:
// "Downtown Windsor BIA address fix,Hide button in Needs Follow-up view").
// No hard-delete exists anywhere in this codebase (api/admin-events.js's
// action enum is approve|reject|hide|restore|update_fields|
// dismiss_followup|undo_dismiss_followup|auto_repair_venue) — Jody's own
// question ("should I have a button in this view that DELETES the event
// all together?") was answered by reusing the EXISTING reversible hide
// mechanism (already used by Live Events, with its own "Recently hidden"
// undo list) rather than adding a new destructive action. This test proves
// that reuse is wired correctly: Needs Follow-up cards get their own
// "Remove from site" button, calling a thin wrapper around the same
// generic hide core Live Events already uses, so dismissed-as-unfixable
// (dismissFollowUp -- a separate, non-destructive, "stop re-surfacing
// this gap" action) is never confused with actually hiding the listing
// from the public site (hideFollowUpEvent).
//
// This is a structural/source-text check (regex over the raw HTML), not a
// DOM test -- admin.html has no DOM test harness in this project (see
// sh-n-venue-display.test.js's own header for why), so this follows that
// same established "light structural check" convention.
//
// Run: node test/admin-followup-hide-button.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function run() {
  const html = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");

  // --- 1. The generic hide core exists, keyed by (id, cardElId, btnElId,
  //     onHidden) so both Live Events and Needs Follow-up can reuse it. ---
  assert.ok(
    /async function hideEventGeneric\(id, cardElId, btnElId, onHidden\)/.test(html),
    "hideEventGeneric(id, cardElId, btnElId, onHidden) core function not found"
  );
  console.log("PASS: 1. generic hide core (hideEventGeneric) exists");

  // --- 2. Live Events' own hideEvent(id) still delegates to the generic
  //     core with its original ids -- this change must be additive, not a
  //     behavior change for the pre-existing Live Events hide button. ---
  assert.ok(
    /async function hideEvent\(id\)\s*\{\s*await hideEventGeneric\(id, 'live-card-' \+ id, 'hide-btn-' \+ id, loadHidden\);/.test(html),
    "hideEvent(id) must still delegate to hideEventGeneric with the original live-card-/hide-btn- ids"
  );
  console.log("PASS: 2. Live Events' hideEvent(id) is unchanged in behavior (still delegates to the generic core with its original element ids)");

  // --- 3. The new Needs Follow-up wrapper delegates to the SAME generic
  //     core and the SAME undo list (loadHidden), with its own card/button
  //     id convention (incomplete-<id> / followup-hide-btn-<id>). ---
  assert.ok(
    /async function hideFollowUpEvent\(id\)\s*\{\s*await hideEventGeneric\(id, 'incomplete-' \+ id, 'followup-hide-btn-' \+ id, loadHidden\);/.test(html),
    "hideFollowUpEvent(id) must delegate to hideEventGeneric with incomplete-/followup-hide-btn- ids and loadHidden as the undo-list refresh callback"
  );
  console.log("PASS: 3. new hideFollowUpEvent(id) delegates to the same generic core and the same Recently-hidden undo list (loadHidden)");

  // --- 4. The Needs Follow-up card template actually renders a button
  //     wired to hideFollowUpEvent(), with the exact id hideFollowUpEvent
  //     expects (followup-hide-btn-${e.id}), inside the same card whose id
  //     is incomplete-${e.id}. ---
  const cardBlockMatch = html.match(/<div class="card" id="incomplete-\$\{e\.id\}">[\s\S]*?<\/div>\s*<div class="err" id="incomplete-err-\$\{e\.id\}"/);
  assert.ok(cardBlockMatch, "Needs Follow-up card template (incomplete-${e.id}) not found");
  const cardBlock = cardBlockMatch[0];
  assert.ok(
    /<button class="btn-hide" id="followup-hide-btn-\$\{e\.id\}" onclick="hideFollowUpEvent\('\$\{e\.id\}'\)"/.test(cardBlock),
    "Needs Follow-up card is missing its 'Remove from site' button wired to hideFollowUpEvent('${e.id}') with id followup-hide-btn-${e.id}"
  );
  console.log("PASS: 4. Needs Follow-up card template renders a 'Remove from site' button correctly wired to hideFollowUpEvent()");

  // --- 5. The pre-existing "Save" and "Not fixable — dismiss" buttons are
  //     still present and untouched alongside the new button -- additive,
  //     not a replacement of the existing actions. ---
  assert.ok(/<button class="btn-approve" onclick="saveIncompleteFields\('\$\{e\.id\}'\)">Save<\/button>/.test(cardBlock),
    "the existing 'Save' button was lost from the Needs Follow-up card");
  assert.ok(/<button class="btn-reject" onclick="dismissFollowUp\('\$\{e\.id\}'\)"/.test(cardBlock),
    "the existing 'Not fixable — dismiss' button was lost from the Needs Follow-up card");
  console.log("PASS: 5. the pre-existing Save / Not fixable — dismiss buttons are unchanged -- the new button is additive");

  // --- 6. No new hard-delete action was introduced anywhere in admin.html
  //     -- Jody's "should I have a button that DELETES the event all
  //     together?" question was deliberately answered with the existing
  //     reversible hide, not a new destructive action. ---
  assert.ok(!/action:\s*['"]delete['"]/.test(html), "a new hard-delete action must not have been introduced in admin.html");
  console.log("PASS: 6. no new hard-delete action was introduced -- the existing reversible hide is reused, per the product decision");

  console.log("\nadmin-followup-hide-button.test.js: all assertions passed");
}

run();
