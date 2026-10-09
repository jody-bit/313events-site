// test/event-contract.test.js — the shared publication gate (first slice).
//
// Proves the contract in api/_lib/event-contract.js on the failure modes the
// project already knows: a valid event publishes; a missing identity does not;
// an address in the city field does not; a blank incoming value does not erase
// a stored one; staff commentary cannot reach a public field through this
// path; UNCERTAIN never publishes; identity and history are preserved; a start
// time is never fabricated; and the SZ-01 public/private boundary still holds.
//
// Plain Node assert. Run: node test/event-contract.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const G = require(`${REPO_DIR}/api/_lib/event-contract.js`);
const NOW = new Date("2026-10-07T15:00:00Z");
const day = (n) => new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);

function good(over) {
  return Object.assign({
    external_id: "dossin-2026-10-12-guided-tour",
    title: "Guided Tour",
    category: "museum",
    venue_name_raw: "Dossin Great Lakes Museum",
    venue_address_raw: "100 Strand Dr",
    venue_city_raw: "Detroit",
    start_date: day(5),
    time_display: "2:00pm – 4:00pm",
    is_free: false,
    source: "Detroit Historical Society (Dossin)",
  }, over || {});
}
const codes = (v) => v.issues.map((i) => i.code);
const gate = (rows, existing, extra) => G.applyPublicationGate(rows, Object.assign({ existingStatus: existing || new Map(), intendedStatus: "approved", ctx: { now: NOW } }, extra || {}));

// ---- 1. a valid event reaches its intended publishable state ------------------
{
  const v = G.evaluateEvent(good(), { now: NOW });
  assert.strictEqual(v.decision, "publish");
  assert.strictEqual(v.eligibility, "positive");
  const r = gate([good()]);
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].status, "approved");
  assert.strictEqual(r.rows[0].internal_note, undefined, "a published row carries no gate breadcrumb");
  assert.strictEqual(r.summary.new_published, 1);
  // the intended status is a ceiling the gate never raises
  assert.strictEqual(gate([good()], null, { intendedStatus: "pending_review" }).rows[0].status, "pending_review");
}
console.log("PASS: 1. a valid event publishes at its intended status (and never above it)");

// ---- 2. missing / invalid identity does not publish ---------------------------
{
  for (const [row, expected] of [
    [good({ title: "" }), "TITLE_MISSING"], [good({ title: "   " }), "TITLE_MISSING"], [good({ title: undefined }), "TITLE_MISSING"],
    [good({ external_id: undefined }), "IDENTITY_MISSING"], [good({ external_id: "" }), "IDENTITY_MISSING"],
    [good({ category: undefined }), "CATEGORY_MISSING"], [good({ category: "" }), "CATEGORY_MISSING"],
    [good({ start_date: undefined }), "START_DATE_INVALID"], [good({ start_date: "2026-02-30" }), "START_DATE_INVALID"], [good({ start_date: "next friday" }), "START_DATE_INVALID"],
  ]) {
    const v = G.evaluateEvent(row, { now: NOW });
    assert.strictEqual(v.decision, "skip", JSON.stringify(row));
    assert.ok(codes(v).includes(expected), expected + " in " + codes(v));
    const r = gate([row]);
    assert.strictEqual(r.rows.length, 0, "a row that cannot be written safely is not sent");
    assert.strictEqual(r.skipped.length, 1);
  }
  for (const t of ["TBA", "Untitled event", "tbd", "Event"]) {
    const r = gate([good({ title: t })]);
    assert.strictEqual(r.rows[0].status, "pending_review", t + " must be held, not public");
    assert.ok(r.rows[0].internal_note.startsWith("GATE v1 HOLD: TITLE_PLACEHOLDER"));
  }
  assert.strictEqual(gate([good({ source: "" })]).rows[0].status, "pending_review", "no source identity -> held");
}
console.log("PASS: 2. missing title / identity / date is skipped; placeholder title or missing source is held");

