// test/halloween-release.test.js — the Halloween 2026 owner approval and final editorial decision.
//   * all 52 inventory records are preserved; 49 carry exactly the owner's approval (2026-10-11); 3 duplicate/closed records are excluded
//     with their history preserved and carry no approval
//   * the documented factual corrections are applied
//   * the publication gate still decides: exactly 29 records are public, each with official 2026 evidence and an authorized image route
//     (7 original: owner photos or linked images; 22 on the owner's established labelled-illustration route)
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
// Photography batch 2 (owner approval 2026-10-12): exactly these six records replaced their labelled illustration with an openly licensed
// Wikimedia Commons photograph (image block only). Any other record taking a photograph still fails this guard.
const PHOTO_B2 = new Set(["zoo-boo", "crossroads-ghosts-goodies", "fort-meigs-garrison-ghost-walk", "laser-halloween", "sandwich-town-ghost-tour", "spooky-janes-walk", "wildwood-manor-house"]);
const isLicensedPhoto = (e) => e.image.illustrative === false && !e.image.ownerPhoto && !e.image.remote && !!e.image.license && /^https:\/\//.test(e.image.licenseUrl || "") &&
  !!e.image.rightsVerifiedAt && /^Photo: .+, (CC0|CC BY(-SA)? \d\.\d), via Wikimedia Commons$/.test(e.image.credit || "") && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test((e.image.commons || {}).filePage || "");
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

// 4. exactly 29 public, each with every gate item and an authorized image route; the rest held with a reason
const pubIds = H.filter(C.isPublic).map((e) => e.id).sort();
assert.deepStrictEqual(pubIds, AUTHZ.HALLOWEEN_PUBLISHED);
for (const id of pubIds) {
  const g = C.gate(byId[id]);
  assert.ok(g.official && g.relevance && g.identity && g.acquired && g.rights && g.approval, id + ": all gate items");
  assert.ok(["owner-photo", "linked", "illustration"].concat(PHOTO_B2.has(id) ? ["acquired-file"] : []).includes(g.imageRoute), id + ": image route is " + g.imageRoute);
  assert.ok(byId[id].evidence.some((x) => x.level === "official" && x.websiteChecked === true), id + ": factual verification is not waived (official-page read recorded)");
  assert.strictEqual(byId[id].status, "PUBLISHED");
}
assert.deepStrictEqual(batch.counts && [batch.counts.inventory, batch.counts.ownerApproved, batch.counts.eligiblePublished, batch.counts.held, batch.counts.excluded], [52, 49, 29, 20, 3]);
for (const r of batch.records.filter((r) => r.category === "held")) { assert.ok(r.reasons.length >= 1 && r.reasons.every((x) => x.length > 20), r.id + ": held with an exact reason"); assert.ok(!C.isPublic(byId[r.id])); }
const states = H.reduce((o, e) => (o[e.status] = (o[e.status] || 0) + 1, o), {});
assert.deepStrictEqual(states, { PUBLISHED: 29, HOLD_UNVERIFIED: 23 });
// the 20 held records are held for FACTUAL verification (no official 2026 evidence, or only indirect evidence); the illustration route is not recorded on them
const held = H.filter((e) => !e.disposition && !C.isPublic(e));
assert.strictEqual(held.length, 20);
for (const e of held) { const g = C.gate(e); assert.ok(!g.official || !g.relevance, e.id + ": held for factual verification"); assert.notStrictEqual(g.imageRoute, "illustration", e.id + ": no illustration route on an unverified record"); }
assert.deepStrictEqual(Object.keys(rel.records).filter((id) => rel.records[id].tier === "verified").sort(), AUTHZ.HALLOWEEN_ILLUSTRATED.slice().sort());

