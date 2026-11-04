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

const { provenanceLine } = require(path.join(__dirname, "..", "api", "_lib", "venue-knowledge"));

const REPAIRABLE_FIELDS = ["venue_address_raw", "venue_city_raw", "venue_id"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Classifies WHY a patch was possible, for the before/after measurement
// report the Product Owner asked for (refinement 10). This is reporting
// only — it never influences the actual repair decision, which is made
// solely by resolveVenueAddressCityRepair().
function classifyTier(event, canonicalMaps, learnedMap, decision) {
  // Issue #49: the decision itself says which tier answered it.
  if (decision && decision.tier) {
    if (decision.tier === "canonical_venue_id") return "canonical_venue_id";
    if (decision.tier === "canonical_name") return "canonical_name_match";
    return "learned_historical"; // learned, canonical_gap, campus, stated_in_location
  }
  if (event.venue_id && canonicalMaps.byId.has(event.venue_id)) return "canonical_venue_id";
  if (!event.venue_id) {
    const key = normalizeVenueName(event.venue_name_raw);
    const nameMatch = key && canonicalMaps.byName.get(key);
    if (nameMatch && typeof nameMatch === "object") return "canonical_name_match";
    if (key && learnedMap.has(key)) return "learned_historical";
  }
  return "unresolved";
}

// 2026-10-05: paged, soonest first. The single unordered 1,000-row read
// was 693 rows that day with 1,858 upcoming events; the inventory is
// growing and a row past the cap would simply never be repaired. Pages of
// 1,000 until a short page, 40 pages at most (the same ceiling as Admin's
// Needs Follow-up read, DEBT-003).
const WRITTEN_FIELDS_CAP = 100;
const AUTO_FILL_MARKER = "AUTO-FILL";

// Owner-supplied rows: Manual source, or a private note carrying an owner correction or an editorial hold. SH.1 NEVER writes
// these (Nov 4 owner direction: flagging after mutation is insufficient). The proposed fill is recorded as status "proposed"
// and goes to review; an approved fill is applied through the admin correction path, not by this job.
function isOwnerSuppliedRow(event) {
  const note = typeof event.internal_note === "string" ? event.internal_note : "";
  return String(event.source || "").toLowerCase() === "manual" || /OWNER-CORRECTION|EDITORIAL[-_ ]HOLD/i.test(note);
}

// One dated line per automated fill that has no VENUE_KNOWLEDGE_FILLED line: date, step, fields, tier, run id.
function autoFillLine(fields, decision, event, today, runId) {
  const tier = (decision && decision.tier) || "canonical";
  const name = event.venue_name_raw ? ` for "${String(event.venue_name_raw).replace(/[\r\n"]+/g, " ").slice(0, 80)}"` : "";
  return `${AUTO_FILL_MARKER} ${today}: ${fields.join(", ")} from ${tier}${name}; step SH.1 enrichment blank-field fill${runId ? `; run ${runId}` : ""}`;
}

const REPAIR_PAGE_SIZE = 1000;
const REPAIR_MAX_PAGES = 40;
async function fetchRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders) {
  const rows = [];
  for (let page = 0; page < REPAIR_MAX_PAGES; page++) {
    const url =
      `${SUPABASE_URL}/rest/v1/events` +
      `?start_date=gte.${todayIso()}` +
      `&status=neq.rejected` +
      `&or=(venue_address_raw.is.null,venue_city_raw.is.null)` +
      `&select=id,venue_id,venue_name_raw,venue_address_raw,venue_city_raw,start_date,status,source,external_id,feed_source_id,no_fixed_venue,internal_note,updated_at` +
      `&order=start_date.asc,id.asc` +
      `&limit=${REPAIR_PAGE_SIZE}&offset=${page * REPAIR_PAGE_SIZE}`;
    const resp = await fetch(url, { headers: sbHeaders });
    if (!resp.ok) throw new Error(`Failed to fetch repair candidates: HTTP ${resp.status}`);
    const batch = await resp.json();
    if (!Array.isArray(batch)) throw new Error("Unexpected response shape fetching repair candidates");
    rows.push(...batch);
    if (batch.length < REPAIR_PAGE_SIZE) break;
  }
  return rows;
}

