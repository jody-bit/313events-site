// test/admin-review-queue-edit.test.js — #185 increment 1: edit a pending event from the review queue.
// Runs the REAL inline script from admin.html in a vm sandbox against the mock shapes in
// platform/issue-185-increment-1/PLATFORM-CONTRACT.md (save_correction, row_version, 409, approve.blocked).
// Run: node test/admin-review-queue-edit.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];

function el() {
  return { style: {}, dataset: {}, options: [], value: "", textContent: "", innerHTML: "", disabled: false, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, focus() {} };
}
const els = {};
const calls = [];
let nextResponse = null;
let fakeInputs = [];
const sandbox = {
  console,
  document: {
    getElementById: (id) => (els[id] = els[id] || el()),
    querySelectorAll: (sel) => (/\[data-field\]/.test(sel) ? fakeInputs : []),
    createElement: () => ({ _t: "", set textContent(v) { this._t = String(v); }, get innerHTML() { return this._t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); } }),
    addEventListener() {},
  },
  window: {}, localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
  fetch: async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
    const r = nextResponse; nextResponse = null;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  },
  setTimeout, clearTimeout, setInterval() {}, Intl, Date,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(script + "\n;this.__t={SUB_EDIT,subBuild,subRowHtml,subEditOpen,subEditClose,subEditSave,subEditChanges,subEditInput,subEditFind,review,setRows:(r)=>{SUB_ROWS=r;},getRows:()=>SUB_ROWS,setSecret:(v)=>{SECRET=v;}};", sandbox);
const T = sandbox.__t;
T.setSecret("test-secret");

const NOW = Date.parse("2026-10-18T06:00:00Z");
const row = (over) => ({ id: "ev1", title: "Original Title", category: "music", start_date: "2026-11-01", time_display: "8:00 PM", venue_name_raw: "Old Hall",
  venue_address_raw: "1 Main St", venue_city_raw: "Detroit", ticket_url: "https://t.example/x", event_url: "https://e.example/x", description: "Desc",
  source: "Venue Submission", status: "pending_review", created_at: "2026-10-18T01:00:00Z", updated_at: "2026-10-18T05:00:00.000Z",
  row_version: "2026-10-18T05:00:00.000Z", owner_corrected: [], edits: [], lane: "person", lane_kind: null, reasons: [{ code: "human_submission", text: "Human submission" }], ...over });
const load = (r) => { T.setRows(T.subBuild(r, null)); Object.keys(T.SUB_EDIT).forEach((k) => delete T.SUB_EDIT[k]); calls.length = 0; };

// 1. An Edit button is offered with the existing Approve/Reject; panel is absent until opened.
load([row({})]);
let h = T.subRowHtml(T.getRows()[0], NOW, true);
assert.ok(h.includes("subEditOpen('ev1')") && h.includes("review('ev1','approve')") && h.includes("review('ev1','reject')"), "Edit sits beside Approve/Reject");
assert.ok(!h.includes("Save correction"), "panel closed by default");
assert.ok(!T.subRowHtml(T.getRows()[0], NOW, false).includes("subEditOpen"), "no Edit where no actions are offered");

// 2. Opened panel: labelled inputs for exactly the increment-1 fields, recorded-values block, history, no person name, no secret.
T.subEditOpen("ev1");
h = T.subRowHtml(T.getRows()[0], NOW, true);
for (const f of ["title", "category", "time_display", "venue_name_raw", "venue_address_raw", "venue_city_raw", "ticket_url", "event_url", "description"]) {
  assert.ok(h.includes(`id="subedit-ev1-${f}"`) && h.includes(`for="subedit-ev1-${f}"`), `${f} has a labelled control`);
}
for (const f of ["start_date", "end_date", "price_from", "venue_id", "image_url"]) assert.ok(!h.includes(`data-field="${f}"`), `${f} is not editable in increment 1`);
assert.ok(h.includes("Save correction") && h.includes("Save and approve") && h.includes("Cancel") && h.includes("Recorded values"));
assert.ok(!/test-secret/.test(h), "no secret in markup");

