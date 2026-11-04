"use strict";
// The Preview's inline map-settings script must parse and carry the shared CARTO tile settings with attribution.
const assert = require("assert");
process.env.VERCEL_ENV = "preview";
const preview = require("../api/seasonal-preview.js");
preview.SLUGS.forEach((slug) => {
  const html = preview.html(slug);
  const m = /<script>(window\.SeasonalMapSettings[^<]*)<\/script>/.exec(html);
  assert.ok(m, slug + ": settings script present");
  const w = {};
  new Function("window", m[1])(w);
  const S = w.SeasonalMapSettings;
  assert.ok(/basemaps\.cartocdn\.com/.test(S.tileUrl), slug + ": CARTO tiles");
  assert.ok(/OpenStreetMap/.test(S.attribution) && /CARTO/.test(S.attribution), slug + ": attribution names OSM and CARTO");
});
console.log("ok seasonal-preview-map-settings");
