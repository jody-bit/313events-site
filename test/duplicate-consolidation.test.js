"use strict";
// test/duplicate-consolidation.test.js — ONE REAL-WORLD EVENT -> ONE
// CANONICAL ROW (2026-10-05). Fixtures are the real production shapes
// measured that day; the rules are checked against each of them, and the
// merge is checked write by write against a fake PostgREST.
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const lib = require(`${REPO_DIR}/scripts/duplicate-consolidation.js`);
const { planConsolidation, classifyPair, pickSurvivor, fillPatch, applyMerge, markDistinct, consolidateDuplicates, normalizeTitle, normalizeStartTime, civicItemId, samePlace, endDatesAgree } = lib;

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
  assert.strictEqual(pickSurvivor(bj1, bj2)[0].id, bj1.id, "the hand-entered row stays (its category, description and link are a person's); it gains the listing's real time and art");
  assert.strictEqual(pickSurvivor({ ...bj1, source: "Detroit Opera" }, bj2)[0].id, bj1.id, "a first-party row stays before a listings aggregator's, even a fuller one");
  assert.strictEqual(pickSurvivor({ ...bj1, source: "Ticketmaster" }, { ...bj2, source: "Detroit Opera" })[0].id, bj2.id, "otherwise the more complete row survives");
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

