// map-foundation.js: the ONE map presentation layer (Jody, 2026-11-04: "reuse one shared map foundation across the events map,
// calendar map and collection maps; future map redesigns and provider changes flow through it").
//
// STAGE 1 (this file): new and unused by the live pages, so nothing live changes. Stage 2 moves calendar.html and map.html onto it,
// one page per PR, each proven by the same tests. Stage 3 builds the collection maps on it.
//
// SHARED HERE: basemap provider config (URL, key, attribution, one key, one place to change provider), Leaflet loading (once),
// map creation (scroll-wheel rule, focus handling), pin styling, popup sizing, loading and error states (library failed, tiles
// refused/over quota), and accessible labelling. PAGE-SPECIFIC, always: which places/events to show, initial and locked filters,
// the controls and layout around the map, and the popup HTML for its own records (adapted into the common place format below).
//
// COMMON PLACE FORMAT (what a page's adapter hands to setPlaces):
//   { key: string (unique), lat: number, lng: number, count: number (events here), precise: boolean (single venue vs city centroid),
//     hex: "#rrggbb" (pin colour; pages take it from Categories.pinHexMap()), popupHtml: string (page-built, already escaped) }
// Collection records and event records stay different in their own databases; each page adapts its records into this one shape.
//
// Browser global `MapFoundation`; also module.exports for tests. `L` and `document` are injectable.
(function (root) {
  "use strict";

  // ---- Provider: change the basemap provider HERE and every map follows. ----
  // CARTO's free commercial allowance is 1,000,000 tile requests per UTC calendar month across all keys, from 1 Dec 2026
  // (carto.com/legal/basemap-terms Sec 12.d; the 5,000,000 figure is CARTO's NON-commercial limit). Above the limit CARTO may
  // block the key without notice; there is no automatic overage charge and no automatic upgrade. Usage: dashboard.basemaps.carto.com.
  // Keep the OpenStreetMap and CARTO attribution visible; that is what the free tier is in exchange for.
  var PROVIDER = {
    name: "CARTO dark_all",
    urlTemplate: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    key: "cb1_2w25_1_4715a1af021de1017d3ef172", // public by design (tile key in page source); restrict its allowed hosts in the CARTO dashboard
    keyParam: "key",
    subdomains: "abcd",
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  };

  var DEFAULT_CENTER = [42.3314, -83.0458];
  var DEFAULT_ZOOM = 9;
  var FALLBACK_HEX = "#D7FF00";
  var TILE_ERROR_NOTICE_AFTER = 8; // refused tiles before the visible notice (a blocked key must not fail silently)

  function tileUrl(provider) {
    var p = provider || PROVIDER;
    return p.urlTemplate + (p.key ? "?" + p.keyParam + "=" + encodeURIComponent(p.key) : "");
  }

  // Pin look: size grows with event count; a city centroid (not a single venue) is dashed and fainter. Same rule the live maps use.
  function pinStyle(place) {
    var count = place.count || 1;
    var hex = place.hex || FALLBACK_HEX;
    return {
      radius: Math.min(22, Math.max(7, 6 + Math.sqrt(count) * 4)),
      color: hex,
      weight: place.precise ? 2 : 1.5,
      dashArray: place.precise ? null : "3,3",
      fillColor: hex,
      fillOpacity: place.precise ? 0.6 : 0.35,
    };
  }

  // Popups scroll inside themselves instead of growing taller than the map (real bug on the live site, 2026-08-30).
  function popupOptions(mapHeightPx) {
    return { maxWidth: 260, maxHeight: Math.max(160, Math.min(320, (mapHeightPx || 400) - 100)), autoPanPadding: [24, 24], keepInView: true };
  }

  var leafletPromise = null;
  // Load Leaflet once for the whole page. Pages that already include the tags are respected (no duplicate library).
  function loadLeaflet(deps) {
    var d = deps || {};
    var L = d.L || root.L;
    if (L) return Promise.resolve(L);
    if (leafletPromise) return leafletPromise;
    var doc = d.document || root.document;
    leafletPromise = new Promise(function (resolve, reject) {
      if (!doc) return reject(new Error("no document"));
      var css = doc.createElement("link");
      css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="; css.crossOrigin = "";
      var js = doc.createElement("script");
      js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      js.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="; js.crossOrigin = "";
      js.onload = function () { root.L ? resolve(root.L) : reject(new Error("Leaflet failed to load")); };
      js.onerror = function () { leafletPromise = null; reject(new Error("Leaflet failed to load")); };
      doc.head.appendChild(css); doc.head.appendChild(js);
    });
    return leafletPromise;
  }

  var UNAVAILABLE_HTML = '<div class="map-unavailable">Map tiles didn\'t load — you can still browse every event in the list below.</div>';
  var TILES_BLOCKED_HTML = '<div class="map-tiles-notice" role="status">The map background is temporarily unavailable. Pins and the list still work.</div>';

  // create(el, opts, deps) -> controller. Never throws: if Leaflet is missing the element shows the standard message and the
  // controller is inert (ready === false), so the page's list and filters keep working.
  function create(el, opts, deps) {
    var o = opts || {};
    var d = deps || {};
    var L = d.L || root.L;
    var ctl = { ready: false, map: null, markers: new Map(), places: [] };
    ["setPlaces", "select", "closePopup", "invalidate", "fitTo", "destroy"].forEach(function (n) { ctl[n] = function () { return false; }; });
    if (!el) return ctl;
    if (o.label) el.setAttribute("aria-label", o.label);
    if (o.label && !el.getAttribute("role")) el.setAttribute("role", "group"); // no label, no role: live maps keep their markup unchanged
    try {
      if (!L) throw new Error("Leaflet failed to load");
      var map = L.map(el, { scrollWheelZoom: false }).setView(o.center || DEFAULT_CENTER, o.zoom || DEFAULT_ZOOM);
      var provider = o.provider || PROVIDER;
      var errors = 0, noticed = false;
      var layer = L.tileLayer(tileUrl(provider), { attribution: provider.attribution, subdomains: provider.subdomains, maxZoom: provider.maxZoom });
      if (layer.on) layer.on("tileerror", function () {
        errors++;
        if (noticed || errors < TILE_ERROR_NOTICE_AFTER) return;
        noticed = true;
        if (typeof o.onTilesFailed === "function") o.onTilesFailed(errors);
        else if (el.insertAdjacentHTML) el.insertAdjacentHTML("beforeend", TILES_BLOCKED_HTML);
      });
      layer.addTo(map);
      // Scroll-wheel zoom only after the visitor deliberately interacts with the map (the page keeps its own scroll).
      map.on("focus", function () { map.scrollWheelZoom.enable(); });
      map.on("blur", function () { map.scrollWheelZoom.disable(); });
      ctl.map = map; ctl.ready = true;
      // Keyboard operation of focusable pins (Leaflet only handles Escape when the map container itself has focus):
      // Enter on a pin opens its popup and moves focus to the first link in it (otherwise the popup sits after every pin in tab order);
      // Escape anywhere inside the map closes the popup and returns focus to the pin that opened it.
      var enterOnPin = false;
      ctl._keyboardOpen = function (ev) {
        if (!enterOnPin) return;
        enterOnPin = false;
        var pop = ev && ev.popup && ev.popup.getElement && ev.popup.getElement();
        var first = pop && pop.querySelector && pop.querySelector("a[href], button, [tabindex]");
        if (first && first.focus) first.focus();
      };
      if (el.addEventListener) el.addEventListener("keydown", function (ev) {
        var t = ev.target, onPin = !!(t && t.classList && t.classList.contains("leaflet-marker-icon"));
        if (ev.key === "Enter" && onPin) { enterOnPin = true; setTimeout(function () { enterOnPin = false; }, 400); return; }
        if (ev.key !== "Escape" || !map._popup) return;
        var opener = ctl._opener, pinEl = opener && opener.getElement && opener.getElement();
        map.closePopup();
        if (pinEl && pinEl.focus) pinEl.focus();
        ev.stopPropagation();
      }, true);
    } catch (err) {
      ctl.error = err;
      el.innerHTML = UNAVAILABLE_HTML;
      // Inert but callable: the page's own list and filters keep working without branching on the map.
      ["setPlaces", "select", "closePopup", "invalidate", "fitTo", "destroy"].forEach(function (n) { ctl[n] = function () { return false; }; });
      return ctl;
    }

    // Replace the pins. onSelect(key) fires when a pin is clicked; the page decides what selecting means (rail, list, filter).
    ctl.setPlaces = function (places, onSelect) {
      ctl.markers.forEach(function (m) { ctl.map.removeLayer(m); });
      ctl.markers = new Map();
      ctl.places = places || [];
      var h = el.clientHeight || (ctl.map.getSize ? ctl.map.getSize().y : 400);
      ctl.places.forEach(function (place) {
        var m;
        if (place.icon) {
          var sz = place.icon.size || 44;
          m = L.marker([place.lat, place.lng], { title: place.title || "", alt: place.title || "", keyboard: true,
            icon: L.divIcon({ className: place.icon.className || "", html: place.icon.html || "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], popupAnchor: [0, -14] }) }).addTo(ctl.map);
        } else {
          m = L.circleMarker([place.lat, place.lng], pinStyle(place)).addTo(ctl.map);
        }
        if (place.popupHtml) m.bindPopup(place.popupHtml, popupOptions(h));
        if (place.popupHtml && place.icon) m.on("popupopen", function (ev) { ctl._opener = m; if (ctl._keyboardOpen) ctl._keyboardOpen(ev); });
        if (onSelect) m.on("click", function () { onSelect(place.key); });
        ctl.markers.set(place.key, m);
      });
      var n = ctl.places.length;
      el.setAttribute("aria-label", (o.label || "Map") + (n === 1 ? ": 1 place shown" : ": " + n + " places shown"));
    };
    ctl.select = function (key) { var m = ctl.markers.get(key); if (m) { ctl.map.panTo(m.getLatLng()); m.openPopup(); } return !!m; };
    ctl.closePopup = function () { ctl.map.closePopup(); };
    ctl.invalidate = function () { setTimeout(function () { ctl.map.invalidateSize(); }, 40); }; // after the map's container becomes visible
    ctl.fitTo = function (places, padding) {
      if (!places || !places.length) return;
      ctl.map.fitBounds(places.map(function (p) { return [p.lat, p.lng]; }), { padding: padding || [30, 30], maxZoom: 13 });
    };
    ctl.destroy = function () { if (ctl.map) ctl.map.remove(); ctl.map = null; ctl.ready = false; };
    return ctl;
  }

  var api = { PROVIDER: PROVIDER, DEFAULT_CENTER: DEFAULT_CENTER, tileUrl: tileUrl, pinStyle: pinStyle, popupOptions: popupOptions, loadLeaflet: loadLeaflet, create: create, UNAVAILABLE_HTML: UNAVAILABLE_HTML };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (root) root.MapFoundation = api;
})(typeof globalThis !== "undefined" ? globalThis : null);
