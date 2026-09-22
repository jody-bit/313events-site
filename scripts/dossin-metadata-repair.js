// scripts/dossin-metadata-repair.js
//
// Authoritative Detroit Historical Society / Dossin Great Lakes Museum
// EVENT URL repair (2026-09-23) -- Needs Follow-up burn-down, source-
// specific step 3 (after SH.1 venue repair and Outer Limits description
// repair). 4 current Dossin cards are flagged DESCRIPTION + TICKET/EVENT
// LINK.
//
// WHAT IS ACTUALLY AVAILABLE, AND WHAT ISN'T:
// api/cron-dossin.js's own parseDossinEvents() header comment documents --
// from a real, previously-verified live fetch, diffed line-by-line during
// the 2026-09-21 BUG-002 incident -- that each event on the source page
// renders as four consecutive lines: TITLE, VENUE, a date/time block, then
// a "LEARN MORE" link. That link's href is now captured (see
// htmlToLines()'s and parseDossinEvents()'s 2026-09-23 additions in that
// file). There is nothing resembling a description/excerpt/synopsis
// anywhere in that four-line block, and no link distinct from "LEARN
// MORE" that could honestly be called a separate ticket URL. So this
// script ONLY EVER fills event_url. It never touches description (there
// is no source data for it -- see EPIC-006/Trinosophes' own investigation
// for what "genuinely no data" looks like; this is the same situation for
// description specifically, even though a link IS available) and never
// invents a ticket_url distinct from the one real link the page offers.
//
// GENERIC-LINK GUARD: this environment cannot live-verify that each
// event's "LEARN MORE" href is genuinely unique to that event rather than
// a repeated link back to a general calendar/homepage (DEBT-002 blocks
// live network access from here). Rather than assume either way, every
// fetch computes how many events share each href; an href used by more
// than one event in that fetch is treated as non-event-specific and is
// NEVER written to any event -- this enforces "never use a generic venue
// homepage merely to satisfy the link requirement" as a runtime check
// against real fetched data, not a hopeful assumption. Only an href
// unique to exactly one event in that fetch is eligible to be written.
//
// SCOPE: existing events already in the database (start_date >= today,
// status != 'rejected', source = "Detroit Historical Society", BOTH
// ticket_url and event_url currently blank -- i.e. genuinely missing the
// "ticket/event link" field per admin.html's getMissingFields()). Never
// overwrites a nonblank value. Never touches description, status, or any
// other column. Uses api/cron-dossin.js's own parseDossinEvents() and
// dossinExternalId() -- the exact same parsing and identity/matching
// logic the cron itself already uses -- so there is exactly one parser
// for this source, not two that could drift.
//
// SAFETY AT WRITE TIME: same race-safe pattern as SH.1's and the Outer
// Limits description repair's own scripts -- every PATCH re-asserts BOTH
// ticket_url.is.null AND event_url.is.null in its own WHERE filter, so a
// moderator who entered either link in the meantime is respected and the
// write is skipped, never overwritten.
//
// Usage:
//   node scripts/dossin-metadata-repair.js            (writes repairs)
//   node scripts/dossin-metadata-repair.js --dry-run  (reports only, writes nothing)

const path = require("path");
const {
  parseDossinEvents,
  dossinExternalId,
  SOURCE_URL,
  SOURCE_NAME,
} = require(path.join(__dirname, "..", "api", "cron-dossin"));

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Fetches the live page fresh and returns { map, genericLinksSkipped }:
// `map` is Map<external_id, event_url>, containing ONLY hrefs unique to
// exactly one event in this fetch -- see this file's own header comment
// on the generic-link guard. `genericLinksSkipped` counts how many real,
// present links were rejected for being shared by more than one event
// (surfaced in repairDossinMetadata()'s own counts, never silently
// dropped).
async function fetchEventUrlsByExternalId(fetchImpl = fetch) {
  const r = await fetchImpl(SOURCE_URL, { headers: { "User-Agent": "Mozilla/5.0 (313.events event calendar)" } });
  if (!r.ok) throw new Error(`Fetch failed: HTTP ${r.status}`);
  const html = await r.text();
  const events = parseDossinEvents(html);

  const hrefCounts = new Map();
  for (const e of events) {
    if (!e.event_url) continue;
    hrefCounts.set(e.event_url, (hrefCounts.get(e.event_url) || 0) + 1);
  }

  const map = new Map();
  let genericLinksSkipped = 0;
  for (const e of events) {
    if (!e.event_url) continue;
    if (hrefCounts.get(e.event_url) > 1) {
      genericLinksSkipped++;
      continue; // shared across multiple events -- never event-specific, never used
    }
    map.set(dossinExternalId(e.date, e.title), e.event_url);
  }
  return { map, genericLinksSkipped };
}

