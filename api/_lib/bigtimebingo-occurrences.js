// api/_lib/bigtimebingo-occurrences.js
//
// Pure, deterministic Monday-occurrence generator for "Big Time Bingo," a
// recurring weekly bingo night at Garden Bowl hosted by Mayor Darlington.
// Added 2026-09-22 from a promotional poster the Product Owner supplied
// directly (Garden Bowl has no page for this event, and it is not on
// Garden Bowl's normal event listings).
//
// ** SOURCE EVIDENCE (poster only) **
// The poster explicitly states: title ("Big Time Bingo"), recurrence
// ("Mondays"), venue ("Garden Bowl"), host ("Mayor Darlington"), start
// time ("7:30PM"), age restriction ("21+"), and a printed street address
// ("4120 Woodward Ave, Detroit, MI"). It does NOT state an end time, a
// price, or a ticket URL -- none of those are invented anywhere in this
// file. See ../../supabase/update_2026-09-22_gardenbowl-venue.sql for why
// the canonical venue address used elsewhere in this project (4140
// Woodward Ave, per majesticdetroit.com/garden-bowl's own current listing)
// differs from the poster's printed "4120" -- that discrepancy is a venue-
// record question, resolved there, and is deliberately NOT re-litigated or
// duplicated here: this module never writes an address itself.
//
// ** WHY A PURE FUNCTION, SEPARATE FROM THE CRON HANDLER **
// Every other connector in this project embeds its parsing logic directly
// in its cron-*.js handler and is only testable by mocking fetch() and
// inspecting the handler's output (see cron-trinosophes.js /
// cron-outerlimitslounge.js and their *-runlog.test.js files). That works
// because their non-determinism comes from an external page's content.
// This connector's only "input" is the calendar itself, so pulling the
// date math out into its own pure function (no I/O, no Date.now() call
// inside it -- the caller passes today's date in) makes the two riskiest
// properties -- "only ever a real Monday, for every anchor date" and
// "identical output for identical input, forever" (needed for a stable,
// idempotent external_id) -- directly unit-testable, including across a
// real US DST transition, without mocking the network at all.
//
// ** DST SAFETY **
// All date arithmetic below operates on UTC-anchored Date objects used
// purely to represent CALENDAR dates (year/month/day), via getUTCDay() /
// setUTCDate() / getUTCFullYear() etc. This is calendar-date math, not
// wall-clock/local-time math -- it never reads or computes a Detroit local
// hour, so a DST transition (which only changes the UTC offset for a given
// wall-clock hour, not which calendar day is a Monday) cannot shift any of
// these results. The displayed start time is a separate, hardcoded literal
// ("7:30 PM") in buildOccurrenceRow() below, never derived from any Date
// object -- so it likewise cannot drift across a DST boundary. See
// test/bigtimebingo-occurrences.test.js for a direct proof spanning the
// 2026-11-01 US "fall back" transition.

const VENUE_NAME = "Garden Bowl";
const EVENT_TITLE = "Big Time Bingo";
const TIME_DISPLAY = "7:30 PM"; // poster-confirmed start; no end time is published -- never invent one
const HORIZON_DAYS = 90; // matches INGESTION_BACKLOG.md item 2.16's documented (not yet built) Series-model horizon
const INSTAGRAM_URL = "https://www.instagram.com/bigtimebingo/";
const EXTERNAL_ID_PREFIX = "big-time-bingo";

const DESCRIPTION =
  "Big Time Bingo is a weekly Monday-night bingo event at Garden Bowl, hosted by Mayor Darlington. 21+.";

// Age restriction (21+): per this project's own established convention for
// events with no structured age-restriction column (see migration_034's
// header comment on Jody's earlier, explicit decision NOT to add one --
// "same posture as every other editorial caveat on this site... it goes in
// the free-text description/note"), 21+ is folded into the description
// text above rather than a new field.
const NOTE =
  "Source: Big Time Bingo promotional poster (@bigtimebingo). End time, price, and ticket link are not published by the source and are intentionally left blank rather than invented.";

/**
 * Returns every Monday's calendar date (as "YYYY-MM-DD" strings), starting
 * from the first Monday on or after `anchorDateStr`, through `horizonDays`
 * days after `anchorDateStr` inclusive.
 *
 * Pure: no clock reads, no I/O. Calling this twice with the same arguments
 * always returns the identical array (the property idempotent re-ingestion
 * / stable external_ids depends on).
 *
 * @param {string} anchorDateStr "YYYY-MM-DD"
 * @param {number} horizonDays
 * @returns {string[]}
 */
function generateMondayOccurrences(anchorDateStr, horizonDays) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchorDateStr);
  if (!m) throw new Error(`generateMondayOccurrences: invalid anchorDateStr ${JSON.stringify(anchorDateStr)}`);
  const [, yStr, moStr, dStr] = m;
  const y = Number(yStr), mo = Number(moStr), d = Number(dStr);

  const anchor = new Date(Date.UTC(y, mo - 1, d));
  const dayOfWeek = anchor.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const daysUntilMonday = (1 - dayOfWeek + 7) % 7; // 0 if anchor is itself a Monday

  const cursor = new Date(Date.UTC(y, mo - 1, d));
  cursor.setUTCDate(cursor.getUTCDate() + daysUntilMonday);

  const horizonEnd = new Date(Date.UTC(y, mo - 1, d));
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizonDays);

  const dates = [];
  while (cursor.getTime() <= horizonEnd.getTime()) {
    const yyyy = cursor.getUTCFullYear();
    const mm = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getUTCDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return dates;
}

/**
 * Builds the full row object for one Monday occurrence. Deliberately does
 * NOT set venue_id (the caller resolves and attaches that, same as every
 * other single-venue cron) and deliberately does NOT set is_free,
 * price_from, or ticket_url -- none of those are known from the source, and
 * this project's convention is to leave unsupported fields at their schema
 * default (false/null) rather than invent a value. event_url carries the
 * durable @bigtimebingo Instagram identity instead of a fabricated
 * ticket_url or a fabricated Garden Bowl event page.
 *
 * @param {string} dateStr "YYYY-MM-DD", one value from generateMondayOccurrences()
 */
function buildOccurrenceRow(dateStr) {
  return {
    external_id: `${EXTERNAL_ID_PREFIX}-${dateStr}`,
    title: EVENT_TITLE,
    description: DESCRIPTION,
    category: "nightlife",
    venue_name_raw: VENUE_NAME,
    start_date: dateStr,
    time_display: TIME_DISPLAY,
    is_recurring: true,
    event_url: INSTAGRAM_URL,
    source: "Big Time Bingo",
    note: NOTE,
  };
}

module.exports = {
  VENUE_NAME,
  EVENT_TITLE,
  TIME_DISPLAY,
  HORIZON_DAYS,
  INSTAGRAM_URL,
  EXTERNAL_ID_PREFIX,
  DESCRIPTION,
  NOTE,
  generateMondayOccurrences,
  buildOccurrenceRow,
};
