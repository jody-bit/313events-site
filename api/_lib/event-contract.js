// api/_lib/event-contract.js — the shared publication gate (first slice).
//
// WHY THIS EXISTS
// Until now every ingestion connector decided for itself whether a new row
// was public: it set DEFAULT_STATUS (`approved` in 21 of the 24 connectors
// that define one), and the database default for events.status is also
// `approved`. Nothing shared looked at a row before it became public, so a
// malformed city, a placeholder title, an impossible date or editorial
// commentary in a public field reached the site unless a human noticed
// (ENGINEERING_READINESS_REVIEW.md SZ-05; BUG-002, BUG-010, BUG-011).
//
// WHAT IT DOES
//   SOURCE ROW -> evaluateEvent() -> applyPublicationGate() -> upsert
// A connector hands its normalised rows, the statuses already stored
// (api/_lib/status-lookup.js, fail-closed) and the status its source's trust
// tier would give a NEW row. The gate returns the rows to write, each with
// its status already decided, and a summary. The connector no longer picks
// the status of a new row; it cannot publish around the gate.
//
// DECISIONS (per row)
//   publish  every rule passed          -> the connector's intended status
//   hold     a rule is doubtful         -> pending_review (not public)
//   reject   not an event (negative)    -> rejected (kept as a record)
//   skip     cannot be written safely   -> not sent (no title/date/identity)
// UNCERTAIN never publishes. An existing row is NEVER re-statused, demoted,
// or deleted by the gate: its stored status stands (moderation decisions and
// history are preserved); for it the gate withholds a bad value of a nullable
// field from the update, or skips the write when the bad value is in a
// required column (title, start date), and records the issue in the summary.
//
// WHAT IT DELIBERATELY DOES NOT DO
//   - It never invents a value. It does not create a start time, a city, a
//     description or an end date; it can only omit one.
//   - No network, no database, no model. Every rule is a pure function of the
//     row (plus an optional caller-supplied orbit check), so it is testable
//     and cannot itself fail a run.
//   - It does not introduce a new status. `pending_review` carries "ingested
//     but not publishable yet" for this slice; a `held` value and persisted
//     issues are SZ-08 and need a reviewed migration (guardrail G-3).
//   - It does not change cross-source duplicate handling or identity keys:
//     external_id passes through untouched; duplicates inside a batch keep
//     the first row and report the dropped ids.
//   - It does not implement field authority. FIELD_POLICY below is the seed of
//     DEBT-011's per-field table and enforces ONE rule only: a blank incoming
//     value must not erase a stored value, for fields where a blank is almost
//     certainly an omission. Fields a source may legitimately clear (price,
//     ticket link, ticket status) are NOT protected, per the Product Owner's
//     decision recorded under BACKLOG TASK-005 item 4.
"use strict";

const { parseStreet } = require("./street-address");
const { knownCity } = require("./orbit-cities");
const { nonEventRule } = require("./non-event-filter");

const GATE_VERSION = 1;

const DECISION = Object.freeze({ PUBLISH: "publish", HOLD: "hold", REJECT: "reject", SKIP: "skip" });
const ELIGIBILITY = Object.freeze({ POSITIVE: "positive", NEGATIVE: "negative", UNCERTAIN: "uncertain" });
const SEVERITY = Object.freeze({ SKIP: "skip", REJECT: "reject", HOLD: "hold", INFO: "info" });

// ---- field policy (seed of DEBT-011) ---------------------------------------
// protect-from-blank: a null / "" / whitespace-only incoming value is omitted
// from the write, so merge-duplicates leaves the stored value alone. (Omitting
// a key is how "this source has nothing to say" is already expressed; see
// api/_lib/event-upsert.js.) Everything not listed is source-authoritative:
// written as sent, exactly as before.
const FIELD_POLICY = Object.freeze({
  description: "protect-from-blank",
  image_url: "protect-from-blank",
  event_url: "protect-from-blank",
  venue_address_raw: "protect-from-blank",
  venue_city_raw: "protect-from-blank",
  venue_id: "protect-from-blank",
  time_display: "protect-from-blank",
});

