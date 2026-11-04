/* seasonal/render.js — shared renderer for the seasonal collection pages.
 * Pure functions: (collection, state) -> HTML string. Used by the browser
 * (seasonal/page.js) and by node tests, so the same markup is what we test.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./collections.js"));
  else root.SeasonalRender = factory(root.SeasonalCollections);
})(typeof self !== "undefined" ? self : this, function (DATA) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function catLabel(col, id) {
    for (var i = 0; i < col.categories.length; i++) if (col.categories[i].id === id) return col.categories[i].label;
    return id;
  }
  function usedCategories(col) {
    var seen = {};
    DATA.live(col).forEach(function (e) { e.categories.forEach(function (c) { seen[c] = true; }); });
    return col.categories.filter(function (c) { return seen[c.id]; });
  }
  function matches(e, state) {
    state = state || {};
    if (state.category && state.category !== "all" && e.categories.indexOf(state.category) < 0) return false;
    var q = (state.query || "").trim().toLowerCase();
    if (q) {
      var hay = [e.name, e.city, e.region, e.summary].concat(e.categories.map(function (c) { return c; })).join(" ").toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }
  // Straight-line (great-circle) distance in miles between two points. Never presented as a driving distance or travel time.
  function milesBetween(a, b) {
    var R = 3958.8, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // A map pin needs a verified entrance or official coordinates (status "verified"). A Census address-point is a candidate location, not proof of
  // where a visitor enters, so those places stay in Grid/List and are counted as "still being verified". Distances may still use an address-point.
  function hasCoords(e) { return !!(e.loc && typeof e.loc.lat === "number" && typeof e.loc.lng === "number"); }
  function hasPin(e) { return !!(hasCoords(e) && (e.loc.status === "verified" || e.loc.entrance)) || (qaPins && hasLocation(e)); }
  // Candidate = a location drawn only in the Preview QA view (?qa=pins); never part of the default or publication view.
  function isCandidate(e) { return qaPins && hasLocation(e) && !(e.loc.status === "verified" || e.loc.entrance); }
  var qaPins = false;
  function setQaPins(on) { qaPins = on === true; }
  function hasLocation(e) { return hasCoords(e) && (e.loc.status === "verified" || e.loc.status === "address-point"); }
  function distanceOf(e, state) { return state && state.origin && hasLocation(e) ? milesBetween(state.origin, e.loc) : null; }
  // Editorial order is the default. With a chosen origin, destinations with a known location sort nearest first (stable); the rest keep their order after them.
  function visible(col, state) {
    state = state || {};
    var list = DATA.live(col).filter(function (e) { return matches(e, state); });
    if (!state || !state.origin) return list;
    return list.map(function (e, i) { return { e: e, i: i, d: distanceOf(e, state) }; })
      .sort(function (a, b) { if (a.d == null && b.d == null) return a.i - b.i; if (a.d == null) return 1; if (b.d == null) return -1; return a.d - b.d || a.i - b.i; })
      .map(function (x) { return x.e; });
  }
  // The collection has a Map view only when the page supplies destination locations (the Preview does; the published pages do not yet).
  function mapEnabled(col) { return !!(col.entries && col.entries.some(function (e) { return e.loc; })); }
  function coverage(col, state) {
    var list = visible(col, state), pinned = list.filter(hasPin).length;
    return { shown: list.length, pinned: pinned, unresolved: list.length - pinned };
  }

  function tags(col, e) {
    return '<ul class="sc-tags">' + e.categories.map(function (c) {
      return '<li>' + esc(catLabel(col, c)) + '</li>';
    }).join("") + '</ul>';
  }
  var failedLookup = function () { return false; };
  function setFailedLookup(fn) { failedLookup = fn || function () { return false; }; }
  var PLACEHOLDER = "/assets/placeholders/event-800.webp";
  // Image fallback chain (runtime, no broken-image icons), walked by seasonal/image-fallback.js:
  //   linked image (image.remote, if any) -> generated card (image.src) -> alternate cards (image.alternates, image.fallbacks)
  //   -> branded placeholder (image.placeholder) -> CSS placeholder block.
  // A linked image is shown from its source site with a credit line; the credit and the link are hidden as soon as the
  // card falls back. A linked image is NOT a licensed file: see seasonal/collections.js gate item 3c / 4c.
  function linkedOf(img) {
    var r = img && img.remote;
    return r && /^https:\/\//.test(r.src || "") && /^https:\/\//.test(r.sourcePage || "") ? r : null;
  }
  function chainOf(img) {
    var r = linkedOf(img), list = [];
    if (r) list.push(r.src);
    list.push(img.src);
    (img.alternates || []).forEach(function (u) { list.push(u); });
    (img.fallbacks || []).forEach(function (u) { list.push(u); });
    list.push(img.placeholder || PLACEHOLDER);
    return list.filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  }
  // Pick the first URL in the chain not already known to fail.
  function pickSrc(img) {
    var chain = chainOf(img);
    for (var i = 0; i < chain.length; i++) if (!failedLookup(chain[i])) return chain[i];
    return chain[0];
  }
  // Photo credit policy (owner decision 2026-10-13): no credit is ever drawn over a photograph. Owner photography (credit "Photography © Name"
  // or "313.events archive") shows no visible credit; it is kept in a data attribute here and in the content metadata (entries.json,
  // published-entries.js). A credit that a license or a linked image requires is a small muted line in the card's text area, with its link.
  var OWNER_CREDIT = /^(Photography \u00a9 |313\.events archive$)/;
  function creditLine(e) {
    var img = e.image, r = linkedOf(img);
    if (r && pickSrc(img) === r.src) return !r.credit ? "" : '<p class="sc-credit"><a href="' + esc(r.sourcePage) + '" target="_blank" rel="noopener noreferrer">Photo: ' + esc(r.credit) + '</a></p>';
    if (img.illustrative || !img.credit || OWNER_CREDIT.test(img.credit)) return "";
    return '<p class="sc-credit">' + (/ via Wikimedia Commons$/.test(img.credit) ? '<a href="/copyright#photo-credits">' + esc(img.credit) + '</a>' : esc(img.credit)) + '</p>';
  }
  // Owner direction (Nov 4): a generic placeholder is never shown as if it were a photograph. In an owner-review Preview
  // (col.previewPendingPhotos, set only by api/seasonal-preview.js) a card or hero that is showing the generic placeholder
  // carries "Photo pending". It is a publication blocker, not a finished illustration, so it is never labelled "Illustrative".
  function isGenericPlaceholder(src) { return !src || /\/assets\/placeholders\//.test(String(src)); }
  function media(e, col) {
    var chain = chainOf(e.image), r = linkedOf(e.image), first = pickSrc(e.image);
    var viaLink = !!r && first === r.src;
    var fb = chain.length > 1 ? ' data-src0="' + esc(chain[0]) + '" data-fb="' + esc(JSON.stringify(chain.slice(1))) + '"' : "";
    var owner = !viaLink && !e.image.illustrative && OWNER_CREDIT.test(e.image.credit || "") ? ' data-photo-credit="' + esc(e.image.credit) + '"' : "";
    var html = '<div class="sc-card-media"' + owner + '><img src="' + esc(first) + '"' + (viaLink ? ' referrerpolicy="no-referrer"' : "") + fb + ' alt="" loading="lazy" width="640" height="427">';
    if (viaLink) return html + '<span class="sc-illus sc-illus-fb">Illustrative image</span></div>';
    if (col && col.previewPendingPhotos === true && isGenericPlaceholder(e.image && e.image.src) && !e.image.illustrative) return html + '<span class="sc-pending">Photo pending</span></div>';
    return html + (e.image.illustrative ? '<span class="sc-illus">Illustrative image</span>' : e.image.historic === true ? '<span class="sc-hist">Historic photo</span>' : "") + '</div>';
  }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function lastDayText(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? MONTHS[+m[2] - 1] + " " + (+m[3]) + ", " + m[1] : iso; }
  // One consistent label. A destination's seasonal closing date is "Last day open"; an activity or event with its own final date says so.
  // lastDayKind: "event" -> "Final event day"; "runs" -> "Runs through"; anything else -> "Last day open". lastDayNote adds a short qualifier.
  var LASTDAY_LABEL = { event: "Final event day", runs: "Runs through" };
  function lastDayLine(e) {
    if (!e.lastDay) return "";
    return '<p class="sc-card-sum sc-card-lastday"><strong>' + (LASTDAY_LABEL[e.lastDayKind] || "Last day open") + ':</strong> ' + esc(lastDayText(e.lastDay)) +
      (e.lastDayNote ? ' <span class="sc-lastday-note">(' + esc(e.lastDayNote) + ')</span>' : "") + '</p>';
  }
  function distanceLine(e, state) {
    var d = distanceOf(e, state);
    if (d == null) return "";
    var how = state.origin.kind === "geo" ? "approximate straight-line distance from your location" : "approximate distance from the center of " + state.origin.label;
    return '<p class="sc-card-sum sc-card-dist"><strong>About ' + (d < 10 ? d.toFixed(1) : Math.round(d)) + ' mi</strong> <span class="sc-dist-how">(' + esc(how) + ')</span></p>';
  }
  function ontarioLine(e) {
    return e.region === "ON" || e.region === "Ontario" ? '<p class="sc-card-sum sc-card-border"><strong>In Ontario, Canada.</strong> This trip crosses the U.S.\u2013Canada border.</p>' : "";
  }
  function card(col, e, opts) {
    opts = opts || {};
    var arrow = '<span class="sc-arrow" aria-hidden="true">&rarr;</span>';
    var name = e.website
      ? '<a class="sc-card-link" href="' + esc(e.website) + '" target="_blank" rel="noopener noreferrer">' + esc(e.name) + '<span class="sc-sr"> (official site, opens in a new tab)</span></a>'
      : esc(e.name);
    // Shared mobile word-breaking rule (every seasonal page, same code path): a card title whose longest word (split at spaces and hyphens) has 10+ letters
    // carries its length, so the 2-column mobile grid can set the title just small enough for that word to fit instead of breaking it mid-word.
    // The CSS only ever shrinks a title that would not fit; every other title keeps the approved 21px.
    var longWord = 0;
    String(e.name).split(/[\s\-\u2013\u2014]+/).forEach(function (w) { if (w.length >= 10 && w.length > longWord) longWord = w.length; });
    return '<li class="sc-card' + (opts.list ? " sc-card-row" : "") + '" data-entry="' + esc(e.id) + '" id="sc-card-' + esc(e.id) + '"' + (opts.attrs || "") + '>' +
      media(e, col) +
      '<div class="sc-card-body">' + tags(col, e) +
      '<h3 class="sc-card-title' + (longWord ? " sc-card-title--long" : "") + '"' + (longWord ? ' style="--lw:' + longWord + '"' : "") + '>' + name + '</h3>' +
      '<p class="sc-card-where">' + esc(e.city) + ', ' + esc(e.region) + '</p>' +
      '<p class="sc-card-sum">' + esc(e.summary) + '</p>' +
      lastDayLine(e) + distanceLine(e, opts.state) + ontarioLine(e) +
      (e.advisory ? '<p class="sc-card-sum sc-card-advisory"><strong>Access advisory:</strong> ' + esc(e.advisory) + '</p>' : "") + creditLine(e) + (opts.extra || "") + '</div>' +
      (e.website ? arrow : "") + '</li>';
  }

  function filterBar(col, state) {
    var chips = '<button type="button" class="sc-chip" data-cat="all" aria-pressed="' + (!state.category || state.category === "all") + '">All</button>' +
      usedCategories(col).map(function (c) {
        return '<button type="button" class="sc-chip" data-cat="' + esc(c.id) + '" aria-pressed="' + (state.category === c.id) + '">' + esc(c.label) + '</button>';
      }).join("");
    return '<section class="sc-filters" aria-label="Filters">' +
      '<div class="sc-filter-cats"><p class="sc-label" id="scFilterLabel">' + esc(col.filterLabel) + '</p>' +
      '<div class="sc-chips" role="group" aria-labelledby="scFilterLabel">' + chips + '</div></div>' +
      '<div class="sc-filter-search"><label class="sc-label" for="scSearch">Search this collection</label>' +
      '<input id="scSearch" type="search" class="sc-search" placeholder="Search destinations, cities, or experiences" value="' + esc(state.query || "") + '"></div>' +
      '</section>';
  }

  function results(col, state) {
    var list = visible(col, state);
    var asList = state.view === "list" || state.view === "map";
    var cls = asList ? "sc-grid sc-list" : "sc-grid";
    if (!list.length) {
      return '<p class="sc-empty" role="status">No destinations match yet. Clear a filter to see the full collection.</p>';
    }
    var pre = "";
    if (state.view === "map" && mapEnabled(col)) {
      var cv = coverage(col, state);
      pre = '<p class="sc-map-notice" id="scMapNotice" role="status" aria-live="polite">' + cv.pinned + ' of ' + cv.shown + ' places shown on the map; the rest are in the list.' +
        (qaPins ? ' QA view: candidate pins are included and are not confirmed entrances.' : '') + '</p>' +
        '<div id="scMap" class="sc-map" aria-label="Map of the destinations in this collection (the list below has the same destinations)"></div>' +
        '<p class="sc-map-credit">Map tiles \u00a9 OpenStreetMap contributors \u00a9 CARTO. The accessible list below shows every destination.</p><p class="sc-map-tilestatus" id="scMapTiles" role="status" aria-live="polite"></p>';
    }
    return pre + '<ul class="' + cls + '">' + list.map(function (e) { return card(col, e, { list: asList, state: state }); }).join("") + '</ul>';
  }

  function discover(col, state) {
    var used = usedCategories(col);
    if (!used.length) return "";
    var shown = {};   // shared rule: navigation tiles never repeat an image; each takes the first destination in its category whose image no earlier tile used
    return '<section class="sc-section" aria-labelledby="scDiscover"><h2 class="sc-h2" id="scDiscover">' + esc(col.discoverTitle) + '</h2>' +
      '<ul class="sc-tiles">' + used.map(function (c, i) {
        var inCat = DATA.live(col).filter(function (e) { return e.categories.indexOf(c.id) >= 0; });
        var n = inCat.filter(function (e) { return !shown[e.image.src]; })[0] || inCat[0];
        shown[n.image.src] = true;
        return '<li><button type="button" class="sc-tile" data-cat="' + esc(c.id) + '"><img src="' + esc(n.image.src) + '" alt="" loading="lazy" width="640" height="427"><span class="sc-tile-label">' + esc(c.tile) + ' <span aria-hidden="true">&rarr;</span></span></button></li>';
      }).join("") + '</ul></section>';
  }

  function more(col) {
    return '<section class="sc-bottom">' +
      '<div class="sc-bottom-map"><h2 class="sc-h2 sc-h2-sm">' + esc(col.mapTitle) + '</h2>' +
      '<div class="sc-map-card"><p class="sc-map-copy"><strong>' + esc(col.mapBlurb) + '</strong></p>' +
      '<a class="sc-btn" href="/map.html">Open events map <span aria-hidden="true">&rarr;</span></a></div></div>' +
      '<div class="sc-bottom-more"><h2 class="sc-h2 sc-h2-sm">More seasonal collections</h2><ul class="sc-more">' +
      DATA.ORDER.filter(function (s) { return s !== col.slug; }).map(function (s) {
        var c = DATA.CROSS[s];
        return '<li><a class="sc-more-card" href="' + esc(c.route) + '"><img src="' + esc(c.img) + '" alt="" loading="lazy" width="640" height="427"><span>' + esc(c.label) + ' <span aria-hidden="true">&rarr;</span></span></a></li>';
      }).join("") + '</ul></div></section>';
  }

  function header() {
    return '<header class="sc-header"><a class="sc-brand" href="/" aria-label="313.events home"><img src="/assets/wordmark.svg" alt="313.events" height="26"></a>' +
      '<nav class="sc-nav" aria-label="Primary"><a href="/calendar.html">Calendar</a><a href="/map.html">Map</a><a href="/neighborhoods.html">Neighborhoods</a><a href="/venues.html">Venues</a><a href="/radar.html">On the Radar</a><a href="/submit.html">Submit</a></nav>' +
      '<a class="sc-cta" href="/">The city is on.</a></header>';
  }
  function footer() {
    return '<footer class="sc-footer"><a class="sc-brand" href="/"><img src="/assets/wordmark.svg" alt="313.events" height="22"></a>' +
      '<p class="sc-footer-tag">The city is on.</p><p class="sc-footer-links"><a href="/about">About</a> &middot; <a href="/accessibility">Accessibility</a> &middot; <a href="/editorial-policy">Editorial Policy</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="/copyright">Copyright / DMCA</a> &middot; <a href="/copyright#photo-credits">Photo Credits</a> &middot; <a href="mailto:jody@sentientproductions.com">Contact</a></p>' +
      '<p class="sc-footer-note">Always confirm dates, hours, and admission with the destination before making plans.</p></footer>';
  }

  function hero(col) {
    var h = col.hero;
    return '<section class="sc-hero"><picture><source media="(max-width:640px)" srcset="' + esc(h.mobile) + '">' +
      '<img class="sc-hero-img" src="' + esc(h.desktop) + '" alt="" width="1600" height="900" style="object-position:' + esc(h.objectPosition) + '"></picture>' +
      '<div class="sc-hero-copy"><p class="sc-crumb">313.events / Detroit Orbit / ' + (col.slug === "fall" ? "Fall Collection" : "Seasonal Collection") + '</p>' +
      '<h1 class="sc-title">' + col.titleLines.map(function (l) { return "<span>" + esc(l) + "</span>"; }).join(" ") + '</h1>' +
      (col.tagline ? '<p class="sc-tagline">' + esc(col.tagline) + '</p>' : "") +
      '<p class="sc-sub">' + esc(col.subtitle) + '</p></div>' +
      (h.illustrative ? '<span class="sc-illus sc-illus-hero">Illustrative image</span>' : (col.previewPendingPhotos === true && isGenericPlaceholder(h.desktop) ? '<span class="sc-pending sc-pending-hero">Photo pending</span>' : "")) + '</section>';
  }

  function dontMiss(col, state) {
    var live = DATA.live(col), feat = visible(col, state).filter(function (e) { return e.featured; });
    // The row follows the same filters and search as the directory. When every destination is featured the directory already shows each one once.
    if (!feat.length || live.every(function (e) { return e.featured; })) return "";
    return '<section class="sc-section" aria-labelledby="scDontMiss"><div class="sc-section-head"><h2 class="sc-h2" id="scDontMiss">' + esc(col.dontMissTitle) + '</h2></div>' +
      '<ul class="sc-grid sc-rail' + (feat.length === 1 ? " sc-rail-solo" : "") + '">' + feat.map(function (e) { return card(col, e, { list: feat.length === 1, state: state }); }).join("") + '</ul></section>';
  }

  function nearestControls(state) {
    var o = state.origin;
    return '<div class="sc-near" role="group" aria-label="Sort by distance">' +
      '<button type="button" class="sc-near-btn sc-near-main" id="scNearBtn">Nearest to me</button>' +
      '<div class="sc-near-city"><label class="sc-near-lab" for="scCity">City</label>' +
      '<input id="scCity" class="sc-near-in" type="text" list="scCityList" autocomplete="off" placeholder="Start typing a city" value="">' +
      '<datalist id="scCityList"></datalist>' +
      '<button type="button" class="sc-near-btn" id="scCityGo">Use this city</button></div>' +
      '<button type="button" class="sc-near-btn" id="scNearClear"' + (o ? "" : " hidden") + '>Clear location</button>' +
      '<p class="sc-near-help" id="scCityHelp"></p>' +
      '<p class="sc-near-status" id="scNearStatus" role="status" aria-live="polite">' + (o ? nearStatus(o) : "Editorial order. Choose \u201cNearest to me\u201d or a city to sort by distance. Distances are approximate and are not driving distances or travel times.") + '</p></div>';
  }
  function nearStatus(o) {
    return o.kind === "geo" ? "Sorted by approximate straight-line distance from your location. Not a driving distance or travel time."
      : "Sorted by approximate distance from the center of " + esc(o.label) + ". Not a driving distance or travel time.";
  }
  function explore(col, state) {
    return '<section class="sc-section" aria-labelledby="scExplore"><div class="sc-section-head"><h2 class="sc-h2" id="scExplore">' + esc(col.exploreTitle) + '</h2>' +
      '<div class="sc-views" role="group" aria-label="View"><button type="button" class="sc-view" data-view="grid" aria-pressed="' + (state.view !== "list") + '">Grid</button>' +
      '<button type="button" class="sc-view" data-view="list" aria-pressed="' + (state.view === "list") + '">List</button>' +
      (mapEnabled(col) ? '<button type="button" class="sc-view" data-view="map" aria-pressed="' + (state.view === "map") + '">Map</button>' : "") +
      '<a class="sc-view" href="/map.html" title="General events map, not filtered to this collection">General events map (all listings)</a></div></div>' +
      (mapEnabled(col) ? nearestControls(state) : "") +
      '<p class="sc-count" id="scCount" aria-live="polite">' + visible(col, state).length + ' of ' + DATA.live(col).length + ' destinations</p>' +
      '<div id="scResults">' + results(col, state) + '</div></section>';
  }

  function main(col, state) {
    state = state || { category: "all", query: "", view: "grid" };
    return hero(col) + filterBar(col, state) + '<div id="scDontMissWrap">' + dontMiss(col, state) + '</div>' + explore(col, state) + discover(col, state) + more(col);
  }

  // Font-independent guard for the shared title rule: the CSS hint above is tuned to the Archivo display face; when the webfont has not loaded (or a
  // device substitutes a wider fallback) a long word can still be wider than its column. This measures the real rendered widths and shrinks only a title
  // whose longest word overflows, down to 11px, so no seasonal page ever breaks a word mid-letter. Titles that fit are left exactly as designed.
  function fitTitles(root) {
    if (typeof document === "undefined") return;
    [].forEach.call((root || document).querySelectorAll(".sc-card-title"), function (t) {
      t.style.fontSize = ""; t.style.overflowWrap = "normal";
      var cw = t.clientWidth, sw = t.scrollWidth;
      if (cw && sw > cw + 0.5) t.style.fontSize = Math.max(11, Math.floor(parseFloat(getComputedStyle(t).fontSize) * cw / sw * 2) / 2) + "px";
      t.style.overflowWrap = "";
    });
  }

  return { dontMiss: dontMiss, lastDayHtml: lastDayLine, milesBetween: milesBetween, hasPin: hasPin, isCandidate: isCandidate, setQaPins: setQaPins, mapEnabled: mapEnabled, coverage: coverage, nearStatus: nearStatus, fitTitles: fitTitles, setFailedLookup: setFailedLookup, pickSrc: pickSrc, chainOf: chainOf, PLACEHOLDER: PLACEHOLDER, catLabel: catLabel, matches: matches, esc: esc, visible: visible, results: results, main: main, header: header, footer: footer, usedCategories: usedCategories, card: card };
});
