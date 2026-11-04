"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const MF = require("../map-foundation.js");

function fakeL() {
  const log = { tiles: [], circles: [], removed: 0, popups: [] };
  const mkMarker = (ll, o) => ({ ll, o, _h: {}, addTo() { this.kind = 'marker'; return this; }, bindPopup() { return this; }, on(e, f) { this._h[e] = f; return this; }, getLatLng() { return this.ll; }, openPopup() {} });
  const mk = (ll, st) => ({ ll, st, _h: {}, addTo() { log.circles.push(this); return this; }, bindPopup(h, o) { log.popups.push({ h, o }); return this; }, on(e, f) { this._h[e] = f; return this; }, getLatLng() { return this.ll; }, openPopup() { this.opened = true; } });
  const map = { _h: {}, scrollWheelZoom: { enable() { map.sw = true; }, disable() { map.sw = false; } }, setView() { return map; }, on(e, f) { map._h[e] = f; }, removeLayer() { log.removed++; }, panTo(ll) { map.panned = ll; }, closePopup() {}, invalidateSize() {}, getSize: () => ({ y: 500 }), fitBounds(b, o) { map.fit = { b, o }; }, remove() { map.gone = true; } };
  return { log, map, L: { marker: (ll, o) => { const m = mkMarker(ll, o); log.circles.push(m); return m; }, divIcon: (o) => o, map: () => map, tileLayer: (u, o) => { const t = { u, o, on(e, f) { t[e] = f; }, addTo() { log.tiles.push(t); return t; } }; return t; }, circleMarker: mk } };
}
function fakeEl() { return { attrs: {}, html: "", setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, insertAdjacentHTML(_w, h) { this.html += h; }, clientHeight: 380 }; }

