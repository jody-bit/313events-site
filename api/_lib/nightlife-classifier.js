// api/_lib/nightlife-classifier.js
//
// Reusable Nightlife classification for explicitly advertised dance-music events (issue #177, owner decision
// 2026-10-19 22:30Z; general rule approved 2026-10-18 05:05Z). Pure functions, no I/O.
//
// Applies only to a row that is being classified NOW: it is new, or it is pending_review because the source gave no
// confident category. It classifies; it never approves or publishes, never changes a status, never overrides an owner
// hold, and never reclassifies an approved or rejected row (a retroactive change is a separate, owner-approved batch).
//
//   1. Nightlife = the TITLE names a dance-music event (rave, club night, DJ night, dance party, techno / house / disco
//      night, warehouse party, silent disco) AND at least one independent corroborator: a 9 PM-or-later start or an end
//      after midnight, a nightclub / lounge / warehouse venue, or a DJ lineup in the description.
//   2. Type word only in the description: the type word plus two corroborators, otherwise hold.
//   3. No opinion: family or institutional context; a DJ mentioned only as an amenity; a source whose own category is
//      already confident.
//   4. Hold (a person decides, "nightlife vs music"): a DJ headliner or lineup with no advertised dance-event word, or an
//      event word without a corroborator.
//   5. Never approves or publishes (this module has no status output at all).
"use strict";

const EVENT_TYPE_TITLE = /\b(rave|club night|dj night|dance party|techno night|house night|disco night|warehouse party|silent disco)\b/i;
const DJ_IN_TEXT = /\b(djs?|disc jockey)\b/i;
const LINEUP_DJ = /\b(djs?|spins?|b2b|resident djs?|dj set)\b/i;
const VETO_CONTEXT = /\b(baby|toddler|kids?|children|family|library|school|laser tag|storytime|pre-?k|senior)\b/i;
const VETO_VENUE = /\b(library|school|church|museum|community center|recreation)\b/i;
const AMENITY_DJ = /\b(food trucks?|beer tent|raffles?|bake sale|patio|lawn games|vendors?|kids)\b/i;
const NIGHTLIFE_VENUE = /\b(nightclub|night club|lounge|warehouse)\b/i;

function startHour24(timeDisplay) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(timeDisplay || "");
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h;
}

function endsAfterMidnight(timeDisplay) {
  const all = [...(timeDisplay || "").matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi)];
  if (all.length < 2) return false;
  const last = all[all.length - 1];
  return /am/i.test(last[3]) && Number(last[1]) % 12 < 8; // an end between 12:xx and 7:xx AM
}

function lateHours(timeDisplay) {
  const h = startHour24(timeDisplay);
  return (h !== null && h >= 21) || endsAfterMidnight(timeDisplay);
}

// row: { title, description, venue_name_raw, time_display, category_confident }
// returns { decision: "nightlife" | "hold" | "no_opinion", reason, evidence: [] }
function classifyNightlife(row) {
  const title = (row && row.title) || "";
  const desc = (row && row.description) || "";
  const venue = (row && row.venue_name_raw) || "";
  const t = (row && row.time_display) || "";
  const text = `${title} ${desc}`;
  const evidence = [];

  if (row && row.category_confident === true) return { decision: "no_opinion", reason: "source_category_confident", evidence };
  if (VETO_CONTEXT.test(title) || VETO_VENUE.test(venue)) {
    return { decision: "no_opinion", reason: "family_or_institutional_context", evidence: ["veto:" + (title.match(VETO_CONTEXT) || venue.match(VETO_VENUE))[0].toLowerCase()] };
  }

  const titleType = EVENT_TYPE_TITLE.exec(title);
  const descType = titleType ? null : EVENT_TYPE_TITLE.exec(desc);
  const hasDj = DJ_IN_TEXT.test(text);

  if (!titleType && descType) {
    const e2 = ["desc_type:" + descType[0].toLowerCase()];
    if (lateHours(t)) e2.push("late_hours");
    if (NIGHTLIFE_VENUE.test(venue)) e2.push("nightlife_venue");
    if (LINEUP_DJ.test(desc)) e2.push("dj_lineup");
    return e2.length >= 3
      ? { decision: "nightlife", reason: "description_type_plus_two_corroborators", evidence: e2 }
      : { decision: "hold", reason: "description_type_without_enough_corroboration", evidence: e2 };
  }

  if (!titleType) {
    if (hasDj && AMENITY_DJ.test(text)) return { decision: "no_opinion", reason: "dj_is_amenity", evidence };
    if (hasDj) return { decision: "hold", reason: "dj_headliner_or_lineup_music_vs_nightlife", evidence: ["dj_in_text_only"] };
    return { decision: "no_opinion", reason: "no_signal", evidence };
  }

  evidence.push("title_type:" + titleType[0].toLowerCase());
  if (lateHours(t)) evidence.push("late_hours");
  if (NIGHTLIFE_VENUE.test(venue)) evidence.push("nightlife_venue");
  if (hasDj && LINEUP_DJ.test(desc)) evidence.push("dj_lineup");
  if (evidence.length >= 2) return { decision: "nightlife", reason: "explicit_type_plus_corroboration", evidence };
  return { decision: "hold", reason: "type_word_without_corroboration", evidence };
}

// May a connector write the classification onto this row now? Only a row that does not exist yet, or one still waiting
// in pending_review. An approved or rejected row keeps whatever category it has.
function mayClassify(existingStatus) {
  return existingStatus === undefined || existingStatus === null || existingStatus === "pending_review";
}

// A human-readable line for a NEW row's internal_note (existing rows' notes are never rewritten by connectors).
function nightlifeNote(decision) {
  if (!decision) return null;
  if (decision.decision === "nightlife") return `Classified Nightlife by rule #177 (${decision.reason}: ${decision.evidence.join(", ")}). Not approved; awaits review.`;
  if (decision.decision === "hold") return `Nightlife vs music: held for a person (rule #177: ${decision.reason}).`;
  return null;
}

module.exports = { classifyNightlife, mayClassify, nightlifeNote, EVENT_TYPE_TITLE };
