// test/homepage-discovery-adoption.test.js — the homepage, on the shared
// discovery layer.
//
// On 2026-10-03 index.html stopped carrying its own discovery rules and
// adopted /discovery.js (DEC-022): it holds one canonical filter state,
// changes it only through Discovery.change(), and asks Discovery what
// matches, how many, what to call the active filters and how to write them
// into a URL. No visual redesign came with that — same layout, same
// controls, same event cards.
//
// test/discovery.test.js proves the rules; test/discovery-compat.test.js
// proves how they differ from the homepage's OLD rules. This file proves
// the page itself is wired to them correctly and still behaves like the
// homepage: it RUNS index.html's real script (with discovery.js,
// paged-fetch.js and legal-snippets.js, exactly as the page loads them)
// against a small in-memory database and a fixed clock, drives the page's
// own handlers the way a visitor would, and reads back what the page put
// on screen. See test/fixtures/fake-dom.js for how.
//
// "Today" throughout is Saturday 2026-10-03, 3:00 PM in Detroit.
//
// 2026-10-04 (homepage UX evolution, first slice): the page's presentation
// changed and this file changed with it, only where it had to —
//   - the resting view is every current + upcoming event (it was today
//     only), headed "All events";
//   - an event is listed once, on the first day of the view it occupies
//     (it was repeated under every day of its run);
//   - the list is written in two containers, #listView and #listMore;
//   - the hero shows the site total with Today / Next 7 Days / Active
//     Neighborhoods (it was "things left this week in the Orbit");
//   - a category chip is lit only when that category is selected, and a
//     click selects it (every chip used to be lit when nothing was
//     narrowed, and a click turned that category off).
// The rules themselves — what matches, the state, the URLs, the tray —
// are untouched, and so are the assertions about them. The stream's
// own behaviour (sections, "show more", Don't Miss) is covered in
// test/homepage-stream.test.js.
//
// Run: node test/homepage-discovery-adoption.test.js
"use strict";
process.env.TZ = "America/Detroit";

const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { Discovery: D } = require(`${REPO_DIR}/discovery.js`);
const { makeMockPostgrest } = require(`${REPO_DIR}/test/fixtures/mock-postgrest.js`);
const { loadPage, inlineScript } = require(`${REPO_DIR}/test/fixtures/fake-dom.js`);
const read = (f) => fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
const plain = (x) => JSON.parse(JSON.stringify(x));

const HTML = read("index.html");
const SCRIPT = inlineScript(HTML);
const NOW = "2026-10-03T19:00:00Z"; // Sat 3:00 PM, Detroit
const day = (n) => new Date(Date.UTC(2026, 9, 3 + n)).toISOString().slice(0, 10);
const heading = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// ---- the database ------------------------------------------------------
function row(id, title, start, extra) {
  return Object.assign({
    id, title, description: null, image_url: null, start_date: start, end_date: null, venue_name: "Hall", venue_city: "Detroit",
    venue_id: null, neighborhood: null, category: "music", time_display: "", is_free: false, source: "Manual", note: null,
    ticket_url: null, event_url: null, price_from: null, is_clothing_optional: false, ticket_status: null, status: "approved",
  }, extra || {});
}
const ROWS = [
  // today
  row("a01", "Jazz at Seven", day(0), { time_display: "7:00 PM", neighborhood: "Corktown", ticket_url: "https://tickets.example/jazz", venue_name: "Blue Room" }),
  row("a02", "Morning Market", day(0), { time_display: "10:00 AM–2:00 PM", category: "food", is_free: true }),                 // over by 3 PM
  row("a03", "Late Set", day(0), { time_display: "Evening", category: "nightlife" }),
  row("a04", "Matinee Somewhere", day(0), { category: "film", is_free: true, venue_city: "Ann Arbor" }),                        // no time known
  row("a05", "Afternoon Play", day(0), { time_display: "1:00 PM", category: "theatre" }),                                       // started, no known end
  row("a06", "Augustus Williams Live", day(0), { time_display: "9:00 PM", neighborhood: "Corktown", is_free: true }),           // blocked name
  // already running / just finished
  row("b01", "Yesterday Opening", day(-1), { category: "visual", time_display: "6:00 PM" }),
  row("b02", "Running Exhibit", day(-3), { end_date: day(1), category: "museum", time_display: "10:00 AM–5:00 PM", neighborhood: "Midtown", is_free: true }),
  row("b03", "Finished Fair", day(-2), { end_date: day(0), category: "fest", time_display: "9:00 AM–1:00 PM" }),               // last day today, ended 1 PM
  // coming up
  row("c01", "Sunday Show", day(1), { time_display: "8:00 PM", venue_city: "Ferndale", venue_name: "The Loft" }),
  row("c02", "No Category", day(2), { category: null, time_display: "6:00 PM" }),
  row("c03", "Out There", day(1), { venue_city: "Richmond", time_display: "7:00 PM" }),                                         // a city not in the places table
  row("c04", "Wednesday Social", day(4), { category: "community", neighborhood: "Corktown", is_free: true, source: "Venue Submission", is_clothing_optional: true, time_display: "2:00 PM", note: "Bring a towel" }),
  row("c05", "Fall Festival", day(6), { end_date: day(8), category: "fest", neighborhood: "Downtown", image_url: "/assets/x.webp", time_display: "Noon–10:00 PM" }),
  row("c06", "Big Game", day(20), { category: "sports", venue_city: "Lansing", time_display: "1:00 PM", ticket_url: "https://tickets.example/game" }),
  // began long before the page's eight-day back-buffer
  row("z01", "Long Gone", day(-20), { category: "visual" }),                                                                    // finished: history, never loaded
  row("z02", "Season Exhibition", day(-200), { end_date: day(120), category: "museum", neighborhood: "Midtown" }),              // STILL RUNNING: current, must be loaded and listed
  row("z03", "Closed Yesterday", day(-30), { end_date: day(-1), category: "visual", neighborhood: "Midtown" }),                 // a long run that ended yesterday: history, never loaded
  // never public
  row("p01", "Not Approved", day(0), { status: "pending_review" }),
];
const TABLES = {
  events_public: ROWS.filter((r) => r.status === "approved"),
  events: ROWS,
  venues: Array.from({ length: 12 }, (_, i) => ({ id: "v" + i })),
  // Press coverage: an upcoming event, one that is already over today, and the blocked one.
  editorial_article_events: [["c01", 1], ["a02", 2], ["a06", 3]].map(([id, n]) => ({ event_id: id, editorial_articles: { title: "Preview " + n, url: "https://press.example/" + n, source: "WDET", thumbnail_url: null, published_at: `2026-09-2${n}T12:00:00Z` } })),
};

// The buttons that exist in the page's static markup and that the script
// finds by class.
const SEED = [
  ...["tonight", "tomorrow", "weekend"].map((w) => ({ className: "when-btn", dataset: { when: w, where: "nav" } })),
  ...["tonight", "tomorrow", "weekend", "all"].map((w) => ({ className: "when-btn", dataset: { when: w, where: "bar" } })),
  ...["5", "10", "25", "50", "all"].map((r) => ({ className: "radius-chip" + (r === "all" ? " active" : ""), dataset: { radius: r } })),
];