// Public-facing text fields (what a visitor can read).
const PUBLIC_TEXT_FIELDS = ["title", "description", "venue_name_raw", "venue_address_raw", "venue_city_raw"];

const PLACEHOLDER_TITLE = /^(?:untitled(?: event)?|tbd|tba|n\/?a|none|null|undefined|event|test|no title)$/i;
// Staff / research voice that must never be in a field a visitor reads.
const COMMENTARY = /\bjody\b|\bfollow-?up:|\bspot-?check\b|\bbefore approving\b|\bmachine-guessed\b|\binternal note\b|\bTODO:|\bincluded per\b|\bresearched 20\d\d-\d\d|\bDUP_MERGED_INTO\b|\bRA_ENRICHMENT\b|\bGATE v\d/i;
const MARKUP = /<\s*(?:style|script)\b/i;
// Title shapes that suggest "not an open public event" without proving it.
// Deliberately few; a hit is UNCERTAIN (held), never NEGATIVE.
const UNCERTAIN_TITLE = /\b(?:by appointment|appointments? only|private (?:tour|session|lesson)|consultation|closed to the public)\b/i;

const MS_PER_DAY = 86400000;
const MAX_PAST_DAYS = 366;
const MAX_FUTURE_DAYS = 730;
const MAX_SPAN_DAYS = 400; // a long exhibition runs ~11 months; more is a typo

function blank(v) { return v === null || v === undefined || (typeof v === "string" && v.trim() === ""); }

// "2026-10-07" and a real calendar date, else null (-> epoch day number).
function isoDay(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(v + "T00:00:00Z");
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10) === v ? Math.floor(t / MS_PER_DAY) : null;
}

// ---- owner corrections (REL-001 / #185 increment 1) --------------------------------------------------------------
// A person's correction of a stored event is recorded as one audit line in the private `internal_note` (no migration):
//   OWNER-CORRECTION <iso time> <editor> fields=<comma list> | <field>: "<old>" -> "<new>"; ...
// The `fields=` list is the marker. It is the INTERIM lock: until a dedicated lock column exists (separately
// authorized, shared with LGP-2 #176), ingestion must not write over a field named in it. ownerCorrectedFields()
// reads the marker; protectOwnerCorrections() applies it to a batch of rows about to be upserted.
const OWNER_CORRECTION_MARKER = "OWNER-CORRECTION";
const OWNER_EDITABLE_FIELDS = Object.freeze(["title", "description", "category", "venue_name_raw", "venue_address_raw", "venue_city_raw", "ticket_url", "event_url", "time_display", "price_from"]);
// Fields the lock can protect although the admin correction form does not edit them. image_url: the Editorial Gateway records an
// owner-approved artwork choice with the same marker so a later feed refresh cannot swap the picture.
const OWNER_LOCK_ONLY_FIELDS = Object.freeze(["image_url"]);
const OWNER_LOCKABLE_FIELDS = Object.freeze(OWNER_EDITABLE_FIELDS.concat(OWNER_LOCK_ONLY_FIELDS));
// A corrected venue name must not be re-resolved to a different venue by the next run.
const OWNER_LOCK_ALSO = Object.freeze({ venue_name_raw: ["venue_id"] });
const OWNER_CORRECTION_LINE = new RegExp("^" + OWNER_CORRECTION_MARKER + "\\s+\\S+\\s+\\S+\\s+fields=([a-z_,]+)", "gm");

// -> Set of column names a person has corrected (including the columns locked with them). Never throws.
function ownerCorrectedFields(internalNote) {
  const out = new Set();
  if (typeof internalNote !== "string" || !internalNote.includes(OWNER_CORRECTION_MARKER)) return out;
  for (const m of internalNote.matchAll(OWNER_CORRECTION_LINE)) {
    for (const f of m[1].split(",")) {
      if (!OWNER_LOCKABLE_FIELDS.includes(f)) continue;
      out.add(f);
      for (const extra of OWNER_LOCK_ALSO[f] || []) out.add(extra);
    }
  }
  return out;
}

