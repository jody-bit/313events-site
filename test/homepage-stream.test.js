// test/homepage-stream.test.js — the homepage's hierarchy and event stream
// (homepage UX evolution, first slice, 2026-10-04).
//
// The homepage now reads, top to bottom: the hero with the site's real
// current + upcoming total; the WHEN / WHERE / WHAT / SEARCH controls; then
// one chronological stream of events, with Explore Neighborhoods after its
// first section. test/homepage-discovery-adoption.test.js proves the page is
// still wired to the shared discovery rules; this file proves what is new:
//
//   1. the order of the page, and that the controls are the shared ones;
//   2. the stream — each event once, a first section and a continuation,
//      "show more", counts of the whole view;
//   3. the hero's figures and what following one does;
//   4. Don't Miss — hidden, with nothing selected in the page's source, and
//      shown only for an active placement of a current event.
//
// Like the adoption test it RUNS index.html's real script against a small
// in-memory database and a fixed clock (test/fixtures/fake-dom.js).
// "Today" is Saturday 2026-10-03, 3:00 PM in Detroit.
//
// Run: node test/homepage-stream.test.js
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
const pad = (n) => String(n).padStart(2, "0");

// ---- the database: 151 current + upcoming events -------------------------
function row(id, title, start, extra) {
  return Object.assign({
    id, title, description: null, image_url: null, start_date: start, end_date: null, venue_name: "Hall", venue_city: "Detroit",
    venue_id: null, neighborhood: null, category: "music", time_display: "7:00 PM", is_free: false, source: "Manual", note: null,
    ticket_url: null, event_url: null, price_from: null, is_clothing_optional: false, ticket_status: null, status: "approved",
  }, extra || {});
}
const ROWS = [
  // An exhibition that opened three days ago and runs another month.
  row("a00", "Long Run", day(-3), { end_date: day(30), category: "museum", neighborhood: "Midtown" }),
  // 30 tonight, 25 tomorrow, 15 on Monday.
  ...Array.from({ length: 30 }, (_, i) => row("t" + pad(i + 1), "Tonight " + pad(i + 1), day(0), i === 0 ? { neighborhood: "Corktown" } : null)),
  ...Array.from({ length: 25 }, (_, i) => row("u" + pad(i + 1), "Sunday " + pad(i + 1), day(1), { category: "theatre" })),
  ...Array.from({ length: 15 }, (_, i) => row("v" + pad(i + 1), "Monday " + pad(i + 1), day(2), { category: "film", is_free: true })),
  // 80 more, two a day, from Tuesday on.
  ...Array.from({ length: 80 }, (_, i) => row("w" + pad(i + 1), "Later " + pad(i + 1), day(3 + Math.floor(i / 2)), { category: "community" })),
  // Already over today, a blocked name, and one that is not public.
  row("x01", "Morning Thing", day(0), { time_display: "9:00 AM–11:00 AM" }),
  row("x02", "Augustus Williams Live", day(1)),
  row("x03", "Not Approved", day(0), { status: "pending_review" }),
];
const TABLES = {
  events_public: ROWS.filter((r) => r.status === "approved"),
  events: ROWS,
  venues: [{ id: "v1" }],
  editorial_article_events: [],
};
const SEED = [
  ...["tonight", "tomorrow", "weekend"].map((w) => ({ className: "when-btn", dataset: { when: w, where: "nav" } })),
  ...["tonight", "tomorrow", "weekend", "all"].map((w) => ({ className: "when-btn", dataset: { when: w, where: "bar" } })),
  ...["5", "10", "25", "50", "all"].map((r) => ({ className: "radius-chip" + (r === "all" ? " active" : ""), dataset: { radius: r } })),
];

async function open(url, opts) {
  opts = opts || {};
  const api = makeMockPostgrest(opts.tables || TABLES, { cap: 1000, failure: opts.failure });
  const page = loadPage({
    url: url || "/", now: NOW, seed: SEED, fetch: api.fetch,
    scripts: [read("legal-snippets.js"), read("paged-fetch.js"), read("discovery.js"), read("calendar-location.js"), SCRIPT],
    names: ["legal-snippets.js", "paged-fetch.js", "discovery.js", "calendar-location.js", "index.html <script>"],
  });
  await page.settle();
  page.requests = api.log;
  return page;
}

