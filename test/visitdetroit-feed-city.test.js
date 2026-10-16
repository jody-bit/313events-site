// test/visitdetroit-feed-city.test.js — GEO-003 step 2: VisitDetroit stores a parsed city only when it
// agrees with the feed's own ZIP and _geoloc (Addendum 2). Disagreement stores no city (NULL) and keeps
// the raw address. Never assumes a ZIP identifies one municipality.
//
// Real cases: Sanctuary Church Birmingham (event-intelligence/geo-coverage/geo-003/raw-hits-sanctuary-birmingham-2026-10-16.md):
// address "Detroit, Michigan 48009", _geoloc 42.5477081,-83.2174755 (Birmingham).
//
// Run: node test/visitdetroit-feed-city.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const F = require(`${REPO_DIR}/api/_lib/feed-city.js`);
const vd = require(`${REPO_DIR}/api/cron-visitdetroit.js`);

// A tiny injected ZIP table (the real one is the Census-built Orbit dataset, not yet loaded).
const ZIPS = {
  "48009": { municipalities: ["Birmingham"] },
  "48212": { municipalities: ["Hamtramck"] },
  "48126": { municipalities: ["Detroit", "Dearborn"] },
};
const DEPS = { zipTable: ZIPS };
const DOWNTOWN = { lat: 42.3314, lng: -83.0458 };
const BIRMINGHAM = { lat: 42.5477081, lng: -83.2174755 };
const ROYAL_OAK = { lat: 42.4895, lng: -83.1446 };

// --- 1. ZIP and city text come out of the Algolia address shape ---
assert.strictEqual(F.parseZip("Detroit, Michigan 48009"), "48009");
assert.strictEqual(F.parseZip("Royal Oak, MI (48067)"), "48067");
assert.strictEqual(F.parseZip("Detroit, Michigan"), null);
assert.strictEqual(F.parseZip("Detroit, Michigan 48201-1234"), "48201");
assert.strictEqual(F.parseZip(null), null);
{
  const p = vd.parseAddress(["Sanctuary Church Birmingham", "300 Willits St", "Detroit, Michigan 48009"]);
  assert.strictEqual(p.city, "Detroit");
  assert.strictEqual(p.zip, "48009", "parseAddress now also returns the ZIP");
}
console.log("PASS: 1. ZIP is parsed from the address");

// --- 2. the Sanctuary case: city text says Detroit, ZIP and coordinates say Birmingham ---
{
  const d = F.decideFeedCity({ city: "Detroit", zip: "48009", lat: BIRMINGHAM.lat, lng: BIRMINGHAM.lng }, DEPS);
  assert.strictEqual(d.city, null, "a contradicted city is not stored");
  assert.strictEqual(d.status, "needs_follow_up");
  assert.ok(/Detroit/.test(d.reason) && /48009|outside/.test(d.reason));
}
console.log("PASS: 2. Detroit claim contradicted by ZIP and coordinates is queued, not stored");

// --- 3. agreement stores the city, including Detroit itself ---
{
  const d = F.decideFeedCity({ city: "Detroit", zip: "48226", lat: DOWNTOWN.lat, lng: DOWNTOWN.lng }, DEPS);
  assert.deepStrictEqual([d.city, d.status], ["Detroit", "stored"], "Detroit is stored explicitly, so a blank city can later mean unknown");
  const r = F.decideFeedCity({ city: "Royal Oak", zip: "48067", lat: ROYAL_OAK.lat, lng: ROYAL_OAK.lng }, DEPS);
  assert.deepStrictEqual([r.city, r.status], ["Royal Oak", "stored_unverified"], "48067 is not in the injected table: nothing contradicts it, nothing confirms it");
  const b = F.decideFeedCity({ city: "Birmingham", zip: "48009", lat: BIRMINGHAM.lat, lng: BIRMINGHAM.lng }, DEPS);
  assert.deepStrictEqual([b.city, b.status], ["Birmingham", "stored"]);
}
console.log("PASS: 3. agreeing city is stored (Detroit included)");