// rows: rows about to be upserted; corrected: Map(external_id -> { internal_note, <stored columns> }).
// For every locked field the row's value is replaced by the STORED value (never omitted: a NOT NULL column such as
// title is checked on the proposed row first, so an omitted key would fail the whole row). A stored blank locks the
// field by omitting the key. Rows not in the map are returned untouched. -> { rows, protectedRows }
function protectOwnerCorrections(rows, corrected) {
  if (!(corrected instanceof Map) || !corrected.size) return { rows: rows, protectedRows: 0 };
  let protectedRows = 0;
  const out = rows.map((row) => {
    const stored = row && typeof row === "object" && !blank(row.external_id) ? corrected.get(row.external_id) : null;
    if (!stored) return row;
    const locked = ownerCorrectedFields(stored.internal_note);
    if (!locked.size) return row;
    const next = { ...row };
    let touched = false;
    for (const f of locked) {
      if (!(f in next)) continue;
      touched = true;
      if (blank(stored[f])) delete next[f]; else next[f] = stored[f];
    }
    if (touched) protectedRows++;
    return next;
  });
  return { rows: out, protectedRows };
}

// ---- the correction itself: validate, describe, record -------------------------------------------------------
const CORRECTION_LIMITS = Object.freeze({ title: [3, 200], description: [1, 5000], venue_name_raw: [1, 200], venue_address_raw: [1, 300], venue_city_raw: [1, 120], time_display: [1, 100], ticket_url: [1, 2000], event_url: [1, 2000], category: [1, 40], note: 200 });
const AUDIT_VALUE_MAX = 2000;

function isHttpUrl(v) {
  try { const u = new URL(v); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; }
}

// fields: the requested { field: value }; current: the stored row. -> { errors: [{field,message}], changes: [{field,before,after}] }
// A value equal to the stored one is ignored. A blank value is an error (a correction replaces; it never clears).
// `category` is checked by the database enum (the app's category allow-lists must equal it; test/category-contract.test.js).
function validateCorrection(fields, current) {
  const errors = [], changes = [];
  if (!fields || typeof fields !== "object" || Array.isArray(fields) || !Object.keys(fields).length) return { errors: [{ field: null, message: "fields must name at least one field to correct" }], changes };
  for (const [field, raw] of Object.entries(fields)) {
    if (!OWNER_EDITABLE_FIELDS.includes(field)) { errors.push({ field, message: "not a field that can be corrected in this version" }); continue; }
    if (field === "price_from") {
      // A number (or numeric text) in dollars; 0 is a real price, blank is not accepted (a correction never clears).
      const n = typeof raw === "number" ? raw : (typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN);
      if (!Number.isFinite(n) || n < 0 || n > 100000) { errors.push({ field, message: "must be a price from 0 to 100000" }); continue; }
      const cur = current ? current[field] : null;
      if (cur !== null && cur !== undefined && Number(cur) === n) continue;
      changes.push({ field, before: cur === undefined ? null : cur, after: n });
      continue;
    }
    if (typeof raw !== "string") { errors.push({ field, message: "must be text" }); continue; }
    const value = raw.trim();
    if (!value) { errors.push({ field, message: "cannot be blank; a correction replaces a value, it does not clear it" }); continue; }
    const [min, max] = CORRECTION_LIMITS[field];
    if (value.length < min || value.length > max) { errors.push({ field, message: `must be ${min}-${max} characters` }); continue; }
    if ((field === "ticket_url" || field === "event_url") && !isHttpUrl(value)) { errors.push({ field, message: "must be a valid http(s) link" }); continue; }
    const before = current ? current[field] : null;
    if (typeof before === "string" && before.trim() === value) continue;
    changes.push({ field, before: before === undefined ? null : before, after: value });
  }
  return { errors, changes };
}

