// test/seasonal-final-acceptance.test.js — owner acceptance of the 76 eligible destinations (2026-10-12).
// Editorial acceptance is recorded and kept distinct from publication approval. Nothing is approved or public, the 124 held
// records and the 37 discovered leads stay out, owner-verified destinations are included, temporary closures are advisories
// (they do not exclude a destination), and a record approved in memory would publish exactly the previewed content.
"use strict";
const AUTHZ = require("./fixtures/seasonal-release-authorization.js");
const assert = require("assert");
const crypto = require("crypto");
const path = require("path");
const root = path.join(__dirname, "..");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const E = ED.entries();
const L1 = ED.read("launch-1.json").collections;
const X = ED.read("launch-expansion.json").collections;
const DISC = ED.read("discovered-destinations.json").collections;
const QA = { fall: ED.read("fall-qa.json"), "fall-color": ED.read("fall-color-qa.json") };

const inSet = (col) => new Set([].concat(L1[col], X[col]));
const counts = { fall: inSet("fall").size, "fall-color": inSet("fall-color").size };
assert.deepStrictEqual(counts, { fall: 36, "fall-color": 40 }, "36 + 40 = 76 accepted (batch 1; batch 2 is checked in seasonal-release-batch-2.test.js)");

// ---- acceptance is recorded, approval is not
for (const col of ["fall", "fall-color"]) for (const id of inSet(col)) {
  const e = E[col].find((x) => x.id === id);
  assert.ok(e.editorialAccepted && e.editorialAccepted.by && e.editorialAccepted.at === "2026-10-12", id + ": editorial acceptance recorded");
  assert.ok(/not (a )?publication approval/i.test(e.editorialAccepted.scope), id + ": acceptance says it is not approval");
  assert.deepStrictEqual(e.approval, AUTHZ.AUTH, id + ": carries exactly the authorized approval (recorded separately from the editorial acceptance)");
  assert.ok(ED.COLLECTIONS.isPublic(e), id + ": public once approved");
  assert.strictEqual(ED.review(e).state, "PUBLISHED", id);
  assert.ok(/^https:\/\//.test(e.website), id + ": retains an https official source URL");
  // A card shows a labelled illustration, the owner-authorized photograph credited to its photographer, or an openly
  // licensed photograph (author, license and license URL recorded; credit names the author, license and Wikimedia Commons).
  const licensed = (e.image.illustrative === false && !e.image.ownerPhoto && !!e.image.license && /^https:\/\//.test(e.image.licenseUrl || "") && !!e.image.rightsVerifiedAt);
  // An owner-authorized photograph either names its photographer (a real credit line is shown on the card) or is from
  // the owner's own archive, in which case render.js's OWNER_CREDIT pattern suppresses the credit line entirely.
  const ownerCredited = e.image.ownerPhoto && /^(Photography © .+|313\.events archive)$/.test(e.image.credit || "");
  assert.ok(e.image.illustrative === true ? e.image.provenance.label === "Illustrative image"
    : licensed ? /^Photo: .+, (CC0|CC BY(-SA)? \d\.\d|Public domain), via Wikimedia Commons$/.test(e.image.credit) && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(e.image.commons.filePage)
    : ownerCredited, id + ": labelled illustration, licensed photograph or credited photograph");
}
// ---- held and leads stay out
for (const col of ["fall", "fall-color"]) {
  const held = E[col].filter((e) => !inSet(col).has(e.id));
  assert.strictEqual(held.length, col === "fall" ? 34 : 89, col + ": held records");
  for (const e of held) assert.ok(!e.editorialAccepted, e.id + ": held records carry no acceptance");
  const ids = new Set(E[col].map((e) => e.id));
  for (const d of DISC[col]) assert.ok(!ids.has(d.ledger_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")), d.ledger_name + " stays a lead");
}
const all = E.fall.concat(E["fall-color"]);
assert.strictEqual(all.filter((e) => e.approval).length, 79, "Fall approvals only on the 76 batch-1 + 3 batch-2 records");
assert.strictEqual(all.filter((e) => ED.COLLECTIONS.isPublic(e)).length, 79, "only the 79 Fall records (76 + 3) are public");
// Halloween has its own, later owner approval (2026-10-11): 45 records, exactly AUTH_HALLOWEEN; 3 excluded carry none.
assert.strictEqual(E.halloween.filter((e) => e.approval).length, 41, "41 Halloween approvals");
E.halloween.filter((e) => e.approval).forEach((e) => assert.deepStrictEqual(e.approval, AUTHZ.AUTH_HALLOWEEN, e.id));
assert.deepStrictEqual(E.halloween.filter((e) => ED.COLLECTIONS.isPublic(e)).map((e) => e.id).sort(), AUTHZ.HALLOWEEN_PUBLISHED, "the pinned 25 Halloween records are public");

// ---- the original 15 are unchanged (name, city, description, link, image, credit, Don't Miss)
// Re-pinned 2026-10-12 with owner approval (photography batch 1, commit 5813bfec): franklin-cider-mill and plymouth-orchards-and-cider-mill
// changed image.src and image.credit only (openly licensed Commons photographs). Pin before: ceabe4d5...
const sig = [];
for (const col of ["fall", "fall-color"]) for (const id of L1[col]) { const e = E[col].find((x) => x.id === id); sig.push([id, e.name, e.city, e.summary, e.website, e.image.src, e.image.credit || "", e.featured].join("|")); }
// Re-pinned again 2026-10-12 with owner approval (photography batch 2): belle-isle-park and cranbrook-gardens-and-grounds changed
// image.src and image.credit only (openly licensed Commons photographs). Pin before: 0ecb0c8e...
// Re-pinned 2026-10-13 with owner authorization (project thread, Wiard's Country Fair photo integration): wiards-orchards
// changed image.src and image.credit only, replacing the temporary AI-generated illustration with an owner-authorized
// original photograph. Pin before: b7a9e7b4...
assert.strictEqual(crypto.createHash("sha256").update(sig.join("\n")).digest("hex"), "0d1f75bf4d83d5745891e098bbe35409c813c1b7331b131ed344fe9ff10f3ae7", "the original 15 records are unchanged");

// ---- owner-verified destinations are included
const FALL = ["kackleberry-farms", "erie-orchards-and-cider-mill", "parshallville-cider-mill", "nixon-farms-blast-corn-maze", "gust-brothers-pumpkin-farm"];
const COLOR = ["hudson-mills-metropark", "hines-drive-edward-n-hines-parkway", "maybury-state-park", "seven-lakes-state-park", "waterloo-state-recreation-area", "huron-river-drive", "macomb-orchard-trail", "old-us-12-corridor", "grosse-ile-nature-and-land-conservancy-preserves"];
for (const id of FALL) { assert.ok(inSet("fall").has(id), id + " included"); assert.ok(E.fall.find((e) => e.id === id).ownerVerification, id + " owner verification recorded"); }
for (const id of COLOR) { assert.ok(inSet("fall-color").has(id), id + " included"); assert.ok(E["fall-color"].find((e) => e.id === id).ownerVerification, id + " owner verification recorded"); }
const sum = (c, id) => E[c].find((e) => e.id === id).summary;
assert.ok(/Sunday/.test(sum("fall", "parshallville-cider-mill")), "Parshallville keeps the Sunday music");
const gi = sum("fall-color", "grosse-ile-nature-and-land-conservancy-preserves");
for (const p of ["Gibraltar Bay Natural Area", "Dr. Bruce D. Jones Preserve", "Sunrise Park"]) assert.ok(gi.includes(p), "Grosse Ile names " + p);
assert.ok(/not all open to the public/.test(gi), "Grosse Ile does not imply every parcel is open");
const us = sum("fall-color", "old-us-12-corridor");
assert.ok(/Chelsea/.test(us) && /Ann Arbor/.test(us) && /Ypsilanti/.test(us) && !/210/.test(us), "Old US-12 keeps the scenic segment only");

// ---- temporary closures are advisories, not exclusions
const hines = E["fall-color"].find((e) => e.id === "hines-drive-edward-n-hines-parkway");
const mac = E["fall-color"].find((e) => e.id === "macomb-orchard-trail");
const adv = (e) => e.accessAdvisories.advisories;
assert.ok(adv(hines).some((a) => a.type === "long-term-closure" && /Newburgh Road and Wayne Road/.test(a.scope) && /MDOT/.test(a.reason)), "Hines long-term closure recorded");
assert.ok(adv(hines).some((a) => a.status === "ended" && /Ann Arbor Trail and Outer Drive/.test(a.scope)), "Hines October 10 closure recorded as ended");
assert.ok(adv(hines).some((a) => a.type === "lane-restriction" && /Merriman/.test(a.scope)), "Merriman Road restriction recorded");
assert.ok(!adv(hines).some((a) => /reopen/i.test(a.reopening || "") && /\d{4}/.test(a.reopening || "")), "no unsupported Hines reopening date");
assert.ok(adv(mac).some((a) => a.type === "partial-closure" && /fall 2026/.test(a.reopening) && /no exact date/.test(a.reopening)), "Macomb partial closure recorded without a date");
assert.ok(!/closed|reopen/i.test(hines.summary + " " + mac.summary), "cards do not claim the whole destination is closed or reopened");
for (const e of [hines, mac]) assert.ok(inSet("fall-color").has(e.id) && ED.review(e).state === "PUBLISHED", e.id + " stays in the set");

// ---- public parity: a record approved in memory publishes exactly the previewed card content, with no QA data
for (const col of ["fall", "fall-color"]) for (const id of inSet(col)) {
  const e = JSON.parse(JSON.stringify(E[col].find((x) => x.id === id)));
  assert.ok(ED.COLLECTIONS.isPublic(e), id + ": passes the gate with its recorded approval");
  const pub = ED.publicEntry(e), rec = QA[col].records.find((r) => r.id === id), o = rec.image_options[0];
  assert.deepStrictEqual([pub.name, pub.city, pub.region, pub.summary, pub.website, pub.featured, pub.categories], [rec.name, rec.city, rec.region, rec.summary, rec.website, rec.featured === undefined ? pub.featured : rec.featured, rec.categories], id + ": public card matches the preview record");
  assert.strictEqual(pub.image.src, o.src, id + ": same image");
  assert.strictEqual(pub.image.illustrative, !!o.illustrative);
  assert.strictEqual(pub.image.credit || null, o.illustrative ? null : o.credit);
  const text = JSON.stringify(pub);
  for (const k of ["editorialAccepted", "ownerVerification", "accessAdvisories", "evidence", "approval", "provenance", "editorialNotes", "313p-", "sha256", "checkedBy"]) assert.ok(!text.includes(k), id + ": public projection leaks " + k);
}
console.log("seasonal final acceptance: ok");
