"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const MF = require("../map-foundation.js");

function fakeL() {
  const log = { tiles: [], circles: [], removed: 0, popups: [] };
  const mk = (ll, st) => ({ ll, st, _h: {}, addTo() { log.circles.push(this); return this; }, bindPopup(h, o) { log.popups.push({ h, o }); return this; }, on(e, f) { this._h[e] = f; return this; }, getLatLng() { return this.ll; }, openPopup() { this.opened = true; } });
  const map = { _h: {}, scrollWheelZoom: { enable() { map.sw = true; }, disable() { map.sw = false; } }, setView() { return map; }, on(e, f) { map._h[e] = f; }, removeLayer() { log.removed++; }, panTo(ll) { map.panned = ll; }, closePopup() {}, invalidateSize() {}, getSize: () => ({ y: 500 }), fitBounds(b, o) { map.fit = { b, o }; }, remove() { map.gone = true; } };
  return { log, map, L: { map: () => map, tileLayer: (u, o) => { const t = { u, o, on(e, f) { t[e] = f; }, addTo() { log.tiles.push(t); return t; } }; return t; }, circleMarker: mk } };
}
function fakeEl() { return { attrs: {}, html: "", setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, insertAdjacentHTML(_w, h) { this.html += h; }, clientHeight: 380 }; }

// 1. one provider config: the URL and attribution equal what the live pages use today (no silent drift while they migrate)
for (const page of ["map.html", "calendar.html"]) {
  const src = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
  assert.ok(src.includes(MF.PROVIDER.key), page + " must still use the same tile key as the foundation");
  assert.ok(src.includes("basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"), page + " tile URL pattern");
}
assert.strictEqual(MF.tileUrl(), "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=" + MF.PROVIDER.key);
assert.ok(/OpenStreetMap/.test(MF.PROVIDER.attribution) && /CARTO/.test(MF.PROVIDER.attribution), "attribution stays visible");
console.log("PASS: one provider config, same URL and key as the live pages, attribution present");

// 2. pin styling is the live rule
assert.deepStrictEqual(MF.pinStyle({ count: 1, precise: true, hex: "#112233" }), { radius: 10, color: "#112233", weight: 2, dashArray: null, fillColor: "#112233", fillOpacity: 0.6 });
const city = MF.pinStyle({ count: 400, precise: false });
assert.strictEqual(city.radius, 22); assert.strictEqual(city.dashArray, "3,3"); assert.strictEqual(city.fillOpacity, 0.35); assert.strictEqual(city.color, "#D7FF00");
assert.deepStrictEqual(MF.popupOptions(380).maxHeight, 280); assert.strictEqual(MF.popupOptions(100).maxHeight, 160); assert.strictEqual(MF.popupOptions(900).maxHeight, 320);
console.log("PASS: pin style and popup sizing match the live maps");

// 3. create: ready path, pins, select, accessibility, scroll rule
{
  const { L, log, map } = fakeL(); const el = fakeEl();
  const ctl = MF.create(el, { label: "Map of Detroit-area events" }, { L });
  assert.ok(ctl.ready); assert.strictEqual(el.attrs.role, "img");
  assert.strictEqual(log.tiles[0].o.attribution, MF.PROVIDER.attribution);
  map._h.focus(); assert.strictEqual(map.sw, true); map._h.blur(); assert.strictEqual(map.sw, false);
  const clicks = [];
  ctl.setPlaces([{ key: "a", lat: 1, lng: 2, count: 3, precise: true, hex: "#fff", popupHtml: "<b>A</b>" }, { key: "b", lat: 3, lng: 4, count: 1, precise: false }], (k) => clicks.push(k));
  assert.strictEqual(log.circles.length, 2); assert.strictEqual(log.popups.length, 1, "no popup when the page gave none");
  assert.strictEqual(el.attrs["aria-label"], "Map of Detroit-area events: 2 places shown");
  log.circles[0]._h.click(); assert.deepStrictEqual(clicks, ["a"]);
  assert.ok(ctl.select("a") && map.panned[0] === 1 && !ctl.select("zzz"));
  ctl.setPlaces([]); assert.strictEqual(log.removed, 2, "old pins are removed on every redraw"); assert.strictEqual(el.attrs["aria-label"], "Map of Detroit-area events: 0 places shown");
  ctl.fitTo([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]); assert.strictEqual(map.fit.o.maxZoom, 13);
  ctl.destroy(); assert.ok(map.gone && !ctl.ready);
}
console.log("PASS: create, pins, select, aria-label and scroll rule");

// 4. failure states are visible, never silent and never throw
{
  const el = fakeEl(); const ctl = MF.create(el, {}, { L: null });
  assert.strictEqual(ctl.ready, false); assert.strictEqual(el.innerHTML, MF.UNAVAILABLE_HTML);
  assert.doesNotThrow(() => { ctl.setPlaces([{ key: 'a', lat: 1, lng: 2 }]); ctl.select('a'); ctl.invalidate(); }, 'an inert controller is callable');
  const { L, log } = fakeL(); const el2 = fakeEl(); MF.create(el2, {}, { L });
  for (let i = 0; i < 7; i++) log.tiles[0].tileerror(); assert.strictEqual(el2.html, "", "a few failed tiles are normal");
  log.tiles[0].tileerror(); assert.ok(/map background is temporarily unavailable/.test(el2.html), "a refused key shows a visible notice");
  log.tiles[0].tileerror(); assert.strictEqual((el2.html.match(/tiles-notice/g) || []).length, 1, "the notice appears once");
}
console.log("PASS: missing library and refused tiles show a visible message, never throw");

// 5. Leaflet loads once: an existing L is reused, and no second loader is created
(async () => {
  const { L } = fakeL();
  assert.strictEqual(await MF.loadLeaflet({ L }), L);
  console.log("PASS: an already-loaded Leaflet is reused (no duplicate library)");
})().catch((e) => { console.error("FAIL:", e); process.exitCode = 1; });
