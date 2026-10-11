#!/usr/bin/env node
// scripts/build-approval-batch.js
//
// Generates api/_lib/seasonal-editorial/APPROVAL_BATCH_1.md: one decision packet per destination, written from the
// private records. It reads entries.json, linked-images.json and the photo library; it NEVER writes them. It cannot
// approve anything: no `approval` is created here, and a proposed image is described, not adopted.
//   node scripts/build-approval-batch.js          write
//   node scripts/build-approval-batch.js --check  exit 1 if stale
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const ED = require("../api/_lib/seasonal-editorial/editorial.js");
const C = ED.COLLECTIONS;
const E_DIR = "api/_lib/seasonal-editorial";
const OUT = path.join(root, E_DIR, "APPROVAL_BATCH_1.md");
const linkedFile = ED.read("linked-images.json");
const lib = ED.read("photo-library.json");
const ents = Object.fromEntries(ED.entries().halloween.map((e) => [e.id, e]));
const BATCH = ["halloween-greenfield-village", "zoo-boo", "crossroads-ghosts-goodies"];

const YN = (b) => (b ? "recorded" : "NOT recorded");
function gateTable(e) {
  const g = C.readiness(e).gate;
  return ["| Gate item | Status | Route / note |", "|---|---|---|",
    "| 1. Official-source verification | " + YN(g.official) + " | " + ((e.evidence || []).filter((x) => x.level === "official").map((x) => x.url + " (" + x.checkedAt + ")").join("; ") || "none") + " |",
    "| 2. Relevance to the collection | " + YN(g.relevance) + " | " + (e.relevance ? e.relevance.note : "") + " |",
    "| 3. Image | " + YN(g.acquired) + " | " + (g.imageRoute || "no complete image record (a generated card cannot satisfy this item)") + " |",
    "| 4. Image rights | " + YN(g.rights) + " | " + (g.rightsRoute || "none") + " |",
    "| 5. Explicit publication approval | " + YN(g.approval) + " | only the approving person adds it |"].join("\n");
}
// What the public file seasonal/published-entries.js would contain for this record if it were approved. Computed on a copy.
function exposure(e) {
  const copy = JSON.parse(JSON.stringify(e));
  copy.status = "PUBLISHED"; copy.approval = { by: "(approver)", at: "2026-01-01" };
  const publicRec = C.isPublic(copy) ? JSON.stringify(copy) : null;
  if (!publicRec) return null;
  const has = (s) => publicRec.indexOf(s) >= 0;
  return { bytes: publicRec.length,
    evidence: (copy.evidence || []).length, keys: Object.keys(copy),
    names: ["Jody Tyree", "Claude (Cowork session)", "riskNote", "Owner accepted the copyright risk", "apple_photos_uuid", "313p-"].filter(has) };
}
function imageBlock(e) {
  const im = e.image, out = [];
  if (im.ownerPhoto) {
    const p = ED.libraryPhoto(im.ownerPhoto.photoId);
    out.push("- **Current image (owner photo `" + im.ownerPhoto.photoId + "`)**: " + (p ? p.subject : "") + ". Captured " + (p && p.capture_date) + ". File " + im.acquired.width + "x" + im.acquired.height + ", sha256 `" + im.acquired.sha256.slice(0, 16) + "...`.");
    out.push("  - Quality flags in the library: " + ((p && (p.quality_flags || []).concat(p.editorial_flags || [])).join("; ") || "none") + ".");
    out.push("  - Rights basis: owner authorization (" + im.ownerPhoto.authorization.statement + "). " + im.ownerPhoto.authorization.note + " This is not a license and there is no license URL.");
  } else if (im.remote) {
    const lk = linkedFile.images.filter((l) => l.destination_id === e.id)[0];
    out.push("- **Current image (linked official image)**: " + im.remote.src + " (page: " + im.remote.sourcePage + "). Credit: " + im.remote.credit + ". " + (lk && lk.load_check ? "Load test " + lk.load_check.checkedAt + ": " + lk.load_check.result + "." : ""));
    out.push("  - Rights basis: your recorded acceptance of the copyright risk (" + im.remote.acceptedAt + "). **No permission from the rights holder is on file.** This is not usage rights.");
  } else out.push("- **Current image:** a generated illustrative card only. It cannot satisfy gate items 3 and 4, so this record cannot reach READY_FOR_REVIEW until a real image is chosen.");
  const lk = linkedFile.images.filter((l) => l.destination_id === e.id && !(im.remote && l.image_link === im.remote.src));
  lk.forEach((l) => out.push("- **Catalogue link on file (not adopted on this record):** " + l.image_link + ". " + (l.catalogue_note || "") + (l.warnings.length ? " Warning: " + l.warnings.join("; ") + "." : "") + " Load test: " + (l.load_check && l.load_check.result) + ". Risk acceptance recorded " + l.accepted_at + " for this link."));
  (linkedFile.proposed_images || []).filter((l) => l.destination_id === e.id).forEach((l) => out.push("- **Proposal " + l.proposal_id + (l.recommended ? " (recommended)" : "") + ", not adopted:** " + l.image_link + ". " + l.catalogue_note + " Load test " + l.load_check.checkedAt + ": " + l.load_check.result + ". " + l.warnings.join("; ") + ". **No risk acceptance is recorded for it, and none is implied by your earlier decision.**"));
  return out.join("\n");
}
function exposureBlock(e) {
  const x = exposure(e);
  if (!x) return "- (This record cannot be public until its other gate items are complete, so there is nothing to project yet.)";
  return "- The public card shows: category tags, the name (linking to the official site), city and region, the one-line summary, the image with its credit. No dates, hours, prices, availability or accessibility.\n" +
    "- **Also public, in `seasonal/published-entries.js`:** the whole record as stored (" + x.evidence + " evidence items and the migration history). It would include" +
    (x.names.length ? " these strings: " + x.names.map((n) => "`" + n + "`").join(", ") : " no names or rights notes") + ". The pages do not display them, but anyone who opens the file can read them. I recommend asking engineering to add a public-fields-only projection before the first approval; that is a decision for you, not something I changed.";
}

