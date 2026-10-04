// test/cron-feeds-city-recovery.test.js — BUG-012 (2026-10-04): feed events
// keep their city.
//
// WHAT WAS MEASURED (production, 2026-10-04): 28 of the 55 events in Admin's
// Needs follow-up queue were feed events with no usable location —
//   17  City of Madison Heights: LOCATION "-", stored as the venue, no city;
//    9  six municipal feeds: real text ending in "<City> <ST> <ZIP>", stored
//       whole as the venue name with the city thrown away;
//    2  a LOCATION of just "MI" / "ON".
// The scheduled repair could do nothing for any of them, and the feed job
// rewrote the same values every night.
//
// This runs the real api/cron-feeds.js handler end to end (mocked Supabase
// and feed, same approach as test/cron-feeds-location-per-event.test.js) and
// checks what is WRITTEN, because the write is what Admin and the public
// pages read:
//   1. a trailing "<known city> MI <ZIP>" is kept as the city; the location
//      text itself is kept as it was, and no venue, venue link or street
//      address is derived from it;
//   2. "-" is not a venue;
//   3. an event whose LOCATION says nothing at all takes the feed's own
//      city — only when the feed's other events agree on one, never for a
//      regional feed, never for a tour or parade, and never for an event
//      whose LOCATION has any text, readable or not;
//   4. a single-venue feed is untouched.
//
// Run: node test/cron-feeds-city-recovery.test.js
"use strict";
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function freshHandler() {
  for (const f of ["api/cron-feeds.js", "api/_lib/venue-lookup.js", "api/_lib/ics-location.js"]) {
    delete require.cache[require.resolve(`${REPO_DIR}/${f}`)];
  }
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}

const icsEscape = (str) => str.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");

