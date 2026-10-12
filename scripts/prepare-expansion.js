#!/usr/bin/env node
// scripts/prepare-expansion.js
//
// Expansion batch 1 (owner direction 2026-10-12): every Fall and Fall Colors record that already has an official https
// source and credible relevance evidence is prepared for owner review with a clean visitor-facing description and a
// labelled temporary illustration where no authorized photograph exists. Nothing here records a publication approval.
//
//   node scripts/prepare-expansion.js          write (entries.json, launch-expansion.json)
//   node scripts/prepare-expansion.js --check  exit 1 if stale
//
// Records in launch-1.json (the accepted 15) and the held record are never touched. Records that fail an eligibility rule
// stay in review with the reason listed in launch-expansion.json "held".
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const E_DIR = path.join(root, "api/_lib/seasonal-editorial");
const ED = require("../api/_lib/seasonal-editorial/editorial.js");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(E_DIR, f), "utf8"));
const DATE = "2026-10-12";

const entriesRaw = fs.readFileSync(path.join(E_DIR, "entries.json"), "utf8");
const entries = JSON.parse(entriesRaw);
const L1 = rd("launch-1.json");
const V = rd("launch-verification.json").collections;
const fixed = (col) => new Set((L1.collections[col] || []).concat(Object.keys((L1.held || {})[col] || {})));

