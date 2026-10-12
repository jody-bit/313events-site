"use strict";

// scripts/ra-time-backfill.js
//
// ONE-TIME Resident Advisor start-time/source-link backfill (2026-10-12,
// RA Start-Time Defect investigation). Repairs EXISTING RA rows that were
// published with no start time at all -- confirmed root cause: every
// affected row went through scripts/ra-candidate-promotion.js's
// listing-only path (title/date/venue from RA's listing card, never a
// detail page) and was later approved by a moderator with nothing ever
// going back to check RA's own detail page for the real time it has had
// the whole time. See the "RA Start-Time Defect — Investigation Report"
// doc for the full trace.
//
// WHY THIS CAN'T WORK LIKE scripts/visitdetroit-time-backfill.js: that
// script calls VisitDetroit's own Algolia index directly -- a plain
// server-side fetch(), reachable from anywhere. RA's event pages sit
// behind DataDome bot-protection (ra-sync/README.md's own header: "the
// device's own shell cannot reach 313.events... the ONLY thing with open
// internet access is the real browser session"). So this script cannot
// default to fetching RA itself -- it takes already-fetched detail-page
// data as input, the exact same { id, startDate, endDate, url } shape
// scripts/ra-sync.js's complete step already receives from the
// browser-bridge session, and reuses that file's own parseIsoLocal /
// deriveTimeDisplayAndEndDate / deriveTicketUrl so this can never drift
// from how a real detail-fetch derives these fields.
//
// INTENDED REAL USAGE: (1) query candidates (fetchRaRepairCandidates,
// or `--list-ids`) to get the exact external_ids still missing a time;
// (2) re-fetch just those RA event pages through the daily sync's own
// browser-bridge session, writing their JSON-LD { id, startDate, endDate,
// url } to a JSON file; (3) run this script with
// RA_TIME_BACKFILL_DETAIL_FILE pointing at that file. Nothing here ever
// calls ra.co itself.
//
// IDENTITY VERIFICATION: matched ONLY by external_id (RA's own stable
// "ra-<id>" id -- what every other RA write path already keys on). As a
// defensive check against a wrong id in the detail file, a title present
// in the detail payload that does not loosely match (case/punctuation-
// insensitive substring match either way) the stored title is skipped as
// a titleMismatch rather than trusted. A detail payload with no title at
// all is accepted without that check (RA's JSON-LD title field is not
// always re-captured by every caller) -- external_id is still the
// authoritative match.
//
// NEVER GUESSES, NEVER OVERWRITES:
//   - A candidate with no entry in the detail data is left completely
//     alone (noDetailDataProvided) -- not every affected row needs to be
//     in the same run's detail file.
//   - A detail entry with no startDate field at all is
//     noStartDateInDetailPayload -- distinct from a genuine parse
//     failure (see next) and from RA genuinely having no time (see next
//     next): this is "we didn't get a date back," not "RA has no time."
//   - A detail entry whose startDate exists but parseIsoLocal can't read
//     it at all is parseFailed, logged and counted by id -- NEVER
//     silently folded into "RA has no time" (the task's own explicit
//     requirement: "do not silently classify a parsing failure as
//     missing source information").
//   - A detail entry whose startDate genuinely has no time-of-day
//     component (RA itself gave a date-only value) is sourceHasNoTime --
//     the one case where there truly is nothing to fill in, left null,
//     never defaulted to midnight/noon/now.
//   - time_display, end_date, and ticket_url are each re-asserted in the
//     PATCH's own WHERE filter against the exact value this run read
//     (is.null when null) -- a moderator's concurrent hand-edit to any of
//     the three is respected and the write is skipped
//     (skippedConcurrentChange), never overwritten. ticket_url is only
//     ever filled when it reads back null; a row that already has one
//     (from any source) is left untouched.
//   - status is NEVER touched here, whatever its current value --
//     approving an event is a separate, explicit, human decision this
//     script has no opinion on.
//
// Usage:
//   RA_TIME_BACKFILL_DETAIL_FILE=./ra-detail.json node scripts/ra-time-backfill.js
//   RA_TIME_BACKFILL_DETAIL_FILE=./ra-detail.json node scripts/ra-time-backfill.js --dry-run
//   node scripts/ra-time-backfill.js --list-ids   (prints the external_ids that need detail data, writes nothing)

