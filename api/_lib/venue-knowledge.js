"use strict";

// api/_lib/venue-knowledge.js — WHAT 313.EVENTS KNOWS ABOUT A VENUE, AND HOW
// IT KNOWS IT (Issue #49, Admin Hardening, 2026-10-09).
//
// Before this file, the "learned" venue tier (SH.1 tier C) read the 500
// most recently UPDATED address-bearing events and learned from any of them,
// whatever their source, leaving no trace. Measured in production on
// 2026-10-09: 500 of 2,470 address rows, a window that began at 08:00 UTC
// that day. Tigris (row 1,184), Traverse City Whiskey Co. Outpost (1,340+)
// and The Vault 313 (1,526+) were never seen, so their events kept asking a
// person for an address 313.events already held.
//
// This module replaces that window with a deterministic reading of EVERY
// eligible record, and states for each venue name what is known, from which
// sources, and whether that is enough to act on without a person.
//
// EVIDENCE. An evidence row is an approved event that names a real place
// (not a placeholder, secret, multiple-location, online, mobile or street-
// segment name, see exclusionReason) and states a street address (one house
// number on one named street, api/_lib/street-address.js) and a city. Rows
// this system filled itself (internal_note carries VENUE_KNOWLEDGE_FILLED)
// are never evidence: a copy is not a statement.
//
// INDEPENDENCE. Rows are grouped by the SOURCE they came from, not counted
// one by one: every Resident Advisor row is one source, every row of one ICS
// feed is one source (feed_source_id), every row of one connector is one
// source (api/_lib/source-health.js attributeEvent). Product Owner,
// 2026-10-09: "two rows derived from the same underlying source count as ONE
// source"; "repeated copies of one bad source do not constitute independent
// evidence". Connectors that fill a blank address from this knowledge AT
// INGESTION (ICS feeds, Metro Times) cannot mark the rows they fill, so
// their rows may be copies: they can BLOCK knowledge (a disagreement is a
// disagreement) but never CORROBORATE it.
//
// TRUST. A venue name's address and city are trusted, and may fill a blank
// event field without a person, only when:
//   canonical          a canonical venues row of exactly that name has a
//                      street address and no evidence row disputes it. ("May
//                      be reused without requiring two new sources.")
//   learned            two or more independent sources state the same street
//                      and the same city, and no evidence row disputes it.
//   learned_first_party the place's (or its organiser's) own connector states
//                      it on two or more dates, and nothing disputes it.
//   learned_campus     "<X> Campus, <building>" from ONE first-party source:
//                      every building of that campus that source addresses
//                      is at one street address, on two or more dates.
// Everything else is not acted on automatically:
//   single_source      one non-first-party source states it (however many
//                      times): a person confirms it ONCE, at venue level.
//   conflict           sources state different streets in one city.
//   canonical_conflict the canonical record disagrees with the events' own
//                      statements (city or street): Needs Decision.
//   ambiguous          one name, different municipalities ("Community
//                      Center"): never inherited.
//
// APPLYING IT (resolveLocationGap). Event-specific evidence always beats a
// venue default: only BLANK address/city fields are ever filled; an event
// whose own city or street disagrees with the knowledge is a conflict, never
// moved to another municipality; an excluded name never inherits a fixed
// address. Nothing here writes anything, changes a status or creates a
// venue. It is pure: rows in, decisions out.

const path = require("path");
const { normalizeVenueName, normalizeCityForCompare, citiesConflict, isPlaceholderVenueName } = require(path.join(__dirname, "venue-lookup"));
const { parseStreet, sameStreet } = require(path.join(__dirname, "street-address"));
const { attributeEvent } = require(path.join(__dirname, "source-health"));
const { knownCity } = require(path.join(__dirname, "orbit-cities"));

const FILL_MARKER = "VENUE_KNOWLEDGE_FILLED";
const MIN_FIRST_PARTY_DATES = 2;
const MIN_INDEPENDENT_SOURCES = 2;
// "canonical_partial": a canonical venue with a city and no street address.
// It may give a linked (or exactly named) event its city and its link, as it
// always has, never a street.
const TRUSTED = new Set(["canonical", "canonical_partial", "learned", "learned_first_party", "learned_campus"]);

