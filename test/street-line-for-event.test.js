#!/usr/bin/env node
// test/street-line-for-event.test.js -- CalendarLocation.streetLineForEvent (shared location
// resolution, PR A). The event page's street line comes from the SAME module as Add to Calendar:
// event-specific address first, canonical venue as fallback, nothing invented, never "TBA".
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { CalendarLocation: CL } = require(`${REPO_DIR}/calendar-location.js`);
const line = (e) => CL.streetLineForEvent(e);
const text = (e) => line(e).text;

// 1. event-specific address
assert.deepStrictEqual(line({ venue: "The Gallery at Ideation Orange", locEventAddress: "420 W. 9 Mile Rd", locEventCity: "Hazel Park" }),
  { text: "420 W 9 Mile Rd, Hazel Park", source: "event", conflict: "" });
// event address wins over a venue address that is the same street spelled differently; ZIP borrowed only for same street
assert.strictEqual(text({ locEventAddress: "100 Strand Dr", locEventCity: "Detroit", locVenueAddress: "100 Strand on Belle Isle", locVenueCity: "Detroit" }), "100 Strand Dr, Detroit");
assert.strictEqual(text({ locEventAddress: "318 W 4th St", locEventCity: "Royal Oak", locVenueAddress: "318 W 4th St.", locVenueCity: "Royal Oak", locVenueZip: "48067" }), "318 W 4th St, Royal Oak 48067");

// 2. canonical venue fallback (event has no address)
assert.deepStrictEqual(line({ venue: "Little Caesars Arena", locVenueAddress: "2645 Woodward Avenue", locVenueCity: "Detroit", locVenueZip: "48201" }),
  { text: "2645 Woodward Avenue, Detroit 48201", source: "venue", conflict: "" });

// 3. incomplete event address never replaces a complete venue address
assert.strictEqual(text({ locEventAddress: "Woodward Ave", locEventCity: "Detroit", locVenueAddress: "2211 Woodward Ave", locVenueCity: "Detroit", locVenueZip: "48201" }), "2211 Woodward Ave, Detroit 48201");
// ...and without any venue address nothing is shown (no house number = no street line)
assert.strictEqual(text({ locEventAddress: "Belle Isle", locEventCity: "Detroit" }), "");

// 4. no address available -> empty; never TBA; nothing invented
for (const e of [{}, { venue: "Somewhere" }, { venue: "Venue TBA" }, { venue: "TBA", locEventAddress: "TBA", locEventCity: "TBA" }, { locEventCity: "Detroit" }]) {
  assert.strictEqual(text(e), "", JSON.stringify(e));
  assert.ok(!/tba/i.test(text(e)));
}
// no state, ZIP or city is invented
assert.strictEqual(text({ locEventAddress: "420 W. 9 Mile Rd", locEventCity: "Hazel Park" }), "420 W 9 Mile Rd, Hazel Park");
assert.strictEqual(text({ locVenueAddress: "1501 Holden", locVenueCity: "Detroit", locVenueZip: "48208" }), "1501 Holden, Detroit 48208");
assert.ok(!/\bMI\b|Michigan/.test(text({ locVenueAddress: "1501 Holden", locVenueCity: "Detroit" })));

// 5. different event/venue streets: no street line, flagged; same street different spelling: fine; city contradiction: flagged
assert.deepStrictEqual(line({ venue: "The Gallery", locEventAddress: "1 Pop Up Way", locEventCity: "Hazel Park", locVenueAddress: "420 W 9 Mile Rd", locVenueCity: "Hazel Park" }),
  { text: "", source: "none", conflict: "street" });
assert.deepStrictEqual(line({ venue: "The High Dive", locEventAddress: "11474 Joseph Campau Ave", locEventCity: "Hamtramck", locVenueAddress: "11474 Joseph Campau", locVenueCity: "Detroit" }),
  { text: "", source: "none", conflict: "city" });

// 6. semicolon-formatted addresses
assert.strictEqual(text({ locEventAddress: "15 South Saginaw Street; Pontiac; MI 48342", locEventCity: "Pontiac" }), "15 South Saginaw Street, Pontiac, MI 48342");
assert.strictEqual(text({ locEventAddress: "660 W Baltimore Street;Detroit;Michigan 48202", locEventCity: "Detroit" }), "660 W Baltimore Street, Detroit, MI 48202");
assert.strictEqual(text({ locEventAddress: "1600 clay street; detroit; mi 48211", locEventCity: "Detroit" }).includes(";"), false);

