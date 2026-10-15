const crypto = require("crypto");
const { requireCronAuth } = require("./_lib/cron-auth"); // Package 1: fail-closed cron auth
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingRows } = require("./_lib/status-lookup");
const { upsertEventRows } = require("./_lib/event-upsert");
const { applyPublicationGate } = require("./_lib/event-contract");
const { identityEvidenceSufficient, titleIdentityCompatible } = require("../scripts/ra-sync");
const R = require("./_lib/antonartcenter-rows");

// Vercel Cron job — Anton Art Center (theartcenter.org), 125 Macomb Place,
// Mount Clemens, MI 48043. Added 2026-10-11 as a new recurring source:
// exhibitions plus the receptions, workshops and special events on the
// site's separate Events Calendar.
//
// ** TWO SOURCES, ONE CONNECTOR ** — the site has two unrelated content
// systems (full findings in api/_lib/antonartcenter-rows.js):
//   1. /exhibits: Wix blog posts, one per exhibition, with the run in the
//      title ("Barbara Clay: Finding My Way | October 24 - December 23, 2026").
//      Server-rendered, so a plain fetch gets them.
//   2. /events: a third-party "Events Calendar" iframe whose data is a public
//      JSON document (CALENDAR_API_URL) with structured dates, hours and flags.
// Each is fetched on its own; one failing never discards the other (the run
// is logged `partial` and the failure is named in error_sample).
//
// ** THE RULES ** (enforced in the rows library, applied here)
//   - An exhibition is ONE row with start_date and end_date. Never a row per day.
//   - No start time is invented. An exhibition, and any calendar entry flagged
//     all-day / date-only, gets is_all_day=true and no time_display.
//   - Ambiguity goes to pending_review: a run that cannot be parsed, dates or
//     times that disagree between the page, the calendar and the description,
//     a date known only from a timestamp, a venue that is missing, ambiguous
//     or a partner's, an unclear audience. A NEW row with any of these is
//     written as pending_review with the reason in internal_note ("AAC GATE:
//     codes"). An EXISTING row with any of these is not written at all: the
//     stored row, and whoever reviewed it, stand; it is reported instead.
//   - The same exhibition on both pages is one row (the post wins).
//   - Cross-source duplicates use the project's established conservative
//     matching (scripts/ra-sync.js identityEvidenceSufficient: same
//     start_date, same stated venue, title tokens overlapping >= 0.8). A match
//     is not written. The lookup is fail-closed like the status lookup.
//   - Existing authoritative data survives a thinner incoming record: the gate
//     omits a blank description / image / url / venue / time (FIELD_POLICY);
//     here additionally a stored non-empty description is kept (Bagley's
//     convention), a stored time_display is kept (and is_all_day left alone)
//     when the source gives none, a stored is_free=true is not reset by a
//     page that merely does not say "free", and a stored end_date is kept when
//     the incoming record has none.
//   - An existing row's status is never changed (event-contract.js).
//
// ** DRY RUN ** — `?dry_run=1` (with the usual CRON_SECRET) does every read
// (both pages, the venue map, the status lookup, the duplicate lookup) and
// every decision, then writes NOTHING: no events, no source_runs row. The
// response carries a row-by-row `plan`. scripts/antonartcenter-dry-run.js
// runs the same handler against captured pages and an in-memory database.

const SUPABASE_URL = process.env.SUPABASE_URL;
// Non-production deployments must never use the production database (api/_lib/environment.js).
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const SOURCE_SLUG = SLUGS.antonartcenter; // registered in api/_lib/source-slugs.js, 2026-10-11
const DEFAULT_STATUS = "approved";
const MAX_EXHIBIT_POSTS = 12; // /exhibits lists 2 today; a runaway page must not become a crawl
const FETCH_TIMEOUT_MS = 15000;
const UA = "Mozilla/5.0 (313.events event calendar)";

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

// Today in America/Detroit, YYYY-MM-DD. Past events are not ingested: the
// calendar feed holds every event since 2015.
function detroitTodayIso() {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function fetchChecked(url, accept) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.httpStatus = r.status;
    throw err;
  }
  return r;
}
const fetchText = async (url) => (await fetchChecked(url, "text/html,*/*")).text();
const fetchJson = async (url) => (await fetchChecked(url, "application/json")).json();

const blank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

