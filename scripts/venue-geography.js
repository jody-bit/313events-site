"use strict";

// scripts/venue-geography.js — WHERE IS THIS VENUE, AND WHICH DETROIT
// NEIGHBORHOOD IS THAT? (Product Owner, 2026-10-05.)
//
//   VENUE ADDRESS -> COORDINATES -> INSIDE THE CITY LIMITS? -> WHICH CITY
//   NEIGHBORHOOD POLYGON -> THE VENUE'S NEIGHBORHOOD -> ITS EVENTS INHERIT IT
//
// The last arrow needs no code: the public view (events_public) already reads
// an event's neighborhood from its venue. This pass keeps the venue right.
//
// 1. COORDINATES. A canonical venue with no coordinates and a street address
//    is looked up ONCE with the U.S. Census Bureau geocoder
//    (api/_lib/census-geocoder.js) and the answer is stored on the venue
//    (venues.lat / venues.lng). A venue that has coordinates is never looked
//    up again. An address the geocoder could not place is remembered on the
//    venue too (see GEOGRAPHY LINE below) and is asked again only if the
//    address itself changes.
//
//    The address is the venue's own. Where the venue row has none, it is the
//    street address its linked events state -- but only when every one of
//    them that states a street states the same one ("2934 Russell" and
//    "2934 Russell Street" are the same; "4120 Woodward" and "4140 Woodward"
//    are not). Nothing is taken from a venue's name.
//
// 2. NEIGHBORHOOD. Coordinates are tested against the City of Detroit's own
//    boundary and neighborhood polygons, a snapshot committed to this
//    repository (data/geography/, api/_lib/detroit-geography.js). No network.
//      - outside the city limits (Hamtramck and Highland Park included):
//        no Detroit neighborhood, whatever the venue's stored city says;
//      - inside one polygon: that polygon's neighborhood;
//      - inside none, or inside two: no answer.
//
// WHAT IT NEVER DOES
//   - It never changes a neighborhood a person assigned. A venue whose
//     neighborhood was set by research or editorial judgment keeps it; the
//     pass stores coordinates for it and reports -- in its run summary, not
//     in the database -- when the City's polygon carries a different name.
//   - It never assigns INTO, or creates a rival beside, a 313.events label
//     that only a person assigns (PERSON_ASSIGNED_LABELS in
//     api/_lib/detroit-geography.js). A venue standing in a polygon held for
//     one of them (HELD_POLYGONS) gets coordinates and no neighborhood.
//   - It never decides from a ZIP code, a name, or a postal city.
//   - It never assigns from a point that is on the line (MIN_EDGE_METERS).
//     There it asks the City's parcel file about the exact address, and
//     assigns only if the parcel settles it (api/_lib/detroit-parcels.js).
//   - It never adds a neighborhood name to the site: a polygon with no
//     313.events label is recorded on the venue and reported, not labelled.
//   - It never assigns a neighborhood to a venue whose stored city is not
//     Detroit, even if the point is inside the limits: the two disagree, and
//     that is a person's to settle.
//   - It never rewrites its own earlier answer if someone has since changed
//     it: a 'geographic' assignment is only refreshed while the venue still
//     carries the label this pass recorded, and a venue whose source notes
//     hold a single word a person wrote is that person's from then on.
//   - It never writes over an edit made while it runs: every write names the
//     values it read, and does nothing if they are no longer there.
//
// KNOWN LIMIT. Coordinates are stored once. If a person later corrects a
// venue's ADDRESS, the old coordinates stay until they are cleared (set
// lat and lng to null and the next run geocodes the new address).
//
// GEOGRAPHY LINE. What the pass concluded is written to
// venues.neighborhood_source as one line. Where a person's notes are already
// there, they stay exactly as written and the line follows them (that happens
// only to remember an address the geocoder could not place):
//   GEOGRAPHY | v1 | polygon=Corktown | label=Corktown | point=42.33160,-83.06540
//     | address=1949 Michigan Ave, Detroit, MI | at=2026-10-05
//   GEOGRAPHY | v1 | polygon=Cadillac Heights | label=... | by=parcel | parcel=09011086.000 | ...
//   GEOGRAPHY | v1 | none=near_boundary | polygon=Palmer Park | parcel=no_parcel | edge_m=6 | ...
//   GEOGRAPHY | v1 | none=no_label_for_polygon | polygon=Elijah McCoy | point=... | ...
//   GEOGRAPHY | v1 | none=outside_detroit | point=... | address=... | at=...
//   GEOGRAPHY | v1 | none=no_match | address=608 S Washington Ave, Detroit, MI | at=...
//
// Dry run: VENUE_GEOGRAPHY_DRY_RUN=true, or --dry-run on the command line.
// A dry run still asks the geocoder (that is how it knows what it would
// write); it writes nothing.

