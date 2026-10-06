// test/venues-from-stated-places.test.js — a place the sources keep naming,
// at an address they keep stating, becomes a canonical venue
// (scripts/venues-from-stated-places.js). The rows below are production's
// venue-less Detroit events as read on 2026-10-05, reduced to a few per place.
//
// Run: node test/venues-from-stated-places.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { createVenuesFromStatedPlaces, planVenueRecords, isPlaceName, isFirstParty, namesOverlap } = require(`${REPO_DIR}/scripts/venues-from-stated-places.js`);
const { makeMockPostgrest } = require(`${REPO_DIR}/test/fixtures/mock-postgrest.js`);

const BASE = "https://example.supabase.co";
let n = 0;
const e = (source, date, name, address, city, extra) => ({ id: `e${++n}`, source, start_date: date, venue_name_raw: name, venue_address_raw: address, venue_city_raw: city, venue_id: null, status: "approved", ...extra });
const VENUES = [
  { id: "v-terris", name: "Terri's Detroit", address: null, city: "Detroit" },
  { id: "v-fox", name: "Fox Theatre", address: "2211 Woodward Ave", city: "Detroit" },
  { id: "v-pronto", name: "Pronto Royal Oak", address: "608 S Washington Ave", city: "Detroit" },
  { id: "v-tba", name: "Venue TBA", address: null, city: "Detroit" },
  { id: "v-twin-1", name: "The Shelter", address: null, city: "Detroit" },
  { id: "v-twin-2", name: "the shelter", address: null, city: "Detroit" },
  { id: "v-majestic", name: "Majestic Theatre", address: "4120-4140 Woodward Ave", city: "Detroit" },
  { id: "v-standrews", name: "St. Andrew's Hall", address: null, city: "Detroit" },
];
const events = () => {
  n = 0;
  return [
    // The three the Product Owner named.
    e("TechTown Detroit", "2026-10-14", "TechTown Detroit", "440 Burroughs Street", "Detroit"),
    e("TechTown Detroit", "2026-10-15", "TechTown Detroit", "440 Burroughs Street", "Detroit"),
    e("TechTown Detroit", "2026-10-15", "TechTown Detroit", "440 Burroughs St", "Detroit"),
    e("Detroit History Tours", "2026-10-08", "GM Plaza Promenade (Renaissance Center)", "300 Atwater St", "Detroit"),
    e("Detroit History Tours", "2026-10-16", "GM Plaza Promenade (Renaissance Center)", "300 Atwater St", "Detroit"),
    e("TechTown Detroit", "2026-10-27", "WSU Industry Innovation Center (I2C)", "461 Burroughs St", "Detroit"),
    e("TechTown Detroit", "2026-11-19", "WSU Industry Innovation Center (I2C)", "461 Burroughs St", "Detroit"),
    // The two to evaluate "under exactly the same deterministic rule": no address stated.
    e("Ticketmaster", "2026-10-08", "Across from the Aretha Franklin Amphitheatre Universoul Circus", null, "Detroit"),
    e("Ticketmaster", "2026-10-09", "Across from the Aretha Franklin Amphitheatre Universoul Circus", null, "Detroit"),
    e("Ticketmaster", "2026-11-13", "Wayne State Fieldhouse", null, "Detroit"),
    e("Ticketmaster", "2026-11-15", "Wayne State Fieldhouse", null, "Detroit"),
    // Named once: not a recurring place.
    e("Resident Advisor", "2026-10-10", "The Container Globe", "8800 Byron St", "Detroit"),
    // Two rows of ONE date: still one occasion.
    e("Eastern Market Partnership", "2026-10-09", "Forest Park Apartments", "1331 E Canfield St", "Detroit"),
    e("Eastern Market Partnership", "2026-10-09", "Forest Park Apartments", "1331 E Canfield St", "Detroit"),
    // Stated only by a listings site.
    e("Resident Advisor", "2026-10-02", "Tigris", "2545 Bagley St", "Detroit"),
    e("Resident Advisor", "2026-10-03", "Tigris", "2545 Bagley St", "Detroit"),
    // Two addresses.
    e("Some Organiser", "2026-10-02", "Two Doors", "100 First St", "Detroit"),
    e("Some Organiser", "2026-10-03", "Two Doors", "200 Second St", "Detroit"),
    // One listing does not state a city.
    e("Resident Advisor", "2026-10-02", "The Eagle of Detroit", "950 West McNichols", "Detroit"),
    e("Editorial Review", "2026-10-10", "The Eagle of Detroit", "950 West McNichols", null),
    // An existing venue already has this address under another name.
    e("313 Presents", "2026-12-08", "Fox Theater", "2211 Woodward Ave, Detroit, MI 48201", "Detroit"),
    e("313 Presents", "2026-12-09", "Fox Theater", "2211 Woodward Ave", "Detroit"),
    // Not Detroit: outside this run.
    e("Clawson Parks", "2026-10-02", "Hunter Community Center", "509 Fisher Ct", "Clawson"),
    e("Clawson Parks", "2026-10-09", "Hunter Community Center", "509 Fisher Ct", "Clawson"),
    // Debris and placeholders, however often they recur.
    e("City of Madison Heights - Events", "2026-10-08", "-", "300 W 13 Mile Rd", "Detroit"),
    e("City of Madison Heights - Events", "2026-10-09", "-", "300 W 13 Mile Rd", "Detroit"),
    e("Tourism Windsor", "2026-10-06", "ON", "1 Main St", "Detroit"),
    e("Tourism Windsor", "2026-10-07", "ON", "1 Main St", "Detroit"),
    e("Canton Township", "2026-10-17", "Venue TBA", "39000 Van Born Road", "Canton"),
    e("Eastern Market Partnership", "2026-10-09", "ACC WIC Detroit, 8655 Greenfield, Detroit, 48228, United States", "8655 Greenfield", "Detroit"),
    e("Eastern Market Partnership", "2026-10-10", "ACC WIC Detroit, 8655 Greenfield, Detroit, 48228, United States", "8655 Greenfield", "Detroit"),
    // AN EXISTING VENUE'S NAME: linked. WDET's curly apostrophe is the same name.
    e("WDET", "2026-10-17", "Terri’s Detroit", "16311 E Warren Ave", "Detroit"),
    // ...unless the listing's city contradicts the venue's.
    e("Resident Advisor", "2026-09-26", "Pronto Royal Oak", "608 Washington Ave.", "Royal Oak"),
    // ...or two venues share the name.
    e("Some Organiser", "2026-10-02", "The Shelter", "431 E Congress St", "Detroit"),
    // A real name with an initial in it is still a name, and is linked.
    e("Some Organiser", "2026-10-02", "St. Andrew's Hall", "431 E Congress St", "Detroit"),
    // An existing venue has a name this one is contained in (its own address is a range).
    e("Majestic Detroit", "2026-10-02", "The Majestic", "4140 Woodward Ave", "Detroit"),
    e("Majestic Detroit", "2026-10-03", "The Majestic", "4140 Woodward Ave", "Detroit"),
    // Two names, one address, same run: neither.
    e("An Organiser", "2026-10-02", "Annex Hall", "715 E Milwaukee St", "Detroit"),
    e("An Organiser", "2026-10-03", "Annex Hall", "715 E Milwaukee St", "Detroit"),
    e("An Organiser", "2026-10-02", "The Annex Ballroom Detroit", "715 E Milwaukee Street", "Detroit"),
    e("An Organiser", "2026-10-03", "The Annex Ballroom Detroit", "715 E Milwaukee Street", "Detroit"),
    // Waiting for review: not the public's yet, and not evidence.
    e("An Organiser", "2026-10-02", "Pending Place", "1 Pending St", "Detroit", { status: "pending_review" }),
    e("An Organiser", "2026-10-03", "Pending Place", "1 Pending St", "Detroit", { status: "pending_review" }),
    // An address or a city sitting in the name field.
    e("An Organiser", "2026-10-02", "8655 Greenfield", "8655 Greenfield", "Detroit"),
    e("An Organiser", "2026-10-03", "8655 Greenfield", "8655 Greenfield", "Detroit"),
    e("An Organiser", "2026-10-02", "Detroit", "1 Main St", "Detroit"),
    e("An Organiser", "2026-10-03", "Detroit", "1 Main St", "Detroit"),
    e("An Organiser", "2026-10-02", "Private Residence", "5 Elm St", "Detroit"),
    e("An Organiser", "2026-10-03", "Private Residence", "5 Elm St", "Detroit"),
  ];
};

