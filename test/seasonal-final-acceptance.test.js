// test/seasonal-final-acceptance.test.js — owner acceptance of the 76 eligible destinations (2026-10-12).
// Editorial acceptance is recorded and kept distinct from publication approval. Nothing is approved or public, the 124 held
// records and the 37 discovered leads stay out, owner-verified destinations are included, temporary closures are advisories
// (they do not exclude a destination), and a record approved in memory would publish exactly the previewed content.
"use strict";
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
assert.deepStrictEqual(counts, { fall: 36, "fall-color": 40 }, "36 + 40 = 76 accepted");

// ---- acceptance is recorded, approval is not
for (const col of ["fall", "fall-color"]) for (const id of inSet(col)) {
  const e = E[col].find((x) => x.id === id);
  assert.ok(e.editorialAccepted && e.editorialAccepted.by && e.editorialAccepted.at === "2026-10-12", id + ": editorial acceptance recorded");
  assert.ok(/not (a )?publication approval/i.test(e.editorialAccepted.scope), id + ": acceptance says it is not approval");
  assert.ok(!e.approval, id + ": no approval field");
  assert.ok(!ED.COLLECTIONS.isPublic(e), id + ": not public");
  assert.strictEqual(ED.review(e).state, "READY_FOR_REVIEW", id);
  assert.ok(/^https:\/\//.test(e.website), id + ": retains an https official source URL");
  assert.ok(e.image.illustrative === true ? e.image.provenance.label === "Illustrative image" : e.image.credit === "Photography © Miriam Vukich", id + ": labelled illustration or credited photograph");
}
// ---- held and leads stay out
for (const col of ["fall", "fall-color"]) {
  const held = E[col].filter((e) => !inSet(col).has(e.id));
  assert.strictEqual(held.length, col === "fall" ? 35 : 89, col + ": held records");
  for (const e of held) assert.ok(!e.editorialAccepted, e.id + ": held records carry no acceptance");
  const ids = new Set(E[col].map((e) => e.id));
  for (const d of DISC[col]) assert.ok(!ids.has(d.ledger_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")), d.ledger_name + " stays a lead");
}
const all = E.fall.concat(E["fall-color"], E.halloween);
assert.strictEqual(all.filter((e) => e.approval).length, 0, "no approval anywhere");
assert.strictEqual(all.filter((e) => ED.COLLECTIONS.isPublic(e)).length, 0, "nothing public");

// ---- the original 15 are unchanged (name, city, description, link, image, credit, Don't Miss)
const sig = [];
for (const col of ["fall", "fall-color"]) for (const id of L1[col]) { const e = E[col].find((x) => x.id === id); sig.push([id, e.name, e.city, e.summary, e.website, e.image.src, e.image.credit || "", e.featured].join("|")); }
assert.strictEqual(crypto.createHash("sha256").update(sig.join("\n")).digest("hex"), "ceabe4d5b09f7efb69c96d6ca66afdf3d43be70e3f0980c733010f6812170add", "the original 15 records are unchanged");

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
for (const e of [hines, mac]) assert.ok(inSet("fall-color").has(e.id) && ED.review(e).state === "READY_FOR_REVIEW", e.id + " stays in the set");

// ---- public parity: a record approved in memory publishes exactly the previewed card content, with no QA data
for (const col of ["fall", "fall-color"]) for (const id of inSet(col)) {
  const e = JSON.parse(JSON.stringify(E[col].find((x) => x.id === id)));
  e.status = "PUBLISHED"; e.approval = { by: "TEST (memory only)", at: "2026-10-12" };
  assert.ok(ED.COLLECTIONS.isPublic(e), id + ": would pass the gate once approved");
  const pub = ED.publicEntry(e), rec = QA[col].records.find((r) => r.id === id), o = rec.image_options[0];
  assert.deepStrictEqual([pub.name, pub.city, pub.region, pub.summary, pub.website, pub.featured, pub.categories], [rec.name, rec.city, rec.region, rec.summary, rec.website, rec.featured === undefined ? pub.featured : rec.featured, rec.categories], id + ": public card matches the preview record");
  assert.strictEqual(pub.image.src, o.src, id + ": same image");
  assert.strictEqual(pub.image.illustrative, !!o.illustrative);
  assert.strictEqual(pub.image.credit || null, o.illustrative ? null : o.credit);
  const text = JSON.stringify(pub);
  for (const k of ["editorialAccepted", "ownerVerification", "accessAdvisories", "evidence", "approval", "provenance", "editorialNotes", "313p-", "sha256", "checkedBy"]) assert.ok(!text.includes(k), id + ": public projection leaks " + k);
}
console.log("seasonal final acceptance: ok");
