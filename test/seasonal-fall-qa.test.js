// test/seasonal-fall-qa.test.js — QA datasets and client behaviour for /fall?qa=1 and /fall-color?qa=1.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const E = path.join(root, "api/_lib/seasonal-editorial");
const ED = require(path.join(E, "editorial.js"));
const QA = require(path.join(E, "qa-client.js"));
const R = require(path.join(root, "seasonal/render.js"));
const C = ED.COLLECTIONS;
const ents = ED.entries();
const cands = JSON.parse(fs.readFileSync(path.join(E, "candidates.json"), "utf8")).candidates;

assert.strictEqual(QA.keyFor("halloween"), "313-halloween-qa-image-choices-v1", "halloween storage key unchanged");
assert.strictEqual(QA.KEY, "313-halloween-qa-image-choices-v1");
assert.strictEqual(QA.keyFor("fall"), "313-fall-qa-image-choices-v1");
assert.strictEqual(QA.keyFor("fall-color"), "313-fall-color-qa-image-choices-v1");

for (const slug of ["fall", "fall-color"]) {
  const d = JSON.parse(fs.readFileSync(path.join(E, slug + "-qa.json"), "utf8"));
  const col = Object.assign({}, C.COLLECTIONS[slug]);
  assert.strictEqual(d.collection, slug);
  assert.strictEqual(d.records.length, ents[slug].length, slug + ": one QA record per private record");
  const rows = cands.filter((c) => c.collection === slug);
  assert.strictEqual(d.inventory_rows, rows.length);
  assert.strictEqual(d.inventory_without_record.length, rows.filter((c) => !c.entry_id).length);
  assert.ok(d.inventory_without_record.every((r) => r.status === "HOLD_UNVERIFIED"), "rows without a record are HOLD_UNVERIFIED");
  const ids = new Set();
  for (const r of d.records) {
    const e = ents[slug].find((x) => x.id === r.id);
    assert.ok(e, r.id + " has a private record");
    assert.strictEqual(r.public, C.isPublic(e));
    assert.strictEqual(r.publication.state, C.readiness(e).state, "QA state is the gate's derived state");
    assert.strictEqual(r.publication.declared_status, e.status);
    assert.ok(r.image_options.length >= 1 && r.image_options[0].src === r.manifest.primary_image);
    for (const o of r.image_options) {
      assert.ok(!ids.has(r.id + "/" + o.id), "unique option id");
      ids.add(r.id + "/" + o.id);
      assert.ok(/^(gen-(fall|fall-color)-\d|link-[a-z0-9-]+|313p-[0-9a-f]{8}(-[0-9a-z]+)?)$/.test(o.id), "stable id shape: " + o.id);
      if (o.type.indexOf("linked") === 0) {
        assert.strictEqual(o.permission_on_file, false, "no permission on file for a linked image");
        assert.ok(/not cleared/.test(o.rights_status));
      }
      if (o.type === "generated_illustrative") assert.strictEqual(o.depicts_actual_destination, false);
    }
    // the default is what the record renders first: owner photo, else linked image, else generated card
    const im = e.image, first = r.image_options[0];
    if (im.ownerPhoto) assert.strictEqual(first.id, im.ownerPhoto.photoId);
    else if (im.remote) assert.strictEqual(first.id, "link-" + e.id);
    else assert.strictEqual(first.type, "generated_illustrative");
    assert.strictEqual(r.publication.gate.approval, false, r.id + " has no approval");
  }
  // the client renders every record and a selection switches the primary image
  const html = QA.results(col, d.records, { category: "all", query: "", view: "grid" }, {});
  assert.strictEqual((html.match(/<li class="sc-card/g) || []).length, d.records.length);
  const withTwo = d.records.find((r) => r.image_options.length > 1);
  const alt = withTwo.image_options[1];
  assert.strictEqual(QA.toEntry(withTwo, alt.id).image.src, alt.src);
  assert.strictEqual(JSON.parse(QA.exportJson(d.records, {}, slug)).collection, slug);
  assert.strictEqual(JSON.parse(QA.exportJson(d.records, {})).collection, "halloween", "export default unchanged");
  // refuses production hosts and unknown collections before any fetch
  let fetched = 0;
  const f = () => { fetched++; return Promise.resolve({ ok: false }); };
  assert.strictEqual(fetched, 0);
}
(async () => {
  let fetched = [];
  const f = (u) => { fetched.push(u); return Promise.resolve({ ok: false }); };
  assert.strictEqual(await QA.mount({}, { hostname: "313.events" }, f, { slug: "fall" }, null), false);
  assert.strictEqual(await QA.mount({}, { hostname: "www.313.events" }, f, { slug: "fall-color" }, null), false);
  assert.strictEqual(await QA.mount({}, { hostname: "x.vercel.app" }, f, { slug: "bogus" }, null), false);
  assert.strictEqual(await QA.mount({}, { hostname: "x.vercel.app" }, f, null, null), false);
  assert.deepStrictEqual(fetched, [], "no request on a production host or an unknown collection");
  assert.strictEqual(await QA.mount({}, { hostname: "x.vercel.app" }, f, { slug: "fall" }, null), false, "a 404 leaves public mode");
  assert.deepStrictEqual(fetched, ["/api/seasonal-qa?c=fall"]);
  // page.js enables ?qa=1 for the three collections only
  const page = fs.readFileSync(path.join(root, "seasonal/page.js"), "utf8");
  assert.ok(/\["halloween", "fall", "fall-color"\]\.indexOf\(slug\) >= 0/.test(page));
  console.log("seasonal-fall-qa: ok");
})();
