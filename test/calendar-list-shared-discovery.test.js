// test/calendar-list-shared-discovery.test.js — Calendar UI slice 1: the
// List on the shared Discovery layer (2026-10-08).
//
// Calendar now holds ONE Discovery state, reads and writes the shared URL
// codec, filters with Discovery.matches(), uses the homepage's WHEN / WHERE /
// WHAT / SEARCH board, and opens on LIST — one chronological stream in the
// homepage's departure-board rows. The legacy Month and Map views keep
// working during the transition (?view=month, ?view=map). This file RUNS
// calendar.html's real script against a small in-memory database and a
// fixed clock (test/fixtures/fake-dom.js), and proves:
//
//   1. List is the default view, from today on, each event once;
//   2. pagination — 40 rows first, "Show more" appends whole days, URL
//      untouched by paging;
//   3. the feed states — loading and error never show fallback data;
//   4. the readouts — DEC-026: no Active Cities; counts are Discovery's;
//   5. legacy compatibility — view=month and view=map still open the
//      existing views, with their date= position; view never leaks into the
//      shared query;
//   6. the shared query — Home -> Calendar -> Orbit links carry one state;
//      the neighborhood filter works (venue -> neighborhood join);
//   7. rows — never more than four actions; events.note never reaches the
//      page;
//   8. the empty query;
//   9. structure — discovery.js and /site.css are loaded; the Calendar's
//      .ics description carries no note.
//
// "Today" is Saturday 2026-10-03, 3:00 PM in Detroit.
//
// Run: node test/calendar-list-shared-discovery.test.js
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

const HTML = read("calendar.html");
const SCRIPT = inlineScript(HTML);
const NOW = "2026-10-03T19:00:00Z"; // Sat 3:00 PM, Detroit
const TODAY = "2026-10-03";
const day = (n) => new Date(Date.UTC(2026, 9, 3 + n)).toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, "0");
const CTX = { now: new Date(NOW) };

// ---- the database --------------------------------------------------------
function row(id, title, start, extra) {
  return Object.assign({
    id, title, description: null, image_url: null, start_date: start, end_date: null,
    venue_name_raw: "Hall", venue_city_raw: "Detroit", venue_id: null, venues: null,
    category: "music", time_display: "7:00 PM", is_free: false, source: "Manual", note: null,
    ticket_url: null, event_url: null, price_from: null, ticket_status: null, status: "approved",
  }, extra || {});
}
const ROWS = [
  // Long ago: history the legacy Month still browses, never in the List.
  row("h01", "Last Spring", "2026-04-11"),
  // An exhibition that opened three days ago and runs another month.
  row("a00", "Long Run", day(-3), { end_date: day(30), category: "museum" }),
  // 30 today (one at a Corktown venue), 25 tomorrow, 15 on Monday.
  ...Array.from({ length: 30 }, (_, i) => row("t" + pad(i + 1), "Today " + pad(i + 1), day(0), i === 0 ? { venue_id: "ven-ck" } : null)),
  ...Array.from({ length: 25 }, (_, i) => row("u" + pad(i + 1), "Sunday " + pad(i + 1), day(1), { category: "theatre" })),
  ...Array.from({ length: 15 }, (_, i) => row("v" + pad(i + 1), "Monday " + pad(i + 1), day(2), { category: "film", is_free: true })),
  // 80 more, two a day, from Tuesday on.
  ...Array.from({ length: 80 }, (_, i) => row("w" + pad(i + 1), "Later " + pad(i + 1), day(3 + Math.floor(i / 2)), { category: "community" })),
  // Both a ticket link and an event page; a private note the page must never show.
  row("z01", "Two Links", day(1), { ticket_url: "https://tickets.example/z01", event_url: "https://venue.example/z01", note: "SECRET-INTERNAL-NOTE" }),
  // Already over today, a blocked name, and one that is not public.
  row("x01", "Morning Thing", day(0), { time_display: "9:00 AM–11:00 AM" }),
  row("x02", "Augustus Williams Live", day(1)),
  row("x03", "Not Approved", day(0), { status: "pending_review" }),
];
const TABLES = {
  events: ROWS,
  venues: [{ id: "ven-ck", name: "Hall", neighborhood_id: "nb-1", lat: null, lng: null }],
  neighborhoods: [{ id: "nb-1", name: "Corktown" }],
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
    url: url || "/calendar.html", now: NOW, seed: SEED, fetch: opts.fetch || api.fetch,
    scripts: [read("legal-snippets.js"), read("paged-fetch.js"), read("discovery.js"), SCRIPT],
    names: ["legal-snippets.js", "paged-fetch.js", "discovery.js", "calendar.html <script>"],
  });
  if (!opts.noSettle) await page.settle();
  page.requests = api.log;
  return page;
}