// Listings sites, ticket sellers and news outlets compile other people's
// events. The same list scripts/venues-from-stated-places.js has always used.
const NOT_FIRST_PARTY = /visit\s*detroit|metro\s*times|resident\s*advisor|ticketmaster|eventbrite|\bdice\b|19hz|\bwdet\b|editorial review/i;
const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const isFirstParty = (source) => !isBlank(source) && !NOT_FIRST_PARTY.test(String(source));

// Sources whose stored addresses may be OUR copies rather than their own
// statements, so they may block knowledge but never corroborate it:
//   - ICS feeds and Metro Times fill a blank address from venue knowledge
//     while ingesting, without a mark on the row (api/cron-feeds.js,
//     api/cron-metrotimes.js);
//   - Ticketmaster sends venue_address_raw: null on every run (DEBT-011), so
//     every address on a Ticketmaster row was written by a repair. Measured
//     2026-10-09: 423 of 1,060 Ticketmaster rows carry one.
const COPY_PRONE = (family) => family.startsWith("feed:") || family === "metrotimes" || family === "ticketmaster";

// ---------------------------------------------------------------------------
// Names that must never inherit a fixed address.
const TBA = /\b(?:tba|tbd|tbc|to be (?:announced|determined|confirmed))\b/i;
const SECRET = /\bsecret\b|revealed to ticket|address (?:provided|given|released|sent)|private (?:residence|location|address)|undisclosed/i;
const MULTIPLE = /\bmultiple (?:locations|venues|sites)\b|\bvarious (?:locations|venues|sites)\b|\bseveral locations\b|\bcity-?wide\b|\bmultiple stages across\b/i;
const ONLINE = /\b(?:online|virtual|zoom|webinar|livestream|live stream|facebook live)\b/i;
const MOBILE = /\b(?:pub|bar|art) crawl\b|\bfood trucks?\b|\bmobile (?:event|unit)\b|\bbus tour\b|\bboat (?:tour|cruise)\b/i;
const STREET_WORD = "(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|highway|hwy|parkway|pkwy|lane|ln|way)";
const STREET_SEGMENT = new RegExp(`^[\\p{L} .'-]+\\s${STREET_WORD}\\.?(?:\\s*\\(.*\\))?$`, "iu");

