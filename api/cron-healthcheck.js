const crypto = require("crypto");
// Vercel Cron job — the automated smoke test suite Jody asked about on
// 2026-09-02 ("wanted to check in on the automated smoke tests - when are
// those scheduled?").
//
// ** WHY THIS RUNS AS A CRON, NOT A DEV-SANDBOX SCRIPT ** — the original
// plan was a Playwright script run on a recurring schedule from this
// project's own dev sandbox. That doesn't work: that sandbox (and any fresh
// session spun up on the same schedule) has no general internet egress, so
// it can never actually reach https://313.events. The only two places with
// real, reliable internet access to the live site are Jody's own browser
// (not guaranteed to be open at any given moment — the wrong tradeoff for
// something meant to run unattended) and Vercel's own servers, which is
// exactly where every other cron in this project already runs. So this
// check IS a cron: same schedule mechanism, same auth pattern, same
// fail-soft philosophy as cron-lagerhouse.js etc. Results land in the
// `healthchecks` table (migration_019) and surface as a banner at the top
// of admin.html via api/admin-healthcheck.js — a page Jody already opens
// regularly, rather than a new inbox/notification channel to check.
//
// ** WHAT "PROBING THE AUTH BOUNDARY" CATCHES ** — every cron-*.js's
// CRON_SECRET check is written as `if (CRON_SECRET) { ...check... }`: if
// that env var is ever unset in Vercel, auth is silently SKIPPED entirely
// rather than failing closed. Sending a deliberately wrong secret and
// asserting the response is 401 (not 200) catches exactly that regression
// — without ever triggering a source's real scrape logic. Several of these
// (cron-detroitmonthofdesign.js fetches ~317 pages per run) would be an
// unfriendly, wasteful thing to invoke for real twice in one day just to
// prove the endpoint exists. Same reasoning for admin-*.js's
// x-admin-secret check.
//
// ** WHAT THIS DOES NOT CATCH ** — a real browser rendering client-side JS
// (console errors, layout, whether Supabase's response actually turns into
// visible event cards) needs a real browser with real network access,
// which only Jody's own machine currently has. This check instead verifies
// the same underlying data dependency directly: it queries the same public
// Supabase REST endpoint + anon key every page's client-side JS already
// uses, and confirms at least one approved, non-past event comes back. If
// Jody wants full browser-rendered coverage later, the natural next step is
// a check this cron structurally can't do itself — asking her browser to
// visit the site and report back next time it's connected.

const BASE_URL = "https://313.events";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Same publishable/anon key every public page already ships in its own
// client-side JS (see index.html) — not a secret, safe to inline here too.
const SUPABASE_ANON_KEY = "sb_publishable_NQgem2pH8h_ynP8ikwdmFw_5aoN34Q5";
const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
// Intentionally wrong on every run — this suite never has, and never
// needs, the real secrets to prove the auth check itself is alive.
const WRONG_SECRET = "smoke-test-intentionally-wrong-secret";

const CRON_ENDPOINTS = [
  "cron-ticketmaster", "cron-trinosophes", "cron-wdet", "cron-halo",
  "cron-belle-isle-nature-center", "cron-metrotimes", "cron-redford-theatre",
  "cron-cinema-detroit", "cron-dossin", "cron-feeds", "cron-editorial",
  "cron-lagerhouse", "cron-detroitmonthofdesign", "cron-planetanttheatre",
];
const ADMIN_ENDPOINTS = ["admin-events", "admin-feeds", "admin-editorial", "admin-venues"];
const PAGES = ["/", "/calendar.html", "/map.html", "/submit.html", "/sources.html", "/event.html", "/admin.html"];

function timingSafeStringEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// Wraps a probe so a thrown error becomes a normal failed-check result
// instead of aborting the whole run — one bad endpoint should never hide
// the results of every other check, same "one bad page never aborts the
// run" convention cron-detroitmonthofdesign.js already established.
async function runCheck(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail, ms: Date.now() - start };
  } catch (err) {
    return { name, ok: false, detail: err.message, ms: Date.now() - start };
  }
}

