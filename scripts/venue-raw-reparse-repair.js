// scripts/venue-raw-reparse-repair.js
//
// "Self-healing / enrichment pivot" (2026-09-30, Jody: "68 actionable Needs
// Follow-up events, Auto-Repair repaired 0 — investigate why, then fix the
// GENERALIZED pipeline, not the 68 cards individually"). Root cause (see
// NEEDS_FOLLOWUP_ROOT_CAUSE.md for the full investigation): api/_lib/
// ics-location.js's parseIcsLocation() grammars were too narrow for real,
// recurring LOCATION shapes several already-registered multi-venue feeds
// actually emit (a region spelled out in full instead of abbreviated; a
// Tribe/Events-Calendar location with no region field at all). Text that
// didn't match either grammar fell through to the safe "unparseable"
// fallback and got written WHOLE into venue_name_raw — real, useful
// address/city data, just never split out of that one field. That grammar
// gap is now fixed directly in ics-location.js (2026-09-30) — every EVENT
// INGESTED FROM NOW ON benefits automatically, no separate step needed.
//
// This script is the other half: the events already ingested BEFORE the
// fix, still sitting with a raw, unsplit location string in venue_name_raw
// and null venue_address_raw/venue_city_raw/venue_id, get exactly one more
// chance at automatic recovery — literally the same parser, run again, now
// that it recognizes their shape. This is "behave like a human event
// producer using the evidence it already has" in its most literal form:
// the evidence was already sitting on the row the whole time.
//
// SAFETY (same posture as every other repair script in this project):
//   - Only ever reads venue_name_raw — never invents, never fetches
//     anything external, never fuzzy-matches.
//   - Only fires when parseIcsLocation() returns status "parsed" (a real,
//     recognized structured grammar) — an event whose venue_name_raw is
//     still "unparseable" free text is left exactly as-is, honest gap
//     preserved, same as ingestion-time behavior.
//   - Never overwrites a populated venue_address_raw/venue_city_raw/
//     venue_id — every candidate is fetched WITH those fields already
//     null, and every PATCH re-asserts they're still null at write time
//     (the same concurrent-write race guard as
//     sh1-repair-existing-venue-address-city.js).
//   - When the parsed candidate resolves to a canonical venues row (exact
//     name or exact address match, via the SAME resolveVenueFromCandidate
//     already used at ingestion time — no new resolution logic), links
//     venue_id and uses the canonical name/address/city. When it doesn't,
//     writes only the honest parsed address/city and leaves venue_name_raw
//     as its own already-present value (never rewrites a field that wasn't
//     blank).
//
// SCOPE: every event with start_date >= today and status != 'rejected'
// that has venue_id, venue_address_raw, AND venue_city_raw all null, but a
// non-blank venue_name_raw to re-parse — the exact shape of the "trapped
// raw location blob" case this exists for. An event with a real venue name
// that simply never resolved to a canonical venue (the ordinary,
// unrelated "no venue on file yet" case) is untouched here: its
// venue_name_raw won't parse as a structured Venue/Street/City string, so
// parseIcsLocation() correctly returns "unparseable" or "blank" and this
// script moves on without writing anything.
//
// Usage:
//   node scripts/venue-raw-reparse-repair.js            (writes repairs)
//   node scripts/venue-raw-reparse-repair.js --dry-run  (reports only)
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.

