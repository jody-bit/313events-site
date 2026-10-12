#!/usr/bin/env node
// scripts/build-release-batch.js
//
// Prepares the seasonal release batch for the owner's final authorization (owner direction 2026-10-12): the 76 editorially
// accepted destinations (Fall Is On. 36, Fall Colors 40) as ONE batch. It writes two private files:
//   api/_lib/seasonal-editorial/RELEASE_BATCH_1.json   machine-readable batch: ids, gate state, exact public card, proposed action
//   api/_lib/seasonal-editorial/RELEASE_BATCH_1.md     the same for a reader
// It NEVER writes an `approval`, never changes a record and never publishes. For each record it simulates the approval IN
// MEMORY to prove the record would pass the gate and to show the exact public card. Only the approving person adds
// `approval {by, at}` to a record.
//   node scripts/build-release-batch.js          write
//   node scripts/build-release-batch.js --check  exit 1 if stale
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const E_DIR = path.join(root, "api/_lib/seasonal-editorial");
const ED = require("../api/_lib/seasonal-editorial/editorial.js");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(E_DIR, f), "utf8"));
const L1 = rd("launch-1.json").collections, X = rd("launch-expansion.json").collections;
const E = ED.entries();
const C = ED.COLLECTIONS;
const BATCH = "seasonal-release-1";
// The owner's authorization message (2026-10-12): approve all 76 records of this batch, approved by Jody Tyree on 2026-10-12.
const AUTH = { by: "Jody Tyree", at: "2026-10-12" };

const records = [];
const problems = [];
for (const col of ["fall", "fall-color"]) {
  for (const id of [].concat(L1[col], X[col])) {
    const e = E[col].find((x) => x.id === id);
    if (!e) { problems.push(col + "/" + id + ": missing"); continue; }
    const rv = ED.review(e);
    if (e.approval) {
      // Applied batch: the approval must be the authorized one and the record must now be public.
      if (!(e.approval.by === AUTH.by && e.approval.at === AUTH.at)) problems.push(id + ": approval is not the authorized one");
      if (rv.state !== "PUBLISHED" || !C.isPublic(e)) problems.push(id + ": approved but not public (state " + rv.state + ")");
    } else if (rv.state !== "READY_FOR_REVIEW") problems.push(id + ": state " + rv.state);
    if (!e.editorialAccepted) problems.push(id + ": no editorial acceptance");
    // approval simulated in memory only
    const sim = JSON.parse(JSON.stringify(e)); if (!e.approval) { sim.status = "PUBLISHED"; sim.approval = { by: "(approver)", at: "2026-01-01" }; }
    if (!C.isPublic(sim)) problems.push(id + ": would not pass the gate once approved");
    const card = ED.publicEntry(sim);
    records.push({ collection: col, id, name: e.name, original15: L1[col].includes(id), currentStatus: e.status, gate: rv.state, imageRoute: rv.imageRoute,
      editorialAcceptedAt: e.editorialAccepted && e.editorialAccepted.at, publicCard: card });
  }
}
if (problems.length) { console.error("release batch cannot be prepared:\n  " + problems.join("\n  ")); process.exit(1); }

const APPLIED = records.every((r) => E[r.collection].find((x) => x.id === r.id).approval);
const counts = { fall: records.filter((r) => r.collection === "fall").length, "fall-color": records.filter((r) => r.collection === "fall-color").length };
const batch = {
  batch: BATCH, status: APPLIED ? "APPLIED. The owner authorized this batch on 2026-10-12; approval {by: Jody Tyree, at: 2026-10-12} is recorded on all 76 records. Nothing is merged or deployed." : "PREPARED. NOT APPLIED. No approval is recorded and nothing is published.",
  counts: { total: records.length, fall: counts.fall, "fall-color": counts["fall-color"], original15: records.filter((r) => r.original15).length },
  excluded: { held: (E.fall.length - counts.fall) + (E["fall-color"].length - counts["fall-color"]), discoveredLeads: Object.values(rd("discovered-destinations.json").collections).reduce((n, a) => n + a.length, 0) },
  action: {
    authorizedBy: "the approving person (Jody Tyree)",
    wording: "AUTHORIZE PUBLICATION APPROVAL: batch seasonal-release-1, all 76 records, approved by <name> on <YYYY-MM-DD>.",
    steps: [
      "For each of the 76 ids below, add approval {by: <name>, at: <YYYY-MM-DD>} to the record in entries.json and set status to PUBLISHED. Nothing else on the record changes.",
      "Run node scripts/build-seasonal.js (writes seasonal/published-entries.js and the three pages) and the full test suite.",
      "Commit and push to integration/halloween-consolidation; check CI and the Preview's public /fall and /fall-color without QA parameters.",
      "Merging to main and the production deploy are separate authorizations."
    ],
    note: "Nothing in this repository writes `approval`. The proposed approval is not stored on any record until the approving person's authorization is given."
  },
  records
};
const text = JSON.stringify(batch, null, 1) + "\n";

