// test/admin-submissions-dashboard.test.js — Submissions dashboard Step 1 (2026-10-17), read-only.
//
// Runs the REAL inline script from admin.html in a vm sandbox and checks the rules the owner set for the dashboard:
//   - provenance is derived from existing fields and labelled; unknown stays "Not provided", never invented
//   - updated_at is never presented as a processing time
//   - Dearborn's policy hold and failing sources are kept out of the Needs a person lane
//   - the connector table cannot drift from api/_lib/source-health.js
//   - stored/API fields (prov, lane, reasons) win over the derivation
//   - Approve/Reject are not offered for technical failures
// Run: node test/admin-submissions-dashboard.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];

function el() {
  return { style: {}, dataset: {}, options: [], value: "", textContent: "", innerHTML: "", classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {} };
}
const els = {};
const sandbox = {
  console,
  document: {
    getElementById: (id) => (els[id] = els[id] || el()),
    querySelectorAll: () => [],
    createElement: () => {
      const d = { _t: "", set textContent(v) { this._t = String(v); }, get innerHTML() { return this._t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); } };
      return d;
    },
    addEventListener() {},
  },
  window: {}, localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
  fetch: async () => { throw new Error("no network in this test"); }, setTimeout, clearTimeout, setInterval() {}, Intl, Date,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(script + "\n;this.__t={subDeriveProv,subDeriveReasons,subLane,subBuild,subCounts,subMatches,subRowHtml,subRender,SUB_CONNECTORS,SUB_FILTERS,setRows:(r)=>{SUB_ROWS=r;},getRows:()=>SUB_ROWS};", sandbox);
const T = sandbox.__t;

const NOW = Date.parse("2026-10-17T20:00:00Z");
const base = { id: "x", title: "T", category: "music", start_date: "2026-11-01", status: "pending_review", created_at: "2026-10-17T18:00:00Z", updated_at: "2026-10-17T19:59:00Z" };

// 1. Connector table is the source-health table (no silent drift).
const SH = require(`${REPO_DIR}/api/_lib/source-health`);
assert.strictEqual(
  JSON.stringify(T.SUB_CONNECTORS.map((c) => [c.slug, c.prefix || null, c.source || null])),
  JSON.stringify(SH.ATTRIBUTION.map((c) => [c.slug, c.prefix || null, c.source || null])),
  "admin.html connector table must equal source-health ATTRIBUTION"
);

// 2. Origin / source / method derivation, labelled derived, unknown stays unknown.
let p = T.subDeriveProv({ ...base, source: "Venue Submission", submitter_email: "a@b.c" });
assert.strictEqual(p.origin, "human"); assert.strictEqual(p.method, "Submission form"); assert.strictEqual(p.originDerived, true);
p = T.subDeriveProv({ ...base, source: "Manual" }); assert.strictEqual(p.origin, "admin");
p = T.subDeriveProv({ ...base, source: "Editorial Review" }); assert.strictEqual(p.origin, "admin");
p = T.subDeriveProv({ ...base, source: "City of Dearborn", external_id: "feed-abc", feed_source_id: "f1" });
assert.strictEqual(p.origin, "automated"); assert.strictEqual(p.method, "Feed (ICS/RSS)"); assert.strictEqual(p.slug, "feeds");
p = T.subDeriveProv({ ...base, source: "Ticketmaster", external_id: "Z7r9" }); assert.strictEqual(p.origin, "automated"); assert.strictEqual(p.method, "API");
p = T.subDeriveProv({ ...base, source: "Some Unmapped Source" });
assert.strictEqual(p.origin, null, "an unmapped source is never defaulted to Automated");
assert.strictEqual(p.method, null);
p = T.subDeriveProv({ ...base, source: "WDET", external_id: "wdet-1" });
assert.strictEqual(p.origin, "automated"); assert.strictEqual(p.method, null, "method only where the code registry says so");
assert.strictEqual(p.last_pipeline_at, undefined, "no processing timestamp is derived");
assert.strictEqual(p.added_at, base.created_at);

// 3. Reasons: recorded note text, human submission, field gaps; never "processed".
let r = T.subDeriveReasons({ ...base, source: "City of Dearborn", note: "Held for review: City of Dearborn's calendar mixes public events with notices; no location stated. Source gave no more; nothing was inferred.", time_display: "7 PM", venue_name_raw: "X" });
assert.strictEqual(r[0].code, "pipeline_hold"); assert.strictEqual(r[0].derived, false);
r = T.subDeriveReasons({ ...base, source: "Venue Submission", time_display: "7 PM", venue_name_raw: "Place" });
assert.ok(r.some((x) => x.code === "human_submission"));
r = T.subDeriveReasons({ ...base, source: "X", venue_name_raw: "Venue TBA" });
assert.ok(r.some((x) => x.code === "missing_location") && r.some((x) => x.code === "missing_start_time"));
r = T.subDeriveReasons({ ...base, source: "X", venue_name_raw: "Place", time_display: "7 PM" });
assert.strictEqual(JSON.stringify(r.map((x) => x.code)), JSON.stringify(["none_recorded"]), "no reason found -> says so, never invents one");
r = T.subDeriveReasons({ ...base, source: "X", venue_name_raw: "Place", time_display: "7 PM", queue_class: { class: "public_event", reason: "x", cancelled: true } });
assert.ok(r.some((x) => x.code === "cancelled_in_title"), "cancelled wording is surfaced as a derived hint");