// 3. Edit history shows the before value, labelled "by admin", never a person.
load([row({ owner_corrected: ["title"], edits: [{ edit_id: "e1", at: "2026-10-18T04:00:00Z", actor: "admin", field: "title", before: "Old", after: "Original Title" }] })]);
T.subEditOpen("ev1");
h = T.subRowHtml(T.getRows()[0], NOW, true);
assert.ok(h.includes("Title: Old → Original Title") && h.includes("by admin"), "history lists before and after");
assert.ok(h.includes("Edited by owner: Title"), "owner-corrected fields are marked");

// 4. Changes: only differing, non-blank fields; blank clears are flagged, not sent.
load([row({})]);
T.SUB_EDIT.ev1 = { open: true, draft: { title: "  New Title ", venue_city_raw: "", description: "Desc" } };
let c = T.subEditChanges(T.subEditFind("ev1"));
assert.strictEqual(JSON.stringify(c.changes), JSON.stringify([{ field: "title", before: "Original Title", after: "New Title" }]));
assert.strictEqual(JSON.stringify(c.blanks), JSON.stringify(["venue_city_raw"]));

// 4b. Typing updates the draft from the live inputs.
fakeInputs = [{ dataset: { field: "title" }, value: "Typed", classList: { toggle() {} } }];
T.subEditInput("ev1");
assert.strictEqual(T.SUB_EDIT.ev1.draft.title, "Typed");
fakeInputs = [];