// exclusionReason(name, event) -> null | "tba" | "secret" | "multiple_locations"
//   | "online" | "mobile" | "street_segment"
function exclusionReason(name, event) {
  if (event && event.no_fixed_venue === true) return "mobile";
  const text = String(name || "").replace(/&[a-z]+;|&#\d+;/gi, " ").trim();
  if (!text) return null;
  if (isPlaceholderVenueName(text) || TBA.test(text)) return "tba";
  if (SECRET.test(text)) return "secret";
  if (MULTIPLE.test(text)) return "multiple_locations";
  if (ONLINE.test(text)) return "online";
  if (MOBILE.test(text)) return "mobile";
  // "Pelissier Street (between Wyandotte & Park)", "Woodward Avenue": a
  // stretch of street with no house number is not one address.
  if (/\bbetween\b.+\b(?:and|&)\b/i.test(text) && !/\d/.test(text)) return "street_segment";
  if (!/\d/.test(text) && STREET_SEGMENT.test(text)) return "street_segment";
  return null;
}

// ---------------------------------------------------------------------------
// Source identity. One key per independent source.
// Rows written without the connector's id prefix (older imports, manual
// research) are still that source when the source names it: "Resident
// Advisor", "Paxahau / Resident Advisor" and "ra-2514324" are one source.
const NAMED_FAMILIES = [
  [/resident\s*advisor/i, "resident-advisor"],
  [/ticketmaster/i, "ticketmaster"],
  [/visit\s*detroit/i, "visitdetroit"],
  [/eventbrite/i, "eventbrite-org"],
  [/metro\s*times/i, "metrotimes"],
];
function sourceFamily(e) {
  const slug = attributeEvent(e || {});
  if (slug === "feeds") return `feed:${e.feed_source_id || "unknown"}`;
  if (slug) return slug;
  const src = String((e && e.source) || "").trim().toLowerCase().replace(/\s+/g, " ");
  for (const [re, family] of NAMED_FAMILIES) if (re.test(src)) return family;
  return `source:${src || "unknown"}`;
}

// A city as stated, or null when the text is not one ("West", "48216",
// "2810 Russell St." -- parser debris in the city field).
const NOT_A_CITY = /^(?:north|south|east|west|n|s|e|w|mi|oh|on|michigan|ohio|ontario|usa|us|canada|united states)$/i;
function cityText(city) {
  const head = String(city || "").split(",")[0].trim().replace(/\s+/g, " ");
  if (!head) return null;
  const known = knownCity(head, "MI") || knownCity(head, "OH");
  if (known) return known;
  if (NOT_A_CITY.test(head) || !/^[\p{L}][\p{L} .'-]{1,40}$/u.test(head)) return null;
  return head;
}

function hasFillMarker(e) {
  return e && (e.kfill === true || (typeof e.internal_note === "string" && e.internal_note.includes(FILL_MARKER)));
}

// One row's statement, or null if it is not evidence.
function statementOf(e) {
  if (!e || (e.status && e.status !== "approved")) return null;
  if (hasFillMarker(e)) return null;
  const name = e.venue_name_raw;
  if (isBlank(name) || exclusionReason(name, e)) return null;
  if (parseStreet(name)) return null; // "10037 Joseph Campau, Hamtramck": an address in the name field, not a venue
  const street = parseStreet(e.venue_address_raw);
  const cityKey = normalizeCityForCompare(cityText(e.venue_city_raw));
  if (!street || !cityKey) return null;
  return { street, cityKey, address: String(e.venue_address_raw).trim(), city: cityText(e.venue_city_raw) };
}

// The spelling most rows use; ties go to the shorter, then to plain order.
function commonest(values) {
  const counts = new Map();
  for (const v of values) if (!isBlank(v)) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1)).map(([v]) => v)[0] || null;
}

// Summarise a set of evidence rows into a knowledge decision.
// rows: [{ e, s }] (event, its statement). canonical: venue row or null.
function decide(rows, canonical) {
  const families = new Map();
  for (const { e, s } of rows) {
    const f = sourceFamily(e);
    if (!families.has(f)) families.set(f, { family: f, label: e.source || f, firstParty: true, rows: 0, dates: new Set(), ids: [], statements: [] });
    const fam = families.get(f);
    fam.rows++;
    if (e.start_date) fam.dates.add(e.start_date);
    if (fam.ids.length < 5) fam.ids.push(e.id);
    if (!isFirstParty(e.source)) fam.firstParty = false;
    fam.statements.push(s);
  }
  const familyList = [...families.values()].map((f) => ({
    family: f.family, label: f.label, firstParty: f.firstParty, rows: f.rows, dates: f.dates.size, sampleIds: f.ids,
    corroborates: !COPY_PRONE(f.family),
  })).sort((a, b) => b.rows - a.rows || (a.family < b.family ? -1 : 1));
  const evidence = { rows: rows.length, sources: familyList };

  const canonicalStreet = canonical ? parseStreet(canonical.address) : null;
  const canonicalCity = canonical ? normalizeCityForCompare(cityText(canonical.city)) : "";

  // Does every statement agree with the first (or with the canonical record)?
  const anchor = canonicalStreet ? { street: canonicalStreet, cityKey: canonicalCity } : rows.length ? rows[0].s : null;
  const cityKeys = new Set(rows.map((r) => r.s.cityKey));
  const disagreements = [];
  for (const { e, s } of rows) {
    if (!anchor) break;
    const cityDiffers = anchor.cityKey && s.cityKey !== anchor.cityKey;
    const streetDiffers = !sameStreet(anchor.street, s.street);
    const seen = disagreements.some((d) => d.address === s.address && d.city === s.city);
    if ((cityDiffers || streetDiffers) && !seen) disagreements.push({ id: e.id, source: e.source, address: s.address, city: s.city, cityDiffers: !!cityDiffers, streetDiffers });
  }

  if (canonicalStreet) {
    const base = { address: canonical.address, city: canonical.city || null, venueId: canonical.id, evidence };
    if (disagreements.length) return { ...base, status: "canonical_conflict", disagreements: disagreements.slice(0, 10) };
    return { ...base, status: "canonical" };
  }

  const partial = canonical && !isBlank(canonical.city)
    ? { status: "canonical_partial", address: null, city: canonical.city, venueId: canonical.id, name: canonical.name, evidence }
    : null;
  if (!rows.length) return partial;
  if (disagreements.length) {
    const status = cityKeys.size > 1 ? "ambiguous" : "conflict";
    const out = { status, address: null, city: null, venueId: canonical ? canonical.id : null, evidence, disagreements: disagreements.slice(0, 10) };
    // Sources that disagree only on the STREET, in the canonical record's own
    // city, leave that city undisputed: a linked event keeps the record's city
    // (and its link), as before #49, and never gets either street.
    if (status === "conflict" && partial && normalizeCityForCompare(cityText(canonical.city)) === [...cityKeys][0]) out.fallback = partial;
    return out;
  }
  // A canonical record without a street, whose city contradicts every statement.
  if (canonical && canonicalCity && canonicalCity !== rows[0].s.cityKey) {
    return {
      status: "canonical_conflict", address: commonest(rows.map((r) => r.s.address)), city: commonest(rows.map((r) => r.s.city)),
      venueId: canonical.id, evidence, disagreements: [{ id: null, source: "canonical venue record", address: canonical.address || null, city: canonical.city, cityDiffers: true, streetDiffers: false }],
    };
  }
  const address = commonest(rows.map((r) => r.s.address));
  const city = commonest(rows.map((r) => r.s.city));
  const corroborating = familyList.filter((f) => f.corroborates);
  let status = "single_source";
  if (corroborating.length >= MIN_INDEPENDENT_SOURCES) status = "learned";
  else if (corroborating.length === 1 && corroborating[0].firstParty && corroborating[0].dates >= MIN_FIRST_PARTY_DATES) status = "learned_first_party";
  const out = { status, address, city, venueId: canonical ? canonical.id : null, canonicalGap: !!canonical, evidence };
  if (partial && !TRUSTED.has(status)) out.fallback = partial;
  return out;
}

// "Center Campus, Macomb Regional APEX Accelerator" -> "center campus".
const CAMPUS = /^(.{2,60}?\bcampus)\s*[,–—-]\s*(.+)$/i;
function campusKeyOf(name) {
  const m = CAMPUS.exec(String(name || "").trim());
  return m ? normalizeVenueName(m[1]) : null;
}

// buildVenueKnowledge({ events, venues }) -> {
//   byName: Map<normalized name, entry>, byCampus: Map<"family|campus", entry>,
//   byVenueId: Map<venue id, entry>, entries: [entry] }
// entry: { key, name, status, address, city, venueId, canonicalGap?, evidence, disagreements? }
function buildVenueKnowledge({ events = [], venues = [] } = {}) {
  const canonicalByName = new Map();
  const canonicalById = new Map();
  for (const v of venues || []) {
    if (!v || !v.id) continue;
    canonicalById.set(v.id, v);
    const key = normalizeVenueName(v.name);
    if (!key) continue;
    canonicalByName.set(key, canonicalByName.has(key) ? null : v); // two of one name: ambiguous
  }

  const byNameRows = new Map();
  const byVenueRows = new Map();
  const campusRows = new Map();
  for (const e of events || []) {
    const s = statementOf(e);
    if (!s) continue;
    const key = normalizeVenueName(e.venue_name_raw);
    if (!byNameRows.has(key)) byNameRows.set(key, []);
    byNameRows.get(key).push({ e, s });
    if (e.venue_id) {
      if (!byVenueRows.has(e.venue_id)) byVenueRows.set(e.venue_id, []);
      byVenueRows.get(e.venue_id).push({ e, s });
    }
    const campus = campusKeyOf(e.venue_name_raw);
    if (campus && isFirstParty(e.source)) {
      const ck = `${sourceFamily(e)}|${campus}`;
      if (!campusRows.has(ck)) campusRows.set(ck, []);
      campusRows.get(ck).push({ e, s });
    }
  }

  const byName = new Map();
  const entries = [];
  const names = new Set([...byNameRows.keys(), ...canonicalByName.keys()]);
  for (const key of [...names].sort()) {
    const canonical = canonicalByName.has(key) ? canonicalByName.get(key) : undefined;
    if (canonical === null) {
      const entry = { key, name: key, status: "ambiguous", address: null, city: null, venueId: null, evidence: { rows: (byNameRows.get(key) || []).length, sources: [] }, reason: "two canonical venues share this name" };
      byName.set(key, entry); entries.push(entry); continue;
    }
    const venueName = canonical ? canonical.name : null;
    if (exclusionReason(venueName || key)) continue;
    // A canonical venue's own linked events are evidence about it too.
    const rows = [...(byNameRows.get(key) || [])];
    if (canonical) for (const r of byVenueRows.get(canonical.id) || []) if (!rows.includes(r)) rows.push(r);
    const decided = decide(rows, canonical || null);
    if (!decided) continue;
    const display = venueName || commonest((byNameRows.get(key) || []).map((r) => String(r.e.venue_name_raw).trim())) || key;
    const entry = { key, name: display, ...decided };
    byName.set(key, entry);
    entries.push(entry);
  }

  // Canonical venues whose name no event uses, keyed by id (tier A).
  const byVenueId = new Map();
  for (const [id, v] of canonicalById) {
    const key = normalizeVenueName(v.name);
    const named = key ? byName.get(key) : null;
    if (named && named.venueId === id) { byVenueId.set(id, named); continue; }
    if (exclusionReason(v.name)) continue;
    const rows = byVenueRows.get(id) || [];
    const decided = decide(rows, v);
    if (decided) {
      const entry = { key: key || id, name: v.name, ...decided };
      byVenueId.set(id, entry);
      if (!named) entries.push(entry);
    }
  }

  const byCampus = new Map();
  for (const [ck, rows] of campusRows) {
    const decided = decide(rows, null);
    if (!decided) continue;
    const fam = decided.evidence.sources[0];
    const campusOk = decided.status !== "conflict" && decided.status !== "ambiguous" && decided.evidence.sources.length === 1 && fam.firstParty && fam.dates >= MIN_FIRST_PARTY_DATES;
    const entry = { key: ck, name: ck.split("|")[1], ...decided, status: campusOk ? "learned_campus" : decided.status, campus: true };
    byCampus.set(ck, entry);
    entries.push(entry);
  }

  return { byName, byCampus, byVenueId, entries, canonicalById };
}

// ---------------------------------------------------------------------------
// An address the event's own location text states: "Meet at the Plymouth
// Arts and Recreation Center, 650 Church St. Plymouth, MI". Only a full
// street (number, name, street type) followed by a known city and a state;
// two different addresses in one text are nothing.
const EMBEDDED = new RegExp(
  `(\\d{1,6}\\s+(?:[NSEW]\\.?\\s+)?[\\p{L}][\\p{L}.' ]{0,40}?\\s${STREET_WORD}\\.?)(?:\\s+(?:[NSEW]\\.?))?[,\\s]+([\\p{L}][\\p{L}. ]{1,30}?)[,\\s]+(MI|Mich\\.?|Michigan|OH|Ohio)\\b`,
  "giu"
);
function extractStatedAddress(text) {
  const clean = String(text || "").replace(/&[a-z]+;|&#\d+;/gi, " ").replace(/\s+/g, " ");
  const found = [];
  let m;
  EMBEDDED.lastIndex = 0;
  while ((m = EMBEDDED.exec(clean))) {
    // "Fire Station 2 1019 E Big Beaver Rd": a number just before the house
    // number makes the house number itself uncertain. Nothing.
    if (/\d\s+$/.test(clean.slice(0, m.index))) return null;
    const state = /^o/i.test(m[3]) ? "OH" : "MI";
    const street = parseStreet(m[1]);
    const city = knownCity(m[2].trim(), state); // the city of the state the text states
    if (street && city) found.push({ street, address: street.text, city });
  }
  if (!found.length) return null;
  const first = found[0];
  if (!found.every((f) => sameStreet(f.street, first.street) && normalizeCityForCompare(f.city) === normalizeCityForCompare(first.city))) return null;
  return { address: first.address, city: first.city };
}

// ---------------------------------------------------------------------------
// resolveLocationGap(event, knowledge) -> {
//   action: "none" | "fill" | "conflict" | "confirm" | "excluded" | "unknown",
//   patch: { venue_address_raw?, venue_city_raw?, venue_id? },
//   entry: knowledge entry or null, tier, reason }
function geographyConflict(event, address, city) {
  const ownCity = normalizeCityForCompare(cityText(event.venue_city_raw));
  if (ownCity && city && citiesConflict(ownCity, cityText(city))) return "city";
  const ownStreet = isBlank(event.venue_address_raw) ? null : parseStreet(event.venue_address_raw);
  if (!isBlank(event.venue_address_raw) && address) {
    const kStreet = parseStreet(address);
    if (!ownStreet || !kStreet || !sameStreet(ownStreet, kStreet)) return "street";
  }
  return null;
}

function fillFrom(event, address, city) {
  const patch = {};
  if (isBlank(event.venue_address_raw) && !isBlank(address)) patch.venue_address_raw = address;
  if (isBlank(event.venue_city_raw) && !isBlank(city)) patch.venue_city_raw = city;
  return patch;
}

// knowledge: what buildVenueKnowledge() returns, or any object with
// venueId(id) / name(key) / campus(key) lookups (api/_lib/venue-lookup.js
// adapts the canonical maps every connector already builds to this shape).
function lookupsOf(K) {
  if (!K) return { venueId: () => undefined, name: () => undefined, campus: () => undefined };
  if (typeof K.venueId === "function") return K;
  return {
    venueId: (id) => (K.byVenueId ? K.byVenueId.get(id) : undefined),
    name: (key) => (K.byName ? K.byName.get(key) : undefined),
    campus: (key) => (K.byCampus ? K.byCampus.get(key) : undefined),
  };
}

function resolveLocationGap(event, knowledge) {
  const none = { action: "none", patch: {}, entry: null, tier: null, reason: null };
  if (!event) return none;
  const addressBlank = isBlank(event.venue_address_raw);
  const cityBlank = isBlank(event.venue_city_raw);
  if (!addressBlank && !cityBlank) return none;
  const L = lookupsOf(knowledge);

  const excluded = exclusionReason(event.venue_name_raw, event);
  if (excluded) return { action: "excluded", patch: {}, entry: null, tier: null, reason: excluded };

  const apply = (entry, tier, extra = {}) => {
    if (!TRUSTED.has(entry.status)) {
      // A canonical venue whose address is not yet known: the link (and its
      // city, when nothing disputes it) is still the canonical record's.
      if (entry.fallback) {
        const viaRecord = apply(entry.fallback, tier, extra);
        if (viaRecord.action === "fill") return { ...viaRecord, followUp: entry.status, knowledge: entry };
        if (viaRecord.action === "conflict") return viaRecord;
      }
      const action = entry.status === "single_source" ? "confirm" : entry.status === "ambiguous" ? "excluded" : "conflict";
      return { action, patch: {}, entry, tier, reason: entry.status === "ambiguous" ? "ambiguous_name" : entry.status };
    }
    const clash = geographyConflict(event, entry.address, entry.city);
    if (clash) return { action: "conflict", patch: {}, entry, tier, reason: `event_${clash}_disagrees` };
    const patch = { ...fillFrom(event, entry.address, entry.city), ...extra };
    if (!Object.keys(patch).length) return { action: "none", patch: {}, entry, tier, reason: "nothing_to_fill" };
    return { action: "fill", patch, entry, tier, reason: entry.status };
  };

  const nameKey = normalizeVenueName(event.venue_name_raw);
  if (!isBlank(event.venue_id)) {
    // Tier A: the event's own link. Trust the link or nothing: no name-based
    // tier for a linked event.
    const entry = L.venueId(event.venue_id);
    if (!entry) return { action: "unknown", patch: {}, entry: null, tier: "canonical_venue_id", reason: "linked_venue_unknown" };
    return apply(entry, String(entry.status).startsWith("canonical") ? "canonical_venue_id" : "canonical_gap");
  }
  if (nameKey) {
    const entry = L.name(nameKey);
    if (entry) {
      const link = entry.venueId ? { venue_id: entry.venueId } : {};
      return apply(entry, entry.venueId ? (String(entry.status).startsWith("canonical") ? "canonical_name" : "canonical_gap") : "learned", link);
    }
  }

  // Campus/building, scoped to the event's own (first-party) source.
  const campus = campusKeyOf(event.venue_name_raw);
  if (campus && isFirstParty(event.source)) {
    const entry = L.campus(`${sourceFamily(event)}|${campus}`);
    if (entry) return apply(entry, "campus");
  }

  // The event's own location text states its address.
  const stated = extractStatedAddress(event.venue_name_raw);
  if (stated) {
    const clash = geographyConflict(event, stated.address, stated.city);
    if (clash) return { action: "conflict", patch: {}, entry: null, tier: "stated_in_location", reason: `event_${clash}_disagrees` };
    const patch = fillFrom(event, stated.address, stated.city);
    if (Object.keys(patch).length) {
      const entry = { status: "stated_in_location", name: null, address: stated.address, city: stated.city, evidence: { rows: 1, sources: [{ family: sourceFamily(event), label: event.source, rows: 1 }] } };
      return { action: "fill", patch, entry, tier: "stated_in_location", reason: "stated_in_location" };
    }
  }

  if (isBlank(event.venue_name_raw)) return { action: "unknown", patch: {}, entry: null, tier: null, reason: "no_venue_name" };
  return { action: "unknown", patch: {}, entry: null, tier: null, reason: "no_knowledge" };
}

// One line for internal_note, so a filled field always says where it came from.
function provenanceLine(result, today) {
  const e = result.entry || {};
  const fields = Object.keys(result.patch || {}).join(", ");
  const sources = ((e.evidence && e.evidence.sources) || []).map((s) => `${s.label || s.family}×${s.rows}`).join(", ");
  return `${FILL_MARKER} ${today || new Date().toISOString().slice(0, 10)}: ${fields} from ${result.tier} (${e.status || result.reason})${e.name ? ` for "${e.name}"` : ""}${sources ? `; evidence: ${sources}` : ""}`;
}

// ---------------------------------------------------------------------------
// summarizeVenueRepairs(events, knowledge) -> what venue knowledge would do
// for these (public, upcoming) events, GROUPED BY VENUE: the Control Tower's
// "one decision resolves N events" view. Read-only.
//
// An event has a location gap when the public would see no street address
// (neither its own nor its linked venue's) or no city. For each gap the
// decision is one of:
//   fill      trusted knowledge answers it (automatic, with provenance)
//   confirm   one source states it: a person confirms the VENUE once
//   conflict  the event and the venue knowledge disagree: Needs Decision
//   excluded  TBA / secret / multiple locations / online / mobile / street
//             segment / ambiguous name: never inherits
//   unknown   nothing known about this place
// Venue-level repairs (canonical records to fill or correct) are listed
// separately: they are what makes the fix durable, because a connector that
// re-sends a blank address (Ticketmaster, DEBT-011) cannot erase a venue.
function summarizeVenueRepairs(events, knowledge) {
  const L = lookupsOf(knowledge);
  const groups = new Map();
  const totals = { evaluated: 0, withoutStreetAddress: 0, withoutCity: 0, gaps: 0, fill: 0, confirm: 0, conflict: 0, excluded: 0, unknown: 0, excludedByReason: {}, fillByTier: {} };
  const canonicalRepairs = new Map();
  for (const e of events || []) {
    totals.evaluated++;
    const linked = e.venues && typeof e.venues === "object" ? e.venues : null;
    const noStreet = isBlank(e.venue_address_raw) && !(linked && !isBlank(linked.address));
    const noCity = isBlank(e.venue_city_raw) && !(linked && !isBlank(linked.city));
    if (noStreet) totals.withoutStreetAddress++;
    if (noCity) totals.withoutCity++;
    if (!noStreet && !noCity) continue;
    if (e.no_fixed_venue === true && noStreet) { totals.gaps++; totals.excluded++; totals.excludedByReason.mobile = (totals.excludedByReason.mobile || 0) + 1; continue; }
    totals.gaps++;
    // What the public sees is the event's own field, or its venue's.
    const view = { ...e, venue_address_raw: noStreet ? null : e.venue_address_raw || linked.address, venue_city_raw: noCity ? null : e.venue_city_raw || linked.city };
    const d0 = resolveLocationGap(view, L);
    // A fill that leaves the street missing (a canonical record with a city
    // and no street) has not answered the public's question: what is still
    // open is what the venue knowledge says about the street.
    let d = d0;
    if (d0.action === "fill" && noStreet && !d0.patch.venue_address_raw) {
      const k = d0.knowledge || d0.entry;
      d = { ...d0, action: d0.followUp === "single_source" ? "confirm" : d0.followUp ? "conflict" : "unknown", entry: k, reason: d0.followUp || "no_street_known" };
    }
    if (d.action === "none") d = { ...d, action: noStreet ? (d.entry && d.entry.status === "single_source" ? "confirm" : "unknown") : "fill" };
    const action = d.action;
    totals[action]++;
    if (action === "excluded") totals.excludedByReason[d.reason] = (totals.excludedByReason[d.reason] || 0) + 1;
    if (action === "fill") totals.fillByTier[d.tier] = (totals.fillByTier[d.tier] || 0) + 1;
    const entry = d.entry || null;
    const name = (entry && entry.name) || String(e.venue_name_raw || "(no venue name)").trim();
    const key = `${action}|${entry && entry.key ? entry.key : normalizeVenueName(name)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        venue: name, action, reason: d.reason, tier: d.tier, status: entry ? entry.status : null,
        address: entry ? entry.address || null : null, city: entry ? entry.city || null : null,
        venueId: entry ? entry.venueId || null : null, events: 0, sampleIds: [], sources: new Set(),
        evidence: entry && entry.evidence ? entry.evidence.sources.map((x) => ({ source: x.label || x.family, rows: x.rows, dates: x.dates, corroborates: x.corroborates !== false })) : [],
        disagreements: entry && entry.disagreements ? entry.disagreements.slice(0, 5) : [],
      });
    }
    const g = groups.get(key);
    g.events++;
    if (g.sampleIds.length < 8) g.sampleIds.push(e.id);
    if (e.source) g.sources.add(e.source);
    // The durable, venue-level repair this group points at.
    if (entry && entry.venueId && (entry.status === "canonical_conflict" || entry.canonicalGap)) {
      const kind = entry.status === "canonical_conflict" ? "correct_canonical_record" : TRUSTED.has(entry.status) ? "fill_canonical_address" : "confirm_canonical_address";
      const ck = `${entry.venueId}|${kind}`;
      if (!canonicalRepairs.has(ck)) canonicalRepairs.set(ck, { venueId: entry.venueId, venue: entry.name, kind, address: entry.address || null, city: entry.city || null, events: 0, disagreements: entry.disagreements || [] });
      canonicalRepairs.get(ck).events++;
    }
  }
  const order = { conflict: 0, confirm: 1, fill: 2, unknown: 3, excluded: 4 };
  const byVenue = [...groups.values()]
    .map((g) => ({ ...g, sources: [...g.sources].sort() }))
    .sort((a, b) => order[a.action] - order[b.action] || b.events - a.events || (a.venue < b.venue ? -1 : 1));
  const venuesWith = (action) => byVenue.filter((g) => g.action === action).length;
  totals.venues = { fill: venuesWith("fill"), confirm: venuesWith("confirm"), conflict: venuesWith("conflict"), excluded: venuesWith("excluded"), unknown: venuesWith("unknown") };
  // Canonical records the events' own statements dispute, whether or not an
  // event currently has a gap: the public view shows the record's city
  // ahead of the event's own, so a wrong record misplaces linked events.
  const canonicalConflicts = [];
  for (const entry of (knowledge && knowledge.entries) || []) {
    if (entry.status !== "canonical_conflict") continue;
    const linked = (events || []).filter((e) => e.venue_id === entry.venueId).length;
    canonicalConflicts.push({ venueId: entry.venueId, venue: entry.name, address: entry.address || null, city: entry.city || null, linkedPublicEvents: linked, evidence: entry.evidence.sources.map((x) => ({ source: x.label || x.family, rows: x.rows })), disagreements: (entry.disagreements || []).slice(0, 5) });
  }
  canonicalConflicts.sort((a, b) => b.linkedPublicEvents - a.linkedPublicEvents || (a.venue < b.venue ? -1 : 1));
  return { totals, byVenue, canonicalRepairs: [...canonicalRepairs.values()].sort((a, b) => b.events - a.events), canonicalConflicts };
}

module.exports = {
  buildVenueKnowledge,
  resolveLocationGap,
  summarizeVenueRepairs,
  exclusionReason,
  extractStatedAddress,
  sourceFamily,
  lookupsOf,
  cityText,
  campusKeyOf,
  provenanceLine,
  isFirstParty,
  FILL_MARKER,
  TRUSTED,
  NOT_FIRST_PARTY,
};
