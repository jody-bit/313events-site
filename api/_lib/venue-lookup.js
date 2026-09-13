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

module.exports = { normalizeVenueName, buildVenueNameToIdMap, resolveVenueId };