// 7. embedded country strings
for (const a of ["1600 Clay Street, Detroit, MI 48211 United States", "1600 Clay Street, Detroit, MI 48211, USA", "1600 Clay Street, Detroit, MI 48211, United States"])
  assert.strictEqual(text({ locEventAddress: a, locEventCity: "Detroit" }), "1600 Clay Street, Detroit, MI 48211", a);

// 8. the six Batch 1 venues (canonical rows as repaired in production 2026-10-15)
const BATCH1 = [
  ["Little Caesars Arena", "2645 Woodward Avenue", "48201", "2645 Woodward Avenue, Detroit 48201"],
  ["Detroit Opera House", "1526 Broadway", "48226", "1526 Broadway, Detroit 48226"],
  ["Russell Industrial Center", "1600 Clay", "48211", "1600 Clay, Detroit 48211"],
  ["Sound Board", "2901 Grand River", "48201", "2901 Grand River, Detroit 48201"],
  ["El Club", "4114 W Vernor", "48209", "4114 W Vernor, Detroit 48209"],
  ["Marble Bar", "1501 Holden", "48208", "1501 Holden, Detroit 48208"],
];
for (const [venue, addr, zip, want] of BATCH1) {
  assert.strictEqual(text({ venue, locVenueAddress: addr, locVenueCity: "Detroit", locVenueZip: zip }), want, venue);
  // an event at the venue carrying its own, same-street address keeps the event's wording
  assert.strictEqual(line({ venue, locEventAddress: addr, locEventCity: "Detroit", locVenueAddress: addr, locVenueCity: "Detroit", locVenueZip: zip }).source, "event", venue);
}

// 9. Add to Calendar output is unchanged. Golden values captured from origin/main's calendar-location.js
//    (302504f) for a corpus of events; resolve()'s only change is the additive `country` key.
const ev = (e) => Object.assign({ date: "2026-10-20", title: "T", time: "7:00 PM" }, e);
const GOLDEN = [
  [{ venue: "The Gallery at Ideation Orange", locEventAddress: "420 W. 9 Mile Rd", locEventCity: "Hazel Park" }, "LOCATION:The Gallery at Ideation Orange\\, 420 W 9 Mile Rd\\, Hazel Park", "The Gallery at Ideation Orange, 420 W 9 Mile Rd, Hazel Park"],
  [{ venue: "Little Caesars Arena", locVenueAddress: "2645 Woodward Avenue", locVenueCity: "Detroit", locVenueZip: "48201" }, "LOCATION:Little Caesars Arena\\, 2645 Woodward Avenue\\, Detroit 48201", "Little Caesars Arena, 2645 Woodward Avenue, Detroit 48201"],
  [{ venue: "Fox Theatre", locEventAddress: "2211 Woodward Ave, Detroit, MI 48201", locEventCity: "Detroit" }, "LOCATION:Fox Theatre\\, 2211 Woodward Ave\\, Detroit\\, MI 48201", "Fox Theatre, 2211 Woodward Ave, Detroit, MI 48201"],
  [{ venue: "X", locEventAddress: "Woodward Ave", locEventCity: "Detroit", locVenueAddress: "2211 Woodward Ave", locVenueCity: "Detroit", locVenueZip: "48201" }, "LOCATION:X\\, 2211 Woodward Ave\\, Detroit 48201", "X, 2211 Woodward Ave, Detroit 48201"],
  [{ venue: "Elektricity", locEventAddress: "15 South Saginaw Street\; Pontiac\; MI 48342", locEventCity: "Pontiac" }, "LOCATION:Elektricity\\, 15 South Saginaw Street\\; Pontiac\\; MI 48342\\, Pontiac", "Elektricity, 15 South Saginaw Street\; Pontiac\; MI 48342, Pontiac"],
  [{ venue: "R", locEventAddress: "1600 Clay Street, Detroit, MI 48211 United States", locEventCity: "Detroit" }, "LOCATION:R\\, 1600 Clay Street\\, Detroit\\, MI 48211 United States\\, Detroit", "R, 1600 Clay Street, Detroit, MI 48211 United States, Detroit"],
  [{ venue: "High Dive", locEventAddress: "11474 Joseph Campau Ave", locEventCity: "Hamtramck", locVenueAddress: "11474 Joseph Campau", locVenueCity: "Detroit" }, "LOCATION:High Dive\\, 11474 Joseph Campau Ave\\, Hamtramck", "High Dive, 11474 Joseph Campau Ave, Hamtramck"],
  [{ venue: "Venue TBA" }, "", ""],
  [{ venue: "Belle Isle", locEventAddress: "Belle Isle", locEventCity: "Detroit" }, "LOCATION:Belle Isle\\, Detroit", "Belle Isle, Detroit"],
  [{ venue: "Marble Bar", locVenueAddress: "1501 Holden", locVenueCity: "Detroit", locVenueZip: "48208" }, "LOCATION:Marble Bar\\, 1501 Holden\\, Detroit 48208", "Marble Bar, 1501 Holden, Detroit 48208"],
  [{ venue: "Sound Board", locVenueAddress: "2901 Grand River", locVenueCity: "Detroit", locVenueZip: "48201" }, "LOCATION:Sound Board\\, 2901 Grand River\\, Detroit 48201", "Sound Board, 2901 Grand River, Detroit 48201"],
];
for (const [e, ics, google] of GOLDEN) {
  const r = CL.resolveForEvent(ev(e));
  assert.strictEqual(CL.icsLocationLine(r), ics, e.venue);
  assert.strictEqual(CL.googleLocationParam(r), google, e.venue);
}

