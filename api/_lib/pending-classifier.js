// api/_lib/pending-classifier.js
//
// Stage 2 of the admin queue modernization (owner decisions 2026-10-16). READ-SIDE ONLY: classifies a pending_review
// event row into a class so the admin Event submissions tab can group it. It never changes a status, never rejects,
// and never hides a row: every row keeps its Approve and Reject buttons, and a class can be changed without a migration.
//
// Classes (the rules are deterministic and tested against the real upcoming City of Dearborn titles, 2026-10-16):
//   civic_meeting  governing-body and advisory meetings. Legitimate public meetings: kept, grouped under
//                  "Civic & Community", never treated as entertainment and never auto-rejected.
//   observance     calendar observances and holidays (Diwali, Kwanzaa, Daylight Saving Time...), not moderation tasks.
//   service        recurring public services (food distribution, DPW yard days...).
//   public_event   events and programs a person decides to publish or hold.
//   ambiguous      notices and unclear rows. Reviewed individually.
// A cancelled meeting stays a civic_meeting with cancelled=true.
"use strict";

const CLASSES = ["public_event", "civic_meeting", "service", "observance", "ambiguous"];
const CLASS_LABELS = {
  public_event: "Events and programs",
  civic_meeting: "Civic & Community: public meetings",
  service: "Community services",
  observance: "Calendar observances",
  ambiguous: "Needs a closer look",
};

const MEETING = /\b(board|commission|committee|council|authority|hearing officer|briefing session|federation of neighborhood associations|zoning|waiver committee|dda|meeting|meets)\b/i;
// Words that make a title an event even when it also contains a meeting-ish word (none today; kept explicit for tests).
const OBSERVANCE = /\b(daylight saving|diwali|hanukkah|kwanzaa|winter begins|pearl harbor|national day of|small business saturday|early warning siren)\b/i;
const SERVICE = /\b(food pantry|food distribution|liquid nutrition|surplus food|yard open|drop-off day)\b/i;
const NOTICE = /\b(reservations open|nominations due|winter hours)\b/i;
const EVENTISH = /\b(festival|concert|haunted|nutcracker|tournament|craft|lecture|open house|book sale|ceremony|bingo|dance|walk\/run|5k|art daze|specials|camp dearborn|lights|swim|basketball|gym night|market|spruce up|party|band|symphony)\b/i;
const EVENT_CATEGORIES = new Set(["music", "fest", "dance", "nightlife", "vendor", "sports", "arts", "theater", "comedy", "food-event"]);

function classifyPendingRow(row) {
  const title = String((row && row.title) || "").trim();
  const category = String((row && row.category) || "").toLowerCase();
  const cancelled = /^\s*(cancell?ed|postponed)\b/i.test(title) || /\b(cancell?ed|postponed)\s*$/i.test(title);
  const bare = title.replace(/^\s*(cancell?ed|postponed)\s*[-:]\s*/i, "");

  if (MEETING.test(bare) && !EVENTISH.test(bare)) return { class: "civic_meeting", reason: "governing-body or advisory meeting title", cancelled };
  if (OBSERVANCE.test(bare)) return { class: "observance", reason: "calendar observance title", cancelled };
  if (SERVICE.test(bare)) return { class: "service", reason: "recurring public service title", cancelled };
  if (NOTICE.test(bare)) return { class: "ambiguous", reason: "notice or deadline, not a scheduled public activity", cancelled };
  if (EVENTISH.test(bare) || EVENT_CATEGORIES.has(category)) return { class: "public_event", reason: "event or program wording or category", cancelled };
  const venue = String((row && row.venue_name_raw) || "").trim();
  if (venue && !/^(venue )?(tba|tbd)$/i.test(venue)) return { class: "public_event", reason: "has a venue and no other class matched", cancelled };
  return { class: "ambiguous", reason: "no venue and no recognised wording", cancelled };
}

// Annotates rows with { queue_class } and returns counts per class. Never drops or reorders rows.
function classifyRows(rows) {
  const counts = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const out = (rows || []).map((r) => {
    const q = classifyPendingRow(r);
    counts[q.class]++;
    return Object.assign({}, r, { queue_class: q });
  });
  return { events: out, class_counts: counts };
}

module.exports = { classifyPendingRow, classifyRows, CLASSES, CLASS_LABELS };
