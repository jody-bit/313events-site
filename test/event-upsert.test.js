// test/event-upsert.test.js — api/_lib/event-upsert.js (WP 0.7, safe
// batching): rows that differ in shape are written, in uniform groups, and
// an omitted field is never turned into a null to get there.
//
// Runs against the shared fake database (test/fixtures/mock-postgrest.js),
// which rejects a non-uniform batch exactly as production does. Each claim
// here is checked against that rule rather than against a stub that says
// yes to everything.
//
// Plain Node assert, no dependencies. Run: node test/event-upsert.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { upsertEventRows, groupRowsByKeyShape, keyShapeOf, DEFAULT_PREFER } = require(`${REPO_DIR}/api/_lib/event-upsert.js`);
const { makeMockPostgrest, eventsSchema, EVENT_CATEGORIES_PRODUCTION_2026_10_03 } = require(`${REPO_DIR}/test/fixtures/mock-postgrest.js`);

const URL_BASE = "https://example.supabase.co";
const KEY = "service-role-key";
const event = (id, extra) => ({ external_id: id, title: `Event ${id}`, category: "music", start_date: "2026-10-03", status: "approved", ...extra });

function freshDb(rows, options) {
  const tables = { events: rows || [] };
  const db = makeMockPostgrest(tables, { schema: { events: eventsSchema(options) } });
  global.fetch = db.fetch;
  return { tables, db };
}
const posts = (db) => db.log.filter((r) => r.method === "POST");