// 4. Lanes.
const tower = { system: { sources: [{ slug: "wdet", status: "failing", reasons: ["3 failed runs in a row"], label: "WDET" }, { slug: "feeds", status: "failing", reasons: ["x"], label: "Feeds" }] } };
assert.strictEqual(T.subLane({ ...base, source: "City of Dearborn", external_id: "feed-1" }, tower).kind, "policy");
assert.strictEqual(T.subLane({ ...base, source: "City of Dearborn Heights", external_id: "feed-1" }, null).lane, "person", "Dearborn Heights is not the Dearborn feed");
assert.strictEqual(T.subLane({ ...base, source: "WDET", external_id: "wdet-1" }, tower).kind, "technical");
assert.strictEqual(T.subLane({ ...base, source: "WDET", external_id: "wdet-1" }, null).lane, "person", "no health evidence -> not blocked");
assert.strictEqual(T.subLane({ ...base, source: "BGSU", external_id: "feed-9" }, tower).lane, "person", "the aggregate feeds slug is never used to blame one feed");
assert.strictEqual(T.subLane({ ...base, source: "Venue Submission" }, tower).lane, "person");

// 5. Server-supplied fields (Platform PR #161 contract, api/_lib/submission-provenance.js) win and are normalized.
const srv = (over) => ({
  ...base, id: "s1", source: "City of Dearborn", external_id: "feed-s1", feed_source_id: "f1", time_display: "7 PM", venue_name_raw: "V", venue_city_raw: "Dearborn", description: "d",
  lane: "blocked", lane_kind: "policy_hold",
  reasons: [{ code: "dearborn_unclassified", text: "Dearborn row awaiting classification (public event: x)." }],
  prov: { origin: { value: "automated", derived: true }, source: { slug: "feed-f1", name: "City of Dearborn" }, method: { value: "ics", derived: true },
    status: "pending_review", added_at: base.created_at, link_checked_at: null, last_seen_at_source: "2026-10-17T05:00:00Z", source_last_run_at: "2026-10-17T06:00:00Z" },
  ...over,
});
let sb = T.subBuild([srv({})], null)[0];
assert.strictEqual(sb._sub.lane, "blocked"); assert.strictEqual(sb._sub.kind, "policy", "policy_hold maps to the policy hold");
assert.strictEqual(sb._sub.prov.origin, "automated"); assert.strictEqual(sb._sub.prov.source, "City of Dearborn");
assert.strictEqual(sb._sub.prov.method, "ICS feed"); assert.strictEqual(sb._sub.prov.originDerived, true);
assert.strictEqual(sb._sub.reasons[0].derived, true, "server reasons are labelled derived by the UI");
sb = T.subBuild([srv({ lane: "blocked", lane_kind: "technical", reasons: [{ code: "source_blocked", text: "Source is blocked: 3 failed runs" }] })], null)[0];
assert.strictEqual(sb._sub.kind, "technical"); assert.ok(sb._sub.why.includes("3 failed runs"));
sb = T.subBuild([srv({ created_at: null, lane: "person", lane_kind: null, prov: { origin: { value: "unknown", derived: true }, source: { slug: null, name: null }, method: { value: "unknown", derived: true }, status: "pending_review", added_at: null } })], null)[0];
assert.strictEqual(sb._sub.prov.origin, null, "unknown origin stays Not provided");
assert.strictEqual(sb._sub.prov.method, null); assert.strictEqual(sb._sub.prov.source, null);
const unk = T.subRowHtml(sb, NOW, true);
assert.ok(unk.includes("Origin: Not provided") && unk.includes("Source: Not provided") && unk.includes("Method: Not provided") && unk.includes("Added: Not provided"));
const lastSeen = T.subRowHtml(T.subBuild([srv({})], null)[0], NOW, true);
assert.ok(lastSeen.includes("Last seen at source:") && lastSeen.includes("Source last ran:") && lastSeen.includes("Last processed: Not provided"), "source run and last-seen are labelled for what they are; processed stays Not provided");
// secondary notes (optional-field gaps) render quietly and are never a reason
const withNote = T.subBuild([srv({ lane: "person", lane_kind: null, reasons: [{ code: "no_reason_recorded", text: "No review reason recorded." }], notes: [{ code: "missing_description", text: "No description recorded." }] })], null)[0];
const noteHtml = T.subRowHtml(withNote, NOW, true);
assert.ok(noteHtml.includes("Note: No description recorded.") && noteHtml.includes("No review reason recorded"));
assert.ok(!withNote._sub.reasons.some((r) => r.code === "missing_description"));
// every method code the API can emit has a label
for (const m of ["api", "ics", "rss", "sync", "scrape", "generated", "form", "manual"]) {
  const r2 = T.subBuild([srv({ prov: { ...srv({}).prov, method: { value: m, derived: true } } })], null)[0];
  assert.ok(r2._sub.prov.method && r2._sub.prov.method !== m || m === "api" || m === "sync", "method label for " + m);
}

