// test/seasonal-historic-badge.test.js — opt-in "Historic photo" badge (owner decision 2026-10-19, Almar Orchards).
// Only a record whose image says historic === true (and is not an illustration) gets the badge. It is not the "Illustrative image"
// fallback badge, every other card is unchanged, and Almar's own publication state is untouched (unapproved, not public).
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const R = require(path.join(root, "seasonal/render.js"));
const E = ED.entries();

const draw = (slug, pe) => R.card(Object.assign({}, ED.COLLECTIONS.COLLECTIONS[slug], { entries: [pe] }), pe, {});
const sample = JSON.parse(JSON.stringify(E.fall.find((e) => e.id === "damouni-orchards")));
const plain = ED.publicEntry(sample);
assert.ok(!("historic" in plain.image), "no historic key unless opted in");
assert.ok(!/sc-hist|Historic photo|Illustrative image/.test(draw("fall", plain)), "an ordinary photo card is unchanged");

// opted in: the badge, and only the badge
const histEntry = Object.assign(JSON.parse(JSON.stringify(sample)), {});
histEntry.image.historic = true;
const h = ED.publicEntry(histEntry);
assert.strictEqual(h.image.historic, true);
const html = draw("fall", h);
assert.ok(/<span class="sc-hist">Historic photo<\/span>/.test(html), "the badge is drawn");
assert.ok(!/Illustrative image|sc-illus|sc-credit|Photo:/.test(html), "not the illustrative badge, and no visible credit");
// only an explicit true counts, and an illustration never carries it
for (const v of [false, "true", 1, null]) { const x = JSON.parse(JSON.stringify(sample)); x.image.historic = v; assert.ok(!("historic" in ED.publicEntry(x).image), "historic=" + JSON.stringify(v) + " is ignored"); }
{ const x = JSON.parse(JSON.stringify(sample)); x.image.historic = true; x.image.illustrative = true; assert.ok(!("historic" in ED.publicEntry(x).image), "an illustration is never a historic photo"); }
assert.ok(/\.sc-hist\{/.test(fs.readFileSync(path.join(root, "seasonal/seasonal.css"), "utf8")), "badge style exists");

// every published record is unchanged: none is flagged historic
for (const slug of ED.COLLECTIONS.ORDER) for (const e of E[slug] || []) if (ED.COLLECTIONS.isPublic(e)) assert.ok(!(e.image && e.image.historic), slug + "/" + e.id + ": no published card is historic");

// Almar: image prepared, publication state untouched
const a = E.fall.find((e) => e.id === "almar-orchards"), ai = a.image;
assert.strictEqual(a.status, "CONTENT_VERIFIED");
assert.ok(!a.approval && !ED.COLLECTIONS.isPublic(a), "Almar stays unapproved and not public");
assert.strictEqual(ai.historic, true);
assert.strictEqual(ai.illustrative, false);
assert.ok(!ai.credit && !ai.remote, "no visible credit, no hotlink");
assert.ok(ai.provenance && /almar-orchards\.com/.test(ai.provenance.sourcePage) && ai.provenance.retrievedAt === "2026-10-19" && /Not cleared/.test(ai.provenance.rights) && /photographer unknown/.test(ai.provenance.kind), "provenance kept privately");
assert.strictEqual(ai.src, ai.acquired.file);
const f = path.join(root, ai.acquired.file.replace(/^\//, ""));
assert.strictEqual(fs.statSync(f).size, ai.acquired.bytes);
assert.strictEqual(require("crypto").createHash("sha256").update(fs.readFileSync(f)).digest("hex"), ai.acquired.sha256);
// QA review mode: the badge can be reviewed in a preview (/fall?qa=1). The QA dataset carries Almar's archival option as the default,
// toEntry passes historic through for that option only, and no other record's QA card changes.
{
  const QA = require(path.join(root, "api/_lib/seasonal-editorial/qa-client.js"));
  const qa = require(path.join(root, "api/_lib/seasonal-editorial/fall-qa.json"));
  const rec = qa.records.find((r) => r.id === "almar-orchards");
  assert.strictEqual(rec.image_options[0].id, "archival-almar-orchards");
  assert.strictEqual(rec.image_options[0].historic, true);
  assert.ok(!rec.public && rec.launch === null, "Almar stays non-public and is not a launch record");
  const e = QA.toEntry(rec, undefined);
  assert.strictEqual(e.image.historic, true);
  assert.ok(/Historic photo/.test(R.card(ED.COLLECTIONS.COLLECTIONS.fall, e, {})), "QA card shows the badge");
  assert.ok(!("historic" in QA.toEntry(rec, "gen-fall-1").image), "choosing the illustration drops it");
  for (const slug of ["fall", "fall-color", "halloween"]) {
    const d = require(path.join(root, "api/_lib/seasonal-editorial/" + slug + "-qa.json"));
    for (const r of d.records) for (const o of r.image_options) if (o.historic) assert.strictEqual(r.id, "almar-orchards", slug + "/" + r.id + ": only Almar carries a historic option");
  }
}
console.log("seasonal historic badge: ok");
