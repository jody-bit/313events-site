// test/wp07-affected-connectors.test.js — the six connectors whose database
// writes were being rejected on 2026-10-03, run end to end against a fake
// database that rejects what production rejects.
//
// WHAT WAS FOUND (production API log + events table, 2026-10-03):
//   Ticketmaster            909 rows sent, 400 PGRST102 — no new event since 2026-09-04
//   MotorCity Wine           68 rows sent, 400 PGRST102 — no row had ever been written
//   Detroit Month of Design  65 rows sent, 400 PGRST102 — no row had ever been written
//   Popps Packing            20 rows sent, 400 PGRST102 — no row had ever been written
//   Detroit Training Center  15 rows sent, 400 PGRST102 — no row had ever been written
//   GottaGacha               74 rows sent, 400 22P02 ("gaming" is not in the category enum)
// The first five share one cause: rows of one batch differ in which keys
// they carry, and PostgREST refuses such a batch in full. GottaGacha's rows
// are uniform; its failure is separate (migration 036 was never applied)
// and is NOT fixed by this change — section 6 pins that down too.
//
// FOR EACH OF THE FIVE this test shows, with the connector's real code and
// an upstream fixture that exercises every optional field it can emit:
//   a. the rows it produces really are heterogeneous;
//   b. sent as ONE request — what the connector did until now — the
//      database refuses them (the same 400 PGRST102, nothing written);
//   c. the connector now writes every row;
//   d. a field the source did not supply is still OMITTED from what is
//      sent (checked on the request itself, not only on the stored row), so
//      a value already on the row survives, and a stored moderation status
//      is preserved.
// The upstream fixtures are modelled on what each source returned that day
// (real external-id formats, real titles where they were captured); they
// are fixtures, not captures of the full production payloads.
//
// Plain Node assert, no dependencies. Run: node test/wp07-affected-connectors.test.js
"use strict";
const assert = require("assert");
const crypto = require("crypto");

const { EVENT_CATEGORIES_PRODUCTION_2026_10_03, EVENT_CATEGORIES_WITH_GAMING } = require("./fixtures/mock-postgrest.js");
const {
  world, page, json, notFound, runConnector, eventWrites, sentRows, sentRow, shapeCount, byId,
  assertHeterogeneousAndNowWritten,
} = require("./fixtures/connector-harness.js");

