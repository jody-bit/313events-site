// Step 2 shadow classifier fixtures: EI's Dearborn matches, the keyword false positives, and the non-Dearborn reconciliation.
"use strict";
const assert = require("assert");
const { classifyMeeting, categoryProvenance, auditRows } = require("../api/_lib/meeting-classifier");

const dearborn = (title, extra) => Object.assign({ title, source: "City of Dearborn", venue_name_raw: "Dearborn City Hall" }, extra);
const cls = (row, ctx) => classifyMeeting(row, ctx);

// Dearborn routine governing-body meetings -> administrative (D0)
["City Council Meeting", "Planning Commission", "Zoning Board of Appeals", "Pension Board", "Traffic Commission", "Housing Commission",
  "City Beautiful Commission", "DDA East Board", "Demolition Board of Appeals", "Hearing Officer", "Committee of the Whole", "Waiver Committee",
  "Board of Review", "Historical Commission", "Disability Commission", "Senior Commission", "Parks and Recreation Commission"].forEach((t) => {
  const c = cls(dearborn(t));
  assert.strictEqual(c.meeting_class, "administrative", t);
  assert.strictEqual(c.needs_review, false, t);
});
const cancelled = cls(dearborn("CANCELED: Demolition Board of Appeals"));
assert.strictEqual(cancelled.meeting_class, "administrative"); assert.strictEqual(cancelled.cancelled, true);

// Public engagement allowlist wins and is kept
["Public Hearing: Rezoning on Michigan Ave", "Town Hall with the Mayor", "Community Workshop: Master Plan", "Open House at City Hall", "Planning Commission Public Forum", "Listening Session on Parks"].forEach((t) => {
  assert.strictEqual(cls(dearborn(t)).meeting_class, "civic_public", t);
});

// Keyword false positives stay ordinary events
[{ title: "Authority Zero", source: "Ticketmaster" }, { title: "Authority Zero with Special Guests", source: "Resident Advisor" },
  { title: "Council House Rat Tour", source: "Detroit History Tours" }, { title: "Bagley Trunk or Treat", source: "Bagley Community Council" },
  { title: "Eastern Market AADHH Market", source: "Eastern Market Partnership" }].forEach((r) => {
  const c = cls(r);
  assert.strictEqual(c.meeting_class, "event", r.title); assert.strictEqual(c.needs_review, false, r.title);
});
assert.strictEqual(cls({ title: "Heritage Rooms Open House (Historical Commission)", source: "City of Madison Heights - Events" }).meeting_class, "civic_public");

// Non-Dearborn reconciliation (EI, 2026-10-17)
const richmond = cls({ title: "Recreation Board Meeting at 7pm", source: "Richmond Recreation Calendar", venue_name_raw: "City Council Chambers", description: "https://richmond.example/calendar" });
assert.strictEqual(richmond.meeting_class, "administrative");
const macombHoa = cls({ title: "Homeowners Association Meeting", source: "Macomb Township Events", venue_name_raw: "Macomb Township Hall", description: "https://macomb.example/calendar" });
assert.strictEqual(macombHoa.meeting_class, "event"); assert.strictEqual(macombHoa.needs_review, true, "unverified: review, never suppress");
const agm = cls({ title: "Annual General Meeting", source: "Downtown Windsor BIA", venue_name_raw: "Vito's on Ouellette", category: "nightlife", description: "For BIA members and merchants. Pre-registration through Eventbrite. Appetizers." });
assert.strictEqual(agm.meeting_class, "event"); assert.strictEqual(agm.needs_review, true); assert.strictEqual(agm.review_reason, "civic_meeting_ambiguous");
const bagley = cls({ title: "October 2026 General Meeting", source: "Bagley Community Council", venue_name_raw: "Neighborhood Home Base", description: "Monthly meeting. An important opportunity for community members to come together. Free." });
assert.strictEqual(bagley.meeting_class, "civic_public");

// A named body from a host that is not government is reviewed, not suppressed
const nonprofit = cls({ title: "Board of Directors Meeting", source: "Some Arts Nonprofit", venue_name_raw: "Studio" });
assert.strictEqual(nonprofit.meeting_class, "event"); assert.strictEqual(nonprofit.needs_review, true);