const clip = (v) => (typeof v === "string" && v.length > AUDIT_VALUE_MAX ? v.slice(0, AUDIT_VALUE_MAX) + "…[truncated]" : v);

// One audit line. Single line by construction (JSON escapes newlines); see the marker format above.
function buildOwnerCorrectionLine({ at, editId, actor, changes, note }) {
  const fields = changes.map((c) => c.field).join(",");
  const detail = { actor: actor || "admin", changes: changes.map((c) => ({ f: c.field, b: clip(c.before), a: clip(c.after) })) };
  if (note) detail.note = String(note).slice(0, CORRECTION_LIMITS.note);
  return `${OWNER_CORRECTION_MARKER} ${at} ${editId} fields=${fields} | ${JSON.stringify(detail)}`;
}

function appendNoteLine(existingNote, line) {
  return blank(existingNote) ? line : String(existingNote).replace(/\s+$/, "") + "\n" + line;
}

// -> [{ edit_id, at, actor, field, before, after, note }], oldest first. Unreadable lines are skipped, never thrown.
function parseOwnerEdits(internalNote) {
  const out = [];
  if (typeof internalNote !== "string" || !internalNote.includes(OWNER_CORRECTION_MARKER)) return out;
  for (const line of internalNote.split("\n")) {
    const m = /^OWNER-CORRECTION\s+(\S+)\s+(\S+)\s+fields=[a-z_,]+ \| (.*)$/.exec(line);
    if (!m) continue;
    let d; try { d = JSON.parse(m[3]); } catch { continue; }
    if (!d || !Array.isArray(d.changes)) continue;
    for (const c of d.changes) out.push({ edit_id: m[2], at: m[1], actor: d.actor || null, field: c.f, before: c.b === undefined ? null : c.b, after: c.a === undefined ? null : c.a, note: d.note || null });
  }
  return out;
}

// Row annotation for the review queue: nothing from internal_note itself leaves the server.
function ownerCorrectionView(row) {
  const note = row && row.internal_note;
  return { owner_corrected: Array.from(ownerCorrectedFields(note)).filter((f) => OWNER_EDITABLE_FIELDS.includes(f)), edits: parseOwnerEdits(note).filter((e) => OWNER_EDITABLE_FIELDS.includes(e.field)) };
}

function issue(code, field, severity, message) { return { code, field: field || null, severity, message: message || code }; }

