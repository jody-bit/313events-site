// test/admin-explain-remaining-gap.test.js — admin.html's explainRemainingGap()
// (2026-09-23, "enrich before hiding" follow-up).
//
// PRODUCT DECISION under test: once automated enrichment has run (see
// scripts/generic-metadata-enrichment.js), a field still missing by the
// time an event reaches admin.html already means automation tried and
// could not safely resolve it. explainRemainingGap() computes a concise
// reason code purely from data already on the event — no new columns, the
// smallest mechanism per the Product Owner's instruction.
//
// Same vm-sandbox technique as every other admin.html test in this project.
// Run: node test/admin-explain-remaining-gap.test.js
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

function buildSandbox() {
  const sandbox = { document: { getElementById: () => null }, console, fetch: undefined, alert() {}, prompt() { return ""; }, URLSearchParams, encodeURIComponent, Promise };
  vm.createContext(sandbox);
  vm.runInContext(extractMainScript(), sandbox, { filename: "admin.html (inline script)" });
  for (const name of ["loadQueue", "loadFeedQueue", "loadEditorial", "loadHidden", "loadHealthcheck", "loadVenues"]) sandbox[name] = async () => {};
  return sandbox;
}

async function run() {
  const sandbox = buildSandbox();
  assert.strictEqual(typeof sandbox.explainRemainingGap, "function", "admin.html must expose explainRemainingGap()");

  // --- 1. start time: always NO_AUTHORITATIVE_TIME, never generated/inferred. ---
  assert.strictEqual(sandbox.explainRemainingGap("start time", {}), "NO_AUTHORITATIVE_TIME");
  console.log("PASS: 'start time' always explains as NO_AUTHORITATIVE_TIME");

  // --- 2. description: defensive AI_DESCRIPTION_UNAVAILABLE label. ---
  assert.strictEqual(sandbox.explainRemainingGap("description", {}), "AI_DESCRIPTION_UNAVAILABLE");
  console.log("PASS: 'description' explains as AI_DESCRIPTION_UNAVAILABLE");

  // --- 3. venue address/city: no venue name AND no address at all -> NO_VENUE_SIGNAL
  //     (the real "Elmwood Alight" production case, confirmed live 2026-09-23). ---
  {
    const e = { venue_name_raw: null, venue_address_raw: null, venue_city_raw: null };
    assert.strictEqual(sandbox.explainRemainingGap("venue address/city", e), "NO_VENUE_SIGNAL");
  }
  console.log("PASS: no venue name and no address at all explains as NO_VENUE_SIGNAL (Elmwood Alight production case)");

  // --- 4. venue address/city: a venue name exists but nothing resolves it
  //     -> NO_CANONICAL_VENUE_DATA (the real "Big Time Bingo / Garden Bowl"
  //     production case, confirmed live 2026-09-23: no canonical venues row
  //     exists yet). ---
  {
    const e = { venue_name_raw: "Garden Bowl", venue_address_raw: null, venue_city_raw: null };
    assert.strictEqual(sandbox.explainRemainingGap("venue address/city", e), "NO_CANONICAL_VENUE_DATA");
  }
  console.log("PASS: a venue name with nothing to resolve it against explains as NO_CANONICAL_VENUE_DATA (Big Time Bingo / Garden Bowl production case)");

  // --- 5. ticket/event link: always EXTERNAL_LOOKUP_UNAVAILABLE (this
  //     project has no web-search capability, confirmed 2026-09-23). ---
  assert.strictEqual(sandbox.explainRemainingGap("ticket/event link", {}), "EXTERNAL_LOOKUP_UNAVAILABLE");
  console.log("PASS: 'ticket/event link' explains as EXTERNAL_LOOKUP_UNAVAILABLE");

  // --- 6. An unrecognized field name returns null rather than guessing at
  //     a reason. ---
  assert.strictEqual(sandbox.explainRemainingGap("some future field", {}), null);
  console.log("PASS: an unrecognized field returns null rather than a fabricated reason");

  console.log("\nAll admin.html explainRemainingGap() tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
