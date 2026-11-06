"use strict";
// safeDirections / directionsForEvent (calendar-location.js): a "Get directions" link only for a complete address.
const assert = require("assert"), fs = require("fs"), path = require("path");
const { CalendarLocation: C } = require("../calendar-location.js");
let n = 0; const ok = (m) => { n++; console.log("ok - " + m); };
const sd = (a) => C.safeDirections(a);
const notReady = (a, reason, msg) => { const r = sd(a); assert.strictEqual(r.ready, false, msg + " must not be ready"); assert.strictEqual(r.query, ""); if (reason) assert.strictEqual(r.reason, reason, msg); };

// valid US
let r = sd({ address: "2211 Woodward Ave", city: "Detroit", state: "MI", zip: "48201" });
assert(r.ready && r.query === "2211 Woodward Ave, Detroit, MI 48201, USA");
r = sd({ address: "215 W 9 Mile Rd", city: "Ferndale" });
assert(r.ready && r.query === "215 W 9 Mile Rd, Ferndale", "no state known: none invented");
r = sd({ address: "100 5th St", city: "Detroit" }); assert(r.ready, "numbered street name");
r = sd({ address: "37000 Woodward Ave, Ste 100 Bloomfield Hills, MI 48304" }); assert(r.ready, "city inside the address with state+ZIP");
r = sd({ address: "29200 Dequindre Rd, Suite 2B", city: "Warren, MI 48092" }); assert(r.ready && /Warren, MI 48092/.test(r.query), "city column carrying state+ZIP");
ok("valid US addresses are ready; no state is invented");

// valid CA with postal; a US Windsor never resolves to Ontario
r = sd({ address: "1 Riverside Dr W, Windsor, ON N9A 5K3" });
assert(r.ready && r.query === "1 Riverside Dr W, Windsor, ON N9A 5K3, Canada");
r = sd({ address: "500 Main St", city: "Windsor", state: "CT", zip: "06095" });
assert(r.ready && /Windsor, CT 06095, USA$/.test(r.query) && !/ON|Canada|Ontario/.test(r.query));
r = sd({ address: "500 Ouellette Ave", city: "Windsor" });
assert(r.ready && r.query === "500 Ouellette Ave, Windsor", "bare Windsor stays bare, neither country is guessed");
ok("valid CA with postal code; US Windsor is not sent to Ontario");

notReady({ address: "123", city: "Detroit" }, "number_only", "number only");
notReady({ address: "482" }, "number_only", "482 ZIP-like fragment");
notReady({ address: "123 St", city: "Detroit" }, "number_only", "house number without street name");
ok("number-only and truncated ZIP are not ready");
notReady({ address: "Woodward Ave", city: "Detroit" }, "street_only", "street only");
notReady({ address: "Main St,", city: "Detroit" }, "street_only", "street only, trailing comma");
ok("street-only (and trailing comma) is not ready");
notReady({ address: "MI" }, "region_only", "region only"); notReady({ address: "Michigan", city: "Detroit" }, "region_only", "Michigan");
notReady({ address: "Ontario" }, "region_only", "Ontario"); notReady({ address: "123 Main St", city: "ON" }, "region_only", 'venue city "ON"');
ok("region-only is not ready, including a venue whose city is ON");
notReady({ address: "", city: "Detroit" }, "city_only", "bare city"); notReady({ address: "", city: "" }, "empty", "empty");
notReady({ address: "123 Main St", city: "Bloomfield H" }, "truncated_city", "truncated city");
notReady({ address: "123 Main St", city: "" }, "city_missing", "no city");
ok("bare city, empty, truncated city and missing city are not ready");
for (const nm of ["TBA", "Venue TBA", "Various Locations", "TBA - Detroit MI USA"]) notReady({ name: nm, address: "123 Main St", city: "Detroit" }, "placeholder", nm);
notReady({ name: "Secret", address: "123 Main St", city: "Detroit" }, "secrecy", "Secret");
notReady({ address: "Various Locations" }, "placeholder", "placeholder address");
ok("placeholder names and addresses are not ready");

// trailing comma on an otherwise complete address is tolerated and cleaned
r = sd({ address: "123 Main St,", city: "Detroit," }); assert(r.ready && r.query === "123 Main St, Detroit");
ok("trailing commas are trimmed, not trusted blindly");

