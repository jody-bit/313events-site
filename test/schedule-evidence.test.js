// test/schedule-evidence.test.js — Stage 1 schedule-evidence extraction and decision rules (pure, no network).
// FIXTURE TEXT IS SYNTHETIC: written to mimic the shape of the Erebus sources (hours list, season sentence, dark-day sentence).
// It is not a copy of any page. Run: node test/schedule-evidence.test.js
"use strict";
const assert = require("assert");
const se = require("../api/_lib/schedule-evidence");

const HOURS_TEXT = `Hours:
Monday – Thursday: 7:30 PM – 10:30 PM
Friday: 7:00 PM – 12:00 AM (Midnight)
Saturday: 6:00 PM – 12:00 AM (Midnight)
Sunday: 6:00 PM – 11:00 PM
Season Dates: September 18, 2026 – November 7, 2026`;
const MEDIA_TEXT = `Erebus in Pontiac opens on Friday, Sept. 18. It is open on weekends through September. From Thursday, Oct. 1, it runs every day through Nov. 7. Dark days: Oct. 5-6, Oct. 12, Oct. 19 and Nov. 2-5.`;
const Y = 2026;

// 1. season, hours, closures extract with quotes; no quote means no value
{
  const s = se.extractSeasonRange(HOURS_TEXT, Y);
  assert.deepStrictEqual([s.start, s.end], ["2026-09-18", "2026-11-07"]);
  assert.ok(s.quote.includes("September 18"));
  const h = se.extractWeeklyHours(HOURS_TEXT);
  assert.strictEqual(h.byDay[1], "7:30 PM-10:30 PM");
  assert.strictEqual(h.byDay[4], "7:30 PM-10:30 PM");
  assert.strictEqual(h.byDay[5], "7:00 PM-12:00 AM");
  assert.strictEqual(h.byDay[6], "6:00 PM-12:00 AM");
  assert.strictEqual(h.byDay[0], "6:00 PM-11:00 PM");
  const c = se.extractClosedDates(MEDIA_TEXT, Y);
  assert.deepStrictEqual(c.dates, ["2026-10-05", "2026-10-06", "2026-10-12", "2026-10-19", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
  assert.ok(c.quote.includes("Dark days"));
  assert.strictEqual(se.extractSeasonRange("Open nightly in fall.", Y), null);
  assert.strictEqual(se.extractWeeklyHours("Call for hours."), null);
  assert.strictEqual(se.extractClosedDates("Open every night.", Y), null);
  assert.strictEqual(se.extractWeeklyHours("Friday: 7:00 PM"), null, "a single time is not a range of hours");
}
console.log("PASS: 1. extractors return quoted values and nothing without a quote");

// 2. blocked / failed pages never become evidence and are reported as blocked
{
  const pages = [
    se.extractFromPage({ url: "https://example.org/a", tier: "official", blocked: "robots" }, Y),
    se.extractFromPage({ url: "https://example.org/b", tier: "official", blocked: "dynamic" }, Y),
    se.extractFromPage({ url: "https://example.org/c", tier: "media", retrieved_at: "2026-10-18T14:40:00Z", text: MEDIA_TEXT }, Y),
  ];
  const r = se.proposeSchedule({ pages, stored: {}, internalNote: "" });
  assert.deepStrictEqual(r.blocked.map((b) => b.reason), ["robots", "dynamic"]);
  assert.ok(r.proposed.closed_dates, "the readable media page still yields evidence");
  assert.ok(r.unsupported.includes("weekly_hours"), "no hours evidence stays unsupported, not guessed");
}
console.log("PASS: 2. a blocked page is reported blocked and does not stop other sources");

// 3. the Erebus shape: season from three pages is high confidence; hours are advertised, not confirmed dates
{
  const pages = [
    se.extractFromPage({ url: "https://dir.example/erebus", tier: "directory", retrieved_at: "t1", text: HOURS_TEXT }, Y),
    se.extractFromPage({ url: "https://tv.example/roundup", tier: "media", retrieved_at: "t2", text: "Erebus runs Sept. 18 through Nov. 7. " + MEDIA_TEXT }, Y),
    se.extractFromPage({ url: "https://mag.example/list", tier: "media", retrieved_at: "t3", text: "Erebus: Sept. 18 to Nov. 7." }, Y),
  ];
  const r = se.proposeSchedule({ pages, stored: {}, internalNote: "" });
  assert.strictEqual(r.conflicts.length, 0);
  assert.deepStrictEqual(r.proposed.season.value, { start: "2026-09-18", end: "2026-11-07" });
  assert.strictEqual(r.proposed.season.confidence, "high");
  assert.strictEqual(r.proposed.weekly_hours.kind, "advertised_hours");
  assert.strictEqual(r.proposed.weekly_hours.confidence, "medium");
  assert.ok(r.proposed.closed_dates.evidence.every((e) => e.url && e.quote && e.retrieved_at));
}
// known limit: an opening date and a closing date in separate sentences are not joined into a season
// 3b. opening and closing in separate sentences (WXYZ-style wording) are joined, with the spanning quote
{
  const sp = se.extractSeasonRange(MEDIA_TEXT, Y);
  assert.deepStrictEqual([sp.start, sp.end], ["2026-09-18", "2026-11-07"]);
  assert.ok(sp.quote.startsWith("opens on Friday, Sept. 18") && sp.quote.endsWith("through Nov. 7"));
  assert.strictEqual(se.extractSeasonRange("Erebus opens Friday, Sept. 18. Tickets online.", Y), null, "no closing date, no season");
  assert.strictEqual(se.extractSeasonRange("Erebus runs daily through Nov. 7.", Y), null, "no opening date, no season");
  assert.strictEqual(se.extractSeasonRange("Opens Sept. 18. " + "x".repeat(450) + " through Nov. 7", Y), null, "closing date too far from the opening date");
  assert.strictEqual(se.extractSeasonRange("Opens Nov. 7 and runs through Sept. 18", Y), null, "end before start is refused");
}
console.log("PASS: 3. season corroboration sets confidence; hours stay advertised hours");

// 4. disagreement is one conflict with both quotes, nothing chosen
{
  const a = se.extractFromPage({ url: "https://a.example", tier: "official", text: "Season: Sept. 18 – Nov. 7" }, Y);
  const b = se.extractFromPage({ url: "https://b.example", tier: "media", text: "Open Sept. 25 to Nov. 7" }, Y);
  const r = se.proposeSchedule({ pages: [a, b], stored: {}, internalNote: "" });
  assert.strictEqual(r.conflicts.length, 1);
  assert.strictEqual(r.conflicts[0].field, "season");
  assert.strictEqual(r.conflicts[0].candidates.length, 2);
  assert.ok(!r.proposed.season, "a conflicting field is not proposed");
}
console.log("PASS: 4. conflicting sources produce one conflict and no value");

// 5. stronger stored value wins: OWNER-CORRECTION > verified/manual > tier
{
  const page = se.extractFromPage({ url: "https://tv.example", tier: "media", text: "Season: Sept. 18 – Nov. 7" }, Y);
  const owner = se.proposeSchedule({ pages: [page], stored: { season: { value: { start: "2026-09-20", end: "2026-11-07" }, rank_source: "owner_correction" } }, internalNote: "" });
  assert.ok(owner.kept.some((k) => k.field === "season") && !owner.proposed.season);
  const verified = se.proposeSchedule({ pages: [page], stored: { season: { value: {}, rank_source: "verified" } }, internalNote: "" });
  assert.ok(!verified.proposed.season);
  const weakerTier = se.proposeSchedule({ pages: [page], stored: { season: { value: {}, rank_source: "tier", tier: "official" } }, internalNote: "" });
  assert.ok(!weakerTier.proposed.season, "an official stored value outranks media evidence");
  const lowerStored = se.proposeSchedule({ pages: [page], stored: { season: { value: {}, rank_source: "tier", tier: "directory" } }, internalNote: "" });
  assert.ok(lowerStored.proposed.season, "media evidence replaces a directory-tier stored value");
  const blankStored = se.proposeSchedule({ pages: [page], stored: { season: { value: null } }, internalNote: "" });
  assert.ok(blankStored.proposed.season, "a blank stored value is filled");
  assert.ok(se.rankOf({ rank_source: "owner_correction" }) > se.rankOf({ rank_source: "verified" }));
  assert.ok(se.rankOf({ rank_source: "manual" }) > se.rankOf({ rank_source: "tier", tier: "official" }));
}
console.log("PASS: 5. stronger stored values are kept");

// 6. an OWNER-CORRECTION line on time_display locks weekly hours
{
  // built by hand in the documented shape so the test runs on main before #210 (which adds buildOwnerCorrectionLine)
  const line = 'OWNER-CORRECTION 2026-10-18T10:00:00.000Z e1 fields=time_display | {"actor":"admin","changes":[{"f":"time_display","b":"7:00 PM","a":"7:30 PM"}]}';
  assert.ok(se.lockedByOwner(line, "time_display"));
  const page = se.extractFromPage({ url: "https://d.example", tier: "directory", text: HOURS_TEXT }, Y);
  const r = se.proposeSchedule({ pages: [page], stored: {}, internalNote: line });
  assert.ok(r.kept.some((k) => k.field === "weekly_hours" && /OWNER-CORRECTION/.test(k.reason)));
  assert.ok(!r.proposed.weekly_hours);
}
console.log("PASS: 6. OWNER-CORRECTION lock is honoured");

// 7. calendar: closures override recurring hours; Erebus Oct 18-Nov 7 gives 21 days, 5 closed, 16 open
{
  const h = se.extractWeeklyHours(HOURS_TEXT).byDay;
  const closed = se.extractClosedDates(MEDIA_TEXT, Y).dates;
  const cal = se.buildCalendar({ season: { start: "2026-09-18", end: "2026-11-07" }, weeklyHours: h, closedDates: closed, from: "2026-10-18" });
  assert.strictEqual(cal.length, 21);
  assert.strictEqual(cal.filter((d) => !d.open).length, 5);
  assert.strictEqual(cal.filter((d) => d.open).length, 16);
  const by = Object.fromEntries(cal.map((d) => [d.date, d]));
  assert.strictEqual(by["2026-10-18"].hours, "6:00 PM-11:00 PM");   // Sunday
  assert.strictEqual(by["2026-10-19"].open, false);                  // Monday, dark
  assert.strictEqual(by["2026-10-20"].hours, "7:30 PM-10:30 PM");  // Tuesday
  assert.strictEqual(by["2026-10-23"].hours, "7:00 PM-12:00 AM");  // Friday
  assert.strictEqual(by["2026-10-24"].hours, "6:00 PM-12:00 AM");  // Saturday
  assert.deepStrictEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((d) => by[d].open), [false, false, false, false]);
  assert.strictEqual(by["2026-11-07"].hours, "6:00 PM-12:00 AM");  // Saturday
  assert.deepStrictEqual(se.buildCalendar({ season: null, weeklyHours: h }), [], "no season, no calendar");
  const partial = se.buildCalendar({ season: { start: "2026-10-19", end: "2026-10-20" }, weeklyHours: { 2: "7:30 PM-10:30 PM" } });
  assert.deepStrictEqual(partial.map((d) => d.date), ["2026-10-20"], "a weekday with no stated hours is left out, never defaulted");
}
console.log("PASS: 7. closures override recurring hours; Erebus calendar matches the approved 21/5/16");

// 8. output shape matches the seasonal entry `schedule` object (Experience, PR #214)
{
  const pages = [
    se.extractFromPage({ url: "https://dir.example/erebus", tier: "directory", retrieved_at: "2026-10-18", text: HOURS_TEXT }, Y),
    se.extractFromPage({ url: "https://tv.example/roundup", tier: "media", retrieved_at: "2026-10-18", text: "Erebus runs Sept. 18 through Nov. 7. " + MEDIA_TEXT }, Y),
  ];
  const sch = se.toEntrySchedule(se.proposeSchedule({ pages, stored: {}, internalNote: "" }));
  assert.deepStrictEqual(sch.season, { start: "2026-09-18", end: "2026-11-07", timezone: "America/Detroit" });
  assert.deepStrictEqual(sch.weeklyHours, { sun: "6:00 PM-11:00 PM", mon: "7:30 PM-10:30 PM", tue: "7:30 PM-10:30 PM", wed: "7:30 PM-10:30 PM", thu: "7:30 PM-10:30 PM", fri: "7:00 PM-12:00 AM", sat: "6:00 PM-12:00 AM" });
  assert.deepStrictEqual(sch.darkDays, ["2026-10-05", "2026-10-06", "2026-10-12", "2026-10-19", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
  assert.strictEqual(sch.explicitClosuresOverrideHours, true);
  assert.deepStrictEqual(Object.keys(sch.provenance).sort(), ["darkDays", "season", "weeklyHours"]);
  assert.ok(sch.provenance.season.sources.length === 2 && sch.provenance.season.retrievedAt === "2026-10-18");
  assert.deepStrictEqual(se.toEntrySchedule({ proposed: {} }), { explicitClosuresOverrideHours: true, provenance: {} }, "no evidence, no fields");
}
console.log("PASS: 8. proposal maps to the seasonal entry schedule shape");
