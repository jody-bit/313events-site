// test/seasonal-public-projection.test.js — the public projection carries display fields only.
// Internal evidence, reviewer information, rights/authorization records, file hashes, parked images and approval metadata
// never reach a public asset, and a public entry still shows only if it came from the generated file (or passes the gate).
// Everything here is done in memory on copies: no record is approved, nothing is written.
"use strict";
const AUTHZ = require("./fixtures/seasonal-release-authorization.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const C = ED.COLLECTIONS;
const launch = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/launch-1.json"), "utf8"));
const all = ED.entries();

// load the public modules with a given projection injected (the same files the browser loads)
function load(projection) {
  const m1 = { exports: {} };
  new Function("module", "require", fs.readFileSync(path.join(root, "seasonal/collections.js"), "utf8"))(m1, () => projection);
  const m2 = { exports: {} };
  new Function("module", "require", fs.readFileSync(path.join(root, "seasonal/render.js"), "utf8"))(m2, () => m1.exports);
  return { DATA: m1.exports, R: m2.exports };
}

// approve copies of the 15 launch records and Greenfield (in memory only)
const approved = { fall: [], halloween: [], "fall-color": [] };
const APPROVER = "Test Approver Zed";
for (const slug of ["fall", "fall-color"]) for (const id of launch.collections[slug]) {
  const e = JSON.parse(JSON.stringify(all[slug].find((x) => x.id === id)));
  e.approval = { by: APPROVER, at: "2026-10-12" }; e.status = C.readiness(e).state;
  assert.strictEqual(e.status, "PUBLISHED", id + " would be public with an approval");
  approved[slug].push(e);
}
const gf = JSON.parse(JSON.stringify(all.halloween.find((x) => x.id === "halloween-greenfield-village")));
gf.approval = { by: APPROVER, at: "2026-10-12" }; gf.status = C.readiness(gf).state; approved.halloween.push(gf);
// a linked-image record, to cover that projection too (in memory)
const linked = JSON.parse(JSON.stringify(all.halloween.find((x) => x.image && x.image.remote && C.readiness(x).state === "PUBLISHED")));
linked.id = "linked-copy"; linked.approval = { by: APPROVER, at: "2026-10-12" }; linked.status = C.readiness(linked).state; approved.halloween.push(linked);

const projection = {};
for (const slug of C.ORDER) projection[slug] = approved[slug].filter(C.isPublic).map(ED.publicEntry);
assert.strictEqual(projection.fall.length, 10); assert.strictEqual(projection["fall-color"].length, 5); assert.strictEqual(projection.halloween.length, 2);

// 1. display fields only
const ALLOWED_TOP = ["id", "name", "city", "region", "categories", "featured", "status", "summary", "website", "image", "advisory"];
const ALLOWED_IMG = ["src", "alternates", "placeholder", "illustrative", "remote", "credit"];
const text = JSON.stringify(projection);
for (const slug of C.ORDER) for (const e of projection[slug]) {
  assert.ok(Object.keys(e).every((k) => ALLOWED_TOP.includes(k)), e.id + " top-level keys: " + Object.keys(e));
  assert.ok(Object.keys(e.image).every((k) => ALLOWED_IMG.includes(k)), e.id + " image keys: " + Object.keys(e.image));
  if (e.image.remote) assert.deepStrictEqual(Object.keys(e.image.remote).sort(), ["credit", "sourcePage", "src"]);
  assert.strictEqual(e.status, "PUBLISHED");
}
// 2. nothing internal appears anywhere in the serialized public data, by key or by value
const FORBIDDEN_KEYS = ["evidence", "relevance", "approval", "checkedBy", "checkedAt", "websiteChecked", "verifiedBy", "verifiedAt", "recordedBy", "recordedAt", "reviewRef", "ownerPhoto",
  "authorization", "acquired", "sha256", "bytes", "illustration", "remoteParked", "riskNote", "acceptedBy", "acceptedAt", "migration", "license", "suppliedBy", "basis", "note", "source"];
for (const k of FORBIDDEN_KEYS) assert.ok(!new RegExp('"' + k + '"').test(text), "public data has no \"" + k + "\" key");
const internalValues = [APPROVER, "Claude (Cowork", "Jody", "Owner-authorized", "313p-", "Official site read", "two independent", "READY_FOR_REVIEW", "owner-photo", "risk", "Weaker basis", "Gate "];
for (const v of internalValues) assert.ok(!text.includes(v), "public data does not contain: " + v);
for (const slug of C.ORDER) for (const e of approved[slug]) for (const ev of e.evidence || []) {
  if (ev.note) assert.ok(!text.includes(ev.note.slice(0, 40)), e.id + ": evidence note text is not public");
  if (ev.checkedBy) assert.ok(!text.includes(ev.checkedBy), e.id + ": reviewer text is not public");
}
for (const slug of C.ORDER) for (const e of approved[slug]) if (e.relevance && e.relevance.note) assert.ok(!text.includes(e.relevance.note.slice(0, 40)), e.id + ": relevance note is not public");

// 3. the public modules show exactly the projected entries, with the layout and badges unchanged
const { DATA, R } = load(projection);
for (const slug of ["fall", "fall-color", "halloween"]) {
  const col = DATA.COLLECTIONS[slug];
  assert.strictEqual(DATA.published(col).length, projection[slug].length, slug + ": every projected entry is shown");
  const html = R.main(col);
  for (const e of projection[slug]) assert.ok(html.includes(R.esc(e.name)), slug + ": renders " + e.name);
  for (const e of projection[slug]) {
    const card = html.slice(html.indexOf('data-entry="' + e.id + '"')).split("</li>")[0];
    assert.strictEqual(/<span class="sc-illus">Illustrative image<\/span>/.test(card), e.image.illustrative && !e.image.remote, slug + "/" + e.id + ": the badge shows exactly on illustrations");
  }
  assert.ok(!/Test Approver|evidence|checkedBy/.test(html), slug + ": rendered HTML carries no internal data");
}
// 4. only objects that came from the generated file are shown without re-deriving the gate
{
  const col = JSON.parse(JSON.stringify(DATA.COLLECTIONS.fall));
  const lookalike = JSON.parse(JSON.stringify(projection.fall[0])); lookalike.id = "lookalike"; lookalike.name = "Lookalike Mill";
  const entriesList = DATA.COLLECTIONS.fall.entries.concat([lookalike]);
  const c2 = Object.assign({}, DATA.COLLECTIONS.fall, { entries: entriesList });
  assert.ok(!DATA.published(c2).some((e) => e.id === "lookalike"), "a stripped copy that is not in the generated file is not shown");
  assert.ok(!R.main(c2).includes("Lookalike Mill"));
  // a record with PUBLISHED status but no gate evidence is never shown
  const bare = { id: "bare", name: "Bare Mill", city: "X", region: "MI", categories: ["cider-donuts"], status: "PUBLISHED", summary: "s", image: { src: "/assets/seasonal/fall-card-1.webp", illustrative: true } };
  assert.ok(!DATA.isPublic(bare) && !DATA.published(Object.assign({}, c2, { entries: [bare] })).length);
  // a fixture in the generated file is still hidden
  const fx = Object.assign({}, projection.fall[0], { fixture: true });
  const L2 = load({ fall: [fx], halloween: [], "fall-color": [] });
  assert.strictEqual(L2.DATA.published(L2.DATA.COLLECTIONS.fall).length, 0);
}
// 5. the shipped generated file is the projection of the private data, in public form, and holds nothing today
{
  const pe = require(path.join(root, "seasonal/published-entries.js"));
  assert.deepStrictEqual(ED.publishedProjection(), pe);
  for (const slug of C.ORDER) for (const e of pe[slug]) assert.deepStrictEqual(e, ED.publicEntry(all[slug].find((x) => x.id === e.id)), "shipped entry is the public form of its private record");
  assert.strictEqual(pe.fall.length + pe["fall-color"].length, 79, "exactly the 79 authorized Fall records (76 + 3) are published");
  assert.deepStrictEqual(pe.halloween.map((e) => e.id).sort(), AUTHZ.HALLOWEEN_PUBLISHED, "Halloween publishes exactly the 25 records that pass the gate");
  assert.strictEqual(C.ORDER.reduce((n, s) => n + pe[s].length, 0), 104);
}
// 6. the 15 launch records carry exactly the authorized approval and are public (nothing else was approved)
for (const slug of ["fall", "fall-color"]) for (const id of launch.collections[slug]) {
  const e = all[slug].find((x) => x.id === id);
  assert.deepStrictEqual(e.approval, AUTHZ.AUTH, id + ": exactly the authorized approval");
  assert.ok(e.status === "PUBLISHED" && C.isPublic(e), id + " is published");
}
// 7. the credits page covers both image kinds that cards use
{
  const html = fs.readFileSync(path.join(root, "copyright.html"), "utf8");
  const sec = html.slice(html.indexOf('id="photo-credits"'), html.indexOf('<footer class="site">'));
  assert.ok(/Photography &copy; Miriam Vukich/.test(sec) && /Illustrative image/.test(sec) && /not a photograph of the place/.test(sec));
}
console.log("seasonal public projection: ok");
