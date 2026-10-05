// test/non-event-filter.test.js — api/_lib/non-event-filter.js, the shared
// "this calendar entry is not an event" title filter used by cron-feeds.js,
// cron-ticketmaster.js and cron-localist.js.
//
// Two patterns were added on 2026-10-05 (closure notices; a governing board's
// own meeting), each from entries that were on public pages that day. A
// filter that hides too much hides real events, so this file is mostly the
// titles that must NOT match -- several of them found by an independent
// reviewer against the first version of the patterns.
//
// Run: node test/non-event-filter.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { isLikelyNotARealEvent, nonEventRule, TITLE_PATTERNS } = require(`${REPO_DIR}/api/_lib/non-event-filter.js`);
const hidden = (title) => isLikelyNotARealEvent({ title });

// As stored in production on 2026-10-05 (24 upcoming public rows between them).
for (const title of ["City Buildings Closed", "Library Closed", "Macomb Township Offices Closed"]) assert.strictEqual(nonEventRule(title), "closure_notice", title);
// The same notice, the other ways calendars write it.
for (const title of [
  "City Hall Closed", "Offices Closed - Thanksgiving", "Library Closed: Staff Training Day", "City Offices Closed (Veterans Day)",
  "Township Offices Closed for Thanksgiving", "City Offices Closed in observance of Juneteenth", "library closed", "Village Hall Closed early",
  "City Offices Closed in observance of Martin Luther King Jr. Day", "Library Closed Today", "City Hall Closed on Christmas Eve",
  "City Hall Closed.", "City Hall Closed!", "City Offices Closed, Veterans Day", "City Offices Closed/Veterans Day", "City Offices Closed at Noon",
  "Library Closed (Dr. Martin Luther King, Jr. Day)", "Library Closed for Presidents' Day", "Township Hall Closed for Election",
  // the reason first
  "Thanksgiving - City Offices Closed", "Veterans Day: City Offices Closed", "Veterans Day (City Offices Closed)", "Christmas Day – City Hall Closed", "New Year's Day - Library Closed",
  // a college's own closure days (Macomb lists them for the general public)
  "College Closed", "Campus Closed - Winter Holiday Break", "College Closed for the Thanksgiving Holiday", "Campus Closed for Spring Break",
]) assert.strictEqual(hidden(title), true, title);
// The two original patterns, anchored: a venue's own "closed" entry, and Ticketmaster's suite upsell beside the real show.
for (const title of ["CLOSED FOR PRIVATE EVENT", "Closed for a private event in the evening"]) assert.strictEqual(nonEventRule(title), "closed_for_private_event", title);
for (const title of ["Brand New - Suite Rental", "Leanne Morgan - Suite Rental", "Undertale Symphony - Suite Rental", "Beck - Suite Rental", "Jo Koy - Suite Rental", "Hamilton – VIP Suite Rental"]) assert.strictEqual(nonEventRule(title), "suite_rental", title);
console.log("PASS: closure notices, a venue's private-event closure and suite-rental upsells are not events");

