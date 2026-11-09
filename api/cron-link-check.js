"use strict";

// Vercel Cron: rotating link check (Decision 7). Dry run unless
// LINK_CHECK_MODE=apply; see api/_lib/link-check-run.js for the rules.

const { requireCronAuth } = require("./_lib/cron-auth");
const { run } = require("./_lib/link-check-run");
const { fetchAllPagedRows } = require("./_lib/paged-rows");
const EventDates = require("../event-dates.js");

const SUPABASE_URL = process.env.SUPABASE_URL;
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.LINK_CHECK_MODE === "apply";
const LIMIT = Number(process.env.LINK_CHECK_LIMIT) || 100;

const headers = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

// source: events.source filter (ilike), for a targeted run such as the 36 never-checked VisitDetroit URLs.
async function loadRows(source) {
  // Detroit's date (not UTC, which is already tomorrow after 7-8 PM) and the shared upcoming rule: a still-running exhibition or a
  // series with a later occurrence is checked too. Only the candidate pool widens; selection (LINK_CHECK_LIMIT) and writes are unchanged.
  const today = EventDates.detroitClock().iso;
  const url = `${SUPABASE_URL}/rest/v1/events?select=id,title,start_date,end_date,date_semantics,occurrence_dates,ticket_url,event_url,link_check_status,link_checked_at` +
    `&status=eq.approved&or=(start_date.gte.${today},end_date.gte.${today})${source ? `&source=ilike.${encodeURIComponent(`*${source}*`)}` : ""}&order=start_date.asc,id.asc`;
  // Paged in full: the server caps every request at 1,000 rows whatever limit= asks for, so the old limit=5000 read only
  // checked the first 1,000 upcoming rows. A partial read throws (the handler reports it) rather than silently shrinking the pool.
  const result = await fetchAllPagedRows(url, headers());
  if (!result.ok) throw new Error(`events read failed after ${result.rows.length} rows: ${result.error}`);
  return result.rows.filter((r) => EventDates.isUpcoming(r, today));
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
    // Targeted dry runs (dry mode never advances link_checked_at, so a plain run re-selects the same rows):
    //   ?source=visitdetroit  only that source;  ?only=never  only never-checked rows;  ?detail=1  per-row results (max 200)
    const q = req.query || {};
    const source = typeof q.source === "string" ? q.source.slice(0, 60) : "";
    const stats = await run({ rows: await loadRows(source), limit: LIMIT, apply: APPLY, patchFn: patchRow, onlyNever: q.only === "never", detail: q.detail === "1" });
    console.log("[cron-link-check]", JSON.stringify(stats));
    return res.status(200).json(stats);
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
};
module.exports.patchRow = patchRow;