// Reads both public sources. Never throws: every failure is a named entry in `errors`.
async function readSources(today) {
  const errors = [];
  const out = { errors, exhibitPosts: [], exhibitResults: [], calendarResults: [], calendarTotal: 0, past: 0, unusable: [], listingOk: false, calendarOk: false, httpStatuses: [] };

  // ---- exhibits
  let urls = [];
  try {
    urls = R.parseExhibitListing(await fetchText(R.EXHIBITS_URL));
    out.listingOk = true;
    if (!urls.length) errors.push("exhibits: no /single-post/ links on the page (layout may have changed, or no exhibitions are listed)");
  } catch (err) {
    errors.push(`exhibits list: ${err.message}`);
    if (err.httpStatus) out.httpStatuses.push(err.httpStatus);
  }
  for (const url of urls.slice(0, MAX_EXHIBIT_POSTS)) {
    try {
      const post = R.parseExhibitPost(await fetchText(url), url);
      out.exhibitPosts.push(post);
      if (post.problems.includes("TITLE_MISSING")) { errors.push(`exhibit post ${url}: no title found (layout may have changed)`); continue; }
      const made = R.exhibitRow(post);
      if (!made || !made.row) { out.unusable.push({ source: "exhibit", title: post.title, url, reason: (made && made.reason) || "no row", review: (made && made.review) || [] }); continue; }
      if ((made.row.end_date || made.row.start_date) < today) { out.past++; continue; }
      out.exhibitResults.push(made);
    } catch (err) {
      errors.push(`exhibit post ${url}: ${err.message}`);
      if (err.httpStatus) out.httpStatuses.push(err.httpStatus);
    }
  }

  // ---- calendar
  try {
    const body = await fetchJson(R.CALENDAR_API_URL);
    if (!body || body.result !== true || !Array.isArray(body.value)) throw new Error("unexpected response shape (expected {result:true, value:[...]})");
    out.calendarOk = true;
    out.calendarTotal = body.value.length;
    for (const raw of body.value) {
      const made = R.calendarRow(raw, { today });
      if (made.past) { out.past++; continue; }
      if (!made.row) { out.unusable.push({ source: "calendar", title: raw && raw.title, id: raw && raw.id, reason: made.reason }); continue; }
      out.calendarResults.push(made);
    }
  } catch (err) {
    errors.push(`calendar: ${err.message}`);
    if (err.httpStatus) out.httpStatuses.push(err.httpStatus);
  }
  return out;
}

