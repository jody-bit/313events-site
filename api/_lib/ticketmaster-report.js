"use strict";

// api/_lib/ticketmaster-report.js -- READ-ONLY report of what a Ticketmaster
// synchronisation would do, without doing it (source reliability, 2026-10-11).
//
// Pure: takes what the Discovery API returned plus the rows already stored, and
// says how many events would be new, changed, flagged by Ticketmaster as
// cancelled/postponed, or absent from the fetch; which new events look like
// duplicates of events already on the site; and whether the fetch was
// complete. It performs no I/O, writes nothing, publishes nothing and cancels
// nothing. "Absent from the fetch" means "verify", never "cancelled".
//
// It reuses the connector's own shaping (shapeForDb) and the project's own
// duplicate rules (planConsolidation), so the report cannot drift from either.

const { isLikelyNotARealEvent } = require("./non-event-filter");
const { milesFromDetroitBorder } = require("./detroit-boundary");

const RADIUS_MILES = 75;
const TM_SOURCE = "Ticketmaster";
const CHANGE_FIELDS = ["title", "start_date", "time_display", "venue_name_raw", "price_from", "ticket_status"];
const SAMPLE = 25;

const blank = (v) => v === null || v === undefined || String(v).trim() === "";

// Why shapeForDb dropped an event. Mirrors its early returns; used only to
// explain counts, never to decide anything.
function skipReason(e, mapCategory) {
  if (isLikelyNotARealEvent({ title: e.name })) return "non_event_listing";
  if (!mapCategory(e.classifications)) return "unmapped_category";
  const v = e._embedded && e._embedded.venues && e._embedded.venues[0];
  const lat = v && v.location ? parseFloat(v.location.latitude) : null;
  const lng = v && v.location ? parseFloat(v.location.longitude) : null;
  if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng) && milesFromDetroitBorder(lat, lng) > RADIUS_MILES) return "outside_service_area";
  const start = e.dates && e.dates.start;
  if (!start || !start.localDate) return "no_start_date";
  return "other";
}