async function run() {
  // --- 1. what is a place's name, and who states it ---------------------------
  {
    for (const name of ["TechTown Detroit", "GM Plaza Promenade (Renaissance Center)", "WSU Industry Innovation Center (I2C)", "rent free haus", "Boll Family YMCA", "DAAA \u2013 LA SED",
      "St. Andrew's Hall", "Charles H. Wright Museum of African American History", "Coleman A. Young Municipal Center", "Robert C. Valade Park", "Mt. Elliott Park", "The 5th Avenue Ballroom", "Bert's Warehouse"]) assert.strictEqual(isPlaceName(name), true, name);
    for (const name of ["-", "MI", "ON", "", "TBA", "TBC", "Venue TBA", "Venue TBA (Paxahau)", "TBA - Secret Location", "Location TBA", "Multiple Locations", "Various venues", "Online", "Zoom", "48201",
      "Secret Location", "Private Residence", "Address provided upon RSVP", "None", "Unknown", "https://zoom.us/j/123456", "Call 313-555-1212 for location",
      "See description", "Detroit MI", "Detroit, Michigan", "Free parking in rear", "Facebook Live",
      "8655 Greenfield", "Detroit", "Clinton Twp, MI", "Room 1300, 1300 Lafayette", "Bert's Warehouse &amp; Theatre",
      "ACC WIC Detroit, 8655 Greenfield, Detroit, 48228, United States",
      "Fall Bug Hunt Saturday, October 10, 2026 10 a.m. &ndash; 4 p.m. Meet at the Plymouth Arts and Recreation Center, 650 Church St. Plymouth, MI",
      "Meet at the fountain"]) assert.strictEqual(isPlaceName(name), false, name);
    // The place itself or its organiser -- not a listings site, a ticket seller or a news outlet.
    for (const source of ["TechTown Detroit", "Detroit History Tours", "Eastern Market Partnership", "rent free haus (rentfreehaus.com/events, researched 2026-09-20)", "City of Royal Oak"]) assert.strictEqual(isFirstParty(source), true, source);
    for (const source of ["VisitDetroit", "Metro Times", "Resident Advisor", "resident advisor", "Paxahau / Resident Advisor", "Resident Advisor / Marble Bar", "Ticketmaster", "WDET", "Editorial Review", "Editorial Review (Automated)", "Dice", "19hz.info", "", null]) assert.strictEqual(isFirstParty(source), false, String(source));
    assert.strictEqual(namesOverlap("Majestic Theatre", "The Majestic"), true);
    assert.strictEqual(namesOverlap("TechTown Detroit", "TechTown"), true);
    assert.strictEqual(namesOverlap("Fox Theatre", "Fisher Theatre"), false);
    assert.strictEqual(namesOverlap("Boll Family YMCA", "Downtown YMCA"), false);
  }
  console.log("PASS: a place name is not a placeholder, a city, a dash, an address, a link or an instruction; a listings site is not the place speaking");

  // --- 2. the plan -----------------------------------------------------------
  {
    const plan = planVenueRecords(events(), VENUES);
    assert.deepStrictEqual(plan.create.map((c) => [c.name, c.address, c.city, c.eventIds.length, c.dates]), [
      ["GM Plaza Promenade (Renaissance Center)", "300 Atwater St", "Detroit", 2, 2],
      ["TechTown Detroit", "440 Burroughs Street", "Detroit", 3, 2],
      ["WSU Industry Innovation Center (I2C)", "461 Burroughs St", "Detroit", 2, 2],
    ], "exactly the three: name, address and city as the sources state them (the fullest spelling of the street)");
    const terris = plan.link.find((l) => l.venueId === "v-terris");
    assert.deepStrictEqual({ name: terris.name, events: terris.eventIds.length }, { name: "Terri's Detroit", events: 1 });
    assert.strictEqual(events().find((row) => row.id === terris.eventIds[0]).source, "WDET");
    assert.strictEqual(plan.link.length, 2, "Terri's and St. Andrew's Hall, nothing else");
    const reasons = Object.fromEntries(plan.skipped.map((s) => [s.name, s.reason]));
    assert.deepStrictEqual(reasons, {
      "Across from the Aretha Franklin Amphitheatre Universoul Circus": "not_every_listing_states_a_street_address",
      "Wayne State Fieldhouse": "not_every_listing_states_a_street_address",
      Tigris: "a_listing_is_not_from_the_place_or_its_organiser",
      "Two Doors": "listings_state_different_addresses",
      "The Eagle of Detroit": "not_every_listing_states_a_city",
      "Fox Theater": "a_venue_already_has_this_address",
      "Pronto Royal Oak": "city_contradicts_the_venue",
      "The Shelter": "two_venues_share_this_name",
      "The Majestic": "a_venue_has_a_similar_name",
      "Annex Hall": "another_name_is_stated_at_this_address",
      "The Annex Ballroom Detroit": "another_name_is_stated_at_this_address",
    });
    // A real name is linked to the venue that carries it.
    assert.ok(plan.link.some((l) => l.venueId === "v-standrews" && l.eventIds.length === 1));
    // Named once, one date twice, another city, debris: simply not this run's.
    const mentioned = new Set([...plan.create.map((c) => c.name), ...plan.skipped.map((s) => s.name), ...plan.link.map((l) => l.name)]);
    for (const name of ["The Container Globe", "Forest Park Apartments", "Hunter Community Center", "-", "ON", "Venue TBA", "Pending Place", "8655 Greenfield", "Detroit", "Private Residence"]) assert.ok(!mentioned.has(name), name);
    // A listing from a listings site among the organiser's own disqualifies the group,
    // and says so truthfully.
    const mixed = planVenueRecords([e("TechTown Detroit", "2026-10-14", "Mixed Hall", "9 Mixed St", "Detroit"), e("Resident Advisor", "2026-10-15", "Mixed Hall", "9 Mixed St", "Detroit")], VENUES);
    assert.deepStrictEqual(mixed.skipped.map((k) => [k.reason, k.detail]), [["a_listing_is_not_from_the_place_or_its_organiser", "Resident Advisor"]]);
    // Asked to cover Clawson as well, the same rule finds its community center.
    assert.ok(planVenueRecords(events(), VENUES, { cities: ["Detroit", "Clawson"] }).create.some((c) => c.name === "Hunter Community Center" && c.city === "Clawson"));
    // AN EXISTING VENUE WITH NO ADDRESS OF ITS OWN is where its linked events say it is.
    // "DIA" at 5200 Woodward is not a new place when "Detroit Institute of Arts"
    // (a row with a name and a city only) has events at 5200 Woodward.
    {
      const seeded = [...VENUES, { id: "v-dia", name: "Detroit Institute of Arts", address: null, city: "Detroit" }];
      const dia = [e("Detroit Institute of Arts", "2026-10-10", "DIA", "5200 Woodward Ave", "Detroit"), e("Detroit Institute of Arts", "2026-10-11", "DIA", "5200 Woodward Avenue", "Detroit")];
      assert.deepStrictEqual(planVenueRecords(dia, seeded).create.map((c) => c.name), ["DIA"], "without knowing where the existing venue's events are, it looks new");
      const withEvents = planVenueRecords(dia, seeded, { venueAddresses: new Map([["v-dia", ["5200 Woodward Ave."]]]) });
      assert.deepStrictEqual([withEvents.create.length, withEvents.skipped.map((k) => [k.reason, k.detail])], [0, [["a_venue_already_has_this_address", "Detroit Institute of Arts"]]]);
    }
    // An event that already has a venue is never part of any of this.
    assert.strictEqual(planVenueRecords(events().map((row) => ({ ...row, venue_id: "v-x" })), VENUES).create.length, 0);
  }
  console.log("PASS: the plan — TechTown, GM Plaza and I2C are created; UniverSoul and the Fieldhouse are not (no address stated); Terri's is linked");

  // --- 3. against the database -------------------------------------------------
  {
    const tables = { venues: VENUES.map((v) => ({ ...v })), events: events() };
    const before = JSON.stringify(tables);
    const db = makeMockPostgrest(tables);
    const opts = { SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: "k", fetchFn: db.fetch, logger: { error() {} } };

    const dry = await createVenuesFromStatedPlaces({ ...opts, dryRun: true });
    assert.strictEqual(JSON.stringify(tables), before, "a dry run writes nothing");
    assert.deepStrictEqual(dry.created.map((c) => c.name), ["GM Plaza Promenade (Renaissance Center)", "TechTown Detroit", "WSU Industry Innovation Center (I2C)"]);

    const c = await createVenuesFromStatedPlaces(opts);
    assert.strictEqual(c.failed, 0);
    assert.strictEqual(tables.venues.length, VENUES.length + 3);
    const techtown = tables.venues.find((v) => v.name === "TechTown Detroit");
    assert.deepStrictEqual({ address: techtown.address, city: techtown.city }, { address: "440 Burroughs Street", city: "Detroit" });
    assert.deepStrictEqual(Object.keys(techtown).sort(), ["address", "city", "id", "name"], "nothing but what the sources state: no coordinates, no neighborhood, no website");
    assert.ok(tables.events.filter((row) => row.venue_name_raw === "TechTown Detroit").every((row) => row.venue_id === techtown.id));
    assert.strictEqual(tables.events.find((row) => row.source === "WDET").venue_id, "v-terris");
    assert.strictEqual(c.eventsLinked, 3 + 2 + 2 + 1 + 1);
    assert.strictEqual(c.writtenIds.length, 3 + 9, "three venues and the nine events actually linked");
    // Everything else is exactly as it was.
    for (const name of ["Wayne State Fieldhouse", "Tigris", "Fox Theater", "Pronto Royal Oak", "Venue TBA", "-", "The Shelter", "The Majestic", "Annex Hall", "The Annex Ballroom Detroit", "Pending Place", "8655 Greenfield", "Detroit", "Private Residence"]) {
      assert.ok(tables.events.filter((row) => row.venue_name_raw === name).every((row) => row.venue_id === null), name);
    }

    // The second run finds nothing to do.
    const snapshot = JSON.stringify(tables);
    const again = await createVenuesFromStatedPlaces(opts);
    assert.deepStrictEqual({ created: again.created, linked: again.eventsLinked }, { created: [], linked: 0 });
    assert.strictEqual(JSON.stringify(tables), snapshot);

    // A new TechTown listing arrives without its venue: linked by name on the next run.
    tables.events.push(e("TechTown Detroit", "2026-12-02", "TechTown Detroit", "440 Burroughs Street", "Detroit"));
    const third = await createVenuesFromStatedPlaces(opts);
    assert.deepStrictEqual({ created: third.created.length, linked: third.eventsLinked }, { created: 0, linked: 1 });
  }
  console.log("PASS: venues created with name, address and city only; their events linked; a second run does nothing");

  // --- 4. caps and failures ------------------------------------------------------
  {
    const tables = { venues: VENUES.map((v) => ({ ...v })), events: events() };
    const db = makeMockPostgrest(tables);
    const opts = { SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: "k", fetchFn: db.fetch, logger: { error() {} } };
    const capped = await createVenuesFromStatedPlaces({ ...opts, maxCreated: 1 });
    assert.deepStrictEqual({ created: capped.created.length, deferred: capped.deferredByCap }, { created: 1, deferred: 2 });
    // An event linked by someone else in the meantime keeps its venue.
    const t2 = { venues: VENUES.map((v) => ({ ...v })), events: events() };
    const d2 = makeMockPostgrest(t2);
    const fetchFn = async (url, init) => {
      if (init && init.method === "PATCH" && /events/.test(url)) t2.events.filter((row) => row.source === "WDET").forEach((row) => { if (!row.venue_id) row.venue_id = "v-by-hand"; });
      return d2.fetch(url, init);
    };
    await createVenuesFromStatedPlaces({ ...opts, fetchFn });
    assert.strictEqual(t2.events.find((row) => row.source === "WDET").venue_id, "v-by-hand");
    // No credentials; an unreadable table.
    assert.strictEqual((await createVenuesFromStatedPlaces({ SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", logger: { error() {} } })).eventsWithoutVenue, 0);
    const failing = makeMockPostgrest({ venues: [], events: [] }, { failure: (r) => (r.table === "events" ? 500 : null) });
    await assert.rejects(() => createVenuesFromStatedPlaces({ ...opts, fetchFn: failing.fetch }), /Failed to read events without a venue: HTTP 500/);
    // The pass reads where existing venues' events are, and so does not create "DIA".
    {
      const t5 = { venues: [{ id: "v-dia", name: "Detroit Institute of Arts", address: null, city: "Detroit" }], events: [
        e("Detroit Institute of Arts", "2026-10-10", "DIA", "5200 Woodward Ave", "Detroit"), e("Detroit Institute of Arts", "2026-10-11", "DIA", "5200 Woodward Ave", "Detroit"),
        e("VisitDetroit", "2026-10-12", "Detroit Institute of Arts", "5200 Woodward Avenue", "Detroit", { venue_id: "v-dia" }),
      ] };
      const c5 = await createVenuesFromStatedPlaces({ ...opts, fetchFn: makeMockPostgrest(t5).fetch });
      assert.deepStrictEqual([c5.created.length, t5.venues.length, c5.skipped.map((k) => k.reason)], [0, 1, ["a_venue_already_has_this_address"]]);
    }
    // Only approved rows are read at all.
    const t3 = { venues: [], events: events() };
    const d3 = makeMockPostgrest(t3);
    await createVenuesFromStatedPlaces({ ...opts, fetchFn: d3.fetch, dryRun: true });
    assert.ok(d3.log.some((r) => r.table === "events" && /status=eq\.approved/.test(r.url)));
    // An event the guard skipped (it gained a venue meanwhile) is not counted as written.
    const t4 = { venues: VENUES.map((v) => ({ ...v })), events: events() };
    const d4 = makeMockPostgrest(t4);
    const stolen = async (url, init) => {
      if (init && init.method === "PATCH" && /events/.test(url)) t4.events.filter((row) => row.source === "WDET").forEach((row) => { if (!row.venue_id) row.venue_id = "v-by-hand"; });
      return d4.fetch(url, init);
    };
    const c4 = await createVenuesFromStatedPlaces({ ...opts, fetchFn: stolen });
    assert.ok(!c4.writtenIds.includes(t4.events.find((row) => row.source === "WDET").id));
  }
  console.log("PASS: the per-run cap; an event linked meanwhile keeps its venue; an unreadable table stops the pass");

  console.log("\nAll venues-from-stated-places tests passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
