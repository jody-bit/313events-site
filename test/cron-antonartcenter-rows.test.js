// test/cron-antonartcenter-rows.test.js — the Anton Art Center source's
// parsing and decisions, with no network and no database
// (api/_lib/antonartcenter-rows.js). Inputs are the real titles, dates,
// flags and locations observed on theartcenter.org on 2026-10-11 (see
// test/fixtures/antonartcenter/README.md for what is real and what is a
// placeholder).
//
// Plain Node assert, no dependencies.
// Run: node test/cron-antonartcenter-rows.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const R = require(`${REPO_DIR}/api/_lib/antonartcenter-rows.js`);
const FX = path.join(REPO_DIR, "test/fixtures/antonartcenter");
const read = (f) => fs.readFileSync(path.join(FX, f), "utf8");
const TODAY = "2026-10-11";
const calendar = JSON.parse(read("calendar.json")).value;
const byTitle = (title) => calendar.filter((e) => e.title === title);
const cal = (title, i = 0) => R.calendarRow(byTitle(title)[i], { today: TODAY });

// ---- 1. date ranges in text ----
{
  const p = R.parseDateRangeText;
  assert.deepStrictEqual(p("October 24 - December 23, 2026"), { start: "2026-10-24", end: "2026-12-23", problem: null });
  assert.deepStrictEqual(p("January 30 - February 27, 2027"), { start: "2027-01-30", end: "2027-02-27", problem: null });
  assert.deepStrictEqual(p("October 24 – December 23, 2026"), { start: "2026-10-24", end: "2026-12-23", problem: null }, "an en dash is a hyphen");
  assert.deepStrictEqual(p("November 14 - 22, 2026"), { start: "2026-11-14", end: "2026-11-22", problem: null });
  assert.deepStrictEqual(p("December 20, 2026 - January 9, 2027"), { start: "2026-12-20", end: "2027-01-09", problem: null });
  assert.deepStrictEqual(p("December 20 - January 9, 2027"), { start: "2026-12-20", end: "2027-01-09", problem: null }, "a start month after the end month is the year before");
  assert.deepStrictEqual(p("October 24, 2026"), { start: "2026-10-24", end: null, problem: null });
  assert.deepStrictEqual(p("October 24 - October 24, 2026"), { start: "2026-10-24", end: null, problem: null }, "a one-day run has no end_date");
  // real titles on the site that give no day: unparseable, never guessed
  for (const t of ["May - October, 2026", "2026 - 2027", "", "Spring 2027", "October 31 - October 1, 2026", "February 30 - March 2, 2026"]) {
    assert.strictEqual(p(t).problem, "DATE_RANGE_UNPARSEABLE", `"${t}" is not a date range`);
    assert.strictEqual(p(t).start, null);
  }
  console.log("PASS: date-range text parses the shapes the site uses; month-only, year-only, reversed and impossible ranges are unparseable, never guessed");
}

// ---- 2. text scans used only to DETECT disagreement ----
{
  assert.deepStrictEqual(R.timesInText("Thursday,1-3pm on October 29"), [{ start: 13 * 60, end: 15 * 60 }]);
  assert.deepStrictEqual(R.timesInText("Doors at 6 p.m."), [{ start: 18 * 60, end: null }]);
  assert.deepStrictEqual(R.timesInText("10:00am - 2pm"), [{ start: 10 * 60, end: 14 * 60 }]);
  assert.deepStrictEqual(R.datesInText("October 24, 2026 | Lorenzo Cultural Center", 2026), ["2026-10-24"]);
  assert.deepStrictEqual(R.datesInText("on October 29", 2026), ["2026-10-29"], "a missing year takes the event's year");
  assert.strictEqual(R.formatClock(13, 5), "1:05 PM");
  assert.strictEqual(R.formatClock(0, 0), "12:00 AM");
  assert.strictEqual(R.formatClock(12, 0), "12:00 PM");
  assert.strictEqual(R.formatClock(25, 0), null);
  console.log("PASS: description scans find the clock times and dates a description states");
}

