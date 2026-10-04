// test/mock-postgrest-writes.test.js — the shared fake database refuses
// what production refuses.
//
// WHY THIS TEST EXISTS. On 2026-10-03 five ingestion connectors were found
// to have every write rejected by the database API ("All object keys must
// match"), one of them (Ticketmaster) for a month. Every connector test in
// this repo passed the whole time, because each test stubbed "the write
// succeeded" for itself. A fake that accepts what production rejects cannot
// catch this class of bug; this file pins the fake to production's rules so
// that it does. See test/notes/postgrest-mixed-keys.md for the evidence.
//
// Plain Node assert, no dependencies. Run: node test/mock-postgrest-writes.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const {
  makeMockPostgrest, strictWriteResponse, hasMixedKeys, eventsSchema,
  MIXED_KEYS_ERROR, EVENT_CATEGORIES_PRODUCTION_2026_10_03,
} = require(`${REPO_DIR}/test/fixtures/mock-postgrest.js`);

const BASE = "https://example.supabase.co/rest/v1";
const UPSERT = { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
const post = (db, path, body, headers) => db.fetch(`${BASE}/${path}`, { method: "POST", headers: headers || UPSERT, body: JSON.stringify(body) });
const event = (extra) => ({ external_id: "x-1", title: "T", category: "music", start_date: "2026-10-03", ...extra });

async function run() {
  // --- 1. THE RULE: non-uniform keys reject the whole request -------------
  {
    const tables = { events: [] };
    const db = makeMockPostgrest(tables);
    const resp = await post(db, "events?on_conflict=external_id", [
      event({ external_id: "a", description: "has one" }),
      event({ external_id: "b" }), // no description key at all
    ]);
    assert.strictEqual(resp.ok, false);
    assert.strictEqual(resp.status, 400, "HTTP 400, as production answered");
    const text = await resp.text();
    assert.strictEqual(text, '{"code":"PGRST102","details":null,"hint":null,"message":"All object keys must match"}');
    assert.strictEqual(Buffer.byteLength(text), 85, "the 85-byte body seen in production's API log for all five connectors");
    assert.deepStrictEqual(await resp.json(), MIXED_KEYS_ERROR);
    assert.strictEqual(tables.events.length, 0, "nothing is written — not even the rows that were fine");
  }
  console.log("PASS: a bulk POST with non-uniform keys is rejected in full — 400 PGRST102, the exact 85-byte body, nothing stored");

  // --- 2. what does and does not count as non-uniform ----------------------
  {
    assert.strictEqual(hasMixedKeys([{ a: 1, b: 2 }, { b: 3, a: 4 }]), false, "key ORDER does not matter");
    assert.strictEqual(hasMixedKeys([{ a: 1, b: null }, { a: 2, b: 3 }]), false, "a key present with null is still present");
    assert.strictEqual(hasMixedKeys([{ a: 1 }, { a: 2, b: 3 }]), true, "one extra key");
    assert.strictEqual(hasMixedKeys([{ a: 1, b: 2 }, { a: 2 }]), true, "one missing key");
    assert.strictEqual(hasMixedKeys([{ a: 1 }]), false, "a single row cannot disagree with itself");
    assert.strictEqual(hasMixedKeys([]), false);
    assert.strictEqual(hasMixedKeys({ a: 1 }), false, "a single object body is not a bulk request");
    // JSON.stringify is what creates the problem: undefined keys vanish.
    const sent = JSON.parse(JSON.stringify([{ a: 1, b: undefined }, { a: 2, b: "x" }]));
    assert.strictEqual(hasMixedKeys(sent), true, "`field: value || undefined` produces exactly this");
  }
  console.log("PASS: order is irrelevant, null is a present key, and an undefined-valued key is an absent one once serialized");

  // --- 3. uniform bulk upsert: insert, then update; omitted vs null --------
  {
    const tables = { events: [] };
    const db = makeMockPostgrest(tables, { schema: { events: eventsSchema() }, now: () => "2026-10-03T12:00:00Z" });
    let resp = await post(db, "events?on_conflict=external_id", [
      event({ external_id: "a", description: "first", time_display: "7:00 PM" }),
      event({ external_id: "b", description: "second", time_display: "8:00 PM" }),
    ]);
    assert.strictEqual(resp.status, 201, "201 when rows were inserted");
    assert.strictEqual(await resp.text(), "", "return=minimal has no body");
    assert.strictEqual(tables.events.length, 2);
    assert.strictEqual(tables.events[0].status, "approved", "a new row takes the column default for an absent key");
    assert.strictEqual(tables.events[0].is_free, false);
    assert.strictEqual(tables.events[0].venue_address_raw, null);

    // Update: payload has no description key, and an explicit null time.
    resp = await post(db, "events?on_conflict=external_id", [
      { external_id: "a", title: "T2", category: "music", start_date: "2026-10-04", time_display: null },
    ]);
    assert.strictEqual(resp.status, 200, "200 for a pure update");
    const a = tables.events.find((r) => r.external_id === "a");
    assert.strictEqual(a.title, "T2");
    assert.strictEqual(a.description, "first", "an ABSENT key leaves the stored value alone");
    assert.strictEqual(a.time_display, null, "a key present with NULL overwrites the stored value");
    assert.strictEqual(tables.events.length, 2, "no duplicate row");
  }
  console.log("PASS: merge-duplicates writes exactly the keys in the payload — absent keeps the stored value, null overwrites it");

  // --- 4. `columns=` makes the batch pass, and is not a safe fix ------------
  {
    const tables = { events: [{ id: "1", external_id: "a", title: "T", category: "music", start_date: "2026-10-03", description: "written by a reviewer" }] };
    const db = makeMockPostgrest(tables);
    const resp = await post(db, "events?on_conflict=external_id&columns=external_id,title,category,start_date,description", [
      event({ external_id: "a" }), // source has no description
      event({ external_id: "b", description: "from the source" }),
    ]);
    assert.strictEqual(resp.ok, true, "with columns= PostgREST skips the key check");
    assert.strictEqual(tables.events[0].description, null, "…and fills the absent key with NULL, erasing the stored description");
  }
  console.log("PASS: a single columns= list is accepted but nulls out existing values — the reason the fix groups rows instead");

  // --- 5. the same conflict key twice in one request ------------------------
  {
    const tables = { events: [] };
    const db = makeMockPostgrest(tables);
    const resp = await post(db, "events?on_conflict=external_id", [event({ external_id: "dup" }), event({ external_id: "dup" })]);
    assert.strictEqual(resp.status, 500);
    assert.strictEqual((await resp.json()).code, "21000");
    assert.strictEqual(tables.events.length, 0);
  }
  console.log("PASS: a duplicated conflict key fails the whole request (SQLSTATE 21000)");

  // --- 6. schema checks: required column, enum, unknown column --------------
  {
    const existing = { id: "1", external_id: "a", title: "T", category: "visual", start_date: "2026-10-03", status: "rejected" };
    const tables = { events: [existing] };
    const db = makeMockPostgrest(tables, { schema: { events: eventsSchema({ categories: EVENT_CATEGORIES_PRODUCTION_2026_10_03 }) } });

    // start_date omitted for a row that ALREADY exists — still a violation.
    let resp = await post(db, "events?on_conflict=external_id", [{ external_id: "a", title: "T", category: "visual", status: "rejected" }]);
    assert.strictEqual(resp.status, 400);
    assert.strictEqual((await resp.json()).code, "23502", "NOT NULL is checked on the proposed INSERT row even when the row exists (BUG-004)");

    resp = await post(db, "events?on_conflict=external_id", [event({ external_id: "g", category: "gaming" })]);
    assert.strictEqual(resp.status, 400);
    assert.strictEqual(await resp.text(), '{"code":"22P02","details":null,"hint":null,"message":"invalid input value for enum event_category: \\"gaming\\""}',
      "byte for byte what production recorded for GottaGacha in source_runs.error_sample");

    resp = await post(db, "events?on_conflict=external_id", [event({ external_id: "c", not_a_column: 1 })]);
    assert.strictEqual((await resp.json()).code, "PGRST204");

    // All-or-nothing: one bad row among good ones stores nothing.
    resp = await post(db, "events?on_conflict=external_id", [event({ external_id: "ok-1" }), event({ external_id: "bad", category: "gaming" })]);
    assert.strictEqual(resp.ok, false);
    assert.deepStrictEqual(tables.events.map((r) => r.external_id), ["a"], "the good row in a rejected request is not stored either");

    // After migration 036 'gaming' is a valid category.
    const after = makeMockPostgrest({ events: [] }, { schema: { events: eventsSchema() } });
    resp = await post(after, "events?on_conflict=external_id", [event({ external_id: "g", category: "gaming" })]);
    assert.strictEqual(resp.status, 201);
  }
  console.log("PASS: with a schema the fake also rejects a missing required column, a value outside the category enum, and an unknown column");

  // --- 7. reads the connectors make: in.(…) lookup, PATCH -------------------
  {
    const tables = { events: [
      { id: "1", external_id: "a", status: "approved" },
      { id: "2", external_id: "b,with comma", status: "rejected" },
      { id: "3", external_id: "c", status: "pending_review" },
    ] };
    const db = makeMockPostgrest(tables);
    let resp = await db.fetch(`${BASE}/events?external_id=in.(a,c,missing)&select=external_id,status`, {});
    assert.deepStrictEqual((await resp.json()).map((r) => r.external_id), ["a", "c"]);
    resp = await db.fetch(`${BASE}/events?external_id=in.("b,with comma")&select=external_id,status`, {});
    assert.deepStrictEqual((await resp.json()).map((r) => r.id), ["2"], "a quoted value may contain a comma");

    resp = await db.fetch(`${BASE}/events?id=eq.3`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "approved" }) });
    assert.strictEqual(resp.status, 204);
    assert.strictEqual(tables.events[2].status, "approved");
    assert.strictEqual(tables.events[0].status, "approved");
    assert.strictEqual(tables.events[1].status, "rejected", "PATCH touches only the rows its filter selects");
  }
  console.log("PASS: in.(…) lookups and PATCH behave as the connectors rely on");

  // --- 8. strictWriteResponse: the same rule for a test's own stub ----------
  {
    const url = `${BASE}/events?on_conflict=external_id`;
    let resp = strictWriteResponse(url, { method: "POST", body: JSON.stringify([{ a: 1 }, { a: 1, b: 2 }]) });
    assert.strictEqual(resp.status, 400);
    assert.strictEqual(await resp.text(), JSON.stringify(MIXED_KEYS_ERROR));
    resp = strictWriteResponse(url, { method: "POST", body: JSON.stringify([{ a: 1, b: null }, { a: 1, b: 2 }]) });
    assert.strictEqual(resp.status, 201);
    assert.strictEqual(await resp.text(), "");
    resp = strictWriteResponse(url, { method: "POST", body: JSON.stringify({ a: 1 }) });
    assert.strictEqual(resp.ok, true, "a single object is not a bulk request");
    resp = strictWriteResponse(`${url}&columns=a,b`, { method: "POST", body: JSON.stringify([{ a: 1 }, { a: 1, b: 2 }]) });
    assert.strictEqual(resp.ok, true);
  }
  console.log("PASS: strictWriteResponse gives an inline stub the same rejection, so a hand-rolled stub cannot accept a mixed batch");

  // --- 9. the log records what was sent --------------------------------------
  {
    const db = makeMockPostgrest({ events: [] });
    await post(db, "events?on_conflict=external_id", [event({ external_id: "a" })]);
    assert.strictEqual(db.log.length, 1);
    assert.strictEqual(db.log[0].method, "POST");
    assert.strictEqual(db.log[0].table, "events");
    assert.strictEqual(JSON.parse(db.log[0].body)[0].external_id, "a");
  }
  console.log("PASS: every request — method, table, headers, body — is in the fake's log");

  console.log("\nAll mock-postgrest-writes.test.js checks passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
