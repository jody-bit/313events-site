// test/description-self-healing.test.js — automated event-description repair
// works end to end, and survives the next source refresh.
//
// Root cause (docs: /mnt/project-files/ingestion/description-self-healing-diagnosis-2026-10-12.md):
//   RC-1 repair ran only for BLANK descriptions, never POOR ones;
//   RC-4 the nightly GottaGacha refresh overwrote (or nulled) stored descriptions.
// This test drives the REAL GottaGacha handler and the REAL repair script
// (real applyPatch) against the shared fake database, in the order production
// runs them: refresh -> repair -> refresh -> repair.
//
// Plain Node assert. Run: node test/description-self-healing.test.js
"use strict";
const assert = require("assert");
const { EVENT_CATEGORIES_PRODUCTION_2026_10_03 } = require("./fixtures/mock-postgrest.js");
const { world, json, runConnector, byId, REPO_DIR } = require("./fixtures/connector-harness.js");

const { decideSourceDescription, repairVerdict, classifyStored } = require(`${REPO_DIR}/api/_lib/description-strength.js`);
const { descriptionQuality } = require(`${REPO_DIR}/api/_lib/description-quality.js`);

// ---- unit: the strength rule -------------------------------------------------
const T = "Gundam TCG";
const d = (o) => decideSourceDescription({ title: T, ...o });
assert.strictEqual(d({ stored: "Weekly casual league for all.", incoming: null }).write, false, "null never replaces text");
assert.strictEqual(d({ stored: "Weekly casual league for all.", incoming: "deets coming soon" }).write, false, "poor never replaces good");
assert.strictEqual(d({ stored: "Weekly casual league for all.", storedSource: "manual", incoming: "A different but fine description of this event." }).write, false, "manual is never replaced");
assert.strictEqual(d({ stored: "Hand-researched text about the league night.", storedSource: "authoritative", incoming: "Another fine source description here." }).write, false, "authoritative is never replaced by source text");
assert.strictEqual(d({ stored: "Gundam TCG takes place on Friday.", storedSource: "generated", incoming: "deets coming soon" }).write, false, "poor source never replaces generated");
assert.strictEqual(d({ stored: "Gundam TCG takes place on Friday.", storedSource: "generated", incoming: "Bring your deck for casual rounds and prizes." }).write, true, "good source text replaces generated");
assert.strictEqual(d({ stored: "Old good text from the source here.", incoming: "New good text from the source today." }).write, true, "a good source can refresh itself");
assert.strictEqual(d({ stored: null, incoming: "deets coming soon" }).write, true, "anything fills a blank");
assert.strictEqual(d({ stored: "coming soon", incoming: "Bring your deck for casual rounds and prizes." }).write, true, "good replaces poor");

// repairVerdict: classes and sources
const ev = (description, extra) => ({ title: T, description, description_source: null, source: "GottaGacha", ...extra });
for (const [text, q] of [["deets coming soon", "placeholder"], ["https://start.gg/tournament/x", "bare_url"], ["10PM-2AM", "time_only"], ["GG Gundam TCG Event", "restates_title"]]) {
  const v = repairVerdict(ev(text));
  assert.ok(v.repairable && v.quality === q, `${text} -> ${q}`);
}
assert.ok(!repairVerdict(ev("Weekly casual league for all skill levels.")).repairable, "ok text untouched");
assert.ok(!repairVerdict(ev("deets coming soon", { description_source: "manual" })).repairable, "manual untouched");
assert.ok(!repairVerdict(ev("deets coming soon", { description_source: "generated" })).repairable, "generated untouched");
assert.ok(!repairVerdict(ev("deets coming soon", { source: "Mount Clemens Library" })).repairable, "not rolled out to other sources yet");
assert.ok(!repairVerdict(ev("Bring your deck and (")).repairable, "truncated stays flagged, not rewritten");
assert.strictEqual(classifyStored("x", "manual", T), "manual");

