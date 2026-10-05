"use strict";

// api/_lib/localist-rows.js
//
// Everything api/cron-localist.js decides WITHOUT touching the network or
// the database: which Localist events are eligible, where each one is, how
// an event's occurrences become rows, and what each row is called. Pure
// functions over the API's own JSON, so the whole of it can be run against a
// tenant's live data and checked row by row.
//
// WHAT THE API REALLY RETURNS (measured on both tenants, 2026-10-04/05)
//   GET /api/2/events                -> today only. Macomb: 5 entries;
//                                       Bowling Green: 6.
//   GET /api/2/events?days=90        -> one entry PER OCCURRENCE, each
//                                       carrying the whole event and exactly
//                                       one event_instance. Macomb: 283
//                                       entries for 163 events; Bowling
//                                       Green: 684 for 340.
//   GET /api/2/events/{id}           -> the event with EVERY instance it has
//                                       ever had, past ones included
//                                       ("Made in Ohio Art Exhibit": 105,
//                                       from 1 September).
// Instance ids are stable from one day to the next (the row written on
// 3 October for "Baby Item Donation" carries the id the API still gives for
// that day).
//
// THE FOUR PROBLEMS THIS FILE EXISTS FOR
//
// 1. Same-day window. The connector called the first URL, so it only ever
//    saw today. Every row it wrote was for an event already under way, and
//    expired that night. HORIZON_DAYS below is the 90 days the other
//    occurrence-level connectors use (cron-ticketmaster.js,
//    cron-gottagacha.js, cron-bigtimebingo.js).
//
// 2. A row a day. One row per instance is right for a weekly class or a
//    season of home games: each is a separate thing to go to. It is wrong
//    for something that simply stays open: "Made in Ohio Art Exhibit" is 72
//    all-day instances in 90 days, "Baby Item Donation" is 17 (three times
//    over -- three drop-off points, three Localist events). scheduleUnits()
//    folds a RUN -- three or more consecutive days, one instance a day, the
//    same hours every day -- into one row with a start and an end date,
//    which is how every other source's exhibition or festival is stored.
//    Nothing else is folded: two shows on one day, a weekend with different
//    hours each day, a Tuesday-and-Friday series all stay one row each.
//
// 3. Identity. A row is named after a Localist instance id, as before
//    (`localist-<tenant>-<instance id>`). A run is named after its FIRST
//    instance. That only stays put if the first instance is known, and on
//    any day after a run begins the 90-day listing no longer shows it -- the
//    listing starts today. So for an event with an occurrence on the first
//    day of the window, the connector reads that event's full schedule
//    (third URL) and the run is measured over all of it: the row for a run
//    keeps one name from its first day to its last, and its end date grows
//    if the organiser extends it. The same is done at the FAR edge: a run
//    whose first days are just coming into the 90 days would otherwise be
//    written as one day, then two, and only then as a run -- leaving the
//    second day behind as a row of its own (found by independent review).
//    Everything in between is wholly inside the listing and needs no second
//    request.
//
// 4. Eligibility. A college calendar is mostly not a public events
//    calendar. Both tenants tag every event with the audiences it is for,
//    and both use the same name for the public one. eventEligibility()
//    keeps an event only if
//      - the source itself lists it for the general public
//        (tenant.publicAudiences) -- 66 of Macomb's 163 events, 198 of
//        Bowling Green's 340; the rest are student workshops, staff
//        development, advising sessions;
//      - it is not online-only (`experience: "virtual"`) and not cancelled;
//      - its title is not one of the shared non-event titles
//        (api/_lib/non-event-filter.js);
//      - and there is EVIDENCE it happens inside the Detroit Orbit: see
//        parseLocalistLocation(). An event is no longer kept merely because
//        nothing says where it is. Bowling Green's athletics schedule gives
//        no coordinates at all, only text such as "Champaign, Ill." --
//        under the old rule every away game was written.
//
// NOTHING HERE IS INFERRED. No city is assumed from the tenant, no time is
// made up for an all-day entry, no venue is guessed from a title. Where the
// source does not say, the event is not written and the reason is counted.

const { milesFromDetroitBorder } = require("./detroit-boundary");
const { knownCity } = require("./orbit-cities");
const { isLikelyNotARealEvent } = require("./non-event-filter");

