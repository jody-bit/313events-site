// test/cron-localist-runlog.test.js — api/cron-localist.js end to end: its own
// handler, a stand-in for each tenant's API that behaves as the real ones
// were measured to (test/fixtures/localist-api.js), and the shared fake
// database, which rejects what production rejects.
//
// The decisions themselves (eligibility, place, runs, names) are tested in
// test/localist-rows.test.js. This file is about what the connector FETCHES
// and what reaches the database:
//   1. the tenants, and that nothing is published without review;
//   2. the 90-day listing is read in full, page by page;
//   3. a row keeps its name from one day's run to the next — no duplicate is
//      ever written for a drive, an exhibition or a series;
//   4. a listing with a failed page writes nothing for that tenant;
//   5. an event whose full schedule cannot be read is left out, not guessed;
//   6. statuses a reviewer has set survive; venues are linked only safely;
//   7. the run log says what happened;
//   8. a row the source no longer lists is withdrawn, and comes back if it
//      is listed again; what a reviewer or the enrichment job added to a
//      row is not erased by the next run;
//   9. the withdrawal's own edges: an entry deleted and made again, an event
//      under way, an event that moves, a reviewer who disagrees.
// Sections 4b, 6b, 8 and 9 are cases two rounds of independent review used
// to break earlier versions.
//
// Run: node test/cron-localist-runlog.test.js
"use strict";
const assert = require("assert");

const { world, runConnector, sentRows, eventWrites, shapeCount, byId, REPO_DIR, SUPABASE_URL } = require("./fixtures/connector-harness.js");
const { makeLocalistApi, event, instance, daily, isoPlusDays, PLACES } = require("./fixtures/localist-api.js");

const BGSU = "https://events.bgsu.edu";
const MACOMB = "https://events.macomb.edu";

// Two tenants behind one upstream function.
function tenants({ today, bgsu = [], macomb = [], failPage, failEvent }) {
  const b = makeLocalistApi({ base: BGSU, events: bgsu, today, failPage: failPage && ((p) => failPage("bgsu", p)), failEvent });
  const m = makeLocalistApi({ base: MACOMB, events: macomb, today, failPage: failPage && ((p) => failPage("macomb", p)), failEvent });
  return {
    b,
    m,
    setToday(day) { b.state.today = day; m.state.today = day; },
    upstream: (url) => b.handle(url) || m.handle(url),
  };
}
const runLog = (tables) => tables.source_runs[tables.source_runs.length - 1];