// --- 4. a ZIP that spans two municipalities is NOT treated as identifying one ---
{
  const ok = F.decideFeedCity({ city: "Dearborn", zip: "48126", lat: 42.3223, lng: -83.1763 }, DEPS);
  assert.strictEqual(ok.status, "stored", "48126 lists Detroit and Dearborn, so either city text is consistent with the ZIP");
  const bad = F.decideFeedCity({ city: "Royal Oak", zip: "48126", lat: ROYAL_OAK.lat, lng: ROYAL_OAK.lng }, DEPS);
  assert.strictEqual(bad.status, "stored_unverified", "Royal Oak is not among 48126's municipalities: kept unverified (post-office name or ZIP error not ruled out), never confirmed");
  assert.strictEqual(bad.zipMismatch, true); assert.strictEqual(bad.confirmed, false);
}
console.log("PASS: 4. multi-municipality ZIPs accept any listed municipality and nothing else");

// --- 5. single-municipality ZIP that disagrees with the city text ---
{
  const d = F.decideFeedCity({ city: "Detroit", zip: "48212", lat: ROYAL_OAK.lat, lng: ROYAL_OAK.lng }, DEPS);
  assert.strictEqual(d.status, "needs_follow_up", "48212 is Hamtramck only");
  assert.strictEqual(d.city, null);
}
console.log("PASS: 5. city text that contradicts a single-municipality ZIP is queued");

// --- 6. no evidence either way keeps today's behaviour (store the parsed city) but is labelled unverified ---
{
  const d = F.decideFeedCity({ city: "Royal Oak", zip: "48073", lat: null, lng: null }, DEPS);
  assert.deepStrictEqual([d.city, d.status], ["Royal Oak", "stored_unverified"], "ZIP not in the table and no coordinates: cannot contradict");
  const none = F.decideFeedCity({ city: null, zip: "48073", lat: ROYAL_OAK.lat, lng: ROYAL_OAK.lng }, DEPS);
  assert.deepStrictEqual([none.city, none.status], [null, "no_city"], "no city text: nothing to store");
  const junk = F.decideFeedCity({ city: "Detroit", zip: null, lat: "x", lng: NaN }, DEPS);
  assert.strictEqual(junk.status, "stored_unverified", "unusable coordinates are not evidence");
}
console.log("PASS: 6. missing evidence cannot contradict; never invents a city");

// --- 7. coordinates just over the border still agree (the boundary used is simplified) ---
{
  const edge = F.decideFeedCity({ city: "Detroit", zip: null, lat: 42.4465, lng: -83.1305 }, DEPS);
  assert.notStrictEqual(edge.status, "needs_follow_up", "a point within the tolerance of the border is not a contradiction");
}
console.log("PASS: 7. border tolerance");

// --- 8. the cron wires it: venue_city_raw comes from decideFeedCity, address is kept ---
{
  const row = vd.rowCityFields(["Sanctuary Church Birmingham", "300 Willits St", "Detroit, Michigan 48009"], { _geoloc: BIRMINGHAM }, DEPS);
  assert.strictEqual(row.venue_city_raw, null);
  assert.strictEqual(row.venue_address_raw, "300 Willits St", "raw street is kept so the follow-up queue can fix it");
  const good = vd.rowCityFields(["Fox Theatre", "2211 Woodward Ave", "Detroit, Michigan 48201"], { _geoloc: DOWNTOWN }, DEPS);
  assert.strictEqual(good.venue_city_raw, "Detroit");
}
console.log("PASS: 8. cron row fields");
// --- 9. the Census-built Orbit table (EI v2, 229 Detroit-area ZIPs) loads, with the CDP choice switchable ---
{
  const all = F.loadZipTable({ includeCdp: true });
  const noCdp = F.loadZipTable({ includeCdp: false });
  assert.ok(Object.keys(all).length >= 229, "EI's v2 table is loaded");
  assert.ok(all["48001"].municipalities.includes("Pearl Beach CDP"), "CDP names are present when included");
  assert.ok(!noCdp["48001"].municipalities.includes("Pearl Beach CDP") && !noCdp["48001"].municipalities.includes("Pearl Beach"), "CDP-only names drop out when excluded");
  assert.ok(noCdp["48001"].municipalities.includes("Clay Township"), "legal municipalities stay");
  assert.ok(all["48001"].municipalities.includes("Pearl Beach"), "the loader never mutates the shared table");
  assert.strictEqual(F.loadZipTable().__proto__, Object.prototype, "default load works with no arguments");
  const prev = process.env.FEED_CITY_INCLUDE_CDP;
  process.env.FEED_CITY_INCLUDE_CDP = "0";
  assert.ok(!F.loadZipTable()["48001"].municipalities.includes("Pearl Beach"), "FEED_CITY_INCLUDE_CDP=0 turns CDP names off");
  if (prev === undefined) delete process.env.FEED_CITY_INCLUDE_CDP; else process.env.FEED_CITY_INCLUDE_CDP = prev;
}
console.log("PASS: 9. Orbit table loads; CDP names switchable");

