#!/usr/bin/env node
// scripts/build-halloween-release.js
//
// Writes the Halloween 2026 release batch and its reconciliation report from the private records (never the other way round):
//   api/_lib/seasonal-editorial/RELEASE_BATCH_HALLOWEEN_1.json   machine-readable: every record, its gate state, reasons, public card
//   api/_lib/seasonal-editorial/HALLOWEEN_RECONCILIATION.md      the same for Release Control
// It writes no `approval`, changes no record and publishes nothing; the publication gate decides. Exits 1 if the records contradict the
// release data (a record that is neither published, held nor excluded; an approval where there must be none; a published record
// without an image route).
//   node scripts/build-halloween-release.js          write
//   node scripts/build-halloween-release.js --check  exit 1 if stale
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const E_DIR = path.join(root, "api/_lib/seasonal-editorial");
const ED = require("../api/_lib/seasonal-editorial/editorial.js");
const C = ED.COLLECTIONS;
const REL = JSON.parse(fs.readFileSync(path.join(E_DIR, "halloween-release-1.json"), "utf8"));
const cands = JSON.parse(fs.readFileSync(path.join(E_DIR, "candidates.json"), "utf8")).candidates.filter((c) => c.collection === "halloween");
const invNo = Object.fromEntries(cands.map((c) => [c.entry_id, c.inventory_no]));
const E = ED.entries().halloween;
const APPROVAL = { by: "Jody Tyree", at: "2026-10-11" };

const IMAGE_ROUTE = {
  linked: "Linked image from the destination's own site, resting on the owner's recorded risk acceptance (not a license)",
  "owner-photo": "Owner photo with recorded owner authorization",
  "acquired-file": "Acquired file", illustration: "Labelled illustration"
};
const problems = [], rows = [];
for (const e of E) {
  const d = REL.records[e.id], rv = ED.review(e), g = rv.gate;
  const isExcluded = !!e.disposition, pub = C.isPublic(e);
  const reasons = [];
  if (isExcluded) reasons.push((e.disposition.type === "closed" ? "EXCLUDED, CLOSED: " : "EXCLUDED, DUPLICATE" + (e.disposition.of ? " of " + e.disposition.of : "") + ": ") + e.disposition.reason);
  else if (!pub) {
    if (!g.official || !g.relevance) {
      if (d.tier === "hold-indirect") reasons.push("Official 2026 operation supported only indirectly (" + d.operation + "): a person must confirm the dates or the year on the official page before it can be recorded as official evidence. " + d.evidenceNote);
      else reasons.push("No official 2026 evidence found (" + d.operation + "). " + d.evidenceNote);
    }
    if (!g.acquired || !g.rights) reasons.push("No authorized image route: the record has only a generated card with no illustration statement and no rights route. Retained until a compliant image (owner photo, license, or an owner illustration statement) is available.");
    if (!reasons.length) reasons.push("Gate state " + rv.state + "; outstanding: " + rv.outstanding.join(" "));
  }
  // contradictions
  if (!isExcluded && JSON.stringify(e.approval) !== JSON.stringify(APPROVAL)) problems.push(e.id + ": approval is not the owner's Halloween approval");
  if (isExcluded && (e.approval || pub)) problems.push(e.id + ": excluded record carries an approval or is public");
  if (pub && !(g.imageRoute && g.rightsRoute && g.official && g.relevance)) problems.push(e.id + ": public without every gate item");
  if (!pub && !isExcluded && reasons.length === 0) problems.push(e.id + ": held without a reason");
  rows.push({ id: e.id, inventoryNo: invNo[e.id] || null, name: e.name, city: e.city, state: rv.state, category: isExcluded ? "excluded" : (pub ? "published" : "held"),
    ownerApproved: !!e.approval, imageRoute: g.imageRoute, rightsRoute: g.rightsRoute, reasons, disposition: e.disposition || null,
    publicCard: pub ? ED.publicEntry(e) : null });
}
if (rows.length !== 52) problems.push("expected 52 records, found " + rows.length);
if (problems.length) { console.error("Halloween release cannot be prepared:\n  " + problems.join("\n  ")); process.exit(1); }

const published = rows.filter((r) => r.category === "published"), held = rows.filter((r) => r.category === "held"), excluded = rows.filter((r) => r.category === "excluded");
const heldBy = { noOfficial: held.filter((r) => r.reasons.some((x) => /^No official|^Official 2026 operation supported only indirectly/.test(x))), noImage: held.filter((r) => r.reasons.some((x) => /^No authorized image route/.test(x))) };
const counts = { inventory: rows.length, ownerApproved: rows.filter((r) => r.ownerApproved).length, eligiblePublished: published.length, held: held.length, excluded: excluded.length,
  heldByState: held.reduce((o, r) => { o[r.state] = (o[r.state] || 0) + 1; return o; }, {}),
  heldNoOfficial2026: heldBy.noOfficial.length, heldNoImageRoute: heldBy.noImage.length,
  heldNoOfficialAndNoImage: held.filter((r) => heldBy.noOfficial.includes(r) && heldBy.noImage.includes(r)).length,
  heldContentVerifiedAwaitingImage: held.filter((r) => r.state === "CONTENT_VERIFIED").length,
  heldIndirect: held.filter((r) => REL.records[r.id].tier === "hold-indirect").length, heldUnconfirmed: held.filter((r) => REL.records[r.id].tier === "hold-unconfirmed").length };