// entrance-labelled park: explicit data only
r = sd({ address: "Belle Isle", city: "Detroit", entrance: "Belle Isle Nature Center, 176 Lakeside Dr" });
assert(r.ready && r.label === "Belle Isle Nature Center, 176 Lakeside Dr" && r.query === "Belle Isle Nature Center, 176 Lakeside Dr, Detroit");
notReady({ address: "Belle Isle", city: "Detroit" }, null, "the same park without an entrance");
notReady({ address: "", city: "Detroit", entrance: "TBA" }, "city_only", "placeholder entrance is ignored");
ok("a data-supplied entrance makes Directions ready with its label; none is invented");

// event page: conflict between event-level and venue-level addresses
const base = { venue: "Fox Theatre", locEventAddress: "2211 Woodward Ave", locEventCity: "Detroit", locVenueAddress: "2211 Woodward Ave", locVenueCity: "Detroit" };
assert.strictEqual(C.directionsForEvent(base).ready, true);
const conflict = Object.assign({}, base, { locVenueAddress: "100 Other St", locVenueCity: "Detroit" });
r = C.directionsForEvent(conflict); assert(!r.ready && r.reason === "conflict");
assert.strictEqual(C.directionsForEvent({ venue: "Venue TBA", locEventAddress: "6221 Merriman Road", locEventCity: "Garden City" }).reason, "placeholder");
// Jody 15:14Z: a placeholder NAME alone does not suppress a complete public address, but only with an explicit data flag
{
  const tba = { venue: "TBA - Detroit MI USA", locEventAddress: "1151 Taylor St", locEventCity: "Detroit" };
  const a = C.directionsForEvent(Object.assign({}, tba, { addressVerified: true }));            // (a) verified => ready with the street query
  assert(a.ready && a.query === "1151 Taylor St, Detroit");
  const b = C.directionsForEvent(tba);                                                            // (b) no flag => not ready (location pending)
  assert(!b.ready && b.reason === "placeholder");
  const c1 = C.directionsForEvent(Object.assign({}, tba, { addressVerified: true, venue: "TBA - Secret Location" }));          // (c) secrecy in the name
  const c2 = C.directionsForEvent(Object.assign({}, tba, { addressVerified: true, description: "Location shared after RSVP." })); // (c) secrecy in the description
  const c3 = C.directionsForEvent(Object.assign({}, tba, { addressVerified: true, description: "RSVP for address." }));
  assert(!c1.ready && c1.reason === "secrecy" && !c2.ready && c2.reason === "secrecy" && !c3.ready && c3.reason === "secrecy");
  const d = C.directionsForEvent({ venue: "Venue TBA", addressVerified: true, locEventAddress: "6221 Merriman Road", locEventCity: "Garden City", locVenueAddress: "9 Elsewhere Ave", locVenueCity: "Garden City" });
  assert(!d.ready && d.reason === "conflict", "(d) event/venue conflict is still not ready even when verified");
  assert(C.directionsForEvent({ venue: "Venue TBA", addressVerified: true, locEventAddress: "6221 Merriman Road", locEventCity: "Garden City" }).ready);
  assert(!C.directionsForEvent(Object.assign({}, tba, { addressVerified: "yes" })).ready, "only boolean true counts");
  assert(!C.safeDirections({ name: "Venue TBA", addressVerified: true, address: "Woodward Ave", city: "Detroit" }).ready, "verified flag never rescues a partial address");
  assert(C.directionsForEvent({ venue: "Fox Theatre", description: "Doors at 7. Private parties welcome at the lounge.", locEventAddress: "2211 Woodward Ave", locEventCity: "Detroit" }).ready, "ordinary 'private parties' text is not a secrecy marker");
}
assert.strictEqual(C.directionsForEvent({ venue: "Some Hall", locEventAddress: "Woodward", locEventCity: "Detroit" }).ready, false);
ok("event page: complete ready, event/venue conflict not ready, TBA venue not ready, partial not ready");

// pages are wired to the guard; the venue page loads the resolver and no longer links any non-empty address
const ev = fs.readFileSync(path.join(__dirname, "..", "event-template.html"), "utf8");
const vn = fs.readFileSync(path.join(__dirname, "..", "venue-template.html"), "utf8");
assert(/CalendarLocation\.directionsForEvent\(e\)/.test(ev) && /encodeURIComponent\(dir\.query\)/.test(ev));
assert(!/encodeURIComponent\(streetLine\.text\)/.test(ev), "event page no longer links the raw street line");
assert(/<script src="\/calendar-location\.js"><\/script>/.test(vn), "venue page loads the resolver");
assert(/CalendarLocation\.safeDirections\(/.test(vn) && /encodeURIComponent\(dir\.query\)/.test(vn));
assert(!/encodeURIComponent\(fullAddr\)/.test(vn), "venue page no longer links any non-empty address");
ok("event and venue pages use the guard; venue page loads calendar-location.js");
console.log(n + " checks passed");
