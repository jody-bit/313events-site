// Shared venue_id resolver — added 2026-09-13 to close the "load-bearing
// gap" flagged in FOUNDATIONAL_ITEMS.md §4/§5, DISCOVERY_PHASE1_AUDIT.md
// §1/§2, and AUDIT_AND_ARCHITECTURE.md §D/§G: every cron has only ever
// written venue_name_raw as free text, leaving events.venue_id permanently
// null (confirmed live: 1 row out of 1492) even though 71 of 83 venues
// already carry a real neighborhood_id. This closes that going forward —
// see supabase/update_2026-09-13_backfill_venue_id_matched_venues.sql for
// the one-time historical backfill this doesn't retroactively cover.
//
// Deliberately conservative: this only LINKS to a venue that already
// exists in the `venues` table by exact (case/whitespace-insensitive) name
// match. It never creates a new venue row and never guesses at a fuzzy
// match — an unmatched venue_name_raw just stays venue_id: null, same
// honest-gap convention as every other field in this project (see
// cron-oldmiami.js's "Z" end-time handling, or any cron's "BEST-EFFORT"
// header). New venues are a deliberate, separately-reviewed research task
// (see NEW_SOURCES_RESEARCH.md's own don't-guess-at-geography precedent),
// not something a cron should invent unattended.
//
// Usage in a cron:
//   const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
//   const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
//   ...
//   venue_id: resolveVenueId(venueMap, row.venue_name_raw),

function normalizeVenueName(name) {
  if (typeof name !== "string") return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Fetches every venue once per cron run and returns a Map of normalized
// name -> venue id. Only 83 venues today (bounded, growing slowly by
// hand-reviewed research, not per-event) — a single unpaged fetch is fine
// and avoids a per-row network round trip. Returns an empty Map (never
// throws) on any fetch failure, so a lookup outage degrades to "no venue_id
// this run" rather than failing the whole cron — same fail-soft convention
// as the rest of this project's crons.
async function buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  const map = new Map();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return map;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/venues?select=id,name&limit=1000`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!resp.ok) return map;
    const rows = await resp.json();
    if (!Array.isArray(rows)) return map;
    for (const v of rows) {
      const key = normalizeVenueName(v.name);
      if (key) map.set(key, v.id);
    }
  } catch {
    // Network/parse failure — return whatever's in the map (empty on a
    // first-request failure), never throw out of this helper.
  }
  return map;
}

// Looks up a single venue_name_raw string against the map built above.
// Returns null (not undefined) for "no match" so it can be assigned
// directly to a row's venue_id field and serialize as JSON null rather
// than being dropped from the upsert payload entirely.
function resolveVenueId(venueMap, venueNameRaw) {
  const key = normalizeVenueName(venueNameRaw);
  if (!key) return null;
  return venueMap.get(key) || null;
}


// ---------------------------------------------------------------------------
// SH.1 — Metadata Self-Healing: venue address/city repair (2026-09-21)
//
// Added for WP "SH.1 — Automatically fill missing event venue address/city
// when 313.events already knows the venue" (Metadata Self-Healing discovery,
// approved with refinements 2026-09-21). Extends this file rather than
// creating a new lookup module, per the Product Owner's explicit
// instruction to "inspect and reuse the smallest appropriate existing
// venue-resolution functionality" — buildVenueNameToIdMap/resolveVenueId
// above already solve exact-name -> venue_id matching; what follows reuses
// the same normalizeVenueName() and the same exact-match-only, no-fuzzy
// philosophy, extended to also carry address/city and a learned-historical
// fallback tier.
//
// REPAIR AUTHORITY ORDER (locked design decision, do not reorder):
//   A. event already has venue_id -> use that canonical venue's
//      address/city. Trust the existing link or nothing; never
//      second-guess a linked venue_id by falling back to a name lookup.
//   B. event has no venue_id, but venue_name_raw is an EXACT (normalized)
//      match to a canonical venues row -> use that venue's address/city,
//      and also resolve venue_id itself (this is the one place SH.1 is
//      allowed to fill in venue_id, since an exact canonical name match
//      is itself high-confidence evidence of which venue this is).
//   C. only if neither A nor B produced a canonical match -> fall back to
//      an exact (normalized) name match against historical event data
//      (see buildLearnedVenueAddressCityMap) — the same
//      self-growing-from-past-entries idea already shipped in
//      api/admin-venues.js, reused here for automatic (not
//      human-reviewed) writes, so it is deliberately MORE conservative
//      than admin-venues.js: any name for which the historical data
//      disagrees on the address is treated as unresolved rather than
//      picking the most-recent guess, since nothing here is reviewed by a
//      person before being written.
//   No fuzzy matching anywhere in this file. No external lookups. No
//   geocoding. No generated addresses. No alias inference. An ambiguous or
//   unresolved case is left alone, not guessed at.
//
// SAFETY: resolveVenueAddressCityRepair() below only ever proposes filling
// a field that is currently blank (null/undefined/whitespace-only) on the
// event. It never proposes overwriting a populated venue_address_raw or
// venue_city_raw, and it touches no other event field. Callers are still
// responsible for writing the patch conditionally (see
// scripts/sh1-repair-existing-venue-address-city.js for the
// still-blank-at-write-time PATCH filter pattern used for existing rows).

// A sentinel stored in the byName map returned by buildVenueDetailsMap()
// when two or more canonical venues share the exact same normalized name
// (the schema allows this: venues_name_city_key is a unique index on
// (lower(name), lower(city)), so e.g. "The Loft" in Detroit and "The Loft"
// in Ferndale can both legitimately exist). Any consumer of that map must
// treat this sentinel as "do not use this name for tier B" rather than
// picking either venue.
const AMBIGUOUS_VENUE_NAME = Symbol("ambiguous-canonical-venue-name");

function isBlank(v) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

// Fetches every venue once per run (same bounded, unpaged-fetch reasoning
// as buildVenueNameToIdMap above) and returns both:
//   byName: Map<normalized venue name, { id, address, city } | AMBIGUOUS_VENUE_NAME>
//   byId:   Map<venue id, { id, address, city }>
// Fails soft to two empty Maps on any problem, same convention as every
// other lookup builder in this file.
async function buildVenueDetailsMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  const byName = new Map();
  const byId = new Map();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { byName, byId };
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/venues?select=id,name,address,city&limit=1000`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!resp.ok) return { byName, byId };
    const rows = await resp.json();
    if (!Array.isArray(rows)) return { byName, byId };
    for (const v of rows) {
      if (!v || !v.id) continue;
      const detail = { id: v.id, address: v.address || null, city: v.city || null };
      byId.set(v.id, detail);
      const key = normalizeVenueName(v.name);
      if (!key) continue;
      if (byName.has(key)) {
        byName.set(key, AMBIGUOUS_VENUE_NAME);
      } else {
        byName.set(key, detail);
      }
    }
  } catch {
    // Network/parse failure — return whatever's in the maps so far (empty
    // on a first-request failure), never throw out of this helper.
  }
  return { byName, byId };
}

