// Submissions Dashboard Step 1 (read-side provenance). Rows mirror the Production shapes read 2026-10-17.
"use strict";
const assert = require("assert");
const { annotateQueue, originOf, methodOf } = require("../api/_lib/submission-provenance");
const { evaluateSources } = require("../api/_lib/source-health");

const NOW = Date.parse("2026-10-17T19:00:00Z");
const base = { status: "pending_review", created_at: "2026-10-16T10:00:00Z", time_display: "7 PM", venue_name_raw: "A Venue", venue_city_raw: "Detroit", description: "d", updated_at: "2026-10-17T18:00:00Z" };
const rows = [
  Object.assign({}, base, { id: 1, source: "City of Dearborn", external_id: "feed-abc-1", feed_source_id: "f-dearborn", title: "Haunted Trail", venue_city_raw: "" }),
  Object.assign({}, base, { id: 2, source: "City of Dearborn", external_id: "feed-abc-2", feed_source_id: "f-dearborn", title: "City Council Meeting", time_display: "" }),
  Object.assign({}, base, { id: 3, source: "Bowling Green State University", external_id: "localist-9", title: "Mixer" }),
  Object.assign({}, base, { id: 4, source: "Venue Submission", submitter_email: "a@b.c", submitter_org_name: "Soul Club", external_id: null, title: "Night", venue_city_raw: "" }),
  Object.assign({}, base, { id: 5, source: "GottaGacha", external_id: "gottagacha-77", title: "Gacha Day" }),
  Object.assign({}, base, { id: 6, source: "Some Researched Source (2026-09-04)", external_id: "x-1", title: "Unmapped" }),
];
const feeds = [{ id: "f-dearborn", venue_name: "City of Dearborn", feed_format: "ics", last_polled_at: "2026-10-17T12:00:00Z", last_poll_result: "119 events found" }];

// no health evidence at all: nothing is blocked for technical reasons; the Dearborn policy hold is separate
let out = annotateQueue(rows, { feeds, runs: [], now: NOW, evaluateSources });
const byId = (o, id) => o.events.find((e) => e.id === id);
assert.strictEqual(byId(out, 1).lane, "blocked"); assert.strictEqual(byId(out, 1).lane_kind, "policy_hold");
assert.strictEqual(byId(out, 3).lane, "person", "unknown source health is not blocked");
assert.strictEqual(out.blocked_breakdown.technical, 0);
assert.strictEqual(out.blocked_breakdown.policy_hold, 2);
assert.strictEqual(out.lane_counts.person + out.lane_counts.blocked, rows.length);
assert.strictEqual(out.lane_counts.auto, null, "handled-automatically is not computed here");

// provenance values
assert.deepStrictEqual([byId(out, 1).prov.origin.value, byId(out, 1).prov.method.value, byId(out, 1).prov.source.name], ["automated", "ics", "City of Dearborn"]);
assert.deepStrictEqual([byId(out, 3).prov.origin.value, byId(out, 3).prov.method.value], ["automated", "api"]);
assert.deepStrictEqual([byId(out, 4).prov.origin.value, byId(out, 4).prov.method.value, byId(out, 4).prov.source.name], ["human", "form", "Soul Club"]);
assert.strictEqual(byId(out, 6).prov.origin.value, "unknown"); assert.strictEqual(byId(out, 6).prov.method.value, "unknown");

// coverage: unmapped sources are counted by name, never dropped
assert.strictEqual(out.provenance_coverage.rows, 6);
assert.strictEqual(out.provenance_coverage.origin_known, 5);
assert.deepStrictEqual(out.provenance_coverage.unmapped_sources, [{ source: "Some Researched Source (2026-09-04)", count: 1 }]);

// updated_at is never offered as a processing time
for (const e of out.events) { assert.ok(!JSON.stringify(e.prov).includes("2026-10-17T18:00:00Z"), "updated_at not in prov"); }
assert.strictEqual(byId(out, 3).prov.added_at, "2026-10-16T10:00:00Z");

// reasons: deterministic, first is primary, never empty
assert.strictEqual(byId(out, 2).reasons.find((r) => r.code === "missing_start_time").code, "missing_start_time");
assert.ok(byId(out, 4).reasons.some((r) => r.code === "human_submission"));
assert.ok(byId(out, 4).reasons.some((r) => r.code === "missing_city"));
assert.strictEqual(byId(out, 3).reasons[0].code, "no_reason_recorded");
for (const e of out.events) assert.ok(e.reasons.length >= 1);

// technical blocked on positive evidence (feed failing / connector streak), reported separately from policy hold
const failFeeds = [{ id: "f-dearborn", venue_name: "City of Dearborn", feed_format: "ics", last_polled_at: "2026-10-17T12:00:00Z", last_poll_result: "HTTP 503" }];
out = annotateQueue(rows, { feeds: failFeeds, runs: [], now: NOW, evaluateSources });
assert.strictEqual(byId(out, 1).lane_kind, "technical"); assert.ok(out.blocked_sources.some((b) => b.state === "technical" && b.affected === 2));

const runs = [1, 2, 3].map((i) => ({ source_slug: "localist", outcome: "success", started_at: new Date(NOW - i * 3600000).toISOString(), finished_at: new Date(NOW - i * 3600000 + 60000).toISOString(), records_fetched: 0, records_parsed: 0, records_written: 0 }));
const vercelConfig = { crons: [{ path: "/api/cron-localist", schedule: "0 * * * *" }] };
out = annotateQueue(rows, { feeds, runs, vercelConfig, now: NOW, evaluateSources });
assert.strictEqual(byId(out, 3).lane, "blocked"); assert.strictEqual(byId(out, 3).lane_kind, "technical", "fetched 0 on 3 runs = failing");
assert.strictEqual(byId(out, 5).lane, "person", "a source with no run log is not blocked");
assert.ok(byId(out, 3).prov.source_last_run_at, "source last run is the SOURCE run time");

// pure on its input
assert.ok(!("prov" in rows[0]));
assert.strictEqual(originOf({ source: "Manual" }), "admin"); assert.strictEqual(originOf({ source: "Editorial Review (Automated)" }), "admin");
assert.strictEqual(methodOf({ feed_source_id: "zz" }, "automated", new Map()), "unknown");
console.log("PASS: submission provenance");
