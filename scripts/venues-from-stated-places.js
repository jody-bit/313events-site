"use strict";

// scripts/venues-from-stated-places.js — A PLACE THE SOURCES KEEP NAMING, AT
// AN ADDRESS THEY KEEP STATING, BECOMES A CANONICAL VENUE.
//
// Product Owner, 2026-10-05: "create canonical venue records when there is a
// stable source-stated venue/place name AND authoritative source-stated
// street address. ... Do not manufacture venue records from inferred
// locations." Measured that day: 51 upcoming Detroit events had no venue
// record; 18 of them were at three places their own organisers name and
// address on every listing (TechTown Detroit, 440 Burroughs Street; GM Plaza
// Promenade (Renaissance Center), 300 Atwater St; WSU Industry Innovation
// Center (I2C), 461 Burroughs St).
//
// THE RULE. Among PUBLIC (approved) events that have a venue name and no
// venue record, the events sharing one name become a venue when ALL of this
// holds:
//   STABLE NAME      the name is stated on events on at least two different
//                    dates. One listing is one listing, not a place.
//   STATED ADDRESS   every one of those events states a street address, and
//                    they all state the same one ("440 Burroughs Street" and
//                    "440 Burroughs St" are the same; a house-number range or
//                    a second address is not).
//   STATED CITY      every one states a city, the same one, and it is a city
//                    this run covers (`cities`; Detroit unless told otherwise).
//   AUTHORITATIVE    every one comes from the place's own organiser or feed:
//                    none from a listings site, ticket seller or news outlet
//                    that compiles other people's events (isFirstParty).
//   A REAL NAME      not a placeholder ("Venue TBA"), not parser debris ("MI",
//                    "-", an address, a city, a web link or a sentence in the
//                    name field).
//   NOT ALREADY HERE no venue has that street address in that city under
//                    another name -- its own address, or the one its linked
//                    events state ("DIA" beside "Detroit Institute of Arts",
//                    a venue row with no address whose events all say 5200
//                    Woodward) -- and no venue in that city has a name that
//                    contains this one or is contained in it ("The Majestic"
//                    beside "Majestic Theatre"). Either may be the same
//                    place; a person says.
//   ONE NAME         no other name qualifies at the same address in the same
//                    run ("TechTown" and "TechTown Detroit", both at 440
//                    Burroughs): which is the venue's name is a person's call.
// The venue is created with exactly what the sources state -- their spelling
// of the name, their street address, their city -- and nothing else. Its
// events are then linked to it.
//
// Measured against production on 2026-10-05, Detroit: UniverSoul Circus (24
// listings, none with an address) and Wayne State Fieldhouse (6, none) do NOT
// qualify; neither does any place named once.
//
// WHY THIS STEP IS OFF UNTIL TURNED ON (api/cron-enrichment.js, VENUE_RECORDS).
// An earlier nightly step (scripts/sh1-repair-existing-venue-address-city.js,
// its "learned" tier) copies an address and city from one listing of a name
// onto other listings of the SAME name that lack them -- learning from any
// row, whatever its source or status -- and leaves no trace of having done
// so. "Every listing states it" can therefore be true of rows whose own
// source stated nothing. Two independent reviews reproduced a venue created
// that way. Until that copy leaves a mark this rule can read, what the rule
// would create is to be looked at by a person first:
//   VENUE_RECORDS_DRY_RUN=true node scripts/venues-from-stated-places.js
//
// ALSO: an event whose venue name IS an existing venue's name (after the same
// normalisation every connector uses) and whose city does not contradict the
// venue's is linked to it. Connectors do this when they write a row; this
// does it for rows already stored. Placeholder venues are never linked to.
//
// Dry run: VENUE_RECORDS_DRY_RUN=true, or --dry-run on the command line.

// Each path is written out in full: the deployment bundler follows these
// requires to decide which files a function ships with.
const path = require("path");
const { normalizeVenueName, isPlaceholderVenueName, normalizeCityForCompare, citiesConflict } = require(path.join(__dirname, "..", "api", "_lib", "venue-lookup"));
const { knownCity } = require(path.join(__dirname, "..", "api", "_lib", "orbit-cities"));
const { parseStreet, sameStreet } = require(path.join(__dirname, "..", "api", "_lib", "street-address"));

