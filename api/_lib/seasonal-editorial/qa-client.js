/* api/_lib/seasonal-editorial/qa-client.js — served only by /api/seasonal-qa?asset=client (404 outside preview/development).
 * QA-only review mode for THE DARK ORBIT (/halloween?qa=1).
 *
 * Shows all 52 inventory records with their verification state and a
 * lightweight per-card image selector. The dataset is NOT in this file or in
 * any static path; neither is this script: it comes from /api/seasonal-qa, which answers 404 in
 * production. This script also refuses to run on the production hostnames.
 * Selections persist in this browser (localStorage) and export as JSON so
 * they can be folded into the manifest.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../../seasonal/render.js"));
  else root.SeasonalQA = factory(root.SeasonalRender);
})(typeof self !== "undefined" ? self : this, function (R) {
  "use strict";
  var KEY = "313-halloween-qa-image-choices-v1";
  var PROD_HOSTS = ["313.events", "www.313.events"];
  function isProductionHost(h) { return PROD_HOSTS.indexOf(String(h || "").toLowerCase()) >= 0; }
  var esc = R.esc;

  function option(rec, id) {
    var o = rec.image_options.filter(function (x) { return x.id === id; })[0];
    return o || rec.image_options[0];
  }
  function toEntry(rec, choiceId) {
    var o = option(rec, choiceId);
    var fb = [rec.manifest.fallback_image, rec.manifest.secondary_fallback_image].filter(function (u) { return u && u !== o.src; });
    return { id: rec.id, name: rec.name, city: rec.city, region: rec.region, categories: rec.categories, summary: rec.summary, website: rec.website,
      image: { src: o.src, illustrative: o.illustrative, fallbacks: fb } };
  }
  function badge(rec) {
    var p = rec.verification.status === "partial";
    return '<span class="sc-qa-badge ' + (p ? "sc-qa-partial" : "sc-qa-unver") + '">' + (p ? "Partly verified" : "Unverified") + (rec.public ? " · public" : " · QA only") + '</span>';
  }
  function typeLabel(o) {
    return { owner_photo_destination: "Your photo of this place", owner_photo_atmospheric: "Your atmospheric photo (not this place)", generated_illustrative: "Generated artwork", linked_official: "Linked official image (unverified)", linked_third_party: "Linked third-party image (unverified)" }[o.type] || o.type;
  }
  function selector(rec, selId) {
    var cur = option(rec, selId);
    var items = rec.image_options.map(function (o) {
      return '<label class="sc-qa-opt"><input type="radio" name="img-' + esc(rec.id) + '" value="' + esc(o.id) + '"' + (o.id === cur.id ? " checked" : "") + ' data-qa-pick="' + esc(rec.id) + '">' +
        '<img src="' + esc(o.src) + '" alt="" loading="lazy" width="96" height="64">' +
        '<span class="sc-qa-meta"><b>' + esc(typeLabel(o)) + '</b>' +
        '<span>Source: ' + esc(o.source) + '</span><span>Credit: ' + esc(o.credit) + '</span>' +
        '<span>Depicts actual destination: ' + (o.depicts_actual_destination ? "yes" : "no") + ' · Illustrative/generated: ' + (o.illustrative ? "yes" : "no") + '</span>' +
        (o.warnings && o.warnings.length ? '<span class="sc-qa-warn">' + esc(o.warnings.join("; ")) + '</span>' : "") + '</span></label>';
    }).join("");
    return '<details class="sc-qa-sel"><summary>Image: ' + esc(typeLabel(cur)) + ' (' + rec.image_options.length + ' options)</summary><div class="sc-qa-opts">' + items + '</div></details>';
  }
  function detail(rec) {
    var f = rec.verification.flags || [];
    return '<p class="sc-qa-line">' + esc(rec.verification.detail) + '</p>' + (f.length ? '<p class="sc-qa-line sc-qa-flag">' + esc(f.join(" · ")) + '</p>' : "") +
      '<p class="sc-qa-line">Dates/hours: not verified (not shown). Inventory #' + esc(rec.inventory_no) + ' · ' + esc(rec.id) + '</p>';
  }
  function cardHtml(col, rec, choices, view) {
    var e = toEntry(rec, choices[rec.id]);
    return R.card(col, e, { list: view === "list", extra: badge(rec) + detail(rec) + selector(rec, choices[rec.id]), attrs: ' data-qa-status="' + esc(rec.verification.status) + '"' });
  }
  function visible(records, state) {
    return records.filter(function (r) { return R.matches({ name: r.name, city: r.city, region: r.region, summary: r.summary, categories: r.categories }, state); });
  }
  function results(col, records, state, choices) {
    var v = visible(records, state);
    if (!v.length) return '<p class="sc-empty" role="status">No destinations match.</p>';
    return '<ul class="sc-grid sc-qa-grid' + (state.view === "list" ? " sc-list" : "") + '">' + v.map(function (r) { return cardHtml(col, r, choices, state.view); }).join("") + '</ul>';
  }
  function usedCats(col, records) {
    var seen = {}; records.forEach(function (r) { r.categories.forEach(function (c) { seen[c] = 1; }); });
    return col.categories.filter(function (c) { return seen[c.id]; });
  }
  function exportJson(records, choices) {
    return JSON.stringify({ generated: new Date().toISOString(), collection: "halloween", selections: records.map(function (r) {
      var o = option(r, choices[r.id]);
      return { destination_id: r.id, destination_name: r.name, selected_image_id: o.id, selected_image: o.src, selected_type: o.type, is_default: o.id === r.manifest_primary_id || o === r.image_options[0] };
    }) }, null, 2);
  }
  function loadChoices() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function saveChoices(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

  // Browser entry. Resolves true when QA mode is active, false when unavailable.
  function mount(doc, loc, fetchFn, col, FB) {
    if (isProductionHost(loc.hostname)) return Promise.resolve(false);
    return fetchFn("/api/seasonal-qa?c=halloween", { headers: { accept: "application/json" } }).then(function (res) {
      if (!res.ok) return false;
      return res.json();
    }).then(function (data) {
      if (!data || !data.records) return false;
      var records = data.records, choices = loadChoices(), state = { category: "all", query: "", view: "grid" };
      var counts = { partial: 0, unver: 0 };
      records.forEach(function (r) { r.verification.status === "partial" ? counts.partial++ : counts.unver++; });
      var chips = doc.querySelector(".sc-chips");
      chips.innerHTML = '<button type="button" class="sc-chip" data-cat="all" aria-pressed="true">All</button>' + usedCats(col, records).map(function (c) {
        return '<button type="button" class="sc-chip" data-cat="' + esc(c.id) + '" aria-pressed="false">' + esc(c.label) + '</button>'; }).join("");
      var bar = doc.createElement("div");
      bar.className = "sc-qa-bar"; bar.setAttribute("role", "status");
      bar.innerHTML = '<strong>QA MODE</strong> — not public. ' + records.length + ' records · ' + counts.partial + ' partly verified · ' + counts.unver + ' unverified. Image choices save in this browser. ' +
        '<button type="button" class="sc-chip" id="scQaExport">Download image selections (JSON)</button> <button type="button" class="sc-chip" id="scQaReset">Reset choices</button>';
      doc.querySelector(".sc-filters").insertAdjacentElement("beforebegin", bar);
      var host = doc.getElementById("scResults"), count = doc.getElementById("scCount");
      function render() {
        host.innerHTML = results(col, records, state, choices);
        count.textContent = visible(records, state).length + " of " + records.length + " destinations (QA: all inventory records)";
        [].forEach.call(doc.querySelectorAll(".sc-chip[data-cat]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-cat") === state.category)); });
        [].forEach.call(doc.querySelectorAll("button.sc-view"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === state.view)); });
        if (FB) FB.scan(host);
      }
      doc.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-cat],[data-view],#scQaExport,#scQaReset");
        if (!b) return;
        if (b.id === "scQaExport") {
          var blob = new Blob([exportJson(records, choices)], { type: "application/json" });
          var a = doc.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "halloween-image-selections.json"; doc.body.appendChild(a); a.click(); a.remove(); return;
        }
        if (b.id === "scQaReset") { choices = {}; saveChoices(choices); render(); return; }
        if (b.hasAttribute("data-view")) { state.view = b.getAttribute("data-view"); render(); return; }
        state.category = b.getAttribute("data-cat"); render();
      });
      doc.addEventListener("change", function (e) {
        var id = e.target.getAttribute && e.target.getAttribute("data-qa-pick");
        if (!id) return;
        choices[id] = e.target.value; saveChoices(choices);
        var rec = records.filter(function (r) { return r.id === id; })[0], li = e.target.closest("li.sc-card");
        var tmp = doc.createElement("div"); tmp.innerHTML = cardHtml(col, rec, choices, state.view);
        var fresh = tmp.firstChild; fresh.querySelector("details").open = true; li.replaceWith(fresh); if (FB) FB.scan(fresh);
      });
      var s = doc.getElementById("scSearch");
      if (s) s.addEventListener("input", function () { state.query = s.value; render(); });
      render();
      return true;
    }).catch(function () { return false; });
  }
  return { isProductionHost: isProductionHost, toEntry: toEntry, results: results, visible: visible, exportJson: exportJson, cardHtml: cardHtml, option: option, mount: mount, KEY: KEY };
});