if (counts.inventory !== counts.eligiblePublished + counts.held + counts.excluded) { console.error("reconciliation does not add up"); process.exit(1); }

const batch = {
  batch: "halloween-release-1",
  status: "APPLIED to the branch. Owner approval of 2026-10-11 is recorded on 49 records; 3 duplicate/closed records are excluded with their history preserved. Nothing is merged or deployed.",
  counts, approval: APPROVAL, records: rows
};
const text = JSON.stringify(batch, null, 1) + "\n";

const md = [];
md.push("# Halloween 2026 reconciliation (batch halloween-release-1)");
md.push("");
md.push("Generated by `node scripts/build-halloween-release.js` from the private records. Do not edit by hand. Private: not served. It writes no approval and publishes nothing; the publication gate decides.");
md.push("");
md.push("Owner decisions applied: approval of 2026-10-11 (all 52 destinations approved for inclusion in THE DARK ORBIT) and the final editorial decision (the 3 duplicate/closed records are excluded from public display with their records and history preserved; the other 49 carry the approval). The approval does not waive the gate: a record is public only if official 2026 evidence, relevance, identity, an authorized image route with rights, and the approval are all recorded. Linked images rest on the owner's recorded risk acceptance, which is not a photography license.");
md.push("");
md.push("## Reconciliation");
md.push("");
md.push("| | Records |\n|---|---|");
md.push("| Inventory records preserved | " + counts.inventory + " |");
md.push("| Owner-approved (49 carry the approval; 3 excluded carry none) | " + counts.ownerApproved + " |");
md.push("| **Eligible and published through the gate** | **" + counts.eligiblePublished + "** |");
md.push("| Held (retained, not public) | " + counts.held + " |");
md.push("| Excluded as duplicate or closed (retained with history) | " + counts.excluded + " |");
md.push("| Check: " + counts.eligiblePublished + " + " + counts.held + " + " + counts.excluded + " | " + (counts.eligiblePublished + counts.held + counts.excluded) + " |");
md.push("");
md.push("Held, by exact reason: " + counts.heldContentVerifiedAwaitingImage + " are CONTENT_VERIFIED (2026 operation verified from the official page) and wait only for an authorized image route; " + counts.heldIndirect + " have only indirect 2026 evidence (a person must confirm dates or the year) and also have no image route; " + counts.heldUnconfirmed + " have no official 2026 evidence" + (held.filter((r) => REL.records[r.id].tier === "hold-unconfirmed" && r.imageRoute).length ? " (" + held.filter((r) => REL.records[r.id].tier === "hold-unconfirmed" && r.imageRoute).map((r) => r.name).join(", ") + " has a linked image but no 2026 evidence)" : "") + ".");
md.push("");
md.push("## Published through the gate (" + published.length + ")");
md.push("");
md.push("| Destination | Image route | Rights route | Public advisory |\n|---|---|---|---|");
for (const r of published) md.push("| " + r.name + " | " + r.imageRoute + " | " + r.rightsRoute + " | " + ((r.publicCard && r.publicCard.advisory) || "") + " |");
md.push("");
md.push("Four of these (Zoo Boo, Hush, Azra, HallowGlow) use a linked image on the owner's recorded risk acceptance. That is not a license; no rights-holder permission is on file. Each falls back to the generated card with the \"Illustrative image\" label if the link fails.");
md.push("");
md.push("## Held (" + held.length + "): exact reasons");
md.push("");
md.push("| # | Destination | State | Reason |\n|---|---|---|---|");
for (const r of held.sort((a, b) => (a.inventoryNo || 99) - (b.inventoryNo || 99))) md.push("| " + (r.inventoryNo || "") + " | " + r.name + " | " + r.state + " | " + r.reasons.join(" ").replace(/\|/g, "/") + " |");
md.push("");
md.push("## Excluded as duplicate or closed (" + excluded.length + ")");
md.push("");
md.push("| # | Record | Disposition | Reason |\n|---|---|---|---|");
for (const r of excluded) md.push("| " + (r.inventoryNo || "") + " | " + r.name + " | " + r.disposition.type + (r.disposition.of ? " of `" + r.disposition.of + "`" : "") + " | " + r.disposition.reason + " |");
md.push("");
md.push("Their records, evidence and migration history are preserved; nothing was deleted. The `disposition` field forces them out of every public state in the gate itself.");
md.push("");
const mdText = md.join("\n") + "\n";

const files = [["RELEASE_BATCH_HALLOWEEN_1.json", text], ["HALLOWEEN_RECONCILIATION.md", mdText]];
if (process.argv.includes("--check")) {
  const stale = files.filter(([f, t]) => !fs.existsSync(path.join(E_DIR, f)) || fs.readFileSync(path.join(E_DIR, f), "utf8") !== t).map(([f]) => f);
  if (stale.length) { console.error("stale: " + stale.join(", ")); process.exit(1); }
} else { files.forEach(([f, t]) => fs.writeFileSync(path.join(E_DIR, f), t)); }
console.log(JSON.stringify(counts));
