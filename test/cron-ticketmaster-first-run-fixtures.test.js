// test/cron-ticketmaster-first-run-fixtures.test.js — the first live Ticketmaster run must leave previously corrected
// rows alone (REL-3 #206; Event Intelligence, FIELD-PRECEDENCE-AND-CORRECTED-ROWS-FOR-PLATFORM.md, 2026-10-18).
//
// The fixtures reproduce the named production rows (same ids, same corrected fields) and the four first-run risks:
//   1. a null venue_id unlinking linked venues (305 of 391 are linked);
//   2. a null address or city erasing a knowledge-filled value;
//   3. a present-but-null key (TBA time, no price) overwriting a verified time or price;
//   4. about 360 stored rows with no image gaining Ticketmaster's image (an image-policy decision for the owner, so the
//      default is: no image is added to a stored row).
// Plus: a retired (rejected) duplicate stays rejected with its note intact, and a generated description is not replaced.
// A live run writes ticket_status only; ?dry=1 shows these rows before and after and writes nothing.
//
// Plain Node assert, no dependencies. Run: node test/cron-ticketmaster-first-run-fixtures.test.js
"use strict";
const assert = require("assert");
process.env.TICKETMASTER_REQUEST_GAP_MS = "0";
const { world, json, runConnector, eventWrites, byId } = require("./fixtures/connector-harness.js");

const TM_URL = "https://app.ticketmaster.com/discovery/v2/events.json";
const patches = (db) => db.log.filter((r) => r.table === "events" && r.method === "PATCH");

// Ticketmaster's side: a venue it does not know (no address, no city), no local time, no price, a new image.
const tm = (id, name, extra) => ({
  id, name, url: `https://www.ticketmaster.com/event/${id}`,
  classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
  dates: { start: { localDate: "2026-11-20" }, status: { code: "onsale" } },
  images: [{ ratio: "16_9", url: `https://s1.ticketm.net/dam/a/${id}.jpg`, width: 1024, height: 576 }],
  _embedded: { venues: [{ name: "Some Venue Ticketmaster Spells Differently", location: { latitude: "42.3387", longitude: "-83.0524" } }] },
  ...extra,
});
const stored = (uuid, ext, extra) => ({
  id: uuid, external_id: ext, source: "Ticketmaster", title: "Corrected title", category: "music", start_date: "2026-11-20", status: "approved",
  time_display: "7:30 PM", price_from: 45, ticket_status: "onsale", ticket_url: "https://tickets.example/x", description: "Hand-written.", description_source: null,
  venue_id: "venue-linked-1", venue_name_raw: "Little Caesars Arena", venue_address_raw: "2645 Woodward Ave", venue_city_raw: "Detroit", image_url: null, internal_note: null, ...extra,
});

const ROWS = () => [
  stored("0b6b0237-258e-4aa3-abdd-aec0ce3d9bf9", "tm-pistons", { title: "Pistons v Celtics", time_display: "3:00 PM", image_url: "https://img.example/carried-over-from-visitdetroit.jpg" }),
  stored("d2d2f14d-3bf6-4b9e-8101-a7d334349f17", "tm-pistons-retired", { title: "Pistons v Celtics", status: "rejected", time_display: "3:00 PM – 11:59 PM", internal_note: "DUP_MERGED_INTO 0b6b0237-258e-4aa3-abdd-aec0ce3d9bf9" }),
  stored("c03e0db6-0000-4000-8000-000000000001", "tm-hovvdy", { title: "Hovvdy", venue_name_raw: "El Club", venue_address_raw: "4114 W Vernor Hwy", venue_city_raw: "Detroit", internal_note: "VENUE_KNOWLEDGE_FILLED address,city" }),
  stored("634fbd6a-0000-4000-8000-000000000002", "tm-bald", { title: "Bald and the Beautiful", venue_name_raw: "Detroit Opera House", venue_address_raw: "1526 Broadway St", venue_city_raw: "Detroit", description: "Generated blurb.", description_source: "generated" }),
  stored("48e6e18e-0000-4000-8000-000000000003", "tm-nutcracker", { title: "The Nutcracker", venue_name_raw: "Detroit Opera House", venue_address_raw: "1526 Broadway St", venue_city_raw: "Detroit" }),
  stored("aaaaaaaa-0000-4000-8000-000000000004", "tm-no-image", { title: "Stored, no image yet", image_url: null }),
];

