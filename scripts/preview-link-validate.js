// scripts/preview-link-validate.js
//
// Preview qualification: opens the PRIMARY link a visitor would click for each sampled event and reports what it
// really answers (owner direction 2026-10-23: "a Preview is not ready for owner acceptance if its tested primary
// event links are known to be broken"). Read-only: GET requests to the event links, no database or page writes.
//
//   node scripts/preview-link-validate.js --supabase [--per-source 5] [--include-venue-link]
//       (SUPABASE_URL + SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY: samples approved upcoming rows per source)
//   (--commit <sha> names the Preview build; the stamp line is what R&Q attaches to the owner Preview)
//   node scripts/preview-link-validate.js --events rows.json [--per-source 5]
//       (rows.json: array of event rows with title, source, ticket_url, event_url)
//
// Verdict per event, using the same rule the pages use (event-links.js):
//   BLOCKING            primary link answered 404 or 410 (confirmed dead)
//   NEEDS-VERIFICATION  403, 429, 5xx, timeout, or a redirect that landed on the site's homepage; not proof either way
//   PASS                200 to 399 on an event-specific page
//   NO-PRIMARY          no event-specific link (only a venue homepage, or nothing); not a failure, listed for review
// Data parity (run on ALL rows read, not just the sample): a Preview reads its own database, which can lag production
// (2026-10-24: staging held 324 VisitDetroit links in the old, dead /<slug>/ form while production used /events/<slug>/).
//   STALE-SHAPE         rows whose stored link is a known-dead old form: reported with a count, blocks like a 404
//   data date           when the database last ingested: newest finished successful source_runs row, else newest events.created_at.
//                       updated_at is NOT used: any edit (a links-only repair, an admin save) bumps it and would make old data look fresh.
//                       Older than --max-age-days (default 3) is reported as STALE-DATA
// Exit code 1 when any BLOCKING result exists, so R&Q can gate a Preview on it.
"use strict";
const fs = require("fs");
const path = require("path");
const { checkUrl } = require("../api/_lib/link-health");
const { OLD_SHAPE_RE } = require("../api/_lib/visitdetroit-link-recovery");

// event-links.js is a browser file that attaches to window/module; load it the same way the tests do.
function loadEventLinks() {
  const mod = { exports: {} };
  const src = fs.readFileSync(path.join(__dirname, "..", "event-links.js"), "utf8");
  new Function("module", "exports", "window", src)(mod, mod.exports, {});
  return mod.exports.EventLinks || mod.exports;
}

function isHomepageLanding(finalUrl) {
  try {
    const u = new URL(finalUrl);
    return (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash;
  } catch { return false; }
}

async function validateRows(rows, { fetchFn = fetch, perSource = 5, EventLinks = loadEventLinks(), concurrency = 6 } = {}) {
  const bySource = new Map();
  for (const r of rows) {
    const key = r.source || "unknown";
    if (!bySource.has(key)) bySource.set(key, []);
    if (bySource.get(key).length < perSource) bySource.get(key).push(r);
  }
  const sample = [].concat(...bySource.values());
  const out = new Array(sample.length);
  let next = 0;
  async function worker() {
    while (next < sample.length) {
      const i = next++;
      const r = sample[i];
      const resolved = EventLinks.resolve({ ticketUrl: r.ticket_url || r.ticketUrl, eventPageUrl: r.event_url || r.eventPageUrl });
      const base = { id: r.id || null, title: r.title, source: r.source || "unknown", url: resolved.primary ? resolved.primary.url : null, label: resolved.primary ? resolved.primary.label : null };
      if (!resolved.primary) { out[i] = { ...base, verdict: "NO-PRIMARY" }; continue; }
      const res = await checkUrl(resolved.primary.url, { fetchFn });
      let verdict;
      if (res.status === 404 || res.status === 410) verdict = "BLOCKING";
      else if (res.classification === "ok") verdict = isHomepageLanding(res.finalUrl) && !isHomepageLanding(resolved.primary.url) ? "NEEDS-VERIFICATION" : "PASS";
      else verdict = "NEEDS-VERIFICATION";
      out[i] = { ...base, verdict, status: res.status, finalUrl: res.finalUrl, error: res.error || null };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, sample.length) }, worker));
  const counts = out.reduce((a, o) => ((a[o.verdict] = (a[o.verdict] || 0) + 1), a), {});
  return { results: out, counts, blocking: out.filter((o) => o.verdict === "BLOCKING") };
}

