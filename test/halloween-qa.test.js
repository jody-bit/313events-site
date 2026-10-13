// test/halloween-qa.test.js — THE DARK ORBIT completion: 52-record QA dataset,
// image manifest, photo priority, runtime fallback logic, QA API gating, and
// the public page staying clean.
"use strict";
const AUTHZ = require("./fixtures/seasonal-release-authorization.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const DATA = require(path.join(root, "seasonal/collections.js"));
const R = require(path.join(root, "seasonal/render.js"));
const QA = require(path.join(root, "api/_lib/seasonal-editorial/qa-client.js"));
const FB = require(path.join(root, "seasonal/image-fallback.js"));
const lib = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/photo-library.json"), "utf8"));
const qa = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/halloween-qa.json"), "utf8"));
const reg = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/candidates.json"), "utf8")).candidates.filter((c) => c.collection === "halloween");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const col = DATA.COLLECTIONS.halloween;
const PHOTO_B2 = new Set(["zoo-boo", "crossroads-ghosts-goodies", "fort-meigs-garrison-ghost-walk", "laser-halloween", "sandwich-town-ghost-tour", "spooky-janes-walk"]); // photography batch 2, owner approved 2026-10-12
const entries = Object.fromEntries(ED.entries().halloween.map((e) => [e.id, e]));
const pins = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/defaults.json"), "utf8")).defaults;

// generated files are in sync
execFileSync(process.execPath, [path.join(root, "scripts/build-halloween-qa.js"), "--check"]);

// 1. all 52 inventory records, unique ids, published ids preserved
assert.strictEqual(qa.records.length, 52);
assert.strictEqual(reg.length, 52);
assert.strictEqual(new Set(qa.records.map((r) => r.id)).size, 52, "duplicate destination ids");
assert.strictEqual(new Set(qa.records.map((r) => r.name)).size, 52, "duplicate destinations");
// `public` is the gate's answer for the private entry, never a hand-set flag; every entry carries the owner's 2026-10-11 approval, which does not waive the rest of the gate
for (const r of qa.records) assert.strictEqual(r.public, DATA.isPublic(entries[r.id]), r.id + " public flag equals the gate");
assert.deepStrictEqual(qa.records.filter((r) => r.public).map((r) => r.id).sort(), AUTHZ.HALLOWEEN_PUBLISHED, "exactly the 29 records that pass every gate item are public");
for (const r of qa.records) {
  assert.strictEqual(r.publication.state, DATA.readiness(entries[r.id]).state, r.id + " publication state is derived");
  assert.strictEqual(r.publication.gate.approval, !AUTHZ.HALLOWEEN_EXCLUDED[r.id], r.id + ": carries the owner approval unless excluded");
  assert.ok(r.publication.state === "PUBLISHED" || r.publication.outstanding.length > 0, r.id + " lists what is outstanding");
}

// 2. manifest fields (extends the existing registry, not a competing database)
const FIELDS = ["destination_id", "destination_name", "primary_image", "primary_image_type", "primary_image_source", "primary_image_credit", "primary_image_rights_status", "fallback_image", "alternative_images", "image_status", "editorial_approval_status"];
const catIds = col.categories.map((c) => c.id);
for (const c of reg) {
  for (const f of FIELDS) assert.ok(c.image_manifest && c.image_manifest[f] !== undefined && c.image_manifest[f] !== "", c.name + " manifest." + f);
  assert.strictEqual(c.image_manifest.editorial_approval_status, AUTHZ.HALLOWEEN_EXCLUDED[c.destination_id] ? "not_approved" : "owner_approved", "the owner approval is recorded for the 49, not for the excluded");
  assert.ok(c.categories.length && c.categories.every((k) => catIds.includes(k)), c.name + " categories");
}
const photos = Object.fromEntries(lib.destination_specific.concat(lib.editorial_atmospheric).map((p) => [p.id, p]));
for (const r of qa.records) {
  assert.ok(r.verification && ["partial", "unverified"].includes(r.verification.status));
  assert.strictEqual(r.verification.official_site_checked, DATA.gate(entries[r.id]).official, r.id + " official-site flag equals the gate");
  assert.strictEqual(r.dates_hours, null, "no unverified dates/hours");
  assert.ok(r.image_options.length >= 3 && r.image_options[0].src === r.manifest.primary_image);
  assert.strictEqual(r.image_options[0].id, pins[r.id], r.id + ": the default is the pinned one (B7)");
  for (const o of r.image_options) assert.ok(o.image_kind, r.id + "/" + o.id + " has an image kind (photo / promo-art / generated-artwork)");
  for (const o of r.image_options) {
    if (!/^https:\/\//.test(o.src)) assert.ok(fs.existsSync(path.join(root, o.src)), r.id + " missing file " + o.src);
    assert.strictEqual(typeof o.depicts_actual_destination, "boolean");
    assert.strictEqual(typeof o.illustrative, "boolean");
    assert.ok(o.credit && o.source && o.rights_status);
  }
  for (const f of [r.manifest.fallback_image, r.manifest.secondary_fallback_image]) {
    assert.ok(fs.existsSync(path.join(root, f)), r.id + " fallback missing");
    assert.ok(f !== r.manifest.primary_image, r.id + " fallback equals primary");
    assert.ok(r.image_options.find((o) => o.src === f).illustrative, r.id + " fallback must be approved generated art");
  }
  // 3. owner photos of the actual place win; atmospheric photos are never primary; atmospheric never claims the place
  const primary = r.image_options[0];
  assert.notStrictEqual(primary.type, "owner_photo_atmospheric", r.id + " atmospheric as primary");
  for (const o of r.image_options.filter((o) => o.type === "owner_photo_atmospheric")) assert.strictEqual(o.depicts_actual_destination, false);
  for (const o of r.image_options.filter((o) => o.type === "owner_photo_destination")) {
    assert.strictEqual(photos[o.id].destination.name.replace(/\W/g, "").length > 0, true);
    assert.ok(reg.find((c) => c.destination_id === r.id).photos.includes(o.id), r.id + " uses a photo of another destination");
  }
  const clean = r.image_options.find((o) => o.type === "owner_photo_destination" && o.warnings.length === 0);
  if (clean) assert.strictEqual(primary.type, "owner_photo_destination", r.id + " must lead with its own clean photo");
  // flagged photos (identifiable person etc.) are alternatives, never silently defaulted
  if (primary.type === "owner_photo_destination" && primary.warnings.some((w) => /person/i.test(w))) assert.fail(r.id + " defaults to a photo with an identifiable subject");
}
assert.ok(qa.records.some((r) => r.manifest.primary_image_type === "owner_photo_destination"), "at least one owner-photo primary");

// 4. public page: only published records, no QA artifacts, fallback attrs wired
const pub = R.main(col);
assert.ok(!/sc-qa|Unverified|Rotten Manor|Slay Nights/.test(pub));
// fallback attributes are wired on any card the renderer produces (exercised here on private entries, which are never public)
for (const e of Object.values(entries).slice(0, 6)) assert.ok(/data-fb=/.test(R.card(col, e)), e.id + " card carries its fallback chain");
assert.deepStrictEqual([...new Set([...pub.matchAll(/<li class="sc-card[^"]*" data-entry="([^"]+)"/g)].map((m) => m[1]))].sort(), AUTHZ.HALLOWEEN_PUBLISHED, "only the 29 gate-passing destinations are public (the Don't Miss rail repeats three of them)");
// every private entry's image agrees with the QA default and its fallbacks (one data set, two views)
for (const r of qa.records) {
  const e = entries[r.id], o = r.image_options[0];
  // Photography batch 2 (owner approval 2026-10-12): these six records show an openly licensed Commons photograph on the public card. The QA
  // default stays pinned (defaults.json is the owner's file and is not edited here), so the card image is checked against its licence record instead.
  if (PHOTO_B2.has(r.id)) {
    assert.ok(e.image.illustrative === false && !e.image.ownerPhoto && !e.image.remote && !!e.image.license && /^https:\/\//.test(e.image.licenseUrl || "") && !!e.image.rightsVerifiedAt &&
      /^Photo: .+, (CC0|CC BY(-SA)? \d\.\d), via Wikimedia Commons$/.test(e.image.credit) && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(e.image.commons.filePage), r.id + ": licensed photograph with its rights recorded");
    assert.notStrictEqual(e.image.src, o.src, r.id + ": the card shows the photograph, the pinned QA default is still the illustration");
    continue;
  }
  // Owner decision 2026-10-13: Hallowe'en in Greenfield Village shows the image the owner supplied from the venue (owner-authorized route, permission
  // recorded in image.ownerPhoto). The pinned QA default is still the earlier carousel frame.
  if (r.id === "halloween-greenfield-village") {
    assert.ok(e.image.illustrative === false && !!e.image.ownerPhoto && /venue-henryford-01__card\.webp$/.test(e.image.src) && /Henry Ford/.test(e.image.ownerPhoto.authorization.statement), r.id + ": venue-supplied owner-authorized image");
    assert.notStrictEqual(e.image.src, o.src, r.id + ": the card shows the venue image, the pinned QA default is still the carousel frame");
    continue;
  }
  if (o.type.startsWith("linked")) { assert.strictEqual(e.image.remote.src, o.src); assert.strictEqual(e.image.src, r.manifest.fallback_image); }
  else assert.strictEqual(e.image.src, o.src, r.id + " entry image == QA default");
  const uniq = (l) => [...new Set(l)].sort();
  assert.deepStrictEqual(uniq([e.image.src].concat(e.image.alternates || []).filter((u) => u !== o.src)), uniq([r.manifest.fallback_image, r.manifest.secondary_fallback_image].filter((u) => u !== o.src)), r.id + " fallbacks agree");
}
const pageHtml = fs.readFileSync(path.join(root, "halloween.html"), "utf8");
assert.ok(!pageHtml.includes("Rotten Manor") && !pageHtml.includes("Slay Nights"), "held names not in public HTML");
for (const f of ["seasonal/collections.js", "seasonal/published-entries.js", "seasonal/page.js", "seasonal/render.js", "seasonal/image-fallback.js", "halloween.html"]) {
  assert.ok(!fs.readFileSync(path.join(root, f), "utf8").includes("Slay Nights"), f + " leaks QA records");
}
assert.ok(!pageHtml.includes("qa.js") && !pageHtml.includes("seasonal-qa"), "public HTML carries no QA script tag");

// 5. QA API (full matrix lives in seasonal-qa-route.test.js): production 404, preview/development serve
const handler = require(path.join(root, "api/seasonal-qa.js"));
function call(env, query) {
  const saved = process.env.VERCEL_ENV; if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  try { handler({ method: "GET", query: query || {} }, res); } finally { if (saved === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved; }
  return res;
}
assert.strictEqual(call("production").statusCode, 404);
assert.ok(!call("production").body.includes("Hush"));
for (const env of ["preview", "development"]) { const r = call(env); assert.strictEqual(r.statusCode, 200); assert.strictEqual(JSON.parse(r.body).records.length, 52); assert.strictEqual(r.headers["X-Robots-Tag"], "noindex, nofollow"); }
assert.strictEqual(call("preview", { c: "fall" }).statusCode, 200, "fall now has its own QA dataset");
assert.strictEqual(call("preview", { c: "nope" }).statusCode, 404);
assert.strictEqual(call("production", { c: "fall" }).statusCode, 404);
for (const c of ["fall", "fall-color"]) { const r = call("preview", { c }); assert.strictEqual(r.statusCode, 200); assert.strictEqual(JSON.parse(r.body).collection, c); }
assert.strictEqual(call("preview", { c: "__proto__" }).statusCode, 404);
assert.ok(QA.isProductionHost("313.events") && QA.isProductionHost("WWW.313.events") && !QA.isProductionHost("x.vercel.app"));

// 6. QA rendering: all 52 present, status inspectable, selector shows required facts
const state = { category: "all", query: "", view: "grid" };
const html = QA.results(col, qa.records, state, {});
assert.strictEqual((html.match(/<li class="sc-card/g) || []).length, 52);
assert.ok(html.includes("Unverified") && html.includes("Partly verified") && html.includes("Depicts actual destination:") && html.includes("Illustrative/generated:") && html.includes("Credit:") && html.includes("Source:"));
assert.strictEqual(QA.visible(qa.records, { category: "ghosts-history", query: "" }).every((r) => r.categories.includes("ghosts-history")), true);
assert.ok(QA.visible(qa.records, { category: "all", query: "windsor" }).length >= 4);
const eloise = qa.records.find((r) => r.id === "eloise-asylum");
const alt = eloise.image_options[2];
assert.strictEqual(QA.toEntry(eloise, alt.id).image.src, alt.src, "selection changes the primary");
const exp = JSON.parse(QA.exportJson(qa.records, { "eloise-asylum": alt.id }));
assert.strictEqual(exp.selections.length, 52);
assert.strictEqual(exp.selections.find((s) => s.destination_id === "eloise-asylum").selected_image_id, alt.id);

// 7. fallback chain logic: next valid source, no loops, failed URLs skipped, ends in placeholder
const chain = FB.chainOf("/a.webp", JSON.stringify(["/b.webp", "/c.webp"]));
assert.deepStrictEqual(chain, ["/a.webp", "/b.webp", "/c.webp"]);
assert.strictEqual(FB.nextSource(chain, { "/a.webp": true }), "/b.webp");
assert.strictEqual(FB.nextSource(chain, { "/a.webp": true, "/b.webp": true }), "/c.webp");
assert.strictEqual(FB.nextSource(chain, { "/a.webp": true, "/b.webp": true, "/c.webp": true }), null);
assert.strictEqual(FB.nextSource(["/a", "/a", "/b"], { "/a": true }), "/b", "duplicates do not loop");
function fakeImg(src, fb) { const at = { src, "data-fb": JSON.stringify(fb) }; return { getAttribute: (k) => at[k], setAttribute: (k, v) => { at[k] = v; }, hasAttribute: (k) => k in at }; }
for (const k of Object.keys(FB._failed)) delete FB._failed[k];
const img = fakeImg("/x.webp", ["/y.webp", "/z.webp"]); const calls = [];
assert.strictEqual(FB.handleFailure(img, () => calls.push("ph")), "next"); assert.strictEqual(img.getAttribute("src"), "/y.webp");
assert.strictEqual(FB.handleFailure(img, () => calls.push("ph")), "next"); assert.strictEqual(img.getAttribute("src"), "/z.webp");
assert.strictEqual(FB.handleFailure(img, () => calls.push("ph")), "placeholder"); assert.deepStrictEqual(calls, ["ph"]);
// a second card sharing a known-bad primary skips straight past it, and renders without retrying it
const img2 = fakeImg("/x.webp", ["/y.webp"]); img2.__chain = null;
assert.ok(FB.isFailed("/x.webp"));
R.setFailedLookup(FB.isFailed);
assert.notStrictEqual(R.pickSrc({ src: "/x.webp", fallbacks: ["/q.webp"] }), "/x.webp");
R.setFailedLookup(null);

// 8. the other seasonal pages carry no unpublished destination either
// (the built pages render the 76 authorized Fall records plus the 29 Halloween records that pass the gate; every card on them must be one of those, and nothing else)
{
  const authSet = AUTHZ.authorized(ED);
  for (const [f, slug] of [["fall.html", "fall"], ["fall-color.html", "fall-color"], ["halloween.html", "halloween"]]) {
    const html = fs.readFileSync(path.join(root, f), "utf8");
    const ids = [...html.matchAll(/<li class="sc-card[^"]*" data-entry="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) assert.ok(authSet.has(slug + "/" + id), f + " renders only authorized records: " + id);
    if (slug === "halloween") assert.deepStrictEqual([...new Set(ids)].sort(), AUTHZ.HALLOWEEN_PUBLISHED, "Halloween renders exactly the 29 records that pass the gate");
  }
}
console.log("halloween-qa: ok");

// ---- linked images: the supplied catalogue (12) plus the official-site images read on 2026-10-11 (9) ----
{
  const linkedFile = require("../api/_lib/seasonal-editorial/linked-images.json");
  const recs = qa.records;
  const byId = Object.fromEntries(recs.map((r) => [r.id, r]));
  assert.strictEqual(linkedFile.images.length, 21);
  linkedFile.images.forEach((l) => {
    assert.ok(byId[l.destination_id], l.destination_id);
    assert.ok(byId[l.destination_id].image_options.some((o) => o.src === l.image_link));
    assert.ok(/^https:\/\//.test(l.image_link));
    assert.strictEqual(l.permission_on_file, false, l.destination_id + ": no rights-holder permission is on file");
    assert.ok(l.accepted_by && l.accepted_at && /not confirmed usage rights/.test(l.risk_note), l.destination_id + ": risk acceptance recorded as exactly that");
    assert.ok(l.load_check && /^loaded \d+x\d+$/.test(l.load_check.result) && l.load_check.checkedAt === "2026-10-11", l.destination_id + ": load test result preserved");
    assert.ok(["photo", "promo-art"].includes(l.photo_kind) && l.source_type, l.destination_id);
  });
  // the nine new official-site images are selectable and never the default
  const NINE = ["slay-nights", "blakes-haunted-attractions", "deranged-haunt", "scarehouse-windsor", "scarehouse-windsor-immersive-dinner", "field-of-fear", "fort-meigs-garrison-ghost-walk", "halloween-stroll-at-canterbury-village", "brick-or-treat-at-legoland-discovery-center"];
  for (const id of NINE) {
    const r = byId[id], o = r.image_options.find((x) => x.id === "link-" + id);
    assert.ok(o && o.type === "linked_official", id + " has its official-site image as an option");
    assert.notStrictEqual(r.image_options[0].id, o.id, id + ": a new option is not the default");
    assert.strictEqual(r.manifest.primary_image_type, "generated_illustrative", id + " keeps its generated default");
  }
  // promotional artwork is kept distinct from destination photography
  for (const id of ["slay-nights", "deranged-haunt", "field-of-fear", "brick-or-treat-at-legoland-discovery-center", "rotten-manor", "halloween-greenfield-village"]) {
    const o = byId[id].image_options.find((x) => x.id === "link-" + id);
    assert.strictEqual(o.image_kind, "promo-art", id); assert.strictEqual(o.depicts_actual_destination, false, id + ": promo art does not depict the destination");
    assert.ok(o.warnings.some((w) => /Promotional artwork/.test(w)), id);
  }
  recs.forEach((r) => {
    if (r.manifest.primary_image_type === "linked_official") {
      const o = r.image_options[0];
      assert.strictEqual(o.warnings.length, o.image_kind === "promo-art" ? 2 : 1, r.id);
      assert.strictEqual(o.depicts_actual_destination, o.image_kind !== "promo-art", r.id);
      assert.strictEqual(r.manifest.image_status, "linked_unverified");
      assert.ok(/generated|halloween-card/.test(r.manifest.fallback_image));
      assert.strictEqual(o.permission_on_file, false);
    }
  });
  ["erebus", "wiards-night-terrors", "scarefest-scream-park", "jack-o-lanterns-among-the-trees", "crossroads-ghosts-goodies", "dearborn-haunted-trail"].forEach((id) =>
    assert.notStrictEqual(byId[id].manifest.primary_image_type.indexOf("linked"), 0, id));
  assert.strictEqual(byId["halloween-greenfield-village"].manifest.primary_image_type, "owner_photo_destination");
  // alternatives that were found and not chosen are recorded, never selectable
  assert.strictEqual(linkedFile.unchosen_alternatives.length, 10);
  assert.ok(recs.reduce((n, r) => n + r.recorded_alternatives.length, 0) === 10 && recs.every((r) => r.recorded_alternatives.every((a) => a.selectable === false && !r.image_options.some((o) => o.src === a.image_link))));
  // Erebus stays classified as the branch had it (third-party), not upgraded to official
  assert.strictEqual(byId.erebus.image_options.find((o) => o.id === "link-erebus").type, "linked_third_party");
  // the QA card shows rights as recorded risk acceptance, never as usage rights
  const html = QA.results(col, recs, { category: "all", query: "", view: "grid" }, {});
  assert.ok(html.includes("Permission on file: NO") && html.includes("(not usage rights)") && html.includes("promotional artwork") && html.includes("Load test: loaded"));
}

// ---- proposed images (owner decision pending): selectable in QA, never adopted, never approved ----
{
  const linkedFile = require("../api/_lib/seasonal-editorial/linked-images.json");
  const ED = require("../api/_lib/seasonal-editorial/editorial.js");
  const recs = Object.fromEntries(qa.records.map((r) => [r.id, r]));
  const props = linkedFile.proposed_images;
  assert.ok(props.length >= 2);
  props.forEach((l) => {
    assert.ok(/^https:\/\//.test(l.image_link) && l.proposal_id && l.permission_on_file === false, l.destination_id);
    assert.ok(!l.accepted_by && !l.accepted_at, l.destination_id + ": no risk acceptance may be recorded for a proposal");
    assert.ok(l.load_check && /^loaded \d+x\d+$/.test(l.load_check.result), l.destination_id + ": load test recorded");
    const r = recs[l.destination_id], o = r.image_options.find((x) => x.id === "link-" + l.destination_id + "-" + l.proposal_id);
    assert.ok(o && o.proposal && o.risk_acceptance === null && o.permission_on_file === false, "proposal is an option with no risk acceptance");
    assert.notStrictEqual(r.image_options[0].id, o.id, "a proposal is never the default");
    assert.ok(o.warnings.some((w) => /PROPOSED, not adopted/.test(w)));
    // the record itself is untouched: no remote image copied, no approval, no state change
    const e = ED.entries().halloween.find((x) => x.id === l.destination_id);
    assert.ok(!e.image.remote || e.image.remote.src !== l.image_link, "a proposal is not copied onto the record");
    assert.deepStrictEqual(e.approval, AUTHZ.AUTH_HALLOWEEN, e.id + ": carries the owner Halloween approval; the unadopted proposal adds no rights and no image");
  });
  const cx = recs["crossroads-ghosts-goodies"];
  assert.strictEqual(cx.publication.state, "PUBLISHED", "Crossroads publishes on the labelled-illustration route; the unadopted proposals change nothing");
  assert.strictEqual(cx.manifest.primary_image, "/assets/seasonal/halloween-card-6.webp", "Crossroads default unchanged");
  assert.ok(QA.results(col, qa.records, { category: "all", query: "", view: "grid" }, {}).includes("PROPOSED, not adopted"));
  // nothing in the batch is approved
  const all = ED.entries(), authSet = AUTHZ.authorized(ED);
  Object.keys(all).forEach((k) => all[k].forEach((e) => AUTHZ.checkApproval(assert, k, e, authSet)));
  assert.strictEqual(all.halloween.filter((e) => e.approval).length, 49, "49 Halloween records carry the owner approval of 2026-10-11");
  assert.strictEqual(all.halloween.filter((e) => e.disposition).length, 3, "3 are excluded (duplicate or closed) and keep their records");
  assert.deepStrictEqual(AUTHZ.halloweenApproved(ED).sort(), all.halloween.filter((e) => e.approval).map((e) => e.id).sort(), "the approved set is the 49");
  const md = fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/APPROVAL_BATCH_1.md"), "utf8");
  assert.ok(/Nothing is approved/.test(md) && /Rotten Manor/.test(md) && /promo-art/.test(md));
  assert.ok(!/"approval": \{"by": "(?!<name>)/.test(md), "the batch pre-fills no approval");
  console.log("halloween-qa proposals: ok");
}