// ---- 3. semantic geography: an address in the city field never publishes -----
{
  for (const city of ["2810 Russell St.", "2810 Russell Street", "660 W. Baltimore Street #2", "48201", "Detroit, MI 48201", "Detroit, MI", "TBA"]) {
    const v = G.evaluateEvent(good({ venue_city_raw: city }), { now: NOW });
    assert.strictEqual(v.decision, "hold", city);
    assert.ok(codes(v).some((c) => ["ADDRESS_IN_CITY", "CITY_HAS_REGION", "CITY_PLACEHOLDER"].includes(c)), city + " -> " + codes(v));
    assert.strictEqual(gate([good({ venue_city_raw: city })]).rows[0].status, "pending_review");
  }
  // real cities pass; an unlisted real city is recorded, not held (the list is incomplete by design)
  assert.strictEqual(G.evaluateEvent(good({ venue_city_raw: "Ferndale" }), { now: NOW }).decision, "publish");
  const unlisted = G.evaluateEvent(good({ venue_city_raw: "Zzyzx" }), { now: NOW });
  assert.strictEqual(unlisted.decision, "publish");
  assert.ok(codes(unlisted).includes("CITY_UNRECOGNIZED"));
  assert.strictEqual(G.evaluateEvent(good({ venue_city_raw: "Zzyzx" }), { now: NOW, strictCity: true }).decision, "hold");
  // orbit: false and unknown both hold; true passes; a throwing check is "unknown"
  assert.strictEqual(G.evaluateEvent(good(), { now: NOW, orbitCheck: () => true }).decision, "publish");
  assert.strictEqual(G.evaluateEvent(good(), { now: NOW, orbitCheck: () => false }).decision, "hold");
  assert.strictEqual(G.evaluateEvent(good(), { now: NOW, orbitCheck: () => null }).decision, "hold");
  assert.strictEqual(G.evaluateEvent(good(), { now: NOW, orbitCheck: () => { throw new Error("x"); } }).decision, "hold");
  // an unlinked venue is recorded, never a reason to hold
  const unlinked = G.evaluateEvent(good({ venue_id: null }), { now: NOW });
  assert.strictEqual(unlinked.decision, "publish");
  assert.ok(codes(unlinked).includes("VENUE_UNLINKED"));
}
console.log("PASS: 3. address/digits/region/placeholder in the city field holds; unknown orbit holds; unlinked venue only recorded");

// ---- 4. a missing/blank incoming value never erases a better stored value ----
{
  const row = good({ description: null, image_url: "", event_url: "  ", venue_address_raw: undefined, venue_id: null, time_display: "" });
  const w = gate([row], new Map([[row.external_id, "approved"]])).rows[0];
  for (const f of ["description", "image_url", "event_url", "venue_address_raw", "venue_id", "time_display"])
    assert.ok(!(f in w), f + " is omitted so the stored value is untouched");
  // a non-blank value still travels (source-authoritative when it has something to say)
  const w2 = gate([good({ description: "A real description." })]).rows[0];
  assert.strictEqual(w2.description, "A real description.");
  // fields a source may legitimately clear are NOT protected (Product Owner decision, TASK-005 item 4)
  const w3 = gate([good({ price_from: null, ticket_url: null, ticket_status: null })]).rows[0];
  for (const f of ["price_from", "ticket_url", "ticket_status"]) assert.ok(f in w3 && w3[f] === null, f + " may still be cleared by its source");
  assert.deepStrictEqual(Object.keys(G.FIELD_POLICY).sort(), ["description", "event_url", "image_url", "time_display", "venue_address_raw", "venue_city_raw", "venue_id"]);
}
console.log("PASS: 4. blank incoming description/links/venue/time are omitted (stored value kept); clearable fields still clear");

