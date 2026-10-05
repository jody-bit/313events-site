// test/localist-rows.test.js — api/_lib/localist-rows.js: every decision the
// Localist connector makes without the network or the database.
//
// WHAT WAS MEASURED (both tenants' live APIs, 2026-10-04/05), and what each
// section below holds the code to:
//   - the connector saw only today (5 and 6 entries); 90 days is 283 entries
//     for 163 events at Macomb Community College and 684 for 340 at Bowling
//     Green State University;
//   - one row a day: "Made in Ohio Art Exhibit" 72 all-day entries, "Baby
//     Item Donation" 17 (three events, three drop-off points), "NIFA Region
//     III SAFECON" a week of midnight-to-midnight entries stored with a
//     start time of "12:00 AM";
//   - Bowling Green's athletics schedule gives a place only as text
//     ("Kalamazoo, Mich.", "Bowling Green, Ohio, Stroh Center"), so no away
//     game was ever dropped;
//   - 97 of Macomb's 163 events and 142 of Bowling Green's 340 are not listed
//     for the general public by the college itself.
//
// Fixtures are shaped like the API's real responses (test/fixtures/
// localist-api.js); they are fixtures, not captures.
//
// Run: node test/localist-rows.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const L = require(`${REPO_DIR}/api/_lib/localist-rows.js`);
const { makeLocalistApi, event, instance, daily, isoPlusDays, PLACES } = require("./fixtures/localist-api.js");

const TENANT = { tenantSlug: "macomb", apiBase: "https://events.macomb.edu", source: "Macomb Community College", publicAudiences: ["General Public"], defaultStatus: "pending_review" };
const wrap = (instances) => instances.map((i) => ({ event_instance: i }));
const units = (instances) => L.scheduleUnits(L.normalizeInstances(wrap(instances)));
const brief = (list) => list.map((u) => `${u.startDate}${u.endDate ? ".." + u.endDate : ""} ${u.allDay ? "all-day" : u.timeDisplay} x${u.days}`);
// The title-keyword table is passed in by the connector; a stand-in here.
const categoryFromText = (title) => (/exhibit/i.test(title) ? "visual" : /ballet|nutcracker/i.test(title) ? "dance" : null);

// --- 1. One instance, as a row will state it. ---
{
  const n = (i) => L.normalizeInstance({ event_instance: i });
  const timed = n(instance("2026-10-09", "19:30", "21:00"));
  assert.deepStrictEqual([timed.date, timed.allDay, timed.timeDisplay, timed.endDate], ["2026-10-09", false, "7:30 PM – 9:00 PM", null]);
  const startOnly = n(instance("2026-10-09", "08:00"));
  assert.deepStrictEqual([startOnly.timeDisplay, startOnly.endDate], ["8:00 AM", null], "no end given: no end shown");
  const allDay = n(instance("2026-10-09", null));
  assert.deepStrictEqual([allDay.allDay, allDay.timeDisplay], [true, null], "all day: no time is made up");

  // Midnight to the following midnight is the whole day, said the long way.
  const safecon = n(instance("2026-10-04", "00:00", "2026-10-05T00:00:00-04:00"));
  assert.deepStrictEqual([safecon.allDay, safecon.timeDisplay, safecon.endDate], [true, null, null], "not \"12:00 AM\"");
  const untilLastMinute = n(instance("2026-10-04", "00:00", "23:59"));
  assert.deepStrictEqual([untilLastMinute.allDay, untilLastMinute.endDate], [true, null]);
  const threeWholeDays = n(instance("2026-10-04", "00:00", "2026-10-07T00:00:00-04:00"));
  assert.deepStrictEqual([threeWholeDays.allDay, threeWholeDays.endDate], [true, "2026-10-06"], "three whole days end on the third");
  // ...but an event that really starts at midnight is left as it is.
  const midnightBreakfast = n(instance("2026-12-14", "00:00", "02:00"));
  assert.deepStrictEqual([midnightBreakfast.allDay, midnightBreakfast.timeDisplay], [false, "12:00 AM – 2:00 AM"]);
  const midnightNoEnd = n(instance("2026-12-14", "00:00"));
  assert.deepStrictEqual([midnightNoEnd.allDay, midnightNoEnd.timeDisplay], [false, "12:00 AM"], "a start with no end is what the source said; it is not reinterpreted");

  // Into another day: the end DATE is kept, the end time is not shown beside the start.
  const meet = n(instance("2026-11-06", "18:00", "2026-11-07T11:00:00-05:00"));
  assert.deepStrictEqual([meet.timeDisplay, meet.endDate], ["6:00 PM", "2026-11-07"]);
  // A late night is one night.
  const late = n(instance("2026-10-09", "22:00", "2026-10-10T01:00:00-04:00"));
  assert.deepStrictEqual([late.timeDisplay, late.endDate], ["10:00 PM – 1:00 AM", null]);

  // ...which means ending the next morning EARLIER than it began, by 6 AM.
  const untilFive = n(instance("2026-10-09", "22:00", "2026-10-10T05:30:00-04:00"));
  assert.deepStrictEqual([untilFive.timeDisplay, untilFive.endDate], ["10:00 PM – 5:30 AM", null]);
  const untilSeven = n(instance("2026-10-09", "22:00", "2026-10-10T07:00:00-04:00"));
  assert.deepStrictEqual([untilSeven.timeDisplay, untilSeven.endDate], ["10:00 PM", "2026-10-10"], "past 6 AM it is a second day");
  const sixToSix = n(instance("2026-10-09", "06:00", "2026-10-10T06:00:00-04:00"));
  assert.deepStrictEqual([sixToSix.timeDisplay, sixToSix.endDate], ["6:00 AM", "2026-10-10"], "6 AM to 6 AM the next day is a whole day, not a late night");
  const dawn = n(instance("2026-10-09", "05:00", "2026-10-10T05:30:00-04:00"));
  assert.deepStrictEqual([dawn.timeDisplay, dawn.endDate], ["5:00 AM", "2026-10-10"]);
  // An all-day instance that names a later last day keeps it.
  const allDayThree = n({ ...instance("2026-10-09", null), end: "2026-10-11T23:59:00-04:00" });
  assert.deepStrictEqual([allDayThree.allDay, allDayThree.endDate, allDayThree.timeDisplay], [true, "2026-10-11", null]);
  const allDayToMidnight = n({ ...instance("2026-10-09", null), end: "2026-10-12T00:00:00-04:00" });
  assert.strictEqual(allDayToMidnight.endDate, "2026-10-11", "an end of 00:00 is the midnight that closes the day before");
  assert.strictEqual(n({ ...instance("2026-10-09", null), end: "2026-10-10T00:00:00-04:00" }).endDate, null);
  // The clock change (1 November 2026) and the turn of the year move nothing.
  assert.deepStrictEqual(brief(units(daily("2026-10-30", 5, "09:00", "17:00"))), ["2026-10-30..2026-11-03 9:00 AM – 5:00 PM x5"]);
  assert.deepStrictEqual(brief(units(daily("2026-12-30", 4, null))), ["2026-12-30..2027-01-02 all-day x4"]);

  for (const bad of [null, undefined, 7, {}, { event_instance: { id: 1 } }, { event_instance: { start: "2026-10-09T19:00:00-04:00" } }, { event_instance: { id: 1, start: "next Tuesday" } }]) {
    assert.strictEqual(L.normalizeInstance(bad), null);
  }
}
console.log("PASS: an instance — its own times only; midnight-to-midnight is all day; an overnight end is an end date; a late night is one night");