async function checkPage(path) {
  const resp = await fetch(BASE_URL + path, { headers: { "User-Agent": "313events-healthcheck" } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const body = await resp.text();
  if (!body || body.length < 500) throw new Error(`suspiciously short response (${body.length} bytes)`);
  return `HTTP ${resp.status}, ${body.length} bytes`;
}

async function checkSupabaseData() {
  const url = `${SUPABASE_URL}/rest/v1/events?select=id&status=eq.approved&limit=1`;
  const resp = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!resp.ok) throw new Error(`Supabase REST HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("no approved events returned — public pages would render empty");
  }
  return `${rows.length} row(s) returned`;
}

async function checkCronAuth(name) {
  const resp = await fetch(`${BASE_URL}/api/${name}`, {
    headers: { Authorization: `Bearer ${WRONG_SECRET}` },
  });
  if (resp.status !== 401) {
    throw new Error(`expected 401 for a wrong secret, got ${resp.status} — CRON_SECRET may be unset or the auth check is broken`);
  }
  return "401 as expected";
}

async function checkAdminAuth(name) {
  const resp = await fetch(`${BASE_URL}/api/${name}`, {
    headers: { "x-admin-secret": WRONG_SECRET },
  });
  if (resp.status !== 401) {
    throw new Error(`expected 401 for a wrong secret, got ${resp.status} — ADMIN_SECRET may be unset or the auth check is broken`);
  }
  return "401 as expected";
}

async function checkJsonValidation(path) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (resp.status !== 400) throw new Error(`expected 400 for an empty submission, got ${resp.status}`);
  return "400 as expected";
}

async function checkUploadImageValidation() {
  const resp = await fetch(`${BASE_URL}/api/upload-image`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "not an image",
  });
  if (resp.status !== 400) throw new Error(`expected 400 for a non-image body, got ${resp.status}`);
  return "400 as expected";
}

async function checkSitemap() {
  const resp = await fetch(`${BASE_URL}/sitemap.xml`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("xml")) throw new Error(`unexpected content-type: ${ct}`);
  return `HTTP ${resp.status}, ${ct}`;
}

// Best-effort — a failed prune should never fail the health check run
// itself, same posture as every fire-and-forget cleanup elsewhere in this
// project.
async function pruneOldRows(sbHeaders) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/healthchecks?run_at=lt.${encodeURIComponent(cutoff)}`, {
      method: "DELETE",
      headers: sbHeaders,
    });
  } catch (_) {}
}

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ overall: "fail", error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured — cannot write results" });
    return;
  }

  const runStart = Date.now();

  const checks = await Promise.all([
    ...PAGES.map((p) => runCheck(`page: ${p}`, () => checkPage(p))),
    runCheck("supabase: approved events reachable", checkSupabaseData),
    ...CRON_ENDPOINTS.map((name) => runCheck(`cron auth: ${name}`, () => checkCronAuth(name))),
    ...ADMIN_ENDPOINTS.map((name) => runCheck(`admin auth: ${name}`, () => checkAdminAuth(name))),
    runCheck("submit validation", () => checkJsonValidation("/api/submit")),
    runCheck("submit-feed validation", () => checkJsonValidation("/api/submit-feed")),
    runCheck("upload-image validation", checkUploadImageValidation),
    runCheck("sitemap.xml", checkSitemap),
  ]);

  const overall = checks.every((c) => c.ok) ? "ok" : "fail";
  const durationMs = Date.now() - runStart;

  const sbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/healthchecks`, {
      method: "POST",
      headers: sbHeaders,
      body: JSON.stringify([{ overall, duration_ms: durationMs, checks }]),
    });
  } catch (err) {
    // Even if we can't log the run, still report it in the response itself
    // so it shows up in Vercel's own cron invocation log as a fallback.
    res.status(200).json({ overall, duration_ms: durationMs, checks, logError: err.message });
    return;
  }

  await pruneOldRows(sbHeaders);

  res.status(200).json({ overall, duration_ms: durationMs, failing: checks.filter((c) => !c.ok).map((c) => c.name) });
};
