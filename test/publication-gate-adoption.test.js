// test/publication-gate-adoption.test.js — the migration ratchet.
//
// api/_lib/event-contract.js (the shared publication gate) is adopted one
// connector at a time. This test keeps that honest in both directions:
//   - a connector that writes events through upsertEventRows but is NOT on the
//     gate must be on KNOWN_UNGATED below, so a NEW connector cannot be added
//     without the gate (it would fail here until it adopts it or is listed on
//     purpose, in review);
//   - a connector that HAS adopted the gate must come off the list, so the
//     list can only shrink. Migrating a connector means deleting its line.
// It also pins the paths that are deliberately outside the gate today.
//
// Plain Node assert. Run: node test/publication-gate-adoption.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const strip = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// Connectors that write events via the shared upsert but do not yet use the gate.
const KNOWN_UNGATED = [
  "cron-bagleycommunity.js", "cron-belle-isle-nature-center.js", "cron-bigtimebingo.js", "cron-cinema-detroit.js",
  "cron-detroitmonthofdesign.js", "cron-detroittraining.js", "cron-eventbrite.js", "cron-feeds.js", "cron-gottagacha.js",
  "cron-halo.js", "cron-lagerhouse.js", "cron-localist.js", "cron-metrotimes.js", "cron-motorcitywine.js", "cron-oldmiami.js",
  "cron-outerlimitslounge.js", "cron-planetanttheatre.js", "cron-playgrounddetroit.js", "cron-poppspacking.js",
  "cron-redford-theatre.js", "cron-ticketmaster.js", "cron-trinosophes.js", "cron-visitdetroit.js", "cron-wdet.js",
];
// Gated so far (informational; asserted below so it is not just the complement).
const GATED = ["cron-dossin.js"];

const writers = fs.readdirSync(path.join(root, "api")).filter((f) => /^cron-.*\.js$/.test(f))
  .filter((f) => /upsertEventRows|event-upsert/.test(strip(read("api/" + f))));
const gated = writers.filter((f) => /require\(["']\.\/_lib\/event-contract["']\)/.test(read("api/" + f)) && /applyPublicationGate\(/.test(strip(read("api/" + f))));
const ungated = writers.filter((f) => !gated.includes(f));

assert.deepStrictEqual(gated.sort(), GATED.slice().sort(), "gated connectors changed: update GATED and remove the connector from KNOWN_UNGATED");
const unexpected = ungated.filter((f) => !KNOWN_UNGATED.includes(f));
assert.deepStrictEqual(unexpected, [], "these connectors write events without the publication gate and are not on KNOWN_UNGATED: " + unexpected.join(", "));
const stale = KNOWN_UNGATED.filter((f) => !ungated.includes(f));
assert.deepStrictEqual(stale, [], "these are on KNOWN_UNGATED but now use the gate (or no longer write events): remove them: " + stale.join(", "));
console.log(`PASS: ${gated.length} of ${writers.length} event-writing connectors are on the gate; the other ${ungated.length} are exactly the known list (it can only shrink)`);

// A gated connector must not also pick a new row's status itself.
for (const f of gated) {
  const src = strip(read("api/" + f));
  assert.ok(!/status:\s*existingStatusByExternalId\.get\(/.test(src), f + " still maps status itself");
  assert.ok(/const rowsWithStatus = gate\.rows|upsertEventRows\([^)]*gate\.rows/.test(src), f + " must write only the gate's rows");
}
console.log("PASS: a gated connector writes only the gate's rows");

// Paths outside the gate on purpose (they are human-decided or already explicit):
//   submit.js (public submission, always pending_review), admin-events.js / admin-editorial.js (a person is the decision).
assert.ok(/status:\s*"pending_review"/.test(strip(read("api/submit.js"))), "public submissions must remain explicitly pending_review");
console.log("PASS: public submission still writes an explicit pending_review (outside the gate by design)");

console.log("\nAll publication-gate adoption checks passed.");
