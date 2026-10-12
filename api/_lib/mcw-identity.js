"use strict";

// api/_lib/mcw-identity.js -- stable event identity for MotorCity Wine's public
// Google Calendar (PROPOSAL, 2026-10-11; not yet used by api/cron-motorcitywine.js).
//
// PROBLEM. The connector names a row `mcw-ical-<date>-<md5(title)[0..10]>`. The
// title is part of the identity, so:
//   - renaming an instance in the calendar ("Beautiful Sunday" -> "Beautiful
//     Sunday with Rick Wilhite") creates a second row and strands the first;
//   - moving an instance to another date does the same;
//   - two different series that share a title on the same day collapse into one
//     row (the connector's own dedupe keeps the first).
//
// RULE. The calendar already names every instance: the UID of its series plus
// the date of the instance (RECURRENCE-ID for an override, the generated date
// for a series member, DTSTART for a single event). That pair does not change
// when an instance is renamed or moved, and differs for different series.
//   stable id = mcw-uid-<sha1(uid)[0..12]>-<originalDateISO>
//
// MIGRATION. Existing rows keep their row (status, notes, enrichment, links all
// live on it); only `external_id` is rewritten, and only by this planner's
// "adopt" actions, which are reviewed first. Nothing is cancelled or hidden:
// instances that disappear from the feed are FLAGGED for a person.
//
// Pure functions; no I/O.

const crypto = require("crypto");

const LEGACY_PREFIX = "mcw-ical-";
const STABLE_PREFIX = "mcw-uid-";

const legacyExternalId = (dateISO, title) =>
  `${LEGACY_PREFIX}${dateISO}-${crypto.createHash("md5").update(title || "MotorCity Wine event").digest("hex").slice(0, 10)}`;

const stableExternalId = (uid, originalDateISO) =>
  `${STABLE_PREFIX}${crypto.createHash("sha1").update(String(uid)).digest("hex").slice(0, 12)}-${originalDateISO}`;

const isoOf = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

// occurrences: output of collectOccurrences() (dateNaive, summary, uid, originalDateISO).
// cancelled:   its `cancelled` list.
// stored:      existing rows of this source: { external_id, start_date, title, status }.
// Returns { rows, flagged, collisions } where rows[i] is
//   { occurrence, startDate, title, stableId, action, from? }
//   action "keep"   the stable id is already stored
//          "adopt"  a stored legacy row is the same instance: rename its external_id to stableId
//          "adopt-by-date"  a stored legacy row on that date is the only unclaimed one and this is the only
//                           unmatched instance that date (a rename): adopt, but a person should confirm
//          "new"    nothing stored: insert
function planIdentity(occurrences, cancelled, stored) {
  const byExt = new Map(stored.map((r) => [r.external_id, r]));
  const items = [];
  const collisions = [];
  const seenStable = new Set();
  for (const occurrence of occurrences) {
    const stableId = stableExternalId(occurrence.uid, occurrence.originalDateISO);
    if (seenStable.has(stableId)) { collisions.push(stableId); continue; }
    seenStable.add(stableId);
    items.push({ occurrence, startDate: isoOf(occurrence.dateNaive), title: occurrence.summary || "MotorCity Wine event", stableId, action: null });
  }

  const claimed = new Set(); // stored external_ids accounted for by an instance
  for (const it of items) {
    if (byExt.has(it.stableId)) { it.action = "keep"; claimed.add(it.stableId); continue; }
    // Same instance under the legacy name: the title is unchanged, and the date is either the
    // current date or (for a moved override) the original one.
    for (const date of [it.startDate, it.occurrence.originalDateISO]) {
      const legacy = legacyExternalId(date, it.title);
      if (byExt.has(legacy) && !claimed.has(legacy)) { it.action = "adopt"; it.from = legacy; claimed.add(legacy); break; }
    }
  }

  // A rename leaves a legacy row whose title no longer matches. Adopt it only when there is no
  // ambiguity: exactly one unclaimed legacy row on the date, exactly one unmatched instance.
  const unclaimedLegacy = stored.filter((r) => r.external_id.startsWith(LEGACY_PREFIX) && !claimed.has(r.external_id));
  const pending = items.filter((it) => !it.action && !byExt.has(it.stableId));
  for (const it of pending) {
    const dates = new Set([it.startDate, it.occurrence.originalDateISO]);
    const rowsThatDay = unclaimedLegacy.filter((r) => dates.has(r.start_date) && !claimed.has(r.external_id));
    const rivals = pending.filter((o) => o !== it && (dates.has(o.startDate) || dates.has(o.occurrence.originalDateISO)));
    if (rowsThatDay.length === 1 && rivals.length === 0) {
      it.action = "adopt-by-date"; it.from = rowsThatDay[0].external_id; claimed.add(it.from);
    }
  }
  for (const it of items) if (!it.action) it.action = "new";

  // Flag, never cancel.
  const flagged = [];
  const cancelledIds = new Set(cancelled.map((c) => stableExternalId(c.uid, c.originalDateISO)));
  for (const r of stored) {
    if (cancelledIds.has(r.external_id)) flagged.push({ external_id: r.external_id, reason: "cancelled-in-feed" });
  }
  // Only instances from the window's first day onward can be "missing"; older rows are history.
  const windowStart = items.map((i) => i.startDate).sort()[0] || null;
  for (const r of stored) {
    if (claimed.has(r.external_id) || cancelledIds.has(r.external_id)) continue;
    if (r.status === "rejected") continue; // a moderator already decided
    if (windowStart && r.start_date >= windowStart) flagged.push({ external_id: r.external_id, reason: "missing-from-feed" });
  }
  return { rows: items, flagged, collisions };
}

module.exports = { legacyExternalId, stableExternalId, planIdentity, LEGACY_PREFIX, STABLE_PREFIX };