// ---- end to end ----------------------------------------------------------------
const apiEvent = (id, title, description) => ({ id, title, description, eventDate: "2026-10-09", startTime: "19:00:00", endTime: "21:00:00", recurrenceType: null, location: "Gotta Gacha" });
let upstreamEvents;
const w = world({
  events: [], venues: [], categories: [...EVENT_CATEGORIES_PRODUCTION_2026_10_03, "gaming"],
  upstream: (url) => (url.includes("gottagacha.com/api/events") ? json({ events: upstreamEvents }) : null),
});

const SRC = {
  A: apiEvent("aaaaaaaa-0000-4000-8000-000000000001", "Gundam TCG Event Night", "GG Gundam TCG Event Night"),
  B: apiEvent("bbbbbbbb-0000-4000-8000-000000000002", "Karaoke Night", "deets coming soon"),
  C: apiEvent("cccccccc-0000-4000-8000-000000000003", "Spoopy Movie Night", "https://start.gg/tournament/spoopy"),
  D: apiEvent("dddddddd-0000-4000-8000-000000000004", "Pokemon League", "Weekly casual league for all skill levels."),
  E: apiEvent("eeeeeeee-0000-4000-8000-000000000005", "Open Mic", "10PM-2AM"),
};
const find = (key) => w.tables.events.find((r) => r.title === SRC[key].title);

