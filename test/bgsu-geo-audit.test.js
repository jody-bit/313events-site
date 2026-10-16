"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { auditRow, auditRows, CLASSES } = require("../api/_lib/bgsu-geo-audit");

const TODAY = "2026-10-16";
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "bgsu-approved-location-combos-2026-10-16.json"), "utf8"));

function expand() {
  const rows = [];
  let n = 0;
  for (const [upcoming, venue, city, addr, linked, count] of FIXTURE.combos) {
    for (let i = 0; i < count; i++) {
      n += 1;
      rows.push({
        id: `r${n}`,
        status: "approved",
        venue_name_raw: venue || null,
        venue_city_raw: city || null,
        venue_address_raw: addr || null,
        start_date: upcoming ? "2026-11-01" : "2026-09-01",
        end_date: null,
        venues: linked ? { lat: null, lng: null } : null,
      });
    }
  }
  return rows;
}

test("the real approved BGSU rows: 268 in all, 209 still ahead, none dropped", () => {
  const rows = expand();
  const result = auditRows(rows, TODAY);
  assert.equal(result.total, 268);
  assert.equal(result.rows.length, rows.length);
  assert.equal(result.upcoming, 209);
  assert.deepEqual(result.rows.map((r) => r.id), rows.map((r) => r.id));
});

test("upcoming rows by evidence class on the real combinations", () => {
  const result = auditRows(expand(), TODAY);
  assert.deepEqual(result.upcoming_counts, {
    [CLASSES.STREET_AND_CITY]: 103,
    [CLASSES.VENUE_AND_CITY]: 103,
    [CLASSES.PLACE_TEXT_ONLY]: 3,
  });
  assert.deepEqual(result.counts, {
    [CLASSES.STREET_AND_CITY]: 115,
    [CLASSES.VENUE_AND_CITY]: 129,
    [CLASSES.PLACE_TEXT_ONLY]: 4,
    [CLASSES.NO_EVIDENCE]: 20,
  });
});

test("all 20 rows with no place are past events: counted, not queued", () => {
  const result = auditRows(expand(), TODAY);
  assert.equal(result.counts[CLASSES.NO_EVIDENCE], 20);
  assert.ok(result.rows.filter((r) => r.evidence_class === CLASSES.NO_EVIDENCE).every((r) => !r.upcoming && !r.needs_review));
});

test("an upcoming row with no place IS queued for review", () => {
  const a = auditRow({ id: "x", start_date: "2026-11-01" }, TODAY);
  assert.equal(a.evidence_class, CLASSES.NO_EVIDENCE);
  assert.equal(a.needs_review, true);
});

test("review list: only the place-line rows, each with a reason", () => {
  const result = auditRows(expand(), TODAY);
  const upcomingReview = result.review.filter((r) => r.upcoming);
  assert.equal(upcomingReview.length, 3);
  assert.ok(upcomingReview.every((r) => r.evidence_class === CLASSES.PLACE_TEXT_ONLY && /actual venue is not identified/.test(r.review_reason)));
  assert.equal(result.review.length, 4); // plus the ended Ann Arbor place line
});

test("distances come from Detroit's border: Bowling Green 65.7, Huron about 67, Toledo about 45.8", () => {
  const rowFor = (city, venue) => auditRow({ id: "d", venue_name_raw: venue, venue_city_raw: city, start_date: "2026-11-01" }, TODAY);
  const bg = rowFor("Bowling Green", "Stroh Center");
  assert.ok(Math.abs(bg.distance_miles - 65.7) < 0.6, String(bg.distance_miles));
  assert.ok(bg.margin_miles > 0 && bg.margin_miles < 10);
  assert.match(bg.distance_basis, /city centre point/);
  assert.ok(Math.abs(rowFor("Huron", "BGSU Firelands").distance_miles - 67) < 0.6);
  assert.ok(Math.abs(rowFor("Toledo", "Savage Arena").distance_miles - 45.8) < 0.6);
  assert.equal(rowFor("Detroit", "Ford Field").distance_miles, 0);
});

test("every upcoming row is inside 75 miles on the evidence it has", () => {
  const result = auditRows(expand(), TODAY);
  for (const r of result.rows.filter((x) => x.upcoming)) {
    assert.ok(r.distance_miles <= 75, `${r.evidence.city} ${r.distance_miles}`);
  }
});

test("stored coordinates beyond 75 miles are sent to review, never hidden or changed", () => {
  const a = auditRow({ id: "far", venue_name_raw: "Some Arena", venue_city_raw: "Cleveland", start_date: "2026-11-01", venues: { lat: 41.4993, lng: -81.6944 } }, TODAY);
  assert.equal(a.evidence_class, CLASSES.OUTSIDE_ORBIT);
  assert.equal(a.needs_review, true);
  assert.ok(a.distance_miles > 75);
  assert.ok(a.margin_miles < 0);
});

test("a city the tables do not know is never guessed", () => {
  const a = auditRow({ id: "u", venue_name_raw: "Hall", venue_city_raw: "Nowhereville", start_date: "2026-11-01" }, TODAY);
  assert.equal(a.evidence_class, CLASSES.CITY_NOT_EVIDENCED);
  assert.equal(a.needs_review, true);
  assert.equal(a.distance_miles, null);
});

test("a venue and address with no city cannot be measured", () => {
  const a = auditRow({ id: "n", venue_name_raw: "Hall", venue_address_raw: "1 Main St", start_date: "2026-11-01" }, TODAY);
  assert.equal(a.evidence_class, CLASSES.CITY_NOT_EVIDENCED);
  assert.equal(a.needs_review, true);
});

test("a street shared by different venue names is surfaced (none today)", () => {
  assert.deepEqual(auditRows(expand(), TODAY).shared_streets, []);
  const shared = auditRows([
    { id: "a", venue_name_raw: "Hall A", venue_city_raw: "Bowling Green", venue_address_raw: "1001 E Wooster St", start_date: "2026-11-01" },
    { id: "b", venue_name_raw: "Hall B", venue_city_raw: "Bowling Green", venue_address_raw: "1001 E Wooster St", start_date: "2026-11-01" },
  ], TODAY);
  assert.equal(shared.shared_streets.length, 1);
  assert.ok(shared.rows.every((r) => r.needs_review));
});

test("stored venue coordinates, when present, take precedence over the city", () => {
  const a = auditRow({ id: "c", venue_name_raw: "Stroh Center", venue_city_raw: "Bowling Green", start_date: "2026-11-01", venues: { lat: 41.3748, lng: -83.6513 } }, TODAY);
  assert.equal(a.evidence_class, CLASSES.STORED_COORDINATES);
  assert.equal(a.distance_basis, "stored venue coordinates");
});

test("the audit is read-only: input untouched, no status or write fields in the output", () => {
  const rows = expand().slice(0, 40);
  const before = JSON.stringify(rows);
  const result = auditRows(rows, TODAY);
  assert.equal(JSON.stringify(rows), before);
  for (const r of result.rows) {
    for (const k of Object.keys(r)) assert.ok(!/^(status|rejected|demote|delete)/i.test(k), k);
  }
  const src = fs.readFileSync(path.join(__dirname, "..", "api", "_lib", "bgsu-geo-audit.js"), "utf8");
  assert.ok(!/\.(update|insert|delete|upsert)\(|fetch\(|supabase/i.test(src), "module must not write or reach a database");
});