// ---- visitor-facing descriptions: written by hand from facts recorded from the destinations' own or managing agencies' pages
// (launch-verification.json). No hours, dates, prices or research-note wording. A record without an entry here stays in review.
const DESC = {
  fall: {
    "yates-cider-mill": "Historic cider mill with cider, donuts, an apple tent, pony rides and a petting zoo.",
    "parmenters-northville-cider-mill": "Historic Northville cider mill selling cider and cider products, with call-ahead orders for large quantities.",
    "blakes-orchard-cider-mill": "Cider mill and orchard at Blake Farms with U-pick, a tasting room, Funland and a store and bakery.",
    "dexter-cider-mill": "Historic riverside cider mill with cinnamon doughnuts, fresh-pressed cider, caramel apples and outdoor seating along the Huron River.",
    "blakes-big-apple": "Fall farm at Blake Farms with U-pick apples and pumpkins, a corn maze, an animal farm, Funland and haunted attractions.",
    "stony-creek-orchard-and-cider-mill": "Orchard and cider mill with U-pick apples and raspberries, moonlight hayrides, a farm stand, cider and donuts.",
    "obstbaum-orchards": "Family orchard with U-pick apples when ripe, fresh-pressed cider, donuts and hayrides.",
    "westview-orchards-and-winery": "Orchard and farm market with U-pick and pre-picked pumpkins, cider, donuts, baked goods and an outdoor winery.",
    "three-cedars-farm": "Farm with a Cider Donut Hut, a country store and a Country Christmas season.",
    "kackleberry-farms": "Fall festival farm with a corn maze, slides, photo spots and cider donuts.",
    "bonadeo-farms": "Farm with a corn maze, pumpkin patch, hayrides, cider and donuts, and a haunted house on weekend evenings.",
    "alber-orchard-and-cider-mill": "Orchard and cider mill with heirloom and traditional apples, cider and hard cider, pumpkins and the Freedom Winery.",
    "blakes-backyard": "Blake Farms market, taproom and U-pick with a greenhouse, a tree nursery and fall bonfires.",
    "erie-orchards-and-cider-mill": "Orchard and cider mill with pumpkin picking, blueberry and peach picking, hayrides, donuts, cider and caramel apples.",
    "kreps-apple-barn-and-cider-mill": "Orchard and cider mill with an animal barn, a corn maze, a sunflower trail and U-cut flowers.",
    "parshallville-cider-mill": "Historic water-powered cider mill with cider, donuts, pies and baked goods, and live music on Sunday afternoons.",
    "schell-family-farm": "Family farm with pumpkins, apples, a fruit orchard and wagon rides.",
    "corn-fun": "Family farm with two corn mazes, hayrides, pick-your-own pumpkins and a sunflower and zinnia flower festival.",
    "debucks-family-farm": "Family farm with a corn maze, pumpkin fields, giant slides, jump pads and fall photo displays.",
    "flushing-farms": "Farm with three corn mazes, hay wagon and barrel train rides, a petting zoo with Highland cows, a flower field and a pumpkin shop.",
    "nixon-farms-blast-corn-maze": "Working farm with the Blast Corn Maze, a U-pick pumpkin patch, tractor-drawn hayrides and a corn cannon.",
    "trabbic-family-pumpkin-farm": "Pumpkin farm with pumpkin picking, farm animals, rides, and fresh cider and donuts.",
    "macqueen-orchards": "Orchard and cider mill with pick-your-own apples and pumpkins, a corn maze, pony rides, a petting zoo and a farm market and bakery.",
    "gust-brothers-pumpkin-farm": "Fall farm with a you-pick pumpkin patch, a corn maze, hayrides, farm animals, cider and donuts.",
    "jasons-pumpkin-patch": "Pumpkin patch with a corn maze, field trips and parties.",
    "wheeler-farms-corn-maze": "Corn maze at The Butterfly House farm, with campfires."
  },
  "fall-color": {
    "hudson-mills-metropark": "Huron-Clinton Metropark on the Huron River with a paved Hike-Bike loop, the Acorn Nature Trail and a canoe and kayak launch.",
    "belle-isle-park": "Island state park in the Detroit River with nature trails, a nature center, a conservatory, an aquarium and the Oudolf Garden.",
    "rouge-park": "Detroit's largest park, along the Rouge River with nature trails, paved walking paths, an archery range and a golf course.",
    "hines-drive-edward-n-hines-parkway": "Scenic drive along the Rouge River through Wayne County parks, with walking trails, bike paths, fishing and picnic areas.",
    "dequindre-cut-greenway": "Below-grade greenway between Eastern Market and the riverfront with separate walking and biking lanes, murals, and trees that turn colors in early October.",
    "seven-lakes-state-park": "State park of rolling hills, forest and lakes with marked hiking loops, paddling and fishing.",
    "waterloo-state-recreation-area": "The Lower Peninsula's largest state park, with lakes, hiking trails and the Eddy Discovery Center.",
    "huron-river-drive": "Winding road along the Huron River between Ann Arbor and Dexter, listed as a fall-color drive by Destination Ann Arbor and the County Road Association of Michigan.",
    "oak-openings-preserve-metropark": "Metroparks Toledo's largest park, with oak savanna, more than 70 miles of trail and the Windows on Wildlife bird-viewing area. The agency's fall color report recommends it for late-fall oak color.",
    "wildwood-preserve-metropark": "Metroparks Toledo preserve with the Manor House, a formal garden and trails across varied terrain. The agency's fall color report names it for late-fall oak color.",
    "stage-nature-center": "Nature preserve at the headwaters of the Rouge River with forest, meadow and marsh trails, including a Sugar Maple Loop.",
    "dexter-huron-metropark": "Huron-Clinton Metropark on the Huron River with a paved Hike-Bike trail, canoe and kayak access and tree-lined paths.",
    "lower-huron-metropark": "Huron-Clinton Metropark along the Huron River with a paved Hike-Bike trail, nature trails and canoe and kayak access.",
    "willow-metropark": "Huron-Clinton Metropark of mature woodlands on the Huron River, with a paved Hike-Bike loop and paddling.",
    "oakwoods-metropark": "Huron-Clinton Metropark on the Huron River with five nature trails, a nature center and a canoe and kayak trail.",
    "independence-oaks-county-park": "Oakland County park with a lake, a nature center, more than 12 miles of trails and an old-growth forest section.",
    "addison-oaks-county-park": "Oakland County park with more than 20 miles of trails, a lake loop and an old-growth forest designation.",
    "paint-creek-trail": "Rail trail between Rochester and Lake Orion, named in a published guide as a fall-color hike.",
    "macomb-orchard-trail": "Rail trail through Macomb County with tree-canopy tunnels, orchards and farms.",
    "bird-hills-nature-area": "Ann Arbor's largest natural area, with unpaved trails through hills and ravines under beech, sugar maple, oak and hickory.",
    "barton-nature-area": "Nature area along the Huron River with trails around the Barton oxbow. Destination Ann Arbor lists it for autumn color.",
    "columbus-county-park": "St. Clair County park with a nature trail through wetlands and maple forest, an equestrian trail and a lodge.",
    "wadhams-to-avoca-trail": "Rail trail in St. Clair County whose county page cites fall colors along the route, with a trestle overlook above the Mill Creek valley.",
    "grosse-ile-nature-and-land-conservancy-preserves": "Autumn walking destinations on Grosse Ile: Gibraltar Bay Natural Area, the Dr. Bruce D. Jones Preserve and Sunrise Park. The conservancy protects other properties that are not all open to the public.",
    "secor-metropark": "Metroparks Toledo park of second-growth forest, meadows and prairies, with the region's largest concentration of native dogwood. The agency's fall color report names it.",
    "pearson-metropark": "Metroparks Toledo park with remnant Great Black Swamp forest, ponds and about 15 miles of trails. The agency's fall color report names it.",
    "side-cut-metropark": "Metroparks Toledo park on the Maumee River and canal, with river views, fishing and paddling.",
    "farnsworth-metropark": "Metroparks Toledo park on the Maumee River with the Towpath Trail, river views and the Interurban Bridge ruins.",
    "holiday-beach-conservation-area": "Conservation area with trails, a boardwalk and a viewing tower, known for fall hawk migration.",
    "point-pelee-national-park": "National park of forest, marsh and lakeshore with hiking trails, and a stopover for migrating Monarch butterflies each autumn.",
    "bennett-arboretum": "Wayne County arboretum on Hines Drive with maple, oak and beech collections and a gentle unpaved walking trail.",
    "maybury-state-park": "State park of rolling hills, meadows and mature woodlands with wooded hiking paths.",
    "elmwood-cemetery": "Historic cemetery and certified arboretum with self-guided tree tours.",
    "black-oak-heritage-park": "Windsor park of old-growth black oak savanna with one public trail.",
    "old-us-12-corridor": "Old US-12 scenic segment between Chelsea, Ann Arbor and Ypsilanti, on the historic Chicago Road route and listed by Destination Ann Arbor as a fall drive."
  }
};
// Official addresses differ from the inventory city for these records; the card shows the official city.
const CITY_FIX = { "oakwoods-metropark": "New Boston", "oak-openings-preserve-metropark": "Whitehouse" };
function describe(col, e) { return (DESC[col] || {})[e.id] || null; }

