'use strict';
// Shared quality finding contract v1 (EI). Pure and offline: no I/O, no writes, no remediation.
// One finding shape for import candidates (stage "import") and published rows (stage "published").
// Spec: /mnt/project-files/event-intelligence/quality-contract-2026-11-15/QUALITY-FINDING-INTERFACE-v1.md
// Every export returns a plain array of findings.
const { report, startMinute, venueMatch } = require('../../scripts/public-content-quality');
const EventDates = require('../../event-dates');
const { ownerCorrectedFields } = require('./event-contract');

const INFORMATIVE = new Set(['missing_image', 'placeholder_image', 'metadata_only_description_candidate', 'owner_protected_value', 'venue_non_fixed']);
const OWNER = { venue_placeholder: 'Discovery', venue_resolution_review: 'Discovery', venue_non_fixed: 'Discovery', owner_protected_value: 'Owner', description_needs_review: 'Editorial', metadata_only_description_candidate: 'Editorial', missing_image: 'Editorial', placeholder_image: 'Editorial' };
const PLACEHOLDER = /^\s*$|^\s*(venue|location)\s+tba\s*$|^\s*tba\b/i;

const idOf = (r) => r.id || (r.external_id ? 'ext:' + r.external_id : null);
const brief = (r) => ({ id: r.id || null, external_id: r.external_id || null, title: r.title || null, start_date: r.start_date || null, source: r.source || null, venue: r.venue_name || r.venue_name_raw || null });

function make(code, stage, rows, extra) {
  const ids = rows.map(idOf).filter(Boolean).sort();
  return {
    schema_version: 1, key: code + ':' + ids.join(':'), code,
    class: INFORMATIVE.has(code) ? 'informative' : 'actionable', stage,
    subject: { ids: rows.map((r) => r.id).filter(Boolean).sort(), external_ids: rows.map((r) => r.external_id).filter(Boolean).sort() },
    events: rows.map(brief), evidence: (extra && extra.evidence) || {}, decision: (extra && extra.decision) || 'Review.',
    owner: (extra && extra.owner) || OWNER[code] || 'EI', status: 'open',
  };
}

// Record-level rules shared by both stages are defined below; published rows run them too (same codes as import).
const PUBLISHED_SCOPE = (e, today) => e && e.id && (!e.status || e.status === 'approved') && EventDates.bounds(e).end >= today;

// Record-level rules shared by both stages.
function recordFindings(row, stage, opts) {
  const out = [];
  const o = opts || {};
  const missing = ['title', 'start_date', 'category'].filter((k) => !row[k]);
  if (missing.length) out.push(make('required_fact_missing', stage, [row], { evidence: { missing }, decision: 'Supply the missing required facts before publication.' }));
  const bad = [];
  if (row.start_date && row.end_date && row.end_date < row.start_date) bad.push('end_before_start');
  if (row.is_free === true && Number(row.price_from) > 0) bad.push('free_with_paid_price');
  if (bad.length) out.push(make('contradictory_fact', stage, [row], { evidence: { contradictions: bad }, decision: 'Resolve the contradiction from the source; do not auto-correct.' }));
  const venueName = row.venue_name || row.venue_name_raw;
  if (PLACEHOLDER.test(venueName || '')) out.push(make('venue_placeholder', stage, [row], { evidence: { venue: venueName || null }, decision: 'Hold for venue review; never infer an address.' }));
  if (o.resolveVenue) {
    const r = o.resolveVenue(row, o.venueCtx);
    const flags = (r && r.flags) || [];
    const ev = { status: r && r.status, reason_code: r && r.reason_code, flags, candidates: (r && r.candidates) || [], evidence: (r && r.evidence) || [], proposed_fill: (r && r.fill) || null };
    if ((r && ['proposed', 'ambiguous', 'conflict', 'unresolved'].includes(r.status)) || flags.includes('EXISTING_VALUE_CONFLICT')) out.push(make('venue_resolution_review', stage, [row], { evidence: ev, decision: 'A person confirms or rejects the venue identity; nothing is written automatically.' }));
    if (flags.includes('TBA') && !PLACEHOLDER.test(venueName || '')) out.push(make('venue_placeholder', stage, [row], { evidence: ev, decision: 'Hold for venue review; never infer an address.' }));
    if (flags.includes('OWNER_LOCKED')) out.push(make('owner_protected_value', stage, [row], { evidence: ev, decision: 'Value is owner-protected and preserved.' }));
    if (['ONLINE', 'MOBILE', 'MULTISITE'].some((f) => flags.includes(f))) out.push(make('venue_non_fixed', stage, [row], { evidence: ev, decision: 'No fixed venue; flagged only.' }));
  }
  return out;
}

// Published rows: the #417 report-only rules (same keys) plus the record-level rules, in the v1 shape.
function findingsForPublished(rows, today, opts) {
  const out = report(rows, today).findings.map((f) => {
    const evidence = { ...f };
    delete evidence.key; delete evidence.kind; delete evidence.events; delete evidence.decision;
    return { ...make(f.kind, 'published', f.events, { evidence, decision: f.decision || 'Review.' }), key: f.key };
  });
  for (const row of rows) if (PUBLISHED_SCOPE(row, today)) out.push(...recordFindings(row, 'published', opts));
  const seen = new Set();
  return out.filter((f) => !seen.has(f.key + '|' + f.stage) && seen.add(f.key + '|' + f.stage));
}

// Import candidates against existing rows. Every same-venue same-start pair is flagged, whatever the titles.
// Uncertain pairs are findings, never merges.
function findingsForImport(candidates, existing, opts) {
  if (!Array.isArray(candidates) || !Array.isArray(existing || [])) throw new Error('candidates and existing must be arrays');
  const out = [];
  const pool = (existing || []).filter((e) => e && e.status !== 'rejected');
  candidates.forEach((c, i) => {
    out.push(...recordFindings(c, 'import', opts));
    const locked = ownerCorrectedFields(c.internal_note);
    if (locked && locked.size) out.push(make('owner_protected_value', 'import', [c], { evidence: { fields: [...locked] }, decision: 'Value is owner-protected and preserved.' }));
    const others = pool.concat(candidates.filter((_, j) => j !== i && j > i));
    for (const e of others) {
      if (e === c || !c.start_date) continue;
      if (!EventDates.isActiveOn(e, c.start_date) && e.start_date !== c.start_date) continue;
      const venue = venueMatch(c, e); if (!venue) continue;
      const ta = startMinute(c), tb = startMinute(e);
      const pair = [c, e];
      if (ta !== null && ta === tb) out.push(make('same_venue_same_start_review', 'import', pair, { evidence: { venue_match: venue, date: c.start_date }, decision: 'Review; never automatically merge or publish.' }));
      else if (ta === null || tb === null) out.push(make('same_venue_time_unresolved', 'import', pair, { evidence: { venue_match: venue, date: c.start_date }, decision: 'Verify source times; unresolved equivalence goes to owner.' }));
    }
  });
  const seen = new Set();
  return out.filter((f) => !seen.has(f.key + '|' + f.stage) && seen.add(f.key + '|' + f.stage));
}

// One entry point for the Control Tower queue: always a plain array.
// ctx: { stage:'published'|'import' (default published), today, existing, resolveVenue, venueCtx }
function detect(rows, ctx) {
  const c = ctx || {};
  return c.stage === 'import' ? findingsForImport(rows, c.existing || [], c) : findingsForPublished(rows, c.today, c);
}

module.exports = { detect, findingsForPublished, findingsForImport, recordFindings, INFORMATIVE };
