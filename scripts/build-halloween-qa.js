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
const DATA = require("../seasonal/collections.js");
// Unpublished editorial data lives in api/_lib (never a static path, never routable).
const E_DIR = "api/_lib/seasonal-editorial";
const candPath = path.join(root, E_DIR, "candidates.json");
const outPath = path.join(root, E_DIR, "halloween-qa.json");
const lib = JSON.parse(fs.readFileSync(path.join(root, E_DIR, "photo-library.json"), "utf8"));
const reg = JSON.parse(fs.readFileSync(candPath, "utf8"));
const pub = Object.fromEntries(DATA.published(DATA.COLLECTIONS.halloween).map((e) => [e.id, e]));

const slug = (s) => s.toLowerCase().replace(/[’']/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Categories come only from the inventory section / note. Published entries keep theirs.
const BY_SECTION = {
  "Haunted Houses, Scream Parks & Horror Attractions": ["haunted-attractions", "serious-scares"],
  "Haunted Trails, Woods, Hayrides & Corn Mazes": ["haunted-attractions"],
  "Family-Friendly Halloween Attractions": ["family-friendly"],
  "Independent Home Haunts & Community Attractions": ["haunted-attractions"],
  "Ghost Tours & Haunted History": ["ghosts-history"]
};
const BY_NO = {
  26: ["haunted-attractions"], 27: ["haunted-attractions"], 28: ["ghosts-history"], 29: ["ghosts-history"], 30: ["ghosts-history"], 31: ["ghosts-history"],
  33: ["family-friendly"], 34: ["strange-unusual"], 36: ["strange-unusual"], 37: ["strange-unusual"],
  48: ["strange-unusual"], 49: ["strange-unusual"]
};
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
  const warnings = ["Linked image: not verified to load or rights-cleared"].concat(l.warnings, official ? [] : ["Not from the destination's own site"]);
  return { id: "link-" + l.destination_id + (n ? "-" + n : ""), type: official ? "linked_official" : "linked_third_party", src: l.image_link,
    source: (official ? "Official page: " : "Third-party page: ") + l.source_page, credit: l.credit,
    rights_status: "not cleared: linked from " + l.found_via + " on " + l.found_on + "; permission not confirmed",
    illustrative: false, depicts_actual_destination: official && !l.warnings.some((w) => /generic|generated|not independently/i.test(w)), warnings };
}
const photos = Object.fromEntries(lib.destination_specific.concat(lib.editorial_atmospheric).map((p) => [p.id, p]));
const art = (n) => ({ id: "gen-halloween-" + n, type: "generated_illustrative", src: "/assets/seasonal/halloween-card-" + n + ".webp",
  source: "313.events supplied Halloween graphic (AI-generated), cropped", credit: "313.events", rights_status: "supplied by 313.events; generation tool and terms not recorded",
  illustrative: true, depicts_actual_destination: false, warnings: [] });
function photoOpt(p, type) {
  const warn = [].concat(p.editorial_flags || [], p.quality_flags || []);
  return { id: p.id, type, src: p.files.card, source: "313.events owner photo archive" + (p.capture_date ? ", captured " + p.capture_date : ""),
    credit: p.credit, rights_status: p.license, illustrative: false, depicts_actual_destination: type === "owner_photo_destination",
    subject: p.subject, warnings: warn };
}
const rank = (o) => o.warnings.length * 10 + (o.warnings.some((w) => /person|very dark|upscaled|may be a different/i.test(w)) ? 5 : 0);

const rows = reg.candidates.filter((c) => c.collection === "halloween");
const outRecords = [];
let artIdx = {};
for (const c of rows) {
  const e = c.published_id ? pub[c.published_id] : null;
  const m = /^(.*), ([A-Z]{2})$/.exec(c.location);
  const city = m ? m[1] : c.location, region = m ? m[2] : "";
  const categories = e ? e.categories : (BY_NO[c.inventory_no] || BY_SECTION[c.section] || ["haunted-attractions"]);
  const id = e ? e.id : slug(c.name);
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
  // Existing public choice is preserved: a published entry keeps the photo/art it already uses.
  const links = (linked[id] || []).map((l, i) => linkedOpt(l, i));
  let options = dest.concat(links, gens, atm);
  let primary;
  const clean = dest.find((o) => o.warnings.length === 0);
  if (e && e.image.photoId) primary = e.image.photoId;
  else if (clean) primary = clean.id;
  else if (e) primary = null; // published with generated art: resolved below
  if (!primary) {
    // Flagged destination photos (identifiable person, upscaled frame, very dark) are not defaulted: owner decides in QA.
    const usable = dest.find((o) => !o.warnings.some((w) => /person|very dark|may be a different/i.test(w)));
    primary = usable ? usable.id : null;
  }
  // Priority 2: a linked image from the destination's own site, only when it is not flagged as generic/generated/unconfirmed.
  if (!primary) { const l = links.find((o) => o.type === "linked_official" && o.depicts_actual_destination && o.warnings.length === 1); if (l) primary = l.id; }
  if (!primary && e && !e.image.photoId && !dest.length) { const m2 = /halloween-card-(\d)/.exec(e.image.src); if (m2) { const g = art(+m2[1]); if (!options.some((o) => o.id === g.id)) options.unshift(g); primary = g.id; } }
  if (!primary) primary = gens[0].id;
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
    editorial_approval_status: "not_approved"
  };
  c.image_manifest = manifest;
  c.categories = categories; c.destination_id = id;

  outRecords.push({
    id, inventory_no: c.inventory_no, name: c.name, city, region, categories,
    summary: e ? e.summary : c.inventory_note, summary_source: e ? "published" : "inventory_note",
    website: e && e.website ? e.website : null,
    dates_hours: null,
    verification: { status: e ? "partial" : "unverified", official_site_checked: false,
      detail: e ? "Identity and location from inventory plus independent web coverage; official site not checked." : "Inventory candidate only; official site not reachable during research.",
      flags },
    public: !!e,
    manifest, image_options: options
  });
}
const out = { generated: "2026-10-11", note: "QA-only dataset. Served by /api/seasonal-qa outside production only. Not for public display.", count: outRecords.length, records: outRecords };
const regText = JSON.stringify(reg, null, 1) + "\n", outText = JSON.stringify(out, null, 1) + "\n";
if (process.argv.includes("--check")) {
  const stale = [];
  if (fs.readFileSync(candPath, "utf8") !== regText) stale.push(E_DIR + "/candidates.json");
  if (!fs.existsSync(outPath) || fs.readFileSync(outPath, "utf8") !== outText) stale.push(E_DIR + "/halloween-qa.json");
  if (stale.length) { console.error("stale: " + stale.join(", ")); process.exit(1); }
} else { fs.writeFileSync(candPath, regText); fs.writeFileSync(outPath, outText); }