const PAGE_SIZE = 1000;
const MAX_PAGES = 40;
const MAX_CREATED_PER_RUN = 10;
const MIN_DATES = 2;
// Listings sites, ticket sellers and news outlets compile other people's
// events: a name and address there is what somebody copied or keyed in, not
// what the place or its organiser states. Matched anywhere in the source
// name, whatever its case ("Paxahau / Resident Advisor", "Editorial Review
// (Automated)").
const NOT_FIRST_PARTY = /visit\s*detroit|metro\s*times|resident\s*advisor|ticketmaster|eventbrite|\bdice\b|19hz|\bwdet\b|editorial review/i;
const isFirstParty = (source) => !isBlank(source) && !NOT_FIRST_PARTY.test(String(source));
const isOn = (value) => /^(?:true|1|yes|on)$/i.test(String(value || "").trim());
const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

// A name that stands for "no particular place".
const NO_PLACE = /\b(?:tba|tbd|tbc|to be (?:announced|determined|confirmed)|multiple locations|various (?:locations|venues)|online|virtual|zoom|webinar|livestream|facebook live|secret location|private residence|address (?:provided|given|released)|see (?:description|below|details|website|flyer)|parking|none|unknown|n\/a)\b/i;
const isNoPlace = (name) => isPlaceholderVenueName(name) || NO_PLACE.test(String(name || ""));