// ---- the rules -------------------------------------------------------------
// -> { decision, eligibility, issues[] }. Pure.
function evaluateEvent(row, ctx = {}) {
  const issues = [];
  const r = row && typeof row === "object" ? row : {};
  const today = Math.floor((ctx.now instanceof Date ? ctx.now.getTime() : Date.now()) / MS_PER_DAY);

  // IDENTITY ----------------------------------------------------------------
  if (blank(r.title)) issues.push(issue("TITLE_MISSING", "title", SEVERITY.SKIP));
  else if (PLACEHOLDER_TITLE.test(String(r.title).trim())) issues.push(issue("TITLE_PLACEHOLDER", "title", SEVERITY.HOLD));
  if (blank(r.external_id)) issues.push(issue("IDENTITY_MISSING", "external_id", SEVERITY.SKIP, "no external_id: no defensible identity or duplicate key"));
  if (blank(r.source)) issues.push(issue("SOURCE_MISSING", "source", SEVERITY.HOLD));
  if (blank(r.category)) issues.push(issue("CATEGORY_MISSING", "category", SEVERITY.SKIP, "category is required by the database; one blank row would fail its whole batch"));

  // TEMPORAL ----------------------------------------------------------------
  const start = isoDay(r.start_date);
  if (start === null) issues.push(issue("START_DATE_INVALID", "start_date", SEVERITY.SKIP));
  else {
    if (start < today - MAX_PAST_DAYS || start > today + MAX_FUTURE_DAYS) issues.push(issue("START_DATE_IMPLAUSIBLE", "start_date", SEVERITY.HOLD));
    if (!blank(r.end_date)) {
      const end = isoDay(r.end_date);
      if (end === null) issues.push(issue("END_DATE_INVALID", "end_date", SEVERITY.HOLD));
      else if (end < start) issues.push(issue("END_BEFORE_START", "end_date", SEVERITY.HOLD));
      else if (end - start > MAX_SPAN_DAYS) issues.push(issue("SPAN_IMPLAUSIBLE", "end_date", SEVERITY.HOLD));
    }
  }
  // A start TIME is never required unless the caller says the source states
  // one, and the gate never supplies one. A placeholder is recorded, not changed.
  if (ctx.timeRequired && blank(r.time_display)) issues.push(issue("TIME_MISSING", "time_display", SEVERITY.HOLD));
  else if (!blank(r.time_display) && /^(?:evening|tba|tbd|varies|see (?:lineup|site|website))$/i.test(String(r.time_display).trim()))
    issues.push(issue("TIME_PLACEHOLDER", "time_display", SEVERITY.INFO));

  // GEOGRAPHY ---------------------------------------------------------------
  if (!blank(r.venue_city_raw)) {
    const city = String(r.venue_city_raw).trim();
    if (parseStreet(city) || /^\d/.test(city) || /\d/.test(city)) issues.push(issue("ADDRESS_IN_CITY", "venue_city_raw", SEVERITY.HOLD, "city field holds an address or digits"));
    else if (/,/.test(city) || /\b(?:MI|OH|Michigan|Ohio|Ontario|ON)\b\.?$/.test(city)) issues.push(issue("CITY_HAS_REGION", "venue_city_raw", SEVERITY.HOLD));
    else if (PLACEHOLDER_TITLE.test(city)) issues.push(issue("CITY_PLACEHOLDER", "venue_city_raw", SEVERITY.HOLD));
    else if (!knownCity(city, "MI") && !knownCity(city, "OH"))
      issues.push(issue("CITY_UNRECOGNIZED", "venue_city_raw", ctx.strictCity ? SEVERITY.HOLD : SEVERITY.INFO));
  }
  if (typeof ctx.orbitCheck === "function") {
    let inside = null;
    try { inside = ctx.orbitCheck(r); } catch (_) { inside = null; }
    if (inside === false) issues.push(issue("OUTSIDE_ORBIT", null, SEVERITY.HOLD));
    else if (inside !== true) issues.push(issue("ORBIT_UNKNOWN", null, SEVERITY.HOLD, "orbit membership could not be determined"));
  }
  if (!blank(r.venue_name_raw) && blank(r.venue_id)) issues.push(issue("VENUE_UNLINKED", "venue_id", SEVERITY.INFO));

  // ELIGIBILITY (tri-state; deterministic only, no model) --------------------
  let eligibility = ctx.eligibility === ELIGIBILITY.UNCERTAIN ? ELIGIBILITY.UNCERTAIN : ELIGIBILITY.POSITIVE;
  const rule = nonEventRule(typeof r.title === "string" ? r.title : "");
  if (rule) { eligibility = ELIGIBILITY.NEGATIVE; issues.push(issue("NOT_AN_EVENT:" + rule, "title", SEVERITY.REJECT)); }
  else if (typeof r.title === "string" && UNCERTAIN_TITLE.test(r.title)) eligibility = ELIGIBILITY.UNCERTAIN;
  if (eligibility === ELIGIBILITY.UNCERTAIN) issues.push(issue("ELIGIBILITY_UNCERTAIN", "title", SEVERITY.HOLD));

  // CONTENT QUALITY ----------------------------------------------------------
  for (const f of PUBLIC_TEXT_FIELDS) {
    const v = r[f];
    if (typeof v !== "string" || !v) continue;
    if (COMMENTARY.test(v)) issues.push(issue("INTERNAL_COMMENTARY_IN_PUBLIC_FIELD", f, SEVERITY.HOLD));
    if (MARKUP.test(v)) issues.push(issue("MARKUP_IN_TEXT", f, SEVERITY.HOLD));
  }

  // PROVENANCE ---------------------------------------------------------------
  // "authoritative" is a claim about where a description came from; only a
  // source the caller vouches for may make it. Anything else is not trusted.
  if (r.description_source === "authoritative" && !ctx.authoritativeDescription)
    issues.push(issue("PROVENANCE_CLAIM_UNSUPPORTED", "description_source", SEVERITY.INFO));
  if (r.description_source && blank(r.description)) issues.push(issue("PROVENANCE_WITHOUT_DESCRIPTION", "description_source", SEVERITY.INFO));

  let decision = DECISION.PUBLISH;
  if (issues.some((i) => i.severity === SEVERITY.SKIP)) decision = DECISION.SKIP;
  else if (issues.some((i) => i.severity === SEVERITY.REJECT)) decision = DECISION.REJECT;
  else if (issues.some((i) => i.severity === SEVERITY.HOLD)) decision = DECISION.HOLD;
  return { decision, eligibility, issues };
}

