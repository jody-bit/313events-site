// test/cron-antonartcenter-runlog.test.js — the Anton Art Center connector,
// end to end: its real handler, the two upstream sources served from
// test/fixtures/antonartcenter/, and the shared strict in-memory database
// (test/fixtures/mock-postgrest.js), with the clock held at 2026-10-11 in
// Detroit.
//
// Plain Node assert, no dependencies.
// Run: node test/cron-antonartcenter-runlog.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const H = require("./fixtures/connector-harness.js");

const REPO_DIR = H.REPO_DIR;
const FX = path.join(REPO_DIR, "test/fixtures/antonartcenter");
const read = (f) => fs.readFileSync(path.join(FX, f), "utf8");
const R = require(`${REPO_DIR}/api/_lib/antonartcenter-rows.js`);

const NOW = "2026-10-11T14:00:00Z"; // 10:00 AM Sunday in Detroit
const POSTS = {
  "https://www.theartcenter.org/single-post/michigan-annual-liv": "post-michigan-annual.html",
  "https://www.theartcenter.org/single-post/barbara-clay-finding-my-way": "post-barbara-clay.html",
};

function upstreamFor(over = {}) {
  return (url) => {
    if (url === R.EXHIBITS_URL) return over.exhibits ? over.exhibits() : H.page(read("exhibits.html"));
    if (POSTS[url]) return over.post ? over.post(url) : H.page(read(POSTS[url]));
    if (url === R.CALENDAR_API_URL) return over.calendar ? over.calendar() : H.page(read("calendar.json"));
    return null;
  };
}

async function withNow(fn) {
  const RealDate = Date;
  const fixed = new RealDate(NOW).getTime();
  class FixedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
    static now() { return fixed; }
  }
  global.Date = FixedDate;
  try { return await fn(); } finally { global.Date = RealDate; }
}

// One run of the real handler in a fresh world.
async function run({ events = [], venues = [], upstream, failure, query = {}, secret, authorization } = {}) {
  const w = H.world({ events, venues, upstream: upstream || upstreamFor(), failure });
  process.env.SUPABASE_URL = H.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  if (secret) process.env.CRON_SECRET = secret; else delete process.env.CRON_SECRET;
  for (const key of Object.keys(require.cache)) if (key.startsWith(`${REPO_DIR}/api/`)) delete require.cache[key];
  const handler = require(`${REPO_DIR}/api/cron-antonartcenter.js`);
  const res = H.makeRes();
  await withNow(() => handler({ headers: authorization ? { authorization } : {}, query }, res));
  const runs = w.tables.source_runs;
  return { res, ...w, run: runs[runs.length - 1], runs };
}

const ours = (tables) => tables.events.filter((e) => /^aac-/.test(e.external_id || ""));
const find = (tables, title) => ours(tables).filter((e) => e.title === title);
const ID = (n) => `aac-cal-fixture-${String(n).padStart(2, "0")}`;
const stored = (o) => ({ title: "t", category: "visual", start_date: "2026-10-13", status: "approved", source: "Anton Art Center", ...o });

