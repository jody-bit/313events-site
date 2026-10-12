#!/usr/bin/env node
// scripts/apply-halloween-release.js
//
// Records the owner's Halloween 2026 approval (owner message "HALLOWEEN 2026 OWNER APPROVAL": all 52 destinations approved for
// inclusion in THE DARK ORBIT; approval dated 2026-10-11) in the private editorial data, using the verified facts in
// api/_lib/seasonal-editorial/halloween-release-1.json (taken from HALLOWEEN_2026_VERIFICATION_AND_APPROVAL_SHEET.xlsx).
//
// What it does, per record (all 52 are kept; none is deleted or reordered):
//   - applies the documented factual corrections (summary, name, city, categories, official website);
//   - records the official-page evidence and the relevance confirmation where the sheet verified 2026 operation;
//   - records the public access advisories the sheet documents (Greenfield Village sold out; Zoo Boo);
//   - records the owner's editorial acceptance and approval {by: Jody Tyree, at: 2026-10-11} on the 49 records to be published;
//   - records `disposition` on the three duplicate/closed records (owner's final decision: excluded from public display, kept in the
//     inventory with their history, no publication approval);
//   - sets the declared status to the status the publication gate derives. A record is PUBLISHED only if it passes EVERY
//     gate item: official 2026 evidence, relevance, identity, an authorized image route with rights, and the approval.
// It never touches fall or fall-color, never changes an image route or an image-rights record, and never invents a date,
// hour, price, ticket status or address. Idempotent.
//   node scripts/apply-halloween-release.js          write
//   node scripts/apply-halloween-release.js --check  exit 1 if entries.json is not exactly what this script produces
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const E_DIR = path.join(root, "api/_lib/seasonal-editorial");
const C = require("../seasonal/collections.js");

const ENTRIES = path.join(E_DIR, "entries.json");
const DATA = JSON.parse(fs.readFileSync(path.join(E_DIR, "halloween-release-1.json"), "utf8"));
const all = JSON.parse(fs.readFileSync(ENTRIES, "utf8"));

const OWNER = "Jody Tyree";
const APPROVED_AT = "2026-10-11";          // the date the owner stated for the approval
const READ_AT = "2026-10-12";              // the date the official pages were read
const READ_BY = "Claude (Cowork session), read via web fetch";
const SCOPE = "Owner approval of 2026-10-11 for inclusion of this destination in THE DARK ORBIT (Halloween 2026 release, batch halloween-release-1). " +
  "It does not waive the publication gate: the record is public only if official 2026 evidence, relevance, identity, an authorized image route with rights and this approval are all recorded. " +
  "Linked images rest on the owner's recorded risk acceptance, not on a license from the rights holder.";

function apply(e, d) {
  const o = JSON.parse(JSON.stringify(e));
  ["name", "city", "summary", "categories", "website"].forEach((k) => { if (d[k] !== undefined) o[k] = d[k]; });
  const confirmed = d.tier === "publish" || d.tier === "verified";
  if (confirmed) {
    o.evidence = o.evidence || [];
    if (!o.evidence.some((x) => x.level === "official" && x.url === d.officialUrl)) {
      o.evidence.push({
        level: "official", websiteChecked: true, url: d.officialUrl, checkedAt: READ_AT, checkedBy: READ_BY,
        note: "Official page read " + READ_AT + ". " + d.evidenceNote + (d.datesNote ? " Dates as stated: " + d.datesNote : "")
      });
    }
    if (!o.relevance) o.relevance = { confirmed: true, checkedAt: READ_AT, checkedBy: READ_BY, note: d.evidenceNote };
    if (!o.website) o.website = d.officialUrl;
  } else if (d.tier !== "excluded") {
    // Research is kept as a private note. It is deliberately NOT official evidence: it does not satisfy the gate.
    o.verificationNote = { checkedAt: READ_AT, checkedBy: READ_BY, officialUrl: d.officialUrl || null, operation: d.operation,
      note: d.evidenceNote + (d.datesNote ? " Dates: " + d.datesNote : "") };
  }
  if (d.advisory) {
    o.accessAdvisories = {
      source: "Official page read " + READ_AT + (d.officialUrl ? " (" + d.officialUrl + ")" : ""),
      doNotImply: "State only what the official page states. Do not publish prices or invent ticket availability.",
      advisories: [{ type: "ticket-notice", status: "active", note: d.advisory }],
      publicText: d.advisory,
      publicTextApproved: { by: OWNER + " (owner)", at: APPROVED_AT },
      verification: { checkedAt: READ_AT, status: "SUPPORTED_OFFICIAL_PAGE", supports: d.evidenceNote, sources: d.officialUrl ? [d.officialUrl] : [] }
    };
  }
  if (d.disposition) {
    // Owner's final editorial decision: the 52-record inventory is approved, the duplicate/closed records are excluded from public
    // display, and their records and history are preserved. They carry a disposition and NO publication approval.
    o.disposition = Object.assign({}, d.disposition, { recordedBy: OWNER + " (owner), Halloween final editorial decision; applied by editor", recordedAt: READ_AT });
    delete o.editorialAccepted; delete o.approval;
  } else {
    o.editorialAccepted = { by: OWNER + " (owner)", at: APPROVED_AT, scope: SCOPE };
    o.approval = { by: OWNER, at: APPROVED_AT };
  }
  o.status = "HOLD_UNVERIFIED";
  o.status = C.readiness(o).state;
  return o;
}

const seen = new Set();
const out = all.halloween.map((e) => {
  const d = DATA.records[e.id];
  if (!d) { console.error("no release data for " + e.id); process.exit(1); }
  seen.add(e.id);
  return apply(e, d);
});
Object.keys(DATA.records).forEach((id) => { if (!seen.has(id)) { console.error("release data for unknown record " + id); process.exit(1); } });
if (out.length !== 52) { console.error("expected 52 Halloween records, found " + out.length); process.exit(1); }

const next = Object.assign({}, all, { halloween: out });
const text = JSON.stringify(next, null, 1) + "\n";
const cur = fs.readFileSync(ENTRIES, "utf8");
if (process.argv.includes("--check")) {
  if (cur !== text) { console.error("entries.json is stale: run node scripts/apply-halloween-release.js"); process.exit(1); }
  console.log("entries.json matches the Halloween release data (52 records)."); process.exit(0);
}
fs.writeFileSync(ENTRIES, text);
const by = {}; out.forEach((e) => { by[e.status] = (by[e.status] || 0) + 1; });
console.log("Halloween records:", out.length, JSON.stringify(by));
