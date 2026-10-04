// test/cron-ticketmaster-description-safeguard.test.js — Ticketmaster never
// replaces a description that is already stored on an event.
//
// WHY (2026-10-04, found auditing the WP 0.7 recovery before it shipped)
// `description: e.info || undefined` was added to the connector on
// 2026-09-05 and has never completed a write in production: from that day
// every Ticketmaster batch was rejected (BUG-007). During the outage 529 of
// the 604 upcoming Ticketmaster events were given researched descriptions by
// hand and 73 a generated one. The first run that worked would have replaced
// every one of those Ticketmaster has `info` for — and done it again daily.
//
// THE RULE (Product Owner, 2026-10-04)
//   new event       Ticketmaster's description is sent when it supplies one
//   existing event  the `description` key is OMITTED from the upsert row, so
//                   the stored value survives — whatever it is, and whatever
//                   Ticketmaster says
// "Existing" comes from the status lookup the connector already performs; no
// additional database request is made.
//
// WHAT THIS TEST SHOWS, with the connector's real handler against the fake
// database that rejects what production rejects:
//   1. both behaviours, on the request itself and on the stored rows, for a
//      realistic mix of new and stored events;
//   2. the rows that result differ in shape, are refused as one request, and
//      are written by the shared batching helper as uniform requests;
//   3. a run of only-stored events and a run of only-new events are each one
//      request;
//   4. a description written by hand between two runs survives the next run;
//   5. no extra database request is made, and if the status lookup fails
//      nothing is written at all;
//   6. more optional fields than `description` (more row shapes) still write.
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
const lookups = (db) => db.log.filter((r) => r.table === "events" && r.method === "GET");