// The List, as day groups.
function list(page) {
  const html = page.el("calList").innerHTML;
  const groups = html.split(/<div class="list-day-group" data-day="(?=\d{4}-\d{2}-\d{2}")/).slice(1).map((g) => ({
    day: g.slice(0, 10),
    rel: (/class="ldh-rel[^"]*">([^<]*)</.exec(g) || [])[1] || null,
    count: (/class="ldh-count">([^<]*)</.exec(g) || [])[1],
    view: /class="cal-view"/.test(g),
    titles: [...g.matchAll(/class="evt-title-link"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]),
  }));
  return {
    html, groups,
    titles: groups.flatMap((g) => g.titles),
    button: (/class="stream-more-btn"[^>]*>([^<]*)</.exec(html) || [])[1] || null,
    note: (/class="stream-foot-note">([^<]*)</.exec(html) || [])[1] || null,
    orbit: (/class="stream-foot-link" href="([^"]*)"/.exec(html) || [])[1] || null,
  };
}
const readouts = (page) => ["roTotal", "roToday", "roNext7", "roHoods"].map((id) => page.el(id).textContent);
// What the List should hold for a query: every match, once, in Discovery's terms.
function expectedCount(stateQuery) {
  const events = ROWS.filter((r) => r.status === "approved").map((r) => ({
    id: r.id, date: r.start_date, endDate: r.end_date || r.start_date, title: r.title, venue: r.venue_name_raw,
    cat: r.category, time: r.time_display, free: r.is_free, source: r.source, neighborhood: r.venue_id === "ven-ck" ? "Corktown" : null,
    ticketUrl: r.ticket_url || undefined,
  }));
  return D.count(events, D.fromQuery(stateQuery || ""), { now: new Date(NOW), defaultWhen: "all" });
}