const path = require("path");
const fs = require("fs");
const { parseIsoLocal, deriveTimeDisplayAndEndDate, deriveTicketUrl } = require(path.join(__dirname, "ra-sync"));

const SOURCE_NAME = "Resident Advisor";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normTitle(t) {
  return (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Case/punctuation-insensitive substring match either way -- same
// convention as scripts/visitdetroit-time-backfill.js's own
// titlesLooselyMatch, duplicated rather than shared (this project's
// established "duplicated glue rather than a shared abstraction"
// convention -- see api/cron-enrichment.js's header for the precedent).
function titlesLooselyMatch(a, b) {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function fetchRaRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders, fetchImpl = fetch) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=neq.rejected` +
    `&source=eq.${encodeURIComponent(SOURCE_NAME)}` +
    `&time_display=is.null` +
    `&select=id,external_id,title,start_date,end_date,time_display,ticket_url` +
    `&limit=1000`;
  const resp = await fetchImpl(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch RA time-backfill candidates: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching RA time-backfill candidates");
  return rows;
}

// Reads a JSON file of already-fetched RA detail-page data (the shape
// the browser-bridge session already produces for scripts/ra-sync.js's
// complete step: an array of { id, startDate, endDate, url, title? }) and
// returns Map<external_id, { startDate, endDate, url, title }>. This is
// the ONLY built-in way this script gets real data -- see this file's own
// header for why a plain fetch() can't reach ra.co.
function fetchRaDetailDataFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.events) ? parsed.events : [];
  const map = new Map();
  for (const entry of list) {
    if (!entry || typeof entry.id !== "string") continue;
    const externalId = entry.id.startsWith("ra-") ? entry.id : `ra-${entry.id}`;
    map.set(externalId, {
      startDate: entry.startDate,
      endDate: entry.endDate,
      url: entry.url || null,
      title: entry.title || null,
    });
  }
  return map;
}

// Default detail-data source: RA_TIME_BACKFILL_DETAIL_FILE if set, else
// an empty Map (never a network call -- see this file's own header).
// Returning an empty Map rather than throwing means a misconfigured run
// reports every candidate as noDetailDataProvided (loud in the summary,
// nothing written) instead of crashing -- consistent with every other
// repair script's "fails soft, never a reason to abort" convention.
async function defaultFetchDetailData(logger = console) {
  const filePath = process.env.RA_TIME_BACKFILL_DETAIL_FILE;
  if (!filePath) {
    logger.warn(
      "RA_TIME_BACKFILL_DETAIL_FILE not set -- no detail data source configured. " +
        "RA's own event pages require the browser-bridge session (DataDome); " +
        "this script never calls ra.co itself. Every candidate will report as " +
        "noDetailDataProvided and nothing will be written."
    );
    return new Map();
  }
  return fetchRaDetailDataFromFile(filePath);
}

function fieldFilterPart(field, value) {
  return value === null || value === undefined ? `${field}=is.null` : `${field}=eq.${encodeURIComponent(value)}`;
}

// Re-asserts the exact original time_display/end_date/ticket_url in the
// WHERE filter (nullable fields re-asserted with is.null) -- a
// moderator's concurrent hand-edit to any of the three is respected,
// never overwritten. Returns true if the write actually applied.
async function applyPatch(SUPABASE_URL, sbHeaders, event, patchBody, fetchImpl = fetch) {
  const url =
    `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(event.id)}` +
    `&${fieldFilterPart("time_display", event.time_display)}` +
    `&${fieldFilterPart("end_date", event.end_date)}` +
    `&${fieldFilterPart("ticket_url", event.ticket_url)}`;
  const resp = await fetchImpl(url, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patchBody),
  });
  if (!resp.ok) throw new Error(`PATCH failed for event ${event.id}: HTTP ${resp.status}`);
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

// The testable core. fetchCandidates/fetchDetailData/applyPatchFn are all
// injectable, same DI convention as every other repair script in this
// project (scripts/visitdetroit-time-backfill.js chief among them).
async function repairRaTimes({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchRaRepairCandidates,
  fetchDetailData = defaultFetchDetailData,
  applyPatchFn = applyPatch,
  fetchFn = fetch,
} = {}) {
  const counts = {
    totalConsidered: 0,
    noDetailDataProvided: 0,
    titleMismatchSkipped: 0,
    noStartDateInDetailPayload: 0,
    parseFailed: 0,
    parseFailedIds: [],
    sourceHasNoTime: 0,
    sourceHasNoTimeIds: [],
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

  const [candidates, detailByExternalId] = await Promise.all([
    fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders, fetchFn),
    fetchDetailData(logger),
  ]);
  counts.totalConsidered = candidates.length;

  for (const event of candidates) {
    const detail = detailByExternalId.get(event.external_id);
    if (!detail) {
      counts.noDetailDataProvided++;
      continue; // not every affected row needs to be in the same run's detail file
    }

    if (detail.title && !titlesLooselyMatch(detail.title, event.title)) {
      counts.titleMismatchSkipped++;
      logger.warn(
        `Skipped event ${event.id} (external_id ${event.external_id}) — stored title "${event.title}" does not match detail-page title "${detail.title}"; refusing to trust this identity match.`
      );
      continue;
    }

    if (typeof detail.startDate !== "string" || !detail.startDate.trim()) {
      counts.noStartDateInDetailPayload++;
      continue; // the detail fetch itself returned no date -- never guessed
    }

    const parsedStart = parseIsoLocal(detail.startDate);
    if (!parsedStart) {
      counts.parseFailed++;
      counts.parseFailedIds.push(event.external_id);
      logger.warn(
        `Could not parse RA startDate "${detail.startDate}" for ${event.external_id} — recorded as a PARSE FAILURE, never silently treated as "RA has no time."`
      );
      continue;
    }

    const { endDate, timeDisplay } = deriveTimeDisplayAndEndDate(detail.startDate, detail.endDate);
    if (!timeDisplay) {
      counts.sourceHasNoTime++;
      counts.sourceHasNoTimeIds.push(event.external_id);
      continue; // RA's own detail page genuinely has no time-of-day component -- nothing to fill in
    }

    const patchBody = { time_display: timeDisplay, end_date: endDate };
    if (!event.ticket_url) {
      const numericId = event.external_id.replace(/^ra-/, "");
      patchBody.ticket_url = deriveTicketUrl(numericId, detail.url || null);
    }

    if (dryRun) {
      logger.log(
        `[dry-run] would patch event ${event.id} (${event.external_id}, "${event.title}"): ${JSON.stringify(patchBody)}`
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
        `Skipped event ${event.id} — time_display/end_date/ticket_url changed since this run started (concurrent edit).`
      );
    }
  }

  return counts;
}

module.exports = {
  repairRaTimes,
  fetchRaRepairCandidates,
  fetchRaDetailDataFromFile,
  applyPatch,
  titlesLooselyMatch,
};

if (require.main === module) {
  if (process.argv.includes("--list-ids")) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
      process.exitCode = 1;
    } else {
      const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
      fetchRaRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders)
        .then((rows) => {
          console.log(JSON.stringify(rows.map((r) => ({ external_id: r.external_id, title: r.title, url: `https://ra.co/events/${r.external_id.replace(/^ra-/, "")}` })), null, 2));
        })
        .catch((err) => {
          console.error("Failed to list RA time-backfill candidates:", err);
          process.exitCode = 1;
        });
    }
  } else {
    const dryRun = process.argv.includes("--dry-run");
    repairRaTimes({ dryRun })
      .then((counts) => {
        console.log(`\nRA time backfill ${dryRun ? "(dry run) " : ""}summary:`);
        console.log(counts);
      })
      .catch((err) => {
        console.error("RA time backfill failed:", err);
        process.exitCode = 1;
      });
  }
}
