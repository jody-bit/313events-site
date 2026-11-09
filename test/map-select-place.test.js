// test/map-select-place.test.js -- selecting a far place (e.g. Bowling Green at 375px) must recenter
// first and open its popup after the pan, never run Leaflet's popup auto-pan and panTo together.
// Run: node test/map-select-place.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(process.env.REPO_DIR || process.cwd(), "map.html"), "utf8");
const start = html.indexOf("function selectPlace(");
const body = html.slice(start, html.indexOf("function updateMapStat"));
assert.ok(start > 0 && body.length > 100, "selectPlace not found");
assert.ok(!/marker\.openPopup\(\);\s*leafletMap\.panTo/.test(body), "popup must not open before the pan (auto-pan race)");
assert.ok(/marker\.closePopup\(\)/.test(body), "a click's own auto-pan must be cancelled first");
assert.ok(/leafletMap\.once\('moveend'/.test(body) && /leafletMap\.panTo\(target\)/.test(body), "popup opens after the pan completes");
assert.ok(/setTimeout\(openIfStillSelected/.test(body), "fallback if moveend is skipped");
assert.ok(/selectedPlaceKey === key/.test(body), "a stale pan must not open the wrong popup");
// The popup-height rule moved into the shared foundation (/map-foundation.js); map.html must use its default (map-height based), not a fixed height.
const foundationSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "map-foundation.js"), "utf8");
assert.ok(/Math\.max\(160, Math\.min\(320, \(mapHeightPx \|\| 400\) - 100\)\)/.test(foundationSrc) && !/popupMaxHeight/.test(html), "popup must fit the 380px mobile map");
console.log("PASS: selectPlace pans first, then opens the popup; popup height fits the map");
