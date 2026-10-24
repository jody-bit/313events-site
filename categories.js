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
//   Categories.tagHtml(key, {size})  the ONE event-type label. Every surface that shows an event's type renders this
//                                and nothing else; size is "detail" (event page lead label only) or omitted.
//   Categories.tagCss()          the rules for that label, written into the page with the tokens
// Loading this file in <head> also writes that block, and the label rules, into the page (<style id="category-tokens">),
// so a page never declares a --c-* value or a label style of its own.
//
// BADGE SPECIFICATION (owner review 2026-10-23: one badge, every surface; Option A)
//   Colour      the type's own colour from TABLE, as TEXT; background is the dark tag (--panel, #202020). Never a fill.
//   Type        Space Mono (--font-data), 700, UPPERCASE, letter-spacing .08em, line-height 1.25
//   Size        11px everywhere, all widths (never below 11px); the event page's lead label only is 12px
//   Box         1px border in --line, no radius, padding 3px 7px (detail: 5px 12px); wraps instead of overflowing
//   Contrast    every colour at least 4.5:1 on #202020 (tested)
//   Placement   cards and rows: first item of the meta line; event page: above the title; homepage keeps its right-hand
//               column; radar: under the outlet name. The Radar SOURCE label is plain grey text and is never a badge.
//   Map pins    keep their own marker shape; pin colour comes from the same table (Categories.pinHexMap)
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
    var size = opts && opts.size === "detail" ? " cat-tag--detail" : "";
    return '<span class="cat-tag' + size + '" data-cat="' + esc(c.key) + '">' + esc(c.label) + "</span>";
  }

  // Option A: coloured text on the site's dark tag (--panel / --line, with the same fallbacks the pages use). 11px
  // bold small caps in the data face; wraps instead of overflowing on a 320px screen. All 15 colours clear 4.5:1 on
  // #202020 (test/category-colors.test.js).
  function tagCss() {
    var base = ".cat-tag{display:inline-block;max-width:100%;box-sizing:border-box;font-family:var(--font-data,'Space Mono',monospace);" +
      "font-size:11px;font-weight:700;letter-spacing:.08em;line-height:1.25;text-transform:uppercase;overflow-wrap:anywhere;" +
      "color:var(--ink,#F2F0E8);background:#202020;border:1px solid #2A2A2A;padding:3px 7px;}" +
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
