// scripts/ra-sync.js
//
// RA (Resident Advisor) sync — server-side pipeline (2026-09-25).
//
// Replaces the old design where the device's own scheduled Claude task did
// EVERYTHING: diffed candidate ids against production via a bespoke
// endpoint (api/known-ra-ids.js), derived every event field itself from
// natural-language rules written only in that task's own prompt, wrote a
// hand-authored SQL file, and waited for Jody to run it by hand in the
// Supabase SQL editor. See the "RA Sync: Simplified Server-Side
// Architecture" doc (approved 2026-09-25) for the full rationale; this
// file is that design's Decision 8 ("translate the existing prompt-based
// derivation rules into tested deterministic code, do not redesign them
// while migrating") plus Decisions 1, 2, 5 and 9.
//
// WHAT STAYS WHERE IT WAS (Decision 7 — do not build a new crawler, do not
// move ra.co acquisition to Vercel): the device's browser-driven session
// still walks RA's own listing page and fetches each event's detail page
// and JSON-LD — RA's DataDome anti-bot defenses specifically target
// automated/datacenter traffic, and a Vercel serverless function making
// those same requests would very likely be blocked the same way. Nothing
// in this file ever talks to ra.co.
//
// TWO-PHASE SESSION MODEL (Decision 5 — "model each RA run as one sync
// session"): one RA run = one source_runs row, and that row's own id IS
// the session id (see migration_039_ra_sync_session_data.sql).
//   startRaSyncSession()    — the device's candidate listing-walk ids go
//                             in; a session id + the diffed "genuinely new,
//                             fetch these" id list (capped, same as the
//                             old ~30/run limit) come back.
//   completeRaSyncSession() — the device's fetched detail data for
//                             (some or all of) those ids goes in, keyed by
//                             the same session id; validation, field
//                             derivation, conservative cross-source
//                             dedupe, and the actual database write all
//                             happen here, then the session is closed.
// A session that starts but never completes (the device's browser session
// dies, RA re-blocks mid-run, etc.) simply stays source_runs.outcome=
// 'started', finished_at=null forever — the exact same "abandoned run"
// signal migration_035 already gives every other connector for free. A
// Claude scheduled task's own "succeeded" status is a completely different
// signal (did the wrapper script finish) from whether it ever actually
// called completeRaSyncSession() — the Admin observability panel
// (api/admin-ra.js) only ever reads source_runs, never the scheduled
// task's own run status, so the two can never be conflated.
//
// WHAT MOVED SERVER-SIDE (Decisions 1, 2, 9): the known-id diff
// (lookupExistingRows + computeCandidateNewIds, reused unchanged from
// api/_lib/status-lookup.js and api/_lib/ra-known-ids.js — including the
// ra-2485347 legacy exclusion), field derivation (this file, new), a
// conservative fuzzy title/venue/date dedupe check against EXISTING
// NON-RA EVENTS ONLY (reusing admin-events.js's ilike pattern) — this
// never overwrites a canonical non-RA row, it only ever decides not to
// create a second one, and direct idempotent upsert writes
// (on_conflict=external_id, same as every other connector), replacing the
// old hand-written-SQL + manual-Supabase-editor-run step entirely.
//
// DESCRIPTION — ONE DELIBERATE DEPARTURE FROM THE OLD PROMPT, FLAGGED
// HONESTLY: the old prompt asked for RA's promotional copy to be
// "condensed to a concise, fact-only summary" — that is a generation
// task, not an extraction one, and can't be done by deterministic code
// without an LLM call in the loop. deriveDescription() below does the
// closest deterministic equivalent instead: strip HTML, collapse
// whitespace, and cap length, keeping RA's own words rather than
// rewriting them. This is a real, intentional behavior change from the
// old prompt, not an oversight — see the migration doc's open-decisions
// list.
//
// ROLLBACK (Decision 6): api/known-ra-ids.js and RA_AUTOMATION_SECRET are
// untouched by this file and this migration. They stay in place,
// unused by the new workflow once it's activated, until at least two
// successful production RA syncs have run through this pipeline — then
// they can be retired.
"use strict";

const {
  lookupExistingRows,
  lookupExistingStatuses,
} = require("../api/_lib/status-lookup");
const { startRun, finishRun } = require("../api/_lib/run-log");
const { SLUGS } = require("../api/_lib/source-slugs");
const { buildVenueNameToIdMap, resolveVenueId } = require("../api/_lib/venue-lookup");
const {
  RA_ID_PATTERN,
  parseCandidateIds,
  computeKnownIds,
  computeCandidateNewIds,
} = require("../api/_lib/ra-known-ids");

