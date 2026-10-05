"use strict";
// test/duplicate-consolidation.test.js — ONE REAL-WORLD EVENT -> ONE
// CANONICAL ROW (2026-10-05). Fixtures are the real production shapes
// measured that day; the rules are checked against each of them, and the
// merge is checked write by write against a fake PostgREST.
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const lib = require(`${REPO_DIR}/scripts/duplicate-consolidation.js`);
const { planConsolidation, classifyPair, pickSurvivor, fillPatch, applyMerge, markDistinct, consolidateDuplicates, normalizeTitle, normalizeStartTime, civicItemId } = lib;

let n = 0;
const row = (o) => ({ id: `e${++n}`, status: "approved", created_at: `2026-09-${String(10 + n).padStart(2, "0")}T00:00:00Z`, venue_id: null, description: null, image_url: null, ticket_url: null, event_url: null, venue_address_raw: null, internal_note: null, is_free: null, price_from: null, end_date: null, ...o });

(function pureFunctions() {
  assert.strictEqual(normalizeTitle("Arts, Beats & Eats — 2026!"), "arts beats and eats 2026");
  assert.strictEqual(normalizeTitle("Ballets Jazz Montréal"), normalizeTitle("ballets jazz montr al"), "accents fold the same way the SQL probe did");
  assert.strictEqual(normalizeStartTime("7:30 PM – 11:59 PM"), "7:30 pm");
  assert.strictEqual(normalizeStartTime("Evening"), null);
  assert.strictEqual(normalizeStartTime(null), null);
  assert.strictEqual(civicItemId("feed-2f5e5a2b-befa-4693-aa57-ea3a4ea9e8ae-4736"), "4736");
  assert.strictEqual(civicItemId("feed-6acfe2c6-15dd-416c-843f-e524b394ebd2-10002559-1791984600-1791991800@easternmarket.org"), null, "a Tribe/iCal uid is not a CivicPlus item id");
  assert.strictEqual(civicItemId("vv17OZ_FGknEqJr_"), null);
  console.log("PASS: normalization — title, start time and CivicPlus item id");
})();

