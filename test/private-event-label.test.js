// test/private-event-label.test.js — a venue's own "PRIVATE EVENT" label is not a public event (owner rule 2026-10-01:
// "closed to the public ... skipped all together"). Confirmed live 2026-10-23: HALO Detroit listed "NACD: PRIVATE CLOSED EVENT" (Oct 25)
// and "MCJ PRIVATE EVENT" (Oct 30). The existing filter only matched "Closed for (a) private event" at the start of a title.
//
// A false match hides a real event AND stops it being ingested, so most of this file is titles that must NOT match.
// Run: node test/private-event-label.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { nonEventRule, isLikelyNotARealEvent } = require(`${REPO_DIR}/api/_lib/non-event-filter.js`);
const rule = (title) => nonEventRule(title);

// as stored in production
for (const t of ["NACD: PRIVATE CLOSED EVENT", "MCJ PRIVATE EVENT"]) assert.strictEqual(rule(t), "private_event_label", t);
// the same label, the other ways a venue writes it
for (const t of ["PRIVATE EVENT", "Private Event", "private event", "ABC: Private Event", "ABC - PRIVATE EVENT".replace(" - ", " "), "XYZ PRIVATE PARTY", "NACD: PRIVATE, CLOSED EVENT".replace(", ", " "), "MCJ: Private event.", "  MCJ PRIVATE EVENT!  ", "A1B2: PRIVATE PARTY"]) assert.strictEqual(rule(t), "private_event_label", t);
assert.strictEqual(rule("ABC: PRIVATE, EVENT"), "private_event_label", "comma after private");

// must NOT match: real events, plays, bands, anything with more in the title
for (const t of [
  "The Private Event", "THE PRIVATE EVENT", "Our Private Party", "My Private Event", "A Private Event", "This Private Event",
  "Private Event Showcase", "Private Event Planning Workshop", "Private Parties at the Museum", "PRIVATE PARTY BAND LIVE",
  "NACD: PRIVATE EVENT SPACE TOUR", "NACD: PRIVATE EVENT - Public Show at 9", "MCJ PRIVATE EVENT FUNDRAISER",
  "Taproom Closed for Private Event; Public Show at 9", "Open House: Private Event Venues", "How to Plan a Private Event",
  "Jazz Night: Private Event", "Private", "Event", "Private Dancer Tribute", "Prime: Private Eye Mystery Night",
  "NACD: PRIVATE CLOSED EVENT REUNION", "Private Event (Public Welcome)", "Mr Private Event",
]) assert.strictEqual(rule(t), null, `must not hide: ${t}`);
// a tag with a lower-case letter is a name, not a renter's code
assert.strictEqual(rule("Nacd: private event"), null, "mixed-case tag is not a renter code");
assert.strictEqual(rule("Jazz Night: Private Event"), null, "a word after a colon is not a renter tag");

// an over-long title is never read
assert.strictEqual(rule("PRIVATE EVENT" + " X".repeat(200)), null);
assert.strictEqual(isLikelyNotARealEvent({ title: "MCJ PRIVATE EVENT" }), true);
assert.strictEqual(isLikelyNotARealEvent({}), false);

// HALO uses the shared filter before building rows, and the skip is counted
const halo = fs.readFileSync(`${REPO_DIR}/api/cron-halo.js`, "utf8");
assert.ok(/require\("\.\/_lib\/non-event-filter"\)/.test(halo), "cron-halo.js loads the shared non-event filter");
assert.ok(/parsed\.filter\(\(e\) => !isLikelyNotARealEvent\(\{ title: e\.title \}\)\)/.test(halo), "HALO drops non-event titles before building rows");
assert.ok(/const rawRows = publicParsed\.map\(/.test(halo), "rows are built only from the filtered list");
assert.ok(/skipped \$\{parsed\.length - publicParsed\.length\} non-event listing/.test(halo), "the skip is logged, not silent");
console.log("private-event-label: ok");
