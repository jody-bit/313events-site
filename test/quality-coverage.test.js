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
  internal_note: 'OWNER-CORRECTION 2026-11-19T20:00Z edit1 fields=category | {"actor":"owner","changes":[]}', link_check_status: 'ok', link_checked_at: '2026-11-19T12:00:00Z',
};
const cov = (rows, extra) => {
  const findings = findingsForPublished(rows, TODAY, {});
  return buildCoverage(rows, Object.assign({ today: TODAY, nowMs: NOW, findings, classifyMeeting, isNonEvent: isLikelyNotARealEvent }, extra));
};
const one = (row, extra) => classifyRow(row, Object.assign({ today: TODAY, nowMs: NOW, codes: new Set(), classifyMeeting, isNonEvent: isLikelyNotARealEvent }, extra));

// 1. Clean row (locked category, linked venue, ok link, current source) passes every check it can positively pass.
{
  const r = one(clean, { currency: { state: 'current', basis: 'last_seen_at_source' }, codes: new Set() });
  for (const k of ['required_facts', 'venue_linked', 'freshness', 'date_time', 'pair_scan', 'description_time', 'hard_flags', 'stored_link', 'image_presence']) assert.equal(r[k], 'pass', 'clean ' + k);
  assert.equal(r.audience_purpose, 'unchecked', 'ordinary event verdict is the classifier abstaining, not pass');
  // A locked category is overwrite protection, not verification: still unchecked. Only recorded review evidence passes.
  assert.equal(r.category, 'unchecked');
  assert.equal(one({ ...clean, category: 'nightlife' }, { currency: { state: 'current', basis: 'last_seen_at_source' } }).category, 'unchecked', 'locked wrong category is not accurate');
  assert.equal(one(clean, { reviewed: (row, f) => f === 'category' && row.id === 'clean' }).category, 'pass');
  assert.equal(one(clean, { reviewed: () => 'yes' }).category, 'unchecked', 'only an explicit true passes');
}

