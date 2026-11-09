// test/mcw-reconcile-report.test.js -- report-only reconciliation for MotorCity Wine identity.
"use strict";
const assert = require("assert");
const fs = require("fs");
const { buildReconciliation } = require("../scripts/mcw-reconcile-report.js");
const { legacyExternalId, stableExternalId } = require("../api/_lib/mcw-identity.js");

const TODAY = "2026-10-05";
const ics = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const TZ = "TZID=America/New_York";
const row = (external_id, start_date, title, status = "approved") => ({ external_id, start_date, title, status });
const text = ics(
  ["UID:a@x", `DTSTART;${TZ}:20261008T190000`, "SUMMARY:Jazz Night"],                       // exact legacy match
  ["UID:b@x", `DTSTART;${TZ}:20261009T190000`, "SUMMARY:Wine Class With Chef"],            // renamed (legacy title differs)
  ["UID:c@x", `DTSTART;${TZ}:20261010T190000`, "SUMMARY:Brand New Event"],                 // new
  ["UID:d@x", `DTSTART;${TZ}:20261011T190000`, "SUMMARY:Tasting One"],                     // ambiguous: two stored rows that day
  ["UID:e@x", `DTSTART;${TZ}:20261012T190000`, "SUMMARY:Cancelled Night", "STATUS:CANCELLED"],
);
const stored = [
  row(legacyExternalId("2026-10-08", "Jazz Night"), "2026-10-08", "Jazz Night", "approved"),
  row(legacyExternalId("2026-10-09", "Wine Class"), "2026-10-09", "Wine Class", "pending_review"),
  row(legacyExternalId("2026-10-11", "Tasting A"), "2026-10-11", "Tasting A"),
  row(legacyExternalId("2026-10-11", "Tasting B"), "2026-10-11", "Tasting B"),
  row(legacyExternalId("2026-10-20", "Gone Event"), "2026-10-20", "Gone Event"),
  row(stableExternalId("e@x", "2026-10-12"), "2026-10-12", "Cancelled Night"),
];
const before = JSON.stringify(stored);
const r = buildReconciliation({ icsText: text, existing: stored, today: TODAY });
assert.strictEqual(JSON.stringify(stored), before, "inputs untouched");
assert.strictEqual(r.writes_performed, 0);
assert.strictEqual(r.counts.exact_legacy_match, 1);
assert.strictEqual(r.counts.adopt_by_date_needs_confirmation, 1, "a rename on a date with one candidate is proposed, flagged for confirmation");
assert.strictEqual(r.counts.new_instances, 2, "the new event and the ambiguous one stay new");
assert.strictEqual(r.counts.ambiguous, 1);
assert.strictEqual(r.ambiguous[0].candidate_stored_rows.length, 2);
assert.ok(r.unmatched_stored_rows.some((u) => /Gone Event/.test(u.title)));
assert.ok(r.flagged.some((f) => f.reason === "cancelled-in-feed"), "cancelled instances are flagged, not removed");
assert.deepStrictEqual(r.review_decisions_preserved.rows_with_non_default_status_that_would_be_adopted.map((d) => d.status), ["pending_review"]);
assert.ok(r.rollback.mapping.length === 2 && r.rollback.mapping.every((m) => m.from && m.to));
console.log("PASS: reconciliation reports exact, rename, new, ambiguous, unmatched, cancelled, decisions and a rollback map");

assert.throws(() => buildReconciliation({ icsText: "<html>", existing: [], today: TODAY }), /not an iCalendar/);
const again = buildReconciliation({ icsText: text, existing: stored, today: TODAY });
assert.deepStrictEqual(again, r, "deterministic");
const src = fs.readFileSync(require.resolve("../scripts/mcw-reconcile-report.js"), "utf8");
assert.ok(!/fetch\(|SERVICE_ROLE|\/rest\/v1|method:\s*["'](POST|PATCH|PUT|DELETE)/i.test(src), "no network, credential or write path");
console.log("PASS: invalid ICS rejected, deterministic, no network or write path");
