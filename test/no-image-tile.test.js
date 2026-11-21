"use strict";
// Owner decision 2026-11-20: an event with no usable photo shows a branded tile in its category colour everywhere
// (home rows, calendar rows, the event page). Owner decision 2026-11-21: no "Photo pending" label on any page.
const assert = require("assert"), fs = require("fs"), path = require("path");
const Categories = require("../categories.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

Categories.list.forEach((c) => {
  const svg = Categories.tileSvg(c.key, "event-1");
  assert.ok(svg.indexOf(c.hex) !== -1, c.key + ": the tile is drawn in the category's own colour");
  assert.ok(/aria-hidden="true"/.test(svg) && !/<image|<text/i.test(svg), c.key + ": decorative, no embedded image or text");
});
assert.strictEqual(Categories.tileSvg("music", "a"), Categories.tileSvg("music", "a"), "same event, same tile");
assert.notStrictEqual(Categories.tileSvg("music", "a"), Categories.tileSvg("music", "b"), "the seed moves the arcs");
assert.ok(Categories.tileSvg("not-a-category", "x").indexOf("#D7FF00") !== -1, "unknown category falls back to the site accent");

const home = read("index.html"), cal = read("calendar.html"), evt = read("event-template.html");
assert.ok(/function artFallbackSvg\(e\)\{\s*return Categories\.tileSvg\(e\.cat/.test(home), "home rows use the shared tile");
assert.ok(!/Photo pending/i.test(home) && !/Photo pending/i.test(cal) && !/Photo pending/i.test(evt), "no 'Photo pending' on cards, lists or the event page");
assert.strictEqual((cal.match(/\$\{thumbBoxHtml\(e\)\}/g) || []).length, 2, "both calendar row templates use the tile slot");
assert.ok(/Categories\.tileSvg\(e\.cat/.test(cal), "calendar slot draws the tile");
assert.ok(/img\.onerror = showTile/.test(evt) && /else \{\s*showTile\(\);/.test(evt), "event page: no image, or one that fails to load, shows the tile");
console.log("PASS: no-image tile in the category colour, no caption");
