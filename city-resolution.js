// city-resolution.js — maps an event's raw city string onto a city in a
// caller-supplied city table, so a source value like "Warren, MI 48092" or
// "Clinton Twp" is plotted at the right city centroid instead of being
// dropped from the map. Plain static include (same pattern as
// calendar-location.js); exposes one global: `CityResolution`.
//
// PHASE 1 (2026-10-16, owner-approved). Rules only, nothing is guessed:
//   1. trim and collapse whitespace
//   2. strip a trailing ", ST" or ", ST 12345[-6789]" (state / ZIP carried in
//      the city field)
//   3. "Twp" / "Twp." -> "Township"; "Charter Township Of X" -> "X Township"
//   4. explicit alias: Grosse Pointe Farms / Shores plot on the Grosse Pointe
//      centroid (separate municipalities, one shared point)
//   5. exact, case-insensitive match against the table
// Anything else (a street address, a typo, an ambiguous word) returns null and
// stays off the map. The raw source value is never modified: callers keep
// event.city as stored and use the result only to choose a plot point.
(function (root) {
  "use strict";

  var STATE_ZIP = /,\s*[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/;

  var ALIASES = {
    "grosse pointe farms": "grosse pointe",
    "grosse pointe shores": "grosse pointe"
  };

  function normalize(raw) {
    if (raw == null) return "";
    var s = String(raw).replace(/\s+/g, " ").trim();
    s = s.replace(STATE_ZIP, "").trim();
    s = s.replace(/\bTwp\.?(?=\s|$)/gi, "Township");
    var m = /^charter township of (.+)$/i.exec(s);
    if (m) s = m[1].trim() + " Township";
    return s.toLowerCase();
  }

  // lookup: Map<lowercase city name, entry>. Returns {key, loc} or null.
  // key is the canonical lowercase table name, so every spelling of a city
  // lands on the same place.
  function resolve(raw, lookup) {
    var n = normalize(raw);
    if (!n) return null;
    if (ALIASES[n]) n = ALIASES[n];
    var loc = lookup.get(n);
    return loc ? { key: n, loc: loc } : null;
  }

  var api = { normalize: normalize, resolve: resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = { CityResolution: api };
  else (typeof window !== "undefined" ? window : globalThis).CityResolution = api;
})(this);
