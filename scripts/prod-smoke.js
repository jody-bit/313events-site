#!/usr/bin/env node
// scripts/prod-smoke.js — scripted, READ-ONLY production smoke test (REL-1 W2, #198).
//
// Anonymous GET requests only. It never creates, approves, rejects, edits, uploads or deletes anything, needs no admin
// credential, and cannot be pointed at a write endpoint (every request goes through get(), which only issues GET).
// Run from a machine with internet access (GitHub Actions, R&Q's Mac); the agent sandbox cannot reach 313.events.
//
//   node scripts/prod-smoke.js [--base https://313.events] [--min-events N] [--out report.json]
//   env: SMOKE_COMMIT_SHA, SMOKE_PR, SMOKE_DISPATCHED_BY  (recorded in the report as release evidence, never validated; dispatched_by is who ran it, NOT an owner release approval)
//
// Exit 0 = all checks passed; 1 = at least one failed; 2 = could not run. The report names the deployment id
// (x-vercel-id header, a per-request tracing id, not a deployment id), the commit if supplied, every check with its evidence, and the execution time, for the
// release-evidence template in project/DEFINITION_OF_DONE.md.
"use strict";
const fs = require("fs");

const PRODUCTION_REF = "afvyfjfqukptnfmgshzn";
const DEFAULT_BASE = "https://313.events";
// A floor, not a target: production held about 2,300 approved current/future rows on 2026-10-16. Override per run; the
// default is deliberately well below the observed size so ordinary expiry never trips it, but a gutted table does.
const DEFAULT_MIN_EVENTS = 1000;

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function decodeEntities(s) { return String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'"); }

async function runSmoke(opts) {
  const base = String(opts.base || DEFAULT_BASE).replace(/\/+$/, "");
  const minEvents = Number(opts.minEvents || DEFAULT_MIN_EVENTS);
  const doFetch = opts.fetchImpl || fetch;
  const started = Date.now();
  const checks = [];
  const evidence = { base, vercel_request_id: null, commit: opts.commit || null, pr: opts.pr || null, dispatched_by: opts.dispatchedBy || null };

  async function get(url, headers) {
    const t0 = Date.now();
    const resp = await doFetch(url, { method: "GET", headers: headers || {}, redirect: "follow" });
    if (!evidence.vercel_request_id && resp.headers && resp.headers.get) evidence.vercel_request_id = resp.headers.get("x-vercel-id") || null;
    return { resp, ms: Date.now() - t0 };
  }
  async function check(name, fn) {
    const t0 = Date.now();
    try { const detail = await fn(); checks.push({ name, ok: true, detail: detail || "", ms: Date.now() - t0 }); }
    catch (e) { checks.push({ name, ok: false, detail: String((e && e.message) || e), ms: Date.now() - t0 }); }
  }
  function need(cond, msg) { if (!cond) throw new Error(msg); }

  let cfg = null; let sample = null;

  await check("config.js names the PRODUCTION database", async () => {
    const { resp } = await get(base + "/config.js");
    need(resp.status === 200, "status " + resp.status);
    const m = /window\.__313_CONFIG\s*=\s*(\{.*\});?/s.exec(await resp.text());
    need(m, "no config object in /config.js");
    cfg = JSON.parse(m[1]);
    need(String(cfg.supabaseUrl).includes(PRODUCTION_REF), "supabaseUrl is not the production project: " + cfg.supabaseUrl);
    need(cfg.supabaseAnonKey, "no publishable key");
    return "environment=" + cfg.environment;
  });

  await check("events_public returns upcoming events (count above floor)", async () => {
    need(cfg, "config unavailable");
    const today = new Date().toISOString().slice(0, 10);
    const url = cfg.supabaseUrl + "/rest/v1/events_public?or=(start_date.gte." + today + ",end_date.gte." + today + ")&select=id,title&order=start_date.asc,id.asc&limit=1";
    const { resp } = await get(url, { apikey: cfg.supabaseAnonKey, Authorization: "Bearer " + cfg.supabaseAnonKey, Prefer: "count=exact", Range: "0-0" });
    need(resp.status === 200 || resp.status === 206, "status " + resp.status);
    const total = Number(String(resp.headers.get("content-range") || "").split("/")[1]);
    need(Number.isFinite(total), "no count in Content-Range");
    need(total >= minEvents, "only " + total + " upcoming events, below the floor of " + minEvents);
    const rows = await resp.json();
    need(rows.length === 1 && rows[0].id != null && rows[0].title, "no sample event returned");
    sample = rows[0];
    return total + " upcoming events (floor " + minEvents + ")";
  });

  for (const [name, p, mark] of [["homepage loads with its data client", "/", "paged-fetch.js"], ["calendar page loads", "/calendar", 'id="calGrid"'], ["map page loads", "/map", "leaflet"]]) {
    await check(name, async () => {
      const { resp } = await get(base + p);
      need(resp.status === 200, "status " + resp.status);
      const html = await resp.text();
      need(html.length > 5000, "page body is only " + html.length + " bytes");
      need(html.toLowerCase().includes(mark.toLowerCase()), "expected marker '" + mark + "' not found in page");
      return html.length + " bytes";
    });
  }

  await check("event detail page serves the event's own title", async () => {
    need(sample, "no sample event");
    const { resp } = await get(base + "/event.html?id=" + encodeURIComponent(sample.id));
    need(resp.status === 200, "status " + resp.status);
    const m = /<title id="pageTitle">([^<]*)<\/title>/.exec(await resp.text());
    need(m, "no pageTitle element");
    const title = decodeEntities(m[1]);
    need(new RegExp(escapeRegExp(String(sample.title).trim()), "i").test(title), "page title '" + title + "' does not contain event title '" + sample.title + "'");
    return "event " + sample.id;
  });

  await check("sitemap lists events", async () => {
    const { resp } = await get(base + "/sitemap.xml");
    need(resp.status === 200, "status " + resp.status);
    const n = (String(await resp.text()).match(/<loc>/g) || []).length;
    need(n >= 10, "only " + n + " <loc> entries");
    return n + " urls";
  });

  await check("admin API refuses anonymous callers", async () => {
    const { resp } = await get(base + "/api/admin-events");
    need(resp.status === 401 || resp.status === 403, "expected 401/403 without credentials, got " + resp.status);
    return "status " + resp.status;
  });

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, started_at: new Date(started).toISOString(), duration_ms: Date.now() - started, evidence, checks, failed: failed.map((c) => c.name) };
}

function format(report) {
  const lines = ["prod-smoke " + (report.ok ? "PASS" : "FAIL") + "  base=" + report.evidence.base + "  deployment=" + (report.evidence.vercel_request_id || "unknown") + "  commit=" + (report.evidence.commit || "not supplied") + "  " + report.duration_ms + "ms"];
  for (const c of report.checks) lines.push((c.ok ? "  ok   " : "  FAIL ") + c.name + (c.detail ? "  (" + c.detail + ")" : ""));
  return lines.join("\n");
}

module.exports = { runSmoke, format, DEFAULT_BASE, DEFAULT_MIN_EVENTS, PRODUCTION_REF };

if (require.main === module) {
  const a = process.argv.slice(2);
  const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  runSmoke({ base: arg("--base", DEFAULT_BASE), minEvents: arg("--min-events", DEFAULT_MIN_EVENTS), commit: process.env.SMOKE_COMMIT_SHA, pr: process.env.SMOKE_PR, dispatchedBy: process.env.SMOKE_DISPATCHED_BY })
    .then((r) => { console.log(format(r)); const out = arg("--out", ""); if (out) fs.writeFileSync(out, JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); })
    .catch((e) => { console.error("prod-smoke could not run: " + e.message); process.exit(2); });
}
