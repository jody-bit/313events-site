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
    DATA.published(col).forEach(function (e) { e.categories.forEach(function (c) { seen[c] = true; }); });
    return col.categories.filter(function (c) { return seen[c.id]; });
  }
  function matches(e, state) {
    if (state.category && state.category !== "all" && e.categories.indexOf(state.category) < 0) return false;
    var q = (state.query || "").trim().toLowerCase();
    if (q) {
      var hay = [e.name, e.city, e.region, e.summary].concat(e.categories.map(function (c) { return c; })).join(" ").toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }
  function visible(col, state) { return DATA.published(col).filter(function (e) { return matches(e, state); }); }

  function tags(col, e) {
    return '<ul class="sc-tags">' + e.categories.map(function (c) {
      return '<li>' + esc(catLabel(col, c)) + '</li>';
    }).join("") + '</ul>';
  }
  function card(col, e, opts) {
    opts = opts || {};
    var arrow = '<span class="sc-arrow" aria-hidden="true">&rarr;</span>';
    var name = e.website
      ? '<a class="sc-card-link" href="' + esc(e.website) + '" target="_blank" rel="noopener noreferrer">' + esc(e.name) + '<span class="sc-sr"> (official site, opens in a new tab)</span></a>'
      : esc(e.name);
    return '<li class="sc-card' + (opts.list ? " sc-card-row" : "") + '" data-entry="' + esc(e.id) + '">' +
      '<div class="sc-card-media"><img src="' + esc(e.image.src) + '" alt="" loading="lazy" width="640" height="427">' +
      (e.image.illustrative ? '<span class="sc-illus">Illustrative image</span>' : "") + '</div>' +
      '<div class="sc-card-body">' + tags(col, e) +
      '<h3 class="sc-card-title">' + name + '</h3>' +
      '<p class="sc-card-where">' + esc(e.city) + ', ' + esc(e.region) + '</p>' +
      '<p class="sc-card-sum">' + esc(e.summary) + '</p></div>' +
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
    var cls = state.view === "list" ? "sc-grid sc-list" : "sc-grid";
    if (!list.length) {
      return '<p class="sc-empty" role="status">No destinations match yet. Clear a filter to see the full collection.</p>';
    }
    return '<ul class="' + cls + '">' + list.map(function (e) { return card(col, e, { list: state.view === "list" }); }).join("") + '</ul>';
  }

  function discover(col, state) {
    var used = usedCategories(col);
    if (!used.length) return "";
    return '<section class="sc-section" aria-labelledby="scDiscover"><h2 class="sc-h2" id="scDiscover">' + esc(col.discoverTitle) + '</h2>' +
      '<ul class="sc-tiles">' + used.map(function (c, i) {
        var n = DATA.published(col).filter(function (e) { return e.categories.indexOf(c.id) >= 0; })[0];
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
      '<p class="sc-footer-tag">The city is on.</p><p class="sc-footer-links"><a href="/about">About</a> &middot; <a href="/accessibility">Accessibility</a> &middot; <a href="/editorial-policy">Editorial Policy</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a></p>' +
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
      (h.illustrative ? '<span class="sc-illus sc-illus-hero">Illustrative image</span>' : "") + '</section>';
  }

  function dontMiss(col, state) {
    var feat = DATA.published(col).filter(function (e) { return e.featured; });
    if (!feat.length) return "";
    return '<section class="sc-section" aria-labelledby="scDontMiss"><div class="sc-section-head"><h2 class="sc-h2" id="scDontMiss">' + esc(col.dontMissTitle) + '</h2></div>' +
      '<ul class="sc-grid sc-rail">' + feat.map(function (e) { return card(col, e); }).join("") + '</ul></section>';
  }

  function explore(col, state) {
    return '<section class="sc-section" aria-labelledby="scExplore"><div class="sc-section-head"><h2 class="sc-h2" id="scExplore">' + esc(col.exploreTitle) + '</h2>' +
      '<div class="sc-views" role="group" aria-label="View"><button type="button" class="sc-view" data-view="grid" aria-pressed="' + (state.view !== "list") + '">Grid</button>' +
      '<button type="button" class="sc-view" data-view="list" aria-pressed="' + (state.view === "list") + '">List</button>' +
      '<a class="sc-view" href="/map.html" title="General events map, not filtered to this collection">Events map</a></div></div>' +
      '<p class="sc-count" id="scCount" aria-live="polite">' + visible(col, state).length + ' of ' + DATA.published(col).length + ' destinations</p>' +
      '<div id="scResults">' + results(col, state) + '</div></section>';
  }

  function main(col, state) {
    state = state || { category: "all", query: "", view: "grid" };
    return hero(col) + filterBar(col, state) + dontMiss(col, state) + explore(col, state) + discover(col, state) + more(col);
  }

  return { esc: esc, visible: visible, results: results, main: main, header: header, footer: footer, usedCategories: usedCategories, card: card };
});
