// scripts/visitdetroit-time-backfill.js
//
// ONE-TIME VisitDetroit start/end-time backfill (2026-09-28) -- repairs
// EXISTING future VisitDetroit rows whose start_date/end_date/time_display
// were computed by the old, wrong Intl-based UTC->America/Detroit
// conversion in api/cron-visitdetroit.js's detroitParts(). Root cause
// (confirmed against real epochs, not guessed): VisitDetroit's own backend
// naive-serializes local Detroit wall-clock time as if it were UTC, so
// converting the stored epoch through a real timezone conversion
// double-subtracts the offset -- a 5-hour shift (e.g. a genuine 1:30 PM
// tour departure was stored/displayed as 8:30 AM). The live cron now uses
// the corrected detroitParts()/deriveDateTimeFields() (see
// api/cron-visitdetroit.js) for every future sync going forward, but a row
// written before that fix keeps its old, wrong stored value until
// something explicitly repairs it -- this script is that one-time,
// explicit repair. Run once by hand; never on a schedule, and never from
// the Admin Auto-Repair button (see that button's Step 6 comment in
// api/admin-events.js for why: Jody wants this initial historical cleanup
// to be a distinct, deliberate, reviewed action, not a side effect the
// button might trigger the first time someone clicks it for something
// else).
//
// IDENTITY VERIFICATION: matches a DB row to a fresh Algolia hit ONLY by
// external_id (`vd-${h.id}`, VisitDetroit's own stable per-listing ID --
// exactly what the live cron itself keys on for upserts). As a defensive
// sanity check against an external_id collision or stale mapping, a hit
// whose title does not loosely match (case/punctuation-insensitive
// substring match in either direction) the DB row's stored title is
// skipped and logged as a titleMismatch rather than trusted -- this never
// invents or assumes an identity the data doesn't actually support.
//
// SCOPE: rows with source="VisitDetroit", start_date >= today, status !=
// 'rejected'. Only rows whose Algolia-derived start_date, end_date, or
// time_display actually differs from what's currently stored are
// touched -- already-correct rows are left alone (see alreadyCorrect
// count). A DB row with NO matching external_id in the current Algolia
// pull (the listing has since been removed/expired from VisitDetroit's own
// index) is left completely alone -- never guessed, never deleted, never
// backdated.
//
// RECURRENCE: never expands or creates new rows. A row is only ever
// corrected to that SAME occurrence's authoritative source time -- this
// script has no path that creates a Dec 12/19-style additional occurrence
// for a recurring listing, matching the hard project rule that start times
// are never inferred/generated for an occurrence with no authoritative
// timestamp of its own (VisitDetroit's Algolia data has no per-occurrence
// timestamps for recurring listings, only a free-text readableRepeatRule
// summary -- see api/cron-visitdetroit.js's own note field).
//
// SAFETY AT WRITE TIME: every PATCH re-asserts the exact original
// start_date/end_date/time_display this run read, in its own WHERE filter
// (a null field is re-asserted with is.null, not eq.<empty>) -- a
// moderator who hand-edited any of these three fields in the meantime is
// respected, and the write is skipped, never overwritten (see
// skippedConcurrentChange).
//
// Usage:
//   node scripts/visitdetroit-time-backfill.js            (writes repairs)
//   node scripts/visitdetroit-time-backfill.js --dry-run  (reports only)

const path = require("path");
const { deriveDateTimeFields } = require(path.join(__dirname, "..", "api", "cron-visitdetroit"));

const ALGOLIA_APP_ID = "EYQHJ2IY2M";
const ALGOLIA_INDEX = "prod-visit-detroit-listings";
const ALGOLIA_API_KEY = "c6d5977cb5cd80c09abfd2a7e5d9e88b";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
const ALGOLIA_FILTERS = 'calendarName:"Default Calendar" AND (NOT isPrimaryEvent:false)';