// --- 2. A run of days is one row. Nothing else is folded. ---
{
  // Macomb's "Baby Item Donation": 18 days, 8:00 AM, no end time.
  const drive = daily("2026-10-03", 18, "08:00");
  const [one, ...rest] = units(drive);
  assert.strictEqual(rest.length, 0, "eighteen daily instances are one row");
  assert.deepStrictEqual([one.id, one.startDate, one.endDate, one.timeDisplay, one.days], [String(drive[0].id), "2026-10-03", "2026-10-20", "8:00 AM", 18], "named after its first instance");

  assert.deepStrictEqual(brief(units(daily("2026-10-03", 3, "08:00"))), ["2026-10-03..2026-10-05 8:00 AM x3"], "three days is a run");
  assert.deepStrictEqual(brief(units(daily("2026-10-03", 2, "08:00"))), ["2026-10-03 8:00 AM x1", "2026-10-04 8:00 AM x1"], "two days are two days");

  // A weekly series: separate things to go to.
  assert.strictEqual(units([instance("2026-10-06", "19:00"), instance("2026-10-13", "19:00"), instance("2026-10-20", "19:00")]).length, 3);
  // A two-day expo with different hours each day (Metro Detroit Women's Expo).
  assert.deepStrictEqual(brief(units([instance("2026-10-03", "10:00", "18:00"), instance("2026-10-04", "11:00", "16:00")])), ["2026-10-03 10:00 AM – 6:00 PM x1", "2026-10-04 11:00 AM – 4:00 PM x1"]);
  // Five performances over three days (The Nutcracker): two on one day breaks any run.
  assert.strictEqual(units([instance("2026-12-18", "19:00"), instance("2026-12-19", "13:00"), instance("2026-12-19", "19:00"), instance("2026-12-20", "13:00"), instance("2026-12-20", "19:00")]).length, 5);
  // Friday evening, Saturday afternoon and evening, Sunday afternoon (Public Skate).
  assert.strictEqual(units([instance("2026-10-09", "19:00", "20:50"), instance("2026-10-10", "15:30", "17:20"), instance("2026-10-10", "19:00", "20:50"), instance("2026-10-11", "15:30", "17:20")]).length, 4);
  // Three consecutive days whose hours differ are three days -- the start or the end.
  assert.strictEqual(units([instance("2026-10-09", "10:00", "16:00"), instance("2026-10-10", "10:00", "16:00"), instance("2026-10-11", "12:00", "16:00")]).length, 3);
  assert.strictEqual(units([instance("2026-10-09", "10:00", "16:00"), instance("2026-10-10", "10:00", "18:00"), instance("2026-10-11", "10:00", "16:00")]).length, 3);

  // An exhibition with a closed day in the middle is two runs (Made in Ohio
  // Art Exhibit: all day, one gap of two days and one of four in 90).
  const exhibit = [...daily("2026-11-20", 5, null), ...daily("2026-11-29", 4, null)];
  assert.deepStrictEqual(brief(units(exhibit)), ["2026-11-20..2026-11-24 all-day x5", "2026-11-29..2026-12-02 all-day x4"]);
  // The hours change part-way: the run ends where they change.
  assert.deepStrictEqual(brief(units([...daily("2026-10-05", 4, "09:00", "17:00"), ...daily("2026-10-09", 3, "10:00", "14:00")])), ["2026-10-05..2026-10-08 9:00 AM – 5:00 PM x4", "2026-10-09..2026-10-11 10:00 AM – 2:00 PM x3"]);
  // A week of midnight-to-midnight days (NIFA Region III SAFECON) is one all-day row.
  const safecon = Array.from({ length: 7 }, (_, i) => instance(isoPlusDays("2026-10-04", i), "00:00", `${isoPlusDays("2026-10-05", i)}T00:00:00-04:00`));
  assert.deepStrictEqual(brief(units(safecon)), ["2026-10-04..2026-10-10 all-day x7"]);
  // An instance that itself spans days is never part of a run.
  const meets = [instance("2026-11-06", "18:00", "2026-11-07T11:00:00-05:00"), instance("2026-11-07", "18:00", "2026-11-08T11:00:00-05:00"), instance("2026-11-08", "18:00", "2026-11-09T11:00:00-05:00")];
  assert.strictEqual(units(meets).length, 3);
  // The same instance listed twice (two pages, or listing and full schedule) counts once.
  assert.strictEqual(units([...drive, ...drive]).length, 1);
  assert.deepStrictEqual(units([]), []);
}
console.log("PASS: a run — three or more consecutive days, one instance a day, the same hours — is one row with an end date; nothing else is folded");