// One container of the stream, as day groups.
function groups(html) {
  return html.split(/<div class="list-day-group" data-day="(?=\d{4}-\d{2}-\d{2}")/).slice(1).map((g) => ({
    day: g.slice(0, 10),
    today: /class="ldh-rel is-today">Today</.test(g),
    tomorrow: /class="ldh-rel">Tomorrow</.test(g),
    continued: /class="ldh-cont">continued</.test(g),
    count: (/class="ldh-count">([^<]*)</.exec(g) || [])[1],
    titles: [...g.matchAll(/class="evt-title-link"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]),
  }));
}
function stream(page) {
  const first = page.el("listView").innerHTML, more = page.el("listMore").innerHTML;
  const a = groups(first), b = groups(more);
  return {
    first: a, more: b,
    firstTitles: a.flatMap((g) => g.titles), moreTitles: b.flatMap((g) => g.titles),
    titles: a.concat(b).flatMap((g) => g.titles),
    head: (/<h2 class="stream-title">([^<]*)<\/h2>/.exec(first) || [])[1] || (/<div class="list-count-heading">([^<]*)<\/div>/.exec(first) || [])[1] || null,
    moreShown: page.el("listMore").style.display !== "none",
    button: (/class="stream-more-btn"[^>]*>([^<]*)</.exec(more) || [])[1] || null,
    note: (/class="stream-foot-note">([^<]*)</.exec(more) || [])[1] || null,
    calendar: (/class="stream-foot-link" href="([^"]*)"/.exec(more) || [])[1] || null,
    html: first + more,
  };
}
const seq = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => prefix + " " + pad(from + i));