const HORIZON_DAYS = 90;
const MIN_RUN_DAYS = 3;
const ORBIT_MILES = 75; // SERVICE_AREA.md; same figure as cron-ticketmaster.js's RADIUS_MILES
const AMBIGUOUS_CATEGORY = "community"; // migration_009b's documented catch-all

// Why an event was not written. The handler counts events under each.
const SKIP_REASONS = Object.freeze([
  "unusable", // no id, no title or no dated instance
  "canceled", // or postponed
  "not_public_audience",
  "virtual",
  "non_event",
  "outside_orbit", // coordinates more than ORBIT_MILES away, or a stated state no part of which is in the Orbit
  "city_not_listed", // a stated Michigan/Ohio city that is not on the Orbit's list
  "no_place", // nothing in the event says where it is
]);

// ---------------------------------------------------------------- category

// Structured types whose meaning is not in doubt. Observed live:
// "Sporting Events" (both tenants), "BGSU Athletics".
const SPORTS_TYPE_RE = /^(?:sporting events?|sports|athletics|bgsu athletics)$/i;
// Broader types, used only after the title has had its say: a "Concerts &
// Performances" entry may be a ballet, and its title says so.
const BROAD_TYPE_CATEGORY_RULES = [
  [/^concerts?\s*(?:&|and)?\s*performances?$/i, "music"],
  [/^music$/i, "music"],
  [/^film/i, "film"],
  [/^(?:seminars?\s*(?:&|and)\s*workshops?|workshops?\s*(?:&|and)\s*classes)$/i, "training"],
];

function eventTypeNames(e) {
  const types = e && e.filters && Array.isArray(e.filters.event_types) ? e.filters.event_types : [];
  return types.map((t) => (t && typeof t === "object" ? t.name : t)).filter((n) => typeof n === "string").map((n) => n.trim());
}

// Kept for the type-only question ("what does this type name map to?").
function mapCategory(eventTypes) {
  if (!Array.isArray(eventTypes)) return null;
  for (const name of eventTypes) {
    if (typeof name !== "string") continue;
    if (SPORTS_TYPE_RE.test(name.trim())) return "sports";
    for (const [re, category] of BROAD_TYPE_CATEGORY_RULES) {
      if (re.test(name.trim())) return category;
    }
  }
  return null;
}

// sports type -> the title's own words (the shared keyword table every feed
// uses, passed in by the caller) -> a broad type -> null. The description is
// deliberately not read: a paragraph mentions food, a class and a game in
// passing far too often.
function categorize(e, categoryFromText) {
  const types = eventTypeNames(e);
  if (types.some((name) => SPORTS_TYPE_RE.test(name))) return "sports";
  const fromTitle = typeof categoryFromText === "function" ? categoryFromText(e.title, "") : null;
  if (fromTitle) return fromTitle;
  for (const name of types) {
    for (const [re, category] of BROAD_TYPE_CATEGORY_RULES) {
      if (re.test(name)) return category;
    }
  }
  return null;
}

// -------------------------------------------------------------------- time

