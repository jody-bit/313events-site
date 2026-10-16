// test/civicplus-description-repair.test.js -- admin queue modernization, Stage 1.
//
// 479 upcoming events from 15 CivicPlus calendar feeds carry only their own
// calendar.aspx?EID= URL as a description, which the admin queue lists as
// "Needs follow-up: description". The nightly poor-description repair already
// replaces such text with factual copy, but was rolled out to GottaGacha only.
// This proves, for the 15 feeds:
//   1. the repair now applies to them and to nothing else new;
//   2. real, manual, authoritative and already-generated descriptions are never replaced;
//   3. the original text is kept in internal_note;
//   4. the 200-per-run cap holds;
//   5. the feed's next refresh does NOT put the URL back (the risk named in description-strength.js);
//   6. other feeds' refresh behaviour is unchanged.
//
// Run: node test/civicplus-description-repair.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2025-01-01T00:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const { repairVerdict, REPAIR_SOURCES, CIVICPLUS_FEED_SOURCES } = require(`${REPO_DIR}/api/_lib/description-strength.js`);
const { descriptionQuality } = require(`${REPO_DIR}/api/_lib/description-quality.js`);

// ---- 1. the allowlist --------------------------------------------------------
assert.strictEqual(CIVICPLUS_FEED_SOURCES.length, 15, "15 CivicPlus feed identifiers");
assert.strictEqual(new Set(CIVICPLUS_FEED_SOURCES).size, 15, "no duplicates");
assert.strictEqual(REPAIR_SOURCES.size, 16, "GottaGacha + the 15 feeds, nothing else");
assert.ok(REPAIR_SOURCES.has("GottaGacha"));
for (const s of ["City of Dearborn", "VisitDetroit", "Resident Advisor", "Ticketmaster", "Bowling Green State University", "Trinosophes"]) {
  assert.ok(!REPAIR_SOURCES.has(s), `${s} is not in the rollout`);
}

const T = "Baby Sprouts StoryThyme";
const url = "https://www.mtclib.org/calendar.aspx?EID=2621";
const ev = (description, extra) => ({ title: T, description, description_source: null, source: CIVICPLUS_FEED_SOURCES[0], ...extra });
for (const source of CIVICPLUS_FEED_SOURCES) {
  const v = repairVerdict(ev(" " + url, { source }));
  assert.ok(v.repairable && v.quality === "bare_url", `${source}: a bare calendar URL is repairable`);
}
// existing high-quality text is never overwritten
assert.ok(!repairVerdict(ev("Stories, songs and rhymes for babies up to 18 months with a caregiver.")).repairable, "good text untouched");
assert.ok(!repairVerdict(ev(url, { description_source: "manual" })).repairable, "manual untouched");
assert.ok(!repairVerdict(ev(url, { description_source: "authoritative" })).repairable, "authoritative untouched");
assert.ok(!repairVerdict(ev(url, { description_source: "generated" })).repairable, "already generated untouched");
assert.ok(!repairVerdict(ev("Join us for storytime and (")).repairable, "truncated text stays flagged, not rewritten");
assert.ok(!repairVerdict(ev(url, { source: "City of Dearborn" })).repairable, "sources outside the rollout are untouched");

// ---- shared fake database for the feed + repair runs --------------------------
function icsFor(summary, uid, description) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `UID:${uid}`, "DTSTART:20261201T190000Z",
    `SUMMARY:${summary}`, description === undefined ? "" : `DESCRIPTION:${description}`, "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function freshHandler() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(`${REPO_DIR}/api/`)) delete require.cache[k];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });

// One feed poll against `store` (array of stored rows keyed by external_id).
async function pollFeed({ store, venueName, uid, summary, description }) {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const handler = freshHandler();
  const feedSources = [{ id: "fs-" + uid, venue_name: venueName, default_category: "community", feed_url: "https://feed.example/cal.ics", feed_format: "ics", status: "approved" }];
  let sent = null;
  global.fetch = async (u, opts = {}) => {
    if (u.includes("/rest/v1/source_runs")) return { ok: true, status: 201, json: async () => [{ id: "run1" }], text: async () => "" };
    if (u.includes("/rest/v1/feed_sources")) return { ok: true, status: 200, json: async () => feedSources };
    if (u.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (u === "https://feed.example/cal.ics") return { ok: true, status: 200, text: async () => icsFor(summary, uid, description) };
    if (u.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) {
      const m = u.match(/external_id=in\.\(([^)]*)\)/);
      const ids = m ? decodeURIComponent(m[1]).split(",").map((s) => s.replace(/^"|"$/g, "")) : [];
      return { ok: true, status: 200, json: async () => store.filter((r) => ids.includes(r.external_id)).map((r) => ({ ...r })) };
    }
    if (u.includes("/rest/v1/events") && opts.method === "POST") {
      sent = JSON.parse(opts.body);
      for (const row of sent) { // merge-duplicates: every sent key overwrites, omitted keys are kept
        const at = store.findIndex((r) => r.external_id === row.external_id);
        if (at >= 0) Object.assign(store[at], row); else store.push({ ...row });
      }
      return strictWriteResponse(u, opts);
    }
    throw new Error("unmocked URL: " + u);
  };
  const res = makeRes();
  const log = console.log; console.log = () => {};
  try { await handler({ headers: {} }, res); } finally { console.log = log; }
  assert.strictEqual(res._status, 200, JSON.stringify(res._body));
  return sent;
}

function runRepair(store, { applyLog } = {}) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(`${REPO_DIR}/scripts/`) || k.includes("/api/_lib/")) delete require.cache[k];
  const { repairGenericMetadata } = require(`${REPO_DIR}/scripts/generic-metadata-enrichment.js`);
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  return repairGenericMetadata({
    logger: { log() {}, error() {} },
    fetchCandidates: async () => store.filter((r) => !r.description || repairVerdictFor(r)).map((r) => ({ ...r })),
    applyPatchFn: async (_u, _h, id, patch, _blank, options) => {
      const row = store.find((r) => r.id === id);
      if (options && typeof options.descriptionEquals === "string" && row.description !== options.descriptionEquals) return false;
      Object.assign(row, patch);
      if (applyLog) applyLog.push(id);
      return true;
    },
    isExternalDiscoveryConfiguredFn: () => false,
  });
}
function repairVerdictFor(r) { return require(`${REPO_DIR}/api/_lib/description-strength.js`).repairVerdict(r).repairable; }

