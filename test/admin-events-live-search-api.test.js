// test/admin-events-live-search-api.test.js — admin recovery (Live events editing), API side of api/admin-events.js:
//   - ?search= results carry row_version / owner_corrected / edits (additive), and match=any also matches venue and source;
//   - ?id= returns one event of any status with the same fields;
//   - update_fields records an OWNER-CORRECTION line (the lock), is conditional on updated_at, and echoes no internal_note.
// Real handler and writer against the shared fake database. Plain Node assert.
// Run: node test/admin-events-live-search-api.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const V1 = "2026-10-18T05:00:00+00:00";
const fresh = (p) => { delete require.cache[require.resolve(`${REPO_DIR}/${p}`)]; return require(`${REPO_DIR}/${p}`); };
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });
const row = (extra) => ({
  id: "evt-1", external_id: "src-1", source: "Royal Oak", status: "approved", title: "Holiday Show", category: "music", start_date: "2027-11-20",
  time_display: "7:00 PM", venue_name_raw: "Royal Oak Music Theatre", venue_id: null, venue_address_raw: null, venue_city_raw: null,
  description: null, ticket_url: null, event_url: null, internal_note: null, updated_at: V1, ...extra,
});

async function call(tables, req) {
  const db = makeMockPostgrest(tables);
  global.fetch = async (url, init) => db.fetch(String(url), init);
  const res = makeRes();
  await fresh("api/admin-events.js")({ headers: { "x-admin-secret": process.env.ADMIN_SECRET }, query: {}, ...req }, res);
  return { res, db };
}

(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.ADMIN_SECRET = "fixture-admin-secret";
  delete process.env.RESEND_API_KEY;

  // The shared fake database has no ilike/or(), so the three read cases use a stub that records the URL and returns canned rows.
  const stub = async (rows, req) => {
    const urls = [];
    global.fetch = async (url) => { urls.push(String(url)); return { ok: true, status: 200, json: async () => rows, text: async () => "" }; };
    const res = makeRes();
    await fresh("api/admin-events.js")({ headers: { "x-admin-secret": process.env.ADMIN_SECRET }, query: {}, ...req }, res);
    return { res, urls };
  };

  // 1. Search results carry the correction fields; a corrected row shows owner_corrected and edits.
  {
    const note = 'OWNER-CORRECTION 2026-10-18T04:00:00Z e-1 fields=title | {"actor":"admin","changes":[{"f":"title","b":"Old","a":"Holiday Other"}]}';
    const { res } = await stub([row(), row({ id: "evt-2", title: "Holiday Other", internal_note: note })], { method: "GET", query: { search: "Holiday" } });
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const [a, b] = res._body.events;
    assert.strictEqual(a.row_version, V1);
    assert.deepStrictEqual(a.owner_corrected, []);
    assert.deepStrictEqual(b.owner_corrected, ["title"]);
    assert.strictEqual(b.edits.length, 1);
    assert.strictEqual(b.edits[0].field, "title");
  }
  console.log("PASS: search results carry row_version, owner_corrected and edits");

  // 2. Title-only by default; match=any also asks for venue and source.
  {
    const def = await stub([], { method: "GET", query: { search: "Music Theatre" } });
    assert.ok(def.urls[0].includes("title=ilike.") && !def.urls[0].includes("source.ilike") && !def.urls[0].includes("venue_name_raw.ilike"), "default stays title-only");
    const wide = await stub([], { method: "GET", query: { search: "Music Theatre", match: "any" } });
    assert.ok(wide.urls[0].includes("or=(title.ilike.") && wide.urls[0].includes("venue_name_raw.ilike.") && wide.urls[0].includes("source.ilike."), "match=any searches title, venue and source");
    assert.ok(wide.urls[0].includes("status=eq.approved"), "still approved events only");
    const press = await stub([], { method: "GET", query: { search: "x", includePending: "1" } });
    assert.ok(press.urls[0].includes("venue_name_raw.ilike.") && !press.urls[0].includes("source.ilike"), "Press coverage search unchanged");
  }
  console.log("PASS: match=any widens the search to venue and source; the default is unchanged");

  // 3. ?id= lookup, any status; 404 when absent.
  {
    const hit = await stub([row({ status: "pending_review" })], { method: "GET", query: { id: "evt-1" } });
    assert.strictEqual(hit.res._status, 200);
    assert.strictEqual(hit.res._body.events[0].row_version, V1);
    assert.ok(hit.urls[0].includes("id=eq.evt-1"));
    const miss = await stub([], { method: "GET", query: { id: "nope" } });
    assert.strictEqual(miss.res._status, 404);
  }
  console.log("PASS: ?id= returns one event with the correction fields, 404 when absent");

  // 4. update_fields: records the correction line (the lock), bumps the version, does not echo internal_note.
  {
    const tables = { events: [row()] };
    const { res } = await call(tables, { method: "POST", body: { id: "evt-1", action: "update_fields", fields: { description: "A holiday show." } } });
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const stored = tables.events[0];
    assert.strictEqual(stored.description, "A holiday show.");
    assert.ok(/^OWNER-CORRECTION \S+ e-\S+ fields=description \| /.test(stored.internal_note), "fill recorded as a correction line");
    assert.ok(!("internal_note" in res._body.event), "audit text not echoed");
    assert.deepStrictEqual(res._body.owner_corrected, ["description"]);
    assert.notStrictEqual(res._body.row_version, V1);
  }
  console.log("PASS: update_fields records the OWNER-CORRECTION line");

  // 5. The locked fill survives an ingestion upsert of a different description.
  {
    const tables = { events: [row()] };
    await call(tables, { method: "POST", body: { id: "evt-1", action: "update_fields", fields: { description: "A holiday show." } } });
    const { upsertEventRows } = fresh("api/_lib/event-upsert.js");
    const db = makeMockPostgrest(tables);
    global.fetch = async (url, init) => db.fetch(String(url), init);
    await upsertEventRows(process.env.SUPABASE_URL, "test-key", [{ external_id: "src-1", title: "Holiday Show", description: "Source text that would overwrite." }]);
    assert.strictEqual(tables.events[0].description, "A holiday show.", "the next ingestion run does not overwrite the fill");
  }
  console.log("PASS: a follow-up fill survives the next ingestion run");

  // 6. Nothing to fill: no write (gap-fill only).
  {
    const tables = { events: [row({ description: "Already there" })] };
    const { res, db } = await call(tables, { method: "POST", body: { id: "evt-1", action: "update_fields", fields: { description: "New" } } });
    assert.strictEqual(res._status, 200);
    assert.strictEqual(tables.events[0].description, "Already there", "still gap-fill only");
    assert.ok(!db.log.some((r) => r.table === "events" && r.method === "PATCH"), "no write");
  }
  console.log("PASS: update_fields stays gap-fill only");
  console.log("admin-events-live-search-api: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
