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
  const rows = cands.filter((c) => c.collection === slug);
  assert.strictEqual(d.records.length, rows.length, slug + ": one QA record per inventory row");
  const ids = new Set();
  for (const r of d.records) {
    const e = ents[slug].find((x) => x.id === r.id);
    if (!e) { assert.strictEqual(r.public, false); assert.strictEqual(r.publication.state, "HOLD_UNVERIFIED", r.id + ": no record yet is HOLD_UNVERIFIED"); }
    else {
      assert.strictEqual(r.public, C.isPublic(e));
      assert.strictEqual(r.publication.state, C.readiness(e).state, "QA state is the gate's derived state");
      assert.strictEqual(r.publication.declared_status, e.status);
    }
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
    // an owner-photo record defaults to its photo
    if (e && e.image.ownerPhoto) assert.strictEqual(r.image_options[0].id, e.image.ownerPhoto.photoId);
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

// ---- launch proposal 1: the proposed records are READY_FOR_REVIEW only, never approved, never public
{
  const launch = JSON.parse(fs.readFileSync(path.join(E, "launch-1.json"), "utf8"));
  const log = JSON.parse(fs.readFileSync(path.join(E, "verification-2026-10-11.json"), "utf8")).collections;
  assert.strictEqual(launch.collections.fall.length, 11);
  assert.strictEqual(launch.collections["fall-color"].length, 5);
  assert.ok(/PROPOSED/.test(launch.status) && /Nothing/.test(launch.status));
  for (const slug of ["fall", "fall-color"]) {
    const d = JSON.parse(fs.readFileSync(path.join(E, slug + "-qa.json"), "utf8"));
    assert.strictEqual(d.launch.proposed, launch.collections[slug].length);
    assert.deepStrictEqual(d.records.filter((r) => r.launch).map((r) => r.id).sort(), launch.collections[slug].slice().sort(), slug + ": QA flags exactly the launch-1 records");
    for (const id of launch.collections[slug]) {
      const e = ents[slug].find((x) => x.id === id), g = C.gate(e), r = d.records.find((x) => x.id === id);
      assert.ok(e, id + " exists");
      assert.strictEqual(e.status, "READY_FOR_REVIEW", id);
      assert.strictEqual(C.readiness(e).state, "READY_FOR_REVIEW", id);
      assert.ok(!e.approval && !C.isPublic(e), id + ": proposed, not approved, not public");
      assert.ok(g.official && g.relevance && g.identity && g.acquired && g.rights && !g.approval, id + ": gate items 1-4 only");
      assert.ok(["owner-photo", "illustration"].includes(g.imageRoute), id + " image route " + g.imageRoute);
      assert.ok(!e.image.remote, id + ": no linked image on a launch record");
      assert.ok(/^https:\/\//.test(e.website), id + " has an https official URL");
      const off = e.evidence.find((x) => x.level === "official");
      assert.ok(off && /two/.test(off.note) && off.checkedAt === "2026-10-11", id + " official evidence is dated and describes the reads");
      assert.ok(e.relevance.basis && e.relevance.note, id + " relevance states its basis");
      assert.ok(!("hours" in e) && !("admission" in e) && !("dates" in e));
      if (g.imageRoute === "illustration") { assert.strictEqual(e.image.illustrative, true); assert.strictEqual(r.launch.image_depicts_destination, false); }
      else { assert.strictEqual(e.image.illustrative, false); assert.ok(e.image.ownerPhoto); }
      assert.strictEqual(r.launch.image_route, g.imageRoute);
      // two independent reads are on file in the verification log
      const led = cands.find((c) => c.collection === slug && c.entry_id === id);
      assert.ok(led, id + " has a ledger row");
      const row = log[slug].find((x) => x.name === led.name && x.pass2);
      assert.ok(row, id + " has a second-pass read in the verification log");
      assert.ok(row.pass1 && row.pass1.official_found, id + " has a first-pass read in the verification log");
      assert.notStrictEqual(row.pass2.verdict, "not-confirmed");
    }
    // a parked linked image is an unadopted alternative: never the default, flagged as parked
    for (const r of d.records) for (const o of r.image_options) if (o.parked) {
      assert.ok(r.image_options[0].id !== o.id, r.id + ": a parked image is never the default");
      assert.ok(/Parked/.test(o.warnings[0]));
    }
    // the launch preview draws only proposed records, with the public card, the illustration badge and a proposed-not-approved line
    const lr = QA.launchRecords(d.records);
    assert.strictEqual(lr.length, launch.collections[slug].length);
    const grid = QA.launchResults(C.COLLECTIONS[slug], d.records, { category: "all", query: "", view: "grid" });
    assert.strictEqual((grid.match(/<li class="sc-card/g) || []).length, lr.length);
    assert.strictEqual((grid.match(/PROPOSED, not approved/g) || []).length, lr.length);
    assert.ok(!/data-qa-pick|<details/.test(grid), "the launch preview has no QA selectors");
    const illus = lr.filter((r) => r.launch.image_route === "illustration").length;
    assert.strictEqual((grid.match(/Illustrative image<\/span>/g) || []).length, illus, "every illustration card carries the badge; owner photos do not");
    assert.ok(/sc-rail/.test(QA.launchRail(C.COLLECTIONS[slug], d.records)) === lr.some((r) => r.launch.featured));
  }
  const bad = { launch: { image_note: "x" }, publication: { state: "READY_FOR_REVIEW" } };
  assert.ok(QA.launchRecords([bad, { id: "z" }]).length === 1);
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