// --- 10. replay EI's 94 real VisitDetroit rows with the real table: only the 6 Sanctuary rows are queued ---
{
  const fs = require("fs");
  const csv = `${REPO_DIR}/test/fixtures/visitdetroit-94-join-2026-10-16.csv`;
  const lines = fs.readFileSync(csv, "utf8").trim().split("\n").slice(1);
  const real = F.loadZipTable({ includeCdp: true });
  let queued = 0, stored = 0, none = 0;
  for (const line of lines) {
    const m = /"([^"]*)",(-?[\d.]+),(-?[\d.]+),/.exec(line);
    if (!m) { none++; continue; }
    const city = m[1].split(",")[0].trim();
    const d = F.decideFeedCity({ city, zip: F.parseZip(m[1]), lat: parseFloat(m[2]), lng: parseFloat(m[3]) }, { zipTable: real, cdpNames: F.loadCdpNames(), tiers: F.loadZipTiers() });
    if (d.status === "needs_follow_up") { queued++; assert.ok(/Birmingham|48009/.test(m[1] + d.reason)); }
    else if (d.status === "stored") stored++;
  }
  assert.strictEqual(queued, 6, "only the six Sanctuary Church Birmingham rows are queued");
  assert.ok(stored >= 79, "Detroit rows are stored as verified now that the ZIP table confirms them (" + stored + ")");
  // a Detroit claim in a ZIP the table lists for another municipality only
  const d = F.decideFeedCity({ city: "Detroit", zip: "48009", lat: 42.5477, lng: -83.2175 }, { zipTable: real });
  assert.strictEqual(d.status, "needs_follow_up", "48009 does not list Detroit");
}
console.log("PASS: 10. real-data replay with the real table");

// --- 11. evidence tiers: CDP names are compatibility, not definitive resolution ---
{
  const real = F.loadZipTable({ includeCdp: true });
  const deps = { zipTable: real, cdpNames: F.loadCdpNames() };
  const cdp = F.decideFeedCity({ city: "Pearl Beach", zip: "48001" }, deps);
  assert.strictEqual(cdp.status, "stored_compatible");
  assert.strictEqual(cdp.evidence, "cdp_compatible");
  assert.strictEqual(cdp.confirmed, false, "a CDP match never counts as confirmed");
  const inc = F.decideFeedCity({ city: "Algonac", zip: "48001" }, deps);
  assert.strictEqual(inc.evidence, "municipality");
  assert.strictEqual(inc.confirmed, true);
  const det = F.decideFeedCity({ city: "Detroit", zip: "48201", lat: 42.35, lng: -83.06 }, deps);
  assert.strictEqual(det.status, "stored");
  assert.ok(det.confirmed, "legitimate Detroit stays accepted");
  const none = F.decideFeedCity({ city: "Somewhere", zip: "99999" }, deps);
  assert.strictEqual(none.status, "stored_unverified", "ZIP absent from the table is no evidence, not a contradiction");
  // CDP switched off: the CDP name is no longer compatible with that ZIP
  const off = F.decideFeedCity({ city: "Pearl Beach", zip: "48001" }, { zipTable: F.loadZipTable({ includeCdp: false }), cdpNames: F.loadCdpNames() });
  assert.strictEqual(off.status, "stored_unverified");
  assert.strictEqual(off.confirmed, false); assert.strictEqual(off.zipMismatch, true);
}
console.log("PASS: 11. evidence tiers (municipality / boundary / cdp_compatible / none)");