// ---- eligibility
const STALE = /stale|copyright 20(19|2[0-4])|2025 (season|info)|no 2026|2026 unconfirmed/i;
function reason(col, e, rv, v) {
  if (!(rv.state === "CONTENT_VERIFIED" || rv.state === "READY_FOR_REVIEW")) return "gate: " + rv.state;
  if (!/^https:\/\//.test(e.website || "")) return "no https official website";
  if ((v.flags || []).some((f) => STALE.test(f))) return "official page looks stale; 2026 operation to be confirmed";
  if ((v.flags || []).some((f) => /Outside the 75-mile|closed permanently|duplicate/i.test(f)) || v.duplicate_of) return "outside the radius, closed or a duplicate";
  if (e.relevance && e.relevance.confidence === "low") return "relevance confidence is low";
  return null;
}

// ---- illustrations: existing temporary artwork only, rotated per collection so neighbouring cards differ
const ART = { fall: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => "/assets/seasonal/fall-card-" + n + ".webp"), "fall-color": [1, 2, 3, 4, 5, 6, 7, 8].map((n) => "/assets/seasonal/fall-color-card-" + n + ".webp") };
const EXCEPTION_NOTE = "Owner direction 2026-10-12: use labelled temporary illustrations wherever authorized photography is unavailable. Shown with the visible Illustrative image label; never a photograph of the destination.";

