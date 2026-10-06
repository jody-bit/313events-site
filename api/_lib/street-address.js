"use strict";

// api/_lib/street-address.js
//
// Reading a street address as its sources write it: "660 W. Baltimore Street
// #2", "Fox Theatre, 2211 Woodward Ave, Detroit, MI 48201". One house number
// on one named street, or nothing -- never a guess. Used to decide whether
// two statements are the same address (scripts/venue-geography.js,
// scripts/venues-from-stated-places.js) and to ask the City's parcel file
// about one (api/_lib/detroit-parcels.js).

const DIRECTIONS = { n: "n", north: "n", s: "s", south: "s", e: "e", east: "e", w: "w", west: "w" };
const SUFFIXES = {
  st: "st", street: "st", ave: "ave", av: "ave", avenue: "ave", rd: "rd", road: "rd", blvd: "blvd", boulevard: "blvd",
  dr: "dr", drive: "dr", hwy: "hwy", highway: "hwy", pkwy: "pkwy", parkway: "pkwy", ct: "ct", court: "ct",
  pl: "pl", place: "pl", ln: "ln", lane: "ln", way: "way", ter: "ter", terrace: "ter", cir: "cir", circle: "cir",
};
// "7 pm", "10:30 a.m." -- a time of day, not a house number on "pm".
const TIME_OF_DAY = /^\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|noon)\b/i;

// "Fox Theatre, 2211 Woodward Ave, Detroit, MI 48201" -> "2211 Woodward Ave":
// the first comma-separated part that begins with a house number.
function streetPart(text) {
  const parts = String(text || "").split(";")[0].split(",").map((part) => part.trim()).filter(Boolean);
  return parts.find((part) => /^\d/.test(part) && !TIME_OF_DAY.test(part)) || null;
}

// "660 W. Baltimore Street #2" -> { number: "660", dir: "w", name: "baltimore",
// key: "baltimore", suffix: "st", postDir: null, text: "660 W. Baltimore Street" }.
// null when the text is not one house number on one named street: no number,
// a range ("4120-4140 Woodward"), a time, or nothing after the number.
function parseStreet(text) {
  const part = streetPart(text);
  if (!part) return null;
  // A unit at the END of the line: "#2", "Suite 200", "Ste. B", "Unit 4A".
  // ("Ste. Anne St" is Sainte Anne Street: "Ste." there is followed by a
  // name and a street type, not by a unit at the end.)
  const cleaned = part
    .replace(/[\s,]+#\s*[\w-]+\s*$/, "")
    .replace(/[\s,]+(?:suite|ste|unit|apt|floor|fl)\b\.?\s*#?\s*(?:[\w-]*\d[\w-]*|[A-Za-z])\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.,\s]+$/, "")
    .trim();
  const tokens = cleaned.toLowerCase().replace(/\./g, "").split(" ").filter(Boolean);
  const number = tokens.shift();
  if (!/^\d+[a-z]?$/.test(number || "")) return null;
  let dir = null;
  let postDir = null;
  let suffix = null;
  if (tokens.length > 1 && DIRECTIONS[tokens[0]]) dir = DIRECTIONS[tokens.shift()];
  if (tokens.length > 1 && DIRECTIONS[tokens[tokens.length - 1]] && SUFFIXES[tokens[tokens.length - 2]]) postDir = DIRECTIONS[tokens.pop()];
  if (tokens.length > 1 && SUFFIXES[tokens[tokens.length - 1]]) suffix = SUFFIXES[tokens.pop()];
  const name = tokens.join(" ");
  // "11 Mile Road" is a road, not house number 11 on "Mile".
  if (!name || name === "mile" || /^(?:am|pm)$/.test(name)) return null;
  // How the name is compared: "Saint Aubin" = "St Aubin", "Mc Nichols" = "McNichols".
  const key = name.replace(/^saint\b/, "st").replace(/ /g, "");
  return { number, dir, name, key, suffix, postDir, text: cleaned };
}

// A street's direction, wherever it is written: "100 W Jefferson Ave" and
// "100 Jefferson Ave W" are both west.
const directionOf = (street) => (street ? street.dir || street.postDir || null : null);
const agree = (x, y) => !x || !y || x === y;

// The same address, allowing one side to leave out what the other states.
// Two stated directions, or two stated street types, that differ: not the same.
function sameStreet(a, b) {
  return !!a && !!b && a.number === b.number && a.key === b.key && agree(directionOf(a), directionOf(b)) && agree(a.suffix, b.suffix);
}

module.exports = { parseStreet, sameStreet, streetPart, directionOf, DIRECTIONS, SUFFIXES };
