// test/calendar-location.test.js — the calendar LOCATION contract.
//
// calendar-location.js is the one definition of an event's calendar
// location ("Venue, Street, City, ST ZIP") and of how it is serialised into
// the .ics LOCATION property and Google's `location` parameter. This file
// pins the rules down, and runs the REAL Add to Calendar code from both
// pages that have one (index.html and event-template.html -- the other
// surfaces, Calendar / Orbit map / venue pages, link to event.html).
//
// Glenn Barr: The Beautiful and the Banal is the required regression
// fixture. Production holds its street address ("420 W. 9 Mile Rd",
// "Hazel Park") but no ZIP and no venue row, so the full expected string is
// produced when the venue record supplies the ZIP, and WITHOUT a ZIP (never
// an invented one) when it does not.
//
// Run: node test/calendar-location.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { CalendarLocation: CL } = require(`${REPO_DIR}/calendar-location.js`);
const { CITIES_BY_STATE } = require(`${REPO_DIR}/api/_lib/orbit-cities.js`);

const GLENN_EXPECTED = "The Gallery at Ideation Orange, 420 W 9 Mile Rd, Hazel Park, MI 48030";
const GLENN_NAME = "The Gallery at Ideation Orange";

// ---- helpers: parse what a calendar app would read ------------------------
function unfold(ics) { return ics.replace(/\r\n[ \t]/g, ""); }
function unescapeText(v) {
  return v.replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}
function icsProps(ics) {
  const props = {};
  unfold(ics).split("\r\n").forEach((line) => {
    const i = line.indexOf(":");
    if (i < 0) return;
    const key = line.slice(0, i).split(";")[0];
    if (!(key in props)) props[key] = line.slice(i + 1);
  });
  return props;
}
function icsLocation(ics) { const raw = icsProps(ics).LOCATION; return raw === undefined ? undefined : unescapeText(raw); }
function googleLocation(url) { return new URL(url).searchParams.get("location"); }
function googleParams(url) { return new URL(url).searchParams; }