// --- 3. A state, as a schedule writes it. ---
{
  for (const [text, code] of [["Mich.", "MI"], ["MI", "MI"], ["Michigan", "MI"], ["mich", "MI"], ["Ohio", "OH"], ["OH 43403", "OH"], ["Ill.", "IL"], ["N.Y.", "NY"], ["Ky.", "KY"], ["W.Va.", "WV"], ["Ont.", "ON"], ["TX", "TX"]]) {
    assert.strictEqual(L.stateCode(text), code, text);
  }
  for (const notAState of ["Stroh Center", "C Building", "UC", "South Campus", "", null, "Room 204", "Michigan Room Annex of the Union"]) {
    assert.strictEqual(L.stateCode(notAState), null, String(notAState));
  }
  assert.deepStrictEqual(L.parsePlaceText("Bowling Green, Ohio, Stroh Center"), { cityText: "Bowling Green", state: "OH", venue: "Stroh Center" });
  assert.deepStrictEqual(L.parsePlaceText("Kalamazoo, Mich."), { cityText: "Kalamazoo", state: "MI", venue: null });
  assert.deepStrictEqual(L.parsePlaceText("Stroh Center, Bowling Green, Ohio"), { cityText: "Bowling Green", state: "OH", venue: "Stroh Center" });
  assert.deepStrictEqual(L.parsePlaceText("Detroit, Mich. (Ford Field)"), { cityText: "Detroit", state: "MI", venue: "Ford Field" });
  assert.deepStrictEqual(L.parsePlaceText("Bowling Green, Ohio, Stroh Center, United States"), { cityText: "Bowling Green", state: "OH", venue: "Stroh Center" }, "a country at the end is not part of the venue");
  assert.strictEqual(L.parsePlaceText("Center Campus, C Building"), null);
  assert.strictEqual(L.parsePlaceText("Ohio"), null, "a state alone names no city");
  assert.strictEqual(L.parsePlaceText(""), null);
}
console.log("PASS: a state is recognised as a code, a name or a newspaper abbreviation, and only as a whole part between commas");

