#!/usr/bin/env node
// scripts/build-halloween-qa.js
//
// Extends the EXISTING seasonal registry (api/_lib/seasonal-editorial/candidates.json) with an
// `image_manifest` + QA fields on every Halloween row, and derives the
// QA-only dataset api/_lib/seasonal-editorial/halloween-qa.json that /api/seasonal-qa
// serves outside production. Idempotent. No network.
//   node scripts/build-halloween-qa.js          write
//   node scripts/build-halloween-qa.js --check  exit 1 if stale
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const ED = require("../api/_lib/seasonal-editorial/editorial.js");
// Unpublished editorial data lives in api/_lib (never a static path, never routable).
const E_DIR = "api/_lib/seasonal-editorial";
const candPath = path.join(root, E_DIR, "candidates.json");
const outPath = path.join(root, E_DIR, "halloween-qa.json");
const lib = JSON.parse(fs.readFileSync(path.join(root, E_DIR, "photo-library.json"), "utf8"));
const reg = JSON.parse(fs.readFileSync(candPath, "utf8"));
// Every Halloween record (all 52, from the private entries). `public` is the gate's answer, never a flag set here.
const ent = Object.fromEntries(ED.entries().halloween.map((e) => [e.id, e]));
// Pinned default image option per destination (B7). A new option can be added and selected by a reviewer, but it
// never becomes a default unless the owner edits defaults.json.
const pins = JSON.parse(fs.readFileSync(path.join(root, E_DIR, "defaults.json"), "utf8")).defaults;