// ---- load the real page code ---------------------------------------------
function load(file, startMarker, endMarker, href) {
  const html = fs.readFileSync(`${REPO_DIR}/${file}`, "utf8");
  const a = html.indexOf(startMarker);
  const b = html.indexOf(endMarker, a);
  assert.ok(a >= 0 && b > a, `${file}: Add to Calendar block not found`);
  const blobs = [];
  const ctx = {
    CalendarLocation: CL, URL, URLSearchParams, Date, Math, String, Array, Object, JSON, Number, RegExp,
    Blob: class { constructor(parts) { this.text = parts.join(""); blobs.push(this.text); } },
    window: { location: { href } },
    truncateText: (s) => s,
    shouldShowSource: () => false,
    safeUrl: (u) => (/^https?:\/\//.test(u) ? u : null),
    eventUrl: () => "event.html?id=abc",
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"),
  };
  ctx.URL = Object.assign(class extends URL {}, { createObjectURL: () => "blob:test" });
  vm.createContext(ctx);
  const code = html.slice(a, b);
  const exportsList = file === "index.html"
    ? "({ buildICS, buildGoogleCalUrl, addToCalendarHtml, buildEventLocation })"
    : "({ buildICS, buildGoogleCalUrl, buildEventLocation })";
  const api = vm.runInContext(`${code}\n;${exportsList}`, ctx);
  api.blobs = blobs;
  return api;
}
const PAGES = {
  "index.html": load("index.html", "// ---- Add to Calendar ----", "// ---- Share ----", "https://313.events/"),
  "event-template.html": load("event-template.html", "// ---- Add to Calendar", "function shareEvent(e)", "https://313.events/event.html?id=abc"),
};

const glennEvent = (over) => Object.assign({
  id: "15c5c165-ab1e-4d8a-817b-8cc1eb135b9f",
  date: "2026-10-09", endDate: "2026-10-09",
  title: "Glenn Barr: The Beautiful and the Banal",
  venue: GLENN_NAME,
  time: "6:00 PM–9:00 PM",
  description: "An exhibition of paintings.",
  ticketUrl: "https://example.com/tickets?a=1&b=2",
  source: "Manual",
  // as stored in production: event-level raw address + city, no venue row, no ZIP
  locEventAddress: "420 W. 9 Mile Rd", locEventCity: "Hazel Park",
}, over || {});
const glennWithVenueRecord = () => glennEvent({ locVenueAddress: "420 W 9 Mile Rd", locVenueCity: "Hazel Park", locVenueZip: "48030" });

function run() {
  // =================================================================
  // A. The formatter
  // =================================================================
  // A1. Glenn Barr -- full contract when the venue record supplies the ZIP.
  assert.strictEqual(CL.resolveForEvent(glennWithVenueRecord()).text, GLENN_EXPECTED);

  // A2. Glenn Barr exactly as production stores it today: no ZIP is invented.
  {
    const r = CL.resolveForEvent(glennEvent());
    assert.strictEqual(r.text, `${GLENN_NAME}, 420 W 9 Mile Rd, Hazel Park, MI`);
    assert.strictEqual(r.navigable, true, "a street + city is navigable even without a ZIP");
    assert.ok(!/\d{5}/.test(r.text), "no ZIP fabricated");
  }

  // A3. Venue-record fallback: no event-level address at all.
  {
    const r = CL.resolveForEvent(glennEvent({ locEventAddress: undefined, locEventCity: undefined, locVenueAddress: "420 W 9 Mile Rd", locVenueCity: "Hazel Park", locVenueZip: "48030" }));
    assert.strictEqual(r.text, GLENN_EXPECTED);
    assert.strictEqual(r.source, "venue");
  }

  // A4. Event-specific precedence: a complete event address beats a different venue default.
  {
    const r = CL.resolveForEvent(glennEvent({
      locEventAddress: "1 Pop Up Way", locEventCity: "Ferndale",
      locVenueAddress: "420 W 9 Mile Rd", locVenueCity: "Hazel Park", locVenueZip: "48030",
    }));
    assert.strictEqual(r.text, `${GLENN_NAME}, 1 Pop Up Way, Ferndale, MI`);
    assert.ok(!r.text.includes("48030"), "the other street's ZIP must not be borrowed");
  }

  // A5. An incomplete address never replaces a complete one (either direction).
  {
    const venueComplete = CL.resolve({ name: "V", eventAddress: "Downtown", eventCity: "Detroit", venueAddress: "100 Main St", venueCity: "Royal Oak", venueZip: "48067" });
    assert.strictEqual(venueComplete.text, "V, 100 Main St, Royal Oak, MI 48067");
    const eventComplete = CL.resolve({ name: "V", eventAddress: "100 Main St", eventCity: "Royal Oak", venueAddress: "Downtown", venueCity: "Detroit" });
    assert.strictEqual(eventComplete.text, "V, 100 Main St, Royal Oak, MI");
  }

  // A6. Incomplete addresses: keep what is known, say what is missing, never claim navigable.
  {
    const r = CL.resolve({ name: "Some Gallery", eventCity: "Ferndale" });
    assert.strictEqual(r.text, "Some Gallery, Ferndale, MI");
    assert.strictEqual(r.navigable, false);
    assert.deepStrictEqual(r.missing, ["street_address"]);
    const nothing = CL.resolve({ name: "", });
    assert.strictEqual(nothing.text, "");
    assert.strictEqual(nothing.navigable, false);
    assert.deepStrictEqual(nothing.missing, ["venue_name", "street_address", "city"]);
    const noNumber = CL.resolve({ name: "Park", eventAddress: "Belle Isle", eventCity: "Detroit" });
    assert.strictEqual(noNumber.navigable, false);
    assert.ok(noNumber.missing.includes("house_number"));
  }

  // A7. No duplicate components.
  assert.strictEqual(
    CL.resolve({ name: "Fox Theatre", eventAddress: "Fox Theatre, 2211 Woodward Ave, Detroit, MI 48201", eventCity: "Detroit" }).text,
    "Fox Theatre, 2211 Woodward Ave, Detroit, MI 48201");
  assert.strictEqual(
    CL.resolve({ name: "Fox Theatre", eventAddress: "2211 Woodward Ave, Detroit", eventCity: "Detroit" }).text,
    "Fox Theatre, 2211 Woodward Ave, Detroit, MI");
  assert.strictEqual(
    CL.resolve({ name: "A", eventAddress: "5 Elm St, Troy, MI, 48083, USA", eventCity: "Troy" }).text,
    "A, 5 Elm St, Troy, MI 48083");

  // A8. International addresses are not forced into US components.
  assert.strictEqual(
    CL.resolve({ name: "The Capitol Theatre", eventAddress: "121 University Ave. W., Windsor, ON, N9A 5P4, Canada", eventCity: "Windsor" }).text,
    "The Capitol Theatre, 121 University Ave W, Windsor, ON N9A 5P4, Canada");
  {
    const r = CL.resolve({ name: "Riverside Hall", eventAddress: "377 Riverside Dr E", eventCity: "Windsor" });
    assert.strictEqual(r.text, "Riverside Hall, 377 Riverside Dr E, Windsor", "unknown city: no state invented");
  }
  assert.strictEqual(CL.resolve({ name: "Gare", eventAddress: "1 Rue Sainte-Catherine, Montréal, QC H3B 1A1, Canada", eventCity: "Montréal" }).text,
    "Gare, 1 Rue Sainte-Catherine, Montréal, QC H3B 1A1, Canada");

  // A9. A state is inferred only for a city that belongs to exactly one known state.
  assert.strictEqual(CL.resolve({ name: "V", eventAddress: "1 A St", eventCity: "Toledo" }).text, "V, 1 A St, Toledo, OH");
  assert.strictEqual(CL.resolve({ name: "V", eventAddress: "1 A St", eventCity: "Atlantis" }).text, "V, 1 A St, Atlantis");

  // A10. The state table equals api/_lib/orbit-cities.js (no silent drift).
  {
    const norm = (n) => String(n).toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim().replace(/\btwp$/, "township").replace(/\bhts$/, "heights");
    for (const st of Object.keys(CITIES_BY_STATE)) {
      const mine = new Set(CL._citiesByState[st].map(norm));
      const theirs = new Set([...CITIES_BY_STATE[st].keys()]);
      assert.deepStrictEqual([...mine].sort(), [...theirs].sort(), `${st} city list drifted from orbit-cities.js`);
    }
  }

  // =================================================================
  // B. Serialisation rules
  // =================================================================
  // B1. RFC 5545 escaping of \ ; , and newlines (all newline styles).
  assert.strictEqual(CL.icsEscape("a\\b;c,d\ne\r\nf\rg"), "a\\\\b\\;c\\,d\\ne\\nf\\ng");
  // B2. Round trip with Unicode.
  {
    const nasty = "Café «Ünï»; Suite 2\\B, 日本橋\n2F 🎷";
    const line = CL.foldICSLine("LOCATION:" + CL.icsEscape(nasty));
    assert.strictEqual(unescapeText(unfold(line).slice("LOCATION:".length)), nasty);
  }
  // B3. Folding: <=75 OCTETS per physical line, continuation starts with one
  //     space, never splits a multi-byte character or surrogate pair.
  {
    const long = "LOCATION:" + CL.icsEscape("Théâtre 日本語 🎷 ".repeat(20) + "420 W 9 Mile Rd, Hazel Park, MI 48030");
    const folded = CL.foldICSLine(long);
    folded.split("\r\n").forEach((l, i) => {
      assert.ok(Buffer.byteLength(l, "utf8") <= 75, `line ${i} is ${Buffer.byteLength(l, "utf8")} octets`);
      if (i > 0) assert.ok(l.startsWith(" "));
      assert.ok(!/[\ud800-\udbff]$/.test(l) && !/^ [\udc00-\udfff]/.test(l), "split a surrogate pair");
    });
    assert.strictEqual(unfold(folded), long);
  }

  // =================================================================
  // C. Both pages' real export code
  // =================================================================
  for (const [file, page] of Object.entries(PAGES)) {
    const label = (m) => `${file}: ${m}`;
    const e = glennWithVenueRecord();
    const ics = page.buildICS(e);
    const g = page.buildGoogleCalUrl(e);

    // C1. ICS LOCATION after parsing/unescaping.
    assert.strictEqual(icsLocation(ics), GLENN_EXPECTED, label("ICS LOCATION"));
    // C2. Google `location` after URL decoding.
    assert.strictEqual(googleLocation(g), GLENN_EXPECTED, label("Google location"));
    assert.ok(g.includes("location=The+Gallery+at+Ideation+Orange%2C+420+W+9+Mile+Rd%2C+Hazel+Park%2C+MI+48030"), label("encoded form " + g));
    // C3. Location is a structured field, not address text appended to DESCRIPTION.
    const props = icsProps(ics);
    assert.ok(!unescapeText(props.DESCRIPTION).includes("420 W"), label("address leaked into DESCRIPTION"));
    assert.ok(!googleParams(g).get("details").includes("420 W"), label("address leaked into Google details"));
    assert.ok(unfold(ics).split("\r\n").some((l) => l.startsWith("LOCATION:")), label("LOCATION property present"));

    // C4. Glenn Barr as stored in production (no ZIP, no venue row).
    assert.strictEqual(icsLocation(page.buildICS(glennEvent())), `${GLENN_NAME}, 420 W 9 Mile Rd, Hazel Park, MI`, label("prod-shaped ICS"));
    assert.strictEqual(googleLocation(page.buildGoogleCalUrl(glennEvent())), `${GLENN_NAME}, 420 W 9 Mile Rd, Hazel Park, MI`);

    // C5. No regression: title, schedule, timezone, description, ticket URL, UID.
    assert.strictEqual(unescapeText(props.SUMMARY), "Glenn Barr: The Beautiful and the Banal");
    assert.strictEqual(props.DTSTART, "20261009T180000");
    assert.strictEqual(props.DTEND, "20261009T210000");
    assert.ok(!/^DTSTART.*(Z|TZID)/m.test(unfold(ics)), "floating local times preserved");
    assert.strictEqual(googleParams(g).get("text"), "Glenn Barr: The Beautiful and the Banal");
    assert.strictEqual(googleParams(g).get("dates"), "20261009T180000/20261009T210000");
    assert.strictEqual(googleParams(g).get("ctz"), "America/Detroit");
    assert.strictEqual(googleParams(g).get("action"), "TEMPLATE");
    const desc = unescapeText(props.DESCRIPTION);
    assert.ok(desc.startsWith("An exhibition of paintings."));
    assert.ok(desc.includes("https://example.com/tickets?a=1&b=2"), label("ticket URL"));
    assert.strictEqual(googleParams(g).get("details"), desc, label("Google and ICS descriptions agree"));
    assert.ok(props.UID.endsWith("@313.events"));
    assert.strictEqual(props.UID, "2026-10-09-Glenn-Barr-The-Beautiful-and-the-Banal-The-Gallery-at-Ideation-Orange@313.events");

    // C6. Overnight (end before start) still rolls DTEND to the next day.
    const night = page.buildICS(glennWithVenueRecord() && Object.assign(glennWithVenueRecord(), { time: "10:00 PM–2:00 AM" }));
    assert.strictEqual(icsProps(night).DTSTART, "20261009T220000");
    assert.strictEqual(icsProps(night).DTEND, "20261010T020000");
    // ... and an all-day event stays all-day.
    const allDay = page.buildICS(Object.assign(glennWithVenueRecord(), { time: "" }));
    assert.strictEqual(icsProps(allDay).DTSTART, "20261009");
    assert.ok(/^DTSTART;VALUE=DATE:20261009$/m.test(unfold(allDay)));

    // C7. Hostile characters survive a round trip through both exports.
    const hostile = glennEvent({ venue: "Café; \"Ünï\", Hall\\B", locEventAddress: "1 Main St;\nSuite 2", locEventCity: "Hazel Park" });
    const hostileText = CL.resolveForEvent(hostile).text;
    assert.ok(hostileText.includes("Suite 2"));
    assert.strictEqual(icsLocation(page.buildICS(hostile)), hostileText);
    assert.strictEqual(googleLocation(page.buildGoogleCalUrl(hostile)), hostileText);
    assert.ok(unfold(page.buildICS(hostile)).split("\r\n").every((l) => !/^[^:]*\n/.test(l)), "no raw newline inside a property");

    // C8. Every physical ICS line is <= 75 octets even with a very long location.
    const longEv = glennEvent({ venue: "Θέατρο ".repeat(15), title: "日本語".repeat(40) });
    page.buildICS(longEv).split("\r\n").forEach((l) => assert.ok(Buffer.byteLength(l, "utf8") <= 75, label("long line " + l.length)));

    // C9. Incomplete location: omitted from LOCATION only when truly empty; otherwise preserved.
    const partial = glennEvent({ locEventAddress: undefined, locEventCity: "Ferndale" });
    assert.strictEqual(icsLocation(page.buildICS(partial)), `${GLENN_NAME}, Ferndale, MI`);
    const empty = glennEvent({ venue: "Venue TBA", locEventAddress: undefined, locEventCity: undefined });
    assert.strictEqual(icsLocation(page.buildICS(empty)), undefined, "no empty LOCATION: line");
    assert.strictEqual(googleLocation(page.buildGoogleCalUrl(empty)), "");
  }

  // =================================================================
  // D. Apple / Outlook: the file actually handed to the OS has the location
  // =================================================================
  {
    const page = PAGES["index.html"];
    page.blobs.length = 0;
    const html = page.addToCalendarHtml(glennWithVenueRecord());
    assert.strictEqual(page.blobs.length, 1, "one downloadable .ics Blob");
    assert.strictEqual(icsLocation(page.blobs[0]), GLENN_EXPECTED, "downloaded .ics LOCATION");
    assert.ok(html.includes("Apple/Outlook") && html.includes("Google Cal"));
    assert.ok(html.includes("location=The+Gallery+at+Ideation+Orange%2C+420+W+9+Mile+Rd"), "Google link in the rendered anchor");
    assert.ok(!html.includes("data-location-incomplete"), "navigable event is not marked incomplete");
    // an event without a street is rendered with the incomplete marker (not claimed navigable)
    const bare = page.addToCalendarHtml(glennEvent({ locEventAddress: undefined }));
    assert.ok(bare.includes('data-location-incomplete="street_address"'));
  }

  // =================================================================
  // E. Every Add to Calendar entry point is wired to the shared module
  // =================================================================
  {
    const idx = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");
    const det = fs.readFileSync(`${REPO_DIR}/event-template.html`, "utf8");
    for (const [name, src] of [["index.html", idx], ["event-template.html", det]]) {
      assert.ok(src.includes('<script src="/calendar-location.js"></script>'), `${name} loads calendar-location.js`);
      assert.ok(!/e\.city\s*\?\s*`\$\{e\.venue\}, \$\{e\.city\}`/.test(src), `${name} still has the old venue+city formatter`);
      assert.ok(!/function icsEscape\(/.test(src), `${name} has its own icsEscape`);
      assert.ok(!/function foldICSLine\(/.test(src), `${name} has its own foldICSLine`);
    }
    // Pages that list events but have no export of their own: they must not grow a private one.
    for (const f of ["calendar.html", "map.html", "radar.html", "venue-template.html", "venues.html", "neighborhoods.html"]) {
      const src = fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
      assert.ok(!/BEGIN:VCALENDAR|calendar\/render\?|buildICS/.test(src), `${f} has a private calendar export; route it through calendar-location.js`);
    }
    // Homepage supplies street addresses (events_public has none).
    assert.ok(/loadCalendarLocations\(\)/.test(idx) && /venue_address_raw/.test(idx));
    // Detail page reads the venue ZIP.
    assert.ok(/venues\(name,address,city,zip_code,/.test(det));
  }

  console.log("calendar-location: all assertions passed");
}

run();
