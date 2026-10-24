"use strict";

// Vercel Cron: rotating link check (Decision 7). Dry run unless
// LINK_CHECK_MODE=apply; see api/_lib/link-check-run.js for the rules.

const { requireCronAuth } = require("./_lib/cron-auth");
const { run } = require("./_lib/link-check-run");

const SUPABASE_URL = process.env.SUPABASE_URL;
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.LINK_CHECK_MODE === "apply";
const LIMIT = Number(process.env.LINK_CHECK_LIMIT) || 100;

const headers = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

async function loadRows() {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${SUPABASE_URL}/rest/v1/events?select=id,start_date,ticket_url,event_url,link_check_status,link_checked_at` +
    `&status=eq.approved&start_date=gte.${today}&order=start_date.asc&limit=5000`;
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`events read failed: HTTP ${r.status}`);
  return r.json();
}

// Race-safe: only writes if the row still holds the URL that was checked.
async function patchRow(item, fields) {
  const url = `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(item.row.id)}&${item.field}=eq.${encodeURIComponent(item.url)}`;
  const r = await fetch(url, { method: "PATCH", headers: { ...headers(), Prefer: "return=minimal" }, body: JSON.stringify(fields) });
  if (!r.ok) throw new Error(`patch failed: HTTP ${r.status}`);
}

module.exports = async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;
  if (!SUPABASE_URL || !KEY) return res.status(200).json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
  try {
    const stats = await run({ rows: await loadRows(), limit: LIMIT, apply: APPLY, patchFn: patchRow });
    console.log("[cron-link-check]", JSON.stringify(stats));
    return res.status(200).json(stats);
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
};
module.exports.patchRow = patchRow;
