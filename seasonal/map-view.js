/* seasonal/map-view.js — lazy Leaflet map for a seasonal collection. Loaded only when a visitor opens the Map view.
 * Pins come from the same filtered list as the Grid/List views; destinations without a known location are never pinned (the page says how many).
 * Library loading, tiles, attribution and error handling come from the shared foundation (/map-foundation.js); this file only adapts collection entries into map places. */
(function () {
  "use strict";
  var MF = window.MapFoundation;   // the shared map foundation (/map-foundation.js): Leaflet loading, tiles, attribution, errors
  var ctl = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tileNote(msg) { var n = document.getElementById("scMapTiles"); if (n) n.textContent = msg; }

  function popup(e, lastDayLine, R) {
    var loc = e.loc, park = R.isParkLocation(e), dir = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(loc.lat + "," + loc.lng);
    var access = loc.accessUrl || e.website;
    return '<div class="sc-pop"><strong class="sc-pop-name">' + esc(e.name) + '</strong><div>' + esc(e.city) + ', ' + esc(e.region) + '</div>' +
      '<p>' + esc(e.summary) + '</p>' + (lastDayLine || "") +
      (park ? '<p class="sc-pop-note"><strong>Park location \u2014 visitor entrance not yet verified.</strong> This pin is approximate. Check the park\u2019s official page for access and whether it is open.</p>' : "") +
      (R.isCandidate(e) ? '<p class="sc-pop-note"><strong>Candidate, not entrance.</strong> Marks the street address for QA only; the visitor entrance is still being confirmed.</p>' : "") +
      '<p class="sc-pop-links"><a href="#sc-card-' + esc(e.id) + '">Card</a>' + (e.website ? ' &middot; <a href="' + esc(e.website) + '" target="_blank" rel="noopener noreferrer">Official website</a>' : "") +
      (park ? (access ? ' &middot; <a href="' + esc(access) + '" target="_blank" rel="noopener noreferrer">Official access and directions</a>' : "")
            : R.isCandidate(e) ? "" : ' &middot; <a href="' + esc(dir) + '" target="_blank" rel="noopener noreferrer">Directions</a>') + '</p></div>';
  }

  // entries: the visible list; hasPin / lastDayHtml come from the shared renderer so the wording matches the cards.
  function update(entries, origin, R) {
    var holder = document.getElementById("scMap");
    if (!holder) return Promise.resolve(false);
    var pins = entries.filter(R.hasPin);
    if (!pins.length) { holder.hidden = true; return Promise.resolve(false); }
    holder.hidden = false;
    if (!MF) { tileNote("The map could not load; the list below has every destination."); return Promise.resolve(false); }
    return MF.loadLeaflet().then(function (L) {
      if (ctl && ctl.map && ctl.map.getContainer() !== holder) { ctl.destroy(); ctl = null; }
      if (!ctl) {
        holder.setAttribute("role", "group");   // pins inside are focusable controls, so the holder must not be an image
        ctl = MF.create(holder, { label: "Map of the destinations in this collection (the list below has the same destinations)",
          onTilesFailed: function () { tileNote("Map tiles did not load; the list below has every destination."); } }, { L: L });
      }
      if (!ctl.ready) { tileNote("The map could not load; the list below has every destination."); return false; }
      var places = pins.map(function (e) {
        return { key: e.id, lat: e.loc.lat, lng: e.loc.lng, title: e.name + (R.isParkLocation(e) ? " (park location, entrance not verified)" : R.isCandidate(e) ? " (candidate, not entrance)" : ""),
          icon: { className: "sc-pin", html: '<span class="sc-pin-dot"></span>', size: 44 }, popupHtml: popup(e, R.lastDayHtml(e), R) };
      });
      ctl.setPlaces(places);
      if (origin && ctl.map) {
        L.circleMarker([origin.lat, origin.lng], { radius: 7, color: "#F5C400", fillColor: "#0A0A0A", fillOpacity: 1, weight: 3 })
          .bindTooltip(origin.kind === "geo" ? "Your location" : "Center of " + origin.label).addTo(ctl.map);
      }
      var fit = places.slice(); if (origin) fit.push({ lat: origin.lat, lng: origin.lng });
      ctl.fitTo(fit); ctl.invalidate();
      places.forEach(function (pl) {
        var m = ctl.markers.get(pl.key);
        if (m) { m.on("add", function () {}); var el = m.getElement && m.getElement(); if (el) el.setAttribute("aria-label", pl.title); }
      });
      return true;
    }, function () { tileNote("The map could not load; the list below has every destination."); return false; });
  }

  function destroy() { if (ctl) { ctl.destroy(); ctl = null; } }
  window.SeasonalMapView = { update: update, destroy: destroy };
})();