// Each path is written out in full: the deployment bundler follows these
// requires to decide which files a function ships with.
const path = require("path");
const { loadGeography, labelForCityName, nameKey } = require(path.join(__dirname, "..", "api", "_lib", "detroit-geography"));
const { geocodeAddress, oneLine } = require(path.join(__dirname, "..", "api", "_lib", "census-geocoder"));
const { findParcel } = require(path.join(__dirname, "..", "api", "_lib", "detroit-parcels"));
const { knownCity } = require(path.join(__dirname, "..", "api", "_lib", "orbit-cities"));
const { isPlaceholderVenueName, normalizeCityForCompare } = require(path.join(__dirname, "..", "api", "_lib", "venue-lookup"));
const { parseStreet, sameStreet, streetPart, directionOf } = require(path.join(__dirname, "..", "api", "_lib", "street-address"));

const LINE_TAG = "GEOGRAPHY | v1";
// HOW FAR INSIDE ITS POLYGON A POINT MUST BE. The geocoder does not know
// where a building stands: it places an address along the street's
// centreline, 6 metres to one side. The City draws neighborhood boundaries
// down those same centrelines. So for a venue on a boundary street, which
// neighborhood the POINT is in rests on those 6 metres -- an inference about
// the side of the street, not a fact about the building. Measured 2026-10-05
// on the 47 venue addresses that geocode inside Detroit: 15 fall within 6 m
// of an edge, 3 more within 30 m, and the next nearest is 148 m.
//
// A point closer to an edge than this is therefore not assigned from the
// point. It is settled, if at all, by the City's parcel record for the
// address (api/_lib/detroit-parcels.js): the land the building stands on,
// which the City itself places in a neighborhood. (On the eleven boundary
// addresses checked that day the parcel record named the same polygon the
// point fell in every time; the rule stays because the parcel is evidence
// and six metres is not.) No parcel at that exact address: unresolved, and
// listed for a person with the polygon the point touched.
const MIN_EDGE_METERS = 50;
const MAX_GEOCODES_PER_RUN = 50;
const MAX_PARCEL_LOOKUPS_PER_RUN = 10;
const GEOCODE_CONCURRENCY = 4;
// Time the run may spend waiting on the geocoder, then on the parcel file.
// Whatever is not asked in time is asked on the next run.
const GEOCODE_BUDGET_MS = 25000;
const PARCEL_BUDGET_MS = 15000;
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
// What the geocoder can say about an address other than where it is. These
// are answers and are remembered. An answer that cannot be read is not one:
// it is treated like an outage and the address is asked about again.
const NOT_PLACED = new Set(["no_match", "ambiguous", "wrong_state", "different_street", "different_street_type"]);
// A person's confidence in a neighborhood. 'geographic' is this pass's own;
// 'unconfirmed' means nobody has decided.
const HUMAN_CONFIDENCE = new Set(["multi_source", "single_source", "editorial_judgment"]);
const isOn = (value) => /^(?:true|1|yes|on)$/i.test(String(value || "").trim());
const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Detroit" });
}

// ------------------------------------------------------------ which address

// How fully an address is stated (a direction, a street type).
const completeness = (street) => (directionOf(street) ? 1 : 0) + (street.suffix ? 1 : 0);

function stateOf(city) {
  if (knownCity(city, "MI")) return "MI";
  if (knownCity(city, "OH")) return "OH";
  return null;
}

