"use strict";
// Per-dimension quality COVERAGE (Platform, P0 2026-11-20). Pure and offline: no I/O, no writes, no status changes.
// Criteria are EI's: /mnt/project-files/event-intelligence/p0-quality-coverage-map-2026-11-20/DIMENSION-CHECK-MAP-AND-POSITIVE-CHECKS.md
// Every row gets exactly one outcome per check: pass | fail | review | unchecked.
//   pass       only when the check's stated POSITIVE condition is true with evidence. Having a field is not evidence.
//   fail       a deterministic rule fired.
//   review     uncertain; a person decides. Never auto-resolved.
//   unchecked  no evidence either way. Unknown never passes.
// Invariant per check and per dimension: pass + fail + review + unchecked == denominator. No score, no weights here.
const EventDates = require("../../event-dates");
const { ownerCorrectedFields } = require("./event-contract");
const { descriptionQuality } = require("./description-quality");

const OUTCOMES = ["pass", "fail", "review", "unchecked"];
const DEFAULT_LINK_FRESH_DAYS = 14;
const EDITORIAL_REASONS = new Set(["placeholder", "bare_url", "time_only", "truncated"]);

// Dimension -> SEMANTIC checks (accuracy evidence). Accuracy carries semantic checks only (venue, date/time, category, freshness).
const DIMENSIONS = {
  accuracy: ["venue", "date_time", "category", "freshness"],
  duplicates: ["pair_scan"],
  completeness: ["description_time"],
  editorial: ["hard_flags"],
  links: ["stored_link"],
  unique_value: ["audience_purpose"],
  images: ["image_presence"],
};
// FIELD checks prove presence/linkage only. They are reported in their own block and never roll into a dimension,
// so a row with all fields present is not "accurate". A missing field is still a fail.
const FIELD_CHECKS = ["required_facts", "venue_linked"];
const CHECKS = Object.values(DIMENSIONS).flat().concat(FIELD_CHECKS);
const KIND = Object.assign(Object.fromEntries(Object.values(DIMENSIONS).flat().map((k) => [k, "semantic"])), { required_facts: "field", venue_linked: "field" });
// Presence-only semantic checks (disclosed): description_time, hard_flags, stored_link and image_presence prove a rule screen
// or a recorded status, not that the content is right.