// ---- 3. images ----
{
  const sized = "https://static.wixstatic.com/media/abc123~mv2.jpg/v1/fill/w_816,h_600,al_c,q_85/abc123~mv2.jpg";
  assert.strictEqual(R.originalImageUrl(sized), "https://static.wixstatic.com/media/abc123~mv2.jpg", "the Wix resize suffix is removed: the original image");
  assert.strictEqual(R.originalImageUrl("https://static.wixstatic.com/media/abc123~mv2.jpg"), "https://static.wixstatic.com/media/abc123~mv2.jpg");
  assert.strictEqual(R.originalImageUrl("https://example.org/a.png"), "https://example.org/a.png", "another host is returned as given");
  assert.strictEqual(R.originalImageUrl(""), null);
  assert.strictEqual(R.originalImageUrl(null), null);
  console.log("PASS: image URLs are the original upload, not the resized copy");
}

// ---- 4. exhibits ----
{
  const urls = R.parseExhibitListing(read("exhibits.html"));
  assert.deepStrictEqual(urls, [
    "https://www.theartcenter.org/single-post/michigan-annual-liv",
    "https://www.theartcenter.org/single-post/barbara-clay-finding-my-way",
  ], "each /single-post/ link once, in page order");
  assert.deepStrictEqual(R.parseExhibitListing("<a href='/blog/x'>x</a>"), []);

  const post = R.parseExhibitPost(read("post-barbara-clay.html"), urls[1]);
  assert.strictEqual(post.name, "Barbara Clay: Finding My Way");
  assert.deepStrictEqual([post.range.start, post.range.end], ["2026-10-24", "2026-12-23"]);
  assert.deepStrictEqual([post.bodyRange.start, post.bodyRange.end], ["2026-10-24", "2026-12-23"], "the body's first line repeats the run");
  assert.strictEqual(post.gallery, "Level 2 Gallery");
  assert.ok(post.description.startsWith("Fixture description paragraph"), "the description is the paragraph after the gallery line");
  assert.ok(!/PROGRAM|---|GALLERY HOURS|admission/i.test(post.description), "the description stops at the first rule / section heading");
  assert.strictEqual(post.isFree, true);
  assert.strictEqual(post.image_url, "https://static.wixstatic.com/media/aaaa11~mv2.jpg");
  assert.deepStrictEqual(post.problems, []);

  const made = R.exhibitRow(post);
  assert.deepStrictEqual(made.review, []);
  const row = made.row;
  assert.strictEqual(row.external_id, "aac-ex-barbara-clay-finding-my-way");
  assert.strictEqual(row.start_date, "2026-10-24");
  assert.strictEqual(row.end_date, "2026-12-23", "ONE row carries the whole run");
  assert.strictEqual(row.time_display, null, "no time is invented for an exhibition");
  assert.strictEqual(row.is_all_day, true);
  assert.strictEqual(row.venue_name_raw, "Anton Art Center");
  assert.strictEqual(row.venue_address_raw, "125 Macomb Place");
  assert.strictEqual(row.venue_city_raw, "Mount Clemens");
  assert.strictEqual(row.event_url, "https://www.theartcenter.org/single-post/barbara-clay-finding-my-way");
  assert.strictEqual(row.category, "visual");
  assert.strictEqual(row.is_free, true);
  assert.ok(!("start_time" in row) && !Object.keys(row).some((k) => /time/.test(k) && k !== "time_display"));

  // a title and a body that disagree is held, not resolved
  const conflicted = read("post-barbara-clay.html").replace("<p>October 24 - December 23, 2026</p>", "<p>October 31 - December 23, 2026</p>");
  const c = R.parseExhibitPost(conflicted, urls[1]);
  assert.ok(c.problems.includes("DATE_CONFLICT"));
  assert.deepStrictEqual(R.exhibitRow(c).review, ["DATE_CONFLICT"]);
  assert.strictEqual(R.exhibitRow(c).row.start_date, "2026-10-24", "the title is what the site publishes");

  // a title whose run cannot be read: no row (nothing to write), reported with a reason
  const vague = read("post-barbara-clay.html").split("October 24 - December 23, 2026").join("May - October, 2026");
  const v = R.exhibitRow(R.parseExhibitPost(vague, urls[1]));
  assert.strictEqual(v.row, null);
  assert.ok(v.review.includes("DATE_RANGE_UNPARSEABLE"));
  // …but if the body states a clean run the row is kept AND held
  const halfVague = read("post-barbara-clay.html").replace(/(og:title" content="[^|]*\| )October 24 - December 23, 2026/, "$1Fall 2026").replace(/<h1([^>]*)>([^|]*)\| October 24 - December 23, 2026/, "<h1$1>$2| Fall 2026");
  const hv = R.exhibitRow(R.parseExhibitPost(halfVague, urls[1]));
  assert.ok(hv.row && hv.review.includes("DATE_RANGE_UNPARSEABLE"), "an unclear title run is held even when the body is clear");

  assert.strictEqual(R.parseExhibitPost("<html></html>", "u").problems[0], "TITLE_MISSING");
  console.log("PASS: an exhibition is one row with its whole run, no time, the gallery's address and the original image; conflicting or unreadable runs are held or reported");
}

