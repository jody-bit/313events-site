// test/admin-live-event-edit.test.js — admin recovery: edit and save a correction on a LIVE event (Live events tab).
// Runs the REAL inline script from admin.html in a vm sandbox against the save_correction contract (row_version, 409, 400).
// Run: node test/admin-live-event-edit.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];

const rendered = {};
function el(id) {
  return { id, style: {}, dataset: {}, options: [], value: "", textContent: "", innerHTML: "", disabled: false, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, focus() {},
    replaceWith(node) { rendered[id] = node.html; } };
}
const els = {};
const calls = [];
let nextResponse = null;
let fakeInputs = [];
const sandbox = {
  console,
  document: {
    getElementById: (id) => (els[id] = els[id] || el(id)),
    querySelectorAll: (sel) => (/\[data-field\]/.test(sel) ? fakeInputs : []),
    createElement: () => ({ _t: "", _h: "", set textContent(v) { this._t = String(v); }, set innerHTML(v) { this._h = String(v); this._t = ""; },
      get innerHTML() { return this._t ? this._t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : this._h; }, get firstChild() { return { html: this._h }; } }),
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
vm.runInContext(script + "\n;this.__t={LIVE_EDIT,renderLiveResults,liveCardHtml,liveEditOpen,liveEditClose,liveEditSave,liveEditChanges,liveEditInput,liveFind,getRows:()=>LIVE_ROWS,setSecret:(s)=>{SECRET=s;}};", sandbox);
const T = sandbox.__t;
T.setSecret("test-secret");

const row = (over) => ({ id: "lv1", title: "Wrong Title", category: "music", start_date: "2026-11-01", time_display: "8:00 PM", venue_name_raw: "Old Hall", venue_address_raw: "1 Main St",
  venue_city_raw: "Detroit", ticket_url: "https://t.example/x", event_url: "https://e.example/x", description: "Desc", source: "Ticketmaster", status: "approved",
  updated_at: "2026-10-18T05:00:00.000Z", ...over });
const load = (r) => { T.renderLiveResults(r); Object.keys(T.LIVE_EDIT).forEach((k) => delete T.LIVE_EDIT[k]); calls.length = 0; };

// 1. Results offer Edit beside Remove; the panel is closed by default; nothing about status or approval is offered.
load([row({})]);
let h = T.liveCardHtml(T.getRows()[0]);
assert.ok(h.includes("liveEditOpen('lv1')") && h.includes("hideEvent('lv1')"), "Edit sits beside Remove from site");
assert.ok(!h.includes("Save correction") && !/approve/i.test(h), "closed panel, no approve control on a live event");

// 2. Opened panel: labelled inputs for exactly the nine correctable fields; dates, price, venue link, image are not editable.
T.liveEditOpen("lv1");
h = rendered["live-card-lv1"];
for (const f of ["title", "category", "time_display", "venue_name_raw", "venue_address_raw", "venue_city_raw", "ticket_url", "event_url", "description"]) {
  assert.ok(h.includes(`id="liveedit-lv1-${f}"`) && h.includes(`for="liveedit-lv1-${f}"`), `${f} has a labelled control`);
}
for (const f of ["start_date", "end_date", "price_from", "venue_id", "image_url"]) assert.ok(!h.includes(`data-field="${f}"`), `${f} is not editable here`);
assert.ok(h.includes("Save correction") && h.includes("Cancel") && h.includes("Recorded values") && !h.includes("Save and approve"), "save, cancel, evidence; no approve");
assert.ok(!/test-secret/.test(h), "no secret in markup");

// 3. Row version falls back to updated_at; the owner-corrected marker and history show when the API supplies them.
load([row({ owner_corrected: ["title"], edits: [{ edit_id: "e1", at: "2026-10-18T04:00:00Z", actor: "admin", field: "title", before: "Old", after: "Wrong Title" }] })]);
h = T.liveCardHtml(T.getRows()[0]);
assert.ok(h.includes("Edited by owner: Title") && h.includes("Importers will not overwrite"), "owner-corrected fields are marked");

// 4. Changes: only differing non-blank fields; a blank is flagged and never sent.
load([row({})]);
T.LIVE_EDIT.lv1 = { open: true, draft: { title: " Right Title ", venue_city_raw: "", description: "Desc" } };
let c = T.liveEditChanges(T.liveFind("lv1"));
assert.strictEqual(JSON.stringify(c.changes), JSON.stringify([{ field: "title", before: "Wrong Title", after: "Right Title" }]));
assert.strictEqual(JSON.stringify(c.blanks), '["venue_city_raw"]');

// 5. Save sends save_correction with the loaded version (updated_at) and ONLY changed fields, without approve.
load([row({})]);
T.liveEditOpen("lv1");
fakeInputs = [{ classList: { toggle() {} }, dataset: { field: "title" }, value: "Right Title" }, { classList: { toggle() {} }, dataset: { field: "venue_name_raw" }, value: "New Hall" }, { classList: { toggle() {} }, dataset: { field: "description" }, value: "Desc" }];
nextResponse = { status: 200, body: { ok: true, edit_id: "e-1", event: row({ title: "Right Title", venue_name_raw: "New Hall", updated_at: "2026-10-19T02:00:00.000Z" }), row_version: "2026-10-19T02:00:00.000Z",
  changes: [{ field: "title", before: "Wrong Title", after: "Right Title" }, { field: "venue_name_raw", before: "Old Hall", after: "New Hall" }], owner_corrected: ["title", "venue_name_raw", "venue_id"],
  status_before: "approved", status_after: "approved", approve: { requested: false, done: false, blocked: null } } };
(async () => {
  await T.liveEditSave("lv1");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(JSON.stringify(calls[0].body), JSON.stringify({ id: "lv1", action: "save_correction", row_version: "2026-10-18T05:00:00.000Z", fields: { title: "Right Title", venue_name_raw: "New Hall" } }));
  assert.strictEqual(calls[0].headers["x-admin-secret"], "test-secret");
  assert.ok(!("approve" in calls[0].body), "never approves");
  let r = T.getRows()[0];
  assert.strictEqual(r.title, "Right Title");
  assert.strictEqual(r.row_version, "2026-10-19T02:00:00.000Z", "next save uses the new version");
  assert.strictEqual(JSON.stringify(r.owner_corrected), '["title","venue_name_raw","venue_id"]');
  assert.strictEqual(r.edits.length, 2, "history grows by the saved changes");
  assert.ok(/Saved 2 corrections\. The event is still live/.test(T.LIVE_EDIT.lv1.notice) && T.LIVE_EDIT.lv1.open === false, "confirmation names the outcome");
  assert.ok(rendered["live-card-lv1"].includes("Edited by owner: Title, Venue name, Venue link"), "card now shows the locked fields");

  // 6. 409: nothing saved; current values loaded; typed text kept; message says so.
  fakeInputs = [{ classList: { toggle() {} }, dataset: { field: "title" }, value: "Typed Again" }];
  T.liveEditOpen("lv1");
  nextResponse = { status: 409, body: { error: "row changed", current: row({ title: "Changed Elsewhere", updated_at: "2026-10-19T03:00:00.000Z" }), row_version: "2026-10-19T03:00:00.000Z" } };
  await T.liveEditSave("lv1");
  r = T.getRows()[0];
  assert.strictEqual(r.title, "Changed Elsewhere");
  assert.strictEqual(r.row_version, "2026-10-19T03:00:00.000Z");
  assert.ok(/nothing was saved/.test(T.LIVE_EDIT.lv1.notice) && T.LIVE_EDIT.lv1.open === true && T.LIVE_EDIT.lv1.draft.title === "Typed Again", "409 keeps the draft");

  // 7. 400 names the field and says nothing was saved.
  nextResponse = { status: 400, body: { error: "invalid correction", field: "ticket_url" } };
  fakeInputs = [{ classList: { toggle() {} }, dataset: { field: "ticket_url" }, value: "not a link" }];
  await T.liveEditSave("lv1");
  assert.ok(/Ticket link:/.test(T.LIVE_EDIT.lv1.notice) && /Nothing was saved/.test(T.LIVE_EDIT.lv1.notice), "400 names the field");

  // 8. No version at all: refuse to send.
  load([row({ updated_at: undefined })]);
  T.liveEditOpen("lv1");
  fakeInputs = [{ classList: { toggle() {} }, dataset: { field: "title" }, value: "X Title" }];
  await T.liveEditSave("lv1");
  assert.strictEqual(calls.length, 0, "no request without a row version");

  // 9. Network failure: message, nothing saved, panel stays open.
  load([row({})]);
  T.liveEditOpen("lv1");
  fakeInputs = [{ classList: { toggle() {} }, dataset: { field: "title" }, value: "X Title" }];
  sandbox.fetch = async () => { throw new Error("offline"); };
  await T.liveEditSave("lv1");
  assert.ok(/offline/.test(T.LIVE_EDIT.lv1.notice) && T.LIVE_EDIT.lv1.open === true);
  // 10. Live search asks Platform for the wide match (title, venue or source) so an editor can find an event by venue.
  assert.ok(/\/api\/admin-events\?match=any&search=/.test(script), "live search sends match=any");
  console.log("admin-live-event-edit: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
