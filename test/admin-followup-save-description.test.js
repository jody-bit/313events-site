"use strict";
// Exercise the shipped queue Save function through the real API handler and mock database.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest");
const root = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${root}/admin.html`, "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).sort((a, b) => b.length - a.length)[0];
const version = "2026-11-20T12:00:00+00:00";
const description = "A monthly Mario Kart tournament at GottaGacha in Warren.";

function setup() {
  const tables = { events: [{ id: "event-1", title: "Hi-Fight Circuit #15", status: "approved",
    category: "community", start_date: "2026-11-22", description: "Mario Kart Monthly",
    venue_address_raw: "29200 Dequindre Rd #2B", venue_city_raw: "Warren",
    internal_note: null, updated_at: version }] };
  const db = makeMockPostgrest(tables);
  global.fetch = db.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-key";
  process.env.ADMIN_SECRET = "fixture-secret";
  delete require.cache[require.resolve(`${root}/api/admin-events.js`)];
  const handler = require(`${root}/api/admin-events.js`);
  const elements = {};
  const element = id => elements[id] ||= { style: {}, dataset: {}, value: "", textContent: "", innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, options: [] };
  const calls = [];
  const sandbox = { console, document: { getElementById: element, querySelectorAll: () => [], addEventListener() {},
    createElement: () => ({ _text: "", set textContent(v) { this._text = String(v); },
      get innerHTML() { return this._text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); } }) },
    window: {}, sessionStorage: { getItem: () => null, setItem() {} }, localStorage: { getItem: () => null, setItem() {} },
    setTimeout, clearTimeout, setInterval() {}, Intl, Date,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
      await handler({ method: "POST", query: {}, headers: options.headers, body }, res);
      return { ok: res.code === 200, status: res.code, json: async () => res.data };
    } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script + "\nSECRET='fixture-secret'; this.refreshes=0; loadIncomplete=async()=>{this.refreshes++;return true;};", sandbox);
  sandbox.renderIncompleteList([{ e: tables.events[0], missing: ["description"] }]);
  assert.ok(element("incompleteList").innerHTML.includes(`data-row-version="${version}"`));
  const card = element("incomplete-event-1");
  const fieldsElement = { dataset: { fields: "description,venue_city_raw", rowVersion: version } };
  card.querySelector = () => fieldsElement;
  element("inc-description-event-1").value = description;
  element("inc-venue_city_raw-event-1").value = "   ";
  return { sandbox, tables, calls, element };
}

async function run() {
  {
    const t = setup();
    await t.sandbox.saveIncompleteFields("event-1");
    assert.strictEqual(t.tables.events[0].description, description, "queue Save persists a nonempty-description replacement");
    assert.strictEqual(t.tables.events[0].venue_city_raw, "Warren", "blank inputs preserve existing fields");
    assert.strictEqual(t.tables.events[0].status, "approved", "Save never approves or hides an event");
    assert.ok(t.tables.events[0].internal_note.includes("OWNER-CORRECTION"));
    assert.ok(t.tables.events[0].internal_note.includes("fields=description"), "feed protection is retained");
    assert.strictEqual(t.calls[0].action, "save_correction");
    assert.strictEqual(t.calls[0].row_version, version);
    assert.strictEqual(t.sandbox.refreshes, 1);
  }
  {
    const t = setup();
    t.tables.events[0].updated_at = "2026-11-20T12:01:00+00:00";
    t.tables.events[0].description = "Another editor's correction.";
    await t.sandbox.saveIncompleteFields("event-1");
    assert.strictEqual(t.tables.events[0].description, "Another editor's correction.");
    assert.strictEqual(t.sandbox.refreshes, 0, "a conflict must not discard typed input by refreshing");
    assert.strictEqual(t.element("inc-description-event-1").value, description);
    assert.match(t.element("incomplete-err-event-1").textContent, /changed/i);
  }
  {
    const t = setup();
    t.sandbox.fetch = async () => ({ ok: true, json: async () => ({ ok: true, event: t.tables.events[0] }) });
    await t.sandbox.saveIncompleteFields("event-1");
    assert.strictEqual(t.sandbox.refreshes, 0, "HTTP 200 without the requested value is not success");
    assert.match(t.element("incomplete-err-event-1").textContent, /does not contain your changes/);
    assert.strictEqual(t.element("inc-description-event-1").value, description);
  }
  {
    const t = setup();
    t.element("incomplete-event-1").querySelector().dataset.rowVersion = "";
    await t.sandbox.saveIncompleteFields("event-1");
    assert.strictEqual(t.calls.length, 0, "missing versions never write");
    assert.match(t.element("incomplete-err-event-1").textContent, /Refresh/);
  }
  console.log("PASS: queue Save persists nonempty descriptions, preserves blank fields and protects conflicts; false success retains input");
}
run().catch(err => { console.error(err); process.exitCode = 1; });
