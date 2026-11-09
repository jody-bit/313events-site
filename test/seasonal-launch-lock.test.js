// test/seasonal-launch-lock.test.js — content lock for the first launch set (owner decision 2026-10-12).
// Fifteen records, none approved, image provenance resolved (photographer and illustration acceptance confirmed by the owner 2026-10-12), and visitor-facing descriptions free of research-note wording.
"use strict";
const AUTHZ = require("./fixtures/seasonal-release-authorization.js");
const assert = require("assert");
const path = require("path");
const ED = require(path.join(__dirname, "..", "api/_lib/seasonal-editorial/editorial.js"));
const L = require(path.join(__dirname, "..", "api/_lib/seasonal-editorial/launch-1.json"));
const E = ED.entries();

const ids = { fall: L.collections.fall, "fall-color": L.collections["fall-color"] };
assert.strictEqual(ids.fall.length + ids["fall-color"].length, 15);
const RESEARCH_NOTE = /\b(its|the) (official|home) (page|site)\b|\bthe site says\b|\bofficial page (says|lists|mentions|carries)\b|\bits trail description\b/i;
let photos = 0, illus = 0, licensedPhotos = 0;
for (const col of Object.keys(ids)) for (const id of ids[col]) {
  const e = E[col].find((x) => x.id === id);
  assert.ok(e, id + " exists");
  assert.deepStrictEqual(e.approval, AUTHZ.AUTH, id + ": carries the authorized approval");
  assert.ok(ED.COLLECTIONS.isPublic(e), id + ": public once approved");
  assert.ok(!RESEARCH_NOTE.test(e.summary), id + ": description has no research-note wording: " + e.summary);
  const pv = e.image.provenance;
  assert.ok(pv && pv.unresolved.length === 0, id + ": image provenance has no unresolved items");
  assert.ok(e.editorialAccepted && e.editorialAccepted.by && e.editorialAccepted.at === "2026-10-12", id + ": editorial acceptance recorded separately from the approval");
  if (e.image.ownerPhoto) {
    photos++;
    assert.strictEqual(pv.status, "RESOLVED"); assert.ok(pv.photographer, id + ": photographer recorded"); assert.strictEqual(pv.commercialUse, "authorized");
    // An owner photo either names its photographer (credit shown on the card) or is from the owner's own archive
    // (render.js's OWNER_CREDIT pattern suppresses the credit line entirely — no attribution required).
    assert.ok(/^(Photography © .+|313\.events archive)$/.test(e.image.credit || ""), id + ": photographer credit");
    assert.strictEqual(ED.publicEntry(e).image.credit, e.image.credit, id + ": credit reaches the public card");
  } else if (e.image.illustrative === false && e.image.license && /^https:\/\//.test(e.image.licenseUrl || "") && e.image.rightsVerifiedAt) {
    licensedPhotos++;
    assert.strictEqual(pv.status, "RESOLVED");
    assert.ok(/^Photo: .+, via Wikimedia Commons$/.test(ED.publicEntry(e).image.credit), id + ": license credit reaches the public card");
  } else {
    illus++;
    assert.strictEqual(e.image.illustrative, true); assert.strictEqual(pv.status, "OWNER_ACCEPTED"); assert.strictEqual(pv.label, "Illustrative image");
    assert.ok(!ED.publicEntry(e).image.credit, id + ": illustrations carry the label, not a photographer credit");
  }
}
// Re-pinned 2026-10-12 with owner approval (photography batch 2): belle-isle-park and cranbrook-gardens-and-grounds (both among the
// original 15) changed their `image` block only, from labelled illustrations to openly licensed photographs. Before: [2, 2, 11].
// Re-pinned 2026-10-13 with owner authorization (project thread, Wiard's Country Fair photo integration): wiards-orchards
// changed from a labelled illustration to an owner-authorized original photograph. Before: [2, 4, 9].
assert.deepStrictEqual([photos, licensedPhotos, illus], [3, 4, 8], "3 owner photos, 4 openly licensed photographs (Wikimedia Commons) and 8 illustrations");
const by = (c, i) => E[c].find((x) => x.id === i).summary;
assert.ok(!/u-pick apple picking|no u-pick/i.test(by("fall", "diehls-orchard-and-cider-mill")), "Diehl's carries no negative apple-picking statement");
assert.ok(/pumpkin patch/.test(by("fall", "diehls-orchard-and-cider-mill")) && /corn maze/.test(by("fall", "diehls-orchard-and-cider-mill")));
assert.ok(/forest types/.test(by("fall-color", "highland-state-recreation-area")) && !/official page/i.test(by("fall-color", "highland-state-recreation-area")));
// Held and excluded.
assert.ok(!ids.fall.includes("forever-acres-farm"));
assert.ok(![].concat(ids.fall, ids["fall-color"]).some((i) => /oak-openings/.test(i)));
console.log("seasonal launch lock: ok");