(async () => {
  const repairMod = () => {
    for (const k of Object.keys(require.cache)) if (k.startsWith(`${REPO_DIR}/scripts/`) || k.includes("/api/_lib/")) delete require.cache[k];
    return require(`${REPO_DIR}/scripts/generic-metadata-enrichment.js`);
  };
  const quiet = { log() {}, error() {} };
  // The real script, the real applyPatch (via the fake database); only the
  // candidate read is replaced, because the fake database does not implement
  // PostgREST embeds / and=() filters.
  const runRepair = async () => {
    const { repairGenericMetadata } = repairMod();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    const real = global.fetch;
    return repairGenericMetadata({
      logger: quiet,
      fetchCandidates: async () => w.tables.events.filter((r) => repairVerdict(r).repairable || !r.description).map((r) => ({ ...r })),
      isExternalDiscoveryConfiguredFn: () => false, // Level 1 stays gated closed, as in production
    });
  };

  // 1. First refresh: rows are new, so the source text is stored as-is.
  upstreamEvents = Object.values(SRC);
  let res = await runConnector("cron-gottagacha.js");
  assert.strictEqual(res._status, 200, JSON.stringify(res._body));
  assert.strictEqual(w.tables.events.length, 5);
  assert.strictEqual(find("B").description, "deets coming soon");
  // An editor writes E's description by hand; C has lost its event link.
  find("E").description = "Open mic: sign-ups at 9, music and poetry from 10.";
  find("E").description_source = "manual";
  find("C").event_url = null;
  const before = JSON.parse(JSON.stringify(w.tables.events));

  // 2. Repair run 1: A, B, C are poor and repairable; D (good) and E (manual) are not.
  let counts = await runRepair();
  assert.strictEqual(counts.poorDescriptionsRepaired, 3, JSON.stringify(counts));
  for (const k of ["A", "B", "C"]) {
    const row = find(k);
    assert.strictEqual(row.description_source, "generated", k);
    assert.ok(descriptionQuality(row.description, row.title).ok, `${k} now passes the quality check: ${row.description}`);
    assert.ok(row.description.startsWith(row.title + " takes place"), "only restates structured facts, invents nothing: " + row.description);
    assert.ok(/replaced .* description:/.test(row.internal_note), `${k}: prior text recorded for reversal`);
  }
  assert.ok(find("B").internal_note.includes("deets coming soon"), "original text preserved in internal_note");
  assert.strictEqual(find("C").event_url, "https://start.gg/tournament/spoopy", "a bare URL is kept as the event link, not lost");
  assert.strictEqual(counts.poorDescriptionUrlsPreserved, 1);
  assert.strictEqual(find("D").description, before.find((r) => r.title === "Pokemon League").description, "good description untouched");
  assert.strictEqual(find("E").description, "Open mic: sign-ups at 9, music and poetry from 10.", "manual description untouched");
  const repaired = { A: find("A").description, B: find("B").description, C: find("C").description };

  // 3. The nightly refresh runs again with the SAME weak source text, and with B's text now blank.
  upstreamEvents = Object.values(SRC).map((e) => (e.id === SRC.B.id ? { ...e, description: "" } : e));
  res = await runConnector("cron-gottagacha.js");
  assert.strictEqual(res._status, 200, JSON.stringify(res._body));
  for (const k of ["A", "B", "C"]) {
    assert.strictEqual(find(k).description, repaired[k], `${k}: the repair survived the source refresh`);
    assert.strictEqual(find(k).description_source, "generated", `${k}: still labelled generated`);
  }
  assert.strictEqual(find("E").description_source, "manual");
  assert.strictEqual(find("E").description, "Open mic: sign-ups at 9, music and poetry from 10.", "manual survived the refresh");

  // 4. Idempotence: the next repair run writes nothing.
  const patchesBefore = w.db.log.filter((r) => r.table === "events" && r.method === "PATCH").length;
  counts = await runRepair();
  assert.strictEqual(counts.poorDescriptionsRepaired, 0, "second run repairs nothing");
  assert.strictEqual(counts.written, 0);
  assert.strictEqual(w.db.log.filter((r) => r.table === "events" && r.method === "PATCH").length, patchesBefore, "and sends no write");

  // 5. When the source later supplies REAL text, it replaces the generated copy and the label is cleared.
  upstreamEvents = Object.values(SRC).map((e) => (e.id === SRC.A.id ? { ...e, description: "Bring your deck for casual Gundam rounds, prizes for top three." } : e));
  res = await runConnector("cron-gottagacha.js");
  assert.strictEqual(find("A").description, "Bring your deck for casual Gundam rounds, prizes for top three.");
  assert.strictEqual(find("A").description_source, null, "label no longer says generated");
  assert.strictEqual(find("B").description, repaired.B, "other rows unaffected");

  // 6. Concurrent edit: if an editor changes the text between the read and the write, the repair does not overwrite it.
  const row = find("B");
  row.description = "deets coming soon"; row.description_source = null; // make it poor again
  const { repairGenericMetadata } = repairMod();
  counts = await repairGenericMetadata({
    logger: quiet,
    fetchCandidates: async () => { const snap = { ...row }; row.description = "Karaoke every Friday, sign up at the bar."; return [snap]; },
    isExternalDiscoveryConfiguredFn: () => false,
  });
  assert.strictEqual(counts.poorDescriptionsRepaired, 0);
  assert.strictEqual(counts.skippedConcurrentChange, 1, "write refused: stored text changed after it was read");
  assert.strictEqual(row.description, "Karaoke every Friday, sign up at the bar.", "the editor's text is intact");

  // 7. Level 1 (external search) is still gated: no request leaves for a poor description.
  assert.ok(!w.db.log.some((r) => /tavily/i.test(r.url || "")), "no external search");

  // 8. Insufficient facts: no sentence is invented.
  counts = await repairGenericMetadata({
    logger: quiet,
    fetchCandidates: async () => [{ id: "x1", title: "Mystery", description: "coming soon", description_source: null, source: "GottaGacha", start_date: null, venue_name_raw: null, time_display: null, is_all_day: false }],
    applyPatchFn: async () => { throw new Error("must not write"); },
    isExternalDiscoveryConfiguredFn: () => false,
  });
  assert.strictEqual(counts.poorDescriptionsRepaired, 0);
  assert.strictEqual(counts.poorDescriptionsSkippedNoFacts, 1);

  console.log("ok    description-self-healing: 3 poor descriptions repaired, 2 protected, survived refresh, idempotent, race-safe");
})().catch((e) => { console.error(e); process.exit(1); });
