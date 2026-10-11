#!/usr/bin/env node
// scripts/halloween-image-manifest.js — writes seasonal/halloween-image-manifest.json: one row per Halloween
// destination (all 52) saying which image strategy it uses, where the image came from, what rights are on file,
// the runtime fallback chain, and the alternative image options that were found but not chosen.
// The manifest is derived from seasonal/collections.js (so it cannot drift from what the page renders); the
// hand-recorded parts (photo kind, load check, alternatives) live in EXTRA below.
//   node scripts/halloween-image-manifest.js          write the file
//   node scripts/halloween-image-manifest.js --check  exit 1 if the committed file is stale
"use strict";
const fs = require("fs");
const path = require("path");
const DATA = require("../seasonal/collections.js");
const root = path.join(__dirname, "..");
const OUT = path.join(root, "seasonal/halloween-image-manifest.json");
const CHECKED = "2026-10-11";

// Load check: each linked URL was loaded as an <img> in Chrome with referrerpolicy=no-referrer on 2026-10-11.
// Value is the natural size reported by the browser. (A later change in the source site is not detected here.)
const LOADED = {
  "erebus": "1440x960", "halloween-greenfield-village": "1064x798", "zoo-boo": "1920x1281", "crossroads-ghosts-goodies": "2400x1600",
  "hush-haunted-attraction": "1440x902", "azra-chamber-of-horrors": "1000x667", "rotten-manor": "1920x758", "wiards-night-terrors": "1300x886",
  "slay-nights": "1280x667", "scarefest-scream-park": "2160x1215", "blakes-haunted-attractions": "2560x1707", "deranged-haunt": "1024x576",
  "scarehouse-windsor": "800x776", "field-of-fear": "1536x1024", "dearborn-haunted-trail": "600x600", "fort-meigs-garrison-ghost-walk": "1920x1080",
  "halloween-stroll-at-canterbury-village": "1000x290", "hallowglow-at-treerunner": "1801x1200", "scarehouse-windsor-immersive-dinner": "800x776",
  "brick-or-treat-at-legoland-discovery-center": "1200x1500", "jack-o-lanterns-among-the-trees": "1200x800"
};
// What the picture shows. "photo" = a photograph of the place, event or its cast; "promo-art" = logo, title graphic,
// illustration, composite or brand promo that is not plainly a photograph of the destination.
const KIND = { "halloween-greenfield-village": "promo-art", "rotten-manor": "promo-art", "slay-nights": "promo-art", "deranged-haunt": "promo-art",
  "field-of-fear": "promo-art", "brick-or-treat-at-legoland-discovery-center": "promo-art" };
// Official = the destination's own site or its host organisation. The Erebus domain is believed to be its own site but was not confirmed.
const SOURCE_TYPE = { "erebus": "official-unconfirmed", "wiards-night-terrors": "third-party", "scarefest-scream-park": "third-party", "jack-o-lanterns-among-the-trees": "third-party" };
// Real-image options that were found and NOT chosen (kept so the owner can swap them in).
const ALT = {
  "spooky-trails": [{ src: "https://static.wixstatic.com/media/67e0ff_34abbdb250024d12b56eb73aef9abfeb~mv2.jpg", source: "https://www.spookytrails.com/", loaded: "1578x940", why: "Official site share image, but it is the Spooky Trails logo only." }],
  "the-howling-haunted-trail-and-party": [{ src: "https://static.wixstatic.com/media/5753ee_d9777a2271eb4f91ae3474b3c5457986~mv2.jpg", source: "https://www.thehowlinghauntedtrail.com/", loaded: "300x300", why: "Official site image, but it is the logo (The Howling wordmark) at 300x300." }],
  "terrorfied-forest": [
    { src: "https://static.wixstatic.com/media/38d6b4_4a8797f42c234b58a8c1111f0ca04d02f000.jpg", source: "https://www.terrorfiedforest.com/", loaded: "1920x1080", why: "Official site hero: a moonlit tangle of branches. Atmospheric but very dark and not identifiable as the trail." },
    { src: "https://static.wixstatic.com/media/38d6b4_f86301c5723c45a1a632c8795b10c1c7f000.jpg", source: "https://www.terrorfiedforest.com/", loaded: "1080x1920", why: "Official site mobile hero (portrait), almost black." }],
  "scarehouse-windsor-immersive-dinner": [{ src: "https://book.scarehousewindsor.com/og-image.png", source: "https://scarehousewindsor.com/", loaded: null, why: "Official booking-site share image (1200x630 per its meta tags); not load-tested." }],
  "slay-nights": [{ src: "https://slaynights.com/wp-content/uploads/2026/07/slay-nights-reimagined-hero.webp", source: "https://slaynights.com/", loaded: null, why: "Full-size version of the chosen hero; not load-tested." }],
  "blakes-haunted-attractions": [
    { src: "https://blakefarms.com/wp-content/uploads/2024/10/BBA_2024-Haunted-WEB-hayride-scaled.jpg", source: "https://blakefarms.com/haunted-attractions/", loaded: null, why: "Haunted hayride photo on the same official page; not load-tested." },
    { src: "https://blakefarms.com/wp-content/uploads/2024/10/BBA_2024-Haunted-WEB-barn.jpg", source: "https://blakefarms.com/haunted-attractions/", loaded: null, why: "Haunted barn photo on the same official page; not load-tested." }],
  "erebus": [{ src: "https://hauntedpontiac.com/wp-content/uploads/2018/10/FANGORIA-BANNER-ADJUSTED-V2.jpg", source: "https://www.hauntedpontiac.com/", loaded: null, why: "Press banner on the same site (2018); not load-tested." }],
  "halloween-stroll-at-canterbury-village": [{ src: "https://www.canterburyvillage.com/wp-content/uploads/2024/07/363361218_669862425175007_n.jpg", source: "https://www.canterburyvillage.com/", loaded: null, why: "Other photo on the official home page; not load-tested." }]
};
// Photos the owner approved for the real place exist on a different branch and are not in this branch's files.
const OTHER_BRANCH = { "eloise-asylum": true, "glenlore-carnevil-2": true };