class RaSyncSessionError extends Error {
  constructor(message) {
    super(message);
    this.name = "RaSyncSessionError";
  }
}

// ---------------------------------------------------------------------------
// Pure field-derivation helpers — translated 1:1 from the old scheduled
// task prompt's "STYLE CONVENTIONS" section. Every one of these is a pure
// function: same input, same output, no network, no Date.now() ambiguity
// (dates are parsed directly out of RA's own ISO strings, never computed
// relative to "now").

// RA's JSON-LD startDate/endDate are ISO datetimes that already carry
// RA's own local offset for the event (e.g. "2026-12-12T21:00:00-05:00").
// The digits right after "T" are already the correct local hour/minute
// regardless of the offset suffix — parsing them directly avoids any
// timezone conversion, which would be wrong here anyway (a serverless
// function's own local timezone has nothing to do with Detroit's).
function parseIsoLocal(iso) {
  if (typeof iso !== "string") return null;
  const withTime = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (withTime) {
    return { date: withTime[1], hour: parseInt(withTime[2], 10), minute: parseInt(withTime[3], 10) };
  }
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(iso);
  if (dateOnly) return { date: dateOnly[1], hour: null, minute: null };
  return null;
}

function formatClock(hour, minute) {
  if (hour === null || hour === undefined || minute === null || minute === undefined) return null;
  const period = hour >= 12 ? "PM" : "AM";
  let h12 = hour % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${period}`;
}

// end_date is only ever set when RA's own endDate lands on a LATER
// calendar date than startDate (the normal case for a club night running
// past midnight — see the real 2026-09-22 ra-sync-1.sql examples, every
// one of which ends the day after it starts). Never inferred, never
// defaulted to "same as start" — a same-day event with no stated end
// keeps end_date null, same "never invent a fact RA didn't state"
// posture as every other field here.
function deriveTimeDisplayAndEndDate(startIso, endIso) {
  const start = parseIsoLocal(startIso);
  const end = endIso ? parseIsoLocal(endIso) : null;
  const endDate = end && start && end.date !== start.date ? end.date : null;
  const startClock = start ? formatClock(start.hour, start.minute) : null;
  const endClock = end ? formatClock(end.hour, end.minute) : null;
  let timeDisplay = null;
  if (startClock && endClock) timeDisplay = `${startClock}–${endClock}`;
  else if (startClock) timeDisplay = startClock;
  return { endDate, timeDisplay };
}

// venue_city_raw comes from the free-text street address, never from RA's
// own addressRegion (which mislabels every Detroit-metro event's region as
// "Detroit" regardless of real city — see the old prompt's own note on
// Ferndale/Hamtramck/Royal Oak/Pontiac). Only ever splits an address whose
// text actually ends in ", <City>, MI" — anchored on "MI" since this
// project is Detroit-metro-only (SERVICE_AREA.md); an address with no such
// suffix is kept whole as the street address with city left null, never
// guessed.
function parseAddressText(addressText) {
  if (typeof addressText !== "string" || !addressText.trim()) return { street: null, city: null };
  const trimmed = addressText.trim();
  const m = /^(.*?),\s*([A-Za-z][A-Za-z .'-]*?),\s*MI\b/.exec(trimmed);
  if (!m) return { street: trimmed, city: null };
  return { street: m[1].trim(), city: m[2].trim() };
}

// price_from: RA's own offers.price, taken at face value. price=0 is an
// EXPLICIT statement of free admission (is_free=true); no price field at
// all is left unknown (price_from=null, is_free=false) — "never assume
// free without an explicit statement," per the old prompt.
function deriveOffer(offersPrice) {
  if (offersPrice === null || offersPrice === undefined || offersPrice === "") {
    return { priceFrom: null, isFree: false };
  }
  const n = typeof offersPrice === "number" ? offersPrice : parseFloat(String(offersPrice).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return { priceFrom: null, isFree: false };
  if (n === 0) return { priceFrom: null, isFree: true };
  return { priceFrom: n, isFree: false };
}

function deriveTicketUrl(numericId, jsonLdUrl) {
  if (typeof jsonLdUrl === "string" && /^https?:\/\//.test(jsonLdUrl)) return jsonLdUrl;
  return `https://ra.co/events/${numericId}`;
}