const SOURCE_NAME = "VisitDetroit";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normTitle(t) {
  return (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Case/punctuation-insensitive substring match in either direction --
// deliberately loose enough to tolerate minor copy differences (an
// ellipsis, a trailing "(Detroit)") while still refusing an outright
// different title, which would indicate the external_id match itself is
// not trustworthy.
function titlesLooselyMatch(a, b) {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Fetches fresh Algolia data and returns Map<external_id, { title, dt }>
// for every hit with a parseable start time. `dt` is
// deriveDateTimeFields()'s own { startDate, endDate, timeDisplay } shape
// -- the exact same derivation the live cron uses, imported directly so
// this can never drift from it.
async function fetchAlgoliaDerivedByExternalId(fetchImpl = fetch) {
  const params = `filters=${encodeURIComponent(ALGOLIA_FILTERS)}&hitsPerPage=1000&page=0`;
  const r = await fetchImpl(ALGOLIA_URL, {
    method: "POST",
    headers: {
      "X-Algolia-API-Key": ALGOLIA_API_KEY,
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ params }),
  });
  if (!r.ok) throw new Error(`Algolia query failed: HTTP ${r.status}`);
  const data = await r.json();
  const hits = Array.isArray(data.hits) ? data.hits : [];

  const map = new Map();
  for (const h of hits) {
    const dt = deriveDateTimeFields(h);
    if (!dt) continue;
    map.set(`vd-${h.id}`, { title: h.title, dt });
  }
  return map;
}

async function fetchRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders, fetchImpl = fetch) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=neq.rejected` +
    `&source=eq.${encodeURIComponent(SOURCE_NAME)}` +
    `&select=id,external_id,title,start_date,end_date,time_display` +
    `&limit=1000`;
  const resp = await fetchImpl(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch VisitDetroit time-backfill candidates: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching VisitDetroit time-backfill candidates");
  return rows;
}

function fieldFilterPart(field, value) {
  return value === null || value === undefined ? `${field}=is.null` : `${field}=eq.${encodeURIComponent(value)}`;
}

// Re-asserts the exact original start_date/end_date/time_display in the
// WHERE filter (nullable fields re-asserted with is.null) -- a concurrent
// hand-edit to any of the three is respected, never overwritten. Returns
// true if the write actually applied.
async function applyPatch(SUPABASE_URL, sbHeaders, event, patchBody, fetchImpl = fetch) {
  const url =
    `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(event.id)}` +
    `&${fieldFilterPart("start_date", event.start_date)}` +
    `&${fieldFilterPart("end_date", event.end_date)}` +
    `&${fieldFilterPart("time_display", event.time_display)}`;
  const resp = await fetchImpl(url, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patchBody),
  });
  if (!resp.ok) throw new Error(`PATCH failed for event ${event.id}: HTTP ${resp.status}`);
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

// The testable core. `fetchCandidates`/`fetchAlgoliaData`/`applyPatchFn`
// are all injectable, same convention as every other repair script in
// this project.
async function repairVisitDetroitTimes({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchRepairCandidates,
  fetchAlgoliaData = fetchAlgoliaDerivedByExternalId,
  applyPatchFn = applyPatch,
  fetchFn = fetch,
} = {}) {
  const counts = {
    totalConsidered: 0,
    unmatchedNoLongerInSource: 0,
    titleMismatchSkipped: 0,
    alreadyCorrect: 0,
    repaired: 0,
    skippedConcurrentChange: 0,
    written: 0,
    fieldsWritten: 0,
    writtenIds: [],
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  const [candidates, algoliaByExternalId] = await Promise.all([
    fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders, fetchFn),
    fetchAlgoliaData(fetchFn),
  ]);
  counts.totalConsidered = candidates.length;

  for (const event of candidates) {
    const hit = algoliaByExternalId.get(event.external_id);
    if (!hit) {
      counts.unmatchedNoLongerInSource++;
      continue; // no longer in VisitDetroit's own index -- never guessed, left alone
    }

    if (!titlesLooselyMatch(hit.title, event.title)) {
      counts.titleMismatchSkipped++;
      logger.warn(
        `Skipped event ${event.id} (external_id ${event.external_id}) — stored title "${event.title}" does not match source title "${hit.title}"; refusing to trust this identity match.`
      );
      continue;
    }

    const { dt } = hit;
    const changed =
      dt.startDate !== event.start_date || dt.endDate !== event.end_date || dt.timeDisplay !== event.time_display;

    if (!changed) {
      counts.alreadyCorrect++;
      continue;
    }

    const patchBody = { start_date: dt.startDate, end_date: dt.endDate, time_display: dt.timeDisplay };

    if (dryRun) {
      logger.log(
        `[dry-run] would patch event ${event.id} (${event.title}): ` +
          `${JSON.stringify({ start_date: event.start_date, end_date: event.end_date, time_display: event.time_display })} -> ${JSON.stringify(patchBody)}`
      );
      counts.repaired++;
      continue;
    }

    const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event, patchBody, fetchFn);
    if (applied) {
      counts.repaired++;
      counts.written++;
      counts.fieldsWritten += Object.keys(patchBody).length;
      counts.writtenIds.push(event.id);
    } else {
      counts.skippedConcurrentChange++;
      logger.warn(
        `Skipped event ${event.id} — start_date/end_date/time_display changed since this run started (concurrent edit).`
      );
    }
  }

  return counts;
}

module.exports = {
  repairVisitDetroitTimes,
  fetchRepairCandidates,
  fetchAlgoliaDerivedByExternalId,
  applyPatch,
  titlesLooselyMatch,
};

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  repairVisitDetroitTimes({ dryRun })
    .then((counts) => {
      console.log(`\nVisitDetroit time backfill ${dryRun ? "(dry run) " : ""}summary:`);
      console.log(counts);
    })
    .catch((err) => {
      console.error("VisitDetroit time backfill failed:", err);
      process.exitCode = 1;
    });
}