// Rows that other sources already carry, found with the project's established
// matching. -> Map(external_id -> the stored row it duplicates). Throws on any
// failed request (fail-closed: a run that cannot tell must not write guesses).
async function findCrossSourceDuplicates(newRows) {
  const dates = Array.from(new Set(newRows.map((r) => r.start_date)));
  const stored = [];
  for (const d of dates) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/events?start_date=eq.${d}&select=id,title,venue_name_raw,external_id,start_date,status&limit=1000`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!resp.ok) throw new Error(`duplicate lookup for ${d} failed: HTTP ${resp.status}`);
    const rows = await resp.json();
    if (!Array.isArray(rows)) throw new Error(`duplicate lookup for ${d} returned an unusable body`);
    stored.push(...rows);
  }
  const found = new Map();
  for (const row of newRows) {
    // Our own earlier row for the same event under the other page's id (e.g. the calendar's entry stored
    // while the exhibits page was down) is a duplicate too, even though its venue may be blank.
    const ownEarlier = (s) => /^aac-/.test(s.external_id || "") && s.start_date === row.start_date && titleIdentityCompatible(row.title, s.title);
    const hit = stored.find((s) => s.external_id !== row.external_id && (identityEvidenceSufficient(row, s) || ownEarlier(s)));
    if (hit) found.set(row.external_id, hit);
  }
  return found;
}

// What may and may not overwrite a stored row. Returns the row to send.
function preserveStored(row, stored) {
  const out = { ...row };
  if (!blank(stored.description)) delete out.description; // a stored description stands (Bagley's convention)
  if (blank(row.time_display) && !blank(stored.time_display)) { delete out.time_display; delete out.is_all_day; } // never un-time a row that has a time
  if (row.is_free !== true) delete out.is_free; // "not stated as free" is not "paid"
  if (blank(row.end_date) && !blank(stored.end_date)) delete out.end_date; // a stored run is not shortened by a record without one
  return out;
}

async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;
  const q = (req && req.query) || {};
  const dryRun = q.dry_run === "1" || q.dry_run === "true" || q.dry_run === true;
  const runHandle = dryRun ? null : await startRun(SOURCE_SLUG);
  const finish = async (fields) => { if (!dryRun) await finishRun(runHandle, fields); };

  const haveDb = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
  if (!haveDb && !dryRun) {
    await finish({ outcome: "failed", error_sample: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  const today = detroitTodayIso();
  const src = await readSources(today);
  const fetchedCount = src.exhibitPosts.length + src.calendarTotal;

  // Neither source gave anything usable: failed (blocked when the site said 401/403).
  if (!src.listingOk && !src.calendarOk) {
    const blocked = src.httpStatuses.some((s) => s === 401 || s === 403);
    await finish({ outcome: blocked ? "blocked" : "failed", http_status: src.httpStatuses[0] || null, records_fetched: 0, records_parsed: 0, records_written: 0, error_sample: src.errors.join("; ") });
    res.status(200).json({ upserted: 0, dry_run: dryRun, note: "Both source endpoints failed.", errors: src.errors, fetchedAt: new Date().toISOString() });
    return;
  }

  const merged = R.mergeSources(src.exhibitResults, src.calendarResults);
  const candidates = merged.rows; // [{row, review[]}]
  const discovered = src.exhibitResults.length + src.calendarResults.length;

  if (!candidates.length) {
    await finish({ outcome: src.errors.length ? "partial" : "success", records_fetched: fetchedCount, records_parsed: 0, records_written: 0, error_sample: src.errors.join("; ") || undefined });
    res.status(200).json({ upserted: 0, dry_run: dryRun, discovered, past_skipped: src.past, errors: src.errors, fetchedAt: new Date().toISOString() });
    return;
  }

  // Resolve venues (exact name only; never created or guessed).
  let venueMap = null;
  if (haveDb) venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const items = candidates.map((c) => {
    const row = R.publicFields(c.row);
    if (venueMap && row.venue_name_raw) row.venue_id = resolveVenueId(venueMap, row.venue_name_raw);
    return { row, review: c.review, kind: c.row._kind, conflict: c.conflict || null };
  });

  const plan = [];
  let existing = new Map();
  try {
    if (haveDb) {
      try {
        existing = await lookupExistingRows(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, items.map((i) => i.row.external_id), {
          select: "external_id,status,description,image_url,event_url,time_display,venue_id,venue_address_raw,venue_city_raw,internal_note,start_date,end_date",
        });
      } catch (lookupErr) {
        await finish({ outcome: "failed", http_status: 502, records_fetched: fetchedCount, records_parsed: items.length, error_sample: "Status lookup failed: " + lookupErr.message });
        res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
        return;
      }
    }

    // New rows: is another source already carrying this event?
    const fresh = items.filter((i) => !existing.has(i.row.external_id));
    let crossDupes = new Map();
    if (haveDb && fresh.length) {
      try {
        crossDupes = await findCrossSourceDuplicates(fresh.map((i) => i.row));
      } catch (dupErr) {
        await finish({ outcome: "failed", http_status: 502, records_fetched: fetchedCount, records_parsed: items.length, error_sample: "Duplicate lookup failed: " + dupErr.message });
        res.status(502).json({ upserted: 0, error: "Duplicate lookup failed, aborting rather than risk writing duplicates: " + dupErr.message });
        return;
      }
    }

    const toGate = [];
    const reviewById = new Map();
    const withheld = [];     // existing rows that would be written with open questions: left as stored
    const crossDuplicates = [];
    for (const it of items) {
      const id = it.row.external_id;
      const stored = existing.get(id);
      const base = { external_id: id, title: it.row.title, kind: it.kind, start_date: it.row.start_date, end_date: it.row.end_date || null, time_display: it.row.time_display || null, review: it.review };
      if (stored) {
        if (it.review.length) {
          withheld.push({ external_id: id, title: it.row.title, codes: it.review });
          plan.push({ ...base, action: "existing_not_written_needs_review", status: stored.status });
          continue;
        }
        toGate.push(preserveStored(it.row, stored));
        plan.push({ ...base, action: "update_existing", status: stored.status });
        continue;
      }
      const dupe = crossDupes.get(id);
      if (dupe) {
        crossDuplicates.push({ external_id: id, title: it.row.title, duplicate_of: { id: dupe.id, external_id: dupe.external_id, title: dupe.title, status: dupe.status } });
        plan.push({ ...base, action: "duplicate_of_existing", duplicate_of: dupe.external_id || dupe.id });
        continue;
      }
      if (it.review.length) reviewById.set(id, it.review);
      toGate.push(it.row);
      plan.push({ ...base, action: it.review.length ? "new_pending_review" : "new" });
    }

    // Shared publication gate: the same decision every connector goes through.
    // Dates are stated by the source and no time is required (none is invented).
    const statusMap = new Map(Array.from(existing.entries()).map(([id, row]) => [id, row.status]));
    const gate = applyPublicationGate(toGate, { existingStatus: statusMap, intendedStatus: DEFAULT_STATUS, ctx: {} });
    const rowsWithStatus = gate.rows.map((row) => {
      const codes = reviewById.get(row.external_id);
      if (!codes) return row;
      const line = `AAC GATE: ${codes.join(", ")}`;
      return { ...row, status: "pending_review", internal_note: blank(row.internal_note) ? line : `${row.internal_note}\n${line}` };
    });
    // The gate may hold or skip a row on its own account; reflect that in the plan.
    for (const d of gate.decisions) {
      const p = plan.find((x) => x.external_id === d.external_id);
      if (p && !d.existing && d.decision !== "publish") p.action = d.decision === "skip" ? "skipped_by_gate" : (p.action === "new" ? "new_held_by_gate" : p.action);
      if (p) p.gate = d.codes;
    }

    const counts = {
      discovered,
      exhibits: src.exhibitResults.length,
      calendar_events: src.calendarResults.length,
      new: rowsWithStatus.filter((r) => !existing.has(r.external_id)).length,
      new_published: rowsWithStatus.filter((r) => !existing.has(r.external_id) && r.status === "approved").length,
      new_pending_review: rowsWithStatus.filter((r) => !existing.has(r.external_id) && r.status === "pending_review").length,
      existing_updated: rowsWithStatus.filter((r) => existing.has(r.external_id)).length,
      duplicates: merged.duplicates.length + crossDuplicates.length + gate.summary.duplicates_dropped,
      duplicates_within_source: merged.duplicates.length,
      duplicates_other_sources: crossDuplicates.length,
      needing_review: reviewById.size + withheld.length + src.unusable.filter((u) => u.source === "exhibit").length,
      existing_not_written_needs_review: withheld.length,
      past_skipped: src.past,
      errors: src.errors.length,
    };

    if (dryRun) {
      res.status(200).json({
        dry_run: true, wrote: 0, existing_state: haveDb ? "read" : "unavailable (no database configured)",
        counts, plan, duplicates: { within_source: merged.duplicates, other_sources: crossDuplicates },
        needs_review: [...plan.filter((p) => p.review.length), ...src.unusable.filter((u) => u.source === "exhibit")],
        unusable: src.unusable, gate: gate.summary, errors: src.errors, fetchedAt: new Date().toISOString(),
      });
      return;
    }

    let resp = { ok: true, status: 200, written: 0 };
    if (rowsWithStatus.length) resp = await upsertEventRows(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, rowsWithStatus);
    if (!resp.ok) {
      const errText = await resp.text();
      await finish({
        outcome: "failed",
        http_status: resp.status,
        records_fetched: fetchedCount,
        records_parsed: items.length,
        records_written: resp.written,
        error_sample: "Supabase upsert failed: " + errText,
      });
      res.status(502).json({ upserted: resp.written, error: "Supabase upsert failed: " + errText });
      return;
    }
    await finish({
      outcome: src.errors.length ? "partial" : "success",
      http_status: resp.status,
      records_fetched: fetchedCount,
      records_parsed: items.length,
      records_written: rowsWithStatus.length,
      error_sample: src.errors.join("; ") || undefined,
      session_data: { anton_art_center: counts, publication_gate: gate.summary },
    });
    res.status(200).json({ upserted: rowsWithStatus.length, counts, needs_review: withheld.concat(Array.from(reviewById, ([id, codes]) => ({ external_id: id, codes }))), errors: src.errors, fetchedAt: new Date().toISOString() });
  } catch (err) {
    await finish({ outcome: "failed", records_fetched: fetchedCount, records_parsed: items.length, error_sample: err.message });
    res.status(500).json({ upserted: 0, error: err.message });
  }
}

module.exports = handler;
// Exposed for tests and scripts/antonartcenter-dry-run.js.
module.exports.SOURCE_NAME = R.SOURCE_NAME;
module.exports.readSources = readSources;
module.exports.preserveStored = preserveStored;
module.exports.detroitTodayIso = detroitTodayIso;