// ---- 5. locations ----
{
  const g = R.parseLocation("Anton Art Center, 125 Macomb Place, Mount Clemens, MI 48043");
  assert.ok(g.isGallery && g.statedAddress && g.address === "125 Macomb Place" && g.city === "Mount Clemens");
  const g2 = R.parseLocation("Anton Art Center, Admin Office, Level 2");
  assert.ok(g2.isGallery && !g2.statedAddress, "the gallery's own address is the constant, not text the entry never stated");
  const amb = R.parseLocation("Downtown Mount Clemens ~ Anton Art Center");
  assert.ok(amb.ambiguous && !amb.isGallery && amb.address === null);
  const partner = R.parseLocation("Macomb Intermediate School District, Clinton Township");
  assert.deepStrictEqual([partner.partner, partner.name, partner.city, partner.address], [true, "Macomb Intermediate School District", "Clinton Township", null]);
  const bare = R.parseLocation("Recreation Authority of Roseville and Eastpointe");
  assert.deepStrictEqual([bare.partner, bare.name, bare.city], [true, "Recreation Authority of Roseville and Eastpointe", null], "no city is invented for a partner venue");
  assert.strictEqual(R.parseLocation("").missing, true);
  assert.strictEqual(R.parseLocation(null).missing, true);
  console.log("PASS: locations: the gallery, a two-place string, a partner venue and a missing venue are told apart; nothing is filled in that the text does not say");
}

// ---- 6. calendar entries (the 13 observed on 2026-10-11) ----
{
  const expect = {
    "Traveling Art Collection at RARE": { start: "2026-10-01", end: "2027-01-11", time: null, allDay: true, review: ["PARTNER_VENUE"], venue: "Recreation Authority of Roseville and Eastpointe" },
    "Annual Artist Choice Show": { start: "2026-08-15", end: "2026-10-14", time: null, allDay: true, review: [], venue: "Anton Art Center" },
    "Wishes on the Wind": { start: "2026-08-29", end: "2026-10-14", time: null, allDay: true, review: [], venue: "Anton Art Center" },
    "DIA Inside|Out Mount Clemens": { start: "2026-05-01", end: "2026-10-14", time: null, allDay: true, review: ["VENUE_AMBIGUOUS"], venue: "Downtown Mount Clemens ~ Anton Art Center" },
    "4th Annual Reel Arts Film Festival": { start: "2026-10-13", end: null, time: "6:00 PM – 9:00 PM", allDay: false, review: [], venue: "Anton Art Center", category: "film" },
    "Afternoon at the Anton": { start: "2026-10-29", end: null, time: "1:00 PM – 2:30 PM", allDay: false, review: ["TIME_CONFLICT"], venue: "Anton Art Center" },
    "Barbara Clay: Finding My Way": { start: "2026-10-24", end: "2026-12-23", time: null, allDay: true, review: ["VENUE_MISSING"], venue: null },
    "Holiday Market": { start: "2026-11-14", end: "2026-12-23", time: null, allDay: true, review: [], venue: "Anton Art Center", category: "vendor", index: 1 },
    "Meet the Artists Reception": { start: "2026-11-22", end: null, time: "1:00 PM – 3:00 PM", allDay: false, review: [], venue: "Anton Art Center" },
    "Ornament Make & Take": { start: "2026-12-13", end: null, time: null, allDay: true, review: [], venue: "Anton Art Center" },
    "Macomb Reads 2026": { start: "2026-11-07", end: null, time: "10:00 AM – 2:00 PM", allDay: false, review: ["PARTNER_VENUE"], venue: "Macomb Intermediate School District", category: "community" },
    "Volunteer Orientation": { start: "2026-10-24", end: null, time: "9:00 AM – 10:00 AM", allDay: false, review: ["ELIGIBILITY_UNCERTAIN"], venue: "Anton Art Center", category: "community" },
    "Altar Making Workshop": { start: "2026-10-24", end: null, time: null, allDay: true, review: ["TIMEZONE_MISSING", "VENUE_MISSING"], venue: null },
  };
  for (const [title, e] of Object.entries(expect)) {
    const made = cal(title, e.index || 0);
    assert.ok(made.row, `${title} is a row`);
    assert.strictEqual(made.row.start_date, e.start, `${title}: start`);
    assert.strictEqual(made.row.end_date, e.end, `${title}: end`);
    assert.strictEqual(made.row.time_display, e.time, `${title}: time`);
    assert.strictEqual(made.row.is_all_day, e.allDay, `${title}: all day`);
    assert.deepStrictEqual(made.review, e.review, `${title}: review codes`);
    assert.strictEqual(made.row.venue_name_raw, e.venue, `${title}: venue`);
    assert.strictEqual(made.row.category, e.category || "visual", `${title}: category`);
    assert.ok(/^aac-cal-/.test(made.row.external_id));
  }
  // the two past entries are not rows
  assert.strictEqual(cal("Michigan Annual LIII").past, true);
  assert.strictEqual(cal("Holiday Market", 0).past, true);
  console.log("PASS: all 13 observed calendar entries become the expected single rows with the expected review codes; past entries are dropped");
}

