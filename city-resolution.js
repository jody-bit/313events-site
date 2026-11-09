// city-resolution.js — maps an event's raw city string onto a city in a
// caller-supplied city table, so a source value like "Warren, MI 48092" or
// "Clinton Twp" is plotted at the right city centroid instead of being
// dropped from the map. Plain static include (same pattern as
// calendar-location.js); exposes one global: `CityResolution`.
//
// PHASE 1 (2026-10-16, owner-approved). Rules only, nothing is guessed:
//   1. trim and collapse whitespace
//   2. strip a trailing ", ST" / ", Michigan" / ", ST 12345[-6789]" (state / ZIP carried in
//      the city field); a state given must match the table city's region
//      (MI / OH / ON), otherwise the string stays unresolved
//   3. "Twp" / "Twp." -> "Township"; "Charter Township Of X" -> "X Township"
//   4. explicit alias: Grosse Pointe Farms / Shores / Park plot on the Grosse Pointe
//      centroid (separate municipalities, one shared point)
//   4b. a leading "Mt" / "Mt." reads as "Mount" ("Mt. Clemens" = Mount Clemens)
//   5. exact, case-insensitive match against the table
//   6. PHASE 2 entries carry `sources`: a bare name resolves only when the event's source feed
//      is listed (jurisdiction evidence); an explicit matching state needs no source. The one
//      string rule: city "Ontario" + venue "Town of Kingsville" -> Kingsville.
// Anything else (a street address, a typo, an ambiguous word) returns null and
// stays off the map. The raw source value is never modified: callers keep
// event.city as stored and use the result only to choose a plot point.
(function (root) {
  "use strict";

  // Trailing ", MI", ", MI 48092", ", Michigan", ", Ohio 43604", ", Ontario".
  var STATE_ZIP = /,\s*([A-Za-z]{2}|michigan|ohio|ontario)(?:\s+\d{5}(?:-\d{4})?)?$/i;
  var FULL_NAMES = { MICHIGAN: "MI", OHIO: "OH", ONTARIO: "ON" };

  // A state / province written in the city field must agree with the table
  // entry's region. Anything else ("Warren, OH", "Troy, NY", "Warren, ZZ")
  // is a different place and stays unresolved.
  var REGION_BY_STATE = { MI: "Michigan", OH: "Ohio", ON: "Ontario" };

  var ALIASES = {
    "grosse pointe farms": "grosse pointe",
    "grosse pointe shores": "grosse pointe",
    "grosse pointe park": "grosse pointe"
  };

  // A province is not a city. These two Tourism Windsor Essex rows say "Ontario" and name the
  // Town of Kingsville as the venue (03 Event Intelligence, phase2-matching-rules.csv).
  var GATED_ALIASES = { "ontario": { to: "kingsville", venue: "town of kingsville" } };

  function lc(x) { return x == null ? "" : String(x).replace(/\s+/g, " ").trim().toLowerCase(); }

  function parse(raw) {
    if (raw == null) return { name: "", state: null };
    var s = String(raw).replace(/\s+/g, " ").trim();
    var state = null;
    s = s.replace(STATE_ZIP, function (_, st) { state = st.toUpperCase(); state = FULL_NAMES[state] || state; return ""; }).trim();
    s = s.replace(/\bTwp\.?(?=\s|$)/gi, "Township");
    s = s.replace(/^Mt\.?(?=\s)/i, "Mount");
    var m = /^charter township of (.+)$/i.exec(s);
    if (m) s = m[1].trim() + " Township";
    return { name: s.toLowerCase(), state: state };
  }

  function normalize(raw) { return parse(raw).name; }

  // lookup: Map<lowercase city name, entry>. Returns {key, loc} or null.
  // key is the canonical lowercase table name, so every spelling of a city
  // lands on the same place.
  // ctx (optional): { source, venue } of the event, used only for gated entries.
  function resolve(raw, lookup, ctx) {
    var p = parse(raw);
    var n = p.name;
    if (!n) return null;
    var alias = null;
    var gated = GATED_ALIASES[n];
    if (gated && !p.state) {
      if (!ctx || lc(ctx.venue) !== gated.venue) return null;
      n = gated.to;
    }
    if (ALIASES[n]) { alias = n; n = ALIASES[n]; }
    var loc = lookup.get(n);
    if (!loc) return null;
    if (p.state && REGION_BY_STATE[p.state] !== loc.region) return null;
    if (loc.sources && !(p.state)) {
      if (!ctx || loc.sources.indexOf(lc(ctx.source)) < 0) return null;
    }
    // alias: the real municipality (lowercase) when it shares another city's point
    return { key: n, loc: loc, alias: alias };
  }

  var api = { normalize: normalize, resolve: resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = { CityResolution: api };
  else (typeof window !== "undefined" ? window : globalThis).CityResolution = api;
})(this);