async function run() {
  // --- 1. Tenants and publication. ---
  {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    for (const key of Object.keys(require.cache)) if (key.startsWith(`${REPO_DIR}/api/`)) delete require.cache[key];
    const { TENANTS, HORIZON_DAYS, MAX_PAGES_PER_TENANT } = require(`${REPO_DIR}/api/cron-localist.js`);
    assert.ok(Object.isFrozen(TENANTS));
    assert.deepStrictEqual(TENANTS.map((t) => [t.tenantSlug, t.apiBase, t.source]), [
      ["bgsu", BGSU, "Bowling Green State University"],
      ["macomb", MACOMB, "Macomb Community College"],
    ], "only the two campuses independently confirmed as Localist tenants");
    for (const t of TENANTS) {
      assert.strictEqual(t.defaultStatus, "pending_review", `${t.tenantSlug}: publication is the Product Owner's decision and is not made by this change`);
      assert.deepStrictEqual([...t.publicAudiences], ["General Public"]);
    }
    assert.strictEqual(HORIZON_DAYS, 90);
    assert.ok(MAX_PAGES_PER_TENANT >= 20, "Bowling Green needs 7 pages for 90 days; the ceiling must be well clear of that");
  }
  console.log("PASS: two confirmed tenants; every new row is still pending_review");

  // --- 2. The whole 90-day listing, page by page; one day's run. ---
  {
    // 230 separate public events at Macomb -> three pages of 100.
    const many = Array.from({ length: 230 }, (_, i) => event(`Community Lecture ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-06", i % 80), "18:00", "19:30")], ...PLACES.CENTER_CAMPUS }));
    const beyond = event("Spring Open House", { instances: [instance("2027-02-20", "10:00")], ...PLACES.CENTER_CAMPUS });
    const t = tenants({
      today: "2026-10-05",
      macomb: [...many, beyond],
      bgsu: [
        event("Symphonic Band", { instances: [instance("2026-10-20", "20:00", "21:30")], types: ["Performances and Exhibits"], free: true, ...PLACES.FINE_ARTS }),
        event("BGSU Hockey vs Michigan", { instances: [instance("2026-10-23", "19:07", "22:07")], types: ["Sporting Events", "BGSU Athletics"], ...PLACES.HOME_STROH }),
        event("BGSU Football at Western Michigan", { instances: [instance("2026-10-24", "15:30", "18:30")], types: ["Sporting Events", "BGSU Athletics"], ...PLACES.AWAY_KALAMAZOO }),
        event("Mindful Moments", { instances: [instance("2026-10-12", "09:00", "09:15")], audiences: ["Undergraduate Students"], ...PLACES.JEROME_LIBRARY }),
        event("Explore BGSU's Graduate Programs", { instances: [instance("2026-10-12", "12:00")], experience: "virtual" }),
      ],
    });
    const { tables, db } = world({ venues: [], upstream: t.upstream });
    const res = await runConnector("cron-localist.js");
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));

    const macombPages = t.m.state.requests.filter((u) => u.includes("/api/2/events?"));
    assert.strictEqual(macombPages.length, 3, "all three pages are read");
    assert.ok(macombPages.every((u) => u.includes("days=90") && u.includes("pp=100")), "the 90-day listing, 100 to a page");
    assert.deepStrictEqual(macombPages.map((u) => Number(new URL(u).searchParams.get("page"))).sort(), [1, 2, 3]);

    assert.strictEqual(res._body.upserted, 232, "230 lectures + the concert + the home game");
    assert.strictEqual(res._body.newRows, 232);
    assert.strictEqual(tables.events.length, 232);
    assert.strictEqual(res._body.checked, 235, "occurrences listed across both tenants");
    assert.strictEqual(res._body.skippedOutsideOrbit, 1);
    const [bgsuFunnel, macombFunnel] = res._body.funnels;
    assert.deepStrictEqual([bgsuFunnel.tenant, bgsuFunnel.pages, bgsuFunnel.eventsFetched, bgsuFunnel.eventsEligible, bgsuFunnel.rows], ["bgsu", 1, 5, 2, 2]);
    assert.deepStrictEqual(bgsuFunnel.skipped, { unusable: 0, canceled: 0, not_public_audience: 1, virtual: 1, non_event: 0, outside_orbit: 0, city_not_listed: 1, no_place: 0 });
    assert.deepStrictEqual(bgsuFunnel.notInOrbitPlaces, { "Kalamazoo, MI": 1 });
    assert.deepStrictEqual([macombFunnel.pages, macombFunnel.occurrencesFetched, macombFunnel.eventsEligible, macombFunnel.rows], [3, 230, 230, 230], "the open house five months out is not in the 90 days");
    assert.deepStrictEqual([bgsuFunnel.windowStart, bgsuFunnel.windowEnd], ["2026-10-05", "2027-01-03"]);

    // What a row looks like in the database.
    const band = tables.events.find((r) => r.title === "Symphonic Band");
    assert.deepStrictEqual(
      [band.external_id.startsWith("localist-bgsu-"), band.start_date, band.end_date, band.time_display, band.is_all_day, band.is_free, band.venue_name_raw, band.venue_city_raw, band.source, band.status],
      [true, "2026-10-20", null, "8:00 PM – 9:30 PM", false, true, "Fine Arts Center", "Bowling Green", "Bowling Green State University", "pending_review"]
    );
    const game = tables.events.find((r) => r.title === "BGSU Hockey vs Michigan");
    assert.deepStrictEqual([game.venue_name_raw, game.venue_city_raw, game.category, game.venue_id], ["Stroh Center", "Bowling Green", "sports", null]);
    assert.ok(!tables.events.some((r) => /Western Michigan|Mindful|Graduate Programs|Spring Open House/.test(r.title)));

    // Nothing but real columns is sent, and every row has the same columns:
    // 232 rows are ONE request, not one per combination of blanks.
    for (const row of sentRows(db)) {
      assert.ok(!Object.keys(row).some((k) => k.startsWith("_")), `no working field is written: ${Object.keys(row).filter((k) => k.startsWith("_"))}`);
      assert.ok("end_date" in row, "end_date is always sent");
      assert.strictEqual(row.status, "pending_review");
    }
    const sentGame = sentRows(db).find((r) => r.title === "BGSU Hockey vs Michigan");
    assert.deepStrictEqual([sentGame.venue_address_raw, sentGame.venue_city_raw, sentGame.venue_id], [null, "Bowling Green", null], "no street was given for the arena, and none is invented for a NEW row");
    assert.strictEqual(eventWrites(db).filter((r) => r.method === "POST").length, 1, "one request for the whole batch");
    for (const request of eventWrites(db).filter((r) => r.method === "POST")) assert.strictEqual(shapeCount(JSON.parse(request.body)), 1, "every request is uniform");

    const log = runLog(tables);
    assert.deepStrictEqual([log.outcome, log.records_fetched, log.records_parsed, log.records_written, log.source_slug], ["success", 235, 232, 232, "localist"]);
  }
  console.log("PASS: the whole 90-day listing is read; eligible events are written with the source's own fields; the rest are counted, not written");

  // --- 3. Day after day: no row is ever written twice. ---
  {
    const drives = [PLACES.CENTER_CAMPUS, { ...PLACES.CENTER_CAMPUS, location_name: "Center Campus, R Building", room_number: "Outside Room #166" }, PLACES.SOUTH_CAMPUS_J]
      .map((place) => event("Baby Item Donation", { instances: daily("2026-10-03", 18, "08:00"), ...place }));
    const exhibit = event("Made in Ohio Art Exhibit", { instances: [...daily("2026-09-01", 44, null), ...daily("2026-10-16", 20, null)], types: ["Performances and Exhibits"], ...PLACES.FINE_ARTS });
    const skate = event("Public Skate", { instances: [0, 1, 1, 2, 7, 8, 8, 9].map((d, i) => instance(isoPlusDays("2026-10-09", d), i % 2 ? "19:00" : "15:30", i % 2 ? "20:50" : "17:20")), ...PLACES.HOME_STROH });
    const expo = event("Metro Detroit Women's Expo", { instances: [instance("2026-10-03", "10:00", "18:00"), instance("2026-10-04", "11:00", "16:00")], ...PLACES.SOUTH_CAMPUS_J });
    const t = tenants({ today: "2026-10-03", macomb: [...drives, expo], bgsu: [exhibit, skate] });
    // Two rows the connector wrote before this change, one of them approved by a reviewer since.
    const existing = [
      { id: "old-1", external_id: `localist-macomb-${drives[0]._schedule[0].id}`, title: "Baby Item Donation", category: "community", start_date: "2026-10-03", status: "approved", source: "Macomb Community College", time_display: "8:00 AM" },
    ];
    const { tables, db } = world({ venues: [], events: existing, upstream: t.upstream });

    const idsEver = new Set(existing.map((r) => r.external_id));
    for (let d = 0; d < 20; d++) {
      t.setToday(isoPlusDays("2026-10-03", d));
      const res = await runConnector("cron-localist.js");
      assert.strictEqual(res._status, 200, JSON.stringify(res._body));
      assert.deepStrictEqual(res._body.failed, []);
      for (const r of tables.events) idsEver.add(r.external_id);
    }
    const rowsOf = (title) => tables.events.filter((r) => r.title === title);
    // Three drop-off points: three rows, for all eighteen days and twenty runs.
    const babies = rowsOf("Baby Item Donation");
    assert.strictEqual(babies.length, 3, `three rows, not ${babies.length}`);
    assert.deepStrictEqual(babies.map((r) => r.venue_name_raw).sort(), ["Center Campus, C Building", "Center Campus, R Building", "South Campus, J Building"], "each says where it is");
    for (const r of babies) assert.deepStrictEqual([r.start_date, r.end_date, r.time_display], ["2026-10-03", "2026-10-20", "8:00 AM"]);
    // The row that existed before became the run: same row, reviewer's status kept.
    const kept = byId(tables, existing[0].external_id);
    assert.deepStrictEqual([kept.id, kept.status, kept.end_date, kept.venue_city_raw], ["old-1", "approved", "2026-10-20", "Clinton Township"]);
    assert.strictEqual(babies.filter((r) => r.status === "pending_review").length, 2);
    // The exhibition: two runs, two rows; the first keeps its 1 September start.
    assert.deepStrictEqual(rowsOf("Made in Ohio Art Exhibit").map((r) => [r.start_date, r.end_date, r.is_all_day]).sort(), [["2026-09-01", "2026-10-14", true], ["2026-10-16", "2026-11-04", true]]);
    // Skating sessions: one row each, eight in all.
    assert.strictEqual(rowsOf("Public Skate").length, 8);
    assert.ok(rowsOf("Public Skate").every((r) => r.is_recurring === true && r.end_date === null));
    // The expo: two days, two rows.
    assert.strictEqual(rowsOf("Metro Detroit Women's Expo").length, 2);
    assert.strictEqual(tables.events.length, 3 + 2 + 8 + 2);
    assert.strictEqual(idsEver.size, 15, "no other name was ever written on any of the twenty days");
    assert.strictEqual(new Set(tables.events.map((r) => r.external_id)).size, tables.events.length);

    // The full schedule is asked for only for an event with an occurrence that day.
    const detailRequests = [...t.b.state.requests, ...t.m.state.requests].filter((u) => /\/api\/2\/events\/\d+$/.test(u));
    assert.ok(detailRequests.length > 0);
    assert.ok(detailRequests.length <= 20 * 6, `${detailRequests.length} schedule requests in twenty runs`);
    assert.ok(sentRows(db).length > 0);
  }
  console.log("PASS: twenty consecutive daily runs — three drives are three rows, an exhibition two, eight skating sessions eight; nothing is written under a second name");

  // --- 4. A page fails: nothing for that tenant, the other is unaffected. ---
  {
    const lectures = Array.from({ length: 150 }, (_, i) => event(`Lecture ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-06", i % 60), "18:00")], ...PLACES.CENTER_CAMPUS }));
    const t = tenants({
      today: "2026-10-05",
      macomb: lectures,
      bgsu: [event("Symphonic Band", { instances: [instance("2026-10-20", "20:00")], ...PLACES.FINE_ARTS })],
      failPage: (tenant, page) => tenant === "macomb" && page === 2,
    });
    const { tables } = world({ venues: [], upstream: t.upstream });
    const res = await runConnector("cron-localist.js");
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(tables.events.map((r) => r.title), ["Symphonic Band"], "the first 100 of Macomb's listing are NOT written on their own");
    assert.deepStrictEqual(res._body.failed, [{ tenant: "macomb", error: "page 2: Fetch failed: HTTP 500" }]);
    const log = runLog(tables);
    assert.deepStrictEqual([log.outcome, log.records_written], ["partial", 1]);
    assert.ok(/macomb: page 2/.test(log.error_sample));
  }
  // ...and when every tenant fails the run is a failure, not a quiet zero.
  {
    const t = tenants({ today: "2026-10-05", bgsu: [], macomb: [], failPage: () => true });
    const { tables } = world({ venues: [], upstream: t.upstream });
    const res = await runConnector("cron-localist.js");
    assert.strictEqual(res._body.upserted, 0);
    assert.strictEqual(res._body.failed.length, 2);
    assert.strictEqual(runLog(tables).outcome, "failed");
  }
  // A tenant with nothing in the next 90 days is a success with nothing written.
  {
    const t = tenants({ today: "2026-10-05" });
    const { tables } = world({ venues: [], upstream: t.upstream });
    const res = await runConnector("cron-localist.js");
    assert.deepStrictEqual([res._status, res._body.upserted, res._body.failed.length, runLog(tables).outcome], [200, 0, 0, "success"]);
  }
  console.log("PASS: a listing with a failed page writes nothing for that tenant; all tenants failing is a failed run; an empty calendar is a quiet success");

  // --- 4b. Every page is read, however many; a hole in the listing is a failure; ceilings and the clock hold. ---
  {
    const many = Array.from({ length: 520 }, (_, i) => event(`Open Studio ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-06", i % 85), "18:00")], ...PLACES.CENTER_CAMPUS }));
    const t = tenants({ today: "2026-10-05", macomb: many });
    const { tables } = world({ venues: [], upstream: t.upstream });
    const res = await runConnector("cron-localist.js");
    assert.strictEqual(res._body.funnels[1].pages, 6);
    assert.strictEqual(tables.events.length, 520, "all six pages, not the first three");
  }
  {
    // Page 2 answers 200 with nothing in it.
    const lectures = Array.from({ length: 238 }, (_, i) => event(`Lecture ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-06", i % 60), "18:00")], ...PLACES.CENTER_CAMPUS }));
    const t = tenants({ today: "2026-10-05", macomb: lectures });
    const upstream = (url) => {
      const answer = t.upstream(url);
      if (!url.startsWith(MACOMB) || !/[?&]page=2(&|$)/.test(url)) return answer;
      return { ok: true, status: 200, json: async () => ({ ...(await answer.json()), events: [] }) };
    };
    const { tables } = world({ venues: [], upstream });
    const res = await runConnector("cron-localist.js");
    assert.strictEqual(tables.events.length, 0, "138 of 238 is not written as if it were everything");
    assert.deepStrictEqual(res._body.failed, [{ tenant: "macomb", error: "Listing is incomplete: page 2 of 3 holds 0 entries, not 100; nothing written for this tenant" }]);
    assert.strictEqual(runLog(tables).outcome, "partial", "one tenant failed; the other (with nothing listed) did not");
  }
  {
    // Page 2 is page 1 again: the number of entries adds up, the listing does not.
    const lectures = Array.from({ length: 238 }, (_, i) => event(`Lecture ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-06", i % 60), "18:00")], ...PLACES.CENTER_CAMPUS }));
    const t = tenants({ today: "2026-10-05", macomb: lectures });
    const upstream = (url) => (url.startsWith(MACOMB) && /[?&]page=2(&|$)/.test(url) ? t.upstream(url.replace("page=2", "page=1")) : t.upstream(url));
    const { tables } = world({ venues: [], upstream });
    const res = await runConnector("cron-localist.js");
    assert.strictEqual(tables.events.length, 0);
    assert.ok(/138 distinct entries read, 238 stated/.test(res._body.failed[0].error), JSON.stringify(res._body.failed));
  }
  {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    for (const key of Object.keys(require.cache)) if (key.startsWith(`${REPO_DIR}/api/`)) delete require.cache[key];
    const { fetchTenantEvents, collectTenant, TENANTS, MAX_PAGES_PER_TENANT, MAX_DETAIL_FETCHES_PER_TENANT } = require(`${REPO_DIR}/api/cron-localist.js`);
    const macomb = TENANTS.find((x) => x.tenantSlug === "macomb");
    // More pages than the ceiling: refused outright.
    const huge = makeLocalistApi({ base: MACOMB, today: "2026-10-05", events: Array.from({ length: MAX_PAGES_PER_TENANT * 100 + 1 }, (_, i) => event(`E${i}`, { instances: [instance("2026-10-06", "18:00")], ...PLACES.CENTER_CAMPUS })) });
    global.fetch = async (url) => huge.handle(String(url));
    const over = await fetchTenantEvents(macomb);
    assert.ok(/more than the 25-page ceiling/.test(over.error) && over.events.length === 0, over.error);
    assert.strictEqual(huge.state.requests.length, 1, "known from page 1; no further page is requested");
    // More full schedules wanted than the ceiling: nothing for the tenant.
    const crowd = makeLocalistApi({ base: MACOMB, today: "2026-10-05", events: Array.from({ length: MAX_DETAIL_FETCHES_PER_TENANT + 1 }, (_, i) => event(`Today ${i}`, { instances: [instance("2026-10-05", "18:00")], ...PLACES.CENTER_CAMPUS })) });
    global.fetch = async (url) => crowd.handle(String(url));
    const tooMany = await collectTenant(macomb);
    assert.deepStrictEqual([tooMany.rows.length, tooMany.complete], [0, false]);
    assert.ok(/more than the ceiling of 80/.test(tooMany.errors[0]));
    assert.ok(!crowd.state.requests.some((u) => /\/events\/\d+$/.test(u)), "and none of them is requested");
    // Out of time: no request is started.
    let asked = 0;
    global.fetch = async () => { asked++; throw new Error("should not be called"); };
    const late = await fetchTenantEvents(macomb, Date.now() - 1);
    assert.ok(/Out of time/.test(late.error));
    assert.strictEqual(asked, 0);
  }
  console.log("PASS: every page is read; a listing that does not add up is a failure; the page and schedule ceilings and the time budget refuse rather than truncate");

  // --- 5. A full schedule that cannot be read: that event is left out. ---
  {
    const drive = event("Baby Item Donation", { instances: daily("2026-10-03", 18, "08:00"), ...PLACES.CENTER_CAMPUS });
    const concert = event("Fall Choral Concert", { instances: [instance("2026-10-20", "19:30")], ...PLACES.MACOMB_CENTER });
    const t = tenants({ today: "2026-10-07", macomb: [drive, concert], failEvent: (id) => id === drive.id });
    const { tables } = world({ venues: [], upstream: t.upstream });
    const res = await runConnector("cron-localist.js");
    assert.deepStrictEqual(tables.events.map((r) => r.title), ["Fall Choral Concert"], "the drive is not written from days five to eighteen under a wrong name");
    assert.deepStrictEqual(res._body.failed, [{ tenant: "macomb", error: `event ${drive.id}: full schedule: Fetch failed: HTTP 500` }]);
    assert.strictEqual(res._body.funnels[1].fullScheduleFailures, 1);
    assert.strictEqual(runLog(tables).outcome, "partial");
  }
  console.log("PASS: an event whose full schedule cannot be read is left out of the run and reported");

  // --- 6. Reviewer statuses survive; a venue is linked only when it is the same place. ---
  {
    const concert = event("Fall Choral Concert", { instances: [instance("2026-10-20", "19:30")], ...PLACES.MACOMB_CENTER });
    const lecture = event("Evening Lecture", { instances: [instance("2026-10-21", "18:00")], ...PLACES.JEROME_LIBRARY, location_name: "Main Library" });
    const rejected = event("Trivia Night", { instances: [instance("2026-10-22", "19:00")], ...PLACES.CENTER_CAMPUS });
    const t = tenants({ today: "2026-10-05", macomb: [concert, rejected], bgsu: [lecture] });
    const { tables } = world({
      venues: [
        { id: "venue-mcpa", name: "Macomb Center for the Performing Arts", address: "44575 Garfield Road", city: "Clinton Township" },
        { id: "venue-dpl", name: "Main Library", address: "5201 Woodward Ave", city: "Detroit" },
      ],
      events: [
        { id: "r-1", external_id: `localist-macomb-${rejected._schedule[0].id}`, title: "Trivia Night", category: "community", start_date: "2026-10-22", status: "rejected", source: "Macomb Community College" },
        { id: "r-2", external_id: `localist-macomb-${concert._schedule[0].id}`, title: "Fall Choral Concert", category: "music", start_date: "2026-10-20", status: "approved", source: "Macomb Community College", description: "A reviewer's own description." },
      ],
      upstream: t.upstream,
    });
    const res = await runConnector("cron-localist.js");
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    assert.strictEqual(res._body.newRows, 1);
    assert.strictEqual(byId(tables, `localist-macomb-${rejected._schedule[0].id}`).status, "rejected", "a rejected row stays rejected");
    const kept = byId(tables, `localist-macomb-${concert._schedule[0].id}`);
    assert.deepStrictEqual([kept.status, kept.venue_id], ["approved", "venue-mcpa"], "an approved row stays approved; the venue of that name in that city is linked");
    const bg = tables.events.find((r) => r.title === "Evening Lecture");
    assert.deepStrictEqual([bg.status, bg.venue_id, bg.venue_name_raw, bg.venue_city_raw], ["pending_review", null, "Main Library", "Bowling Green"], "\"Main Library\" in Bowling Green is not Detroit's Main Library");
  }
  console.log("PASS: a reviewer's status survives a re-run; a same-name venue in another city is not linked");

  // --- 6b. A venue is linked by its name, never by a shared address, and never without a city. ---
  {
    const atC = event("Baby Item Donation", { instances: [instance("2026-10-20", "08:00")], ...PLACES.CENTER_CAMPUS });
    const noCity = event("Evening Lecture", { instances: [instance("2026-10-21", "18:00")], location_name: "Main Library", address: "Main Library, Bowling Green, Ohio 43403", geo: { latitude: "41.3765", longitude: "-83.6351", city: null, state: null } });
    const t = tenants({ today: "2026-10-05", macomb: [atC], bgsu: [noCity] });
    const { tables } = world({
      venues: [
        { id: "venue-mcpa", name: "Macomb Center for the Performing Arts", address: "44575 Garfield Road", city: "Clinton Township" },
        { id: "venue-dpl", name: "Main Library", address: "5201 Woodward Ave", city: "Detroit" },
      ],
      upstream: t.upstream,
    });
    await runConnector("cron-localist.js");
    const drive = tables.events.find((r) => r.title === "Baby Item Donation");
    assert.deepStrictEqual([drive.venue_id, drive.venue_name_raw], [null, "Center Campus, C Building"], "C Building shares the performing-arts centre's street address and is not the performing-arts centre");
    const lecture = tables.events.find((r) => r.title === "Evening Lecture");
    assert.deepStrictEqual([lecture.venue_id, lecture.venue_city_raw], [null, "Bowling Green"], "\"Main Library\" in Bowling Green is not linked to Detroit's");
  }
  console.log("PASS: campus buildings are not linked to the one venue on file at their shared address");

  // --- 8. Withdrawal, return, and what a run must not erase. ---
  {
    const concert = event("Fall Choral Concert", { instances: [instance("2026-10-20", "19:30")], types: ["Concerts & Performances"], ...PLACES.MACOMB_CENTER });
    const market = event("Holiday Market", { instances: daily("2026-10-20", 6, "10:00", "16:00"), ...PLACES.CENTER_CAMPUS });
    const stargazing = event("Public Stargazing", { instances: [instance("2026-10-22", "20:00")], ...PLACES.CENTER_CAMPUS, photo_url: "", description_text: "" });
    const others = Array.from({ length: 12 }, (_, i) => event(`Lecture ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-25", i), "18:00")], ...PLACES.CENTER_CAMPUS }));
    const t = tenants({ today: "2026-10-05", macomb: [concert, market, stargazing, ...others] });
    const { tables, db } = world({ venues: [], upstream: t.upstream });
    const id = (e, i = 0) => `localist-macomb-${e._schedule[i].id}`;

    await runConnector("cron-localist.js");
    assert.strictEqual(tables.events.length, 15);
    // A reviewer approves two rows, re-categorises one and adds what the source lacks.
    Object.assign(byId(tables, id(concert)), { status: "approved" });
    Object.assign(byId(tables, id(market)), { status: "approved" });
    Object.assign(byId(tables, id(stargazing)), { status: "approved", category: "family", description: "Written by a reviewer.", image_url: "https://example.org/stars.jpg", venue_id: "venue-added-by-hand", internal_note: "Checked with the college." });

    // Next day: the concert is cancelled at the source; a day is added to the FRONT of the market.
    t.setToday("2026-10-06");
    concert.status = "canceled";
    market._schedule.unshift(instance("2026-10-19", "10:00", "16:00"));
    const before = db.log.length;
    const res = await runConnector("cron-localist.js");
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    assert.deepStrictEqual([res._body.withdrawn, res._body.failed.length], [2, 0]);

    const cancelled = byId(tables, id(concert));
    assert.strictEqual(cancelled.status, "rejected", "a cancelled event does not stay public");
    assert.ok(/^Withdrawn by the Localist connector on 2026-10-06: .*\(was approved\)\.$/.test(cancelled.internal_note), cancelled.internal_note);
    // The market: the row named after 20 October is withdrawn, the run named after the 19th is the event.
    const oldRun = byId(tables, id(market, 1));
    const newRun = byId(tables, id(market, 0));
    assert.deepStrictEqual([oldRun.status, newRun.start_date, newRun.end_date], ["rejected", "2026-10-19", "2026-10-25"]);
    assert.strictEqual(tables.events.filter((r) => r.title === "Holiday Market" && r.status !== "rejected").length, 1, "one visible Holiday Market, not two overlapping runs");
    assert.strictEqual(tables.events.length, 16, "nothing is deleted");

    // What the run did NOT touch on the reviewer's row.
    const stars = byId(tables, id(stargazing));
    assert.deepStrictEqual(
      [stars.status, stars.category, stars.description, stars.image_url, stars.venue_id, stars.internal_note],
      ["approved", "family", "Written by a reviewer.", "https://example.org/stars.jpg", "venue-added-by-hand", "Checked with the college."],
      "the source states no category, description, image or venue for this event: none of those keys is sent, and the stored category is sent back"
    );
    const sent = db.log.slice(before).filter((r) => r.table === "events" && r.method === "POST").flatMap((r) => JSON.parse(r.body)).find((r) => r.external_id === id(stargazing));
    assert.deepStrictEqual([sent.description, sent.image_url, sent.venue_id, sent.internal_note, sent.category, sent.ticket_url],
      ["Written by a reviewer.", "https://example.org/stars.jpg", "venue-added-by-hand", "Checked with the college.", "family", null],
      "what the source does not state is written back as what is stored; the ticket link is the source's alone");
    assert.strictEqual(db.log.slice(before).filter((r) => r.table === "events" && r.method === "POST").length, 1, "still one request");

    // The day after: the concert is back on. It returns with the status it had.
    t.setToday("2026-10-07");
    concert.status = "live";
    const back = await runConnector("cron-localist.js");
    assert.deepStrictEqual([back._body.restored, back._body.withdrawn], [1, 0]);
    assert.deepStrictEqual([byId(tables, id(concert)).status, byId(tables, id(concert)).internal_note], ["approved", null]);
    assert.strictEqual(byId(tables, id(market, 1)).status, "rejected", "a row the source still does not list stays withdrawn");
    // A row a REVIEWER hid is not brought back by its being listed.
    Object.assign(byId(tables, id(others[0])), { status: "rejected", internal_note: "Not for us." });
    await runConnector("cron-localist.js");
    assert.strictEqual(byId(tables, id(others[0])).status, "rejected");
  }
  {
    // Not believed: most of a tenant's rows simply GONE from the listing at once. Nothing is withdrawn; the run says so.
    const lectures = Array.from({ length: 60 }, (_, i) => event(`Lecture ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-10", i), "18:00")], ...PLACES.CENTER_CAMPUS }));
    const t = tenants({ today: "2026-10-05", macomb: lectures });
    const { tables } = world({ venues: [], upstream: t.upstream });
    await runConnector("cron-localist.js");
    t.m.state.events = lectures.slice(40);
    const res = await runConnector("cron-localist.js");
    assert.strictEqual(tables.events.filter((r) => r.status === "rejected").length, 0);
    assert.deepStrictEqual(res._body.failed, [{ tenant: "macomb", error: "refusing to withdraw 40 of 60 stored rows that vanished from the listing in one run; none of those withdrawn" }]);
    assert.strictEqual(runLog(tables).outcome, "partial");
    // The same forty, still IN the listing but now for students only: that is
    // evidence, not absence, and they are withdrawn whatever the numbers --
    // so a real mass cancellation does not leave the refusal standing forever.
    t.m.state.events = lectures;
    for (const e of lectures.slice(0, 40)) e.filters.event_target_audience = [{ name: "Students", id: 1 }];
    const evidence = await runConnector("cron-localist.js");
    assert.deepStrictEqual([evidence._body.withdrawn, evidence._body.failed, tables.events.filter((r) => r.status === "rejected").length], [40, [], 40]);
    // Listed for the public again: all forty come back.
    for (const e of lectures.slice(0, 40)) e.filters.event_target_audience = [{ name: "General Public", id: 1 }];
    const back = await runConnector("cron-localist.js");
    assert.deepStrictEqual([back._body.restored, tables.events.filter((r) => r.status === "rejected").length], [40, 0]);
    // Mixed: six vanish (refused: more than five, and more than a fifth of... no: 6 of 60 is a tenth -- believed).
    t.m.state.events = lectures.slice(6);
    const modest = await runConnector("cron-localist.js");
    assert.deepStrictEqual([modest._body.withdrawn, modest._body.failed.length], [6, 0], "a modest number of vanished rows is believed");
    // ...and with few rows stored, up to five may vanish; a sixth is refused while a cancelled one beside it is still withdrawn.
    const few = Array.from({ length: 12 }, (_, i) => event(`Workshop ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-10", i), "18:00")], ...PLACES.CENTER_CAMPUS }));
    const t2 = tenants({ today: "2026-10-05", macomb: few });
    const w2 = world({ venues: [], upstream: t2.upstream });
    await runConnector("cron-localist.js");
    few[0].status = "canceled";
    t2.m.state.events = [few[0], ...few.slice(7)]; // six vanish, one is cancelled
    const mixed = await runConnector("cron-localist.js");
    assert.deepStrictEqual([mixed._body.withdrawn, w2.tables.events.filter((r) => r.status === "rejected").map((r) => r.title)], [1, ["Workshop 1"]]);
    assert.ok(/refusing to withdraw 6 of 12/.test(mixed._body.failed[0].error));
  }
  {
    // Not when the tenant's run was incomplete: a schedule that could not be read is not a cancellation.
    const drive = event("Baby Item Donation", { instances: daily("2026-10-03", 18, "08:00"), ...PLACES.CENTER_CAMPUS });
    const concert = event("Fall Choral Concert", { instances: [instance("2026-10-20", "19:30")], ...PLACES.MACOMB_CENTER });
    let failing = false;
    const t = tenants({ today: "2026-10-05", macomb: [drive, concert], failEvent: (eventId) => failing && eventId === drive.id });
    const { tables } = world({ venues: [], upstream: t.upstream });
    await runConnector("cron-localist.js");
    assert.strictEqual(tables.events.length, 2);
    failing = true;
    t.setToday("2026-10-06");
    const res = await runConnector("cron-localist.js");
    assert.strictEqual(res._body.withdrawn, 0);
    assert.ok(tables.events.every((r) => r.status === "pending_review"), "the drive's row is left exactly as it was");
  }
  console.log("PASS: a cancelled or re-scheduled event's old row is withdrawn (hidden, with its status noted) and returns if listed again; a reviewer's additions survive; an implausible withdrawal is refused");

  // --- 9. The withdrawal's edges (second independent review). ---
  {
    // An organiser DELETES an entry and makes a new one for the same event.
    const original = event("Jazz Ensemble", { instances: [instance("2026-10-20", "19:30", "21:00")], ...PLACES.MACOMB_CENTER });
    const filler = Array.from({ length: 8 }, (_, i) => event(`Lecture ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-25", i), "18:00")], ...PLACES.CENTER_CAMPUS }));
    const t = tenants({ today: "2026-10-05", macomb: [original, ...filler] });
    const { tables, db } = world({ venues: [], upstream: t.upstream });
    await runConnector("cron-localist.js");
    const oldId = `localist-macomb-${original._schedule[0].id}`;
    Object.assign(byId(tables, oldId), { status: "approved" });
    const remade = event("Jazz Ensemble", { instances: [instance("2026-10-20", "19:30", "21:00")], ...PLACES.MACOMB_CENTER });
    t.m.state.events.splice(t.m.state.events.indexOf(original), 1, remade);
    t.setToday("2026-10-06");
    const res = await runConnector("cron-localist.js");
    const newRow = byId(tables, `localist-macomb-${remade._schedule[0].id}`);
    assert.deepStrictEqual([res._body.withdrawn, byId(tables, oldId).status, newRow.status], [1, "rejected", "pending_review"],
      "the old row is withdrawn BEFORE the new one is written: one visible row, never two and never none");
    // The withdrawal comes before the write in the request log too.
    const writes = db.log.filter((r) => r.table === "events" && r.method !== "GET").map((r) => r.method);
    assert.ok(writes.lastIndexOf("PATCH") < writes.lastIndexOf("POST"));
  }
  {
    // An event UNDER WAY is not withdrawn for being under way: a conference
    // that began yesterday is no longer in a listing that starts today.
    const conference = event("Great Lakes Writers Conference", { instances: [instance("2026-10-05", "09:00", "2026-10-09T17:00:00-04:00")], ...PLACES.MACOMB_CENTER });
    const other = event("Evening Lecture", { instances: [instance("2026-10-20", "18:00")], ...PLACES.CENTER_CAMPUS });
    const t = tenants({ today: "2026-10-05", macomb: [conference, other] });
    const { tables } = world({ venues: [], upstream: t.upstream });
    await runConnector("cron-localist.js");
    const row = byId(tables, `localist-macomb-${conference._schedule[0].id}`);
    assert.deepStrictEqual([row.start_date, row.end_date], ["2026-10-05", "2026-10-09"]);
    row.status = "approved";
    t.setToday("2026-10-07");
    const res = await runConnector("cron-localist.js");
    assert.deepStrictEqual([res._body.withdrawn, row.status, /Withdrawn/.test(row.internal_note || "")], [0, "approved", false]);
  }
  {
    // An event MOVES. The old street and the old venue's link do not stay
    // behind under the new name. (A ticket link the source stops stating is
    // kept: it cannot be told from one a reviewer added to a row whose source
    // never had one, and erasing that every morning is the worse mistake.)
    const concert = event("Fall Choral Concert", { instances: [instance("2026-10-20", "19:30")], ticket_url: "https://tickets.example.edu/choral", ...PLACES.MACOMB_CENTER });
    const steady = event("Open Mic", { instances: [instance("2026-10-21", "19:00")], ...PLACES.MACOMB_CENTER, description_text: "" });
    const t = tenants({ today: "2026-10-05", macomb: [concert, steady] });
    const { tables } = world({
      venues: [
        { id: "venue-mcpa", name: "Macomb Center for the Performing Arts", address: "44575 Garfield Road", city: "Clinton Township" },
        { id: "venue-no-city", name: "South Campus, J Building", address: null, city: null },
      ],
      upstream: t.upstream,
    });
    await runConnector("cron-localist.js");
    const row = byId(tables, `localist-macomb-${concert._schedule[0].id}`);
    const mic = byId(tables, `localist-macomb-${steady._schedule[0].id}`);
    assert.deepStrictEqual([row.venue_id, row.venue_address_raw, row.venue_city_raw, row.ticket_url], ["venue-mcpa", "44575 Garfield Road", "Clinton Township", "https://tickets.example.edu/choral"]);
    // Overnight the enrichment job adds a description and a reviewer corrects the venue link on the one that does not move.
    Object.assign(mic, { description: "Sign-up at 6:30.", description_source: "authoritative", venue_id: "venue-by-hand" });
    Object.assign(concert, PLACES.SOUTH_CAMPUS_J, { ticket_url: "" });
    t.setToday("2026-10-06");
    await runConnector("cron-localist.js");
    assert.deepStrictEqual([row.venue_name_raw, row.venue_id, row.venue_address_raw, row.venue_city_raw, row.ticket_url],
      ["South Campus, J Building", null, "14500 E. 12 Mile Road", "Warren", "https://tickets.example.edu/choral"],
      "the whole place is the source's now -- and a same-name venue on file with NO city is not linked");
    assert.deepStrictEqual([mic.venue_id, mic.description, mic.venue_address_raw], ["venue-by-hand", "Sign-up at 6:30.", "44575 Garfield Road"], "the one that did not move keeps what was added to it");
  }
  {
    // A REVIEWER DISAGREES with a withdrawal, then with a listing.
    const students = event("Résumé Workshop", { instances: [instance("2026-10-20", "12:00")], ...PLACES.CENTER_CAMPUS });
    const filler = Array.from({ length: 8 }, (_, i) => event(`Lecture ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-25", i), "18:00")], ...PLACES.CENTER_CAMPUS }));
    const t = tenants({ today: "2026-10-05", macomb: [students, ...filler] });
    const { tables } = world({ venues: [], upstream: t.upstream });
    process.env.SUPABASE_URL = SUPABASE_URL;
    const { WITHDRAWN_PREFIX, KEPT_PREFIX } = require(`${REPO_DIR}/api/cron-localist.js`);
    await runConnector("cron-localist.js");
    const row = byId(tables, `localist-macomb-${students._schedule[0].id}`);
    // The college re-lists it for students only: withdrawn.
    students.filters.event_target_audience = [{ name: "Students", id: 1 }];
    await runConnector("cron-localist.js");
    assert.ok(row.status === "rejected" && row.internal_note.startsWith(WITHDRAWN_PREFIX));
    // The reviewer wants it anyway (Admin's Restore: approved, note untouched).
    row.status = "approved";
    const kept = await runConnector("cron-localist.js");
    assert.deepStrictEqual([kept._body.withdrawn, row.status, row.internal_note.startsWith(KEPT_PREFIX), kept._body.funnels[1].keptByReviewer], [0, "approved", true, 1], "not withdrawn a second time; marked as the reviewer's");
    assert.deepStrictEqual([(await runConnector("cron-localist.js"))._body.withdrawn, row.status], [0, "approved"], "...on every later run");
    // The reviewer changes their mind and rejects it; the source still does not list it. It stays rejected.
    row.status = "rejected";
    await runConnector("cron-localist.js");
    assert.strictEqual(row.status, "rejected");
    // Later the college lists it for the public again, and the reviewer's rejection is NOT undone:
    // the note on it is no longer a withdrawal note.
    students.filters.event_target_audience = [{ name: "General Public", id: 1 }];
    const relisted = await runConnector("cron-localist.js");
    assert.deepStrictEqual([relisted._body.restored, row.status], [0, "rejected"]);
    // And the plain case: withdrawn, listed again, restored with its note cleared;
    // rejected by a reviewer afterwards, it stays rejected.
    const second = byId(tables, `localist-macomb-${filler[0]._schedule[0].id}`);
    filler[0].status = "canceled";
    await runConnector("cron-localist.js");
    assert.strictEqual(second.status, "rejected");
    filler[0].status = "live";
    await runConnector("cron-localist.js");
    assert.deepStrictEqual([second.status, /Withdrawn/.test(second.internal_note || ""), /^Category not mappable/.test(second.internal_note || "")], ["pending_review", false, true], "listed again: its status is back, the withdrawal line is gone and the note it had before is not");
    second.status = "rejected";
    await runConnector("cron-localist.js");
    assert.strictEqual(second.status, "rejected", "a reviewer's rejection after a return is not mistaken for a withdrawal");
  }
  {
    // Only this tenant's own rows; even when the run produces nothing; and a
    // database error part-way is reported, never thrown.
    const lecture = event("Evening Lecture", { instances: [instance("2026-10-20", "18:00")], ...PLACES.CENTER_CAMPUS });
    const t = tenants({ today: "2026-10-05", macomb: [lecture], bgsu: [event("Symphonic Band", { instances: [instance("2026-10-20", "20:00")], ...PLACES.FINE_ARTS })] });
    const foreign = { id: "f-1", external_id: "localist-macomb-annex-777", title: "Annex Open House", category: "community", start_date: "2026-10-20", status: "approved", source: "Macomb Annex" };
    let failPatch = false;
    const { tables } = world({ venues: [], events: [foreign], upstream: t.upstream, failure: (request) => (failPatch && request.method === "PATCH" && request.table === "events" ? 500 : null) });
    await runConnector("cron-localist.js");
    const row = byId(tables, `localist-macomb-${lecture._schedule[0].id}`);
    lecture.status = "canceled"; // now Macomb lists nothing at all
    failPatch = true;
    const broken = await runConnector("cron-localist.js");
    assert.deepStrictEqual([broken._status, broken._body.upserted, broken._body.withdrawn, row.status], [200, 1, 0, "pending_review"], "Bowling Green's row is still written");
    assert.ok(/macomb: withdrawal failed part-way \(HTTP 500\)/.test(runLog(tables).error_sample), runLog(tables).error_sample);
    assert.strictEqual(runLog(tables).outcome, "partial");
    failPatch = false;
    t.b.state.events.length = 0; // and now neither tenant produces a row
    const quiet = await runConnector("cron-localist.js");
    assert.deepStrictEqual([quiet._body.upserted, quiet._body.withdrawn, row.status, foreign.status], [0, 2, "rejected", "approved"], "withdrawn although the run wrote nothing; a row whose name merely begins the same way is not this tenant's");
  }
  // --- 10. Third independent review. ---
  {
    // The same venue NAME in another city is a move too; and a row from the
    // old connector, linked by name alone to a venue in the wrong city, loses
    // that link the first time it is written again.
    const talk = event("Author Talk", { instances: [instance("2026-10-20", "18:00")], location_name: "Library", address: "Library, 14500 E. 12 Mile Road, Warren, MI 48088", geo: { latitude: "42.5055", longitude: "-82.9713", street: "14500 E. 12 Mile Road", city: "Warren", state: "MI" } });
    const lecture = event("Evening Lecture", { instances: [instance("2026-10-21", "18:00")], ...PLACES.JEROME_LIBRARY, location_name: "Main Library" });
    const noVenueNamed = event("Campus Walk", { instances: [instance("2026-10-22", "10:00")], location_name: "", address: "44575 Garfield Road, Clinton Township, MI 48038", geo: { latitude: "42.62191", longitude: "-82.956398", street: "44575 Garfield Road", city: null, state: "MI" } });
    const t = tenants({ today: "2026-10-05", macomb: [talk, noVenueNamed], bgsu: [lecture] });
    const { tables } = world({
      venues: [
        { id: "venue-warren-library", name: "Library", address: "14500 E. 12 Mile Road", city: "Warren" },
        { id: "venue-dpl", name: "Main Library", address: "5201 Woodward Ave", city: "Detroit" },
        { id: "venue-mcpa", name: "Macomb Center for the Performing Arts", address: "44575 Garfield Road", city: "Clinton Township" },
      ],
      events: [
        // As the previous connector left it: linked by name only, no city of its own.
        { id: "legacy-1", external_id: `localist-bgsu-${lecture._schedule[0].id}`, title: "Evening Lecture", category: "community", start_date: "2026-10-21", status: "approved", source: "Bowling Green State University", venue_name_raw: "Main Library", venue_id: "venue-dpl" },
      ],
      upstream: t.upstream,
    });
    await runConnector("cron-localist.js");
    const row = byId(tables, `localist-macomb-${talk._schedule[0].id}`);
    const walk = byId(tables, `localist-macomb-${noVenueNamed._schedule[0].id}`);
    assert.deepStrictEqual([row.venue_id, row.venue_address_raw, row.venue_city_raw], ["venue-warren-library", "14500 E. 12 Mile Road", "Warren"]);
    assert.deepStrictEqual([byId(tables, `localist-bgsu-${lecture._schedule[0].id}`).venue_id, byId(tables, `localist-bgsu-${lecture._schedule[0].id}`).venue_city_raw], [null, "Bowling Green"], "Detroit's Main Library is not where a Bowling Green lecture is");
    // Overnight: a reviewer adds a ticket link; the enrichment job names the
    // venue at the walk's address; the college moves the talk to another town's library.
    Object.assign(row, { ticket_url: "https://example.org/reserve" });
    Object.assign(walk, { venue_name_raw: "Macomb Center for the Performing Arts", venue_id: "venue-mcpa", ticket_url: "https://example.org/walk" });
    Object.assign(talk, { address: "Library, Clinton Township, MI 48038", geo: { latitude: "42.62191", longitude: "-82.956398", street: null, city: "Clinton Township", state: "MI" } });
    t.setToday("2026-10-06");
    await runConnector("cron-localist.js");
    assert.deepStrictEqual([row.venue_name_raw, row.venue_id, row.venue_address_raw, row.venue_city_raw, row.ticket_url], ["Library", null, null, "Clinton Township", "https://example.org/reserve"],
      "one name, another city: the Warren street and the Warren venue's link do not follow it; the reviewer's ticket link stays");
    assert.deepStrictEqual([walk.venue_name_raw, walk.venue_id, walk.ticket_url], ["Macomb Center for the Performing Arts", "venue-mcpa", "https://example.org/walk"], "the source names no venue and its street agrees: what the enrichment job added is not erased");
  }
  {
    // The connector's mark is ONE LINE at the end of the note. What was there
    // stays; what another job writes after it takes the row out of its hands.
    const a = event("Open Studio", { instances: [instance("2026-10-20", "18:00")], ...PLACES.CENTER_CAMPUS });
    const b = event("Figure Drawing", { instances: [instance("2026-10-21", "18:00")], ...PLACES.CENTER_CAMPUS });
    const c = event("Clay Night", { instances: [instance("2026-10-22", "18:00")], ...PLACES.CENTER_CAMPUS });
    const filler = Array.from({ length: 12 }, (_, i) => event(`Lecture ${i + 1}`, { instances: [instance(isoPlusDays("2026-10-25", i), "18:00")], ...PLACES.CENTER_CAMPUS }));
    const t = tenants({ today: "2026-10-05", macomb: [a, b, c, ...filler] });
    const { tables } = world({ venues: [], upstream: t.upstream });
    const { WITHDRAWN_PREFIX, KEPT_PREFIX } = require(`${REPO_DIR}/api/cron-localist.js`);
    await runConnector("cron-localist.js");
    const [ra, rb, rc] = [a, b, c].map((e) => byId(tables, `localist-macomb-${e._schedule[0].id}`));
    Object.assign(ra, { status: "approved", internal_note: "Checked with the college.\nDUP_DISTINCT | v1 | other=abc" });
    Object.assign(rb, { status: "approved", internal_note: null });
    Object.assign(rc, { status: "approved", internal_note: "Checked." });
    for (const e of [a, b, c]) e.status = "canceled";
    await runConnector("cron-localist.js");
    assert.deepStrictEqual(ra.internal_note.split("\n").slice(0, 2), ["Checked with the college.", "DUP_DISTINCT | v1 | other=abc"], "the note that was there is kept, line for line");
    assert.ok(ra.internal_note.split("\n")[2].startsWith(WITHDRAWN_PREFIX) && rb.internal_note.startsWith(WITHDRAWN_PREFIX));
    // The nightly duplicate pass retires rb for its own reasons, appending its line.
    rb.internal_note += "\nDUP_MERGED_INTO | v1 | survivor=xyz | rule=two_sources_one_place | at=2026-10-06";
    // A reviewer restores rc although the college no longer lists it.
    rc.status = "approved";
    await runConnector("cron-localist.js");
    assert.deepStrictEqual(rc.internal_note.split("\n").map((l) => l.slice(0, KEPT_PREFIX.length)), ["Checked.", KEPT_PREFIX]);
    // The college lists all three again.
    for (const e of [a, b, c]) e.status = "live";
    const back = await runConnector("cron-localist.js");
    assert.deepStrictEqual([ra.status, ra.internal_note], ["approved", "Checked with the college.\nDUP_DISTINCT | v1 | other=abc"], "back, with its own line removed and nothing else");
    assert.deepStrictEqual([rb.status, rb.internal_note], ["rejected", "DUP_MERGED_INTO | v1 | survivor=xyz | rule=two_sources_one_place | at=2026-10-06"], "the duplicate pass wrote after the withdrawal: the row is that pass's, and stays hidden");
    assert.strictEqual(back._body.restored, 1);
    // ...and unlists rc once more: a row a reviewer kept is never withdrawn again.
    c.status = "canceled";
    const again = await runConnector("cron-localist.js");
    assert.deepStrictEqual([again._body.withdrawn, rc.status, rc.internal_note.includes(KEPT_PREFIX)], [0, "approved", true]);
  }
  {
    // A listing that does not say how many entries it has cannot be shown to
    // be whole: its rows are written, nothing is withdrawn on its strength.
    const one = event("Evening Lecture", { instances: [instance("2026-10-20", "18:00")], ...PLACES.CENTER_CAMPUS });
    const two = event("Morning Lecture", { instances: [instance("2026-10-21", "09:00")], ...PLACES.CENTER_CAMPUS });
    const t = tenants({ today: "2026-10-05", macomb: [one, two] });
    let silent = false;
    const upstream = (url) => {
      const answer = t.upstream(url);
      if (!silent || !url.startsWith(MACOMB) || !answer.ok) return answer;
      return { ok: true, status: 200, json: async () => { const body = await answer.json(); delete body.page; return { ...body, events: body.events.slice(0, 1) }; } };
    };
    const { tables } = world({ venues: [], upstream });
    await runConnector("cron-localist.js");
    silent = true;
    const res = await runConnector("cron-localist.js");
    assert.deepStrictEqual([res._body.withdrawn, tables.events.filter((r) => r.status === "rejected").length], [0, 0]);
    assert.ok(/macomb: withdrawal skipped: the listing does not say how many entries it has/.test(runLog(tables).error_sample));
  }
  console.log("PASS: a re-made entry leaves one visible row; an event under way is not withdrawn; a moved event takes its whole new place; a reviewer's restore and a reviewer's rejection both outlive the connector; the connector's note is one line that only it removes");

  // --- 7. The gate on the endpoint itself. ---
  {
    process.env.CRON_SECRET = "s3cret";
    for (const key of Object.keys(require.cache)) if (key.startsWith(`${REPO_DIR}/api/`)) delete require.cache[key];
    const handler = require(`${REPO_DIR}/api/cron-localist.js`);
    let asked = 0;
    global.fetch = async () => { asked++; throw new Error("no request may be made without the secret"); };
    const res = { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
    await handler({ headers: { authorization: "Bearer wrong" } }, res);
    assert.deepStrictEqual([res._status, asked], [401, 0]);
    delete process.env.CRON_SECRET;
  }
  console.log("PASS: without the cron secret nothing is fetched and nothing is written");

  console.log("\nAll cron-localist-runlog.test.js checks passed.");
}

run().catch((err) => { console.error("FAIL:", (err && err.stack) || err); process.exit(1); });