// --- 4. Where the event is, and how that is known. ---
{
  const where = (e) => L.parseLocalistLocation(e);
  // Coordinates: a campus building.
  const campus = where(PLACES.CENTER_CAMPUS);
  assert.deepStrictEqual([campus.orbit, campus.name, campus.street, campus.city], ["in", "Center Campus, C Building", "44575 Garfield Road", "Clinton Township"]);
  assert.ok(campus.milesFromDetroit < 20);
  const south = where(PLACES.SOUTH_CAMPUS_J);
  assert.deepStrictEqual([south.street, south.city], ["14500 E. 12 Mile Road", "Warren"], "geo.street (\"J\") is not used");
  const library = where(PLACES.JEROME_LIBRARY);
  assert.deepStrictEqual([library.orbit, library.street, library.city], ["in", null, "Bowling Green"], "a building is not a street");
  // Coordinates far away decide, whatever else is said.
  const lobster = where(PLACES.SANTA_MONICA);
  assert.deepStrictEqual([lobster.orbit, lobster.reason, lobster.outsideOrbit], ["out", "outside_orbit", true]);
  const kalamazooGeo = where({ location_name: "WMU Soccer Complex", address: "2500 Stadium Dr, Kalamazoo, MI 49008", geo: { latitude: "42.2831", longitude: "-85.6139" } });
  assert.deepStrictEqual([kalamazooGeo.orbit, kalamazooGeo.reason], ["out", "outside_orbit"]);
  assert.ok(kalamazooGeo.milesFromDetroit > L.ORBIT_MILES);

  // No coordinates: the athletics schedule's own text.
  const home = where(PLACES.HOME_STROH);
  assert.deepStrictEqual([home.orbit, home.name, home.city, home.street], ["in", "Stroh Center", "Bowling Green", null], "the venue is the part after the state; no street is invented");
  const oakland = where(PLACES.AWAY_OAKLAND);
  assert.deepStrictEqual([oakland.orbit, oakland.name, oakland.city], ["in", "Rochester, Mich.", "Rochester"], "an away game inside the Orbit is a Detroit Orbit event; with no venue named, the text stands as written");
  const detroit = where({ location_name: "Detroit, Mich., Calihan Hall" });
  assert.deepStrictEqual([detroit.orbit, detroit.name, detroit.city], ["in", "Calihan Hall", "Detroit"]);
  const kalamazoo = where(PLACES.AWAY_KALAMAZOO);
  assert.deepStrictEqual([kalamazoo.orbit, kalamazoo.reason, kalamazoo.statedElsewhere, kalamazoo.city], ["out", "city_not_listed", "Kalamazoo, MI", null]);
  const champaign = where(PLACES.AWAY_CHAMPAIGN);
  assert.deepStrictEqual([champaign.orbit, champaign.reason, champaign.statedElsewhere], ["out", "outside_orbit", "Champaign, IL"]);
  const wku = where(PLACES.AWAY_WKU);
  assert.deepStrictEqual([wku.orbit, wku.reason, wku.city], ["out", "outside_orbit", null], "Bowling Green, Kentucky is not Bowling Green, Ohio");
  const windsor = where({ location_name: "Windsor, Ont., St. Denis Centre" });
  assert.deepStrictEqual([windsor.orbit, windsor.reason], ["out", "city_not_listed"], "Ontario has no list: not accepted, and not called far away");

  // A city is a city of ITS state: Oxford, Ohio (Miami University) is not Oxford, Michigan.
  const oxford = where({ location_name: "Oxford, Ohio, Yager Stadium" });
  assert.deepStrictEqual([oxford.orbit, oxford.reason, oxford.city], ["out", "city_not_listed", null]);
  assert.deepStrictEqual([where({ location_name: "Oxford, Mich." }).orbit, where({ location_name: "Oxford, Mich." }).city], ["in", "Oxford"]);
  assert.deepStrictEqual([where({ location_name: "Detroit, Mich. (Ford Field)" }).name, where({ location_name: "Detroit, Mich. (Ford Field)" }).city], ["Ford Field", "Detroit"]);
  // Coordinates overrule the text: a listed city in the address, a geocode 80 miles out.
  const farGeocode = where({ location_name: "Away Venue", address: "100 Main St, Toledo, OH 43604", geo: { latitude: "41.4553", longitude: "-81.9179" } });
  assert.deepStrictEqual([farGeocode.orbit, farGeocode.reason], ["out", "outside_orbit"], "Westlake, Ohio's coordinates: about 80 miles");
  assert.ok(farGeocode.milesFromDetroit > 75 && farGeocode.milesFromDetroit < 90);
  // The geocoder's own city and state with no coordinates.
  const geoCityOnly = where({ location_name: "Sports and Expo Center", address: "", geo: { city: "Warren", state: "MI", street: "J" } });
  assert.deepStrictEqual([geoCityOnly.orbit, geoCityOnly.city, geoCityOnly.street], ["in", "Warren", null]);
  // An address that ends with the country, or spells the state out.
  assert.deepStrictEqual([where({ location_name: "City Hall", address: "1 S Main St, Mount Clemens, MI 48043, USA", geo: {} }).city, where({ location_name: "Campus", address: "44575 Garfield Road, Clinton Township, Michigan 48038", geo: {} }).city], ["Mount Clemens", "Clinton Township"]);

  // Nothing says where: not assumed to be on campus.
  for (const e of [PLACES.ROOM_ONLY, { location_name: "TBA (at Campus Sites)" }, { location_name: "BTSU 427" }, {}, { experience: "virtual" }, { location_name: "Somewhere", address: "Building K, second floor" }]) {
    const r = where(e);
    assert.deepStrictEqual([r.orbit, r.reason, r.city, r.street, r.outsideOrbit], ["unknown", "no_place", null, null, false], JSON.stringify(e));
  }
  // A city and state in `address` with no coordinates.
  const addressOnly = where({ location_name: "City Hall", address: "1 S Main St, Mount Clemens, MI 48043", geo: {} });
  assert.deepStrictEqual([addressOnly.orbit, addressOnly.street, addressOnly.city], ["in", "1 S Main St", "Mount Clemens"]);
  const notACity = where({ location_name: "K Building", address: "K Building, South Campus, MI 48088", geo: {} });
  assert.deepStrictEqual([notACity.orbit, notACity.reason, notACity.city], ["out", "city_not_listed", null], "\"South Campus\" is not a city");
  const troyOhio = where({ location_name: "Arena", address: "255 Adams St, Troy, OH 45373", geo: {} });
  assert.deepStrictEqual([troyOhio.orbit, troyOhio.city], ["out", null], "Troy, Ohio is not Troy, Michigan");
  // The geocoder's own city, when there are coordinates and `address` names none.
  const firelands = where({ location_name: "BGSU Firelands", address: "One University Drive Huron, Ohio 44839", geo: { city: "Huron", state: "OH", latitude: "41.397938", longitude: "-82.594216" } });
  assert.deepStrictEqual([firelands.orbit, firelands.street, firelands.city], ["in", null, "Huron"]);

  // Street: a house number and a street type, wherever the building, floor or room sits.
  const s = (address, name = "City Hall") => where({ location_name: name, address, geo: {} }).street;
  assert.strictEqual(s("123 Main St, Suite 4, Warren, MI 48088"), "123 Main St");
  assert.strictEqual(s("2nd Floor, 123 Main St, Warren, MI 48093"), "123 Main St");
  assert.strictEqual(s("1001 E Wooster St, 101 Olscamp Hall, Bowling Green, OH 43403"), "1001 E Wooster St");
  assert.strictEqual(s("Bowen-Thompson Student Union 1001 E Wooster St , Bowling Green, OH 43402", "Bowen-Thompson Student Union"), "1001 E Wooster St", "the building repeated in front is dropped");
  assert.strictEqual(s("Building 14575 Garfield Road, Clinton Township, MI 48038", "Building 1"), null, "\"Building 1\" is not a prefix of \"Building 14575\"");
  assert.strictEqual(s("204 St. Clair Hall, Bowling Green, OH 43403"), null, "a room in St. Clair Hall is not a street");
  assert.strictEqual(s("14500 E. 12 Mile Road, Warren, MI 48088"), "14500 E. 12 Mile Road");
  assert.strictEqual(s("600 Woodward Ave N, Detroit, MI 48226"), "600 Woodward Ave N");
  for (const address of ["University Center, UC", "Online, NA", "Room 204, TB"]) {
    assert.deepStrictEqual([where({ location_name: "X", address, geo: {} }).orbit], ["unknown"], `${address}: any two letters are not a state`);
  }
  // A bad geocode is not evidence of anything; the address still stands.
  for (const geo of [{ latitude: 0, longitude: 0 }, { latitude: "42.62191", longitude: "82.956398" }, { latitude: "-82.956398", longitude: "42.62191" }, { latitude: "999", longitude: "-83" }, { latitude: "", longitude: "n/a" }]) {
    const r = where({ ...PLACES.CENTER_CAMPUS, geo });
    assert.deepStrictEqual([r.orbit, r.milesFromDetroit, r.city], ["in", null, "Clinton Township"], JSON.stringify(geo));
  }
  for (const bad of [null, undefined, "x", 7, { geo: null }, { address: 12 }]) {
    const r = where(bad);
    assert.deepStrictEqual([r.name, r.street, r.city, r.orbit], [null, null, null, "unknown"]);
  }
}
console.log("PASS: the place — coordinates first, then a listed city the source wrote down; a room on an unnamed campus is not placed; nothing is invented");

