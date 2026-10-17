// api/_lib/meeting-classifier.js
//
// Pipeline Step 2, SHADOW MODE (owner decisions D0 and the Step 2 GO, 2026-10-17). A pure function that says whether a row
// is an ordinary event, a public civic occasion, or a routine administrative meeting. It is not wired into any publication,
// queue or suppression path: nothing calls it yet but its test. It stores nothing and changes no row.
//
// meeting_class:
//   event          anything that is not a meeting, and every ambiguous case (ambiguity is never a reason to suppress)
//   civic_public   public hearings, town halls, community workshops, open houses, forums, listening sessions, and open
//                  community meetings: kept and publishable
//   administrative routine government/administrative meetings (council, planning commission, recreation board, committees):
//                  per D0 these are excluded from the public calendar, with the record preserved and the reason stored
//
// needs_review is true for a row that looks like a meeting but cannot be classified on evidence (unknown host, closed or
// member-only wording, no body named). Such a row goes to a person; it is never suppressed.
//
// Evidence used: title, venue, source name, description. NEVER category: feed connectors fall back to the feed's default
// category when the keyword extractor matches nothing (Windsor BIA stored "Annual General Meeting" as nightlife), so a stored
// category is not evidence unless categoryProvenance() says it was extracted.
"use strict";

const CLASSES = ["event", "civic_public", "administrative"];

// Public-engagement allowlist. It wins over a body word in the same title ("Public Hearing: Planning Commission").
// "Hearing Officer" is an administrative role, not a public hearing.
const PUBLIC_ENGAGEMENT = /\b(public hearing|town hall|community workshop|public workshop|workshop|open house|community forum|public forum|forum|listening session|public input|public comment session|community conversation|community meeting|neighborhood meeting|ribbon[- ]cutting|public information (?:session|meeting))\b/i;
// An allowlisted engagement format counts as a civic occasion only with a civic cue; a craft "workshop" or a program "open house"
// is just an ordinary event and stays one.
const CIVIC_CUE = /\b(public|town hall|community|hearing|forum|listening|input|city|mayor|council|commission|planning|zoning|master plan|township|county|historical commission)\b/i;
const HEARING_OFFICER = /\bhearing officer\b/i;

// Words that make a title an event even when it also contains a body or meeting word.
const EVENT_WORDING = /\b(festival|concert|haunted|trunk or treat|tour|market|fair|parade|party|tournament|bingo|dance|5k|walk\/run|run\b|gala|fundraiser|show|performance|screening|class|camp|lights|swim|craft|book sale|storytime|story time|game night|trivia|karaoke|brunch|expo|rat tour|symphony|orchestra|band|exhibit)\b/i;

const MEETING_WORD = /\b(meeting|session|work session|study session|hearing|agenda|regular|special meeting|committee of the whole)\b/i;
// A named governing or advisory body. Deliberately a list of body nouns bound to a qualifier or a known name, so a bare
// word such as "Authority" in a band name, or "Council House" in a tour title, does not match.
const BODY = /\b(city council|common council|village council|town council|township board|board of trustees|board of review|board of education|board of appeals?|zoning board(?: of appeals?)?|planning commission|planning board|pension board|library board|recreation board|briefing session|business district improvement authority|parks? (?:(?:and|&) recreation )?(?:board|commission)|(?:historical|historic|disability|senior|housing|traffic|ethics|election|civil service|beautification|city beautiful|shade tree|arts|human relations|environmental|youth|planning|zoning) (?:commission|committee|board)|committee of the whole|waiver committee|hearing officer|downtown development authority|dda\b|business improvement (?:district|authority|area)|bia board|brownfield (?:redevelopment )?authority|housing commission|building authority|board of directors)\b/i;

// Host evidence: a government or civic body, from the feed's source name or the venue.
const GOV_SOURCE = /\b(city of|township of|village of|county|township|library|dda|downtown development authority|municipal|public schools)\b/i;
const GOV_VENUE = /\b(city hall|town hall|council chambers?|municipal (?:building|center)|township hall|civic center|commission room|board room)\b/i;