const PACKETS = {
  "halloween-greenfield-village": {
    why: "Official page read, relevance confirmed, an owner photo with recorded owner authorization. Only the approval is missing, so it is the first READY_FOR_REVIEW record.",
    issues: [
      "**The image is weak.** It is a frame from a 41-second video, upscaled, with visible motion blur. It shows an indoor carousel in daylight with several people, most of them partly masked. Nothing in it reads as Halloween or as Greenfield Village, and the 2020 capture date shows in the masks. Whether it is good enough for a public card is your call.",
      "**Rights record gap.** The library does not record the photographer's name or the date of the grant. The wording is \"photographer granted use to 313.events owner\". If the photographer was not you, you may want that written down before publishing.",
      "**Timing.** The official page lists 2026 dates of Oct 1-4, 8-11, 15-18 and 22-25, and says general admission and the Hallowe'en Express are sold out for 2026. The card shows no dates or availability, so a visitor could follow it to a sold-out event. The season ends Oct 25.",
      "**An official-page image is already on file** (the catalogue link under Image: the event-card pumpkins in front of the Webster Home, which loads at 1064x798 and carries your recorded risk acceptance). The catalogue itself notes it may be generated art rather than a photo of the place, the page credits no one, and I could not tell whether it is a photograph. It is not adopted on this record."
    ],
    decisions: [
      ["D1 Image", "Keep the owner photo as the card image / switch to the catalogue link (official-page image, may be generated art) / hold until a better, authentic photo exists."],
      ["D2 Rights", "Accept the owner authorization as recorded (photographer and grant date unrecorded) / ask for those details to be recorded first."],
      ["D3 Publication", "Approve this destination for publication / hold."]
    ]
  },
  "zoo-boo": {
    why: "Official page read, relevance confirmed, an official linked image with your recorded risk acceptance. Only the approval is missing.",
    issues: [
      "**No permission from the Detroit Zoo is on file** for the image. Publishing would rest on your recorded risk acceptance alone, and the link depends on the zoo continuing to serve the file. If it fails, visitors see the generated card.",
      "**Timing.** The official page says Zoo Boo returns the first four weekends in October. By that reading the last weekend is Oct 24-25, so it ends in about two weeks. The card shows no dates.",
      "The linked image is the zoo's own hero photo (a pumpkin scarecrow display), so it is authentic to the event."
    ],
    decisions: [
      ["D1 Image and rights", "Confirm the linked official image on your recorded risk acceptance for publication / request permission from the Detroit Zoo first / use the generated card (this cannot pass the gate by itself) / hold."],
      ["D2 Publication", "Approve this destination for publication / hold."]
    ]
  },
  "crossroads-ghosts-goodies": {
    why: "Official page read and relevance confirmed (CONTENT_VERIFIED). It has no real image yet, so it needs a decision on the image before an approval means anything.",
    issues: [
      "**The linked image already on file does not show Crossroads.** It is the porch-pumpkin photo (2400x1600) that the catalogue itself describes as a generic scene. I viewed it: a jack-o'-lantern on a residential walkway with a clapboard house behind. It loads, but it would present a generic image as if it were the place.",
      "**Recommended instead (proposal p1):** the main image on the official Halloween Ghosts & Goodies page, a lit jack-o'-lantern on a bench with a village street and a period building with string lights behind it, no people. It is small (480x640 portrait) and sits on the park system's staging host, so it could move.",
      "**Proposal p2:** the page's Halloween tile (1600x1600), a costumed staff member handing treats to a child on a porch. It is the most Halloween-specific, but it shows identifiable people, including a child.",
      "None of these is adopted. This record's image, rights and status are unchanged: the default is still a generated card, and `image.remote` is not set.",
      "**Timing.** The official page lists 2026 dates of Oct 3-4, 9-11, 16-18, 22-25 and 29-30. The card shows no dates."
    ],
    decisions: [
      ["D1 Image", "Choose one: the catalogue link (generic) / proposal p1 (recommended) / proposal p2 (people) / none, and look for an authentic photo or send your own. Choosing a linked image also means a recorded risk acceptance for that specific image."],
      ["D2 Publication", "Only after D1: approve this destination for publication / hold."]
    ]
  }
};

