#!/usr/bin/env node
// scripts/build-seasonal-qa.js
//
// Derives the QA-only datasets for /fall?qa=1 and /fall-color?qa=1:
//   api/_lib/seasonal-editorial/fall-qa.json
//   api/_lib/seasonal-editorial/fall-color-qa.json
// from the private records (entries.json) and the ledger (candidates.json). Served only by /api/seasonal-qa outside
// production. Idempotent. No network. It never writes entries.json, candidates.json or defaults.json, and nothing here
// can mark a record approved: `public` is the gate's own answer.
//   node scripts/build-seasonal-qa.js          write
//   node scripts/build-seasonal-qa.js --check  exit 1 if stale
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const ED = require("../api/_lib/seasonal-editorial/editorial.js");
const E_DIR = "api/_lib/seasonal-editorial";
const SLUGS = ["fall", "fall-color"];
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, E_DIR, f), "utf8"));
const lib = readJson("photo-library.json");
const photos = Object.fromEntries(lib.destination_specific.concat(lib.editorial_atmospheric).map((p) => [p.id, p]));
const cands = readJson("candidates.json").candidates;
const all = ED.entries();

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; } };
const NUM = (src) => (/-card-(\d+)\.webp$/.exec(src || "") || [])[1];

function generatedOpt(slug, src) {
  const n = NUM(src);
  return { id: "gen-" + slug + "-" + n, type: "generated_illustrative", src, source: "313.events supplied collection graphic (AI-generated), cropped", credit: "313.events",
    rights_status: "supplied by 313.events; generation tool and terms not recorded", illustrative: true, depicts_actual_destination: false, warnings: [], image_kind: "generated-artwork" };
}
function linkedOpt(e) {
  const r = e.image.remote, site = host(e.website), official = !!site && host(r.sourcePage) === site || (!!site && host(r.sourcePage).endsWith("." + site));
  const generic = /not specifically|generic|not from the (mill|destination)/i.test(r.note || "");
  return { id: "link-" + e.id, type: official ? "linked_official" : "linked_third_party", src: r.src,
    source: (official ? "Official page: " : "Third-party page: ") + r.sourcePage, credit: r.credit,
    rights_status: "not cleared: linked image; permission not confirmed",
    illustrative: false, depicts_actual_destination: official && !generic,
    warnings: ["Linked image: not load-tested in this dataset; rights not cleared, no permission on file"].concat(official ? [] : ["Not from the destination's own site"], r.note ? [r.note] : []),
    image_kind: "unclassified", source_type: official ? "official" : "third-party", permission_on_file: false,
    risk_acceptance: r.acceptedBy ? { accepted_by: r.acceptedBy, accepted_at: r.acceptedAt, note: r.riskNote } : null, load_check: null, catalogue_note: null };
}
function ownerOpt(p, type, extra) {
  return { id: p.id, type, src: p.files.card, source: "313.events owner photo archive" + (p.capture_date ? ", captured " + p.capture_date : ""), credit: p.credit,
    rights_status: p.license, illustrative: false, depicts_actual_destination: type === "owner_photo_destination", subject: p.subject,
    warnings: (extra || []).concat(p.editorial_flags || [], p.quality_flags || []), image_kind: "photo", rights_basis: "owner-authorization", license_url: null };
}

function build(slug) {
  const rows = cands.filter((c) => c.collection === slug);
  const byEntry = Object.fromEntries(rows.filter((c) => c.entry_id).map((c) => [c.entry_id, c]));
  const records = all[slug].map((e) => {
    const c = byEntry[e.id];
    if (!c) throw new Error(slug + ": no ledger row for " + e.id);
    const rv = ED.review(e), g = rv.gate, im = e.image;
    const m = /^(.*), ([A-Z]{2})$/.exec(c.location);
    const options = [];
    const seen = new Set();
    const add = (o) => { if (o && !seen.has(o.id)) { seen.add(o.id); options.push(o); } };
    // Default = what the public renderer would show first for this record: owner photo, else linked image, else the generated card.
    if (im.ownerPhoto && photos[im.ownerPhoto.photoId]) add(ownerOpt(photos[im.ownerPhoto.photoId], "owner_photo_destination"));
    if (im.remote && im.remote.src) add(linkedOpt(e));
    [im.src].concat(im.alternates || []).filter((s) => /-card-\d+\.webp$/.test(s)).forEach((s) => add(generatedOpt(slug, s)));
    (c.photos || []).forEach((pid) => { if (photos[pid]) add(ownerOpt(photos[pid], "owner_photo_destination")); });
    const gens = options.filter((o) => o.illustrative);
    const def = options[0];
    const official = (e.evidence || []).filter((x) => x.level === "official");
    return {
      id: e.id, inventory_no: c.inventory_no || "—", name: e.name, city: m ? m[1] : c.location, region: m ? m[2] : "", categories: e.categories,
      summary: e.summary, summary_source: e.migration ? "published" : "inventory_note", website: e.website || null, official_site: e.website || null, dates_hours: null,
      verification: { status: (e.migration || g.official) ? "partial" : "unverified", official_site_checked: g.official,
        detail: g.official ? "Official site read " + official[0].checkedAt + " (" + official[0].checkedBy + "). " + (g.relevance ? "Relevance confirmed. " : "Relevance to the collection not confirmed. ") + "Dates and hours not verified."
          : e.migration ? "Identity and location from inventory plus independent web coverage; official site not checked." : "Inventory candidate only; official site not read.",
        flags: (c.flags || []).slice() },
      public: ED.COLLECTIONS.isPublic(e),
      publication: { declared_status: e.status, state: rv.state, gate: { official: g.official, relevance: g.relevance, identity: g.identity, image: g.acquired, rights: g.rights, approval: g.approval },
        image_route: g.imageRoute, rights_route: g.rightsRoute, outstanding: rv.outstanding, caveats: rv.caveats,
        legacy: e.migration ? { was_published_on: e.migration.legacyBranch + " " + e.migration.legacyCommit, basis: e.migration.legacyBasis } : null },
      recorded_alternatives: [],
      manifest: { destination_id: e.id, destination_name: e.name, primary_image: def.src, primary_image_type: def.type, fallback_image: (gens[0] || def).src,
        secondary_fallback_image: (gens[1] || gens[0] || def).src, alternative_images: options.slice(1).map((o) => o.id), editorial_approval_status: "not_approved" },
      image_options: options
    };
  });
  const without = rows.filter((c) => !c.entry_id).map((c) => ({ no: c.inventory_no || "", name: c.name, location: c.location, status: c.status, owner_photos: (c.photos || []).length }));
  return { generated: "2026-10-11", collection: slug, count: records.length,
    note: "QA-only dataset. Served by /api/seasonal-qa outside production only. Not for public display. Defaults follow the record (owner photo, then linked image, then generated card). A linked image's recorded risk acceptance is not confirmed usage rights.",
    inventory_rows: rows.length, inventory_without_record: without, records };
}

const files = SLUGS.map((s) => [path.join(root, E_DIR, s + "-qa.json"), JSON.stringify(build(s), null, 1) + "\n", E_DIR + "/" + s + "-qa.json"]);
if (process.argv.includes("--check")) {
  const stale = files.filter(([p, t]) => !fs.existsSync(p) || fs.readFileSync(p, "utf8") !== t).map((f) => f[2]);
  if (stale.length) { console.error("stale: " + stale.join(", ")); process.exit(1); }
} else files.forEach(([p, t]) => fs.writeFileSync(p, t));
module.exports = { build };
