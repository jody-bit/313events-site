#!/usr/bin/env node
"use strict";

// scripts/schedule-evidence-pass.js
//
// Bounded, READ-ONLY runner for the schedule-evidence pass (Stage 1). It never writes to the database and has no
// code path that can: the only network verbs it uses are GET (page fetches via api/_lib/evidence-fetch.js, and the
// optional candidate read). Output is a proposal file; applying a proposal is a later, separately approved stage.
//
// FLOW per candidate
//   1. Receives source text: the allow-listed sources whose `applies_to` / `candidate_ids` match the candidate are
//      fetched through the evidence fetcher (robots.txt honored, UA, timeout, size and page caps, per-host delay).
//   2. Identifies missing fields: season, weekly_hours, closed_dates with no stored value are "missing"; a candidate
//      whose three fields are all held at verified/manual/OWNER-CORRECTION strength is skipped without any fetch.
//   3. Invokes extraction: pipeline.extractFromPage(page, year) per page, then pipeline.proposeSchedule(...) once.
//      The pipeline is api/_lib/schedule-evidence.js (EI, #216); it is injected so this runner is testable alone.
//   4. Records evidence: each proposed field keeps its quote, URL, tier and retrieved_at (from the pipeline), and the
//      run records every page outcome (ok / blocked / robots_unavailable / fetch_failed / extract_failed).
//   5. Failures: robots blocks and unreadable robots.txt are never retried. A network error, 429 or 5xx gets at most
//      `maxRetries` (default 1) more attempt. An extractor that throws is recorded and skipped. A failed page
//      changes nothing about its record. The run stops at `maxCandidates`, the fetcher's page cap or `budgetMs`.
//   6. Publication safety: candidates are deep-frozen; the output holds proposals only and never carries status,
//      published, featured or approval fields. The proposal file declares `writes: 0`.
//
// CLI: node scripts/schedule-evidence-pass.js --candidates candidates.json --out proposal.json
//      candidates.json: [{ id, kind: "event"|"seasonal", group, internal_note, stored: {season,weekly_hours,closed_dates} }]
//      (--supabase reads event candidates by GET using SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; no writes.)

const fs = require("fs");
const path = require("path");
const { createEvidenceFetcher } = require("../api/_lib/evidence-fetch.js");

const FIELDS = ["season", "weekly_hours", "closed_dates"];
const RETRYABLE = new Set(["network_error", "http_error"]);
const LIMITS = { maxCandidates: 25, maxRetries: 1, budgetMs: 120000 };
const STRONG_SOURCES = new Set(["owner_correction", "verified", "manual"]);
const OUTCOME_TO_BLOCKED = { blocked: "robots", robots_unavailable: "robots_unavailable" };

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}

function missingFields(candidate) {
  const stored = (candidate && candidate.stored) || {};
  return FIELDS.filter((f) => !stored[f] || stored[f].value === null || stored[f].value === undefined);
}

// True when every field is already held at verified/manual/OWNER-CORRECTION strength: nothing could be filled or replaced.
function fullyHeld(candidate) {
  const stored = (candidate && candidate.stored) || {};
  return FIELDS.every((f) => stored[f] && stored[f].value != null && STRONG_SOURCES.has(stored[f].rank_source));
}

function sourcesFor(candidate, sources) {
  return (sources || []).filter((s) => (s.candidate_ids || []).includes(candidate.id) || (s.applies_to || []).includes(candidate.group));
}

async function fetchWithRetry(fetcher, url, maxRetries, attempts) {
  let r = await fetcher.fetchPage(url);
  attempts.n++;
  for (let i = 0; !r.ok && RETRYABLE.has(r.outcome) && (r.outcome !== "http_error" || r.status === 429 || r.status >= 500) && i < maxRetries; i++) {
    r = await fetcher.fetchPage(url);
    attempts.n++;
  }
  return r;
}

