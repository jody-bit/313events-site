// test/cron-ticketmaster-description-safeguard.test.js — Ticketmaster never
// replaces a stored event's corrected fields (description, title, time, venue,
// address, city, category, image, price, ticket link).
//
// HISTORY. 2026-10-04 (BUG-007): the connector omitted only `description` from
// an existing row's upsert, because 529 of 604 upcoming Ticketmaster events had
// been given researched descriptions by hand. 2026-10-18 (REL-3 Ticketmaster
// fix, DEBT-011 / D1): the same protection now covers every field. Omitting
// more keys from an upsert cannot work (PostgreSQL checks NOT NULL on the
// proposed row before the conflict, so an upsert without `title` fails with
// 23502), so a stored event is no longer upserted at all: only its
// ticket_status is refreshed, by a column-only UPDATE. A NEW event is still
// upserted in full, with Ticketmaster's `info` as its description.
//
// The earlier version of this file also asserted that a stored event's title,
// time, price and address were refreshed from Ticketmaster (section 1c). That
// is the behaviour this change deliberately ends; those assertions now pin the
// opposite. Every description assertion is kept.
//
// Plain Node assert, no dependencies.
// Run: node test/cron-ticketmaster-description-safeguard.test.js
"use strict";
const assert = require("assert");

const {
  world, json, runConnector, eventWrites, sentRows, sentRow, shapeCount, byId,
  assertHeterogeneousAndNowWritten, SUPABASE_URL, UPSERT_PREFER,
} = require("./fixtures/connector-harness.js");

const TM_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

const tmEvent = (id, name, extra) => ({
  id, name, url: `https://www.ticketmaster.com/event/${id}`,
  classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
  dates: { start: { localDate: "2026-10-09", localTime: "19:30:00" }, status: { code: "onsale" } },
  images: [{ ratio: "16_9", url: `https://s1.ticketm.net/dam/a/${id}.jpg`, width: 1024, height: 576 }],
  priceRanges: [{ min: 35, max: 120 }],
  _embedded: { venues: [{ name: "Fixture Hall", city: { name: "Detroit" }, address: { line1: "2115 Woodward Ave" }, location: { latitude: "42.3387", longitude: "-83.0524" } }] },
  ...extra,
});

// A row as it sits in production: written before 2026-09-05, then improved
// by hand or by the enrichment job.
const stored = (id, extra) => ({
  id: `row-${id}`, external_id: id, title: "stored title", category: "music", start_date: "2026-10-09", status: "approved",
  source: "Ticketmaster", time_display: "8:00 PM", description: null, description_source: null, ...extra,
});

const upstreamOf = (events) => (url) => (url.startsWith(TM_URL) ? json({ _embedded: { events: typeof events === "function" ? events() : events }, page: { totalPages: 1 } }) : null);
const hasDescriptionKey = (row) => Object.prototype.hasOwnProperty.call(row, "description");
const lookups = (db) => db.log.filter((r) => r.table === "events" && r.method === "GET" && !r.url.includes("internal_note=like.")); // the shared upsert writer's owner-correction read (#185) is not a status lookup


const patches = (db) => db.log.filter((r) => r.table === "events" && r.method === "PATCH");
const idsOf = (request) => decodeURIComponent(request.url.match(/external_id=in\.\(([^)]*)\)/)[1]).split(",");
process.env.TICKETMASTER_REQUEST_GAP_MS = "0";