async function run() {
  const summary = [];

  // =========================================================================
  // 1. TICKETMASTER — `description: e.info || undefined`
  // =========================================================================
  {
    const tmEvent = (id, name, extra) => ({
      id, name, url: `https://www.ticketmaster.com/event/${id}`,
      classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
      dates: { start: { localDate: "2026-10-09", localTime: "19:30:00" }, status: { code: "onsale" } },
      images: [{ ratio: "16_9", url: `https://s1.ticketm.net/dam/a/${id}.jpg`, width: 1024, height: 576 }],
      priceRanges: [{ min: 35, max: 120 }],
      _embedded: { venues: [{ name: "Fixture Hall", city: { name: "Detroit" }, address: { line1: "2115 Woodward Ave" }, location: { latitude: "42.3387", longitude: "-83.0524" } }] },
      ...extra,
    });
    // Real Ticketmaster ids from the 2026-10-03 run; `info` present on half.
    const events = [
      tmEvent("vv1AFZkf6GkdIXBPo", "Fixture Band A", { info: "Doors at 6:30. All ages." }),
      tmEvent("vvG1OZ_CD9U6Tp", "Fixture Band B"),
      tmEvent("Z7r9jZ1AAvs84", "Fixture Band C", { info: "With special guests." }),
      tmEvent("rZ7HnEZ1Af1p07", "Fixture Band D", { priceRanges: undefined }),
      tmEvent("1718v0G6u_K3oxv", "Fixture Band E"),
      tmEvent("vv17OZ_8GkBtnaQa", "Fixture Band F", { info: "Seated show." }),
    ];
    const existing = (id, extra) => ({
      id: `row-${id}`, external_id: id, title: "stale title", category: "music", start_date: "2026-10-09", status: "approved",
      source: "Ticketmaster", time_display: "8:00 PM", description: null, ...extra,
    });
    const { tables, db } = world({
      // The state production is in: some of today's events are already
      // stored (from before 2026-09-05), the rest are missing.
      events: [
        existing("vvG1OZ_CD9U6Tp", { description: "A rock show at Fixture Hall.", description_source: "generated" }),
        existing("rZ7HnEZ1Af1p07", { status: "rejected" }),
        existing("vv1AFZkf6GkdIXBPo", { description: "older text" }),
      ],
      upstream: (url) => (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json") ? json({ _embedded: { events }, page: { totalPages: 1 } }) : null),
    });
    const res = await runConnector("cron-ticketmaster.js");
    const outcome = await assertHeterogeneousAndNowWritten("Ticketmaster", db, tables, res, 6);
    assert.strictEqual(outcome.shapes, 2, "with and without a description");
    assert.strictEqual(tables.events.length, 6, "three updated, three inserted, no duplicates");

    // Omitted stays omitted: Ticketmaster had no `info` for B, so the
    // description already on the row is untouched …
    const b = byId(tables, "vvG1OZ_CD9U6Tp");
    assert.strictEqual(b.description, "A rock show at Fixture Hall.", "a description the source did not supply is not overwritten or nulled");
    assert.strictEqual(b.description_source, "generated");
    assert.strictEqual(b.title, "Fixture Band B", "… while what the source did supply is refreshed");
    assert.strictEqual(b.time_display, "7:30 PM");
    // … and so is a stored description Ticketmaster DOES have `info` for:
    // the connector never replaces a description on an event that already
    // exists (the safeguard added before the first production run — see
    // test/cron-ticketmaster-description-safeguard.test.js).
    assert.strictEqual(byId(tables, "vv1AFZkf6GkdIXBPo").description, "older text");
    assert.strictEqual(byId(tables, "vv1AFZkf6GkdIXBPo").title, "Fixture Band A", "its other fields are still refreshed");
    // A NEW event gets Ticketmaster's `info` as its description.
    assert.strictEqual(byId(tables, "Z7r9jZ1AAvs84").description, "With special guests.");
    assert.strictEqual(byId(tables, "vv17OZ_8GkBtnaQa").description, "Seated show.");
    // A moderator's decision survives.
    assert.strictEqual(byId(tables, "rZ7HnEZ1Af1p07").status, "rejected", "an event hidden by a moderator stays hidden");
    assert.strictEqual(byId(tables, "rZ7HnEZ1Af1p07").price_from, null, "an explicit null (no price range) is still written as null");
    // New events arrive as this connector's default.
    for (const id of ["Z7r9jZ1AAvs84", "1718v0G6u_K3oxv", "vv17OZ_8GkBtnaQa"]) {
      assert.strictEqual(byId(tables, id).status, "approved");
      assert.strictEqual(byId(tables, id).source, "Ticketmaster");
    }
    assert.strictEqual(byId(tables, "1718v0G6u_K3oxv").description, null, "a new event with no `info` simply has no description");
    // On the wire: the key is absent — not sent as null — for every event
    // that already exists and for a new event without `info`; it is present
    // only for a new event that has `info`.
    for (const id of ["vvG1OZ_CD9U6Tp", "rZ7HnEZ1Af1p07", "vv1AFZkf6GkdIXBPo", "1718v0G6u_K3oxv"]) assert.strictEqual("description" in sentRow(db, id), false, `${id}: no description key was sent`);
    for (const id of ["Z7r9jZ1AAvs84", "vv17OZ_8GkBtnaQa"]) assert.strictEqual(typeof sentRow(db, id).description, "string");
    assert.strictEqual(sentRow(db, "rZ7HnEZ1Af1p07").price_from, null, "while a key the connector sets to null IS sent, as null");
    summary.push(["Ticketmaster", 6, outcome.shapes, outcome.requests]);
  }
  console.log("PASS: Ticketmaster — rows with and without `info` are refused as one request and written as two; existing descriptions and a moderator's rejection survive");

  // =========================================================================
  // 2. MOTORCITY WINE — `description: o.description || undefined`
  // =========================================================================
  {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "UID:weekly-jazz@fixture", "SUMMARY:Monday Night Jazz", "DESCRIPTION:House band\\, no cover.",
      "DTSTART;TZID=America/Detroit:20260907T190000", "RRULE:FREQ=WEEKLY;BYDAY=MO", "END:VEVENT",
      "BEGIN:VEVENT", "UID:single-1@fixture", "SUMMARY:The Fixture Quartet", "DTSTART;TZID=America/Detroit:20261003T200000", "END:VEVENT",
      "BEGIN:VEVENT", "UID:single-2@fixture", "SUMMARY:Rhone Wine Tasting", "DESCRIPTION:Six pours with the importer.", "DTSTART:20261004T220000Z", "END:VEVENT",
      "BEGIN:VEVENT", "UID:single-3@fixture", "SUMMARY:DJ Fixture", "DTSTART;TZID=America/Detroit:20261010T210000", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const idFor = (dateISO, title) => `mcw-ical-${dateISO}-${crypto.createHash("md5").update(title).digest("hex").slice(0, 10)}`;
    const tonight = idFor("2026-10-03", "The Fixture Quartet");
    const { tables, db } = world({
      venues: [{ id: "venue-mcw", name: "MotorCity Wine" }],
      events: [{ id: "row-1", external_id: tonight, title: "The Fixture Quartet", category: "music", start_date: "2026-10-03", status: "approved", description: "Added by a reviewer." }],
      upstream: (url) => (url.startsWith("https://calendar.google.com/calendar/ical/") ? page(ics) : null),
    });
    const res = await runConnector("cron-motorcitywine.js");
    // 9 Mondays in the 60-day window (Oct 5 … Nov 30) + 3 single events.
    const outcome = await assertHeterogeneousAndNowWritten("MotorCity Wine", db, tables, res, 12);
    assert.strictEqual(outcome.shapes, 2);
    assert.strictEqual(tables.events.length, 12);
    assert.strictEqual(byId(tables, tonight).description, "Added by a reviewer.", "the calendar entry has no description; the reviewer's is kept");
    assert.strictEqual(byId(tables, tonight).time_display, "8:00 PM");
    assert.strictEqual(byId(tables, idFor("2026-10-04", "Rhone Wine Tasting")).description, "Six pours with the importer.");
    assert.strictEqual(byId(tables, idFor("2026-10-05", "Monday Night Jazz")).venue_id, "venue-mcw");
    // TEMPORARY (MotorCity Wine recovery canary, 2026-10-04): a new row lands as
    // pending_review while the canary override is in the connector. The permanent
    // expectation is "approved"; reverting the canary commit restores that line.
    assert.strictEqual(byId(tables, idFor("2026-10-10", "DJ Fixture")).status, "pending_review");
    assert.strictEqual(byId(tables, idFor("2026-10-10", "DJ Fixture")).is_free, false, "`is_free: undefined` is omitted, so a new row takes the column default");
    assert.ok(sentRows(db).every((r) => !("is_free" in r)), "and is never sent as a key");
    assert.strictEqual("description" in sentRow(db, tonight), false, "no description key is sent for an entry that has none");
    assert.strictEqual(sentRows(db).filter((r) => "description" in r).length, 10);
    summary.push(["MotorCity Wine", 12, outcome.shapes, outcome.requests]);
  }
  console.log("PASS: MotorCity Wine — calendar entries with and without a description are written; tonight's event keeps its reviewer-written description");

  // =========================================================================
  // 3. DETROIT MONTH OF DESIGN — description / end_date / time / image optional
  // =========================================================================
  {
    const base = "https://www.detroitmonthofdesign.org/event-details/";
    const ld = (fields) => `<html><head><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Event", ...fields })}</script></head><body></body></html>`;
    const place = { "@type": "Place", name: "Fixture Gallery", address: "123 Main St, Detroit, MI 48226" };
    const pages = {
      // real slugs from the 2026-10-03 run
      "art-cars-2026-10-03-11-00": ld({ name: "Art Cars", startDate: "2026-10-03T11:00:00-04:00", endDate: "2026-10-03T17:00:00-04:00", description: "A free exhibition of art cars.", location: place, image: { "@type": "ImageObject", url: "https://static.wixstatic.com/media/art-cars.jpg" } }),
      "sub-surface-2026-10-10-13-00": ld({ name: "Sub Surface", startDate: "2026-10-10T13:00:00-04:00", location: place }),
      "score-sports-by-design-2026-09-22-11-00": ld({ name: "SCORE: Sports by Design", startDate: "2026-09-22T11:00:00-04:00", endDate: "2026-10-18T17:00:00-04:00", description: "Exhibition.", location: place }),
      "georgia-okeeffe-architecture-2026-10-03-10-00": ld({ name: "Georgia O'Keeffe: Architecture", startDate: "2026-10-03T10:00:00-04:00", endDate: "2026-10-03T16:00:00-04:00", location: place, image: { "@type": "ImageObject", url: "https://static.wixstatic.com/media/okeeffe.jpg" } }),
      "making-our-way-to-midnight-2026-09-10-10-00-1": ld({ name: "Making Our Way to Midnight", startDate: "2026-09-10T10:00:00-04:00", endDate: "2026-09-10T12:00:00-04:00", location: place }), // over — the connector skips it
    };
    const sitemap = `<?xml version="1.0"?><urlset>${Object.keys(pages).map((slug) => `<url><loc>${base}${slug}</loc></url>`).join("")}</urlset>`;
    const { tables, db } = world({
      // One of the four is already stored, with a description and an image
      // a reviewer added; the festival's page for it has neither.
      events: [{ id: "row-1", external_id: "dmod-sub-surface-2026-10-10-13-00", title: "Sub Surface", category: "visual", start_date: "2026-10-10", status: "approved",
        description: "Added by a reviewer.", image_url: "https://example.org/reviewer.jpg", time_display: "noon" }],
      upstream: (url) => {
        if (url === "https://www.detroitmonthofdesign.org/event-pages-sitemap.xml") return page(sitemap);
        if (url.startsWith(base)) return pages[url.slice(base.length)] ? page(pages[url.slice(base.length)]) : notFound();
        return null;
      },
    });
    const res = await runConnector("cron-detroitmonthofdesign.js");
    const outcome = await assertHeterogeneousAndNowWritten("Detroit Month of Design", db, tables, res, 4);
    assert.strictEqual(outcome.shapes, 4, "four events, four different sets of optional fields");
    const artCars = byId(tables, "dmod-art-cars-2026-10-03-11-00");
    assert.deepStrictEqual([artCars.status, artCars.start_date, artCars.time_display, artCars.end_date], ["approved", "2026-10-03", "11:00 AM–5:00 PM", null]);
    const subSurface = byId(tables, "dmod-sub-surface-2026-10-10-13-00");
    assert.deepStrictEqual([subSurface.description, subSurface.image_url], ["Added by a reviewer.", "https://example.org/reviewer.jpg"], "fields the page does not have are omitted, so the reviewer's survive");
    assert.strictEqual(subSurface.time_display, "1:00 PM", "…and the field it does have is refreshed");
    assert.deepStrictEqual(["description", "image_url", "end_date"].map((k) => k in sentRow(db, "dmod-sub-surface-2026-10-10-13-00")), [false, false, false]);
    assert.strictEqual("end_date" in sentRow(db, "dmod-art-cars-2026-10-03-11-00"), false, "a same-day event sends no end_date key");
    assert.strictEqual(tables.events.length, 4, "one updated, three inserted");
    assert.strictEqual(byId(tables, "dmod-score-sports-by-design-2026-09-22-11-00").end_date, "2026-10-18", "a run already in progress is included, with its end date");
    assert.strictEqual(byId(tables, "dmod-making-our-way-to-midnight-2026-09-10-10-00-1"), undefined, "a finished event is not written");
    assert.deepStrictEqual(res._body.upsertErrors, undefined);
    summary.push(["Detroit Month of Design", 4, outcome.shapes, outcome.requests]);
  }
  console.log("PASS: Detroit Month of Design — four events with four different sets of optional fields are all written (today's two included)");

  // =========================================================================
  // 4. POPPS PACKING — description / time / note / image optional
  // =========================================================================
  {
    const post = (id, date, title, excerpt, image) => ({
      id, date, link: `https://www.poppspacking.org/?p=${id}`,
      title: { rendered: title },
      excerpt: { rendered: excerpt },
      _embedded: image ? { "wp:featuredmedia": [{ source_url: `https://www.poppspacking.org/wp-content/uploads/${id}.jpg` }] } : {},
    });
    // Real ids, publish dates and titles of posts the connector fetched on
    // 2026-10-03. The SoundHenge excerpt is the real one; the others are
    // representative.
    const posts = [
      post(11061, "2026-09-23T09:57:46", "Open Studio &amp; Sitting Party &#8211; 9/27", "<p>Join us Sunday, September 27, from 1&#8211;4 PM for two events at Popps Packing and Carpenter Park.</p>", true),
      post(7262, "2026-09-17T11:06:39", "SoundHenge 10/3/26", "<p>SOUNDHENGE 2026 Saturday, October 3, 2026 · 3 PM–Dusk Carpenter Park · 2055 Carpenter Ave, Detroit Across the street from Popps Packing It&#8217;s time once again for our annual communal sound experience — SOUNDHENGE! Now in its 12th year, SoundHenge began in 2014 as part of the Hamtramck Neighborhood Arts Festival (HNAF).</p>", true),
      post(11023, "2026-03-24T10:00:00", "JOSUE BESSIAKE OPEN STUDIO/ Thurs. March 26. 5-8PM", "<p>An open studio with resident artist Josue Bessiake.</p>", false),
      post(10042, "2025-03-24T10:00:00", "Robin Dluzen Open Studio", "<p>Resident artist Robin Dluzen opens her studio to the public.</p>", true),
      post(8673, "2024-01-02T10:00:00", "OPEN CALL: Apply today!!", "", false),
      post(9938, "2025-02-20T10:00:00", "Hand Puppet Workshop with Torri Ashford", "<p>Friday, February 21, 5pm-6:30PM. Make a puppet and take it home.</p>", true),
    ];
    const upstream = (url) => (url.startsWith("https://www.poppspacking.org/wp-json/wp/v2/posts") ? json(posts) : null);

    // First run against production's actual state: no Popps row exists.
    const first = world({ venues: [{ id: "venue-popps", name: "Popps Packing" }], upstream });
    const res = await runConnector("cron-poppspacking.js");
    const outcome = await assertHeterogeneousAndNowWritten("Popps Packing", first.db, first.tables, res, 6);
    assert.ok(outcome.shapes >= 4, `time, image, note and description vary independently (found ${outcome.shapes} shapes)`);
    assert.ok(first.tables.events.every((r) => r.status === "pending_review"), "every Popps row still lands in the review queue — unchanged");
    const soundhenge = byId(first.tables, "poppspacking-7262");
    assert.deepStrictEqual(
      [soundhenge.title, soundhenge.start_date, soundhenge.time_display, soundhenge.category, soundhenge.venue_id, soundhenge.note],
      ["SoundHenge 10/3/26", "2026-10-03", "3:00 PM", "music", "venue-popps", null],
      "SoundHenge is written, dated 3 October 2026"
    );
    assert.strictEqual(byId(first.tables, "poppspacking-8673").description, null, "a post with no excerpt has no description");
    assert.ok(/could not be parsed/.test(byId(first.tables, "poppspacking-10042").note), "an undated post still carries the note asking a reviewer to set the date");

    // Second run, after a reviewer approved SoundHenge and corrected its time.
    Object.assign(soundhenge, { status: "approved", time_display: "3:00 PM–8:00 PM", start_date: "2026-10-03" });
    // …and filled in a description and an image on posts that have none.
    byId(first.tables, "poppspacking-8673").description = "Written by a reviewer.";
    byId(first.tables, "poppspacking-11023").image_url = "https://example.org/reviewer.jpg";
    assert.strictEqual("description" in sentRow(first.db, "poppspacking-8673"), false, "a post with no excerpt sends no description key");
    assert.strictEqual("image_url" in sentRow(first.db, "poppspacking-11023"), false);
    assert.strictEqual("note" in sentRow(first.db, "poppspacking-7262"), false, "a post whose date parsed sends no note key");
    const second = world({ venues: [{ id: "venue-popps", name: "Popps Packing" }], events: first.tables.events, upstream });
    const res2 = await runConnector("cron-poppspacking.js");
    assert.strictEqual(res2._status, 200, JSON.stringify(res2._body));
    assert.deepStrictEqual([res2._body.newRows, res2._body.existingRowsPreserved], [0, 6]);
    assert.ok(shapeCount(sentRows(second.db)) >= 2, "the existing-rows set is heterogeneous too");
    eventWrites(second.db).forEach((r) => assert.strictEqual(shapeCount(JSON.parse(r.body)), 1));
    assert.strictEqual(second.tables.events.length, 6, "no duplicates");
    const again = byId(second.tables, "poppspacking-7262");
    assert.deepStrictEqual([again.status, again.time_display, again.start_date], ["approved", "3:00 PM–8:00 PM", "2026-10-03"], "the reviewer's approval and corrected time survive the next run");
    assert.strictEqual(byId(second.tables, "poppspacking-8673").description, "Written by a reviewer.", "as does a description on a post that has no excerpt");
    assert.strictEqual(byId(second.tables, "poppspacking-11023").image_url, "https://example.org/reviewer.jpg");
    summary.push(["Popps Packing", 6, outcome.shapes, outcome.requests]);
  }
  console.log("PASS: Popps Packing — six posts in several shapes are written to an empty table (SoundHenge dated 2026-10-03, pending review); a reviewer's approval and correction survive the next run");

  // =========================================================================
  // 5. DETROIT TRAINING CENTER — address / end_date / price optional
  // =========================================================================
  {
    const html = (body) => `<html><body>${body}</body></html>`;
    const pages = {
      forklift: html("<h1>Forklift Certification</h1><p>UPCOMING CLASSES: October 3, October 10, October 24</p><p>LOCATION: 23323 Schoolcraft, Detroit</p><p>Cost: $150 total</p>"),
      mibuilders: html("<h1>Builders License</h1><p>Schedule: October 19 - October 23, 2026</p><p>LOCATION: 23323 Schoolcraft, Detroit</p>"),
      rrp: html("<h1>EPA Lead RRP</h1><p>Upcoming session: March 8, 2027</p><p>LOCATION: Online via Zoom</p><p>$275 for the course</p>"),
      osha: html("<h1>OSHA 10/30</h1><p>Schedule: October 5, November 9</p>"),
    };
    const stored = (id, extra) => ({ id: `row-${id}`, external_id: id, title: "t", category: "training", start_date: "2026-10-01", ...extra });
    const { tables, db } = world({
      venues: [{ id: "venue-dtc", name: "Detroit Training Center" }],
      // Two sessions are already stored: one a reviewer approved and gave a
      // price (the page states none), one online session given a note-worthy
      // address (the page gives none, so the connector omits the key).
      events: [
        stored("dtc-osha-2026-10-05", { status: "approved", price_from: 99 }),
        stored("dtc-rrp-2027-03-08", { status: "pending_review", venue_address_raw: "Link sent on registration" }),
      ],
      upstream: (url) => {
        if (!url.startsWith("https://detroittraining.com/")) return null;
        const slug = url.slice("https://detroittraining.com/".length);
        return pages[slug] ? page(pages[slug]) : notFound();
      },
    });
    const res = await runConnector("cron-detroittraining.js");
    const outcome = await assertHeterogeneousAndNowWritten("Detroit Training Center", db, tables, res, 7);
    assert.strictEqual(outcome.shapes, 4);
    assert.ok(tables.events.every((r) => r.category === "training" && r.venue_id === "venue-dtc"));
    assert.strictEqual(tables.events.length, 7, "two updated, five inserted");
    assert.deepStrictEqual(tables.events.filter((r) => r.status !== "pending_review").map((r) => r.external_id), ["dtc-osha-2026-10-05"], "new sessions are review-first, as before; the approved one stays approved");
    assert.strictEqual(byId(tables, "dtc-osha-2026-10-05").price_from, 99, "a price the page does not state is omitted, so the stored one survives");
    assert.strictEqual(byId(tables, "dtc-rrp-2027-03-08").venue_address_raw, "Link sent on registration", "an online session's address is omitted, not nulled");
    assert.strictEqual(byId(tables, "dtc-rrp-2027-03-08").price_from, 275, "while a price the page does state is written");
    assert.deepStrictEqual(["price_from", "end_date"].map((k) => k in sentRow(db, "dtc-osha-2026-10-05")), [false, false]);
    assert.strictEqual("venue_address_raw" in sentRow(db, "dtc-rrp-2027-03-08"), false);
    // real id formats from the 2026-10-03 run
    assert.deepStrictEqual([byId(tables, "dtc-forklift-2026-10-03").price_from, byId(tables, "dtc-forklift-2026-10-03").venue_address_raw], [150, "23323 Schoolcraft"]);
    assert.strictEqual(byId(tables, "dtc-mibuilders-2026-10-19").end_date, "2026-10-23");
    assert.strictEqual(byId(tables, "dtc-mibuilders-2026-10-19").price_from, null);
    assert.ok(byId(tables, "dtc-osha-2026-10-05") && byId(tables, "dtc-osha-2026-11-09"));
    summary.push(["Detroit Training Center", 7, outcome.shapes, outcome.requests]);
  }
  console.log("PASS: Detroit Training Center — sessions with and without an address, an end date or a price are all written, still pending review");

  // =========================================================================
  // 6. GOTTAGACHA — uniform rows; fails on the category enum, NOT on shape
  // =========================================================================
  {
    const apiEvent = (id, title, description, eventDate) => ({ id, title, description, eventDate, startTime: "19:00:00", endTime: "21:00:00", recurrenceType: null, location: "Gotta Gacha" });
    const events = [
      apiEvent("5bcbabc3-35d4-40de-90bc-26ed9ef959c8", "TCG Tuesday", "Casual trading card game play.", "2026-10-06"),
      apiEvent("5bcbabc3-35d4-40de-90bc-26ed9ef959c8", "TCG Tuesday", "Casual trading card game play.", "2026-10-13"),
      apiEvent("d1eeabd3-3385-44af-a25d-406c8a544bf9", "Movie Night Screening", null, "2026-10-09"),
      apiEvent("2fb908e5-720f-4dc0-a8f7-a80b5ec6ef6d", "Community Hangout", "", "2026-10-03"),
    ];
    const upstream = (url) => (url.startsWith("https://www.gottagacha.com/api/events") ? json({ events }) : null);

    // (a) Production as it is today: no 'gaming' in the enum.
    const today = world({ venues: [{ id: "venue-gg", name: "GottaGacha" }], categories: EVENT_CATEGORIES_PRODUCTION_2026_10_03, upstream });
    const failed = await runConnector("cron-gottagacha.js");
    assert.strictEqual(shapeCount(sentRows(today.db)), 1, "GottaGacha's rows are uniform — it was never a key-shape failure");
    assert.strictEqual(eventWrites(today.db).length, 1, "so they still go out as one request");
    assert.strictEqual(failed._status, 502);
    assert.strictEqual(failed._body.upserted, 0);
    assert.strictEqual(failed._body.error, 'Supabase upsert failed: {"code":"22P02","details":null,"hint":null,"message":"invalid input value for enum event_category: \\"gaming\\""}',
      "exactly the error production has recorded on every GottaGacha run since 2026-09-24");
    assert.strictEqual(today.tables.events.length, 0, "and the non-gaming events in the same request are lost with it");
    assert.deepStrictEqual([today.tables.source_runs[0].outcome, today.tables.source_runs[0].records_written], ["failed", 0]);

    // (b) With migration 036 applied ('gaming' added): the same run succeeds.
    const after = world({ venues: [{ id: "venue-gg", name: "GottaGacha" }], categories: EVENT_CATEGORIES_WITH_GAMING, upstream });
    const ok = await runConnector("cron-gottagacha.js");
    assert.strictEqual(ok._status, 200, JSON.stringify(ok._body));
    assert.strictEqual(ok._body.upserted, 4);
    assert.strictEqual(after.tables.events.length, 4);
    assert.strictEqual(byId(after.tables, "gottagacha-5bcbabc3-35d4-40de-90bc-26ed9ef959c8-2026-10-06").category, "gaming");
    assert.strictEqual(byId(after.tables, "gottagacha-d1eeabd3-3385-44af-a25d-406c8a544bf9-2026-10-09").category, "film");
    const ambiguous = byId(after.tables, "gottagacha-2fb908e5-720f-4dc0-a8f7-a80b5ec6ef6d-2026-10-03");
    assert.deepStrictEqual([ambiguous.category, ambiguous.status], ["community", "pending_review"], "an event the connector cannot classify still goes to review");
    assert.deepStrictEqual([after.tables.source_runs[0].outcome, after.tables.source_runs[0].records_written], ["success", 4]);
    summary.push(["GottaGacha (after migration 036)", 4, 1, 1]);
  }
  console.log("PASS: GottaGacha — uniform rows, one request; rejected today by the missing 'gaming' category (22P02), written in full once migration 036 is applied");

  console.log("\n  connector                           rows  shapes  requests");
  for (const [name, rows, shapes, requests] of summary) {
    console.log(`  ${name.padEnd(34)} ${String(rows).padStart(5)} ${String(shapes).padStart(7)} ${String(requests).padStart(9)}`);
  }
  console.log("\nAll wp07-affected-connectors.test.js checks passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
