// test/bigtimebingo-occurrences.test.js — pure date-generation layer for
// Big Time Bingo (api/_lib/bigtimebingo-occurrences.js:
// generateMondayOccurrences / buildOccurrenceRow).
//
// Added 2026-09-22 alongside api/cron-bigtimebingo.js. This module has no
// I/O, so these tests exercise it directly (no fetch mocking needed) --
// see cron-bigtimebingo-runlog.test.js for the handler-level tests
// (venue resolution, moderator protection, Needs Follow-up integration,
// fail-closed abort).
//
// Plain Node assert, no dependencies.
// Run: node test/bigtimebingo-occurrences.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const {
  generateMondayOccurrences,
  buildOccurrenceRow,
  TIME_DISPLAY,
  HORIZON_DAYS,
  EXTERNAL_ID_PREFIX,
} = require(`${REPO_DIR}/api/_lib/bigtimebingo-occurrences`);

// Returns the day of week (0=Sun..6=Sat) for a "YYYY-MM-DD" string,
// computed independently of generateMondayOccurrences's own internals (a
// fresh UTC-noon-anchored Date), so this is a real external check that
// every generated date is actually a Monday, not just an assumption that
// the function's own math is self-consistent.
function isActuallyMonday(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay() === 1;
}

async function run() {
  // --- 1 & 2. Only Mondays are generated, for a non-Monday anchor. ---
  {
    // 2026-09-22 is a Tuesday.
    const dates = generateMondayOccurrences("2026-09-22", 90);
    assert.ok(dates.length > 0, "must generate at least one occurrence");
    for (const d of dates) {
      assert.ok(isActuallyMonday(d), `${d} must be a real Monday`);
    }
    assert.strictEqual(dates[0], "2026-09-28", "first occurrence must be the next Monday on/after the anchor");
  }
  console.log("PASS: generateMondayOccurrences produces Monday-only dates for a non-Monday anchor");

  // --- Anchor that is itself a Monday includes that same day. ---
  {
    // 2026-09-28 is a Monday.
    const dates = generateMondayOccurrences("2026-09-28", 90);
    assert.strictEqual(dates[0], "2026-09-28", "an anchor that is itself a Monday must be included, not skipped");
    for (const d of dates) assert.ok(isActuallyMonday(d));
  }
  console.log("PASS: a Monday anchor date is included as the first occurrence, not skipped");

  // --- 90-day horizon matches INGESTION_BACKLOG.md's documented 13-occurrence figure. ---
  {
    assert.strictEqual(HORIZON_DAYS, 90, "the established rolling horizon (INGESTION_BACKLOG.md item 2.16) is 90 days");
    const dates = generateMondayOccurrences("2026-09-22", HORIZON_DAYS);
    assert.strictEqual(dates.length, 13, "a 90-day horizon from a non-Monday anchor must materialize 13 weekly occurrences, matching this project's own documented target");
    assert.strictEqual(dates[dates.length - 1], "2026-12-21");
  }
  console.log("PASS: the 90-day horizon materializes exactly 13 occurrences, matching the project's documented figure");

  // --- 3. No unsupported end time is ever written. ---
  {
    const row = buildOccurrenceRow("2026-09-28");
    assert.strictEqual(row.end_date, undefined, "no end_date must be set -- the source publishes no end time");
    assert.strictEqual(TIME_DISPLAY, "7:30 PM");
    assert.strictEqual(row.time_display, "7:30 PM");
    assert.ok(!/–|-|to |until /i.test(row.time_display) || row.time_display === "7:30 PM", "time_display must be a single start time, never a start-end range");
  }
  console.log("PASS: no end time is invented -- time_display is exactly the poster's start time, no end_date set");

  // --- 4. Start time stays 7:30 PM local across a real US DST transition. ---
  {
    // US DST ends Sunday 2026-11-01 (falls back). Generate occurrences
    // spanning that boundary and confirm every one of them is still a real
    // Monday AND still carries the exact same, unchanged display string --
    // proving the "7:30 PM" label is a hardcoded literal never derived from
    // any UTC-offset-sensitive computation that could have shifted it.
    const dates = generateMondayOccurrences("2026-10-19", 30); // spans Oct 19 -> Nov 18, crossing Nov 1 DST end
    assert.ok(dates.some((d) => d < "2026-11-01"), "must include at least one pre-DST-transition Monday");
    assert.ok(dates.some((d) => d >= "2026-11-01"), "must include at least one post-DST-transition Monday");
    for (const d of dates) {
      assert.ok(isActuallyMonday(d), `${d} must remain a real Monday across the DST boundary`);
      const row = buildOccurrenceRow(d);
      assert.strictEqual(row.time_display, "7:30 PM", `time_display for ${d} must not drift across the DST boundary`);
    }
  }
  console.log("PASS: 7:30 PM start time and correct Monday dates are unaffected by the Nov 1, 2026 US DST transition");

  // --- 5 & 6. Deterministic, stable external_id; re-running is idempotent. ---
  {
    const datesA = generateMondayOccurrences("2026-09-22", 90);
    const datesB = generateMondayOccurrences("2026-09-22", 90);
    assert.deepStrictEqual(datesA, datesB, "identical input must produce an identical, stably-ordered output every time");

    const idsA = datesA.map((d) => buildOccurrenceRow(d).external_id);
    const idsB = datesB.map((d) => buildOccurrenceRow(d).external_id);
    assert.deepStrictEqual(idsA, idsB, "re-running generation must yield identical external_ids, not new/duplicate ones");

    const uniqueIds = new Set(idsA);
    assert.strictEqual(uniqueIds.size, idsA.length, "every occurrence must get its own unique external_id -- no collisions");

    for (const d of datesA) {
      assert.strictEqual(buildOccurrenceRow(d).external_id, `${EXTERNAL_ID_PREFIX}-${d}`, "external_id must be the deterministic <prefix>-<date> shape, not random");
    }
  }
  console.log("PASS: external_ids are deterministic, unique per occurrence, and stable across repeated generation (idempotent)");

  // --- 11. Unsupported price/free metadata remains unknown (schema default, not invented). ---
  {
    const row = buildOccurrenceRow("2026-09-28");
    assert.strictEqual(row.is_free, undefined, "is_free must not be set by this generator -- relies on the events table's own default (false/unknown), never an invented claim");
    assert.strictEqual(row.price_from, undefined, "price_from must not be set -- price is not published by the source");
  }
  console.log("PASS: price/free metadata is left unset (schema default), never invented");

  // --- 12. No fake ticket URL; the durable Instagram identity goes in event_url. ---
  {
    const row = buildOccurrenceRow("2026-09-28");
    assert.strictEqual(row.ticket_url, undefined, "ticket_url must never be set -- no ticket URL is published, and the Instagram profile must not be put there either");
    assert.strictEqual(row.event_url, "https://www.instagram.com/bigtimebingo/", "the durable @bigtimebingo identity belongs in event_url, not ticket_url");
  }
  console.log("PASS: no fabricated ticket_url; the Instagram identity is preserved in event_url instead");

  // --- 9 & 10. Category is Nightlife & Club for this event, with no global taxonomy rule. ---
  {
    const row = buildOccurrenceRow("2026-09-28");
    assert.strictEqual(row.category, "nightlife", "Big Time Bingo must be categorized Nightlife & Club (21+ evening entertainment at a bar/bowling venue)");
    // Structural guard: this module must not export or define any
    // generic "bingo" -> category mapping table that other/future bingo
    // connectors could pick up -- the category here is hardcoded to this
    // one specific event's own context, not a reusable taxonomy rule.
    const src = require("fs").readFileSync(`${REPO_DIR}/api/_lib/bigtimebingo-occurrences.js`, "utf8");
    assert.ok(!/bingo\s*[:=]>?\s*['"]nightlife['"]/i.test(src) && !/CATEGORY_MAP|BINGO_CATEGOR/i.test(src), "must not introduce a generic bingo=>nightlife taxonomy rule");
  }
  console.log("PASS: category is Nightlife & Club for this specific event, with no generic bingo=>category rule introduced");

  // --- 13. 21+ is preserved (folded into description, per this project's established convention -- no structured field exists). ---
  {
    const row = buildOccurrenceRow("2026-09-28");
    assert.ok(/21\+/.test(row.description), "the source-confirmed 21+ age restriction must be preserved somewhere factual (description), per migration_034's established convention for events with no structured age-restriction column");
  }
  console.log("PASS: 21+ is preserved in description text, matching this project's established no-structured-field convention");

  console.log("\nAll bigtimebingo-occurrences.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