// lastIngestAt: newest finished success/partial source_runs row (service-role only), or null when unreadable.
function dataParity(rows, { maxAgeDays = 3, now = Date.now(), lastIngestAt = null } = {}) {
  const staleShape = rows.filter((r) => OLD_SHAPE_RE.test(String(r.ticket_url || r.ticketUrl || "").trim()) || OLD_SHAPE_RE.test(String(r.event_url || r.eventPageUrl || "").trim()));
  const created = rows.map((r) => Date.parse(r.created_at)).filter(Number.isFinite);
  const ingest = lastIngestAt ? Date.parse(lastIngestAt) : NaN;
  const candidates = created.concat(Number.isFinite(ingest) ? [ingest] : []);
  const newest = candidates.length ? new Date(Math.max(...candidates)).toISOString() : null;
  const edits = rows.map((r) => Date.parse(r.updated_at)).filter(Number.isFinite);
  const ageDays = newest ? (now - Date.parse(newest)) / 86400000 : null;
  return { total: rows.length, staleShapeCount: staleShape.length, staleShapeExamples: staleShape.slice(0, 3).map((r) => r.ticket_url || r.event_url), newestUpdate: newest, source: Number.isFinite(ingest) && ingest >= Math.max(...created, 0) ? "source_runs" : "events.created_at", lastRowEdit: edits.length ? new Date(Math.max(...edits)).toISOString() : null, ageDays, staleData: ageDays !== null && ageDays > maxAgeDays };
}

async function fetchSupabaseRows() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY) are required for --supabase");
  const today = new Date().toISOString().slice(0, 10);
  const resp = await fetch(`${url}/rest/v1/events?select=id,title,source,ticket_url,event_url,created_at,updated_at&status=eq.approved&start_date=gte.${today}&order=start_date.asc&limit=2000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!resp.ok) throw new Error(`events query HTTP ${resp.status}`);
  return resp.json();
}

// Newest finished successful ingestion run. source_runs is service-role only; with the anon key this returns null and the
// freshness falls back to events.created_at.
async function fetchLastIngest() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const resp = await fetch(`${url}/rest/v1/source_runs?select=finished_at&outcome=in.(success,partial)&finished_at=not.is.null&order=finished_at.desc&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!resp.ok) return null;
    const rows = await resp.json();
    return rows[0] ? rows[0].finished_at : null;
  } catch { return null; }
}

// The stamp R&Q attaches to every owner Preview (owner direction 2026-10-24): which build, which database, how fresh, and
// whether its primary links were opened. Environment is read from the data host, never guessed.
const DATA_ENVIRONMENTS = { afvyfjfqukptnfmgshzn: "production", efxjdlogohcggpuftivm: "staging" };
function previewStamp({ commit, supabaseUrl, parity, counts, checkedAt }) {
  const ref = (String(supabaseUrl || "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1] || null;
  return {
    application_commit: commit || null,
    data_environment: ref ? (DATA_ENVIRONMENTS[ref] || `unknown (${ref})`) : "unknown",
    data_refreshed_at: parity.newestUpdate,
    data_refreshed_from: parity.source,
    last_row_edit_at: parity.lastRowEdit,
    data_age_days: parity.ageDays === null ? null : Math.round(parity.ageDays * 10) / 10,
    data_stale: !!parity.staleData || parity.staleShapeCount > 0,
    link_check: { checked_at: checkedAt, sampled: Object.values(counts).reduce((a, b) => a + b, 0), counts },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const perSource = Number(arg("--per-source") || 5);
  const rows = args.includes("--supabase") ? await fetchSupabaseRows() : JSON.parse(fs.readFileSync(arg("--events"), "utf8"));
  const { results, counts, blocking } = await validateRows(rows, { perSource });
  for (const r of results) console.log(`${r.verdict.padEnd(18)} ${String(r.status ?? "-").padEnd(4)} ${r.source} | ${r.title} | ${r.url || "(no event-specific link)"}`);
  console.log(`\n${results.length} sampled: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const parity = dataParity(rows, { maxAgeDays: Number(arg("--max-age-days") || 3), lastIngestAt: args.includes("--supabase") ? await fetchLastIngest() : null });
  console.log(`Data date: last ingestion (${parity.source}) ${parity.newestUpdate || "unknown"}; last row edit ${parity.lastRowEdit || "unknown"}${parity.staleData ? ` (${parity.ageDays.toFixed(1)} days old: STALE-DATA)` : ""}`);
  const stamp = previewStamp({ commit: arg("--commit") || process.env.VERCEL_GIT_COMMIT_SHA, supabaseUrl: process.env.SUPABASE_URL, parity, counts, checkedAt: new Date().toISOString() });
  console.log(`PREVIEW STAMP: ${JSON.stringify(stamp)}`);
  if (parity.staleShapeCount) console.log(`STALE-SHAPE: ${parity.staleShapeCount} of ${parity.total} rows hold a known-dead old-form link (held for verification, never counted as PASS), e.g. ${parity.staleShapeExamples.join(", ")}; this database is behind production.`);
  if (parity.staleShapeCount) { console.log("The Preview's data is not current; it is not ready for owner acceptance."); process.exit(1); }
  if (blocking.length) { console.log(`BLOCKING: ${blocking.length} primary link(s) confirmed dead; the Preview is not ready for owner acceptance.`); process.exit(1); }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(2); });
module.exports = { validateRows, isHomepageLanding, dataParity, previewStamp };
