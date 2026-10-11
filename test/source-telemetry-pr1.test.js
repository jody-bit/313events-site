// test/source-telemetry-pr1.test.js -- source reliability PR 1 (2026-10-11).
//
// Ticketmaster, MotorCity Wine and Planet Ant Theatre wrote no source_runs
// row at all, so "blocked", "partial" and "never ran" looked alike, and
// Belle Isle logged an unreadable 200 as a quiet "success". This pins the run
// log each of them now writes, and that publication is unchanged.
//
// Real handlers, a stubbed upstream, the shared fake database (which rejects
// what production rejects). Plain Node assert, no dependencies.
// Run: node test/source-telemetry-pr1.test.js
"use strict";
const assert = require("assert");
const { world, page, json, runConnector, eventWrites, sentRows } = require("./fixtures/connector-harness.js");

const runs = (tables) => tables.source_runs;
const only = (tables, slug) => { const r = runs(tables).filter((x) => x.source_slug === slug); assert.strictEqual(r.length, 1, `exactly one ${slug} run row (found ${r.length})`); return r[0]; };

// ---------------- Ticketmaster ----------------
const TM_URL = "https://app.ticketmaster.com/discovery/v2/events.json";
const tmEvent = (id) => ({
  id, name: `Band ${id}`, url: `https://www.ticketmaster.com/event/${id}`,
  classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
  dates: { start: { localDate: "2026-10-20", localTime: "19:30:00" }, status: { code: "onsale" } },
  _embedded: { venues: [{ name: "Fixture Hall", city: { name: "Detroit" }, location: { latitude: "42.3387", longitude: "-83.0524" } }] },
});
const tmPage = (ids, totalPages, totalElements) => json({ _embedded: { events: ids.map(tmEvent) }, page: { totalPages, totalElements, number: 0 } });

async function ticketmaster() {
  // complete
  let w = world({ upstream: (u) => (u.startsWith(TM_URL) ? tmPage(["a", "b"], 1, 2) : null) });
  let res = await runConnector("cron-ticketmaster.js");
  assert.strictEqual(res._body.upserted, 2);
  let run = only(w.tables, "ticketmaster");
  assert.strictEqual(run.outcome, "success");
  assert.strictEqual(run.records_fetched, 2); assert.strictEqual(run.records_parsed, 2); assert.strictEqual(run.records_written, 2);
  assert.strictEqual(run.session_data.api_total_elements, 2); assert.strictEqual(run.session_data.complete, true);
  assert.strictEqual(w.tables.events.length, 2);
  console.log("PASS: Ticketmaster complete fetch logs success with fetched/parsed/written and the API total");

  // page 2 fails: partial, and the first page is still published exactly as before
  w = world({ upstream: (u) => (!u.startsWith(TM_URL) ? null : u.includes("page=1") ? page("", 500) : tmPage(["a", "b"], 3, 600)) });
  res = await runConnector("cron-ticketmaster.js");
  assert.strictEqual(res._status, 200); assert.strictEqual(res._body.upserted, 2, "partial results are still written, as before");
  run = only(w.tables, "ticketmaster");
  assert.strictEqual(run.outcome, "partial"); assert.strictEqual(run.http_status, 500);
  assert.match(run.error_sample, /page 1 failed: HTTP 500/);
  assert.strictEqual(run.session_data.complete, false); assert.strictEqual(run.session_data.api_total_elements, 600);
  console.log("PASS: Ticketmaster incomplete pagination (page fails) logs partial, still writes what it got");

  // more pages than the cap
  w = world({ upstream: (u) => (u.startsWith(TM_URL) ? tmPage([`p${u.match(/page=(\d+)/)[1]}`], 9, 1800) : null) });
  res = await runConnector("cron-ticketmaster.js");
  run = only(w.tables, "ticketmaster");
  assert.strictEqual(run.outcome, "partial"); assert.match(run.error_sample, /9 pages; only the first 5/);
  assert.strictEqual(run.records_fetched, 5);
  console.log("PASS: Ticketmaster result set beyond the 5-page cap logs partial");

  // first page refused: blocked, nothing written, nothing unpublished
  w = world({ events: [{ id: "x1", external_id: "keep", title: "t", category: "music", start_date: "2026-10-20", status: "approved", source: "Ticketmaster" }], upstream: (u) => (u.startsWith(TM_URL) ? page("forbidden", 403) : null) });
  res = await runConnector("cron-ticketmaster.js");
  run = only(w.tables, "ticketmaster");
  assert.strictEqual(run.outcome, "blocked"); assert.strictEqual(run.http_status, 403);
  assert.strictEqual(eventWrites(w.db).length, 0);
  assert.strictEqual(w.tables.events[0].status, "approved", "existing events are untouched by a blocked run");
  console.log("PASS: Ticketmaster 403 on the first page logs blocked and leaves existing events alone");

  // upsert rejected -> failed with the true written count
  w = world({ upstream: (u) => (u.startsWith(TM_URL) ? tmPage(["a"], 1, 1) : null), failure: (r) => (r.table === "events" && r.method === "POST" ? 500 : undefined) });
  res = await runConnector("cron-ticketmaster.js");
  run = only(w.tables, "ticketmaster");
  assert.strictEqual(run.outcome, "failed"); assert.strictEqual(res._status, 502);
  console.log("PASS: Ticketmaster database write failure logs failed");

  // repeat ingestion is idempotent, and logs a row per run
  w = world({ upstream: (u) => (u.startsWith(TM_URL) ? tmPage(["a", "b"], 1, 2) : null) });
  await runConnector("cron-ticketmaster.js");
  await runConnector("cron-ticketmaster.js");
  assert.strictEqual(w.tables.events.length, 2, "re-running creates no duplicates");
  assert.strictEqual(runs(w.tables).filter((r) => r.source_slug === "ticketmaster").length, 2);
  console.log("PASS: Ticketmaster repeat ingestion is idempotent and logs each run");
}

