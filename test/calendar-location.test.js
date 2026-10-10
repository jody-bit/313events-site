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
// canary. Production stores "420 W. 9 Mile Rd" / "Hazel Park" at event level
// with no state and no ZIP, and no venue row. The formatter never infers a
// state from a city and never invents a ZIP, so that record exports
// "..., 420 W 9 Mile Rd, Hazel Park"; the full
// "..., Hazel Park, MI 48030" is produced as soon as the stored data carries
// the state and ZIP (venue record or event address text). No test or code
// path special-cases the event.
//
// Run: node test/calendar-location.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { CalendarLocation: CL } = require(`${REPO_DIR}/calendar-location.js`);

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
    window: { location: { href }, open: () => null },
    EVENTS: [], setTimeout, document: undefined,
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
    ? "({ buildICS, buildGoogleCalUrl, addToCalendarHtml, handleCalendarClick, markCalendarLocationsReady, EVENTS })"
    : "({ buildICS, buildGoogleCalUrl })";
  const api = vm.runInContext(`${code}\n;${exportsList}`, ctx);
  api.blobs = blobs;
  api.ctx = ctx;
  return api;
}
const loadIndex = () => load("index.html", "// ---- Add to Calendar ----", "// ---- Share ----", "https://313.events/");
const PAGES = {
  "index.html": loadIndex(),
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
// Once the stored venue data carries state + ZIP (here: in the address text, the only place the
// current model can hold a state), the canary produces the full contract string.
const glennWithVenueRecord = () => glennEvent({ locEventAddress: undefined, locEventCity: undefined, locVenueAddress: "420 W 9 Mile Rd, Hazel Park, MI 48030", locVenueCity: "Hazel Park" });

function run() {
  // =================================================================
  // A. The formatter
  // =================================================================
  // A1. Glenn Barr -- full contract once the stored data carries state + ZIP.
  assert.strictEqual(CL.resolveForEvent(glennWithVenueRecord()).text, GLENN_EXPECTED);

  // A2. Glenn Barr exactly as production stores it today: no state and no ZIP are invented.
  {
    const r = CL.resolveForEvent(glennEvent());
    assert.strictEqual(r.text, `${GLENN_NAME}, 420 W 9 Mile Rd, Hazel Park`);
    assert.strictEqual(r.navigable, true, "a street + city is navigable without a state or ZIP");
    assert.ok(!/\d{5}/.test(r.text) && !/\bMI\b/.test(r.text), "no ZIP or state fabricated");
    assert.strictEqual(r.state, "");
  }

  // A3. Venue-record fallback: no event-level address at all.
  {
    const r = CL.resolveForEvent(glennWithVenueRecord());
    assert.strictEqual(r.text, GLENN_EXPECTED);
    assert.strictEqual(r.source, "venue");
    // a venue row with only street/city/zip_code (today's model): the ZIP is used, no state is guessed
    const z = CL.resolveForEvent(glennEvent({ locEventAddress: undefined, locEventCity: undefined, locVenueAddress: "420 W 9 Mile Rd", locVenueCity: "Hazel Park", locVenueZip: "48030" }));
    assert.strictEqual(z.text, `${GLENN_NAME}, 420 W 9 Mile Rd, Hazel Park 48030`);
  }

  // A4. Event-specific precedence: a complete event address beats a different venue default.
  {
    const r = CL.resolveForEvent(glennEvent({
      locEventAddress: "1 Pop Up Way", locEventCity: "Ferndale",
      locVenueAddress: "420 W 9 Mile Rd", locVenueCity: "Hazel Park", locVenueZip: "48030",
    }));
    assert.strictEqual(r.text, `${GLENN_NAME}, 1 Pop Up Way, Ferndale`);
    assert.ok(!r.text.includes("48030"), "the other street's ZIP must not be borrowed");
  }

  // A5. An incomplete address never replaces a complete one (either direction).
  {
    const venueComplete = CL.resolve({ name: "V", eventAddress: "Downtown", eventCity: "Detroit", venueAddress: "100 Main St", venueCity: "Royal Oak", venueZip: "48067" });
    assert.strictEqual(venueComplete.text, "V, 100 Main St, Royal Oak 48067");
    const eventComplete = CL.resolve({ name: "V", eventAddress: "100 Main St", eventCity: "Royal Oak", venueAddress: "Downtown", venueCity: "Detroit" });
    assert.strictEqual(eventComplete.text, "V, 100 Main St, Royal Oak");
  }

  // A6. Incomplete addresses: keep what is known, say what is missing, never claim navigable.
  {
    const r = CL.resolve({ name: "Some Gallery", eventCity: "Ferndale" });
    assert.strictEqual(r.text, "Some Gallery, Ferndale");
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
    "Fox Theatre, 2211 Woodward Ave, Detroit");
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

  // A9. NO city -> state/province inference, anywhere in the Orbit (MI / OH / ON).
  for (const city of ["Toledo", "Detroit", "Windsor", "Hazel Park", "Atlantis"]) {
    const r = CL.resolve({ name: "V", eventAddress: "1 A St", eventCity: city });
    assert.strictEqual(r.text, `V, 1 A St, ${city}`, `${city}: nothing guessed`);
    assert.strictEqual(r.state, "");
  }
  // ...but a state/ZIP that the stored text DOES contain is used as written.
  assert.strictEqual(CL.resolve({ name: "V", eventAddress: "1 A St, Toledo, OH 43604", eventCity: "Toledo" }).text, "V, 1 A St, Toledo, OH 43604");
  assert.ok(!/orbit-cities|STATE_BY_CITY|inferState|MICHIGAN/.test(fs.readFileSync(`${REPO_DIR}/calendar-location.js`, "utf8").replace(/\/\/.*$/gm, "")), "no city list left in the formatter code");

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
    assert.strictEqual(icsLocation(page.buildICS(glennEvent())), `${GLENN_NAME}, 420 W 9 Mile Rd, Hazel Park`, label("prod-shaped ICS"));
    assert.strictEqual(googleLocation(page.buildGoogleCalUrl(glennEvent())), `${GLENN_NAME}, 420 W 9 Mile Rd, Hazel Park`);

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
    assert.strictEqual(icsLocation(page.buildICS(partial)), `${GLENN_NAME}, Ferndale`);
    const empty = glennEvent({ venue: "Venue TBA", locEventAddress: undefined, locEventCity: undefined });
    assert.strictEqual(icsLocation(page.buildICS(empty)), undefined, "no empty LOCATION: line");
    assert.strictEqual(googleLocation(page.buildGoogleCalUrl(empty)), "");
  }

  // =================================================================
  // D. Apple / Outlook: the file actually handed to the OS has the location
  // =================================================================
  {
    const page = loadIndex();
    page.markCalendarLocationsReady();
    page.blobs.length = 0;
    const html = page.addToCalendarHtml(glennWithVenueRecord());
    assert.strictEqual(page.blobs.length, 1, "one downloadable .ics Blob");
    assert.strictEqual(icsLocation(page.blobs[0]), GLENN_EXPECTED, "downloaded .ics LOCATION");
    assert.ok(html.includes("Apple/Outlook") && html.includes("Google Cal"));
    assert.ok(html.includes("location=The+Gallery+at+Ideation+Orange%2C+420+W+9+Mile+Rd"), "Google link in the rendered anchor");
    assert.ok(!html.includes("data-location-incomplete"), "navigable event is not marked incomplete");
    const bare = page.addToCalendarHtml(glennEvent({ locEventAddress: undefined }));
    assert.ok(bare.includes('data-location-incomplete="street_address"'), "no street -> marked for enrichment, not claimed navigable");
  }

  // =================================================================
  // E. Homepage early-click race: the export never depends on click timing
  // =================================================================
  {
    // The homepage first has only what events_public gives (name + city). The street arrives later.
    const early = () => glennEvent({ locEventAddress: undefined, locEventCity: "Hazel Park" });
    const enrich = (e) => { e.locEventAddress = "420 W. 9 Mile Rd"; };
    const mkClick = (page, e, kind) => {
      const popup = { location: { href: "" }, closed: false, close() { this.closed = true; } };
      page.ctx.window.open = () => popup;
      const anchor = { closest: (sel) => (sel === "a[data-cal]" ? anchor : { getAttribute: () => e.id }), getAttribute: () => kind };
      let prevented = false;
      page.handleCalendarClick({ target: { closest: (sel) => (sel === "a[data-cal]" ? anchor : null) }, preventDefault() { prevented = true; } });
      return { popup, wasPrevented: () => prevented };
    };

    // E1. While pending, NO weaker export exists at all: links are inert (href="#"), no location baked in.
    {
      const page = loadIndex();
      const e = early(); page.EVENTS.push(e);
      const html = page.addToCalendarHtml(e);
      assert.ok(html.includes('data-cal-pending="1"') && !html.includes("calendar.google.com") && !html.includes("blob:"), "pending links export nothing");
      assert.strictEqual((html.match(/href="#"/g) || []).length, 2);
    }
    // E2. Click BEFORE the lookup settles -> held, then exported WITH the street (same as a late click).
    {
      const early1 = loadIndex();
      const e1 = early(); early1.EVENTS.push(e1); early1.addToCalendarHtml(e1);
      const c = mkClick(early1, e1, "google");
      assert.strictEqual(c.wasPrevented(), true, "early click is held");
      assert.strictEqual(c.popup.location.href, "", "nothing exported before the lookup settles");
      enrich(e1); early1.markCalendarLocationsReady();
      return Promise.resolve().then(() => Promise.resolve()).then(() => {
        const earlyUrl = c.popup.location.href;
        assert.strictEqual(googleLocation(earlyUrl), `${GLENN_NAME}, 420 W 9 Mile Rd, Hazel Park`, "early click carries the street");

        // late click: same event after readiness -> real href, identical location
        const late = loadIndex();
        const e2 = early(); enrich(e2); late.EVENTS.push(e2); late.markCalendarLocationsReady();
        const lateHtml = late.addToCalendarHtml(e2);
        const lateUrl = new URL(/href="(https:\/\/calendar\.google\.com[^"]+)"/.exec(lateHtml)[1].replace(/&amp;/g, "&"));
        assert.strictEqual(googleLocation(lateUrl.href), googleLocation(earlyUrl), "early and late clicks export the SAME location");
        // after readiness the handler steps aside
        const c2 = mkClick(late, e2, "google");
        assert.strictEqual(c2.wasPrevented(), false);

        // E3. Lookup fails / data has no address: the held click exports the incomplete fallback, marked, not stale-complete.
        const failed = loadIndex();
        const e3 = early(); failed.EVENTS.push(e3); failed.addToCalendarHtml(e3);
        const c3 = mkClick(failed, e3, "google");
        failed.markCalendarLocationsReady();
        return Promise.resolve().then(() => Promise.resolve()).then(() => {
          assert.strictEqual(googleLocation(c3.popup.location.href), `${GLENN_NAME}, Hazel Park`);
          assert.ok(failed.addToCalendarHtml(e3).includes('data-location-incomplete="street_address"'));
          // E4. The wiring: the lookup always settles and re-renders.
          const idx = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");
          const body = idx.slice(idx.indexOf("async function loadCalendarLocations"));
          assert.ok(/markCalendarLocationsReady\(\);\s*try \{ render\(\); \}/.test(body.slice(0, 2600)), "settle + re-render after the lookup, success or failure");
          assert.ok(/if \(!SUPABASE_URL \|\| !SUPABASE_ANON_KEY\) \{ markCalendarLocationsReady\(\)/.test(idx), "unconfigured path settles");
          finish();
        });
      });
    }
  }
}