// Values that must not reach an EXISTING row's update because they are wrong:
// the stored value (which got there earlier) is kept instead. The field is
// omitted, never replaced with something else.
const WITHHOLD_ON_EXISTING = new Set([
  "ADDRESS_IN_CITY", "CITY_HAS_REGION", "CITY_PLACEHOLDER", "END_DATE_INVALID", "END_BEFORE_START", "SPAN_IMPLAUSIBLE",
  "TITLE_PLACEHOLDER", "INTERNAL_COMMENTARY_IN_PUBLIC_FIELD", "MARKUP_IN_TEXT", "START_DATE_IMPLAUSIBLE",
]);
// Columns the database requires on every write (NOT NULL, no default). A
// key omitted from an upsert must still be supplied by the INSERT half of
// INSERT ... ON CONFLICT, so Postgres rejects the row before it ever finds the
// stored one. These can therefore never be "withheld" from an existing row's
// update; if one is wrong the write is skipped and the stored row stands.
const REQUIRED_COLUMNS = new Set(["title", "start_date", "category"]);

function sanitizeRow(row, issues, exists) {
  const out = { ...row };
  // protect-from-blank
  for (const [field, policy] of Object.entries(FIELD_POLICY)) {
    if (policy === "protect-from-blank" && field in out && blank(out[field])) delete out[field];
  }
  for (const i of issues) {
    if (i.code === "PROVENANCE_CLAIM_UNSUPPORTED" || i.code === "PROVENANCE_WITHOUT_DESCRIPTION") delete out[i.field];
    else if (exists && i.field && WITHHOLD_ON_EXISTING.has(i.code.split(":")[0])) delete out[i.field];
  }
  return out;
}