const path = require("path");
const { parseIcsLocation } = require(path.join(__dirname, "..", "api", "_lib", "ics-location"));
const { buildVenueDetailsMap, resolveVenueFromCandidate } = require(path.join(__dirname, "..", "api", "_lib", "venue-lookup"));

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=neq.rejected` +
    `&venue_id=is.null` +
    `&venue_address_raw=is.null` +
    `&venue_city_raw=is.null` +
    `&venue_name_raw=not.is.null` +
    `&select=id,venue_id,venue_name_raw,venue_address_raw,venue_city_raw,start_date,status` +
    `&limit=1000`;
  const resp = await fetch(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch re-parse candidates: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching re-parse candidates");
  return rows;
}

// Same is.null-guarded PATCH pattern as sh1-repair-existing-venue-address-city.js's
// applyPatch — re-requires every field being written to still be null at
// write time, so a concurrent change (a human edit, another repair step)
// can never be clobbered.
async function applyPatch(SUPABASE_URL, sbHeaders, eventId, patch) {
  const stillBlankFilters = Object.keys(patch)
    .filter((k) => k === "venue_address_raw" || k === "venue_city_raw" || k === "venue_id")
    .map((k) => `${k}.is.null`);
  const filterQs = stillBlankFilters.length > 1
    ? `and=(${stillBlankFilters.join(",")})`
    : stillBlankFilters.map((f) => f.replace(".", "=")).join("");
  const url = `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&${filterQs}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) throw new Error(`PATCH failed for event ${eventId}: HTTP ${resp.status}`);
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function repairVenueRawReparse({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchRepairCandidates,
  applyPatchFn = applyPatch,
  buildCanonicalMaps = buildVenueDetailsMap,
} = {}) {
  const counts = {
    totalConsidered: 0,
    reparsed: 0, // parseIcsLocation() returned "parsed" on re-run
    resolvedToCanonicalVenue: 0, // of those, matched an existing venues row
    writtenAsRawAddressCity: 0, // of those, no canonical match — wrote honest parsed address/city only
    stillUnparseable: 0, // parseIcsLocation() still returns "unparseable"/"blank" — genuinely no structure, left untouched
    written: 0,
    skippedConcurrentChange: 0,
    writtenIds: [],
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  const canonicalMaps = await buildCanonicalMaps(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const candidates = await fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders);
  counts.totalConsidered = candidates.length;

  for (const event of candidates) {
    const parsed = parseIcsLocation(event.venue_name_raw);
    if (parsed.status !== "parsed") {
      counts.stillUnparseable++;
      continue;
    }
    counts.reparsed++;

    const candidate = { name: parsed.candidateName, address: parsed.candidateAddress, city: parsed.candidateCity };
    const canonical = resolveVenueFromCandidate(candidate, canonicalMaps);

    const patch = {};
    if (canonical) {
      patch.venue_id = canonical.id;
      if (canonical.name) patch.venue_name_raw = canonical.name;
      if (canonical.address) patch.venue_address_raw = canonical.address;
      if (canonical.city) patch.venue_city_raw = canonical.city;
    } else {
      if (candidate.address) patch.venue_address_raw = candidate.address;
      if (candidate.city) patch.venue_city_raw = candidate.city;
      // Deliberately never rewrites venue_name_raw in the no-canonical-match
      // case — the field is already non-blank (that's how this row became a
      // candidate at all), and this script only ever fills a currently-blank
      // field, same as SH.1's own posture.
    }

    if (Object.keys(patch).length === 0) {
      counts.stillUnparseable++; // parsed but yielded nothing new to write (shouldn't normally happen)
      continue;
    }

    if (canonical) counts.resolvedToCanonicalVenue++;
    else counts.writtenAsRawAddressCity++;

    if (dryRun) {
      logger.log(`[dry-run] would patch event ${event.id} (from "${event.venue_name_raw}"):`, patch);
      continue;
    }
    const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, patch);
    if (applied) {
      counts.written++;
      counts.writtenIds.push(event.id);
    } else {
      counts.skippedConcurrentChange++;
      logger.warn(`Skipped event ${event.id} — a field in ${JSON.stringify(patch)} was no longer null at write time (concurrent change).`);
    }
  }

  return counts;
}

module.exports = { repairVenueRawReparse, fetchRepairCandidates, applyPatch };

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  repairVenueRawReparse({ dryRun })
    .then((counts) => {
      console.log(`\nVenue raw re-parse repair ${dryRun ? "(dry run) " : ""}summary:`);
      console.log(counts);
    })
    .catch((err) => {
      console.error("Venue raw re-parse repair script failed:", err);
      process.exitCode = 1;
    });
}