function build() {
  const col = DATA.COLLECTIONS.halloween;
  const cands = JSON.parse(fs.readFileSync(path.join(root, "seasonal/candidates.json"), "utf8"));
  const rows = (Array.isArray(cands) ? cands : cands.candidates).filter((r) => r.collection === "halloween");
  const byId = {}; rows.forEach((r) => { if (r.published_id) byId[r.published_id] = r; });
  const entries = col.entries.map((e) => {
    const r = e.image.remote, cand = byId[e.id] || rows.find((x) => x.name === e.name) || {};
    const chain = (r ? [r.src] : []).concat([e.image.src], e.image.alternates || [], [e.image.placeholder]);
    const strategy = r ? (SOURCE_TYPE[e.id] === "third-party" ? "linked-third-party" : "linked-official") : "generated-artwork";
    const row = {
      id: e.id, name: e.name, inventoryNo: cand.inventory_no ? Number(cand.inventory_no) : null, city: e.city, region: e.region, status: e.status,
      strategy,
      primary: r ? {
        src: r.src, sourcePage: r.sourcePage, credit: r.credit, sourceType: SOURCE_TYPE[e.id] || "official", photoKind: KIND[e.id] || "photo",
        note: r.note || null,
        rights: { permissionOnFile: false, status: "owner-accepted risk", acceptedBy: r.acceptedBy, acceptedAt: r.acceptedAt, attribution: "Credit line and link to the source page shown on the card; hidden if the image falls back." },
        loadCheck: { checkedAt: CHECKED, method: "<img> load in Chrome, referrerpolicy=no-referrer", result: LOADED[e.id] ? "loaded " + LOADED[e.id] : "NOT CHECKED" }
      } : null,
      generatedCard: e.image.src, alternateCard: (e.image.alternates || [])[0] || null, placeholder: e.image.placeholder,
      fallbackChain: chain,
      alternativeImageOptions: (ALT[e.id] || []).map((a) => Object.assign({ kind: "real-image-not-chosen" }, a)),
      approvedPersonalPhotography: OTHER_BRANCH[e.id] ? { status: "reported on branch feature/seasonal-photography-archive; not in this branch, not verified here" } : null
    };
    return row;
  });
  const n = (f) => entries.filter(f).length;
  const summary = {
    destinations: entries.length,
    approvedPersonalPhotography: { inThisBranch: 0, reportedOnOtherBranch: n((x) => x.approvedPersonalPhotography) },
    authorizedLinkedPhotography: n((x) => x.primary && x.primary.rights.permissionOnFile === true),
    linkedImages: n((x) => x.primary),
    linkedOfficial: n((x) => x.strategy === "linked-official"),
    linkedThirdParty: n((x) => x.strategy === "linked-third-party"),
    otherAuthenticPhotography: n((x) => x.primary && x.primary.photoKind === "photo"),
    linkedPromoArtwork: n((x) => x.primary && x.primary.photoKind === "promo-art"),
    generatedArtworkOnly: n((x) => x.strategy === "generated-artwork"),
    withAlternativeGeneratedCard: n((x) => !!x.alternateCard),
    withAlternativeRealImage: n((x) => x.alternativeImageOptions.length > 0),
    brokenImages: n((x) => x.primary && !/^loaded \d+x\d+$/.test(x.primary.loadCheck.result)),
    withoutAnyWorkingStrategy: n((x) => !x.placeholder || !x.generatedCard)
  };
  return { generated: CHECKED, collection: "halloween", title: col.title,
    note: "Linked images are shown from the source site with credit and a fallback; they are NOT licensed or acquired files. The owner accepted the copyright risk on 2026-10-11 and no permission from any rights holder is on file. Apple Photos approvals could not be read from this environment, and approved personal photographs of Eloise Asylum and Glenlore are on another branch. Runtime chain: linked image -> generated card -> alternate generated card -> branded placeholder -> hidden image (no broken-image icon).",
    summary, entries };
}
module.exports = { build, OUT };
if (require.main === module) {
  const json = JSON.stringify(build(), null, 1) + "\n";
  if (process.argv.includes("--check")) { if (!fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== json) { console.error("stale: seasonal/halloween-image-manifest.json"); process.exit(1); } }
  else fs.writeFileSync(OUT, json);
}