// -> { rows, skipped, decisions, summary }
// opts: { existingStatus: Map(external_id -> status), intendedStatus,
//         ctx: <evaluateEvent ctx> }
// `rows` are ready to send to upsertEventRows: every one carries `status`.
function applyPublicationGate(rows, opts = {}) {
  const existing = opts.existingStatus instanceof Map ? opts.existingStatus : new Map();
  const intended = opts.intendedStatus === "pending_review" || opts.intendedStatus === "rejected" ? opts.intendedStatus : "approved";
  const ctx = opts.ctx || {};
  const out = [], skipped = [], decisions = [];
  const seen = new Set();
  const counts = { publish: 0, hold: 0, reject: 0, skip: 0, existingUpdated: 0, existingSkipped: 0, duplicatesDropped: 0 };
  const byIssue = {};
  const note = (codes) => codes.forEach((c) => { byIssue[c] = (byIssue[c] || 0) + 1; });

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row && row.external_id;
    if (!blank(id) && seen.has(id)) {
      counts.duplicatesDropped++;
      skipped.push({ external_id: id, title: row.title, codes: ["DUPLICATE_IN_BATCH"] });
      note(["DUPLICATE_IN_BATCH"]);
      continue;
    }
    const verdict = evaluateEvent(row, ctx);
    const codes = verdict.issues.filter((i) => i.severity !== SEVERITY.INFO).map((i) => i.code);
    const infos = verdict.issues.filter((i) => i.severity === SEVERITY.INFO).map((i) => i.code);
    note(codes.concat(infos));
    if (verdict.decision === DECISION.SKIP) {
      counts.skip++;
      skipped.push({ external_id: id || null, title: row && row.title, codes });
      decisions.push({ external_id: id || null, decision: DECISION.SKIP, existing: false, status: null, codes });
      continue;
    }
    if (!blank(id)) seen.add(id);

    const exists = !blank(id) && existing.has(id);
    if (exists && verdict.issues.some((i) => REQUIRED_COLUMNS.has(i.field) && i.severity !== SEVERITY.INFO && WITHHOLD_ON_EXISTING.has(i.code.split(":")[0]))) {
      // A bad value in a required column cannot be omitted from the update, so
      // the row is not written at all: the stored row (and its status) stands.
      counts.existingSkipped++;
      skipped.push({ external_id: id, title: row.title, codes });
      decisions.push({ external_id: id, decision: DECISION.SKIP, existing: true, status: existing.get(id), codes });
      continue;
    }
    const write = sanitizeRow(row, verdict.issues, exists);
    let status;
    if (exists) {
      // Moderation state and history stand. The gate never moves an existing row.
      status = existing.get(id);
      counts.existingUpdated++;
    } else if (verdict.decision === DECISION.REJECT) status = "rejected";
    else if (verdict.decision === DECISION.HOLD) status = "pending_review";
    else status = intended;
    write.status = status;

    if (!exists && verdict.decision !== DECISION.PUBLISH) {
      // Private (admin-only since SZ-01) breadcrumb on a NEW non-public row
      // only; an existing row's internal_note is never touched.
      const line = `GATE v${GATE_VERSION} ${verdict.decision.toUpperCase()}: ${codes.join(", ")}`;
      write.internal_note = blank(write.internal_note) ? line : String(write.internal_note) + "\n" + line;
    }
    if (!exists) counts[verdict.decision]++; // publish | hold | reject, for NEW rows only
    out.push(write);
    decisions.push({ external_id: id, decision: verdict.decision, existing: exists, status, codes });
  }

  const wouldHoldExisting = decisions.filter((d) => d.existing && d.decision !== DECISION.PUBLISH && d.decision !== DECISION.SKIP);
  const summary = {
    gate_version: GATE_VERSION,
    evaluated: Array.isArray(rows) ? rows.length : 0,
    written: out.length,
    new_published: counts.publish,
    new_held: counts.hold,
    new_rejected: counts.reject,
    skipped: counts.skip,
    duplicates_dropped: counts.duplicatesDropped,
    existing_updated: counts.existingUpdated,
    existing_skipped: counts.existingSkipped,
    existing_with_issues: wouldHoldExisting.length + counts.existingSkipped,
    by_issue: byIssue,
    samples: decisions.filter((d) => d.decision !== DECISION.PUBLISH).slice(0, 10).map((d) => ({ id: d.external_id, decision: d.decision, existing: d.existing, codes: d.codes })),
  };
  return { rows: out, skipped, decisions, summary };
}

module.exports = {
  GATE_VERSION, DECISION, ELIGIBILITY, SEVERITY, FIELD_POLICY,
  evaluateEvent, applyPublicationGate, sanitizeRow, isoDay,
  OWNER_CORRECTION_MARKER, OWNER_EDITABLE_FIELDS, OWNER_LOCKABLE_FIELDS, ownerCorrectedFields, protectOwnerCorrections,
  validateCorrection, buildOwnerCorrectionLine, appendNoteLine, parseOwnerEdits, ownerCorrectionView,
};
