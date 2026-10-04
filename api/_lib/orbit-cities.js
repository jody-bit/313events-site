"use strict";

// api/_lib/orbit-cities.js
//
// A closed list of municipality NAMES in and around the Detroit Orbit
// (SERVICE_AREA.md), for one purpose: deciding whether a piece of text IS a
// place name. Added 2026-10-04 for api/_lib/ics-location.js's trailing-city
// rule (BUG-012), which must never report "Lower Level Troy", "Suite A Royal
// Oak" or "Not Applicable" as a city — a shape test ("one to four capitalised
// words") cannot tell those from a real one; a list can.
//
// What this list is, and is not:
//   - names only. It carries no coordinates and decides nothing about
//     distance or whether an event is inside the Orbit (discovery.js's
//     `places` and api/_lib/detroit-boundary.js do that). It deliberately
//     reaches a little past the Orbit: the question it answers is "is this a
//     city name", not "is this city near enough";
//   - every city in discovery.js's `places` is included, so the two cannot
//     disagree about a name the site already knows;
//   - it is NOT complete, and does not need to be. A place that is missing
//     here is simply not recognised — the text is left as it was and nothing
//     is written — which is the safe direction. Add a name when a real feed
//     shows one that is missing;
//   - Michigan and Ohio only, because the rule that uses it accepts only
//     "<City> MI <ZIP>" and "<City> OH <ZIP>".
//
// Matching is case-insensitive and ignores periods ("St. Clair Shores" =
// "St Clair Shores" = "ST. CLAIR SHORES"); the spelling returned is the one
// written here.

const MICHIGAN = [
  // Wayne County
  "Allen Park", "Belleville", "Brownstown", "Brownstown Township", "Canton", "Canton Township", "Dearborn",
  "Dearborn Heights", "Detroit", "Ecorse", "Flat Rock", "Garden City", "Gibraltar", "Grosse Ile", "Grosse Pointe",
  "Grosse Pointe Farms", "Grosse Pointe Park", "Grosse Pointe Shores", "Grosse Pointe Woods", "Hamtramck",
  "Harper Woods", "Highland Park", "Huron Township", "Inkster", "Lincoln Park", "Livonia", "Melvindale",
  "Northville", "Northville Township", "Plymouth", "Plymouth Township", "Redford", "Redford Township",
  "River Rouge", "Riverview", "Rockwood", "Romulus", "Southgate", "Taylor", "Trenton", "Van Buren Township",
  "Wayne", "Westland", "Woodhaven", "Wyandotte",
  // Oakland County
  "Auburn Hills", "Berkley", "Beverly Hills", "Bingham Farms", "Birmingham", "Bloomfield Hills",
  "Bloomfield Township", "Clarkston", "Clawson", "Commerce Township", "Farmington", "Farmington Hills",
  "Ferndale", "Franklin", "Hazel Park", "Highland", "Holly", "Huntington Woods", "Independence Township",
  "Keego Harbor", "Lake Orion", "Lathrup Village", "Lyon Township", "Madison Heights", "Milford", "Novi",
  "Oak Park", "Oakland Township", "Orchard Lake", "Orion Township", "Ortonville", "Oxford", "Pleasant Ridge",
  "Pontiac", "Rochester", "Rochester Hills", "Royal Oak", "South Lyon", "Southfield", "Sylvan Lake", "Troy",
  "Walled Lake", "Waterford", "Waterford Township", "West Bloomfield", "West Bloomfield Township", "White Lake",
  "White Lake Township", "Wixom",
  // Macomb County
  "Armada", "Center Line", "Chesterfield", "Chesterfield Township", "Clinton Township", "Eastpointe", "Fraser",
  "Harrison Township", "Macomb", "Macomb Township", "Memphis", "Mount Clemens", "Mt. Clemens", "New Baltimore",
  "New Haven", "Ray Township", "Richmond", "Romeo", "Roseville", "Shelby Township", "St. Clair Shores",
  "Sterling Heights", "Utica", "Warren", "Washington", "Washington Township",
  // Washtenaw, Livingston, Monroe, Lenawee
  "Ann Arbor", "Chelsea", "Dexter", "Manchester", "Milan", "Pittsfield Township", "Saline", "Superior Township",
  "Whitmore Lake", "Ypsilanti", "Brighton", "Fowlerville", "Hartland", "Howell", "Pinckney", "Bedford Township",
  "Carleton", "Dundee", "Lambertville", "Luna Pier", "Monroe", "Temperance", "Adrian", "Blissfield", "Tecumseh",
  // St. Clair, Lapeer, Genesee and beyond (named in discovery.js or met in feeds)
  "Algonac", "Fort Gratiot", "Marine City", "Marysville", "Port Huron", "St. Clair", "Almont", "Imlay City",
  "Lapeer", "Burton", "Davison", "Fenton", "Flint", "Flushing", "Grand Blanc", "Swartz Creek", "East Lansing",
  "Jackson", "Lansing", "Owosso",
];

const OHIO = [
  "Bowling Green", "Huron", "Maumee", "Northwood", "Oregon", "Perrysburg", "Port Clinton", "Rossford", "Sandusky",
  "Sylvania", "Toledo", "Waterville",
];

function normalizeCityName(text) {
  return String(text || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

// normalised name -> the spelling written above
const CITY_BY_NORMALIZED_NAME = new Map();
for (const name of [...MICHIGAN, ...OHIO]) CITY_BY_NORMALIZED_NAME.set(normalizeCityName(name), name);
// "Mt. Clemens" is how some calendars write Mount Clemens; one place, one spelling.
CITY_BY_NORMALIZED_NAME.set(normalizeCityName("Mt. Clemens"), "Mount Clemens");

const MAX_CITY_WORDS = Math.max(...[...CITY_BY_NORMALIZED_NAME.keys()].map((k) => k.split(" ").length));

// The listed spelling of `text` if it is exactly a known city, else null.
function knownCity(text) {
  return CITY_BY_NORMALIZED_NAME.get(normalizeCityName(text)) || null;
}

module.exports = { knownCity, normalizeCityName, MAX_CITY_WORDS, CITY_BY_NORMALIZED_NAME };