// 2026-10-05 hardening: each case below made the first version of this pass
// (or its unshipped twin, under two independent adversarial reviews) retire
// a row it should not have. Rows are production's unless marked otherwise.
(function hardening() {
  // --- A public row is never retired in favour of one the public cannot see.
  const approvedThin = row({ title: "Fall Choral Concert", start_date: "2026-10-20", time_display: "7:30 PM", source: "Manual", external_id: null, venue_name_raw: "Macomb Center for the Performing Arts", venue_city_raw: "Clinton Township" });
  const pendingFull = row({ title: "Fall Choral Concert", start_date: "2026-10-20", time_display: "7:30 PM – 9:00 PM", source: "Macomb Community College", external_id: "localist-macomb-54134692586776", status: "pending_review", venue_id: "v-mcpa", venue_name_raw: "Macomb Center for the Performing Arts", venue_address_raw: "44575 Garfield Road", venue_city_raw: "Clinton Township", description: "The college's choirs.", image_url: "https://x/y.jpg", event_url: "https://events.macomb.edu/e" });
  assert.strictEqual(classifyPair(approvedThin, pendingFull).kind, "deterministic");
  assert.deepStrictEqual(pickSurvivor(approvedThin, pendingFull).map((r) => r.id), [approvedThin.id, pendingFull.id], "the approved row stays, however much fuller the pending one is");
  assert.deepStrictEqual(pickSurvivor(pendingFull, approvedThin).map((r) => r.id), [approvedThin.id, pendingFull.id], "...whichever is asked first");
  assert.deepStrictEqual(Object.keys(fillPatch(approvedThin, pendingFull)).sort(), ["description", "event_url", "image_url", "venue_address_raw", "venue_id"], "and it gains what the pending row knows");
  const twoConnectors = pickSurvivor({ ...approvedThin, source: "Metro Times", status: "pending_review" }, { ...pendingFull, status: "approved" });
  assert.strictEqual(twoConnectors[0].id, pendingFull.id);

  // --- "Venue TBA" is a shared unknown, not a shared place (production: one
  //     venue row, ten upcoming events, seven sources, five cities).
  const tree = { title: "Tree Lighting", start_date: "2026-12-04", time_display: "6:00 PM – 8:00 PM", venue_id: "v-tba", venue_name_raw: "Venue TBA" };
  const scs = row({ ...tree, source: "St. Clair Shores - Events & Programs", external_id: "feed-14933f36-40b3-4b73-9cc0-9fb84d051749-13282", venue_city_raw: "St. Clair Shores" });
  const wyandotte = row({ ...tree, source: "City of Wyandotte - City Events", external_id: "feed-2b6880db-1542-413d-874b-ca51177b49fc-1201", venue_city_raw: "Wyandotte" });
  const sameCityOtherOrg = row({ ...tree, source: "St. Clair Shores Library", external_id: "feed-99999999-1542-413d-874b-ca51177b49fc-88", venue_city_raw: "St. Clair Shores" });
  assert.strictEqual(samePlace(scs, wyandotte), false);
  assert.strictEqual(classifyPair(scs, wyandotte), null, "two cities' tree lightings are two events");
  assert.deepStrictEqual(classifyPair(scs, sameCityOtherOrg), { kind: "review", reason: "two_sources_place_differs" }, "in one city, with no place stated by either: a person decides");
  //     ...while a real shared venue link still counts when one row's own text lags behind it (Grave Rave).
  const raRow = row({ title: "Grave Rave", start_date: "2026-10-31", time_display: "Evening", source: "Resident Advisor", external_id: null, venue_id: "v-dsc", venue_name_raw: "Venue TBA (Detroit)", venue_city_raw: "Detroit" });
  const vdRow = row({ title: "Grave Rave", start_date: "2026-10-31", time_display: "10:00 PM", source: "VisitDetroit", external_id: "vd-50187643", venue_id: "v-dsc", venue_name_raw: "Detroit Shipping Company", venue_city_raw: "Detroit" });
  assert.deepStrictEqual(classifyPair(raRow, vdRow), { kind: "deterministic", rule: "two_sources_one_place" });
  assert.ok(!("venue_id" in fillPatch(row({ title: "T", start_date: "2026-12-04" }), scs)), "a link to the placeholder is not passed on");
  //     One feed listing one thing twice, both "Venue TBA", is still the same listing twice.
  assert.deepStrictEqual(classifyPair(scs, row({ ...scs, id: undefined, external_id: "feed-14933f36-40b3-4b73-9cc0-9fb84d051749-13283" })), { kind: "deterministic", rule: "same_feed_twice" });

  // --- One venue name in two cities is two places (not production rows: the municipal feeds' generic names).
  const story = { title: "Storytime", start_date: "2026-10-14", time_display: "10:30 AM", venue_name_raw: "Library" };
  const livonia = row({ ...story, source: "City of Livonia - Community Events", external_id: "feed-2f5e5a2b-befa-4693-aa57-ea3a4ea9e8ae-5001", venue_city_raw: "Livonia" });
  const troy = row({ ...story, source: "City of Troy", external_id: "feed-7c0b41a1-3d0e-4c6c-9a3e-1b2fc1cc199e-77", venue_city_raw: "Troy, MI 48084" });
  assert.strictEqual(classifyPair(livonia, troy), null);
  assert.deepStrictEqual(classifyPair(livonia, { ...troy, venue_city_raw: "Livonia, MI" }), { kind: "deterministic", rule: "two_sources_one_place" }, "the same name in the same city, two sources: one event");
  //     ...and the same small item number in two cities' calendars is not the same item.
  assert.strictEqual(classifyPair(livonia, { ...troy, external_id: "feed-7c0b41a1-3d0e-4c6c-9a3e-1b2fc1cc199e-5001" }), null);

  // --- Two rows that both state no time are not thereby at the same time
  //     (the circus, as Ticketmaster had it before the times were known).
  const circus = { title: "UniverSoul Circus", start_date: "2026-10-04", source: "Ticketmaster", venue_name_raw: "Across from the Aretha Franklin Amphitheatre Universoul Circus", venue_city_raw: "Detroit" };
  const c1 = row({ ...circus, external_id: "vv17OZ_oGkM4_Xl0", time_display: "Evening" });
  const c2 = row({ ...circus, external_id: "vv17OZ_oGkM4hXlW", time_display: "Evening" });
  assert.deepStrictEqual(classifyPair(c1, c2), { kind: "review", reason: "same_source_time_unknown" });
  assert.deepStrictEqual(classifyPair({ ...c1, time_display: null }, { ...c2, time_display: null }), { kind: "review", reason: "same_source_time_unknown" });
  assert.deepStrictEqual(classifyPair({ ...c1, time_display: null, is_all_day: true }, { ...c2, time_display: null, is_all_day: true }), { kind: "deterministic", rule: "same_feed_twice" }, "both all-day is a stated time");
  assert.strictEqual(classifyPair({ ...c1, time_display: "12:00 PM" }, { ...c2, time_display: "3:00 PM" }), null, "two real times are two performances");
  assert.strictEqual(planConsolidation([c1, c2, row({ ...circus, external_id: "vv17OZ_oGkM4QXlS", time_display: "Evening" })]).merges.length, 0);

  // --- A retired row a reviewer restores stays restored.
  const kept = row({ title: "Candy-Go-Round", start_date: "2026-10-24", time_display: "11:00 AM – 1:00 PM", source: "City of Livonia - Parks and Recreation", external_id: "feed-fbb61310-0db5-49d3-bf67-8dbfc1cc199e-4736", venue_name_raw: "Jack E. Kirksey Recreation Center", venue_city_raw: "Livonia" });
  const restored = row({ ...kept, id: undefined, source: "City of Livonia - Community Events", external_id: "feed-2f5e5a2b-befa-4693-aa57-ea3a4ea9e8ae-4736", internal_note: `DUP_MERGED_INTO | v1 | survivor=${kept.id} | rule=civicplus_sibling_feeds | at=2026-10-05` });
  assert.strictEqual(classifyPair(kept, restored), null, "active again after a merge: a person put it back");
  assert.strictEqual(classifyPair(restored, kept), null);
  assert.strictEqual(classifyPair(kept, { ...restored, internal_note: "DUP_MERGED_INTO | v1 | survivor=some-other-row | rule=x | at=2026-10-05" }).kind, "deterministic", "a merge into some OTHER row says nothing about this pair");

  // --- What the survivor gains.
  const own = row({ title: "T", start_date: "2026-10-24", description: "Written by the venue.", description_source: null, price_from: 25, is_free: false });
  const gen = row({ title: "T", start_date: "2026-10-24", description: "T at the venue.", description_source: "generated", is_free: true });
  assert.deepStrictEqual(fillPatch(own, gen), {}, "a source's own description is not relabelled \"generated\", and an event with a price is not marked free");
  assert.deepStrictEqual(fillPatch({ ...own, description: null }, gen), { description: "T at the venue.", description_source: "generated" }, "a description arrives with its label");
  assert.deepStrictEqual(fillPatch({ ...own, description: null, description_source: "generated" }, { ...gen, description: "From the source.", description_source: null }), { description: "From the source.", description_source: null });
  assert.ok(!("time_display" in fillPatch(row({ title: "T", start_date: "2026-10-24", is_all_day: true }), row({ title: "T", start_date: "2026-10-24", time_display: "7:00 PM" }))), "an all-day event is not given a clock time");

  // --- Titles.
  assert.notStrictEqual(normalizeTitle("مهرجان الربيع 2026"), normalizeTitle("حفل التخرج 2026"), "a title in another script is not reduced to its digits");
  assert.notStrictEqual(normalizeTitle("ガール"), normalizeTitle("カール"));
  assert.strictEqual(normalizeTitle("Youmacon 2026", "2026-10-29"), "youmacon", "this year's date at the end is ignored");
  assert.strictEqual(normalizeTitle("Blade Runner 2049", "2026-10-29"), "blade runner 2049");
  assert.strictEqual(normalizeTitle("Winter Gala 2025", "2026-01-10"), "winter gala 2025", "another year's is part of the title");
  assert.strictEqual(normalizeTitle("2026", "2026-10-29"), "2026");
  const emoji = { start_date: "2026-10-24", time_display: "7:00 PM", source: "Manual", venue_id: "v-1", venue_name_raw: "Somewhere", venue_city_raw: "Detroit" };
  assert.strictEqual(classifyPair(row({ ...emoji, title: "!!!" }), row({ ...emoji, title: "???" })), null, "two titles of punctuation are not the same title");
  assert.strictEqual(planConsolidation([row({ ...emoji, title: "🎃" }), row({ ...emoji, title: "🎄" })]).merges.length, 0);
  const you1 = row({ title: "Youmacon", start_date: "2026-10-29", time_display: "Afternoon (exact hours vary by program)", source: "Youmacon (youmacon.com, researched 2026-09-04)", external_id: "youmacon-2026", venue_id: "v-hp", venue_name_raw: "Huntington Place", venue_city_raw: "Detroit", price_from: 80 });
  const you2 = row({ title: "Youmacon 2026", start_date: "2026-10-29", time_display: null, is_all_day: true, source: "VisitDetroit", external_id: "vd-49974566", venue_id: "v-hp", venue_name_raw: "Huntington Place", venue_city_raw: "Detroit", description: "d", image_url: "i", ticket_url: "t", venue_address_raw: "1 Washington Boulevard" });
  const youPlan = planConsolidation([you1, you2]);
  assert.deepStrictEqual(youPlan.merges.map((m) => [m.survivor.id, m.loser.id, m.rule]), [[you1.id, you2.id, "two_sources_one_place"]], "the researched first-party row stays; the listing folds into it");
  console.log("PASS: hardening — a public row is never retired for a pending one; Venue TBA and a name shared by two cities are not a place; unknown times go to a person; a restore sticks; labels travel with descriptions; non-Latin titles survive");
})();

