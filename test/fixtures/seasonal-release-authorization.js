// The owner's authorizations. Tests use this to say exactly which records may carry an approval and which are public.
//
// 1. Batch seasonal-release-1 (2026-10-12, "AUTHORIZE PUBLICATION APPROVAL: batch seasonal-release-1, all 76 records, approved by
//    Jody Tyree on 2026-10-12"): the 76 records of RELEASE_BATCH_1.json (Fall Is On. and Fall Colors), approval AUTH. CLOSED:
//    nothing in it may change.
// 2. Halloween 2026 owner approval ("I approve all 52 destinations ... for inclusion in THE DARK ORBIT", approval dated 2026-10-11) and
//    the owner's final editorial decision (the 52-record inventory is approved; the 3 duplicate/closed records are excluded from public
//    display with their records and history preserved; the remaining 49 carry the owner's approval). Each of the 49 carries exactly
//    AUTH_HALLOWEEN; the 3 excluded carry a disposition and no approval. The approval does not waive the publication gate, so only the
//    records that also satisfy every factual and image requirement are public. That public set (29) is pinned here, by id, independent of
//    the data: HALLOWEEN_PUBLISHED.
"use strict";
// 3. Batch seasonal-release-2 (2026-10-19, gate 5, "Approve all three", Jody Tyree): three records pinned HERE by id, independent of the data,
//    approval AUTH_BATCH2. DRAFT: Jody confirms these approval blocks in PR review. Batch 1 above stays CLOSED and is not changed.
const AUTH = { by: "Jody Tyree", at: "2026-10-12" };
const AUTH_BATCH2 = { by: "Jody Tyree", at: "2026-10-19" };
const BATCH2 = ["fall/goodison-cider-mill", "fall/damouni-orchards", "fall-color/kensington-metropark"];
const AUTH_HALLOWEEN = { by: "Jody Tyree", at: "2026-10-11" };
// The 21 Halloween records that pass every gate item (official 2026 evidence, relevance, identity, an authorized image route with rights, and the
// approval): the first five (the original seven less Greenfield Village and Zoo Boo, ended 2026-10-25: owner photos, or linked images on the owner's risk acceptance) plus the 16 content-verified records
// that took the owner's established "Illustrative image" route (owner direction 2026-10-12). Pinned by id, independent of the data.
const HALLOWEEN_PUBLISHED = [
  "azra-chamber-of-horrors", "blakes-haunted-attractions", "brick-or-treat-at-legoland-discovery-center", "crossroads-ghosts-goodies",
  "deranged-haunt", "distracted-haunted-house", "eloise-asylum", "erebus", "field-of-fear",
  "full-moon-manor-at-bonadeo-farms", "glenlore-carnevil-2", "halloween-stroll-at-canterbury-village", "hallowglow-at-treerunner", "hush-haunted-attraction",
  "laser-halloween", "ooky-spooky-light-show", "scarefest-scream-park",
  "slaughterhouse-adventure", "spooky-trails", "the-howling-haunted-trail-and-party", "wildwood-manor-house"
];
// The 16 that publish on the labelled-illustration route (generated artwork, "Illustrative image" label, never a photograph of the destination).
const HALLOWEEN_ILLUSTRATED = [
  "blakes-haunted-attractions", "brick-or-treat-at-legoland-discovery-center", "crossroads-ghosts-goodies",
  "deranged-haunt", "distracted-haunted-house", "erebus", "field-of-fear", "full-moon-manor-at-bonadeo-farms", "halloween-stroll-at-canterbury-village", "laser-halloween",
  "ooky-spooky-light-show", "scarefest-scream-park",
  "slaughterhouse-adventure", "spooky-trails", "the-howling-haunted-trail-and-party", "wildwood-manor-house"
];
// The eleven Halloween records resolved as duplicate, closed or ended (kept in the inventory, never shown).
// Four more ended attractions were excluded by the owner's direction of 2026-10-18 and four more (Fort Meigs, Halloween Stroll, Greenfield Village, Zoo Boo) by the owner's expiry approval of 2026-10-22 (disposition "ended", approval retired).
const HALLOWEEN_EXCLUDED = { "exit-13-haunted-house": "closed", "scarehouse-windsor-immersive-dinner": "duplicate", "windsor-essex-yard-haunt-map": "duplicate",
  "sanilac-museums-haunted-village": "ended", "spooky-janes-walk": "ended", "sandwich-town-ghost-tour": "ended", "dearborn-haunted-trail": "ended",
  "fort-meigs-garrison-ghost-walk": "ended", "halloween-stroll": "ended",
  "halloween-greenfield-village": "ended", "zoo-boo": "ended" };
// The 76 records of the closed Fall batch.
function batch76(ED) { return new Set(ED.read("RELEASE_BATCH_1.json").records.map((r) => r.collection + "/" + r.id)); }
// Every record that may be PUBLIC: the 76 plus the pinned Halloween 21.
function authorized(ED) {
  const s = batch76(ED);
  BATCH2.forEach((k) => s.add(k));
  HALLOWEEN_PUBLISHED.forEach((id) => s.add("halloween/" + id));
  return s;
}
// The Halloween records the owner approved: the 52-record inventory in the release data, less the 11 excluded = 41.
function halloweenApproved(ED) { return Object.keys(ED.read("halloween-release-1.json").records).filter((id) => !HALLOWEEN_EXCLUDED[id]); }
// Assert one record: Fall and Fall Colors carry exactly AUTH iff in the 76 batch; every Halloween record carries exactly AUTH_HALLOWEEN.
function checkApproval(assert, slug, e, set) {
  const key = slug + "/" + e.id;
  if (slug === "halloween") {
    if (HALLOWEEN_EXCLUDED[e.id]) { assert.ok(!e.approval, key + ": excluded (" + HALLOWEEN_EXCLUDED[e.id] + "), no publication approval"); assert.strictEqual(e.disposition.type, HALLOWEEN_EXCLUDED[e.id], key + ": disposition"); }
    else assert.deepStrictEqual(e.approval, AUTH_HALLOWEEN, key + ": carries exactly the Halloween owner approval");
    return;
  }
  if (BATCH2.includes(key)) assert.deepStrictEqual(e.approval, AUTH_BATCH2, key + ": carries exactly the batch-2 approval");
  else if (set.has(key)) assert.deepStrictEqual(e.approval, AUTH, key + ": carries exactly the authorized approval");
  else assert.ok(!e.approval, key + ": no approval outside the authorized batch");
}
module.exports = { AUTH, AUTH_BATCH2, BATCH2, AUTH_HALLOWEEN, HALLOWEEN_PUBLISHED, HALLOWEEN_ILLUSTRATED, HALLOWEEN_EXCLUDED, batch76, authorized, halloweenApproved, checkApproval };