function deriveImageUrl(image) {
  const candidate = Array.isArray(image) ? image[0] : image;
  return typeof candidate === "string" && /^https?:\/\//.test(candidate) ? candidate : null;
}

// See this file's header comment — condensing to a fact-only summary is a
// generation task the old prompt asked a human/agent to do; this is the
// deterministic equivalent (strip, collapse whitespace, cap length),
// keeping RA's own words rather than rewriting them.
const DESCRIPTION_MAX_LEN = 500;
function deriveDescription(raw) {
  if (typeof raw !== "string") return null;
  const stripped = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return null;
  return stripped.length > DESCRIPTION_MAX_LEN
    ? stripped.slice(0, DESCRIPTION_MAX_LEN).trim() + "…"
    : stripped;
}

function isCancelledTitle(title) {
  return typeof title === "string" && title.trim().toUpperCase().startsWith("[CANCELLED]");
}

// category: the old prompt gave examples, not an exhaustive rule set —
// DJ/club nights -> nightlife, live bands -> music, markets/community
// gatherings -> community, art installations/exhibitions -> visual,
// burlesque/cabaret/drag -> theatre. Translated here as ordered keyword
// rules (first match wins) with 'nightlife' as the default, matching the
// old prompt's own framing (RA is fundamentally a club-night/DJ listing
// site) and every historical RA insert in supabase/update_2026-09-*_ra-*
// .sql, which is 100% category='nightlife'.
const CATEGORY_KEYWORD_RULES = [
  [/\b(drag|burlesque|cabaret)\b/i, "theatre"],
  [/\b(film|screening|cinema)\b/i, "film"],
  [/\b(market|bazaar|swap meet|craft fair|flea market)\b/i, "community"],
  [/\b(exhibit|installation|gallery opening|art show|art fair)\b/i, "visual"],
  [/\b(live band|live music|performs live|in concert)\b/i, "music"],
];
const DEFAULT_CATEGORY = "nightlife";
function deriveCategory(title, description) {
  const haystack = `${title || ""} ${description || ""}`;
  for (const [re, category] of CATEGORY_KEYWORD_RULES) {
    if (re.test(haystack)) return category;
  }
  return DEFAULT_CATEGORY;
}

// Builds the full events-table row for one candidate, or reports why it
// can't. Pure — venueMap is the caller's already-fetched
// buildVenueNameToIdMap() result, not fetched here. `raw` is the shape the
// device is expected to submit per candidate: { id, title, description,
// startDate, endDate, venueName, address, image, offersPrice, url } — the
// same MusicEvent JSON-LD fields the old prompt already told the device to
// extract (name, description, startDate, endDate, location.name,
// location.address.streetAddress, image, offers.price, url), just handed
// to the server instead of hand-derived on the device.
function deriveEventRow(raw, venueMap) {
  const errors = [];
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) errors.push("MISSING_TITLE");
  const start = raw && typeof raw.startDate === "string" ? parseIsoLocal(raw.startDate) : null;
  if (!start) errors.push("MISSING_OR_INVALID_START_DATE");
  if (errors.length) return { row: null, errors };

  const description = deriveDescription(raw.description);
  const category = deriveCategory(title, raw.description || "");
  const { street, city } = parseAddressText(raw.address);
  const hasAddress = !!street;
  const venueName = (typeof raw.venueName === "string" && raw.venueName.trim()) || "Location TBA";
  const { priceFrom, isFree } = deriveOffer(raw.offersPrice);
  const numericId = String(raw.id).replace(/^ra-/, "");
  const ticketUrl = deriveTicketUrl(numericId, raw.url);
  const imageUrl = deriveImageUrl(raw.image);
  const { endDate, timeDisplay } = deriveTimeDisplayAndEndDate(raw.startDate, raw.endDate);

  const row = {
    external_id: raw.id,
    title,
    description,
    category,
    venue_name_raw: venueName,
    venue_id: resolveVenueId(venueMap, venueName),
    venue_address_raw: hasAddress ? street : null,
    venue_city_raw: hasAddress ? city : null,
    start_date: start.date,
    end_date: endDate,
    time_display: timeDisplay,
    is_free: isFree,
    price_from: priceFrom,
    ticket_url: ticketUrl,
    image_url: imageUrl,
    source: "Resident Advisor",
    note: hasAddress ? null : "Venue location not yet announced by the event.",
    status: "approved",
  };
  return { row, errors: [] };
}

