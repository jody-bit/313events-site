// Vercel serverless function: GET /calendar.ics (rewrite in vercel.json). A subscribable, read-only ICS feed of the next 14 days,
// confirmed start times only (rules and the reasons rows are left out live in api/_lib/calendar-feed.js). No email capture, no
// account, no vendor. Reads approved events with the same public key and paging every other public read uses.
// A partial read is NEVER served as a feed: calendar clients treat a missing event as deleted, so on any incomplete read this
// answers 503 and the subscriber keeps their last good copy.
const { publicConfig, siteUrl } = require("./_lib/environment");
const { fetchAllPagedRows } = require("./_lib/paged-rows");
const { buildFeed, WINDOW_DAYS } = require("./_lib/calendar-feed");

const COLUMNS = "id,title,status,start_date,end_date,time_display,is_all_day,date_semantics,occurrence_dates,recurrence_evidence,venue_name_raw,venue_address_raw,venue_city_raw,event_url,ticket_url";

module.exports = async (req, res) => {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return res.status(405).end(); }
  const cfg = publicConfig();
  if (!cfg.ok) return res.status(503).setHeader("Retry-After", "600").end();
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit" }).format(new Date());
    const last = new Date(Date.parse(today + "T12:00:00Z") + (WINDOW_DAYS - 1) * 86400000).toISOString().slice(0, 10);
    const url = `${cfg.supabaseUrl}/rest/v1/events?status=eq.approved&start_date=gte.${today}&start_date=lte.${last}&select=${COLUMNS}&order=start_date.asc,id.asc`;
    const result = await fetchAllPagedRows(url, { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}` });
    if (!result.ok) { console.warn(`[calendar-feed] incomplete read (${result.rows.length} rows): ${result.error}`); res.setHeader("Retry-After", "600"); return res.status(503).end(); }
    const feed = buildFeed(result.rows, { siteUrl: siteUrl(), today });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="313-events-next-14-days.ics"');
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).send(feed.ics);
  } catch (err) {
    console.warn("[calendar-feed] failed: " + String((err && err.name) || "Error"));
    res.setHeader("Retry-After", "600");
    return res.status(503).end();
  }
};
