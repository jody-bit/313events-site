// api/_lib/submission-provenance.js
//
// Submissions Dashboard Step 1 (owner GO 2026-10-17; Experience spec 02-experience-dashboard-spec-step1-readonly.md,
// sections G and K). READ-SIDE ONLY: derives provenance, a lane and review reasons for pending_review rows from data that
// already exists. It changes no row, stores nothing, and adds no column. The Production `sources` table does not exist, so
// the ingestion-method registry below is a code-side table (the same table that later seeds `ingest_sources`).
//
// Everything derived here is labelled derived by the caller. Unknowns stay unknown ("Not provided" in the UI): nothing is
// guessed, `updated_at` is never offered as a processing time, and a source with no run log is never called blocked.
"use strict";

const { attributeEvent } = require("./source-health");
const { classifyPendingRow, isDearbornRow } = require("./pending-classifier");
const { SOURCE_SLUGS } = require("./source-slugs");

// How each connector obtains its events. Only what the connector's own header documents; a connector that is not listed has
// no method (shown as unknown), never a guess. "generated" = the connector computes occurrences from a supplied schedule.
const METHOD_BY_SLUG = Object.freeze({
  ticketmaster: "api", "eventbrite-org": "api", localist: "api", wdet: "api", "belle-isle-nature-center": "api",
  bagleycommunity: "api", planetanttheatre: "api", visitdetroit: "api", outerlimitslounge: "api", gottagacha: "api",
  poppspacking: "api", playgrounddetroit: "api",
  motorcitywine: "ics",
  "resident-advisor": "sync",
  lagerhouse: "scrape", dossin: "scrape", halo: "scrape", "redford-theatre": "scrape", trinosophes: "scrape",
  oldmiami: "scrape", metrotimes: "scrape", detroittraining: "scrape", "cinema-detroit": "scrape",
  antonartcenter: "scrape", detroitmonthofdesign: "scrape",
  bigtimebingo: "generated",
});

const ADMIN_SOURCES = /^(manual|editorial review(?: \(automated\))?)$/i;
const MISSING = "unknown";

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function labelFor(slug) {
  const e = SOURCE_SLUGS.find((x) => x.slug === slug);
  return e ? e.label : null;
}

// origin: human | admin | automated | unknown. Evidence only.
function originOf(row) {
  const src = String((row && row.source) || "").trim();
  if (/^venue submission$/i.test(src) || (row && row.submitter_email)) return "human";
  if (ADMIN_SOURCES.test(src)) return "admin";
  if (row && (row.feed_source_id || attributeEvent(row))) return "automated";
  return MISSING;
}

// feedsById: Map id -> { venue_name, feed_format, last_polled_at, last_poll_result }
function methodOf(row, origin, feedsById) {
  if (origin === "human") return "form";
  if (origin === "admin") return "manual";
  if (row.feed_source_id) {
    const f = feedsById && feedsById.get(row.feed_source_id);
    return f && (f.feed_format === "ics" || f.feed_format === "rss") ? f.feed_format : MISSING;
  }
  const slug = attributeEvent(row);
  return (slug && METHOD_BY_SLUG[slug]) || MISSING;
}

function sourceOf(row, origin, feedsById) {
  const raw = String((row && row.source) || "").trim();
  if (row.feed_source_id) {
    const f = feedsById && feedsById.get(row.feed_source_id);
    return { slug: "feed-" + row.feed_source_id, name: (f && f.venue_name) || raw || null };
  }
  const slug = attributeEvent(row);
  if (slug) return { slug, name: labelFor(slug) || raw || null };
  if (origin === "human") return { slug: "venue-submission", name: row.submitter_org_name || raw || null };
  if (raw) return { slug: slugify(raw), name: raw };
  return { slug: null, name: null };
}

const blank = (v) => v === null || v === undefined || String(v).trim() === "";

// Deterministic field checks (no new queries). Order = priority; the first is the primary reason.
function fieldReasons(row) {
  const out = [];
  if (row.link_check_status === "dead") out.push({ code: "dead_link", text: "The event or ticket link is dead." });
  if (blank(row.time_display) && !row.is_all_day) out.push({ code: "missing_start_time", text: "No start time recorded." });
  if (blank(row.venue_name_raw) && !row.no_fixed_venue) out.push({ code: "missing_location", text: "No venue recorded." });
  else if (blank(row.venue_city_raw) && !row.no_fixed_venue) out.push({ code: "missing_city", text: "Venue has no city recorded." });
  return out;
}

// Secondary notes: shown on the row, never a review reason (a description is optional under the publication rules).
function rowNotes(row) {
  const out = [];
  if (blank(row.description)) out.push({ code: "missing_description", text: "Description not yet available" });
  return out;
}

// feedHealth(feed) -> { failing:boolean, evidence } from the feed's own last poll (same rule source-health.js uses).
function feedFailing(feed, nowMs) {
  if (!feed) return null;
  const polledOk = /events? found/i.test(String(feed.last_poll_result || ""));
  if (feed.last_poll_result && !polledOk) return `Last poll: ${String(feed.last_poll_result).slice(0, 120)}`;
  if (feed.last_polled_at && nowMs - Date.parse(feed.last_polled_at) > 2.5 * 24 * 3600 * 1000) return `Not polled since ${feed.last_polled_at}`;
  return null;
}

