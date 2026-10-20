"use strict";

// api/_lib/evidence-fetch.js
//
// Polite page fetcher for the schedule-evidence pass (Stage 1). Read-only: GET
// only, nothing is written anywhere. fetch is injected (same convention as
// dearborn-enrichment.js fetchPage) so tests never touch the network.
//
// Every call returns an outcome object and never throws:
//   { ok:true,  url, status, text, retrieved_at }
//   { ok:false, url, outcome, status?, error? }
// outcome: "blocked" (robots Disallow, never retried another way),
//   "robots_unavailable" (robots.txt could not be read: fail closed),
//   "http_error", "network_error", "too_large", "page_cap", "bad_url".
// A failed outcome means the caller changes nothing about the record.

const robots = require("./robots.js");

const UA = "313.events event calendar";
const DEFAULTS = { timeoutMs: 8000, maxBytes: 1500000, maxPages: 40, minDelayMs: 1000, maxDelayMs: 10000 };

function createEvidenceFetcher(opts = {}) {
  const fetchImpl = opts.fetch || global.fetch;
  const ua = opts.userAgent || UA;
  const o = { ...DEFAULTS, ...opts };
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now || (() => new Date());
  const hosts = new Map(); // host -> { state:"ok"|"unavailable", text, delayMs, last }
  let pages = 0;

  async function get(url) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), o.timeoutMs) : null;
    try {
      return await fetchImpl(url, { method: "GET", headers: { "User-Agent": ua }, signal: ctl ? ctl.signal : undefined });
    } finally { if (timer) clearTimeout(timer); }
  }

  async function hostState(u) {
    if (hosts.has(u.host)) return hosts.get(u.host);
    let st;
    try {
      const resp = await get(`${u.protocol}//${u.host}/robots.txt`);
      const kind = robots.classifyRobotsStatus(resp.status);
      if (kind === "parse") {
        const text = await resp.text();
        const cd = robots.crawlDelaySeconds(text, ua);
        st = { state: "ok", text, delayMs: Math.min(o.maxDelayMs, Math.max(o.minDelayMs, cd ? cd * 1000 : 0)), last: 0 };
      } else if (kind === "allowed_none") {
        st = { state: "ok", text: "", delayMs: o.minDelayMs, last: 0 };
      } else st = { state: "unavailable", status: resp.status };
    } catch (e) { st = { state: "unavailable", error: e.message }; }
    hosts.set(u.host, st);
    return st;
  }

  async function fetchPage(url) {
    let u;
    try { u = new URL(url); } catch { return { ok: false, url, outcome: "bad_url" }; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, url, outcome: "bad_url" };
    if (pages >= o.maxPages) return { ok: false, url, outcome: "page_cap" };
    const hs = await hostState(u);
    if (hs.state !== "ok") return { ok: false, url, outcome: "robots_unavailable", status: hs.status, error: hs.error };
    if (!robots.isAllowed(hs.text, ua, u.pathname + u.search)) return { ok: false, url, outcome: "blocked" };
    const wait = hs.last ? hs.last + hs.delayMs - Date.now() : 0;
    if (wait > 0) await sleep(wait);
    hs.last = Date.now();
    pages++;
    try {
      const resp = await get(url);
      if (!resp.ok) return { ok: false, url, outcome: "http_error", status: resp.status };
      const text = await resp.text();
      if (text.length > o.maxBytes) return { ok: false, url, outcome: "too_large", status: resp.status };
      return { ok: true, url, status: resp.status, text, retrieved_at: now().toISOString() };
    } catch (e) { return { ok: false, url, outcome: "network_error", error: e.message }; }
  }

  return { fetchPage, pagesFetched: () => pages };
}

module.exports = { createEvidenceFetcher, UA, DEFAULTS };