for (const title of [
  // "closed" that is not a building being shut
  "Case Closed: A Murder Mystery Dinner", "Bocce Barn Closing Day", "Road closed for the Holiday Parade", "Library Closed Captioning Workshop",
  "Office Closed-Loop Recycling Tour", "Closed Session Records: An Evening of Jazz", "Campus Closed Circuit TV Workshop",
  // a real event that mentions a closure
  "The Library Is Closed: A Drag Reading Hour", "Friends Book Sale: Library Closed, Sale Open in the Garage",
  "Halloween at City Hall (City Hall closed early for Trick-or-Treat)", "Open House before the Old City Hall is closed for good",
  // what follows "closed" is an event: ONE closure word in it is not enough (second and third reviews)
  "Library Closed: A Drag Reading Hour", "Library Closed: Drag Bingo", "City Hall Closed - Christmas Tree Lighting Moves to Plaza",
  "City Hall Closed - Christmas Tree Lighting", "Library Closed: Holiday Drag Bingo", "Library Closed for Easter Egg Hunt", "City Hall Closed - Memorial Day Parade",
  "City Hall Closed for Juneteenth Celebration", "Campus Closed - Snow Day Sledding Party", "College Closed: Election Night Watch Party",
  "Library Closed for Renovation Celebration", "Library Closed for Repairs: Pop-Up Storytime", "Library Closed for Weather (Virtual Storytime at 10)",
  "Library Closed for Renovation Celebration Party and Ribbon Cutting Ceremony",
  // an EVENT, with a note that the offices are closed that day
  "Juneteenth Celebration - City Offices Closed", "Memorial Day Parade & Ceremony - City Hall Closed", "Veterans Day Ceremony - City Offices Closed",
  "Tree Lighting Ceremony - City Hall Closed", "Friends Book Sale - Library Closed", "Fall Festival - City Hall Closed", "MLK Day March & Rally - Campus Closed",
  "Drive-Thru Flu Clinic - Offices Closed", "Good Friday Fish Fry - Parish Office Closed",
  // a sentence, not a notice
  "Why Marygrove College Closed", "The Day the Library Closed", "The Year the College Closed", "When the Campus Closed", "How Detroit's Branch Libraries Closed",
  "The Office Closed", "After the Office Closed", "Before the Building Closed",
  // a public body's own meeting: the Product Owner's decision, not this filter's
  "Board of Trustees Meeting", "Macomb Township Board of Trustees Meeting", "Clinton Township Board of Trustees Regular Meeting", "Board of Trustees Meeting - 7 PM",
  "Recreation Board Meeting at 7pm", "City Council Meeting", "Town Hall Meeting", "Annual Meeting and Dinner", "Meet the Board of Trustees",
  // "suite rental" and "closed for private event" inside a real event's title
  "Salon Suite Rental Open House", "Bridal Suite Rental Showcase & Open House", "Luxury Suite Rental Auction Gala", "Win a Suite Rental: Charity Bingo Night",
  "Taproom Closed for Private Event; Public Show at 9", "Not Closed for Private Event: Open Mic Returns", "\"Closed for Private Event\" - A Comedy Show", "Closed for Private Event (band) w/ The Hi-Views",
  // production's own near-misses, 2026-10-05
  "Community Blood Drive", "Senior Scams with the Macomb County Prosecutor's Office", "Holiday Church Tour (Bianco Tours) SOLD OUT (WAIT LIST)", "Congress The Band- SOLD OUT", "Brand New",
  "Board Game Night", "Friends of the Library Book Sale", "Office Hours with the Mayor", "The Office Trivia Night",
  // nothing
  "", "   ",
]) assert.strictEqual(hidden(title), false, title);
for (const notText of [null, undefined, 42, {}]) assert.strictEqual(isLikelyNotARealEvent({ title: notText }), false);
assert.strictEqual(isLikelyNotARealEvent(), false);
assert.strictEqual(TITLE_PATTERNS.length, 2, "a new pattern is added only for an entry confirmed live, with its own titles here");
console.log("PASS: a real event that mentions a closure, a sentence, a public meeting, and \"suite rental\" inside a real title are all left alone");

// No title, however long or strange, takes the filter more than a moment
// (the first version of a date pattern took 20 seconds on 61 characters).
for (const title of ["Board of Trustees Meeting - " + "1".repeat(40) + "x", "City Hall Closed " + "day ".repeat(60), "City Hall Closed - " + "1 ".repeat(90) + "x", "a".repeat(100000), "Library Closed for " + "Thanksgiving ".repeat(14), "Closed for private event " + "in the evening ".repeat(11)]) {
  const started = Date.now();
  nonEventRule(title);
  assert.ok(Date.now() - started < 50, `${title.slice(0, 40)}… took ${Date.now() - started} ms`);
}
assert.strictEqual(nonEventRule("City Hall Closed " + "for Thanksgiving ".repeat(30)), null, "nothing over 200 characters is a notice");
console.log("PASS: every title is decided at once");

console.log("\nAll non-event-filter.test.js checks passed.");