async function open(url, opts) {
  opts = opts || {};
  const api = makeMockPostgrest(TABLES, { cap: 1000 });
  const page = loadPage({
    url: url || "/", now: opts.now || NOW, seed: SEED, fetch: api.fetch,
    geolocation: opts.geolocation,
    scripts: [read("legal-snippets.js"), read("paged-fetch.js"), read("discovery.js"), SCRIPT],
    names: ["legal-snippets.js", "paged-fetch.js", "discovery.js", "index.html <script>"],
  });
  await page.settle();
  page.requests = api.log;
  return page;
}

// What the page is showing.
function view(page) {
  // The stream: its head and first section, then the rest.
  const html = page.el("listView").innerHTML + page.el("listMore").innerHTML;
  // A day split across #listView and #listMore (the Explore Neighborhoods
  // interlude comes after the first few rows) is one day of the view.
  const days = [];
  html.split(/<div class="list-day-group" data-day="(?=\d{4}-\d{2}-\d{2}")/).slice(1).forEach((g) => {
    const day = heading(g.slice(0, 10));
    const titles = [...g.matchAll(/class="evt-title-link"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    const last = days[days.length - 1];
    if (last && last.day === day) last.titles.push(...titles); else days.push({ day, titles });
  });
  const tray = page.el("activeFilters");
  return {
    days,
    titles: days.flatMap((d) => d.titles),
    rows: days.flatMap((d) => d.titles.map((t) => d.day + " | " + t)),
    allEvents: /<h2 class="stream-title">All events<\/h2>/.test(html),
    heading: (/<div class="list-count-heading">([^<]*)<\/div>/.exec(html) || [])[1] || null,
    empty: /class="empty-state"/.test(html) ? { text: (/<div class="empty-state">([^<]*)/.exec(html) || [])[1], actions: [...html.matchAll(/class="es-action"[^>]*>([^<]*)</g)].map((m) => m[1]) } : null,
    tray: tray.style.display === "none" ? [] : tray.children.filter((c) => c.classList.contains("af-chip")).map((c) => c.children[0].textContent),
    url: page.url(),
    state: plain(page.get("state")),
    html,
  };
}
const chip = (page, sel) => page.el("filterBar").querySelector(sel);
const whenBtn = (page, when) => page.document.querySelectorAll(".when-btn").find((b) => b.dataset.when === when && b.dataset.where === "bar");
const radiusChip = (page, r) => page.document.querySelectorAll(".radius-chip").find((b) => b.dataset.radius === String(r));
const trayRemove = (page, label) => page.el("activeFilters").children.find((c) => c.classList.contains("af-chip") && c.children[0].textContent === label).children[1].click();
const litCats = (page) => page.el("filterBar").querySelectorAll(".chip[data-cat]").filter((c) => c.classList.contains("active")).map((c) => c.dataset.cat);
const ALL_CATS = D.categories.map((c) => c.key);
const sorted = (a) => a.slice().sort();

async function run() {
  // =====================================================================
  // A. The page no longer carries its own copy of the rules
  // =====================================================================
  {
    const at = (s) => HTML.indexOf(s);
    assert.ok(at('<script src="/discovery.js"></script>') !== -1, "index.html loads /discovery.js");
    assert.ok(at('<script src="/discovery.js"></script>') < at(SCRIPT.slice(0, 200)), "…before its own script runs");
    const gone = [
      /\bconst LOCATIONS\b/, /\bconst CITY_LOOKUP\b/, /\bDETROIT_BOUNDARY\s*=/, /\bconst BLOCKED_NAMES\b/, /\bconst WHEN_LABELS\b/,
      /function isBlockedEvent\(/, /function matchesFilters\(/, /function matchesNonDateFilters\(/, /function isEveningTime\(/,
      /function isInDetroitOrbit\(/, /function isWithinRadius\(/, /function milesFromDetroitBorder\(/, /function haversineMiles\(/,
      /function getTomorrowISO\(/, /function getWeekendDates\(/, /function upcomingDatesWithEvents\(/,
      /\blet (activeCats|freeOnly|activeFeatures|query|whenMode|pickedDate|rangeStart|rangeEnd|originLocation|radiusMiles|neighborhoodFilter|cachedWeekendDates)\b/,
      /URLSearchParams\(location\.search\)/, /params\.set\('(when|cats|free|features|q|loc|radius|neighborhood|picked|rangeStart)'/,
    ];
    gone.forEach((re) => assert.ok(!re.test(SCRIPT), `index.html must not define its own ${re}`));
    // Category labels come from Discovery; the page repeats none of them.
    D.categories.filter((c) => /[ &]/.test(c.label)).forEach((c) => assert.ok(!SCRIPT.includes(`"${c.label}"`), `the label "${c.label}" is not repeated in index.html's script`));
    // One state, and it only ever comes from Discovery.
    const assignments = [...SCRIPT.matchAll(/^\s*(?:let )?state = ([^;]+);/gm)].map((m) => m[1].trim());
    assert.deepStrictEqual(sorted(assignments), sorted(["Discovery.defaults()", "next", "Discovery.fromQuery(location.search)"]), "state is assigned only from Discovery.defaults(), Discovery.change() (inside setState) and Discovery.fromQuery()");
    assert.ok(/function setState\(patch\)\{\s*const next = Discovery\.change\(state, patch\);/.test(SCRIPT), "setState() goes through Discovery.change()");
    assert.ok(!/state\.(when|where|what|q)\s*=[^=]/.test(SCRIPT) && !/state\.\w+\.\w+\s*=[^=]/.test(SCRIPT), "nothing writes into the state directly");
  }
  console.log("PASS: A. index.html loads discovery.js, defines none of the rules itself, and holds one state that only Discovery produces");

  // =====================================================================
  // B. The default view
  // =====================================================================
  {
    const page = await open("/");
    const v = view(page);
    assert.strictEqual(page.get("EVENTS.length"), 16, "loaded: everything approved that starts within the 8-day back-buffer or later, plus everything still running");
    assert.deepStrictEqual(v.state, plain(D.defaults()), "no filters");
    assert.deepStrictEqual(v.days.map((d) => d.day), [0, 1, 2, 4, 6, 20].map((n) => heading(day(n))), "the resting view is everything current + upcoming, in date order, starting today");
    // Listed in start-time order; unknown times last. Morning Market
    // (ended 2 PM) and Finished Fair (last day, ended 1 PM) are over; the
    // blocked name never shows; Running Exhibit is in progress and DOES —
    // and so does Season Exhibition, which opened 200 days ago.
    assert.deepStrictEqual(v.days[0].titles, ["Running Exhibit", "Afternoon Play", "Jazz at Seven", "Season Exhibition", "Late Set", "Matinee Somewhere"]);
    assert.deepStrictEqual(v.days.slice(1).map((d) => d.titles), [["Out There", "Sunday Show"], ["No Category"], ["Wednesday Social"], ["Fall Festival"], ["Big Game"]]);
    assert.strictEqual(v.titles.length, 12, "twelve events, twelve rows: the two exhibitions and the three-day festival are listed once each");
    assert.strictEqual(v.allEvents, true, 'headed "All events"');
    assert.ok(!/Showing today/.test(v.html), 'the old "Showing today — see everything" note is gone');
    assert.strictEqual(v.heading, null, "no count heading on the plain default view");
    assert.deepStrictEqual(v.tray, [], "the Showing: tray is hidden");
    assert.strictEqual(v.url, "/", "a view with no filters has a clean URL");
    assert.strictEqual(page.el("whenTriggerSub").textContent, "Anytime");
    assert.strictEqual(page.el("whereTriggerSub").textContent, "Everywhere");
    assert.strictEqual(page.el("filterTriggerSub").textContent, "All types");
    assert.deepStrictEqual(litCats(page), [], "no category is selected, so no category chip is lit");
    assert.ok(chip(page, "#allTypesChip").classList.contains("active"), '"All types" is the current choice');
    assert.ok(page.el("filterBar").querySelectorAll(".chip").every((c) => !/class="dot"|style=/.test(c.innerHTML)), "no chip carries a colour dot");
    assert.deepStrictEqual(page.el("filterBar").querySelectorAll(".chip").map((c) => c.textContent),
      ["All types", ...D.categories.map((c) => c.label), "Free only", "Tickets available", "Has photo", "Community submitted", "On the Radar", "Reset filters"],
      "the chip row: same chips, same order, same wording (no Clothing optional chip — STORY-023)");
    assert.strictEqual(page.el("whenDateInput").value, day(0), 'the "From" input shows today');
    assert.strictEqual(page.el("whenDateInput").min, day(0));

    // Hero (DEC-026). Primary: the database's own current + upcoming total
    // (the same request the map and Orbit cards use — 15, see below).
    // Supporting: TODAY (6 still on or to come), NEXT 7 DAYS (today plus
    // six days: those 6 + Sunday Show, Out There, No Category, Wednesday
    // Social and Fall Festival, which starts on the seventh day), ACTIVE
    // NEIGHBORHOODS (Corktown, Midtown, Downtown).
    assert.strictEqual(page.el("heroStatNumber").textContent, "15");
    assert.strictEqual(page.el("heroStatCaption").textContent, "Current + upcoming events");
    assert.strictEqual(page.el("heroStatToday").textContent, "6");
    assert.strictEqual(page.el("heroStatNext7").textContent, "11");
    assert.strictEqual(page.el("heroStatNeighborhoods").textContent, "3");
    // Week strip: every day of the week counted as that day, past days included.
    const strip = [...page.el("viewCalendarCard").innerHTML.matchAll(/calendar\.html\?date=(\d{4}-\d{2}-\d{2})"[^>]*aria-label="[^"]*, (\d+) events?"/g)].map((m) => [m[1], +m[2]]);
    assert.deepStrictEqual(strip, [[day(-5), 1], [day(-4), 1], [day(-3), 2], [day(-2), 3], [day(-1), 4], [day(0), 8], [day(1), 4]],
      "the week strip counts each day as that day — completed events included, blocked excluded, the long-running exhibition on every day");
    // Map + Near You teasers: the database's own current + upcoming count
    // (starts today or later, OR still running) — includes Running Exhibit,
    // Finished Fair's last day, and Season Exhibition.
    const countRequest = page.requests.find((r) => r.table === "events");
    assert.ok(countRequest.url.includes("or=(start_date.gte." + day(0) + ",end_date.gte." + day(0) + ")") || decodeURIComponent(countRequest.url).includes("or=(start_date.gte." + day(0) + ",end_date.gte." + day(0) + ")"), "the site total asks for Discovery.inventoryFilter()");
    assert.ok(/status=eq\.approved/.test(countRequest.url), "…of approved events only");
    assert.ok(/<div class="side-card-number">15<\/div>/.test(page.el("mapCard").innerHTML), "map card: 15 current + upcoming approved events");
    assert.ok(/<div class="side-card-number">15<\/div>/.test(page.el("nearYouCard").innerHTML));
    // Free Today: free, still on or still to come today (Discovery's Today), in the Orbit —
    // Matinee Somewhere and Running Exhibit. Not Morning Market (free, but over since 2 PM); not the blocked one.
    assert.ok(/<div class="side-card-number">2<\/div>/.test(page.el("freeTodayCard").innerHTML), "free today: 2");
    // Neighborhoods: distinct current + upcoming events, most first, ties A–Z.
    const rail = [...page.el("neighborhoodsRail").innerHTML.matchAll(/data-neighborhood="([^"]+)"[\s\S]*?neigh-count">(\d+)</g)].map((m) => m[1] + "=" + m[2]);
    assert.deepStrictEqual(rail, ["Corktown=2", "Midtown=2", "Downtown=1"], "one per event (Fall Festival runs three days and counts once; Season Exhibition counts for Midtown); the blocked Corktown event is not counted");
    // On the Radar lists the covered upcoming event — not the covered event
    // that is already over today, and never the blocked one.
    const radar = page.el("onRadarCard").innerHTML;
    assert.ok(/Sunday Show/.test(radar) && !/Morning Market/.test(radar) && !/Augustus/.test(radar));

    // THE LOAD WINDOW (DEBT-008, corrected 2026-10-03). The page asks for
    //   start_date >= today − 8 days   OR   end_date >= today
    // — its back-buffer for the week strip, plus everything still running —
    // so every event in the current + upcoming inventory can be listed, and
    // nothing else from history is loaded.
    const loadRequests = page.requests.filter((r) => r.table === "events_public").map((r) => decodeURIComponent(r.url));
    assert.ok(loadRequests.length && loadRequests.every((u) => u.includes(`or=(start_date.gte.${day(-8)},end_date.gte.${day(0)})`)), "every page of the load uses the bounded filter");
    const loaded = plain(page.get("EVENTS"));
    const inventory = TABLES.events_public.filter((r) => r.start_date >= day(0) || (r.end_date && r.end_date >= day(0)));
    assert.strictEqual(inventory.length, 15);
    inventory.forEach((r) => assert.ok(loaded.some((e) => e.id === r.id), `${r.title} is in the current + upcoming inventory, so it is loaded`));
    assert.ok(loaded.some((e) => e.id === "z02"), "Season Exhibition (opened 200 days ago, runs 120 more) is loaded");
    assert.ok(!loaded.some((e) => e.id === "z01") && !loaded.some((e) => e.id === "z03"), "finished events from before the back-buffer are not loaded, however long they ran — that is history, and history is Calendar's");
    assert.strictEqual(loaded.filter((e) => e.date < day(-8)).length, 1, "exactly one event from before the back-buffer is loaded: the one still running");
    // …and it is listed from the window's first day, not from its long-past
    // start (the 60-listed-days guard is unchanged).
    const seasonDays = Object.keys(plain(page.get("byDate"))).filter((iso) => plain(page.get("byDate"))[iso].some((e) => e.id === "z02")).sort();
    assert.deepStrictEqual([seasonDays[0], seasonDays.length], [day(-8), 60]);
    assert.strictEqual(D.count(loaded, D.defaults(), { now: new Date(NOW), defaultWhen: "all" }), 12, "12 of the 15 are still current at 3 PM (two ended earlier today; one is blocked)");
  }
  console.log("PASS: B. default view — everything current + upcoming in date order, each event once, in-progress shown (however long ago it began), over and blocked hidden, clean URL, every card's number from Discovery; the bounded load window");

  // =====================================================================
  // C. WHEN
  // =====================================================================
  {
    const page = await open("/");
    whenBtn(page, "tonight").click();
    let v = view(page);
    assert.deepStrictEqual(v.titles, ["Jazz at Seven", "Late Set"], "tonight: starts at 5 PM or later, or says Evening; an unknown time does not count");
    assert.strictEqual(v.heading, "Showing 2 events tonight");
    assert.deepStrictEqual(v.tray, ["Tonight"]);
    assert.strictEqual(v.url, "/?when=tonight");
    assert.deepStrictEqual(page.document.querySelectorAll(".when-btn").filter((b) => b.classList.contains("active")).map((b) => b.dataset.when + "@" + b.dataset.where), ["tonight@nav", "tonight@bar"], "both Tonight buttons light");
    assert.strictEqual(page.el("whenTriggerSub").textContent, "Tonight");
    assert.strictEqual(page.el("whenDateInput").value, "", "a shortcut blanks the date inputs, as before");

    whenBtn(page, "tomorrow").click();
    v = view(page);
    assert.deepStrictEqual(v.rows, [`${heading(day(1))} | Running Exhibit`, `${heading(day(1))} | Out There`, `${heading(day(1))} | Sunday Show`, `${heading(day(1))} | Season Exhibition`], "tomorrow: includes the exhibits still running tomorrow");
    assert.strictEqual(v.heading, "Showing 4 events tomorrow");
    assert.strictEqual(v.url, "/?when=tomorrow");

    whenBtn(page, "weekend").click();
    v = view(page);
    assert.deepStrictEqual(v.days.map((d) => d.day), [heading(day(0)), heading(day(1))], "what is left of this weekend: today and Sunday (Friday has passed)");
    assert.deepStrictEqual(v.days.map((d) => d.titles), [["Running Exhibit", "Afternoon Play", "Jazz at Seven", "Season Exhibition", "Late Set", "Matinee Somewhere"], ["Out There", "Sunday Show"]], "each exhibit runs both days and is listed once, under the first");
    assert.strictEqual(v.heading, "Showing 8 events this weekend", "8 events, 8 rows");
    assert.ok(!v.titles.includes("Morning Market") && !v.titles.includes("Finished Fair"), "already-over events are not listed in a forward-looking view");

    whenBtn(page, "all").click();
    v = view(page);
    assert.strictEqual(v.heading, "Showing 12 events upcoming — every date");
    assert.deepStrictEqual(sorted(Array.from(new Set(v.titles))), sorted(["Running Exhibit", "Season Exhibition", "Afternoon Play", "Jazz at Seven", "Late Set", "Matinee Somewhere", "Sunday Show", "No Category", "Out There", "Wednesday Social", "Fall Festival", "Big Game"]));
    assert.strictEqual(D.count(plain(page.get("EVENTS")), D.defaults(), { now: new Date(NOW), defaultWhen: "all" }), 12, "the list shows every loaded current + upcoming event: none is loaded but unlisted");
    assert.deepStrictEqual(v.rows.filter((r) => r.endsWith("| Fall Festival")), [`${heading(day(6))} | Fall Festival`], "a three-day festival is listed once, under its first day");
    assert.ok(/Fall Festival[\s\S]*?<span class="evt-run">Through Oct 11<\/span>/.test(v.html), "…and says how long it runs");
    assert.strictEqual(v.titles.length, 12, "12 events, 12 rows");
    assert.strictEqual(v.allEvents, false, "an explicit All Upcoming is headed by its count, like every chosen scope");
    assert.strictEqual(v.url, "/?when=all");

    // The tray's ✕ returns to the default view and restores the From input.
    trayRemove(page, "All Upcoming");
    v = view(page);
    assert.deepStrictEqual(v.state, plain(D.defaults()));
    assert.strictEqual(page.el("whenDateInput").value, day(0));
    assert.strictEqual(v.url, "/");

    // Hero "Next 7 days": today plus six days, everything else reset.
    page.fire("search", "input", { value: "jazz" });
    page.run("viewEverything('next7')");
    v = view(page);
    assert.deepStrictEqual(v.state, plain(D.change(D.defaults(), { when: "next7" })), "resets search and sets Next 7 Days");
    assert.deepStrictEqual(plain(D.window(v.state, { now: new Date(NOW) })), { mode: "next7", from: day(0), to: day(6) }, "exactly today through the sixth day after it");
    assert.strictEqual(page.el("search").value, "");
    assert.strictEqual(v.heading, "Showing 11 events in the next 7 days", "the list is the hero's NEXT 7 DAYS figure (11)");
    assert.deepStrictEqual(v.days.map((d) => d.day), [0, 1, 2, 4, 6].map((n) => heading(day(n))), "nothing past the seventh day (Big Game, on day 20, is not listed)");
    assert.deepStrictEqual(v.tray, ["Next 7 Days"]);
    assert.strictEqual(page.el("whenTriggerSub").textContent, "Next 7 Days");
    assert.strictEqual(v.url, "/?when=next7");

    // Header "Today" is the canonical Today (2026-10-03 correction): "today
    // in Detroit, whenever this is opened" — not a picked date. It leaves
    // out what has already ended, and its link never goes stale.
    page.el("todayNavBtn").click();
    v = view(page);
    assert.deepStrictEqual(v.state, plain(D.change(D.defaults(), { when: "today" })), "when.mode = 'today', nothing else");
    assert.deepStrictEqual(v.state.when, { mode: "today", from: null, to: null });
    assert.strictEqual(v.url, "/?when=today", "no date in the link");
    assert.deepStrictEqual(v.tray, ["Today"]);
    assert.strictEqual(page.el("whenTriggerSub").textContent, "Today");
    assert.strictEqual(v.heading, "Showing 6 events today");
    assert.deepStrictEqual(v.titles, ["Running Exhibit", "Afternoon Play", "Jazz at Seven", "Season Exhibition", "Late Set", "Matinee Somewhere"]);
    assert.ok(!v.titles.includes("Morning Market") && !v.titles.includes("Finished Fair"), "events that have already ended today are not listed");
    assert.ok(!v.titles.includes("Augustus Williams Live"));
    assert.strictEqual(page.el("whenDateInput").value, "", "a shortcut blanks the date inputs, like Tonight and Tomorrow");
    assert.ok(!page.el("whenDateInput").closest(".when-date-picker").classList.contains("active"), "the date picker is not shown as the active choice");
    // Opened tomorrow, the same link means tomorrow's today.
    {
      const nextDay = await open("/?when=today", { now: "2026-10-04T19:00:00Z" });
      const nv = view(nextDay);
      assert.deepStrictEqual(nv.days.map((d) => d.day), [heading(day(1))], "the Today link opened on Sunday lists Sunday");
      assert.deepStrictEqual(sorted(nv.titles), ["Out There", "Running Exhibit", "Season Exhibition", "Sunday Show"]);
      assert.strictEqual(nv.url, "/?when=today");
    }

    // A literal date is a different thing: a stable selection that stays
    // that date, serializes as that date, and shows everything that was on
    // it — including what is already over.
    page.fire("whenDateInput", "change", { value: day(0) });
    v = view(page);
    assert.deepStrictEqual(v.state.when, { mode: "dates", from: day(0), to: day(0) });
    assert.strictEqual(v.url, `/?when=dates&from=${day(0)}`);
    assert.deepStrictEqual(v.tray, [new Date(day(0) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })], 'the chip names the date: "Sat, Oct 3"');
    assert.strictEqual(v.heading, "Showing 8 events Saturday, October 3");
    assert.ok(v.titles.includes("Morning Market") && v.titles.includes("Finished Fair"), "a picked date shows everything that was on it, over or not");
    assert.ok(!v.titles.includes("Augustus Williams Live"));
    {
      const nextDay = await open(`/?when=dates&from=${day(0)}`, { now: "2026-10-04T19:00:00Z" });
      assert.deepStrictEqual(view(nextDay).days.map((d) => d.day), [heading(day(0))], "opened on Sunday, the dated link still shows Saturday");
      assert.strictEqual(view(nextDay).url, `/?when=dates&from=${day(0)}`);
    }

    // Date inputs: From alone is a day; adding To makes a range; clearing To goes back.
    page.fire("whenDateInput", "change", { value: day(4) });
    v = view(page);
    assert.deepStrictEqual(v.titles, ["Wednesday Social", "Season Exhibition"]);
    assert.strictEqual(v.heading, "Showing 2 events Wednesday, October 7");
    assert.strictEqual(page.el("whenDateEndInput").min, day(4), '"To" cannot be before "From"');
    page.fire("whenDateEndInput", "change", { value: day(7) });
    v = view(page);
    assert.deepStrictEqual(v.state.when, { mode: "dates", from: day(4), to: day(7) });
    assert.deepStrictEqual(v.rows, [`${heading(day(4))} | Wednesday Social`, `${heading(day(4))} | Season Exhibition`, `${heading(day(6))} | Fall Festival`], "each event once: the exhibition under the range's first day, the festival under its own first day");
    assert.strictEqual(v.heading, "Showing 3 events Oct 7–Oct 10");
    assert.deepStrictEqual(v.tray, ["Oct 7–Oct 10"]);
    assert.strictEqual(page.el("whenTriggerSub").textContent, "Oct 7–Oct 10");
    assert.strictEqual(v.url, `/?when=dates&from=${day(4)}&to=${day(7)}`);
    page.fire("whenDateEndInput", "change", { value: "" });
    assert.deepStrictEqual(view(page).state.when, { mode: "dates", from: day(4), to: day(4) });
    assert.strictEqual(page.el("whenTriggerSub").textContent, "Oct 7");
  }
  console.log("PASS: C. When — Tonight, Tomorrow, This Weekend, All Upcoming, Next 7 Days (hero), Today (header: the canonical Today, evergreen link), a picked date (stable, dated link) and a date range, each with its list, heading, tray, buttons and URL");

  // =====================================================================
  // D. An explicit date in the past is a real selection (2026-10-03 correction)
  // =====================================================================
  {
    let page = await open(`/?when=dates&from=${day(-2)}`);
    let v = view(page);
    assert.deepStrictEqual(v.days.map((d) => d.day), [heading(day(-2))], "one day: the one that was picked");
    assert.deepStrictEqual(sorted(v.titles), ["Finished Fair", "Running Exhibit", "Season Exhibition"], "a past date shows the events that were on it, completed or not");
    assert.strictEqual(v.heading, `Showing 3 events ${new Date(day(-2) + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`);
    assert.strictEqual(page.el("whenDateInput").value, day(-2));
    assert.strictEqual(v.url, `/?when=dates&from=${day(-2)}`, "and the link is kept as that date, not rewritten to today");

    page = await open(`/?when=dates&from=${day(-2)}&to=${day(0)}`);
    v = view(page);
    assert.deepStrictEqual(v.days.map((d) => d.day), [heading(day(-2)), heading(day(-1)), heading(day(0))]);
    assert.ok(v.titles.includes("Yesterday Opening") && v.titles.includes("Morning Market"), "a range reaching back includes what has finished");
    assert.strictEqual(v.heading, "Showing 9 events Oct 1–Oct 3", "Finished Fair, Running Exhibit, Season Exhibition, Yesterday Opening and today's five (not the blocked one)");

    // The forward-looking modes are unchanged by that: nothing over, nothing before today.
    page = await open("/?when=week");
    v = view(page);
    assert.deepStrictEqual(v.days.map((d) => d.day), [heading(day(0)), heading(day(1))]);
    assert.ok(!v.titles.includes("Yesterday Opening") && !v.titles.includes("Morning Market"));

    // BY DECISION (Product Owner, 2026-10-03): deep history is Calendar's
    // concern, not the homepage's. A date older than the page's 8-day
    // back-buffer is honoured as a selection, but the homepage does not load
    // history for it (and lists a long-running event only from the
    // back-buffer's first day), so it shows an empty state.
    page = await open(`/?when=dates&from=${day(-20)}`);
    v = view(page);
    assert.deepStrictEqual(v.state.when, { mode: "dates", from: day(-20), to: day(-20) });
    assert.ok(v.empty && /^Nothing on the signal here in /.test(v.empty.text), "nothing loaded that far back");
    assert.deepStrictEqual(v.empty.actions, ["Clear all filters"]);
  }
  console.log("PASS: D. an explicit past date or range shows the completed events of that period (within what the page loads); forward-looking views still exclude them");

  // =====================================================================
  // E. WHAT — a chip is lit when its category is selected; a click selects
  // =====================================================================
  {
    const page = await open("/?when=all");
    chip(page, '.chip[data-cat="music"]').click();
    let v = view(page);
    assert.deepStrictEqual(v.state.what.paths, ["music"], "clicking a chip selects that category");
    assert.deepStrictEqual(litCats(page), ["music"], "and it alone is lit");
    assert.ok(!chip(page, "#allTypesChip").classList.contains("active"), '"All types" is no longer the current choice');
    assert.strictEqual(chip(page, '.chip[data-cat="music"]').getAttribute("aria-pressed"), "true");
    assert.strictEqual(chip(page, '.chip[data-cat="film"]').getAttribute("aria-pressed"), "false");
    assert.deepStrictEqual(sorted(v.titles), ["Jazz at Seven", "Out There", "Sunday Show"], "only music events");
    assert.ok(!v.titles.includes("No Category"), "an uncategorised event is not in any selected category");
    assert.deepStrictEqual(v.tray, ["All Upcoming", "1 of 15 categories"], "the tray collapses the selection into one chip, as before");
    assert.strictEqual(page.el("filterTriggerSub").textContent, "1/15 cats");
    assert.strictEqual(v.url, "/?when=all&cats=music");

    // Multi-select adds.
    chip(page, '.chip[data-cat="film"]').click();
    v = view(page);
    assert.deepStrictEqual(v.state.what.paths, ["music", "film"]);
    assert.deepStrictEqual(litCats(page), ["music", "film"]);
    assert.deepStrictEqual(sorted(v.titles), ["Jazz at Seven", "Matinee Somewhere", "Out There", "Sunday Show"], "music or film");
    assert.deepStrictEqual(v.tray, ["All Upcoming", "2 of 15 categories"]);
    assert.strictEqual(v.url, "/?when=all&cats=" + encodeURIComponent("music,film"));
    assert.deepStrictEqual(plain(D.fromQuery(v.url.slice(1))), v.state, "the link means exactly this selection");

    // Clicking a selected chip deselects it; deselecting the last one is all events.
    chip(page, '.chip[data-cat="music"]').click();
    v = view(page);
    assert.deepStrictEqual(v.state.what.paths, ["film"]);
    assert.deepStrictEqual(v.titles, ["Matinee Somewhere"]);
    assert.deepStrictEqual(v.tray, ["All Upcoming", "1 of 15 categories"]);
    chip(page, '.chip[data-cat="film"]').click();
    v = view(page);
    assert.deepStrictEqual(v.state.what.paths, [], "deselecting the last chip returns to ALL events (approved: there is no show-nothing state)");
    assert.deepStrictEqual(litCats(page), [], "and the panel is neutral again");
    assert.ok(chip(page, "#allTypesChip").classList.contains("active"));
    assert.ok(v.titles.includes("No Category"), "with no category filter, an uncategorised event is shown");
    assert.strictEqual(v.heading, "Showing 12 events upcoming — every date");

    // Selecting all fifteen is all events too — the same thing as none.
    ALL_CATS.forEach((c) => chip(page, `.chip[data-cat="${c}"]`).click());
    v = view(page);
    assert.deepStrictEqual(v.state.what.paths, [], "all fifteen selected is no filter at all");
    assert.deepStrictEqual(litCats(page), []);
    assert.strictEqual(v.url, "/?when=all");

    // Tray ✕ on the category chip, and "All types".
    chip(page, '.chip[data-cat="sports"]').click();
    trayRemove(page, "1 of 15 categories");
    assert.deepStrictEqual(view(page).state.what.paths, []);
    chip(page, '.chip[data-cat="sports"]').click();
    chip(page, "#allTypesChip").click();
    assert.deepStrictEqual(view(page).state.what.paths, []);

    // Free + features (AND'd).
    chip(page, "#freeChip").click(); chip(page, "#freeChip").click();
    assert.strictEqual(view(page).state.what.free, false, "Free only toggles off again");
    chip(page, "#freeChip").click();
    v = view(page);
    assert.deepStrictEqual(sorted(Array.from(new Set(v.titles))), ["Matinee Somewhere", "Running Exhibit", "Wednesday Social"]);
    assert.ok(chip(page, "#freeChip").classList.contains("active"));
    assert.strictEqual(page.el("filterTriggerSub").textContent, "Free");
    chip(page, '.chip[data-feature="submitted"]').click();
    v = view(page);
    assert.deepStrictEqual(v.titles, ["Wednesday Social"]);
    assert.deepStrictEqual(v.tray, ["All Upcoming", "Free only", "Community submitted"]);
    assert.strictEqual(page.el("filterTriggerSub").textContent, "Free · 1 feature");
    assert.strictEqual(v.url, "/?when=all&free=1&features=submitted");
    trayRemove(page, "Free only");
    assert.ok(!chip(page, "#freeChip").classList.contains("active"), "removing it in the tray un-lights the chip");
    chip(page, '.chip[data-feature="submitted"]').click();
    chip(page, '.chip[data-feature="tickets"]').click();
    assert.deepStrictEqual(sorted(view(page).titles), ["Big Game", "Jazz at Seven"]);
    chip(page, '.chip[data-feature="tickets"]').click(); chip(page, '.chip[data-feature="photo"]').click();
    assert.deepStrictEqual(Array.from(new Set(view(page).titles)), ["Fall Festival"]);
    chip(page, '.chip[data-feature="photo"]').click(); chip(page, '.chip[data-feature="radar"]').click();
    assert.deepStrictEqual(view(page).titles, ["Sunday Show"], "On the Radar uses the page's own press-coverage data, passed to Discovery");

    // Reset filters.
    chip(page, "#clearChip").click();
    v = view(page);
    assert.deepStrictEqual(v.state, plain(D.defaults()));
    assert.strictEqual(v.url, "/");
  }
  console.log("PASS: E. What — category chips (click selects, multi-select, click again deselects, none = all, all fifteen = all), All types, the tray's category chip, Free only, each feature, Reset filters");

  // =====================================================================
  // F. SEARCH
  // =====================================================================
  {
    const page = await open("/");
    page.fire("search", "input", { value: "  social " });
    let v = view(page);
    assert.strictEqual(v.state.q, "social", "the state holds the trimmed text");
    assert.strictEqual(page.el("search").value, "  social ", "the box keeps what was typed");
    assert.deepStrictEqual(v.titles, ["Wednesday Social"], "a search looks across every upcoming date, not just today");
    assert.strictEqual(v.heading, 'Showing 1 event matching "social"');
    assert.deepStrictEqual(v.tray, ['"social"']);
    assert.strictEqual(v.url, "/?q=social");
    const finds = (q) => { page.fire("search", "input", { value: q }); return sorted(Array.from(new Set(view(page).titles))); };
    assert.deepStrictEqual(finds("the loft"), ["Sunday Show"], "venue");
    assert.deepStrictEqual(finds("ANN ARBOR"), ["Matinee Somewhere"], "city, any case");
    assert.deepStrictEqual(finds("festivals & parades"), ["Fall Festival"], "category label");
    assert.deepStrictEqual(finds("midtown"), ["Running Exhibit", "Season Exhibition"], "neighborhood");
    assert.deepStrictEqual(finds("venue submission"), ["Wednesday Social"], "source");
    assert.deepStrictEqual(finds("towel"), ["Wednesday Social"], "note");
    assert.deepStrictEqual(finds("augustus"), [], "a blocked event is not findable");
    const empty = view(page).empty;
    assert.strictEqual(empty.text, 'Nothing on the signal here in matching "augustus".');
    assert.deepStrictEqual(empty.actions, ["Clear search"], "the one thing narrowing the view (the default is already every upcoming date)");
    page.run("clearSearch()");
    v = view(page);
    assert.strictEqual(v.state.q, ""); assert.strictEqual(page.el("search").value, "");
    assert.strictEqual(v.allEvents, true, "back to all events");
    assert.strictEqual(v.titles.length, 12);
  }
  console.log("PASS: F. Search — looks across every upcoming date; matches title, venue, city, category, neighborhood, source and note; never a blocked event");

  // =====================================================================
  // G. WHERE
  // =====================================================================
  {
    const page = await open("/?when=all");
    page.fire("locInput", "input", { value: "ann" });
    const suggestions = page.el("locSuggestions").children;
    assert.deepStrictEqual(suggestions.map((s) => s.children[0].textContent), D.places.filter((p) => p.name.toLowerCase().includes("ann")).slice(0, 8).map((p) => p.name), "suggestions come from Discovery.places");
    suggestions.find((s) => s.children[0].textContent === "Ann Arbor").click();
    let v = view(page);
    assert.deepStrictEqual(v.state.where, { place: "Ann Arbor", radius: "orbit", neighborhood: null, here: null }, "a place alone means the Detroit Orbit, as before");
    assert.strictEqual(page.el("locInput").value, "Ann Arbor");
    assert.strictEqual(page.el("radiusGroup").style.display, "flex");
    assert.deepStrictEqual(page.document.querySelectorAll(".radius-chip").filter((b) => b.classList.contains("active")).map((b) => b.dataset.radius), ["all"]);
    assert.ok(!v.titles.includes("Out There"), "an event in a city that is not in the places table cannot be placed, so a location filter leaves it out");
    assert.ok(v.titles.includes("Big Game"), "Lansing is inside the Orbit");
    assert.deepStrictEqual(v.tray, ["All Upcoming", "Detroit Orbit · Ann Arbor"]);
    assert.strictEqual(page.el("whereTriggerSub").textContent, "Detroit Orbit · Ann Arbor");
    assert.strictEqual(v.url, "/?when=all&loc=Ann+Arbor&radius=all");

    radiusChip(page, 10).click();
    v = view(page);
    assert.deepStrictEqual(v.titles, ["Matinee Somewhere"], "10 miles from Ann Arbor's centre");
    assert.strictEqual(v.url, "/?when=all&loc=Ann+Arbor&radius=10");
    assert.deepStrictEqual(v.tray, ["All Upcoming", "10 mi · Ann Arbor"]);
    // Map card: events within 10 mi of the chosen point, vs the whole Orbit.
    assert.ok(/<div class="side-card-number">1<\/div>/.test(page.el("mapCard").innerHTML) && /within 10 mi of you/.test(page.el("mapCard").innerHTML));
    // Near You: within 75 mi of that point (the card's own arithmetic — see DEBT-009): everything placeable is that close to Ann Arbor.
    assert.ok(/Within 75 mi of Ann Arbor/.test(page.el("nearYouCard").innerHTML));
    assert.strictEqual((/<div class="side-card-number">(\d+)<\/div>/.exec(page.el("nearYouCard").innerHTML) || [])[1], "11", "11 current + upcoming events in cities the page can place (not Richmond; not the over or blocked ones), each counted once");

    // Expand radius walks Discovery's tiers.
    page.run("expandRadius()"); assert.strictEqual(view(page).state.where.radius, 25);
    page.run("expandRadius()"); assert.strictEqual(view(page).state.where.radius, 50);
    page.run("expandRadius()"); assert.strictEqual(view(page).state.where.radius, "orbit");
    page.run("expandRadius()"); assert.strictEqual(view(page).state.where.radius, "orbit", "the Orbit is the widest tier");

    // Changing the place keeps the chosen radius; clearing removes both.
    radiusChip(page, 5).click();
    page.fire("locInput", "input", { value: "cork" });
    page.el("locSuggestions").children[0].click();
    v = view(page);
    assert.deepStrictEqual([v.state.where.place, v.state.where.radius], ["Corktown", 5], "a Detroit neighborhood can be the point to measure from");
    assert.ok(v.titles.includes("Jazz at Seven") && !v.titles.includes("Sunday Show") && !v.titles.includes("Matinee Somewhere"), "5 mi of Corktown: Detroit's events (city centres), not Ferndale's or Ann Arbor's");
    page.el("locClearBtn").click();
    v = view(page);
    assert.deepStrictEqual(v.state.where, plain(D.defaults().where));
    assert.strictEqual(page.el("locInput").value, "");
    assert.strictEqual(page.el("radiusGroup").style.display, "none");
    assert.strictEqual(v.url, "/?when=all");
  }
  {
    // Device location: used, shown, never written to the URL.
    const geolocation = { getCurrentPosition: (ok) => ok({ coords: { latitude: 42.2808, longitude: -83.743 } }) };
    const page = await open("/", { geolocation });
    page.run("viewMyOrbit()");
    let v = view(page);
    assert.deepStrictEqual(v.state.where, { place: null, radius: "orbit", neighborhood: null, here: { lat: 42.2808, lng: -83.743 } });
    assert.deepStrictEqual(v.tray, ["Detroit Orbit · Your location"]);
    assert.strictEqual(page.el("locInput").value, "Your location");
    assert.strictEqual(v.url, "/?radius=all", "coordinates never go into a link; what is shareable (the Orbit) does");
    radiusChip(page, 10).click();
    v = view(page);
    assert.deepStrictEqual(v.titles, ["Matinee Somewhere"]);
    assert.strictEqual(v.url, "/", "a distance from the visitor's own location is not shareable at all");
    page.el("useMyLocationBtn").click();
    assert.strictEqual(view(page).state.where.radius, 10, '"Use my location" keeps the chosen radius');
  }
  console.log("PASS: G. Where — place search, the Orbit default, radius tiers, Expand radius, clear, device location (never in the URL), and the map / near-you cards");

  // =====================================================================
  // H. Neighborhood cards, Free Today, Browse
  // =====================================================================
  {
    const page = await open("/?cats=music&free=1&q=x");
    page.run("viewNeighborhood('Corktown')");
    let v = view(page);
    assert.deepStrictEqual(v.state, plain(D.change(D.defaults(), { where: { neighborhood: "Corktown" } })), "picking a neighborhood resets every other filter, as before");
    assert.deepStrictEqual(sorted(v.titles), ["Jazz at Seven", "Wednesday Social"]);
    assert.strictEqual(v.heading, "Showing 2 events in Corktown", "the list count equals the card's count (2)");
    assert.strictEqual(v.allEvents, false);
    assert.deepStrictEqual(v.tray, ["Corktown"]);
    assert.strictEqual(v.url, "/?neighborhood=Corktown");
    assert.ok(/neigh-card[^"]* active" data-neighborhood="Corktown"/.test(page.el("neighborhoodsRail").innerHTML), "the card shows as active");
    page.run("viewNeighborhood('Corktown')");
    assert.strictEqual(view(page).state.where.neighborhood, null, "clicking it again turns it off");
    page.run("viewNeighborhood('Midtown')"); trayRemove(page, "Midtown");
    assert.strictEqual(view(page).state.where.neighborhood, null);

    // Free Today = the canonical Today + Free (2026-10-03 correction).
    page.run("viewFreeToday()");
    v = view(page);
    assert.deepStrictEqual(v.state, plain(D.change(D.defaults(), { when: "today", free: true })), "when.mode = 'today' and free — no date");
    assert.strictEqual(v.url, "/?when=today&free=1", "a link that means free-today on whatever day it is opened");
    assert.deepStrictEqual(v.tray, ["Today", "Free only"]);
    assert.ok(chip(page, "#freeChip").classList.contains("active"));
    assert.strictEqual(page.el("whenDateInput").value, "");
    assert.strictEqual(v.heading, "Showing 2 events today");
    assert.deepStrictEqual(sorted(v.titles), ["Matinee Somewhere", "Running Exhibit"], "the same two the card counted — not Morning Market, which is free but ended at 2 PM");
    // It adds to whatever else is filtered.
    page.el("browseBtn").click();
    page.fire("search", "input", { value: "matinee" });
    page.run("viewFreeToday()");
    v = view(page);
    assert.deepStrictEqual([v.state.what.free, v.state.when.mode, v.state.q], [true, "today", "matinee"], "Free Today keeps the other filters");
    assert.deepStrictEqual(v.titles, ["Matinee Somewhere"]);

    page.el("browseBtn").click();
    v = view(page);
    assert.deepStrictEqual(v.state, plain(D.defaults()), "Browse clears everything");
    assert.strictEqual(page.el("search").value, ""); assert.strictEqual(page.el("whenDateInput").value, day(0));
  }
  console.log("PASS: H. neighborhood cards (count = list), Free Today (canonical Today + free; count = list), Browse");

  // =====================================================================
  // I. Old links still open the same view; the address bar is rewritten in the shared form
  // =====================================================================
  {
    const cases = [
      // [link as the old homepage wrote it, the address after loading]
      [`/?date=${day(0)}`, "/"],
      [`/?date=${day(0)}&when=tomorrow`, "/?when=tomorrow"],
      [`/?date=${day(0)}&when=tonight`, "/?when=tonight"],
      [`/?date=${day(0)}&when=weekend`, "/?when=weekend"],
      [`/?date=${day(0)}&when=thisweek`, "/?when=week"],
      [`/?date=${day(0)}&when=all`, "/?when=all"],
      [`/?date=${day(0)}&when=date&picked=${day(4)}`, `/?when=dates&from=${day(4)}`],
      [`/?date=${day(0)}&when=range&rangeStart=${day(4)}&rangeEnd=${day(7)}`, `/?when=dates&from=${day(4)}&to=${day(7)}`],
      [`/?date=${day(0)}&cats=music,film`, "/?cats=music%2Cfilm"],
      [`/?date=${day(0)}&cats=${ALL_CATS.join(",")}`, "/"],
      [`/?date=${day(0)}&free=1&features=tickets,radar&q=bahamas`, "/?free=1&features=tickets%2Cradar&q=bahamas"],
      [`/?date=${day(0)}&loc=Ann+Arbor&radius=25`, "/?loc=Ann+Arbor&radius=25"],
      [`/?date=${day(0)}&loc=Ann+Arbor&radius=all`, "/?loc=Ann+Arbor&radius=all"],
      [`/?date=${day(0)}&loc=Elmwood+Park&radius=10`, "/"],
      [`/?date=${day(0)}&neighborhood=Corktown`, "/?neighborhood=Corktown"],
      [`/?view=month&date=2026-10-01`, "/"],
      [`/?when=someday`, "/"],
    ];
    for (const [link, after] of cases) {
      const page = await open(link);
      const v = view(page);
      assert.deepStrictEqual(v.state, plain(D.fromQuery(link)), `${link}: the page's state is Discovery's reading of the link`);
      assert.strictEqual(v.url, after, `${link}: rewritten as ${after}`);
      assert.deepStrictEqual(plain(D.fromQuery(after)), v.state, `${after} means the same thing`);
      // And the list is exactly what Discovery says for that state.
      const ctx = { now: new Date(NOW), defaultWhen: "all", coverage: { c01: true } }; // the homepage's resting view is everything upcoming
      const expected = plain(page.get("EVENTS")).filter((e) => D.matches(e, v.state, ctx)).map((e) => e.title);
      assert.deepStrictEqual(sorted(v.titles), sorted(expected), `${link}: lists exactly the events Discovery matches, once each`);
    }
    // Controls restored from a link.
    let page = await open(`/?when=range&rangeStart=${day(4)}&rangeEnd=${day(7)}&q=fest&loc=ann%20arbor&radius=25&cats=fest,music&free=1`);
    assert.strictEqual(page.el("whenDateInput").value, day(4)); assert.strictEqual(page.el("whenDateEndInput").value, day(7));
    assert.strictEqual(page.el("search").value, "fest");
    assert.strictEqual(page.el("locInput").value, "Ann Arbor");
    assert.deepStrictEqual(litCats(page), ["music", "fest"]);
    assert.ok(chip(page, "#freeChip").classList.contains("active"));
    assert.deepStrictEqual(view(page).tray, ["Oct 7–Oct 10", "Free only", '"fest"', "2 of 15 categories", "25 mi · Ann Arbor"], "tray order: when, free, features, search, categories, location, neighborhood — as before");

    // The approved differences in how a link is read.
    page = await open("/?cats=");
    assert.deepStrictEqual(view(page).state.what.paths, [], "cats= with nothing in it is ALL events (was: none)");
    assert.deepStrictEqual(litCats(page), [], "…which is the neutral panel");
    assert.strictEqual(view(page).titles.length, 12);
    page = await open(`/?when=date&picked=${day(-1)}`);
    assert.deepStrictEqual(sorted(view(page).titles), ["Finished Fair", "Running Exhibit", "Season Exhibition", "Yesterday Opening"], "an old link to a date now in the past opens that date (was: ignored, showed today)");
    page = await open("/?when=now");
    assert.deepStrictEqual([view(page).state.when.mode, view(page).tray, view(page).heading], ["today", ["Today"], "Showing 6 events today"], "when=now (Calendar's and Map's word) is Today here too");
    page = await open("/?radius=all&when=all");
    assert.deepStrictEqual([view(page).tray, page.el("whereTriggerSub").textContent], [["All Upcoming", "Detroit Orbit"], "Detroit Orbit"], "radius=all with no place is the Detroit Orbit");
    assert.ok(!view(page).titles.includes("Out There"));
    trayRemove(page, "Detroit Orbit");
    assert.deepStrictEqual(view(page).state.where, plain(D.defaults().where), "and its ✕ removes it");
    assert.ok(view(page).titles.includes("Out There"));
  }
  console.log("PASS: I. every link form the old homepage wrote opens the same view and is rewritten in the shared form; the approved reading differences behave as approved");

  // =====================================================================
  // J. Declared feature: clothing optional
  // =====================================================================
  {
    let page = await open("/?when=all");
    const html = view(page).html;
    const cards = html.split('<div class="evt-row">').slice(1);
    const tagged = cards.filter((c) => c.includes("evt-tag-clothing-optional")).map((c) => (/class="evt-title-link"[^>]*>([^<]*)</.exec(c) || [])[1]);
    assert.deepStrictEqual(tagged, ["Wednesday Social"], "only an event declared clothing-optional carries the label; nothing is said about any other event");
    assert.ok(html.includes('<div class="evt-tag-clothing-optional">Clothing optional</div>'), "the label's wording is unchanged");
    assert.ok(!/clothing required/i.test(html));
    assert.ok(!chip(page, '.chip[data-feature="clothing_optional"]'), "no chip for it yet (STORY-023)");
    page = await open("/?features=clothing_optional&when=all");
    const v = view(page);
    assert.deepStrictEqual(v.titles, ["Wednesday Social"], "a link can filter on it");
    assert.deepStrictEqual(v.tray, ["All Upcoming", "Clothing optional"]);
    assert.strictEqual(page.el("filterTriggerSub").textContent, "1 feature");
    trayRemove(page, "Clothing optional");
    assert.deepStrictEqual(view(page).state.what.features, []);
  }
  console.log("PASS: J. clothing optional — a label only where it was declared, never an assertion about other events; filterable by link; no chip yet");

  // =====================================================================
  // K. "Today" is Detroit's date, whatever clock the visitor's device keeps
  // =====================================================================
  {
    const late = "2026-10-04T03:30:00Z"; // Sat 11:30 PM in Detroit; already Sunday afternoon in Tokyo
    process.env.TZ = "Asia/Tokyo";
    try {
      const page = await open("/", { now: late });
      assert.strictEqual(new Date(late).getDate(), 4, "sanity: this process now thinks it is the 4th");
      assert.strictEqual(page.run("getTodayISO()"), day(0), "the page's today is still Saturday in Detroit");
      assert.strictEqual(page.el("whenDateInput").value, day(0));
      const v = view(page);
      assert.strictEqual(v.days[0].day, heading(day(0)), "the stream starts on Saturday");
      assert.ok(v.days[0].titles.includes("Late Set"), "and it lists Saturday's events under it");
      assert.ok(/<span class="ldh-rel is-today">Today<\/span><span class="ldh-date">Sat, Oct 3<\/span>/.test(v.html), "Saturday is the day marked Today");
      assert.ok(v.titles.includes("Jazz at Seven"), "an event with no known end time stays listed until midnight Detroit time");
    } finally { process.env.TZ = "America/Detroit"; }
  }
  console.log("PASS: K. the page's today is the date in Detroit, not the visitor's device date");

  console.log("\nAll homepage discovery-adoption tests passed.");
}

run().catch((err) => { console.error("FAIL:", err); process.exitCode = 1; });
