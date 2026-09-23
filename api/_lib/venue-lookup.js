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

// Same trim + lowercase + whitespace-collapse normalization as
// normalizeVenueName, applied to address and city and joined into one key.
// Added 2026-09-23 for the reverse (address -> venue) resolution tier — see
// resolveVenueNameFromAddressRepair below. Returns "" (never matches
// anything) when address is blank; city alone is never enough to identify a
// venue.
function normalizeAddressCity(address, city) {
  const a = typeof address === "string" ? address.trim().toLowerCase().replace(/\s+/g, " ") : "";
  if (!a) return "";
  const c = typeof city === "string" ? city.trim().toLowerCase().replace(/\s+/g, " ") : "";
  return `${a}|${c}`;
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
  const byAddress = new Map(); // added 2026-09-23 for SH.1's reverse (address -> venue) tier — see resolveVenueNameFromAddressRepair below
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { byName, byId, byAddress };
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/venues?select=id,name,address,city,website,facebook_url&limit=1000`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!resp.ok) return { byName, byId, byAddress };
    const rows = await resp.json();
    if (!Array.isArray(rows)) return { byName, byId, byAddress };
    for (const v of rows) {
      if (!v || !v.id) continue;
      // `name`/`website`/`facebook_url` added 2026-09-23 (generic enrichment:
      // reverse venue-name resolution needs the canonical name itself, and
      // digital-home link recovery needs these two) — purely additive to
      // this detail object; every existing consumer only ever read
      // .address/.city and is unaffected.
      const detail = { id: v.id, name: v.name || null, address: v.address || null, city: v.city || null, website: v.website || null, facebook_url: v.facebook_url || null };
      byId.set(v.id, detail);
      const nameKey = normalizeVenueName(v.name);
      if (nameKey) {
        if (byName.has(nameKey)) {
          byName.set(nameKey, AMBIGUOUS_VENUE_NAME);
        } else {
          byName.set(nameKey, detail);
        }
      }
      const addressKey = normalizeAddressCity(v.address, v.city);
      if (addressKey) {
        if (byAddress.has(addressKey)) {
          byAddress.set(addressKey, AMBIGUOUS_VENUE_NAME);
        } else {
          byAddress.set(addressKey, detail);
        }
      }
    }
  } catch {
    // Network/parse failure — return whatever's in the maps so far (empty
    // on a first-request failure), never throw out of this helper.
  }
  return { byName, byId, byAddress };
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


// ---------------------------------------------------------------------------
// Generic enrichment, 2026-09-23 (Admin stabilization follow-up: "the 26
// source-limited events should NOT merely be hidden -- the system should
// try to enrich them first"). Extends this same file rather than a new
// module, per the Product Owner's own precedent for SH.1 above ("inspect
// and reuse the smallest appropriate existing venue-resolution
// functionality") -- these reuse buildVenueDetailsMap()'s maps and isBlank()
// directly. See scripts/generic-metadata-enrichment.js for the caller that
// sequences these into an actual repair run.

// resolveVenueNameFromAddressRepair(event, canonicalMaps) -> patch
//
// The reverse of SH.1's tier B: ADDRESS -> VENUE NAME. Only fires when an
// event has a real street address but genuinely no venue name at all (never
// second-guesses an existing venue_id or a present venue_name_raw -- see
// resolveVenueAddressCityRepair's own tier-A "trust the existing link or
// nothing" rule, applied here to the mirror-image case). Matches on an
// EXACT normalized (address, city) pair against the canonical venues table
// only -- no fuzzy matching, no geocoding. An address matching more than one
// canonical venue (AMBIGUOUS_VENUE_NAME) is left unresolved, same as an
// ambiguous name match in the forward direction: never guess which one.
function resolveVenueNameFromAddressRepair(event, canonicalMaps) {
  const patch = {};
  if (!event) return patch;
  if (!isBlank(event.venue_id)) return patch; // already linked — trust that, nothing to second-guess
  if (!isBlank(event.venue_name_raw)) return patch; // this tier only applies when there is truly no name to go on
  const addressKey = normalizeAddressCity(event.venue_address_raw, event.venue_city_raw);
  if (!addressKey) return patch; // no address to resolve from either

  const byAddress = (canonicalMaps && canonicalMaps.byAddress) || new Map();
  const match = byAddress.get(addressKey);
  if (!match || match === AMBIGUOUS_VENUE_NAME || !match.name) return patch;

  patch.venue_id = match.id;
  patch.venue_name_raw = match.name;
  return patch;
}

// resolveDigitalHomeLink(event, canonicalMaps) -> string | null
//
// Last deterministic tier of the ticket/event-link fallback hierarchy (see
// scripts/generic-metadata-enrichment.js's header for the full hierarchy):
// a verified official venue website, or failing that a verified official
// Facebook page, reused from the venue's own canonical record
// (migration_033_venue_social_links.sql). Only ever proposed when an event
// has NEITHER a ticket_url NOR an event_url of its own -- this is a
// last-resort "useful working destination," never a substitute for a real
// per-event link when one exists or can be recovered another way. Never
// invents a URL, never searches for one -- purely reads what a human
// already confirmed and stored on the canonical venue row. Resolves the
// venue via event.venue_id first (the trustworthy link), falling back to an
// already-embedded `event.venues` join (the shape api/admin-events.js's
// incomplete=1 query returns) only when venue_id itself isn't set.
function resolveDigitalHomeLink(event, canonicalMaps) {
  if (!event) return null;
  if (!isBlank(event.ticket_url) || !isBlank(event.event_url)) return null;

  const byId = (canonicalMaps && canonicalMaps.byId) || new Map();
  let venue = null;
  if (!isBlank(event.venue_id) && byId.has(event.venue_id)) {
    venue = byId.get(event.venue_id);
  } else if (event.venues && typeof event.venues === "object") {
    venue = event.venues;
  }
  if (!venue) return null;

  if (!isBlank(venue.website)) return venue.website.trim();
  if (!isBlank(venue.facebook_url)) return venue.facebook_url.trim();
  return null;
}

// SH.N (2026-09-21, EPIC-006) — Node-side twin of the browser-side
// resolveVenueDisplay() function duplicated across calendar.html, map.html,
// event-template.html, and radar.html (this project has no build step, so
// every consumer keeps its own copy — see radar.html's header comment).
// Used only by api/event-meta.js today. Same precedence rule, same never-
// invent guarantee, expressed here in terms of this file's own isBlank()
// rather than redefining it: canonical venue data (an embedded `venues`
// object reached through a real venue_id) is authoritative for public
// display whenever it resolves and the specific field is nonblank; the
// event's own raw text fields are the fallback (null venue_id, unresolved
// venue_id, or a blank canonical field) and nothing is ever invented beyond
// what one of the two sources actually has. Keep in sync with every browser
// copy if this logic ever changes.
function resolvePublicVenueDisplay(row) {
  const v = (row && row.venues) || null;
  const rawName = row ? row.venue_name_raw : null;
  const rawAddress = row ? row.venue_address_raw : null;
  const rawCity = row ? row.venue_city_raw : null;
  return {
    name: !isBlank(v && v.name) ? v.name : (isBlank(rawName) ? null : rawName),
    address: !isBlank(v && v.address) ? v.address : (isBlank(rawAddress) ? null : rawAddress),
    city: !isBlank(v && v.city) ? v.city : (isBlank(rawCity) ? null : rawCity),
    lat: (v && typeof v.lat === "number") ? v.lat : null,
    lng: (v && typeof v.lng === "number") ? v.lng : null,
  };
}


// ---------------------------------------------------------------------------
// External venue-knowledge persistence, 2026-09-23 ("CORRECTION TO
// ENRICHMENT PRODUCT BEHAVIOR" -- "KNOWLEDGE MUST COMPOUND... stored ONCE
// and automatically benefit every existing and future <venue> event").
// Extends this same file, same precedent as SH.1 and the reverse-resolution
// tier above. These two functions are the ONLY write path this correction
// adds to the venues table; api/_lib/external-discovery.js does the actual
// (bounded, verified) external lookup and hands its result here to persist
// -- this file never verifies anything itself, only writes what it's given,
// and never overwrites a field a human or an earlier process already
// populated (same "never overwrite a populated field" convention as every
// repair tier above).

// mergeVenueIntoMaps(canonicalMaps, venueRow) -> void
//
// Folds one freshly-known venue row (typically just returned by
// upsertVenueKnowledge below) into the in-memory maps built by
// buildVenueDetailsMap(), so the SAME enrichment pass can immediately
// re-run deterministic venue resolution against it without a second fetch
// -- "persist reusable venue/source knowledge -> revalidate." Never
// overwrites an existing map entry; only adds what wasn't already there.
function mergeVenueIntoMaps(canonicalMaps, venueRow) {
  if (!canonicalMaps || !venueRow || !venueRow.id) return;
  const detail = {
    id: venueRow.id,
    name: venueRow.name || null,
    address: venueRow.address || null,
    city: venueRow.city || null,
    website: venueRow.website || null,
    facebook_url: venueRow.facebook_url || null,
  };
  if (canonicalMaps.byId && !canonicalMaps.byId.has(detail.id)) canonicalMaps.byId.set(detail.id, detail);
  const nameKey = normalizeVenueName(detail.name);
  if (nameKey && canonicalMaps.byName && !canonicalMaps.byName.has(nameKey)) canonicalMaps.byName.set(nameKey, detail);
  const addressKey = normalizeAddressCity(detail.address, detail.city);
  if (addressKey && canonicalMaps.byAddress && !canonicalMaps.byAddress.has(addressKey)) canonicalMaps.byAddress.set(addressKey, detail);
}

// upsertVenueKnowledge(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, discovery, fetchFn)
//   -> { id, name, address, city, website, facebook_url } | null
//
// Persists a VERIFIED external discovery result (see api/_lib/external-
// discovery.js's discoverVenueKnowledge) as reusable canonical venue
// knowledge. Looks up by exact normalized name first (normalizeVenueName,
// same rule as every other tier in this file); if a canonical row already
// exists, only fills in its currently-blank fields -- never overwrites a
// populated address/city/website. If no canonical row exists yet, creates
// one (city defaults to 'Detroit' only when genuinely unresolved, matching
// this table's own schema default -- see supabase/schema.sql -- not an
// invented fact). Fails soft (returns null, never throws) on any network or
// parse problem, same convention as every other lookup/write helper here.
async function upsertVenueKnowledge(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, discovery, fetchFn) {
  const doFetch = fetchFn || fetch;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !discovery || !discovery.name) return null;
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  try {
    const nameKey = normalizeVenueName(discovery.name);
    const getResp = await doFetch(
      `${SUPABASE_URL}/rest/v1/venues?name=ilike.${encodeURIComponent(discovery.name.trim())}&select=id,name,address,city,website,facebook_url&limit=5`,
      { headers }
    );
    if (!getResp.ok) return null;
    const existingRows = await getResp.json();
    const existing = Array.isArray(existingRows)
      ? existingRows.find((v) => normalizeVenueName(v.name) === nameKey)
      : null;

    if (existing) {
      const patch = {};
      if (isBlank(existing.address) && discovery.address) patch.address = discovery.address;
      if (isBlank(existing.city) && discovery.city) patch.city = discovery.city;
      if (isBlank(existing.website) && discovery.website) patch.website = discovery.website;
      if (Object.keys(patch).length === 0) {
        return { id: existing.id, name: existing.name, address: existing.address, city: existing.city, website: existing.website, facebook_url: existing.facebook_url || null };
      }
      const patchResp = await doFetch(`${SUPABASE_URL}/rest/v1/venues?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      if (!patchResp.ok) return null;
      const rows = await patchResp.json();
      const row = Array.isArray(rows) && rows[0] ? rows[0] : { ...existing, ...patch };
      return { id: row.id, name: row.name, address: row.address, city: row.city, website: row.website, facebook_url: row.facebook_url || null };
    }

    const insertBody = {
      name: discovery.name,
      address: discovery.address || null,
      city: discovery.city || "Detroit",
      website: discovery.website || null,
    };
    const postResp = await doFetch(`${SUPABASE_URL}/rest/v1/venues`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(insertBody),
    });
    if (!postResp.ok) return null;
    const created = await postResp.json();
    const row = Array.isArray(created) && created[0] ? created[0] : null;
    if (!row) return null;
    return { id: row.id, name: row.name, address: row.address, city: row.city, website: row.website, facebook_url: row.facebook_url || null };
  } catch {
    return null;
  }
}

module.exports = {
  normalizeVenueName,
  normalizeAddressCity,
  buildVenueNameToIdMap,
  resolveVenueId,
  isBlank,
  buildVenueDetailsMap,
  buildLearnedVenueAddressCityMap,
  resolveVenueAddressCityRepair,
  resolveVenueNameFromAddressRepair,
  resolveDigitalHomeLink,
  resolvePublicVenueDisplay,
  mergeVenueIntoMaps,
  upsertVenueKnowledge,
};
