// discovery.js — the one shared definition of what discovery MEANS on
// 313.events: WHEN + WHERE + WHAT + SEARCH. Plain static include, same
// pattern as legal-snippets.js / paged-fetch.js (a <script src>, no build
// step, no dependency). Exposes exactly one global: `Discovery`.
//
// WHY THIS EXISTS (Product Owner, 2026-10-03): "presentation varies by
// surface, filter semantics must not." Before this file, index.html,
// calendar.html and map.html each carried a private copy of the category
// list, the places table, the date rules, the filter predicate and the
// URL encoding — and the copies had already drifted (search matched seven
// fields on one page and two on the others; the Detroit Orbit was measured
// from Detroit's border on one page and its centre on the others; a link
// with ?when=tomorrow was honoured by one page and silently ignored by the
// rest). This file is the single copy. Each surface keeps its own layout,
// fetching and rendering, holds ONE state object, changes it only through
// change(), and asks matches() whether an event belongs.
//
// WHAT IT IS NOT. No DOM. No network. No stored state: every function is a
// pure function of its arguments (the clock is passed in as ctx.now, and
// read only if a caller omits it). No components, no rendering, no
// framework. It must stay that way — that boundary was approved explicitly.
//
// ---------------------------------------------------------------------
// STATE — one canonical shape, always produced by defaults()/normalize()/
// change()/fromQuery(), always deep-frozen:
//
//   { when:  { mode, from, to },
//     where: { place, radius, neighborhood, here },
//     what:  { paths, free, features },
//     q }
//
//   when.mode   null | 'today' | 'tonight' | 'tomorrow' | 'weekend' |
//               'next7' | 'week' | 'all' | 'dates'   (from/to: 'dates' only)
//               null means "this surface's own default view" — the ONE
//               thing allowed to differ by surface (see ctx.defaultWhen).
//   where.place a name from `places`;  where.here {lat,lng} device location,
//               session-only and never written to a URL;  where.radius
//               5|10|25|50|'orbit'|null;  where.neighborhood exact name.
//   what.paths  selected category paths; EMPTY MEANS ALL EVENTS.
//   what.free   true | false;  what.features  feature keys.
//   q           search text.
//
// SEMANTICS — defined here and nowhere else:
//   WHAT    Nothing selected shows everything. Selections are OR'd with
//           each other. A plain selection replaces ({only}); {add} adds;
//           removing the last one returns to all events.
//   ACROSS  WHEN, WHERE, WHAT and SEARCH are AND'd. `free` and each
//           feature are AND'd too.
//   WHEN    "Today" is America/Detroit time, not the visitor's clock. An
//           event occupies every date from its start date through its end
//           date; with no end date (or an end before its start) it is a
//           single-day event. It is CURRENT or UPCOMING until its last day
//           has passed — or, on its last day, until its known end time has
//           passed.
//           FORWARD-LOOKING modes — a surface's default view, today,
//           tonight, tomorrow, weekend, week, next7, all — start at today
//           and never match an event that is already over.
//           AN EXPLICIT DATE OR DATE RANGE ('dates') is the opposite: it is
//           taken exactly as chosen, past or future, and returns every
//           event that occupied those dates, completed or not. Being over
//           now does not erase an event from the period it belonged to.
//           (ctx.includePast lifts the forward-looking floor for the other
//           modes too — Calendar's history browsing.)
//           tonight = today + a start at 5pm or later ("Evening" counts;
//           an unknown time does not). weekend = Fri–Sun. week = Mon–Sun.
//           next7 = today plus six days. all = today onward.
//   WHERE   Distance is between CITY CENTRES and must be labelled that way
//           — no venue has coordinates. 'orbit' = within 75 miles of
//           Detroit's BORDER (DEC-003). A numeric radius is measured from
//           the chosen place and stays inside the Orbit. An event whose
//           city is not in `places` cannot be placed: it is excluded by
//           any radius filter and reported by facets(…, 'placement').
//   SEARCH  One haystack: title, venue, city, category label,
//           neighborhood, source, note.
//   BLOCKED A small always-on suppression list, applied inside matches()
//           so no surface can forget it.
//
// FEATURES — two kinds, kept distinct (Product Owner, 2026-10-03):
//   DERIVED   properties 313.events determines structurally: has a ticket
//             link, has a photo, was community-submitted, has press
//             coverage.
//   DECLARED  facts explicitly supplied by an organizer, promoter or
//             authoritative source. First one: clothing_optional
//             (events.is_clothing_optional === true).
//   A declared feature asserts something only when it is TRUE. False or
//   unset is NO ASSERTION: there is no "clothing required" feature, label
//   or filter, and none may ever be inferred from a false/unset value.
//
// GENRE, LATER. A WHAT selection is a PATH. Today every path is one
// segment ('music') because no category has children and no event carries
// genre data. When real genre data exists, 'music.electronic.techno'
// becomes valid by adding children below and a path on the event — state
// shape, URL format and matches() do not change. Until then a multi-
// segment path is not a known node, so normalize()/fromQuery() DROP it:
// a genre filter cannot be expressed, exposed or inferred.
//
// URL — toQuery()/fromQuery() are the only codec. Parameter names already
// live across pages are kept so old links and not-yet-migrated pages keep
// working: when, cats, free, features, q, loc, radius, neighborhood (+
// from/to for picked dates). Legacy forms are still READ: when=now,
// when=thisweek, when=date&picked=, when=range&rangeStart=&rangeEnd=,
// radius=all, and a cats= list from the old "everything on, click to turn
// off" model. Calendar's own `date`/`view` are that page's position, not
// discovery state, and are never read here.
//
// ctx — { now, defaultWhen, coverage, includePast }
//   now          Date (or ms / ISO string). The only clock this file uses.
//   defaultWhen  the mode this SURFACE applies when state.when.mode is
//                null. Defaults to 'all'.
//   coverage     ids of events with press coverage, for the 'radar'
//                feature: a Set, a Map, or a plain object keyed by id.
//   includePast  true lets over/past events match (Calendar history).
//
// EVENT — the shape every page's mapSupabaseRow() already produces:
//   { id, date, endDate, time, title, venue, city, neighborhood, cat,
//     free, source, note, ticketUrl, imageUrl, clothingOptional }
//   (`city` is undefined for Detroit, as the pages already store it.)
(function () {
  "use strict";

  // ===================================================================
  // Definitions
  // ===================================================================

  // Canonical categories, in display order. `key` matches the
  // event_category enum in Supabase. Colour is presentation and stays in
  // each page's CSS. `children` is empty everywhere on purpose — see
  // "GENRE, LATER" above.
  var DEFAULT_CATEGORIES = [
    { key: "music",     label: "Music",               children: [] },
    { key: "theatre",   label: "Theatre & Comedy",    children: [] },
    { key: "dance",     label: "Dance & Opera",       children: [] },
    { key: "visual",    label: "Visual Arts",         children: [] },
    { key: "museum",    label: "Museums & History",   children: [] },
    { key: "family",    label: "Family",              children: [] },
    { key: "fest",      label: "Festivals & Parades", children: [] },
    { key: "food",      label: "Food & Markets",      children: [] },
    { key: "film",      label: "Film",                children: [] },
    { key: "nightlife", label: "Nightlife & Club",    children: [] },
    { key: "sports",    label: "Sports",              children: [] },
    { key: "community", label: "Community",           children: [] },
    { key: "vendor",    label: "Vendor Markets",      children: [] },
    { key: "training",  label: "Classes & Training",  children: [] },
    { key: "gaming",    label: "Gaming & Esports",    children: [] }
  ];

  // `applies` is the whole definition of a feature. Each returns true only
  // on positive evidence; nothing here ever asserts an absence.
  var DEFAULT_FEATURES = [
    { key: "tickets",   label: "Tickets available",   kind: "derived",
      applies: function (e) { return !!e.ticketUrl; } },
    { key: "photo",     label: "Has photo",           kind: "derived",
      applies: function (e) { return !!e.imageUrl; } },
    { key: "submitted", label: "Community submitted", kind: "derived",
      applies: function (e) { return e.source === "Venue Submission"; } },
    { key: "radar",     label: "On the Radar",        kind: "derived",
      applies: function (e, ctx) { return hasCoverage(ctx.coverage, e.id); } },
    // DECLARED. Strictly `=== true`: false, null, undefined, "false", 0 and
    // every other value assert nothing.
    { key: "clothing_optional", label: "Clothing optional", kind: "declared",
      applies: function (e) { return e.clothingOptional === true; } }
  ];

  var WHENS = [
    { key: "today",    label: "Today" },
    { key: "tonight",  label: "Tonight" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "weekend",  label: "This Weekend" },
    { key: "next7",    label: "Next 7 Days" },
    { key: "week",     label: "This Week" },
    { key: "all",      label: "All Upcoming" },
    { key: "dates",    label: "Pick Dates" }
  ];

  var RADII = [5, 10, 25, 50, "orbit"];

  // Always-on suppression list, matched case-insensitively against an
  // event's title and note.
  var BLOCKED_NAMES = ["Augustus Williams"];

  // Places: [name, type, region, lat, lng]. City-centre / neighborhood-
  // centre estimates, hand-sourced; see SERVICE_AREA.md. Only `city`
  // entries are matched against an event's own city; neighborhoods are
  // selectable as a "from here" origin.
  var DEFAULT_PLACES = [
    ["Detroit", "city", "Michigan", 42.3314, -83.0458],
    ["Downtown", "neighborhood", "Detroit", 42.3316, -83.0466],
    ["Midtown", "neighborhood", "Detroit", 42.3536, -83.0666],
    ["New Center", "neighborhood", "Detroit", 42.3707, -83.071],
    ["Corktown", "neighborhood", "Detroit", 42.3308, -83.068],
    ["North Corktown", "neighborhood", "Detroit", 42.3385, -83.071],
    ["Core City", "neighborhood", "Detroit", 42.339, -83.079],
    ["Woodbridge", "neighborhood", "Detroit", 42.348, -83.079],
    ["Eastern Market", "neighborhood", "Detroit", 42.3459, -83.0416],
    ["Brush Park", "neighborhood", "Detroit", 42.3435, -83.053],
    ["Lafayette Park", "neighborhood", "Detroit", 42.335, -83.029],
    ["Rivertown", "neighborhood", "Detroit", 42.3395, -83.018],
    ["Indian Village", "neighborhood", "Detroit", 42.366, -82.984],
    ["West Village", "neighborhood", "Detroit", 42.361, -82.991],
    ["Islandview", "neighborhood", "Detroit", 42.363, -82.995],
    ["Milwaukee Junction", "neighborhood", "Detroit", 42.373, -83.057],
    ["North End", "neighborhood", "Detroit", 42.38, -83.066],
    ["Poletown East", "neighborhood", "Detroit", 42.373, -83.033],
    ["Jefferson-Chalmers", "neighborhood", "Detroit", 42.4, -82.935],
    ["Belle Isle", "neighborhood", "Detroit", 42.339, -82.97],
    ["Morningside", "neighborhood", "Detroit", 42.407, -82.955],
    ["East English Village", "neighborhood", "Detroit", 42.427, -82.942],
    ["Boston-Edison", "neighborhood", "Detroit", 42.38, -83.101],
    ["Arden Park-East Boston", "neighborhood", "Detroit", 42.383, -83.09],
    ["University District", "neighborhood", "Detroit", 42.415, -83.135],
    ["Palmer Park", "neighborhood", "Detroit", 42.418, -83.135],
    ["Palmer Woods", "neighborhood", "Detroit", 42.427, -83.14],
    ["Sherwood Forest", "neighborhood", "Detroit", 42.427, -83.147],
    ["Bagley", "neighborhood", "Detroit", 42.418, -83.15],
    ["Russell Woods", "neighborhood", "Detroit", 42.386, -83.145],
    ["Fitzgerald", "neighborhood", "Detroit", 42.402, -83.167],
    ["Grandmont-Rosedale", "neighborhood", "Detroit", 42.408, -83.2],
    ["Old Redford", "neighborhood", "Detroit", 42.409, -83.226],
    ["Warrendale", "neighborhood", "Detroit", 42.367, -83.21],
    ["Brightmoor", "neighborhood", "Detroit", 42.402, -83.235],
    ["Mexicantown / Southwest Detroit", "neighborhood", "Detroit", 42.321, -83.094],
    ["Springwells", "neighborhood", "Detroit", 42.311, -83.117],
    ["Delray", "neighborhood", "Detroit", 42.29, -83.118],
    ["Dexter-Fenkell", "neighborhood", "Detroit", 42.387, -83.156],
    ["Wildemere Park", "neighborhood", "Detroit", 42.376, -83.129],
    ["Eastside Historic Cemetery District", "neighborhood", "Detroit", 42.3497, -83.0181],
    ["Windsor", "city", "Ontario", 42.3149, -83.0364],
    ["Bloomfield Hills", "city", "Michigan", 42.5836, -83.2455],
    ["Rochester", "city", "Michigan", 42.6806, -83.1341],
    ["Pontiac", "city", "Michigan", 42.6389, -83.291],
    ["Ypsilanti", "city", "Michigan", 42.2411, -83.613],
    ["Milford", "city", "Michigan", 42.5926, -83.6002],
    ["Clarkston", "city", "Michigan", 42.7364, -83.4199],
    ["Monroe", "city", "Michigan", 41.9164, -83.3977],
    ["Ann Arbor", "city", "Michigan", 42.2808, -83.743],
    ["Brighton", "city", "Michigan", 42.5297, -83.7796],
    ["Chatham", "city", "Ontario", 42.4048, -82.191],
    ["Fenton", "city", "Michigan", 42.797, -83.7054],
    ["Howell", "city", "Michigan", 42.6072, -83.9294],
    ["Toledo", "city", "Ohio", 41.6528, -83.5379],
    ["Port Huron", "city", "Michigan", 42.9709, -82.4252],
    ["Sarnia", "city", "Ontario", 42.9748, -82.4066],
    ["Flint", "city", "Michigan", 43.0125, -83.6875],
    ["Adrian", "city", "Michigan", 41.8975, -84.0372],
    ["Jackson", "city", "Michigan", 42.2459, -84.4013],
    ["Owosso", "city", "Michigan", 42.9964, -84.1783],
    ["Lansing", "city", "Michigan", 42.71417, -84.56],
    ["East Lansing", "city", "Michigan", 42.737, -84.4839],
    ["Hamtramck", "city", "Michigan", 42.3922, -83.0497],
    ["Highland Park", "city", "Michigan", 42.4054, -83.0997],
    ["Dearborn", "city", "Michigan", 42.3223, -83.1763],
    ["Dearborn Heights", "city", "Michigan", 42.3373, -83.2733],
    ["Ferndale", "city", "Michigan", 42.4606, -83.1344],
    ["Royal Oak", "city", "Michigan", 42.4895, -83.1446],
    ["Berkley", "city", "Michigan", 42.5023, -83.1838],
    ["Oak Park", "city", "Michigan", 42.4595, -83.183],
    ["Southfield", "city", "Michigan", 42.4734, -83.2219],
    ["Birmingham", "city", "Michigan", 42.5467, -83.2113],
    ["Troy", "city", "Michigan", 42.6064, -83.1499],
    ["Sterling Heights", "city", "Michigan", 42.5803, -83.0302],
    ["Warren", "city", "Michigan", 42.5145, -83.0147],
    ["Madison Heights", "city", "Michigan", 42.5292, -83.1057],
    ["Auburn Hills", "city", "Michigan", 42.6875, -83.2341],
    ["Rochester Hills", "city", "Michigan", 42.6583, -83.1499],
    ["Waterford", "city", "Michigan", 42.6892, -83.3585],
    ["Novi", "city", "Michigan", 42.4806, -83.4755],
    ["Farmington Hills", "city", "Michigan", 42.4989, -83.3677],
    ["Livonia", "city", "Michigan", 42.3684, -83.3527],
    ["Westland", "city", "Michigan", 42.3242, -83.4002],
    ["Taylor", "city", "Michigan", 42.2409, -83.2699],
    ["Lincoln Park", "city", "Michigan", 42.2506, -83.1785],
    ["Wyandotte", "city", "Michigan", 42.2142, -83.1499],
    ["Grosse Pointe", "city", "Michigan", 42.3861, -82.9116],
    ["St. Clair Shores", "city", "Michigan", 42.497, -82.8888],
    ["Roseville", "city", "Michigan", 42.4973, -82.9371],
    ["Eastpointe", "city", "Michigan", 42.467, -82.956],
    ["Utica", "city", "Michigan", 42.6264, -83.0341],
    ["Shelby Township", "city", "Michigan", 42.6642, -83.0341],
    ["Clinton Township", "city", "Michigan", 42.5869, -82.92],
    ["Mount Clemens", "city", "Michigan", 42.5973, -82.8794],
    ["Grand Blanc", "city", "Michigan", 42.927, -83.6249]
  ];

  // Detroit's municipal boundary ([lng, lat], 70 points, Douglas-Peucker
  // simplified from the City of Detroit's own GIS layer) — the reference
  // the 75-mile Orbit is measured from. See DEC-003 and SERVICE_AREA.md.
  var DEFAULT_BOUNDARY = [
    [-82.91625,42.42135],[-82.91034,42.41902],[-82.91055,42.41719],[-82.91863,42.39956],[-82.92149,42.39546],
    [-82.93542,42.38978],[-82.9468,42.38699],[-82.93027,42.36214],[-82.93087,42.3619],[-82.92859,42.358],
    [-82.92397,42.35212],[-82.94541,42.3474],[-82.95977,42.33977],[-82.98912,42.33248],[-83.01895,42.33062],
    [-83.06356,42.31686],[-83.07994,42.30717],[-83.0999,42.2867],[-83.11463,42.29018],[-83.11813,42.28973],
    [-83.11987,42.28755],[-83.11764,42.28041],[-83.11877,42.27913],[-83.13745,42.28279],[-83.16097,42.25496],
    [-83.16635,42.25968],[-83.16811,42.26391],[-83.16983,42.26458],[-83.15816,42.27884],[-83.167,42.28957],
    [-83.16166,42.29178],[-83.15825,42.29202],[-83.15769,42.29496],[-83.15169,42.29626],[-83.14999,42.29583],
    [-83.14894,42.29341],[-83.14724,42.29257],[-83.14256,42.29441],[-83.14045,42.29775],[-83.14242,42.30569],
    [-83.1406,42.30668],[-83.13964,42.30866],[-83.1407,42.31101],[-83.15313,42.32809],[-83.15647,42.32724],
    [-83.1569,42.33696],[-83.15296,42.33759],[-83.14994,42.33984],[-83.14835,42.34469],[-83.14766,42.35192],
    [-83.19653,42.35089],[-83.19606,42.33644],[-83.21534,42.33614],[-83.21528,42.32902],[-83.22514,42.32881],
    [-83.22783,42.3326],[-83.23458,42.32984],[-83.23503,42.33584],[-83.23749,42.33574],[-83.23777,42.34309],
    [-83.26384,42.34169],[-83.26591,42.35705],[-83.26658,42.37879],[-83.27491,42.37859],[-83.27586,42.40728],
    [-83.28638,42.407],[-83.28773,42.44268],[-82.94053,42.45037],[-82.95128,42.43581],[-82.91625,42.42135]
  ];

  var DEFAULT_CONFIG = {
    categories: DEFAULT_CATEGORIES,
    features: DEFAULT_FEATURES,
    places: DEFAULT_PLACES,
    boundary: DEFAULT_BOUNDARY,
    orbitMiles: 75,
    timeZone: "America/Detroit",
    surfaces: { home: "/", calendar: "/calendar.html", map: "/map.html" }
  };

  // ===================================================================
  // Small pure helpers (no config needed)
  // ===================================================================

  function deepFreeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }

  var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function isISO(s) {
    if (typeof s !== "string") return false;
    var m = ISO_RE.exec(s);
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function isoToUTC(iso) {
    var m = ISO_RE.exec(iso);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  function addDays(iso, n) {
    return new Date(isoToUTC(iso) + n * 86400000).toISOString().slice(0, 10);
  }
  function dayOfWeek(iso) { return new Date(isoToUTC(iso)).getUTCDay(); } // 0=Sun..6=Sat

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function shortDate(iso) {
    var m = ISO_RE.exec(iso);
    return MONTHS[+m[2] - 1] + " " + (+m[3]);
  }

  // Free-text time_display ("7:30 PM", "12:00–3:00 PM", "Noon–11:00 PM",
  // "Evening") -> {start:{h,m}, end:{h,m}|null}, or null when nothing is
  // parseable. Ported unchanged from index.html's parseTimeRange(): a bare
  // "5:30" borrows its AM/PM from the next fully-specified time after it.
  function parseTimeRange(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return null;
    var tokens = [], m;
    var full = /(\d{1,2}):(\d{2})\s*(AM|PM)/gi;
    while ((m = full.exec(timeStr))) {
      var hh = parseInt(m[1], 10) % 12;
      if (/PM/i.test(m[3])) hh += 12;
      tokens.push({ index: m.index, time: { h: hh, m: parseInt(m[2], 10) }, hasMeridiem: true });
    }
    var bare = /\b(\d{1,2}):(\d{2})\b(?!\s*(?:AM|PM))/gi;
    while ((m = bare.exec(timeStr))) {
      tokens.push({ index: m.index, h12: parseInt(m[1], 10) % 12, m: parseInt(m[2], 10), hasMeridiem: false });
    }
    var noon = /\bnoon\b/gi;
    while ((m = noon.exec(timeStr))) tokens.push({ index: m.index, time: { h: 12, m: 0 }, hasMeridiem: true });
    var midnight = /\bmidnight\b/gi;
    while ((m = midnight.exec(timeStr))) tokens.push({ index: m.index, time: { h: 0, m: 0 }, hasMeridiem: true });
    if (!tokens.length) return null;
    tokens.sort(function (a, b) { return a.index - b.index; });
    tokens.forEach(function (tok, i) {
      if (tok.hasMeridiem) return;
      for (var j = i + 1; j < tokens.length; j++) {
        if (tokens[j].hasMeridiem) {
          var h = tok.h12;
          if (tokens[j].time.h >= 12) h += 12;
          tok.time = { h: h, m: tok.m };
          tok.hasMeridiem = true;
          break;
        }
      }
    });
    var resolved = tokens.filter(function (t) { return t.hasMeridiem; });
    if (!resolved.length) return null;
    return { start: resolved[0].time, end: resolved.length > 1 ? resolved[1].time : null };
  }

  // TONIGHT is a deliberate narrowing: "Evening" counts, a parseable start
  // at 5pm or later counts, an unknown/blank time does NOT.
  function isEvening(timeStr) {
    if (!timeStr) return false;
    if (/evening/i.test(timeStr)) return true;
    var range = parseTimeRange(timeStr);
    return !!(range && range.start.h >= 17);
  }

  // Has this time range's END already passed, `minutes` into the day? Only
  // answerable when an end time is known and the range does not cross
  // midnight (a 10pm–2am event is still "today" all evening).
  function endedByClock(timeStr, minutes) {
    var range = parseTimeRange(timeStr);
    if (!range || !range.end || range.end.h < range.start.h) return false;
    return range.end.h * 60 + range.end.m < minutes;
  }

  function haversineMiles(lat1, lng1, lat2, lng2) {
    var R = 3958.8, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.pow(Math.sin(dLng / 2), 2);
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  function hasCoverage(coverage, id) {
    if (!coverage || id == null) return false;
    if (typeof coverage.has === "function") return coverage.has(id);
    return !!coverage[id];
  }

  function toList(v) {
    if (Array.isArray(v)) return v.slice();
    if (typeof v === "string") return v.split(",");
    return [];
  }

  // ===================================================================
  // build(config) -> the Discovery object.
  // The pages only ever see build(DEFAULT_CONFIG). build() is separate so
  // the tests can prove the genre hierarchy works against a hypothetical
  // taxonomy WITHOUT that taxonomy existing on the site.
  // ===================================================================
  function build(config) {
    var categories = deepFreeze(JSON.parse(JSON.stringify(config.categories)));
    var featureDefs = config.features;
    var features = deepFreeze(featureDefs.map(function (f) {
      return { key: f.key, label: f.label, kind: f.kind };
    }));
    var places = deepFreeze(config.places.map(function (p) {
      return Array.isArray(p) ? { name: p[0], type: p[1], region: p[2], lat: p[3], lng: p[4] } : {
        name: p.name, type: p.type, region: p.region, lat: p.lat, lng: p.lng
      };
    }));
    var whens = deepFreeze(WHENS.map(function (w) { return { key: w.key, label: w.label }; }));
    var radii = deepFreeze(RADII.slice());
    var boundary = config.boundary;
    var ORBIT_MILES = config.orbitMiles;

    // ---- taxonomy index: path -> {label, order, top} ----
    var NODES = new Map();
    var TOP_KEYS = [];
    (function index(list, prefix, top) {
      list.forEach(function (node) {
        var path = prefix ? prefix + "." + node.key : node.key;
        NODES.set(path, { label: node.label, order: NODES.size, top: top || node.key });
        if (!prefix) TOP_KEYS.push(node.key);
        index(node.children || [], path, top || node.key);
      });
    })(categories, "", null);

    var FEATURE_BY_KEY = new Map(featureDefs.map(function (f, i) { return [f.key, { def: f, order: i }]; }));
    var WHEN_BY_KEY = new Map(WHENS.map(function (w) { return [w.key, w]; }));

    // ---- places index ----
    var PLACE_BY_NAME = new Map(places.map(function (p) { return [p.name.toLowerCase(), p]; }));
    var CITY_BY_NAME = new Map(places.filter(function (p) { return p.type === "city"; })
      .map(function (p) { return [p.name.toLowerCase(), p]; }));

    // ---- distance from Detroit's border (local equirectangular
    // projection; accurate to ~0.15 mi at the distances it is used at) ----
    var LAT0 = 42.35, MI_PER_LAT = 69.0, MI_PER_LNG = 69.0 * Math.cos(LAT0 * Math.PI / 180);
    var BOUNDARY_XY = boundary.map(function (pt) {
      return [(pt[0] + 83.4) * MI_PER_LNG, (pt[1] - LAT0) * MI_PER_LAT];
    });
    function milesFromBorder(lat, lng) {
      var px = (lng + 83.4) * MI_PER_LNG, py = (lat - LAT0) * MI_PER_LAT, min = Infinity;
      for (var i = 0; i < BOUNDARY_XY.length - 1; i++) {
        var ax = BOUNDARY_XY[i][0], ay = BOUNDARY_XY[i][1];
        var dx = BOUNDARY_XY[i + 1][0] - ax, dy = BOUNDARY_XY[i + 1][1] - ay;
        var len2 = dx * dx + dy * dy;
        var t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        var d = Math.sqrt(Math.pow(px - (ax + t * dx), 2) + Math.pow(py - (ay + t * dy), 2));
        if (d < min) min = d;
      }
      return min;
    }
    var IN_ORBIT = new Map(); // city name -> boolean, computed once
    function cityInOrbit(city) {
      if (!IN_ORBIT.has(city.name)) IN_ORBIT.set(city.name, milesFromBorder(city.lat, city.lng) <= ORBIT_MILES);
      return IN_ORBIT.get(city.name);
    }

    // ---- the clock: Detroit date + minutes-into-day for a given instant ----
    var clockFormat = null, clockMemoKey = null, clockMemo = null;
    function clockAt(now) {
      var ms = now instanceof Date ? now.getTime() : (now == null ? Date.now() : new Date(now).getTime());
      if (isNaN(ms)) ms = Date.now();
      var key = Math.floor(ms / 60000);
      if (key === clockMemoKey) return clockMemo;
      if (!clockFormat) {
        clockFormat = new Intl.DateTimeFormat("en-CA", {
          timeZone: config.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hourCycle: "h23"
        });
      }
      var p = {};
      clockFormat.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
      clockMemoKey = key;
      clockMemo = { today: p.year + "-" + p.month + "-" + p.day, minutes: (+p.hour % 24) * 60 + (+p.minute) };
      return clockMemo;
    }

    function resolveCtx(ctx) {
      ctx = ctx || {};
      var clock = clockAt(ctx.now);
      var dw = ctx.defaultWhen;
      return {
        today: clock.today,
        minutes: clock.minutes,
        defaultWhen: (dw && dw !== "dates" && WHEN_BY_KEY.has(dw)) ? dw : "all",
        coverage: ctx.coverage || null,
        includePast: ctx.includePast === true
      };
    }

    // =================================================================
    // State
    // =================================================================
    var KNOWN = new WeakSet(); // states this module produced (already canonical)

    function normalizeWhen(input) {
      if (typeof input === "string") input = { mode: input };
      input = input || {};
      var mode = WHEN_BY_KEY.has(input.mode) ? input.mode : null;
      var from = isISO(input.from) ? input.from : null;
      var to = isISO(input.to) ? input.to : null;
      // A bare {from, to} with no mode is a date pick.
      if (!mode && input.mode == null && (from || to)) mode = "dates";
      if (mode !== "dates") return { mode: mode, from: null, to: null };
      if (!from && !to) return { mode: null, from: null, to: null };
      if (!from) from = to;
      if (!to) to = from;
      if (to < from) { var swap = from; from = to; to = swap; }
      return { mode: "dates", from: from, to: to };
    }

    function normalizeWhere(input) {
      input = input || {};
      var here = null;
      if (input.here && isFinite(input.here.lat) && isFinite(input.here.lng) &&
          typeof input.here.lat === "number" && typeof input.here.lng === "number") {
        here = { lat: input.here.lat, lng: input.here.lng };
      }
      var place = null;
      if (!here && typeof input.place === "string") {
        var found = PLACE_BY_NAME.get(input.place.trim().toLowerCase());
        if (found) place = found.name;
      }
      var radius = input.radius;
      if (radius === "all") radius = "orbit"; // legacy wire name
      if (typeof radius === "string" && /^\d+$/.test(radius)) radius = parseInt(radius, 10);
      if (RADII.indexOf(radius) === -1) radius = null;
      var hasOrigin = !!(here || place);
      // Choosing a place with no radius means the widest tier, as the
      // homepage has always done; a numeric radius with nothing to measure
      // from means nothing.
      if (hasOrigin && radius === null) radius = "orbit";
      if (!hasOrigin && typeof radius === "number") radius = null;
      var neighborhood = (typeof input.neighborhood === "string" && input.neighborhood.trim())
        ? input.neighborhood.trim() : null;
      return { place: place, radius: radius, neighborhood: neighborhood, here: here };
    }

    function normalizeWhat(input) {
      input = input || {};
      var seen = new Set();
      var paths = toList(input.paths).map(function (p) { return String(p).trim(); })
        .filter(function (p) { return NODES.has(p) && !seen.has(p) && seen.add(p); })
        .sort(function (a, b) { return NODES.get(a).order - NODES.get(b).order; });
      // Every top-level category selected is the same as no filter at all
      // (this is also what an old "all chips on" link decodes to).
      if (TOP_KEYS.length && TOP_KEYS.every(function (k) { return seen.has(k); })) paths = [];
      var seenF = new Set();
      var feats = toList(input.features).map(function (f) { return String(f).trim(); })
        .filter(function (f) { return FEATURE_BY_KEY.has(f) && !seenF.has(f) && seenF.add(f); })
        .sort(function (a, b) { return FEATURE_BY_KEY.get(a).order - FEATURE_BY_KEY.get(b).order; });
      var free = input.free === true || input.free === 1 || input.free === "1";
      return { paths: paths, free: free, features: feats };
    }

    function normalize(input) {
      if (input && KNOWN.has(input)) return input;
      input = (input && typeof input === "object") ? input : {};
      var q = typeof input.q === "string" ? input.q.trim().slice(0, 200) : "";
      var state = deepFreeze({
        when: normalizeWhen(input.when),
        where: normalizeWhere(input.where),
        what: normalizeWhat(input.what),
        q: q
      });
      KNOWN.add(state);
      return state;
    }

    var DEFAULTS = normalize({});
    function defaults() { return DEFAULTS; }

    function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

    // The only way a surface modifies state. Never mutates; returns a new
    // canonical state. Patch keys (any combination):
    //   reset: true                       start from defaults()
    //   when:  'weekend' | null | {from, to} | {mode, from, to}
    //   where: null | {place?, radius?, neighborhood?, here?}   (merged)
    //   what:  {only: path} | {add: path} | {remove: path} | {clear: true}
    //   free:  true | false
    //   feature: {add: key} | {remove: key} | {clear: true}
    //   q:     'text'
    function change(state, patch) {
      var s = normalize(state);
      patch = patch || {};
      if (patch.reset) s = DEFAULTS;
      var next = {
        when: { mode: s.when.mode, from: s.when.from, to: s.when.to },
        where: { place: s.where.place, radius: s.where.radius, neighborhood: s.where.neighborhood, here: s.where.here },
        what: { paths: s.what.paths.slice(), free: s.what.free, features: s.what.features.slice() },
        q: s.q
      };

      if (has(patch, "when")) next.when = patch.when === null ? {} : patch.when;

      if (has(patch, "where")) {
        var w = patch.where;
        if (w === null) {
          next.where = {};
        } else {
          if (has(w, "place")) { next.where.place = w.place; if (w.place) next.where.here = null; }
          if (has(w, "here")) { next.where.here = w.here; if (w.here) next.where.place = null; }
          if (has(w, "radius")) next.where.radius = w.radius;
          if (has(w, "neighborhood")) next.where.neighborhood = w.neighborhood;
          // Removing the origin removes the distance that was measured from it.
          if ((has(w, "place") || has(w, "here")) && !next.where.place && !next.where.here && !has(w, "radius")) {
            next.where.radius = null;
          }
        }
      }

      if (has(patch, "what") && patch.what) {
        var p = patch.what;
        if (p.clear) next.what.paths = [];
        if (has(p, "only") && NODES.has(p.only)) next.what.paths = [p.only];
        if (has(p, "add") && NODES.has(p.add)) next.what.paths.push(p.add);
        if (has(p, "remove")) next.what.paths = next.what.paths.filter(function (x) { return x !== p.remove; });
      }

      if (has(patch, "free")) next.what.free = patch.free === true;

      if (has(patch, "feature") && patch.feature) {
        var f = patch.feature;
        if (f.clear) next.what.features = [];
        if (has(f, "add") && FEATURE_BY_KEY.has(f.add)) next.what.features.push(f.add);
        if (has(f, "remove")) next.what.features = next.what.features.filter(function (x) { return x !== f.remove; });
      }

      if (has(patch, "q")) next.q = patch.q == null ? "" : String(patch.q);

      // A patch that changes nothing hands back the same object, so a
      // surface can tell "nothing changed" with ===.
      var result = normalize(next);
      return JSON.stringify(result) === JSON.stringify(s) ? s : result;
    }

    // =================================================================
    // URL codec
    // =================================================================
    function queryParams(state) {
      var s = normalize(state);
      var params = [];
      if (s.when.mode) {
        params.push(["when", s.when.mode]);
        if (s.when.mode === "dates") {
          params.push(["from", s.when.from]);
          if (s.when.to !== s.when.from) params.push(["to", s.when.to]);
        }
      }
      if (s.what.paths.length) params.push(["cats", s.what.paths.join(",")]);
      if (s.what.free) params.push(["free", "1"]);
      if (s.what.features.length) params.push(["features", s.what.features.join(",")]);
      if (s.q) params.push(["q", s.q]);
      // Device location is never written: it has no stable name, and raw
      // coordinates would put the visitor's location into a shareable link.
      if (s.where.place) {
        params.push(["loc", s.where.place]);
        params.push(["radius", s.where.radius === "orbit" ? "all" : String(s.where.radius)]);
      } else if (s.where.radius === "orbit") {
        params.push(["radius", "all"]);
      }
      if (s.where.neighborhood) params.push(["neighborhood", s.where.neighborhood]);
      return params;
    }
    function encode(params) {
      return params.map(function (kv) {
        return encodeURIComponent(kv[0]) + "=" + encodeURIComponent(kv[1]).replace(/%20/g, "+");
      }).join("&");
    }
    function toQuery(state) { return encode(queryParams(state)); }

    function parseQuery(input) {
      var out = new Map();
      if (input && typeof input.forEach === "function" && typeof input.get === "function") {
        input.forEach(function (v, k) { if (!out.has(k)) out.set(k, v); }); // URLSearchParams
        return out;
      }
      var str = typeof input === "string" ? input : "";
      var qAt = str.indexOf("?");
      if (qAt !== -1) str = str.slice(qAt + 1);
      var hashAt = str.indexOf("#");
      if (hashAt !== -1) str = str.slice(0, hashAt);
      str.split("&").forEach(function (pair) {
        if (!pair) return;
        var eq = pair.indexOf("=");
        var k = eq === -1 ? pair : pair.slice(0, eq), v = eq === -1 ? "" : pair.slice(eq + 1);
        try {
          k = decodeURIComponent(k.replace(/\+/g, " "));
          v = decodeURIComponent(v.replace(/\+/g, " "));
        } catch (err) { return; } // malformed escape: ignore the pair
        if (!out.has(k)) out.set(k, v);
      });
      return out;
    }

    var LEGACY_WHEN = { now: "today", thisweek: "week" };

    function fromQuery(input) {
      var p = parseQuery(input);
      var when = {};
      var mode = p.get("when");
      if (mode != null) {
        if (LEGACY_WHEN[mode]) mode = LEGACY_WHEN[mode];
        if (mode === "date") when = { mode: "dates", from: p.get("picked"), to: p.get("picked") };          // legacy homepage
        else if (mode === "range") when = { mode: "dates", from: p.get("rangeStart"), to: p.get("rangeEnd") }; // legacy homepage
        else if (mode === "dates") when = { mode: "dates", from: p.get("from"), to: p.get("to") };
        else when = { mode: mode };
      }
      var place = p.get("loc") || null;
      var radius = p.has("radius") ? p.get("radius") : null;
      if (typeof radius === "string" && /^\d+$/.test(radius)) radius = parseInt(radius, 10);
      // A link naming a place that no longer resolves (renamed, removed)
      // falls back to "no location filter" as it always has — its radius
      // was only ever meaningful relative to that place.
      if (place && !PLACE_BY_NAME.has(place.trim().toLowerCase())) { place = null; radius = null; }
      return normalize({
        when: when,
        where: { place: place, radius: radius, neighborhood: p.get("neighborhood") || null },
        what: { paths: p.get("cats") || "", free: p.get("free") === "1", features: p.get("features") || "" },
        q: p.get("q") || ""
      });
    }

    // A link to another surface carrying this state.
    //
    // Calendar adapter: until calendar.html reads this codec itself it only
    // understands its own `date` parameter for "open this day". When the
    // state resolves to a single day, that day is added as `date` so the
    // not-yet-migrated Calendar opens on it. `date` is Calendar's own
    // position, never discovery state — fromQuery() ignores it.
    function href(surface, state, ctx) {
      var base = config.surfaces[surface];
      if (!base) throw new Error("Discovery.href: unknown surface " + JSON.stringify(surface));
      var s = normalize(state);
      var params = queryParams(s);
      var singleDay = s.when.mode === "today" || s.when.mode === "tonight" || s.when.mode === "tomorrow" ||
        (s.when.mode === "dates" && s.when.from === s.when.to);
      if (surface === "calendar" && singleDay) params.push(["date", windowOf(s, resolveCtx(ctx)).from]);
      var qs = encode(params);
      return qs ? base + "?" + qs : base;
    }

    // =================================================================
    // Semantics
    // =================================================================
    function windowOf(s, c) {
      var mode = s.when.mode || c.defaultWhen;
      var today = c.today, from = null, to = null, evening = false;
      if (mode === "today") { from = to = today; }
      else if (mode === "tonight") { from = to = today; evening = true; }
      else if (mode === "tomorrow") { from = to = addDays(today, 1); }
      else if (mode === "weekend") {
        var dow = dayOfWeek(today);
        from = addDays(today, dow === 0 ? -2 : 5 - dow); // the Friday of the weekend in progress or next up
        to = addDays(from, 2);
      }
      else if (mode === "week") {
        var d = dayOfWeek(today);
        from = addDays(today, d === 0 ? -6 : 1 - d);     // Monday
        to = addDays(from, 6);
      }
      else if (mode === "next7") { from = today; to = addDays(today, 6); }
      else if (mode === "dates") { from = s.when.from; to = s.when.to; }
      // 'all': open-ended.
      //
      // Forward-looking: every mode except an explicit date pick, unless
      // history is on. Forward-looking windows start at today (what is left
      // of the weekend, of the week) and exclude events that are over. An
      // explicit date or range is never moved, clipped or emptied.
      var forward = mode !== "dates" && !c.includePast;
      if (forward && (from === null || from < today)) from = today;
      return { mode: mode, from: from, to: to, evening: evening, forward: forward };
    }

    function windowFor(state, ctx) {
      var w = windowOf(normalize(state), resolveCtx(ctx));
      return { mode: w.mode, from: w.from, to: w.to };
    }

    function isBlocked(e) {
      for (var i = 0; i < BLOCKED_NAMES.length; i++) {
        var n = BLOCKED_NAMES[i].toLowerCase();
        if ((e.title && String(e.title).toLowerCase().indexOf(n) !== -1) ||
            (e.note && String(e.note).toLowerCase().indexOf(n) !== -1)) return true;
      }
      return false;
    }

    // The event's own category path. Today always its category key. A
    // `path` on the event is honoured only if it is a real node of the
    // taxonomy and sits under the event's own category — nothing is ever
    // derived from titles or descriptions.
    function pathOf(e) {
      if (typeof e.path === "string" && NODES.has(e.path) &&
          (e.path === e.cat || e.path.indexOf(e.cat + ".") === 0)) return e.path;
      return e.cat;
    }

    function cityOf(e) { return CITY_BY_NAME.get(String(e.city || "Detroit").toLowerCase()) || null; }

    function matchWhat(e, what, c, skip) {
      if (skip !== "category" && what.paths.length) {
        var ep = pathOf(e), hit = false;
        for (var i = 0; i < what.paths.length && !hit; i++) {
          hit = ep === what.paths[i] || (typeof ep === "string" && ep.indexOf(what.paths[i] + ".") === 0);
        }
        if (!hit) return false;
      }
      if (what.free && !e.free) return false;
      if (skip !== "feature") {
        for (var j = 0; j < what.features.length; j++) {
          if (!FEATURE_BY_KEY.get(what.features[j]).def.applies(e, c)) return false;
        }
      }
      return true;
    }

    function matchSearch(e, q) {
      if (!q) return true;
      var node = NODES.get(e.cat);
      var hay = [e.title, e.venue, e.city, node ? node.label : "", e.neighborhood, e.source, e.note]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.indexOf(q.toLowerCase()) !== -1;
    }

    function matchWhere(e, where, skip) {
      if (skip !== "neighborhood" && where.neighborhood && e.neighborhood !== where.neighborhood) return false;
      if (skip === "place" || where.radius === null) return true;
      var city = cityOf(e);
      if (!city) return false;              // cannot be placed: never guessed at
      if (!cityInOrbit(city)) return false; // every radius stays inside the Orbit
      if (where.radius === "orbit") return true;
      var origin = where.here || PLACE_BY_NAME.get(String(where.place).toLowerCase());
      return haversineMiles(origin.lat, origin.lng, city.lat, city.lng) <= where.radius;
    }

    function matchWhen(e, s, c) {
      var start = e.date;
      if (typeof start !== "string") return false;
      // No end date, or an end before the start, is a single-day event.
      var end = (typeof e.endDate === "string" && e.endDate > start) ? e.endDate : start;
      var w = windowOf(s, c);
      if (w.forward) {
        if (end < c.today) return false;                                         // its last day has passed
        if (end === c.today && endedByClock(e.time, c.minutes)) return false;    // last day, and it has ended
      }
      if (w.from !== null && end < w.from) return false;
      if (w.to !== null && start > w.to) return false;
      if (w.evening && !isEvening(e.time)) return false;
      return true;
    }

    function test(e, s, c, skip) {
      if (!e || isBlocked(e)) return false;
      return matchWhat(e, s.what, c, skip) && matchSearch(e, s.q) && matchWhere(e, s.where, skip) && matchWhen(e, s, c);
    }

    function matches(event, state, ctx) { return test(event, normalize(state), resolveCtx(ctx)); }

    // Distinct events — never event-days. An id seen twice (a surface
    // passing the same event once per day of its run) is counted once.
    function eachDistinct(events, fn) {
      var seen = new Set();
      (events || []).forEach(function (e) {
        if (!e) return;
        if (e.id != null) { if (seen.has(e.id)) return; seen.add(e.id); }
        fn(e);
      });
    }

    function count(events, state, ctx) {
      var s = normalize(state), c = resolveCtx(ctx), n = 0;
      eachDistinct(events, function (e) { if (test(e, s, c)) n++; });
      return n;
    }

    // Counts per value of one dimension, among events matching the state
    // with THAT dimension's own selection set aside (so a category chip can
    // show how many events choosing it would give).
    //   'category'      every top-level category, in display order (zeros kept)
    //   'feature'       every feature key (zeros kept)
    //   'neighborhood'  neighborhoods present, most events first
    //   'city'          cities present, most events first (Detroit included)
    //   'placement'     { placed, unplaced } — unplaced = city not in `places`
    function facets(events, state, ctx, by) {
      var s = normalize(state), c = resolveCtx(ctx), out = new Map();
      var bump = function (k) { out.set(k, (out.get(k) || 0) + 1); };
      if (by === "category") {
        TOP_KEYS.forEach(function (k) { out.set(k, 0); });
        eachDistinct(events, function (e) {
          if (!test(e, s, c, "category")) return;
          var node = NODES.get(pathOf(e));
          if (node) bump(node.top);
        });
        return out;
      }
      if (by === "feature") {
        featureDefs.forEach(function (f) { out.set(f.key, 0); });
        eachDistinct(events, function (e) {
          if (!test(e, s, c, "feature")) return;
          featureDefs.forEach(function (f) { if (f.applies(e, c)) bump(f.key); });
        });
        return out;
      }
      if (by === "neighborhood") {
        eachDistinct(events, function (e) { if (e.neighborhood && test(e, s, c, "neighborhood")) bump(e.neighborhood); });
      } else if (by === "city") {
        eachDistinct(events, function (e) {
          if (!test(e, s, c, "place")) return;
          var city = cityOf(e);
          bump(city ? city.name : String(e.city));
        });
      } else if (by === "placement") {
        out.set("placed", 0); out.set("unplaced", 0);
        eachDistinct(events, function (e) { if (test(e, s, c, "place")) bump(cityOf(e) ? "placed" : "unplaced"); });
        return out;
      } else {
        throw new Error("Discovery.facets: unknown dimension " + JSON.stringify(by));
      }
      return new Map(Array.from(out.entries()).sort(function (a, b) {
        return b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
      }));
    }

    // Which features an event has — for labels (a declared feature's
    // public label) and anything else that needs the answer per event.
    function featuresOf(event, ctx) {
      if (!event) return [];
      var c = resolveCtx(ctx);
      return featureDefs.filter(function (f) { return f.applies(event, c); }).map(function (f) { return f.key; });
    }

    // The active filters in words, in WHEN / WHERE / WHAT / SEARCH order.
    // Each entry carries the change() patch that removes it. (The dash and
    // middle dot are written as escapes so the labels are right even if
    // this file is ever served or read without a UTF-8 declaration.)
    function describe(state) {
      var s = normalize(state), out = [];
      if (s.when.mode === "dates") {
        var label = s.when.from === s.when.to
          ? WEEKDAYS[dayOfWeek(s.when.from)] + ", " + shortDate(s.when.from)
          : shortDate(s.when.from) + "\u2013" + shortDate(s.when.to);
        out.push({ dim: "when", key: "dates", label: label, remove: { when: null } });
      } else if (s.when.mode) {
        out.push({ dim: "when", key: s.when.mode, label: WHEN_BY_KEY.get(s.when.mode).label, remove: { when: null } });
      }
      if (s.where.place || s.where.here || s.where.radius) {
        var radiusLabel = s.where.radius === "orbit" ? "Detroit Orbit" : s.where.radius + " mi";
        var origin = s.where.here ? "Your location" : s.where.place;
        out.push({
          dim: "where", key: "origin", label: origin ? radiusLabel + " \u00b7 " + origin : radiusLabel,
          remove: { where: { place: null, here: null, radius: null } }
        });
      }
      if (s.where.neighborhood) {
        out.push({ dim: "where", key: "neighborhood", label: s.where.neighborhood, remove: { where: { neighborhood: null } } });
      }
      s.what.paths.forEach(function (p) {
        out.push({ dim: "what", key: p, label: NODES.get(p).label, remove: { what: { remove: p } } });
      });
      if (s.what.free) out.push({ dim: "what", key: "free", label: "Free only", remove: { free: false } });
      s.what.features.forEach(function (f) {
        out.push({ dim: "what", key: f, label: FEATURE_BY_KEY.get(f).def.label, remove: { feature: { remove: f } } });
      });
      if (s.q) out.push({ dim: "search", key: "q", label: '"' + s.q + '"', remove: { q: "" } });
      return out;
    }

    // "Current + upcoming", as a database filter: an event that starts
    // today or later, OR is still running (its end date is today or
    // later). A row with no end date counts only from its start date.
    // Pass ctx (or nothing) to use today's date in Detroit; pass an ISO
    // date to use that date. Combine with the approved-only source
    // (events_public, or status=eq.approved on events).
    function inventoryFilter(todayOrCtx) {
      var today = isISO(todayOrCtx) ? todayOrCtx
        : (todayOrCtx instanceof Date ? clockAt(todayOrCtx).today : resolveCtx(todayOrCtx).today);
      return "or=(start_date.gte." + today + ",end_date.gte." + today + ")";
    }

    return Object.freeze({
      VERSION: 1,
      // definitions
      categories: categories,
      features: features,
      places: places,
      whens: whens,
      radii: radii,
      // state
      defaults: defaults,
      normalize: normalize,
      change: change,
      // url
      toQuery: toQuery,
      fromQuery: fromQuery,
      href: href,
      // semantics
      matches: matches,
      window: windowFor,
      count: count,
      facets: facets,
      featuresOf: featuresOf,
      describe: describe,
      // inventory
      inventoryFilter: inventoryFilter
    });
  }

  var Discovery = build(DEFAULT_CONFIG);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { Discovery: Discovery, _build: build, _defaultConfig: DEFAULT_CONFIG };
  } else {
    (typeof window !== "undefined" ? window : globalThis).Discovery = Discovery;
  }
})();
