// categories.js — the one definition of event-type colour for every page.
//
// WHY (owner direction 2026-10-22): event-type colours had drifted into about eight copies (the 15 --c-* CSS
// variables in seven pages, a CATS table in six, CAT_COLORS on the homepage and two hand-typed CAT_HEX maps), and
// the copies disagreed: the 2026-10-04 accessible values existed on the homepage only. Colour is presentation,
// so it lives here and nowhere else; keys, labels and order stay owned by discovery.js and the Supabase
// event_category enum, and test/category-colors.test.js checks this table against both.
//
// WHAT IT PROVIDES (browser global `Categories`; also `module.exports` for tests)
//   Categories.list              frozen [{key, label, token, hex}], canonical order
//   Categories.cssVar(key)       "var(--c-music)" — what pages put in style="" and CSS
//   Categories.hex(key)          the literal colour, for code that cannot use var() (map pins, canvas)
//   Categories.pinHexMap()       { key: hex } for the map pins — see PIN_HELD below
//   Categories.tokenCss()        the :root block defining every --c-* variable
//   Categories.tagHtml(key, {size})  the ONE event-type label (Option A: coloured text on the dark tag). Every
//                                surface that shows an event's type renders this and nothing else; size is
//                                "row" (default), "compact" or "detail" and changes spacing only, never colour.
//   Categories.tagCss()          the rules for that label, written into the page with the tokens
// Loading this file in <head> also writes that block, and the label rules, into the page (<style id="category-tokens">),
// so a page never declares a --c-* value or a label style of its own.
//
// COLOURS are the 2026-10-04 accessible set (Product Owner): six values lightened to clear WCAG AA (4.5:1) for
// small text on the tag background #202020 — music, food, gaming, film, nightlife, fest — the other nine
// unchanged. The type name is always printed beside the colour, so colour is never the only signal.
(function (root) {
  "use strict";
  var TABLE = [
    { key: "music",     label: "Music",               token: "--c-music",     hex: "#8C78FF" },
    { key: "theatre",   label: "Theatre & Comedy",    token: "--c-theatre",   hex: "#FF6A00" },
    { key: "dance",     label: "Dance & Opera",       token: "--c-dance",     hex: "#FF2ECC" },
    { key: "visual",    label: "Visual Arts",         token: "--c-visual",    hex: "#00E5FF" },
    { key: "museum",    label: "Museums & History",   token: "--c-museum",    hex: "#00FFA6" },
    { key: "family",    label: "Family",              token: "--c-family",    hex: "#FFC400" },
    { key: "fest",      label: "Festivals & Parades", token: "--c-fest",      hex: "#FF4266" },
    { key: "food",      label: "Food & Markets",      token: "--c-food",      hex: "#C466FF" },
    { key: "film",      label: "Film",                token: "--c-film",      hex: "#3E86FF" },
    { key: "nightlife", label: "Nightlife & Club",    token: "--c-night",     hex: "#E41AFF" },
    { key: "sports",    label: "Sports",              token: "--c-sports",    hex: "#FF3B3B" },
    { key: "community", label: "Community",           token: "--c-community", hex: "#3DFF6E" },
    { key: "vendor",    label: "Vendor Markets",      token: "--c-vendor",    hex: "#39FF14" },
    { key: "training",  label: "Classes & Training",  token: "--c-training",  hex: "#FFEA00" },
    { key: "gaming",    label: "Gaming & Esports",    token: "--c-gaming",    hex: "#C051FF" }
  ].map(function (c) { return Object.freeze(c); });

  // Map pins: training and gaming have never had a pin colour (the old hand-typed maps stopped at 13 types, so
  // those two fall back to the page's chartreuse). The owner has not decided whether they should change; until
  // she does, they are held out of the pin map so the pins render exactly as before. Delete this set to give
  // them their own colours (the recommendation in the 2026-10-22 category-colour proposal).
  var PIN_HELD = { training: true, gaming: true };

  var BY_KEY = {};
  TABLE.forEach(function (c) { BY_KEY[c.key] = c; });

  function cssVar(key) { return BY_KEY[key] ? "var(" + BY_KEY[key].token + ")" : ""; }
  function hex(key) { return BY_KEY[key] ? BY_KEY[key].hex : ""; }
  function pinHexMap() {
    var m = {};
    TABLE.forEach(function (c) { if (!PIN_HELD[c.key]) m[c.key] = c.hex; });
    return m;
  }
  function tokenCss() {
    return ":root{" + TABLE.map(function (c) { return c.token + ":" + c.hex + ";"; }).join("") + "}";
  }

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; });
  }

  // The event-type label. Colour comes only from the per-category rule below (data-cat), never from the caller.
  // The type NAME is the text, so colour is never the only signal. An unknown key renders nothing.
  function tagHtml(key, opts) {
    var c = BY_KEY[key];
    if (!c) return "";
    var size = opts && (opts.size === "compact" || opts.size === "detail") ? " cat-tag--" + opts.size : "";
    return '<span class="cat-tag' + size + '" data-cat="' + esc(c.key) + '">' + esc(c.label) + "</span>";
  }

  // Option A: coloured text on the site's dark tag (--panel / --line, with the same fallbacks the pages use). 11px
  // bold small caps in the data face; wraps instead of overflowing on a 320px screen. All 15 colours clear 4.5:1 on
  // #202020 (test/category-colors.test.js).
  function tagCss() {
    var base = ".cat-tag{display:inline-block;max-width:100%;box-sizing:border-box;font-family:var(--font-data,'Space Mono',monospace);" +
      "font-size:11px;font-weight:700;letter-spacing:.08em;line-height:1.25;text-transform:uppercase;overflow-wrap:anywhere;" +
      "color:var(--ink,#F2F0E8);background:var(--panel,#202020);border:1px solid var(--line,#2c2c2c);padding:3px 7px;}" +
      ".cat-tag--compact{font-size:10.5px;padding:2px 6px;}" +
      ".cat-tag--detail{font-size:12px;letter-spacing:.06em;padding:5px 12px;}";
    return base + TABLE.map(function (c) { return '.cat-tag[data-cat="' + c.key + '"]{color:var(' + c.token + ');}'; }).join("");
  }

  var api = Object.freeze({ list: Object.freeze(TABLE), cssVar: cssVar, hex: hex, pinHexMap: pinHexMap, tokenCss: tokenCss, tagHtml: tagHtml, tagCss: tagCss });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document) {
    root.Categories = api;
    var el = root.document.createElement("style");
    el.id = "category-tokens";
    el.textContent = tokenCss() + tagCss();
    (root.document.head || root.document.documentElement).appendChild(el);
  }
})(typeof window !== "undefined" ? window : null);
