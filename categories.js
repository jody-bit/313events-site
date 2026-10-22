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
// Loading this file in <head> also writes that block into the page (<style id="category-tokens">), so a page
// never declares a --c-* value itself.
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

  var api = Object.freeze({ list: Object.freeze(TABLE), cssVar: cssVar, hex: hex, pinHexMap: pinHexMap, tokenCss: tokenCss });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document) {
    root.Categories = api;
    var el = root.document.createElement("style");
    el.id = "category-tokens";
    el.textContent = tokenCss();
    (root.document.head || root.document.documentElement).appendChild(el);
  }
})(typeof window !== "undefined" ? window : null);