// 4b. the owner's established illustration decision (2026-10-12): the 22 verified records without an authorized photo publish on the labelled route
assert.strictEqual(AUTHZ.HALLOWEEN_ILLUSTRATED.length, 22);
for (const id of AUTHZ.HALLOWEEN_ILLUSTRATED) {
  const e = byId[id], im = e.image, g = C.gate(e);
  if (PHOTO_B2.has(id)) { // since replaced by a licensed photograph (photography batch 2); the credit must reach the public card
    assert.ok(isLicensedPhoto(e), id + ": licensed photograph with author, license, license URL and Commons file page");
    assert.strictEqual(g.imageRoute, "acquired-file", id); assert.strictEqual(ED.publicEntry(e).image.credit, im.credit, id + ": credit reaches the public card");
    continue;
  }
  if (id === "distracted-haunted-house") { // since replaced by the photo Distracted Entertainment emailed in reply to our request (owner decision 2026-10-14)
    assert.strictEqual(g.imageRoute, "owner-photo", id); assert.strictEqual(g.rightsRoute, "owner-authorization", id);
    assert.ok(im.illustrative === false && !!im.ownerPhoto && /happy to participate/.test(im.ownerPhoto.authorization.statement), id + ": venue-supplied owner-authorized image");
    continue;
  }
  assert.strictEqual(g.imageRoute, "illustration", id); assert.strictEqual(g.rightsRoute, "owner-supplied-illustration", id);
  assert.strictEqual(im.illustrative, true); assert.ok(!im.remote && !im.ownerPhoto, id + ": no photo or linked-image claim");
  assert.ok(/never presented as documentary photography/.test(im.illustration.statement) && /does not depict this destination/.test(im.illustration.note), id + ": illustration statement");
  assert.strictEqual(im.provenance.label, "Illustrative image"); assert.strictEqual(im.provenance.status, "OWNER_ACCEPTED");
  assert.ok(/^\/assets\/seasonal\/halloween-card-[1-8]\.webp$/.test(im.src), id + ": an existing approved card, no new image generated");
  const card = ED.publicEntry(e);
  assert.strictEqual(card.image.illustrative, true, id + ": the public card carries the Illustrative image label"); assert.ok(!card.image.credit && !card.image.remote, id + ": no credit or link on an illustration");
  assert.ok(ED.review(e).caveats.some((c) => /labelled generated illustration/.test(c)));
}

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
assert.deepStrictEqual(htmlIds, AUTHZ.HALLOWEEN_PUBLISHED, "the built page holds exactly the 29");

// 6b. mobile word-breaking fix (shared by all three seasonal pages): cards with a 10+ letter word carry the size hint
{
  const R = require(path.join(root, "seasonal/render.js"));
  const colH = C.COLLECTIONS.halloween, colF = C.COLLECTIONS.fall;
  const long = ED.publicEntry(byId["hallowglow-at-treerunner"]), short = ED.publicEntry(byId["zoo-boo"]);
  assert.ok(/class="sc-card-title sc-card-title--long" style="--lw:10"/.test(R.card(colH, long)), "HallowGlow carries the long-word hint");
  assert.ok(/--lw:14/.test(R.card(colH, ED.publicEntry(byId["slaughterhouse-adventure"]))), "Slaughterhouse (14 letters)");
  assert.ok(/class="sc-card-title">/.test(R.card(colH, short)) && !/--lw/.test(R.card(colH, short)), "short titles are untouched");
  assert.ok(/--lw:10/.test(R.card(colF, long)), "the rule is shared: the same card code gives every seasonal page the same hint (see seasonal-shared-presentation.test.js)");
  const css = fs.readFileSync(path.join(root, "seasonal/seasonal.css"), "utf8");
  assert.ok(/\.sc-card-title--long\{font-size:min\(21px/.test(css) && /\.sc-card-row \.sc-card-title--long\{font-size:21px\}/.test(css), "the CSS only shrinks the 2-column grid title; rail and list keep 21px");
}

// 7. the closed Fall and Fall Colors batch (76 records) is untouched by the Halloween work. The pin is the state on release/seasonal-homepage-v2-rc
// (0a42885), i.e. including the seasonal visual corrections of 5c2e988 (neighbouring illustration repeats); it was 6981208c... on 08871c7.
// Re-pinned 2026-10-12 with owner approval (photography batch 1, commit 5813bfec): 23 of the 76 records changed their `image` block only
// (openly licensed Wikimedia Commons photographs; name, city, summary, website, categories, evidence, approval and status untouched). Pin before: 16627534...
// Re-pinned 2026-10-13 with owner authorization (project thread, Wiard's Country Fair photo integration): wiards-orchards's
// `image` block only changed, replacing the temporary AI-generated illustration with an owner-authorized original
// photograph; name, city, summary, website, categories, evidence, approval and status untouched. Pin before: 678f6049...
{
  const set = AUTHZ.batch76(ED), recs = [];
  for (const s of ["fall", "fall-color"]) for (const e of all[s]) if (set.has(s + "/" + e.id)) recs.push(s + "/" + e.id + JSON.stringify(e));
  recs.sort();
  assert.strictEqual(recs.length, 76);
  assert.strictEqual(crypto.createHash("sha256").update(recs.join("\n")).digest("hex"), "23757ef9fec372e84e107df3f26095a3bea2d3341e882ebed68a333e49443f47", "the 76 approved Fall / Fall Colors records are unchanged");
}
console.log("halloween-release: ok");