async function main() {
  // ---- 1. first run, empty database ----
  const first = await run();
  {
    const { res, tables, run: log } = first;
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const rows = ours(tables);
    assert.strictEqual(rows.length, 14, "2 exhibitions + 12 calendar entries (the Barbara Clay duplicate is one row)");
    const c = res._body.counts;
    assert.strictEqual(c.discovered, 15, "2 exhibitions + 13 current calendar entries (the 2 past ones are not counted)");
    assert.strictEqual(c.new, 14);
    assert.strictEqual(c.existing_updated, 0);
    assert.strictEqual(c.duplicates, 1);
    assert.strictEqual(c.new_pending_review, 6);
    assert.strictEqual(c.new_published, 8);
    assert.strictEqual(c.past_skipped, 2);
    assert.strictEqual(c.errors, 0);
    assert.strictEqual(res._body.upserted, 14);

    // exhibitions: one row each, the run intact, no time
    const barbara = find(tables, "Barbara Clay: Finding My Way");
    assert.strictEqual(barbara.length, 1, "one row, not one per day and not one per page");
    assert.strictEqual(barbara[0].external_id, "aac-ex-barbara-clay-finding-my-way");
    assert.strictEqual(barbara[0].start_date, "2026-10-24");
    assert.strictEqual(barbara[0].end_date, "2026-12-23");
    assert.strictEqual(barbara[0].time_display, null);
    assert.strictEqual(barbara[0].is_all_day, true);
    assert.strictEqual(barbara[0].status, "approved");
    assert.strictEqual(barbara[0].image_url, "https://static.wixstatic.com/media/aaaa11~mv2.jpg");
    assert.strictEqual(barbara[0].event_url, "https://www.theartcenter.org/single-post/barbara-clay-finding-my-way");
    assert.strictEqual(barbara[0].venue_address_raw, "125 Macomb Place");
    assert.strictEqual(barbara[0].venue_city_raw, "Mount Clemens");
    assert.strictEqual(find(tables, "Holiday Market").length, 1);
    assert.strictEqual(find(tables, "Holiday Market")[0].end_date, "2026-12-23");
    assert.strictEqual(rows.filter((r) => r.end_date).length, 7, "every multi-day run is one row with an end_date");

    // no time anywhere that the source did not state
    const timed = rows.filter((r) => r.time_display).map((r) => r.title).sort();
    assert.deepStrictEqual(timed, ["4th Annual Reel Arts Film Festival", "Afternoon at the Anton", "Macomb Reads 2026", "Meet the Artists Reception", "Volunteer Orientation"]);
    for (const r of rows.filter((r) => !r.time_display)) assert.strictEqual(r.is_all_day, true, `${r.title}: no time means all-day`);

    // ambiguity is held with its reason, never published
    const held = rows.filter((r) => r.status === "pending_review");
    assert.deepStrictEqual(held.map((r) => r.title).sort(), [
      "Afternoon at the Anton", "Altar Making Workshop", "DIA Inside|Out Mount Clemens", "Macomb Reads 2026", "Traveling Art Collection at RARE", "Volunteer Orientation",
    ]);
    const note = (t) => find(tables, t)[0].internal_note;
    assert.ok(/AAC GATE: TIME_CONFLICT/.test(note("Afternoon at the Anton")));
    assert.ok(/AAC GATE: .*TIMEZONE_MISSING/.test(note("Altar Making Workshop")) && /VENUE_MISSING/.test(note("Altar Making Workshop")));
    assert.ok(/AAC GATE: VENUE_AMBIGUOUS/.test(note("DIA Inside|Out Mount Clemens")));
    assert.ok(/AAC GATE: PARTNER_VENUE/.test(note("Macomb Reads 2026")));
    assert.ok(/AAC GATE: ELIGIBILITY_UNCERTAIN/.test(note("Volunteer Orientation")));
    for (const r of rows.filter((r) => r.status === "approved")) assert.ok(!r.internal_note, `${r.title}: a published row has no breadcrumb`);
    // the partner venue is stated as the partner, with no address we were not told
    const macomb = find(tables, "Macomb Reads 2026")[0];
    assert.deepStrictEqual([macomb.venue_name_raw, macomb.venue_city_raw, macomb.venue_address_raw], ["Macomb Intermediate School District", "Clinton Township", null]);
    assert.strictEqual(macomb.event_url, "https://example.org/macomb-reads-register");

    // the run is logged
    assert.strictEqual(log.source_slug, "antonartcenter");
    assert.strictEqual(log.outcome, "success");
    assert.strictEqual(log.records_fetched, 2 + 15, "2 posts + 15 calendar entries in the feed");
    assert.strictEqual(log.records_parsed, 14);
    assert.strictEqual(log.records_written, 14);
    assert.strictEqual(log.session_data.anton_art_center.new_pending_review, 6);
    // every request was uniform (the strict database would have refused otherwise), to the standard upsert URL
    for (const w of H.eventWrites(first.db)) assert.strictEqual(w.url, `${H.SUPABASE_URL}/rest/v1/events?on_conflict=external_id`);
    console.log("PASS: first run: 14 single rows (8 published, 6 held with reasons), runs kept whole, no invented time, the run logged as success");
  }

  // ---- 2. second run on the same database: idempotent; stored decisions stand ----
  {
    // a moderator rejects one published row and approves one held row between runs
    const events = first.tables.events.map((e) => ({ ...e }));
    events.find((e) => e.title === "Wishes on the Wind").status = "rejected";
    events.find((e) => e.title === "Altar Making Workshop").status = "approved";
    const second = await run({ events });
    assert.strictEqual(second.res._status, 200, JSON.stringify(second.res._body));
    const c = second.res._body.counts;
    assert.strictEqual(c.new, 0, "nothing is new");
    assert.strictEqual(c.existing_updated, 8, "the 8 clean rows are refreshed");
    assert.strictEqual(c.existing_not_written_needs_review, 6, "the 6 rows with open questions are left exactly as stored");
    assert.strictEqual(ours(second.tables).length, 14, "no duplicate rows");
    assert.strictEqual(find(second.tables, "Wishes on the Wind")[0].status, "rejected", "a rejection is never reversed");
    assert.strictEqual(find(second.tables, "Altar Making Workshop")[0].status, "approved", "a reviewer's approval is never reset");
    assert.strictEqual(find(second.tables, "Afternoon at the Anton")[0].status, "pending_review");
    assert.strictEqual(second.run.outcome, "success");
    console.log("PASS: second run: no new rows, nothing duplicated, a rejection and an approval survive, rows with open questions are not rewritten");
  }

  // ---- 3. stored authoritative data survives a thinner incoming record ----
  {
    const events = [
      stored({ external_id: ID(7), title: "4th Annual Reel Arts Film Festival", description: "Curated by the programmer.", time_display: "7:00 PM", venue_name_raw: "Anton Art Center", image_url: "https://example.org/curated.jpg", is_free: true }),
      stored({ external_id: ID(10), title: "Holiday Market", start_date: "2026-11-14", end_date: "2026-12-30", time_display: "10:00 AM – 4:00 PM", is_all_day: false, description: null, image_url: null, venue_name_raw: "Anton Art Center" }),
      stored({ external_id: "aac-ex-barbara-clay-finding-my-way", title: "Barbara Clay: Finding My Way", start_date: "2026-10-24", end_date: "2026-12-23", image_url: "https://example.org/stored-image.jpg", description: "Stored words.", is_free: true, venue_name_raw: "Anton Art Center" }),
    ];
    const { res, tables } = await run({ events });
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    const reel = find(tables, "4th Annual Reel Arts Film Festival")[0];
    assert.strictEqual(reel.description, "Curated by the programmer.", "a stored description is kept");
    assert.strictEqual(reel.status, "approved");
    const market = find(tables, "Holiday Market")[0];
    assert.strictEqual(market.time_display, "10:00 AM – 4:00 PM", "a stored time is not erased by an all-day record");
    assert.strictEqual(market.is_all_day, false, "…and the row is not flipped to all-day");
    assert.strictEqual(market.end_date, "2026-12-23", "the source's end date is the source's (it states one)");
    assert.ok(market.description, "a blank stored description is filled from the source");
    const barbara = find(tables, "Barbara Clay: Finding My Way")[0];
    assert.strictEqual(barbara.description, "Stored words.");
    assert.strictEqual(barbara.is_free, true, "a stored is_free=true is not reset by a page that merely says nothing");
    assert.strictEqual(res._body.counts.existing_updated >= 3, true);
    console.log("PASS: a stored description, time, free flag and status survive a thinner incoming record");
  }

  // ---- 4. cross-source duplicates use the established matching ----
  {
    const events = [
      // same event already carried by another source: same date, same stated venue, same title
      { ...stored({ external_id: "visitdetroit-1", title: "4th Annual Reel Arts Film Festival", venue_name_raw: "Anton Art Center", start_date: "2026-10-13" }) },
      // near misses that must NOT suppress ours
      stored({ external_id: "other-2", title: "Ornament Make & Take", venue_name_raw: "Some Other Gallery", start_date: "2026-12-13" }), // same date + title, different venue
      stored({ external_id: "other-3", title: "Meet the Artists Reception", venue_name_raw: "Anton Art Center", start_date: "2026-11-23" }), // different date
      stored({ external_id: "other-4", title: "Totally Different Show", venue_name_raw: "Anton Art Center", start_date: "2026-11-22" }), // different title
    ];
    const { res, tables } = await run({ events });
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    assert.strictEqual(find(tables, "4th Annual Reel Arts Film Festival").length, 0, "the other source's row stands; ours is not written");
    assert.strictEqual(find(tables, "Ornament Make & Take").length, 1);
    assert.strictEqual(find(tables, "Meet the Artists Reception").length, 1);
    assert.strictEqual(res._body.counts.duplicates_other_sources, 1);
    assert.strictEqual(res._body.counts.duplicates, 2, "1 within the source + 1 in another source");
    assert.strictEqual(res._body.counts.new, 13);
    assert.strictEqual(tables.events.find((e) => e.external_id === "visitdetroit-1").status, "approved", "the other source's row is untouched");
    // the VisitDetroit "35th Annual Art Party" at another venue is not ours
    const vd = [stored({ external_id: "vd-48943963", title: "Anton Art Center's 35th Annual Art Party", venue_name_raw: "Emerald Theatre", start_date: "2026-09-17" })];
    assert.strictEqual(ours((await run({ events: vd })).tables).length, 14);
    // the exhibits page was down on an earlier run: the calendar's (held, venue-less) Barbara Clay entry is stored under its own id
    const earlier = [stored({ external_id: ID(9), title: "Barbara Clay: Finding My Way", start_date: "2026-10-24", end_date: "2026-12-23", status: "pending_review", venue_name_raw: null })];
    const back = await run({ events: earlier });
    assert.strictEqual(back.tables.events.filter((e) => e.title === "Barbara Clay: Finding My Way").length, 1, "the exhibits page coming back does not create a second Barbara Clay");
    assert.ok(back.res._body.counts.duplicates_other_sources >= 1);
    console.log("PASS: a row another source already carries is not written again; near misses (venue, date, title) are");
  }

  // ---- 5. the sources fail independently ----
  {
    const noCal = await run({ upstream: upstreamFor({ calendar: () => H.page("boom", 500) }) });
    assert.strictEqual(noCal.res._status, 200);
    assert.strictEqual(ours(noCal.tables).length, 2, "the two exhibitions are still written");
    assert.strictEqual(noCal.run.outcome, "partial");
    assert.ok(/calendar: HTTP 500/.test(noCal.run.error_sample));
    assert.strictEqual(noCal.res._body.counts.errors, 1);

    const badShape = await run({ upstream: upstreamFor({ calendar: () => H.json({ result: false }) }) });
    assert.strictEqual(badShape.run.outcome, "partial");
    assert.ok(/unexpected response shape/.test(badShape.run.error_sample));
    assert.strictEqual(ours(badShape.tables).length, 2);

    const noExhibits = await run({ upstream: upstreamFor({ exhibits: () => H.page("", 503) }) });
    assert.strictEqual(noExhibits.run.outcome, "partial");
    assert.ok(/exhibits list: HTTP 503/.test(noExhibits.run.error_sample));
    assert.strictEqual(ours(noExhibits.tables).length, 13, "the calendar's own entries are still written");
    assert.ok(noExhibits.tables.events.some((e) => e.title === "Barbara Clay: Finding My Way" && e.external_id === ID(9)), "with no exhibits page, the calendar entry stands in for the exhibition");

    const onePostFails = await run({ upstream: upstreamFor({ post: (u) => (/barbara/.test(u) ? H.page("", 404) : H.page(read("post-michigan-annual.html"))) }) });
    assert.strictEqual(onePostFails.run.outcome, "partial");
    assert.ok(/barbara-clay-finding-my-way: HTTP 404/.test(onePostFails.run.error_sample));
    assert.ok(onePostFails.tables.events.some((e) => e.external_id === "aac-ex-michigan-annual-liv"));

    const empty = await run({ upstream: upstreamFor({ exhibits: () => H.page("<html>nothing</html>") }) });
    assert.strictEqual(empty.run.outcome, "partial");
    assert.ok(/no \/single-post\/ links/.test(empty.run.error_sample), "a changed exhibits page is reported, not read as 'no exhibitions'");

    const both = await run({ upstream: upstreamFor({ exhibits: () => H.page("", 500), calendar: () => H.page("", 500) }) });
    assert.strictEqual(both.run.outcome, "failed");
    assert.strictEqual(ours(both.tables).length, 0);
    const blocked = await run({ upstream: upstreamFor({ exhibits: () => H.page("", 403), calendar: () => H.page("", 403) }) });
    assert.strictEqual(blocked.run.outcome, "blocked");
    console.log("PASS: a failing source is named in the run log (partial) without costing the other; both failing is failed, or blocked on a 403");
  }

  // ---- 6. database failures abort without writes ----
  {
    const lookupFail = await run({ failure: (r) => (r.table === "events" && r.method === "GET" && /external_id=in\./.test(r.url) ? 500 : null) });
    assert.strictEqual(lookupFail.res._status, 502);
    assert.strictEqual(lookupFail.run.outcome, "failed");
    assert.strictEqual(ours(lookupFail.tables).length, 0);
    assert.strictEqual(H.eventWrites(lookupFail.db).length, 0, "a failed status lookup writes nothing");

    const dupFail = await run({ failure: (r) => (r.table === "events" && r.method === "GET" && /start_date=eq\./.test(r.url) ? 500 : null) });
    assert.strictEqual(dupFail.res._status, 502);
    assert.ok(/Duplicate lookup failed/.test(dupFail.run.error_sample));
    assert.strictEqual(H.eventWrites(dupFail.db).length, 0, "a failed duplicate lookup writes nothing rather than risk duplicates");

    const writeFail = await run({ failure: (r) => (r.table === "events" && r.method === "POST" ? 500 : null) });
    assert.strictEqual(writeFail.res._status, 502);
    assert.strictEqual(writeFail.run.outcome, "failed");
    console.log("PASS: a failed status lookup, duplicate lookup or write is a failed run; the first two write nothing");
  }

  // ---- 7. dry run: every read, every decision, no write ----
  {
    const seeded = [stored({ external_id: ID(7), title: "4th Annual Reel Arts Film Festival", description: "Stored.", venue_name_raw: "Anton Art Center" })];
    const d = await run({ events: seeded, query: { dry_run: "1" } });
    assert.strictEqual(d.res._status, 200, JSON.stringify(d.res._body));
    assert.strictEqual(d.res._body.dry_run, true);
    assert.strictEqual(d.res._body.wrote, 0);
    assert.strictEqual(H.eventWrites(d.db).length, 0, "no events request");
    assert.strictEqual(d.db.log.filter((r) => r.method !== "GET").length, 0, "no write of any kind, including no source_runs row");
    assert.strictEqual(d.runs.length, 0);
    assert.strictEqual(d.tables.events.length, 1, "the database is exactly as it was");
    assert.strictEqual(d.res._body.counts.new, 13);
    assert.strictEqual(d.res._body.counts.existing_updated, 1);
    assert.strictEqual(d.res._body.plan.length, 14);
    const actions = Object.fromEntries(d.res._body.plan.map((p) => [p.external_id, p.action]));
    assert.strictEqual(actions[ID(7)], "update_existing");
    assert.strictEqual(actions[ID(8)], "new_pending_review");
    assert.strictEqual(actions["aac-ex-barbara-clay-finding-my-way"], "new");
    assert.ok(d.res._body.needs_review.length >= 6);
    console.log("PASS: dry run reads everything, decides everything, writes nothing (no events, no source_runs row)");
  }

  // ---- 8. auth ----
  {
    const denied = await run({ secret: "s3cret" });
    assert.strictEqual(denied.res._status, 401);
    assert.strictEqual(denied.tables.events.length, 0);
    const wrong = await run({ secret: "s3cret", authorization: "Bearer nope" });
    assert.strictEqual(wrong.res._status, 401);
    const ok = await run({ secret: "s3cret", authorization: "Bearer s3cret" });
    assert.strictEqual(ok.res._status, 200);
    delete process.env.CRON_SECRET;
    console.log("PASS: the CRON_SECRET check is enforced (a dry run needs it too)");
  }

  // ---- 9. a venue row, once it exists, is linked by exact name only ----
  {
    const venues = [{ id: "venue-anton", name: "Anton Art Center" }, { id: "venue-other", name: "Anton Art" }];
    const { tables, res } = await run({ venues });
    assert.strictEqual(res._status, 200, JSON.stringify(res._body));
    assert.strictEqual(find(tables, "Annual Artist Choice Show")[0].venue_id, "venue-anton");
    assert.strictEqual(find(tables, "Macomb Reads 2026")[0].venue_id == null, true, "a partner venue is never linked to the gallery");
    const without = await run();
    assert.ok(ours(without.tables).every((r) => r.venue_id == null), "with no venue row, venue_id stays empty (no venue is created or guessed)");
    console.log("PASS: venue_id is linked only by exact name; none is created or guessed");
  }

  console.log("\nAll cron-antonartcenter-runlog tests passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });
