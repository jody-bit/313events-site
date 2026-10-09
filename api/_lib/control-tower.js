"use strict";

// api/_lib/control-tower.js — Admin Hardening Slice 2, Part D/E plumbing.
//
// SCOPE: "current upcoming" = not yet started, or started and still running
// (end_date today or later — an exhibit that opened last month is public
// today). Rejected rows are out of scope.
//
// One read-only snapshot, one report, shared by Admin's control-tower view
// (api/admin-integrity.js) and the daily healthcheck (api/cron-healthcheck.js),
// so both always tell the same story. Reads only: upcoming non-rejected
// events (with their linked venue), the last 30 days of source_runs, and the
// cron schedule in vercel.json. Writes nothing.
//
// SYSTEM HEALTH and HUMAN DECISIONS are kept apart on purpose:
//   system     per-source health (api/_lib/source-health.js) — what the
//              pipeline is doing, fixed by engineering, never by a moderator
//              editing events one at a time;
//   decisions  per-event integrity (api/_lib/integrity.js) grouped into
//              classes — what is wrong with the inventory, systemic classes
//              counted once with an affected count.

const integrity = require("./integrity");
const sourceHealth = require("./source-health");

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
const RUN_WINDOW_DAYS = 30;

// duplicate-consolidation's SELECT (its pair rules read every one of these,
// internal_note included) plus what the integrity and currency rules read.
const EVENT_SELECT_BASE = [
  "id", "title", "start_date", "end_date", "time_display", "is_all_day", "source", "external_id", "status",
  "venue_id", "venue_name_raw", "venue_address_raw", "venue_city_raw", "description", "description_source",
  "image_url", "ticket_url", "event_url", "is_free", "price_from", "internal_note", "created_at",
  "updated_at", "ticket_status", "no_fixed_venue", "feed_source_id", "venues(name,city,address)",
].join(",");

// The cron schedule is read from the deployed vercel.json (a static require,
// so the bundler ships it with the function). Unreadable -> null, and
// source-health then reports schedules as unknown, never as "unscheduled".
function readVercelConfig() {
  try {
    return require("../../vercel.json");
  } catch (_) {
    return null;
  }
}

function todayInDetroit(now = Date.now()) {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Detroit" });
}

async function readAll(fetchFn, url, headers) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const resp = await fetchFn(`${url}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers });
    const body = await resp.json().catch(() => null);
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status}: ${body && body.message ? body.message : "request failed"}`);
      err.status = resp.status;
      err.body = body;
      throw err;
    }
    if (!Array.isArray(body)) throw new Error("Unexpected response shape");
    rows.push(...body);
    if (body.length < PAGE_SIZE) return rows;
  }
  throw new Error(`Still reading after ${MAX_PAGES} pages; refusing to report on a partial inventory`);
}

// loadSnapshot({ supabaseUrl, serviceRoleKey, fetchFn, now }) -> snapshot
async function loadSnapshot({ supabaseUrl, serviceRoleKey, fetchFn = fetch, now = Date.now(), vercelConfig } = {}) {
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const today = todayInDetroit(now);
  const eventsUrl = (select) => `${supabaseUrl}/rest/v1/events?or=(start_date.gte.${today},end_date.gte.${today})&status=neq.rejected&select=${select}&order=start_date.asc,id.asc`;
  let events;
  let lastSeenColumn = true;
  try {
    events = await readAll(fetchFn, eventsUrl(`${EVENT_SELECT_BASE},last_seen_at_source`), headers);
  } catch (err) {
    // migration_046 not applied: read without it, and say so.
    if (err.status !== 400) throw err;
    lastSeenColumn = false;
    events = await readAll(fetchFn, eventsUrl(EVENT_SELECT_BASE), headers);
  }
  const since = new Date(now - RUN_WINDOW_DAYS * 86400000).toISOString();
  let runs = [];
  let runsError = null;
  try {
    runs = await readAll(fetchFn, `${supabaseUrl}/rest/v1/source_runs?select=source_slug,outcome,started_at,finished_at,records_fetched,records_parsed,records_written,http_status&started_at=gte.${encodeURIComponent(since)}&order=started_at.desc`, headers);
  } catch (err) {
    runsError = err.message; // reported, never silently treated as "no runs"
  }
  let feeds = null;
  let feedsError = null;
  try {
    feeds = await readAll(fetchFn, `${supabaseUrl}/rest/v1/feed_sources?select=id,venue_name,status,last_polled_at,last_poll_result&status=eq.approved&order=venue_name.asc`, headers);
  } catch (err) {
    feedsError = err.message;
  }
  return {
    now,
    today,
    events,
    runs,
    runsError,
    feeds,
    feedsError,
    lastSeenColumn,
    vercelConfig: vercelConfig || readVercelConfig(),
  };
}