(async () => {
  const SRC = "Mount Clemens Public Library - Children's Events";

  // ---- 2. a NEW row keeps today's behaviour: the feed's text is stored as-is ----
  const store = [];
  let sent = await pollFeed({ store, venueName: SRC, uid: "u1", summary: "Baby Sprouts StoryThyme", description: " " + url });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].description.trim(), url, "new row: description written as the source sent it");
  const row = store[0];
  Object.assign(row, { id: "e1", start_date: "2026-12-01", time_display: "7:00 PM", venue_name_raw: "Mount Clemens Public Library", venue_address_raw: "150 Cass Ave", venue_city_raw: "Mount Clemens", event_url: url, status: "approved", internal_note: "reviewer note" });

  // ---- 3. nightly repair: replaced, original kept, event_url untouched ----------
  let counts = await runRepair(store);
  assert.strictEqual(counts.poorDescriptionsRepaired, 1, JSON.stringify(counts));
  assert.strictEqual(row.description_source, "generated");
  assert.ok(descriptionQuality(row.description, row.title).ok, "passes the quality check: " + row.description);
  assert.ok(row.description.startsWith("Baby Sprouts StoryThyme takes place"), row.description);
  assert.ok(row.internal_note.startsWith("reviewer note\n"), "existing note kept");
  assert.ok(row.internal_note.includes(url), "original description preserved in internal_note");
  assert.strictEqual(row.event_url, url, "existing event link untouched");
  const repaired = row.description;

  // ---- 3b. production shape: no event_url and a RELATIVE calendar-export ticket_url ------------
  // (all 479 rows look like this). The event's own page, currently only in the description, becomes event_url;
  // the relative value is not touched; the original text is still kept in internal_note.
  const prod = { id: "p1", external_id: "feed-fs-p1", title: "Board Gaming Meet-up", description: " https://www.sterlingheights.gov/calendar.aspx?EID=10941", description_source: null, source: CIVICPLUS_FEED_SOURCES[4],
    start_date: "2026-12-01", time_display: "10:00 AM", venue_name_raw: "Library > Programming Center", venue_address_raw: "40255 Dodge Park Road", venue_city_raw: "Sterling Heights",
    event_url: null, ticket_url: "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=31", internal_note: null, is_all_day: false, status: "approved" };
  const prodStore = [prod];
  counts = await runRepair(prodStore);
  assert.strictEqual(counts.poorDescriptionsRepaired, 1);
  assert.strictEqual(prod.event_url, "https://www.sterlingheights.gov/calendar.aspx?EID=10941", "the event page link is kept as event_url");
  assert.strictEqual(prod.ticket_url, "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=31", "the relative export path is left as it was");
  assert.ok(prod.internal_note.includes("EID=10941"), "original text kept");
  // an absolute ticket_url or an existing event_url is never replaced
  const keep1 = { ...prod, id: "p2", description: " https://www.sterlingheights.gov/calendar.aspx?EID=1", description_source: null, event_url: "https://example.org/real-event", internal_note: null };
  const keep2 = { ...prod, id: "p3", description: " https://www.sterlingheights.gov/calendar.aspx?EID=2", description_source: null, event_url: null, ticket_url: "https://tickets.example.org/e/2", internal_note: null };
  await runRepair([keep1, keep2]);
  assert.strictEqual(keep1.event_url, "https://example.org/real-event", "existing event_url kept");
  assert.strictEqual(keep2.event_url, null, "an absolute ticket link already serves as the link");
  // the feed's refresh never erases the promoted event_url (it writes ticket_url only)
  const sent3 = await pollFeed({ store: prodStore.map((r) => r), venueName: CIVICPLUS_FEED_SOURCES[4], uid: "p1", summary: "Board Gaming Meet-up", description: " https://www.sterlingheights.gov/calendar.aspx?EID=10941" });
  assert.ok(!("event_url" in sent3[0]), "refresh does not send event_url");

  // ---- 3c. guards: a cancelled listing is left for a person; a sentence in the venue field is not repeated as a venue
  const base = { ...prod, event_url: null, internal_note: null, description_source: null };
  const canc = { ...base, id: "c1", title: "Reading to Meadows Seniors - CANCELLED", description: " https://www.mtclib.org/calendar.aspx?EID=1" };
  const prose = { ...base, id: "c2", title: "Stuff-a-Humvee Veterans Food Drive", description: " https://macomb-mi.gov/calendar.aspx?EID=2579", venue_name_raw: "Join us for the Stuff-a-Humvee event to support the Vietnam Veterans of America Ch. 145 Food Pantry! More details coming soon." };
  counts = await runRepair([canc, prose]);
  assert.strictEqual(counts.poorDescriptionsSkippedCancelled, 1, "cancelled listing skipped");
  assert.strictEqual(canc.description_source, null, "cancelled listing keeps its original text");
  assert.strictEqual(counts.poorDescriptionsRepaired, 1);
  assert.ok(!prose.description.includes("Join us"), "venue prose is not copied into the description: " + prose.description);
  assert.ok(/takes place on December 1/.test(prose.description), prose.description);

  // ---- 4. the feed's next refresh (same URL-only text) does NOT undo the repair --
  sent = await pollFeed({ store, venueName: SRC, uid: "u1", summary: "Baby Sprouts StoryThyme", description: " " + url });
  assert.ok(!("description" in sent[0]), "refresh sends no description key for a repaired row");
  assert.strictEqual(row.description, repaired, "repair survived the refresh");
  assert.strictEqual(row.description_source, "generated");
  // ...and when the feed sends no description at all, null never erases stored text
  sent = await pollFeed({ store, venueName: SRC, uid: "u1", summary: "Baby Sprouts StoryThyme" });
  assert.ok(!("description" in sent[0]) || sent[0].description !== null, "null never replaces stored text");
  assert.strictEqual(row.description, repaired);

  // ---- 5. idempotence ------------------------------------------------------------
  counts = await runRepair(store);
  assert.strictEqual(counts.poorDescriptionsRepaired, 0, "second run repairs nothing");

  // ---- 6. when the feed later supplies real text it replaces generated copy -------
  sent = await pollFeed({ store, venueName: SRC, uid: "u1", summary: "Baby Sprouts StoryThyme", description: "Stories, songs and rhymes for babies up to 18 months with a caregiver." });
  assert.strictEqual(row.description, "Stories, songs and rhymes for babies up to 18 months with a caregiver.");
  assert.strictEqual(row.description_source, null, "label no longer says generated");

  // ---- 7. an existing good description is never replaced by a URL ----------------
  sent = await pollFeed({ store, venueName: SRC, uid: "u1", summary: "Baby Sprouts StoryThyme", description: " " + url });
  assert.strictEqual(row.description, "Stories, songs and rhymes for babies up to 18 months with a caregiver.", "good text survives a URL-only refresh");
  const before = row.description;
  counts = await runRepair(store);
  assert.strictEqual(counts.poorDescriptionsRepaired, 0);
  assert.strictEqual(row.description, before, "repair leaves good text alone");

  // ---- 8. a feed outside the rollout behaves exactly as before ---------------------
  const other = [{ id: "o1", external_id: "feed-fs-u9-u9", description: "https://x.example/e/1", description_source: "generated", source: "Some Other Feed" }];
  const probe = [{ external_id: null }];
  void probe;
  const otherStore = [];
  await pollFeed({ store: otherStore, venueName: "Some Other Feed", uid: "u9", summary: "Other Event", description: "https://x.example/e/1" });
  otherStore[0].description_source = "generated";
  otherStore[0].description = "Other Event takes place on December 1.";
  sent = await pollFeed({ store: otherStore, venueName: "Some Other Feed", uid: "u9", summary: "Other Event", description: "https://x.example/e/1" });
  assert.strictEqual(sent[0].description, "https://x.example/e/1", "outside the rollout the feed still writes its own description");
  void other;

  // ---- 9. the 200-per-run cap: 479 candidates -> 200, 200, 79 --------------------
  const many = [];
  for (let i = 0; i < 479; i++) {
    many.push({ id: "m" + i, title: "Event " + i, description: " https://www.sterlingheights.gov/calendar.aspx?EID=" + (10000 + i), description_source: null, source: CIVICPLUS_FEED_SOURCES[4],
      start_date: "2026-12-01", time_display: "7:00 PM", venue_name_raw: "Sterling Heights Library", venue_address_raw: "40255 Dequindre", venue_city_raw: "Sterling Heights", event_url: "https://www.sterlingheights.gov/calendar.aspx?EID=" + i, ticket_url: null, internal_note: null, is_all_day: false });
  }
  const runs = [];
  for (let n = 0; n < 3; n++) runs.push((await runRepair(many)).poorDescriptionsRepaired);
  assert.deepStrictEqual(runs, [200, 200, 79], "cap holds; backlog drains in three runs");
  assert.ok(many.every((r) => r.description_source === "generated" && r.internal_note.includes("calendar.aspx?EID=")), "every original preserved in internal_note");
  assert.strictEqual((await runRepair(many)).poorDescriptionsRepaired, 0);

  console.log("ok    civicplus-description-repair: 15 feeds repaired, good text protected, originals kept, cap 200, refresh cannot undo the repair");
})().catch((e) => { console.error(e); process.exit(1); });
