/* seasonal/image-fallback.js — runtime image fallback for seasonal cards.
 *
 * An <img> that has data-fb (JSON array of fallback URLs) walks its chain
 * [src, ...fallbacks] when a load fails, skipping URLs already known to fail
 * this page session, never looping, and ends on a branded placeholder
 * (no broken-image icon). Card size is held by the container's aspect-ratio,
 * so nothing shifts. Works in the browser; the chain logic is pure and tested.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SeasonalImageFallback = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var failed = {}; // URL -> true, for the life of the page

  function chainOf(src, fbJson) {
    var fb = [];
    try { fb = JSON.parse(fbJson || "[]"); } catch (e) { fb = []; }
    return [src].concat(Array.isArray(fb) ? fb : []);
  }
  // First URL in the chain that has not already failed; null when exhausted.
  function nextSource(chain, failedMap) {
    var seen = {};
    for (var i = 0; i < chain.length; i++) {
      var u = chain[i];
      if (!u || seen[u]) continue;
      seen[u] = true;
      if (!failedMap[u]) return u;
    }
    return null;
  }
  function isFailed(url) { return !!failed[url]; }

  // Fail handler for one <img>-like element. Returns "next" | "placeholder".
  function handleFailure(img, replacePlaceholder) {
    var cur = img.getAttribute("src");
    if (cur) failed[cur] = true;
    var chain = img.__chain || (img.__chain = chainOf(img.getAttribute("data-src0") || cur, img.getAttribute("data-fb")));
    var n = nextSource(chain, failed);
    if (n && n !== cur) { img.setAttribute("src", n); return "next"; }
    replacePlaceholder(img);
    return "placeholder";
  }

  function placeholder(img) {
    var ph = img.ownerDocument.createElement("span");
    ph.className = "sc-ph";
    ph.setAttribute("aria-hidden", "true");
    ph.setAttribute("data-ph", "1");
    if (img.parentNode) img.parentNode.replaceChild(ph, img);
  }

  function attach(doc) {
    // error does not bubble; capture it on the document
    doc.addEventListener("error", function (e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && t.hasAttribute("data-fb")) handleFailure(t, placeholder);
    }, true);
    scan(doc);
  }
  // Catch images that already failed before this script ran.
  function scan(scope) {
    var imgs = scope.querySelectorAll ? scope.querySelectorAll("img[data-fb]") : [];
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (im.complete && im.naturalWidth === 0 && im.getAttribute("src")) handleFailure(im, placeholder);
    }
  }
  return { chainOf: chainOf, nextSource: nextSource, handleFailure: handleFailure, placeholder: placeholder, attach: attach, scan: scan, isFailed: isFailed, _failed: failed };
});