// Reads HH:MM straight out of Localist's ISO-with-offset strings
// ("2026-11-05T19:00:00-05:00"): the source already gives local wall-clock
// time, so no timezone arithmetic is done or needed.
function formatClock(hm) {
  const [hStr, mStr] = String(hm || "").split(":");
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h) || !mStr) return null;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr} ${ap}`;
}

function formatTimeDisplay(startIso, endIso) {
  if (!startIso || startIso.length < 16) return null;
  const startHM = startIso.slice(11, 16);
  const startFmt = formatClock(startHM);
  if (!startFmt) return null;
  if (endIso && endIso.length >= 16) {
    const endHM = endIso.slice(11, 16);
    if (endHM !== startHM) {
      const endFmt = formatClock(endHM);
      if (endFmt) return `${startFmt} – ${endFmt}`;
    }
  }
  return startFmt;
}

function dayNumber(isoDate) {
  const [y, m, d] = isoDate.split("-").map((part) => parseInt(part, 10));
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function isoDatePlusDays(isoDate, days) {
  return new Date((dayNumber(isoDate) + days) * 86400000).toISOString().slice(0, 10);
}

const ISO_START_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
// An event that ends after midnight is a late night, not a second day.
const LATE_NIGHT_END_HM = "06:00";

// One instance, as the row will state it. Returns null when it has no id or
// no usable start.
//   - `all_day: true` is all day;
//   - so is midnight to the following midnight (or to 23:59): the source has
//     said "the whole day" the long way round ("NIFA Region III SAFECON",
//     00:00 to 00:00 next day, every day for a week -- stored until now with
//     a start time of "12:00 AM");
//   - an instance that really runs into another day (a swim meet from 6 PM
//     to 11 AM) keeps its start time and gets that end DATE; the end time,
//     being on another day, is not shown beside the start.
function normalizeInstance(wrapper) {
  const inst = wrapper && typeof wrapper === "object" ? wrapper.event_instance || wrapper : null;
  if (!inst || typeof inst !== "object") return null;
  const start = typeof inst.start === "string" && ISO_START_RE.test(inst.start) ? inst.start : null;
  if (!inst.id || !start) return null;
  const end = typeof inst.end === "string" && ISO_START_RE.test(inst.end) ? inst.end : null;
  const date = start.slice(0, 10);
  const startHM = start.slice(11, 16);
  const endDateRaw = end ? end.slice(0, 10) : null;
  const endHM = end ? end.slice(11, 16) : null;

  let allDay = inst.all_day === true;
  let endDate = null;
  let timeDisplay = null;
  if (allDay && endDateRaw && endDateRaw > date) {
    // An all-day instance that names a later last day. An end of 00:00 is
    // the midnight that closes the day before.
    const lastDay = endHM === "00:00" ? isoDatePlusDays(endDateRaw, -1) : endDateRaw;
    if (lastDay > date) endDate = lastDay;
  }
  if (!allDay && startHM === "00:00" && end) {
    const wholeDays = dayNumber(endDateRaw) - dayNumber(date);
    if ((endHM === "00:00" && wholeDays >= 1) || (endHM === "23:59" && wholeDays >= 0)) {
      allDay = true;
      const lastDay = endHM === "00:00" ? wholeDays - 1 : wholeDays;
      if (lastDay >= 1) endDate = isoDatePlusDays(date, lastDay);
    }
  }
  if (!allDay) {
    const spansDays = endDateRaw && endDateRaw > date;
    // ...which means: it ends the next morning, EARLIER in the day than it
    // began. 6 AM to 6 AM the next day is a whole day, not a late night.
    const lateNight = spansDays && dayNumber(endDateRaw) - dayNumber(date) === 1 && endHM <= LATE_NIGHT_END_HM && endHM < startHM;
    if (spansDays && !lateNight) {
      endDate = endDateRaw;
      timeDisplay = formatClock(startHM);
    } else {
      timeDisplay = formatTimeDisplay(start, end);
    }
  }
  return {
    id: String(inst.id),
    date,
    sortKey: `${date}T${startHM}`,
    endDate,
    allDay,
    timeDisplay,
    // What must be identical from day to day for a run.
    signature: allDay ? "all-day" : `${startHM}-${endHM || ""}`,
  };
}

// Every instance of one event, de-duplicated and in order.
function normalizeInstances(wrappers) {
  const byId = new Map();
  for (const wrapper of Array.isArray(wrappers) ? wrappers : []) {
    const inst = normalizeInstance(wrapper);
    if (inst && !byId.has(inst.id)) byId.set(inst.id, inst);
  }
  return [...byId.values()].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : 1));
}

// The schedule as rows: a RUN becomes one unit, everything else one unit per
// instance. See the header (problem 2) for what a run is and is not.
//   unit = { id, startDate, endDate, allDay, timeDisplay, days }
// `id` is the id of the unit's first instance; `endDate` is null for a
// single day.
function scheduleUnits(instances) {
  const byDate = new Map();
  for (const inst of instances) {
    if (!byDate.has(inst.date)) byDate.set(inst.date, []);
    byDate.get(inst.date).push(inst);
  }
  // A day can be part of a run only if it holds exactly one instance and
  // that instance is confined to the day.
  const runnable = (date) => {
    const list = byDate.get(date);
    return list && list.length === 1 && !list[0].endDate ? list[0] : null;
  };

  const units = [];
  const single = (inst) => units.push({ id: inst.id, startDate: inst.date, endDate: inst.endDate, allDay: inst.allDay, timeDisplay: inst.timeDisplay, days: 1 });
  const dates = [...byDate.keys()].sort();
  let run = [];
  const closeRun = () => {
    if (run.length >= MIN_RUN_DAYS) {
      const first = run[0];
      units.push({ id: first.id, startDate: first.date, endDate: run[run.length - 1].date, allDay: first.allDay, timeDisplay: first.timeDisplay, days: run.length });
    } else {
      run.forEach(single);
    }
    run = [];
  };
  for (const date of dates) {
    const inst = runnable(date);
    if (!inst) {
      closeRun();
      byDate.get(date).forEach(single);
      continue;
    }
    const prev = run[run.length - 1];
    if (prev && (dayNumber(date) - dayNumber(prev.date) !== 1 || prev.signature !== inst.signature)) closeRun();
    run.push(inst);
  }
  closeRun();
  return units.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id < b.id ? -1 : 1));
}

// ---------------------------------------------------------------- location

// "<house number> ... <street type>", the street type ENDING the part
// (optionally with a compass point after it): a street, not "2nd Floor",
// "101 Olscamp Hall" or "204 St. Clair Hall".
const NUMBERED_STREET_RE =
  /^\d+[A-Za-z]?\s.*\b(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Lane|Ln|Court|Ct|Circle|Cir|Way|Highway|Hwy|Parkway|Pkwy|Place|Pl|Terrace|Ter|Trail|Trl)\.?(?:\s+(?:N|S|E|W|NE|NW|SE|SW)\.?)?$/i;
// A country at the end of an address or a place name says nothing new.
const COUNTRY_RE = /^(?:united states(?: of america)?|u\.?s\.?(?:a\.?)?)$/i;
const withoutCountry = (parts) => (parts.length > 1 && COUNTRY_RE.test(parts[parts.length - 1]) ? parts.slice(0, -1) : parts);

// A state as a schedule writes it: the postal code, the full name, or the
// newspaper abbreviation ("Mich.", "Ill.", "N.Y."). Bowling Green's
// athletics entries give the place this way and no other: "Kalamazoo,
// Mich.", "Bowling Green, Ohio, Stroh Center", "Bowling Green, Ky., E.A.
// Diddle Arena".
const STATE_NAMES = {
  AL: ["Alabama", "Ala."], AK: ["Alaska"], AZ: ["Arizona", "Ariz."], AR: ["Arkansas", "Ark."], CA: ["California", "Calif."],
  CO: ["Colorado", "Colo."], CT: ["Connecticut", "Conn."], DE: ["Delaware", "Del."], DC: ["D.C.", "District of Columbia"],
  FL: ["Florida", "Fla."], GA: ["Georgia", "Ga."], HI: ["Hawaii"], ID: ["Idaho"], IL: ["Illinois", "Ill."], IN: ["Indiana", "Ind."],
  IA: ["Iowa"], KS: ["Kansas", "Kan."], KY: ["Kentucky", "Ky."], LA: ["Louisiana", "La."], ME: ["Maine"], MD: ["Maryland", "Md."],
  MA: ["Massachusetts", "Mass."], MI: ["Michigan", "Mich."], MN: ["Minnesota", "Minn."], MS: ["Mississippi", "Miss."],
  MO: ["Missouri", "Mo."], MT: ["Montana", "Mont."], NE: ["Nebraska", "Neb.", "Nebr."], NV: ["Nevada", "Nev."],
  NH: ["New Hampshire", "N.H."], NJ: ["New Jersey", "N.J."], NM: ["New Mexico", "N.M."], NY: ["New York", "N.Y."],
  NC: ["North Carolina", "N.C."], ND: ["North Dakota", "N.D."], OH: ["Ohio"], OK: ["Oklahoma", "Okla."], OR: ["Oregon", "Ore."],
  PA: ["Pennsylvania", "Pa.", "Penn."], RI: ["Rhode Island", "R.I."], SC: ["South Carolina", "S.C."], SD: ["South Dakota", "S.D."],
  TN: ["Tennessee", "Tenn."], TX: ["Texas", "Tex."], UT: ["Utah"], VT: ["Vermont", "Vt."], VA: ["Virginia", "Va."],
  WA: ["Washington", "Wash."], WV: ["West Virginia", "W.Va.", "W. Va."], WI: ["Wisconsin", "Wis.", "Wisc."], WY: ["Wyoming", "Wyo."],
  ON: ["Ontario", "Ont."], QC: ["Quebec", "Que."],
};
const stateKey = (text) => String(text || "").toLowerCase().replace(/[.\s]/g, "");
const STATE_BY_KEY = new Map();
for (const [code, names] of Object.entries(STATE_NAMES)) {
  STATE_BY_KEY.set(stateKey(code), code);
  for (const name of names) STATE_BY_KEY.set(stateKey(name), code);
}
// "Mich.", "MI", "Michigan", "MI 48038" -> "MI"; anything else -> null.
function stateCode(text) {
  const cleaned = String(text || "").trim().replace(/\s+\d{5}(?:-\d{4})?$/, "");
  if (!cleaned || cleaned.length > 24) return null;
  return STATE_BY_KEY.get(stateKey(cleaned)) || null;
}

// The states for which the Orbit has a city list. Ontario reaches into the
// Orbit too and has no list, so an Ontario place given only as text is not
// accepted -- it is counted as "city not listed", not as "outside". (No
// Localist tenant has shown one.)
const ORBIT_STATES = new Set(["MI", "OH"]);
const STATES_REACHING_THE_ORBIT = new Set(["MI", "OH", "ON"]);

function cleanString(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// "Kalamazoo, Mich." / "Bowling Green, Ohio, Stroh Center" / "Stroh Center,
// Bowling Green, Ohio" -> { cityText, state, venue }. null unless one of the
// comma-separated parts, other than the first, is a state.
function parsePlaceText(text) {
  const cleaned = cleanString(text);
  if (!cleaned) return null;
  const parts = withoutCountry(cleaned.split(",").map((part) => part.trim()).filter(Boolean));
  for (let i = 1; i < parts.length; i++) {
    let state = stateCode(parts[i]);
    let inBrackets = null;
    if (!state) {
      // "Detroit, Mich. (Ford Field)": the venue in brackets after the state.
      const bracketed = /^(.*?)\s*\(([^()]+)\)$/.exec(parts[i]);
      if (bracketed && stateCode(bracketed[1])) {
        state = stateCode(bracketed[1]);
        inBrackets = bracketed[2].trim();
      }
    }
    if (!state) continue;
    const venue = [...parts.slice(0, i - 1), ...(inBrackets ? [inBrackets] : []), ...parts.slice(i + 1)].join(", ") || null;
    return { cityText: parts[i - 1], state, venue };
  }
  return null;
}

// Where the event is, and how that is known.
//   orbit: "in"      there is evidence it is inside the Detroit Orbit
//          "out"     there is evidence it is not (reason: outside_orbit or
//                    city_not_listed)
//          "unknown" the event does not say where it is (reason: no_place)
//
// Evidence, strongest first:
//   1. coordinates (geo.latitude/longitude). More than ORBIT_MILES from
//      Detroit's border is out, whatever the text says. Coordinates outside
//      North America (0,0; a dropped minus sign; the two swapped) are a bad
//      geocode and count as none.
//   2. a city and state the source wrote down, in `address` ("44575 Garfield
//      Road, Clinton Township, MI 48038") or in the location's own name
//      (Bowling Green's athletics entries). The city must be on the Orbit's
//      closed list for that state (api/_lib/orbit-cities.js -- every name on
//      it is within the 75 miles; the farthest, Lansing, is 68). "Bowling
//      Green, Ky." is not Bowling Green, Ohio: the list is per state.
//   Nothing else counts. In particular the tenant's own campus is NOT
//   assumed for a location that names only a room ("Union Oval", "BTSU
//   427"): the same field also holds "Toledo Zoo" and "Off Campus at
//   Wintergarden Park".
//
// What is written:
//   name    location_name (then the older fields a tenant might have). For
//           a "City, State, Venue" name the venue alone; for a bare "City,
//           State" the text as the source wrote it.
//   street  from `address` only, and only a part that begins with a house
//           number and contains a street type -- tenants also put a
//           building, a floor or a room there. A building name repeated in
//           front of the street with no comma is dropped. geo.street is not
//           used: it is a geocoder fragment ("J" for "South Campus, J
//           Building").
//   city    the listed city from `address`, else from the location's name,
//           else geo.city when that is listed for geo.state.
function parseLocalistLocation(e) {
  const none = { name: null, street: null, city: null, milesFromDetroit: null, outsideOrbit: false, orbit: "unknown", reason: "no_place" };
  if (!e || typeof e !== "object") return none;
  const geo = e.geo && typeof e.geo === "object" ? e.geo : {};
  let name =
    cleanString(e.location_name) ||
    cleanString(e.location) ||
    cleanString(e.venue_name) ||
    (e.venue && typeof e.venue === "object" ? cleanString(e.venue.name) : null);

  let street = null;
  let city = null;
  let statedElsewhere = null; // a stated city/state that is not on the list
  const address = cleanString(e.address);
  if (address) {
    const parts = withoutCountry(address.split(",").map((part) => part.trim()).filter(Boolean));
    // The last part is the state -- as a code, a name or an abbreviation,
    // with or without a ZIP -- or the address is not in this form at all.
    const state = parts.length >= 2 ? stateCode(parts[parts.length - 1]) : null;
    const listedCity = state ? knownCity(parts[parts.length - 2], state) : null;
    if (listedCity) {
      city = listedCity;
      const before = parts.slice(0, -2);
      // The street is the first part that is a numbered street
      // ("123 Main St, 2nd Floor, Warren, MI" -> "123 Main St").
      street = before.find((part) => NUMBERED_STREET_RE.test(part)) || null;
      if (!street && name && before.length) {
        // "Bowen-Thompson Student Union 1001 E Wooster St": only a
        // whole-name prefix followed by a space is dropped.
        const joined = before.join(", ");
        if (joined.toLowerCase().startsWith(name.toLowerCase() + " ")) {
          const rest = joined.slice(name.length).trim();
          if (NUMBERED_STREET_RE.test(rest)) street = rest;
        }
      }
    } else if (state && parts.length >= 3) {
      // "<something>, <city>, <ST>": a city was stated and is not listed.
      statedElsewhere = { cityText: parts[parts.length - 2], state };
    }
  }
  if (!city) {
    const stated = parsePlaceText(name);
    if (stated) {
      const listedCity = ORBIT_STATES.has(stated.state) ? knownCity(stated.cityText, stated.state) : null;
      if (listedCity) {
        city = listedCity;
        if (stated.venue) name = stated.venue;
      } else if (!statedElsewhere) {
        statedElsewhere = { cityText: stated.cityText, state: stated.state };
      }
    }
  }
  const geoCity = knownCity(cleanString(geo.city), cleanString(geo.state));

  const lat = Number.parseFloat(geo.latitude);
  const lng = Number.parseFloat(geo.longitude);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && lat >= 24 && lat <= 60 && lng >= -141 && lng <= -52;
  const milesFromDetroit = hasCoordinates ? milesFromDetroitBorder(lat, lng) : null;

  let orbit;
  let reason = null;
  if (hasCoordinates) {
    orbit = milesFromDetroit > ORBIT_MILES ? "out" : "in";
    if (orbit === "out") reason = "outside_orbit";
    if (!city) city = geoCity;
  } else if (city) {
    orbit = "in";
  } else if (geoCity) {
    // No coordinates, but the geocoder's own city and state, and listed.
    city = geoCity;
    orbit = "in";
  } else if (statedElsewhere) {
    orbit = "out";
    reason = STATES_REACHING_THE_ORBIT.has(statedElsewhere.state) ? "city_not_listed" : "outside_orbit";
  } else {
    orbit = "unknown";
    reason = "no_place";
  }

  return {
    name,
    street,
    city,
    milesFromDetroit,
    outsideOrbit: orbit === "out",
    orbit,
    reason,
    statedElsewhere: orbit === "out" && statedElsewhere ? `${statedElsewhere.cityText}, ${statedElsewhere.state}` : null,
  };
}

// ------------------------------------------------------------- eligibility

function audienceNames(e) {
  const list = e && e.filters && Array.isArray(e.filters.event_target_audience) ? e.filters.event_target_audience : [];
  return list.map((a) => (a && typeof a === "object" ? a.name : a)).filter((n) => typeof n === "string").map((n) => n.trim().toLowerCase());
}

// { eligible, reason, place }. `reason` is one of SKIP_REASONS when not
// eligible. The order is the order of the funnel the handler reports.
function eventEligibility(e, tenant) {
  if (!e || typeof e !== "object" || !e.id || !cleanString(e.title)) return { eligible: false, reason: "unusable", place: null };
  // Cancelled or postponed, by the source's own status or the way organisers
  // announce it: at the head of the title.
  if (typeof e.status === "string" && /^(?:cancel|postpon)/i.test(e.status.trim())) return { eligible: false, reason: "canceled", place: null };
  if (/^\W*(?:cancel(?:l)?ed|postponed)\b/i.test(e.title)) return { eligible: false, reason: "canceled", place: null };
  // ...or at its tail, set off from it: "Fall Concert - CANCELED", "Fall Concert (Postponed)".
  if (/[-\u2013\u2014:(\[]\s*(?:cancel(?:l)?ed|postponed)\W*$/i.test(e.title)) return { eligible: false, reason: "canceled", place: null };
  const wanted = tenant && Array.isArray(tenant.publicAudiences) ? tenant.publicAudiences.map((a) => a.toLowerCase()) : null;
  if (wanted && !audienceNames(e).some((name) => wanted.includes(name))) return { eligible: false, reason: "not_public_audience", place: null };
  if (typeof e.experience === "string" && e.experience.trim().toLowerCase() === "virtual") return { eligible: false, reason: "virtual", place: null };
  if (isLikelyNotARealEvent({ title: e.title })) return { eligible: false, reason: "non_event", place: null };
  const place = parseLocalistLocation(e);
  if (place.orbit !== "in") return { eligible: false, reason: place.reason, place };
  return { eligible: true, reason: null, place };
}

// -------------------------------------------------------------------- rows

// The listing is one entry per occurrence. -> Map(event id -> { event,
// instanceWrappers }), the event object being the first entry's.
function groupListing(listingEvents) {
  const groups = new Map();
  for (const e of Array.isArray(listingEvents) ? listingEvents : []) {
    if (!e || typeof e !== "object" || !e.id) continue;
    const key = String(e.id);
    if (!groups.has(key)) groups.set(key, { event: e, instanceWrappers: [] });
    const instances = Array.isArray(e.event_instances) ? e.event_instances : [];
    groups.get(key).instanceWrappers.push(...instances);
  }
  return groups;
}

// True when the listing may not show the whole of a run this event is in:
// it has an occurrence on the window's first day (the run may have begun
// earlier) or within its last MIN_RUN_DAYS - 1 days (the run may continue
// beyond it). See the header, problem 3.
function needsFullSchedule(instanceWrappers, windowStart, windowEnd) {
  const farEdge = windowEnd ? isoDatePlusDays(windowEnd, -(MIN_RUN_DAYS - 1)) : null;
  return normalizeInstances(instanceWrappers).some((inst) => inst.date <= windowStart || (farEdge && inst.date >= farEdge));
}

// Rows for one ELIGIBLE event.
//   instanceWrappers  the event's instances: its full schedule when the
//                     handler fetched it, otherwise what the listing showed
//   place             eventEligibility()'s place
//   windowStart/End   ISO dates; a unit is written when it is still running
//                     on windowStart and begins on or before windowEnd
// Each row carries _rawVenueName and _defaultStatusForRow for the handler,
// which resolves the venue and the status; neither is written as such.
function rowsForEvent({ event: e, instanceWrappers, place, tenant, windowStart, windowEnd, categoryFromText }) {
  const title = cleanString(e.title);
  const units = scheduleUnits(normalizeInstances(instanceWrappers));
  const category = categorize(e, categoryFromText);
  const description = cleanString(e.description_text);
  const rows = [];
  for (const unit of units) {
    const lastDay = unit.endDate || unit.startDate;
    if (lastDay < windowStart || unit.startDate > windowEnd) continue;
    rows.push({
      external_id: `localist-${tenant.tenantSlug}-${unit.id}`,
      title,
      description,
      category: category || AMBIGUOUS_CATEGORY,
      start_date: unit.startDate,
      // Sent even when null: a row that used to be a run and is now a single
      // day must lose its end date.
      end_date: unit.endDate,
      time_display: unit.timeDisplay,
      is_recurring: units.length > 1,
      is_all_day: unit.allDay,
      // The source's own flag. false means "not marked free", never "paid".
      is_free: e.free === true,
      price_from: null, // ticket_cost is free text ("$10-$25 + fees"); not parsed
      ticket_url: cleanString(e.ticket_url),
      event_url: cleanString(e.localist_url),
      image_url: cleanString(e.photo_url),
      source: tenant.source,
      internal_note: category ? null : `Category not mappable from this tenant's Localist event types or the title (event: "${title}").`,
      _rawVenueName: place.name,
      venue_address_raw: place.street,
      venue_city_raw: place.city,
      _defaultStatusForRow: tenant.defaultStatus,
      _runDays: unit.days,
      // false: the category is the catch-all, not something the source said.
      _categoryConfident: !!category,
    });
  }
  return rows;
}