// ---------------- MotorCity Wine ----------------
const MCW_HOST = "https://calendar.google.com/calendar/ical/";
const ics = (events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const mcwOne = ics([["UID:one@x", "DTSTART;TZID=America/Detroit:20261020T200000", "SUMMARY:Jazz Night", "DESCRIPTION:Live"]]);

async function motorcity() {
  let w = world({ upstream: (u) => (u.startsWith(MCW_HOST) ? page(mcwOne) : null) });
  let res = await runConnector("cron-motorcitywine.js");
  assert.strictEqual(res._body.upserted, 1);
  let run = only(w.tables, "motorcitywine");
  assert.strictEqual(run.outcome, "success"); assert.strictEqual(run.records_fetched, 1); assert.strictEqual(run.records_written, 1);
  assert.strictEqual(w.tables.events[0].status, "approved");
  console.log("PASS: MotorCity Wine success logs counts; publication unchanged");

  w = world({ upstream: (u) => (u.startsWith(MCW_HOST) ? page("<html>consent</html>") : null) });
  res = await runConnector("cron-motorcitywine.js");
  run = only(w.tables, "motorcitywine");
  assert.strictEqual(run.outcome, "failed"); assert.match(run.error_sample, /not an iCalendar/);
  assert.strictEqual(eventWrites(w.db).length, 0);
  console.log("PASS: MotorCity Wine HTML-instead-of-ICS logs failed, writes nothing");

  w = world({ upstream: (u) => (u.startsWith(MCW_HOST) ? page("", 403) : null) });
  res = await runConnector("cron-motorcitywine.js");
  run = only(w.tables, "motorcitywine");
  assert.strictEqual(run.outcome, "blocked"); assert.strictEqual(run.http_status, 403);
  console.log("PASS: MotorCity Wine 403 logs blocked");

  w = world({ upstream: (u) => (u.startsWith(MCW_HOST) ? page(ics([])) : null) });
  res = await runConnector("cron-motorcitywine.js");
  run = only(w.tables, "motorcitywine");
  assert.strictEqual(run.outcome, "success"); assert.strictEqual(run.records_fetched, 0); assert.strictEqual(run.records_written, 0);
  console.log("PASS: MotorCity Wine valid empty calendar is a legitimate zero (success)");

  // Cancelled occurrence: not ingested; an already-stored row is NOT retired by this PR
  const cancelled = ics([["UID:c@x", "DTSTART;TZID=America/Detroit:20261021T200000", "SUMMARY:Cancelled Night", "STATUS:CANCELLED"]]);
  w = world({ upstream: (u) => (u.startsWith(MCW_HOST) ? page(cancelled) : null) });
  res = await runConnector("cron-motorcitywine.js");
  assert.strictEqual(res._body.upserted, 0); assert.strictEqual(eventWrites(w.db).length, 0);
  console.log("PASS: MotorCity Wine cancelled occurrence is not ingested (unchanged)");

  w = world({ upstream: (u) => (u.startsWith(MCW_HOST) ? page(mcwOne) : null) });
  await runConnector("cron-motorcitywine.js"); await runConnector("cron-motorcitywine.js");
  assert.strictEqual(w.tables.events.length, 1, "repeat ingestion: no duplicate");
  console.log("PASS: MotorCity Wine repeat ingestion is idempotent");
}

// ---------------- Planet Ant ----------------
const PA = "https://www.crowdwork.com/api/v2/planetanttheatre/shows";
const paShow = { id: 1, name: "COMEDY l The Thursday Show", recurring: true, dates: ["2026-10-22T20:00:00-04:00"], venue: "Ant Hall - 2357 Caniff Hamtramck, MI 48212", url: "https://www.crowdwork.com/x", cost_tiers: [{ cost_after_fees: 1500 }], description_short: "Improv" };

async function planetAnt() {
  let w = world({ upstream: (u) => (u.startsWith(PA) ? json({ data: [paShow] }) : null) });
  let res = await runConnector("cron-planetanttheatre.js");
  assert.strictEqual(res._body.upserted, 1);
  let run = only(w.tables, "planetanttheatre");
  assert.strictEqual(run.outcome, "success"); assert.strictEqual(run.records_fetched, 1); assert.strictEqual(run.records_written, 1);
  console.log("PASS: Planet Ant success logs counts");

  const existing = { id: "e1", external_id: "keep-me", title: "Existing", category: "theatre", start_date: "2026-10-25", status: "approved", source: "Planet Ant Theatre" };
  w = world({ events: [existing], upstream: (u) => (u.startsWith(PA) ? page("cloudflare", 403) : null) });
  res = await runConnector("cron-planetanttheatre.js");
  run = only(w.tables, "planetanttheatre");
  assert.strictEqual(run.outcome, "blocked"); assert.strictEqual(run.http_status, 403);
  assert.strictEqual(res._status, 200); assert.strictEqual(eventWrites(w.db).length, 0);
  assert.strictEqual(w.tables.events.length, 1); assert.strictEqual(w.tables.events[0].status, "approved", "a blocked run never cancels or hides stored events");
  console.log("PASS: Planet Ant 403 logs blocked and does not touch stored events");

  w = world({ upstream: (u) => (u.startsWith(PA) ? json({ error: "x" }) : null) });
  await runConnector("cron-planetanttheatre.js");
  run = only(w.tables, "planetanttheatre");
  assert.strictEqual(run.outcome, "failed"); assert.match(run.error_sample, /Unexpected response shape/);
  console.log("PASS: Planet Ant unexpected JSON shape logs failed");

  w = world({ upstream: (u) => (u.startsWith(PA) ? json({ data: [] }) : null) });
  await runConnector("cron-planetanttheatre.js");
  run = only(w.tables, "planetanttheatre");
  assert.strictEqual(run.outcome, "success"); assert.strictEqual(run.records_fetched, 0);
  console.log("PASS: Planet Ant empty data array logs success with zero fetched");
}

// ---------------- Belle Isle ----------------
const BI = "https://belleislenaturecenter.org/wp-json/tribe/events/v1/events";
const biEvent = { id: 7, title: "Nature Walk", description: "<p>Walk</p>", start_date: "2026-12-01 10:00:00", end_date: "2026-12-01 11:00:00", cost: "", url: "https://belleislenaturecenter.org/event/x", image: false };

async function belleIsle() {
  let w = world({ upstream: (u) => (u.startsWith(BI) ? json({ events: [] , total: 0, total_pages: 0 }) : null) });
  await runConnector("cron-belle-isle-nature-center.js");
  let run = only(w.tables, "belle-isle-nature-center");
  assert.strictEqual(run.outcome, "success"); assert.strictEqual(run.http_status, 200, "HTTP status is now recorded on a quiet success");
  assert.strictEqual(run.records_fetched, 0); assert.strictEqual(run.session_data.api_total, 0);
  console.log("PASS: Belle Isle {events: []} is a legitimate quiet run and records the HTTP status");

  w = world({ upstream: (u) => (u.startsWith(BI) ? json({ code: "rest_no_route", message: "No route" }) : null) });
  let res = await runConnector("cron-belle-isle-nature-center.js");
  run = only(w.tables, "belle-isle-nature-center");
  assert.strictEqual(run.outcome, "failed"); assert.strictEqual(run.http_status, 200);
  assert.match(run.error_sample, /Unexpected response shape/);
  assert.strictEqual(eventWrites(w.db).length, 0);
  console.log("PASS: Belle Isle 200 without an events array logs failed (not a quiet success)");

  w = world({ upstream: (u) => (u.startsWith(BI) ? json([]) : null) });
  await runConnector("cron-belle-isle-nature-center.js");
  assert.strictEqual(only(w.tables, "belle-isle-nature-center").outcome, "failed");
  console.log("PASS: Belle Isle top-level array response logs failed");

  w = world({ upstream: (u) => (u.startsWith(BI) ? page("<html>blocked</html>", 403) : null) });
  await runConnector("cron-belle-isle-nature-center.js");
  run = only(w.tables, "belle-isle-nature-center");
  assert.strictEqual(run.outcome, "blocked"); assert.strictEqual(run.http_status, 403);
  console.log("PASS: Belle Isle 403 logs blocked");

  w = world({ upstream: (u) => (u.startsWith(BI) ? json({ events: [biEvent], total: 1, total_pages: 1 }) : null) });
  res = await runConnector("cron-belle-isle-nature-center.js");
  assert.strictEqual(res._body.upserted, 1);
  run = only(w.tables, "belle-isle-nature-center");
  assert.strictEqual(run.outcome, "success"); assert.strictEqual(run.records_written, 1); assert.strictEqual(run.session_data.api_total, 1);
  assert.strictEqual(w.tables.events[0].status, "approved");
  console.log("PASS: Belle Isle success still publishes as before");
}

(async () => { await ticketmaster(); await motorcity(); await planetAnt(); await belleIsle(); })().catch((e) => { console.error(e); process.exit(1); });
