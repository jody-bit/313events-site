"use strict";
// api/_lib/seasonal-editorial/editorial.js — PRIVATE editorial helpers for the seasonal collections.
// Node only. Never served: api/_lib is not routable and this folder is not a static path.
//
// The destination records live in entries.json (all of them, published or not). seasonal/published-entries.js is the
// only public projection, and it is generated from here by scripts/build-seasonal.js.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = __dirname;
const ROOT = path.join(DIR, "..", "..", "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));
const COLLECTIONS = require(path.join(ROOT, "seasonal", "collections.js"));

// Dimensions of a WebP file read from its header (VP8, VP8L or VP8X). Returns null if it is not a WebP.
function webpSize(buf) {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const t = buf.toString("ascii", 12, 16);
  if (t === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (t === "VP8L") { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
  if (t === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  return null;
}

// The facts about an owner-archive photo that can be computed from the real file in the repo: size, sha256, pixels.
function fileFacts(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const dim = webpSize(buf);
  return { bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"), width: dim && dim.width, height: dim && dim.height };
}

function libraryPhoto(photoId) {
  const lib = read("photo-library.json");
  return lib.destination_specific.concat(lib.editorial_atmospheric).find((p) => p.id === photoId) || null;
}

// The image block for an owner-authorized archive photo (gate items 3 and 4, owner route). Everything that can be
// computed is computed from the file and the private photo library. The authorization text is the library's own
// wording, verbatim. Nothing here names a license URL, because owner authorization is not a Creative Commons license,
// and nothing here grants publication approval (gate item 5).
//   opts.acquiredAt / verifiedAt  YYYY-MM-DD the file was recorded / the hash was computed
//   opts.verifiedBy               who or what computed the hash
//   opts.recordedBy / recordedAt  who recorded the owner authorization in the repo, and when
function ownerPhotoImage(photoId, opts) {
  const p = libraryPhoto(photoId);
  if (!p) throw new Error("no photo " + photoId + " in photo-library.json");
  const f = fileFacts(p.files.card);
  return {
    src: p.files.card,
    source: "313.events owner photo archive" + (p.capture_date ? ", captured " + p.capture_date : ""),
    credit: p.credit,
    illustrative: false,
    acquired: { file: p.files.card, bytes: f.bytes, sha256: f.sha256, width: f.width, height: f.height, acquiredAt: opts.acquiredAt },
    ownerPhoto: {
      photoId: p.id,
      reviewRef: p.review_ref,
      authorization: {
        statement: p.license,
        grantee: "313.events owner",
        recordedBy: opts.recordedBy,
        recordedAt: opts.recordedAt,
        note: "The photographer's name and the date of the grant are not recorded in the photo library."
      },
      verifiedAt: opts.verifiedAt,
      verifiedBy: opts.verifiedBy
    }
  };
}

// Every record, as authored (a fresh deep copy each call).
function entries() { return JSON.parse(JSON.stringify(read("entries.json"))); }

// The public COLLECTIONS metadata with EVERY record attached (for QA builders and tests). Not for public use.
function allCollections() {
  const e = entries(), out = {};
  for (const slug of COLLECTIONS.ORDER) out[slug] = Object.assign({}, COLLECTIONS.COLLECTIONS[slug], { entries: e[slug] || [] });
  return out;
}

// The public projection: entries that are declared and derived PUBLISHED, and nothing else.
function publishedProjection() {
  const e = entries(), out = {};
  for (const slug of COLLECTIONS.ORDER) out[slug] = (e[slug] || []).filter(COLLECTIONS.isPublic);
  return out;
}

// What an entry still needs, in words, from the same pure gate the public page uses. `outstanding` blocks publication;
// `caveats` are true statements a reviewer must not lose sight of, even for an entry that passes the gate.
function review(e) {
  const r = COLLECTIONS.readiness(e), g = r.gate, im = e.image || {};
  const outstanding = [], caveats = [];
  if (!g.official) outstanding.push("Gate 1, official-source verification: no official-site read is recorded (evidence level \"official\" with url, date and reviewer).");
  if (!g.relevance) outstanding.push("Gate 2, relevance to the collection: not confirmed (needs a note, date and reviewer).");
  if (!g.acquired || !g.rights) {
    if (im.illustrative === true && !im.remote) outstanding.push("Gate 3/4, image: the current image is a generated illustrative card, which cannot satisfy the image or rights items. A real image with recorded rights is needed (acquired file, owner photo, or linked image).");
    else if (!g.acquired) outstanding.push("Gate 3, image: no complete acquired file or linked-image record.");
    else outstanding.push("Gate 4, image rights: not complete for the chosen image route.");
  }
  if (!g.approval) outstanding.push("Gate 5, explicit publication approval: not recorded. Only the approving person adds approval {by, at}.");
  if (g.rightsRoute === "linked-risk-acceptance") caveats.push("Image rights: the owner's recorded acceptance of the copyright risk is NOT confirmed usage rights. No rights-holder permission is on file.");
  if (g.rightsRoute === "owner-authorization") caveats.push("Image rights: owner authorization (statement in the photo library). The photographer's name and the date of the grant are not recorded. This is not a Creative Commons license and there is no license URL.");
  if (im.remote && im.remote.src) caveats.push("A linked image depends on the source site continuing to serve it; the generated card is the fallback.");
  if (g.rightsRoute === "labelled-illustration-exception") caveats.push("Image: a labelled illustration (owner exception 2026-10-12). The card shows \"Illustrative image\" and is not a photograph of the destination. This is not image rights clearance and not publication approval.");
  if (e.migration) caveats.push("Was status \"published\" on " + e.migration.legacyBranch + " (" + e.migration.legacyCommit + ") on " + e.migration.legacyBasis + ". Not grandfathered.");
  return { id: e.id, name: e.name, declared: e.status, state: r.state, gate: g, outstanding, caveats, imageRoute: g.imageRoute, rightsRoute: g.rightsRoute };
}

module.exports = { review, read, entries, allCollections, publishedProjection, ownerPhotoImage, libraryPhoto, fileFacts, webpSize, ROOT, DIR, COLLECTIONS };