// --- 5. Which events are written at all. ---
{
  const base = (over) => ({ ...event("Fall Choral Concert", { instances: [instance("2026-10-20", "19:30")], ...PLACES.MACOMB_CENTER, ...over }) });
  const verdict = (over, tenant = TENANT) => L.eventEligibility(base(over), tenant);
  assert.deepStrictEqual([verdict({}).eligible, verdict({}).reason], [true, null]);
  assert.strictEqual(verdict({}).place.city, "Clinton Township");

  assert.strictEqual(verdict({ audiences: ["Students"] }).reason, "not_public_audience");
  assert.strictEqual(verdict({ audiences: ["Employees", "Faculty", "Staff", "Students"] }).reason, "not_public_audience");
  assert.strictEqual(verdict({ audiences: [] }).reason, "not_public_audience", "no audience stated is not a statement that it is public");
  assert.strictEqual(verdict({ audiences: ["Alumni", "general public "] }).eligible, true, "the name is matched without regard to case or spacing");
  assert.strictEqual(verdict({ experience: "virtual", location_name: "", address: "", geo: {} }).reason, "virtual");
  assert.strictEqual(verdict({ experience: "hybrid" }).eligible, true, "in person as well as online: it has a place");
  assert.strictEqual(verdict({ status: "canceled" }).reason, "canceled");
  assert.strictEqual(verdict({ status: "postponed" }).reason, "canceled");
  assert.strictEqual(L.eventEligibility({ ...base({}), title: "CANCELED: Fall Choral Concert" }, TENANT).reason, "canceled");
  assert.strictEqual(L.eventEligibility({ ...base({}), title: "Postponed - Fall Choral Concert" }, TENANT).reason, "canceled");
  assert.strictEqual(L.eventEligibility({ ...base({}), title: "Cancel Culture: A Panel Discussion" }, TENANT).eligible, true);
  // ...and at the tail of the title, set off from it.
  for (const title of ["Fall Choral Concert - CANCELED", "Fall Choral Concert (Cancelled)", "Fall Choral Concert – POSTPONED", "Fall Choral Concert: Canceled!", "Fall Choral Concert [postponed]"]) {
    assert.strictEqual(L.eventEligibility({ ...base({}), title }, TENANT).reason, "canceled", title);
  }
  for (const title of ["How to Get a Cancelled Flight Refunded", "The Postponed Wedding: A Comedy", "Why Was My Show Cancelled", "Uncancelled", "Flight Cancelled"]) {
    assert.strictEqual(L.eventEligibility({ ...base({}), title }, TENANT).eligible, true, title);
  }
  assert.strictEqual(verdict({ status: "soldout" }).eligible, true, "sold out is still an event");
  assert.strictEqual(L.eventEligibility({ ...base({}), title: "Board of Trustees Meeting" }, TENANT).eligible, true, "a public body's meeting, listed for the public, is written (pending review): whether it belongs on the site is not a filter's call");
  assert.strictEqual(L.eventEligibility({ ...base({}), title: "College Offices Closed" }, TENANT).reason, "non_event");
  assert.strictEqual(verdict(PLACES.SANTA_MONICA).reason, "outside_orbit");
  assert.strictEqual(verdict({ ...PLACES.AWAY_KALAMAZOO, address: "", geo: {} }).reason, "city_not_listed");
  assert.strictEqual(verdict({ ...PLACES.ROOM_ONLY, address: "", geo: {} }).reason, "no_place");
  assert.strictEqual(L.eventEligibility({ ...base({}), title: "  " }, TENANT).reason, "unusable");
  assert.strictEqual(L.eventEligibility(null, TENANT).reason, "unusable");

  // The first reason that applies is the one counted.
  assert.strictEqual(verdict({ audiences: ["Students"], experience: "virtual", status: "canceled" }).reason, "canceled");
  assert.strictEqual(verdict({ audiences: ["Students"], experience: "virtual" }).reason, "not_public_audience");
  for (const reason of ["canceled", "not_public_audience", "virtual", "non_event", "outside_orbit", "city_not_listed", "no_place", "unusable"]) {
    assert.ok(L.SKIP_REASONS.includes(reason), reason);
  }
  // A tenant with no audience taxonomy configured is not gated on one.
  assert.strictEqual(verdict({ audiences: [] }, { ...TENANT, publicAudiences: null }).eligible, true);
}
console.log("PASS: eligibility — listed for the general public by the source, in person, not cancelled, not an administrative entry, and placed inside the Orbit");