// Category is never evidence: a feed-default category is flagged as unreliable
const ctx = { feedDefaultCategory: "nightlife", extractCategory: () => null };
assert.strictEqual(categoryProvenance({ category: "nightlife", title: "Annual General Meeting" }, ctx), "feed_default");
assert.strictEqual(categoryProvenance({ category: "nightlife", title: "DJ Night" }, { feedDefaultCategory: "nightlife", extractCategory: () => "nightlife" }), "extracted");
assert.strictEqual(cls({ title: "Annual General Meeting", category: "nightlife", source: "Downtown Windsor BIA" }, ctx).category_provenance, "feed_default");
// an event category cannot rescue or damn a title
assert.strictEqual(cls(dearborn("City Council Meeting", { category: "music" })).meeting_class, "administrative");

// Live Production titles read 2026-10-17 (upcoming, not rejected, meeting-like words): the shadow result must not touch ordinary events
const live = [
  ["event", { title: "Altar Making Workshop", source: "Macomb Community College" }],
  ["event", { title: "Healthcare Apprenticeship Open House", source: "Macomb Community College" }],
  ["event", { title: "MAP+ Information Session, Fall 2026", source: "Macomb Community College" }],
  ["event", { title: "Creative Writers' Workshop", source: "Sterling Heights - Library" }],
  ["event", { title: "Board Gaming Meet-up", source: "Sterling Heights - Library" }],
  ["event", { title: "Halloween Parade - Evening Session", source: "Sterling Heights - Library" }],
  ["event", { title: "Seedlings Sessions after School", source: "Mount Clemens Public Library - Children's Events" }],
  ["event", { title: "Teen Advisory Board", source: "Mount Clemens Public Library - Teen Events" }],
  ["event", { title: "Vision Boarding", source: "Mount Clemens Public Library - Adult Events" }],
  ["event", { title: "Dog Obedience Class - Session 3", source: "Richmond Recreation Calendar" }],
  ["event", { title: "Sunday Sessions with David A-P", source: "MotorCity Wine (public Google Calendar)" }],
  ["event", { title: "Stitch Sessions: Beginner Crochet", source: "City of Livonia - Parks and Recreation" }],
  ["event", { title: "Mental Health Workshop @ The Congregation", source: "The Congregation" }],
  ["event", { title: "Wellness and Wisdom Speaker Series (Library Advisory Board)", source: "City of Madison Heights - Events" }],
  ["event", { title: "America 250 Backyard and Beyond Photo Exhibit Opening (Library & Arts Board)", source: "City of Madison Heights - Events" }],
  ["event", { title: "Five-Week Session Monday/Wednesday Swim Lessons Begins", source: "City of Dearborn" }],
  ["event", { title: "Session 2 Dearborn Specials Gym Night Begins", source: "City of Dearborn" }],
  ["event", { title: "RESCHEDULED:  ROot Out Invasives Workshop", source: "City of Royal Oak" }],
  ["administrative", { title: "Dix-Vernor Business District Improvement Authority Board Meeting", source: "City of Dearborn", venue_name_raw: "16901 Michigan Avenue, Dearborn" }],
  ["administrative", { title: "East Dearborn Downtown Development Authority Board Meeting (copy)", source: "City of Dearborn" }],
  ["administrative", { title: "Joint DDA Executive Committee Meeting", source: "City of Dearborn" }],
  ["administrative", { title: "Mayor Hammoud's Briefing Session", source: "City of Dearborn" }],
  ["administrative", { title: "Disability Commission Meets", source: "City of Dearborn" }],
  ["administrative", { title: "Parks & Recreation Commission Meets", source: "City of Dearborn" }],
  ["administrative", { title: "Senior Citizen Commission Meets", source: "City of Dearborn" }],
  ["administrative", { title: "Senior Citizens Commission", source: "City of Dearborn" }],
  ["civic_public", { title: "Fire Department Open House", source: "City of Dearborn" }],
];
live.forEach(([want, r]) => {
  const c = cls(r);
  const label = r.title + " => " + c.meeting_class;
  if (want === "civic_public") assert.ok(c.meeting_class === "civic_public" || c.meeting_class === "event", label);
  else assert.strictEqual(c.meeting_class, want, label);
  if (want === "event") assert.strictEqual(c.needs_review, false, label);
});

// purity + audit
const rows = [dearborn("City Council Meeting"), { title: "Authority Zero", source: "Ticketmaster" }, { title: "Annual General Meeting", source: "Downtown Windsor BIA" }];
const snapshot = JSON.stringify(rows);
const a = auditRows(rows);
assert.deepStrictEqual([a.counts.administrative, a.counts.event, a.counts.needs_review], [1, 2, 1]);
assert.strictEqual(JSON.stringify(rows), snapshot, "input rows are not mutated");
console.log("PASS: meeting classifier");