// Invitations that show a meeting is open to the community (not a closed or member-only session).
const OPEN_INVITE = /\b(open to (?:the )?(?:public|community|everyone)|community members|all (?:are|residents are) welcome|free and open|public is (?:invited|welcome)|everyone is welcome|residents? (?:are )?(?:invited|encouraged))\b/i;
const CLOSED_INVITE = /\b(members? (?:only|and merchants)|for (?:bia )?members|members and|invitation only|by invitation|pre-?registration|closed session|executive session|rsvp required)\b/i;

function clean(s) {
  return String(s || "").replace(/^\s*(cancell?ed|postponed|rescheduled)\s*[-:]\s*/i, "").replace(/\s+/g, " ").trim();
}

function categoryProvenance(row, ctx = {}) {
  const category = row && row.category;
  if (!category) return "unknown";
  if (ctx.feedDefaultCategory && category === ctx.feedDefaultCategory) {
    if (typeof ctx.extractCategory === "function") {
      const extracted = ctx.extractCategory(row.title, row.description);
      return extracted ? "extracted" : "feed_default";
    }
    return "unknown"; // equals the feed default and nothing can prove it was extracted
  }
  return "unknown";
}

function result(meeting_class, rule, extra = {}) {
  return Object.assign({ meeting_class, needs_review: false, rule, review_reason: null, cancelled: false }, extra);
}

function classifyMeeting(row, ctx = {}) {
  const raw = String((row && row.title) || "");
  const cancelled = /^\s*(cancell?ed|postponed)\b/i.test(raw) || /\b(cancell?ed|postponed)\s*$/i.test(raw);
  const title = clean(raw);
  const desc = String((row && row.description) || "");
  const source = String((row && row.source) || "");
  const venue = String((row && row.venue_name_raw) || "");
  const catProv = categoryProvenance(row, ctx);
  const done = (r) => Object.assign(r, { cancelled, category_provenance: catProv });

  if (!title) return done(result("event", "no-title"));

  const isHearingOfficer = HEARING_OFFICER.test(title);
  if (PUBLIC_ENGAGEMENT.test(title) && !isHearingOfficer) {
    if (BODY.test(title) || CIVIC_CUE.test(title)) return done(result("civic_public", "public-engagement-allowlist"));
    return done(result("event", "engagement-format-without-civic-cue"));
  }
  if (EVENT_WORDING.test(title) && !BODY.test(title)) return done(result("event", "event-wording"));
  if (EVENT_WORDING.test(title) && BODY.test(title) && !MEETING_WORD.test(title)) return done(result("event", "event-wording-with-body-name"));

  const bodyHit = BODY.test(title);
  const meetingHit = MEETING_WORD.test(title);
  const govHost = GOV_SOURCE.test(source) || GOV_VENUE.test(venue);

  if (bodyHit && (meetingHit || /^[^.]{0,80}$/.test(title)) && govHost) {
    return done(result("administrative", "named-body-government-host"));
  }
  if (bodyHit && !govHost) {
    return done(result("event", "named-body-unknown-host", { needs_review: true, review_reason: "civic_meeting_ambiguous" }));
  }
  if (meetingHit && /\bmeeting\b/i.test(title)) {
    // "Meeting" with no named government body: community, association or member meetings. Open invitation = public; closed = review.
    if (OPEN_INVITE.test(desc) && !CLOSED_INVITE.test(desc)) return done(result("civic_public", "open-community-meeting"));
    return done(result("event", "meeting-word-unclassified", { needs_review: true, review_reason: "civic_meeting_ambiguous" }));
  }
  return done(result("event", "not-a-meeting"));
}

// Shadow audit over rows: counts per class and the rows a person must look at. Never mutates input.
function auditRows(rows, ctxFor = () => ({})) {
  const counts = { event: 0, civic_public: 0, administrative: 0, needs_review: 0 };
  const out = (rows || []).map((r) => {
    const c = classifyMeeting(r, ctxFor(r));
    counts[c.meeting_class]++;
    if (c.needs_review) counts.needs_review++;
    return { id: r.id, title: r.title, ...c };
  });
  return { counts, rows: out };
}

module.exports = { CLASSES, classifyMeeting, categoryProvenance, auditRows };