// What to ask the geocoder about a venue.
//   venue: { address, city, zip_code }
//   eventPlaces: [{ address, city }] as stated by the venue's linked events
// -> { status: "ok", from: "venue" | "events", street, city, state, zip, asked }
//  | { status: "no_address" | "unusable_address" | "addresses_disagree"
//            | "cities_disagree" | "no_city" | "outside_coverage", detail }
function chooseAddress(venue, eventPlaces) {
  let street = null;
  let city = isBlank(venue.city) ? null : String(venue.city).trim();
  let from = "venue";
  if (!isBlank(venue.address)) {
    street = parseStreet(venue.address);
    if (!street) return { status: "unusable_address", detail: String(venue.address).trim() };
  } else {
    const stated = (Array.isArray(eventPlaces) ? eventPlaces : []).filter((p) => p && !isBlank(p.address));
    if (!stated.length) return { status: "no_address" };
    const parsed = stated.map((p) => ({ street: parseStreet(p.address), city: p.city })).filter((p) => p.street);
    if (!parsed.length) return { status: "unusable_address", detail: String(stated[0].address).trim() };
    if (!parsed.every((p) => sameStreet(parsed[0].street, p.street))) {
      return { status: "addresses_disagree", detail: [...new Set(parsed.map((p) => p.street.text))].sort().join(" / ") };
    }
    // The fullest statement of it; a tie goes to the first in plain order.
    street = parsed.map((p) => p.street).sort((a, b) => completeness(b) - completeness(a) || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))[0];
    from = "events";
    // The city the events give for that address, when they give exactly one.
    // "Detroit, MI 48207" is "Detroit".
    const cities = new Map();
    for (const p of parsed) {
      const key = normalizeCityForCompare(p.city);
      if (key && !cities.has(key)) cities.set(key, String(p.city).split(",")[0].trim());
    }
    if (cities.size > 1) return { status: "cities_disagree", detail: [...cities.values()].sort().join(" / ") };
    if (cities.size === 1) city = [...cities.values()][0];
  }
  if (!city) return { status: "no_city" };
  const state = stateOf(city);
  if (!state) return { status: "outside_coverage", detail: city };
  const zip = from === "venue" && /^\d{5}$/.test(String(venue.zip_code || "").trim()) ? String(venue.zip_code).trim() : null;
  const address = { street: street.text, city, state, zip };
  return { status: "ok", from, ...address, parsed: street, asked: oneLine(address) };
}

// The geocoder matched an address: is it the one that was asked about?
//   "yes"                    the same house number, on the same-named street,
//                            in a direction that does not contradict the one
//                            asked for, and of the same type (St, Ave, ...)
//   "different_street"       anything else. It answers approximate spellings,
//                            and an approximate answer is not an answer:
//                            "49345 S Interstate 94 Service Dr" came back as
//                            "49345 S I- 94 SVC RD" and is left unplaced.
//   "different_street_type"  the same number and name but another TYPE, and
//                            nothing on file to say they are one street.
//
// On the street type. Measured 2026-10-05 on all 77 venue addresses: five came
// back with another type ("2357 Caniff Ave" as CANIFF ST, "7032 E Ferry St"
// as E FERRY AVE, "11474 Joseph Campau Ave" as JOSEPH CAMPAU ST, ...), each
// evidently the right place. But "1 Park St" answered with "1 PARK AVE" could
// just as well be a different street, and nothing in the answer tells the two
// cases apart. So another type is accepted only when the venue's own ZIP code
// is on file and the match is in that ZIP; otherwise the venue is listed with
// the type the geocoder found, and correcting the address settles it.
function matchIsTheAddressAsked(asked, matchedAddresses, zips = {}) {
  const agree = (x, y) => !x || !y || x === y;
  const candidates = (Array.isArray(matchedAddresses) ? matchedAddresses : [matchedAddresses])
    .map((text) => parseStreet(text))
    .filter((matched) => !!asked && !!matched && asked.number === matched.number && asked.key === matched.key && agree(directionOf(asked), directionOf(matched)));
  if (!candidates.length) return "different_street";
  if (candidates.some((matched) => agree(asked.suffix, matched.suffix))) return "yes";
  const zipOnFile = String(zips.onFile || "").trim();
  if (/^\d{5}$/.test(zipOnFile) && zipOnFile === String(zips.matched || "").trim()) return "yes";
  return "different_street_type";
}

// ------------------------------------------------------------ geography line