// events: [{ uid, summary, location }] — location undefined means no LOCATION line at all.
function icsFor(events) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0"];
  for (const ev of events) {
    lines.push("BEGIN:VEVENT", `UID:${ev.uid}`, "DTSTART:20261201T190000Z", `SUMMARY:${ev.summary}`);
    if (ev.location !== undefined && ev.location !== null) lines.push(`LOCATION:${icsEscape(ev.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

async function runFeed({ feedSource, events, venues = [] }) {
  const written = [];
  const handler = freshHandler();
  global.fetch = async (url, opts = {}) => {
    if (url.includes("/rest/v1/feed_sources")) {
      if (opts.method === "PATCH") return { ok: true, status: 204, json: async () => [], text: async () => "" };
      return { ok: true, status: 200, json: async () => [feedSource] };
    }
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => venues };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
    if (url === feedSource.feed_url) return { ok: true, status: 200, text: async () => icsFor(events) };
    if (url.includes("/rest/v1/events") && opts.method === "POST") {
      written.push(...JSON.parse(opts.body));
      return strictWriteResponse(url, opts);
    }
    throw new Error("unmocked URL: " + url);
  };
  const res = { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
  await handler({ headers: {} }, res);
  assert.strictEqual(res._status, 200, JSON.stringify(res._body));
  assert.strictEqual(written.length, events.length, "every event in the feed is written");
  const byUid = {};
  for (const row of written) byUid[row.external_id.replace(`feed-${feedSource.id}-`, "")] = row;
  return byUid;
}

const MUNICIPAL_FEED = {
  id: "fs-mh",
  venue_name: "City of Madison Heights - Events",
  default_category: "community",
  feed_url: "https://feed.example/mh.ics",
  feed_format: "ics",
  status: "approved",
  location_per_event: true,
};

// Five events that state their place the way this feed really does.
const STATED = [
  { uid: "lib-1", summary: "Story Time", location: "Madison Heights Public Library - 240 W 13 Mile Road  Madison Heights MI 48071" },
  { uid: "lib-2", summary: "Chess Club", location: "Madison Heights Public Library - 240 W 13 Mile Road  Madison Heights MI 48071" },
  { uid: "aac-1", summary: "Bingo", location: "Active Adult Center - 260 W 13 Mile Road  Madison Heights MI 48071" },
  { uid: "aac-2", summary: "Euchre", location: "Active Adult Center - 260 W 13 Mile Road  Madison Heights MI 48071" },
  { uid: "hall-1", summary: "Council Meeting Watch Party", location: "City Hall - 300 W 13 Mile Road  Madison Heights MI 48071" },
];

// The venues row that exists in production: a placeholder with a city.
const PLACEHOLDER_VENUE = { id: "venue-tba", name: "Venue TBA", address: null, city: "Detroit" };

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // ---------------------------------------------------------------------
  // 1. A trailing "<City> <ST> <ZIP>" is kept. Real production strings.
  // ---------------------------------------------------------------------
  {
    const feedSource = { ...MUNICIPAL_FEED, id: "fs-mixed", venue_name: "City of Wyandotte - City Events", feed_url: "https://feed.example/wy.ics" };
    const rows = await runFeed({
      feedSource,
      events: [
        { uid: "founders", summary: "2027 Founder's Day", location: "Join us as we celebrate Founder's Day! More information to come! - Rochester MI 48307" },
        { uid: "hazwaste", summary: "Household Hazardous Waste Collection", location: "- Wayne County Community College 21000 Northline Rd. Taylor MI 48180" },
        { uid: "spook", summary: "Spooktacular", location: "Fifth Street Plaza - Fifth and Washington Ave. Royal Oak MI 48067" },
        { uid: "plaza", summary: "Yoga in the Plaza", location: "Fifth Avenue Pedestrian Plaza (between 4th and 5th)" },
      ],
    });
    assert.strictEqual(rows.founders.venue_city_raw, "Rochester");
    assert.strictEqual(rows.founders.venue_address_raw, null);
    assert.strictEqual(rows.founders.venue_name_raw, "Join us as we celebrate Founder's Day! More information to come! - Rochester MI 48307", "the location text is kept as it was");
    assert.strictEqual(rows.founders.venue_id, null);

    assert.strictEqual(rows.hazwaste.venue_city_raw, "Taylor");
    assert.strictEqual(rows.hazwaste.venue_address_raw, null, "no street address is recovered from free text");
    assert.strictEqual(rows.hazwaste.venue_name_raw, "- Wayne County Community College 21000 Northline Rd. Taylor MI 48180");
    assert.strictEqual(rows.hazwaste.venue_id, null, "no venue is invented or linked");

    assert.strictEqual(rows.spook.venue_city_raw, "Royal Oak");
    assert.strictEqual(rows.spook.venue_address_raw, null);

    // Three stated cities, all different: no feed city. Text with no city in it stays without one.
    assert.strictEqual(rows.plaza.venue_city_raw, null);
    assert.strictEqual(rows.plaza.venue_name_raw, "Fifth Avenue Pedestrian Plaza (between 4th and 5th)");
  }
  console.log("PASS: a trailing \"known city, MI, ZIP\" is written as the city; the location text is unchanged; no address, venue or link is derived");

  // ---------------------------------------------------------------------
  // 1b. Wrong values an earlier form of this rule would have written.
  // ---------------------------------------------------------------------
  {
    const rows = await runFeed({
      feedSource: { ...MUNICIPAL_FEED, id: "fs-traps", feed_url: "https://feed.example/traps.ics" },
      venues: [{ id: "venue-prechter", name: "Heinz C. Prechter Performing Arts Center", address: "21000 Northline Rd", city: "Taylor" }],
      events: [
        { uid: "station", summary: "Open House", location: "- Fire Station 2 1019 E Big Beaver Rd Troy MI 48083" },
        { uid: "ohio", summary: "Bus Trip", location: "Pro Football Hall of Fame 2121 George Halas Dr NW Canton OH 44708" },
        { uid: "tail", summary: "Fall Color Tour", location: "Fall color tour to Camp Dearborn MI 48380" },
        { uid: "lot", summary: "Hazardous Waste Day", location: "- Wayne County Community College parking lot 21000 Northline Rd Taylor MI 48180" },
      ],
    });
    assert.deepStrictEqual([rows.station.venue_city_raw, rows.station.venue_address_raw], ["Troy", null], "the city, and no \"2 1019 E Big Beaver Rd\"");
    assert.strictEqual(rows.ohio.venue_city_raw, null, "Canton, Ohio is not Canton, Michigan");
    assert.strictEqual(rows.tail.venue_city_raw, null, "Camp Dearborn is not Dearborn");
    assert.strictEqual(rows.lot.venue_id, null, "an address inside free text never links the event to whichever venue is on file there");
    assert.strictEqual(rows.lot.venue_name_raw, "- Wayne County Community College parking lot 21000 Northline Rd Taylor MI 48180", "the source's own text is what is stored");
    assert.strictEqual(rows.lot.venue_city_raw, "Taylor");
  }
  console.log("PASS: no address glued from a venue's own number, no Ohio city read as a Michigan one, no tail of a longer place name, no link by address");

  // ---------------------------------------------------------------------
  // 2 + 3. The Madison Heights case: "-" is not a venue, and an event that
  //        states no place takes the city every other event in the feed states.
  // ---------------------------------------------------------------------
  {
    const rows = await runFeed({
      feedSource: MUNICIPAL_FEED,
      venues: [PLACEHOLDER_VENUE],
      events: [
        ...STATED,
        { uid: "dash", summary: "Book Sale (Friends of the Madison Heights Public Library)", location: "-" },
        { uid: "none", summary: "Harvest Festival (Recreation & DPS)" },
        { uid: "noname", summary: "Senior Lunch", location: "- Madison Heights MI 48071" },
        { uid: "region", summary: "Regional Summit", location: "OH" },
        { uid: "prose", summary: "Tree Lighting", location: "In front of City Hall, weather permitting" },
        { uid: "casino", summary: "AAC 50+ Casino Trip", location: "Caesars Windsor, Windsor ON" },
        { uid: "cedar", summary: "Teen Trip", location: "Cedar Point, Sandusky, Ohio" },
        { uid: "online", summary: "Library Board Livestream", location: "Online" },
        { uid: "zoom", summary: "Resume Workshop", location: "Zoom (link sent after registration)" },
        { uid: "parade", summary: "Memorial Day Parade", location: "-" },
      ],
    });
    assert.strictEqual(rows["lib-1"].venue_city_raw, "Madison Heights");
    assert.strictEqual(rows["lib-1"].venue_address_raw, "240 W 13 Mile Road");

    for (const uid of ["dash", "none"]) {
      assert.strictEqual(rows[uid].venue_city_raw, "Madison Heights", `${uid}: takes the feed's own city`);
      assert.strictEqual(rows[uid].venue_name_raw, "Venue TBA", `${uid}: "-" / no LOCATION is not a venue`);
      assert.notStrictEqual(rows[uid].venue_name_raw, "-");
      assert.strictEqual(rows[uid].venue_address_raw, null, `${uid}: no address is invented`);
      assert.strictEqual(rows[uid].venue_id, null, `${uid}: not linked to the "Venue TBA" venues row, whose city is Detroit`);
    }
    // THE LIVE DEFECT (production, 2026-10-04): a feed event with no venue
    // name but a stated city -- "- Livonia MI 48154" -- carried the
    // placeholder name, was linked BY NAME to the venues row "Venue TBA"
    // (city: Detroit), and was shown to the public in Detroit. Eight events
    // in four cities. A name match is refused when the event's own city
    // says otherwise.
    assert.strictEqual(rows.noname.venue_name_raw, "Venue TBA");
    assert.strictEqual(rows.noname.venue_city_raw, "Madison Heights");
    assert.strictEqual(rows.noname.venue_id, null, "a Madison Heights event is not linked to a Detroit placeholder");
    // A bare region is left as the text it is: not the placeholder, and no feed city.
    assert.deepStrictEqual([rows.region.venue_name_raw, rows.region.venue_city_raw, rows.region.venue_id], ["OH", null, null]);
    // A LOCATION with any real text is never given the feed's city — it
    // states a place, even when that place cannot be read. (Independent
    // review, 2026-10-04: a first version filled every one of these with
    // "Madison Heights" and would have published them that way.)
    for (const [uid, text] of [
      ["prose", "In front of City Hall, weather permitting"],
      ["casino", "Caesars Windsor, Windsor ON"],
      ["cedar", "Cedar Point, Sandusky, Ohio"],
      ["online", "Online"],
      ["zoom", "Zoom (link sent after registration)"],
    ]) {
      assert.strictEqual(rows[uid].venue_city_raw, null, `${uid}: a stated place is never overridden by the feed's city`);
      assert.strictEqual(rows[uid].venue_name_raw, text, `${uid}: its own text is kept`);
    }

    assert.strictEqual(rows.parade.no_fixed_venue, true);
    assert.strictEqual(rows.parade.venue_city_raw, null, "an event with no fixed venue by design is left alone");
  }
  console.log("PASS: \"-\" is never stored as a venue; an event whose LOCATION says nothing takes the feed's own city and is not linked to the Detroit placeholder; a stated place (readable or not), a bare region and a parade are left alone");

  // ---------------------------------------------------------------------
  // 3b. A stated place always wins, and one out-of-town event among many
  //     does not switch the rule off (27 of 28 = 96.4%, the real Redford shape).
  // ---------------------------------------------------------------------
  {
    const many = Array.from({ length: 27 }, (_, i) => ({ uid: `in-${i}`, summary: `Class ${i}`, location: "Community Center - 12121 Hemingway  Redford MI 48239" }));
    const rows = await runFeed({
      feedSource: { ...MUNICIPAL_FEED, id: "fs-redford", venue_name: "Redford Township Community Events", feed_url: "https://feed.example/redford.ics" },
      events: [
        ...many,
        { uid: "away", summary: "Hazardous Waste Day", location: "- Wayne County Community College 21000 Northline Rd. Taylor MI 48180" },
        { uid: "dash", summary: "Board Meeting Watch Party", location: "-" },
      ],
    });
    assert.strictEqual(rows.away.venue_city_raw, "Taylor", "the event's own stated city is kept");
    assert.strictEqual(rows.dash.venue_city_raw, "Redford");
  }
  {
    // The spelling used is the feed's most common one, not the first seen.
    const rows = await runFeed({
      feedSource: { ...MUNICIPAL_FEED, id: "fs-spelling", feed_url: "https://feed.example/spelling.ics" },
      events: [
        { uid: "caps", summary: "First", location: "Library - 240 W 13 Mile Road  MADISON HEIGHTS MI 48071" },
        ...STATED,
        { uid: "dash", summary: "Book Sale", location: "-" },
      ],
    });
    assert.strictEqual(rows.dash.venue_city_raw, "Madison Heights");
  }
  console.log("PASS: an event's own stated city always wins; one out-of-town event among 28 does not switch the feed's city off");

  // ---------------------------------------------------------------------
  // 3c. No feed city without agreement, or without enough evidence.
  // ---------------------------------------------------------------------
  {
    // A regional organization: its events are in several cities (the real
    // Eastern Market Partnership / Tourism Windsor Essex shape).
    const regional = await runFeed({
      feedSource: { ...MUNICIPAL_FEED, id: "fs-regional", venue_name: "Eastern Market Partnership", feed_url: "https://feed.example/emp.ics" },
      events: [
        { uid: "a", summary: "Market A", location: "Shed 5, 2810 Russell St, Detroit, MI, 48207" },
        { uid: "b", summary: "Market B", location: "Shed 5, 2810 Russell St, Detroit, MI, 48207" },
        { uid: "c", summary: "Market C", location: "Shed 5, 2810 Russell St, Detroit, MI, 48207" },
        { uid: "d", summary: "Market D", location: "Shed 5, 2810 Russell St, Detroit, MI, 48207" },
        { uid: "e", summary: "Pop-up", location: "Civic Center, 15801 Michigan Ave, Dearborn, MI, 48126" },
        { uid: "region-only", summary: "First Wednesdays at Eastern Market", location: "MI" },
      ],
    });
    assert.strictEqual(regional["region-only"].venue_city_raw, null);
    assert.strictEqual(regional["region-only"].venue_name_raw, "MI", "a bare region is left as it is");

    const regionalBlank = await runFeed({
      feedSource: { ...MUNICIPAL_FEED, id: "fs-regional2", venue_name: "Eastern Market Partnership", feed_url: "https://feed.example/emp2.ics" },
      events: [
        ...["a", "b", "c", "d", "e", "f", "g", "h"].map((uid) => ({ uid, summary: `Market ${uid}`, location: "Shed 5, 2810 Russell St, Detroit, MI, 48207" })),
        { uid: "x", summary: "Pop-up", location: "Civic Center, 15801 Michigan Ave, Dearborn, MI, 48126" },
        { uid: "y", summary: "Pop-up 2", location: "Civic Center, 15801 Michigan Ave, Dearborn, MI, 48126" },
        { uid: "dash", summary: "Mystery Market", location: "-" },
      ],
    });
    assert.strictEqual(regionalBlank.dash.venue_city_raw, null, "8 of 10 (80%) is not agreement: a regional feed gets no default city");

    // Agreement, but only four events' worth of it.
    const thin = await runFeed({
      feedSource: { ...MUNICIPAL_FEED, id: "fs-thin", feed_url: "https://feed.example/thin.ics" },
      events: [...STATED.slice(0, 4), { uid: "dash", summary: "Book Sale", location: "-" }],
    });
    assert.strictEqual(thin.dash.venue_city_raw, null, "four events are not enough evidence");
    const enough = await runFeed({
      feedSource: { ...MUNICIPAL_FEED, id: "fs-enough", feed_url: "https://feed.example/enough.ics" },
      events: [...STATED, { uid: "dash", summary: "Book Sale", location: "-" }],
    });
    assert.strictEqual(enough.dash.venue_city_raw, "Madison Heights", "five are");
  }
  console.log("PASS: no feed city for a regional feed (80% agreement) or on thin evidence (4 events); five agreeing events are enough");

  // ---------------------------------------------------------------------
  // 3d. A placeholder is not a venue. An event whose location is unknown,
  //     in a feed with no agreed city, is NOT linked to the venues row named
  //     "Venue TBA" and does NOT take that row's city (the column default,
  //     "Detroit"). Before 2026-10-04 it did both.
  // ---------------------------------------------------------------------
  {
    const rows = await runFeed({
      feedSource: { ...MUNICIPAL_FEED, id: "fs-old", venue_name: "Tourism Windsor Essex Pelee Island", feed_url: "https://feed.example/old.ics" },
      venues: [PLACEHOLDER_VENUE],
      events: [{ uid: "none", summary: "Mystery Meetup" }, { uid: "dash", summary: "Pop-up", location: "-" }],
    });
    for (const uid of ["none", "dash"]) {
      assert.deepStrictEqual([rows[uid].venue_name_raw, rows[uid].venue_id, rows[uid].venue_city_raw], ["Venue TBA", null, null], `${uid}: an unknown location is not "Detroit"`);
    }
  }
  console.log("PASS: an event with an unknown location is not linked to the \"Venue TBA\" venues row and is not given its city");

  // ---------------------------------------------------------------------
  // 4. A single-venue feed (location_per_event false) is exactly as before.
  // ---------------------------------------------------------------------
  {
    const rows = await runFeed({
      feedSource: { ...MUNICIPAL_FEED, id: "fs-single", venue_name: "Trinosophes", location_per_event: false, feed_url: "https://feed.example/single.ics" },
      events: [...STATED, { uid: "dash", summary: "Show", location: "-" }],
    });
    for (const uid of ["lib-1", "dash"]) {
      assert.strictEqual(rows[uid].venue_name_raw, "Trinosophes");
      assert.strictEqual(rows[uid].venue_city_raw, null);
    }
  }
  console.log("PASS: a single-venue feed is unchanged — its LOCATION text is still ignored and no city is assumed");

  console.log("\nAll cron-feeds-city-recovery.test.js checks passed.");
}

run().catch((err) => { console.error("FAIL:", err && err.stack || err); process.exit(1); });
