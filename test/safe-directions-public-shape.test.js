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
vm.runInContext(["decodeEntities", "resolveVenueDisplay", "absWebUrl", "mapRow"].map(fnSource).join("\n") + "\nthis.mapRow = mapRow;", ctx);
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
// ---- venue page: public venues select, the page's own mapVenueRow / venueDirections ----
{
  const vhtml = fs.readFileSync(path.join(__dirname, "..", "venue-template.html"), "utf8");
  const vsel = /\/rest\/v1\/venues\?id=eq\.[^`]*&select=([^`]+)`/.exec(vhtml);
  assert(vsel, "venue page select found");
  const vcols = vsel[1].split(",");
  assert(vcols.includes("zip_code"), "the venue page selects zip_code");
  assert(!vcols.some((c) => PRIVATE.test(c) || /confidence|source$|provenance|evidence/.test(c)) , "no private or provenance venue column");
  assert(!vcols.some((c) => /^(?:state|province|country)$/.test(c)), "the public venues select carries no state/country column (postal/ZIP is the only region evidence)");
  const fn = (name) => { const st = vhtml.indexOf("function " + name + "("); assert(st >= 0, name); let i = vhtml.indexOf("{", st), d = 0; for (; i < vhtml.length; i++) { if (vhtml[i] === "{") d++; else if (vhtml[i] === "}" && --d === 0) break; } return vhtml.slice(st, i + 1); };
  const vctx = vm.createContext({ CalendarLocation: C });
  vm.runInContext(["decodeEntities", "mapVenueRow", "venueDirections"].map(fn).join("\n") + "\nthis.mapVenueRow = mapVenueRow; this.venueDirections = venueDirections;", vctx);
  const vrow = (over) => { const r = Object.assign({ id: 1, name: "Hall", address: null, city: null, zip_code: null, website: null, instagram_url: null, facebook_url: null, tiktok_url: null, twitter_url: null, neighborhood_id: null }, over); for (const k of Object.keys(r)) assert(vcols.includes(k), "venue fixture key " + k + " is a public column"); return r; };
  const vd = (over) => vctx.venueDirections(vctx.mapVenueRow(vrow(over), null));
  let r = vd({ address: "401 Riverside Dr W", city: "Windsor", zip_code: "N9A 5P4" });
  assert(r.ready && r.query === "401 Riverside Dr W, Windsor, N9A 5P4, Canada", "Windsor ON via the public zip_code column: " + r.query);
  r = vd({ address: "500 Ouellette Ave", city: "Windsor" }); assert(!r.ready && r.reason === "ambiguous_city");
  r = vd({ address: "500 Main St", city: "Windsor", zip_code: "06095" }); assert(r.ready && /USA$/.test(r.query));
  r = vd({ address: "2211 Woodward Ave", city: "Detroit", zip_code: "48201" }); assert(r.ready && r.query === "2211 Woodward Ave, Detroit, 48201, USA");
  r = vd({ address: "2211 Woodward Ave, Detroit, MI", city: "Detroit", zip_code: "N9A 5P4" }); assert(!r.ready && r.reason === "conflicting_region");
  r = vd({ address: "123", city: "Detroit", zip_code: "48201" }); assert(!r.ready && r.reason === "number_only");
  r = vd({ address: "123 Main St", city: null }); assert(!r.ready && r.reason === "city_missing", "a missing venue city is not defaulted to Detroit");
  ok("venue page (public venues select incl. zip_code): postal/ZIP context decides Windsor; conflicts, partials and a missing city are not ready");
}

// ---- Windsor on the event page in public shape ----
{
  r = dirs(row({ venue_name_raw: "Hall", venue_address_raw: "500 Ouellette Ave", venue_city_raw: "Windsor" })); assert(!r.ready && r.reason === "ambiguous_city");
  r = dirs(row({ venue_id: 9, venues: { name: "Hall", address: "401 Riverside Dr W", city: "Windsor", zip_code: "N9A 5P4", lat: null, lng: null } }));
  assert(r.ready && /Windsor, N9A 5P4, Canada$/.test(r.query), "venues embed postal code makes Windsor, ON ready: " + r.query);
  ok("event page public rows: bare Windsor not ready; Windsor with the venues embed's postal code ready");
}
console.log(n + " checks passed");