// ------------------------------------------------------------------ funnel
//
// The three functions below are the whole of a tenant's run apart from the
// requests themselves, so that the handler -- and anything checking the
// handler against a tenant's live data -- runs exactly the same decisions.

function newFunnel(tenant) {
  return {
    tenant: tenant.tenantSlug,
    pages: 0,
    occurrencesFetched: 0,
    eventsFetched: 0,
    eventsEligible: 0,
    skipped: Object.fromEntries(SKIP_REASONS.map((reason) => [reason, 0])),
    // Stated places that were refused, with counts: a city that belongs on
    // the Orbit's list and is missing from it shows up here.
    notInOrbitPlaces: {},
    fullSchedulesFetched: 0,
    fullScheduleFailures: 0,
    rows: 0,
    multiDayRows: 0,
    occurrencesFoldedIntoRuns: 0,
    windowStart: null,
    windowEnd: null,
  };
}

// The listing -> the eligible events, each { event, instanceWrappers, place }.
// Counts everything else into `funnel`.
function selectEligible(listingEvents, tenant, funnel) {
  const groups = groupListing(listingEvents);
  funnel.occurrencesFetched = Array.isArray(listingEvents) ? listingEvents.length : 0;
  funnel.eventsFetched = groups.size;
  const eligible = [];
  for (const group of groups.values()) {
    const verdict = eventEligibility(group.event, tenant);
    if (!verdict.eligible) {
      funnel.skipped[verdict.reason] = (funnel.skipped[verdict.reason] || 0) + 1;
      if (verdict.place && verdict.place.statedElsewhere) {
        funnel.notInOrbitPlaces[verdict.place.statedElsewhere] = (funnel.notInOrbitPlaces[verdict.place.statedElsewhere] || 0) + 1;
      }
      continue;
    }
    eligible.push({ ...group, place: verdict.place });
  }
  funnel.eventsEligible = eligible.length;
  return eligible;
}

