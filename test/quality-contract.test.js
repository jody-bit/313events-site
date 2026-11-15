'use strict';
const assert = require('assert');
const { findingsForPublished, findingsForImport } = require('../api/_lib/quality-contract');
const base = { status: 'approved', title: 'A concert', category: 'music', venue_id: 'v1', venue_name_raw: 'Hall', venue_city_raw: 'Detroit', start_date: '2026-11-20', date_semantics: 'single', time_display: '9:00 PM', image_url: 'https://example.org/p.jpg', event_url: 'https://example.org/c', description: 'A string quartet performs works by local composers.' };
const existing = [{ ...base, id: 'e1' }];
const codes = (a) => a.map((f) => f.code).sort();

// Plain array, v1 shape, same key as #417 for published rows.
const pub = findingsForPublished([{ ...base, id: 'a' }, { ...base, id: 'b', title: 'Totally different', event_url: 'https://example.org/z' }], '2026-11-20');
assert.ok(Array.isArray(pub)); assert.equal(pub[0].schema_version, 1);
const col = pub.find((f) => f.code === 'same_venue_same_start_review');
assert.equal(col.key, 'same_venue_same_start_review:a:b'); assert.equal(col.class, 'actionable'); assert.equal(col.stage, 'published');

// Import: different title, same venue and start is flagged; same code as published.
const imp = findingsForImport([{ ...base, external_id: 'x1', title: 'Other name', source: 'Feed' }], existing);
const c = imp.find((f) => f.code === 'same_venue_same_start_review');
assert.ok(c, 'collision flagged regardless of title'); assert.equal(c.stage, 'import');
assert.deepEqual(c.subject.ids, ['e1']); assert.deepEqual(c.subject.external_ids, ['x1']);
// Different showtime is not a collision; unknown time is unresolved, not silent.
assert.ok(!codes(findingsForImport([{ ...base, external_id: 'x2', time_display: '7:00 PM' }], existing)).includes('same_venue_same_start_review'));
assert.ok(codes(findingsForImport([{ ...base, external_id: 'x3', time_display: null }], existing)).includes('same_venue_time_unresolved'));
// Collision beyond the 7-day window and between two candidates is still caught.
const far = findingsForImport([{ ...base, external_id: 'f1', start_date: '2027-03-01' }, { ...base, external_id: 'f2', start_date: '2027-03-01', title: 'Z' }], []);
assert.ok(codes(far).includes('same_venue_same_start_review'));
// Required/contradictory/placeholder/owner-protected.
const bad = findingsForImport([{ external_id: 'x4', title: 'T', start_date: '2026-12-01', end_date: '2026-11-30', venue_name_raw: 'TBA - Secret Location', is_free: true, price_from: 20, internal_note: 'OWNER-CORRECTION 2026-11-14 o fields=venue_name_raw' }], []);
for (const k of ['required_fact_missing', 'contradictory_fact', 'venue_placeholder', 'owner_protected_value']) assert.ok(codes(bad).includes(k), k);
assert.equal(bad.find((f) => f.code === 'owner_protected_value').class, 'informative');
// Resolver mapping; resolver output is never applied.
const res = (r) => findingsForImport([{ ...base, external_id: 'x5' }], [], { resolveVenue: () => r });
assert.ok(codes(res({ status: 'ambiguous', reason_code: 'MULTI', flags: [], candidates: [{ venue_id: 1 }] })).includes('venue_resolution_review'));
assert.ok(codes(res({ status: 'preserved', flags: ['ONLINE'] })).includes('venue_non_fixed'));
assert.ok(!codes(res({ status: 'verified', flags: [] })).some((k) => k.startsWith('venue_')));
// No mutation.
const before = JSON.stringify(existing); findingsForImport([{ ...base, external_id: 'x6' }], existing); assert.equal(JSON.stringify(existing), before);
console.log('PASS: quality-contract v1');
// Published rows get the same record-level codes as import (P1 repro).
const { detect } = require('../api/_lib/quality-contract');
const pubBad = { ...base, id: 'p1', category: null, end_date: '2026-11-19', is_free: true, price_from: 20, venue_name_raw: 'TBA - Secret' };
const pubCodes = codes(findingsForPublished([pubBad], '2026-11-20'));
for (const k of ['required_fact_missing', 'contradictory_fact', 'venue_placeholder']) assert.ok(pubCodes.includes(k), 'published ' + k);
assert.deepEqual(pubCodes, codes(findingsForImport([{ ...pubBad, id: undefined, external_id: 'p1' }], [])).filter((k) => pubCodes.includes(k)).concat([]).sort());
// detect() is a plain array and routes by stage.
assert.ok(Array.isArray(detect([pubBad], { today: '2026-11-20' })) && detect([pubBad], { today: '2026-11-20' }).length >= 3);
assert.ok(detect([{ ...base, external_id: 'd1', title: 'Other' }], { stage: 'import', existing }).some((f) => f.code === 'same_venue_same_start_review'));
console.log('PASS: published parity and detect()');
