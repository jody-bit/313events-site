// test/halloween-release.test.js — the Halloween 2026 owner approval and final editorial decision.
//   * all 52 inventory records are preserved; 49 carry exactly the owner's approval (2026-10-11); 3 duplicate/closed records are excluded
//     with their history preserved and carry no approval
//   * the documented factual corrections are applied
//   * the publication gate still decides: exactly seven records are public, each with an authorized image route
//   * linked images are never represented as licensed; held records are never public; the closed Fall batch is untouched
"use strict";
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const AUTHZ = require("./fixtures/seasonal-release-authorization.js");
const root = path.join(__dirname, "..");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const C = ED.COLLECTIONS;
const run = (script, ...a) => execFileSync(process.execPath, [path.join(root, "scripts", script), ...a], { cwd: root, stdio: "pipe" });

// derived files cannot drift from the release data and the private records
run("apply-halloween-release.js", "--check"); run("build-halloween-release.js", "--check"); run("build-seasonal.js", "--check"); run("build-halloween-qa.js", "--check");

const all = ED.entries(), H = all.halloween, byId = Object.fromEntries(H.map((e) => [e.id, e]));
const rel = ED.read("halloween-release-1.json");
const batch = ED.read("RELEASE_BATCH_HALLOWEEN_1.json");

// 1. all 52 preserved; none removed or renamed id-wise
assert.strictEqual(H.length, 52);
assert.deepStrictEqual(Object.keys(rel.records).sort(), H.map((e) => e.id).sort(), "release data covers exactly the 52 inventory records");
assert.deepStrictEqual(Object.keys(batch.records.reduce((o, r) => (o[r.id] = 1, o), {})).sort(), H.map((e) => e.id).sort());

// 2. approvals: 49 exactly the owner's, 3 excluded none
const excluded = H.filter((e) => e.disposition);
assert.deepStrictEqual(excluded.map((e) => e.id).sort(), Object.keys(AUTHZ.HALLOWEEN_EXCLUDED).sort(), "the three duplicate/closed records");
for (const e of H) AUTHZ.checkApproval(assert, "halloween", e, new Set());
assert.strictEqual(H.filter((e) => e.approval).length, 49);
for (const e of H.filter((e) => e.approval)) { assert.ok(e.editorialAccepted && e.editorialAccepted.at === "2026-10-11", e.id + ": editorial acceptance recorded"); assert.ok(/does not waive the publication gate/.test(e.editorialAccepted.scope)); }

// 3. exclusion keeps history; the guard keeps them out even if an approval were added
for (const e of excluded) {
  assert.ok(e.evidence.length >= 1, e.id + ": evidence history kept");
  assert.ok(e.disposition.reason && e.disposition.recordedAt, e.id + ": disposition is documented");
  const copy = JSON.parse(JSON.stringify(e)); copy.approval = AUTHZ.AUTH_HALLOWEEN; copy.status = "PUBLISHED";
  assert.strictEqual(C.readiness(copy).state, "HOLD_UNVERIFIED", e.id + ": an excluded record cannot pass the gate");
  assert.ok(!C.isPublic(copy), e.id + ": never public");
  assert.ok(ED.review(e).outstanding.some((o) => /^Excluded/.test(o)));
}
assert.strictEqual(byId["scarehouse-windsor-immersive-dinner"].disposition.of, "scarehouse-windsor");
assert.strictEqual(byId["windsor-essex-yard-haunt-map"].disposition.of, "halloween-hunt-the-haunts");
assert.strictEqual(byId["exit-13-haunted-house"].disposition.type, "closed");

// 4. exactly seven public, each with every gate item and an authorized image route; the rest held with a reason
const pubIds = H.filter(C.isPublic).map((e) => e.id).sort();
assert.deepStrictEqual(pubIds, AUTHZ.HALLOWEEN_PUBLISHED);
for (const id of pubIds) {
  const g = C.gate(byId[id]);
  assert.ok(g.official && g.relevance && g.identity && g.acquired && g.rights && g.approval, id + ": all gate items");
  assert.ok(["owner-photo", "linked"].includes(g.imageRoute), id + ": image route is " + g.imageRoute);
  assert.strictEqual(byId[id].status, "PUBLISHED");
}
assert.deepStrictEqual(batch.counts && [batch.counts.inventory, batch.counts.ownerApproved, batch.counts.eligiblePublished, batch.counts.held, batch.counts.excluded], [52, 49, 7, 42, 3]);
for (const r of batch.records.filter((r) => r.category === "held")) { assert.ok(r.reasons.length >= 1 && r.reasons.every((x) => x.length > 20), r.id + ": held with an exact reason"); assert.ok(!C.isPublic(byId[r.id])); }
const states = H.reduce((o, e) => (o[e.status] = (o[e.status] || 0) + 1, o), {});
assert.deepStrictEqual(states, { PUBLISHED: 7, CONTENT_VERIFIED: 22, HOLD_UNVERIFIED: 23 });
// no held record rests on a generated card as if it were a photo: none of the 22 has an image route
for (const e of H.filter((e) => e.status === "CONTENT_VERIFIED")) { const g = C.gate(e); assert.ok(!g.acquired && !g.rights, e.id + ": retained without an image route"); }

