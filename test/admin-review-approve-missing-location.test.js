// test/admin-review-approve-missing-location.test.js
//
// The Submissions queue's plain Approve button (admin.html review()) used to show only the bare code
// "MISSING_VENUE_LOCATION" when api/_lib/venue-location-gate.js refused a Venue Submission with no venue link and no
// city, and offered no way to approve it on purpose. Now the refusal is explained on the card and a second click
// ("Approve without a venue or city") resends with acknowledgeMissingLocation:true. Other failures still alert as before.
//
// Run: node test/admin-review-approve-missing-location.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");
const grab = (re) => { const m = re.exec(html); assert.ok(m, "admin.html is missing " + re); return m[0]; };
const reviewSrc = grab(/async function review\(id, action[^)]*\) \{[\s\S]*?\n\}\n/);
const errTextSrc = grab(/function errText\(data, fallback\) \{[\s\S]*?\n\}\n/);

function makeCard() {
  const children = [];
  const actions = { className: "actions", parentNode: null };
  const btn = { className: "btn-approve", textContent: "Approve", onclick: null };
  const card = {
    style: { opacity: "" }, removed: false, children,
    remove() { this.removed = true; },
    querySelector(sel) { if (sel === ".btn-approve") return btn; if (sel === ".actions") return actions; if (sel === ".sub-locwarn") return children.find((c) => /sub-locwarn/.test(c.className)) || null; return null; },
    appendChild(c) { children.push(c); },
  };
  actions.parentNode = { insertBefore(n) { children.push(n); } };
  return { card, btn };
}

async function run(responses) {
  const { card, btn } = makeCard();
  const sent = []; const alerts = [];
  const sandbox = {
    document: { getElementById: () => card, createElement: () => ({ className: "", textContent: "" }) },
    SECRET: "s", SUB_EDIT: {}, SUB_ROWS: [], SUB_ENDED: null, subRender() {}, alert: (m) => alerts.push(m), console,
    fetch: async (_u, o) => { sent.push(JSON.parse(o.body)); const r = responses.shift(); return { ok: r.ok, json: async () => r.body }; },
  };
  vm.createContext(sandbox);
  vm.runInContext(errTextSrc + reviewSrc + "\nthis.review = review;", sandbox);
  return { sandbox, card, btn, sent, alerts };
}

(async () => {
  // 1. refusal: explained on the card, nothing alerted, button relabelled, row not removed
  let t = await run([{ ok: false, body: { error: "MISSING_VENUE_LOCATION", message: "No venue and no city." } }]);
  await t.sandbox.review("e1", "approve");
  assert.deepStrictEqual(t.sent[0], { id: "e1", action: "approve" });
  assert.strictEqual(t.alerts.length, 0);
  assert.strictEqual(t.card.removed, false);
  assert.strictEqual(t.card.style.opacity, "1");
  assert.strictEqual(t.btn.textContent, "Approve without a venue or city");
  assert.ok(t.card.children.some((c) => c.textContent === "No venue and no city."));

  // 2. second click resends with the acknowledgement and then removes the card
  t.sandbox.fetch = (async (_u, o) => { t.sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({}) }; });
  await t.btn.onclick();
  assert.deepStrictEqual(t.sent[1], { id: "e1", action: "approve", acknowledgeMissingLocation: true });
  assert.strictEqual(t.card.removed, true);

  // 3. an acknowledged request that still fails alerts (no loop)
  t = await run([{ ok: false, body: { error: "MISSING_VENUE_LOCATION", message: "x" } }]);
  await t.sandbox.review("e2", "approve", true);
  assert.deepStrictEqual(t.sent[0], { id: "e2", action: "approve", acknowledgeMissingLocation: true });
  assert.deepStrictEqual(t.alerts, ["MISSING_VENUE_LOCATION"]);

  // 4. other errors and reject are unchanged
  t = await run([{ ok: false, body: { error: "MISSING_START_TIME" } }]);
  await t.sandbox.review("e3", "approve");
  assert.deepStrictEqual(t.alerts, ["MISSING_START_TIME"]);
  assert.strictEqual(t.btn.textContent, "Approve");
  t = await run([{ ok: true, body: {} }]);
  await t.sandbox.review("e4", "reject");
  assert.deepStrictEqual(t.sent[0], { id: "e4", action: "reject" });
  assert.strictEqual(t.card.removed, true);

  console.log("PASS: plain Approve explains a missing venue/city and can approve on purpose with a second click");
})().catch((e) => { console.error(e); process.exit(1); });
