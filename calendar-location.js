// calendar-location.js — the ONE definition of what an event's calendar
// LOCATION is, and how it is written into each export format. Plain static
// include, same pattern as discovery.js / paged-fetch.js (a <script src>, no
// build step). Exposes exactly one global: `CalendarLocation`.
//
// WHY THIS EXISTS (2026-10-09, P0). index.html and event-template.html each
// carried their own copy of buildEventLocation(), which returned only
// "Venue, City" -- so a saved calendar entry had a venue NAME and no street
// address, and the person could not navigate to it. Both copies are now thin
// wrappers over resolveForEvent() below; the Google link, the .ics file (and
// therefore Apple Calendar and Outlook, which import that same file) all take
// their LOCATION from the same result. Do not add a second formatter.
//
// CONTRACT: "Venue Name, Street Address, City, State ZIP".
//   - Street/city/ZIP come only from data the event or its canonical venue
//     actually carries. Nothing is invented: a missing ZIP stays missing.
//   - STATE / PROVINCE is never inferred. The data has no state column, and
//     Detroit's orbit crosses Michigan, Ohio and Ontario, so a city name is
//     not evidence of a state. A state/province (and ZIP/postal code) appears
//     only when the stored address text actually contains it
//     ("..., Hazel Park, MI 48030") or the venue row carries a zip_code.
//     Unknown stays omitted: a supported partial address beats a fabricated
//     complete one. (Systemic gap: venues has no state column -- DEBT-013.)
//   - Event-level data wins when it is complete (a street number and a
//     city); the canonical venue row is the fallback. An incomplete address
//     never replaces a complete one. Only the missing ZIP of an event-level
//     address is borrowed from the venue, and only when the venue's street
//     is the same street.
//   - Components already inside the address ("..., Detroit, MI 48201") or
//     the venue name are not repeated.
//   - When there is no street address the result keeps whatever is known
//     (name, city) and says `navigable:false` plus what is `missing`, so a
//     caller can flag it for enrichment instead of pretending it routes.
(function (root) {
  "use strict";

  var CA_PROVINCES = /^(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/;
  var US_STATE = /^[A-Z]{2}$/;
  var US_ZIP = /^\d{5}(?:-\d{4})?$/;
  var CA_POSTAL = /^[A-CEGHJ-NPRSTVXY]\d[A-CEGHJ-NPRSTV-Z] ?\d[A-CEGHJ-NPRSTV-Z]\d$/i;
  var COUNTRY_US = /^(?:us|usa|u\.s\.a?\.?|united states(?: of america)?)$/i;
  var COUNTRY_ANY = /^(?:canada|ca|can|mexico|united kingdom|uk)$/i;

  function isBlank(s) { return s === null || s === undefined || (typeof s === "string" && s.trim() === ""); }
  function clean(s) { return isBlank(s) ? "" : String(s).replace(/[\r\n\t\u00a0]+/g, " ").replace(/\s+/g, " ").trim(); }
  function normKey(s) {
    return clean(s).toLowerCase().replace(/\./g, "").replace(/\btwp$/, "township").replace(/\bhts$/, "heights").replace(/\s+/g, " ");
  }

  // "420 W. 9 Mile Rd" -> "420 W 9 Mile Rd": drop the period after a lone
  // direction initial or a street-type abbreviation. Display tidying only.
  var DIR_OR_TYPE = /\b(N|S|E|W|NE|NW|SE|SW|St|Ave|Av|Rd|Blvd|Dr|Hwy|Pkwy|Ct|Pl|Ln|Ter|Cir)\.(?=\s|$|,)/g;
  function tidyStreet(s) { return clean(s).replace(DIR_OR_TYPE, "$1"); }

  var TYPE_WORDS = { street: "st", road: "rd", avenue: "ave", av: "ave", boulevard: "blvd", drive: "dr", highway: "hwy", parkway: "pkwy", court: "ct", place: "pl", lane: "ln", terrace: "ter", circle: "cir", north: "n", south: "s", east: "e", west: "w" };
  function streetKey(s) {
    return clean(s).toLowerCase().replace(/[.,#]/g, " ").split(/\s+/).filter(Boolean).map(function (w) { return TYPE_WORDS[w] || w; }).join(" ");
  }

  // Split a free-text address into street / city / state / zip / country.
  // Reads from the END: country, then "ST ZIP" / "ST" / "ZIP", then a city
  // part, leaving the street (possibly with a leading venue name) behind.
  function parseAddress(address, knownCity) {
    var out = { street: "", city: "", state: "", zip: "", country: "" };
    var parts = clean(address).split(",").map(clean).filter(Boolean);
    if (!parts.length) return out;
    var m;
    // trailing country
    if (parts.length > 1 && (COUNTRY_US.test(parts[parts.length - 1]))) { parts.pop(); out.country = "US"; }
    else if (parts.length > 1 && COUNTRY_ANY.test(parts[parts.length - 1])) { out.country = parts.pop(); }
    // trailing "ST ZIP", "ST", or "ZIP"
    var last = parts[parts.length - 1];
    if ((m = /^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(last)) && US_STATE.test(m[1].toUpperCase())) {
      out.state = m[1].toUpperCase(); out.zip = m[2]; parts.pop();
    } else if ((m = /^([A-Za-z]{2})\s+([A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d)$/.exec(last)) && CA_PROVINCES.test(m[1].toUpperCase())) {
      out.state = m[1].toUpperCase(); out.zip = m[2].toUpperCase(); parts.pop();
    } else if (parts.length > 1 && /^[A-Za-z]{2}$/.test(last) && last === last.toUpperCase()) {
      out.state = last; parts.pop();
    } else if (parts.length > 1 && (US_ZIP.test(last) || CA_POSTAL.test(last))) {
      out.zip = last.toUpperCase(); parts.pop();
    }
    // a state may still sit alone before the zip we already took ("..., MI, 48201")
    if (out.zip && !out.state && parts.length > 1 && /^[A-Z]{2}$/.test(parts[parts.length - 1])) out.state = parts.pop();
    // city: the part before the state/zip, when we stripped one (or it equals the known city)
    if (parts.length > 1) {
      var tail = parts[parts.length - 1];
      var isKnown = knownCity && normKey(tail) === normKey(knownCity);
      var hasNumber = /\d/.test(tail);
      if (isKnown || ((out.state || out.zip) && !hasNumber)) { out.city = tail; parts.pop(); }
    }
    out.street = parts.join(", ");
    return out;
  }

  function hasHouseNumber(street) {
    // some part starts with a number ("420 W 9 Mile Rd", "Fox Theatre, 2211 Woodward")
    return street.split(",").some(function (p) { return /^\s*\d+[A-Za-z]?\b/.test(p) && !/^\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(p); });
  }

  // One candidate source (event-level or venue-level) -> normalised facts.
  function candidate(address, city, zip, name) {
    var p = parseAddress(address, city);
    var street = tidyStreet(p.street);
    // The street line must not repeat the venue name ("Fox Theatre, 2211 Woodward Ave").
    if (name && street) {
      var nk = normKey(name);
      var segs = street.split(",").map(clean);
      if (segs.length > 1 && normKey(segs[0]) === nk) segs.shift();
      street = segs.join(", ");
    }
    var c = {
      street: street,
      city: clean(p.city) || clean(city),
      state: p.state,
      zip: p.zip || clean(zip),
      country: p.country
    };
    c.complete = !!(c.street && hasHouseNumber(c.street) && c.city);
    c.hasStreet = !!c.street;
    return c;
  }

  // Compose the final text from already-chosen parts.
  function compose(name, c) {
    // Region is "ST ZIP" from stored data only. With a ZIP but no state it is
    // written onto the city ("Hazel Park 48030"), never with a guessed state.
    var region = [c.state, c.zip].filter(Boolean).join(" ");
    var country = c.country && c.country !== "US" ? c.country : "";
    var cityPart = c.city;
    if (!c.state && c.zip) { cityPart = [c.city, c.zip].filter(Boolean).join(" "); region = ""; }
    var parts = [clean(name), c.street, cityPart, region, country].filter(Boolean);
    // collapse an adjacent duplicate ("Detroit, Detroit")
    var dedup = [];
    parts.forEach(function (p) { if (!dedup.length || normKey(dedup[dedup.length - 1]) !== normKey(p)) dedup.push(p); });
    return dedup.join(", ");
  }

  // input: { name, eventAddress, eventCity, venueAddress, venueCity, venueZip }
  // -> { text, navigable, missing[], source, name, street, city, state, zip }
  function resolve(input) {
    input = input || {};
    var name = clean(input.name);
    var ev = candidate(input.eventAddress, input.eventCity, "", name);
    var vn = candidate(input.venueAddress, input.venueCity, input.venueZip, name);
    var base, source;
    if (ev.complete) { base = ev; source = "event"; }
    else if (vn.complete) { base = vn; source = "venue"; }
    else if (ev.hasStreet) { base = ev; source = "event"; }
    else if (vn.hasStreet) { base = vn; source = "venue"; }
    else { base = ev.city ? ev : (vn.city ? vn : ev); source = base === vn ? "venue" : (base.city ? "event" : "none"); }
    base = { street: base.street, city: base.city, state: base.state, zip: base.zip, country: base.country };
    // Borrow the venue's ZIP/state/city for an event-level address ONLY when the venue is the same street.
    if (source === "event" && vn.hasStreet && streetKey(vn.street) === streetKey(base.street)) {
      if (!base.zip && vn.zip) base.zip = vn.zip;
      if (!base.state && vn.state) base.state = vn.state;
      if (!base.city && vn.city) base.city = vn.city;
    }
    var text = compose(name, base);
    var missing = [];
    if (!name) missing.push("venue_name");
    if (!base.street) missing.push("street_address");
    else if (!hasHouseNumber(base.street)) missing.push("house_number");
    if (!base.city) missing.push("city");
    var navigable = !!(base.street && hasHouseNumber(base.street) && base.city);
    return { text: text, navigable: navigable, missing: missing, source: source, name: name, street: base.street, city: base.city, state: base.state || "", zip: base.zip };
  }

  // An event object as the pages build it: venue (display name), locEventAddress/
  // locEventCity (events.venue_*_raw) and locVenueAddress/City/Zip (venues row).
  function resolveForEvent(e) {
    e = e || {};
    var name = e.venue && e.venue !== "Venue TBA" ? e.venue : "";
    return resolve({
      name: name,
      eventAddress: e.locEventAddress,
      eventCity: e.locEventCity,
      venueAddress: e.locVenueAddress,
      venueCity: e.locVenueCity,
      venueZip: e.locVenueZip
    });
  }

  // ---- serialisation -------------------------------------------------------
  // RFC 5545 §3.3.11 TEXT: escape backslash first, then ; , and newlines.
  function icsEscape(str) {
    return String(str == null ? "" : str)
      .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  function utf8Len(cp) { return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }
  // RFC 5545 §3.1: fold at 75 OCTETS (not UTF-16 units), never inside a
  // multi-byte character; continuation lines start with one space.
  function foldICSLine(line) {
    var chars = Array.from(String(line));
    var out = "", used = 0, limit = 75;
    for (var i = 0; i < chars.length; i++) {
      var n = utf8Len(chars[i].codePointAt(0));
      if (used + n > limit) { out += "\r\n "; used = 1; limit = 75; }
      out += chars[i]; used += n;
    }
    return out;
  }

  // LOCATION is a structured iCalendar property, never text in DESCRIPTION.
  function icsLocationLine(loc) { return loc && loc.text ? "LOCATION:" + icsEscape(loc.text) : ""; }
  function googleLocationParam(loc) { return loc && loc.text ? loc.text : ""; }

  var api = {
    resolve: resolve,
    resolveForEvent: resolveForEvent,
    parseAddress: parseAddress,
    icsEscape: icsEscape,
    foldICSLine: foldICSLine,
    icsLocationLine: icsLocationLine,
    googleLocationParam: googleLocationParam
  };

  if (typeof module !== "undefined" && module.exports) module.exports = { CalendarLocation: api };
  else (typeof window !== "undefined" ? window : globalThis).CalendarLocation = api;
})(this);