(function rules() {
  // 1. same feed twice (Eastern Market Fresh Truck, two UIDs, identical rows)
  const ft1 = row({ title: "Ecorse Senior Center: Fresh Truck Mobile Market", start_date: "2026-10-08", time_display: "2:30 PM – 4:30 PM", source: "Eastern Market Partnership", external_id: "feed-6acfe2c6-15dd-416c-843f-e524b394ebd2-10002509-1791469800-1791477000@easternmarket.org", venue_name_raw: "Ecorse Senior Center", venue_city_raw: "Ecorse" });
  const ft2 = row({ ...ft1, id: undefined, external_id: "feed-6acfe2c6-15dd-416c-843f-e524b394ebd2-10002552-1791469800-1791477000@easternmarket.org" });
  assert.deepStrictEqual(classifyPair(ft1, ft2), { kind: "deterministic", rule: "same_feed_twice" });

  // 2. CivicPlus sibling feeds (Livonia Parks + Senior Center, item 4753)
  const sm1 = row({ title: "Senior Meijer Gardens Trip", start_date: "2026-10-07", time_display: "8:00 AM – 4:45 PM", source: "City of Livonia - Parks and Recreation", external_id: "feed-fbb61310-0db5-49d3-bf67-8dbfc1cc199e-4753", venue_name_raw: "Senior Wellness Center", venue_city_raw: "Livonia" });
  const sm2 = row({ ...sm1, id: undefined, source: "City of Livonia - Senior Center", external_id: "feed-27915040-6429-418a-a4a0-735521197e19-4753" });
  const c = classifyPair(sm1, sm2);
  assert.strictEqual(c.kind, "deterministic");
  assert.ok(["civicplus_sibling_feeds", "two_sources_one_place"].includes(c.rule));

  // 3. two sources, one venue, compatible times (Ballets Jazz Montréal: Manual "Evening" vs VisitDetroit 7:30 PM)
  const bj1 = row({ title: "Ballets Jazz Montréal", start_date: "2026-10-17", time_display: "Evening", source: "Manual", external_id: null, venue_id: "v-opera", venue_name_raw: "Detroit Opera House", venue_city_raw: "Detroit" });
  const bj2 = row({ title: "Ballets Jazz Montréal", start_date: "2026-10-17", time_display: "7:30 PM – 11:59 PM", source: "VisitDetroit", external_id: "vd-50605993", venue_id: "v-opera", venue_name_raw: "Detroit Opera House", venue_city_raw: "Detroit", description: "Montréal's contemporary dance company." });
  assert.deepStrictEqual(classifyPair(bj1, bj2), { kind: "deterministic", rule: "two_sources_one_place" });
  assert.strictEqual(pickSurvivor(bj1, bj2)[0].id, bj2.id, "the more complete row survives");
  assert.deepStrictEqual(fillPatch(bj2, bj1), {}, "nothing to fill from the thinner row");
  assert.deepStrictEqual(fillPatch(bj1, bj2), { description: "Montréal's contemporary dance company." , time_display: "7:30 PM – 11:59 PM" }, "a real time replaces 'Evening'; only blanks are filled");

  // NOT duplicates: two performances of one show, one source (Ticketmaster 2:00 PM and 6:30 PM)
  const p1 = row({ title: "A Christmas Carol", start_date: "2026-11-21", time_display: "2:00 PM", source: "Ticketmaster", external_id: "vv17OZ_FGknEqJr_", venue_id: "v-mb", venue_name_raw: "Meadow Brook Theatre", venue_city_raw: "Rochester" });
  const p2 = row({ ...p1, id: undefined, time_display: "6:30 PM", external_id: "vv17OZ_FGknEjUrZ" });
  assert.strictEqual(classifyPair(p1, p2), null, "two performances at one venue are two rows");

  // REVIEW: two sources, same city, different venue rows, doors vs show time (Brand New)
  const bn1 = row({ title: "Brand New", start_date: "2026-10-06", time_display: "8:00 PM", source: "Ticketmaster", external_id: "vvG1OZ_udCRnzt", venue_id: "v-fox-tm", venue_name_raw: "Fox Theatre Detroit", venue_city_raw: "Detroit" });
  const bn2 = row({ title: "Brand New", start_date: "2026-10-06", time_display: "7:30 PM – 11:59 PM", source: "VisitDetroit", external_id: "vd-46677578", venue_id: "v-fox-vd", venue_name_raw: "Fox Theatre", venue_city_raw: "Detroit" });
  assert.deepStrictEqual(classifyPair(bn1, bn2), { kind: "review", reason: "two_sources_time_and_place_differ" });
  // REVIEW: same source, different venue text, one side no real time (RA Kick invites)
  const k1 = row({ title: "KICK Invites: Circumscums, KINX", start_date: "2026-10-10", time_display: "Evening", source: "Resident Advisor", external_id: null, venue_id: "v-vault", venue_name_raw: "Vault313 (Highland Park)", venue_city_raw: "Highland Park" });
  const k2 = row({ title: "KICK Invites: Circumscums, KINX", start_date: "2026-10-10", time_display: "11:00 PM–5:00 AM", source: "Resident Advisor", external_id: "ra-2514324", venue_name_raw: "The Vault 313", venue_city_raw: "Highland Park" });
  assert.deepStrictEqual(classifyPair(k1, k2), { kind: "review", reason: "same_source_place_differs" });
  // REVIEW: two Ticketmaster rows, same time, two venue rows (Saint Andrew's Hall / The Shelter)
  const sd1 = row({ title: "Static Dress - Injury Episode USA Tour", start_date: "2026-11-04", time_display: "6:00 PM", source: "Ticketmaster", external_id: "vvG1OZ_2BUSzFH", venue_id: "v-sah", venue_name_raw: "Saint Andrew's Hall", venue_city_raw: "Detroit" });
  const sd2 = row({ ...sd1, id: undefined, external_id: "vvG1OZ_2ByWbQ3", venue_id: "v-shelter", venue_name_raw: "The Shelter" });
  assert.strictEqual(classifyPair(sd1, sd2).kind, "review");
  // a recorded "not a duplicate" decision silences the pair for good
  const sd2m = { ...sd2, internal_note: `DUP_DISTINCT | v1 | other=${sd1.id}` };
  assert.strictEqual(classifyPair(sd1, sd2m), null);
  // different title: never
  assert.strictEqual(classifyPair(bn1, { ...bn2, title: "Brand New: Acoustic" }), null);
  // placeholder venues never count as "the same place"
  const tb1 = row({ title: "Grave Rave", start_date: "2026-10-31", time_display: "Evening", source: "Resident Advisor", venue_id: "v-tba", venue_name_raw: "Venue TBA (Detroit)", venue_city_raw: "Detroit" });
  const tb2 = row({ title: "Grave Rave", start_date: "2026-10-31", time_display: "10:00 PM", source: "VisitDetroit", external_id: "vd-50187643", venue_id: "v-dsc", venue_name_raw: "Detroit Shipping Company", venue_city_raw: "Detroit" });
  assert.deepStrictEqual(classifyPair(tb1, tb2), { kind: "review", reason: "two_sources_place_differs" }, "a placeholder venue is a question, not a match");
  console.log("PASS: rules — same feed twice, CivicPlus siblings and two-sources-one-venue merge; performances stay; conflicts go to review; a recorded decision sticks");
})();