const idOf = (r) => r.id || (r.external_id ? "ext:" + r.external_id : null);
// The strict published pair scan (report() in public-content-quality) only compares pairs that share a day on which both rows are
// active (EventDates.isActiveOn) within [today, today+6]. A row with no such active day (it starts later, or it is a broad or
// schedule-unverified range that is never active on a window day) was never compared, so "no finding" is not evidence:
// unchecked, never pass. Same day logic as the scan's days().
const neverCompared = (row, today) => {
  for (let i = 0; i < 7; i++) { const day = new Date(Date.parse(today + "T12:00:00Z") + i * 86400000).toISOString().slice(0, 10); if (EventDates.isActiveOn(row, day)) return false; }
  return true;
};
const publicScope = (row, today) => row && (row.id || row.external_id) && (!row.status || row.status === "approved") && EventDates.bounds(row).end >= today;
const hasCode = (codes, ...list) => list.some((c) => codes.has(c));
const safeLink = (x) => { try { const u = new URL(x); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (_) { return null; } };
const daysBetween = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000;

// Index findings (quality-contract shape) by row id: Map(id -> Map(code -> finding[])).
function indexFindings(findings) {
  const byRow = new Map();
  for (const f of Array.isArray(findings) ? findings : []) {
    for (const ev of f.events || []) {
      const key = ev.id || (ev.external_id ? "ext:" + ev.external_id : null);
      if (!key) continue;
      if (!byRow.has(key)) byRow.set(key, new Map());
      const codes = byRow.get(key);
      if (!codes.has(f.code)) codes.set(f.code, []);
      codes.get(f.code).push(f);
    }
  }
  return byRow;
}

// classifyRow(row, ctx) -> { check: outcome }.
// ctx: { today, nowMs, codes:Set (finding codes for this row), currency:{state}|null, classifyMeeting, isNonEvent,
//        linkFreshDays, stage:'published'|'import' }
function classifyRow(row, ctx) {
  const c = ctx.codes || new Set();
  const out = {};
  const locked = ownerCorrectedFields(row.internal_note);

  // Accuracy: required facts + contradictions (deterministic).
  // FIELD check: presence only (see FIELD_CHECKS); pass here is not accuracy.
  out.required_facts = hasCode(c, "required_fact_missing", "contradictory_fact") ? "fail" : "pass";
  // FIELD check: a canonical venue is linked. Linkage is not correctness (a linked wrong venue still links).
  out.venue_linked = hasCode(c, "venue_placeholder") ? "fail" : row.venue_id ? "pass" : "unchecked";

  // Accuracy: venue. Blank/TBA fails; resolver doubt is review; semantic pass needs verified-resolver evidence supplied by the
  // caller (none wired in this PR), so the check is unchecked otherwise. A linked venue_id proves presence, not correctness.
  if (hasCode(c, "venue_placeholder")) out.venue = "fail";
  else if (hasCode(c, "venue_resolution_review")) out.venue = "review";
  else out.venue = ctx.venueVerified && ctx.venueVerified(row) === true ? "pass" : "unchecked"; // venue_id present is only a field check (field_checks.venue_linked_rows)

  // Freshness / source absence. Only the source-health currency verdict (complete successful refresh evidence) can pass.
  // A failed, partial or windowed refresh is never absence: stale is a review for a person, unknown is unchecked.
  // Row-level proof only: source-health compares THIS row's last_seen_at_source to the source's latest retrieving run. Its
  // fallback to updated_at (a proxy that any manual edit moves) is not evidence, so only the last_seen_at_source basis counts.
  const cur = ctx.currency && ctx.currency.state;
  const rowLevel = !!(ctx.currency && ctx.currency.basis === "last_seen_at_source");
  out.freshness = rowLevel && cur === "current" ? "pass" : rowLevel && cur === "stale" ? "review" : "unchecked";

  // Accuracy: date/time. Unconfirmed time/occurrences are review; pass needs the row seen in the latest complete refresh.
  if (hasCode(c, "start_time_unconfirmed", "occurrences_unconfirmed")) out.date_time = "review"; // same_venue_time_unresolved is counted once, in pair_scan
  else if (locked && (locked.has("time_display") || locked.has("start_date"))) out.date_time = "unchecked"; // a locked value intentionally differs from the source: no source-equality evidence
  else out.date_time = out.freshness === "pass" ? "pass" : "unchecked";

  // Accuracy: category. An owner lock is overwrite protection, NOT verification: a locked wrong category would still be wrong.
  // Heuristics never pass either. Pass needs recorded review evidence supplied by the caller (ctx.reviewed(row, "category"));
  // this PR wires none (no evidence store without a migration), so category is unchecked and the lock is only counted.
  out.category = ctx.reviewed && ctx.reviewed(row, "category") === true ? "pass" : "unchecked";

  // Duplicates: the scan covers same-venue/same-start and shared-link pairs only (disclosed in `limits`).
  out.pair_scan = hasCode(c, "same_venue_same_start_review", "same_event_link_collision", "same_venue_time_unresolved", "cross_source_title_date_review") ? "review" : ctx.stage === "import" ? "unchecked" : neverCompared(row, ctx.today) ? "unchecked" : "pass";

  // Completeness: description + time present.
  const dq = descriptionQuality(row.description, row.title);
  const noTime = !row.is_all_day && !String(row.time_display || "").trim();
  if (!dq.ok) out.description_time = "fail"; // any failed description quality (missing, placeholder, bare_url, time_only, truncated...) is never a completeness pass
  else if (hasCode(c, "metadata_only_description_candidate") || noTime) out.description_time = "review";
  else out.description_time = "pass";

  // Editorial: hard flags (placeholder, bare URL, time-only, truncated description).
  out.hard_flags = !dq.ok && EDITORIAL_REASONS.has(dq.quality) ? "fail" : "pass";

  // Links: pass needs a recorded ok check that is recent. Never-checked is unchecked, a dead or missing link fails.
  if (!safeLink(row.event_url) && !safeLink(row.ticket_url)) out.stored_link = "fail";
  // Status vocabulary (api/_lib/link-health.js classifyUrlCheck): ok | dead (404/410 only) | inconclusive (never stored). Only an
  // explicit dead status fails; any other recorded status (blocked, timeout, error, rate-limited, unknown strings) is review,
  // because a blocked or robot-refused page is not a broken page.
  else if (row.link_check_status === "dead") out.stored_link = "fail";
  else if (row.link_check_status && row.link_check_status !== "ok") out.stored_link = "review";
  else if (row.link_check_status === "ok" && row.link_checked_at && daysBetween(new Date(ctx.nowMs).toISOString(), row.link_checked_at) <= (ctx.linkFreshDays || DEFAULT_LINK_FRESH_DAYS)) out.stored_link = "pass";
  else out.stored_link = "unchecked";

  // Unique value: audience/purpose. NO positive evidence exists in the row, so this check never passes. A governance screen can
  // only fail (administrative meeting, non-event) or ask for review (ambiguous meeting). A clear screen (ordinary event, or the
  // classifier's kept civic-engagement class) is counted as informative governance_screen_clear and the check stays unchecked:
  // the absence of a governance signal is not evidence of audience or purpose.
  let audience = "unchecked";
  try {
    if (ctx.isNonEvent && ctx.isNonEvent({ title: row.title })) audience = "fail";
    else if (ctx.classifyMeeting) {
      const m = ctx.classifyMeeting(row) || {};
      if (m.meeting_class === "administrative") audience = "fail";
      else if (m.needs_review) audience = "review";
    }
  } catch (_) { audience = "unchecked"; }
  out.audience_purpose = audience;

  // Images: presence only. Relevance, year and rights are human checks and are reported as unchecked in `limits`.
  out.image_presence = !row.image_url || /\/assets\/placeholders\//i.test(row.image_url) ? "fail" : "pass";
  return out;
}

const blank = () => ({ pass: 0, fail: 0, review: 0, unchecked: 0 });

// buildCoverage(rows, opts) -> { as_of, today, denominator, dimensions, checks, informative, limits }
// opts: { today, nowMs, findings, currencyOf(row), classifyMeeting, isNonEvent, linkFreshDays, stage }
function buildCoverage(rows, opts) {
  const o = opts || {};
  const today = o.today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || "")) throw new Error("buildCoverage: supply today as YYYY-MM-DD");
  const nowMs = o.nowMs || Date.now();
  const byRow = indexFindings(o.findings);
  const scoped = (Array.isArray(rows) ? rows : []).filter((r) => o.stage === "import" || publicScope(r, today));
  const checks = Object.fromEntries(CHECKS.map((k) => [k, Object.assign({ kind: KIND[k] }, blank())]));
  const perRow = new Map();
  let ownerLocked = 0, categoryLocked = 0, timeLocked = 0, venueLinked = 0, screenClear = 0;
  for (const row of scoped) {
    const codes = new Set((byRow.get(idOf(row)) || new Map()).keys());
    const result = classifyRow(row, { today, nowMs, codes, stage: o.stage || "published", currency: o.currencyOf ? o.currencyOf(row) : null, classifyMeeting: o.classifyMeeting, isNonEvent: o.isNonEvent, reviewed: o.reviewed, venueVerified: o.venueVerified, linkFreshDays: o.linkFreshDays });
    perRow.set(idOf(row), result);
    if (result.audience_purpose === "unchecked") { try { const m = o.classifyMeeting && o.classifyMeeting(row); if (m && !m.needs_review && m.meeting_class !== "administrative") screenClear++; } catch (_) { /* informative only */ } }
    for (const k of CHECKS) checks[k][result[k]]++;
    const locks = ownerCorrectedFields(row.internal_note);
    if (locks && locks.size) ownerLocked++;
    if (locks && locks.has("category")) categoryLocked++;
    if (locks && (locks.has("time_display") || locks.has("start_date"))) timeLocked++;
    if (row.venue_id) venueLinked++;
  }
  // A dimension row is worst-outcome over its checks: fail > review > unchecked > pass. Never better than its weakest check.
  const rank = { fail: 3, review: 2, unchecked: 1, pass: 0 };
  const dimensions = {};
  for (const [dim, list] of Object.entries(DIMENSIONS)) {
    const t = blank();
    for (const result of perRow.values()) {
      const worst = list.map((k) => result[k]).reduce((a, b) => (rank[b] > rank[a] ? b : a), "pass");
      t[worst]++;
    }
    dimensions[dim] = Object.assign({ checks: list }, t);
  }
  return {
    as_of: new Date(nowMs).toISOString(), today, mode: "report_only", stage: o.stage || "published", denominator: scoped.length,
    dimensions, checks, informative: { owner_protected_rows: ownerLocked, category_owner_locked_rows: categoryLocked, governance_screen_clear_rows: screenClear },
    kinds: KIND,
    // Field/lock/link checks prove only that a value is present, protected or linked. They never count as semantic accuracy.
    field_checks: Object.assign(
      { note: "presence, lock or link only; proves a field exists, is protected or is linked, NOT that it is accurate. Never rolled into a dimension." },
      { category_locked_rows: categoryLocked, time_locked_rows: timeLocked, venue_linked_rows: venueLinked },
      Object.fromEntries(FIELD_CHECKS.map((k) => [k, checks[k]]))),
    limits: [
      "pass requires a stated positive condition; stored fields alone never pass, and unknown is unchecked.",
      "Category is unchecked for every row: an owner lock is overwrite protection, not verification (a locked wrong category would still be wrong), and no recorded-review evidence is wired in this PR. category_owner_locked_rows is informational only.",
      "Venue is unchecked unless verified-resolver evidence is supplied (none wired here); venue_id present is reported as field_checks.venue_linked_rows, not as accuracy.",
      "Date/time passes only for a row seen in a complete refresh that is not owner-locked on time_display/start_date (a lock intentionally differs from source: unchecked); freshness passes only on row-level source-health evidence (this row's last_seen_at_source after the source's latest retrieving run; the updated_at proxy is not evidence); failed, partial or windowed refreshes are never absence.",
      "Duplicates: the strict same-venue/same-start, shared-link and unresolved-time scan compares only pairs overlapping the next 7 days, so a row with no active day in that window (starts later, or a broad/unverified range) is unchecked, never pass. Cross-source pairs (different source, same date, loosely the same venue, same start minute, similar title) are reviewed for all dates; same-source pairs and different-start pairs beyond 7 days are not covered. Venue matching for cross-source pairs: the same venue_id; the same normalized name when the city is equal or either city is missing; the same name in different cities only on an equal normalized address or an identical title; a placeholder venue only with the same city and an identical title. Two genuinely separate same-title events in different cities at the same start minute can therefore be flagged (review only). A pair already flagged by the same-venue, unresolved-time or shared-link rule counts once.",
      "Links pass only with link_check_status ok and a recent link_checked_at; never-checked is unchecked.",
      "Audience never passes: no positive audience evidence exists in a row. The governance screen can fail or ask for review; a clear screen is informative (governance_screen_clear_rows) and the check stays unchecked.",
      "description_time (completeness) and hard_flags (editorial) both fail on the same bad description: that is the existing completeness vs editorial split, so one defect can appear in two dimensions.",
      "Presence-only checks (description_time, hard_flags, stored_link, image_presence) prove a rule screen or a recorded status, not that the content is right; field checks (required_facts, venue_linked) prove presence/linkage only and are excluded from the Accuracy rollup.",
      "Image relevance, year and rights are human checks and are not covered; image_presence is presence only.",
      "NOT BUILT (not claimed as detected): category-vs-purpose check, cancellation-signal check, a dedicated source-absent detector (absence shows only as freshness review via source-health), cross-source different-title duplicates, click-here/chrome and caps editorial flags, date/time comparison against the source value, resolver-verified venue status, price checks.",
      "No score is computed here; the PE rubric score stays with EI.",
    ],
  };
}

module.exports = { buildCoverage, classifyRow, indexFindings, DIMENSIONS, CHECKS, FIELD_CHECKS, KIND, OUTCOMES };