function buildReport({ fetched, existing, today, shapeForDb, mapCategory, planConsolidation, venueMap = new Map(), windowDays = 90 }) {
  const info = fetched.info || {};
  const events = fetched.events || [];
  const todayISO = today;
  const windowEnd = new Date(new Date(`${todayISO}T00:00:00Z`).getTime() + windowDays * 86400000).toISOString().slice(0, 10);

  // ---- retrieval ----
  const apiTotal = typeof info.totalElements === "number" ? info.totalElements : null;
  const retrieval = {
    complete: !!info.complete,
    reason: info.reason || null,
    pages_fetched: info.pagesFetched ?? null,
    http_status_last: info.httpStatus ?? null,
    api_total_elements: apiTotal,
    events_fetched: events.length,
    // Discovery API deep paging cap: size*page must stay under 1000.
    deep_paging_capped: apiTotal !== null && apiTotal > 1000,
    fetched_matches_api_total: apiTotal === null ? null : events.length === apiTotal,
  };

  // ---- shaping ----
  const skipped = {};
  const shaped = [];
  const seenIds = new Set();
  let duplicateIdsInFetch = 0;
  for (const e of events) {
    const row = shapeForDb(e, venueMap);
    if (!row) { const r = skipReason(e, mapCategory); skipped[r] = (skipped[r] || 0) + 1; continue; }
    if (seenIds.has(row.external_id)) { duplicateIdsInFetch += 1; continue; }
    seenIds.add(row.external_id);
    shaped.push({ row, raw: e });
  }

  const stored = existing.filter((r) => r.source === TM_SOURCE);
  const storedById = new Map(stored.map((r) => [r.external_id, r]));
  const others = existing.filter((r) => r.source !== TM_SOURCE && r.status !== "rejected");

  // ---- new / changed / unchanged ----
  const news = [];
  const changed = [];
  let unchanged = 0;
  let existingRejected = 0;
  let descriptionsProtected = 0;
  const changesByField = {};
  for (const { row, raw } of shaped) {
    const was = storedById.get(row.external_id);
    if (!was) { news.push(row); continue; }
    if (was.status === "rejected") { existingRejected += 1; continue; } // a moderator's decision stands
    if (!blank(was.description || was.has_description) && !blank(raw.info)) descriptionsProtected += 1;
    const diffs = [];
    for (const f of CHANGE_FIELDS) {
      const a = was[f] ?? null;
      const b = row[f] ?? null;
      if (String(a) !== String(b)) diffs.push({ field: f, from: a, to: b });
    }
    if (diffs.length) {
      for (const d of diffs) changesByField[d.field] = (changesByField[d.field] || 0) + 1;
      changed.push({ external_id: row.external_id, title: was.title, diffs });
    } else unchanged += 1;
  }

  // ---- Ticketmaster's own lifecycle flags (stored as ticket_status; the event stays listed) ----
  const lifecycle = { cancelled: [], postponed: [], rescheduled: [] };
  for (const { row } of shaped) {
    if (lifecycle[row.ticket_status]) {
      lifecycle[row.ticket_status].push({ external_id: row.external_id, title: row.title, start_date: row.start_date, stored: storedById.has(row.external_id) });
    }
  }

  // ---- stored approved upcoming events the fetch did not return ----
  const returned = new Set(shaped.map((s) => s.row.external_id));
  const absent = stored.filter((r) => r.status === "approved" && r.start_date >= todayISO && r.start_date <= windowEnd && !returned.has(r.external_id));

  // ---- potential duplicates of events already on the site ----
  const newIds = new Set(news.map((r) => r.external_id));
  const asRows = news.map((r, i) => ({ id: `tm-new-${i}`, status: "approved", created_at: "2099-01-01", ...r }));
  const plan = planConsolidation([...others.map((r) => ({ ...r, description: r.description ?? (r.has_description ? "x" : "") })), ...asRows]);
  const isNew = (r) => r && typeof r.id === "string" && r.id.startsWith("tm-new-");
  const dupMerges = plan.merges.filter((m) => isNew(m.survivor) || isNew(m.loser));
  const dupReviews = plan.reviews.filter((x) => isNew(x.a) || isNew(x.b));
  const brief = (r) => ({ external_id: r.external_id, title: r.title, start_date: r.start_date, source: r.source, venue: r.venue_name_raw });
  const duplicates = {
    certain: dupMerges.map((m) => ({ rule: m.rule, new: brief(isNew(m.survivor) ? m.survivor : m.loser), existing: brief(isNew(m.survivor) ? m.loser : m.survivor) })),
    needs_review: dupReviews.map((x) => ({ reason: x.reason, new: brief(isNew(x.a) ? x.a : x.b), existing: brief(isNew(x.a) ? x.b : x.a) })),
  };
  const newWithDuplicate = new Set([...duplicates.certain.map((d) => d.new.external_id), ...duplicates.needs_review.map((d) => d.new.external_id)]);

  const flags = [];
  if (!retrieval.complete) flags.push(`INCOMPLETE FETCH: ${retrieval.reason}. "Absent" counts are unreliable.`);
  if (retrieval.deep_paging_capped) flags.push(`Discovery API reports ${apiTotal} events; the 1,000-result deep-paging cap means some can never be fetched with one query.`);
  if (retrieval.fetched_matches_api_total === false) flags.push(`Fetched ${events.length} of ${apiTotal} reported by the API.`);
  if (news.length > 150) flags.push(`${news.length} new events would be published as approved in one run.`);

  return {
    generated_for: todayISO,
    read_only: true,
    retrieval,
    shaping: { raw_events: events.length, kept: shaped.length, skipped, duplicate_ids_in_fetch: duplicateIdsInFetch },
    estimate: {
      new: news.length,
      new_with_potential_duplicate: newWithDuplicate.size,
      new_without_duplicate_signal: news.length - newWithDuplicate.size,
      changed: changed.length,
      unchanged,
      already_rejected_left_alone: existingRejected,
      flagged_cancelled_by_ticketmaster: lifecycle.cancelled.length,
      flagged_postponed_by_ticketmaster: lifecycle.postponed.length,
      flagged_rescheduled_by_ticketmaster: lifecycle.rescheduled.length,
      stored_not_returned_verify: absent.length,
      stored_not_returned_reliable: retrieval.complete,
    },
    descriptions: { stored_descriptions_protected_from_overwrite: descriptionsProtected, rule: "existing events never receive a Ticketmaster description (7bdce19)" },
    changes_by_field: changesByField,
    samples: {
      new: news.slice(0, SAMPLE).map((r) => ({ external_id: r.external_id, title: r.title, start_date: r.start_date, venue: r.venue_name_raw })),
      changed: changed.slice(0, SAMPLE),
      lifecycle: Object.fromEntries(Object.entries(lifecycle).map(([k, v]) => [k, v.slice(0, SAMPLE)])),
      stored_not_returned: absent.slice(0, SAMPLE).map((r) => ({ external_id: r.external_id, title: r.title, start_date: r.start_date })),
    },
    duplicates,
    flags,
    writes_performed: 0,
  };
}

module.exports = { buildReport, CHANGE_FIELDS };