// --- 12. a weaker incoming city never overwrites an existing city ---
{
  const row = { external_id: "vd-1", venue_city_raw: "Detroit" };
  const unverified = { city: "Detroit", status: "stored_unverified", confirmed: false };
  const compat = { city: "Pearl Beach", status: "stored_compatible", confirmed: false };
  const confirmed = { city: "Detroit", status: "stored", confirmed: true };
  const queued = { city: null, status: "needs_follow_up", confirmed: false };
  assert.ok(!("venue_city_raw" in F.protectExistingCity(row, unverified, "Birmingham")), "unverified claim omitted when a city exists");
  assert.ok(!("venue_city_raw" in F.protectExistingCity({ venue_city_raw: "Pearl Beach" }, compat, "Algonac")), "CDP-compatible omitted when a city exists");
  assert.ok(!("venue_city_raw" in F.protectExistingCity({ venue_city_raw: null }, queued, "Birmingham")), "contradiction never writes");
  assert.strictEqual(F.protectExistingCity(row, confirmed, "Birmingham").venue_city_raw, "Detroit", "confirmed evidence may replace");
  assert.strictEqual(F.protectExistingCity(row, unverified, "").venue_city_raw, "Detroit", "no existing city: weak value still stored (today's behaviour)");
  assert.strictEqual(F.protectExistingCity(row, unverified, null).venue_city_raw, "Detroit");
  assert.strictEqual(row.venue_city_raw, "Detroit", "input row not mutated");
}
console.log("PASS: 12. existing city protected from weaker evidence");

// --- 13. v3 tiers: only `strong` confirms; census_supported and CDP-only are compatible ---
{
  const real = F.loadZipTable({ includeCdp: true });
  const deps = { zipTable: real, cdpNames: F.loadCdpNames(), tiers: F.loadZipTiers() };
  // every municipality in the real table has a tier on record (no silent default)
  for (const zip of Object.keys(real)) for (const m of real[zip].municipalities) {
    const n = String(m).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    assert.ok(deps.tiers[zip] && deps.tiers[zip][n], `tier on record for ${zip} ${m}`);
  }
  // 48236: Grosse Pointe Woods is strong; Detroit / St. Clair Shores are census_supported only
  const gpw = F.decideFeedCity({ city: "Grosse Pointe Woods", zip: "48236" }, deps);
  assert.strictEqual(gpw.evidence, "municipality"); assert.ok(gpw.confirmed);
  const det = F.decideFeedCity({ city: "Detroit", zip: "48236" }, deps);
  assert.strictEqual(det.status, "stored_compatible"); assert.strictEqual(det.evidence, "census_supported"); assert.ok(!det.confirmed);
  // 48126 lists Detroit at 0.03% (census_supported): compatible, confirmed only by the Detroit boundary
  assert.strictEqual(F.decideFeedCity({ city: "Detroit", zip: "48126" }, deps).confirmed, false);
  const inside = F.decideFeedCity({ city: "Detroit", zip: "48126", lat: 42.35, lng: -83.2 }, deps);
  assert.ok(inside.evidence === "boundary" ? inside.confirmed : !inside.confirmed);
  // 48009: Birmingham strong, Bloomfield Township census_supported, Detroit contradicted
  assert.ok(F.decideFeedCity({ city: "Birmingham", zip: "48009" }, deps).confirmed);
  assert.strictEqual(F.decideFeedCity({ city: "Bloomfield Township", zip: "48009" }, deps).confirmed, false);
  assert.strictEqual(F.decideFeedCity({ city: "Detroit", zip: "48009" }, deps).status, "needs_follow_up");
  // a weak match never replaces an existing city
  const weak = F.protectExistingCity({ venue_city_raw: "Detroit" }, det, "Grosse Pointe Woods");
  assert.ok(!("venue_city_raw" in weak));
  // cron default deps carry the tiers
  const row = vd.rowCityFields(["Some Hall", "1 Main St", "Detroit, Michigan 48236"], {});
  assert.strictEqual(row._cityDecision.status, "stored_compatible", "cron path uses tiers (Detroit in 48236 is compatible, not confirmed)");
  assert.strictEqual(row._cityDecision.confirmed, false);
  assert.strictEqual(row.venue_city_raw, "Detroit");
}
console.log("PASS: 13. v3 tiers: only strong confirms");

