// scripts/visitdetroit-dead-link-repair.js
//
// VisitDetroit dead-event-URL self-healing (2026-09-28) -- Needs
// Follow-up burn-down, dead-link pass. Uses api/_lib/link-health.js's
// generic healEventUrl() framework with api/_lib/visitdetroit-link-
// recovery.js's VisitDetroit-specific recovery strategy registered.
//
// SCOPE: existing VisitDetroit events already in the database (start_date
// >= today, status != 'rejected', ticket_url currently non-blank --
// VisitDetroit's own cron only ever populates ticket_url, never
// event_url, see api/cron-visitdetroit.js). Live-checks each one's stored
// ticket_url:
//   - ok           -> link_check_status='ok', link_checked_at=now().
//   - dead, and the VisitDetroit recovery strategy confidently finds +
//     revalidates a replacement -> ticket_url updated to the new URL,
//     link_check_status='ok', link_checked_at=now().
//   - dead, unrepaired          -> link_check_status='dead',
//     link_checked_at=now(). This is what makes admin.html surface the new
//     "dead event/ticket link" Needs Follow-up reason.
//   - inconclusive (timeout/403/429/5xx) -> NO write at all. See
//     classifyUrlCheck's own header -- a lookup failure is never evidence
//     of anything, and never overwrites a prior status.
//
// SAFETY AT WRITE TIME: every PATCH re-asserts ticket_url=eq.<the exact
// value this run read and checked> in its own WHERE filter, same race-safe
// pattern as every other repair script in this project (e.g.
// dossin-metadata-repair.js) -- a moderator who changed the link in the
// meantime is respected; the write is skipped, never overwritten.
//
// Usage:
//   node scripts/visitdetroit-dead-link-repair.js            (writes)
//   node scripts/visitdetroit-dead-link-repair.js --dry-run  (reports only)

const { healEventUrl, registerRecoveryStrategy, classifyRecoveryOutcome } = require("../api/_lib/link-health");
const { visitDetroitRecoveryStrategy } = require("../api/_lib/visitdetroit-link-recovery");

registerRecoveryStrategy("visitdetroit.com", visitDetroitRecoveryStrategy);

const SOURCE_NAME = "VisitDetroit";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders, fetchImpl = fetch) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=neq.rejected` +
    `&source=eq.${encodeURIComponent(SOURCE_NAME)}` +
    `&ticket_url=not.is.null` +
    `&select=id,external_id,title,ticket_url,link_check_status` +
    `&limit=1000`;
  const resp = await fetchImpl(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch VisitDetroit link-repair candidates: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching VisitDetroit link-repair candidates");
  return rows;
}

// Re-asserts ticket_url=eq.<originalUrl> in the WHERE filter -- a
// concurrent edit (a moderator fixing the link by hand between the fetch
// and this write) is respected, never overwritten. Returns true if the
// write actually applied.
async function applyPatch(SUPABASE_URL, sbHeaders, eventId, originalUrl, patchBody, fetchImpl = fetch) {
  const url =
    `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}` +
    `&ticket_url=eq.${encodeURIComponent(originalUrl)}`;
  const resp = await fetchImpl(url, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patchBody),
  });
  if (!resp.ok) throw new Error(`PATCH failed for event ${eventId}: HTTP ${resp.status}`);
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

// The testable core. `fetchCandidates`/`applyPatchFn`/`healFn`/`fetchFn`
// are all injectable, same convention as every other repair script in
// this project.
async function repairVisitDetroitDeadLinks({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchRepairCandidates,
  applyPatchFn = applyPatch,
  healFn = healEventUrl,
  fetchFn = fetch,
} = {}) {
  const counts = {
    totalConsidered: 0,
    ok: 0,
    repaired: 0,
    stillDead: 0,
    inconclusive: 0,
    skippedConcurrentChange: 0,
    written: 0,
    fieldsWritten: 0,
    writtenIds: [],
    // Jody's 2026-09-29 dead-link outcome vocabulary -- tallied for every
    // event whose ORIGINAL url comes back confirmed dead (regardless of
    // whether this run actually issues a write for it, e.g. an
    // already-recorded-dead event that's still unrepaired), so the count
    // reflects every dead link this run reasoned about, not just the
    // ones it happened to touch. See classifyRecoveryOutcome() in
    // api/_lib/link-health.js for what each code means and why
    // LINK_DEAD_REMOVED/EVENT_CONFIRMED_CANCELLED/EVENT_SOURCE_GONE are
    // currently always 0 (reserved for a future strategy that can
    // positively assert one of them -- never inferred from a dead link
    // alone).
    byOutcome: {
      LINK_DEAD_REPLACED: 0,
      LINK_DEAD_REMOVED: 0,
      EVENT_CONFIRMED_CANCELLED: 0,
      EVENT_SOURCE_GONE: 0,
      RECOVERY_UNCERTAIN: 0,
    },
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  const candidates = await fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders, fetchFn);
  counts.totalConsidered = candidates.length;

  for (const event of candidates) {
    if (!event.ticket_url || !event.ticket_url.trim()) continue; // defensive re-check

    const result = await healFn({ url: event.ticket_url, title: event.title, fetchFn });

    if (result.classification === "inconclusive") {
      counts.inconclusive++;
      continue; // never write on an inconclusive check
    }

    if (result.classification === "dead") {
      const outcome = classifyRecoveryOutcome({ repaired: result.repaired });
      counts.byOutcome[outcome]++;
    }

    let patchBody;
    if (result.classification === "ok") {
      counts.ok++;
      if (event.link_check_status === "ok") continue; // already recorded as ok — nothing changed
      patchBody = { link_check_status: "ok", link_checked_at: new Date().toISOString() };
    } else if (result.repaired) {
      counts.repaired++;
      patchBody = {
        ticket_url: result.newUrl,
        link_check_status: "ok",
        link_checked_at: new Date().toISOString(),
      };
    } else {
      counts.stillDead++;
      if (event.link_check_status === "dead") continue; // already recorded as dead — nothing changed
      patchBody = { link_check_status: "dead", link_checked_at: new Date().toISOString() };
    }

    if (dryRun) {
      logger.log(`[dry-run] would write ${JSON.stringify(patchBody)} for event ${event.id} (${event.title})`);
      continue;
    }

    const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, event.ticket_url, patchBody, fetchFn);
    if (applied) {
      counts.written++;
      counts.fieldsWritten += Object.keys(patchBody).length;
      counts.writtenIds.push(event.id);
    } else {
      counts.skippedConcurrentChange++;
      logger.warn(`Skipped event ${event.id} — ticket_url changed since this run started (concurrent edit).`);
    }
  }

  return counts;
}

module.exports = { repairVisitDetroitDeadLinks, fetchRepairCandidates, applyPatch };

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  repairVisitDetroitDeadLinks({ dryRun })
    .then((counts) => {
      console.log(`\nVisitDetroit dead-link repair ${dryRun ? "(dry run) " : ""}summary:`);
      console.log(counts);
    })
    .catch((err) => {
      console.error("VisitDetroit dead-link repair failed:", err);
      process.exitCode = 1;
    });
}