// 1b. An owner lock on the time deliberately differs from the source: date/time is unchecked, not pass.
{
  const lockedTime = { ...clean, internal_note: 'OWNER-CORRECTION 2026-11-19T20:00Z e1 fields=time_display | {"actor":"owner","changes":[]}' };
  assert.equal(one(lockedTime, { currency: { state: 'current', basis: 'last_seen_at_source' } }).date_time, 'unchecked');
  const lockedCategoryOnly = { ...clean, internal_note: 'OWNER-CORRECTION 2026-11-19T20:00Z e1 fields=category | {"actor":"owner","changes":[]}' };
  assert.equal(one(lockedCategoryOnly, { currency: { state: 'current', basis: 'last_seen_at_source' } }).date_time, 'pass');
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
  assert.equal(one({ ...clean, title: 'City Council Meeting', description: 'Regular meeting of the city council.', source: 'City of X' }).audience_purpose, 'fail', 'governing body meeting fails the audience screen');
  assert.equal(one({ ...clean, title: 'Planning Commission Regular Meeting', description: '', source: 'City of X' }).audience_purpose, 'fail');
  assert.equal(one({ ...clean, title: 'Public Hearing: Planning Commission', description: '', source: 'City of X' }).audience_purpose, 'fail', 'existing non-event title filter excludes governing-body titles');
  assert.equal(one({ ...clean, title: 'Community Open House', description: 'Open to everyone.', source: 'City of X' }).audience_purpose === 'pass', false);
  assert.notEqual(one({ ...clean, title: 'Town Hall with the Mayor', description: '' }).audience_purpose, 'pass');
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
  assert.equal(one(clean, { currency: { state: 'stale', basis: 'last_seen_at_source' } }).freshness, 'review');
  assert.equal(one(clean, { currency: { state: 'unknown' } }).freshness, 'unchecked');
  // a link checked long ago is not a recent pass
  assert.equal(one({ ...clean, link_checked_at: '2026-10-01T00:00:00Z' }).stored_link, 'unchecked');
  // multi-day with unconfirmed schedule is review on date/time
  assert.equal(one(clean, { codes: new Set(['occurrences_unconfirmed']), currency: { state: 'current', basis: 'last_seen_at_source' } }).date_time, 'review');
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

// 5b. Missing/hostile input and frozen rows: no mutation, no throw into the writer, no row content in the error.
{
  const frozen = Object.freeze({ ...clean, secret: 'sk-test-SECRET' });
  const lines = [];
  const s = observeIngest([frozen, null, 5, [], { title: 7, start_date: null, description: { x: 1 } }], { nowMs: NOW, log: (l) => lines.push(l) });
  assert.ok(['ok', 'error'].includes(s.state));
  assert.equal(frozen.status, 'approved'); assert.equal(Object.keys(frozen).length, Object.keys({ ...clean, secret: 1 }).length);
  assert.ok(!JSON.stringify(s).includes('SECRET') && !lines.join('').includes('SECRET'), 'no row content in output');
  assert.equal(JSON.stringify(Object.keys(s).includes('status')), 'false', 'observer returns no row/status');
}

// 5c. P1: any failed description quality is never a completeness pass; hard_flags keeps its own fail.
for (const d of ['https://www.mtclib.org/calendar.aspx?EID=2952', '7:00 PM - 9:00 PM', 'TBD']) {
  const r = one({ ...clean, description: d });
  assert.equal(r.description_time, 'fail', 'description_time ' + d);
}
assert.equal(one({ ...clean, description: 'https://x.org/t' }).hard_flags, 'fail');

// 5d. EI/owner: locks and presence are field checks, never semantic passes.
{
  // Spacebarn pre-fix: category community + category lock, description is a drum and bass night.
  const spacebarn = { ...clean, id: '384fecfa', title: 'Drum & Bass Night', category: 'community', description: 'A drum and bass night with DJs, bass and a late set.', internal_note: 'OWNER-CORRECTION 2026-11-18T20:00Z e9 fields=category | {"actor":"owner","changes":[]}' };
  assert.equal(one(spacebarn, { currency: { state: 'current', basis: 'last_seen_at_source' } }).category, 'unchecked', 'locked wrong category must not pass');
  const c = cov([spacebarn]);
  assert.equal(c.checks.category.pass, 0); assert.equal(c.field_checks.category_locked_rows, 1);
  // venue_id present is a field check; semantic venue is unchecked without verified-resolver evidence
  assert.equal(one(clean).venue, 'unchecked');
  assert.equal(cov([clean]).field_checks.venue_linked_rows, 1);
  assert.equal(one(clean, { venueVerified: () => true }).venue, 'pass');
  assert.equal(one(clean, { venueVerified: () => 'yes' }).venue, 'unchecked');
  // locked wrong time and wrong venue (venue_id stays linked) do not pass semantic checks
  const lockedWrong = { ...clean, time_display: '3:00 AM', venue_id: 'wrong-venue', internal_note: 'OWNER-CORRECTION 2026-11-18T20:00Z e9 fields=time_display,venue_name_raw | {"actor":"owner","changes":[]}' };
  const r = one(lockedWrong, { currency: { state: 'current', basis: 'last_seen_at_source' } });
  assert.equal(r.date_time, 'unchecked'); assert.equal(r.venue, 'unchecked');
  // any recorded non-ok link status fails
  assert.equal(one({ ...clean, link_check_status: 'blocked' }).stored_link, 'fail');
  // limits list what is NOT built
  const limits = cov([clean]).limits.join(' ');
  for (const w of ['NOT BUILT', 'category-vs-purpose', 'cancellation-signal', 'cross-source', 'source-absent']) assert.ok(limits.includes(w), w);
}

// 5e. Observer safety: deep-frozen rows, null/missing inputs, a throwing detector, partial rows; logs hold counts + safe keys only.
{
  const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };
  const secretRow = deepFreeze({ id: null, external_id: 'feed-1-token=SECRET123@evil.example', title: 'Venue TBA night SECRETTITLE', category: 'nightlife', start_date: '2026-11-25', venue_name_raw: 'Venue TBA', description: 'user@example.com https://x.test/?sig=SECRET123', source: 'Feed', status: 'approved', nested: { a: 1 } });
  const lines = [];
  const s = observeIngest([secretRow, deepFreeze({ ...clean })], { nowMs: NOW, log: (l) => lines.push(l) });
  assert.equal(s.state, 'ok');
  const out = JSON.stringify(s) + lines.join('');
  for (const leak of ['SECRET123', 'SECRETTITLE', 'user@example.com', 'evil.example', 'Venue TBA night']) assert.ok(!out.includes(leak), 'no leak: ' + leak);
  const thrown = observeIngest([clean], { nowMs: NOW, log: (l) => lines.push(l), detect: () => { throw new Error('boom SECRET123 user@example.com'); } });
  assert.equal(thrown.state, 'error'); assert.ok(!JSON.stringify(thrown).includes('SECRET123') && !JSON.stringify(thrown).includes('user@example.com'));
  assert.ok(!lines.join('').includes('SECRET123'));
  for (const bad of [undefined, null, 'x', 5, {}, [null, undefined, 3]]) assert.doesNotThrow(() => observeIngest(bad, { log: null }));
  const p = observeIngest([{ ...clean }], { nowMs: NOW, log: null, partial: true });
  assert.equal(p.partial, true); assert.equal(p.checks.venue.unchecked, 1); assert.equal(p.checks.venue.pass + p.checks.venue.fail, 0);
}