const slug = (s) => s.toLowerCase().replace(/[’']/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Categories, summaries and names come from the private entries (entries.json), which carry the inventory-derived values.
// Generated artwork: crops of the supplied Halloween graphic, assigned by theme (no new artwork).
const ART = {
  "serious-scares": [1, 4, 5], "haunted-attractions": [7, 1, 4, 5], "ghosts-history": [2, 8],
  "family-friendly": [3, 6], "strange-unusual": [5, 7, 6]
};
const ATMOS = ["313p-4e36da88", "313p-9f336786", "313p-cf666d14", "313p-98ab90f5"]; // clean, no prominent people, no foreign-city flag
const linkedFile = JSON.parse(fs.readFileSync(path.join(root, E_DIR, "linked-images.json"), "utf8"));
const linked = {};
linkedFile.images.forEach((l) => { (linked[l.destination_id] = linked[l.destination_id] || []).push(l); });
function linkedOpt(l, n) {
  const official = l.kind === "official";
  const promo = l.photo_kind === "promo-art";
  const lc = l.load_check;
  const loaded = lc && /^loaded /.test(lc.result);
  // One standard warning (kept at exactly one for a clean official photo), then specific ones.
  const warnings = [loaded
    ? "Linked image: loaded in Chrome " + lc.checkedAt + " (" + lc.result.replace(/^loaded /, "") + "); rights not cleared, no permission on file"
    : "Linked image: not verified to load or rights-cleared"].concat(l.warnings, official ? [] : ["Not from the destination's own site"],
    promo ? ["Promotional artwork, logo or illustration, not a photograph of the destination"] : []);
  return { id: "link-" + l.destination_id + (n ? "-" + n : ""), type: official ? "linked_official" : "linked_third_party", src: l.image_link,
    source: (official ? "Official page: " : "Third-party page: ") + l.source_page, credit: l.credit,
    rights_status: "not cleared: linked from " + l.found_via + " on " + l.found_on + "; permission not confirmed",
    illustrative: false, depicts_actual_destination: official && !promo && !l.warnings.some((w) => /generic|generated|not independently/i.test(w)), warnings,
    image_kind: l.photo_kind || "unclassified", source_type: l.source_type || (official ? "official" : "third-party"),
    permission_on_file: l.permission_on_file === true,
    risk_acceptance: l.accepted_by ? { accepted_by: l.accepted_by, accepted_at: l.accepted_at, note: l.risk_note } : null,
    load_check: l.load_check ? { checked_at: lc.checkedAt, method: lc.method, result: lc.result } : null,
    catalogue_note: l.catalogue_note || null };
}
// Proposed images: candidates awaiting an owner decision. Selectable in QA, no risk acceptance, never a default, never copied to a record.
function proposedOpt(l) {
  const lc = l.load_check, loaded = lc && /^loaded /.test(lc.result);
  return { id: "link-" + l.destination_id + "-" + l.proposal_id, type: "linked_official", src: l.image_link, source: "Official page: " + l.source_page, credit: l.credit,
    rights_status: "not cleared: proposal only; no rights decision recorded; permission not confirmed",
    illustrative: false, depicts_actual_destination: true,
    warnings: [loaded ? "Linked image: loaded in Chrome " + lc.checkedAt + " (" + lc.result.replace(/^loaded /, "") + "); rights not cleared, no permission on file" : "Linked image: not verified to load"].concat(l.warnings),
    image_kind: l.photo_kind || "photo", source_type: "official", permission_on_file: false, risk_acceptance: null,
    load_check: lc ? { checked_at: lc.checkedAt, method: lc.method, result: lc.result } : null, catalogue_note: l.catalogue_note || null,
    proposal: { status: "proposed, not adopted", recommended: !!l.recommended } };
}
const photos = Object.fromEntries(lib.destination_specific.concat(lib.editorial_atmospheric).map((p) => [p.id, p]));
const art = (n) => ({ id: "gen-halloween-" + n, type: "generated_illustrative", src: "/assets/seasonal/halloween-card-" + n + ".webp",
  source: "313.events supplied Halloween graphic (AI-generated), cropped", credit: "313.events", rights_status: "supplied by 313.events; generation tool and terms not recorded",
  illustrative: true, depicts_actual_destination: false, warnings: [], image_kind: "generated-artwork" });
function photoOpt(p, type) {
  const warn = [].concat(p.editorial_flags || [], p.quality_flags || []);
  return { id: p.id, type, src: p.files.card, source: "313.events owner photo archive" + (p.capture_date ? ", captured " + p.capture_date : ""),
    credit: p.credit, rights_status: p.license, illustrative: false, depicts_actual_destination: type === "owner_photo_destination",
    subject: p.subject, warnings: warn, image_kind: "photo", rights_basis: "owner-authorization", license_url: null };
}
const rank = (o) => o.warnings.length * 10 + (o.warnings.some((w) => /person|very dark|upscaled|may be a different/i.test(w)) ? 5 : 0);

// Ledger sync: every registry row that has a private entry carries its id and the gate's derived state (never hand-set).
// `published_id` is kept as the historical field (rows that were "published" on feature/halloween-completion).
{
  const all = ED.entries(), byKey = {};
  Object.keys(all).forEach((k) => all[k].forEach((e) => { byKey[k + "/" + e.id] = e; }));
  const short = (rv) => rv.outstanding.map((o) => /^Excluded/.test(o) ? "excluded (duplicate or closed)" : /^Gate (\d)/.exec(o)[1] + " " + { 1: "official verification", 2: "relevance", 3: "image", 4: "image rights", 5: "explicit approval" }[/^Gate (\d)/.exec(o)[1].slice(0, 1)]).join("; ");
  for (const c of reg.candidates) {
    const e = byKey[c.collection + "/" + (c.entry_key || c.published_id || slug(c.name))];
    if (!e) { c.status = "HOLD_UNVERIFIED"; continue; } // no private entry yet: the ledger vocabulary is the five states
    const rv = ED.review(e);
    c.entry_id = e.id; c.status = e.status;
    c.reason = "Gate state " + rv.state + (rv.outstanding.length ? ". Outstanding: " + short(rv) + "." : ". All gate items recorded.") +
      (e.migration ? " Was \"published\" on feature/halloween-completion; not grandfathered." : "");
  }
}
const rows = reg.candidates.filter((c) => c.collection === "halloween");
const outRecords = [];
let artIdx = {};
for (const c of rows) {
  const e = ent[c.entry_id] || null;
  if (!e) throw new Error("no private entry for " + c.name);
  const m = /^(.*), ([A-Z]{2})$/.exec(c.location);
  const city = m ? m[1] : c.location, region = m ? m[2] : "";
  const categories = e.categories;
  const id = e.id;
  const flags = c.flags.slice();
  if (/adults-only/i.test(c.inventory_note) && !flags.some((f) => /adults/.test(f))) flags.push("adults-only: age guidance to confirm");

  // ---- image options: destination photos (P1) -> generated (P4/P5); atmospheric only as labeled alternatives
  const dest = (c.photos || []).map((pid) => photoOpt(photos[pid], "owner_photo_destination")).sort((a, b) => rank(a) - rank(b));
  const cat0 = categories[0];
  const pool = ART[cat0] || ART["haunted-attractions"];
  artIdx[cat0] = (artIdx[cat0] || 0);
  const first = pool[artIdx[cat0]++ % pool.length];
  const gens = [first, pool[(pool.indexOf(first) + 1) % pool.length], 8].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).map(art);
  const atm = ATMOS.map((pid) => Object.assign(photoOpt(photos[pid], "owner_photo_atmospheric"), { warnings: ["Atmospheric Halloween photo: does NOT depict this destination"] }));
  // Links (the supplied catalogue plus the official-site images read on 2026-10-11) are selectable, never defaulted here.
  const links = (linked[id] || []).map((l, i) => linkedOpt(l, i));
  const props = (linkedFile.proposed_images || []).filter((l) => l.destination_id === id).map(proposedOpt);
  let options = dest.concat(links, props, gens, atm);
  // The default is PINNED (defaults.json, frozen from 7e094df). Nothing below may change it.
  const primary = pins[id];
  if (!primary) throw new Error("no pinned default for " + id);
  if (!options.some((o) => o.id === primary)) { const m2 = /^gen-halloween-(\d)$/.exec(primary); if (m2) options.unshift(art(+m2[1])); }
  if (!options.some((o) => o.id === primary)) throw new Error("pinned default " + primary + " is not an option of " + id);
  const primaryOpt = options.find((o) => o.id === primary);
  options = [primaryOpt].concat(options.filter((o) => o.id !== primary));
  const fallbackOpts = options.filter((o) => o.illustrative).filter((o) => o.id !== primary);
  const fallback = (primaryOpt.illustrative ? fallbackOpts[0] : (gens[0])) || gens[0];
  const alt = options.slice(1).filter((o) => o.type !== "owner_photo_atmospheric" || true).map((o) => o.id);

  const manifest = {
    destination_id: id, destination_name: c.name,
    primary_image: primaryOpt.src, primary_image_type: primaryOpt.type, primary_image_source: primaryOpt.source,
    primary_image_credit: primaryOpt.credit, primary_image_rights_status: primaryOpt.rights_status,
    fallback_image: fallback.src, secondary_fallback_image: (gens.find((g) => g.src !== fallback.src && g.src !== primaryOpt.src) || gens[1]).src,
    alternative_images: alt,
    image_status: primaryOpt.illustrative ? "generated_default" : primaryOpt.type.startsWith("linked") ? "linked_unverified" : (primaryOpt.warnings.length ? "owner_photo_with_flags" : "owner_photo"),
    editorial_approval_status: e.approval ? "owner_approved" : "not_approved"
  };
  c.image_manifest = manifest;
  c.categories = categories; c.destination_id = id;

  const rv = ED.review(e), g = rv.gate;
  const alts = (linkedFile.unchosen_alternatives || []).filter((u) => u.destination_id === id).map((u) => ({ image_link: u.image_link, source_page: u.source_page, loaded: u.loaded, why_not_chosen: u.why_not_chosen, selectable: false }));
  const official = (e.evidence || []).filter((x) => x.level === "official");
  outRecords.push({
    id, inventory_no: c.inventory_no, name: c.name, city, region, categories,
    summary: e.summary, summary_source: e.migration ? "published" : "inventory_note",
    website: e.migration && e.website ? e.website : null,
    official_site: e.website || null,
    dates_hours: null,
    verification: { status: (e.migration || g.official) ? "partial" : "unverified", official_site_checked: g.official,
      detail: g.official
        ? "Official site read " + official[0].checkedAt + " (" + official[0].checkedBy + "). " + (g.relevance ? "Relevance confirmed. " : "Relevance to the collection not confirmed. ") + "Dates and hours not verified."
        : e.migration ? "Identity and location from inventory plus independent web coverage; official site not checked." : "Inventory candidate only; official site not reachable during research.",
      flags },
    public: ED.COLLECTIONS.isPublic(e),
    publication: { declared_status: e.status, state: rv.state, gate: { official: g.official, relevance: g.relevance, identity: g.identity, image: g.acquired, rights: g.rights, approval: g.approval },
      image_route: g.imageRoute, rights_route: g.rightsRoute, outstanding: rv.outstanding, caveats: rv.caveats,
      legacy: e.migration ? { was_published_on: e.migration.legacyBranch + " " + e.migration.legacyCommit, basis: e.migration.legacyBasis } : null },
    recorded_alternatives: alts,
    manifest, image_options: options
  });
}
const out = { generated: "2026-10-11", note: "QA-only dataset. Served by /api/seasonal-qa outside production only. Not for public display. Defaults are pinned (defaults.json). A linked image's recorded risk acceptance is not confirmed usage rights.", count: outRecords.length, records: outRecords };
const regText = JSON.stringify(reg, null, 1) + "\n", outText = JSON.stringify(out, null, 1) + "\n";
if (process.argv.includes("--check")) {
  const stale = [];
  if (fs.readFileSync(candPath, "utf8") !== regText) stale.push(E_DIR + "/candidates.json");
  if (!fs.existsSync(outPath) || fs.readFileSync(outPath, "utf8") !== outText) stale.push(E_DIR + "/halloween-qa.json");
  if (stale.length) { console.error("stale: " + stale.join(", ")); process.exit(1); }
} else { fs.writeFileSync(candPath, regText); fs.writeFileSync(outPath, outText); }