const md = [];
md.push("# Seasonal release batch 1: publication approval records (" + (APPLIED ? "applied 2026-10-12" : "prepared, not applied") + ")");
md.push("");
md.push("Generated by `node scripts/build-release-batch.js` from the private records. Private: not served. " + (APPLIED ? "**Applied.** The owner's authorization of 2026-10-12 (approved by Jody Tyree) is recorded as `approval {by, at}` on all 76 records. Merging to main and the production deploy are not authorized." : "**Nothing is approved and nothing is published.**") + " This file never writes an `approval`.");
md.push("");
md.push("| | Fall Is On. | Fall Colors | Total |\n|---|---|---|---|");
md.push(`| Records in this batch (all editorially accepted, all READY_FOR_REVIEW) | ${counts.fall} | ${counts["fall-color"]} | ${records.length} |`);
md.push(`| of which the original 15 | ${records.filter((r) => r.original15 && r.collection === "fall").length} | ${records.filter((r) => r.original15 && r.collection === "fall-color").length} | ${batch.counts.original15} |`);
md.push(`| Excluded: held records | | | ${batch.excluded.held} |`);
md.push(`| Excluded: discovered research leads | | | ${batch.excluded.discoveredLeads} |`);
md.push("");
md.push("## " + (APPLIED ? "The authorization that was applied" : "The exact approval action"));
md.push("");
md.push((APPLIED ? "Authorized by the owner: **" : "Reply with: **") + batch.action.wording + (APPLIED ? "** (approved by Jody Tyree on 2026-10-12)." : "**"));
md.push("");
batch.action.steps.forEach((s, i) => md.push((i + 1) + ". " + s));
md.push("");
md.push("## Each record: gate state and the card that would publish");
md.push("");
md.push("Every record below passes all five gate items once the approval is added. Advisory text appears only where shown.\n");
md.push("| # | Collection | Destination | Location | Card description | Official link | Image | Advisory | Don't Miss |\n|---|---|---|---|---|---|---|---|---|");
const cell = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\s+/g, " ");
records.forEach((r, i) => {
  const c = r.publicCard;
  const img = c.image.illustrative ? "Illustrative image (temporary illustration)" : "Photograph, " + c.image.credit;
  md.push(`| ${i + 1} | ${r.collection === "fall" ? "Fall Is On." : "Fall Colors"} | ${cell(c.name)} | ${cell(c.city + ", " + c.region)} | ${cell(c.summary)} | ${c.website} | ${img} | ${cell(c.advisory || "")} | ${c.featured ? "yes" : "no"} |`);
});
md.push("");
const mdText = md.join("\n") + "\n";

const files = [[path.join(E_DIR, "RELEASE_BATCH_1.json"), text], [path.join(E_DIR, "RELEASE_BATCH_1.md"), mdText]];
if (process.argv.includes("--check")) {
  const stale = files.filter(([f, t]) => !fs.existsSync(f) || fs.readFileSync(f, "utf8") !== t).map(([f]) => path.basename(f));
  if (stale.length) { console.error("stale: " + stale.join(", ")); process.exit(1); }
} else files.forEach(([f, t]) => fs.writeFileSync(f, t));
console.log(JSON.stringify(batch.counts));