// 5f. EI D3: field checks never roll into Accuracy; kind is reported; a row with all fields present is not 'accurate'.
{
  const c = cov([{ ...clean, internal_note: null, venue_id: 'v1' }]);
  assert.equal(c.checks.required_facts.kind, 'field'); assert.equal(c.checks.venue_linked.kind, 'field'); assert.equal(c.checks.category.kind, 'semantic');
  assert.ok(!c.dimensions.accuracy.checks.includes('required_facts') && !c.dimensions.accuracy.checks.includes('venue_linked'));
  assert.equal(c.dimensions.accuracy.pass, 0, 'all fields present, semantics unchecked: accuracy is not pass');
  assert.equal(c.field_checks.required_facts.pass, 1);
  assert.equal(cov([{ ...clean, title: null }]).field_checks.required_facts.fail, 1, 'missing field still fails');
  assert.ok(cov([clean]).limits.join(' ').includes('excluded from the Accuracy rollup'));
  // governance screen clear is informative, audience stays unchecked
  assert.equal(c.checks.audience_purpose.unchecked, 1); assert.equal(c.informative.governance_screen_clear_rows, 1);
  // freshness needs row-level evidence: the updated_at proxy basis is not evidence
  assert.equal(one(clean, { currency: { state: 'current', basis: 'updated_at (proxy)' } }).freshness, 'unchecked');
  assert.equal(one(clean, { currency: { state: 'stale', basis: 'updated_at (proxy)' } }).freshness, 'unchecked');
}

// 5g. N4: classify/coverage never mutate deep-frozen rows and handle missing inputs.
{
  const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };
  const rows = [deepFreeze({ ...clean, nested: { a: 1 } }), deepFreeze({ id: 'sparse', status: 'approved', start_date: '2026-11-25' })];
  assert.doesNotThrow(() => cov(rows));
  assert.doesNotThrow(() => classifyRow(rows[1], { today: TODAY, nowMs: NOW }));
  assert.doesNotThrow(() => buildCoverage(rows, { today: TODAY }));
}

// 5h. P2: the in-batch pair scan on a 2000-row batch stays cheap (no I/O); generous bound guards against a quadratic blowup.
{
  const big = Array.from({ length: 2000 }, (_, i) => ({ external_id: 'feed-big-' + i, title: 'Event ' + i, category: 'music', start_date: '2026-12-' + String(1 + (i % 28)).padStart(2, '0'), time_display: (i % 12 + 1) + ':00 PM', venue_name_raw: 'Same Hall', venue_city_raw: 'Detroit', event_url: 'https://x.org/' + i, image_url: 'https://x.org/i.jpg', description: 'A fine long description of event number ' + i + ' with details.', source: 'Feed', status: 'approved' }));
  const t0 = Date.now(); const r = observeIngest(big, { nowMs: NOW, log: null });
  assert.equal(r.state, 'ok'); assert.ok(Date.now() - t0 < 5000, '2000-row single-venue batch under 5s (measured ~0.4s)');
}

// 6. Every event write path is hooked (static check: a new writer must call the observer or fail this test).
{
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..');
  const need = { 'api/_lib/event-upsert.js': 'observeIngest', 'api/submit.js': 'observeIngest', 'api/admin-editorial.js': 'observeIngest', 'scripts/ra-sync.js': 'observeIngest', 'scripts/ra-candidate-promotion.js': 'observeIngest' };
  for (const [f, token] of Object.entries(need)) assert.ok(fs.readFileSync(path.join(root, f), 'utf8').includes(token), f + ' must call the quality observer');
  const raSync = fs.readFileSync(path.join(root, 'scripts/ra-sync.js'), 'utf8');
  assert.ok(raSync.includes('ra-sync-insert') && raSync.includes('ra-sync-merge'), 'RA insert and merge/update both hooked');
  assert.ok(/ra-sync-merge", partial: true/.test(raSync), 'RA merge rows are partial: explicit gap, not assessed');
}
console.log('quality-coverage tests passed');