async function run() {
  const events = ["tm-pistons", "tm-pistons-retired", "tm-hovvdy", "tm-bald", "tm-nutcracker", "tm-no-image"].map((id) => tm(id, "Ticketmaster's own title for " + id, { info: "Ticketmaster info text." }));
  const upstream = (url) => (url.startsWith(TM_URL) ? json({ _embedded: { events }, page: { totalPages: 1, totalElements: events.length } }) : null);

  // ---------------- live run ----------------
  {
    const before = JSON.parse(JSON.stringify(ROWS()));
    const { tables, db } = world({ events: ROWS(), upstream });
    const res = await runConnector("cron-ticketmaster.js");
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    assert.strictEqual(eventWrites(db).length, 0, "no stored row is upserted");
    assert.ok(patches(db).every((r) => JSON.stringify(Object.keys(JSON.parse(r.body))) === '["ticket_status"]'), "the only column written is ticket_status");
    for (const b of before) {
      const after = byId(tables, b.external_id);
      for (const f of Object.keys(b)) {
        if (f === "ticket_status") continue;
        assert.deepStrictEqual(after[f], b[f], `${b.external_id}.${f} is unchanged by a live run`);
      }
    }
    // the named risks, stated one by one
    assert.strictEqual(byId(tables, "tm-pistons").image_url, "https://img.example/carried-over-from-visitdetroit.jpg", "Pistons survivor keeps the image carried over from the retired VisitDetroit row");
    assert.strictEqual(byId(tables, "tm-pistons").status, "approved");
    assert.strictEqual(byId(tables, "tm-pistons-retired").status, "rejected", "a retired duplicate stays rejected though its id is still in the API");
    assert.match(byId(tables, "tm-pistons-retired").internal_note, /^DUP_MERGED_INTO /);
    assert.strictEqual(byId(tables, "tm-pistons-retired").time_display, "3:00 PM – 11:59 PM");
    assert.strictEqual(byId(tables, "tm-hovvdy").venue_address_raw, "4114 W Vernor Hwy", "(2) a null address from Ticketmaster does not erase a knowledge-filled one");
    assert.strictEqual(byId(tables, "tm-hovvdy").venue_city_raw, "Detroit");
    assert.strictEqual(byId(tables, "tm-bald").venue_id, "venue-linked-1", "(1) a venue Ticketmaster cannot match does not unlink a linked venue");
    assert.strictEqual(byId(tables, "tm-bald").description, "Generated blurb.", "a generated description is not replaced");
    assert.strictEqual(byId(tables, "tm-bald").description_source, "generated");
    assert.strictEqual(byId(tables, "tm-nutcracker").time_display, "7:30 PM", "(3) a TBA time does not overwrite a verified time");
    assert.strictEqual(byId(tables, "tm-nutcracker").price_from, 45, "(3) a missing price does not overwrite a verified price");
    assert.strictEqual(byId(tables, "tm-no-image").image_url, null, "(4) no image is added to a stored row; that is the owner's policy decision");
  }
  console.log("PASS: a live run leaves every corrected fixture row untouched (ticket_status is the only column written)");

  // ---------------- dry run ----------------
  {
    const { tables, db } = world({ events: ROWS(), upstream });
    const snapshot = JSON.stringify(tables);
    const res = await runConnector("cron-ticketmaster.js", { query: { dry: "1" } });
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    assert.strictEqual(JSON.stringify(tables), snapshot, "nothing is written, not even a run-log row");
    assert.strictEqual(eventWrites(db).length + patches(db).length, 0);
    const b = res._body;
    assert.strictEqual(b.api_events_matching_rejected_rows, 1, "the API still returns the retired duplicate's id");
    assert.strictEqual(b.would_insert, 0);
    assert.ok(b.held_would_fill_blank.image_url >= 1, "images that would fill a blank are counted (the owner decides the policy)");
    assert.strictEqual(b.held_would_overwrite_non_null.image_url, 1, "and the one stored image Ticketmaster would REPLACE (Pistons survivor) is counted separately");
    assert.ok(b.held_would_overwrite_non_null.title >= 1, "title differences are counted as overwrites of non-null values");
    assert.strictEqual(b.fixtures.length, 5, "the named fixture rows present in the data are listed with before/after");
    const pistons = b.fixtures.find((f) => f.id.startsWith("0b6b0237"));
    assert.strictEqual(pistons.stored.image_url, "https://img.example/carried-over-from-visitdetroit.jpg");
    assert.deepStrictEqual(pistons.live_run_writes, ["ticket_status"]);
    assert.strictEqual(b.stored_upcoming_not_returned_by_api.count, 0);
  }
  console.log("PASS: ?dry=1 lists the fixtures with before/after, counts overwrites vs blank fills, and writes nothing");

  // ---------------- API no longer returns a stored upcoming event: reported, never hidden ----------------
  {
    const kept = events.slice(0, 5);
    const gone = stored("bbbbbbbb-0000-4000-8000-000000000005", "tm-gone", { title: "Gone from the API" });
    const { tables } = world({ events: ROWS().concat([gone]), upstream: (url) => (url.startsWith(TM_URL) ? json({ _embedded: { events: kept }, page: { totalPages: 1, totalElements: 5 } }) : null) });
    const live = await runConnector("cron-ticketmaster.js");
    assert.strictEqual(byId(tables, "tm-gone").status, "approved", "a live run never hides an event the API stopped returning");
    const dry = await runConnector("cron-ticketmaster.js", { query: { dry: "1" } });
    assert.ok(dry._body.stored_upcoming_not_returned_by_api.count >= 1);
    assert.ok(dry._body.stored_upcoming_not_returned_by_api.sample.some((r) => r.external_id === "tm-gone"));
    assert.strictEqual(live._status, 200);
  }
  console.log("PASS: a stored event the API stopped returning is reported in the dry run and left approved");

  console.log("\nAll Ticketmaster first-run fixture checks passed.");
}
run().catch((e) => { console.error(e); process.exit(1); });