// ---------------------------------------------------------------------------
// Conservative cross-source dedupe (Decision 2 — "be conservative with
// cross-source dedupe... a fuzzy match must not blindly overwrite a
// canonical non-RA event"). Real precedent for why this matters:
// supabase/update_2026-09-22_ra-sync-1.sql found 16 of 22 pulled RA events
// were real-world duplicates of events already in the database under a
// DIFFERENT (or null) external_id from an earlier manual import — matching
// on title/venue/date is the only way to catch those, since they don't
// share RA's own external_id scheme.
//
// This ONLY ever decides not to create a new ra-<id> row — it never writes
// to, or in any way modifies, the existing matched row. Only matches
// against rows whose external_id is NOT itself an "ra-<id>" (an actual RA
// row is handled by the primary external_id diff already, upstream of
// this check, so it's deliberately excluded here to avoid a false "self"
// match). Same ilike title/venue pattern as api/admin-events.js's own
// fuzzy search. Fails SOFT on a lookup error (returns "no duplicate
// found") rather than blocking ingestion of a genuinely new event over a
// transient network hiccup — the database's own unique index on
// external_id is still the hard backstop against a true RA-vs-RA
// duplicate either way; this check only ever affects the softer
// RA-vs-legacy-import case.
const DUPLICATE_DATE_WINDOW_DAYS = 2;
const MIN_MATCHABLE_LENGTH = 6;

