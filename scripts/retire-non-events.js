"use strict";

// scripts/retire-non-events.js — takes entries that are NOT EVENTS out of the
// public inventory (Product Owner, 2026-10-05: "civic non-event pollution").
//
// The shared title filter (api/_lib/non-event-filter.js) already keeps such
// an entry from being WRITTEN by the feeds, Ticketmaster and Localist
// connectors -- from the day a pattern exists. It does nothing about rows
// stored before that day, and their feeds stop touching them the moment the
// filter skips the entry, so they would stay public until their dates
// passed. Measured in production on 2026-10-05, 30 upcoming approved rows:
//   16  "City Buildings Closed"            Sterling Heights (two sibling feeds)
//    5  "Library Closed"                   Madison Heights
//    3  "Macomb Township Offices Closed"   Macomb Township
//    6  "<artist> - Suite Rental"          Ticketmaster (a corporate-box
//        upsell listed beside the real show; a pattern since 2026-10-01)
// This pass applies the SAME filter -- nothing of its own -- to what is
// stored, and retires a match the way a duplicate is retired: status
// 'rejected', a NON_EVENT_RETIRED line in internal_note saying which rule
// and when. Kept, never deleted; it shows under Admin > Recently hidden.
//
// What it leaves alone:
//   - a row that is not public (pending_review is a reviewer's to decide);
//   - a row a person entered or submitted and a person approved (source
//     "Manual", "Venue Submission", "Editorial Review");
//   - A ROW A REVIEWER RESTORED. An approved row that already carries the
//     NON_EVENT_RETIRED line was put back by a person; it is never retired
//     again.
// The rule itself, and the titles it must NOT match ("Case Closed: A Murder
// Mystery Dinner", "Bocce Barn Closing Day", "Library Closed: A Drag Reading
// Hour"), are in api/_lib/non-event-filter.js and its test.
//
// Dry run: NON_EVENT_RETIREMENT_DRY_RUN=true, or --dry-run on the command line.

const path = require("path");
const { nonEventRule } = require(path.join(__dirname, "..", "api", "_lib", "non-event-filter"));

const PAGE_SIZE = 1000;
const MAX_PAGES = 40;
const MAX_PER_RUN = 100;
const NOTE_TAG = "NON_EVENT_RETIRED | v1";
// Rows that exist because a person wrote them and a person approved them.
const HUMAN_SOURCES = new Set(["Manual", "Venue Submission", "Editorial Review"]);
const isOn = (value) => /^(?:true|1|yes|on)$/i.test(String(value || "").trim());
const SELECT = "id,title,start_date,end_date,source,status,internal_note";

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Detroit" });
}

// Upcoming (or still running) public rows.
async function fetchPublicRows(SUPABASE_URL, sbHeaders, fetchFn) {
  const rows = [];
  const today = todayIso();
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${SUPABASE_URL}/rest/v1/events?status=eq.approved&or=(start_date.gte.${today},end_date.gte.${today})&select=${SELECT}&order=start_date.asc,id.asc&limit=${PAGE_SIZE}&offset=${rows.length}`;
    const resp = await fetchFn(url, { headers: sbHeaders });
    if (!resp.ok) throw new Error(`Failed to fetch events for non-event retirement: HTTP ${resp.status}`);
    const batch = await resp.json();
    if (!Array.isArray(batch)) throw new Error("Unexpected response shape fetching events");
    if (!batch.length) return rows;
    rows.push(...batch);
  }
  throw new Error(`still reading events after ${MAX_PAGES} requests; refusing to work from a partial list`);
}

// rows -> [{ row, rule }] : what would be retired.
function planRetirement(rows) {
  const plan = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.status !== "approved" || HUMAN_SOURCES.has(row.source)) continue;
    if (String(row.internal_note || "").includes(NOTE_TAG)) continue; // restored by a reviewer
    const rule = nonEventRule(row.title);
    if (rule) plan.push({ row, rule });
  }
  return plan;
}

async function retireNonEvents({
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  dryRun = isOn(process.env.NON_EVENT_RETIREMENT_DRY_RUN),
  fetchFn = fetch,
  fetchRows = null,
  maxPerRun = MAX_PER_RUN,
  logger = console,
} = {}) {
  const counts = { considered: 0, matched: 0, retired: 0, deferredByCap: 0, failed: 0, byRule: {}, detail: [], writtenIds: [], dryRun };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  const rows = fetchRows ? await fetchRows() : await fetchPublicRows(SUPABASE_URL, sbHeaders, fetchFn);
  counts.considered = rows.length;
  const plan = planRetirement(rows);
  counts.matched = plan.length;
  const at = todayIso();
  let applied = 0;
  for (const { row, rule } of plan) {
    counts.byRule[rule] = (counts.byRule[rule] || 0) + 1;
    const entry = { id: row.id, title: row.title, start_date: row.start_date, source: row.source, rule };
    if (applied >= maxPerRun) { counts.deferredByCap++; continue; }
    applied++;
    if (dryRun) { counts.detail.push({ ...entry, dryRun: true }); continue; }
    const line = `${NOTE_TAG} | rule=${rule} | at=${at}`;
    const note = String(row.internal_note || "").trim();
    try {
      // Guarded on the status that was read: a row someone changed meanwhile
      // is left exactly as they left it.
      const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(row.id)}&status=eq.approved`, {
        method: "PATCH",
        headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ status: "rejected", internal_note: note ? `${note}\n${line}` : line }),
      });
      // The rows the PATCH changed. If the answer cannot be read, the write
      // itself was accepted: count it rather than lose track of it.
      const changed = resp.ok ? await resp.json().catch(() => null) : [];
      if (resp.ok && (changed === null || (Array.isArray(changed) && changed.length))) {
        counts.retired++;
        counts.writtenIds.push(row.id);
        counts.detail.push(entry);
      } else if (!resp.ok) {
        counts.failed++;
        counts.detail.push({ ...entry, error: `HTTP ${resp.status}` });
      }
    } catch (err) {
      counts.failed++;
      counts.detail.push({ ...entry, error: err.message });
    }
  }
  return counts;
}

module.exports = { retireNonEvents, planRetirement, fetchPublicRows, NOTE_TAG, MAX_PER_RUN };

if (require.main === module) {
  retireNonEvents({ dryRun: process.argv.includes("--dry-run") || isOn(process.env.NON_EVENT_RETIREMENT_DRY_RUN) })
    .then((c) => { console.log(JSON.stringify(c, null, 2)); })
    .catch((e) => { console.error(e); process.exit(1); });
}