// --- 14. POST-CRON REGRESSION (2026-10-16): postal-town / township naming variants must not blank a city ---
{
  const real = F.loadZipTable(); const tiers = F.loadZipTiers();
  const deps = { zipTable: real, cdpNames: F.loadCdpNames(), tiers };
  const addr = (z) => ["Venue", "1 Main St", z];
  const dec = (a, hit) => vd.rowCityFields(addr(a), hit || {})._cityDecision;
  // Macomb Center events: "Charter Township Of Clinton" == Clinton Township
  const clinton = F.decideFeedCity({ city: "Charter Township Of Clinton", zip: "48038" }, deps);
  assert.ok(clinton.status !== "needs_follow_up" && clinton.city, "Clinton variant is not queued");
  assert.ok(!clinton.zipMismatch, "Clinton variant matches the ZIP table, no advisory");
  // Pontiac shows (48320 is Pontiac-area; coordinates ~42.636,-83.291 are not Detroit)
  const pontiac = F.decideFeedCity({ city: "Pontiac", zip: "48320", lat: 42.636, lng: -83.291 }, deps);
  assert.ok(pontiac.city === "Pontiac" && pontiac.status !== "needs_follow_up", "Pontiac keeps its city");
  assert.strictEqual(pontiac.confirmed, false, "never confirmed by a post-office ZIP alone");
  // Oxford / Lake Orion / Rochester: never blanked, never confirmed from an unlisted ZIP name
  for (const [c, z] of [["Oxford", "48370"], ["Lake Orion", "48360"], ["Rochester", "48309"]]) {
    const d = F.decideFeedCity({ city: c, zip: z }, deps);
    assert.notStrictEqual(d.status, "needs_follow_up", `${c} ${z} is not queued`);
    assert.strictEqual(d.city, c, `${c} text preserved`);
    if (d.zipMismatch) assert.strictEqual(d.confirmed, false, `${c} advisory is never confirmed`);
  }
  // Sanctuary Church x6: Detroit claimed in Birmingham's ZIP 48009, coordinates in Birmingham: still rejected
  for (let i = 0; i < 6; i++) {
    const d = F.decideFeedCity({ city: "Detroit", zip: "48009", lat: 42.5477081, lng: -83.2174755 }, deps);
    assert.strictEqual(d.status, "needs_follow_up"); assert.strictEqual(d.city, null); assert.ok(!d.confirmed);
  }
  const cron = vd.rowCityFields(["Sanctuary Church", "1 Main St", "Detroit, Michigan 48009"], { _geoloc: { lat: 42.5477081, lng: -83.2174755 } });
  assert.strictEqual(cron.venue_city_raw == null, true, "Sanctuary row writes no city");
  // a Detroit claim on a foreign ZIP with coordinates inside Detroit is not rejected on the ZIP alone
  const dIn = F.decideFeedCity({ city: "Detroit", zip: "48009", lat: 42.3314, lng: -83.0458 }, deps);
  assert.notStrictEqual(dIn.status, "needs_follow_up", "Detroit coordinates keep a Detroit claim alive");
  assert.ok(dIn.confirmed === true || dIn.confirmed === false);
  // existing city protected against advisories and variants
  const adv = F.decideFeedCity({ city: "Oxford", zip: "48370" }, deps);
  assert.ok(!("venue_city_raw" in F.protectExistingCity({ venue_city_raw: "Oxford" }, adv, "Oxford Township")), "unverified never overwrites an existing city");
  // tier distinction survives the variant matching
  assert.strictEqual(F.decideFeedCity({ city: "Grosse Pointe Woods", zip: "48236" }, deps).confirmed, true);
  assert.strictEqual(F.decideFeedCity({ city: "Detroit", zip: "48236" }, deps).confirmed, false);
}
console.log("PASS: 14. post-cron regression (Pontiac, Macomb Center, Oxford, Lake Orion, Rochester, Sanctuary x6)");

