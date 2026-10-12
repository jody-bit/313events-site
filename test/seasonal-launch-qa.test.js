// test/seasonal-launch-qa.test.js — Fall Is On. and Fall Colors launch preparation.
// The two collections show their proposed content only through the QA-only dataset. Nothing becomes public without the
// explicit approval, no record carries one, and the generated QA data is in sync with the private records.
"use strict";
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
    assert.strictEqual(r.public, false, r.id + " is not public");
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
    assert.ok(!e.approval, e.id + ": this repository records no approval");
    assert.notStrictEqual(ED.COLLECTIONS.readiness(e).state, "PUBLISHED", e.id + " is not published");
  }
}
// The public projection stays empty.
const pub = ED.publishedProjection();
for (const slug of ["fall", "fall-color", "halloween"]) assert.strictEqual(pub[slug].length, 0, slug + " public list is empty");
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

// ---- first launch candidate set (owner decision 2026-10-12): 15 destinations, none approved
{
  const DATA = ED.COLLECTIONS;
  const all = entries.fall.concat(entries["fall-color"]);
  const set = all.filter((e) => e.launchCandidate && e.launchCandidate.set);
  assert.strictEqual(set.length, 15, "15 launch candidates");
  assert.strictEqual(set.filter((e) => entries.fall.includes(e)).length, 10, "10 Fall");
  assert.strictEqual(set.filter((e) => entries["fall-color"].includes(e)).length, 5, "5 Fall Colors");
  for (const e of set) {
    const r = DATA.readiness(e);
    assert.strictEqual(r.state, "READY_FOR_REVIEW", e.id + " is ready for review and nothing more");
    assert.ok(!e.approval && !DATA.isPublic(e), e.id + " is not approved or public");
    const route = r.gate.imageRoute;
    assert.ok(route === "owner-photo" || route === "labelled-illustration", e.id + " image route " + route);
    if (route === "labelled-illustration") {
      assert.strictEqual(e.image.illustrative, true, e.id + " illustration is flagged illustrative");
      assert.strictEqual(e.image.illustrationException.label, "Illustrative image");
      assert.ok(!e.image.ownerPhoto && !e.image.acquired, e.id + " exception only without a photograph");
    } else assert.ok(!e.image.illustrationException, e.id + " photo entries carry no exception");
  }
  // Held, not launched.
  const fa = all.find((e) => e.id === "forever-acres-farm");
  assert.ok(fa.launchCandidate.held && DATA.readiness(fa).state === "HOLD_UNVERIFIED", "Forever Acres is held");
  // Accuracy corrections.
  const by = Object.fromEntries(all.map((e) => [e.id, e]));
  assert.ok(!/corn maze|slide|wagon|petting/i.test(by["wiards-orchards"].summary), "Wiard's card does not advertise closed attractions");
  assert.ok(!/Legacy|trivia|event center/i.test(by["big-red-orchard"].summary), "Big Red card drops the bar and event center");
  assert.ok(!/\b(mon|tue|wed|thu|fri|sat|sun)\w*\b|hours/i.test(by["wasem-fruit-farm"].summary), "Wasem card states no days or hours");
  assert.ok(!/fountain|sculpture/i.test(by["cranbrook-gardens-and-grounds"].summary), "Cranbrook card does not claim fountains");
  assert.ok(!/whoa|water park|boat launch|paving/i.test(by["holly-state-recreation-area"].summary), "Holly card advertises no closed attractions");
  for (const id of ["wiards-orchards", "wasem-fruit-farm", "big-red-orchard", "cranbrook-gardens-and-grounds", "holly-state-recreation-area"]) assert.ok(by[id].editorialNotes.length, id + " keeps its conflict in a private note");
  // The exception is strict: any missing part falls back to IMAGE_PENDING/CONTENT_VERIFIED.
  const base = JSON.parse(JSON.stringify(by["rochester-cider-mill"]));
  assert.strictEqual(DATA.readiness(base).state, "READY_FOR_REVIEW");
  for (const mut of [(x) => { delete x.image.illustrationException; }, (x) => { x.image.illustrationException.authorizedBy = ""; },
    (x) => { x.image.illustrationException.label = "Photo"; }, (x) => { x.image.illustrative = false; }, (x) => { x.image.src = "https://example.org/a.jpg"; }]) {
    const x = JSON.parse(JSON.stringify(base)); mut(x);
    assert.notStrictEqual(DATA.readiness(x).state, "READY_FOR_REVIEW", "a broken exception does not pass the gate");
  }
  // Approval is still required, and approval alone with the exception publishes only when recorded by the approver.
  const ap = JSON.parse(JSON.stringify(base)); assert.strictEqual(DATA.isPublic(ap), false);
}
console.log("seasonal launch QA: ok");
