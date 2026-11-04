"use strict";
// The collection Map view consumes the shared map foundation: no second provider config, tile URL, key or Leaflet loader in seasonal/.
const assert = require("assert"), fs = require("fs"), path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
["seasonal/map-view.js", "seasonal/page.js", "api/seasonal-preview.js"].forEach((f) => {
  const src = read(f);
  assert.ok(!/cartocdn|cb1_2w25|tile\.openstreetmap|unpkg\.com\/leaflet|SeasonalMapSettings/.test(src), f + ": provider config belongs to map-foundation.js");
});
assert.ok(/MapFoundation\.create|MF\.create/.test(read("seasonal/map-view.js")), "map-view.js creates its map through the foundation");
console.log("ok seasonal-map-uses-foundation");
