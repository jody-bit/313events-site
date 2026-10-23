// test/nightlife-classifier.test.js — #177 reusable Nightlife rule (owner decision 2026-10-19 22:30Z).
// Plain Node assert. Run: node test/nightlife-classifier.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { classifyNightlife, mayClassify, nightlifeNote } = require(`${REPO_DIR}/api/_lib/nightlife-classifier.js`);

// [name, row, expected decision]. Real production rows unless marked RECONSTRUCTED (EI fixtures, 2026-10-18/19).
const CASES = [
  ["Corridor Cyberpunk Rave: Nightlife (title Rave + 9 PM start)", { title: "Corridor Cyberpunk Rave", description: "Corridor Cyberpunk Rave takes place at GottaGacha on December 5 at 9:00 PM – 11:00 PM.", venue_name_raw: "GottaGacha", time_display: "9:00 PM – 11:00 PM" }, "nightlife"],
  ["Youmacon After Party: no dance-event word, unchanged", { title: "Youmacon After Party", description: "Youmacon After Party takes place at GottaGacha on October 29 at 7:00 PM – 2:00 AM.", venue_name_raw: "GottaGacha", time_display: "7:00 PM – 2:00 AM" }, "no_opinion"],
  ["Karaoke Night [OPEN]: unchanged", { title: "Karaoke Night [OPEN]", description: "Karaoke Night [OPEN] takes place at GottaGacha on October 21 at 6:00 PM – 11:59 PM.", venue_name_raw: "GottaGacha", time_display: "6:00 PM – 11:59 PM" }, "no_opinion"],
  ["Friday Night Magic: unchanged", { title: "Friday Night Magic", description: "", venue_name_raw: "GottaGacha", time_display: "9:00 PM – 2:00 AM" }, "no_opinion"],
  ["Spooky Movie Night: unchanged", { title: "Spooky Movie Night", description: "", venue_name_raw: "GottaGacha", time_display: "10:00 PM – 2:00 AM" }, "no_opinion"],
  ["Zam's Club: Melee #8: unchanged", { title: "Zam's Club: Melee #8", description: "", venue_name_raw: "GottaGacha", time_display: "5:30 PM – 11:59 PM" }, "no_opinion"],
  ["DJ Shadow: held for a person", { title: "DJ Shadow", description: "", venue_name_raw: "Royal Oak Music Theatre", time_display: "8:00 PM" }, "hold"],
  ["Rave Jesus: Rave Revival Tour (live act, 7 PM): held", { title: "RAVE JESUS: RAVE REVIVAL TOUR", description: "", venue_name_raw: "Diamondback Music Hall", time_display: "7:00 PM" }, "hold"],
  ["Broadway Rave (8 PM): held", { title: "Broadway Rave - The Musical Theatre Dance Party", description: "", venue_name_raw: "Blind Pig", time_display: "8:00 PM" }, "hold"],
  ["Beats, Robots, Monsters: DJ lineup in description only: held", { title: "Beats, Robots, Monsters: Dawn of The Dead", description: "breakbeat, lo-fi, ghettotech, house and experimental. DJ interludes and 8-10 special DJ set from PITCHBLND", venue_name_raw: "", time_display: "" }, "hold"],
  ["Anime Rave at Elektricity Nightclub: qualifies (new/pending rows only, see mayClassify)", { title: "Anime Rave", description: "", venue_name_raw: "Elektricity Nightclub", time_display: "9:00 PM – 2:00 AM" }, "nightlife"],
  ["Glotaku New Year Rave: qualifies (new/pending rows only)", { title: "Glotaku New Year Rave", description: "", venue_name_raw: "GottaGacha", time_display: "10:00 PM – 2:00 AM" }, "nightlife"],
  ["Highway to Hell dance party, 9 PM: qualifies", { title: "Highway to Hell - an 80's Hair Metal / Glam Dance Party", description: "", venue_name_raw: "The Loving Touch", time_display: "9:00 PM" }, "nightlife"],
  ["Baby Rave at a library: family/institutional context", { title: "Baby Rave", description: "", venue_name_raw: "Library > Programming Center", time_display: "10:00 AM" }, "no_opinion"],
  ["Kids rave at a late hour still vetoed by title context", { title: "Kids Rave Night", description: "", venue_name_raw: "Community Hall", time_display: "9:00 PM" }, "no_opinion"],
  ["Rave at a museum: institutional venue veto", { title: "Museum After Hours Rave", description: "", venue_name_raw: "Detroit Museum of Art", time_display: "10:00 PM" }, "no_opinion"],
  ["Technotag laser tag at a library: veto", { title: "Technotag Mobile Laser Tag Event", description: "", venue_name_raw: "Main Meeting Room", time_display: "4:00 PM" }, "no_opinion"],
  ["Octoberfest with a live DJ: amenity, not a dance event", { title: "Octoberfest at Saint John's Resort", description: "Doyles Patio Live DJ Food Beer Lawn games Kids putting", venue_name_raw: "Saint John's Resort", time_display: "4:00 PM" }, "no_opinion"],
  ["Food truck Octoberfest with a DJ: amenity", { title: "Straight Farmhouse Food Truck Octoberfest", description: "Food Trucks, Beer Tent, Live Music, DJ, Lots of children's activities, Raffles", venue_name_raw: "Garden City", time_display: "12:00 PM" }, "no_opinion"],
  ["Source-confident category is never overridden", { title: "Rave Night", description: "", venue_name_raw: "Elektricity Nightclub", time_display: "10:00 PM", category_confident: true }, "no_opinion"],
  ["Description-only rave word at a nightclub, late, with DJs: qualifies on three pieces of evidence", { title: "Citywave: Magical Funk", description: "A rave night with DJs spinning funk and house all night.", venue_name_raw: "Citywave at Nightclub", time_display: "9:00 PM – 1:00 AM" }, "nightlife"],
  ["Citywave title only (RECONSTRUCTED): no opinion", { title: "Citywave: Magical Funk", description: "", venue_name_raw: "GottaGacha", time_display: "9:00 PM – 1:00 AM" }, "no_opinion"],
  ["Student recital: no signal", { title: "Student Recital: Sofia Vasileiadou, soprano", description: "", venue_name_raw: "Moore Musical Arts Center", time_display: "6:00 PM" }, "no_opinion"],
  ["Empty row: no signal, no throw", {}, "no_opinion"],
];

