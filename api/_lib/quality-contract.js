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


// ---- Cross-source duplicate review (P0 gap, EI rule 2026-11-20) -------------------------------------------------------
// Review-only. Different source, same start_date, loosely the same venue, same parsed START minute, similar titles.
// Never hides, merges or writes. Pairs the strict same-venue rule already flagged are skipped so each pair counts once.
const norm = (x) => String(x || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const ABBR = { road: 'rd', street: 'st', avenue: 'ave', boulevard: 'blvd', drive: 'dr', highway: 'hwy', lane: 'ln' };
const addrKey = (x) => norm(x).split(' ').map((t) => ABBR[t] || t).join(' ');
const STOP = new Set(['a', 'an', 'the', 'and', 'of', 'at', 'in', 'on', 'for', 'to', 'with', 'w', 'vs', 'v', 'annual', 'presents', 'presented', 'by',
  // organization/team-name tokens that one source adds and another omits (documented; fixtures decide, see test)
  'bgsu', 'bowling', 'green', 'falcon', 'falcons', 'mens', 'men', 'womens']);
const titleTokens = (t) => new Set(norm(t).split(' ').filter((w) => w.length > 1 && !/^\d{1,2}$/.test(w) && !/^\d+(st|nd|rd|th)$/.test(w) && !STOP.has(w)));
function titleSimilarity(a, b) {
  const A = titleTokens(a), B = titleTokens(b);
  const shared = [...A].filter((w) => B.has(w)).length, min = Math.min(A.size, B.size);
  const equalSets = A.size > 0 && A.size === B.size && shared === A.size;
  return { shared, min, score: min ? shared / min : 0, equal_sets: equalSets, equal_titles: norm(a) === norm(b) };
}
const tbaName = (n) => !n || PLACEHOLDER.test(n);
// Looser than venueMatch: a missing/garbled city or a different spelling of the city never hides the same venue.
function venueKeyLoose(a, b) {
  if (a.venue_id && b.venue_id && a.venue_id === b.venue_id) return 'venue_id';
  const na = norm(a.venue_name || a.venue_name_raw), nb = norm(b.venue_name || b.venue_name_raw);
  const ca = norm(a.venue_city || a.venue_city_raw), cb = norm(b.venue_city || b.venue_city_raw);
  const titlesEqual = norm(a.title) === norm(b.title);
  if (tbaName(a.venue_name || a.venue_name_raw) || tbaName(b.venue_name || b.venue_name_raw)) {
    // A placeholder venue is never a venue match by itself: only the same city AND an identical title.
    return tbaName(a.venue_name || a.venue_name_raw) && tbaName(b.venue_name || b.venue_name_raw) && ca && ca === cb && titlesEqual ? 'same_city_tba_same_title' : null;
  }
  if (!na || na !== nb) return null;
  if (!ca || !cb || ca === cb) return 'same_name';
  const aa = addrKey(a.venue_address || a.venue_address_raw), ab = addrKey(b.venue_address || b.venue_address_raw);
  if (aa && aa === ab) return 'same_name_same_address';
  return titlesEqual ? 'same_name_same_title' : null; // different cities only count when the titles are identical
}
function crossSourceFindings(rows, stage, skip, accept) {
  const out = [], byDay = new Map();
  for (const r of rows) { if (!r || !r.start_date) continue; if (!byDay.has(r.start_date)) byDay.set(r.start_date, []); byDay.get(r.start_date).push(r); }
  for (const list of byDay.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (!a.source || !b.source || a.source === b.source) continue;
    if (accept && !accept(a, b)) continue;
    const vk = venueKeyLoose(a, b); if (!vk) continue;
    const key = [idOf(a), idOf(b)].sort().join(':');
    if (skip && skip.has(key)) continue;
    const ta = startMinute(a), tb = startMinute(b), sim = titleSimilarity(a.title, b.title);
    let basis = null;
    if (ta !== null && tb !== null) {
      if (ta !== tb) continue; // matinee/evening or different start: never flagged
      if (sim.equal_titles || sim.equal_sets || (sim.shared >= 2 && sim.score >= 0.5)) basis = 'same_start_similar_title';
    } else if (sim.equal_sets || sim.equal_titles) basis = 'start_unparsed_identical_title_tokens'; // unknown time is flagged only for identical titles, else unchecked
    if (!basis) continue;
    out.push(make('cross_source_title_date_review', stage, [a, b], { evidence: { venue_match: vk, basis, date: a.start_date, title_overlap: Math.round(sim.score * 100) / 100, shared_tokens: sim.shared }, decision: 'Confirm one event; EI then prepares a one-row hide of the weaker duplicate. Review only: never auto-merged, hidden or published.' }));
  }
  return out;
}
const pairKeysOf = (findings) => new Set(findings.filter((f) => f.code === 'same_venue_same_start_review' || f.code === 'same_venue_time_unresolved').map((f) => f.key.slice(f.code.length + 1)));

// Published rows: the #417 report-only rules (same keys) plus the record-level rules, in the v1 shape.
function findingsForPublished(rows, today, opts) {
  const out = report(rows, today).findings.map((f) => {
    const evidence = { ...f };
    delete evidence.key; delete evidence.kind; delete evidence.events; delete evidence.decision;
    return { ...make(f.kind, 'published', f.events, { evidence, decision: f.decision || 'Review.' }), key: f.key };
  });
  for (const row of rows) if (PUBLISHED_SCOPE(row, today)) out.push(...recordFindings(row, 'published', opts));
  out.push(...crossSourceFindings(rows.filter((r) => PUBLISHED_SCOPE(r, today)), 'published', pairKeysOf(out)));
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
  const isCandidate = new Set(candidates);
  out.push(...crossSourceFindings(candidates.concat(pool), 'import', pairKeysOf(out), (x, y) => isCandidate.has(x) || isCandidate.has(y)));
  const seen = new Set();
  return out.filter((f) => !seen.has(f.key + '|' + f.stage) && seen.add(f.key + '|' + f.stage));
}

// One entry point for the Control Tower queue: always a plain array.
// ctx: { stage:'published'|'import' (default published), today, existing, resolveVenue, venueCtx }
function detect(rows, ctx) {
  const c = ctx || {};
  return c.stage === 'import' ? findingsForImport(rows, c.existing || [], c) : findingsForPublished(rows, c.today, c);
}

module.exports = { detect, findingsForPublished, findingsForImport, recordFindings, INFORMATIVE, venueKeyLoose, titleSimilarity, crossSourceFindings };
