const crypto = require("crypto");
// Vercel serverless function powering the health-check banner at the top of
// admin.html. Read-only, GET-only — cron-healthcheck.js is the only writer
// to the `healthchecks` table (migration_019). Same ADMIN_SECRET gate as
// api/admin-events.js / api/admin-feeds.js.
//
// GET /api/admin-healthcheck -> the most recent run, plus whether the last
//                               5 runs were all clean (so a single blip
//                               doesn't read as a persistent outage, but a
//                               genuine multi-run streak does).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

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
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/healthchecks?select=run_at,overall,duration_ms,checks&order=run_at.desc&limit=5`,
      { headers: sbHeaders }
    );
    const rows = await resp.json();
    if (!resp.ok) {
      res.status(502).json({ error: rows });
      return;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(200).json({ latest: null, streakOk: null });
      return;
    }
    const latest = rows[0];
    const streakOk = rows.every((r) => r.overall === "ok");
    res.status(200).json({ latest, streakOk, runsConsidered: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