async function run() {
  // =====================================================================
  // 1. The order of the page
  // =====================================================================
  {
    const body = HTML.slice(HTML.indexOf("<body>"));
    const at = (s) => { const i = body.indexOf(s); assert.ok(i !== -1, `the page has ${s}`); return i; };
    const order = ['id="heroSection"', 'id="discoveryShell"', 'id="activeFilters"', 'class="home-body"', 'id="dontMissSection"', 'id="listView"', 'id="neighborhoodsSection"', 'id="listMore"', 'id="homeSidebar"'];
    order.reduce((prev, s) => { assert.ok(at(s) > prev, `${s} comes after what precedes it`); return at(s); }, -1);
    assert.strictEqual(body.split('id="neighborhoodsSection"').length, 2, "one Explore Neighborhoods rail, not two");

    // The four controls, in order, by the names the shared grammar uses.
    const shell = body.slice(at('id="discoveryShell"'), at('id="sheetBackdrop"'));
    assert.deepStrictEqual([...shell.matchAll(/<span class="mt-label">([^<]*)<\/span>/g)].map((m) => m[1]), ["When", "Where", "What", "Search"]);
    assert.ok(/id="whenTriggerBtn"[\s\S]*id="whereTriggerBtn"[\s\S]*id="filterTriggerBtn"[\s\S]*id="search"/.test(shell), "the same three triggers and the same search box — no second set of controls");
    // WHAT opens from its trigger at every width: nothing hides the trigger,
    // and nothing opens the chips by default.
    const css = HTML.slice(HTML.indexOf("<style>"), HTML.indexOf("</style>"));
    assert.ok(!/#filterTriggerBtn\s*\{\s*display:\s*none/.test(css), "the WHAT trigger is not hidden on desktop");
    assert.ok(/\.discovery-bar, \.location-bar, \.filters\{display:none;\}/.test(css), "the three panels start closed");
    assert.ok(!/@media \(min-width:721px\)\{\s*\.filters\{\s*display:flex/.test(css), "the chips are not opened by default on desktop");

    // The two discovery modules lead the sidebar.
    const side = body.slice(at('id="homeSidebar"'), body.indexOf("</aside>"));
    assert.deepStrictEqual([...side.matchAll(/class="side-card" id="([^"]+)"/g)].map((m) => m[1]), ["onRadarCard", "nearYouCard", "viewCalendarCard", "mapCard", "freeTodayCard", "venuesCard"]);

    // Locked palette: the stream's rows carry no per-category colour.
    const page = await open("/");
    assert.ok(!/style="color:/.test(stream(page).html), "no inline colour on any row of the stream");

    // …and neither does the WHAT panel. At rest it is neutral: no category
    // chip is lit, no chip has a colour dot, and the only chip marked is
    // "All types" — which the stylesheet draws in warm white, not chartreuse.
    const chips = page.el("filterBar").querySelectorAll(".chip");
    assert.strictEqual(chips.length, 22, "All types, fifteen categories, Free only, four features, Reset filters");
    assert.ok(chips.every((c) => !/<span|style=/.test(c.innerHTML)), "chips are plain labels: no dot, no inline colour");
    assert.deepStrictEqual(chips.filter((c) => c.classList.contains("active")).map((c) => c.id), ["allTypesChip"]);
    assert.ok(/\.chip#allTypesChip\.active\{background:var\(--panel-alt\);color:var\(--ink\);border-color:var\(--ink\);\}/.test(css), '"All types" at rest is warm white on the panel, not chartreuse');
    assert.ok(/\.chip\.active\{background:var\(--accent\);/.test(css), "a selected chip is Signal Chartreuse");
    const chipCss = css.split("\n").filter((l) => /\.chip[.#{ ]/.test(l)).join("\n");
    assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(chipCss.replace(/#(allTypesChip|freeChip|clearChip)/g, "")), "no chip rule names a colour outside the locked tokens (the old green Free and red Reset are gone)");
    // Selecting lights only what was selected, in the same chartreuse for
    // a category, Free only and a feature alike.
    page.el("filterBar").querySelector('.chip[data-cat="theatre"]').click();
    page.el("filterBar").querySelector("#freeChip").click();
    assert.deepStrictEqual(page.el("filterBar").querySelectorAll(".chip").filter((c) => c.classList.contains("active")).map((c) => c.dataset.cat || c.id), ["theatre", "freeChip"]);
  }
  console.log("PASS: 1. hero, then When / Where / What / Search, then the stream with Explore Neighborhoods after its first section; the controls are the shared ones; WHAT opens from its trigger at every width");

  // =====================================================================
  // 2. The stream
  // =====================================================================
  {
    const page = await open("/");
    assert.strictEqual(page.get("EVENTS.length"), 153, "everything approved is loaded");
    let s = stream(page);
    assert.strictEqual(s.head, "All events", "the plain default view is headed as what it is");

    // First section: 5 rows — the stream opens, then the Explore
    // Neighborhoods interlude, then the rest. The exhibition is in progress,
    // so it is listed under today — once — and says how long it runs.
    assert.deepStrictEqual(s.firstTitles, ["Long Run", ...seq("Tonight", 1, 4)]);
    assert.deepStrictEqual(s.first.map((g) => [g.day, g.today, g.continued, g.count]), [[day(0), true, false, "31 events"]], "today's heading is marked Today and counts the whole day, not just the rows above the fold");
    assert.ok(/Long Run[\s\S]*?<span class="evt-run">Through Nov 2<\/span>/.test(s.html));
    assert.strictEqual(s.titles.filter((t) => t === "Long Run").length, 1);

    // Continuation: 35 more, picking today up where the first section stopped.
    assert.strictEqual(s.moreShown, true);
    assert.deepStrictEqual(s.moreTitles, [...seq("Tonight", 5, 30), ...seq("Sunday", 1, 9)]);
    assert.deepStrictEqual(s.more.map((g) => [g.day, g.today, g.tomorrow, g.continued, g.count]), [[day(0), true, false, true, "31 events"], [day(1), false, true, false, "25 events"]]);
    assert.strictEqual(s.titles.length, 40, "40 rows to start with");
    assert.ok(!s.titles.includes("Morning Thing") && !s.titles.includes("Augustus Williams Live") && !s.titles.includes("Not Approved"), "over, blocked and unapproved events are not in the stream");
    assert.strictEqual(s.button, "Show 60 more");
    assert.strictEqual(s.note, "40 of 151 shown", "the view's own size: 151 events (153 loaded, less the one that is over and the blocked one)");
    assert.strictEqual(D.count(plain(page.get("EVENTS")), D.defaults(), { now: new Date(NOW), defaultWhen: "all" }), 151, "…which is Discovery's count of the same view");
    assert.strictEqual(s.calendar, "/calendar.html", "the link out is Discovery's own link for this view");

    // Show more: 60 at a time, same view, no change to state or URL.
    const before = [plain(page.get("state")), page.url()];
    page.run("showMoreStream()");
    s = stream(page);
    assert.strictEqual(s.titles.length, 100);
    assert.deepStrictEqual(s.firstTitles, ["Long Run", ...seq("Tonight", 1, 4)], "the first section does not move");
    assert.strictEqual(s.note, "100 of 151 shown");
    assert.strictEqual(s.button, "Show 51 more", "the last step is whatever is left");
    assert.deepStrictEqual([plain(page.get("state")), page.url()], before, "asking for more changes neither the filters nor the address");
    page.run("showMoreStream()");
    s = stream(page);
    assert.strictEqual(s.titles.length, 151);
    assert.strictEqual(new Set(s.titles).size, 151, "every event exactly once");
    assert.strictEqual(s.button, null, "nothing left to ask for");
    assert.strictEqual(s.note, null);
    assert.deepStrictEqual(s.titles.slice(-2), ["Later 79", "Later 80"], "date order to the end");

    // The same view re-rendered keeps what was opened…
    page.run("render()");
    assert.strictEqual(stream(page).titles.length, 151);
    // …a different view starts again from the top.
    page.fire("search", "input", { value: "later" });
    s = stream(page);
    assert.strictEqual(s.head, 'Showing 80 events matching "later"');
    assert.strictEqual(s.titles.length, 40);
    assert.strictEqual(s.note, "40 of 80 shown");
    assert.strictEqual(s.button, "Show 40 more");
    assert.strictEqual(s.calendar, "/calendar.html?q=later", "the calendar link carries the view");

    // A filter with no scope words of its own still says how many it found.
    page.run("clearSearch()");
    page.el("filterBar").querySelector("#freeChip").click();
    s = stream(page);
    assert.strictEqual(s.head, "Showing 15 events");
    assert.deepStrictEqual(s.titles, seq("Monday", 1, 15));
    assert.deepStrictEqual(s.firstTitles, seq("Monday", 1, 5), "the interlude still comes after the first five");
    assert.strictEqual(s.moreShown, true, "…and the rest of a short view follows it, with no Show more");
    assert.deepStrictEqual(s.moreTitles, seq("Monday", 6, 15));
    assert.strictEqual(s.button, null, "nothing more to show");

    // Tomorrow: the exhibition is listed under tomorrow there, still once.
    page.run("clearAllFilters()");
    page.run("activateWhen('tomorrow')");
    s = stream(page);
    assert.strictEqual(s.head, "Showing 26 events tomorrow");
    assert.deepStrictEqual(s.first.concat(s.more).map((g) => g.day).filter((d, i, a) => a.indexOf(d) === i), [day(1)]);
    assert.strictEqual(s.titles.filter((t) => t === "Long Run").length, 1);
    assert.strictEqual(s.first[0].tomorrow, true);

    // Nothing at all: the empty state, and no continuation.
    page.run("clearAllFilters()");
    page.fire("search", "input", { value: "zzzz" });
    assert.ok(/class="empty-state"/.test(page.el("listView").innerHTML));
    assert.strictEqual(page.el("listMore").style.display, "none");
  }
  console.log("PASS: 2. the stream — each event once, 5 rows then 35 more after the rail, Show more in steps of 60, whole-view counts, restart on a new view, hidden continuation for a short one");

  // =====================================================================
  // 3. The hero's figures
  // =====================================================================
  {
    const page = await open("/?cats=film&q=monday");
    // The database's own count of approved current + upcoming events: all
    // 153 public rows start today or later or are still running. (It does
    // not apply the clock or the blocked-names list; DEC-023.)
    const countRequest = page.requests.find((r) => r.table === "events");
    assert.ok(decodeURIComponent(countRequest.url).includes(D.inventoryFilter(day(0))) && /status=eq\.approved/.test(countRequest.url));
    assert.strictEqual(page.el("heroStatNumber").textContent, "153");
    assert.strictEqual(page.el("heroStatCaption").textContent, "Current + upcoming events");
    // Supporting figures ignore the visitor's own filters (film + "monday").
    assert.strictEqual(page.el("heroStatToday").textContent, "31", "still on or to come today");
    assert.strictEqual(page.el("heroStatNext7").textContent, "79", "today plus six days: today's 31, Sunday's 25, Monday's 15, and two a day for the next four");
    assert.strictEqual(page.el("heroStatNeighborhoods").textContent, "2", "Midtown and Corktown");

    // Following a figure shows exactly that many: everything else is reset.
    page.run("viewEverything('today')");
    assert.deepStrictEqual(plain(page.get("state")), plain(D.change(D.defaults(), { when: "today" })));
    assert.strictEqual(page.el("search").value, "");
    assert.strictEqual(stream(page).head, "Showing 31 events today");
    assert.strictEqual(page.url(), "/?when=today");
    page.fire("search", "input", { value: "x" });
    page.run("viewEverything('next7')");
    assert.deepStrictEqual(plain(page.get("state")), plain(D.change(D.defaults(), { when: "next7" })));
    assert.deepStrictEqual(plain(D.window(page.get("state"), { now: new Date(NOW) })), { mode: "next7", from: day(0), to: day(6) }, "today and the six days after it, in Detroit");
    assert.strictEqual(stream(page).head, "Showing 79 events in the next 7 days");
    assert.strictEqual(page.url(), "/?when=next7");
    assert.deepStrictEqual([...SCRIPT.matchAll(/class="hps-label">([^<]*)</g)].map((m) => m[1]), ["Today", "Next 7 days", "Active neighborhoods"], "the hero's three supporting figures (This Week is gone)");
    assert.ok(!/viewThisWeek/.test(SCRIPT));
    // Each figure's own button opens the view it counts.
    const heroButtons = [...SCRIPT.matchAll(/class="hero-proof-stat" onclick="([^"]*)"><span class="hps-num" id="([^"]*)"/g)].map((m) => [m[2], m[1]]);
    assert.deepStrictEqual(heroButtons, [["heroStatToday", "viewEverything('today')"], ["heroStatNext7", "viewEverything('next7')"], ["heroStatNeighborhoods", "viewNeighborhoodsRail()"]]);
    page.fire("search", "input", { value: "x" });
    page.run("viewEverything()");
    assert.deepStrictEqual(plain(page.get("state")), plain(D.defaults()), "the total leads to the whole stream");
    assert.strictEqual(stream(page).head, "All events");
    assert.strictEqual(page.url(), "/");
    assert.strictEqual(page.el("whenDateInput").value, day(0), 'the "From" input is back at its baseline');

    // A four-digit total is written with its comma, and read back correctly.
    page.run("orbitEventTotal = 1953; renderHeroToday();");
    assert.strictEqual(page.el("heroStatNumber").textContent, "1,953");
    page.run("orbitEventTotal = 1954; renderHeroToday();");
    assert.strictEqual(page.el("heroStatNumber").textContent, "1,954");
  }
  {
    // If the count request fails, the total is the same thing counted over
    // what the page loaded — never blank, never a made-up number.
    const page = await open("/", { failure: (r) => (r.table === "events" ? 500 : null) });
    assert.strictEqual(page.get("orbitEventTotal"), null);
    assert.strictEqual(page.el("heroStatNumber").textContent, "151");
  }
  console.log("PASS: 3. hero — the database's current + upcoming total (falling back to the loaded count), Today / Next 7 Days / Active Neighborhoods independent of the visitor's filters, and each figure leads to exactly that view");

  // =====================================================================
  // 4. Don't Miss
  // =====================================================================
  {
    // Nothing is selected in the page's source, and nothing is requested.
    assert.ok(/^let dontMissPlacements = \[\];$/m.test(SCRIPT), "the placement list is empty in the source");
    assert.strictEqual([...SCRIPT.matchAll(/dontMissPlacements\s*=[^=]/g)].length, 2, "…and only the placements-file loader assigns it");
    assert.ok(/dontMissPlacements = data\.placements/.test(SCRIPT));
    const seeded = JSON.parse(read("data/dont-miss.json"));
    // Shipped today: the three seasonal guides as static editorial cards (no
    // canonical event is selected), each with its optimized artwork on disk.
    assert.deepStrictEqual(seeded.placements.map((p) => p.title), ["Detroit Orbit Fall Guide", "Halloween in the Orbit", "Fall Colors"]);
    assert.deepStrictEqual(seeded.placements.map((p) => p.cta), ["Explore fall", "Get spooky", "Chase color"]);
    assert.ok(seeded.placements.every((p) => p.eventId === undefined && p.copy && p.alt), "static cards: copy and alt text, no event id");
    for (const p of seeded.placements) for (const f of [p.image, p.image2x]) assert.ok(fs.existsSync(`${REPO_DIR}${f}`), `${f} exists`);
    assert.ok(seeded.placements.every((p) => !p.href && !p.url), "the cards do not navigate: the guide pages do not exist yet");
    const page = await open("/");
    assert.strictEqual(page.el("dontMissSection").style.display, "none", "with no placements the section is hidden");
    assert.strictEqual(page.el("dontMissSection").innerHTML, "");
    assert.ok(!page.requests.some((r) => r.table === "events_public" && /miss/i.test(r.url || "")), "placements never come from the database");

    // Given placements (as a future source would supply them), it shows the
    // ones that are in their period and whose event is current — at most three.
    page.run(`EVENTS.forEach(e => { e.imageUrl = e.id === "w03" ? "" : "https://img.example/" + e.id + ".jpg"; });`);
    page.run(`dontMissPlacements = [
      { eventId: "w03", reason: "Has no image, so it is skipped." },
      { eventId: "u03", reason: "One night only.", eyebrow: "Detroit debut" },
      { eventId: "x01", reason: "Already over today." },
      { eventId: "x02", reason: "A blocked name." },
      { eventId: "nope", reason: "No such event." },
      { eventId: "w10", reason: "Placement ended.", to: "${day(-1)}" },
      { eventId: "w11", reason: "Placement not started.", from: "${day(1)}" },
      { eventId: "a00", reason: "", from: "${day(-2)}", to: "${day(5)}" },
      { eventId: "u03", reason: "Listed twice." },
      { eventId: "w01", reason: "Third." },
      { eventId: "w02", reason: "Fourth — over the limit." },
    ]; renderDontMiss();`);
    const html = page.el("dontMissSection").innerHTML;
    assert.strictEqual(page.el("dontMissSection").style.display, "");
    assert.deepStrictEqual([...html.matchAll(/class="dm-name">([^<]*)</g)].map((m) => m[1]), ["Sunday 03", "Long Run", "Later 01"]);
    assert.deepStrictEqual([...html.matchAll(/class="dm-reason">([^<]*)</g)].map((m) => m[1]), ["One night only.", "Third."], "the reason is the editor's; none is invented where none was given");
    assert.ok(!/Has no image/.test(html), "a placement whose event has no usable image is skipped; the next one fills the slot");
    assert.strictEqual([...html.matchAll(/<img class="dm-art"/g)].length, 3, "every rendered card has its image");
    // An image that fails to load drops its card and the next placement takes the slot.
    page.run(`dmImageFailed({ getAttribute: () => "https://img.example/u03.jpg" });`);
    const afterFail = page.el("dontMissSection").innerHTML;
    assert.ok(!/Sunday 03/.test(afterFail) && [...afterFail.matchAll(/class="dm-card"/g)].length === 3, "a failed image removes its card and the rail refills to three");
    page.run(`dmBadImages.clear(); renderDontMiss();`);
    assert.ok(/<h2 class="dm-title">Don't Miss<span class="dm-sig" aria-hidden="true"><\/span><\/h2>/.test(html));
    assert.ok(html.includes("Extraordinary events. Handpicked for this moment."), "the descriptor");
    assert.deepStrictEqual([...html.matchAll(/class="dm-eyebrow">([^<]*)</g)].map((m) => m[1]), ["Detroit debut"], "an eyebrow only where an editor wrote one");
    assert.strictEqual([...html.matchAll(/<a class="dm-card" href="event\.html\?id=/g)].length, 3, "each card links to its canonical event page");
    assert.strictEqual([...html.matchAll(/class="dm-date"/g)].length, 3, "each card carries its date");
    assert.ok(!/View all/i.test(html), "no View all: there is no destination for it");
    assert.ok(!/ntbm|NOT TO BE MISSED/i.test(html), "not the old giant seasonal-card treatment");
    // Static editorial cards share the rail and its three-card limit with
    // event placements; one without artwork is skipped like an event without.
    page.run(`dontMissPlacements = [
      { title: "No art", copy: "Skipped.", cta: "Go" },
      { title: "Fall Guide", copy: "Cider mills.", cta: "Explore fall", image: "/assets/guides/fall-guide-800.webp", image2x: "/assets/guides/fall-guide-1600.webp", alt: "A cider press.", focus: "right" },
      { eventId: "u03", reason: "An event beside it." },
    ]; renderDontMiss();`);
    const mixed = page.el("dontMissSection").innerHTML;
    assert.deepStrictEqual([...mixed.matchAll(/class="dm-name">([^<]*)</g)].map((m) => m[1]), ["Fall Guide", "Sunday 03"]);
    assert.ok(/class="dm-cta">Explore fall &rarr;</.test(mixed), "the CTA text shows");
    assert.ok(/srcset="[^"]*\/assets\/guides\/fall-guide-800\.webp 800w, [^"]*\/assets\/guides\/fall-guide-1600\.webp 1600w"/.test(mixed) && /alt="A cider press\."/.test(mixed) && /object-position:right/.test(mixed));
    assert.strictEqual([...mixed.matchAll(/<div class="dm-card dm-feature">/g)].length, 1, "a static card is not a link");
    assert.ok(/<h2 class="dm-title">Don't Miss<span class="dm-sig" aria-hidden="true"><\/span><\/h2>/.test(mixed), "the signal dot is inside the title: one lockup");
    // The loader reads the placements file; an unusable file changes nothing.
    page.run(`dontMissPlacements = []; globalThis.fetch = async () => ({ ok: true, json: async () => ({ placements: [{ eventId: "u03", eyebrow: "From the file" }] }) }); loadDontMissPlacements();`);
    await page.settle();
    assert.ok(/class="dm-eyebrow">From the file</.test(page.el("dontMissSection").innerHTML), "placements from the file are shown");
    page.run(`globalThis.fetch = async () => ({ ok: true, json: async () => ({ nonsense: 1 }) }); loadDontMissPlacements();`);
    await page.settle();
    assert.ok(/From the file/.test(page.el("dontMissSection").innerHTML), "an unusable file leaves what was there");
    // And it clears again.
    page.run("dontMissPlacements = []; render();");
    assert.strictEqual(page.el("dontMissSection").style.display, "none");
    assert.strictEqual(page.el("dontMissSection").innerHTML, "");
  }
  console.log("PASS: 4. Don't Miss — nothing selected in the source and nothing requested; hidden with no placements; shows only active placements of current events, at most three");

  console.log("\nAll homepage stream tests passed.");
}

run().catch((err) => { console.error("FAIL:", err); process.exitCode = 1; });
