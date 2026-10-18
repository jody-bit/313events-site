// test/admin-events-save-correction.test.js — #185 increment 1: api/admin-events.js "save_correction", the audit line it
// writes, the row-version check, the gated approve step, and the owner-correction lock honoured by the shared upsert
// writer (api/_lib/event-upsert.js) for every connector.
//
// Real handler and real writer against the shared fake database. Plain Node assert.
// Run: node test/admin-events-save-correction.test.js
"use strict";
const assert = require("assert");
const { makeMockPostgrest, eventsSchema } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const V1 = "2026-10-18T05:00:00+00:00";

const fresh = (p) => { delete require.cache[require.resolve(`${REPO_DIR}/${p}`)]; return require(`${REPO_DIR}/${p}`); };
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });
const row = (extra) => ({
  id: "evt-1", external_id: "src-1", source: "GottaGacha", status: "pending_review", title: "Corridor Cyberpunk Ravee", category: "nightlife",
  start_date: "2027-11-20", time_display: "9:00 PM", venue_name_raw: "Some Venue", venue_id: "venue-9", venue_address_raw: "1 Main St", venue_city_raw: "Detroit",
  description: "A night of music.", ticket_url: null, event_url: null, internal_note: null, updated_at: V1, ...extra,
});

async function call(tables, body, hook) {
  const db = makeMockPostgrest(tables);
  global.fetch = async (url, init) => { if (hook) hook(String(url), init, tables); return db.fetch(String(url), init); };
  const res = makeRes();
  await fresh("api/admin-events.js")({ method: "POST", body, headers: { "x-admin-secret": process.env.ADMIN_SECRET } }, res);
  return { res, db };
}
const writes = (db) => db.log.filter((r) => r.table === "events" && r.method !== "GET");
const stored = (tables, id = "evt-1") => tables.events.find((e) => e.id === id);

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.ADMIN_SECRET = "fixture-admin-secret";
  delete process.env.RESEND_API_KEY;

  // 1. Save correction: overwrite a wrong value, status unchanged, one audit line, a version bump
  {
    const tables = { events: [row()] };
    const { res } = await call(tables, { id: "evt-1", action: "save_correction", row_version: V1, fields: { title: "Corridor Cyberpunk Rave", venue_name_raw: "Corridor" }, note: "typo and venue spelling" });
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const b = res._body;
    assert.deepStrictEqual(b.changes, [{ field: "title", before: "Corridor Cyberpunk Ravee", after: "Corridor Cyberpunk Rave" }, { field: "venue_name_raw", before: "Some Venue", after: "Corridor" }]);
    assert.strictEqual(stored(tables).title, "Corridor Cyberpunk Rave", "a non-empty value is overwritten");
    assert.strictEqual(stored(tables).status, "pending_review", "saving a correction never approves");
    assert.deepStrictEqual([b.status_before, b.status_after], ["pending_review", "pending_review"]);
    assert.deepStrictEqual(b.approve, { requested: false, done: false, blocked: null });
    assert.notStrictEqual(b.row_version, V1, "the version moves");
    assert.strictEqual(b.row_version, stored(tables).updated_at);
    assert.deepStrictEqual(b.owner_corrected.sort(), ["title", "venue_name_raw"], "the view lists only the fields a person edited; venue_id is locked server-side, not shown");
    assert.ok(!("internal_note" in b.event), "the audit text is not echoed in the event");
    assert.strictEqual(b.edits.length, 2);
    assert.deepStrictEqual(b.edits.map((e) => [e.field, e.before, e.after, e.actor, e.note]), [["title", "Corridor Cyberpunk Ravee", "Corridor Cyberpunk Rave", "admin", "typo and venue spelling"], ["venue_name_raw", "Some Venue", "Corridor", "admin", "typo and venue spelling"]]);
    assert.ok(/^OWNER-CORRECTION \S+ e-\S+ fields=title,venue_name_raw \| /.test(stored(tables).internal_note), "one audit line in internal_note");
    assert.strictEqual(stored(tables).description, "A night of music.", "fields not named are untouched");
    assert.strictEqual(stored(tables).venue_id, "venue-9");

    // a second correction appends; the first line survives
    const again = await call(tables, { id: "evt-1", action: "save_correction", row_version: b.row_version, fields: { description: "A night of rave music." } });
    assert.strictEqual(again.res._status, 200, JSON.stringify(again.res._body));
    assert.strictEqual(stored(tables).internal_note.split("\n").length, 2);
    assert.strictEqual(again.res._body.edits.length, 3, "history is append-only and returned oldest first");
  }
  console.log("PASS: Save correction overwrites, records before/after, keeps status, bumps the version and appends to the audit trail");

  // 2. nothing to change is not an error and writes nothing
  {
    const tables = { events: [row()] };
    const { res, db } = await call(tables, { id: "evt-1", action: "save_correction", row_version: V1, fields: { title: "Corridor Cyberpunk Ravee" } });
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._body.changes, []);
    assert.strictEqual(writes(db).length, 0);
    assert.strictEqual(res._body.edit_id, null);
  }
  console.log("PASS: a correction equal to the stored value changes and writes nothing");

  // 3. stale row version: 409, nothing written; and a change between read and write
  {
    const tables = { events: [row()] };
    const stale = await call(tables, { id: "evt-1", action: "save_correction", row_version: "2026-10-17T00:00:00+00:00", fields: { title: "X Y Z" } });
    assert.strictEqual(stale.res._status, 409);
    assert.strictEqual(stale.res._body.error, "row changed");
    assert.strictEqual(stale.res._body.row_version, V1);
    assert.strictEqual(stale.res._body.current.title, "Corridor Cyberpunk Ravee");
    assert.strictEqual(writes(stale.db).length, 0, "nothing written");

    const raceTables = { events: [row()] };
    const race = await call(raceTables, { id: "evt-1", action: "save_correction", row_version: V1, fields: { title: "Race Title" } }, (url, init, t) => {
      if (init && init.method === "PATCH") t.events[0].updated_at = "2026-10-18T05:00:01+00:00"; // someone else saved first
    });
    assert.strictEqual(race.res._status, 409, "the version is checked inside the UPDATE: zero rows match");
    assert.strictEqual(stored(raceTables).title, "Corridor Cyberpunk Ravee", "the later writer did not overwrite");
  }
  console.log("PASS: a stale or raced row version is a 409 and nothing is overwritten");

  // 4. invalid input: nothing written
  {
    const cases = [
      [{ title: "   " }, "title"], [{ ticket_url: "javascript:alert(1)" }, "ticket_url"], [{ title: "ab" }, "title"],
      [{ status: "approved" }, "status"], [{ start_date: "2026-12-01" }, "start_date"], [{ venue_id: "x" }, "venue_id"], [{ description: 5 }, "description"],
    ];
    for (const [fields, field] of cases) {
      const tables = { events: [row()] };
      const { res, db } = await call(tables, { id: "evt-1", action: "save_correction", row_version: V1, fields });
      assert.strictEqual(res._status, 400, JSON.stringify(fields));
      assert.strictEqual(res._body.field, field);
      assert.strictEqual(writes(db).length, 0);
    }
    const missing = await call({ events: [row()] }, { id: "nope", action: "save_correction", row_version: V1, fields: { title: "Valid Title" } });
    assert.strictEqual(missing.res._status, 404);
    const noVersion = await call({ events: [row()] }, { id: "evt-1", action: "save_correction", fields: { title: "Valid Title" } });
    assert.strictEqual(noVersion.res._status, 400, "row_version is required");
  }
  console.log("PASS: blank, unsafe, too-short, unknown and out-of-scope fields (status, dates, venue_id) are refused with the field named");

  // 5. Save and approve is a gated last step
  {
    const ok = { events: [row()] };
    const a = await call(ok, { id: "evt-1", action: "save_correction", row_version: V1, fields: { title: "Corridor Cyberpunk Rave" }, approve: true });
    assert.strictEqual(a.res._status, 200, JSON.stringify(a.res._body));
    assert.strictEqual(a.res._body.approve.done, true);
    assert.strictEqual(stored(ok).status, "approved");
    assert.deepStrictEqual([a.res._body.status_before, a.res._body.status_after], ["pending_review", "approved"]);

    const ra = { events: [row({ source: "Resident Advisor", time_display: null })] };
    const b = await call(ra, { id: "evt-1", action: "save_correction", row_version: V1, fields: { description: "Corrected words here." }, approve: true });
    assert.strictEqual(b.res._status, 200);
    assert.strictEqual(b.res._body.approve.blocked.failed_gate, "missing_time");
    assert.strictEqual(stored(ra).status, "pending_review", "approval refused");
    assert.strictEqual(stored(ra).description, "Corrected words here.", "but the correction is kept");

    const held = { events: [row({ venue_city_raw: "Detroit, MI" })] };
    const c = await call(held, { id: "evt-1", action: "save_correction", row_version: V1, fields: { description: "Corrected words here." }, approve: true });
    assert.strictEqual(c.res._body.approve.blocked.failed_gate, "publication_gate");
    assert.ok(c.res._body.approve.blocked.codes.includes("CITY_HAS_REGION"));
    assert.strictEqual(stored(held).status, "pending_review");

    // fixing the cause in the same save lets the approval through
    const fixed = await call(held, { id: "evt-1", action: "save_correction", row_version: stored(held).updated_at, fields: { venue_city_raw: "Detroit" }, approve: true });
    assert.strictEqual(fixed.res._body.approve.done, true, JSON.stringify(fixed.res._body.approve));

    // a hand-submitted row (no external_id, no source) is not blocked by identity codes
    const manual = { events: [row({ external_id: null, source: null })] };
    const m = await call(manual, { id: "evt-1", action: "save_correction", row_version: V1, fields: { title: "Hand Submitted Show" }, approve: true });
    assert.strictEqual(m.res._body.approve.done, true, JSON.stringify(m.res._body.approve));
  }
  console.log("PASS: approve:true runs the missing-time and publication checks, names the failing gate, and never loses the correction");

  // 6. the review queue carries the version and the correction history
  {
    const tables = { events: [row()], feed_sources: [], source_runs: [] };
    const saved = await call(tables, { id: "evt-1", action: "save_correction", row_version: V1, fields: { title: "Corridor Cyberpunk Rave" } });
    assert.strictEqual(saved.res._status, 200);
    const db = makeMockPostgrest(tables);
    global.fetch = async (url, init) => db.fetch(String(url), init);
    const res = makeRes();
    await fresh("api/admin-events.js")({ method: "GET", query: {}, headers: { "x-admin-secret": process.env.ADMIN_SECRET } }, res);
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const e = res._body.events.find((x) => x.id === "evt-1");
    assert.strictEqual(e.row_version, saved.res._body.row_version);
    assert.deepStrictEqual(e.owner_corrected, ["title"]);
    assert.strictEqual(e.edits[0].before, "Corridor Cyberpunk Ravee");
  }
  console.log("PASS: queue rows carry row_version, owner_corrected and edits");

  // 7. ingestion honours the lock, through the one shared writer
  {
    const { upsertEventRows } = fresh("api/_lib/event-upsert.js");
    const tables = { events: [row({ internal_note: null })] };
    await call(tables, { id: "evt-1", action: "save_correction", row_version: V1, fields: { title: "Corridor Cyberpunk Rave", venue_name_raw: "Corridor" } });
    tables.events.push(row({ id: "evt-2", external_id: "src-2", title: "Untouched Source Title", venue_id: "venue-2", internal_note: null }));
    const dbi = makeMockPostgrest(tables, { schema: { events: eventsSchema({ categories: ["nightlife", "music"] }) } });
    global.fetch = async (url, init) => dbi.fetch(String(url), init);
    const resp = await upsertEventRows(SUPABASE_URL, "k", [
      { external_id: "src-1", title: "CORRIDOR CYBERPUNK RAVEE (source wording)", category: "nightlife", start_date: "2027-11-20", venue_name_raw: "Some Venue", venue_id: "venue-OTHER", description: "Source description", status: "pending_review" },
      { external_id: "src-2", title: "Source Retitled", category: "music", start_date: "2027-11-20", venue_name_raw: "Elsewhere", venue_id: "venue-3", description: "New description", status: "pending_review" },
    ]);
    assert.strictEqual(resp.ok, true, await resp.text());
    const one = tables.events.find((e) => e.external_id === "src-1");
    assert.strictEqual(one.title, "Corridor Cyberpunk Rave", "a corrected title survives the source (a NOT NULL column is rewritten with its stored value, not omitted)");
    assert.strictEqual(one.venue_name_raw, "Corridor");
    assert.strictEqual(one.venue_id, "venue-9", "a corrected venue name keeps its venue link");
    assert.strictEqual(one.description, "Source description", "fields nobody corrected still follow the source");
    assert.match(one.internal_note, /^OWNER-CORRECTION /, "and the audit line is not overwritten");
    const two = tables.events.find((e) => e.external_id === "src-2");
    assert.strictEqual(two.title, "Source Retitled", "an uncorrected row is unaffected");
    assert.strictEqual(two.venue_id, "venue-3");

    // the marker read is fail-closed: if it cannot be read, nothing is written
    const before = JSON.stringify(tables);
    const dbBad = makeMockPostgrest(tables, { failure: (r) => (r.method === "GET" ? 500 : null) });
    global.fetch = async (url, init) => dbBad.fetch(String(url), init);
    const bad = await upsertEventRows(SUPABASE_URL, "k", [{ external_id: "src-1", title: "Would revert", category: "music", start_date: "2027-11-20" }]);
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(bad.written, 0);
    assert.strictEqual(JSON.stringify(tables), before, "no write when the correction markers cannot be read");
    assert.match(await bad.text(), /owner-correction lookup failed: HTTP 500/);
  }
  console.log("PASS: a connector upsert leaves corrected fields (and the venue link) alone, keeps the audit line, and aborts if the markers cannot be read");

  console.log("\nAll save_correction checks passed.");
}
run().catch((e) => { console.error(e); process.exit(1); });