// PATCHes exactly the fields in `patch`, with a WHERE filter that
// re-requires each of those fields to still be null right now. Returns
// true if the write actually applied (PostgREST returned the row),
// false if a concurrent change made the filter no longer match.
async function applyPatch(SUPABASE_URL, sbHeaders, eventId, patch, options = {}) {
  const stillBlankFilters = Object.keys(patch)
    .filter((k) => k === "venue_address_raw" || k === "venue_city_raw" || k === "venue_id")
    .map((k) => `${k}.is.null`);
  const filterQs = stillBlankFilters.length > 1
    ? `and=(${stillBlankFilters.join(",")})`
    : stillBlankFilters.map((f) => f.replace(".", "=")).join("");
  // Issue #49: a patch that also appends a provenance line to internal_note
  // is applied only if the row is exactly as it was read (updated_at), so a
  // note written in between is never lost.
  const guard = patch.internal_note !== undefined && options.updatedAt ? `&updated_at=eq.${encodeURIComponent(options.updatedAt)}` : "";
  const url = `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&${filterQs}${guard}`;
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
  runId = null,
  // Optional durable ledger {record(records) -> Promise<void> (throws on failure), hasProposal(key) -> Promise<boolean>}.
  // Absent until the enrichment_change_log table is approved; see scripts/enrichment-ledger.js.
  ledger = null,
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
    // 2026-09-22 (Outer Limits description repair integration): the ids of
    // events this run actually wrote to. api/admin-events.js's combined
    // Auto-Repair action unions this against the Outer Limits description
    // repair's own writtenIds to report an accurate "events repaired" count
    // when a single event needed both kinds of repair (blank venue AND
    // blank description) -- summing the two counters alone would double-
    // count that event. Purely additive; nothing here reads or uses it.
    writtenIds: [],
    // Nov 4 attribution (R&Q proposal, Nico Bones finding): which fields each written event received (capped), and
    // how many of the filled rows were owner-supplied (Manual source or an owner marker). Observation only.
    writtenFields: [],
    // Owner/Editorial rows are never written: the proposed fill is counted and (capped) listed here, and sent to the ledger.
    ownerRowSkipped: 0,
    proposedFills: [],
    proposedDeduped: 0,
    // Per-field change records handed to the ledger (applied or proposed). ledgerDurable says whether a durable ledger was
    // attached; without one (table not yet approved) applied fills carry only the AUTO-FILL note and the capped run summary.
    ledgerRecords: 0,
    ledgerDurable: !!ledger,
    ledgerFailedClosed: 0,
    // Issue #49: why the rest were not filled. A conflict goes to a person
    // (Needs Decision); a venue known from one source only is confirmed
    // once, at venue level; an excluded name (TBA, secret, multiple
    // locations, online, mobile, street segment, ambiguous) never inherits.
    conflicts: 0,
    needsVenueConfirmation: 0,
    excluded: 0,
    byTier: {},
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

  const today = todayIso();
  for (const event of candidates) {
    const owner = isOwnerSuppliedRow(event);
    const fieldPatch = resolveVenueAddressCityRepair(event, canonicalMaps, learnedMap);
    const decision = fieldPatch._decision || null;
    if (Object.keys(fieldPatch).length === 0) {
      counts.unresolved++;
      if (decision && decision.action === "conflict") counts.conflicts++;
      else if (decision && decision.action === "confirm") counts.needsVenueConfirmation++;
      else if (decision && decision.action === "excluded") counts.excluded++;
      continue;
    }
    counts.repairable++;
    if (decision && decision.tier) counts.byTier[decision.tier] = (counts.byTier[decision.tier] || 0) + 1;
    // Provenance: a fill from LEARNED knowledge (anything but the event's
    // own canonical venue record) says what filled it and from what
    // evidence, and the marker keeps the filled row out of future venue
    // evidence. A canonical fill is already traceable: it is the linked
    // venue's own record (venue_id).
    const patch = { ...fieldPatch };
    if (decision && decision.tier && decision.tier !== "canonical_venue_id" && decision.tier !== "canonical_name") {
      const line = provenanceLine(decision, today);
      patch.internal_note = event.internal_note ? `${event.internal_note}\n${line}` : line;
    } else {
      // A canonical fill is still an automated change to a stored row: say so, once, in the private note (Nov 4 finding:
      // an exact-name venue link on an owner-supplied row left no trace). A different marker from VENUE_KNOWLEDGE_FILLED, so
      // the learned-evidence rule that skips marked rows is unchanged.
      const line = autoFillLine(Object.keys(fieldPatch), decision, event, today, runId);
      patch.internal_note = event.internal_note ? `${event.internal_note}\n${line}` : line;
    }
    const tier = classifyTier(event, canonicalMaps, learnedMap, decision);
    const ledgerTier = (decision && decision.tier) || "canonical";
    const records = Object.keys(fieldPatch).map((field) => ({
      event_id: event.id, field, before: event[field] === undefined ? null : event[field], after: fieldPatch[field],
      source: `SH.1 ${ledgerTier}`, run_id: runId, status: owner ? "proposed" : "applied", at: new Date().toISOString(),
    }));
    if (owner) {
      // Owner/Editorial-supplied row: never patched. Record the proposal once (not re-queued daily) and move on.
      counts.ownerRowSkipped++;
      let fresh = true;
      try {
        if (ledger) {
          const dups = [];
          for (const r of records) dups.push(await ledger.hasProposal(`${r.event_id}|${r.field}|${r.after}`));
          fresh = dups.some((d) => !d);
          if (fresh) { await ledger.record(records.filter((_, i) => !dups[i])); counts.ledgerRecords += records.filter((_, i) => !dups[i]).length; }
        }
      } catch (err) {
        logger.warn(`Ledger write failed for proposed fill on ${event.id}: ${err.message}`);
      }
      if (!fresh) counts.proposedDeduped++;
      else if (counts.proposedFills.length < WRITTEN_FIELDS_CAP) counts.proposedFills.push({ id: event.id, fields: records.map((r) => r.field) });
      continue;
    }
    if (tier === "canonical_venue_id") counts.repairableFromCanonicalVenueId++;
    else if (tier === "canonical_name_match") counts.repairableFromCanonicalName++;
    else if (tier === "learned_historical") counts.repairableFromLearnedHistorical++;

    if (dryRun) {
      logger.log(`[dry-run] would patch event ${event.id} (${event.venue_name_raw || "no venue name"}):`, patch);
      continue;
    }
    // Fail closed: when a durable ledger is attached, the record is written BEFORE the patch; no record, no patch.
    if (ledger) {
      try { await ledger.record(records); counts.ledgerRecords += records.length; }
      catch (err) {
        counts.ledgerFailedClosed++;
        logger.warn(`Ledger write failed for event ${event.id}; fill skipped (fail closed): ${err.message}`);
        continue;
      }
    }
    const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, patch, { updatedAt: event.updated_at || null });
    if (applied) {
      counts.written++;
      counts.fieldsWritten += Object.keys(fieldPatch).length;
      counts.writtenIds.push(event.id);
      if (counts.writtenFields.length < WRITTEN_FIELDS_CAP) counts.writtenFields.push({ id: event.id, fields: Object.keys(fieldPatch) });
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
