// test/cron-localist-location.test.js — BUG-013 (2026-10-04): the Localist
// connector writes where an event is, and does not write an event held
// outside the Orbit.
//
// WHAT WAS MEASURED (production, 2026-10-04): 11 of the 55 events in Admin's
// Needs follow-up queue were Localist rows with no venue, no address and no
// city — every row this connector had written. The connector read
// `venue_name`, a field the API does not send. The fixtures below are shaped
// like what the live Macomb Community College API returned that day
// (location_name / address / geo, and geo.street as the fragment it really
// is), not like what the original code assumed.
//
// Run: node test/cron-localist-location.test.js
"use strict";
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

function fresh() {
  for (const f of ["api/cron-localist.js", "api/_lib/run-log.js", "api/_lib/venue-lookup.js"]) {
    delete require.cache[require.resolve(`${REPO_DIR}/${f}`)];
  }
  return require(`${REPO_DIR}/api/cron-localist.js`);
}

let nextId = 54134692586776;
// One event as the API returns it. `place` is merged over an in-person default.
function apiEvent(title, place, start) {
  const id = nextId++;
  return {
    id,
    title,
    description_text: `${title} — details.`,
    filters: { event_types: [{ name: "Concerts & Performances" }] },
    location: "",
    location_name: "",
    room_number: "",
    address: "",
    experience: "inperson",
    geo: { latitude: null, longitude: null, street: null, city: null, state: null, country: null, zip: null },
    localist_url: `https://events.macomb.edu/event/${id}`,
    photo_url: null,
    ticket_url: null,
    event_instances: [{ event_instance: { id: id + 1000000, event_id: id, start: start || "2099-11-07T19:30:00-05:00", end: null, all_day: false } }],
    ...place,
  };
}