async function run() {
  // --- 1. key shape = what JSON.stringify will actually send ----------------
  {
    assert.deepStrictEqual(keyShapeOf({ b: 1, a: 2 }), ["a", "b"], "sorted, so key order never splits a group");
    assert.deepStrictEqual(keyShapeOf({ a: 1, b: undefined }), ["a"], "an undefined-valued key is not sent");
    assert.deepStrictEqual(keyShapeOf({ a: 1, b: null }), ["a", "b"], "a null-valued key IS sent");
    assert.deepStrictEqual(keyShapeOf({ a: 0, b: "", c: false }), ["a", "b", "c"], "falsy values are values");
    assert.throws(() => keyShapeOf(null), TypeError);
    assert.throws(() => keyShapeOf([1]), TypeError);
    assert.throws(() => keyShapeOf("row"), TypeError);

    const groups = groupRowsByKeyShape([
      { id: 1, a: 1 }, { id: 2, a: 1, b: 2 }, { id: 3, a: 9 }, { id: 4, b: 2, a: 1 }, { id: 5, a: 1, b: undefined },
    ]);
    assert.deepStrictEqual(groups.map((g) => g.keys), [["a", "id"], ["a", "b", "id"]], "groups in order of first appearance");
    assert.deepStrictEqual(groups.map((g) => g.rows.map((r) => r.id)), [[1, 3, 5], [2, 4]], "rows keep their order within a group");
  }
  console.log("PASS: key shape follows JSON.stringify exactly — undefined is absent, null is present, order is irrelevant");

  // --- 2. a uniform batch is ONE request, identical to the hand-written one --
  {
    const { tables, db } = freshDb();
    const rows = [event("a", { description: "x" }), event("b", { description: null })];
    const resp = await upsertEventRows(URL_BASE, KEY, rows);
    assert.strictEqual(posts(db).length, 1, "one shape, one request");
    const sent = posts(db)[0];
    assert.strictEqual(sent.url, `${URL_BASE}/rest/v1/events?on_conflict=external_id`);
    assert.deepStrictEqual(sent.headers, {
      "Content-Type": "application/json",
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    });
    assert.strictEqual(sent.body, JSON.stringify(rows), "the body is the rows, untouched");
    assert.strictEqual(DEFAULT_PREFER, "resolution=merge-duplicates,return=minimal");
    assert.deepStrictEqual([resp.ok, resp.status, resp.written, resp.attempted], [true, 201, 2, 2]);
    assert.strictEqual(await resp.text(), "");
    assert.deepStrictEqual(resp.failedRows, []);
    assert.strictEqual(tables.events.length, 2);
  }
  console.log("PASS: rows that already share one shape go out as a single request — same URL, headers and body a connector used to build itself");

  // --- 3. THE FIX: a heterogeneous batch is written ---------------------------
  {
    const rows = [
      event("a", { description: "has a description", time_display: "7:00 PM" }),
      event("b"),
      event("c", { time_display: "8:00 PM" }),
      event("d", { description: "another", time_display: "9:00 PM" }),
      event("e", { description: undefined, image_url: undefined }), // same shape as "b" once serialized
    ];

    // Control: sent the way connectors sent it until now, production refuses it.
    const control = freshDb();
    const refused = await control.db.fetch(`${URL_BASE}/rest/v1/events?on_conflict=external_id`, {
      method: "POST", headers: { Prefer: DEFAULT_PREFER }, body: JSON.stringify(rows),
    });
    assert.strictEqual(refused.status, 400);
    assert.strictEqual((await refused.json()).message, "All object keys must match");
    assert.strictEqual(control.tables.events.length, 0, "…and not one of the five rows is written");

    const { tables, db } = freshDb();
    const resp = await upsertEventRows(URL_BASE, KEY, rows);
    assert.strictEqual(resp.ok, true);
    assert.strictEqual(resp.written, 5);
    assert.strictEqual(posts(db).length, 3, "three shapes, three requests");
    assert.deepStrictEqual(posts(db).map((r) => JSON.parse(r.body).map((x) => x.external_id)), [["a", "d"], ["b", "e"], ["c"]]);
    assert.deepStrictEqual(tables.events.map((r) => r.external_id).sort(), ["a", "b", "c", "d", "e"]);
    assert.deepStrictEqual(resp.groups.map((g) => [g.rowCount, g.ok]), [[2, true], [2, true], [1, true]]);
  }
  console.log("PASS: five rows in three shapes — refused as one request, written in full as three");

  // --- 4. nothing is added to a row to make it fit ----------------------------
  {
    const { db } = freshDb();
    const rows = [event("a", { description: "x" }), event("b"), event("c", { note: null })];
    await upsertEventRows(URL_BASE, KEY, rows);
    const sentById = new Map();
    posts(db).forEach((r) => JSON.parse(r.body).forEach((row) => sentById.set(row.external_id, row)));
    for (const row of rows) {
      assert.deepStrictEqual(sentById.get(row.external_id), JSON.parse(JSON.stringify(row)),
        `row ${row.external_id} is sent with exactly its own keys and values`);
    }
    assert.strictEqual("description" in sentById.get("b"), false, "no description key was invented for the row that had none");
    assert.strictEqual(sentById.get("c").note, null, "an explicit null stays an explicit null");
  }
  console.log("PASS: every row goes out with exactly the keys it came in with — no key added, none removed");

  // --- 5. omitted and null still mean different things on an existing row ----
  {
    const stored = (id) => ({ id: `id-${id}`, external_id: id, title: "old title", category: "music", start_date: "2026-10-01", status: "approved",
      description: "written by a reviewer", venue_address_raw: "123 Old St", time_display: "6:00 PM" });
    const { tables } = freshDb([stored("keep"), stored("blank"), stored("replace")]);
    const resp = await upsertEventRows(URL_BASE, KEY, [
      event("keep"),                                              // description omitted
      event("blank", { description: null, time_display: null }),  // explicitly blank
      event("replace", { description: "from the source" }),
    ]);
    assert.strictEqual(resp.ok, true);
    const row = (id) => tables.events.find((r) => r.external_id === id);
    assert.strictEqual(row("keep").description, "written by a reviewer", "OMITTED: the stored description survives");
    assert.strictEqual(row("keep").time_display, "6:00 PM");
    assert.strictEqual(row("keep").title, "Event keep", "…while the keys that were sent are updated");
    assert.strictEqual(row("blank").description, null, "NULL: the stored description is cleared, as before");
    assert.strictEqual(row("blank").time_display, null);
    assert.strictEqual(row("replace").description, "from the source");
    assert.strictEqual(row("replace").time_display, "6:00 PM");
    assert.strictEqual(row("keep").venue_address_raw, "123 Old St");
    assert.strictEqual(tables.events.length, 3, "updates, not duplicates");
    assert.strictEqual(resp.status, 200, "a pure update reports 200");
  }
  console.log("PASS: an omitted field leaves the stored value alone and an explicit null clears it — both exactly as before grouping");

  // --- 6. a rejected group does not take the others down with it -------------
  {
    const { tables, db } = freshDb([], { categories: EVENT_CATEGORIES_PRODUCTION_2026_10_03 });
    const rows = [
      event("ok-1", { description: "x" }),
      event("bad-1", { category: "gaming" }),          // shape 2: rejected by the enum
      event("ok-2", { description: "y" }),
      event("bad-2", { category: "gaming" }),
      event("ok-3", { time_display: "7:00 PM" }),      // shape 3
    ];
    const resp = await upsertEventRows(URL_BASE, KEY, rows);
    assert.strictEqual(resp.ok, false);
    assert.strictEqual(resp.status, 400, "the rejected group's status");
    assert.strictEqual(resp.written, 3);
    assert.strictEqual(resp.attempted, 5);
    assert.deepStrictEqual(resp.failedRows.map((r) => r.external_id), ["bad-1", "bad-2"]);
    assert.strictEqual(posts(db).length, 3, "the group after the rejected one was still sent");
    assert.deepStrictEqual(tables.events.map((r) => r.external_id).sort(), ["ok-1", "ok-2", "ok-3"]);
    const text = await resp.text();
    assert.strictEqual(text,
      '[1 of 3 key-shape groups rejected; 3 of 5 rows written] {"code":"22P02","details":null,"hint":null,"message":"invalid input value for enum event_category: \\"gaming\\""}',
      "what was and was not written comes first (a truncated log line still carries it), then the database's own error");
    assert.deepStrictEqual(resp.groups.map((g) => g.ok), [true, false, true]);
    assert.ok(resp.groups[1].error.includes("gaming"));
  }
  console.log("PASS: one rejected group — the other groups are still written, and the result says exactly what was and was not");

  // --- 7. a single-group failure reads exactly as it always did --------------
  {
    freshDb([], { categories: EVENT_CATEGORIES_PRODUCTION_2026_10_03 });
    const resp = await upsertEventRows(URL_BASE, KEY, [event("g1", { category: "gaming" }), event("g2", { category: "gaming" })]);
    assert.deepStrictEqual([resp.ok, resp.status, resp.written], [false, 400, 0]);
    assert.strictEqual(await resp.text(), '{"code":"22P02","details":null,"hint":null,"message":"invalid input value for enum event_category: \\"gaming\\""}',
      "the raw response body, nothing appended");
  }
  console.log("PASS: when the whole batch is one group, a failure returns the database's response body unchanged");

  // --- 8. edges ------------------------------------------------------------------
  {
    const { db } = freshDb();
    const none = await upsertEventRows(URL_BASE, KEY, []);
    assert.deepStrictEqual([none.ok, none.status, none.written, none.attempted, none.groups.length], [true, 200, 0, 0, 0]);
    assert.strictEqual(posts(db).length, 0, "no rows, no request");

    await assert.rejects(() => upsertEventRows(URL_BASE, KEY, "rows"), TypeError);
    await assert.rejects(() => upsertEventRows(URL_BASE, KEY, [event("a"), null]), TypeError);
    assert.strictEqual(posts(db).length, 0, "an unusable row is refused before anything is sent");

    global.fetch = async () => { throw new Error("socket hang up"); };
    await assert.rejects(() => upsertEventRows(URL_BASE, KEY, [event("a")]), /socket hang up/, "a network failure propagates to the caller, as a bare fetch did");

    const other = makeMockPostgrest({ editorial_articles: [] });
    global.fetch = other.fetch;
    const resp = await upsertEventRows(URL_BASE, KEY, [{ url: "u1", title: "t" }, { url: "u2" }], { table: "editorial_articles", onConflict: "url", prefer: "resolution=ignore-duplicates,return=minimal" });
    assert.strictEqual(resp.ok, true);
    assert.strictEqual(other.log.length, 2, "two shapes, two requests");
    assert.ok(other.log.every((r) => r.url === `${URL_BASE}/rest/v1/editorial_articles?on_conflict=url` && r.headers.Prefer === "resolution=ignore-duplicates,return=minimal"));

    // Rows are serialized exactly once, and the body is built from those
    // same strings — so a value with its own toJSON cannot make the shape
    // a row was grouped by differ from the shape that is sent.
    const withDates = freshDb();
    const when = new Date("2026-10-03T19:00:00Z");
    const dated = [event("d1", { followup_dismissed_at: when }), event("d2", { followup_dismissed_at: when })];
    await upsertEventRows(URL_BASE, KEY, dated);
    assert.strictEqual(posts(withDates.db)[0].body, JSON.stringify(dated), "for plain rows the body is byte-for-byte JSON.stringify(rows)");
    const odd = { external_id: "t1", title: "T", category: "music", start_date: "2026-10-03", toJSON(key) { return key === "" ? { external_id: "t1", title: "T", category: "music", start_date: "2026-10-03", status: "approved", note: "only when serialized alone" } : { external_id: "t1" }; } };
    const consistent = freshDb();
    const oddResp = await upsertEventRows(URL_BASE, KEY, [odd, event("t2", { note: "x" })]);
    assert.strictEqual(oddResp.ok, true, "a row whose toJSON depends on where it is serialized is still sent in the shape it was grouped by");
    assert.strictEqual(posts(consistent.db).length, 1);
    assert.strictEqual(consistent.tables.events.find((r) => r.external_id === "t1").note, "only when serialized alone");
    await assert.rejects(() => upsertEventRows(URL_BASE, KEY, [{ external_id: "u", toJSON() { return undefined; } }]), TypeError, "a row that serializes to nothing is refused, not sent as garbage");
    await assert.rejects(() => upsertEventRows(URL_BASE, KEY, [{ external_id: "u", toJSON() { return "text"; } }]), TypeError);
    // eslint-disable-next-line no-sparse-arrays
    await assert.rejects(() => upsertEventRows(URL_BASE, KEY, [event("h1"), , event("h2")]), TypeError, "a hole in the list is refused");
  }
  console.log("PASS: empty input, unusable input, a single-request network failure, the table/conflict/prefer options and unusual serialization all behave as documented");

  // --- 8b. the status a caller sees ------------------------------------------
  {
    // First group only updates (200), the second inserts (201).
    const stored = { id: "id-1", external_id: "old", title: "t", category: "music", start_date: "2026-10-01", status: "approved" };
    freshDb([stored]);
    const mixed = await upsertEventRows(URL_BASE, KEY, [event("old"), event("new", { description: "x" })]);
    assert.deepStrictEqual(mixed.groups.map((g) => g.status), [200, 201]);
    assert.strictEqual(mixed.status, 201, "201 if any group inserted a row — what one request would have reported");
    freshDb([{ ...stored }]);
    const insertFirst = await upsertEventRows(URL_BASE, KEY, [event("new", { description: "x" }), event("old")]);
    assert.deepStrictEqual(insertFirst.groups.map((g) => g.status), [201, 200]);
    assert.strictEqual(insertFirst.status, 201, "…whichever group it was");
    freshDb([{ ...stored }, { ...stored, id: "id-2", external_id: "old-2" }]);
    const updatesOnly = await upsertEventRows(URL_BASE, KEY, [event("old"), event("old-2", { description: "x" })]);
    assert.strictEqual(updatesOnly.status, 200, "200 when every group was a pure update");
  }
  console.log("PASS: the reported status is 201 if anything was inserted and 200 for pure updates, however many requests it took");

  // --- 8c. a network failure part-way through a split batch -------------------
  {
    const { tables, db } = freshDb();
    const real = db.fetch;
    let writes = 0;
    global.fetch = async (url, init) => {
      if (init && init.method === "POST" && ++writes === 2) throw new Error("socket hang up");
      return real(url, init);
    };
    const rows = [event("g1-a", { description: "x" }), event("g2-a"), event("g1-b", { description: "y" }), event("g3-a", { time_display: "7:00 PM" })];
    const resp = await upsertEventRows(URL_BASE, KEY, rows); // must not throw: group 1 is already committed
    assert.strictEqual(resp.ok, false);
    assert.strictEqual(resp.written, 3, "the groups before and after the failed request were written");
    assert.deepStrictEqual(tables.events.map((r) => r.external_id).sort(), ["g1-a", "g1-b", "g3-a"]);
    assert.deepStrictEqual(resp.failedRows.map((r) => r.external_id), ["g2-a"]);
    assert.strictEqual(resp.status, null, "there is no HTTP status for a request that never got a response");
    assert.deepStrictEqual(resp.groups.map((g) => [g.ok, g.status]), [[true, 201], [false, null], [true, 201]]);
    assert.strictEqual(await resp.text(), "[1 of 3 key-shape groups rejected; 3 of 4 rows written] request failed: socket hang up");

    // With a single request there is nothing committed to report on: it throws, as a bare fetch did.
    global.fetch = async () => { throw new Error("socket hang up"); };
    await assert.rejects(() => upsertEventRows(URL_BASE, KEY, [event("a"), event("b")]), /socket hang up/);
  }
  console.log("PASS: a network failure mid-way through a split batch is reported with what WAS written, instead of an exception that says nothing was");

  // --- 8d. the same external_id twice ------------------------------------------
  {
    // In rows of DIFFERENT shape: split across requests both would be
    // applied and the later group would silently win. Neither is sent.
    const { tables, db } = freshDb();
    const resp = await upsertEventRows(URL_BASE, KEY, [
      event("a"),
      event("x", { title: "first in the list", description: "has one" }),
      event("x", { title: "second in the list" }),
      event("b", { description: "d" }),
    ]);
    assert.strictEqual(resp.ok, false, "a duplicated id is an error, as it is to Postgres");
    assert.strictEqual(resp.written, 2);
    assert.deepStrictEqual(tables.events.map((r) => r.external_id).sort(), ["a", "b"], "every other row is still written");
    assert.deepStrictEqual(resp.failedRows.map((r) => r.title), ["first in the list", "second in the list"]);
    assert.ok(posts(db).every((r) => !r.body.includes('"x"')), "neither copy of the duplicated row is sent");
    assert.strictEqual(resp.groups[resp.groups.length - 1].keys, null);
    assert.strictEqual(await resp.text(), "[1 of 3 key-shape groups rejected; 2 of 4 rows written] not sent: external_id appears more than once in this batch, in rows of different shape (x)");
    assert.strictEqual(resp.status, null);

    // In rows of the SAME shape: one request, refused by the database (21000), as before.
    const same = freshDb();
    const sameResp = await upsertEventRows(URL_BASE, KEY, [event("x", { title: "one" }), event("x", { title: "two" })]);
    assert.deepStrictEqual([sameResp.ok, sameResp.status, sameResp.written], [false, 500, 0]);
    assert.strictEqual(JSON.parse(await sameResp.text()).code, "21000");
    assert.strictEqual(posts(same.db).length, 1);

    // Rows with no external_id at all never count as duplicates of each other.
    const anonymous = freshDb();
    const anon = await upsertEventRows(URL_BASE, KEY, [
      { title: "no id 1", category: "music", start_date: "2026-10-03" },
      { title: "no id 2", category: "music", start_date: "2026-10-03", description: "d" },
    ]);
    assert.deepStrictEqual([anon.ok, anon.written, anonymous.tables.events.length], [true, 2, 2]);
  }
  console.log("PASS: a duplicated external_id is never applied twice — withheld and reported when the copies differ in shape, refused by the database when they do not");

  // --- 9. any mix of shapes: accepted, and equal to writing row by row -------
  {
    // Deterministic generator (same sequence every run).
    let seed = 20261003;
    const rnd = (n) => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) % n;
    };
    const OPTIONAL = ["description", "time_display", "end_date", "venue_address_raw", "venue_city_raw", "image_url", "note", "price_from", "ticket_url"];
    let batches = 0, mixedBatches = 0, requests = 0;
    for (let b = 0; b < 250; b++) {
      const existing = [];
      for (let i = 0; i < 6; i++) {
        if (rnd(2)) existing.push({ id: `id-${i}`, ...event(`e-${i}`), description: "stored", time_display: "stored", note: "stored", image_url: "stored" });
      }
      const rows = [];
      const n = 1 + rnd(12);
      for (let i = 0; i < n; i++) {
        const row = event(`e-${i}`);
        for (const key of OPTIONAL) {
          const roll = rnd(4);
          if (roll === 0) row[key] = undefined;       // omitted
          else if (roll === 1) row[key] = null;       // explicit blank
          else if (roll === 2) row[key] = key === "price_from" ? rnd(90) : `${key}-${i}`;
          // roll 3: key not set at all
        }
        rows.push(row);
      }

      // Reference: what the same rows do when written one at a time.
      const reference = freshDb(existing.map((r) => ({ ...r })));
      for (const row of rows) {
        const one = await reference.db.fetch(`${URL_BASE}/rest/v1/events?on_conflict=external_id`, { method: "POST", headers: { Prefer: DEFAULT_PREFER }, body: JSON.stringify([row]) });
        assert.strictEqual(one.ok, true);
      }

      const actual = freshDb(existing.map((r) => ({ ...r })));
      const resp = await upsertEventRows(URL_BASE, KEY, rows);
      assert.strictEqual(resp.ok, true, `batch ${b} must be accepted`);
      assert.strictEqual(resp.written, rows.length);
      const strip = (list) => list.map(({ id, created_at, updated_at, ...rest }) => rest).sort((x, y) => (x.external_id < y.external_id ? -1 : 1));
      assert.deepStrictEqual(strip(actual.tables.events), strip(reference.tables.events), `batch ${b}: grouped writes store exactly what row-by-row writes store`);

      batches++;
      requests += posts(actual.db).length;
      if (new Set(rows.map((r) => JSON.stringify(keyShapeOf(r)))).size > 1) mixedBatches++;
      for (const request of posts(actual.db)) {
        const body = JSON.parse(request.body);
        assert.strictEqual(new Set(body.map((r) => JSON.stringify(Object.keys(r).sort()))).size, 1, "every request sent is uniform");
      }
    }
    assert.ok(mixedBatches > 200, `the generator really does produce mixed batches (${mixedBatches} of ${batches})`);
    console.log(`PASS: ${batches} generated batches (${mixedBatches} with mixed shapes, ${requests} requests) — all accepted, each storing exactly what row-by-row writes store`);
  }

  console.log("\nAll event-upsert.test.js checks passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