// =================================================================
// F. Global-contract guard: every calendar exporter goes through the shared formatter
// =================================================================
function finish() {
  const walk = (dir, out) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "test", "supabase", "_to_delete", "assets", "data", "project", "ra-sync"].includes(ent.name)) continue;
      const full = `${dir}/${ent.name}`;
      if (ent.isDirectory()) walk(full, out); else if (/\.(html|js)$/.test(ent.name)) out.push(full);
    }
    return out;
  };
  const files = walk(REPO_DIR, []).map((f) => f.slice(REPO_DIR.length + 1));
  // KNOWN exporters (pages that build an Add to Calendar link or .ics). A new one must be added here
  // deliberately -- and will then be held to the rules below.
  const EXPORTERS = ["index.html", "event-template.html"];
  // Ingestion code that merely READS calendars is not an exporter.
  const READERS = ["api/cron-feeds.js", "api/cron-motorcitywine.js"];
  const exportsCalendar = /BEGIN:VCALENDAR|calendar\.google\.com\/calendar\/render|text\/calendar/;
  const found = files.filter((f) => f !== "calendar-location.js" && exportsCalendar.test(fs.readFileSync(`${REPO_DIR}/${f}`, "utf8")));
  assert.deepStrictEqual(found.filter((f) => !READERS.includes(f)).sort(), EXPORTERS.slice().sort(),
    "a calendar exporter exists outside the known list (or one vanished): route it through calendar-location.js, then list it here");

  for (const f of EXPORTERS) {
    const src = fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
    assert.ok(src.includes('<script src="/calendar-location.js"></script>'), `${f} must load calendar-location.js`);
    assert.ok(/CalendarLocation\.icsLocationLine\(CalendarLocation\.resolveForEvent\(/.test(src), `${f}: ICS LOCATION must come from the shared formatter`);
    assert.ok(/location: CalendarLocation\.googleLocationParam\(CalendarLocation\.resolveForEvent\(/.test(src), `${f}: Google location must come from the shared formatter`);
  }
  // Nobody else may (re)define a location builder or hand-write the properties.
  for (const f of files) {
    if (f === "calendar-location.js") continue;
    const src = fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
    assert.ok(!/function\s+buildEventLocation\b|buildEventLocation\s*=/.test(src), `${f} defines its own buildEventLocation(); use CalendarLocation`);
    if (EXPORTERS.includes(f)) {
      assert.ok(!/[`'"]LOCATION:/.test(src), `${f} hand-writes an ICS LOCATION line`);
      assert.ok(!/function\s+icsEscape\b|function\s+foldICSLine\b/.test(src), `${f} has its own ICS escaping/folding`);
    }
  }
  // Pages that list events but link to event.html must not grow a private export.
  for (const f of ["calendar.html", "map.html", "radar.html", "venue-template.html", "venues.html", "neighborhoods.html"]) {
    assert.ok(files.includes(f) && !exportsCalendar.test(fs.readFileSync(`${REPO_DIR}/${f}`, "utf8")), `${f} must not contain its own calendar export`);
  }
  console.log("calendar-location: all assertions passed");
}

Promise.resolve(run()).catch((err) => { console.error(err); process.exit(1); });