const out = JSON.parse(JSON.stringify(entries));
const membership = { fall: [], "fall-color": [] }, held = { fall: {}, "fall-color": {} };
for (const col of ["fall", "fall-color"]) {
  let n = 0;
  for (const e of out[col]) {
    if (fixed(col).has(e.id)) continue;
    const item = V[col].find((x) => (x.ledger_name === e.name || x.ledger_name.replace(/[’]/g, "'") === e.name.replace(/[’]/g, "'")) || x.ledger_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === e.id);
    const v = (item && item.verification) || {};
    const rv = ED.review(e);
    let why = reason(col, e, rv, v);
    let desc = null;
    if (!why) { desc = describe(col, e); if (!desc) why = "no reviewed visitor description yet"; }
    if (!why && CITY_FIX[e.id]) e.city = CITY_FIX[e.id];
    if (why) { if (/^gate:/.test(why) === false || rv.state !== "HOLD_UNVERIFIED") held[col][e.id] = why; delete e.expansionCandidate; continue; }
    // photograph: only photos with a recorded photographer and commercial-use authorization; none besides the two accepted ones
    if (e.image.ownerPhoto && !(e.image.provenance && e.image.provenance.status === "RESOLVED")) {
      e.image.photoCandidate = { photoId: e.image.ownerPhoto.photoId, src: e.image.src, status: "UNRESOLVED", note: "Photographer and commercial-use scope are not confirmed, so this photograph is not used; a labelled illustration is shown instead." };
      delete e.image.ownerPhoto;
      delete e.image.acquired;
    }
    if (!e.image.ownerPhoto) {
      const src = ART[col][n++ % ART[col].length];
      const f = ED.illustrationImage(src, { alternates: ART[col].filter((a) => a !== src).slice(0, 2), acquiredAt: DATE, recordedBy: "Claude Code, recording the owner's image direction of 2026-10-12", recordedAt: DATE });
      e.image = Object.assign({}, f, e.image.photoCandidate ? { photoCandidate: e.image.photoCandidate } : {}, e.image.linkedCandidates ? { linkedCandidates: e.image.linkedCandidates } : {});
      e.image.provenance = { status: "OWNER_ACCEPTED", resolvedAt: DATE, resolvedBy: "Jody Tyree (owner direction in the project thread)", unresolved: [], label: "Illustrative image", ownerAcceptance: EXCEPTION_NOTE,
        note: "Temporary 313.events illustration with the visible Illustrative image label; not a photograph of the destination." };
    }
    e.summary = desc;
    e.featured = false;
    e.expansionCandidate = { batch: "expansion-1", note: "Prepared for owner review. Not approved. Description generated from facts read on the official page." };
    e.status = "READY_FOR_REVIEW";
    membership[col].push(e.id);
  }
}
// status derivation check: a prepared record must be READY_FOR_REVIEW with no approval
for (const col of ["fall", "fall-color"]) for (const id of membership[col]) {
  const e = out[col].find((x) => x.id === id), r = ED.COLLECTIONS.readiness(e);
  if (r.state !== "READY_FOR_REVIEW" || e.approval) { delete e.expansionCandidate; membership[col] = membership[col].filter((x) => x !== id); held[col][id] = "gate after preparation: " + r.state; e.status = r.state; }
}
const entriesText = JSON.stringify(out, null, 1) + "\n";
const batch = { batch: "expansion-1", generated: DATE, status: "PROPOSED. Nothing here is approved or published. Publication needs an explicit approval {by, at} written by the approving person (gate item 5).",
  note: "Eligible records beyond the accepted 15: official https source, credible relevance evidence, a clean description, and a labelled temporary illustration where authorized photography is unavailable. Membership is a proposal only.",
  collections: membership, held };
const batchText = JSON.stringify(batch, null, 1) + "\n";
if (process.argv.includes("--check")) {
  const stale = [];
  if (entriesRaw !== entriesText) stale.push("entries.json");
  const bp = path.join(E_DIR, "launch-expansion.json");
  if (!fs.existsSync(bp) || fs.readFileSync(bp, "utf8") !== batchText) stale.push("launch-expansion.json");
  if (stale.length) { console.error("stale: " + stale.join(", ")); process.exit(1); }
} else {
  fs.writeFileSync(path.join(E_DIR, "entries.json"), entriesText);
  fs.writeFileSync(path.join(E_DIR, "launch-expansion.json"), batchText);
}
console.log(JSON.stringify({ fall: membership.fall.length, "fall-color": membership["fall-color"].length, held: { fall: Object.keys(held.fall).length, "fall-color": Object.keys(held["fall-color"]).length } }));