// healthBySlug: Map slug -> evaluateSources source ({status, reasons, lastAttemptAt, ...}); absent/unknown = not blocked.
// runsBySlug: Map slug -> latest finished_at. Both optional.
function deriveRow(row, ctx) {
  const { feedsById, healthBySlug, lastRunBySlug, nowMs } = ctx;
  const origin = originOf(row);
  const method = methodOf(row, origin, feedsById);
  const source = sourceOf(row, origin, feedsById);
  const slug = attributeEvent(row);
  const feed = row.feed_source_id && feedsById ? feedsById.get(row.feed_source_id) : null;

  const reasons = [];
  let lane = "person";
  let laneKind = null;
  let blockEvidence = null;

  // Technical blocked: the row's own source is failing on positive evidence (streak rules live in source-health.js).
  const h = slug && healthBySlug ? healthBySlug.get(slug) : null;
  const feedProblem = feedFailing(feed, nowMs);
  if (feedProblem) { lane = "blocked"; laneKind = "technical"; blockEvidence = feedProblem; }
  else if (h && h.status === "failing") { lane = "blocked"; laneKind = "technical"; blockEvidence = (h.reasons && h.reasons[0]) || "Source is failing"; }
  if (laneKind === "technical") reasons.push({ code: "source_blocked", text: "Source is blocked: " + blockEvidence });

  // Source-policy hold (Dearborn reviewAll): nothing in that feed separates an event from an announcement.
  if (isDearbornRow(row)) {
    const q = classifyPendingRow(row);
    if (lane !== "blocked") { lane = "blocked"; laneKind = "policy_hold"; blockEvidence = "Held by source policy: the feed carries no event-type label."; }
    reasons.push({ code: "dearborn_unclassified", text: `Dearborn row awaiting classification (${q.class.replace("_", " ")}: ${q.reason}).` });
  }

  if (origin === "human") reasons.push({ code: "human_submission", text: "Human submission awaiting first review." });
  for (const r of fieldReasons(row)) reasons.push(r);
  // Owner decision 2026-10-17 (option A): a pending row with no genuine reason for a person to decide is still waiting on approval
  // because nothing publishes it automatically yet, so it stays in Needs a person, labelled "Ready to approve". A missing description
  // (optional enrichment) never creates a reason or changes that; it is only a note.
  if (!reasons.length) reasons.push({ code: "ready_to_approve", text: "Ready to approve" });

  const sourceLastRun = feed ? feed.last_polled_at || null : (slug && lastRunBySlug && lastRunBySlug.get(slug)) || null;
  return {
    lane,
    lane_kind: laneKind,
    lane_evidence: blockEvidence,
    reasons,
    notes: rowNotes(row),
    prov: {
      origin: { value: origin, derived: true },
      source,
      method: { value: method, derived: true },
      status: row.status || null,
      added_at: row.created_at || null,
      link_checked_at: row.link_checked_at || null,
      last_seen_at_source: row.last_seen_at_source || null,
      source_last_run_at: sourceLastRun,
    },
  };
}

// rows: queue rows (already filtered). opts: { feeds:[], runs:[], vercelConfig, now, evaluateSources }
function annotateQueue(rows, opts = {}) {
  const nowMs = typeof opts.now === "number" ? opts.now : Date.now();
  const feedsById = new Map((opts.feeds || []).map((f) => [f.id, f]));
  const lastRunBySlug = new Map();
  for (const r of opts.runs || []) {
    const t = r.finished_at || null;
    if (!t) continue;
    const cur = lastRunBySlug.get(r.source_slug);
    if (!cur || Date.parse(t) > Date.parse(cur)) lastRunBySlug.set(r.source_slug, t);
  }
  let healthBySlug = null;
  let healthError = null;
  if (opts.evaluateSources && Array.isArray(opts.runs) && opts.runs.length) {
    try {
      const ev = opts.evaluateSources({ runs: opts.runs, events: [], vercelConfig: opts.vercelConfig || null, now: nowMs, feeds: opts.feeds || null });
      healthBySlug = ev.bySlug;
    } catch (err) { healthError = err.message; }
  }
  const ctx = { feedsById, healthBySlug, lastRunBySlug, nowMs };

  const lane_counts = { person: 0, blocked: 0, auto: null };
  const blocked_breakdown = { policy_hold: 0, technical: 0 };
  const coverage = { rows: 0, origin_known: 0, source_known: 0, method_known: 0, unmapped: new Map() };
  const blockedSources = new Map();

  const events = (rows || []).map((row) => {
    const d = deriveRow(row, ctx);
    lane_counts[d.lane]++;
    if (d.lane === "blocked") {
      blocked_breakdown[d.lane_kind]++;
      const key = d.prov.source.slug + "|" + d.lane_kind;
      const b = blockedSources.get(key) || { slug: d.prov.source.slug, name: d.prov.source.name, state: d.lane_kind, affected: 0, evidence: d.lane_evidence };
      b.affected++;
      blockedSources.set(key, b);
    }
    coverage.rows++;
    if (d.prov.origin.value !== MISSING) coverage.origin_known++;
    if (d.prov.source.name) coverage.source_known++;
    if (d.prov.method.value !== MISSING) coverage.method_known++;
    if (d.prov.origin.value === MISSING || d.prov.method.value === MISSING) {
      const k = String(row.source || "(no source)");
      coverage.unmapped.set(k, (coverage.unmapped.get(k) || 0) + 1);
    }
    return Object.assign({}, row, { prov: d.prov, lane: d.lane, lane_kind: d.lane_kind, reasons: d.reasons, notes: d.notes });
  });

  return {
    events,
    lane_counts,
    blocked_breakdown,
    blocked_sources: [...blockedSources.values()].sort((a, b) => b.affected - a.affected),
    actionable_review_count: lane_counts.person,
    provenance_coverage: {
      rows: coverage.rows, origin_known: coverage.origin_known, source_known: coverage.source_known, method_known: coverage.method_known,
      unmapped_sources: [...coverage.unmapped].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    },
    health_error: healthError,
  };
}

module.exports = { METHOD_BY_SLUG, originOf, methodOf, sourceOf, fieldReasons, rowNotes, deriveRow, annotateQueue };