// 5. image rights are not misrepresented: linked images are risk-accepted, never licensed
for (const id of pubIds.filter((id) => C.gate(byId[id]).imageRoute === "linked")) {
  const g = C.gate(byId[id]);
  assert.strictEqual(g.rightsRoute, "linked-risk-acceptance", id);
  assert.ok(!byId[id].image.licenseUrl, id + ": no license URL claimed");
  assert.ok(ED.review(byId[id]).caveats.some((c) => /NOT confirmed usage rights/.test(c)), id + ": the review states it is not usage rights");
}
const projection = ED.publishedProjection().halloween;
assert.ok(!/"license"|licenseUrl|riskNote|acceptedBy/.test(JSON.stringify(projection)), "no rights wording or fake license in public data");

// 6. documented corrections applied
const g = (id) => byId[id];
assert.strictEqual(g("glenlore-carnevil-2").summary, "Illuminated night walk with a carnival theme in Commerce Township.");
assert.ok(!/horror/i.test(g("glenlore-carnevil-2").summary) && !g("glenlore-carnevil-2").categories.includes("haunted-attractions"), "Glenlore is not a haunted attraction");
assert.ok(g("glenlore-carnevil-2").categories.includes("family-friendly"), "Glenlore is family-friendly");
assert.strictEqual(g("hallowglow-at-treerunner").website, "https://treerunnerparks.com/westbloomfield/fall-festivities/");
assert.ok(C.gate(g("hallowglow-at-treerunner")).official && g("hallowglow-at-treerunner").evidence.some((x) => x.level === "official" && x.url === g("hallowglow-at-treerunner").website));
assert.deepStrictEqual(g("hallowglow-at-treerunner").categories, ["strange-unusual", "family-friendly"]);
assert.ok(/climbing and ziplining/.test(g("hallowglow-at-treerunner").summary) && !/haunt/i.test(g("hallowglow-at-treerunner").summary));
assert.ok(!/multilevel/i.test(g("azra-chamber-of-horrors").summary));
assert.strictEqual(g("crossroads-ghosts-goodies").city, "Flint");
assert.strictEqual(g("erebus").website, "https://hauntedpontiac.com");
assert.strictEqual(g("eloise-asylum").website, "https://eloiseasylum.com/");
assert.ok(H.every((e) => !/radius check|unverified|not confirmed|hold until|must be verified/i.test(e.summary)), "no internal editorial note in any summary");
assert.strictEqual(g("full-moon-manor-at-bonadeo-farms").name, "Full Moon Haunted House at Bonadeo Farms");
// Greenfield: the sold-out advisory is on the public card and nowhere is a price or availability invented
const gf = projection.find((e) => e.id === "halloween-greenfield-village");
assert.ok(gf && /sold out for 2026/i.test(gf.advisory), "Greenfield carries the SOLD OUT advisory");
assert.ok(!/\$\d/.test(JSON.stringify(projection)), "no price appears on any public Halloween card");
const html = fs.readFileSync(path.join(root, "halloween.html"), "utf8");
assert.ok(/sold out for 2026/i.test(html), "the built page shows the sold-out advisory");
const htmlIds = [...new Set([...html.matchAll(/data-entry="([^"]+)"/g)].map((m) => m[1]))].sort();
assert.deepStrictEqual(htmlIds, AUTHZ.HALLOWEEN_PUBLISHED, "the built page holds exactly the seven");

// 7. the closed Fall and Fall Colors batch (76 records) is untouched by the Halloween work. The pin is the state on release/seasonal-homepage-v2-rc
// (0a42885), i.e. including the seasonal visual corrections of 5c2e988 (neighbouring illustration repeats); it was 6981208c... on 08871c7.
{
  const set = AUTHZ.batch76(ED), recs = [];
  for (const s of ["fall", "fall-color"]) for (const e of all[s]) if (set.has(s + "/" + e.id)) recs.push(s + "/" + e.id + JSON.stringify(e));
  recs.sort();
  assert.strictEqual(recs.length, 76);
  assert.strictEqual(crypto.createHash("sha256").update(recs.join("\n")).digest("hex"), "1662753417d0c526266cc59c2754e922477f4cf610974f86676a96c4a302bfa3", "the 76 approved Fall / Fall Colors records are unchanged");
}
console.log("halloween-release: ok");