// 6. Rendering: Not provided, derived markers, no updated_at as processing, actions rules.
const row = T.subBuild([{ ...base, id: "r1", source: "Mystery", title: "Dolls <Night>" }], null)[0];
const out = T.subRowHtml(row, NOW, true);
assert.ok(out.includes("Origin: Not provided") && out.includes("Method: Not provided"));
assert.ok(out.includes("Last processed: Not provided"), "last processed is Not provided, never updated_at");
assert.ok(!/19:59|7:59 PM/.test(out), "updated_at value never appears");
assert.ok(out.includes("Dolls &lt;Night&gt;"), "titles are escaped");
assert.ok(out.includes("Time not provided") && out.includes("Venue not provided"));
assert.ok(out.includes("btn-approve") && out.includes("btn-reject"));
assert.ok(!T.subRowHtml(row, NOW, false).includes("btn-approve"));
const hum = T.subBuild([{ ...base, id: "r2", source: "Venue Submission", time_display: "7 PM", venue_name_raw: "P" }], null)[0];
assert.ok(T.subRowHtml(hum, NOW, true).includes("data-derived=\"1\""), "derived chips carry the derived marker");

// 7. Counts + filters; technical lane rows get no Approve/Reject in the lane view.
const rows = T.subBuild([
  { ...base, id: "a", source: "City of Dearborn", external_id: "feed-1", queue_class: { class: "public_event", reason: "r", cancelled: false } },
  { ...base, id: "b", source: "WDET", external_id: "wdet-1" },
  { ...base, id: "c", source: "Venue Submission", time_display: "7 PM", venue_name_raw: "P" },
  { ...base, id: "d", source: "Manual", time_display: "7 PM", venue_name_raw: "P" },
], tower);
const c = T.subCounts(rows);
assert.strictEqual(JSON.stringify([c.person, c.blocked, c.technical, c.policy]), JSON.stringify([2, 2, 1, 1]));
const F = (o) => ({ lane: "person", q: "", origin: "", source: "", reason: "", added: "", ...o });
assert.strictEqual(rows.filter((x) => T.subMatches(x, F({ origin: "human" }), NOW)).length, 1);
assert.strictEqual(rows.filter((x) => T.subMatches(x, F({ origin: "unknown" }), NOW)).length, 0);
assert.strictEqual(rows.filter((x) => T.subMatches(x, F({ added: "1" }), Date.parse("2026-10-20T00:00:00Z"))).length, 0, "older than 24h excluded");
assert.strictEqual(rows.filter((x) => T.subMatches(x, F({ reason: "human_submission" }), NOW)).length, 1);

T.setRows(rows);
els["subStatus"] = el();
T.SUB_FILTERS.lane = "blocked";
T.subRender();
const blockedHtml = els["list"].innerHTML;
assert.ok(blockedHtml.includes("waiting on a technical problem") && blockedHtml.includes("Nothing to decide here"));
assert.ok(blockedHtml.includes("held by source policy"));
assert.ok(!blockedHtml.includes("review('b'"), "no Approve/Reject for the technically blocked row");
assert.ok(blockedHtml.includes("review('a','approve')"), "a real Dearborn public event can still be recovered one by one");
T.SUB_FILTERS.lane = "person"; T.subRender();
const personHtml = els["list"].innerHTML;
assert.ok(personHtml.includes("review('c'") && !personHtml.includes("review('a'") && !personHtml.includes("review('b'"), "Dearborn and failing-source rows are not in the human lane");
T.SUB_FILTERS.lane = "auto"; T.subRender();
assert.ok(els["list"].innerHTML.includes("Not tracked yet"), "Handled automatically does not guess");

// 8. Read-only: the dashboard code performs no writes except the existing review() call.
const dash = script.slice(script.indexOf("// ---- Submissions dashboard, Step 1"), script.indexOf("async function review(id, action)"));
assert.ok(!/method:\s*['"](POST|PUT|PATCH|DELETE)/.test(dash), "dashboard code issues no write requests");
assert.ok(!/updated_at/.test(dash.replace(/\/\/.*$/gm, "")), "dashboard code never reads updated_at");
console.log("admin-submissions-dashboard: all assertions passed");