// An independent review of the hardening above found these. Each is the
// reviewer's own case.
(function reviewOfTheHardening() {
  // --- One listing never absorbs two performances. A hand-entered row that
  //     only says "Evening" is at the same place as BOTH Ticketmaster shows.
  const carol = { title: "A Christmas Carol", start_date: "2026-11-21", venue_id: "v-mb", venue_name_raw: "Meadow Brook Theatre", venue_city_raw: "Rochester" };
  const matinee = row({ ...carol, source: "Ticketmaster", external_id: "vv17OZ_FGknEqJr_", time_display: "2:00 PM", ticket_url: "https://tm/2pm" });
  const evening = row({ ...carol, source: "Ticketmaster", external_id: "vv17OZ_FGknEjUrZ", time_display: "6:30 PM", ticket_url: "https://tm/630pm" });
  const byHand = row({ ...carol, source: "Manual", external_id: null, time_display: "Evening" });
  const p = planConsolidation([matinee, evening, byHand]);
  assert.deepStrictEqual(p.merges.map((m) => [m.survivor.id, m.loser.id]), [[byHand.id, matinee.id]], "the hand-entered row takes ONE performance");
  assert.deepStrictEqual(p.reviews.map((r) => [r.a.id, r.b.id, r.reason]), [[byHand.id, evening.id, "one_listing_two_performances"]], "and the other stays public, with a question for a person");
  // The same with a first-party all-day RSS row against two listings' performances.
  const rss = row({ ...carol, source: "Meadow Brook Theatre", external_id: "feed-11111111-1111-4111-8111-111111111111-https://mbtheatre.com/carol", time_display: null, is_all_day: true });
  const vd2 = row({ ...carol, source: "VisitDetroit", external_id: "vd-1", time_display: "2:00 PM – 4:00 PM" });
  const vd630 = row({ ...carol, source: "VisitDetroit", external_id: "vd-2", time_display: "6:30 PM – 8:30 PM" });
  const q = planConsolidation([vd2, vd630, rss]);
  assert.deepStrictEqual([q.merges.length, q.reviews.length, q.reviews[0].reason], [1, 1, "one_listing_two_performances"]);
  // Two rows with the SAME real time into one time-less survivor is still one event.
  assert.strictEqual(planConsolidation([byHand, matinee, row({ ...carol, source: "VisitDetroit", external_id: "vd-3", time_display: "2:00 PM – 4:30 PM" })]).merges.length, 2);

  // --- One ordering decides who stays: no row is retired into a row that is then retired itself.
  const you = { start_date: "2026-10-29", venue_id: "v-hp", venue_name_raw: "Huntington Place", venue_city_raw: "Detroit", is_all_day: true, time_display: null };
  const vd = row({ ...you, title: "Youmacon 2026", source: "VisitDetroit", external_id: "vd-49974566", description: "d", image_url: "i", ticket_url: "t", venue_address_raw: "1 Washington Boulevard" });
  const mt = row({ ...you, title: "Youmacon", source: "Metro Times", external_id: "mt-881", description: "d", event_url: "https://metrotimes/youmacon" });
  const fp = row({ ...you, title: "Youmacon", source: "Youmacon (youmacon.com, researched 2026-09-04)", external_id: "youmacon-2026", description: "d" });
  const chain = planConsolidation([vd, mt, fp]);
  assert.deepStrictEqual(chain.merges.map((m) => m.survivor.id), [fp.id, fp.id], "both listings fold into the first-party row directly");
  const losers = new Set(chain.merges.map((m) => m.loser.id));
  assert.ok(chain.merges.every((m) => !losers.has(m.survivor.id)), "no survivor is also a loser");

  // --- A run and its opening night are not one row; an overnight end is the same night.
  const run = row({ title: "Wicked", start_date: "2026-11-03", end_date: "2026-11-22", time_display: null, source: "VisitDetroit", external_id: "vd-77", venue_id: "v-doh", venue_name_raw: "Detroit Opera House", venue_city_raw: "Detroit", description: "d" });
  const opening = row({ title: "Wicked", start_date: "2026-11-03", end_date: null, time_display: "7:30 PM", source: "Ticketmaster", external_id: "tm-77", venue_id: "v-doh", venue_name_raw: "Detroit Opera House", venue_city_raw: "Detroit" });
  assert.deepStrictEqual(classifyPair(run, opening), { kind: "review", reason: "end_dates_differ" });
  assert.deepStrictEqual(classifyPair(opening, { ...run, source: "Manual", end_date: "2026-11-03" }).kind, "deterministic", "an end date equal to the start is one day");
  const rave = { title: "Grave Rave", start_date: "2026-10-31", venue_id: "v-dsc", venue_name_raw: "Detroit Shipping Company", venue_city_raw: "Detroit" };
  assert.strictEqual(classifyPair(row({ ...rave, source: "Resident Advisor", time_display: "Evening", end_date: null }), row({ ...rave, source: "VisitDetroit", external_id: "vd-50187643", time_display: "10:00 PM", end_date: "2026-11-01" })).kind, "deterministic", "10 PM to the small hours is one night");
  assert.deepStrictEqual([endDatesAgree({ start_date: "2026-10-31", end_date: null }, { start_date: "2026-10-31", end_date: "2026-11-02" }), endDatesAgree({ start_date: "2026-12-31", end_date: "2027-01-01" }, { start_date: "2026-12-31" })], [false, true]);

  // --- "Both all-day" is how an RSS feed writes every row.
  const story = { title: "Family Storytime", start_date: "2026-10-14", source: "Ferndale Area District Library", venue_id: "v-fadl", venue_name_raw: "Ferndale Area District Library", is_all_day: true, time_display: null };
  const am = row({ ...story, external_id: "feed-22222222-2222-4222-8222-222222222222-https://fadl.org/event/storytime-1030", description: "10:30 am" });
  const pm = row({ ...story, external_id: "feed-22222222-2222-4222-8222-222222222222-https://fadl.org/event/storytime-1800", description: "6:00 pm pajama edition" });
  assert.deepStrictEqual(classifyPair(am, pm), { kind: "review", reason: "same_source_time_unknown" });
  //     Royal Oak's two "New Year Holidays" items differ only in the item's own link: still the same listing twice.
  const ny = { title: "New Year Holidays", start_date: "2026-12-31", end_date: "2027-01-01", source: "City of Royal Oak", venue_name_raw: "Leo Mahany / Harold Meininger Senior Community Center", venue_city_raw: "Royal Oak", is_all_day: true, time_display: null };
  assert.deepStrictEqual(classifyPair(row({ ...ny, external_id: "feed-55488971-2092-401f-a6e5-ad51dbf9d10a-8461", description: " https://www.romi.gov/calendar.aspx?EID=8461" }), row({ ...ny, external_id: "feed-55488971-2092-401f-a6e5-ad51dbf9d10a-8462", description: " https://www.romi.gov/calendar.aspx?EID=8462" })), { kind: "deterministic", rule: "same_feed_twice" });

  // --- A blank city does not make two cities one.
  const tree = { title: "Tree Lighting", start_date: "2026-12-04", time_display: "6:00 PM – 8:00 PM", venue_id: "v-tba" };
  const scs = row({ ...tree, source: "St. Clair Shores - Events & Programs", external_id: "feed-14933f36-40b3-4b73-9cc0-9fb84d051749-13282", venue_name_raw: "Venue TBA", venue_city_raw: "St. Clair Shores" });
  const wy = row({ ...tree, source: "City of Wyandotte - City Events", external_id: "feed-2b6880db-1542-413d-874b-ca51177b49fc-1201", venue_name_raw: null, venue_city_raw: "Wyandotte" });
  assert.strictEqual(samePlace(scs, wy), false, "a shared link, no venue text of its own on one side, two cities");
  assert.strictEqual(classifyPair(scs, wy), null);
  const lib1 = row({ title: "Storytime", start_date: "2026-10-14", time_display: "10:30 AM", source: "City of Livonia - Community Events", external_id: "feed-2f5e5a2b-befa-4693-aa57-ea3a4ea9e8ae-5001", venue_name_raw: "Library", venue_city_raw: null });
  const lib2 = row({ title: "Storytime", start_date: "2026-10-14", time_display: "10:30 AM", source: "City of Troy", external_id: "feed-7c0b41a1-3d0e-4c6c-9a3e-1b2fc1cc199e-5001", venue_name_raw: "Library", venue_city_raw: "Troy" });
  assert.notStrictEqual((classifyPair(lib1, lib2) || {}).kind, "deterministic", "one name from two sources, one of which does not say which city; and the same item number in two municipalities' calendars");
  assert.strictEqual(classifyPair({ ...lib1, venue_city_raw: "Livonia" }, { ...lib2, source: "City of Livonia - Library", venue_city_raw: null }).rule, "civicplus_sibling_feeds", "one municipality's sibling feeds need no city");

  // --- What the survivor gains from one row is seen by the next.
  assert.ok(!("price_from" in fillPatch({ is_free: true, price_from: null }, { price_from: 25 })));

  // --- Who stays, each key on its own.
  const thinApprovedListing = row({ title: "T", start_date: "2026-10-24", source: "VisitDetroit", external_id: "vd-9" });
  const fullPendingFirstParty = row({ title: "T", start_date: "2026-10-24", source: "Macomb Community College", external_id: "localist-macomb-1", status: "pending_review", venue_id: "v", description: "d", image_url: "i", event_url: "u", time_display: "7:00 PM", venue_address_raw: "a" });
  assert.strictEqual(pickSurvivor(fullPendingFirstParty, thinApprovedListing)[0].id, thinApprovedListing.id, "public before everything: even a listings row over a fuller first-party row nobody has approved");
  const thinManual = row({ title: "T", start_date: "2026-10-24", source: "Manual", external_id: null });
  const fullConnector = row({ title: "T", start_date: "2026-10-24", source: "Detroit Opera", external_id: "do-1", venue_id: "v", description: "d", image_url: "i", event_url: "u", time_display: "7:00 PM", venue_address_raw: "a" });
  assert.strictEqual(pickSurvivor(fullConnector, thinManual)[0].id, thinManual.id, "a hand-entered row before a fuller connector row");
  assert.strictEqual(pickSurvivor({ ...fullConnector, source: "Metro Times" }, { ...thinManual, source: "Detroit Opera", external_id: "do-2" })[0].source, "Detroit Opera", "Metro Times is a listing too");
  // A restore is about the row it was merged INTO, exactly.
  const e1 = row({ title: "T", start_date: "2026-10-24", time_display: "7:00 PM", source: "A", external_id: "a-1", venue_id: "v" });
  const e12 = row({ title: "T", start_date: "2026-10-24", time_display: "7:00 PM", source: "B", external_id: "b-1", venue_id: "v", internal_note: `DUP_MERGED_INTO | v1 | survivor=${e1.id}9 | rule=x | at=2026-10-05` });
  assert.strictEqual(classifyPair(e1, e12).kind, "deterministic", "a note naming another id that merely begins the same way is not about this pair");
  console.log("PASS: review of the hardening — one listing never absorbs two performances; no chains; a run is not its opening night; RSS all-day rows need matching descriptions; a blank city joins nothing");
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
  // Item 4690 in both feeds is one item; so is 4691; and one feed listing
  // the trip under two item ids is the same listing twice. What is NOT taken
  // on trust is the fourth link: the Senior Center's 4691 against Parks and
  // Recreation's 4690 are two feeds, two items and no stated place (both are
  // "Venue TBA") -- that pair goes to a person. Two rows instead of four,
  // and one question.
  const p = planConsolidation(rows);
  assert.strictEqual(p.merges.length, 2);
  const survivors = new Set(p.merges.map((m) => m.survivor.id));
  assert.strictEqual(survivors.size, 1);
  assert.strictEqual(p.merges[0].survivor.id, rows[0].id, "the oldest of equally complete rows survives");
  assert.deepStrictEqual(p.merges.map((m) => m.rule).sort(), ["civicplus_sibling_feeds", "same_feed_twice"]);
  assert.deepStrictEqual(p.reviews.map((r) => [r.a.id, r.b.id, r.reason]), [[rows[0].id, rows[2].id, "two_sources_place_differs"]]);
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

  // what the survivor gained is seen by the next row folded into it
  {
    const noel = { title: "Noel Night", start_date: "2026-12-05", venue_id: "v-dia", venue_name_raw: "Detroit Institute of Arts", venue_city_raw: "Detroit" };
    const s0 = row({ ...noel, source: "Manual", external_id: null, time_display: "Evening" });
    const l1 = row({ ...noel, source: "Detroit Institute of Arts", external_id: "dia-1", time_display: "5:00 PM – 10:00 PM", description: "The museum's own words.", description_source: "authoritative", is_free: true });
    const l2 = row({ ...noel, source: "VisitDetroit", external_id: "vd-1", time_display: "5:00 PM", description: "Generated blurb.", description_source: "generated", price_from: 15 });
    const okFetch = async () => ({ ok: true, status: 200, json: async () => [] });
    await applyMerge("https://x.supabase.co", "key", { survivor: s0, loser: l1, rule: "two_sources_one_place" }, { fetchFn: okFetch });
    const second = await applyMerge("https://x.supabase.co", "key", { survivor: s0, loser: l2, rule: "two_sources_one_place" }, { fetchFn: okFetch });
    assert.deepStrictEqual(second.filled, [], "the listing's blurb, time and price do not write over what the museum's row gave");
    assert.deepStrictEqual([s0.description, s0.description_source, s0.time_display, s0.is_free, s0.price_from], ["The museum's own words.", "authoritative", "5:00 PM – 10:00 PM", true, null]);
  }

  // the identity is recorded, or the row is not retired
  calls.length = 0;
  const noIdentity = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || "GET" });
    if (url.includes("event_source_identities")) return { ok: false, status: 500, json: async () => ({}), text: async () => "" };
    return { ok: true, status: 200, json: async () => [] };
  };
  const held = await applyMerge("https://x.supabase.co", "key", { survivor, loser, rule: "two_sources_one_place" }, { fetchFn: noIdentity });
  assert.deepStrictEqual([held.identityRecorded, held.retired], [false, false]);
  assert.ok(!calls.some((c) => c.method === "PATCH" && c.url.includes(`/events?id=eq.${loser.id}`)), "the row stays as it is until its identity can be recorded");

  // not a duplicate: both rows marked, nothing else touched
  calls.length = 0;
  assert.strictEqual(await markDistinct("https://x.supabase.co", "key", survivor, loser, { fetchFn }), true);
  assert.strictEqual(calls.length, 2);
  assert.ok(calls[0].body.internal_note.endsWith(`DUP_DISTINCT | v1 | other=${loser.id}`));
  assert.ok(calls[1].body.internal_note.endsWith(`DUP_DISTINCT | v1 | other=${survivor.id}`));
  console.log("PASS: merge — blank-only fill, identity recorded, press links moved, loser retired with provenance, nothing deleted; 'not a duplicate' is recorded on both rows");

  // the orchestrator: dry run writes nothing; the cap defers, never drops
  const rows = [
    row({ title: "New Year Holidays", start_date: "2026-12-31", time_display: null, is_all_day: true, source: "City of Royal Oak", external_id: "feed-55488971-2092-401f-a6e5-ad51dbf9d10a-8462", venue_name_raw: "Leo Mahany / Harold Meininger Senior Community Center", venue_city_raw: "Royal Oak" }),
    row({ title: "New Year Holidays", start_date: "2026-12-31", time_display: null, is_all_day: true, source: "City of Royal Oak", external_id: "feed-55488971-2092-401f-a6e5-ad51dbf9d10a-8461", venue_name_raw: "Leo Mahany / Harold Meininger Senior Community Center", venue_city_raw: "Royal Oak" }),
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