async function run() {
  // =====================================================================
  // 1. LIST is the default: today on, each event once
  // =====================================================================
  {
    const page = await open("/calendar.html");
    assert.strictEqual(page.get("mode"), "list", "no view param opens the List");
    assert.strictEqual(page.el("calList").hidden, false, "the List is showing");
    assert.ok(page.document.body.classList.contains("mode-list"), "the legacy Month/Map chrome is hidden in List");
    assert.strictEqual(page.url(), "/calendar.html", "a List with no filters writes a bare URL: no view, no date");
    const l = list(page);
    assert.strictEqual(l.groups[0].day, TODAY, "the List starts today");
    assert.strictEqual(l.groups[0].rel, "Today", "today's heading carries the Today label");
    assert.ok(l.groups[0].view, "the first day heading carries the view control");
    assert.ok(!l.groups.slice(1).some((g) => g.view), "only the first day heading carries it");
    assert.ok(l.titles.includes("Long Run"), "an event in progress is listed (under today)");
    assert.ok(!l.titles.includes("Last Spring"), "history is not in the List");
    assert.ok(!l.titles.includes("Morning Thing"), "what is already over today is not listed");
    assert.ok(!/Augustus Williams/.test(l.html), "the blocked name is suppressed (Discovery.matches)");
    assert.ok(!/Not Approved/.test(l.html), "only approved rows are read");
    assert.strictEqual(new Set(l.titles).size, l.titles.length, "each event once");
    assert.ok(/class="ldh-count">31 events &middot; 30 start today &middot; 1 continuing</.test(l.html), "today's counts: every event listed under it, starts and continuing");
    console.log("PASS: 1. List is the default view — from today, each event once, the first heading carries the view control, a bare URL");
  }

  // =====================================================================
  // 2. Pagination: 40 rows, then whole days
  // =====================================================================
  {
    const page = await open("/calendar.html");
    let l = list(page);
    const total = expectedCount("");
    assert.strictEqual(l.titles.length, 40, "40 rows on first paint");
    assert.strictEqual(l.note, `40 of ${total} shown &middot; in date order`);
    // Rows 33..58 are tomorrow (26 events); 40 + 60 = 100 lands mid-day, so the step runs to its end.
    const step = Number((/Show (\d+) more/.exec(l.button) || [])[1]);
    page.run("showMoreList()");
    l = list(page);
    assert.strictEqual(l.titles.length, 40 + step, "Show more adds exactly what its label says");
    assert.ok(l.titles.length >= 100, "at least 60 more");
    const lastDay = l.groups[l.groups.length - 1].day;
    const rowsOnLastDay = expectedCount(`when=dates&from=${lastDay}&to=${lastDay}`);
    // (the Long Run exhibition belongs to every one of those days but is listed once, under today)
    assert.strictEqual(l.groups[l.groups.length - 1].titles.length, rowsOnLastDay - (lastDay > TODAY ? 1 : 0), "the last day on the page is complete — paging never splits a day");
    assert.strictEqual(page.url(), "/calendar.html", "paging does not touch the URL");
    // Exhausted: "All N shown", no button.
    for (let i = 0; i < 5; i++) page.run("showMoreList()");
    l = list(page);
    assert.strictEqual(l.titles.length, total);
    assert.strictEqual(l.button, null);
    assert.strictEqual(l.note, `All ${total} shown &middot; in date order`);
    // A different query starts again from 40.
    page.run("setState({q: 'Later'}); render();");
    assert.strictEqual(list(page).titles.length, 40);
    console.log(`PASS: 2. 40 rows first, "Show ${step} more" appends whole days, URL unchanged by paging, a new query starts from 40`);
  }

  // =====================================================================
  // 3. Feed states: loading and error never show fallback data
  // =====================================================================
  {
    const loading = await open("/calendar.html", { noSettle: true });
    assert.strictEqual(loading.get("feedStatus"), "loading");
    assert.deepStrictEqual(readouts(loading), ["—", "—", "—", "—"], "readouts read — while loading");
    assert.ok(/class="cal-pending"/.test(loading.el("calList").innerHTML), "rows reserve their place with rules only");
    assert.ok(!/evt-title/.test(loading.el("calList").innerHTML), "no fallback events are shown as live");

    const failing = await open("/calendar.html", { fetch: async (url) => { if (/\/rest\/v1\/events\?/.test(url)) throw new Error("network down"); return { ok: false, status: 503, json: async () => [], text: async () => "", headers: { get: () => null } }; } });
    assert.strictEqual(failing.get("feedStatus"), "error");
    const html = failing.el("calList").innerHTML;
    assert.ok(/Couldn&rsquo;t reach the event feed/.test(html) && /class="cal-retry"[^>]*>Retry</.test(html), "one line in the foot slot, with Retry");
    assert.ok(!/evt-title/.test(html), "still no fallback events in the List");
    assert.deepStrictEqual(readouts(failing), ["—", "—", "—", "—"]);
    console.log("PASS: 3. loading shows — and reserved rows; a failed feed says so with Retry; fallback data never reaches the List");
  }

  // =====================================================================
  // 4. Readouts (DEC-026)
  // =====================================================================
  {
    const labels = [...HTML.matchAll(/<div class="cal-readout[^"]*"><b id="ro\w+"[^>]*>[^<]*<\/b><span>([^<]*)<\/span><\/div>/g)].map((m) => m[1]);
    assert.deepStrictEqual(labels, ["Current + upcoming", "Today", "Next 7 days", "Active neighborhoods"], "four readouts, in the board's order");
    const titleBlock = HTML.slice(HTML.indexOf('<section class="cal-title"'), HTML.indexOf("</section>", HTML.indexOf('<section class="cal-title"')));
    assert.ok(!/cities/i.test(titleBlock.replace(/<!--[\s\S]*?-->/g, "")), "no Active Cities readout (DEC-026)");
    const page = await open("/calendar.html");
    const all = expectedCount("when=all"), today = expectedCount("when=today"), next7 = expectedCount("when=next7");
    assert.deepStrictEqual(readouts(page), [all, today, next7, 1].map((n) => n.toLocaleString("en-US")), "counts are Discovery's, the neighborhood from the venue join");
    // Scoped to WHAT, not to WHEN.
    const film = await open("/calendar.html?when=tomorrow&cats=film");
    assert.deepStrictEqual(readouts(film), [expectedCount("cats=film&when=all"), expectedCount("cats=film&when=today"), expectedCount("cats=film&when=next7"), 0].map((n) => n.toLocaleString("en-US")), "readouts follow WHAT; the When is their own");
    console.log(`PASS: 4. four readouts (${readouts(page).join(" / ")}), no Active Cities; scoped to WHERE/WHAT/SEARCH, not WHEN`);
  }

  // =====================================================================
  // 5. Legacy Month and Map keep working
  // =====================================================================
  {
    const month = await open("/calendar.html?view=month&date=2026-11-14&cats=music");
    assert.strictEqual(month.get("mode"), "month", "view=month opens the existing Month view");
    assert.strictEqual(month.el("calList").hidden, true);
    assert.strictEqual(month.el("calWrap").style.display, "block");
    assert.ok(!month.document.body.classList.contains("mode-list"));
    assert.strictEqual(month.get("current.getMonth()"), 10, "date= still positions the month");
    assert.strictEqual(month.get("selectedDate"), "2026-11-14", "and opens that day");
    assert.ok(/<div class="cal-grid"|day-cell/.test(month.el("calGrid").innerHTML), "the month grid renders");
    assert.strictEqual(month.url(), "/calendar.html?date=2026-11-14&view=month&cats=music", "Month writes its position and an explicit view=month");

    const map = await open("/calendar.html?view=map&when=weekend");
    assert.strictEqual(map.get("mode"), "map", "view=map opens the existing Map view, not the List");
    assert.ok(map.el("mapView").classList.contains("show"));
    assert.ok(/city-row/.test(map.el("cityRail").innerHTML), "the city rail renders");
    assert.ok(/view=map/.test(map.url()) && /when=weekend/.test(map.url()));

    const legacyList = await open("/calendar.html?view=list&when=weekend");
    assert.strictEqual(legacyList.get("mode"), "list", "an old view=list link opens the List");
    const weekend = await open("/calendar.html?when=weekend");
    assert.strictEqual(weekend.get("mode"), "list");

    // Switching views from the List.
    const page = await open("/calendar.html?cats=film");
    page.run("setMode('month')");
    assert.strictEqual(page.get("mode"), "month");
    assert.ok(/view=month/.test(page.url()) && /cats=film/.test(page.url()), "the query survives the switch");
    page.run("setMode('list')");
    assert.strictEqual(page.url(), "/calendar.html?cats=film");

    // `view` and `date` are this page's position, never the shared query.
    assert.deepStrictEqual(plain(D.fromQuery("?view=month&date=2026-11-14&cats=music")), plain(D.fromQuery("?cats=music")));
    assert.deepStrictEqual(plain(D.fromQuery("?view=map")), plain(D.defaults()));
    console.log("PASS: 5. view=month and view=map open the existing views with their date= position; view=list and no view open the List; view never leaks into the shared query");
  }

  // =====================================================================
  // 6. One query across Home -> Calendar -> Orbit
  // =====================================================================
  {
    const states = [
      D.defaults(),
      D.change(D.defaults(), { when: "weekend" }),
      D.change(D.change(D.defaults(), { what: { only: "music" } }), { free: true }),
      D.change(D.defaults(), { when: { from: "2026-11-14", to: "2026-11-20" } }),
      D.change(D.defaults(), { where: { place: "Ann Arbor", radius: 25 } }),
      D.change(D.defaults(), { where: { neighborhood: "Corktown" } }),
      D.change(D.change(D.defaults(), { when: "tomorrow" }), { q: "jazz trio" }),
      D.change(D.defaults(), { feature: { add: "tickets" } }),
    ];
    for (const s of states) {
      const home = D.href("calendar", s, CTX);
      const page = await open(home);
      assert.deepStrictEqual(plain(page.get("state")), plain(s), `Calendar reads ${home} as the same state`);
      assert.strictEqual(page.get("mode"), "list");
      const orbit = list(page).orbit;
      if (orbit) assert.strictEqual(orbit.replace(/&amp;/g, "&"), D.href("map", s, CTX), "the sibling link to the Orbit carries the same state");
      // …and what the Calendar writes back reads as the same state again.
      assert.deepStrictEqual(plain(D.fromQuery(page.url().slice(page.url().indexOf("?") + 1 || page.url().length))), plain(s), `the Calendar's own URL round-trips for ${home}`);
    }
    const hood = await open("/calendar.html?neighborhood=Corktown");
    assert.deepStrictEqual(list(hood).titles, ["Today 01"], "the neighborhood filter works on the Calendar (venue -> neighborhood, the events_public join)");
    assert.ok(/<span>Corktown<\/span>/.test(list(hood).html), "and the row shows the neighborhood");
    const req = hood.requests.map((r) => r.url).find((u) => /\/venues\?select=id,neighborhood_id/.test(u));
    assert.ok(req, "the join reads venues' real neighborhood_id, not a name match");
    console.log(`PASS: 6. ${states.length} states: Home's Discovery.href('calendar') opens the same state on the Calendar; the Orbit link and the Calendar's own URL carry it on; neighborhood works`);
  }

  // =====================================================================
  // 7. Rows: four actions at most; events.note never reaches the page
  // =====================================================================
  {
    const page = await open("/calendar.html?q=Two%20Links");
    const html = list(page).html;
    assert.ok(/Two Links/.test(html));
    const rowHtml = html.slice(html.indexOf('<div class="evt-row">'));
    const actions = rowHtml.slice(rowHtml.indexOf('<div class="evt-actions">'), rowHtml.indexOf("</div>", rowHtml.indexOf('<div class="evt-actions">')));
    assert.ok(/Tickets &amp; info/.test(actions), "Tickets & info");
    assert.ok(!/Event page/.test(actions), "no second link when there is a ticket link (four actions at most)");
    assert.ok(/Google Cal/.test(actions) && /Apple\/Outlook/.test(actions) && /class="evt-share"/.test(actions), "Google Cal, Apple/Outlook, Share");
    assert.ok(!/SECRET-INTERNAL-NOTE/.test(page.el("calList").innerHTML), "a row's private note never reaches the page");
    const eventsReads = page.requests.filter((r) => r.table === "events").map((r) => r.url);
    assert.ok(eventsReads.length && eventsReads.every((u) => !/[,=]note[,&]/.test(u)), "the events read never selects note");
    console.log("PASS: 7. rows carry at most four actions (Tickets & info, Google Cal, Apple/Outlook, Share); events.note is neither read nor rendered");
  }

  // =====================================================================
  // 8. The empty query
  // =====================================================================
  {
    const page = await open("/calendar.html?q=nothing-matches-this");
    const html = page.el("calList").innerHTML;
    assert.ok(/<h2 class="disp">Nothing on<\/h2>/.test(html), "Nothing on");
    assert.ok(/&quot;nothing-matches-this&quot;|"nothing-matches-this"/.test(html), "the query restated");
    assert.ok(new RegExp(`0 of ${expectedCount("")} current \\+ upcoming match`).test(html));
    assert.ok(new RegExp(`Clear all<b>&middot; ${expectedCount("")}</b>`).test(html), "Clear all, with its real count");
    // A widening that helps is offered with its count; one that doesn't, isn't.
    const tue = await open("/calendar.html?when=tomorrow&cats=film");
    const w = tue.el("calList").innerHTML;
    assert.ok(/Tomorrow → Anytime<b>&middot; 15<\/b>/.test(w), "widening the When finds Monday's 15 films");
    assert.ok(/Film → All types<b>&middot; 27<\/b>/.test(w), "widening WHAT finds tomorrow's 27");
    console.log("PASS: 8. an empty query says Nothing on, restates the query, and offers only widenings that find something, with real counts");
  }

  // =====================================================================
  // 9. Structure
  // =====================================================================
  {
    assert.ok(/<script src="\/discovery\.js"><\/script>/.test(HTML), "calendar.html loads discovery.js");
    assert.ok(HTML.indexOf('<script src="/discovery.js">') < HTML.indexOf('<script src="/config.js">'), "before config.js, as the homepage does");
    assert.ok(/<link rel="stylesheet" href="\/site\.css">\s*<style>/.test(HTML), "calendar.html links /site.css immediately before its own <style>");
    assert.ok(!/<link rel="stylesheet" href="\/site\.css">/.test(read("index.html")), "the homepage does not link it (unchanged in this slice)");
    const m = HTML.match(/function buildEventDescription\(e\)\{[\s\S]*?\n\}/);
    assert.ok(m && !/note/.test(m[0]), "the Calendar's .ics / Google Cal description carries no note");
    assert.ok(!/id="search"[^>]*placeholder="Search events, venues&hellip;"/.test(HTML), "no second search box: SEARCH is the board's");
    assert.strictEqual((HTML.match(/id="search"/g) || []).length, 1, "one search input");
    console.log("PASS: 9. discovery.js and /site.css are loaded; one search box; the .ics description has no note");
  }

  console.log("\nAll Calendar List tests passed.");
}

run().catch((e) => { console.error("FAIL:", e); process.exit(1); });
