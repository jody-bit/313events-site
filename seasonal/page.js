/* seasonal/page.js — progressive enhancement: filters, search, grid/list.
   The HTML is already complete without this script.

   Test fixtures (Preview only): adding ?fixtures=1 merges the invented records
   from seasonal/fixtures.js into the page, but only after /config.js reports a
   non-production environment. If config cannot be read, says "production", or
   anything fails, nothing is merged and the page is exactly the real page.

   Review mode (Preview only): ?review=1 lists EVERY entry of the collection, each labelled "Review only" with its
   real gate state, so the page can be judged visually before anything is approved. Same non-production check as
   fixtures: if /config.js cannot be read or says "production", the page is exactly the real page. */
(function () {
  "use strict";
  var slug = document.body.getAttribute("data-collection");
  var DATA = window.SeasonalCollections, R = window.SeasonalRender;
  if (!slug || !DATA || !R) return;
  var p = new URLSearchParams(location.search);
  var NON_PROD = ["preview", "development", "local"];

  function loadScript(src, done) {
    var s = document.createElement("script");
    s.src = src; s.onload = function () { done(true); }; s.onerror = function () { done(false); };
    document.head.appendChild(s);
  }
  function fixturesAllowed(done) {
    if (p.get("fixtures") !== "1") { done(null); return; }
    loadScript("/config.js", function () {
      var cfg = window.__313_CONFIG;
      if (!cfg || NON_PROD.indexOf(cfg.environment) < 0) { done(null); return; }
      loadScript("/seasonal/fixtures.js", function (ok) { done(ok && window.SeasonalFixtures ? window.SeasonalFixtures : null); });
    });
  }

  function reviewAllowed(done) {
    if (p.get("review") !== "1") { done(false); return; }
    loadScript("/config.js", function () {
      var cfg = window.__313_CONFIG;
      done(!!(cfg && NON_PROD.indexOf(cfg.environment) >= 0));
    });
  }

  function start(col, fixturesOn) {
    var state = { category: p.get("cat") || "all", query: p.get("q") || "", view: p.get("view") === "list" ? "list" : "grid" };
    var known = R.usedCategories(col).map(function (c) { return c.id; });
    if (state.category !== "all" && known.indexOf(state.category) < 0) state.category = "all";
    var extraOn = fixturesOn || !!col.includeReview;
    if (extraOn) document.getElementById("scMain").innerHTML = R.main(col, state);

    function sync(scroll) {
      document.getElementById("scResults").innerHTML = R.results(col, state);
      document.getElementById("scCount").textContent = R.visible(col, state).length + " of " + DATA.published(col).length + " destinations";
      [].forEach.call(document.querySelectorAll(".sc-chip"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-cat") === state.category)); });
      [].forEach.call(document.querySelectorAll("button.sc-view"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === state.view)); });
      var s = document.getElementById("scSearch"); if (s && s.value !== state.query) s.value = state.query;
      var q = new URLSearchParams();
      if (state.category !== "all") q.set("cat", state.category);
      if (state.query) q.set("q", state.query);
      if (state.view === "list") q.set("view", "list");
      if (fixturesOn) q.set("fixtures", "1");
      if (col.includeReview) q.set("review", "1");
      try { history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "")); } catch (e) {}
      if (scroll) document.getElementById("scExplore").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat],[data-view]");
      if (!b) return;
      if (b.hasAttribute("data-view")) { state.view = b.getAttribute("data-view"); sync(false); return; }
      state.category = b.getAttribute("data-cat"); sync(b.classList.contains("sc-tile"));
    });
    document.addEventListener("input", function (e) {
      if (e.target && e.target.id === "scSearch") { state.query = e.target.value; sync(false); }
    });
    sync(false);
  }

  fixturesAllowed(function (fx) {
    reviewAllowed(function (rev) {
      var col = DATA.COLLECTIONS[slug];
      if (fx) col = DATA.withFixtures(col, fx.forCollection(slug));
      if (rev) col = DATA.withReview(col);
      start(col, !!fx);
    });
  });
})();