function build() {
  const L = [];
  L.push("# First editorial approval batch: Greenfield Village, Zoo Boo, Crossroads Village");
  L.push("");
  L.push("Generated by `node scripts/build-approval-batch.js` from the private records. Do not edit by hand. Private: this file is in `api/_lib/seasonal-editorial/` and is not served.");
  L.push("");
  L.push("**Nothing is approved.** Each destination below is its own decision. Approving one does not approve another, and an image decision is separate from the publication decision. This file never writes an `approval`. To approve, the approving person adds `\"approval\": {\"by\": \"<name>\", \"at\": \"YYYY-MM-DD\"}` to that record in `entries.json` (and sets `status` to the state the fields then prove). Until then every page shows its empty state.");
  L.push("");
  L.push("Recorded risk acceptance is not usage rights. No rights-holder permission is on file for any linked image.");
  L.push("");
  L.push("| Destination | State now | Still needed |");
  L.push("|---|---|---|");
  BATCH.forEach((id) => { const e = ents[id], rv = ED.review(e); L.push("| " + e.name + " | " + rv.state + " | " + rv.outstanding.map((o) => /^Gate (\d)/.exec(o)[1]).join(", ") + " |"); });
  L.push("");
  L.push("Gate items: 1 official verification, 2 relevance, 3 image, 4 image rights, 5 explicit approval.");
  BATCH.forEach((id, i) => {
    const e = ents[id], k = PACKETS[id];
    L.push("");
    L.push("## " + (i + 1) + ". " + e.name + " (`" + id + "`)");
    L.push("");
    L.push("State: **" + C.readiness(e).state + "**. " + k.why);
    L.push("");
    L.push(gateTable(e));
    L.push("");
    L.push("### Evidence read (official)");
    (e.evidence || []).filter((x) => x.level === "official").forEach((x) => L.push("- " + x.note + " Source: " + x.url + ". Read " + x.checkedAt + " (" + x.checkedBy + ")."));
    L.push("");
    L.push("### Image");
    L.push(imageBlock(e));
    L.push("");
    L.push("### What becomes public if you approve");
    L.push(exposureBlock(e));
    L.push("");
    L.push("### Things you should know");
    k.issues.forEach((t) => L.push("- " + t));
    L.push("");
    L.push("### Your decisions (each separate)");
    k.decisions.forEach(([a, b]) => L.push("- **" + a + ":** " + b));
  });
  L.push("");
  L.push("## Flagged, not in this batch: Rotten Manor (`rotten-manor`)");
  L.push("");
  const rm = ents["rotten-manor"], rl = linkedFile.images.filter((l) => l.destination_id === "rotten-manor")[0];
  L.push("State: **" + C.readiness(rm).state + "**. The official site has not been read and relevance is not confirmed. Its pinned default image is the linked file `" + rl.image_link + "` (" + rl.load_check.result + "), classified **" + rl.photo_kind + "**: promotional artwork from its own site, not a photograph of the venue and not independent evidence of the place. Your risk acceptance covers the link; no permission is on file. It stays flagged for review and is not in any approval batch until it has an official-site read and an authentic image.");
  L.push("");
  return L.join("\n") + "\n";
}
const text = build();
if (process.argv.includes("--check")) { if (!fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== text) { console.error("stale: " + E_DIR + "/APPROVAL_BATCH_1.md"); process.exit(1); } }
else fs.writeFileSync(OUT, text);
module.exports = { build };
