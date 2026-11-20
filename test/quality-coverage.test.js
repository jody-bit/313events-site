'use strict';
// P0 quality coverage: bad rows caught, clean row passes, unknown never passes; every ingest hook is report-only.
const assert = require('assert');
const { buildCoverage, classifyRow, CHECKS } = require('../api/_lib/quality-coverage');
const { observeIngest } = require('../api/_lib/quality-ingest');
const { findingsForPublished } = require('../api/_lib/quality-contract');
const { classifyMeeting } = require('../api/_lib/meeting-classifier');
const { isLikelyNotARealEvent } = require('../api/_lib/non-event-filter');

const TODAY = '2026-11-20';
const NOW = Date.parse('2026-11-20T12:00:00Z');
const clean = {
  id: 'clean', status: 'approved', title: 'Stef Chura with Easy Action', category: 'music', venue_id: 'v-third-man', venue_name_raw: 'Third Man Records Detroit',
  venue_city_raw: 'Detroit', start_date: '2026-11-21', date_semantics: 'single', time_display: '8:00 PM', image_url: 'https://example.org/p.jpg',
  event_url: 'https://example.org/e', description: 'Detroit rocker Stef Chura plays an intimate headline set with Easy Action opening the night.',
  internal_note: 'OWNER-CORRECTION 2026-11-19T20:00Z edit1 fields=category,time_display | {"actor":"owner","changes":[]}', link_check_status: 'ok', link_checked_at: '2026-11-19T12:00:00Z',
};
const cov = (rows, extra) => {
  const findings = findingsForPublished(rows, TODAY, {});
  return buildCoverage(rows, Object.assign({ today: TODAY, nowMs: NOW, findings, classifyMeeting, isNonEvent: isLikelyNotARealEvent }, extra));
};
const one = (row, extra) => classifyRow(row, Object.assign({ today: TODAY, nowMs: NOW, codes: new Set(), classifyMeeting, isNonEvent: isLikelyNotARealEvent }, extra));

// 1. Clean row (locked category, linked venue, ok link, current source) passes every check it can positively pass.
{
  const r = one(clean, { currency: { state: 'current' }, codes: new Set() });
  for (const k of ['required_facts', 'venue', 'freshness', 'date_time', 'category', 'pair_scan', 'description_time', 'hard_flags', 'stored_link', 'image_presence']) assert.equal(r[k], 'pass', 'clean ' + k);
  assert.equal(r.audience_purpose, 'unchecked', 'ordinary event verdict is the classifier abstaining, not pass');
}

// 2. Bad fixtures are caught on the named check (Madison TBA venue + dup text, no image, dead link, placeholder desc, duplicate pair).
{
  const tba = { ...clean, id: 'madison', venue_id: null, venue_name_raw: 'Venue TBA', internal_note: null };
  assert.equal(one(tba, { codes: new Set(['venue_placeholder']) }).venue, 'fail');
  assert.equal(one({ ...clean, image_url: null }).image_presence, 'fail');
  assert.equal(one({ ...clean, image_url: 'https://313.events/assets/placeholders/x.png' }).image_presence, 'fail');
  assert.equal(one({ ...clean, link_check_status: 'dead' }).stored_link, 'fail');
  assert.equal(one({ ...clean, event_url: null, ticket_url: null }).stored_link, 'fail');
  assert.equal(one({ ...clean, description: 'https://example.org/tickets' }).hard_flags, 'fail', 'bare-url description is an editorial hard flag');
  assert.equal(one({ ...clean, description: null }).description_time, 'fail');
  assert.equal(one({ ...clean, title: 'Monthly Planning Commission Meeting', description: 'Regular meeting of the planning commission agenda.' }).audience_purpose === 'pass', false);
  const a = { ...clean, id: 'a', internal_note: null }, b = { ...clean, id: 'b', title: 'Different title', event_url: 'https://example.org/z', internal_note: null };
  const c = cov([a, b]);
  assert.equal(c.checks.pair_scan.review, 2, 'same venue same start flagged whatever the titles');
}