let n = 0;
for (const [name, row, expected] of CASES) {
  const r = classifyNightlife(row);
  assert.strictEqual(r.decision, expected, `${name}: expected ${expected}, got ${r.decision} (${r.reason})`);
  assert.ok(Array.isArray(r.evidence) && typeof r.reason === "string", `${name}: result shape`);
  // Rule 5: the classifier has no way to approve or publish.
  for (const key of Object.keys(r)) assert.ok(["decision", "reason", "evidence"].includes(key), `${name}: unexpected output key ${key}`);
  n++;
}
console.log(`PASS: ${n} classification cases (named cases from the owner decision, vetoes, amenity, confident source, empty row)`);

// mayClassify: new or pending only.
assert.strictEqual(mayClassify(undefined), true);
assert.strictEqual(mayClassify(null), true);
assert.strictEqual(mayClassify("pending_review"), true);
assert.strictEqual(mayClassify("approved"), false, "an approved row is never reclassified");
assert.strictEqual(mayClassify("rejected"), false, "a rejected row is never reclassified");
console.log("PASS: only a new or pending_review row may take the classification");

// Notes.
assert.ok(/Not approved; awaits review/.test(nightlifeNote({ decision: "nightlife", reason: "explicit_type_plus_corroboration", evidence: ["title_type:rave", "late_hours"] })));
assert.ok(/Nightlife vs music/.test(nightlifeNote({ decision: "hold", reason: "dj_headliner_or_lineup_music_vs_nightlife", evidence: [] })));
assert.strictEqual(nightlifeNote({ decision: "no_opinion", reason: "no_signal", evidence: [] }), null);
assert.strictEqual(nightlifeNote(null), null);
console.log("PASS: breadcrumb notes say 'not approved' for Nightlife and 'nightlife vs music' for a hold, and are empty otherwise");