// The eligible events -> rows.
//   schedules  Map(event id as string -> { instanceWrappers } | { error })
//              for the events whose full schedule was asked for. An event
//              whose request failed is left out and reported; it is never
//              written from the listing's partial view of it.
// -> { rows, errors }
function buildTenantRows(eligible, schedules, { tenant, windowStart, windowEnd, categoryFromText }, funnel) {
  const rows = [];
  const errors = [];
  for (const g of eligible) {
    let instanceWrappers = g.instanceWrappers;
    const schedule = schedules ? schedules.get(String(g.event.id)) : null;
    if (schedule) {
      if (schedule.error || !Array.isArray(schedule.instanceWrappers)) {
        funnel.fullScheduleFailures++;
        errors.push(`event ${g.event.id}: full schedule: ${schedule.error || "no instances"}`);
        continue;
      }
      funnel.fullSchedulesFetched++;
      // The full schedule first; the listing's own instances are kept too,
      // in case the two ever disagree (instances are de-duplicated by id).
      instanceWrappers = [...schedule.instanceWrappers, ...g.instanceWrappers];
    }
    for (const row of rowsForEvent({ event: g.event, instanceWrappers, place: g.place, tenant, windowStart, windowEnd, categoryFromText })) {
      if (row._runDays > 1) {
        funnel.multiDayRows++;
        funnel.occurrencesFoldedIntoRuns += row._runDays;
      }
      rows.push(row);
    }
  }
  funnel.rows = rows.length;
  return { rows, errors };
}

module.exports = {
  HORIZON_DAYS,
  MIN_RUN_DAYS,
  ORBIT_MILES,
  SKIP_REASONS,
  AMBIGUOUS_CATEGORY,
  mapCategory,
  categorize,
  formatTimeDisplay,
  normalizeInstance,
  normalizeInstances,
  scheduleUnits,
  stateCode,
  parsePlaceText,
  parseLocalistLocation,
  eventEligibility,
  groupListing,
  needsFullSchedule,
  rowsForEvent,
  newFunnel,
  selectEligible,
  buildTenantRows,
  isoDatePlusDays,
};
