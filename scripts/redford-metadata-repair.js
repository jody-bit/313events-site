// scripts/redford-metadata-repair.js
//
// Authoritative Redford Theatre metadata repair (2026-09-23) -- Needs
// Follow-up Auto-Repair, step 4 (after SH.1 venue repair, Outer Limits
// description repair, and Dossin event_url repair). Currently 1 flagged
// Redford card ("Return of the Jedi (1983)", missing DESCRIPTION +
// TICKET/EVENT LINK).
//
// REUSES THE EXISTING, ALREADY-TESTED RECOVERY -- ADDS NO NEW PARSER:
// api/cron-redford-theatre.js already recovers all three fields for its
// own ongoing scheduled upsert (2026-09-22 Needs-Follow-up-reduction
// work): parseRedfordEvents() (title/date/time from the archive page,
// treated as immutable since the 2026-09-16 rewrite), extractEventUrls()
// (each event's own detail-page href, keyed by title, null when
// ambiguous), and fetchEventDetail() (description from .eventDesc,
// ticket_url ONLY when the detail page has exactly one "Buy Tickets"
// link -- never guessed when 2+ links make it ambiguous which showtime
// each belongs to). This file calls those exact functions, unmodified,
// via api/cron-redford-theatre.js's own exports. There is exactly one
// parser for this source.
//
// SCOPE: existing events already in the database (start_date >= today,
// status != 'rejected', source = "Redford Theatre", missing description
// and/or ticket_url and/or event_url). Never overwrites a nonblank value
// -- each of the three fields is only ever included in a write when that
// specific field is CURRENTLY blank on the candidate row. Never touches
// status or any other column. Detail-page fetches are lazy: only issued
// for a candidate that actually needs description or ticket_url (an
// event_url-only repair never fetches the detail page at all).
//
// SAFETY AT WRITE TIME: same race-safe pattern as SH.1's own script --
// the PATCH filter re-asserts `<field>.is.null` for every field in that
// write, so a moderator who filled any of them in between the fetch and
// the write is respected; PostgREST returning zero rows for that PATCH is
// counted as skipped, never as an error or a silent overwrite.
//
// Usage:
//   node scripts/redford-metadata-repair.js            (writes repairs)
//   node scripts/redford-metadata-repair.js --dry-run  (reports only, writes nothing)

const path = require("path");
const {
  parseRedfordEvents,
  extractEventUrls,
  fetchEventDetail,
  redfordExternalId,
  SOURCE_URL,
  SOURCE_NAME,
} = require(path.join(__dirname, "..", "api", "cron-redford-theatre"));

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Fetches the live archive page fresh and returns
// { eventUrlsByExternalId: Map<external_id, href> } -- reusing
// parseRedfordEvents()/extractEventUrls() exactly as the cron itself
// does, then joining them by title (the same join the cron's own
// rawRows.map() performs) and re-keying by the SAME external_id formula
// (redfordExternalId) so a repair candidate (identified by external_id)
// can be matched. A title with no href, or an ambiguous (multi-href)
// title, simply produces no map entry -- never guessed.
async function fetchArchivePageData(fetchImpl = fetch) {
  const r = await fetchImpl(SOURCE_URL, { headers: { "User-Agent": "Mozilla/5.0 (313.events event calendar)" } });
  if (!r.ok) throw new Error(`Fetch failed: HTTP ${r.status}`);
  const html = await r.text();
  const events = parseRedfordEvents(html);
  const eventUrlsByTitle = extractEventUrls(html);

  const eventUrlsByExternalId = new Map();
  for (const e of events) {
    const href = eventUrlsByTitle.get(e.title);
    if (href) eventUrlsByExternalId.set(redfordExternalId(e.date, e.title), href);
  }
  return { eventUrlsByExternalId };
}