async function runPass({ candidates, sources, fetcher, pipeline, now, limits }) {
  const L = { ...LIMITS, ...(limits || {}) };
  const clock = now || (() => new Date());
  const started = Date.now();
  const run = { writes: 0, generated_at: clock().toISOString(), limits: L, candidates: [], stopped: null };
  const year = clock().getUTCFullYear();
  const pageCache = new Map(); // url -> outcome, so a source shared by several candidates is fetched once per run

  for (const raw of candidates || []) {
    if (run.candidates.length >= L.maxCandidates) { run.stopped = "max_candidates"; break; }
    if (Date.now() - started > L.budgetMs) { run.stopped = "budget"; break; }
    const candidate = deepFreeze(JSON.parse(JSON.stringify(raw)));
    const entry = { id: candidate.id, kind: candidate.kind || null, missing_before: missingFields(candidate), pages: [], result: null, note: null };
    run.candidates.push(entry);

    if (fullyHeld(candidate)) { entry.note = "nothing_to_do: all fields held at verified, manual or OWNER-CORRECTION strength"; continue; }
    const list = sourcesFor(candidate, sources);
    if (!list.length) { entry.note = "no_allow_listed_source"; entry.result = { proposed: {}, conflicts: [], unsupported: missingFields(candidate), blocked: [], kept: [] }; continue; }

    const pages = [];
    for (const s of list) {
      if (Date.now() - started > L.budgetMs) { run.stopped = "budget"; break; }
      let outcome = pageCache.get(s.url);
      if (!outcome) {
        const attempts = { n: 0 };
        const r = await fetchWithRetry(fetcher, s.url, L.maxRetries, attempts);
        outcome = { r, attempts: attempts.n };
        pageCache.set(s.url, outcome);
      }
      const { r, attempts } = outcome;
      if (!r.ok) {
        const reason = OUTCOME_TO_BLOCKED[r.outcome] || "fetch_failed";
        entry.pages.push({ url: s.url, outcome: r.outcome, status: r.status || null, attempts });
        pages.push({ url: s.url, tier: s.tier, retrieved_at: null, blocked: reason });
        continue;
      }
      try {
        const ex = pipeline.extractFromPage({ url: s.url, tier: s.tier, retrieved_at: r.retrieved_at, text: r.text }, year);
        entry.pages.push({ url: s.url, outcome: "ok", status: r.status, attempts });
        pages.push(ex);
      } catch (e) {
        entry.pages.push({ url: s.url, outcome: "extract_failed", error: String(e && e.message || e).slice(0, 200), attempts });
      }
    }
    try {
      // extractFromPage output is passed through unchanged; blocked pages are passed as plain markers it also accepts
      const prepared = pages.map((p) => (p.blocked && !("season" in p) ? pipeline.extractFromPage(p, year) : p));
      entry.result = pipeline.proposeSchedule({ pages: prepared, stored: candidate.stored || {}, internalNote: candidate.internal_note || "" });
    } catch (e) {
      entry.note = "propose_failed: " + String(e && e.message || e).slice(0, 200);
      entry.result = null; // no proposal: the record is left exactly as it is
    }
  }
  run.summary = summarize(run.candidates);
  return run;
}

// resolvable = at least one proposed field; conflict = any conflict; unsupported = nothing proposed, nothing conflicting.
function summarize(entries) {
  const s = { candidates: entries.length, resolvable: 0, conflict: 0, unsupported: 0, skipped: 0, failed_pages: 0 };
  for (const e of entries) {
    s.failed_pages += e.pages.filter((p) => p.outcome !== "ok").length;
    if (e.note && e.note.startsWith("nothing_to_do")) { s.skipped++; continue; }
    const r = e.result;
    if (r && r.conflicts.length) s.conflict++;
    else if (r && Object.keys(r.proposed).length) s.resolvable++;
    else s.unsupported++;
  }
  return s;
}

// Supabase candidate read: GET only.
async function readEventCandidates(fetchImpl, base, key, limit) {
  const url = `${base}/rest/v1/events?select=id,title,start_date,end_date,time_display,internal_note,status&status=eq.approved&end_date=gte.${new Date().toISOString().slice(0, 10)}&limit=${limit}`;
  const resp = await fetchImpl(url, { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!resp.ok) throw new Error(`candidate read failed: HTTP ${resp.status}`);
  return (await resp.json()).map((r) => ({ id: String(r.id), kind: "event", group: null, internal_note: r.internal_note || "", stored: {} }));
}

function arg(name) { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; }

async function main() {
  const out = arg("--out");
  if (!out) { console.error("usage: schedule-evidence-pass.js --candidates <file.json> | --supabase  --out <proposal.json>"); process.exit(2); }
  const sources = JSON.parse(fs.readFileSync(path.join(__dirname, "../api/_lib/schedule-evidence-sources.json"), "utf8")).sources;
  let pipeline;
  try { pipeline = require("../api/_lib/schedule-evidence.js"); } catch (e) { console.error("api/_lib/schedule-evidence.js is not on this branch (EI #216): " + e.message); process.exit(2); }
  let candidates;
  if (arg("--candidates")) candidates = JSON.parse(fs.readFileSync(arg("--candidates"), "utf8"));
  else if (process.argv.includes("--supabase")) {
    const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --supabase (read-only GET)"); process.exit(2); }
    candidates = await readEventCandidates(global.fetch, base, key, Number(arg("--limit")) || 25);
  } else { console.error("need --candidates or --supabase"); process.exit(2); }
  const run = await runPass({ candidates, sources, fetcher: createEvidenceFetcher(), pipeline });
  fs.writeFileSync(out, JSON.stringify(run, null, 2));
  console.log(`schedule-evidence pass: ${JSON.stringify(run.summary)} writes=0 -> ${out}`);
}

module.exports = { runPass, missingFields, fullyHeld, sourcesFor, summarize, LIMITS, FIELDS };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
