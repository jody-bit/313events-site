const crypto = require("crypto");

// Vercel serverless function powering admin.html's "Resident Advisor Sync"
// section — READ-ONLY observability, nothing else. Per the Product Owner's
// explicit Decision 3 ("Admin V1 is observability, not a fake sync
// button"): this endpoint has no write action of any kind, and there is
// deliberately no "Sync Now" button anywhere calling it, because a plain
// HTTP button click cannot itself trigger ra.co acquisition -- that still
// requires a browser-capable session (see scripts/ra-sync.js's header for
// why). Showing a button that implied otherwise would be worse than
// showing nothing.
//
// GET /api/admin-ra
//   Header: x-admin-secret: <ADMIN_SECRET>
//   -> {
//        latestRun: {
//          runId, startedAt, finishedAt, outcome, incomplete,
//          candidateCount, knownCount, newCount, allNewCount,
//          imported, duplicates, skipped, errors
//        } | null,
//        lastSuccessfulRun: {
//          runId, startedAt, finishedAt,
//          candidateCount, knownCount, newCount,
//          imported, duplicates, skipped, errors
//        } | null
//      }
//
// latestRun is whatever the most recent Resident Advisor source_runs row
// is, REGARDLESS of whether it ever finished -- this is exactly how Admin
// tells an incomplete RA sync apart from a successful one (Decision 5): if
// latestRun.outcome is still "started", the run began (the device called
// the "start" action) but never called "complete" -- RA re-blocked
// mid-run, the browser session died, or it's still genuinely in flight.
// A Claude scheduled task's own "succeeded" status is never consulted
// here; only this table is.
//
// lastSuccessfulRun is surfaced separately so a stale/incomplete latest
// run doesn't hide how long it's actually been since RA sync last really
// worked.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SOURCE_SLUG = "resident-advisor";

// Same "abandoned vs. still running" judgment call migration_035's own
// header leaves to whatever reads source_runs -- this endpoint's own
// threshold. RA sync runs once a day; a "started" row older than this is
// almost certainly abandoned, not still in flight.
const STALE_STARTED_MINUTES = 180;

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

function checkAuth(req, res) {
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: "ADMIN_SECRET not configured on the server." });
    return false;
  }
  const provided = req.headers["x-admin-secret"];
  if (!timingSafeStringEqual(provided || "", ADMIN_SECRET)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function summarizeRun(row) {
  if (!row) return null;
  const sd = row.session_data || {};
  const incomplete = row.outcome === "started";
  const summary = {
    runId: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    outcome: row.outcome,
    incomplete,
    candidateCount: typeof sd.candidateCount === "number" ? sd.candidateCount : null,
    knownCount: typeof sd.knownCount === "number" ? sd.knownCount : null,
    newCount: typeof sd.newIds !== "undefined" ? sd.newIds.length : (typeof sd.allNewCount === "number" ? sd.allNewCount : null),
    allNewCount: typeof sd.allNewCount === "number" ? sd.allNewCount : null,
    imported: typeof sd.imported === "number" ? sd.imported : null,
    duplicates: typeof sd.duplicates === "number" ? sd.duplicates : null,
    skipped: typeof sd.skipped === "number" ? sd.skipped : null,
    errors: typeof sd.errors === "number" ? sd.errors : null,
  };
  if (incomplete) {
    const ageMinutes = (Date.now() - new Date(row.started_at).getTime()) / 60000;
    summary.staleMinutes = Math.round(ageMinutes);
    summary.probablyAbandoned = ageMinutes > STALE_STARTED_MINUTES;
  }
  return summary;
}

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Database not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." });
    return;
  }
  if (!checkAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  try {
    const latestUrl = `${SUPABASE_URL}/rest/v1/source_runs?source_slug=eq.${SOURCE_SLUG}&select=id,started_at,finished_at,outcome,session_data&order=started_at.desc&limit=1`;
    const successUrl = `${SUPABASE_URL}/rest/v1/source_runs?source_slug=eq.${SOURCE_SLUG}&outcome=eq.success&select=id,started_at,finished_at,outcome,session_data&order=started_at.desc&limit=1`;

    const [latestResp, successResp] = await Promise.all([
      fetch(latestUrl, { headers: sbHeaders }),
      fetch(successUrl, { headers: sbHeaders }),
    ]);
    if (!latestResp.ok || !successResp.ok) {
      res.status(502).json({ error: "Could not load Resident Advisor sync history." });
      return;
    }
    const [latestRows, successRows] = await Promise.all([latestResp.json(), successResp.json()]);
    if (!Array.isArray(latestRows) || !Array.isArray(successRows)) {
      res.status(502).json({ error: "Unexpected response shape loading Resident Advisor sync history." });
      return;
    }

    res.status(200).json({
      latestRun: summarizeRun(latestRows[0] || null),
      lastSuccessfulRun: summarizeRun(successRows[0] || null),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.summarizeRun = summarizeRun; // exposed for test/ra-sync.test.js only
