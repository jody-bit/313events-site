// test/wp07-latent-connectors.test.js — the five connectors that were NOT
// being rejected on 2026-10-03 but build optional fields the same way as
// the five that were (`field: value || undefined`), so that a single
// differently-shaped event would have had their whole batch refused too.
//
//   Lager House        description / time / doors note / price / image optional
//   Old Miami          description / time / note / price optional
//   Planet Ant Theatre description / address / city / note / price / image optional
//   Playground Detroit description / address / city / end date / time / image optional
//   WDET               venue address optional
//
// On 2026-10-03 four of them wrote successfully — that day's rows happened
// to share one shape — and Planet Ant never reached the database (its
// upstream request is failing; BUG-009, not fixed here). These are the
// connectors for which WP 0.7's helper changes what happens in production
// on the day their rows stop being uniform, so each is run here with a
// fixture that makes them differ:
//   a. the rows it produces really are heterogeneous;
//   b. as ONE request the database refuses them (400 PGRST102);
//   c. the connector writes every row;
//   d. a field the source did not supply is omitted from the request, and a
//      value already stored for it survives.
// Fixtures follow each source's real response format; they are fixtures,
// not captures.
//
// Plain Node assert, no dependencies. Run: node test/wp07-latent-connectors.test.js
"use strict";
const assert = require("assert");

const {
  world, page, json, notFound, runConnector, sentRows, sentRow, byId, assertHeterogeneousAndNowWritten,
} = require("./fixtures/connector-harness.js");

