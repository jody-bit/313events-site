#!/usr/bin/env node
"use strict";

// scripts/mcw-reconcile-report.js -- REPORT-ONLY reconciliation of stored MotorCity Wine
// rows against the proposed stable identity (api/_lib/mcw-identity.js).
//
//   node scripts/mcw-reconcile-report.js --ics calendar.ics --existing rows.json \
//        [--today YYYY-MM-DD] [--out report.json] [--markdown report.md]
//
// Inputs are files only: the current authoritative ICS (the connector's ICS_URL, saved as
// a file) and a read-only export of the stored rows (scripts/sql/mcw-reconcile-export.sql).
// No network, no database client, no credential. It changes nothing; it prints what a
// migration WOULD do and a rollback map so the plan can be reviewed first.

const fs = require("fs");
const path = require("path");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://report-only.invalid";
const mcw = require("../api/cron-motorcitywine.js");
const { planIdentity, legacyExternalId, LEGACY_PREFIX } = require("../api/_lib/mcw-identity.js");

const WINDOW_DAYS = 60;
const isoOf = (d) => d.toISOString().slice(0, 10);

function buildReconciliation({ icsText, existing, today }) {
  if (!/BEGIN:VCAL/i.test(String(icsText)) || !/END:VCAL/i.test(String(icsText))) throw new Error("The ICS file is not an iCalendar document (no calendar header).");
  const [y, m, d] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start.getTime() + WINDOW_DAYS * 86400000);
  const vevents = mcw.parseICS(icsText);
  const { occurrences: all, cancelled } = mcw.collectOccurrences(vevents, end);
  const occurrences = all.filter((o) => o.dateNaive >= start && o.dateNaive <= end);

  const stored = existing.filter((r) => r.external_id && /^mcw-/.test(r.external_id));
  const plan = planIdentity(occurrences, cancelled, stored);
  const byExt = new Map(stored.map((r) => [r.external_id, r]));
  const storedFuture = stored.filter((r) => r.start_date >= today);

  const rowOf = (it) => ({
    instance: `${it.startDate} ${it.title}`,
    uid_date: it.occurrence.originalDateISO,
    stable_id: it.stableId,
    action: it.action,
    from: it.from || null,
    stored_status: it.from ? byExt.get(it.from).status : byExt.get(it.stableId) ? byExt.get(it.stableId).status : null,
  });
  const exact = plan.rows.filter((r) => r.action === "keep" || r.action === "adopt").map(rowOf);
  const adoptByDate = plan.rows.filter((r) => r.action === "adopt-by-date").map(rowOf);
  const moved = plan.rows.filter((r) => r.occurrence.originalDateISO !== r.startDate).map((r) => ({ ...rowOf(r), moved_from: r.occurrence.originalDateISO }));

  // Ambiguous: a "new" instance while an unclaimed legacy row exists on its date, or one
  // legacy row that more than one instance could claim.
  const claimed = new Set(plan.rows.map((r) => r.from).filter(Boolean).concat(plan.rows.filter((r) => r.action === "keep").map((r) => r.stableId)));
  const unclaimedLegacy = stored.filter((r) => r.external_id.startsWith(LEGACY_PREFIX) && !claimed.has(r.external_id));
  const ambiguous = plan.rows.filter((r) => r.action === "new").flatMap((r) => {
    const rivals = unclaimedLegacy.filter((s) => s.start_date === r.startDate || s.start_date === r.occurrence.originalDateISO);
    return rivals.length ? [{ instance: `${r.startDate} ${r.title}`, candidate_stored_rows: rivals.map((s) => ({ external_id: s.external_id, title: s.title, status: s.status })) }] : [];
  });
  const unmatched = unclaimedLegacy.filter((s) => s.start_date >= today).map((s) => ({ external_id: s.external_id, start_date: s.start_date, title: s.title, status: s.status }));

  // Potential duplicates: two stored rows on one date with the same normalised title, or
  // that would receive the same stable id.
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const groups = new Map();
  for (const r of storedFuture) { const k = `${r.start_date}|${norm(r.title)}`; groups.set(k, (groups.get(k) || []).concat(r)); }
  const duplicates = [...groups.values()].filter((g) => g.length > 1).map((g) => g.map((r) => ({ external_id: r.external_id, start_date: r.start_date, title: r.title, status: r.status })));
  const stableTargets = new Map();
  for (const r of plan.rows) if (r.from) stableTargets.set(r.stableId, (stableTargets.get(r.stableId) || []).concat(r.from));
  for (const [id, froms] of stableTargets) if (froms.length > 1) duplicates.push(froms.map((f) => ({ external_id: f, would_become: id })));

  // Review decisions: only external_id would change. List the adopted rows that carry a non-default decision.
  const adopted = plan.rows.filter((r) => r.from);
  const decisions = adopted.filter((r) => byExt.get(r.from).status && byExt.get(r.from).status !== "approved").map((r) => ({ from: r.from, status: byExt.get(r.from).status }));
  const mapping = adopted.map((r) => ({ from: r.from, to: r.stableId, confirm_first: r.action === "adopt-by-date" }));

  return {
    generated_for: today,
    writes_performed: 0,
    window: { from: isoOf(start), to: isoOf(end) },
    ics: { vevents: vevents.length, occurrences_in_window: occurrences.length, cancelled_in_feed: cancelled.length },
    stored: { mcw_rows: stored.length, upcoming: storedFuture.length },
    counts: {
      already_stable: plan.rows.filter((r) => r.action === "keep").length,
      exact_legacy_match: plan.rows.filter((r) => r.action === "adopt").length,
      adopt_by_date_needs_confirmation: adoptByDate.length,
      new_instances: plan.rows.filter((r) => r.action === "new").length,
      ambiguous: ambiguous.length,
      unmatched_stored_rows: unmatched.length,
      moved_instances: moved.length,
      potential_duplicates: duplicates.length,
      flagged_for_verification: plan.flagged.length,
      uid_collisions: plan.collisions.length,
    },
    exact_matches: exact, adopt_by_date: adoptByDate, moved_instances: moved, ambiguous, unmatched_stored_rows: unmatched,
    potential_duplicates: duplicates, flagged: plan.flagged,
    review_decisions_preserved: { rows_with_non_default_status_that_would_be_adopted: decisions, fields_changed_on_adopted_rows: ["external_id"] },
    rollback: { mapping, note: "Reverse by setting external_id back to `from` for each `to`. Only external_id changes, so no other column needs restoring. Take the export in scripts/sql/mcw-reconcile-export.sql first and keep it." },
    never: ["no row is created, updated, deleted, cancelled or hidden by this report", "stale or missing instances are flagged for verification, not cancelled"],
  };
}

