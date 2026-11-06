/* seasonal/page.js — progressive enhancement: filters, search, grid/list.
   The HTML is already complete without this script. On /halloween, /fall and /fall-color,
   ?qa=1 loads the QA review client from /api/seasonal-qa?asset=client, which
   answers 404 (so nothing loads) anywhere except preview/development. */
(function () {
  "use strict";
  var slug = document.body.getAttribute("data-collection");
  var DATA = window.SeasonalCollections, R = window.SeasonalRender;
  if (!slug || !DATA || !R) return;
  var col = DATA.COLLECTIONS[slug];
  var FB = window.SeasonalImageFallback;
  if (FB) { R.setFailedLookup(FB.isFailed); FB.attach(document); }

  // Entries that carry eventId show that event's image first; their own cover stays the fallback. Progressive: nothing happens
  // unless an entry links an event, and any failure leaves the page as rendered. The lookup lives in /event-image.js.
  function hydrateEventImages(redraw) {
    if (!col || !(col.entries || []).some(function (e) { return e && e.eventId; })) return;
    var sc = document.createElement("script"); sc.src = "/event-image.js";
    sc.onload = function () { if (window.EventImage) window.EventImage.hydrate(col.entries, function (u, o) { return fetch(u, o); }, function () { redraw(false); }); };
    document.head.appendChild(sc);
  }

  function initPublic() {
    var p = new URLSearchParams(location.search);
    var state = { category: p.get("cat") || "all", query: p.get("q") || "", view: ({ list: 1, map: 1 })[p.get("view")] ? p.get("view") : "grid", origin: null };
    if (state.view === "map" && !R.mapEnabled(col)) state.view = "grid";
    var known = R.usedCategories(col).map(function (c) { return c.id; });
    if (state.category !== "all" && known.indexOf(state.category) < 0) state.category = "all";

    function sync(scroll) {
      document.getElementById("scResults").innerHTML = R.results(col, state);
      var dm = document.getElementById("scDontMissWrap"); if (dm) dm.innerHTML = R.dontMiss(col, state);   // featured row follows search and category
      document.getElementById("scCount").textContent = R.visible(col, state).length + " of " + DATA.live(col).length + " destinations";
      [].forEach.call(document.querySelectorAll(".sc-chip"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-cat") === state.category)); });
      var cs = document.getElementById("scCatSummary"); if (cs) cs.innerHTML = R.catSummary(col, state);
      [].forEach.call(document.querySelectorAll("button.sc-view"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === state.view)); });
      var s = document.getElementById("scSearch"); if (s && s.value !== state.query) s.value = state.query;
      var q = new URLSearchParams(location.search);   // keep other URL params; only touch ours
      q.delete("cat"); q.delete("q"); q.delete("view");
      if (state.category !== "all") q.set("cat", state.category);
      if (state.query) q.set("q", state.query);
      if (state.view === "list" || state.view === "map") q.set("view", state.view);
      try { history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "")); } catch (e) {}
      if (scroll) document.getElementById("scExplore").scrollIntoView({ behavior: "smooth", block: "start" });
      if (FB) FB.scan(document.getElementById("scResults"));
      R.fitTitles(document);
      var clr = document.getElementById("scNearClear"); if (clr) clr.hidden = !state.origin;
      var st = document.getElementById("scNearStatus");
      if (st && state.origin) st.textContent = R.nearStatus(state.origin);
      if (state.view === "map" && window.SeasonalMapView) window.SeasonalMapView.update(R.visible(col, state), state.origin, R);
    }
    function loadMapScript() {
      if (window.SeasonalMapView || state.view !== "map") return;
      function add(src, next) { var sc = document.createElement("script"); sc.src = src; sc.onload = next; document.head.appendChild(sc); }
      if (window.MapFoundation) add("/seasonal/map-view.js", function () { sync(false); });
      else add("/map-foundation.js", function () { add("/seasonal/map-view.js", function () { sync(false); }); });
    }
    function say(msg) { var st = document.getElementById("scNearStatus"); if (st) st.textContent = msg; }
    function setOrigin(o) { state.origin = o; sync(false); }
    function norm(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
    function cityLookup() {
      var inp = document.getElementById("scCity"), raw = inp ? inp.value : "", t = norm(raw);
      if (!t) { say("Type a city and choose it from the list."); return; }
      if (/^(\d{5}(-\d{4})?|[a-z]\d[a-z] ?\d[a-z]\d)$/i.test(raw.trim())) { say("Only cities are supported, not ZIP or postal codes. Choose a city from the list."); return; }
      var cities = window.SeasonalCities || [], hit = null;
      cities.forEach(function (c) { if (!hit && (norm(c.name + " " + c.region) === t || norm(c.name) === t || norm(c.name + ", " + c.region) === t)) hit = c; });
      if (!hit) { say("We don't have \u201c" + raw.trim() + "\u201d yet. Choose a city from the list; ZIP and postal codes are not supported."); return; }
      setOrigin({ lat: hit.lat, lng: hit.lng, kind: "city", label: hit.name + ", " + hit.region });
    }
    function describeCities() {
      var h = document.getElementById("scCityHelp"), cs = window.SeasonalCities;
      if (!h || !cs) return;
      var n = { Michigan: 0, Ontario: 0, Ohio: 0 };
      cs.forEach(function (c) { if (n[c.region] != null) n[c.region]++; });
      h.textContent = cs.length + " cities are listed: " + n.Michigan + " in Michigan, " + n.Ontario + " in Ontario (the Windsor\u2013Essex area, Chatham and Sarnia) and " + n.Ohio + " in Ohio (Toledo, Bowling Green and Huron). A city not on the list, a ZIP or a postal code is not supported. Distances are from the city\u2019s center.";
    }
    function fillSuggestions() {
      var inp = document.getElementById("scCity"), dl = document.getElementById("scCityList");
      if (!inp || !dl || !window.SeasonalCities) return;
      var t = norm(inp.value), out = [];
      window.SeasonalCities.forEach(function (c) { if (out.length < 8 && (!t || norm(c.name).indexOf(t) === 0)) out.push('<option value="' + R.esc(c.name + ", " + c.region) + '">'); });
      dl.innerHTML = out.join("");
    }
    document.addEventListener("click", function (e) {
      var cl = e.target.closest && e.target.closest('.sc-pop a[href^="#sc-card-"]');
      if (cl) { var t = document.getElementById(cl.getAttribute("href").slice(1)); if (t) { e.preventDefault(); t.setAttribute("tabindex", "-1"); t.scrollIntoView({ block: "center" }); t.focus(); } return; }
      var id = e.target.closest && e.target.closest("#scNearBtn,#scCityGo,#scNearClear");
      if (id) {
        if (id.id === "scNearClear") { state.origin = null; var ci = document.getElementById("scCity"); if (ci) ci.value = ""; say("Editorial order."); sync(false); }
        else if (id.id === "scCityGo") cityLookup();
        else if (!navigator.geolocation) say("This browser can't share a location. Choose a city instead.");
        else {
          say("Asking your browser for your location\u2026");
          navigator.geolocation.getCurrentPosition(function (pos) { setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, kind: "geo", label: "your location" }); },
            function () { say("Location wasn't shared, so the list stays in editorial order. You can choose a city instead."); },
            { maximumAge: 300000, timeout: 15000 });
        }
        return;
      }
      var b = e.target.closest("[data-cat],[data-view]");
      if (!b) return;
      if (b.hasAttribute("data-view")) { state.view = b.getAttribute("data-view"); sync(false); loadMapScript(); return; }
      state.category = b.getAttribute("data-cat"); sync(b.classList.contains("sc-tile"));
    });
    var s = document.getElementById("scSearch");
    if (s) s.addEventListener("input", function () { state.query = s.value; sync(false); });
    document.addEventListener("input", function (e) { if (e.target && e.target.id === "scCity") fillSuggestions(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target && e.target.id === "scCity") { e.preventDefault(); cityLookup(); } });
    sync(false);
    hydrateEventImages(sync);
    describeCities();
    loadMapScript();
    // shared title fit: again once the webfonts have loaded, and when the viewport changes
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { R.fitTitles(document); });
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { R.fitTitles(document); }, 150); });
  }

  function loadQa() {
    return new Promise(function (resolve) {
      var sc = document.createElement("script");
      sc.src = "/api/seasonal-qa?asset=client";
      sc.onload = function () { resolve(!!window.SeasonalQA); };
      sc.onerror = function () { resolve(false); };
      document.head.appendChild(sc);
    });
  }
  var wantsQa = ["halloween", "fall", "fall-color"].indexOf(slug) >= 0 && new URLSearchParams(location.search).get("qa") === "1";
  if (wantsQa) {
    loadQa().then(function (ok) {
      if (!ok) return false;
      return window.SeasonalQA.mount(document, location, function (u, o) { return fetch(u, o); }, col, FB);
    }).then(function (ok) { if (!ok) initPublic(); }, function () { initPublic(); });
  } else initPublic();
})();