// 10. structure: the event page uses the shared function and defines no formatter of its own
const page = fs.readFileSync(`${REPO_DIR}/event-template.html`, "utf8");
assert.ok(/CalendarLocation\.streetLineForEvent\(e\)/.test(page), "event-template.html must use CalendarLocation.streetLineForEvent");
assert.ok(!/function\s+(?:formatAddress|streetLine|buildStreetLine)\b/.test(page), "event-template.html defines its own address formatter");
assert.ok(!/["'`]TBA["'`]\s*\+|textContent\s*=\s*[^;\n]*TBA/.test(page.split("evtAddress")[1] || ""), "the address line must never write TBA");

// 11. calendar.html (PR B): same shared function, extra columns selected, no private formatter
const cal = fs.readFileSync(`${REPO_DIR}/calendar.html`, "utf8");
assert.ok(cal.includes('<script src="/calendar-location.js"></script>'), "calendar.html must load calendar-location.js");
assert.ok(/venue_address_raw,venue_id,venues\(name,address,city,zip_code,lat,lng\)/.test(cal), "calendar.html must select venue_address_raw and venues.zip_code");
assert.ok(/CalendarLocation\.streetLineForEvent\(e\)/.test(cal), "calendar.html must use CalendarLocation.streetLineForEvent");
assert.ok(!/function\s+(?:formatAddress|streetLine|buildStreetLine)\b/.test(cal), "calendar.html defines its own address formatter");
assert.strictEqual((cal.match(/\$\{streetLineHtml\(e\)\}/g) || []).length, 2, "both venue-showing event rows render the street line");
{
  const vm = require("vm");
  const grab = (re) => { const m = re.exec(cal); assert.ok(m, String(re)); return m[0]; };
  const code = [
    grab(/function resolveVenueDisplay\(row\) \{[\s\S]*?\n\}\n/),
    grab(/function mapSupabaseRow\(row\) \{[\s\S]*?\n\}\n/),
    grab(/function streetLineHtml\(e\)\{[\s\S]*?\n\}\n/),
  ].join("\n");
  const ctx = { CalendarLocation: CL, EventDates: require(`${REPO_DIR}/event-dates.js`), decodeEntities: (x) => x, escapeHtml: (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;"), CATS: {}, console };
  vm.createContext(ctx);
  vm.runInContext(code + "\nthis.map = mapSupabaseRow; this.html = streetLineHtml;", ctx);
  const row = (o) => Object.assign({ id: "1", start_date: "2026-10-20", title: "T", category: "music" }, o);
  // canonical venue fallback
  assert.strictEqual(ctx.html(ctx.map(row({ venue_name_raw: "Sound Board", venue_id: "v", venues: { name: "Sound Board", address: "2901 Grand River", city: "Detroit", zip_code: "48201" } }))), '<div class="evt-street">2901 Grand River, Detroit 48201</div>');
  // event-specific address, semicolons tidied
  assert.strictEqual(ctx.html(ctx.map(row({ venue_name_raw: "Elektricity", venue_address_raw: "15 South Saginaw Street; Pontiac; MI 48342", venue_city_raw: "Pontiac" }))), '<div class="evt-street">15 South Saginaw Street, Pontiac, MI 48342</div>');
  // no address / TBA / conflict -> nothing
  assert.strictEqual(ctx.html(ctx.map(row({}))), "");
  assert.strictEqual(ctx.html(ctx.map(row({ venue_name_raw: "Venue TBA" }))), "");
  assert.strictEqual(ctx.html(ctx.map(row({ venue_address_raw: "11474 Joseph Campau Ave", venue_city_raw: "Hamtramck", venues: { name: "The High Dive", address: "11474 Joseph Campau", city: "Detroit" } }))), "");
}

// 12. PR C: map popups. A street is shown for a GROUP of events only when they agree.
{
  const S = (list) => CL.sharedStreetLine(list);
  const lca = { venue: "Little Caesars Arena", locVenueAddress: "2645 Woodward Avenue", locVenueCity: "Detroit", locVenueZip: "48201" };
  const lcaEv = { venue: "Little Caesars Arena", locEventAddress: "2645 Woodward Ave.", locEventCity: "Detroit", locVenueAddress: "2645 Woodward Avenue", locVenueCity: "Detroit", locVenueZip: "48201" };
  // same place, different wording -> one street (the most complete rendering)
  assert.deepStrictEqual(S([lcaEv, lca, lcaEv]), { text: "2645 Woodward Avenue, Detroit 48201", conflict: "" });
  // events without a usable street neither support nor contradict
  assert.strictEqual(S([lca, { venue: "Little Caesars Arena" }]).text, "2645 Woodward Avenue, Detroit 48201");
  // nobody has a street -> nothing
  assert.deepStrictEqual(S([{ venue: "X" }, {}]), { text: "", conflict: "" });
  assert.deepStrictEqual(S([]), { text: "", conflict: "" });
  // two different locations under one venue name -> nothing
  const other = { venue: "Eastern Market", locEventAddress: "2934 Russell Street", locEventCity: "Detroit" };
  const other2 = { venue: "Eastern Market", locEventAddress: "2810 Russell St", locEventCity: "Detroit" };
  assert.deepStrictEqual(S([other, other2]), { text: "", conflict: "group" });
  // same street number in two different cities -> nothing
  assert.deepStrictEqual(S([{ locEventAddress: "100 Main St", locEventCity: "Pontiac" }, { locEventAddress: "100 Main St", locEventCity: "Royal Oak" }]), { text: "", conflict: "group" });
  // any event/venue conflict in the group -> nothing, even if the others agree
  const highDive = { venue: "The High Dive", locEventAddress: "11474 Joseph Campau Ave", locEventCity: "Hamtramck", locVenueAddress: "11474 Joseph Campau", locVenueCity: "Detroit" };
  assert.deepStrictEqual(S([lca, lca, highDive]), { text: "", conflict: "event" });
  assert.deepStrictEqual(S([highDive, highDive]), { text: "", conflict: "event" });
  // streetLineForEvent keeps its three-key shape
  assert.deepStrictEqual(Object.keys(CL.streetLineForEvent(lca)).sort(), ["conflict", "source", "text"]);
}
{
  const vm = require("vm");
  const map = fs.readFileSync(`${REPO_DIR}/map.html`, "utf8");
  assert.ok(map.includes('<script src="/calendar-location.js"></script>'), "map.html must load calendar-location.js");
  assert.ok(/venue_address_raw,venue_id,venues\(name,address,city,zip_code,lat,lng\)/.test(map), "map.html must select venue_address_raw and venues.zip_code");
  assert.ok(!/function\s+(?:formatAddress|streetLine|buildStreetLine)\b/.test(map), "map.html defines its own address formatter");
  assert.ok(!/geocod|nominatim/i.test(map.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")), "map.html must not geocode");
  const grab = (re) => { const m = re.exec(map); assert.ok(m, String(re)); return m[0]; };
  const code = [grab(/function sharedPointMunicipality\(e\)\{[\s\S]*?\n\}\n/), grab(/function municipalityHtml\(e\)\{[\s\S]*?\n\}\n/), grab(/function eventWhereHtml\(e\)\{[\s\S]*?\n\}\n/), grab(/function placeStreetHtml\(place\)\{[\s\S]*?\n\}\n/), grab(/function placePopupHtml\(place\)\{[\s\S]*?\n\}\n/)].join("\n");
  const ctx = { CalendarLocation: CL, CityResolution: { resolve: () => null }, CITY_LOOKUP: new Map(), escapeHtml: (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;"), eventUrl: () => "", console };
  vm.createContext(ctx);
  vm.runInContext(code + "\nthis.popup = placePopupHtml;", ctx);
  const ev = (o) => Object.assign({ title: "T", date: "2026-10-20", time: "7 PM", venue: "Sound Board", locVenueAddress: "2901 Grand River", locVenueCity: "Detroit", locVenueZip: "48201" }, o);
  const place = (o) => Object.assign({ key: "v:sound board", label: "Sound Board", precise: true, events: [ev({}), ev({ title: "U" })] }, o);
  // precise place, events agree -> one street line under the name, popup otherwise unchanged
  const ok = ctx.popup(place());
  assert.ok(ok.includes('<div class="popup-street">2901 Grand River, Detroit 48201</div>'));
  assert.ok(ok.indexOf("popup-place-name") < ok.indexOf("popup-street") && ok.indexOf("popup-street") < ok.indexOf("popup-evt"));
  assert.ok(ok.includes("Full details for all 2"), "grouping link unchanged");
  // precise place whose events disagree -> no street line
  assert.ok(!ctx.popup(place({ events: [ev({}), ev({ locVenueAddress: "1 Other Way" })] })).includes("popup-street"));
  // precise place containing a conflicting event -> no street line
  assert.ok(!ctx.popup(place({ events: [ev({}), ev({ locEventAddress: "9 Elsewhere Rd", locEventCity: "Detroit" })] })).includes("popup-street"));
  // city-centroid (approximate) place never shows a street, even if every event has one
  const approx = ctx.popup(place({ precise: false, key: "c:detroit", label: "Detroit" }));
  assert.ok(!approx.includes("popup-street"), "no shared street group line on a city-centroid popup");
  // ...instead each event lists its own "venue · street" line, and the note says the marker is the city center
  assert.strictEqual((approx.match(/<div class="pe-where">/g) || []).length, 2);
  assert.ok(approx.includes('<div class="pe-where"><span class="pe-venue">Sound Board</span> · 2901 Grand River, Detroit 48201</div>'));
  assert.ok(approx.includes("Marker is the city center, not an event location. Addresses are listed under each event."));
  assert.ok(!approx.includes("Approximate — city center"));
  // mixed: rows with and without an address render cleanly, each its own address
  const mixed = ctx.popup(place({ precise: false, key: "c:warren", label: "Warren", events: [
    ev({ title: "A", venue: "Andiamo", locVenueAddress: "7096 E 14 Mile Rd", locVenueCity: "Warren", locVenueZip: "48092" }),
    ev({ title: "B", venue: "Other Hall", locVenueAddress: "1 Elsewhere Ave", locVenueCity: "Warren", locVenueZip: undefined }),
    ev({ title: "C", venue: "No Address Hall", locVenueAddress: undefined, locVenueCity: undefined, locVenueZip: undefined }),
    ev({ title: "D", venue: "Venue TBA", locVenueAddress: "5 Main St", locVenueCity: "Warren", locVenueZip: undefined }),
    ev({ title: "E", venue: "High Dive", locEventAddress: "11474 Joseph Campau Ave", locEventCity: "Hamtramck", locVenueAddress: "11474 Joseph Campau", locVenueCity: "Detroit" }),
  ] }));
  assert.strictEqual((mixed.match(/<div class="pe-where">/g) || []).length, 3, "A, B and D only");
  assert.ok(mixed.includes('<span class="pe-venue">Andiamo</span> · 7096 E 14 Mile Rd, Warren 48092'));
  assert.ok(mixed.includes('<div class="pe-where">5 Main St, Warren</div>'), "no venue name -> street alone");
  assert.ok(!/pe-venue">(No Address Hall|High Dive)/.test(mixed), "no address or conflict -> nothing rendered, not even the venue name");
  assert.ok(!/TBA|unknown\b/.test(mixed.replace("exact venue unknown", "")), "never TBA or unknown");
  // no address anywhere in a centroid popup -> today's wording, unchanged
  const none = ctx.popup(place({ precise: false, key: "c:x", label: "X", events: [{ title: "T", date: "2026-10-20", time: "", venue: "Y" }] }));
  assert.ok(none.includes("Approximate — city center, exact venue unknown") && !none.includes("pe-where"));
  // precise popups are unchanged: shared street line, no per-event lines, original note logic
  assert.ok(!ok.includes("pe-where") && !ok.includes("Marker is the city center"));
  // no street data -> popup identical to the old markup
  assert.ok(!ctx.popup(place({ events: [{ title: "T", date: "2026-10-20", time: "", venue: "X" }] })).includes("popup-street"));
}

console.log("street-line-for-event: all assertions passed");
