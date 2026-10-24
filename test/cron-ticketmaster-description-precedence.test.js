// test/cron-ticketmaster-description-precedence.test.js — owner direction 2026-10-24: a generic research-written biography
// must not outrank Ticketmaster's own event text; approved copy and stronger facts are protected; the default mode only reports.
// Run: node test/cron-ticketmaster-description-precedence.test.js
"use strict";
const assert = require("assert");
const { isGenericBiography, decideEventSpecificDescription: decide } = require("../api/_lib/description-strength");
const { world, json, runConnector, byId } = require("./fixtures/connector-harness.js");

const TM_URL = "https://app.ticketmaster.com/discovery/v2/events.json";
const tmEvent = (id, name, extra) => ({
  id, name, url: `https://www.ticketmaster.com/event/${id}`,
  classifications: [{ segment: { name: "Music" }, genre: { name: "Hip-Hop" } }],
  dates: { start: { localDate: "2026-10-09", localTime: "19:30:00" }, status: { code: "onsale" } },
  images: [{ ratio: "16_9", url: `https://s1.ticketm.net/dam/a/${id}.jpg`, width: 1024, height: 576 }],
  priceRanges: [{ min: 35, max: 120 }],
  _embedded: { venues: [{ name: "Fixture Hall", city: { name: "Detroit" }, address: { line1: "2115 Woodward Ave" }, location: { latitude: "42.3387", longitude: "-83.0524" } }] },
  ...extra,
});
const stored = (id, extra) => ({ id: `row-${id}`, external_id: id, title: "stored", category: "music", start_date: "2026-10-09", status: "approved", source: "Ticketmaster", time_display: "8:00 PM", description: null, description_source: null, ...extra });
const upstreamOf = (events) => (url) => (url.startsWith(TM_URL) ? json({ _embedded: { events }, page: { totalPages: 1 } }) : null);

const BIO = "Vince Staples is a Grammy-nominated rapper known for his sharp storytelling and distinctive sound.";
const INFO = "Cry Baby Tour with special guest DUCKWRTH. Doors 7 PM, all ages. Vince Staples brings the tour to Detroit.";
const MANUAL = "Editor-approved copy about this specific night, its guests and what to expect from the evening.";
const ANDREA = "Andrea Gibson reads from their new collection for an evening of poems about grief, love and staying; the show includes a Q&A and a signing in the lobby afterward.";

(async () => {
  // detector: generic biographies match; concrete or long event-specific text does not
  assert.strictEqual(isGenericBiography(BIO), true);
  assert.strictEqual(isGenericBiography(ANDREA), false, "event-specific research text is not generic");
  assert.strictEqual(isGenericBiography("Known for hits, plays with support from Foo on Oct 30 at 8 PM."), false, "dates, times and support acts are facts");
  assert.strictEqual(isGenericBiography(""), false);

  // decisions
  assert.strictEqual(decide({ stored: BIO, storedSource: null, incoming: INFO, title: "Vince Staples" }).action, "replace");
  assert.strictEqual(decide({ stored: BIO, storedSource: "research_unsourced", incoming: INFO, title: "x" }).action, "replace");
  assert.strictEqual(decide({ stored: MANUAL, storedSource: "manual", incoming: INFO, title: "x" }).action, "keep");
  assert.strictEqual(decide({ stored: ANDREA, storedSource: null, incoming: INFO, title: "x" }).action, "keep", "research text that is not a generic biography is preserved");
  assert.strictEqual(decide({ stored: "Source text A, event specific and long enough to read as a description.", storedSource: "authoritative", incoming: INFO, title: "x" }).action, "keep");
  assert.strictEqual(decide({ stored: "", storedSource: null, incoming: INFO, title: "x" }).reason, "fill_blank");
  assert.strictEqual(decide({ stored: BIO, storedSource: null, incoming: "", title: "x" }).action, "keep", "a blank incoming text never replaces");
  const review = decide({ stored: "Research note: package includes VIP parking, rescheduled from Sept 12.", storedSource: "research_unsourced", incoming: INFO, title: "x" });
  assert.strictEqual(review.action, "review", "stored facts the source lacks go to a person, not an automatic winner");
  assert.ok(/facts_the_source_lacks/.test(review.reason));

  const events = () => [tmEvent("bio", "Vince Staples", { info: INFO }), tmEvent("manual", "Manual One", { info: INFO }), tmEvent("andrea", "Andrea One", { info: INFO }), tmEvent("facts", "Facts One", { info: INFO })];
  const rows = () => [
    stored("bio", { description: BIO }),
    stored("manual", { description: MANUAL, description_source: "manual" }),
    stored("andrea", { description: ANDREA }),
    stored("facts", { description: "Research note: package includes VIP parking, rescheduled from Sept 12.", description_source: "research_unsourced" }),
  ];

  // default mode (dry): reports the decision, writes nothing, stored text untouched
  delete process.env.DESCRIPTION_PRECEDENCE_MODE;
  let w = world({ events: rows(), upstream: upstreamOf(events()) });
  await runConnector("cron-ticketmaster.js");
  assert.strictEqual(byId(w.tables, "bio").description, BIO, "dry mode changes no stored description");
  const dry = JSON.parse(JSON.stringify(w.tables.source_runs.slice(-1)[0].session_data.description_precedence));
  assert.deepStrictEqual([dry.mode, dry.considered, dry.would_replace, dry.kept, dry.review], ["dry", 4, 1, 2, 1], "dry counts: one replace (the biography), two kept (approved, event-specific), one for review");

  // apply mode: only the generic biography (and the research-tagged row without a lost fact) change
  process.env.DESCRIPTION_PRECEDENCE_MODE = "apply";
  try {
    w = world({ events: rows(), upstream: upstreamOf(events()) });
    await runConnector("cron-ticketmaster.js");
    const bio = byId(w.tables, "bio");
    assert.strictEqual(bio.description, INFO, "the generic biography is replaced by Ticketmaster's event text");
    assert.strictEqual(bio.description_source, "authoritative");
    assert.ok(bio.internal_note.includes("was: Vince Staples is a Grammy-nominated"), "the replaced text is kept so the change can be reversed");
    assert.strictEqual(byId(w.tables, "manual").description, MANUAL, "approved copy is protected");
    assert.strictEqual(byId(w.tables, "andrea").description, ANDREA, "event-specific research text is preserved");
    assert.strictEqual(byId(w.tables, "facts").description, "Research note: package includes VIP parking, rescheduled from Sept 12.", "a replacement that would drop stored facts waits for review");
    const run = w.tables.source_runs.slice(-1)[0].session_data.description_precedence;
    assert.strictEqual(run.mode, "apply");
    assert.ok(run.review_ids.some((x) => x.startsWith("facts")), "the review list names the row");
  } finally {
    delete process.env.DESCRIPTION_PRECEDENCE_MODE;
  }
  console.log("PASS: description precedence — generic biographies yield to source text, protected and fact-bearing text does not, dry mode writes nothing");
})().catch((e) => { console.error(e); process.exit(1); });
