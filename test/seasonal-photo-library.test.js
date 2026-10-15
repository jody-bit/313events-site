// Owner photo library for the seasonal collections: files exist, no location
// data ships, classifications are honest, and registry links are consistent.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const DATA = require(path.join(root, "seasonal/collections.js"));
const lib = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/photo-library.json"), "utf8"));
const cand = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/candidates.json"), "utf8")).candidates;

const all = lib.destination_specific.concat(lib.editorial_atmospheric);
const ids = new Set();
for (const p of all) {
  assert.ok(!ids.has(p.id), "duplicate photo id " + p.id); ids.add(p.id);
  assert.ok(["DESTINATION_SPECIFIC", "EDITORIAL_ATMOSPHERIC"].includes(p.classification), p.id + " classification");
  for (const k of ["card", "full"]) {
    const f = path.join(root, p.files[k]);
    assert.ok(fs.existsSync(f), p.id + " missing " + k);
    const head = fs.readFileSync(f).subarray(0, 4096).toString("latin1");
    assert.ok(!/EXIF|Exif|GPS/.test(head), p.id + " " + k + " carries EXIF/GPS");
  }
  const keys = JSON.stringify(p).match(/"([a-z_]+)":/gi).map((k) => k.slice(1, -2).toLowerCase());
  assert.ok(!keys.some((k) => ["lat", "lng", "lon", "latitude", "longitude", "gps", "coordinates", "geo"].includes(k)), p.id + " stores location data");
  assert.ok(!/-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/.test(JSON.stringify(p)), p.id + " contains a coordinate pair");
  assert.strictEqual(p.illustrative, false);
}
for (const p of lib.destination_specific) {
  assert.strictEqual(p.classification, "DESTINATION_SPECIFIC");
  const c = cand.filter((c) => c.collection === p.destination.collection && c.name === p.destination.name);
  assert.ok(c.some((c) => (c.photos || []).includes(p.id)), p.id + " not linked from its candidate");
}
for (const p of lib.editorial_atmospheric) {
  assert.strictEqual(p.classification, "EDITORIAL_ATMOSPHERIC");
  assert.ok(!p.destination || !p.destination.published_id, p.id + " atmospheric photo must not claim a destination");
}
// every candidate photo reference resolves
for (const c of cand) for (const id of c.photos || []) assert.ok(ids.has(id), c.name + " references unknown photo " + id);
// every record using owner photography (published or not) points at a destination-specific photo of that entry
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const byId = Object.fromEntries(lib.destination_specific.map((p) => [p.id, p]));
let owned = 0;
const entries = ED.entries();
for (const slug of DATA.ORDER) for (const e of entries[slug]) {
  const op = e.image.ownerPhoto;
  if (!op) continue;
  owned++;
  const p = byId[op.photoId];
  assert.ok(p, e.id + " ownerPhoto.photoId unknown");
  assert.strictEqual(p.destination.published_id, e.id, e.id + " uses a photo of another destination");
  assert.strictEqual(e.image.src, p.files.card);
}
assert.strictEqual(owned, 15, "3 Halloween owner photos, plus Diehl's, Highland and Wiard's Orchards (launch 1) and three other fall/fall-color records that carry one (Oak Openings now shows a labelled illustration; its photograph is parked as an unresolved candidate)");
// no originals in the repo
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]);
assert.ok(!walk(path.join(root, "assets/seasonal")).some((f) => /\.(heic|heif|dng|mov)$/i.test(f)), "original files committed");
console.log("seasonal-photo-library: ok (" + all.length + " photos)");
