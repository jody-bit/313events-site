// test/halloween-qa.test.js — THE DARK ORBIT completion: 52-record QA dataset,
// image manifest, photo priority, runtime fallback logic, QA API gating, and
// the public page staying clean.
"use strict";
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
const col = DATA.COLLECTIONS.halloween;

// generated files are in sync
execFileSync(process.execPath, [path.join(root, "scripts/build-halloween-qa.js"), "--check"]);

// 1. all 52 inventory records, unique ids, published ids preserved
assert.strictEqual(qa.records.length, 52);
assert.strictEqual(reg.length, 52);
assert.strictEqual(new Set(qa.records.map((r) => r.id)).size, 52, "duplicate destination ids");
assert.strictEqual(new Set(qa.records.map((r) => r.name)).size, 52, "duplicate destinations");
for (const e of DATA.published(col)) assert.ok(qa.records.some((r) => r.id === e.id && r.public), "published id preserved: " + e.id);
assert.strictEqual(qa.records.filter((r) => r.public).length, DATA.published(col).length);

// 2. manifest fields (extends the existing registry, not a competing database)
const FIELDS = ["destination_id", "destination_name", "primary_image", "primary_image_type", "primary_image_source", "primary_image_credit", "primary_image_rights_status", "fallback_image", "alternative_images", "image_status", "editorial_approval_status"];
const catIds = col.categories.map((c) => c.id);
for (const c of reg) {
  for (const f of FIELDS) assert.ok(c.image_manifest && c.image_manifest[f] !== undefined && c.image_manifest[f] !== "", c.name + " manifest." + f);
  assert.strictEqual(c.image_manifest.editorial_approval_status, "not_approved", "no approvals invented");
  assert.ok(c.categories.length && c.categories.every((k) => catIds.includes(k)), c.name + " categories");
}
const photos = Object.fromEntries(lib.destination_specific.concat(lib.editorial_atmospheric).map((p) => [p.id, p]));
for (const r of qa.records) {
  assert.ok(r.verification && ["partial", "unverified"].includes(r.verification.status));
  assert.strictEqual(r.verification.official_site_checked, false);
  assert.strictEqual(r.dates_hours, null, "no unverified dates/hours");
  assert.ok(r.image_options.length >= 3 && r.image_options[0].src === r.manifest.primary_image);
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
assert.ok(!/sc-qa|Unverified|Hush Haunted/.test(pub));
assert.strictEqual((pub.match(/data-fb=/g) || []).length > 0, true);
for (const e of DATA.published(col)) {
  const rec = qa.records.find((r) => r.id === e.id);
  // the public page keeps its approved image; QA may default to a linked official image (unverified) instead
  if (rec.manifest.primary_image_type !== "linked_official") assert.strictEqual(e.image.src, rec.manifest.primary_image, e.id + " public image == manifest primary");
  assert.deepStrictEqual(e.image.fallbacks, [rec.manifest.fallback_image, rec.manifest.secondary_fallback_image]);
}
const pageHtml = fs.readFileSync(path.join(root, "halloween.html"), "utf8");
assert.ok(!pageHtml.includes("Hush Haunted") && !pageHtml.includes("Slay Nights"), "unverified names not in public HTML");
for (const f of ["seasonal/collections.js", "seasonal/page.js", "seasonal/render.js", "seasonal/image-fallback.js", "halloween.html"]) {
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
assert.strictEqual(call("preview", { c: "fall" }).statusCode, 404);
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

// 8. other seasonal pages unchanged (byte-identical to the integration branch they came from)
try {
  for (const f of ["fall.html", "fall-color.html"]) {
    const base = execFileSync("git", ["show", "origin/feature/seasonal-photography-archive:" + f], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    assert.strictEqual(fs.readFileSync(path.join(root, f), "utf8"), base, f + " changed");
  }
} catch (e) { if (e.code === "ERR_ASSERTION") throw e; /* branch unavailable (shallow checkout): skip */ }
console.log("halloween-qa: ok");

// ---- linked images from the supplied catalogue ----
{
  const linkedFile = require("../api/_lib/seasonal-editorial/linked-images.json");
  const recs = require("../api/_lib/seasonal-editorial/halloween-qa.json").records;
  const byId = Object.fromEntries(recs.map((r) => [r.id, r]));
  {
    assert.strictEqual(linkedFile.images.length, 12);
    linkedFile.images.forEach((l) => {
      assert.ok(byId[l.destination_id], l.destination_id);
      assert.ok(byId[l.destination_id].image_options.some((o) => o.src === l.image_link));
      assert.ok(/^https:\/\//.test(l.image_link));
    });
  }
  {
    recs.forEach((r) => {
      if (r.manifest.primary_image_type === "linked_official") {
        const o = r.image_options[0];
        assert.strictEqual(o.warnings.length, 1);
        assert.strictEqual(o.depicts_actual_destination, true);
        assert.strictEqual(r.manifest.image_status, "linked_unverified");
        assert.ok(/generated|halloween-card/.test(r.manifest.fallback_image));
      }
    });
    ["erebus", "wiards-night-terrors", "scarefest-scream-park", "jack-o-lanterns-among-the-trees", "crossroads-ghosts-goodies", "dearborn-haunted-trail"].forEach((id) =>
      assert.notStrictEqual(byId[id].manifest.primary_image_type.indexOf("linked"), 0, id));
    assert.strictEqual(byId["halloween-greenfield-village"].manifest.primary_image_type, "owner_photo_destination");
  }
}