function duplicateKnowledge(events) {
  try {
    const { planConsolidation } = require("../../scripts/duplicate-consolidation");
    const plan = planConsolidation(events);
    const review = new Set();
    const pending = new Set();
    for (const r of plan.reviews) { review.add(r.a.id); review.add(r.b.id); }
    for (const m of plan.merges) { pending.add(m.loser.id); }
    return { review, pending, reviewPairs: plan.reviews.length, pendingMerges: plan.merges.length, error: null };
  } catch (err) {
    return { review: new Set(), pending: new Set(), reviewPairs: null, pendingMerges: null, error: err.message };
  }
}

// buildReport(snapshot) -> the control-tower payload. `includeEvents` adds
// the per-event verdicts (Admin drill-down); the healthcheck omits them.
function buildReport(snapshot, { includeEvents = true } = {}) {
  const { events, runs, now, vercelConfig } = snapshot;
  const publicEvents = events.filter((e) => e.status === "approved");
  const duplicates = duplicateKnowledge(events);

  // Pass 1: integrity without currency, for the per-source link rates.
  const firstPass = integrity.summarizeInventory(publicEvents, { duplicates });
  const byId = new Map(firstPass.results.map((r) => [r.id, r]));
  const health = sourceHealth.evaluateSources({ runs, events, vercelConfig, now, integrityById: byId, feeds: snapshot.feeds || null });

  // Pass 2: the full verdict, currency included.
  const summary = integrity.summarizeInventory(publicEvents, { duplicates, currency: health.currencyOf });

  const unhealthy = health.sources.filter((s) => s.unhealthy);
  const decisions = {
    scope: "public (approved) upcoming events",
    evaluated: summary.evaluated,
    counts: summary.counts,
    currency: summary.currency,
    linkClasses: summary.linkClasses,
    classes: summary.classes.map((c) => Object.assign({}, c, { bySource: Object.entries(c.bySource).sort((a, b) => b[1] - a[1]).slice(0, 12) })),
    duplicates: { reviewPairs: duplicates.reviewPairs, pendingMerges: duplicates.pendingMerges, error: duplicates.error },
    pendingReview: events.filter((e) => e.status === "pending_review").length,
  };
  if (includeEvents) {
    const titleById = new Map(publicEvents.map((e) => [e.id, e]));
    decisions.events = summary.results
      .filter((r) => r.state !== "cleared")
      .map((r) => {
        const e = titleById.get(r.id) || {};
        return { id: r.id, title: e.title, start_date: e.start_date, source: e.source, state: r.state, linkClass: r.linkClass, currency: r.currency && r.currency.state, reasons: r.reasons.map((x) => ({ code: x.code, state: x.state, message: x.message })) };
      });
  }

  // "Unexplained anomalies": things the system measured that no rule above
  // accounts for yet — reported, never hidden.
  const anomalies = [];
  for (const s of health.sources) {
    if (s.volume) for (const [field, v] of Object.entries(s.volume)) if (v.deviates) anomalies.push({ source: s.label, kind: "volume", detail: `${field} ${v.latest} vs median ${v.baselineMedian}` });
  }
  const unattributed = publicEvents.filter((e) => !sourceHealth.attributeEvent(e)).length;

  return {
    generatedAt: new Date(now).toISOString(),
    today: snapshot.today,
    currencyBasis: snapshot.lastSeenColumn ? "last_seen_at_source where populated, otherwise updated_at (proxy)" : "updated_at (proxy) — migration_046 not applied",
    system: {
      sources: health.sources,
      summary: {
        sources: health.sources.length,
        unhealthy: unhealthy.length,
        byStatus: health.sources.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {}),
        runsError: snapshot.runsError,
        feedsError: snapshot.feedsError || null,
      },
      anomalies,
      unattributedPublicEvents: unattributed,
    },
    decisions,
  };
}

module.exports = { loadSnapshot, buildReport, todayInDetroit, EVENT_SELECT_BASE };
