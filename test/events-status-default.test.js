// test/events-status-default.test.js — publishing is explicit.
//
// The database default for events.status is 'pending_review' (migration
// 20261008000000), so a code path that forgets to set a status cannot publish
// by omission. This test keeps the other half true: every path that writes an
// event today states its status itself, so the default is only a backstop, and
// a NEW writer cannot appear unreviewed.
//
// Plain Node assert. Run: node test/events-status-default.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const strip = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ---- 1. the schema default, from the migrations in apply order --------------
const dir = path.join(root, "supabase/migrations");
let def = null;
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
  const sql = strip(read("supabase/migrations/" + f).replace(/--.*$/gm, ""));
  const create = sql.match(/create table events \(([\s\S]*?)\n\);/i);
  if (create) { const m = create[1].match(/\bstatus\s+event_status\s+not null\s+default\s+'(\w+)'/i); if (m) def = m[1]; }
  for (const m of sql.matchAll(/alter table events alter column status set default\s+'(\w+)'/gi)) def = m[1];
}
assert.strictEqual(def, "pending_review", "events.status must default to pending_review (found: " + def + ")");
console.log("PASS: events.status defaults to pending_review");

// ---- 2. every direct writer of events states its status ---------------------
// A direct write = a fetch to /rest/v1/events (optionally ?on_conflict=) with method POST.
const files = []
  .concat(fs.readdirSync(path.join(root, "api")).filter((f) => f.endsWith(".js")).map((f) => "api/" + f))
  .concat(fs.readdirSync(path.join(root, "api/_lib")).filter((f) => f.endsWith(".js")).map((f) => "api/_lib/" + f))
  .concat(fs.readdirSync(path.join(root, "scripts")).filter((f) => f.endsWith(".js")).map((f) => "scripts/" + f));
const direct = files.filter((f) => /rest\/v1\/events(?:\?on_conflict=[^`'"]*)?[`'"][^;]{0,400}?method:\s*["']POST/.test(strip(read(f))));
// Reviewed list. A new direct writer must be added here deliberately.
const EXPECTED_DIRECT = ["api/admin-editorial.js", "api/submit.js", "scripts/press-coverage-linking.js", "scripts/ra-candidate-promotion.js", "scripts/ra-sync.js"];
// (api/_lib/event-upsert.js is the shared batch writer; its callers are checked in section 3.)
assert.deepStrictEqual(direct.sort(), EXPECTED_DIRECT, "the set of files that insert events changed: review each for an explicit status, then update EXPECTED_DIRECT");
for (const f of EXPECTED_DIRECT) {
  assert.ok(/\bstatus:\s*["'](?:pending_review|approved)["']/.test(strip(read(f))), f + " must state the status of the events it inserts");
}
// public submission and RA candidate promotion must stay NON-public
assert.ok(/\bstatus:\s*["']pending_review["']/.test(strip(read("api/submit.js"))), "public submissions are pending_review");
assert.ok(/\bstatus:\s*["']pending_review["']/.test(strip(read("scripts/ra-candidate-promotion.js"))), "RA candidate promotion is pending_review");
assert.ok(/\bstatus:\s*["']pending_review["']/.test(strip(read("scripts/press-coverage-linking.js"))), "press-coverage event creation is pending_review");
console.log(`PASS: the ${EXPECTED_DIRECT.length} direct event writers are the reviewed set and each states its status`);

// ---- 3. every connector that writes through the shared upsert maps a status --
const connectors = fs.readdirSync(path.join(root, "api")).filter((f) => /^cron-.*\.js$/.test(f))
  .filter((f) => /upsertEventRows/.test(strip(read("api/" + f))));
assert.ok(connectors.length >= 25, "expected the connectors, found " + connectors.length);
for (const f of connectors) {
  const src = strip(read("api/" + f));
  const sets = /\bstatus:\s*[^,\n}]+/.test(src) && /rowsWithStatus|withStatus|status:\s*[^,\n}]*(?:DEFAULT_STATUS|existing|derived)/.test(src);
  const gated = /applyPublicationGate\(/.test(src);
  assert.ok(sets || gated, f + " writes events through the shared upsert without stating a status (it would inherit the database default)");
}
console.log(`PASS: all ${connectors.length} ingestion connectors state a status (their trust tier or the publication gate)`);

console.log("\nAll events-status-default checks passed.");
