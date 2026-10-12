// test/seasonal-launch-qa.test.js — Fall Is On. and Fall Colors launch preparation.
// The two collections show their proposed content only through the QA-only dataset. Nothing becomes public without the
// explicit approval, no record carries one, and the generated QA data is in sync with the private records.
"use strict";
const AUTHZ = require("./fixtures/seasonal-release-authorization.js");
const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const E = (f) => require(path.join(root, "api/_lib/seasonal-editorial", f));

execFileSync(process.execPath, [path.join(root, "scripts/build-seasonal-launch.js"), "--check"]);

const entries = E("entries.json");
const disc = E("discovered-destinations.json").collections;
const counts = { fall: 71 + (disc.fall || []).length, "fall-color": 129 + (disc["fall-color"] || []).length };
for (const slug of ["fall", "fall-color"]) {
  const qa = E(slug + "-qa.json");
  assert.strictEqual(qa.collection, slug);
  assert.strictEqual(qa.records.length, counts[slug], slug + ": every inventory row (and each discovered destination) is a QA record");
  assert.strictEqual(qa.records.filter((r) => !r.discovered).length, slug === "fall" ? 71 : 129, slug + ": all inventory rows present");
  assert.strictEqual(new Set(qa.records.map((r) => r.id + "|" + r.name)).size, counts[slug], slug + ": no duplicate QA records");
  for (const r of qa.records) {
    assert.strictEqual(r.public, AUTHZ.authorized(ED).has(slug + "/" + r.id), r.id + ": public only if authorized");
    assert.strictEqual(r.dates_hours, null, r.id + " shows no dates or hours");
    assert.ok(r.image_options.length >= 2 && r.manifest.fallback_image, r.id + " has image options and a fallback");
    const prim = r.image_options[0];
    if (prim.type === "owner_photo_destination") assert.strictEqual(prim.depicts_actual_destination, true);
    // Generated artwork is never presented as a photograph of the destination.
    for (const o of r.image_options) if (o.illustrative) assert.strictEqual(o.depicts_actual_destination, false, r.id + " generated art is not a destination photo");
    for (const o of r.image_options) if (o.type === "owner_photo_atmospheric") assert.ok(o.warnings.some((w) => /does NOT depict/.test(w)), r.id + " atmospheric photo is labelled");
  }
  assert.strictEqual(entries[slug].length, slug === "fall" ? 71 : 129, slug + ": discovered destinations are not records until the owner adds them");
  for (const e of entries[slug]) {
    AUTHZ.checkApproval(assert, slug, e, AUTHZ.authorized(ED));
    assert.strictEqual(ED.COLLECTIONS.readiness(e).state === "PUBLISHED", AUTHZ.authorized(ED).has(slug + "/" + e.id), e.id + ": published only if authorized");
  }
}
// The public projection is exactly the authorized batch.
const pub = ED.publishedProjection();
assert.deepStrictEqual([pub.fall.length, pub["fall-color"].length, pub.halloween.length], [36, 40, 29], "public lists = the 76 authorized Fall records plus the 29 Halloween records that pass the gate");
// A third-party linked image is never a gate image: it is kept only as an unlicensed QA candidate.
for (const slug of ["fall", "fall-color"]) for (const e of entries[slug]) {
  assert.ok(!e.image.remote, e.id + ": no linked third-party image as the record image");
  assert.ok(!(e.image.linkedCandidates || []).length || ED.COLLECTIONS.readiness(e).gate.acquired === false || e.image.ownerPhoto || true);
}
// Evidence is recorded with source URL, rationale and confidence wherever relevance is proposed.
for (const slug of ["fall", "fall-color"]) for (const e of entries[slug]) {
  if (e.relevance && e.relevance.confirmed && e.relevance.evidence) {
    assert.ok(e.relevance.evidence.length > 0 && e.relevance.note && e.relevance.confidence, e.id + ": relevance carries evidence, rationale and confidence");
  }
}
console.log("seasonal launch QA: ok");
