/* seasonal/collections.js — PUBLIC collection metadata and the publication gate for the seasonal
 * collection pages (/fall, /halloween, /fall-color).
 *
 * Works in the browser (window.SeasonalCollections) and in node tests
 * (module.exports). No database, no network.
 *
 * THIS FILE HOLDS NO UNPUBLISHED RECORDS. Every destination record (published or not) lives in the private
 * editorial data, api/_lib/seasonal-editorial/entries.json. `node scripts/build-seasonal.js` copies only the entries
 * that pass the gate below into seasonal/published-entries.js, which this file reads. Today that list is empty.
 * A test fails if any entry in published-entries.js is not PUBLISHED, or if it drifts from the private data.
 *
 * PUBLICATION GATE. An entry renders publicly only when `status === "PUBLISHED"` AND
 * `readiness(entry).state === "PUBLISHED"`, i.e. every one of these is recorded on the entry itself:
 *   1. official-source verification: an `evidence` item with level "official", websiteChecked true, an https url,
 *      checkedAt (YYYY-MM-DD) and checkedBy;
 *   2. relevance to the collection confirmed: `relevance.confirmed === true` with a note, checkedAt and checkedBy;
 *   3. an image the site may show, by exactly one of these routes:
 *        a. acquired file: `image.acquired` {file, bytes, sha256, width, height, acquiredAt}, `image.src ===
 *           image.acquired.file`, not `illustrative`;
 *        b. owner photo: the same `image.acquired` record (sha256 computed from the actual file) plus `image.ownerPhoto`
 *           (see 4b);
 *        c. linked image: a complete `image.remote` (owner decision 2026-10-11; NOT a licensed file);
 *        d. labelled illustration: `illustrative: true`, `image.acquired` (hashed local card file, `image.src ===
 *           image.acquired.file`), `image.illustration` {statement, suppliedBy, recordedBy, recordedAt}, and NO
 *           `image.remote` and NO `image.ownerPhoto`. Shown with the persistent "Illustrative image" badge; it is never
 *           documentary photography of the destination;
 *   4. image rights, by exactly one of these routes:
 *        a. third-party license: `image.license`, `image.licenseUrl` (https), `image.credit`, `image.rightsVerifiedAt`.
 *           This is for Creative Commons and similar licenses. A license URL is never invented;
 *        b. owner authorization: `image.ownerPhoto` {photoId, reviewRef, authorization {statement, grantee, recordedBy,
 *           recordedAt}, verifiedAt, verifiedBy} and `image.credit`. Owner authorization is NOT a Creative Commons
 *           license and carries no license URL. The original photo identifiers (file name, Apple Photos id) stay in the
 *           private photo library and are looked up by photoId; scripts/build-seasonal.js and the tests verify that;
 *        c. linked image: recorded owner acceptance of the copyright risk. That is NOT confirmed usage rights.
 *        d. owner-supplied illustration: the recorded `image.illustration` statement (the card was supplied by the
 *           owner; the generation tool and its terms are not recorded). It says nothing about any real photograph.
 *   5. explicit publication approval: `approval` {by, at}. Only the approving person adds this; nothing in this repo
 *      writes it. The owner-photo route never satisfies item 5.
 * `status` is the ledger state the editor declares. The six states, derived by readiness():
 *   HOLD_UNVERIFIED   no official-source verification and/or relevance yet
 *   CONTENT_VERIFIED  1 + 2 complete; image work not started
 *   IMAGE_PENDING     1 + 2 complete; image started but 3 and/or 4 incomplete
 *   READY_FOR_REVIEW  1-4 complete; awaiting explicit approval (5)
 *   PUBLISHED         1-5 complete
 *   ENDED             1-5 complete (it was publishable) AND its operating season has concluded: a verified private
 *                     `season.end` + `season.endSource` and a recorded `expiryDisposition {action: "unpublish", by, at, note}`.
 *                     Never public. Keeps every gate record, the approval and its history, and can return to PUBLISHED
 *                     (EDITORIAL_EXPIRATION_PROCESS.md). Not a data-quality state: a record that fails items 1-3 is
 *                     HOLD_UNVERIFIED whatever it declares.
 * A declared status that disagrees with the derived one fails the tests, so a status can never be used to bypass the
 * gate. See api/_lib/seasonal-editorial/EDITORIAL_HANDOFF.md.
 *
 * WHAT IS NOT HERE ON PURPOSE: operating hours, admission, event dates, accessibility, coordinates, distance. None was
 * verified from an official source, so none is shown.
 *
 * `evidence.level`: "inventory+search" (identity and location from the research inventory plus independent web
 * coverage; does NOT satisfy the gate) or "official" (the destination's own site was read; gate item 1).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./published-entries.js"));
  else root.SeasonalCollections = factory(root.SeasonalPublishedEntries);
})(typeof self !== "undefined" ? self : this, function (PUBLISHED_ENTRIES) {
  "use strict";
  var ENTRIES = PUBLISHED_ENTRIES || {};
  // The generated public file holds only the display form of entries that passed the gate at build time (no evidence,
  // reviewer, authorization or approval data), so they cannot be re-derived here. Exactly those objects, by identity, are
  // shown. Anything else, including a hand-made object that merely looks like one, must pass the full gate below.
  var PROJECTED = [];
  Object.keys(ENTRIES).forEach(function (k) { (ENTRIES[k] || []).forEach(function (e) { PROJECTED.push(e); }); });

  var COLLECTIONS = {
    fall: {
      slug: "fall",
      route: "/fall",
      title: "Fall Is On.",
      titleLines: ["Fall", "Is On."],
      tagline: null,
      subtitle: "Cider mills. Pumpkin patches. Orchards. Donuts. Hayrides. Find your fall.",
      metaDescription: "Cider mills, orchards, pumpkin patches and fall farm days across the Detroit Orbit. A 313.events seasonal collection.",
      filterLabel: "What do you want to do?",
      dontMissTitle: "Don't miss this fall",
      exploreTitle: "Explore fall in the Orbit",
      discoverTitle: "Discover by experience",
      mapTitle: "Explore more of the Orbit",
      mapBlurb: "The events map shows all 313.events listings, not only this collection.",
      hero: { desktop: "/assets/seasonal/fall-hero-1600.webp", mobile: "/assets/seasonal/fall-hero-800.webp",
        alt: "", illustrative: true, objectPosition: "50% 40%" },
      categories: [
        { id: "cider-donuts", label: "Cider + Donuts", tile: "Get cider + donuts" },
        { id: "farm-experiences", label: "Farm Experiences", tile: "Explore a farm" },
        { id: "fall-festivals", label: "Fall Festivals", tile: "Make a day of it" }
      ],
      entries: ENTRIES["fall"] || []
    },

    halloween: {
      slug: "halloween",
      route: "/halloween",
      title: "The Dark Orbit",
      titleLines: ["The Dark", "Orbit"],
      tagline: "The Orbit gets dark.",
      subtitle: "Haunts. Horror. Ghosts. Oddities. Family fun. Halloween across the Detroit Orbit.",
      metaDescription: "Haunted attractions, ghost history, immersive trails and family Halloween across the Detroit Orbit. A 313.events seasonal collection.",
      filterLabel: "What kind of dark?",
      dontMissTitle: "Don't miss after dark",
      exploreTitle: "Explore the Dark Orbit",
      discoverTitle: "How dark do you want to go?",
      mapTitle: "Explore more of the Orbit",
      mapBlurb: "The events map shows all 313.events listings, not only this collection.",
      hero: { desktop: "/assets/seasonal/halloween-hero-1600.webp", mobile: "/assets/seasonal/halloween-hero-800.webp",
        alt: "", illustrative: true, objectPosition: "50% 50%" },
      categories: [
        { id: "serious-scares", label: "Serious Scares", tile: "Get scared" },
        { id: "haunted-attractions", label: "Haunted Attractions", tile: "Explore the haunted" },
        { id: "ghosts-history", label: "Ghosts + History", tile: "Walk through history" },
        { id: "family-friendly", label: "Family Friendly", tile: "Take the family" },
        { id: "strange-unusual", label: "Strange + Unusual", tile: "Try something strange" }
      ],
      entries: ENTRIES["halloween"] || []
    },

    "fall-color": {
      slug: "fall-color",
      route: "/fall-color",
      title: "Fall Colors",
      titleLines: ["Fall Colors"],
      tagline: "Chase the color.",
      subtitle: "Trails. Parks. Scenic drives. Waterfronts. Find the Detroit Orbit at peak color.",
      metaDescription: "Parks, trails, arboretums and waterfronts for fall color across the Detroit Orbit. A 313.events seasonal collection.",
      filterLabel: "How do you want to explore?",
      dontMissTitle: "Don't miss the color",
      exploreTitle: "Explore fall colors",
      discoverTitle: "How will you chase the color?",
      mapTitle: "Explore more of the Orbit",
      mapBlurb: "The events map shows all 313.events listings, not only this collection.",
      hero: { desktop: "/assets/seasonal/fall-color-hero-1600.webp", mobile: "/assets/seasonal/fall-color-hero-800.webp",
        alt: "", illustrative: true, objectPosition: "50% 50%" },
      categories: [
        { id: "parks-gardens", label: "Parks + Gardens", tile: "Visit a park" },
        { id: "trails-woods", label: "Trails + Woods", tile: "Walk under the trees" },
        { id: "waterfronts", label: "Waterfronts", tile: "Explore the waterfront" }
      ],
      entries: ENTRIES["fall-color"] || []
    }
  };

  var ORDER = ["fall", "halloween", "fall-color"];
  var CROSS = {
    fall: { label: "Fall Is On.", route: "/fall", img: "/assets/seasonal/fall-card-3.webp" },
    halloween: { label: "The Dark Orbit", route: "/halloween", img: "/assets/seasonal/halloween-card-1.webp" },
    "fall-color": { label: "Fall Colors", route: "/fall-color", img: "/assets/seasonal/fall-color-card-1.webp" }
  };

  var STATES = ["HOLD_UNVERIFIED", "CONTENT_VERIFIED", "IMAGE_PENDING", "READY_FOR_REVIEW", "PUBLISHED", "ENDED"];
  var DATE = /^\d{4}-\d{2}-\d{2}$/, HTTPS = /^https:\/\//, SHA = /^[0-9a-f]{64}$/, PHOTO_ID = /^313p-[0-9a-f]{8}(-[0-9a-z]+)?$/;
  function has(v) { return typeof v === "string" && v.trim().length > 0; }

  // Pure field checks (no file system): which gate items an entry satisfies. Each gate item reports its route
  // (gate.imageRoute / gate.rightsRoute) so reviews can show exactly what is and is not established.
  function gate(e) {
    var ev = e.evidence || [], img = e.image || {}, acq = img.acquired, rel = e.relevance, ap = e.approval;
    var official = ev.some(function (x) {
      return x && x.level === "official" && x.websiteChecked === true && HTTPS.test(x.url || "") && DATE.test(x.checkedAt || "") && has(x.checkedBy);
    });
    var relevance = !!(rel && rel.confirmed === true && has(rel.note) && DATE.test(rel.checkedAt || "") && has(rel.checkedBy));
    var identity = has(e.name) && has(e.city) && has(e.region) && has(e.summary) && !!(e.categories && e.categories.length);
    var file = !!(acq && img.illustrative !== true && has(acq.file) && img.src === acq.file && acq.bytes > 0 &&
      SHA.test(acq.sha256 || "") && acq.width > 0 && acq.height > 0 && DATE.test(acq.acquiredAt || ""));
    // Third-party license route (Creative Commons and similar). Needs a real https license URL.
    var licensed = has(img.license) && HTTPS.test(img.licenseUrl || "") && has(img.credit) && DATE.test(img.rightsVerifiedAt || "");
    // Owner-authorized photo route (B2). Establishes photo provenance and rights ONLY; it never approves publication
    // or a destination. It is not a Creative Commons license: no license URL is required or accepted as a substitute.
    var op = img.ownerPhoto, au = op && op.authorization;
    var owner = !!(op && PHOTO_ID.test(op.photoId || "") && has(op.reviewRef) && au && has(au.statement) && has(au.grantee) && has(au.recordedBy) &&
      DATE.test(au.recordedAt || "") && DATE.test(op.verifiedAt || "") && has(op.verifiedBy) && has(img.credit) && img.illustrative !== true);
    // Linked image (owner decision 2026-10-11): shown from the destination's own site with the generated card as the
    // fallback. Needs the link, its source page, a credit and the recorded owner acceptance. Recorded risk acceptance is
    // NOT confirmed usage rights; it is only the owner's decision to accept the risk.
    var rm = img.remote;
    var remote = !!(rm && HTTPS.test(rm.src || "") && HTTPS.test(rm.sourcePage || "") && has(rm.credit) && has(rm.acceptedBy) && DATE.test(rm.acceptedAt || "") && has(rm.riskNote) &&
      has(img.src) && /^\/assets\//.test(img.src));
    // Labelled illustration route (owner strategy 2026-10-11): a supplied generated card shown as an editorial
    // illustration, never as documentary photography. It needs a hashed local file, a recorded statement of who supplied it
    // and under what label, and NO linked image and NO owner-photo claim. The renderer always shows the persistent
    // "Illustrative image" badge for it. It establishes items 3 and 4 only; it never approves publication.
    var il = img.illustration;
    var illus = !!(img.illustrative === true && !rm && !op && il && has(il.statement) && has(il.suppliedBy) && has(il.recordedBy) && DATE.test(il.recordedAt || "") &&
      acq && has(acq.file) && img.src === acq.file && /^\/assets\/seasonal\/[a-z-]+-card-\d+\.webp$/.test(img.src) && acq.bytes > 0 &&
      SHA.test(acq.sha256 || "") && acq.width > 0 && acq.height > 0 && DATE.test(acq.acquiredAt || ""));
    var imageRoute = remote && !file ? "linked" : (file && owner ? "owner-photo" : (file ? "acquired-file" : (illus ? "illustration" : null)));
    var rightsRoute = illus ? "owner-supplied-illustration" : (licensed ? "third-party-license" : (owner ? "owner-authorization" : (remote ? "linked-risk-acceptance" : null)));
    var acquired = file || remote || illus;
    var rights = illus || licensed || owner || remote;
    var imageStarted = !!rm || !!op || !!il || (img.illustrative !== true && (has(img.sourcePage) || has(img.license)));
    var approval = !!(ap && has(ap.by) && DATE.test(ap.at || ""));
    // A record the editor has resolved as a duplicate of another record, or as closed, is retained in the inventory with its
    // history but is never shown: `disposition {type}` forces it out of every public state, whatever else it carries.
    var excluded = !!(e.disposition && has(e.disposition.type));
    // ENDED (owner decision 2026-10-20): a verified end date plus a recorded decision to unpublish. Private fields only.
    var se = e.season, xd = e.expiryDisposition;
    var ended = !!(se && DATE.test(se.end || "") && has(se.endSource) && xd && xd.action === "unpublish" && has(xd.by) && DATE.test(xd.at || "") && has(xd.note));
    return { ended: ended, official: official, relevance: relevance, identity: identity, acquired: acquired, rights: rights,
      imageStarted: imageStarted, approval: approval, imageRoute: imageRoute, rightsRoute: rightsRoute, excluded: excluded };
  }
  function readiness(e) {
    var g = gate(e), state;
    if (g.excluded || !(g.official && g.relevance && g.identity)) state = "HOLD_UNVERIFIED";
    else if (!(g.acquired && g.rights)) state = g.imageStarted ? "IMAGE_PENDING" : "CONTENT_VERIFIED";
    else if (!g.approval) state = "READY_FOR_REVIEW";
    else if (g.ended) state = "ENDED";
    else state = "PUBLISHED";
    return { state: state, gate: g };
  }
  // The only way an entry becomes public: declared PUBLISHED and derived PUBLISHED.
  function isPublic(e) { return !e.fixture && e.status === "PUBLISHED" && readiness(e).state === "PUBLISHED"; }
  function isShown(e) { return PROJECTED.indexOf(e) >= 0 ? (!e.fixture && e.status === "PUBLISHED") : isPublic(e); }
  function published(c) { return c.entries.filter(isShown); }
  function entriesPublic(c) { return c.entries.filter(isShown).length; }

  return { COLLECTIONS: COLLECTIONS, ORDER: ORDER, CROSS: CROSS, STATES: STATES, published: published, entriesPublic: entriesPublic,
    readiness: readiness, gate: gate, isPublic: isPublic };
});