// Real shapes, 2026-10-04.
const CENTER_CAMPUS = {
  location_name: "Center Campus, C Building",
  address: "44575 Garfield Road, Clinton Township, MI 48038",
  geo: { latitude: "42.62191", longitude: "-82.956398", street: "44575 Garfield Road", city: null, state: "MI", country: "US", zip: "48038" },
};
const SOUTH_CAMPUS_J = {
  location_name: "South Campus, J Building",
  address: "14500 E. 12 Mile Road, Warren, MI 48088",
  geo: { latitude: "42.5055", longitude: "-82.9713", street: "J", city: "Warren", state: "MI", country: "US", zip: "48088" },
};
const AWAY_KALAMAZOO = {
  location_name: "WMU Soccer Complex",
  address: "2500 Stadium Dr, Kalamazoo, MI 49008",
  geo: { latitude: "42.2831", longitude: "-85.6139", street: "2500 Stadium Dr", city: "Kalamazoo", state: "MI", country: "US", zip: "49008" },
};
const VIRTUAL = { experience: "virtual" };

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  const mod = fresh();
  const { parseEvent, parseLocalistLocation, TENANTS, ORBIT_MILES } = mod;
  const macomb = TENANTS.find((t) => t.tenantSlug === "macomb");

  // --- 1. The place is read from the fields the API really sends. ---
  {
    const a = parseLocalistLocation(apiEvent("Baby Item Donation", CENTER_CAMPUS));
    assert.strictEqual(a.name, "Center Campus, C Building");
    assert.strictEqual(a.street, "44575 Garfield Road");
    assert.strictEqual(a.city, "Clinton Township", "the city comes from `address`; geo.city is null for this campus");
    assert.strictEqual(a.outsideOrbit, false);
    assert.ok(a.milesFromDetroit < 20);

    const b = parseLocalistLocation(apiEvent("Baby Item Donation", SOUTH_CAMPUS_J));
    assert.strictEqual(b.street, "14500 E. 12 Mile Road", "the street is from `address` — geo.street here is the fragment \"J\" and is not used");
    assert.strictEqual(b.city, "Warren");

    const [row] = parseEvent(apiEvent("Baby Item Donation", CENTER_CAMPUS), macomb);
    assert.strictEqual(row._rawVenueName, "Center Campus, C Building");
    assert.strictEqual(row.venue_address_raw, "44575 Garfield Road");
    assert.strictEqual(row.venue_city_raw, "Clinton Township");
  }
  console.log("PASS: venue name, street and city are read from location_name and address; geo.street is not trusted");

  // --- 2. Nothing is guessed from an address that is not "<street>, <city>, <ST> <ZIP>". ---
  {
    const cityOnly = parseLocalistLocation({ location_name: "Downtown", address: "Mount Clemens, MI 48043", geo: {} });
    assert.deepStrictEqual([cityOnly.street, cityOnly.city], [null, "Mount Clemens"]);

    const noState = parseLocalistLocation({ location_name: "Somewhere", address: "Building K, second floor", geo: {} });
    assert.deepStrictEqual([noState.street, noState.city], [null, null], "no state at the end: left alone");

    const geoCityOnly = parseLocalistLocation({ location_name: "Sports and Expo Center", address: "", geo: { city: "Warren", street: "J" } });
    assert.deepStrictEqual([geoCityOnly.street, geoCityOnly.city], [null, "Warren"], "geo.city fills in when address gives none; geo.street never does");

    const legacy = parseLocalistLocation({ venue_name: "Stroh Center" });
    assert.strictEqual(legacy.name, "Stroh Center", "the venue_name field the original code expected still works if a tenant sends it");

    const virtual = parseLocalistLocation(apiEvent("Online Info Session", VIRTUAL));
    assert.deepStrictEqual([virtual.name, virtual.street, virtual.city, virtual.outsideOrbit], [null, null, null, false], "no location stated: nothing invented, and not treated as far away");
  }
  console.log("PASS: an address in any other shape is left alone; an event with no location is kept and has nothing invented for it");

  // --- 2b. Bowling Green State University's real shapes, same day: a
  //     building where the street should be, a building glued in front of
  //     the street, a full state name with no comma before the city, and an
  //     away game with a place name and nothing else. ---
  {
    const library = parseLocalistLocation({ location_name: "Jerome Library", address: "Jerome Library, Bowling Green, OH 43403", geo: { city: "Bowling Green", latitude: "41.376503", longitude: "-83.635107" } });
    assert.deepStrictEqual([library.name, library.street, library.city], ["Jerome Library", null, "Bowling Green"], "a building name is not a street");

    const otherBuilding = parseLocalistLocation({ location_name: "Pallister Conference Room", address: "Jerome Library, Bowling Green, OH 43403", geo: {} });
    assert.deepStrictEqual([otherBuilding.street, otherBuilding.city], [null, "Bowling Green"], "...even when it is a different building from the venue name");

    const union = parseLocalistLocation({ location_name: "Bowen-Thompson Student Union", address: "Bowen-Thompson Student Union 1001 E Wooster St , Bowling Green, OH 43402", geo: { city: "Bowling Green" } });
    assert.deepStrictEqual([union.street, union.city], ["1001 E Wooster St", "Bowling Green"], "the building repeated in front of the street is dropped");

    const flight = parseLocalistLocation({ location_name: "Bowling Green Flight Center", address: "905 E Poe Rd, Bowling Green, OH 43402", geo: { city: "Bowling Green" } });
    assert.deepStrictEqual([flight.street, flight.city], ["905 E Poe Rd", "Bowling Green"]);

    const firelands = parseLocalistLocation({ location_name: "BGSU Firelands", address: "One University Drive Huron, Ohio 44839", geo: { city: "Huron", latitude: "41.397938", longitude: "-82.594216" } });
    assert.deepStrictEqual([firelands.street, firelands.city], [null, "Huron"], "no comma before the city: nothing is split out of the address; the city is geo.city");

    const away = parseLocalistLocation({ location_name: "Kalamazoo, Mich.", location: "Kalamazoo, Mich.", address: "", geo: { latitude: null, longitude: null, city: null } });
    assert.deepStrictEqual([away.name, away.street, away.city, away.outsideOrbit], ["Kalamazoo, Mich.", null, null, false],
      "an away game that gives only a place name has no coordinates: it is kept, and nothing is inferred from the name");
  }
  console.log("PASS: Bowling Green State University's real address shapes — a building is never taken for a street, and nothing is split where the source did not separate it");

  // --- 2c. Found by independent review of the first version, 2026-10-04. ---
  {
    // The street is the part that begins with a house number, wherever the building sits.
    const suite = parseLocalistLocation({ location_name: "City Hall", address: "123 Main St, Suite 4, Warren, MI 48088", geo: {} });
    assert.deepStrictEqual([suite.street, suite.city], ["123 Main St", "Warren"]);
    const leading = parseLocalistLocation({ location_name: "South Campus", address: "South Campus, 14500 E 12 Mile Rd, Warren, MI 48088", geo: {} });
    assert.deepStrictEqual([leading.street, leading.city], ["14500 E 12 Mile Rd", "Warren"], "a building in front of the street, with a comma");
    // The venue name is dropped from the front only as a whole word.
    const prefix = parseLocalistLocation({ location_name: "Building 1", address: "Building 14575 Garfield Road, Clinton Township, MI 48038", geo: {} });
    assert.deepStrictEqual([prefix.street, prefix.city], [null, "Clinton Township"], "\"Building 1\" is not a prefix of \"Building 14575\" — the street is not invented as \"4575 Garfield Road\"");
    // Any two letters are not a state.
    for (const address of ["University Center, UC", "Online, NA", "Room 204, TB"]) {
      const r = parseLocalistLocation({ location_name: "X", address, geo: {} });
      assert.deepStrictEqual([r.street, r.city], [null, null], `${address}: not a city and a state`);
    }
    // A bad geocode is not evidence of distance.
    for (const geo of [
      { latitude: 0, longitude: 0 },
      { latitude: "0", longitude: "0" },
      { latitude: "42.62191", longitude: "82.956398" }, // minus sign dropped
      { latitude: "-82.956398", longitude: "42.62191" }, // swapped
      { latitude: "999", longitude: "-83" },
    ]) {
      const r = parseLocalistLocation({ location_name: "Center Campus, C Building", address: "44575 Garfield Road, Clinton Township, MI 48038", geo });
      assert.strictEqual(r.outsideOrbit, false, `coordinates ${JSON.stringify(geo)} must not drop a campus event`);
      assert.strictEqual(r.milesFromDetroit, null);
      assert.strictEqual(r.city, "Clinton Township");
    }
    // Numbers and strings behave the same; a real far-away point is still far away.
    assert.strictEqual(parseLocalistLocation({ geo: { latitude: 42.2831, longitude: -85.6139 } }).outsideOrbit, true);
    // Nothing throws on a missing or malformed event.
    for (const bad of [null, undefined, "x", 7, {}, { geo: null }, { address: 12 }]) {
      const r = parseLocalistLocation(bad);
      assert.deepStrictEqual([r.name, r.street, r.city, r.outsideOrbit], [null, null, null, false]);
    }
  }
  console.log("PASS: review cases — house-number streets only, whole-word name prefix, real state codes only, bad coordinates ignored, malformed input safe");

  // --- 3. Distance: only coordinates decide, against Detroit's border. ---
  {
    const away = parseLocalistLocation(apiEvent("Women's Soccer at Western Michigan", AWAY_KALAMAZOO));
    assert.strictEqual(away.outsideOrbit, true);
    assert.ok(away.milesFromDetroit > ORBIT_MILES, `Kalamazoo is ${Math.round(away.milesFromDetroit)} miles out`);
    // Bowling Green State University's own campus is inside the Orbit (about 65 miles).
    const bgsu = parseLocalistLocation({ location_name: "Stroh Center", address: "1535 E Wooster St, Bowling Green, OH 43403", geo: { latitude: "41.3781", longitude: "-83.6285" } });
    assert.strictEqual(bgsu.outsideOrbit, false);
    assert.strictEqual(bgsu.city, "Bowling Green");
    const garbage = parseLocalistLocation({ location_name: "X", address: "", geo: { latitude: "", longitude: "n/a" } });
    assert.strictEqual(garbage.outsideOrbit, false, "unusable coordinates are not evidence of distance");
  }
  console.log("PASS: an event is outside the Orbit only when its own coordinates are more than 75 miles from Detroit's border");

  // --- 4. End to end: what is written, and what is counted and not written. ---
  {
    const events = [
      apiEvent("Baby Item Donation", CENTER_CAMPUS),
      apiEvent("Fraggle Rock: Back to the Rock LIVE", SOUTH_CAMPUS_J),
      apiEvent("Women's Soccer at Western Michigan", AWAY_KALAMAZOO),
      apiEvent("Online Info Session", VIRTUAL),
    ];
    const written = [];
    let runPatch = null;
    global.fetch = async (url, opts = {}) => {
      if (url.includes("/api/2/events")) {
        // Only the Macomb tenant has events in this fixture.
        const page = url.includes("events.macomb.edu") ? events.map((e) => ({ event: e })) : [];
        return { ok: true, status: 200, json: async () => ({ events: page }) };
      }
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
      if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") { runPatch = JSON.parse(opts.body); return { ok: true, status: 204, json: async () => ({}) }; }
      if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("/rest/v1/events") && opts.method === "POST") { written.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
      throw new Error("unmocked URL: " + url);
    };
    const res = { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
    await fresh()({ headers: {} }, res);

    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    assert.strictEqual(res._body.checked, 4);
    assert.strictEqual(res._body.upserted, 3);
    assert.strictEqual(res._body.skippedOutsideOrbit, 1, "the away game is counted, not silently dropped");
    assert.strictEqual(written.length, 3);
    assert.ok(!written.some((r) => /Western Michigan/.test(r.title)), "an event held outside the Orbit is not written");

    const byTitle = Object.fromEntries(written.map((r) => [r.title, r]));
    assert.deepStrictEqual(
      [byTitle["Baby Item Donation"].venue_name_raw, byTitle["Baby Item Donation"].venue_address_raw, byTitle["Baby Item Donation"].venue_city_raw],
      ["Center Campus, C Building", "44575 Garfield Road", "Clinton Township"]
    );
    assert.deepStrictEqual(
      [byTitle["Fraggle Rock: Back to the Rock LIVE"].venue_name_raw, byTitle["Fraggle Rock: Back to the Rock LIVE"].venue_city_raw],
      ["South Campus, J Building", "Warren"]
    );
    // A field the source did not give is LEFT OUT of the row, never sent as
    // null: a null would overwrite an address or city already stored on the
    // event (independent review, 2026-10-04: a first version always sent
    // both keys and erased a stored address on a re-run).
    const online = byTitle["Online Info Session"];
    assert.strictEqual(online.venue_name_raw, null);
    assert.ok(!("venue_address_raw" in online) && !("venue_city_raw" in online), "no address or city key is sent for an event that states none");
    assert.ok("venue_address_raw" in byTitle["Baby Item Donation"] && "venue_city_raw" in byTitle["Baby Item Donation"]);
    for (const row of written) {
      assert.ok(!Object.keys(row).some((k) => k.startsWith("_")), `no working field is written: ${Object.keys(row).filter((k) => k.startsWith("_"))}`);
      assert.strictEqual(row.status, "pending_review", "this source's review status is unchanged");
    }
    assert.strictEqual(runPatch.records_fetched, 4);
    assert.strictEqual(runPatch.records_parsed, 3, "the run log counts what was eligible to write");
    assert.strictEqual(runPatch.records_written, 3);
  }
  console.log("PASS: end to end — campus events are written with venue, street and city; the away game is counted and not written; statuses unchanged");

  console.log("\nAll cron-localist-location.test.js checks passed.");
}

run().catch((err) => { console.error("FAIL:", err && err.stack || err); process.exit(1); });