async function run() {
  const summary = [];

  // =========================================================================
  // 1. LAGER HOUSE (records its runs in source_runs)
  // =========================================================================
  {
    const card = ({ date, slug, title, time, doors, price, desc, img }) => `<app-event-card><a href="/events/${date}/${slug}">
      <h3>${title}</h3>
      ${time ? `<span>${time}</span>` : ""}
      ${doors ? `<span>Doors: ${doors}</span>` : ""}
      ${price ? `<div class="text-lg font-bold text-blue-600">${price}</div>` : ""}
      ${desc ? `<p class="line-clamp-2">${desc}</p>` : ""}
      ${img ? `<img src="${img}">` : ""}
    </a></app-event-card>`;
    const html = "<html><body>" +
      card({ date: "2026-10-09", slug: "show-a", title: "Show A", time: "8:00 PM", doors: "7:00 PM", price: "$10", desc: "Three bands.", img: "https://example.com/a.jpg" }) +
      card({ date: "2026-10-10", slug: "show-b", title: "Show B", time: "9:00 PM" }) +
      card({ date: "2026-10-11", slug: "show-c", title: "Show C", price: "$15", desc: "Record release." }) +
      card({ date: "2026-09-30", slug: "last-week", title: "Already Happened", time: "8:00 PM", price: "$10" }) +
      "</body></html>";
    const { tables, db } = world({
      venues: [{ id: "venue-lh", name: "Lager House" }],
      events: [{ id: "row-1", external_id: "lagerhouse-2026-10-10-show-b", title: "Show B", category: "music", start_date: "2026-10-10", status: "approved", image_url: "https://example.org/reviewer.jpg", description: "Added by a reviewer.", price_from: 5 }],
      upstream: (url) => (url === "https://thelagerhouse.com/events" ? page(html) : null),
    });
    const res = await runConnector("cron-lagerhouse.js");
    const outcome = await assertHeterogeneousAndNowWritten("Lager House", db, tables, res, 3);
    assert.strictEqual(outcome.shapes, 3);
    const b = byId(tables, "lagerhouse-2026-10-10-show-b");
    assert.deepStrictEqual([b.image_url, b.description, b.price_from], ["https://example.org/reviewer.jpg", "Added by a reviewer.", 5], "the card has no image, description or price; what a reviewer stored survives");
    assert.strictEqual(b.time_display, "9:00 PM", "…and what the card does state is refreshed");
    assert.deepStrictEqual(["description", "note", "price_from", "image_url"].map((k) => k in sentRow(db, "lagerhouse-2026-10-10-show-b")), [false, false, false, false]);
    assert.strictEqual("time_display" in sentRow(db, "lagerhouse-2026-10-11-show-c"), false);
    assert.strictEqual(byId(tables, "lagerhouse-2026-10-09-show-a").note, "Doors: 7:00 PM");
    assert.strictEqual(byId(tables, "lagerhouse-2026-09-30-last-week"), undefined);
    assert.deepStrictEqual([tables.source_runs[0].outcome, tables.source_runs[0].records_written, tables.source_runs[0].http_status], ["success", 3, 201]);
    summary.push(["Lager House", 3, outcome.shapes, outcome.requests]);
  }
  console.log("PASS: Lager House — cards with different optional parts are all written; a reviewer's image, description and price survive; the run is logged as a success with 3 written");

  // =========================================================================
  // 2. OLD MIAMI
  // =========================================================================
  {
    const lines = (...parts) => `<html><body>${parts.map((p) => `<p>${p}</p>`).join("")}</body></html>`;
    const pages = {
      "fixture-fest": lines("Old Miami", "Presents:", "Fixture Fest", "Bands", "Band One", "Band Two", "Admission", "$10", "Date", "10/9/2026", "Location", "3930 Cass Ave.", "Detroit", "Start Time", "8:00 pm", "End Time", "11:00 pm", "Additional Event Information", "Plus special guests", "Home"),
      "open-mic": lines("Old Miami", "Presents:", "Open Mic Night", "Admission", "Free", "Date", "10/10/2026", "Location", "3930 Cass Ave.", "Detroit", "Start Time", "9:00 pm", "Home"),
      "patio-hang": lines("Old Miami", "Presents:", "Patio Hang", "Date", "10/11/2026", "Location", "3930 Cass Ave.", "Detroit", "Home"),
    };
    const venuePage = `<html><body>${Object.keys(pages).map((slug) => `<a href="https://rockindetroit.com/events/${slug}/">x</a>`).join("")}</body></html>`;
    const { tables, db } = world({
      venues: [{ id: "venue-om", name: "The Old Miami" }],
      events: [{ id: "row-1", external_id: "oldmiami-patio-hang", title: "Patio Hang", category: "music", start_date: "2026-10-11", status: "rejected", description: "Kept by a reviewer.", time_display: "3:00 PM", price_from: 5 }],
      upstream: (url) => {
        if (url === "https://rockindetroit.com/venue/old-miami/") return page(venuePage);
        const m = /^https:\/\/rockindetroit\.com\/events\/([a-z0-9-]+)\/$/.exec(url);
        return m && pages[m[1]] ? page(pages[m[1]]) : notFound();
      },
    });
    const res = await runConnector("cron-oldmiami.js");
    const outcome = await assertHeterogeneousAndNowWritten("Old Miami", db, tables, res, 3);
    assert.strictEqual(outcome.shapes, 3);
    const hang = byId(tables, "oldmiami-patio-hang");
    assert.deepStrictEqual([hang.status, hang.description, hang.time_display, hang.price_from], ["rejected", "Kept by a reviewer.", "3:00 PM", 5], "a page with no bands, time or admission leaves those stored values, and the moderator's rejection, alone");
    assert.deepStrictEqual(["description", "time_display", "note", "price_from"].map((k) => k in sentRow(db, "oldmiami-patio-hang")), [false, false, false, false]);
    assert.strictEqual(sentRow(db, "oldmiami-open-mic").price_from, null, "free admission is an explicit null price — sent as null, not omitted");
    assert.strictEqual(byId(tables, "oldmiami-fixture-fest").description, "Live music: Band One, Band Two");
    assert.strictEqual(byId(tables, "oldmiami-fixture-fest").time_display, "8:00 PM–11:00 PM");
    summary.push(["Old Miami", 3, outcome.shapes, outcome.requests]);
  }
  console.log("PASS: Old Miami — pages with and without bands, times, admission and extra lineup are all written; stored values and a rejection survive; a free show still sends price null");

  // =========================================================================
  // 3. PLANET ANT THEATRE
  // =========================================================================
  {
    const shows = [
      { id: 101, name: "COMEDY l Fixture Improv", dates: ["2026-10-09T20:00:00.000-04:00", "2026-10-10T20:00:00.000-04:00"], venue: "Black Box - 2357 Caniff Hamtramck, MI 48212 - Entrance in the rear",
        cost_tiers: [{ cost_after_fees: 1500 }], description_short: "Long-form improv.", img: { url: "https://example.com/improv.jpg" }, url: "https://www.crowdwork.com/e/101" },
      { id: 102, name: "THEATRE l A Fixture Play", dates: ["2026-10-11T19:00:00.000-04:00"], venue: "Planet Ant Theatre", url: "https://www.crowdwork.com/e/102" },
      { id: 103, name: "FILM l Free Screening", dates: ["2026-10-12T18:30:00.000-04:00"], venue: "Planet Ant Theatre", cost_tiers: [{ cost_after_fees: 0 }], description_short: "A local short." },
    ];
    const { tables, db } = world({
      venues: [{ id: "venue-pa", name: "Planet Ant Theatre" }, { id: "venue-bb", name: "Black Box" }],
      events: [{ id: "row-1", external_id: "crowdwork-planetanttheatre-102-2026-10-11", title: "A Fixture Play", category: "theatre", start_date: "2026-10-11", status: "approved", description: "Added by a reviewer.", venue_address_raw: "2320 Caniff", price_from: 20 }],
      upstream: (url) => (url.startsWith("https://www.crowdwork.com/api/v2/planetanttheatre/shows") ? json({ data: shows }) : null),
    });
    const res = await runConnector("cron-planetanttheatre.js");
    const outcome = await assertHeterogeneousAndNowWritten("Planet Ant Theatre", db, tables, res, 4);
    assert.strictEqual(outcome.shapes, 3);
    const play = byId(tables, "crowdwork-planetanttheatre-102-2026-10-11");
    assert.deepStrictEqual([play.description, play.venue_address_raw, play.price_from], ["Added by a reviewer.", "2320 Caniff", 20], "a show with no description, address or price tiers leaves the stored ones alone");
    assert.deepStrictEqual(["description", "venue_address_raw", "venue_city_raw", "note", "price_from", "image_url"].map((k) => k in sentRow(db, "crowdwork-planetanttheatre-102-2026-10-11")), [false, false, false, false, false, false]);
    const improv = byId(tables, "crowdwork-planetanttheatre-101-2026-10-09");
    assert.deepStrictEqual([improv.venue_name_raw, improv.venue_id, improv.venue_city_raw, improv.note, improv.price_from, improv.time_display], ["Black Box", "venue-bb", "Hamtramck", "Entrance in the rear", 15, "8:00 PM"]);
    assert.deepStrictEqual([sentRow(db, "crowdwork-planetanttheatre-103-2026-10-12").price_from, sentRow(db, "crowdwork-planetanttheatre-103-2026-10-12").is_free], [0, true]);
    summary.push(["Planet Ant Theatre", 4, outcome.shapes, outcome.requests]);
  }
  console.log("PASS: Planet Ant Theatre — shows with and without a description, address, note, price and image are all written once the connector reaches the database");

  // =========================================================================
  // 4. PLAYGROUND DETROIT (writes in chunks)
  // =========================================================================
  {
    const gcal = (dates, location) => `<html><body><a href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;dates=${dates}${location ? `&amp;location=${encodeURIComponent(location)}` : ""}">Add to calendar</a></body></html>`;
    const list = [
      { id: 501, link: "https://playgrounddetroit.com/events/opening/", title: { rendered: "Opening Reception" }, excerpt: { rendered: "<p>Free opening reception for the fall show.</p>" }, mec_category: [7],
        _embedded: { "wp:featuredmedia": [{ source_url: "https://playgrounddetroit.com/wp-content/uploads/opening.jpg" }] } },
      { id: 502, link: "https://playgrounddetroit.com/events/fall-show/", title: { rendered: "Fall Show" }, excerpt: { rendered: "" }, mec_category: [] },
      { id: 503, link: "https://playgrounddetroit.com/events/artist-talk/", title: { rendered: "Artist Talk" }, excerpt: { rendered: "<p>In conversation.</p>" }, mec_category: [] },
    ];
    const details = {
      "https://playgrounddetroit.com/events/opening/": gcal("20261009T180000/20261009T210000", "2845 Gratiot Ave, Detroit, MI 48207"),
      "https://playgrounddetroit.com/events/fall-show/": gcal("20261009/20261107"),
      "https://playgrounddetroit.com/events/artist-talk/": gcal("20261017T140000/20261017T150000", "Online"),
    };
    const { tables, db } = world({
      venues: [{ id: "venue-pg", name: "PLAYGROUND DETROIT" }],
      events: [{ id: "row-1", external_id: "playgrounddetroit-502", title: "Fall Show", category: "visual", start_date: "2026-10-09", status: "approved", description: "Added by a reviewer.", venue_address_raw: "2845 Gratiot Ave", image_url: "https://example.org/reviewer.jpg", time_display: "Noon–6" }],
      upstream: (url) => {
        if (url.startsWith("https://playgrounddetroit.com/wp-json/wp/v2/mec-events")) return json(list, { "x-wp-totalpages": "1" });
        if (url.startsWith("https://playgrounddetroit.com/wp-json/wp/v2/mec_category")) return json([{ id: 7, name: "Exhibition" }]);
        return details[url] ? page(details[url]) : notFound();
      },
    });
    const res = await runConnector("cron-playgrounddetroit.js", { fastTimers: true });
    const outcome = await assertHeterogeneousAndNowWritten("Playground Detroit", db, tables, res, 3);
    assert.strictEqual(outcome.shapes, 3);
    const show = byId(tables, "playgrounddetroit-502");
    assert.deepStrictEqual([show.description, show.venue_address_raw, show.image_url, show.time_display], ["Added by a reviewer.", "2845 Gratiot Ave", "https://example.org/reviewer.jpg", "Noon–6"], "an all-day run with no excerpt, location or image leaves the stored values alone");
    assert.strictEqual(show.end_date, "2026-11-07");
    assert.deepStrictEqual(["description", "venue_address_raw", "venue_city_raw", "time_display", "image_url"].map((k) => k in sentRow(db, "playgrounddetroit-502")), [false, false, false, false, false]);
    assert.strictEqual("end_date" in sentRow(db, "playgrounddetroit-501"), false);
    assert.deepStrictEqual([byId(tables, "playgrounddetroit-501").venue_city_raw, byId(tables, "playgrounddetroit-501").time_display, byId(tables, "playgrounddetroit-501").is_free], ["Detroit", "6:00 PM–9:00 PM", true]);
    assert.strictEqual("venue_city_raw" in sentRow(db, "playgrounddetroit-503"), false, "an address with no city in it sends no city key");
    assert.deepStrictEqual(res._body.upsertErrors, undefined);
    summary.push(["Playground Detroit", 3, outcome.shapes, outcome.requests]);
  }
  console.log("PASS: Playground Detroit — events with and without an excerpt, location, city, end date, time and image are all written; stored values survive");

  // =========================================================================
  // 5. WDET (records its runs in source_runs)
  // =========================================================================
  {
    const wdetEvent = (id, title, address) => ({
      id, title, description: "<p>Live on air.</p>", cost: "$20", url: `https://wdet.org/event/${id}`, image: false,
      start_date: "2026-10-09 19:00:00", end_date: "2026-10-09 21:00:00",
      categories: [{ name: "Music", slug: "music" }],
      venue: { venue: "El Club", city: "Detroit", address },
    });
    const events = [wdetEvent(9001, "Session One", "4114 Vernor Hwy"), wdetEvent(9002, "Session Two", undefined), wdetEvent(9003, "Session Three", "4114 Vernor Hwy")];
    const { tables, db } = world({
      venues: [{ id: "venue-el", name: "El Club" }],
      events: [{ id: "row-1", external_id: "wdet-9002", title: "Session Two", category: "music", start_date: "2026-10-09", status: "approved", venue_address_raw: "4114 W Vernor Hwy (reviewer)" }],
      upstream: (url) => (url.startsWith("https://wdet.org/wp-json/tribe/events/v1/events") ? json({ events }) : null),
    });
    const res = await runConnector("cron-wdet.js");
    const outcome = await assertHeterogeneousAndNowWritten("WDET", db, tables, res, 3);
    assert.strictEqual(outcome.shapes, 2);
    assert.strictEqual(byId(tables, "wdet-9002").venue_address_raw, "4114 W Vernor Hwy (reviewer)", "the feed gives this venue no address; the stored one survives");
    assert.strictEqual("venue_address_raw" in sentRow(db, "wdet-9002"), false);
    assert.strictEqual(byId(tables, "wdet-9001").venue_address_raw, "4114 Vernor Hwy");
    assert.ok(sentRows(db).every((r) => r.price_from === null), "price_from is explicitly null on every WDET row, and is sent as null");
    assert.deepStrictEqual([tables.source_runs[0].outcome, tables.source_runs[0].records_written], ["success", 3]);
    summary.push(["WDET", 3, outcome.shapes, outcome.requests]);
  }
  console.log("PASS: WDET — events with and without a venue address are all written; a stored address survives; the run is logged as a success");

  console.log("\n  connector                           rows  shapes  requests");
  for (const [name, rows, shapes, requests] of summary) {
    console.log(`  ${name.padEnd(34)} ${String(rows).padStart(5)} ${String(shapes).padStart(7)} ${String(requests).padStart(9)}`);
  }
  console.log("\nAll wp07-latent-connectors.test.js checks passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