async function fetchRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=neq.rejected` +
    `&source=eq.${encodeURIComponent(SOURCE_NAME)}` +
    `&ticket_url=is.null&event_url=is.null` +
    `&select=id,external_id,ticket_url,event_url,start_date,status` +
    `&limit=1000`;
  const resp = await fetch(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch Dossin repair candidates: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching Dossin repair candidates");
  return rows;
}

// PATCHes ONLY event_url, with a WHERE filter that re-requires BOTH
// ticket_url and event_url to still be null right now. Returns true if the
// write actually applied, false if a concurrent change (a moderator
// filling in either link between the fetch and this write) made the
// filter no longer match.
async function applyPatch(SUPABASE_URL, sbHeaders, eventId, eventUrl) {
  const url = `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&ticket_url=is.null&event_url=is.null`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ event_url: eventUrl }),
  });
  if (!resp.ok) throw new Error(`PATCH failed for event ${eventId}: HTTP ${resp.status}`);
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

// The testable core. `fetchCandidates`/`applyPatchFn`/`fetchEventUrls` are
// injectable, same convention as SH.1's and the Outer Limits description
// repair's own scripts.
async function repairDossinMetadata({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchRepairCandidates,
  fetchEventUrls = fetchEventUrlsByExternalId,
  applyPatchFn = applyPatch,
} = {}) {
  const counts = {
    totalConsidered: 0,
    matched: 0,
    unmatched: 0,
    genericLinksSkipped: 0,
    written: 0,
    skippedConcurrentChange: 0,
    writtenIds: [],
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  const [candidates, { map: eventUrlsByExternalId, genericLinksSkipped }] = await Promise.all([
    fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders),
    fetchEventUrls(),
  ]);
  counts.totalConsidered = candidates.length;
  counts.genericLinksSkipped = genericLinksSkipped;

  for (const event of candidates) {
    // Defensive re-check -- never touch a candidate that already has
    // either link populated, even if the query above somehow returned one.
    if ((event.ticket_url && event.ticket_url.trim()) || (event.event_url && event.event_url.trim())) continue;

    if (!eventUrlsByExternalId.has(event.external_id)) {
      counts.unmatched++;
      continue;
    }
    counts.matched++;
    const eventUrl = eventUrlsByExternalId.get(event.external_id);

    if (dryRun) {
      logger.log(`[dry-run] would set event_url for event ${event.id} (external_id ${event.external_id})`);
      continue;
    }
    const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, eventUrl);
    if (applied) {
      counts.written++;
      counts.writtenIds.push(event.id);
    } else {
      counts.skippedConcurrentChange++;
      logger.warn(`Skipped event ${event.id} — a link field was no longer null at write time (concurrent change).`);
    }
  }

  return counts;
}

module.exports = { repairDossinMetadata, fetchRepairCandidates, applyPatch, fetchEventUrlsByExternalId };

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  repairDossinMetadata({ dryRun })
    .then((counts) => {
      console.log(`\nDossin metadata repair ${dryRun ? "(dry run) " : ""}summary:`);
      console.log(counts);
    })
    .catch((err) => {
      console.error("Dossin metadata repair failed:", err);
      process.exitCode = 1;
    });
}
