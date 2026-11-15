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
// GOVERNANCE MEETINGS (Product Owner policy, 2026-11-15: "city commission / governance meetings: we do not want
// them; purge the site of all those types"). Replaces the earlier exemption that left a public body's own meeting to
// a later owner decision. The rule is title-only and narrow, the same "never hide a real event" posture:
//   <a public body or association> ... meeting | hearing | session   -- and nothing after that word
// where the body is a council, commission, committee, board, authority, trustees, zoning/planning/appeals/review,
// ethics, pension, DDA/BIA, HOA or association. Also a bare "Public/Budget/Zoning/Planning Hearing", and a
// "General/Membership Meeting" (the title ends there, so "General Meeting Potluck" is not matched).
// NOT matched: a title that goes on after the meeting word ("Historical Commission Open House", "Council Meeting
// Night Comedy Show"), any title carrying an event word (concert, festival, tour, party, game, trunk or treat...),
// and an artist or program named for a body ("The Board - Live at ...", "Council of Elders: Concert"). Whole-site
// cleanup of rows already stored is NOT done here (the owner's guarded cleanup already ran; never rerun).
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

// A venue's own label for a closed rental: the WHOLE title is "[CODE:] PRIVATE [CLOSED] EVENT" or "[CODE] PRIVATE PARTY", where CODE is
// the renter's short upper-case tag (HALO Detroit publishes "NACD: PRIVATE CLOSED EVENT", "MCJ PRIVATE EVENT"). Confirmed live
// 2026-10-23. The tag is matched case-sensitively and must be 2-6 upper-case letters or digits that are not a little word, so
// "The Private Event" (a play or a band) and "Our Private Party" are not matched; nothing before "private" other than that tag, and
// nothing after "event" or "party", is allowed.
const PRIVATE_LABEL_TAG = /^\W*([A-Z0-9]{2,6})\s*:?\s+(.+?)\W*$/;
const PRIVATE_LABEL_BODY = /^private(?:,)?\s+(?:closed\s+)?event$|^private\s+party$/i;
const PRIVATE_TAG_STOPWORDS = new Set(["THE", "OUR", "MY", "AND", "FOR", "A", "AN", "THIS", "YOUR", "ONE", "NO", "ANY"]);
function isPrivateLabel(title) {
  const bare = title.replace(/^\W+|\W+$/g, "");
  if (PRIVATE_LABEL_BODY.test(bare)) return true; // the whole title is the label
  const m = PRIVATE_LABEL_TAG.exec(title);
  if (!m || PRIVATE_TAG_STOPWORDS.has(m[1])) return false;
  return PRIVATE_LABEL_BODY.test(m[2].trim());
}