function addDaysIso(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function findConservativeDuplicate(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, row, fetchFn) {
  const titleOk = row.title && row.title.length >= MIN_MATCHABLE_LENGTH;
  const venueOk = row.venue_name_raw && row.venue_name_raw !== "Location TBA" && row.venue_name_raw.length >= MIN_MATCHABLE_LENGTH;
  if (!titleOk && !venueOk) return null;

  const floor = addDaysIso(row.start_date, -DUPLICATE_DATE_WINDOW_DAYS);
  const ceil = addDaysIso(row.start_date, DUPLICATE_DATE_WINDOW_DAYS);
  const parts = [];
  if (titleOk) parts.push(`title.ilike.${encodeURIComponent(`%${row.title}%`)}`);
  if (venueOk) parts.push(`venue_name_raw.ilike.${encodeURIComponent(`%${row.venue_name_raw}%`)}`);
  const url = `${SUPABASE_URL}/rest/v1/events?start_date=gte.${floor}&start_date=lte.${ceil}&or=(${parts.join(",")})&select=id,title,venue_name_raw,external_id,start_date,status`;

  try {
    const resp = await fetchFn(url, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!Array.isArray(rows)) return null;
    return rows.find((r) => !r.external_id || !RA_ID_PATTERN.test(r.external_id)) || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Session state (source_runs.session_data) — see
// migration_039_ra_sync_session_data.sql. Two small, direct REST helpers;
// deliberately NOT part of api/_lib/run-log.js, which stays untouched and
// generic for its other ~22 callers (Decision 9 — reuse, don't disturb
// what already works).

async function getSourceRun(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId, fetchFn) {
  const resp = await fetchFn(
    `${SUPABASE_URL}/rest/v1/source_runs?id=eq.${encodeURIComponent(runId)}&select=id,source_slug,outcome,started_at,finished_at,session_data`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!resp.ok) throw new RaSyncSessionError(`Could not load RA sync session ${runId}: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new RaSyncSessionError(`Could not load RA sync session ${runId}: unexpected response shape`);
  return rows[0] || null;
}

async function patchSourceRunSessionData(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId, sessionData, fetchFn) {
  const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/source_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ session_data: sessionData }),
  });
  if (!resp.ok) {
    let errText = "";
    try {
      errText = await resp.text();
    } catch {
      // best-effort only
    }
    throw new RaSyncSessionError(`Could not save RA sync session state for ${runId}: HTTP ${resp.status} ${errText}`);
  }
}

// ---------------------------------------------------------------------------
// Orchestrators. Every I/O dependency is injectable (this project's
// established DI/testability convention — see scripts/press-coverage-
// linking.js), with the real implementation wired as the default so
// production call sites (api/cron-ra.js) don't need to pass anything extra.

const DEFAULT_MAX_NEW_PER_RUN = 30; // same cap the old prompt's Step 4 used

// startRaSyncSession({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, candidateIds, ... })
//   -> { runId, candidateCount, knownCount, newCount, allNewCount, ids }
//
// `candidateIds` is the device's own deduplicated "ra-<id>" listing-walk
// result (Step 2 of the old prompt, unchanged). Throws RaKnownIdsValidationError
// on malformed input (reused from api/_lib/ra-known-ids.js) and
// StatusLookupFailedError on a failed production lookup (reused from
// api/_lib/status-lookup.js) — both propagate to the caller, which fails
// closed (see api/cron-ra.js), same posture api/known-ra-ids.js already
// established for this exact question.
//
// Deliberately does NOT fall back to a sessionless response if
// source_runs logging itself fails (startRun() returning null) — unlike
// every other connector's fire-and-forget use of run-log.js, the run id
// here IS the session id a completeRaSyncSession() call later depends on,
// so handing back a diff with no way to ever complete it would silently
// break the two-phase contract. See RaSyncSessionError below.
async function startRaSyncSession(opts) {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    candidateIds,
    maxNewPerRun = DEFAULT_MAX_NEW_PER_RUN,
    fetchFn = fetch,
    lookupExistingRowsFn = lookupExistingRows,
    startRunFn = startRun,
  } = opts;

  const parsed = parseCandidateIds(candidateIds);

  const existingRows = await lookupExistingRowsFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, parsed, {
    select: "external_id",
  });
  const existingIdSet = new Set(existingRows.keys());
  const knownIds = computeKnownIds(parsed, existingIdSet);
  const allNewIds = computeCandidateNewIds(parsed, existingIdSet);
  const newIdsThisRun = allNewIds.slice(0, maxNewPerRun);

  const runHandle = await startRunFn(SLUGS.residentAdvisor);
  if (!runHandle) {
    throw new RaSyncSessionError(
      "Could not start a tracked RA sync session (source_runs insert failed) -- refusing to hand out a diff with no session id to complete it against."
    );
  }

  const sessionData = {
    phase: "started",
    candidateCount: parsed.length,
    knownCount: knownIds.length,
    allNewCount: allNewIds.length,
    newIds: newIdsThisRun,
    startedAt: new Date().toISOString(),
  };
  await patchSourceRunSessionData(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runHandle.runId, sessionData, fetchFn);

  return {
    runId: runHandle.runId,
    candidateCount: parsed.length,
    knownCount: knownIds.length,
    newCount: newIdsThisRun.length,
    allNewCount: allNewIds.length,
    ids: newIdsThisRun,
  };
}

// completeRaSyncSession({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId, events, ... })
//   -> { runId, imported, duplicates, skipped, errors, errorDetail, duplicateDetail }
//
// `events` is the device's fetched detail data for some or all of the ids
// startRaSyncSession() returned — it's fine (expected, even) for this to
// be a subset, e.g. when RA re-blocks mid-run (old prompt's Step 4 "stop
// immediately, commit whatever completed" case): whatever isn't submitted
// simply isn't in production yet, so tomorrow's fresh session naturally
// re-offers it, exactly like the old design.
//
// Refuses (throws RaSyncSessionError) to complete a run that doesn't
// exist, isn't a Resident Advisor session, or was already finished --
// prevents double-completion and prevents a completion call from being
// aimed at an unrelated run. Every submitted event's id must be one this
// SAME session's start call actually promised detail-fetch for --
// anything else is rejected as an error, never silently accepted, so a
// buggy or compromised client can't inject arbitrary external_ids through
// this path.
async function completeRaSyncSession(opts) {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    runId,
    events,
    fetchFn = fetch,
    finishRunFn = finishRun,
    buildVenueNameToIdMapFn = buildVenueNameToIdMap,
    lookupExistingStatusesFn = lookupExistingStatuses,
  } = opts;

  if (!runId || typeof runId !== "string") throw new RaSyncSessionError("runId is required");
  if (!Array.isArray(events)) throw new RaSyncSessionError("events must be an array");

  const run = await getSourceRun(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, runId, fetchFn);
  if (!run) throw new RaSyncSessionError(`No RA sync session found for runId ${runId}`);
  if (run.source_slug !== SLUGS.residentAdvisor) {
    throw new RaSyncSessionError(`runId ${runId} is not a Resident Advisor sync session`);
  }
  if (run.outcome !== "started") {
    throw new RaSyncSessionError(`RA sync session ${runId} was already finished (outcome=${run.outcome}) -- refusing to complete it twice`);
  }

  const sessionData = run.session_data || {};
  const expectedIds = new Set(Array.isArray(sessionData.newIds) ? sessionData.newIds : []);
  const runHandle = { runId: run.id, startedAtMs: new Date(run.started_at).getTime() };

  const imported = [];
  const duplicates = [];
  const skipped = [];
  const errors = [];
  const rowsToUpsert = [];

  const venueMap = await buildVenueNameToIdMapFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  for (const raw of events) {
    const id = raw && raw.id;
    if (!id || !RA_ID_PATTERN.test(id)) {
      errors.push({ id: id || null, reason: "INVALID_ID_FORMAT" });
      continue;
    }
    if (!expectedIds.has(id)) {
      errors.push({ id, reason: "UNEXPECTED_ID_NOT_IN_SESSION" });
      continue;
    }
    if (isCancelledTitle(raw.title)) {
      skipped.push({ id, reason: "CANCELLED" });
      continue;
    }
    const derived = deriveEventRow(raw, venueMap);
    if (!derived.row) {
      errors.push({ id, reason: derived.errors.join(",") || "DERIVATION_FAILED" });
      continue;
    }
    const dupe = await findConservativeDuplicate(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, derived.row, fetchFn);
    if (dupe) {
      duplicates.push({ id, matchedEventId: dupe.id, matchedTitle: dupe.title });
      continue;
    }
    rowsToUpsert.push({ id, row: derived.row });
  }

  let writeError = null;
  if (rowsToUpsert.length) {
    try {
      // Same fail-closed status-preserving lookup every other connector
      // uses (WP 0.17) -- almost always a no-op here, since every id in
      // rowsToUpsert was just confirmed NOT already in production by
      // startRaSyncSession()'s own diff, but a retried/duplicated
      // complete() call for the same session is exactly the edge case
      // this protects: never silently reset a moderator's decision.
      const existingStatus = await lookupExistingStatusesFn(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        rowsToUpsert.map((r) => r.row.external_id)
      );
      const payload = rowsToUpsert.map(({ row }) => ({
        ...row,
        status: existingStatus.get(row.external_id) || "approved",
      }));
      const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        writeError = "Supabase upsert failed: " + (await resp.text());
      } else {
        for (const { id } of rowsToUpsert) imported.push({ id });
      }
    } catch (err) {
      writeError = "Supabase upsert failed: " + err.message;
    }
  }

  if (writeError) {
    for (const { id } of rowsToUpsert) errors.push({ id, reason: "WRITE_FAILED" });
    imported.length = 0;
  }

  const outcome = writeError ? "failed" : errors.length ? "partial" : "success";

  const finalSessionData = {
    ...sessionData,
    phase: "completed",
    completedAt: new Date().toISOString(),
    imported: imported.length,
    duplicates: duplicates.length,
    skipped: skipped.length,
    errors: errors.length,
    errorDetail: errors.slice(0, 20),
    duplicateDetail: duplicates.slice(0, 20),
  };
  await patchSourceRunSessionData(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, run.id, finalSessionData, fetchFn);

  await finishRunFn(runHandle, {
    outcome,
    records_fetched: events.length,
    records_parsed: rowsToUpsert.length + duplicates.length + skipped.length,
    records_written: imported.length,
    error_sample: writeError || (errors.length ? `${errors.length} event(s) had errors -- see session_data.errorDetail` : undefined),
  });

  return {
    runId: run.id,
    imported: imported.length,
    duplicates: duplicates.length,
    skipped: skipped.length,
    errors: errors.length,
    errorDetail: errors,
    duplicateDetail: duplicates,
  };
}

module.exports = {
  RaSyncSessionError,
  // orchestrators
  startRaSyncSession,
  completeRaSyncSession,
  // pure derivation helpers (exported for tests)
  parseIsoLocal,
  formatClock,
  deriveTimeDisplayAndEndDate,
  parseAddressText,
  deriveOffer,
  deriveTicketUrl,
  deriveImageUrl,
  deriveDescription,
  isCancelledTitle,
  deriveCategory,
  deriveEventRow,
  findConservativeDuplicate,
  getSourceRun,
  patchSourceRunSessionData,
  DEFAULT_MAX_NEW_PER_RUN,
  CATEGORY_KEYWORD_RULES,
  DEFAULT_CATEGORY,
};