// Is this text a place's name? Not a placeholder, not debris.
function isPlaceName(name) {
  const text = String(name || "").trim();
  if (text.length < 3 || text.length > 80) return false;
  if (!/\p{L}{2}/u.test(text)) return false; // "-", "48201"
  if (isNoPlace(text)) return false;
  if (/&[a-z]+;|&#\d+;/i.test(text)) return false; // an HTML entity left in the field
  if (/https?:\/\/|www\.|\.(?:com|org|net)\b/i.test(text)) return false; // a web link
  if (/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(text)) return false; // a telephone number
  if (parseStreet(text) || /\d+\s+\S+.*,/.test(text) || /,\s*(?:MI|OH|ON)\b/.test(text) || /\b\d{5}\b/.test(text)) return false; // an address in the name field
  // A state or a city, with or without its state after it ("Detroit MI", "Detroit, Michigan").
  const place = text.replace(/[,\s]+(?:mi|oh|on|michigan|ohio|ontario|usa)\.?$/i, "").trim();
  if (/^(?:mi|oh|on|usa|michigan|ohio|ontario)$/i.test(text) || knownCity(text, "MI") || knownCity(text, "OH") || knownCity(place, "MI") || knownCity(place, "OH")) return false;
  if (/\b(?:meet at|located at|join us|call (?:for|us)|rsvp)\b/i.test(text)) return false; // an instruction
  return true;
}

// The words of a name, for "is one contained in the other".
const nameWords = (name) => normalizeVenueName(name).replace(/[^\p{L}\p{N} ]/gu, " ").split(" ").filter((w) => w && w !== "the");
function namesOverlap(a, b) {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return false;
  const [small, large] = x.length <= y.length ? [x, y] : [y, x];
  return small.every((w) => large.includes(w));
}

// events: public rows with no venue_id. venues: every venue row.
// -> { create: [{ name, address, city, eventIds, sources, dates }],
//      link: [{ venueId, name, eventIds }],
//      skipped: [{ name, events, reason, detail? }] }
// options.venueAddresses: Map(venue id -> [street addresses its own linked
//   events state]). Many venue rows carry a name and a city and no address;
//   where their events state one, that is where the venue is.
function planVenueRecords(events, venues, options = {}) {
  const cities = new Set((options.cities || ["Detroit"]).map((c) => normalizeCityForCompare(c)));
  const stated = options.venueAddresses || new Map();
  const addressesOf = (venue) => [venue.address, ...(stated.get(venue.id) || [])].map((text) => parseStreet(text)).filter(Boolean);
  const venueByName = new Map();
  for (const venue of venues || []) {
    const key = normalizeVenueName(venue.name);
    if (!key) continue;
    venueByName.set(key, venueByName.has(key) ? null : venue); // two venues of one name: ambiguous
  }
  const groups = new Map();
  for (const event of events || []) {
    if (!event || event.venue_id || isBlank(event.venue_name_raw)) continue;
    if (event.status && event.status !== "approved") continue; // only what a person has let the public see
    const key = normalizeVenueName(event.venue_name_raw);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const plan = { create: [], link: [], skipped: [] };
  const skip = (name, rows, reason, detail) => plan.skipped.push({ name, events: rows.length, reason, detail });
  const candidates = [];
  for (const [key, rows] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    // The spelling most of the listings use; a tie goes to the shorter, then to plain order.
    const spellings = new Map();
    for (const row of rows) { const s = String(row.venue_name_raw).trim().replace(/\s+/g, " "); spellings.set(s, (spellings.get(s) || 0) + 1); }
    const name = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1))[0][0];

    // "Venue TBA" is a venue row, and nobody's venue: an event in Canton
    // whose feed gave no venue must not be attached to it.
    if (isNoPlace(name)) continue;

    // A venue of this name exists: link, unless the cities contradict.
    if (venueByName.has(key)) {
      const venue = venueByName.get(key);
      if (!venue) { skip(name, rows, "two_venues_share_this_name"); continue; }
      const linkable = rows.filter((row) => !citiesConflict(row.venue_city_raw, venue.city));
      if (linkable.length) plan.link.push({ venueId: venue.id, name: venue.name, eventIds: linkable.map((row) => row.id).sort() });
      if (linkable.length < rows.length) skip(name, rows.filter((row) => !linkable.includes(row)), "city_contradicts_the_venue", venue.city);
      continue;
    }

    if (!isPlaceName(name)) continue; // debris is not reported one by one
    const dates = new Set(rows.map((row) => row.start_date).filter(Boolean));
    if (dates.size < MIN_DATES) continue; // named once: not a recurring place
    const streets = rows.map((row) => parseStreet(row.venue_address_raw));
    const cityKeys = new Set(rows.map((row) => normalizeCityForCompare(row.venue_city_raw)));
    const inScope = cityKeys.size === 1 && cities.has([...cityKeys][0]);
    // Only places in the cities this run covers are reported; the rest are simply not this run's.
    if (!inScope && ![...cityKeys].some((c) => cities.has(c))) continue;
    if (streets.some((s) => !s)) { skip(name, rows, "not_every_listing_states_a_street_address", `${streets.filter(Boolean).length} of ${rows.length}`); continue; }
    if (!streets.every((s) => sameStreet(streets[0], s))) { skip(name, rows, "listings_state_different_addresses", [...new Set(streets.map((s) => s.text))].sort().join(" / ")); continue; }
    if (cityKeys.has("")) { skip(name, rows, "not_every_listing_states_a_city"); continue; }
    if (!inScope) { skip(name, rows, "listings_state_different_cities", [...cityKeys].sort().join(" / ")); continue; }
    const others = [...new Set(rows.filter((row) => !isFirstParty(row.source)).map((row) => row.source || "(no source)"))].sort();
    if (others.length) { skip(name, rows, "a_listing_is_not_from_the_place_or_its_organiser", others.join(" / ")); continue; }
    const cityText = String(rows[0].venue_city_raw).split(",")[0].trim();
    const city = knownCity(cityText, "MI") || knownCity(cityText, "OH");
    if (!city) { skip(name, rows, "city_not_known", rows[0].venue_city_raw); continue; }
    const street = streets.slice().sort((a, b) => b.text.length - a.text.length || (a.text < b.text ? -1 : 1))[0];
    const sameCity = (venues || []).filter((venue) => !citiesConflict(venue.city, city));
    const neighbour = sameCity.find((venue) => addressesOf(venue).some((address) => sameStreet(address, street)));
    if (neighbour) { skip(name, rows, "a_venue_already_has_this_address", neighbour.name); continue; }
    const lookalike = sameCity.find((venue) => namesOverlap(venue.name, name));
    if (lookalike) { skip(name, rows, "a_venue_has_a_similar_name", lookalike.name); continue; }
    candidates.push({ name, address: street.text, city, street, eventIds: rows.map((row) => row.id).sort(), sources: [...new Set(rows.map((row) => row.source))].sort(), dates: dates.size, rows });
  }
  // Two names for one address in the same run: neither is created.
  for (const candidate of candidates) {
    const rivals = candidates.filter((other) => other !== candidate && other.city === candidate.city && sameStreet(other.street, candidate.street));
    if (rivals.length) { skip(candidate.name, candidate.rows, "another_name_is_stated_at_this_address", rivals.map((r) => r.name).sort().join(" / ")); continue; }
    const { street, rows, ...place } = candidate;
    plan.create.push(place);
  }
  return plan;
}

async function readAll(SUPABASE_URL, sbHeaders, fetchFn, pathAndQuery, what) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/${pathAndQuery}&limit=${PAGE_SIZE}&offset=${rows.length}`, { headers: sbHeaders });
    if (!resp.ok) throw new Error(`Failed to read ${what}: HTTP ${resp.status}`);
    const batch = await resp.json();
    if (!Array.isArray(batch)) throw new Error(`Unexpected response shape reading ${what}`);
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error(`still reading ${what} after ${MAX_PAGES} requests; refusing to work from a partial list`);
}

async function linkEvents(SUPABASE_URL, sbHeaders, fetchFn, venueId, eventIds) {
  const linked = [];
  for (let i = 0; i < eventIds.length; i += 50) {
    const ids = eventIds.slice(i, i + 50).map((id) => `"${id}"`).join(",");
    // Guarded: an event that gained a venue in the meantime keeps it.
    const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/events?id=in.(${ids})&venue_id=is.null`, {
      method: "PATCH",
      headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ venue_id: venueId }),
    });
    if (!resp.ok) throw new Error(`could not link events: HTTP ${resp.status}`);
    const changed = await resp.json().catch(() => null);
    if (Array.isArray(changed)) linked.push(...changed.map((row) => row.id));
  }
  return linked; // the ids that were actually linked
}

