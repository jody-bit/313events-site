"use strict";
// Every neighborhood photo is reachable under each spelling the event data can carry, and its file exists.
const assert = require("assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/const NEIGHBORHOOD_PHOTOS = (\{[\s\S]*?\n\});/);
assert.ok(m, "NEIGHBORHOOD_PHOTOS found");
const NEIGHBORHOOD_PHOTOS = new Function(m[1].replace(/^/, "return "))();
const tail = html.slice(m.index + m[0].length, m.index + m[0].length + 600);
assert.ok(/NEIGHBORHOOD_PHOTOS\['Fitzgerald'\] = NEIGHBORHOOD_PHOTOS\['Fitzgerald-Marygrove'\]/.test(tail), "Fitzgerald alias present");
assert.ok(NEIGHBORHOOD_PHOTOS["Fitzgerald-Marygrove"], "Fitzgerald-Marygrove keeps its photo");
assert.ok(NEIGHBORHOOD_PHOTOS["Corktown"] && NEIGHBORHOOD_PHOTOS["Corktown"].file, "Corktown has a photo");
assert.ok(!NEIGHBORHOOD_PHOTOS["Corktown"].credit, "owner photo has no visible credit");
for (const [name, p] of Object.entries(NEIGHBORHOOD_PHOTOS)) {
  if (p && p.file) assert.ok(fs.existsSync(path.join(root, "assets/photography/neighborhoods", p.file)), name + " file exists");
}
console.log("PASS: neighborhood photo keys and files");
