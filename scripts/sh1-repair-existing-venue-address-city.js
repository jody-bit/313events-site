// scripts/sh1-repair-existing-venue-address-city.js
//
// SH.1 (Metadata Self-Healing) — "an existing upcoming incomplete event can
// be repaired without manual entry" half of the required dual
// demonstration (Product Owner's 2026-09-21 review, refinement 7).
//
// Deliberately NOT a cron: it is not registered in vercel.json, does not
// use api/_lib/run-log.js's source_runs telemetry, and is not on any
// schedule. Per the Product Owner's explicit instruction ("Do not build
// the entire future repair cron if a narrower implementation can prove the
// behavior first"), this is the smallest thing that proves existing-event
// repair works: a manually-invoked, one-shot Node script. Turning this
// into a real scheduled repair process (with its own source_runs logging,
// batching/paging beyond the current unpaged query, and a cron entry) is
// the proposed SH.5 work package — explicitly out of scope here.
//
// Usage:
//   node scripts/sh1-repair-existing-venue-address-city.js            (writes repairs)
//   node scripts/sh1-repair-existing-venue-address-city.js --dry-run  (reports only, writes nothing)
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment,
// same as every cron in this project.
//
// SCOPE: every event with start_date >= today and status != 'rejected'
// (a rejected event is dead — repairing it serves nothing) that is
// missing venue_address_raw and/or venue_city_raw. Uses exactly the same
// resolveVenueAddressCityRepair() decision function as the ingestion-time
// integration in api/cron-feeds.js — see api/_lib/venue-lookup.js for the
// authority order and safety rules (canonical venue_id, then exact
// canonical name match, then exact learned historical match; never
// fuzzy, never overwrites a populated field, never touches any other
// column).
//
// SAFETY AT WRITE TIME: each PATCH re-asserts, in the WHERE clause itself
// (via PostgREST query filters), that every field it's about to write is
// STILL null at write time — not just at the moment this script read the
// row. This closes the read-then-write race a naive
// "SELECT, decide, UPDATE by id" script would have if something else
// (an admin edit, a cron re-run) wrote a real value to that same field in
// between. If the filter no longer matches, PostgREST returns zero rows
// for that PATCH and this script counts it as skipped-by-concurrent-write,
// never as an error and never overwriting the newer value.

const path = require("path");
const {
  buildVenueDetailsMap,
  buildLearnedVenueAddressCityMap,
  resolveVenueAddressCityRepair,
  normalizeVenueName,
} = require(path.join(__dirname, "..", "api", "_lib", "venue-lookup"));

const REPAIRABLE_FIELDS = ["venue_address_raw", "venue_city_raw", "venue_id"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Classifies WHY a patch was possible, for the before/after measurement
// report the Product Owner asked for (refinement 10). This is reporting
// only — it never influences the actual repair decision, which is made
// solely by resolveVenueAddressCityRepair().
function classifyTier(event, canonicalMaps, learnedMap) {
  if (event.venue_id && canonicalMaps.byId.has(event.venue_id)) return "canonical_venue_id";
  if (!event.venue_id) {
    const key = normalizeVenueName(event.venue_name_raw);
    const nameMatch = key && canonicalMaps.byName.get(key);
    if (nameMatch && typeof nameMatch === "object") return "canonical_name_match";
    if (key && learnedMap.has(key)) return "learned_historical";
  }
  return "unresolved";
}

async function fetchRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=neq.rejected` +
    `&or=(venue_address_raw.is.null,venue_city_raw.is.null)` +
    `&select=id,venue_id,venue_name_raw,venue_address_raw,venue_city_raw,start_date,status` +
    `&limit=1000`;
  const resp = await fetch(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch repair candidates: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching repair candidates");
  return rows;
}

// PATCHes exactly the fields in `patch`, with a WHERE filter that
// re-requires each of those fields to still be null right now. Returns
// true if the write actually applied (PostgREST returned the row),
// false if a concurrent change made the filter no longer match.
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

// The testable core. `fetchCandidates`/`applyPatchFn` are injectable so
// tests can supply a mocked Supabase layer without touching global.fetch
// plumbing directly (kept close to this project's existing
// mock-fetch-per-URL test convention, just factored one level up).
async function repairExistingEvents({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchRepairCandidates,
  applyPatchFn = applyPatch,
} = {}) {
  const counts = {
    totalConsidered: 0,
    repairable: 0,
    repairableFromCanonicalVenueId: 0,
    repairableFromCanonicalName: 0,
    repairableFromLearnedHistorical: 0,
    written: 0,
    // Auto-Repair V1 (2026-09-22, api/admin-events.js's "auto_repair_venue"
    // action): distinct from `written` (events actually patched) -- an
    // event can have BOTH venue_address_raw and venue_city_raw blank at
    // once, which is one written event but two repaired fields. Admin's
    // Auto-Repair button reports both ("Events repaired" vs "Missing
    // fields repaired") since the Product Owner asked for the field-level
    // count specifically, not just the event-level one. Purely additive:
    // counted only when applyPatchFn() actually reports the write applied,
    // never for a dry-run or a skipped-by-concurrent-write patch.
    fieldsWritten: 0,
    skippedConcurrentChange: 0,
    unresolved: 0,
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  const [canonicalMaps, learnedMap] = await Promise.all([
    buildVenueDetailsMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    buildLearnedVenueAddressCityMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
  ]);

  const candidates = await fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders);
  counts.totalConsidered = candidates.length;

  for (const event of candidates) {
    const patch = resolveVenueAddressCityRepair(event, canonicalMaps, learnedMap);
    if (Object.keys(patch).length === 0) {
      counts.unresolved++;
      continue;
    }
    counts.repairable++;
    const tier = classifyTier(event, canonicalMaps, learnedMap);
    if (tier === "canonical_venue_id") counts.repairableFromCanonicalVenueId++;
    else if (tier === "canonical_name_match") counts.repairableFromCanonicalName++;
    else if (tier === "learned_historical") counts.repairableFromLearnedHistorical++;

    if (dryRun) {
      logger.log(`[dry-run] would patch event ${event.id} (${event.venue_name_raw || "no venue name"}):`, patch);
      continue;
    }
    const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, patch);
    if (applied) {
      counts.written++;
      counts.fieldsWritten += Object.keys(patch).length;
    } else {
      counts.skippedConcurrentChange++;
      logger.warn(`Skipped event ${event.id} — a field in ${JSON.stringify(patch)} was no longer null at write time (concurrent change).`);
    }
  }

  return counts;
}

module.exports = { repairExistingEvents, classifyTier, fetchRepairCandidates, applyPatch, REPAIRABLE_FIELDS };

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  repairExistingEvents({ dryRun })
    .then((counts) => {
      console.log(`\nSH.1 existing-event repair ${dryRun ? "(dry run) " : ""}summary:`);
      console.log(counts);
    })
    .catch((err) => {
      console.error("SH.1 repair script failed:", err);
      process.exitCode = 1;
    });
}
