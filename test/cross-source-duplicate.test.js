"use strict";
// Cross-source duplicate review (P0 gap, EI 2026-11-20). Fixtures are real rows (ids are the first 8 chars of the uuid).
// Report-only: asserts findings, never any write. Scores are printed so the thresholds are decided by fixtures, not tuned blind.
const test = require("node:test"), assert = require("node:assert/strict");
const { findingsForPublished, findingsForImport, titleSimilarity, venueKeyLoose } = require("../api/_lib/quality-contract");
const { buildCoverage } = require("../api/_lib/quality-coverage");
const SLATER = { venue_name_raw: "Slater Family Ice Arena", venue_city_raw: "Bowling Green", venue_address_raw: "417 N Mercer Rd" };
const MACOMB = { venue_name_raw: "Macomb Center for the Performing Arts", venue_city_raw: "Clinton Township", venue_address_raw: "44575 Garfield Road" };
const LIV_REC = { venue_name_raw: "Jack E. Kirksey Recreation Center", venue_city_raw: "Livonia", venue_address_raw: "15100 Hubbard" };
const SWC = { venue_name_raw: "Senior Wellness Center", venue_city_raw: "Livonia", venue_address_raw: "32001 Five Mile Road" };
const WALK = { venue_name_raw: "Walkerville Brewery", venue_city_raw: "Windsor" };
const TBA = (city) => ({ venue_name_raw: "Venue TBA", venue_city_raw: city, venue_address_raw: null });
const row = (id, source, title, start_date, time_display, venue, extra) => Object.assign({ id, source, title, start_date, time_display, status: "approved", category: "community", event_url: "https://example.org/" + id }, venue, extra || {});
const BGSU = "Bowling Green State University";
const MUST_FLAG = {
  "Walkerville": [row("ba1a85c7", "Tourism Windsor Essex Pelee Island", "Holiday Market at Walkerville Brewery", "2026-11-20", "5:00 PM", { ...WALK, venue_address_raw: "525 Argyle Road" }), row("3c070389", "Manual", "Walkerville Brewery Holiday Market", "2026-11-20", "Fri 5–10 PM · Sat 11 AM–5 PM", { ...WALK, venue_address_raw: "525 Argyle Rd" })],
  "Aladdin 11AM": [row("039f488c", "Macomb Community College", "Disney's Aladdin JR.", "2026-11-21", "11:00 AM", MACOMB), row("34f2a972", "VisitDetroit", "Aladdin Jr", "2026-11-21", "11:00 AM", { venue_name_raw: "Macomb Center For The Performing Arts", venue_city_raw: "Charter Township Of Clinton", venue_address_raw: "44575 Garfield RD" })],
  "BGSU Nov 20": [row("c0460213", "Ticketmaster", "Bowling Green Falcons Hockey vs. Augustana Vikings Mens Hockey", "2026-11-20", "7:07 PM", SLATER), row("7974ed25", BGSU, "BGSU Ice Hockey vs #10 Augustana- Teacher Appreciation Weekend", "2026-11-20", "7:07 PM – 10:07 PM", SLATER)],
  "BGSU Nov 21": [row("0fdc514a", "Ticketmaster", "Bowling Green Falcons Hockey vs. Augustana Vikings Mens Hockey", "2026-11-21", "6:07 PM", SLATER), row("d714b40a", BGSU, "BGSU Ice Hockey vs #10 Augustana- Teacher Appreciation Weekend; Falcons Fight Cancer; Epilepsy Night", "2026-11-21", "6:07 PM – 9:07 PM", SLATER)],
  "Elks": [row("a0b7a0fd", "City of Livonia - Community Events", "Elks Hoop Shoot Contest", "2026-12-05", "9:00 AM – 11:00 AM", LIV_REC), row("aa2467fb", "City of Livonia - Parks and Recreation", "Elks Hoop Shoot Contest", "2026-12-05", "9:00 AM – 11:00 AM", LIV_REC)],
  "Light Up Livonia": [row("60984be3", "City of Livonia - Community Events", "Light Up Livonia Signup Deadline", "2026-12-07", "6:00 AM – 9:00 AM", TBA("Livonia")), row("3bd110fa", "City of Livonia - Parks and Recreation", "Light Up Livonia Signup Deadline", "2026-12-07", "6:00 AM – 9:00 AM", TBA("Livonia"))],
  "Grinch": [row("aa2f7f94", "City of Livonia - Community Events", "The Grinch Who Stole Lunch", "2026-12-12", "1:00 PM – 2:30 PM", SWC), row("32b7c5b9", "City of Livonia - Parks and Recreation", "The Grinch Who Stole Lunch", "2026-12-12", "1:00 PM – 2:30 PM", SWC)],
  "Vinylfest": [row("57d1eddb", "Eastern Market Partnership", "3rd Annual Detroit Vinylfest", "2027-05-02", "10:00 AM – 4:00 PM", { venue_name_raw: "Eastern Market", venue_city_raw: "2810 Russell St.", venue_address_raw: "Shed 5" }), row("833633b1", "VisitDetroit", "3rd annual Detroit Vinylfest", "2027-05-02", "10:00 AM – 4:00 PM", { venue_name_raw: "Eastern Market", venue_city_raw: "Detroit", venue_address_raw: "2934 Russell Street", venue_id: "11111111-1111-1111-1111-111111111111" })],
};
const LIB = { venue_name_raw: "Mount Clemens Public Library", venue_city_raw: "Mount Clemens", venue_address_raw: "150 Cass Ave" };
const MUST_NOT = {
  "Aladdin 11AM vs 3PM (two showings)": [MUST_FLAG["Aladdin 11AM"][1], row("44221057", "Macomb Community College", "Disney's Aladdin JR.", "2026-11-21", "3:00 PM", MACOMB)],
  "BGSU Public Skate vs hockey": [row("c7740837", BGSU, "Public Skate", "2026-11-20", "7:00 PM – 8:50 PM", SLATER), MUST_FLAG["BGSU Nov 20"][0]],
  "Mount Clemens library programs (same room, different titles; one at the same time)": [row("lib00001", "Library A", "Nutrition and Food Classes", "2026-11-24", "6:00 PM", LIB), row("lib00002", "Library B", "POP-UP Tinker Time", "2026-11-24", "6:00 PM", LIB)],
  "Tree Lighting vs Kris Kringle": [row("0bfcf4c4", "St. Clair Shores - Events & Programs", "Tree Lighting", "2026-12-04", "6:00 PM – 8:00 PM", TBA("St. Clair Shores")), row("29e3b76d", "City of Rochester - Events", "Kris Kringle", "2026-12-04", "10:00 AM – 9:00 PM", TBA("Rochester"))],
  "Lunch with Santa vs Grinch (different time)": [row("6c561065", "City of Livonia - Parks and Recreation", "(SOLD OUT) Lunch with Santa", "2026-12-12", "10:30 AM – 12:00 PM", SWC), MUST_FLAG["Grinch"][0]],
};
const PAIR = ["cross_source_title_date_review", "same_venue_same_start_review", "same_venue_time_unresolved"];
const codes = (rows, today) => findingsForPublished(rows, today || "2026-11-20").filter((f) => PAIR.includes(f.code)); // any pair-level flag; each pair must count once
test("must-flag: each real duplicate pair is flagged once, review-only; per-fixture scores printed", () => {
  for (const [name, pair] of Object.entries(MUST_FLAG)) {
    const f = codes(pair); const sim = titleSimilarity(pair[0].title, pair[1].title);
    console.log("  must-flag", name.padEnd(18), "venue=" + venueKeyLoose(pair[0], pair[1]), "overlap=" + sim.score.toFixed(2), "shared=" + sim.shared, "equal_sets=" + sim.equal_sets, "flag=" + (f[0] && f[0].code));
    assert.equal(f.length, 1, name);
    assert.equal(f[0].class, "actionable"); assert.equal(f[0].status, "open");
  }
});
const onlyNew = (rows) => findingsForPublished(rows, "2026-11-20").filter((f) => f.code === "cross_source_title_date_review"); // existing strict rule is unchanged (it may still flag same-room same-time pairs)
test("must-not-flag: different-time, different-title and placeholder-venue groups produce no finding", () => {
  for (const [name, pair] of Object.entries(MUST_NOT)) { console.log("  must-not", name, "overlap=" + titleSimilarity(pair[0].title, pair[1].title).score.toFixed(2)); assert.equal(onlyNew(pair).length, 0, name); }
});
test("same source never flags; unknown start with dissimilar titles stays unflagged (unchecked, not pass)", () => {
  const [a, b] = MUST_FLAG["Elks"]; assert.equal(onlyNew([a, { ...b, source: a.source }]).length, 0);
  const x = row("u1", "S1", "Book Club", "2026-11-22", "Evening", LIB), y = row("u2", "S2", "Craft Night", "2026-11-22", null, LIB);
  assert.equal(onlyNew([x, y]).length, 0);
});
test("pairs the strict same-venue rule already flags are not double counted (inside the 7-day window)", () => {
  const all = findingsForPublished(MUST_FLAG["BGSU Nov 20"], "2026-11-20");
  assert.equal(all.filter((f) => f.code === "same_venue_same_start_review").length, 1);
  assert.equal(all.filter((f) => f.code === "cross_source_title_date_review").length, 0);
});
test("coverage: a flagged pair is pair_scan review for both rows; the fixture rows are not pass", () => {
  const pair = MUST_FLAG["Aladdin 11AM"];
  const findings = findingsForPublished(pair, "2026-11-20");
  const cov = buildCoverage(pair, { stage: "published", today: "2026-11-20", nowMs: Date.parse("2026-11-20T12:00:00Z"), findings });
  assert.equal(cov.checks.pair_scan.review, 2); assert.equal(cov.checks.pair_scan.pass, 0);
});
test("import stage: candidate vs stored row is flagged; does not mutate input", () => {
  const [a, b] = MUST_FLAG["Vinylfest"]; const before = JSON.stringify([a, b]);
  const f = findingsForImport([a], [b], {}).filter((x) => x.code === "cross_source_title_date_review");
  assert.equal(f.length, 1); assert.equal(JSON.stringify([a, b]), before);
});
test("pair_scan: a row starting beyond the 7-day pair window is unchecked, never pass; inside the window a clean row still passes", () => {
  const near = row("n1", "S1", "Near Show", "2026-11-22", "7:00 PM", LIB), far = row("f1", "S1", "Far Show", "2026-12-20", "7:00 PM", LIB);
  const cov = buildCoverage([near, far], { stage: "published", today: "2026-11-20", nowMs: Date.parse("2026-11-20T12:00:00Z"), findings: findingsForPublished([near, far], "2026-11-20") });
  assert.equal(cov.checks.pair_scan.pass, 1); assert.equal(cov.checks.pair_scan.unchecked, 1);
  assert.ok(cov.limits.some((l) => /next 7 days/.test(l)));
});
test("pair_scan: a broad schedule-unverified range never active on a window day is unchecked, not pass (same days() logic as the scan)", () => {
  const broad = row("b1", "S1", "Winter Lights Trail", "2026-11-10", "7:00 PM", LIB, { end_date: "2027-01-10" });
  const EventDates = require("../event-dates");
  const window = [0, 1, 2, 3, 4, 5, 6].map((i) => new Date(Date.parse("2026-11-20T12:00:00Z") + i * 86400000).toISOString().slice(0, 10));
  const active = window.some((d) => EventDates.isActiveOn(broad, d));
  const cov = buildCoverage([broad], { stage: "published", today: "2026-11-20", nowMs: Date.parse("2026-11-20T12:00:00Z"), findings: [] });
  assert.equal(cov.checks.pair_scan.pass, active ? 1 : 0); // never a pass unless the scan could actually compare it
  assert.equal(cov.checks.pair_scan.unchecked, active ? 0 : 1);
  console.log("  broad unverified range active in window:", active, "->", active ? "pass (comparable)" : "unchecked");
  assert.equal(EventDates.scheduleState(broad), "unverified");
});
test("must-not (disclosed limit): same venue name in different cities with different titles is not flagged", () => {
  const a = row("c1", "S1", "Holiday Concert", "2026-11-22", "7:00 PM", { venue_name_raw: "Community Center", venue_city_raw: "Livonia", venue_address_raw: "1 A St" });
  const b = row("c2", "S2", "Christmas Craft Fair", "2026-11-22", "7:00 PM", { venue_name_raw: "Community Center", venue_city_raw: "Warren", venue_address_raw: "9 B St" });
  assert.equal(onlyNew([a, b]).length, 0);
});