const clean = (value) => String(value == null ? "" : value).replace(/\s*\|\s*/g, " / ").replace(/\s+/g, " ").trim();
function geographyLine(fields, at) {
  const parts = [LINE_TAG];
  for (const [key, value] of Object.entries(fields)) if (!isBlank(value)) parts.push(`${key}=${clean(value)}`);
  parts.push(`at=${at}`);
  return parts.join(" | ");
}
// A line this pass wrote, and nothing else on it: from the tag to the date.
// "GEOGRAPHY | v1 | ... | at=2026-10-05 -- checked, J." is a person's line.
const isOwnLine = (line) => /^GEOGRAPHY \| v1(?: \| (?:polygon|label|none|pending|by|parcel|parcel_for|edge_m|point|address)=[^|]*)* \| at=\d{4}-\d{2}-\d{2}$/.test(line);
// Is there anything in the notes that this pass did not write?
function hasPersonsText(text) {
  return String(text || "").split("\n").some((line) => line.trim() && !isOwnLine(line));
}
// The pass's own (last) line, read back as its fields.
function readGeographyLine(text) {
  const line = String(text || "").split("\n").filter(isOwnLine).pop();
  if (!line) return null;
  const fields = {};
  for (const part of line.split(" | ").slice(2)) {
    const eq = part.indexOf("=");
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return fields;
}
// `text` with the pass's own line replaced by `line` (or `line` added after
// it when there is none). Every other character of it -- a person's notes --
// is exactly as it was.
function withGeographyLine(text, line) {
  const original = String(text || "");
  if (!original) return line;
  const lines = original.split("\n");
  let own = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (isOwnLine(lines[i])) { own = i; break; }
  if (own === -1) return `${original}\n${line}`;
  lines[own] = line;
  return lines.join("\n");
}
const pointText = (lat, lng) => `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;

// ------------------------------------------------------------------ decision

// Who owns this venue's neighborhood?
//   "person"  a person assigned it, or wrote anything at all in its notes
//   "pass"    this pass assigned it and nobody has touched it since
//   "changed" this pass assigned it and someone has changed or removed it
//   "nobody"
function ownerOf(venue, labelById) {
  if (HUMAN_CONFIDENCE.has(venue.neighborhood_confidence)) return "person";
  if (hasPersonsText(venue.neighborhood_source)) return "person";
  const line = readGeographyLine(venue.neighborhood_source);
  if (venue.neighborhood_confidence === "geographic") {
    if (!line || !line.label) return "person"; // 'geographic' from elsewhere: not ours to touch
    return venue.neighborhood_id && labelById.get(venue.neighborhood_id) === line.label ? "pass" : "changed";
  }
  if (venue.neighborhood_id) return "person"; // a neighborhood with no stated confidence
  // The pass's line says it assigned a label, and the venue no longer has
  // one: someone took it off. It is not put back.
  if (line && line.label) return "changed";
  return "nobody";
}

// venue: a venues row WITH coordinates. -> what the pass would do.
//   { action: "protected", agrees, cityPolygon, current }      a person's; coordinates only
//   { action: "assign", label, polygon, create }               set the neighborhood
//   { action: "keep" }                                         already says exactly this
//   { action: "none", reason, polygon?, pending? }             no neighborhood (and clears its own stale one)
// options.createLabels: when the polygon has no 313.events label, make the
//   City's name one. Off unless asked: which names the site shows is the
//   Product Owner's, and the polygon is recorded on the venue either way.
// options.parcelPolygon: the polygon the City's parcel record settled for this
//   venue's address (detroit-parcels.js). It stands in for the point's own
//   polygon, and is not subject to the distance-from-the-edge rule.
function decide(venue, geography, labels, options = {}) {
  const labelById = new Map(labels.map((l) => [l.id, l.name]));
  const labelNames = labels.map((l) => l.name);
  const owner = ownerOf(venue, labelById);
  const at = geography.neighborhoodAt(Number(venue.lat), Number(venue.lng));
  const current = venue.neighborhood_id ? labelById.get(venue.neighborhood_id) || null : null;
  if (owner === "person" || owner === "changed") {
    const mapped = at.status === "found" ? labelForCityName(at.name, labelNames) : null;
    let agrees = null;
    if (current) agrees = at.status === "found" && mapped.action === "use" && mapped.label === current;
    return { action: "protected", owner, current, agrees, where: at.status, cityPolygon: at.status === "found" ? at.name : null, edgeMeters: at.status === "found" ? at.edgeMeters : null, pending: mapped && mapped.action === "hold" ? mapped.pendingLabel : null };
  }
  const storedCityIsDetroit = normalizeCityForCompare(venue.city) === "detroit";
  if (at.status === "outside_detroit") return { action: "none", reason: storedCityIsDetroit ? "outside_detroit_but_city_says_detroit" : "outside_detroit" };
  if (at.status !== "found") return { action: "none", reason: at.status === "ambiguous" ? "two_polygons" : at.status, detail: at.names ? at.names.join(" / ") : undefined };
  if (!storedCityIsDetroit) return { action: "none", reason: "inside_detroit_but_city_says_otherwise", polygon: at.name, detail: venue.city || "(no city)" };
  const byParcel = !!options.parcelPolygon;
  const polygon = byParcel ? options.parcelPolygon : at.name;
  if (!byParcel && at.edgeMeters < MIN_EDGE_METERS) return { action: "none", reason: "near_boundary", polygon, edgeMeters: at.edgeMeters };
  const mapped = labelForCityName(polygon, labelNames);
  if (mapped.action === "hold") return { action: "none", reason: "held_for_reconciliation", polygon, pending: mapped.pendingLabel, byParcel };
  if (mapped.action === "create" && !options.createLabels) return { action: "none", reason: "no_label_for_polygon", polygon, byParcel };
  if (owner === "pass" && current === mapped.label) return { action: "keep", label: mapped.label, polygon };
  return { action: "assign", label: mapped.label, polygon, create: mapped.action === "create", edgeMeters: at.edgeMeters, byParcel };
}

// ----------------------------------------------------------------- database

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

async function patchVenue(SUPABASE_URL, sbHeaders, fetchFn, id, guard, body) {
  const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/venues?id=eq.${encodeURIComponent(id)}${guard}`, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
  const changed = await resp.json().catch(() => null);
  // An empty answer means the guard did not match: someone changed the row first.
  return { ok: true, changed: changed === null || (Array.isArray(changed) && changed.length > 0) };
}

