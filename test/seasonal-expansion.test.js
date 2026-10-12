// test/seasonal-expansion.test.js — expansion batch 1 (owner direction 2026-10-12): every record with an official https source and
// credible relevance evidence is prepared for owner review with a clean description and a labelled temporary illustration.
// Nothing is approved or public; held records and discovered leads are not part of the batch.
"use strict";
const AUTHZ = require("./fixtures/seasonal-release-authorization.js");
const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const E = ED.entries();
const B = ED.read("launch-expansion.json");
const L1 = ED.read("launch-1.json");
const DISC = ED.read("discovered-destinations.json").collections;

execFileSync(process.execPath, [path.join(root, "scripts/prepare-expansion.js"), "--check"]);

const RESEARCH_NOTE = /\b(its|the) (official|home) (page|site)\b|\bthe site says\b|\bofficial page (says|lists|mentions|carries)\b|\bits trail description\b/i;
const FORBIDDEN = /\b(hours?|admission|\$\d|tickets?|open now|open today|peak|wheelchair|accessible|\d{1,2}(am|pm|:\d\d)|oct(ober)?\.? \d)/i;
assert.strictEqual(B.collections.fall.length, 26);
assert.strictEqual(B.collections["fall-color"].length, 35);
for (const col of ["fall", "fall-color"]) {
  const l1 = new Set(L1.collections[col]);
  for (const id of B.collections[col]) {
    assert.ok(!l1.has(id), id + ": not a launch-1 record");
    const e = E[col].find((x) => x.id === id);
    assert.ok(e, id + " exists");
    const r = ED.review(e);
    assert.strictEqual(r.state, "PUBLISHED", id + " is published by the authorized approval");
    assert.deepStrictEqual(e.approval, AUTHZ.AUTH, id + ": carries exactly the authorized approval");
    assert.ok(ED.COLLECTIONS.isPublic(e), id + ": public");
    assert.ok(/^https:\/\//.test(e.website), id + ": https official website");
    assert.ok(e.relevance && e.relevance.confirmed && e.relevance.note && e.relevance.confidence !== "low", id + ": relevance evidence");
    assert.ok(e.summary.length > 20 && !RESEARCH_NOTE.test(e.summary) && !FORBIDDEN.test(e.summary), id + ": clean description: " + e.summary);
    assert.strictEqual(e.featured, false, id + ": expansion records do not change the Don't Miss selections");
    assert.strictEqual(r.imageRoute, "illustration", id + ": labelled illustration route");
    assert.strictEqual(e.image.illustrative, true);
    assert.ok(!e.image.ownerPhoto && !e.image.remote, id + ": no unconfirmed photograph or linked image is the card image");
    assert.strictEqual(e.image.provenance.status, "OWNER_ACCEPTED");
    assert.strictEqual(ED.publicEntry(e).image.illustrative, true);
  }
  // held records stay in review
  for (const id of Object.keys(B.held[col])) {
    const e = E[col].find((x) => x.id === id);
    assert.ok(!B.collections[col].includes(id), id + " is held, not in the batch");
    assert.notStrictEqual(ED.review(e).state, "READY_FOR_REVIEW", id + " is not ready for review");
  }
  // the accepted 15 keep their photos and credits
}
const dh = E.fall.find((e) => e.id === "diehls-orchard-and-cider-mill"), hl = E["fall-color"].find((e) => e.id === "highland-state-recreation-area");
for (const e of [dh, hl]) assert.strictEqual(ED.publicEntry(Object.assign({}, e, { status: "PUBLISHED" })).image.credit, "Photography © Miriam Vukich");
// discovered destinations are research leads, not records
const ids = new Set(E.fall.concat(E["fall-color"]).map((e) => e.id));
for (const col of ["fall", "fall-color"]) for (const d of DISC[col]) assert.ok(!ids.has(d.ledger_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")), d.ledger_name + " is not a record");
// everything else is unapproved
const all = E.fall.concat(E["fall-color"], E.halloween);
assert.strictEqual(all.filter((e) => e.approval).length, 76, "only the 76 authorized records are approved");
assert.strictEqual(all.filter((e) => ED.COLLECTIONS.isPublic(e)).length, 76);
console.log("seasonal expansion: ok");
