/* seasonal/page.js — progressive enhancement: filters, search, grid/list.
   The HTML is already complete without this script. On /halloween only,
   ?qa=1 opens the QA review mode (seasonal/qa.js) when the QA API answers. */
(function () {
  "use strict";
  var slug = document.body.getAttribute("data-collection");
  var DATA = window.SeasonalCollections, R = window.SeasonalRender;
  if (!slug || !DATA || !R) return;
  var col = DATA.COLLECTIONS[slug];
  var FB = window.SeasonalImageFallback;
  if (FB) { R.setFailedLookup(FB.isFailed); FB.attach(document); }

  function initPublic() {
    var p = new URLSearchParams(location.search);
    var state = { category: p.get("cat") || "all", query: p.get("q") || "", view: p.get("view") === "list" ? "list" : "grid" };
    var known = R.usedCategories(col).map(function (c) { return c.id; });
    if (state.category !== "all" && known.indexOf(state.category) < 0) state.category = "all";

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
      try { history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "")); } catch (e) {}
      if (scroll) document.getElementById("scExplore").scrollIntoView({ behavior: "smooth", block: "start" });
      if (FB) FB.scan(document.getElementById("scResults"));
    }
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat],[data-view]");
      if (!b) return;
      if (b.hasAttribute("data-view")) { state.view = b.getAttribute("data-view"); sync(false); return; }
      state.category = b.getAttribute("data-cat"); sync(b.classList.contains("sc-tile"));
    });
    var s = document.getElementById("scSearch");
    if (s) s.addEventListener("input", function () { state.query = s.value; sync(false); });
    sync(false);
  }

  var wantsQa = slug === "halloween" && new URLSearchParams(location.search).get("qa") === "1" && window.SeasonalQA;
  if (wantsQa) {
    window.SeasonalQA.mount(document, location, function (u, o) { return fetch(u, o); }, col, FB).then(function (ok) { if (!ok) initPublic(); });
  } else initPublic();
})();