(async () => {
  // 5. Save correction: request shape, status stays pending, row stays in the queue, history grows.
  load([row({})]);
  T.SUB_EDIT.ev1 = { open: true, draft: { title: "New Title", venue_name_raw: "New Hall" } };
  nextResponse = { status: 200, body: { ok: true, edit_id: "e-1", event: { id: "ev1", title: "New Title", venue_name_raw: "New Hall", status: "pending_review" }, row_version: "2026-10-18T06:10:00.000Z",
    changes: [{ field: "title", before: "Original Title", after: "New Title" }, { field: "venue_name_raw", before: "Old Hall", after: "New Hall" }], owner_corrected: ["title", "venue_name_raw", "venue_id"],
    status_before: "pending_review", status_after: "pending_review", approve: { requested: false, done: false, blocked: null } } };
  await T.subEditSave("ev1", false);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "/api/admin-events");
  assert.strictEqual(calls[0].headers["x-admin-secret"], "test-secret");
  assert.strictEqual(JSON.stringify(calls[0].body), JSON.stringify({ id: "ev1", action: "save_correction", row_version: "2026-10-18T05:00:00.000Z", fields: { title: "New Title", venue_name_raw: "New Hall" }, approve: false }), "only changed fields, current row_version, approve false");
  let r = T.getRows()[0];
  assert.ok(r && r.title === "New Title" && r.row_version === "2026-10-18T06:10:00.000Z", "row updated with the API's values and new version");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.owner_corrected)), ["title", "venue_name_raw", "venue_id"]);
  assert.strictEqual(r.edits.length, 2, "history grows by the returned changes");
  assert.ok(T.SUB_EDIT.ev1.open === false && /Saved 2 corrections/.test(T.SUB_EDIT.ev1.notice) && /still awaiting review/.test(T.SUB_EDIT.ev1.notice));

  // 6. Save and approve done: row leaves the queue.
  load([row({})]);
  T.SUB_EDIT.ev1 = { open: true, draft: { title: "New Title" } };
  nextResponse = { status: 200, body: { ok: true, edit_id: "e-2", event: { id: "ev1", title: "New Title", status: "approved" }, row_version: "v2", changes: [{ field: "title", before: "Original Title", after: "New Title" }], owner_corrected: ["title"], status_before: "pending_review", status_after: "approved", approve: { requested: true, done: true, blocked: null } } };
  await T.subEditSave("ev1", true);
  assert.strictEqual(calls[0].body.approve, true);
  assert.strictEqual(T.getRows().length, 0, "approved row leaves Needs a person");

  // 7. Approval blocked: correction kept, row stays, the failing gate is shown in plain language.
  load([row({})]);
  T.SUB_EDIT.ev1 = { open: true, draft: { title: "New Title" } };
  nextResponse = { status: 200, body: { ok: true, edit_id: "e-3", event: { id: "ev1", title: "New Title", status: "pending_review" }, row_version: "v3", changes: [{ field: "title", before: "Original Title", after: "New Title" }], owner_corrected: ["title"], status_before: "pending_review", status_after: "pending_review", approve: { requested: true, done: false, blocked: { failed_gate: "publication_gate", codes: ["OUT_OF_ORBIT"], why: "Outside the Detroit Orbit." } } } };
  await T.subEditSave("ev1", true);
  assert.strictEqual(T.getRows().length, 1);
  assert.ok(T.getRows()[0].title === "New Title");
  assert.ok(/Not approved: Outside the Detroit Orbit\. \(OUT_OF_ORBIT\)/.test(T.SUB_EDIT.ev1.notice) && T.SUB_EDIT.ev1.noticeKind === "warn", "blocked reason shown, correction kept");

  // 8. 409: nothing saved, current values loaded, typed text kept, plain-language warning.
  load([row({})]);
  T.SUB_EDIT.ev1 = { open: true, draft: { title: "My Title" } };
  nextResponse = { status: 409, body: { error: "row changed", current: { id: "ev1", title: "Changed Elsewhere" }, row_version: "2026-10-18T06:30:00.000Z" } };
  await T.subEditSave("ev1", false);
  r = T.getRows()[0];
  assert.ok(r.title === "Changed Elsewhere" && r.row_version === "2026-10-18T06:30:00.000Z", "current values and version loaded");
  assert.ok(T.SUB_EDIT.ev1.open === true && T.SUB_EDIT.ev1.draft.title === "My Title", "typed text kept");
  assert.ok(/nothing was saved/.test(T.SUB_EDIT.ev1.notice));

  // 9. 400 names the field; nothing is claimed as saved.
  load([row({})]);
  T.SUB_EDIT.ev1 = { open: true, draft: { ticket_url: "javascript:x" } };
  nextResponse = { status: 400, body: { error: "ticket_url must be a valid http(s) link", field: "ticket_url" } };
  await T.subEditSave("ev1", false);
  assert.ok(/Ticket link: .*Nothing was saved/.test(T.SUB_EDIT.ev1.notice) && T.SUB_EDIT.ev1.noticeKind === "err");
  assert.strictEqual(T.getRows()[0].ticket_url, "https://t.example/x", "row unchanged");

  // 10. No row_version (older API): no request is sent.
  load([row({ row_version: undefined })]);
  T.SUB_EDIT.ev1 = { open: true, draft: { title: "New Title" } };
  await T.subEditSave("ev1", false);
  assert.strictEqual(calls.length, 0, "no save without a row version");
  assert.ok(/Reload the queue/.test(T.SUB_EDIT.ev1.notice));

  // 11. Nothing to save / blank clear: no request.
  load([row({})]);
  T.SUB_EDIT.ev1 = { open: true, draft: { description: "" } };
  await T.subEditSave("ev1", false);
  assert.strictEqual(calls.length, 0, "a blank clear is never sent");

  // 12. Existing Approve/Reject request is unchanged.
  load([row({})]);
  global.document = sandbox.document;
  const card = { style: {}, remove() {} };
  els["card-ev1"] = card;
  nextResponse = { status: 200, body: { ok: true } };
  await T.review("ev1", "approve");
  assert.strictEqual(JSON.stringify(calls[0].body), JSON.stringify({ id: "ev1", action: "approve" }), "review() request shape unchanged");

  // 13. The edit code never sends internal_note or writes status itself.
  const mod = script.slice(script.indexOf("// ---- Review-queue editing"), script.indexOf("async function review(id, action)"));
  assert.ok(!/internal_note/.test(mod.replace(/\/\/.*$/gm, "")), "internal_note is never read or sent");
  assert.ok(!/status\s*:/.test(mod.replace(/\/\/.*$/gm, "").replace(/status_(before|after)/g, "")), "edit code does not write status");
  console.log("admin-review-queue-edit: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
