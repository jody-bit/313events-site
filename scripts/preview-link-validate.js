// scripts/preview-link-validate.js
//
// Preview qualification: opens the PRIMARY link a visitor would click for each sampled event and reports what it
// really answers (owner direction 2026-10-23: "a Preview is not ready for owner acceptance if its tested primary
// event links are known to be broken"). Read-only: GET requests to the event links, no database or page writes.
//
//   node scripts/preview-link-validate.js --supabase [--per-source 5] [--include-venue-link]
//       (SUPABASE_URL + SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY: samples approved upcoming rows per source)
//   node scripts/preview-link-validate.js --events rows.json [--per-source 5]
//       (rows.json: array of event rows with title, source, ticket_url, event_url)
//
// Verdict per event, using the same rule the pages use (event-links.js):
//   BLOCKING            primary link answered 404 or 410 (confirmed dead)
//   NEEDS-VERIFICATION  403, 429, 5xx, timeout, or a redirect that landed on the site's homepage; not proof either way
//   PASS                200 to 399 on an event-specific page
//   NO-PRIMARY          no event-specific link (only a venue homepage, or nothing); not a failure, listed for review
// Exit code 1 when any BLOCKING result exists, so R&Q can gate a Preview on it.
"use strict";
const fs = require("fs");
const path = require("path");
const { checkUrl } = require("../api/_lib/link-health");

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

async function fetchSupabaseRows() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY) are required for --supabase");
  const today = new Date().toISOString().slice(0, 10);
  const resp = await fetch(`${url}/rest/v1/events?select=id,title,source,ticket_url,event_url&status=eq.approved&start_date=gte.${today}&order=start_date.asc&limit=2000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!resp.ok) throw new Error(`events query HTTP ${resp.status}`);
  return resp.json();
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const perSource = Number(arg("--per-source") || 5);
  const rows = args.includes("--supabase") ? await fetchSupabaseRows() : JSON.parse(fs.readFileSync(arg("--events"), "utf8"));
  const { results, counts, blocking } = await validateRows(rows, { perSource });
  for (const r of results) console.log(`${r.verdict.padEnd(18)} ${String(r.status ?? "-").padEnd(4)} ${r.source} | ${r.title} | ${r.url || "(no event-specific link)"}`);
  console.log(`\n${results.length} sampled: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  if (blocking.length) { console.log(`BLOCKING: ${blocking.length} primary link(s) confirmed dead; the Preview is not ready for owner acceptance.`); process.exit(1); }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(2); });
module.exports = { validateRows, isHomepageLanding };