async function fetchRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=neq.rejected` +
    `&source=eq.${encodeURIComponent(SOURCE_NAME)}` +
    `&or=(description.is.null,ticket_url.is.null,event_url.is.null)` +
    `&select=id,external_id,description,ticket_url,event_url,start_date,status` +
    `&limit=1000`;
  const resp = await fetch(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch Redford repair candidates: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching Redford repair candidates");
  return rows;
}

// PATCHes exactly the fields in `patch`, with a WHERE filter re-requiring
// each of those fields to still be null right now -- same conditional-
// PATCH shape as SH.1's own applyPatch().
async function applyPatch(SUPABASE_URL, sbHeaders, eventId, patch) {
  const stillBlankFilters = Object.keys(patch)
    .filter((k) => k === "description" || k === "ticket_url" || k === "event_url")
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

// The testable core. `fetchCandidates`/`fetchArchivePage`/`fetchDetail`/
// `applyPatchFn` are injectable, same convention as every other repair
// script in this project.
async function repairRedfordMetadata({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchRepairCandidates,
  fetchArchivePage = fetchArchivePageData,
  fetchDetail = fetchEventDetail,
  applyPatchFn = applyPatch,
} = {}) {
  const counts = {
    totalConsidered: 0,
    matched: 0,
    unmatched: 0,
    written: 0,
    fieldsWritten: 0,
    skippedConcurrentChange: 0,
    writtenIds: [],
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  const [candidates, { eventUrlsByExternalId }] = await Promise.all([
    fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders),
    fetchArchivePage(),
  ]);
  counts.totalConsidered = candidates.length;

  for (const event of candidates) {
    // Defensive re-check: never touch a field that isn't ACTUALLY blank on
    // this row right now, regardless of why the candidate query returned
    // it (it only needs ONE of the three fields blank to appear at all).
    const needsEventUrl = !(event.event_url && event.event_url.trim());
    const needsDescription = !(event.description && event.description.trim());
    const needsTicketUrl = !(event.ticket_url && event.ticket_url.trim());
    if (!needsEventUrl && !needsDescription && !needsTicketUrl) continue;

    const href = eventUrlsByExternalId.get(event.external_id);
    if (!href) {
      // No longer on the live page, or the title-to-href join was
      // ambiguous (extractEventUrls() itself already refuses to guess in
      // that case) -- nothing authoritative to recover from here.
      counts.unmatched++;
      continue;
    }
    counts.matched++;

    const patch = {};
    if (needsEventUrl) patch.event_url = href;

    if (needsDescription || needsTicketUrl) {
      // Lazy: only fetches the detail page when a candidate actually needs
      // description or ticket_url -- an event_url-only repair never
      // touches the detail page at all.
      const detail = await fetchDetail(href);
      if (needsDescription && detail.description && detail.description.trim()) {
        patch.description = detail.description;
      }
      if (needsTicketUrl && detail.ticket_url && detail.ticket_url.trim()) {
        // fetchEventDetail() itself already enforces the exactly-one-
        // "Buy Tickets"-link rule -- detail.ticket_url is null whenever
        // that page has zero or 2+ Buy Tickets links, so there is nothing
        // further to check here; this simply respects whatever that
        // function already decided.
        patch.ticket_url = detail.ticket_url;
      }
    }

    if (Object.keys(patch).length === 0) {
      // Matched, but the source itself had nothing new to offer for
      // whichever field(s) were actually blank (e.g. description missing
      // on the source page, or ticket_url genuinely ambiguous) -- left
      // blank, never fabricated.
      continue;
    }

    if (dryRun) {
      logger.log(`[dry-run] would patch event ${event.id} (external_id ${event.external_id}):`, patch);
      continue;
    }
    const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, patch);
    if (applied) {
      counts.written++;
      counts.fieldsWritten += Object.keys(patch).length;
      counts.writtenIds.push(event.id);
    } else {
      counts.skippedConcurrentChange++;
      logger.warn(`Skipped event ${event.id} — a field in ${JSON.stringify(patch)} was no longer null at write time (concurrent change).`);
    }
  }

  return counts;
}

module.exports = { repairRedfordMetadata, fetchRepairCandidates, applyPatch, fetchArchivePageData };

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  repairRedfordMetadata({ dryRun })
    .then((counts) => {
      console.log(`\nRedford Theatre metadata repair ${dryRun ? "(dry run) " : ""}summary:`);
      console.log(counts);
    })
    .catch((err) => {
      console.error("Redford Theatre metadata repair failed:", err);
      process.exitCode = 1;
    });
}
