// The owner's authorizations. Tests use this to say exactly which records may carry an approval and which are public.
//
// 1. Batch seasonal-release-1 (2026-10-12, "AUTHORIZE PUBLICATION APPROVAL: batch seasonal-release-1, all 76 records, approved by
//    Jody Tyree on 2026-10-12"): the 76 records of RELEASE_BATCH_1.json (Fall Is On. and Fall Colors), approval AUTH. CLOSED:
//    nothing in it may change.
// 2. Halloween 2026 owner approval ("I approve all 52 destinations ... for inclusion in THE DARK ORBIT", approval dated 2026-10-11) and
//    the owner's final editorial decision (the 52-record inventory is approved; the 3 duplicate/closed records are excluded from public
//    display with their records and history preserved; the remaining 49 carry the owner's approval). Each of the 49 carries exactly
//    AUTH_HALLOWEEN; the 3 excluded carry a disposition and no approval. The approval does not waive the publication gate, so only the
//    records that also satisfy every factual and image requirement are public. That public set is pinned here, by id, independent of
//    the data: HALLOWEEN_PUBLISHED.
"use strict";
const AUTH = { by: "Jody Tyree", at: "2026-10-12" };
const AUTH_HALLOWEEN = { by: "Jody Tyree", at: "2026-10-11" };
// The seven Halloween records that pass every gate item (official 2026 evidence, relevance, identity, an authorized image route
// with rights, and the approval).
const HALLOWEEN_PUBLISHED = ["azra-chamber-of-horrors", "eloise-asylum", "glenlore-carnevil-2", "halloween-greenfield-village",
  "hallowglow-at-treerunner", "hush-haunted-attraction", "zoo-boo"];
// The three Halloween records resolved as duplicate or closed (kept in the inventory, never shown).
const HALLOWEEN_EXCLUDED = { "exit-13-haunted-house": "closed", "scarehouse-windsor-immersive-dinner": "duplicate", "windsor-essex-yard-haunt-map": "duplicate" };
// The 76 records of the closed Fall batch.
function batch76(ED) { return new Set(ED.read("RELEASE_BATCH_1.json").records.map((r) => r.collection + "/" + r.id)); }
// Every record that may be PUBLIC: the 76 plus the pinned Halloween seven.
function authorized(ED) {
  const s = batch76(ED);
  HALLOWEEN_PUBLISHED.forEach((id) => s.add("halloween/" + id));
  return s;
}
// The Halloween records the owner approved: the 52-record inventory in the release data, less the 3 excluded = 49.
function halloweenApproved(ED) { return Object.keys(ED.read("halloween-release-1.json").records).filter((id) => !HALLOWEEN_EXCLUDED[id]); }
// Assert one record: Fall and Fall Colors carry exactly AUTH iff in the 76 batch; every Halloween record carries exactly AUTH_HALLOWEEN.
function checkApproval(assert, slug, e, set) {
  const key = slug + "/" + e.id;
  if (slug === "halloween") {
    if (HALLOWEEN_EXCLUDED[e.id]) { assert.ok(!e.approval, key + ": excluded (" + HALLOWEEN_EXCLUDED[e.id] + "), no publication approval"); assert.strictEqual(e.disposition.type, HALLOWEEN_EXCLUDED[e.id], key + ": disposition"); }
    else assert.deepStrictEqual(e.approval, AUTH_HALLOWEEN, key + ": carries exactly the Halloween owner approval");
    return;
  }
  if (set.has(key)) assert.deepStrictEqual(e.approval, AUTH, key + ": carries exactly the authorized approval");
  else assert.ok(!e.approval, key + ": no approval outside the authorized batch");
}
module.exports = { AUTH, AUTH_HALLOWEEN, HALLOWEEN_PUBLISHED, HALLOWEEN_EXCLUDED, batch76, authorized, halloweenApproved, checkApproval };
