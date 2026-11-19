"use strict";
// Every neighborhood photo file exists; Corktown (owner photo) is present with no visible credit.
const assert = require("assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/const NEIGHBORHOOD_PHOTOS = (\{[\s\S]*?\n\});/);
assert.ok(m, "NEIGHBORHOOD_PHOTOS found");
const NEIGHBORHOOD_PHOTOS = new Function(m[1].replace(/^/, "return "))();
assert.ok(NEIGHBORHOOD_PHOTOS["Fitzgerald-Marygrove"], "Fitzgerald-Marygrove keeps its photo");
assert.ok(NEIGHBORHOOD_PHOTOS["Corktown"] && NEIGHBORHOOD_PHOTOS["Corktown"].file, "Corktown has a photo");
for (const n of ["Corktown", "Belle Isle", "New Center", "Rivertown"]) {
  assert.ok(NEIGHBORHOOD_PHOTOS[n] && NEIGHBORHOOD_PHOTOS[n].file && NEIGHBORHOOD_PHOTOS[n].alt, n + " has a photo with alt text");
  assert.ok(!NEIGHBORHOOD_PHOTOS[n].credit && !NEIGHBORHOOD_PHOTOS[n].attribution, n + " owner photo has no visible credit");
}
assert.ok(!NEIGHBORHOOD_PHOTOS["Milwaukee Junction"], "Milwaukee Junction fallback is not mapped");
for (const [name, p] of Object.entries(NEIGHBORHOOD_PHOTOS)) {
  if (p && p.file) assert.ok(fs.existsSync(path.join(root, "assets/photography/neighborhoods", p.file)), name + " file exists");
}
console.log("PASS: neighborhood photo keys and files");