(function plan() {
  // four rows of one trip across two Livonia feeds collapse to one survivor
  const base = { title: "Senior Mackinac Island Trip", start_date: "2026-10-12", time_display: "4:45 AM", venue_id: "v-tba", venue_name_raw: "Venue TBA", venue_city_raw: "Livonia" };
  const rows = [
    row({ ...base, source: "City of Livonia - Parks and Recreation", external_id: "feed-fbb61310-0db5-49d3-bf67-8dbfc1cc199e-4690" }),
    row({ ...base, source: "City of Livonia - Parks and Recreation", external_id: "feed-fbb61310-0db5-49d3-bf67-8dbfc1cc199e-4691" }),
    row({ ...base, source: "City of Livonia - Senior Center", external_id: "feed-27915040-6429-418a-a4a0-735521197e19-4691" }),
    row({ ...base, source: "City of Livonia - Senior Center", external_id: "feed-27915040-6429-418a-a4a0-735521197e19-4690" }),
    row({ title: "Unrelated", start_date: "2026-10-12", time_display: "4:45 AM", source: "X", external_id: "x-1", venue_name_raw: "Y", venue_city_raw: "Z" }),
  ];
  const p = planConsolidation(rows);
  assert.strictEqual(p.merges.length, 3);
  const survivors = new Set(p.merges.map((m) => m.survivor.id));
  assert.strictEqual(survivors.size, 1, "one canonical row for the trip");
  assert.strictEqual(p.merges[0].survivor.id, rows[0].id, "the oldest of equally complete rows survives");
  assert.strictEqual(p.reviews.length, 0);
  // rejected rows are never considered
  assert.strictEqual(planConsolidation(rows.map((r) => ({ ...r, status: "rejected" }))).merges.length, 0);
  console.log("PASS: plan — a group collapses to one survivor; rejected rows are out of scope");
})();