// ---- 7. times are never invented ----
{
  const base = { id: "event_x", title: "Workshop", startDate: "2026-11-01", endDate: "2026-11-01", timezone: "America/New_York", startHour: 12, startMinutes: 0, endHour: 13, endMinutes: 0, location: "Anton Art Center", description: "Fixture." };
  const run = (o) => R.calendarRow({ ...base, ...o }, { today: TODAY });
  assert.strictEqual(run({ dateonly: true }).row.time_display, null, "date-only entries carry the widget's noon default: not a time");
  assert.strictEqual(run({ dateonly: true }).row.is_all_day, true);
  assert.strictEqual(run({ allday: true }).row.time_display, null);
  const noon = run({});
  assert.strictEqual(noon.row.time_display, "12:00 PM – 1:00 PM");
  assert.ok(noon.review.includes("TIME_POSSIBLY_DEFAULT"), "a bare noon-1pm is the default hour or a real noon event: held, not guessed");
  assert.strictEqual(run({ startHour: 14, endHour: 15 }).row.time_display, "2:00 PM – 3:00 PM");
  assert.deepStrictEqual(run({ startHour: 14, endHour: 15 }).review, []);
  assert.strictEqual(run({ startHour: 14, endHour: 15, startonly: true }).row.time_display, "2:00 PM", "start-only carries no end");
  assert.strictEqual(run({ startHour: null, startMinutes: null }).row.time_display, null);
  assert.strictEqual(run({ startHour: 15, endHour: 14 }).row.time_display, "3:00 PM", "an end before the start is dropped, not shown");
  assert.strictEqual(run({ timezone: undefined, startHour: 14, endHour: 15 }).row.time_display, null, "hours with no timezone are not used");
  assert.ok(run({ timezone: undefined, startHour: 14, endHour: 15 }).review.includes("TIMEZONE_MISSING"));
  console.log("PASS: no time is invented: all-day / date-only / start-only / zoneless / default-hour entries are handled without making one up");
}

