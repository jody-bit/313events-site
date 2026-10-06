"use strict";

// api/_lib/census-geocoder.js
//
// Street address -> coordinates, from the U.S. Census Bureau's public
// geocoder (https://geocoding.geo.census.gov/geocoder/ -- free, no key, the
// Bureau's own TIGER address ranges; benchmark "Public_AR_Current"). Used for
// ONE thing: the coordinates of a canonical venue whose street address is
// already on file (scripts/venue-geography.js). A venue is geocoded once;
// the coordinates are stored on its row and never asked for again.
//
// What counts as an answer -- anything less is "no answer", never a guess:
//   - the geocoder returns at least one match, and every match it returns is
//     the same spot (within 30 metres): two different places for one address
//     is ambiguous;
//   - the match is in the state the venue's city is in. The request names the
//     city and state; a match in another state is a different address.
// The MATCHED CITY is deliberately not compared with the venue's city: the
// geocoder reports the postal city of the ZIP code, and Detroit's ZIP codes
// cover Hamtramck and Highland Park (and the reverse). Whether a point is in
// Detroit is decided by the City's own boundary, not by a mailing address.
//
// Coverage: United States only. A venue in Windsor, Ontario gets no answer.

const ENDPOINT = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const BENCHMARK = "Public_AR_Current";
const SAME_SPOT_METERS = 30;
const DEFAULT_TIMEOUT_MS = 8000;

function oneLine({ street, city, state, zip }) {
  return [street, city, [state, zip].filter(Boolean).join(" ")].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

function geocodeUrl(address) {
  const params = new URLSearchParams({ address: oneLine(address), benchmark: BENCHMARK, format: "json" });
  return `${ENDPOINT}?${params.toString()}`;
}

function metersBetween(a, b) {
  const mPerDegLat = 111320;
  const mPerDegLng = mPerDegLat * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lng - b.lng) * mPerDegLng, (a.lat - b.lat) * mPerDegLat);
}

// The geocoder's JSON -> { status: "match", lat, lng, matchedAddress, matchedAddresses, zip }
//                      | { status: "no_match" | "ambiguous" | "wrong_state", detail? }
//                      | { status: "unreadable" }   not the shape the geocoder answers in
function readGeocodeResponse(body, expectedState) {
  const matches = body && body.result && Array.isArray(body.result.addressMatches) ? body.result.addressMatches : null;
  if (!matches) return { status: "unreadable" };
  // A coordinate is a number in the part of the world the geocoder covers.
  // (Number(null) is 0: a match with empty coordinates is not a point at 0,0.)
  const coordinate = (value, low, high) => (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number(value) >= low && Number(value) <= high ? Number(value) : NaN;
  const points = matches
    .map((m) => ({
      lat: m && m.coordinates ? coordinate(m.coordinates.y, 17, 72) : NaN,
      lng: m && m.coordinates ? coordinate(m.coordinates.x, -180, -64) : NaN,
      matchedAddress: m && typeof m.matchedAddress === "string" ? m.matchedAddress : null,
      state: m && m.addressComponents ? String(m.addressComponents.state || "").toUpperCase() : "",
      zip: m && m.addressComponents ? String(m.addressComponents.zip || "") : "",
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  // The geocoder returned matches but none with coordinates that can be read:
  // that is not "no such address".
  if (matches.length && !points.length) return { status: "unreadable" };
  if (!points.length) return { status: "no_match" };
  const first = points[0];
  if (points.some((p) => metersBetween(first, p) > SAME_SPOT_METERS)) return { status: "ambiguous", detail: `${points.length} different places` };
  // Every match must say which state it is in, and it must be the one asked for.
  if (expectedState) {
    if (points.some((p) => !p.state)) return { status: "unreadable" };
    const other = points.find((p) => p.state !== String(expectedState).toUpperCase());
    if (other) return { status: "wrong_state", detail: other.state };
  }
  // Every name the geocoder gave the spot ("7096 E 14 MILE RD" and
  // "7096 E FOURTEEN MILE RD" are one match each, at the same coordinates).
  const matchedAddresses = [...new Set(points.map((p) => p.matchedAddress).filter(Boolean))];
  return { status: "match", lat: first.lat, lng: first.lng, matchedAddress: first.matchedAddress, matchedAddresses, zip: first.zip || null };
}

// address: { street, city, state, zip? }. Never throws: a failure is
// { status: "error", detail } and the venue is simply tried again another day.
async function geocodeAddress(address, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  if (!address || !address.street || !address.city || !address.state) return { status: "error", detail: "street, city and state are required" };
  let resp;
  try {
    resp = await fetchFn(geocodeUrl(address), { headers: { "User-Agent": "313.events event calendar" }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    return { status: "error", detail: err && err.message ? err.message : String(err) };
  }
  if (!resp || !resp.ok) return { status: "error", detail: `HTTP ${resp ? resp.status : "no response"}` };
  let body;
  try {
    body = await resp.json();
  } catch (err) {
    return { status: "error", detail: "unparseable response" };
  }
  const answer = readGeocodeResponse(body, address.state);
  // An answer that cannot be read is not "no such address": it is treated as
  // an outage, so that nothing is concluded and the address is asked again.
  return answer.status === "unreadable" ? { status: "error", detail: "unreadable answer" } : answer;
}

module.exports = { geocodeAddress, readGeocodeResponse, geocodeUrl, oneLine, ENDPOINT, BENCHMARK };