// ---- 5. staff commentary cannot become a public field through this path ------
{
  const JODY = "Appointment-based consultation, not a public gathering — included per Jody's request; she may want to reconsider.";
  for (const [field, text] of [["description", JODY], ["title", "Show (FOLLOWUP: confirm lineup)"], ["description", "researched 2026-09-04 — spot-check before approving"], ["venue_name_raw", "Hall <style>.x{}</style>"]]) {
    const v = G.evaluateEvent(good({ [field]: text }), { now: NOW });
    assert.strictEqual(v.decision, "hold", field + ": " + text);
    assert.ok(codes(v).some((c) => c === "INTERNAL_COMMENTARY_IN_PUBLIC_FIELD" || c === "MARKUP_IN_TEXT"));
    assert.strictEqual(gate([good({ [field]: text })]).rows[0].status, "pending_review");
    // on an EXISTING row the bad value is never written over the stored one: a
    // nullable field is withheld from the update; a required column (title)
    // cannot be omitted, so the row's write is skipped and the stored row stands
    const id = good().external_id;
    const er = gate([good({ [field]: text })], new Map([[id, "approved"]]));
    if (field === "title") { assert.strictEqual(er.rows.length, 0, "title is NOT NULL: skip, never write the commentary"); assert.strictEqual(er.summary.existing_skipped, 1); }
    else { assert.ok(!("" + field in er.rows[0]), "the commentary is not written over the stored value"); assert.strictEqual(er.rows[0].status, "approved"); }
  }
  // the gate never copies private/internal fields into public ones
  const clean = gate([good({ description: "Tour the museum.", note: JODY, internal_note: "RA_ENRICHMENT v1 ..." })]).rows[0];
  assert.strictEqual(clean.description, "Tour the museum.");
  assert.strictEqual(clean.title, "Guided Tour");
  assert.ok(!/jody/i.test(clean.title + clean.description + clean.venue_name_raw));
  // its own breadcrumb is private and carries codes only, never text from the row
  const held = gate([good({ title: "TBA", description: JODY })]).rows[0];
  assert.ok(held.internal_note.startsWith("GATE v1 HOLD:") && !/jody/i.test(held.internal_note));
}
console.log("PASS: 5. commentary / markup in a public field is held (new) or withheld (existing); nothing is copied into public fields");

// ---- 6. UNCERTAIN eligibility never publishes; NEGATIVE is rejected, not public
{
  const u = G.evaluateEvent(good({ title: "Private tour by appointment" }), { now: NOW });
  assert.strictEqual(u.eligibility, "uncertain");
  assert.strictEqual(u.decision, "hold");
  assert.strictEqual(gate([good({ title: "Consultation" })]).rows[0].status, "pending_review");
  // a source the caller marks uncertain holds everything it sends
  assert.strictEqual(gate([good()], null, { ctx: { now: NOW, eligibility: "uncertain" } }).rows[0].status, "pending_review");
  const n = G.evaluateEvent(good({ title: "CLOSED FOR PRIVATE EVENT" }), { now: NOW });
  assert.strictEqual(n.eligibility, "negative");
  assert.strictEqual(n.decision, "reject");
  const r = gate([good({ title: "CLOSED FOR PRIVATE EVENT" })]).rows[0];
  assert.strictEqual(r.status, "rejected", "kept as a record, never public");
  assert.strictEqual(G.ELIGIBILITY.POSITIVE, "positive");
}
console.log("PASS: 6. uncertain eligibility is held, negative is rejected (recorded), neither is public");

// ---- 7. duplicate / identity handling is intact -------------------------------
{
  const a = good(), b = good({ title: "Guided Tour (duplicate listing)" });
  const r = gate([a, b, good({ external_id: "other-id", title: "Another" })]);
  assert.strictEqual(r.rows.length, 2, "the duplicate id is dropped, the rest kept");
  assert.strictEqual(r.rows[0].title, "Guided Tour", "the first occurrence wins");
  assert.strictEqual(r.rows[0].external_id, a.external_id, "identity key is never rewritten");
  assert.strictEqual(r.summary.duplicates_dropped, 1);
  assert.deepStrictEqual(r.skipped[0].codes, ["DUPLICATE_IN_BATCH"]);
  assert.strictEqual(r.skipped[0].external_id, a.external_id, "the dropped id is reported, not lost");
}
console.log("PASS: 7. external_id is untouched; an in-batch duplicate keeps the first and reports the dropped id");

