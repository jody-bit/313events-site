// test/fixtures/connector-harness.js — runs a real ingestion connector end
// to end: its own handler, a stubbed upstream source, and the shared fake
// database (mock-postgrest.js), which rejects what production rejects.
//
// Used by the WP 0.7 regression tests. Nothing here is specific to one
// connector; each test supplies the upstream fixture.
"use strict";
const assert = require("assert");
const path = require("path");

const REPO_DIR = path.resolve(process.env.REPO_DIR || process.cwd());
const { makeMockPostgrest, eventsSchema, EVENT_CATEGORIES_PRODUCTION_2026_10_03 } = require("./mock-postgrest.js");

const SUPABASE_URL = "https://example.supabase.co";
const NOW = "2026-10-03T13:00:00Z"; // 9:00 AM in Detroit on the day the failures were found
const UPSERT_PREFER = "resolution=merge-duplicates,return=minimal";
const MIXED_KEYS_BODY = '{"code":"PGRST102","details":null,"hint":null,"message":"All object keys must match"}';

// The connectors read the clock (`new Date()`); hold it still so fixtures
// can use real dates.
async function withFixedNow(fn) {
  const RealDate = Date;
  const fixed = new RealDate(NOW).getTime();
  class FixedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
    static now() { return fixed; }
  }
  global.Date = FixedDate;
  try { return await fn(); } finally { global.Date = RealDate; }
}

// One fake database + one upstream source, behind a single global fetch.
//   events / venues   rows already stored
//   categories        the event_category enum (default: production on
//                     2026-10-03, i.e. without 'gaming')
//   upstream(url)     -> a response for the source's own URLs, or null
//   failure(request)  -> an HTTP status to fail a database request with
function world({ events, venues, categories, upstream, failure }) {
  const tables = { events: events || [], venues: venues || [], source_runs: [] };
  const db = makeMockPostgrest(tables, {
    schema: { events: eventsSchema({ categories: categories || EVENT_CATEGORIES_PRODUCTION_2026_10_03 }) },
    now: () => "2026-10-03T13:00:00.000Z",
    failure,
  });
  global.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith(SUPABASE_URL)) return db.fetch(target, init);
    const answer = upstream(target);
    if (!answer) throw new Error("unmocked upstream URL in test: " + target);
    return answer;
  };
  return { tables, db };
}

const page = (body, status, headers) => ({
  ok: !status || status < 300,
  status: status || 200,
  headers: { get: (name) => (headers && headers[name.toLowerCase()]) || null },
  text: async () => body,
  json: async () => JSON.parse(body),
});
const json = (value, headers) => page(JSON.stringify(value), 200, headers);
const notFound = () => page("", 404);

function makeRes() {
  return { _status: null, _body: null, status(code) { this._status = code; return this; }, json(body) { this._body = body; return this; } };
}

// options.fastTimers: run setTimeout callbacks immediately (a connector
// that politely sleeps between upstream requests should not slow a test).
async function runConnector(file, options) {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.TICKETMASTER_API_KEY = "test-tm-key";
  delete process.env.CRON_SECRET;
  for (const key of Object.keys(require.cache)) if (key.startsWith(`${REPO_DIR}/api/`)) delete require.cache[key];
  const handler = require(`${REPO_DIR}/api/${file}`);
  const res = makeRes();
  const log = console.log, error = console.error, realSetTimeout = global.setTimeout;
  console.log = () => {}; console.error = () => {};
  if (options && options.fastTimers) global.setTimeout = (fn, _ms, ...args) => setImmediate(fn, ...args);
  try { await withFixedNow(() => handler({ headers: {}, query: {} }, res)); } finally {
    console.log = log; console.error = error; global.setTimeout = realSetTimeout;
  }
  return res;
}

const eventWrites = (db) => db.log.filter((r) => r.table === "events" && r.method === "POST");
const sentRows = (db) => eventWrites(db).flatMap((r) => JSON.parse(r.body));
const sentRow = (db, id) => sentRows(db).find((r) => r.external_id === id);
const shapeOf = (row) => Object.keys(row).sort().join(",");
const shapeCount = (rows) => new Set(rows.map(shapeOf)).size;
const byId = (tables, id) => tables.events.find((r) => r.external_id === id);

// What every connector did until WP 0.7: the same rows in a single request.
async function sendAsOneRequest(rows) {
  const tables = { events: [] };
  const control = makeMockPostgrest(tables, { schema: { events: eventsSchema({ categories: EVENT_CATEGORIES_PRODUCTION_2026_10_03 }) } });
  const resp = await control.fetch(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
    method: "POST", headers: { Prefer: UPSERT_PREFER }, body: JSON.stringify(rows),
  });
  return { resp, stored: tables.events.length };
}

// The assertions shared by every connector whose rows can differ in shape:
//   - its rows really are heterogeneous (>= 2 shapes);
//   - as ONE request the database refuses them (400 PGRST102, nothing stored);
//   - the connector's run succeeds and reports every row written;
//   - every request it sent is uniform, to the standard upsert URL;
//   - every row is in the database.
async function assertHeterogeneousAndNowWritten(label, db, tables, res, expectedRows) {
  const rows = sentRows(db);
  assert.strictEqual(rows.length, expectedRows, `${label}: fixture should produce ${expectedRows} rows, produced ${rows.length}`);
  const shapes = shapeCount(rows);
  assert.ok(shapes >= 2, `${label}: the connector's rows must differ in shape for this test to mean anything (found ${shapes})`);

  const control = await sendAsOneRequest(rows);
  assert.strictEqual(control.resp.status, 400, `${label}: one request with these rows is refused`);
  assert.strictEqual(await control.resp.text(), MIXED_KEYS_BODY);
  assert.strictEqual(control.stored, 0, `${label}: …and nothing is written`);

  assert.strictEqual(res._status, 200, `${label}: the run succeeds — ${JSON.stringify(res._body)}`);
  assert.strictEqual(res._body.upserted, expectedRows, `${label}: reports every row written`);
  assert.strictEqual(eventWrites(db).length, shapes, `${label}: one request per shape`);
  for (const request of eventWrites(db)) {
    assert.strictEqual(shapeCount(JSON.parse(request.body)), 1, `${label}: every request sent is uniform`);
    assert.strictEqual(request.url, `${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`);
    assert.strictEqual(request.headers.Prefer, UPSERT_PREFER);
  }
  for (const row of rows) assert.ok(byId(tables, row.external_id), `${label}: ${row.external_id} is in the database`);
  return { rows, shapes, requests: eventWrites(db).length };
}

module.exports = {
  REPO_DIR, SUPABASE_URL, NOW, UPSERT_PREFER, MIXED_KEYS_BODY,
  withFixedNow, world, page, json, notFound, makeRes, runConnector,
  eventWrites, sentRows, sentRow, shapeOf, shapeCount, byId,
  sendAsOneRequest, assertHeterogeneousAndNowWritten,
};
