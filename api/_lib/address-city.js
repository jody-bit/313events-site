"use strict";

// api/_lib/address-city.js
//
// The city a street-address string STATES, and nothing it does not.
//
// Why it exists (P1 audit EXPORT-2, "nocity-missing-city-has-address"): rows
// were stored with a full street address but a blank venue_city_raw because
// the writers only split one shape ("<street>, <City>, MI"), or, for the
// public submit form, never split at all. The address text itself already
// said where the place is.
//
// Rules (conservative on purpose):
//   - the text must end in a Michigan or Ohio state word, optionally followed
//     by a ZIP (or ZIP+4) -- "…Plymouth MI 48170", "…Ferndale, MI";
//   - the words right before the state must be a city on api/_lib/orbit-cities
//     (a closed list), tried longest first so "Bloomfield Hills" beats "Hills";
//   - the part before the city must look like a street address (starts with a
//     house number). "Ste 100", "Suite B", "Unit 4" etc. after the street stay
//     with the street;
//   - anything else -- no city in the text ("7500 Oakland Ave"), a city that
//     is not on the list, a bare venue name -- returns null. A city is never
//     guessed from a street name or a venue name.
// Pure: text in, { street, city, state } or null out. Writes nothing.

const path = require("path");
const { knownCity } = require(path.join(__dirname, "orbit-cities"));

const STATE_RE = /[,\s]+(MI|Mich\.?|Michigan|OH|Ohio)\.?(?:[,\s]+(\d{5})(?:-\d{4})?)?\s*$/i;

function cityFromAddress(text) {
  if (typeof text !== "string") return null;
  const clean = text.replace(/&[a-z]+;|&#\d+;/gi, " ").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const sm = STATE_RE.exec(clean);
  if (!sm) return null;
  const state = /^o/i.test(sm[1]) ? "OH" : "MI";
  const head = clean.slice(0, sm.index).replace(/[,\s]+$/, "");
  if (!/^\d/.test(head)) return null; // must start with a house number
  const words = head.split(" ");
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {
    const candidate = words.slice(-n).join(" ").replace(/^,+|,+$/g, "");
    const city = knownCity(candidate, state);
    if (!city) continue;
    const street = words.slice(0, words.length - n).join(" ").replace(/[,\s]+$/, "");
    if (!street || !/^\d/.test(street) || !/[A-Za-z]/.test(street)) continue;
    return { street, city, state };
  }
  return null;
}

module.exports = { cityFromAddress };