// 3. Unknown never passes: no source evidence, never-checked link, unlocked category, no venue link.
{
  const r = one({ ...clean, internal_note: null, venue_id: null, link_check_status: null, link_checked_at: null }, { currency: { state: 'unknown' } });
  assert.equal(r.freshness, 'unchecked'); assert.equal(r.date_time, 'unchecked'); assert.equal(r.category, 'unchecked');
  assert.equal(r.venue, 'unchecked'); assert.equal(r.stored_link, 'unchecked');
  // stale (complete refresh no longer lists it) is review, never pass, never a cancelled claim; failed fetch stays unchecked
  assert.equal(one(clean, { currency: { state: 'stale' } }).freshness, 'review');
  assert.equal(one(clean, { currency: { state: 'unknown' } }).freshness, 'unchecked');
  // a link checked long ago is not a recent pass
  assert.equal(one({ ...clean, link_checked_at: '2026-10-01T00:00:00Z' }).stored_link, 'unchecked');
  // multi-day with unconfirmed schedule is review on date/time
  assert.equal(one(clean, { codes: new Set(['occurrences_unconfirmed']), currency: { state: 'current' } }).date_time, 'review');
}

// 4. Coverage invariant: pass+fail+review+unchecked == denominator per check and per dimension; scope is public upcoming only.
{
  const rows = [clean, { ...clean, id: 'x2', start_date: '2026-11-22', internal_note: null }, { ...clean, id: 'past', start_date: '2026-11-10' }, { ...clean, id: 'pend', status: 'pending_review' }];
  const c = cov(rows, { currencyOf: () => ({ state: 'unknown' }) });
  assert.equal(c.denominator, 2);
  for (const k of CHECKS) assert.equal(c.checks[k].pass + c.checks[k].fail + c.checks[k].review + c.checks[k].unchecked, 2, k);
  for (const d of Object.values(c.dimensions)) assert.equal(d.pass + d.fail + d.review + d.unchecked, 2);
  assert.equal(c.mode, 'report_only'); assert.ok(c.as_of && c.limits.length);
  assert.throws(() => buildCoverage([], { today: 'nope' }));
}

// 5. Ingest observer: report-only, never throws, never passes unknown, does not mutate rows; new AND updated rows.
{
  const rows = [{ ...clean }, { id: null, external_id: 'feed-x-1', title: 'Venue TBA night', category: 'nightlife', start_date: '2026-11-25', venue_name_raw: 'Venue TBA', source: 'Feed' }];
  const before = JSON.stringify(rows);
  const lines = [];
  const s = observeIngest(rows, { path: 'test', nowMs: NOW, log: (l) => lines.push(l) });
  assert.equal(JSON.stringify(rows), before, 'rows untouched');
  assert.equal(s.state, 'ok'); assert.equal(s.rows, 2); assert.equal(s.checks.venue.fail, 1);
  assert.equal(s.checks.freshness.unchecked, 2, 'freshness unchecked at ingest, never pass');
  assert.ok(lines[0].startsWith('[quality-ingest]'));
  assert.equal(observeIngest([], { log: null }).state, 'skipped');
  assert.equal(observeIngest(null, { log: null }).state, 'skipped');
  const bad = observeIngest([{ title: 'x', start_date: {} }], { log: () => { throw new Error('log failed'); } });
  assert.ok(['ok', 'error'].includes(bad.state), 'never throws into a writer');
}

// 6. Every event write path is hooked (static check: a new writer must call the observer or fail this test).
{
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..');
  const need = { 'api/_lib/event-upsert.js': 'observeIngest', 'api/submit.js': 'observeIngest', 'api/admin-editorial.js': 'observeIngest', 'scripts/ra-sync.js': 'observeIngest', 'scripts/ra-candidate-promotion.js': 'observeIngest' };
  for (const [f, token] of Object.entries(need)) assert.ok(fs.readFileSync(path.join(root, f), 'utf8').includes(token), f + ' must call the quality observer');
  const raSync = fs.readFileSync(path.join(root, 'scripts/ra-sync.js'), 'utf8');
  assert.ok(raSync.includes('ra-sync-insert') && raSync.includes('ra-sync-merge'), 'RA insert and merge/update both hooked');
}
console.log('quality-coverage tests passed');