async function run() {
  // =========================================================================
  // 1 + 2. A realistic run: some events new, some already stored
  // =========================================================================
  {
    const RESEARCHED = "Tribute act Chest Fever recreates The Band's farewell concert for its 50th anniversary.";
    const GENERATED = "A rock show at Fixture Hall.";
    const events = [
      tmEvent("new-with-info", "New Band One", { info: "Doors at 6:30. All ages." }),
      tmEvent("new-without-info", "New Band Two"),
      tmEvent("old-researched", "Chest Fever", { info: "Please note: no re-entry. Bag policy applies." }),
      tmEvent("old-generated", "Stored Band G", { info: "General admission, standing." }),
      tmEvent("old-blank", "Stored Band B", { info: "Seated show." }),
      tmEvent("old-rejected", "Stored Band R | Suite Package", { info: "Package includes parking." }),
      tmEvent("old-no-info", "Stored Band N"),
    ];
    const { tables, db } = world({
      events: [
        stored("old-researched", { description: RESEARCHED }),
        stored("old-generated", { description: GENERATED, description_source: "generated" }),
        stored("old-blank"),
        stored("old-rejected", { description: "Hidden duplicate listing.", status: "rejected" }),
        stored("old-no-info", { description: "Hand-written, and Ticketmaster has nothing to say." }),
      ],
      upstream: upstreamOf(events),
    });
    const res = await runConnector("cron-ticketmaster.js");

    // --- 2. the batching helper: mixed shapes, refused as one, written as two
    const outcome = await assertHeterogeneousAndNowWritten("Ticketmaster safeguard", db, tables, res, 7);
    assert.strictEqual(outcome.shapes, 2, "one shape with a description (new event that has `info`), one without (everything else)");
    assert.strictEqual(outcome.requests, 2);
    assert.strictEqual(tables.events.length, 7, "five updated in place, two inserted, no duplicate rows");
    const carrying = eventWrites(db).map((request) => JSON.parse(request.body)).filter((rows) => hasDescriptionKey(rows[0]));
    assert.strictEqual(carrying.length, 1, "exactly one request carries descriptions");
    assert.deepStrictEqual(carrying[0].map((row) => row.external_id), ["new-with-info"], "and it holds only the new event that has `info`");

    // --- 1a. NEW events: Ticketmaster's description when it supplies one
    assert.strictEqual(sentRow(db, "new-with-info").description, "Doors at 6:30. All ages.");
    assert.strictEqual(byId(tables, "new-with-info").description, "Doors at 6:30. All ages.", "a new event is stored with Ticketmaster's description");
    assert.strictEqual(byId(tables, "new-with-info").status, "approved");
    assert.strictEqual(hasDescriptionKey(sentRow(db, "new-without-info")), false, "no `info`, no key — never an explicit null");
    assert.strictEqual(byId(tables, "new-without-info").description, null);

    // --- 1b. EXISTING events: the key is omitted, the stored value survives
    for (const id of ["old-researched", "old-generated", "old-blank", "old-rejected", "old-no-info"]) {
      assert.strictEqual(hasDescriptionKey(sentRow(db, id)), false, `${id}: the description key is not sent at all for a stored event`);
    }
    assert.strictEqual(byId(tables, "old-researched").description, RESEARCHED, "a hand-researched description is not replaced by Ticketmaster's `info`");
    assert.strictEqual(byId(tables, "old-researched").description_source, null);
    assert.strictEqual(byId(tables, "old-generated").description, GENERATED, "nor is a generated one");
    assert.strictEqual(byId(tables, "old-generated").description_source, "generated", "so its provenance label stays true");
    assert.strictEqual(byId(tables, "old-rejected").description, "Hidden duplicate listing.");
    assert.strictEqual(byId(tables, "old-rejected").status, "rejected", "and a moderator's rejection still survives");
    assert.strictEqual(byId(tables, "old-no-info").description, "Hand-written, and Ticketmaster has nothing to say.");
    // The deliberate consequence of "omit for every existing event": a stored
    // event with a blank description is left blank by this connector (the
    // enrichment job fills blanks). Pinned so a change to it is a decision.
    assert.strictEqual(byId(tables, "old-blank").description, null, "a stored blank is left for enrichment, not filled from `info`");

    // --- 1c. nothing else about an existing row's update changed
    const refreshed = byId(tables, "old-researched");
    assert.strictEqual(refreshed.title, "Chest Fever", "the title is still refreshed");
    assert.strictEqual(refreshed.time_display, "7:30 PM", "the time is still refreshed");
    assert.strictEqual(refreshed.price_from, 35);
    assert.strictEqual(refreshed.venue_address_raw, "2115 Woodward Ave");
    assert.strictEqual(refreshed.ticket_status, "onsale");
    assert.strictEqual(refreshed.id, "row-old-researched", "updated in place");
    // An existing row is sent with exactly the keys a no-`info` row always had.
    assert.deepStrictEqual(Object.keys(sentRow(db, "old-researched")).sort(), Object.keys(sentRow(db, "new-without-info")).sort());
    assert.deepStrictEqual(
      Object.keys(sentRow(db, "new-with-info")).sort(),
      [...Object.keys(sentRow(db, "new-without-info")), "description"].sort(),
      "a new event with `info` differs from the rest by the description key and nothing else"
    );

    // --- 5a. no additional database request: one lookup, as before
    assert.strictEqual(lookups(db).length, 1, "existence is read from the one status lookup the connector already made");
    assert.ok(lookups(db)[0].url.endsWith("&select=external_id,status"), "which still selects only external_id and status");
  }
  console.log("PASS: a new event gets Ticketmaster's description; a stored event's description key is omitted and its text survives");
  console.log("PASS: the resulting two row shapes are refused as one request and written by the batching helper as two uniform requests");

  // =========================================================================
  // 3a. Every event already stored: one shape, one request, nothing replaced
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
    assert.strictEqual(eventWrites(db).length, 1, "all stored: every row has the same shape, so it is a single request");
    assert.strictEqual(shapeCount(sentRows(db)), 1);
    assert.ok(sentRows(db).every((row) => !hasDescriptionKey(row)), "and no description is sent");
    assert.deepStrictEqual(tables.events.map((r) => r.description), ["Researched one.", "Researched two.", "Researched three."]);
    assert.deepStrictEqual(tables.events.map((r) => r.title), ["Stored One", "Stored Two", "Stored Three"], "while the rows were updated");
  }
  console.log("PASS: a run of only stored events is one uniform request that carries no description");

  // =========================================================================
  // 3b. Every event new, all with `info`: unchanged from before
  // =========================================================================
  {
    const events = [tmEvent("n-1", "New One", { info: "Text one." }), tmEvent("n-2", "New Two", { info: "Text two." })];
    const { tables, db } = world({ upstream: upstreamOf(events) });
    const res = await runConnector("cron-ticketmaster.js");
    assert.deepStrictEqual([res._status, res._body.upserted], [200, 2]);
    assert.strictEqual(eventWrites(db).length, 1);
    assert.strictEqual(eventWrites(db)[0].url, `${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`);
    assert.strictEqual(eventWrites(db)[0].headers.Prefer, UPSERT_PREFER);
    assert.deepStrictEqual(tables.events.map((r) => r.description), ["Text one.", "Text two."]);
    assert.ok(tables.events.every((r) => r.status === "approved"));
  }
  console.log("PASS: a run of only new events stores Ticketmaster's descriptions in one request");

  // =========================================================================
  // 4. Across two runs: what a person writes in between is kept
  // =========================================================================
  {
    let day = 1;
    const feed = () => {
      const returning = tmEvent("two-runs", "Returning Band", { info: day === 1 ? "Doors at 7." : "Doors at 7. UPDATED: bag policy in effect." });
      const later = tmEvent("arrives-later", "Later Band", { info: day === 3 ? "Doors at 8 (time changed)." : "New on day two." });
      return day === 1 ? [returning] : [returning, later];
    };
    const { tables, db } = world({ upstream: upstreamOf(feed) });

    const first = await runConnector("cron-ticketmaster.js");
    assert.deepStrictEqual([first._status, first._body.upserted], [200, 1]);
    assert.strictEqual(byId(tables, "two-runs").description, "Doors at 7.", "day one: new, so Ticketmaster's description is stored");

    // A moderator replaces it; Ticketmaster changes its own text too.
    byId(tables, "two-runs").description = "Researched: the band's first Detroit show since 2019.";
    day = 2;

    const writesBefore = eventWrites(db).length;
    const second = await runConnector("cron-ticketmaster.js");
    assert.deepStrictEqual([second._status, second._body.upserted], [200, 2]);
    assert.strictEqual(byId(tables, "two-runs").description, "Researched: the band's first Detroit show since 2019.", "day two: stored now, so the hand-written description is kept");
    assert.strictEqual(byId(tables, "arrives-later").description, "New on day two.", "while the event that is new on day two gets Ticketmaster's");
    const secondRun = eventWrites(db).slice(writesBefore);
    assert.strictEqual(secondRun.length, 2, "day two is two shapes — stored (no description) and new (description) — so two requests");
    for (const request of secondRun) assert.strictEqual(shapeCount(JSON.parse(request.body)), 1, "each of them uniform");
    assert.strictEqual(tables.events.length, 2, "and no duplicate row");

    // Even Ticketmaster's OWN earlier text is not refreshed once stored: the
    // rule is "never replace a stored description", not "never replace a
    // hand-written one" — the connector cannot tell them apart.
    day = 3;
    const third = await runConnector("cron-ticketmaster.js");
    assert.deepStrictEqual([third._status, third._body.upserted], [200, 2]);
    assert.strictEqual(byId(tables, "arrives-later").description, "New on day two.", "day three: Ticketmaster changed its text; the stored one stays");
    assert.strictEqual(byId(tables, "two-runs").description, "Researched: the band's first Detroit show since 2019.");
  }
  console.log("PASS: a description written by hand between runs survives the next run; day two's mixed shapes are two uniform requests");

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
    assert.strictEqual(eventWrites(db).length, 0, "before any event write — a stored event can never be treated as new");
    assert.strictEqual(byId(tables, "fc-old").description, "Researched.");
    assert.strictEqual(tables.events.length, 1);
  }
  console.log("PASS: if the status lookup fails nothing is written, so a stored description cannot be overwritten by mistake");

  // =========================================================================
  // 6. More shapes: the safeguard together with another optional field
  // =========================================================================
  {
    // `address: {}` has no line1, so venue_address_raw is omitted for those
    // events — a second, independent source of differing shapes.
    const noLine1 = { _embedded: { venues: [{ name: "Fixture Hall", city: { name: "Detroit" }, address: {}, location: { latitude: "42.3387", longitude: "-83.0524" } }] } };
    const events = [
      tmEvent("m-new-info", "New, info", { info: "Text." }),
      tmEvent("m-new-info-noaddr", "New, info, no street", { info: "Text.", ...noLine1 }),
      tmEvent("m-new-plain", "New, plain"),
      tmEvent("m-old-info", "Stored, info", { info: "Ticketmaster text." }),
      tmEvent("m-old-info-noaddr", "Stored, info, no street", { info: "Ticketmaster text.", ...noLine1 }),
      tmEvent("m-old-plain-noaddr", "Stored, no street", noLine1),
    ];
    const { tables, db } = world({
      events: [
        stored("m-old-info", { description: "Researched A.", venue_address_raw: "1 Hand-entered St" }),
        stored("m-old-info-noaddr", { description: "Researched B.", venue_address_raw: "2 Hand-entered St" }),
        stored("m-old-plain-noaddr", { description: "Researched C.", venue_address_raw: "3 Hand-entered St" }),
      ],
      upstream: upstreamOf(events),
    });
    const res = await runConnector("cron-ticketmaster.js");
    const outcome = await assertHeterogeneousAndNowWritten("Ticketmaster safeguard, several shapes", db, tables, res, 6);
    // description? x street address? :  new+info+addr | new+info | plain+addr (new plain, stored with addr) | no desc, no addr (stored)
    assert.strictEqual(outcome.shapes, 4);
    assert.strictEqual(outcome.requests, 4, "four shapes, four uniform requests, every row written");
    assert.strictEqual(tables.events.length, 6);
    assert.deepStrictEqual(
      ["m-old-info", "m-old-info-noaddr", "m-old-plain-noaddr"].map((id) => byId(tables, id).description),
      ["Researched A.", "Researched B.", "Researched C."],
      "every stored description survives, whichever request its row travelled in"
    );
    assert.strictEqual(byId(tables, "m-new-info").description, "Text.");
    assert.strictEqual(byId(tables, "m-new-info-noaddr").description, "Text.");
    assert.strictEqual(byId(tables, "m-new-plain").description, null);
    for (const row of sentRows(db)) {
      assert.strictEqual(hasDescriptionKey(row), row.external_id.startsWith("m-new-info"), `${row.external_id}: description key present only on new events with info`);
    }
    // Out of scope for the safeguard, and unchanged by it (DEBT-011): other
    // fields still follow Ticketmaster, including a street address it has.
    assert.strictEqual(byId(tables, "m-old-info").venue_address_raw, "2115 Woodward Ave");
    assert.strictEqual(byId(tables, "m-old-info-noaddr").venue_address_raw, "2 Hand-entered St", "an omitted field keeps its stored value, as before");
  }
  console.log("PASS: with a second optional field in play the rows form four shapes; all are written and every stored description survives");

  console.log("\nAll Ticketmaster description-safeguard checks passed.");
}

run().catch((err) => { console.error(err); process.exit(1); });