// --- 6. The rows of one event. ---
{
  const windowStart = "2026-10-05";
  const windowEnd = "2027-01-03";
  const rowsOf = (e, instances = e._schedule) => {
    const verdict = L.eventEligibility(e, TENANT);
    assert.ok(verdict.eligible, verdict.reason);
    return L.rowsForEvent({ event: e, instanceWrappers: wrap(instances), place: verdict.place, tenant: TENANT, windowStart, windowEnd, categoryFromText });
  };

  const concert = event("The Lovin' Spoonful", { instances: [instance("2026-11-07", "19:30", "21:30")], types: ["Concerts & Performances"], ticket_url: "https://tickets.example.com/spoonful", free: false, ...PLACES.MACOMB_CENTER });
  const [row, ...none] = rowsOf(concert);
  assert.strictEqual(none.length, 0);
  assert.deepStrictEqual(
    { ...row, image_url: "x", event_url: "x" },
    {
      external_id: `localist-macomb-${concert._schedule[0].id}`,
      title: "The Lovin' Spoonful",
      description: "The Lovin' Spoonful. Open to all.",
      category: "music",
      start_date: "2026-11-07",
      end_date: null,
      time_display: "7:30 PM – 9:30 PM",
      is_recurring: false,
      is_all_day: false,
      is_free: false,
      price_from: null,
      ticket_url: "https://tickets.example.com/spoonful",
      event_url: "x",
      image_url: "x",
      source: "Macomb Community College",
      internal_note: null,
      _rawVenueName: "Macomb Center for the Performing Arts",
      venue_address_raw: "44575 Garfield Road",
      venue_city_raw: "Clinton Township",
      _defaultStatusForRow: "pending_review",
      _runDays: 1,
      _categoryConfident: true,
    }
  );
  assert.strictEqual(row.event_url, concert.localist_url);
  assert.strictEqual(row.image_url, concert.photo_url);
  assert.ok("end_date" in row, "end_date is always sent, so a row that stops being a run loses its end date");

  // The source's own flags and blanks.
  assert.strictEqual(rowsOf(event("Open Mic", { instances: [instance("2026-11-07", "19:30")], free: true, ticket_url: "", photo_url: "", description_text: "  ", ...PLACES.CENTER_CAMPUS }))[0].is_free, true);
  const bare = rowsOf(event("Open Mic", { instances: [instance("2026-11-07", "19:30")], ticket_url: "", photo_url: "", description_text: "  ", ...PLACES.CENTER_CAMPUS }))[0];
  assert.deepStrictEqual([bare.ticket_url, bare.image_url, bare.description, bare.is_free], [null, null, null, false]);

  // Category: a sports type; then the title's own words; then a broad type; then the catch-all with a note.
  const cat = (title, types) => rowsOf(event(title, { instances: [instance("2026-11-07", "19:30")], types, ...PLACES.CENTER_CAMPUS }))[0];
  assert.strictEqual(cat("Women's Basketball (Home) Game", ["Sporting Events"]).category, "sports");
  assert.strictEqual(cat("BGSU Hockey vs Michigan", ["Sporting Events", "BGSU Athletics"]).category, "sports");
  assert.strictEqual(cat("The Nutcracker", ["Concerts & Performances"]).category, "dance", "the title is read before a broad type");
  assert.strictEqual(cat("Made in Ohio Art Exhibit", ["Performances and Exhibits"]).category, "visual");
  assert.strictEqual(cat("Resume Clinic", ["Seminars & Workshops"]).category, "training");
  const unknown = cat("Public Stargazing", ["Performances and Exhibits"]);
  assert.strictEqual(unknown.category, "community");
  assert.ok(/not mappable/.test(unknown.internal_note));
  assert.strictEqual(L.mapCategory(["Student Organizations"]), null);
  assert.strictEqual(L.mapCategory(["Sporting Events"]), "sports");
  assert.strictEqual(L.mapCategory(null), null);

  // A run: one row, named after the run's first instance.
  const driveDays = daily("2026-10-03", 18, "08:00");
  const drive = event("Baby Item Donation", { instances: driveDays, ...PLACES.CENTER_CAMPUS });
  const driveRows = rowsOf(drive);
  assert.strictEqual(driveRows.length, 1);
  assert.deepStrictEqual(
    [driveRows[0].external_id, driveRows[0].start_date, driveRows[0].end_date, driveRows[0].time_display, driveRows[0].is_recurring, driveRows[0]._runDays],
    [`localist-macomb-${driveDays[0].id}`, "2026-10-03", "2026-10-20", "8:00 AM", false, 18],
    "it began before the window and is still running: written, with its real start"
  );
  // Over and done before the window: nothing.
  assert.strictEqual(rowsOf(event("Summer Drive", { instances: daily("2026-09-01", 10, "08:00"), ...PLACES.CENTER_CAMPUS })).length, 0);
  // A series: one row per occurrence still to come, each marked recurring.
  const games = [instance("2026-09-22", "18:00", "20:00"), instance("2026-10-13", "18:00", "20:00"), instance("2026-11-03", "17:30", "19:30"), instance("2027-02-23", "18:00", "20:00")];
  const season = rowsOf(event("Women's Basketball (Home) Game", { instances: games, types: ["Sporting Events"], ...PLACES.SOUTH_CAMPUS_J }));
  assert.deepStrictEqual(season.map((r) => r.start_date), ["2026-10-13", "2026-11-03"], "not the game already played, not the one beyond the 90 days");
  assert.deepStrictEqual(season.map((r) => r.external_id), [`localist-macomb-${games[1].id}`, `localist-macomb-${games[2].id}`]);
  assert.ok(season.every((r) => r.is_recurring === true && r.end_date === null));
  // A run that outlasts the window keeps its real end when the whole schedule is known.
  const longShow = event("Winter Exhibition", { instances: daily("2026-12-20", 60, null), ...PLACES.CENTER_CAMPUS });
  assert.deepStrictEqual([rowsOf(longShow)[0].start_date, rowsOf(longShow)[0].end_date, rowsOf(longShow)[0].is_all_day, rowsOf(longShow)[0].time_display], ["2026-12-20", "2027-02-17", true, null]);
  // A run that has not begun by the end of the window is not written yet.
  assert.strictEqual(rowsOf(event("Spring Show", { instances: daily("2027-01-10", 5, null), ...PLACES.CENTER_CAMPUS })).length, 0);
}
console.log("PASS: rows — the source's own fields; a run is one row named after its first day; a series is one row per occurrence still to come");