// ---- 8. history is never destructively changed by a current rule --------------
{
  // an existing row that would fail every current rule still keeps its stored status
  const id = good().external_id;
  for (const stored of ["approved", "rejected", "pending_review"]) {
    const r = gate([good({ venue_city_raw: "2810 Russell St.", start_date: day(5) })], new Map([[id, stored]]));
    assert.strictEqual(r.rows.length, 1, "an existing row is updated, not dropped");
    assert.strictEqual(r.rows[0].status, stored, "stored moderation status stands (" + stored + ")");
    assert.strictEqual(r.rows[0].internal_note, undefined, "an existing row's internal_note is never touched");
    assert.ok(!("venue_city_raw" in r.rows[0]), "the bad city is withheld, the stored city stays");
    assert.strictEqual(r.summary.existing_with_issues, 1, "the issue is recorded for review");
  }
  // a bad value in a REQUIRED column (title, start_date) cannot be omitted from an upsert
  // (Postgres checks NOT NULL on the proposed row before it finds the stored one), so the
  // write is skipped and the stored row stands untouched
  for (const bad of [{ start_date: "garbage" }, { start_date: "2062-10-12" }, { title: "TBA" }, { title: "" }]) {
    const sr = gate([good(bad)], new Map([[id, "approved"]]));
    assert.strictEqual(sr.rows.length, 0, JSON.stringify(bad));
    assert.strictEqual(sr.skipped.length, 1);
  }
  // and no row the gate sends ever lacks a required column
  for (const stored of [null, "approved"]) for (const bad of [{}, { description: null }, { venue_city_raw: "2810 Russell St." }, { end_date: day(1) }, { description: "per Jody" }]) {
    for (const row of gate([good(bad)], stored ? new Map([[id, stored]]) : null).rows) for (const col of ["title", "start_date", "category", "external_id"]) assert.ok(row[col], col + " must always be present");
  }
  // nothing in the module can delete: no delete verb, no network
  const src = fs.readFileSync(`${REPO_DIR}/api/_lib/event-contract.js`, "utf8");
  assert.ok(!/DELETE|fetch\(|require\(["']https?["']\)/.test(src.replace(/\/\/.*$/gm, "")), "the gate performs no I/O and no delete");
  // historical events are not "implausible": a year back is allowed, a typo year is held
  assert.strictEqual(G.evaluateEvent(good({ start_date: day(-200) }), { now: NOW }).decision, "publish");
  assert.strictEqual(G.evaluateEvent(good({ start_date: "2062-10-12" }), { now: NOW }).decision, "hold");
  assert.strictEqual(G.evaluateEvent(good({ start_date: "2006-10-12" }), { now: NOW }).decision, "hold");
  // coherent end dates
  assert.strictEqual(G.evaluateEvent(good({ end_date: day(4) }), { now: NOW }).decision, "hold");
  assert.strictEqual(G.evaluateEvent(good({ end_date: day(5) }), { now: NOW }).decision, "publish");
  assert.strictEqual(G.evaluateEvent(good({ end_date: day(125) }), { now: NOW }).decision, "publish", "a season-long exhibition is fine");
  assert.strictEqual(G.evaluateEvent(good({ end_date: day(1200) }), { now: NOW }).decision, "hold");
  // overnight time ranges are not malformed
  assert.strictEqual(G.evaluateEvent(good({ time_display: "10:00 PM – 2:00 AM", end_date: day(6) }), { now: NOW }).decision, "publish");
}
console.log("PASS: 8. an existing row keeps its stored status and history; bad values are withheld; the gate cannot delete");

// ---- 9. a start time is never fabricated --------------------------------------
{
  const noTime = good();
  delete noTime.time_display;
  const r = gate([noTime]).rows[0];
  assert.ok(!("time_display" in r), "no time in, no time out");
  assert.strictEqual(r.status, "approved", "a date-only listing is legitimate when time is not required");
  const strict = G.evaluateEvent(noTime, { now: NOW, timeRequired: true });
  assert.strictEqual(strict.decision, "hold");
  assert.ok(codes(strict).includes("TIME_MISSING"));
  assert.strictEqual(gate([noTime], null, { ctx: { now: NOW, timeRequired: true } }).rows[0].status, "pending_review");
  assert.ok(!("time_display" in gate([noTime], null, { ctx: { now: NOW, timeRequired: true } }).rows[0]), "holding never supplies a time to satisfy the rule");
  // a placeholder time is recorded, never rewritten or replaced
  const ph = gate([good({ time_display: "Evening" })]).rows[0];
  assert.strictEqual(ph.time_display, "Evening");
  assert.ok(G.evaluateEvent(good({ time_display: "Evening" }), { now: NOW }).issues.some((i) => i.code === "TIME_PLACEHOLDER" && i.severity === "info"));
  // no code path in the gate ever assigns a time
  const src = fs.readFileSync(`${REPO_DIR}/api/_lib/event-contract.js`, "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/time_display\s*=[^=]|\.time_display\s*=[^=]/.test(src), "the gate never assigns time_display");
}
console.log("PASS: 9. start time is never fabricated; missing time is held only when a source says time is required");

// ---- provenance: an unsupported 'authoritative' claim is not written ----------
{
  const r = gate([good({ description: "d", description_source: "authoritative" })]).rows[0];
  assert.ok(!("description_source" in r), "an unvouched authoritative claim is dropped");
  const vouched = gate([good({ description: "d", description_source: "authoritative" })], null, { ctx: { now: NOW, authoritativeDescription: true } }).rows[0];
  assert.strictEqual(vouched.description_source, "authoritative");
  assert.ok(!("description_source" in gate([good({ description_source: "generated" })]).rows[0]), "a source with no description cannot claim one");
}
console.log("PASS: provenance — an authoritative claim needs a source the caller vouches for");

// ---- 10. SZ-01: nothing the gate writes widens public access ------------------
{
  const sql = fs.readFileSync(`${REPO_DIR}/supabase/migrations/20261006000003_sz01_public_access_boundary.sql`, "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const allow = new Set(sql.match(/grant select \(([^)]+)\) on table events/)[1].split(",").map((s) => s.trim()));
  assert.ok(!allow.has("internal_note") && !allow.has("note"), "the gate's breadcrumb column is private under SZ-01");
  const held = gate([good({ title: "TBA" })]).rows[0];
  assert.ok(held.internal_note, "a held row does carry the breadcrumb");
  assert.ok(!allow.has("internal_note"), "…and anonymous clients cannot read it");
  // a held / rejected row's status is non-public, so events_public (status = approved) excludes it
  for (const t of ["TBA", "CLOSED FOR PRIVATE EVENT", "Consultation"]) assert.notStrictEqual(gate([good({ title: t })]).rows[0].status, "approved");
  assert.ok(/e\.status = 'approved'::event_status/.test(fs.readFileSync(`${REPO_DIR}/supabase/migrations/20261006000003_sz01_public_access_boundary.sql`, "utf8")), "events_public still filters on approved");
}
console.log("PASS: 10. the gate's private breadcrumb stays inside the SZ-01 boundary; non-public statuses stay out of events_public");

// ---- summary shape (what is persisted to source_runs.session_data) ------------
{
  const r = gate([good(), good({ external_id: "b", title: "TBA" }), good({ external_id: "c", title: "" })], new Map([["d", "approved"]]));
  const s = r.summary;
  assert.deepStrictEqual([s.gate_version, s.evaluated, s.written, s.new_published, s.new_held, s.skipped], [1, 3, 2, 1, 1, 1]);
  assert.strictEqual(s.by_issue.TITLE_PLACEHOLDER, 1);
  assert.ok(JSON.stringify(s).length < 3000, "the summary stays small");
}
console.log("PASS: the per-run summary is small, counted by decision and issue code");

console.log("\nAll event-contract.js (publication gate) tests passed.");