// Builds the tier-C "learned from historical events" fallback: every event
// that ever carried a real venue_address_raw, most-recently-updated first,
// deduped by exact normalized venue name — deliberately the same shape as
// api/admin-venues.js's source 2, but MORE conservative: if two historical
// rows for the same normalized name disagree on the address, that name is
// dropped from the map entirely (unresolved) rather than trusting whichever
// row is most recent, since this map feeds automatic writes with no human
// review, unlike admin-venues.js's human-facing autofill suggestion.
async function buildLearnedVenueAddressCityMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  const map = new Map();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return map;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/events?venue_address_raw=not.is.null&select=venue_name_raw,venue_address_raw,venue_city_raw,updated_at&order=updated_at.desc&limit=500`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!resp.ok) return map;
    const rows = await resp.json();
    if (!Array.isArray(rows)) return map;
    const conflicted = new Set();
    for (const e of rows) {
      const key = normalizeVenueName(e.venue_name_raw);
      if (!key) continue;
      const addr = (e.venue_address_raw || "").trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, { address: e.venue_address_raw || null, city: e.venue_city_raw || null });
      } else if (!conflicted.has(key)) {
        const existingAddr = (map.get(key).address || "").trim().toLowerCase();
        if (existingAddr !== addr) conflicted.add(key);
      }
    }
    for (const key of conflicted) map.delete(key);
  } catch {
    // fail-soft, same convention as every other lookup builder here.
  }
  return map;
}

// The pure repair decision itself — no network, no side effects. Given one
// event's current venue fields plus the maps built above, returns an
// object containing ONLY the fields that should be patched (a subset of
// { venue_id, venue_address_raw, venue_city_raw }), or {} when nothing
// should change. Safe to call for every event unconditionally: an event
// with both fields already populated always returns {} immediately.
//
// event shape: { venue_id, venue_name_raw, venue_address_raw, venue_city_raw }
// canonicalMaps: the { byName, byId } object from buildVenueDetailsMap()
// learnedMap: the Map from buildLearnedVenueAddressCityMap()
function resolveVenueAddressCityRepair(event, canonicalMaps, learnedMap) {
  const patch = {};
  if (!event) return patch;

  const addressBlank = isBlank(event.venue_address_raw);
  const cityBlank = isBlank(event.venue_city_raw);
  if (!addressBlank && !cityBlank) return patch; // fully populated — never touch it

  const byId = (canonicalMaps && canonicalMaps.byId) || new Map();
  const byName = (canonicalMaps && canonicalMaps.byName) || new Map();
  const learned = learnedMap || new Map();

  let candidate = null;
  let resolvedVenueId = null;

  if (event.venue_id) {
    // Tier A. Trust the existing link or nothing — do not fall back to a
    // name-based tier when venue_id is already set.
    if (byId.has(event.venue_id)) {
      candidate = byId.get(event.venue_id);
    }
  } else {
    const key = normalizeVenueName(event.venue_name_raw);
    if (key) {
      const nameMatch = byName.get(key);
      if (nameMatch && nameMatch !== AMBIGUOUS_VENUE_NAME) {
        // Tier B.
        candidate = nameMatch;
        resolvedVenueId = nameMatch.id;
      } else if (!nameMatch) {
        // Tier C — only when there is no canonical entry at all for this
        // exact name (an AMBIGUOUS_VENUE_NAME entry also skips this: an
        // ambiguous canonical name is left unresolved, not handed to the
        // less-authoritative learned tier).
        const learnedMatch = learned.get(key);
        if (learnedMatch) candidate = learnedMatch;
      }
    }
  }

  if (!candidate) return patch;

  if (addressBlank && !isBlank(candidate.address)) patch.venue_address_raw = candidate.address;
  if (cityBlank && !isBlank(candidate.city)) patch.venue_city_raw = candidate.city;
  if (resolvedVenueId && isBlank(event.venue_id)) patch.venue_id = resolvedVenueId;

  return patch;
}

module.exports = {
  normalizeVenueName,
  buildVenueNameToIdMap,
  resolveVenueId,
  isBlank,
  buildVenueDetailsMap,
  buildLearnedVenueAddressCityMap,
  resolveVenueAddressCityRepair,
};
