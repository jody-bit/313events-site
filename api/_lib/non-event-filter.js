"use strict";

// api/_lib/non-event-filter.js
//
// Shared, source-agnostic "is this actually a real, attendable public
// event, or a non-event artifact a source's own calendar/catalog system
// happens to publish" filter -- 2026-10-01, Needs Follow-up remaining-gap
// product pass (Jody: "if an event says 'closed to the public' ... that
// should be skipped all together -- we don't want that listing in the
// site AT ALL").
//
// Two real, confirmed cases, from two completely unrelated sources --
// confirming this is a real cross-source category of problem, not one
// feed's quirk:
//   1. The Congregation's own ICS feed publishes a literal "CLOSED FOR
//      PRIVATE EVENT" entry on its calendar, fully populated (venue, time,
//      everything) -- marking the venue unavailable for a private rental
//      that day, not an event the public can attend.
//   2. Ticketmaster's Discovery API returns a separate "<Artist> - Suite
//      Rental" listing alongside the real underlying concert -- a
//      corporate-box upsell add-on bundled with the show, not a
//      standalone public event of its own.
//
// Deliberately narrow, title-only, exact-phrase matching -- same "never
// guess" posture as api/_lib/mobile-event.js. A broad keyword here risks
// hiding a REAL event (e.g. a band literally named "Cancelled", a venue
// called "The Rental Space"), which is worse than leaving one junk
// listing up for a day -- so this only grows when a new case is confirmed
// live the same way these two were, never from a guessed pattern.
//
// 2026-10-05 -- one more, confirmed live the same way, on the Product
// Owner's instruction that administrative entries such as "offices closed"
// must not become public events:
//   3. A CLOSURE NOTICE. Three municipal calendars publish the days their
//      buildings are shut as calendar entries, and 24 of them were on public
//      pages as upcoming events on 2026-10-05: "City Buildings Closed"
//      (Sterling Heights, 16), "Library Closed" (Madison Heights, 5),
//      "Macomb Township Offices Closed" (3).
//
// THE CLOSURE RULE, and why each part is there. Three rounds of independent
// review attacked it with realistic titles; a false match hides a real event
// AND stops it being ingested, so every part exists to refuse one of them.
//
//   [whose] <a kind of civic building> closed [why]
//
//   - "closed" must follow a BUILDING word (offices, buildings, library,
//     city hall, township hall, village hall, college, campus). The word on
//     its own is a play ("Case Closed"), a sentence ("Road closed for the
//     parade") and a real event ("Bocce Barn Closing Day").
//   - WHOSE is a short name and nothing else: no dash or colon in it, no
//     more than four words, and none of the little words a sentence is made
//     of. "Juneteenth Celebration - City Offices Closed" is a celebration;
//     "Why Marygrove College Closed" and "The Day the Library Closed" are
//     talks; "The Office Closed" is not a notice.
//   - WHY, if anything follows "closed", must be made ENTIRELY of the words
//     a closure is explained with -- a holiday's name, staff training,
//     weather, building works, "for", "in observance of", a weekday. One
//     such word is not enough: "City Hall Closed - Christmas Tree Lighting",
//     "Library Closed for Easter Egg Hunt" and "Campus Closed - Snow Day
//     Sledding Party" are events, and "Library Closed Captioning Workshop"
//     is a workshop.
//   - The reason may also come first: "Thanksgiving - City Offices Closed",
//     "Veterans Day (City Offices Closed)" -- but only when what comes first
//     is itself nothing but such words ("Memorial Day Parade & Ceremony -
//     City Hall Closed" is a parade).
//
// NOT MATCHED, deliberately: a public body's own meeting ("Board of Trustees
// Meeting", "Recreation Board Meeting at 7pm", "City Council Meeting"). In
// Michigan a township's Board of Trustees IS its council; whether such
// meetings belong on the site is the Product Owner's decision, not a filter's.
//
// The two original patterns are now anchored, because since 2026-10-05 a
// match also RETIRES a stored public row (scripts/retire-non-events.js):
// "<artist> - Suite Rental" is the tail of a title after a dash (not "Bridal
// Suite Rental Showcase & Open House"), and "Closed for (a) private event"
// is where the title begins (not "Taproom Closed for Private Event; Public
// Show at 9").
const MAX_TITLE_LENGTH = 200; // nothing this long is a notice; and no regex below is asked to read it
const TITLE_PATTERNS = [
  /^\W*closed for (?:a |an )?private events?(?:\s+(?:in|on|this|at|until|from|today|tonight|all)\b[\p{L}\p{N}\s:.]{0,40})?\W*$/iu,
  /[-\u2013\u2014:]\s*(?:vip\s+)?suite rentals?\s*$/i,
];

const BUILDING = "(?:offices?|buildings?|library|libraries|city hall|township hall|village hall|college|campus)";
// [whose] <building> closed <rest>. "closed" is not followed by a letter,
// digit or hyphen ("Closed-Loop", "Closedown").
const CLOSURE_RE = new RegExp(`^([\\p{L}\\p{N}\\s.'&]{0,40}?)\\b${BUILDING}\\s+closed(?![\\p{L}\\p{N}-])(.*)$`, "iu");
const SENTENCE_WORDS = new Set(["the", "this", "that", "these", "a", "an", "when", "why", "how", "what", "who", "after", "before", "until", "since", "while", "if", "is", "was", "are", "were", "has", "have", "had", "will", "would", "not", "never", "no", "day", "year", "night", "time", "our", "my", "your"]);
const REASON_WORDS = new Set([
  // connectives
  "for", "in", "on", "of", "the", "and", "at", "due", "to", "observance", "observed", "honor", "today", "early", "all", "noon",
  // what a closure is for
  "holiday", "holidays", "day", "days", "eve", "break", "weekend", "recess", "staff", "training", "service", "inservice", "development", "professional",
  "weather", "snow", "inclement", "emergency", "maintenance", "construction", "renovation", "renovations", "repair", "repairs", "cleaning", "inventory",
  // the holidays themselves
  "new", "year", "years", "martin", "luther", "king", "jr", "dr", "mlk", "presidents", "president", "good", "friday", "easter", "memorial", "juneteenth",
  "independence", "july", "fourth", "labor", "columbus", "indigenous", "peoples", "election", "veterans", "veteran", "thanksgiving", "christmas", "winter", "spring", "summer", "fall",
  // when
  "monday", "tuesday", "wednesday", "thursday", "saturday", "sunday", "january", "february", "march", "april", "may", "june", "august", "september", "october", "november", "december",
]);
const MAX_REASON_WORDS = 8;
const wordsOf = (text) => String(text).toLowerCase().replace(/[\u2019']s?(?![\p{L}])/gu, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// Every word is one a closure is explained with (or a number: "4th", "2026").
function isReasonText(text, { allowEmpty }) {
  const words = wordsOf(text);
  if (!words.length) return allowEmpty;
  return words.length <= MAX_REASON_WORDS && words.every((w) => REASON_WORDS.has(w) || /^\d{1,4}(?:st|nd|rd|th)?$/.test(w));
}
// "[whose] <building> closed [why]" and nothing else.
function isClosureCore(text) {
  const m = CLOSURE_RE.exec(text.trim());
  if (!m) return false;
  const whose = wordsOf(m[1]);
  if (whose.length > 4 || whose.some((w) => SENTENCE_WORDS.has(w))) return false;
  return isReasonText(m[2], { allowEmpty: true });
}
function isClosureNotice(title) {
  if (isClosureCore(title)) return true;
  // "<why> - <closure>", "<why>: <closure>", "<why> (<closure>)"
  const split = /^(.+?)\s*(?:\s[-\u2013\u2014]\s|:\s|\s\()\s*(.+?)\)?\s*$/u.exec(title.trim());
  return !!split && isReasonText(split[1], { allowEmpty: false }) && isClosureCore(split[2]);
}

// Which rule a title matches, or null. The names are what the retirement
// pass (scripts/retire-non-events.js) writes beside a row it retires.
function nonEventRule(title) {
  if (typeof title !== "string" || !title || title.length > MAX_TITLE_LENGTH) return null;
  if (TITLE_PATTERNS[0].test(title)) return "closed_for_private_event";
  if (TITLE_PATTERNS[1].test(title)) return "suite_rental";
  if (isClosureNotice(title)) return "closure_notice";
  return null;
}

function isLikelyNotARealEvent({ title } = {}) {
  return nonEventRule(title) !== null;
}

module.exports = { isLikelyNotARealEvent, nonEventRule, TITLE_PATTERNS };
