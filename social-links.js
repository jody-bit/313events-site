// social-links.js: the one list of 313.events social profiles, and the footer row that shows them. Plain static include
// (<script src="/social-links.js" defer>), same pattern as event-links.js. Exposes one global: `SocialLinks` (also module.exports for tests).
//
// WHY (owner direction 2026-10-31): Instagram, Facebook and TikTok sit together in every footer, with clearer tap targets, and adding
// a profile is a one-line edit here, not 16 page edits. Each page keeps its Instagram link in its own HTML as the no-script fallback;
// this script replaces that paragraph's content.
//
// RULES: a profile is shown only when its url is filled in AND is an https link on that network's own domain (checked below), so a
// typo or a wrong host is skipped, never rendered. url stays null until the owner supplies the verified official profile; nothing is guessed.
(function (root) {
  "use strict";

  var LINKS = [
    { key: "instagram", label: "Instagram", url: "https://www.instagram.com/313.thecityison/", host: /(^|\.)instagram\.com$/ },
    { key: "facebook", label: "Facebook", url: null, host: /(^|\.)facebook\.com$/ },
    { key: "tiktok", label: "TikTok", url: null, host: /(^|\.)tiktok\.com$/ }
  ];

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function valid(l) {
    if (!l || !l.url) return false;
    try { var u = new URL(l.url); return u.protocol === "https:" && l.host.test(u.hostname); } catch (e) { return false; }
  }

  // The footer row as HTML. links defaults to the list above; tests pass their own.
  function html(links) {
    var shown = (links || LINKS).filter(valid);
    if (!shown.length) return "";
    return '<span class="fs-label">Follow 313.events</span>' + shown.map(function (l) {
      return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" aria-label="313.events on ' + esc(l.label) + ' (opens in a new tab)">' + esc(l.label) + "</a>";
    }).join("");
  }

  var CSS = "footer.site .footer-social{display:flex;flex-wrap:wrap;align-items:center;gap:0 20px;}"
    + "footer.site .footer-social .fs-label{opacity:.75;}"
    + "footer.site .footer-social a{display:inline-flex;align-items:center;min-height:44px;color:var(--ink,#F2F0E8);text-decoration:underline;text-underline-offset:3px;}"
    + "footer.site .footer-social a:focus-visible{outline:2px solid var(--accent,#D7FF00);outline-offset:2px;}"
    + "@media (max-width:480px){footer.site .footer-social{gap:0 22px;}footer.site .footer-social a{font-size:14px;}}";

  function init() {
    if (typeof document === "undefined") return;
    var rows = document.querySelectorAll("footer.site .footer-social, .footer-social");
    var out = html();
    if (!rows.length || !out) return; // keep the page's own Instagram fallback
    rows.forEach(function (r) { r.innerHTML = out; });
    if (!document.getElementById("social-links-css")) {
      var s = document.createElement("style"); s.id = "social-links-css"; s.textContent = CSS; document.head.appendChild(s);
    }
  }

  var api = { LINKS: LINKS, html: html, valid: valid, init: init };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) { root.SocialLinks = api; if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init(); }
})(typeof window !== "undefined" ? window : null);
