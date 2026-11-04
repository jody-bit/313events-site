/* seasonal/map-view.js — lazy Leaflet map for a seasonal collection. Loaded only when a visitor opens the Map view.
 * Pins come from the same filtered list as the Grid/List views; destinations without a known location are never pinned (the page says how many).
 * Tiles and attribution come from window.SeasonalMapSettings (one place), so the provider can change without touching this file. */
(function () {
  "use strict";
  var LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  var JS_SRI = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=", CSS_SRI = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
  var map = null, layer = null, loading = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function load() {
    if (window.L) return Promise.resolve(window.L);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var css = document.createElement("link"); css.rel = "stylesheet"; css.href = LEAFLET_CSS; css.integrity = CSS_SRI; css.crossOrigin = ""; document.head.appendChild(css);
      var sc = document.createElement("script"); sc.src = LEAFLET_JS; sc.integrity = JS_SRI; sc.crossOrigin = "";
      sc.onload = function () { resolve(window.L); }; sc.onerror = function () { loading = null; reject(new Error("map library did not load")); };
      document.head.appendChild(sc);
    });
    return loading;
  }

  function popup(e, lastDayLine) {
    var loc = e.loc, dir = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(loc.lat + "," + loc.lng);
    return '<div class="sc-pop"><strong class="sc-pop-name">' + esc(e.name) + '</strong><div>' + esc(e.city) + ', ' + esc(e.region) + '</div>' +
      '<p>' + esc(e.summary) + '</p>' + (lastDayLine || "") +
      (loc.status === "address-point" ? '<p class="sc-pop-note">Marks the street address; the visitor entrance is still being confirmed.</p>' : "") +
      '<p class="sc-pop-links"><a href="#sc-card-' + esc(e.id) + '">Card</a>' + (e.website ? ' &middot; <a href="' + esc(e.website) + '" target="_blank" rel="noopener noreferrer">Official website</a>' : "") +
      ' &middot; <a href="' + esc(dir) + '" target="_blank" rel="noopener noreferrer">Directions</a></p></div>';
  }

  // entries: the visible list; hasPin / lastDayLine come from the shared renderer so the wording matches the cards.
  function update(entries, origin, R) {
    var holder = document.getElementById("scMap");
    if (!holder) return Promise.resolve(false);
    var pins = entries.filter(R.hasPin);
    if (!pins.length) { holder.hidden = true; return Promise.resolve(false); }
    holder.hidden = false;
    return load().then(function (L) {
      var S = window.SeasonalMapSettings || {};
      if (map && map.getContainer() !== holder) { map.remove(); map = null; layer = null; }
      if (!map) {
        map = L.map(holder, { scrollWheelZoom: false }).setView([42.33, -83.05], 8);
        var tiles = L.tileLayer(S.tileUrl || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", { subdomains: S.subdomains || "abc", maxZoom: S.maxZoom || 18, attribution: S.attribution || "© OpenStreetMap contributors" }).addTo(map);
        var failed = 0; tiles.on("tileerror", function () { if (++failed === 3) { var n = document.getElementById("scMapNotice"); if (n) n.textContent += " Map tiles did not load; the list below has every destination."; } });
        layer = L.layerGroup().addTo(map);
      }
      layer.clearLayers();
      var pts = [];
      pins.forEach(function (e) {
        var m = L.marker([e.loc.lat, e.loc.lng], { title: e.name, keyboard: true, alt: e.name }).bindPopup(popup(e, R.lastDayHtml(e)), { maxWidth: 280 });
        layer.addLayer(m); pts.push([e.loc.lat, e.loc.lng]);
      });
      if (origin) { var o = L.circleMarker([origin.lat, origin.lng], { radius: 7, color: "#F5C400", fillColor: "#0A0A0A", fillOpacity: 1, weight: 3 }).bindTooltip(origin.kind === "geo" ? "Your location" : "Center of " + origin.label); layer.addLayer(o); pts.push([origin.lat, origin.lng]); }
      map.fitBounds(pts, { padding: [30, 30], maxZoom: 12 });
      setTimeout(function () { map.invalidateSize(); }, 50);
      return true;
    }, function () { var n = document.getElementById("scMapNotice"); if (n) n.textContent += " The map could not load; the list below has every destination."; return false; });
  }

  function destroy() { if (map) { map.remove(); map = null; layer = null; } }
  window.SeasonalMapView = { update: update, destroy: destroy };
})();