(async function merge() {
  const survivor = row({ title: "Ballets Jazz Montréal", start_date: "2026-10-17", time_display: "7:30 PM – 11:59 PM", source: "VisitDetroit", external_id: "vd-50605993", venue_id: "v-opera", venue_name_raw: "Detroit Opera House", venue_city_raw: "Detroit", status: "approved" });
  const loser = row({ title: "Ballets Jazz Montréal", start_date: "2026-10-17", time_display: "Evening", source: "Manual", external_id: "manual-bjm", venue_id: "v-opera", venue_name_raw: "Detroit Opera House", venue_city_raw: "Detroit", ticket_url: "https://detroitopera.org/bjm", internal_note: "hand-entered 2026-08-23", status: "approved" });
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null, prefer: (opts.headers || {}).Prefer });
    if (url.includes("/editorial_article_events?event_id=eq.")) return { ok: true, status: 200, json: async () => [{ article_id: "art-9" }] };
    return { ok: true, status: 200, json: async () => [] };
  };
  const r = await applyMerge("https://x.supabase.co", "key", { survivor, loser, rule: "two_sources_one_place" }, { fetchFn });
  assert.deepStrictEqual(r.filled, ["ticket_url"], "the survivor gains the loser's ticket link, nothing it already had");
  assert.strictEqual(r.identityRecorded, true);
  assert.strictEqual(r.articlesMoved, true);
  assert.strictEqual(r.retired, true);
  const fill = calls.find((c) => c.method === "PATCH" && c.url.includes(`id=eq.${survivor.id}`));
  assert.deepStrictEqual(fill.body, { ticket_url: "https://detroitopera.org/bjm" });
  const ident = calls.find((c) => c.url.includes("event_source_identities?on_conflict"));
  assert.deepStrictEqual(ident.body, [{ event_id: survivor.id, source: "Manual", source_id: "manual-bjm" }], "the canonical row carries the retired row's identity");
  assert.strictEqual(ident.prefer, "resolution=ignore-duplicates,return=minimal");
  const artPatch = calls.find((c) => c.method === "PATCH" && c.url.includes("editorial_articles?matched_event_id=eq."));
  assert.deepStrictEqual(artPatch.body, { matched_event_id: survivor.id });
  const join = calls.find((c) => c.method === "POST" && c.url.includes("editorial_article_events?on_conflict"));
  assert.deepStrictEqual(join.body, { article_id: "art-9", event_id: survivor.id }, "press links follow the canonical row");
  const retire = calls.find((c) => c.method === "PATCH" && c.url.includes(`/events?id=eq.${loser.id}`));
  assert.ok(retire.url.includes("&status=eq.approved"), "retiring is guarded on the status the pass read");
  assert.strictEqual(retire.body.status, "rejected", "retired, never deleted");
  assert.ok(retire.body.internal_note.startsWith("hand-entered 2026-08-23\nDUP_MERGED_INTO | v1 | survivor=" + survivor.id + " | rule=two_sources_one_place"), "the admin-only note says where it went; the public note is untouched");
  assert.ok(!("note" in retire.body) && !("note" in fill.body));
  assert.ok(!calls.some((c) => c.method === "DELETE"), "nothing is ever deleted");

  // not a duplicate: both rows marked, nothing else touched
  calls.length = 0;
  assert.strictEqual(await markDistinct("https://x.supabase.co", "key", survivor, loser, { fetchFn }), true);
  assert.strictEqual(calls.length, 2);
  assert.ok(calls[0].body.internal_note.endsWith(`DUP_DISTINCT | v1 | other=${loser.id}`));
  assert.ok(calls[1].body.internal_note.endsWith(`DUP_DISTINCT | v1 | other=${survivor.id}`));
  console.log("PASS: merge — blank-only fill, identity recorded, press links moved, loser retired with provenance, nothing deleted; 'not a duplicate' is recorded on both rows");

  // the orchestrator: dry run writes nothing; the cap defers, never drops
  const rows = [
    row({ title: "New Year Holidays", start_date: "2026-12-31", time_display: null, source: "City of Royal Oak", external_id: "feed-55488971-2092-401f-a6e5-ad51dbf9d10a-8462", venue_name_raw: "Leo Mahany / Harold Meininger Senior Community Center", venue_city_raw: "Royal Oak" }),
    row({ title: "New Year Holidays", start_date: "2026-12-31", time_display: null, source: "City of Royal Oak", external_id: "feed-55488971-2092-401f-a6e5-ad51dbf9d10a-8461", venue_name_raw: "Leo Mahany / Harold Meininger Senior Community Center", venue_city_raw: "Royal Oak" }),
    row({ title: "Brand New", start_date: "2026-10-06", time_display: "8:00 PM", source: "Ticketmaster", external_id: "tm-1", venue_id: "v1", venue_name_raw: "Fox Theatre Detroit", venue_city_raw: "Detroit" }),
    row({ title: "Brand New", start_date: "2026-10-06", time_display: "7:30 PM", source: "VisitDetroit", external_id: "vd-1", venue_id: "v2", venue_name_raw: "Fox Theatre", venue_city_raw: "Detroit" }),
  ];
  let applied = 0;
  const dry = await consolidateDuplicates({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key", dryRun: true, fetchRows: async () => rows, applyMergeFn: async () => { applied++; return { retired: true }; }, logger: { error() {} } });
  assert.strictEqual(dry.deterministic, 1);
  assert.strictEqual(dry.review, 1);
  assert.strictEqual(dry.merged, 0);
  assert.strictEqual(applied, 0, "a dry run never writes");
  assert.strictEqual(dry.reviewDetail[0].reason, "two_sources_time_and_place_differ");
  const live = await consolidateDuplicates({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key", dryRun: false, fetchRows: async () => rows, applyMergeFn: async (_u, _k, m) => { applied++; return { survivorId: m.survivor.id, loserId: m.loser.id, rule: m.rule, retired: true, filled: [] }; }, logger: { error() {} } });
  assert.strictEqual(live.merged, 1);
  assert.strictEqual(applied, 1);
  assert.strictEqual(live.writtenIds.length, 2);
  const capped = await consolidateDuplicates({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key", dryRun: false, maxMerges: 0, fetchRows: async () => rows, applyMergeFn: async () => { throw new Error("must not run"); }, logger: { error() {} } });
  assert.strictEqual(capped.deferredByCap, 1);
  assert.strictEqual(capped.merged, 0);
  console.log("PASS: orchestrator — dry run is read-only, review pairs are reported, the per-run cap defers rather than drops");
})().catch((e) => { console.error(e); process.exit(1); });