// --- 15. owner decision 2026-10-16 13:06Z: canonical storage + ambiguous partial names ---
{
  const deps = { zipTable: F.loadZipTable(), cdpNames: F.loadCdpNames(), tiers: F.loadZipTiers() };
  // confirmed township variants store the canonical municipality name
  const cl = F.decideFeedCity({ city: "Charter Township Of Clinton", zip: "48038" }, deps);
  assert.strictEqual(cl.city, "Clinton Township"); assert.ok(cl.confirmed);
  assert.strictEqual(F.decideFeedCity({ city: "Canton", zip: "48187" }, deps).city, "Canton Township");
  assert.strictEqual(F.decideFeedCity({ city: "West Bloomfield", zip: "48322" }, deps).city, "West Bloomfield Township");
  // the cron path writes the canonical name
  assert.strictEqual(vd.rowCityFields(["Macomb Center", "44575 Garfield Rd", "Charter Township Of Clinton, Michigan 48038"], {}).venue_city_raw, "Clinton Township");
  // an existing canonical city is never replaced by an alias
  const alias = { city: "Clinton Township", status: "stored", evidence: "municipality", confirmed: true };
  assert.strictEqual(F.protectExistingCity({ venue_city_raw: "Clinton Township" }, alias, "Clinton Township").venue_city_raw, "Clinton Township", "same city: unchanged");
  const aliasDec = { city: "Charter Township of Clinton", status: "stored", confirmed: true };
  assert.ok(!("venue_city_raw" in F.protectExistingCity({ venue_city_raw: "Charter Township of Clinton" }, aliasDec, "Clinton Township")), "alias never replaces canonical");
  // ambiguous partial names are preserved as unverified, not confirmed
  const hl = F.decideFeedCity({ city: "Highland", zip: "48356" }, deps);
  assert.strictEqual(hl.status, "stored_unverified"); assert.strictEqual(hl.confirmed, false); assert.strictEqual(hl.ambiguousPartial, true); assert.strictEqual(hl.city, "Highland");
  const bl = { zipTable: { "48302": { municipalities: ["Bloomfield Township", "Bloomfield Hills"] } }, tiers: { "48302": { "bloomfield township": "strong", "bloomfield hills": "strong" } } };
  const bd = F.decideFeedCity({ city: "Bloomfield", zip: "48302" }, bl);
  assert.strictEqual(bd.confirmed, false, "bare Bloomfield is not confirmed by a ZIP-table match");
  assert.strictEqual(F.decideFeedCity({ city: "Bloomfield Hills", zip: "48302" }, bl).confirmed, true, "full name still confirms");
  // a new unverified city cannot overwrite a verified existing city
  for (const c of ["Oxford", "Rochester", "Pontiac", "Lake Orion", "Highland", "Davisburg"]) {
    const d = F.decideFeedCity({ city: c, zip: c === "Pontiac" ? "48320" : "48370" }, deps);
    if (!d.confirmed) assert.ok(!("venue_city_raw" in F.protectExistingCity({ venue_city_raw: "Birmingham" }, d, "Birmingham")), `${c} cannot overwrite`);
  }
}
console.log("PASS: 15. canonical storage, ambiguous partial names, unverified never overwrites");

console.log("\nAll VisitDetroit feed-city tests passed.");