function toMarkdown(r) {
  const c = r.counts;
  return [
    `# MotorCity Wine identity reconciliation (report-only, ${r.generated_for})`, "",
    `Writes performed: ${r.writes_performed}. Window ${r.window.from} to ${r.window.to}. ICS: ${r.ics.vevents} VEVENTs, ${r.ics.occurrences_in_window} occurrences, ${r.ics.cancelled_in_feed} cancelled. Stored MCW rows: ${r.stored.mcw_rows} (${r.stored.upcoming} upcoming).`, "",
    "| Result | Count |", "|---|---|",
    ...Object.entries(c).map(([k, v]) => `| ${k.replace(/_/g, " ")} | ${v} |`), "",
    `Review decisions on rows that would be adopted: ${r.review_decisions_preserved.rows_with_non_default_status_that_would_be_adopted.length} (only external_id changes).`, "",
  ].join("\n");
}

module.exports = { buildReconciliation, toMarkdown };

if (require.main === module) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  if (!arg("--ics") || !arg("--existing")) { console.error("Usage: --ics FILE --existing FILE [--today YYYY-MM-DD] [--out FILE] [--markdown FILE]"); process.exit(2); }
  try {
    const report = buildReconciliation({
      icsText: fs.readFileSync(arg("--ics"), "utf8"),
      existing: JSON.parse(fs.readFileSync(arg("--existing"), "utf8")),
      today: arg("--today") || new Date().toISOString().slice(0, 10),
    });
    const json = JSON.stringify(report, null, 2);
    if (arg("--out")) fs.writeFileSync(arg("--out"), json + "\n"); else console.log(json);
    if (arg("--markdown")) fs.writeFileSync(arg("--markdown"), toMarkdown(report));
  } catch (e) { console.error(e.message); process.exit(1); }
}
