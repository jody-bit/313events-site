// search-match.js — the one event search matcher for the homepage, calendar and map. Plain static include (a <script src>,
// no build step), same pattern as event-links.js. Exposes one global: `SearchMatch` (also module.exports for tests and for
// discovery.js, which delegates to it).
//
// WHY (owner decision 2026-10-24): three pages had three matchers. The homepage searched title, venue, city, category,
// neighborhood and source as one adjacent phrase; calendar and map searched title and venue only. None split words or treated
// "&" and "and" alike. This is the single implementation; no page keeps a private substring test.
//
// WHAT IT SEARCHES (all seven approved fields; nothing the old homepage searched is dropped)
//   title, venue name, city, verified city aliases, category label, neighborhood, source.
//   Descriptions and addresses are NOT searched (owner decision 2026-10-24: deferred).
//
// HOW IT MATCHES
//   1. Both sides are normalised: lowercase, diacritics removed, "&" and "+" become "and", apostrophes dropped, every other
//      punctuation mark becomes a space, whitespace collapsed.
//   2. An event matches when EITHER the whole normalised query appears in the text (the old behaviour, so no existing search
//      stops working) OR every query word is found in it, in any order. A word of three or more characters is found anywhere
//      inside a word of the text (as before); a word of one or two characters must start a word, to avoid noise.
//   3. No fuzzy matching: "Dresden" does not match "Dryden".
//
// ALIASES are never guessed. Two kinds are built in, both already approved elsewhere in the repo (city-resolution.js rules 3
// and 4): "Twp" is "Township", and Grosse Pointe Farms / Shores also answer to "Grosse Pointe". A reviewed alias table from
// Platform plugs in through SearchMatch.setAliasResolver(fn) (fn(cityString) -> array of strings); nothing else is added here.
(function (root) {
  "use strict";

  function normalize(value) {
    var s = String(value == null ? "" : value).toLowerCase();
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return s.replace(/&|\+/g, " and ").replace(/['’‘`]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  // Built-in verified aliases (see header). Returns extra strings to search for a stored city value.
  var extraAliases = null;
  function builtinAliases(city) {
    var n = normalize(city), out = [];
    if (/\btwp\b/.test(n)) out.push(n.replace(/\btwp\b/g, "township"));
    if (/\btownship\b/.test(n)) out.push(n.replace(/\btownship\b/g, "twp"));
    if (/^grosse pointe (farms|shores)\b/.test(n)) out.push("grosse pointe");
    return out;
  }
  function aliasesFor(city) {
    var out = builtinAliases(city);
    if (extraAliases) {
      var more = extraAliases(city);
      if (more && more.length) out = out.concat(more);
    }
    return out;
  }
  function setAliasResolver(fn) { extraAliases = typeof fn === "function" ? fn : null; }

  function categoryLabelOf(e, opts) {
    if (opts && typeof opts.categoryLabel === "function") return opts.categoryLabel(e);
    if (opts && typeof opts.categoryLabel === "string") return opts.categoryLabel;
    var C = root && root.Categories;
    if (C && C.list) for (var i = 0; i < C.list.length; i++) if (C.list[i].key === e.cat) return C.list[i].label;
    return "";
  }

  // The text one event is searched against, in the fixed field order.
  function textOf(e, opts) {
    var city = e.searchCity != null ? e.searchCity : e.city;
    var parts = [e.title, e.venue, city, categoryLabelOf(e, opts), e.neighborhood, e.source];
    if (city) parts = parts.concat(aliasesFor(city));
    return normalize(parts.filter(Boolean).join(" "));
  }

  function wordFound(text, word) {
    if (word.length >= 3) return text.indexOf(word) !== -1;
    return (" " + text).indexOf(" " + word) !== -1;
  }

  function matches(e, query, opts) {
    var q = normalize(query);
    if (!q) return true;
    if (!e) return false;
    var text = textOf(e, opts);
    if (text.indexOf(q) !== -1) return true;
    var words = q.split(" ");
    for (var i = 0; i < words.length; i++) if (!wordFound(text, words[i])) return false;
    return true;
  }

  // Calendar and map read the raw events table, which carries no neighborhood; the homepage's public view does. So the two
  // pages ask the same view for just id + neighborhood and attach it, which makes "neighborhood" searchable there too. Failure
  // is silent by design: search then simply runs without that one field, as it did before.
  //   attachNeighborhoods(events, fetchAllRows, supabaseUrl, headers, floorISO) -> Promise<number attached>
  function attachNeighborhoods(events, fetchAllRows, supabaseUrl, headers, floorISO) {
    var url = supabaseUrl + "/rest/v1/events_public?neighborhood=not.is.null" +
      (floorISO ? "&start_date=gte." + floorISO : "") + "&select=id,neighborhood&order=id.asc";
    return fetchAllRows(url, headers).then(function (res) {
      var by = {};
      (res.rows || []).forEach(function (r) { by[r.id] = r.neighborhood; });
      var n = 0;
      events.forEach(function (e) { if (by[e.id] != null) { e.neighborhood = by[e.id]; n++; } });
      return n;
    });
  }

  var api = { attachNeighborhoods: attachNeighborhoods, normalize: normalize, matches: matches, textOf: textOf, aliasesFor: aliasesFor, setAliasResolver: setAliasResolver };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  // Browser page, or a Node test harness: also a global, which is how discovery.js (no require, by design) finds it.
  (typeof window !== "undefined" ? window : globalThis).SearchMatch = api;
})(typeof window !== "undefined" ? window : null);