// 1. one provider config: the URL and attribution equal what the live pages use today (no silent drift while they migrate)
const MIGRATED = ["calendar.html", "map.html"]; // pages already on the foundation (each moved in its own PR)
for (const page of ["map.html", "calendar.html"]) {
  const src = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
  if (MIGRATED.includes(page)) {
    assert.ok(/<script src="\/map-foundation\.js"><\/script>/.test(src), page + " loads the foundation");
    assert.ok(src.indexOf("map-foundation.js") > src.indexOf("leaflet@1.9.4/dist/leaflet.js"), page + " loads the foundation after Leaflet");
    assert.ok(!src.includes(MF.PROVIDER.key) && !/basemaps\.cartocdn\.com/.test(src) && !/L\.tileLayer|L\.circleMarker/.test(src), page + " keeps no private tile config or pin code");
    assert.ok(/MapFoundation\.create\(/.test(src) && /\.setPlaces\(/.test(src), page + " draws through the foundation");
  } else {
    assert.ok(src.includes(MF.PROVIDER.key), page + " must still use the same tile key as the foundation");
    assert.ok(src.includes("basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"), page + " tile URL pattern");
  }
}
for (const page of MIGRATED) assert.strictEqual((fs.readFileSync(path.join(__dirname, "..", page), "utf8").match(/leaflet\.js/g) || []).length, 1, page + ": one Leaflet library");
assert.strictEqual(MF.tileUrl(), "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=" + MF.PROVIDER.key);
assert.ok(/OpenStreetMap/.test(MF.PROVIDER.attribution) && /CARTO/.test(MF.PROVIDER.attribution), "attribution stays visible");
console.log("PASS: one provider config, same URL and key as the live pages, attribution present");

// 2. pin styling is the live rule
assert.deepStrictEqual(MF.pinStyle({ count: 1, precise: true, hex: "#112233" }), { radius: 10, color: "#112233", weight: 2, dashArray: null, fillColor: "#112233", fillOpacity: 0.6 });
const city = MF.pinStyle({ count: 400, precise: false });
assert.strictEqual(city.radius, 22); assert.strictEqual(city.dashArray, "3,3"); assert.strictEqual(city.fillOpacity, 0.35); assert.strictEqual(city.color, "#D7FF00");
assert.strictEqual(MF.popupOptions(380).maxHeight, 280); assert.strictEqual(MF.popupOptions(380, 320).maxHeight, 320, "a fixed height wins (calendar keeps its 320)"); assert.strictEqual(MF.popupOptions(100).maxHeight, 160); assert.strictEqual(MF.popupOptions(900).maxHeight, 320);
console.log("PASS: pin style and popup sizing match the live maps");

// 3. create: ready path, pins, select, accessibility, scroll rule
{
  const { L, log, map } = fakeL(); const el = fakeEl();
  const ctl = MF.create(el, { label: "Map of Detroit-area events", announce: true }, { L });
  assert.ok(ctl.ready); assert.strictEqual(el.attrs.role, "group");
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
{ const { L } = fakeL(); const e2 = fakeEl(); MF.create(e2, {}, { L }); assert.strictEqual(e2.attrs.role, undefined, "no label means no role: live maps keep their markup"); }
console.log("PASS: create, pins, select, aria-label and scroll rule");

// 3a. by default a migrating page keeps its exact aria-label
{
  const { L } = fakeL(); const el = fakeEl(); const ctl = MF.create(el, { label: "Map of Detroit-area events" }, { L });
  ctl.setPlaces([{ key: "a", lat: 1, lng: 2, count: 1 }]);
  assert.strictEqual(el.attrs["aria-label"], "Map of Detroit-area events", "announce is opt-in");
}
console.log("PASS: aria-label unchanged unless announce is on");

// 3b. icon places become keyboard-focusable 44px markers with the page's own markup; circles remain the default
{
  const { L, log } = fakeL(); const ctl = MF.create(fakeEl(), {}, { L });
  ctl.setPlaces([{ key: "c", lat: 1, lng: 2, title: "Diehl's Orchard", icon: { className: "sc-pin", html: "<span></span>" } }, { key: "d", lat: 3, lng: 4, count: 2 }]);
  const [icon, circle] = log.circles;
  assert.strictEqual(icon.kind, "marker"); assert.strictEqual(icon.o.keyboard, true); assert.strictEqual(icon.o.title, "Diehl's Orchard"); assert.deepStrictEqual(icon.o.icon.iconSize, [44, 44]);
  assert.ok(!circle.kind, "no icon means the live circle pin");
}
console.log("PASS: icon places are keyboard-focusable markers; circles stay the default");

// 4. failure states are visible, never silent and never throw
{
  const el = fakeEl(); const ctl = MF.create(el, {}, { L: null });
  assert.strictEqual(ctl.ready, false); assert.strictEqual(el.innerHTML, MF.UNAVAILABLE_HTML);
  assert.doesNotThrow(() => { ctl.setPlaces([{ key: 'a', lat: 1, lng: 2 }]); ctl.select('a'); ctl.invalidate(); }, 'an inert controller is callable');
  const { L, log } = fakeL(); const el2 = fakeEl(); MF.create(el2, {}, { L });
  for (let i = 0; i < 7; i++) log.tiles[0].tileerror(); assert.strictEqual(el2.html, "", "a few failed tiles are normal");
  log.tiles[0].tileerror(); assert.ok(/map background is temporarily unavailable/.test(el2.html), "a refused key shows a visible notice");
  log.tiles[0].tileerror(); assert.strictEqual((el2.html.match(/tiles-notice/g) || []).length, 1, "the notice appears once");
  const seen = []; const { L: L3, log: log3 } = fakeL(); const el3 = fakeEl(); MF.create(el3, { onTilesFailed: (n) => seen.push(n) }, { L: L3 });
  for (let i = 0; i < 12; i++) log3.tiles[0].tileerror();
  assert.deepStrictEqual(seen, [8], "a page-supplied handler replaces the default notice and fires once"); assert.strictEqual(el3.html, "");
}
console.log("PASS: missing library and refused tiles show a visible message, never throw");

// 5. Leaflet loads once: an existing L is reused, and no second loader is created
(async () => {
  const { L } = fakeL();
  assert.strictEqual(await MF.loadLeaflet({ L }), L);
  console.log("PASS: an already-loaded Leaflet is reused (no duplicate library)");
})().catch((e) => { console.error("FAIL:", e); process.exitCode = 1; });

// 8. keyboard: Enter on a focusable pin moves focus into its popup; Escape inside the map closes it and returns focus to the pin
{
  const { L, map } = fakeL(); const el = fakeEl(); const handlers = {};
  el.addEventListener = (type, fn, capture) => { handlers[type] = { fn, capture }; };
  const ctl = MF.create(el, { label: "x" }, { L });
  assert.ok(handlers.keydown && handlers.keydown.capture === true, "one capturing keydown handler on the map element");
  let closed = 0, focused = 0, linkFocused = 0, stopped = 0;
  map.closePopup = () => { closed++; map._popup = null; };
  ctl.setPlaces([{ key: "a", lat: 1, lng: 2, title: "A", icon: { className: "p", html: "", size: 44 }, popupHtml: "<a href='#'>x</a>" }]);
  const pin = ctl.markers.get("a"); pin.getElement = () => ({ focus() { focused++; } });
  pin._h.popupopen({ popup: { getElement: () => ({ querySelector: () => ({ focus() { linkFocused++; } }) }) } });
  assert.strictEqual(linkFocused, 0, "a popup opened by mouse does not take focus");
  handlers.keydown.fn({ key: "Enter", target: { classList: { contains: (c) => c === "leaflet-marker-icon" } } });
  pin._h.popupopen({ popup: { getElement: () => ({ querySelector: () => ({ focus() { linkFocused++; } }) }) } });
  assert.strictEqual(linkFocused, 1, "Enter on a pin moves focus to the first link in its popup");
  map._popup = {};
  handlers.keydown.fn({ key: "Escape", target: {}, stopPropagation() { stopped++; } });
  assert.deepStrictEqual([closed, focused, stopped], [1, 1, 1], "Escape closes the popup and refocuses the pin that opened it");
  handlers.keydown.fn({ key: "Escape", target: {}, stopPropagation() { stopped++; } });
  assert.strictEqual(closed, 1, "Escape with no popup open does nothing");
  console.log("PASS: pin keyboard operation (Enter into popup, Escape back to pin)");
}