// --- 7. THE NAME OF A ROW DOES NOT CHANGE FROM DAY TO DAY. ---
// The connector is run on 30 consecutive days against the same events. A
// row's external_id is how the next run finds it; if it changed, the event
// would be written again under a new name every day.
{
  const driveA = event("Baby Item Donation", { instances: daily("2026-10-03", 18, "08:00"), ...PLACES.CENTER_CAMPUS });
  const driveB = event("Baby Item Donation", { instances: daily("2026-10-03", 18, "08:00"), ...PLACES.SOUTH_CAMPUS_J });
  const exhibit = event("Made in Ohio Art Exhibit", { instances: [...daily("2026-09-01", 44, null), ...daily("2026-10-16", 20, null)], ...PLACES.CENTER_CAMPUS });
  const lunches = event("Lunch at the Monarque", { instances: [0, 7, 14, 21, 28].map((d) => instance(isoPlusDays("2026-10-08", d), "11:30", "13:00")), ...PLACES.CENTER_CAMPUS });
  const expo = event("Metro Detroit Women's Expo", { instances: [instance("2026-10-03", "10:00", "18:00"), instance("2026-10-04", "11:00", "16:00")], ...PLACES.SOUTH_CAMPUS_J });
  const later = event("Holiday Market", { instances: daily("2026-10-24", 4, "10:00", "16:00"), ...PLACES.CENTER_CAMPUS });
  const all = [driveA, driveB, exhibit, lunches, expo, later];
  const api = makeLocalistApi({ base: "https://events.macomb.edu", events: all, today: "2026-10-01" });

  async function runOn(day, { withSchedules = true } = {}) {
    api.state.today = day;
    const listing = [];
    for (let page = 1; ; page++) {
      const data = await api.handle(`https://events.macomb.edu/api/2/events?days=90&pp=100&page=${page}`).json();
      listing.push(...data.events.map((w) => w.event));
      if (page >= data.page.total) break;
    }
    const funnel = L.newFunnel(TENANT);
    const eligible = L.selectEligible(listing, TENANT, funnel);
    const schedules = new Map();
    if (withSchedules) {
      for (const g of eligible.filter((x) => L.needsFullSchedule(x.instanceWrappers, day, isoPlusDays(day, 90)))) {
        const data = await api.handle(`https://events.macomb.edu/api/2/events/${g.event.id}`).json();
        schedules.set(String(g.event.id), { instanceWrappers: data.event.event_instances });
      }
    }
    const { rows, errors } = L.buildTenantRows(eligible, schedules, { tenant: TENANT, windowStart: day, windowEnd: isoPlusDays(day, 90), categoryFromText }, funnel);
    assert.deepStrictEqual(errors, []);
    return { rows, funnel, schedules };
  }

  const seen = new Map(); // external_id -> the row as first written
  const idsByEvent = new Map();
  let schedulesAsked = 0;
  (async () => {
    for (let d = 0; d < 30; d++) {
      const day = isoPlusDays("2026-10-01", d);
      const { rows, schedules } = await runOn(day);
      schedulesAsked += schedules.size;
      assert.strictEqual(new Set(rows.map((r) => r.external_id)).size, rows.length, `${day}: no name twice in one run`);
      for (const row of rows) {
        const key = `${row.title}|${row._rawVenueName}`;
        if (!idsByEvent.has(key)) idsByEvent.set(key, new Set());
        idsByEvent.get(key).add(row.external_id);
        const before = seen.get(row.external_id);
        if (before) {
          assert.strictEqual(row.start_date, before.start_date, `${day}: ${row.title} (${row.external_id}) kept its name and changed its start date`);
          assert.strictEqual(row.end_date, before.end_date, `${day}: ${row.title} kept its name and changed its end date`);
        } else {
          seen.set(row.external_id, row);
        }
      }
    }
    // Each drive is ONE row for its whole 18 days, however many days into it the connector runs.
    assert.deepStrictEqual([...idsByEvent.get("Baby Item Donation|Center Campus, C Building")], [`localist-macomb-${driveA._schedule[0].id}`]);
    assert.deepStrictEqual([...idsByEvent.get("Baby Item Donation|South Campus, J Building")], [`localist-macomb-${driveB._schedule[0].id}`]);
    assert.notStrictEqual(driveA._schedule[0].id, driveB._schedule[0].id, "two drop-off points are two events and stay two rows");
    // The exhibition: two rows in all (two runs), the first named after 1 September.
    assert.deepStrictEqual([...idsByEvent.get("Made in Ohio Art Exhibit|Center Campus, C Building")].sort(), [`localist-macomb-${exhibit._schedule[0].id}`, `localist-macomb-${exhibit._schedule[44].id}`].sort());
    assert.strictEqual(seen.get(`localist-macomb-${exhibit._schedule[0].id}`).start_date, "2026-09-01", "its real first day, a month before the connector first saw it");
    assert.strictEqual(seen.get(`localist-macomb-${exhibit._schedule[0].id}`).end_date, "2026-10-14");
    // The lunches: one name per lunch, five in all.
    assert.strictEqual(idsByEvent.get("Lunch at the Monarque|Center Campus, C Building").size, 5);
    // The two-day expo: two names, never a third.
    assert.strictEqual(idsByEvent.get("Metro Detroit Women's Expo|South Campus, J Building").size, 2);
    // A run that starts later is named the same before it starts and while it runs.
    assert.deepStrictEqual([...idsByEvent.get("Holiday Market|Center Campus, C Building")], [`localist-macomb-${later._schedule[0].id}`]);
    // 30 runs, 6 events, 5 + 2 + 2x18 + 44... instances: 12 names in total, ever.
    assert.strictEqual(seen.size, 1 + 1 + 2 + 5 + 2 + 1);
    assert.ok(schedulesAsked > 0 && schedulesAsked <= 30 * all.length);

    // WHY the full schedule is read. Without it, on day five of a drive the
    // listing shows days five to eighteen and the run is named after day five.
    const { rows: blind } = await runOn("2026-10-07", { withSchedules: false });
    const blindDrive = blind.find((r) => r.title === "Baby Item Donation" && r._rawVenueName === "Center Campus, C Building");
    assert.strictEqual(blindDrive.external_id, `localist-macomb-${driveA._schedule[4].id}`, "this is the drift the full schedule exists to prevent");
    assert.notStrictEqual(blindDrive.external_id, `localist-macomb-${driveA._schedule[0].id}`);
    // ...and on its last day it would not look like a run at all.
    const { rows: lastDayBlind } = await runOn("2026-10-20", { withSchedules: false });
    assert.strictEqual(lastDayBlind.find((r) => r.title === "Baby Item Donation" && r._rawVenueName === "Center Campus, C Building").end_date, null);
    const { rows: lastDay } = await runOn("2026-10-20");
    const lastDayDrive = lastDay.find((r) => r.title === "Baby Item Donation" && r._rawVenueName === "Center Campus, C Building");
    assert.deepStrictEqual([lastDayDrive.external_id, lastDayDrive.start_date, lastDayDrive.end_date], [`localist-macomb-${driveA._schedule[0].id}`, "2026-10-03", "2026-10-20"]);

    // THE FAR EDGE. A ten-day run whose first days are just coming into the
    // 90 days: one row from the day its first day is visible, never a row
    // for day two on its own (independent review: without the full schedule
    // it was written as one day, then two, then a run -- three names).
    const winter = event("Winter Exhibition", { instances: daily("2027-01-10", 10, null), ...PLACES.CENTER_CAMPUS });
    api.state.events = [winter];
    const names = new Set();
    const spans = new Set();
    for (let d = 0; d < 12; d++) {
      const { rows } = await runOn(isoPlusDays("2026-10-08", d));
      for (const r of rows) { names.add(r.external_id); spans.add(`${r.start_date}..${r.end_date}`); }
    }
    assert.deepStrictEqual([...names], [`localist-macomb-${winter._schedule[0].id}`], "one name, from the first day it is visible");
    assert.deepStrictEqual([...spans], ["2027-01-10..2027-01-19"], "and its real last day from the start");
    const { rows: edgeBlind } = await runOn("2026-10-13", { withSchedules: false });
    assert.deepStrictEqual(edgeBlind.map((r) => r.end_date), [null, null], "without the full schedule: two single days, the second of which would be left behind");
    assert.strictEqual(L.needsFullSchedule(wrap([instance("2026-11-15", "19:00")]), "2026-10-08", "2027-01-06"), false, "an event in the middle of the window needs no second request");

    console.log("PASS: thirty consecutive daily runs — every row keeps one name and one pair of dates; a run under way, or just coming into the window, is named after its real first day");
    await section8();
  })().catch((err) => { console.error("FAIL:", (err && err.stack) || err); process.exit(1); });
}