async function createVenuesFromStatedPlaces({
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  dryRun = isOn(process.env.VENUE_RECORDS_DRY_RUN),
  fetchFn = fetch,
  cities = ["Detroit"],
  maxCreated = MAX_CREATED_PER_RUN,
  logger = console,
} = {}) {
  const counts = { dryRun, eventsWithoutVenue: 0, created: [], linkedToExisting: [], eventsLinked: 0, deferredByCap: 0, skipped: [], failed: 0, writtenIds: [] };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  const venues = await readAll(SUPABASE_URL, sbHeaders, fetchFn, "venues?select=id,name,address,city&order=id.asc", "venues");
  const events = await readAll(SUPABASE_URL, sbHeaders, fetchFn, "events?venue_id=is.null&status=eq.approved&venue_name_raw=not.is.null&select=id,source,status,start_date,venue_name_raw,venue_address_raw,venue_city_raw&order=id.asc", "events without a venue");
  counts.eventsWithoutVenue = events.length;
  // Where each existing venue is, by what its own linked public events state.
  const linked = await readAll(SUPABASE_URL, sbHeaders, fetchFn, "events?venue_id=not.is.null&status=eq.approved&venue_address_raw=not.is.null&select=venue_id,venue_address_raw&order=id.asc", "the venues' events");
  const venueAddresses = new Map();
  for (const row of linked) {
    if (!venueAddresses.has(row.venue_id)) venueAddresses.set(row.venue_id, []);
    if (!venueAddresses.get(row.venue_id).includes(row.venue_address_raw)) venueAddresses.get(row.venue_id).push(row.venue_address_raw);
  }
  const plan = planVenueRecords(events, venues, { cities, venueAddresses });
  counts.skipped = plan.skipped;

  for (const link of plan.link) {
    const entry = { venue: link.name, events: link.eventIds.length };
    if (dryRun) { counts.linkedToExisting.push({ ...entry, dryRun: true }); continue; }
    try {
      const linked = await linkEvents(SUPABASE_URL, sbHeaders, fetchFn, link.venueId, link.eventIds);
      counts.eventsLinked += linked.length;
      counts.linkedToExisting.push({ ...entry, linked: linked.length });
      counts.writtenIds.push(...linked);
    } catch (err) {
      counts.failed++;
      counts.linkedToExisting.push({ ...entry, error: err.message });
    }
  }

  let made = 0;
  for (const place of plan.create) {
    const entry = { name: place.name, address: place.address, city: place.city, events: place.eventIds.length, dates: place.dates, sources: place.sources };
    if (made >= maxCreated) { counts.deferredByCap++; continue; }
    made++;
    if (dryRun) { counts.created.push({ ...entry, dryRun: true }); continue; }
    try {
      const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/venues`, {
        method: "POST",
        headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify([{ name: place.name, address: place.address, city: place.city }]),
      });
      if (!resp.ok) throw new Error(`could not create the venue: HTTP ${resp.status}`);
      const rows = await resp.json().catch(() => null);
      const venueId = Array.isArray(rows) && rows[0] && rows[0].id;
      if (!venueId) throw new Error("the venue was created but its id could not be read; its events are linked on the next run");
      counts.writtenIds.push(venueId);
      const linked = await linkEvents(SUPABASE_URL, sbHeaders, fetchFn, venueId, place.eventIds);
      counts.eventsLinked += linked.length;
      counts.created.push({ ...entry, venueId, linked: linked.length });
      counts.writtenIds.push(...linked);
    } catch (err) {
      counts.failed++;
      counts.created.push({ ...entry, error: err.message });
    }
  }
  return counts;
}

module.exports = { createVenuesFromStatedPlaces, planVenueRecords, isPlaceName, isFirstParty, namesOverlap, MIN_DATES };

if (require.main === module) {
  createVenuesFromStatedPlaces({ dryRun: process.argv.includes("--dry-run") || isOn(process.env.VENUE_RECORDS_DRY_RUN) })
    .then((c) => { console.log(JSON.stringify(c, null, 2)); })
    .catch((e) => { console.error(e); process.exit(1); });
}