async function run() {
  // =========================================================================
  // 1. A realistic run: some events new, some already stored
  // =========================================================================
  {
    const RESEARCHED = "Tribute act Chest Fever recreates The Band's farewell concert for its 50th anniversary.";
    const GENERATED = "A rock show at Fixture Hall.";
    const corrected = { title: "Chest Fever (corrected)", time_display: "7:00 PM", venue_name_raw: "Corrected Hall", venue_address_raw: "1 Hand-entered St", venue_city_raw: "Corrected City", category: "theatre", image_url: "https://img.example/hand.jpg", price_from: 20, ticket_url: "https://tickets.example/hand", ticket_status: "offsale" };
    const events = [
      tmEvent("new-with-info", "New Band One", { info: "Doors at 6:30. All ages." }),
      tmEvent("new-without-info", "New Band Two"),
      tmEvent("old-researched", "Chest Fever", { info: "Please note: no re-entry. Bag policy applies." }),
      tmEvent("old-generated", "Stored Band G", { info: "General admission, standing." }),
      tmEvent("old-blank", "Stored Band B", { info: "Seated show." }),
      tmEvent("old-rejected", "Stored Band R | Suite Package", { info: "Package includes parking.", dates: { start: { localDate: "2026-10-09", localTime: "19:30:00" }, status: { code: "cancelled" } } }),
      tmEvent("old-no-info", "Stored Band N"),
    ];
    const { tables, db } = world({
      events: [
        stored("old-researched", { description: RESEARCHED, ...corrected }),
        stored("old-generated", { description: GENERATED, description_source: "generated" }),
        stored("old-blank"),
        stored("old-rejected", { description: "Hidden duplicate listing.", status: "rejected" }),
        stored("old-no-info", { description: "Hand-written, and Ticketmaster has nothing to say." }),
      ],
      upstream: upstreamOf(events),
    });
    const res = await runConnector("cron-ticketmaster.js");

    // --- the two NEW events: batching helper, mixed shapes, written as two uniform requests
    const outcome = await assertHeterogeneousAndNowWritten("Ticketmaster safeguard", db, tables, { ...res, _body: { upserted: 2 } }, 2);
    assert.strictEqual(outcome.shapes, 2, "one shape with a description (new event that has `info`), one without");
    assert.deepStrictEqual(sentRows(db).map((r) => r.external_id).sort(), ["new-with-info", "new-without-info"], "ONLY new events are upserted");
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.upserted, 7, "2 inserted + 5 stored rows refreshed");
    assert.strictEqual(res._body.inserted, 2);
    assert.strictEqual(tables.events.length, 7, "two inserted, no duplicate rows");

    // --- 1a. NEW events: Ticketmaster's description when it supplies one
    assert.strictEqual(byId(tables, "new-with-info").description, "Doors at 6:30. All ages.");
    assert.strictEqual(byId(tables, "new-with-info").status, "approved");
    assert.strictEqual(hasDescriptionKey(sentRow(db, "new-without-info")), false, "no `info`, no key — never an explicit null");
    assert.strictEqual(byId(tables, "new-without-info").description, null);

    // --- 1b. EXISTING events: description survives, whatever Ticketmaster says
    assert.strictEqual(byId(tables, "old-researched").description, RESEARCHED, "a hand-researched description is not replaced by Ticketmaster's `info`");
    assert.strictEqual(byId(tables, "old-generated").description, GENERATED, "nor is a generated one");
    assert.strictEqual(byId(tables, "old-generated").description_source, "generated", "so its provenance label stays true");
    assert.strictEqual(byId(tables, "old-rejected").description, "Hidden duplicate listing.");
    assert.strictEqual(byId(tables, "old-rejected").status, "rejected", "and a moderator's rejection still survives");
    assert.strictEqual(byId(tables, "old-no-info").description, "Hand-written, and Ticketmaster has nothing to say.");
    assert.strictEqual(byId(tables, "old-blank").description, null, "a stored blank is left for enrichment, not filled from `info`");

    // --- 1c. NEW (2026-10-18): every other field of a stored row is protected too
    const kept = byId(tables, "old-researched");
    for (const [field, value] of Object.entries(corrected)) {
      if (field === "ticket_status") continue;
      assert.strictEqual(kept[field], value, `${field}: a stored correction is not reverted by Ticketmaster`);
    }
    assert.strictEqual(kept.ticket_status, "onsale", "ticket_status is Ticketmaster's own live fact and IS refreshed");
    assert.strictEqual(kept.id, "row-old-researched", "updated in place");
    assert.strictEqual(byId(tables, "old-blank").title, "stored title", "the title of a stored row is not replaced");
    assert.strictEqual(byId(tables, "old-blank").time_display, "8:00 PM");
    assert.strictEqual(byId(tables, "old-rejected").ticket_status, "cancelled", "a cancellation is picked up even on a row a moderator rejected");
    assert.strictEqual(byId(tables, "old-rejected").status, "rejected", "without touching its moderation status");

    // --- the update requests: column-only, grouped by value, never a row upsert
    const bodies = patches(db).map((r) => JSON.parse(r.body));
    assert.ok(bodies.every((b) => JSON.stringify(Object.keys(b)) === '["ticket_status"]'), "every UPDATE carries ticket_status and nothing else");
    assert.strictEqual(patches(db).length, 2, "one UPDATE per status value: onsale (4 rows) and cancelled (1 row)");
    assert.ok(patches(db).every((r) => r.headers.Prefer === "return=representation" && /or=\(ticket_status\.is\.null,ticket_status\.neq\./.test(decodeURIComponent(r.url))), "an UPDATE only reaches rows whose stored status differs");
    assert.deepStrictEqual(patches(db).flatMap(idsOf).sort(), ["old-blank", "old-generated", "old-no-info", "old-rejected", "old-researched"]);

    // --- 5a. one lookup, as before: existence is read from the one status lookup
    assert.strictEqual(lookups(db).length, 1, "existence is read from the one status lookup the connector already made");
    assert.ok(lookups(db)[0].url.endsWith("&select=external_id,status"), "which still selects only external_id and status");
  }
  console.log("PASS: a new event gets Ticketmaster's description; a stored event keeps every field and only its ticket_status is refreshed");
  console.log("PASS: new events are written as uniform requests; stored events are never upserted");

  // =========================================================================
  // 3a. Every event already stored: no upsert at all
  // =========================================================================
  {
    const events = [
      tmEvent("s-1", "Stored One", { info: "Ticketmaster text one." }),
      tmEvent("s-2", "Stored Two", { info: "Ticketmaster text two." }),
      tmEvent("s-3", "Stored Three"),
    ];
    const { tables, db } = world({
      events: [stored("s-1", { description: "Researched one." }), stored("s-2", { description: "Researched two." }), stored("s-3", { description: "Researched three." })],
      upstream: upstreamOf(events),
    });
    const res = await runConnector("cron-ticketmaster.js");
    assert.deepStrictEqual([res._status, res._body.upserted], [200, 3]);
    assert.strictEqual(eventWrites(db).length, 0, "all stored: no row upsert");
    assert.strictEqual(patches(db).length, 1, "one UPDATE for the shared status");
    assert.deepStrictEqual(tables.events.map((r) => r.description), ["Researched one.", "Researched two.", "Researched three."]);
    assert.deepStrictEqual(tables.events.map((r) => r.title), ["stored title", "stored title", "stored title"], "titles are no longer refreshed");
  }
  console.log("PASS: a run of only stored events sends no upsert and one column-only UPDATE");

  // =========================================================================
  // 3b. Every event new, all with `info`: unchanged from before
  // =========================================================================
  {
    const events = [tmEvent("n-1", "New One", { info: "Text one." }), tmEvent("n-2", "New Two", { info: "Text two." })];
    const { tables, db } = world({ upstream: upstreamOf(events) });
    const res = await runConnector("cron-ticketmaster.js");
    assert.deepStrictEqual([res._status, res._body.upserted], [200, 2]);
    assert.strictEqual(eventWrites(db).length, 1);
    assert.strictEqual(patches(db).length, 0);
    assert.strictEqual(eventWrites(db)[0].url, `${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`);
    assert.strictEqual(eventWrites(db)[0].headers.Prefer, UPSERT_PREFER);
    assert.deepStrictEqual(tables.events.map((r) => r.description), ["Text one.", "Text two."]);
    assert.ok(tables.events.every((r) => r.status === "approved"));
  }
  console.log("PASS: a run of only new events stores Ticketmaster's descriptions in one request");

  // =========================================================================
  // 4. Across runs: what a person writes in between is kept
  // =========================================================================
  {
    let day = 1;
    const feed = () => {
      const returning = tmEvent("two-runs", day === 1 ? "Returning Band" : "Returning Band (new title)", { info: day === 1 ? "Doors at 7." : "Doors at 7. UPDATED: bag policy in effect." });
      const later = tmEvent("arrives-later", "Later Band", { info: day === 3 ? "Doors at 8 (time changed)." : "New on day two." });
      return day === 1 ? [returning] : [returning, later];
    };
    const { tables, db } = world({ upstream: upstreamOf(feed) });

    const first = await runConnector("cron-ticketmaster.js");
    assert.deepStrictEqual([first._status, first._body.upserted], [200, 1]);
    assert.strictEqual(byId(tables, "two-runs").description, "Doors at 7.", "day one: new, so Ticketmaster's description is stored");

    // A moderator corrects the description and the title; Ticketmaster changes its own text too.
    byId(tables, "two-runs").description = "Researched: the band's first Detroit show since 2019.";
    byId(tables, "two-runs").title = "Returning Band (owner-corrected)";
    day = 2;
    const second = await runConnector("cron-ticketmaster.js");
    assert.deepStrictEqual([second._status, second._body.upserted], [200, 1], "only the new event is written; the stored one's status already matches");
    assert.strictEqual(byId(tables, "two-runs").description, "Researched: the band's first Detroit show since 2019.", "day two: the hand-written description is kept");
    assert.strictEqual(byId(tables, "two-runs").title, "Returning Band (owner-corrected)", "and so is the corrected title, though Ticketmaster now says something else");
    assert.strictEqual(byId(tables, "arrives-later").description, "New on day two.", "while the event that is new on day two gets Ticketmaster's");
    assert.strictEqual(tables.events.length, 2, "and no duplicate row");

    day = 3;
    const third = await runConnector("cron-ticketmaster.js");
    assert.deepStrictEqual([third._status, third._body.upserted], [200, 0], "day three: both are stored with matching statuses, nothing to write");
    assert.strictEqual(byId(tables, "arrives-later").description, "New on day two.", "day three: Ticketmaster changed its text; the stored one stays");
  }
  console.log("PASS: a description or title corrected between runs survives the next runs");

  // =========================================================================
  // 5b. The lookup that says "existing" is fail-closed
  // =========================================================================
  {
    const events = [tmEvent("fc-old", "Stored", { info: "Ticketmaster text." }), tmEvent("fc-new", "New", { info: "More text." })];
    const { tables, db } = world({
      events: [stored("fc-old", { description: "Researched." })],
      upstream: upstreamOf(events),
      failure: (request) => (request.table === "events" && request.method === "GET" ? 500 : null),
    });
    const res = await runConnector("cron-ticketmaster.js");
    assert.strictEqual(res._status, 502, "a failed lookup aborts the run");
    assert.strictEqual(eventWrites(db).length + patches(db).length, 0, "before any event write — a stored event can never be treated as new");
    assert.strictEqual(byId(tables, "fc-old").description, "Researched.");
    assert.strictEqual(tables.events.length, 1);
  }
  console.log("PASS: if the status lookup fails nothing is written, so a stored event cannot be overwritten by mistake");

  // =========================================================================
  // 6. A blank status from Ticketmaster never erases the stored one
  // =========================================================================
  {
    const noStatus = tmEvent("blank-status", "Stored", { dates: { start: { localDate: "2026-10-09", localTime: "19:30:00" } } });
    const { tables, db } = world({ events: [stored("blank-status", { ticket_status: "cancelled" })], upstream: upstreamOf([noStatus]) });
    const res = await runConnector("cron-ticketmaster.js");
    assert.strictEqual(res._status, 200);
    assert.strictEqual(patches(db).length, 0, "nothing to send, nothing sent");
    assert.strictEqual(byId(tables, "blank-status").ticket_status, "cancelled");
  }
  console.log("PASS: a blank ticket_status from Ticketmaster does not erase a stored one");

  // =========================================================================
  // 6b. A status that already matches is not rewritten (no updated_at bump on ~600 rows a day)
  // =========================================================================
  {
    const { tables } = world({
      events: [stored("same", { ticket_status: "onsale", updated_at: "2026-10-01T00:00:00Z" }), stored("changed", { ticket_status: "offsale", updated_at: "2026-10-01T00:00:00Z" }), stored("nulled", { ticket_status: null, updated_at: "2026-10-01T00:00:00Z" })],
      upstream: upstreamOf([tmEvent("same", "S"), tmEvent("changed", "C"), tmEvent("nulled", "N")]),
    });
    const res = await runConnector("cron-ticketmaster.js");
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.status_refreshed, 2, "only the two rows whose status actually differed were written");
    assert.strictEqual(byId(tables, "same").updated_at, "2026-10-01T00:00:00Z", "an unchanged row is not touched");
    assert.notStrictEqual(byId(tables, "changed").updated_at, "2026-10-01T00:00:00Z");
    assert.strictEqual(byId(tables, "changed").ticket_status, "onsale");
    assert.strictEqual(byId(tables, "nulled").ticket_status, "onsale", "a stored NULL counts as different");
  }
  console.log("PASS: a ticket_status that already matches is not rewritten");

  // =========================================================================
  // 7. A failed status UPDATE is reported, not hidden
  // =========================================================================
  {
    const { db, tables } = world({
      events: [stored("p-1")], upstream: upstreamOf([tmEvent("p-1", "Stored"), tmEvent("p-new", "New")]),
      failure: (request) => (request.table === "events" && request.method === "PATCH" ? 500 : null),
    });
    const res = await runConnector("cron-ticketmaster.js");
    assert.strictEqual(res._status, 502);
    assert.match(res._body.error, /ticket_status refresh failed for 1 stored rows/);
    assert.strictEqual(tables.source_runs.at(-1).outcome, "partial");
    assert.ok(byId(tables, "p-new"), "the new event was still written");
  }
  console.log("PASS: a failed ticket_status UPDATE logs partial and answers 502, with the new events still written");

  // =========================================================================
  // 8. Dry run: reads and reports, writes nothing, logs no run
  // =========================================================================
  {
    const events = [
      tmEvent("d-new", "New Dry"),
      tmEvent("d-same", "Same", { dates: { start: { localDate: "2026-10-09", localTime: "20:00:00" }, status: { code: "onsale" } } }),
      tmEvent("d-moved", "Moved Show", { dates: { start: { localDate: "2026-11-01", localTime: "19:30:00" }, status: { code: "rescheduled" } } }),
    ];
    const { tables, db } = world({
      events: [
        stored("d-same", { title: "Same", venue_name_raw: "Fixture Hall", venue_city_raw: "Detroit", venue_address_raw: "2115 Woodward Ave", price_from: 35, ticket_status: "onsale", image_url: "https://s1.ticketm.net/dam/a/d-same.jpg", ticket_url: null }),
        stored("d-moved", { title: "Moved Show", ticket_status: "onsale" }),
      ],
      upstream: upstreamOf(events),
    });
    const before = JSON.stringify(tables);
    const calls = [];
    process.env.SUPABASE_URL = SUPABASE_URL;
    const res = await runConnector("cron-ticketmaster.js", { query: { dry: "1" } });
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.dry_run, true);
    assert.strictEqual(res._body.would_insert, 1);
    assert.strictEqual(res._body.would_update_live_fields, 1, "d-moved: ticket_status onsale -> rescheduled would be written");
    assert.ok(res._body.differences.some((d) => d.external_id === "d-moved" && d.held.includes("start_date") && d.applied.includes("ticket_status")), "the new date is listed as HELD, the status as applied");
    assert.strictEqual(JSON.stringify(tables), before, "no table changed, including source_runs");
    assert.strictEqual(eventWrites(db).length + patches(db).length, 0, "no event write of any kind");
    assert.strictEqual(tables.source_runs.length, 0, "and no run-log row, so a dry run cannot look like a real run");
  }
  console.log("PASS: ?dry=1 reports would-insert / would-update and held differences, and writes nothing");

  // =========================================================================
  // 9. Window splitting: over 1,000 results are fetched in halves
  // =========================================================================
  {
    const days = (u) => { const q = new URL(u).searchParams; return (Date.parse(q.get("endDateTime")) - Date.parse(q.get("startDateTime"))) / 86400000; };
    const seen = [];
    const { tables } = world({
      upstream: (u) => {
        if (!u.startsWith(TM_URL)) return null;
        seen.push(days(u));
        const total = days(u) > 60 ? 1400 : 600;
        const id = `win-${new URL(u).searchParams.get("startDateTime")}-${new URL(u).searchParams.get("page")}`;
        return json({ _embedded: { events: days(u) > 60 ? [] : [tmEvent(id, "Window " + id)] }, page: { totalPages: Math.ceil(total / 200), totalElements: total } });
      },
    });
    const res = await runConnector("cron-ticketmaster.js");
    assert.strictEqual(res._status, 200);
    assert.ok(seen.some((d) => d > 60) && seen.filter((d) => d <= 60).length >= 6, "the 90-day window was split and both halves were paged (3 pages each)");
    assert.ok(tables.events.length >= 6, "events from both halves were stored");
    assert.strictEqual(tables.source_runs.at(-1).outcome, "success");
  }
  console.log("PASS: a window with more than 1,000 results is split and every half is paged");

  console.log("\nAll Ticketmaster field-protection checks passed.");
}

run().catch((err) => { console.error(err); process.exit(1); });