// --- 8. The funnel is counted, event by event. ---
async function section8() {
  const TEN = { ...TENANT, tenantSlug: "bgsu", source: "Bowling Green State University" };
  const one = (date = "2026-10-20") => [instance(date, "19:00", "21:00")];
  const events = [
    event("Symphonic Band", { instances: one(), ...PLACES.FINE_ARTS }),
    event("Made in Ohio Art Exhibit", { instances: daily("2026-10-10", 30, null), ...PLACES.FINE_ARTS }),
    event("BGSU Hockey vs Michigan", { instances: one(), types: ["Sporting Events", "BGSU Athletics"], ...PLACES.HOME_STROH }),
    event("BGSU Men's Basketball at Oakland", { instances: one(), types: ["Sporting Events", "BGSU Athletics"], ...PLACES.AWAY_OAKLAND }),
    event("BGSU Football at Western Michigan", { instances: one(), types: ["Sporting Events", "BGSU Athletics"], ...PLACES.AWAY_KALAMAZOO }),
    event("BGSU Women's Soccer at Western Michigan", { instances: one("2026-10-25"), types: ["Sporting Events", "BGSU Athletics"], ...PLACES.AWAY_KALAMAZOO }),
    event("BGSU Football at Illinois", { instances: one(), types: ["Sporting Events", "BGSU Athletics"], ...PLACES.AWAY_CHAMPAIGN }),
    event("Alumni Night in Santa Monica", { instances: one(), audiences: ["Alumni", "General Public"], ...PLACES.SANTA_MONICA }),
    event("Purple Thursday", { instances: one(), ...PLACES.ROOM_ONLY }),
    event("Explore BGSU's Graduate Programs", { instances: one(), experience: "virtual" }),
    event("Mindful Moments", { instances: [instance("2026-10-12", "09:00", "09:15"), instance("2026-10-14", "09:00", "09:15")], audiences: ["Undergraduate Students", "Faculty & Staff"], ...PLACES.JEROME_LIBRARY }),
    event("University Offices Closed", { instances: one(), ...PLACES.JEROME_LIBRARY }),
    event("Fall Concert", { instances: one(), status: "canceled", ...PLACES.FINE_ARTS }),
  ];
  const api = makeLocalistApi({ base: "https://events.bgsu.edu", events, today: "2026-10-05" });
  const data = await api.handle("https://events.bgsu.edu/api/2/events?days=90&pp=100&page=1").json();
  const listing = data.events.map((w) => w.event);
  assert.strictEqual(listing.length, 12 + 30 + 2 - 1, "one entry per occurrence");
  assert.ok(listing.every((e) => e.event_instances.length === 1), "...each with exactly one instance, as the real API returns them");

  const funnel = L.newFunnel(TEN);
  const eligible = L.selectEligible(listing, TEN, funnel);
  const { rows } = L.buildTenantRows(eligible, new Map(), { tenant: TEN, windowStart: "2026-10-05", windowEnd: "2027-01-03", categoryFromText }, funnel);
  assert.deepStrictEqual(
    { ...funnel, windowStart: null, windowEnd: null },
    {
      tenant: "bgsu",
      pages: 0,
      occurrencesFetched: 43,
      eventsFetched: 13,
      eventsEligible: 4,
      skipped: { unusable: 0, canceled: 1, not_public_audience: 1, virtual: 1, non_event: 1, outside_orbit: 2, city_not_listed: 2, no_place: 1 },
      notInOrbitPlaces: { "Kalamazoo, MI": 2, "Champaign, IL": 1, "Santa Monica, CA": 1 },
      fullSchedulesFetched: 0,
      fullScheduleFailures: 0,
      rows: 4,
      multiDayRows: 1,
      occurrencesFoldedIntoRuns: 30,
      windowStart: null,
      windowEnd: null,
    }
  );
  assert.deepStrictEqual(rows.map((r) => r.title).sort(), ["BGSU Hockey vs Michigan", "BGSU Men's Basketball at Oakland", "Made in Ohio Art Exhibit", "Symphonic Band"]);
  const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
  assert.deepStrictEqual([byTitle["BGSU Hockey vs Michigan"]._rawVenueName, byTitle["BGSU Hockey vs Michigan"].venue_city_raw, byTitle["BGSU Hockey vs Michigan"].category], ["Stroh Center", "Bowling Green", "sports"]);
  assert.deepStrictEqual([byTitle["BGSU Men's Basketball at Oakland"]._rawVenueName, byTitle["BGSU Men's Basketball at Oakland"].venue_city_raw], ["Rochester, Mich.", "Rochester"]);
  assert.deepStrictEqual([byTitle["Made in Ohio Art Exhibit"].start_date, byTitle["Made in Ohio Art Exhibit"].end_date], ["2026-10-10", "2026-11-08"]);

  // A full schedule that could not be read: the event is left out and said so.
  const funnel2 = L.newFunnel(TEN);
  const eligible2 = L.selectEligible(listing, TEN, funnel2);
  const band = eligible2.find((g) => g.event.title === "Symphonic Band");
  const failed = L.buildTenantRows(eligible2, new Map([[String(band.event.id), { error: "Fetch failed: HTTP 500" }]]), { tenant: TEN, windowStart: "2026-10-05", windowEnd: "2027-01-03", categoryFromText }, funnel2);
  assert.strictEqual(failed.rows.length, 3);
  assert.ok(!failed.rows.some((r) => r.title === "Symphonic Band"));
  assert.deepStrictEqual(failed.errors, [`event ${band.event.id}: full schedule: Fetch failed: HTTP 500`]);
  assert.strictEqual(funnel2.fullScheduleFailures, 1);

  console.log("PASS: the funnel — every event fetched is either a row or counted under the one reason it was left out");
  console.log("\nAll localist-rows.test.js checks passed.");
}