// GUARDS. Every write names what was read; if a person has changed any of it
// since, the filter matches no row and nothing is written.
const NO_POINT = "&or=(lat.is.null,lng.is.null)";
// The notes exactly as read (null stays null: an empty string is not "nothing").
// A column exactly as read.
const same = (column, value) => (value === null || value === undefined ? `&${column}=is.null` : `&${column}=eq.${encodeURIComponent(value)}`);
const sameNotes = (text) => (text === null || text === undefined ? "&neighborhood_source=is.null" : `&neighborhood_source=eq.${encodeURIComponent(text)}`);

// The label's id, creating the row when the City's name has none yet.
async function labelId(SUPABASE_URL, sbHeaders, fetchFn, labels, name, polygon) {
  const existing = labels.find((l) => l.name === name);
  if (existing) return existing.id;
  const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/neighborhoods?on_conflict=name`, {
    method: "POST",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify([{ name, area_note: null, is_district: false }]),
  });
  if (!resp.ok) throw new Error(`could not create the neighborhood "${name}": HTTP ${resp.status}`);
  let created = await resp.json().catch(() => null);
  if (!Array.isArray(created) || !created.length) {
    const again = await fetchFn(`${SUPABASE_URL}/rest/v1/neighborhoods?name=eq.${encodeURIComponent(name)}&select=id,name`, { headers: sbHeaders });
    created = again.ok ? await again.json().catch(() => []) : [];
  }
  if (!Array.isArray(created) || !created[0] || !created[0].id) throw new Error(`could not read back the neighborhood "${name}"`);
  labels.push({ id: created[0].id, name });
  return created[0].id;
}

// ----------------------------------------------------------------- the pass

async function inBatches(items, size, worker) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(worker));
}

async function runVenueGeography({
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  dryRun = isOn(process.env.VENUE_GEOGRAPHY_DRY_RUN),
  fetchFn = fetch,
  geocodeFn = geocodeAddress,
  parcelFn = findParcel,
  geography = null,
  createLabels = false,
  maxGeocodes = MAX_GEOCODES_PER_RUN,
  maxParcelLookups = MAX_PARCEL_LOOKUPS_PER_RUN,
  budgetMs = GEOCODE_BUDGET_MS,
  parcelBudgetMs = PARCEL_BUDGET_MS,
  today = todayIso(),
  now = Date.now,
  logger = console,
} = {}) {
  const counts = {
    dryRun,
    venues: 0,
    placeholders: 0,
    alreadyHadCoordinates: 0,
    eligibleForGeocoding: 0,
    geocoded: 0,
    deferredToNextRun: 0,
    notGeocoded: {},
    insideDetroit: 0,
    outsideDetroit: 0,
    assigned: 0,
    kept: 0,
    labelsCreated: [],
    protectedByPerson: 0,
    protectedAgree: 0,
    protectedDiffer: [],
    noNeighborhood: {},
    parcels: { asked: 0, settled: 0, notSettled: {}, unavailable: 0 },
    failed: 0,
    writtenIds: [],
    detail: [],
  };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const geo = geography || loadGeography();
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  // Copies: the pass notes on each venue what it has learned this run.
  const venues = (await readAll(SUPABASE_URL, sbHeaders, fetchFn, "venues?select=id,name,address,city,zip_code,lat,lng,neighborhood_id,neighborhood_confidence,neighborhood_source&order=id.asc", "venues")).map((row) => ({ ...row }));
  const labels = (await readAll(SUPABASE_URL, sbHeaders, fetchFn, "neighborhoods?select=id,name&order=name.asc", "neighborhoods")).map((l) => ({ id: l.id, name: l.name }));
  const labelById = new Map(labels.map((l) => [l.id, l.name]));
  counts.venues = venues.length;
  const bump = (bucket, key) => { bucket[key] = (bucket[key] || 0) + 1; };
  const wrote = (id) => { if (!counts.writtenIds.includes(id)) counts.writtenIds.push(id); };

  // ---- 1. coordinates
  const real = venues.filter((v) => {
    const placeholder = isPlaceholderVenueName(v.name) || /^(?:venue|location) tba\b/i.test(String(v.name || "").trim()) || /^multiple locations$/i.test(String(v.name || "").trim());
    if (placeholder) counts.placeholders++;
    return !placeholder;
  });
  const hasPoint = (v) => typeof v.lat === "number" && typeof v.lng === "number";
  const needing = real.filter((v) => !hasPoint(v));
  counts.alreadyHadCoordinates = real.length - needing.length;

  // What the venue's PUBLIC events state, for the venues that have no address
  // of their own. (An unreviewed submission does not place a venue.)
  const eventPlaces = new Map();
  const withoutAddress = needing.filter((v) => isBlank(v.address)).map((v) => v.id);
  for (let i = 0; i < withoutAddress.length; i += 60) {
    const ids = withoutAddress.slice(i, i + 60).map((id) => `"${id}"`).join(",");
    const rows = await readAll(SUPABASE_URL, sbHeaders, fetchFn, `events?venue_id=in.(${ids})&status=eq.approved&venue_address_raw=not.is.null&select=venue_id,venue_address_raw,venue_city_raw&order=id.asc`, "the venues' events");
    for (const row of rows) {
      if (!eventPlaces.has(row.venue_id)) eventPlaces.set(row.venue_id, []);
      eventPlaces.get(row.venue_id).push({ address: row.venue_address_raw, city: row.venue_city_raw });
    }
  }

  // The pass's own assignment came from coordinates. If they are gone (a
  // person cleared them to have a corrected address looked up again), the
  // assignment is withdrawn before anything else: it must not outlive the
  // point it was read from.
  for (const venue of needing) {
    if (ownerOf(venue, labelById) !== "pass") continue;
    const notes = geographyLine({ none: "coordinates_removed" }, today);
    counts.detail.push({ id: venue.id, name: venue.name, step: "neighborhood", outcome: "withdrawn_coordinates_removed" });
    if (dryRun) { Object.assign(venue, { neighborhood_id: null, neighborhood_confidence: "unconfirmed", neighborhood_source: notes }); continue; }
    const guard = NO_POINT + `&neighborhood_id=eq.${encodeURIComponent(venue.neighborhood_id)}&neighborhood_confidence=eq.geographic` + sameNotes(venue.neighborhood_source);
    const result = await patchVenue(SUPABASE_URL, sbHeaders, fetchFn, venue.id, guard, { neighborhood_id: null, neighborhood_confidence: "unconfirmed", neighborhood_source: notes });
    if (result.ok && result.changed) { wrote(venue.id); Object.assign(venue, { neighborhood_id: null, neighborhood_confidence: "unconfirmed", neighborhood_source: notes }); }
    else { if (!result.ok) counts.failed++; venue._skip = true; } // someone changed it meanwhile: leave the venue alone this run
  }

  const toAsk = [];
  for (const venue of needing) {
    if (venue._skip) continue;
    const choice = chooseAddress(venue, eventPlaces.get(venue.id));
    const entry = { id: venue.id, name: venue.name };
    if (choice.status !== "ok") {
      bump(counts.notGeocoded, choice.status);
      counts.detail.push({ ...entry, step: "address", outcome: choice.status, detail: choice.detail });
      continue;
    }
    counts.eligibleForGeocoding++;
    // Asked before, about this same address, and not placed: not asked again.
    const line = readGeographyLine(venue.neighborhood_source);
    if (line && line.address === clean(choice.asked) && NOT_PLACED.has(line.none)) {
      bump(counts.notGeocoded, `${line.none}_before`);
      continue;
    }
    toAsk.push({ venue, choice });
  }

  // One address, one question: venues that share an address ("Fox Theatre",
  // "Fox Theatre Detroit") share the answer.
  const answers = new Map();
  const ask = (choice) => {
    const key = `${choice.asked} | ${choice.zip || ""}`;
    if (!answers.has(key)) answers.set(key, geocodeFn({ street: choice.street, city: choice.city, state: choice.state, zip: choice.zip }));
    return answers.get(key);
  };
  const started = now();
  // The cap counts questions, not venues.
  const asking = [];
  const questions = new Set();
  for (const item of toAsk) {
    const key = `${item.choice.asked} | ${item.choice.zip || ""}`;
    if (!questions.has(key) && questions.size >= Math.max(0, maxGeocodes)) continue;
    questions.add(key);
    asking.push(item);
  }
  counts.deferredToNextRun = toAsk.length - asking.length;
  await inBatches(asking, GEOCODE_CONCURRENCY, async ({ venue, choice }) => {
    const entry = { id: venue.id, name: venue.name, asked: choice.asked, addressFrom: choice.from };
    if (now() - started > budgetMs) { counts.deferredToNextRun++; return; }
    let answer = await ask(choice);
    if (answer.status === "match") {
      const verdict = matchIsTheAddressAsked(choice.parsed, answer.matchedAddresses || answer.matchedAddress, { onFile: choice.zip, matched: answer.zip });
      if (verdict !== "yes") answer = { status: verdict, detail: answer.matchedAddress };
    }
    if (answer.status === "error") {
      // The geocoder did not answer. Nothing is recorded; tried again next run.
      bump(counts.notGeocoded, "geocoder_unavailable");
      counts.detail.push({ ...entry, step: "geocode", outcome: "geocoder_unavailable", detail: answer.detail });
      return;
    }
    if (answer.status !== "match") {
      bump(counts.notGeocoded, answer.status);
      counts.detail.push({ ...entry, step: "geocode", outcome: answer.status, detail: answer.detail });
      // Remembered on the venue, as one line after whatever its source
      // notes already say, so that this address is not asked about again.
      if (!dryRun) {
        const notes = withGeographyLine(venue.neighborhood_source, geographyLine({ none: answer.status, address: choice.asked }, today));
        const result = await patchVenue(SUPABASE_URL, sbHeaders, fetchFn, venue.id, NO_POINT + sameNotes(venue.neighborhood_source), { neighborhood_source: notes });
        if (result.ok && result.changed) { wrote(venue.id); venue.neighborhood_source = notes; } else if (!result.ok) counts.failed++;
      }
      return;
    }
    counts.geocoded++;
    venue.lat = answer.lat;
    venue.lng = answer.lng;
    venue._asked = choice.asked;
    venue._new = true;
    counts.detail.push({ ...entry, step: "geocode", outcome: "match", lat: answer.lat, lng: answer.lng, matched: answer.matchedAddress });
    if (!dryRun) {
      // ...and only if the venue's address and city are still the ones that were asked about.
      const result = await patchVenue(SUPABASE_URL, sbHeaders, fetchFn, venue.id, NO_POINT + same("address", venue.address) + same("city", venue.city), { lat: answer.lat, lng: answer.lng });
      if (result.ok && result.changed) wrote(venue.id);
      else { if (!result.ok) counts.failed++; venue._unsaved = true; }
    }
  });

  // ---- 2. neighborhood, for every venue that has coordinates
  const parcelStarted = now();
  const withoutDate = (line) => String(line || "").replace(/ \| at=\d{4}-\d{2}-\d{2}$/, "");
  for (const venue of real) {
    if (!hasPoint(venue) || venue._unsaved) continue;
    const entry = { id: venue.id, name: venue.name };
    let decision = decide(venue, geo, labels, { createLabels });
    if (geo.insideDetroit(venue.lat, venue.lng)) counts.insideDetroit++; else counts.outsideDetroit++;
    const before = readGeographyLine(venue.neighborhood_source) || {};
    const asked = venue._asked || before.address || null;
    const point = pointText(venue.lat, venue.lng);

    if (decision.action === "protected") {
      counts.protectedByPerson++;
      if (decision.agrees === true) counts.protectedAgree++;
      else if (decision.current) counts.protectedDiffer.push({ ...entry, assigned: decision.current, city: decision.cityPolygon || decision.where, edgeMeters: decision.edgeMeters, pending: decision.pending || undefined });
      continue;
    }

    let parcelFor = null;
    // On a boundary: the City's parcel record for the address, asked once.
    // The address is the venue's own as it stands now; failing that, the one
    // its coordinates came from.
    let parcelIds = null;
    let parcelNote = null;
    if (decision.action === "none" && decision.reason === "near_boundary") {
      const street = parseStreet(venue.address) || parseStreet(asked);
      const question = street ? `${street.text} @ ${point}` : null;
      const sameQuestion = !!question && before.point === point && before.parcel_for === clean(street.text);
      let parcelPolygon = null;
      if (sameQuestion && before.by === "parcel" && before.polygon) {
        parcelPolygon = before.polygon; // settled on an earlier run
        parcelIds = before.parcel || null;
      } else if (sameQuestion && before.none === "near_boundary" && before.parcel) {
        parcelNote = before.parcel; // asked on an earlier run; it did not settle it
      } else if (street && parcelFn && counts.parcels.asked < maxParcelLookups && now() - parcelStarted <= parcelBudgetMs) {
        counts.parcels.asked++;
        const answer = await parcelFn(street, geo, { point: { lat: venue.lat, lng: venue.lng }, maxMetersFromPolygon: MIN_EDGE_METERS });
        if (answer.status === "settled") {
          counts.parcels.settled++;
          parcelPolygon = answer.polygon;
          parcelIds = answer.parcelIds.join("+");
        } else if (answer.status === "not_settled") {
          bump(counts.parcels.notSettled, answer.reason);
          parcelNote = answer.reason;
        } else {
          counts.parcels.unavailable++; // nothing concluded; asked again next run
        }
        counts.detail.push({ ...entry, step: "parcel", outcome: answer.status === "settled" ? "settled" : answer.reason || "unavailable", polygon: answer.polygon, parcelIds: answer.parcelIds, detail: answer.detail });
      }
      parcelFor = street && (parcelPolygon || parcelNote) ? street.text : null;
      if (parcelPolygon) decision = decide(venue, geo, labels, { createLabels, parcelPolygon });
    }
    if (decision.action === "keep") { counts.kept++; continue; }

    const by = decision.byParcel ? "parcel" : null;
    let body;
    if (decision.action === "assign") {
      body = { neighborhood_confidence: "geographic", neighborhood_source: geographyLine({ polygon: decision.polygon, label: decision.label, by, parcel: by ? parcelIds : null, parcel_for: by ? parcelFor : null, point, address: asked }, today) };
    } else {
      bump(counts.noNeighborhood, decision.reason);
      const line = geographyLine({ none: decision.reason, polygon: decision.polygon, pending: decision.pending, by, parcel: by ? parcelIds : parcelNote, parcel_for: parcelFor, edge_m: decision.reason === "near_boundary" ? decision.edgeMeters : null, point, address: asked }, today);
      body = { neighborhood_id: null, neighborhood_confidence: "unconfirmed", neighborhood_source: line };
      // Nothing new to say: the venue already carries exactly this conclusion.
      if (!venue.neighborhood_id && withoutDate(line) === withoutDate(String(venue.neighborhood_source || "").split("\n").filter(isOwnLine).pop())) continue;
    }
    counts.detail.push({ ...entry, step: "neighborhood", outcome: decision.action === "assign" ? "assign" : decision.reason, label: decision.label, polygon: decision.polygon, pending: decision.pending, newLabel: decision.create || undefined, byParcel: decision.byParcel || undefined, edgeMeters: decision.edgeMeters });
    if (decision.action === "assign") {
      counts.assigned++;
      if (decision.create && !counts.labelsCreated.includes(decision.label)) counts.labelsCreated.push(decision.label);
    }
    if (dryRun) continue;
    try {
      if (decision.action === "assign") body.neighborhood_id = await labelId(SUPABASE_URL, sbHeaders, fetchFn, labels, decision.label, decision.polygon);
      // Guarded on what was read: a venue someone gave a neighborhood in the
      // meantime is left exactly as they left it.
      const guard = (venue.neighborhood_id ? `&neighborhood_id=eq.${encodeURIComponent(venue.neighborhood_id)}&neighborhood_confidence=eq.geographic` : "&neighborhood_id=is.null&neighborhood_confidence=in.(unconfirmed,geographic)") + sameNotes(venue.neighborhood_source);
      const result = await patchVenue(SUPABASE_URL, sbHeaders, fetchFn, venue.id, guard, body);
      if (result.ok && result.changed) wrote(venue.id);
      else if (!result.ok) { counts.failed++; counts.detail.push({ ...entry, step: "write", error: result.error }); }
    } catch (err) {
      counts.failed++;
      counts.detail.push({ ...entry, step: "write", error: err.message });
    }
  }
  counts.labelsCreated.sort();
  return counts;
}

module.exports = {
  runVenueGeography, chooseAddress, parseStreet, sameStreet, streetPart, matchIsTheAddressAsked, decide, ownerOf,
  geographyLine, readGeographyLine, withGeographyLine, hasPersonsText, LINE_TAG, MIN_EDGE_METERS, MAX_GEOCODES_PER_RUN, nameKey,
};

if (require.main === module) {
  runVenueGeography({ dryRun: process.argv.includes("--dry-run") || isOn(process.env.VENUE_GEOGRAPHY_DRY_RUN) })
    .then((c) => { console.log(JSON.stringify(c, null, 2)); })
    .catch((e) => { console.error(e); process.exit(1); });
}
