"use strict";
// Integration: safeDirections / directionsForEvent fed rows shaped exactly like the public event query returns
// (event-template.html init(): the `events` select with the venues(...) embed), passed through the page's OWN
// mapRow(), not hand-built event objects. Pure: no network, no private columns, no grants, no writes.
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const { CalendarLocation: C } = require("../calendar-location.js");
const EventDates = require("../event-dates.js");
const html = fs.readFileSync(path.join(__dirname, "..", "event-template.html"), "utf8");
let n = 0; const ok = (m) => { n++; console.log("ok - " + m); };

// 1) the public select, read from the page itself
const sel = /\/rest\/v1\/events\?id=eq\.[^`]*&select=([^`]+)`/.exec(html);
assert(sel, "event page select found");
const embed = /venues\(([^)]*)\)/.exec(sel[1]);
const venueCols = embed[1].split(",");
const eventCols = sel[1].replace(/venues\([^)]*\)/, "venues").split(",");
const PRIVATE = /^(?:internal_note|external_id|status|session_data|raw_payload|created_by|reviewed_by|reviewed_at|source_id|submitted_by|owner_.*|admin_.*|.*provenance.*|.*evidence.*|.*confidence.*)$/i;
assert(!eventCols.concat(venueCols).some((c) => PRIVATE.test(c)), "the public select exposes no private or provenance column");
ok("public select read from event-template.html: " + eventCols.length + " event columns + venues(" + venueCols.join(",") + "), none private");

// 2) the page's real helpers, extracted (not re-implemented)
function fnSource(name) {
  const start = html.indexOf("function " + name + "(");
  assert(start >= 0, name + " found in event-template.html");
  let i = html.indexOf("{", start), depth = 0;
  for (; i < html.length; i++) { if (html[i] === "{") depth++; else if (html[i] === "}" && --depth === 0) break; }
  return html.slice(start, i + 1);
}
const ctx = vm.createContext({ EventDates });
vm.runInContext(["decodeEntities", "resolveVenueDisplay", "mapRow"].map(fnSource).join("\n") + "\nthis.mapRow = mapRow;", ctx);
const mapRow = ctx.mapRow;

// 3) rows exactly in the public shape: only the selected columns, a venues embed object or null
function row(over) {
  const base = { id: "00000000-0000-4000-8000-000000000001", title: "Event", description: null, image_url: null, start_date: "2026-11-20", end_date: null,
    venue_name_raw: null, venue_address_raw: null, venue_city_raw: null, venue_id: null, venues: null, category: "music", time_display: "7 PM",
    is_free: false, source: "Test", ticket_url: null, event_url: null, price_from: null, ticket_status: null, is_clothing_optional: false, date_semantics: null, occurrence_dates: null };
  const r = Object.assign(base, over);
  for (const k of Object.keys(r)) assert(eventCols.includes(k), "fixture key " + k + " is a public column");
  if (r.venues) for (const k of Object.keys(r.venues)) assert(venueCols.includes(k), "fixture venues key " + k + " is a public embed column");
  return r;
}
const dirs = (r, records) => { const e = mapRow(r); if (records) e.addressVerified = C.addressVerifiedFor(e, records); return C.directionsForEvent(e); };
const GC = "ef9ed14a-5024-4f7d-a720-8529d1b8d939";
const rec = { eventId: GC, street: "6221 Merriman Road", city: "Garden City", verifiedAt: "2026-11-06", verifiedBy: "R&Q", source: "https://example.org/official" };

// complete event-level address, canonical venue unresolved (venues: null)
let r = dirs(row({ venue_name_raw: "Fox &amp; Hound", venue_address_raw: "6221 Merriman Road", venue_city_raw: "Garden City" }));
assert(r.ready && r.query === "6221 Merriman Road, Garden City", r.reason + " " + r.query);
// complete canonical venue embed, event-level raw empty
r = dirs(row({ venue_id: 7, venues: { name: "Fox Theatre", address: "2211 Woodward Ave", city: "Detroit", zip_code: "48201", lat: 42.3, lng: -83.05 } }));
assert(r.ready && /^2211 Woodward Ave, Detroit/.test(r.query), r.query);
ok("public-shaped rows: event-level address and venues embed are both ready; HTML entities decoded by the page's mapRow");

// the two placeholder-name rows
const merriman = row({ id: GC, venue_name_raw: "Venue TBA", venue_address_raw: "6221 Merriman Road", venue_city_raw: "Garden City", description: "Join us in Garden City." });
const taylor = row({ id: "db1dcdb1-875f-42f1-a2c3-255b4f88d22a", venue_name_raw: "TBA - Detroit MI USA", venue_address_raw: "1151 Taylor St", venue_city_raw: "Detroit, MI", source: "Resident Advisor" });
assert(!dirs(merriman).ready && dirs(merriman).reason === "placeholder", "placeholder name, no record => not ready");
assert(!dirs(taylor).ready, "Tec-Troit stays not ready without a record");
r = dirs(merriman, [rec]);
assert(r.ready && r.query === "6221 Merriman Road, Garden City", "Garden City with a reviewed record => ready");
assert(!dirs(taylor, [rec]).ready, "a record for another event never rescues this one");
assert(!dirs(row(Object.assign({}, merriman, { venue_address_raw: "6300 Merriman Rd" })), [rec]).ready, "address changed in the public row => record lapses");
ok("placeholder-name rows: not ready by default, ready only with a matching reviewed record, record lapses on change");

// secrecy in the public description beats a record
const secret = row(Object.assign({}, merriman, { description: "Address sent after RSVP." }));
assert(!dirs(secret, [rec]).ready && dirs(secret, [rec]).reason === "secrecy");
assert(!dirs(row({ id: GC, venue_name_raw: "TBA - Secret Location", venue_address_raw: "6221 Merriman Road", venue_city_raw: "Garden City" }), [rec]).ready);
ok("secrecy markers in the public description or name still block, with a record");

// conflict between the event-level raw address and the venues embed
r = dirs(row({ venue_id: 7, venue_name_raw: "Some Hall", venue_address_raw: "100 Elm St", venue_city_raw: "Detroit", venues: { name: "Some Hall", address: "900 Oak St", city: "Detroit", zip_code: null, lat: null, lng: null } }));
assert(!r.ready && r.reason === "conflict");
ok("event vs venue conflict in public shape => not ready");

// partial addresses in public shape
for (const [a, c, why] of [["482", "Detroit", "number_only"], ["Woodward Ave", "Detroit", "street_only"], [null, "Detroit", "city_only"], ["123 Main St", "Bloomfield H", "truncated_city"]]) {
  r = dirs(row({ venue_name_raw: "Hall", venue_address_raw: a, venue_city_raw: c }));
  assert(!r.ready && r.reason === why, JSON.stringify([a, c]) + " => " + r.reason);
}
ok("partial public rows (482, street only, bare city, truncated city) => not ready");

// the page wiring consumes exactly this output
assert(/CalendarLocation\.directionsForEvent\(e\)/.test(html) && /address-verified\.json/.test(html));
ok("event page calls directionsForEvent on the mapRow output and loads the reviewed records");
console.log(n + " checks passed");