// ---- 8. dates: the strings win; a timestamp alone is held ----
{
  // 2026-10-24 00:00 UTC is the evening of the 23rd in Detroit; the organiser's date is the 24th
  const e = { ...byTitle("Volunteer Orientation")[0] };
  assert.strictEqual(new Date(e.start).toISOString(), "2026-10-24T00:00:00.000Z");
  assert.strictEqual(R.calendarRow(e, { today: TODAY }).row.start_date, "2026-10-24", "startDate, not the timestamp converted to Detroit time");
  // timestamp only, description does not state the date
  const ts = { id: "event_y", title: "Open Studio", start: Date.parse("2026-11-03T00:00:00Z"), end: Date.parse("2026-11-03T00:00:00Z"), location: "Anton Art Center", description: "Come make art.", dateonly: true };
  const r = R.calendarRow(ts, { today: TODAY });
  assert.strictEqual(r.row.start_date, "2026-11-03");
  assert.ok(r.review.includes("DATE_FROM_TIMESTAMP_ONLY"));
  // the same, with the description independently stating it: not held for that reason
  const confirmed = R.calendarRow({ ...ts, description: "November 3, 2026 at the Anton" }, { today: TODAY });
  assert.ok(!confirmed.review.includes("DATE_FROM_TIMESTAMP_ONLY"));
  // a description naming a different day than the structured date
  const wrong = R.calendarRow({ ...ts, startDate: "2026-11-03", endDate: "2026-11-03", description: "Join us November 10 for open studio." }, { today: TODAY });
  assert.ok(wrong.review.includes("DATE_CONFLICT"));
  // end before start
  const rev = R.calendarRow({ ...ts, startDate: "2026-11-05", endDate: "2026-11-01" }, { today: TODAY });
  assert.ok(rev.review.includes("DATE_CONFLICT") && rev.row.end_date === null);
  // nothing usable
  assert.strictEqual(R.calendarRow({ id: "event_z", title: "No dates" }, { today: TODAY }).row, null);
  assert.strictEqual(R.calendarRow({ title: "No id", startDate: "2026-11-05" }, { today: TODAY }).row, null);
  assert.strictEqual(R.calendarRow({ id: "event_q", startDate: "2026-11-05" }, { today: TODAY }).row, null);
  console.log("PASS: calendar dates come from the organiser's date strings; a timestamp-only or contradicted date is held; unusable records are not rows");
}

// ---- 9. the same exhibition on both pages is one row ----
{
  const ex = R.exhibitRow(R.parseExhibitPost(read("post-barbara-clay.html"), "https://www.theartcenter.org/single-post/barbara-clay-finding-my-way"));
  const other = R.exhibitRow(R.parseExhibitPost(read("post-michigan-annual.html"), "https://www.theartcenter.org/single-post/michigan-annual-liv"));
  const cals = calendar.map((c) => R.calendarRow(c, { today: TODAY })).filter((c) => c.row);
  assert.strictEqual(cals.length, 13);
  const merged = R.mergeSources([ex, other], cals);
  assert.strictEqual(merged.rows.length, 14, "2 exhibitions + 12 other calendar entries");
  assert.strictEqual(merged.duplicates.length, 1);
  assert.strictEqual(merged.duplicates[0].keptExternalId, "aac-ex-barbara-clay-finding-my-way");
  assert.ok(/same dates/.test(merged.duplicates[0].reason));
  assert.deepStrictEqual(merged.rows.find((r) => /Barbara/.test(r.row.title)).review, [], "an agreeing duplicate adds no review code");
  assert.ok(!merged.rows.some((r) => r.row.external_id.startsWith("aac-cal-") && /Barbara/.test(r.row.title)));
  // the calendar disagrees about the run: one row, held
  const moved = cals.map((c) => (/Barbara/.test(c.row.title) ? { ...c, row: { ...c.row, end_date: "2026-12-30" } } : c));
  const m2 = R.mergeSources([ex, other], moved);
  assert.deepStrictEqual(m2.rows.find((r) => /Barbara/.test(r.row.title)).review, ["DATE_CONFLICT_BETWEEN_PAGES"]);
  // a calendar entry that fills a blank image
  const noImg = { ...ex, row: { ...ex.row, image_url: null } };
  const withImg = cals.map((c) => (/Barbara/.test(c.row.title) ? { ...c, row: { ...c.row, image_url: "https://static.wixstatic.com/media/cal-img~mv2.jpg" } } : c));
  assert.strictEqual(R.mergeSources([noImg], withImg).rows[0].row.image_url, "https://static.wixstatic.com/media/cal-img~mv2.jpg");
  // same title, different dates: not the same exhibition
  const holiday = R.mergeSources([{ row: { ...ex.row, title: "Holiday Market", start_date: "2026-03-01", end_date: "2026-03-05" }, review: [] }], cals);
  assert.ok(holiday.rows.some((r) => r.row.external_id.startsWith("aac-cal-") && r.row.title === "Holiday Market"));
  assert.ok(!R.publicFields(ex.row)._kind && !("_gallery" in R.publicFields(ex.row)), "working fields are not sent to the database");
  console.log("PASS: an exhibition on both pages is one row; disagreeing dates hold it; a calendar entry only fills a blank");
}

console.log("\nAll cron-antonartcenter-rows tests passed.");