// ---- governance meetings ------------------------------------------------------------------------------------------
const GOV_BODY = /\b(?:council|commissions?|commissioners|committees?|authority|board|trustees|zoning|planning|appeals|ethics|pension|dda|bia|hoa|homeowners|association)\b/i;
const MEETING_TAIL = /\b(?:meeting|hearing|session)s?(?:\s+(?:agenda|minutes|notice))?$/i;
const GOV_EVENT_WORDS = /\b(?:concert|festival|fest|tour|party|show|live|music|tickets?|performance|market|fair|parade|trunk|treat|games?|night|dinner|gala|fundrais\w*|open house|workshop|class|camp|tasting|brunch|lunch|potluck|raffle|celebration|ceremony|reception|exhibit\w*|cruise)\b/i;
const BARE_HEARING = /^(?:(?:public|budget|zoning|planning|tax|millage|special|truth in taxation)\s+)+hearings?(?:\s*[:\-\u2013]\s*.{1,80}|\s+(?:on|for|regarding)\b.{0,60})?$/iu;
const GENERAL_MEETING = /^(?:(?:[\p{L}\p{N}']+\s+){0,5})?(?:general|membership)\s+meeting$/iu;
// A bare formal body name as the whole title ("Zoning Board of Appeals", "Planning Commission"); NOT a bare "Council"/"Board".
const BODY_NAME_ONLY = /^(?:(?:[\p{L}'&]+\s+){1,5}(?:commission|committee|commissioners)|committee of the whole|hearing officer|board of review|(?:library|recreation|parks|school|zoning|planning|housing|water|police|fire|airport|transit|hospital|historic|historical|dda(?: [\p{L}]+)?) board|dda(?: [\p{L}]+)? board)$/iu;
const BODY_ONLY = /^(?:(?:city|town|village|township|county|[\p{L}]+)\s+){0,3}(?:zoning board(?: of appeals)?|board of (?:trustees|education|review|appeals|commissioners|ethics|zoning appeals)|planning (?:commission|board)|(?:ethics|pension|review|appeals) (?:board|commission|committee)|city council|town council|village council|township board)$/iu;
// Drop a trailing clock time or "(...)" note, which are not part of the title's meaning.
const stripTail = (t) => t.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a|p)\.?m\.?$/i, "").replace(/[\s.!:,-]+$/, "").trim();
// "[Regular|Special|Joint ...] Meeting/Session/Hearing of the <body>" and "Work Session: <body>" forms.
const MEETING_WORD = "(?:meetings?|hearings?|sessions?|work sessions?|study sessions?)";
const MEETING_QUALIFIER = "(?:(?:regular|special|joint|annual|emergency|work|study|budget|public|organizational|rescheduled)\\s+)*";
const OF_FORM = new RegExp(`^${MEETING_QUALIFIER}${MEETING_WORD}\\s+of\\s+(?:the\\s+)?(.+)$`, "i");
const LEADING_MEETING = new RegExp(`^${MEETING_QUALIFIER}${MEETING_WORD}\\s*[:\\-\\u2013\\u2014]\\s*(.+)$`, "i");
const TRAILING_STATUS = /\s*[-\u2013\u2014:]\s*(?:cancell?ed|rescheduled|postponed|agenda|minutes|notice|budget|virtual|zoom|livestream|live stream|special|regular)\s*$/i;
function isGovernanceMeeting(title) {
  let t = stripTail(title.trim().replace(/^(?:cancell?ed|rescheduled|postponed)\s*[:\-\u2013\u2014]\s*/i, ""));
  for (let i = 0; i < 2; i++) t = stripTail(t.replace(TRAILING_STATUS, ""));
  if (!t || GOV_EVENT_WORDS.test(t) || /^(?:meet|join|visit|about|with|vote|attend|support|tour|learn)\b/i.test(t)) return false;
  if (BARE_HEARING.test(t)) return true;
  if (GENERAL_MEETING.test(t)) return true;
  const of = OF_FORM.exec(t);
  if (of && GOV_BODY.test(of[1])) return true;
  const lead = LEADING_MEETING.exec(t);
  if (lead && (BODY_ONLY.test(lead[1].trim()) || BODY_NAME_ONLY.test(lead[1].trim()) || (GOV_BODY.test(lead[1]) && MEETING_TAIL.test(lead[1].trim())))) return true;
  if (BODY_ONLY.test(t) || BODY_NAME_ONLY.test(t)) return true;
  return GOV_BODY.test(t) && MEETING_TAIL.test(t);
}

// Which rule a title matches, or null. The names are what the retirement
// pass (scripts/retire-non-events.js) writes beside a row it retires.
function nonEventRule(title) {
  if (typeof title !== "string" || !title || title.length > MAX_TITLE_LENGTH) return null;
  if (TITLE_PATTERNS[0].test(title)) return "closed_for_private_event";
  if (TITLE_PATTERNS[1].test(title)) return "suite_rental";
  if (isPrivateLabel(title)) return "private_event_label";
  if (isClosureNotice(title)) return "closure_notice";
  if (isGovernanceMeeting(title)) return "governance_meeting";
  return null;
}

function isLikelyNotARealEvent({ title } = {}) {
  return nonEventRule(title) !== null;
}

module.exports = { isLikelyNotARealEvent, nonEventRule, TITLE_PATTERNS };
