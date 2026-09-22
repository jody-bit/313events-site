const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingRows } = require("./_lib/status-lookup");
const {
  VENUE_NAME,
  HORIZON_DAYS,
  generateMondayOccurrences,
  buildOccurrenceRow,
} = require("./_lib/bigtimebingo-occurrences");

// Vercel Cron job -- generates upcoming Monday occurrences of "Big Time
// Bingo," a recurring weekly bingo night at Garden Bowl (part of the
// Majestic Theatre entertainment complex on Woodward Ave), hosted by Mayor
// Darlington. Added 2026-09-22 from a promotional poster the Product Owner
// supplied directly -- see api/_lib/bigtimebingo-occurrences.js for the
// full source-evidence breakdown and the venue-address research.
//
// ** WHY THIS CRON HAS NO FETCH STEP **
// Unlike every other single-venue cron in this project, this one does not
// scrape any live page. Garden Bowl's own website does not currently list
// Big Time Bingo on its normal event listings, and there is no other
// structured, machine-readable source for it. The only source evidence is
// the supplied poster (title, Monday recurrence, venue, host, 7:30 PM
// start, 21+) -- everything this cron writes traces back to that poster or
// to the canonical Garden Bowl venue record, never to a live fetch.
//
// ** WHY A CRON, NOT A ONE-OFF SQL MIGRATION **
// This project's existing precedent for a standing weekly night (Paris
// Bar's "Industry Mondays" -- see
// supabase/archive/update_2026-09-14_paris-bar-industry-mondays.sql) is a
// one-off SQL file hand-inserting occurrences through a fixed end date,
// which stops advancing once that date passes unless someone remembers to
// run another migration by hand. The Product Owner asked for Big Time
// Bingo to keep appearing automatically. Rather than build the full
// event_series/materializer subsystem sketched -- not yet built -- in
// INGESTION_BACKLOG.md item 2.16, this reuses this project's simplest
// existing shape for "automatic": a daily cron, same as every other
// single-venue connector, except its "fetch" step is
// generateMondayOccurrences() (pure date math) instead of an HTTP request.
// Every run recomputes the rolling window from "today," so the horizon
// keeps advancing with zero further manual maintenance.
//
// Protect this endpoint the same way as every other cron: set CRON_SECRET
// in Vercel and reference /api/cron-bigtimebingo in vercel.json's crons list.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Timing-safe secret comparison -- same rationale/implementation as every
// other cron in this project (see cron-trinosophes.js).
function timingSafeStringEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

const SOURCE_SLUG = SLUGS.bigtimebingo; // see api/_lib/source-slugs.js
const DEFAULT_STATUS = "approved"; // curated/confirmed content, same as cron-trinosophes.js

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const runHandle = await startRun(SOURCE_SLUG);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const dates = generateMondayOccurrences(today, HORIZON_DAYS);

  // See api/_lib/venue-lookup.js -- links to the existing Garden Bowl
  // venues row if the canonical-venue migration has been applied
  // (supabase/update_2026-09-22_gardenbowl-venue.sql), never creates or
  // guesses a fuzzy match. If that migration hasn't run yet in a given
  // environment, this resolves to null and the event rows fall back to
  // venue_name_raw only -- same self-heal-on-next-run behavior already
  // proven for Trinosophes.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const venueId = resolveVenueId(venueMap, VENUE_NAME);

  const rawRows = dates.map((dateStr) => ({
    ...buildOccurrenceRow(dateStr),
    venue_id: venueId,
  }));

  try {
    // Moderator protection, same shape/rationale as cron-outerlimitslounge.js's
    // 2026-09-22 fix: look up each row's current status AND description
    // before writing, so (a) an admin's approve/reject/pending_review
    // decision on a specific occurrence survives this merge-duplicates
    // upsert, and (b) a moderator's hand-edited description on a specific
    // occurrence (e.g. once that week's lineup/theme is actually known) is
    // never silently overwritten back to the generic generated description.
    // WP 0.17 fail-closed lookup: a failed lookup must never silently
    // default every row to DEFAULT_STATUS -- it aborts this run entirely
    // (zero event writes, HTTP 502) instead.
    let existingRowsByExternalId;
    try {
      existingRowsByExternalId = await lookupExistingRows(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        rawRows.map((r) => r.external_id),
        { select: "external_id,status,description" }
      );
    } catch (lookupErr) {
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: 502,
        error_sample: "Status lookup failed: " + lookupErr.message,
      });
      res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
      return;
    }
    const rowsWithStatus = rawRows.map((row) => {
      const existing = existingRowsByExternalId.get(row.external_id);
      const hasExistingDescription = !!(existing && existing.description && existing.description.trim());
      return {
        ...row,
        status: (existing && existing.status) || DEFAULT_STATUS,
        description: hasExistingDescription ? existing.description : row.description,
      };
    });

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rowsWithStatus),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      await finishRun(runHandle, {
        outcome: "failed",
        http_status: resp.status,
        records_fetched: dates.length,
        records_parsed: dates.length,
        records_written: 0,
        error_sample: "Supabase upsert failed: " + errText,
      });
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    await finishRun(runHandle, {
      outcome: "success",
      http_status: resp.status,
      records_fetched: dates.length,
      records_parsed: dates.length,
      records_written: rowsWithStatus.length,
    });
    res.status(200).json({ upserted: rowsWithStatus.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    await finishRun(runHandle, {
      outcome: "failed",
      records_fetched: dates.length,
      records_parsed: dates.length,
      error_sample: err.message,
    });
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
