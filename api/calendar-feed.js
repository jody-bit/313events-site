// Vercel serverless function: GET /calendar.ics (rewrite in vercel.json). A subscribable, read-only ICS feed of the editor's weekly PICKS (is_pick, set in the admin portal), optionally tuned with ?cats=music,food,
// confirmed start times only (rules and the reasons rows are left out live in api/_lib/calendar-feed.js). No email capture, no
// account, no vendor. Reads with the service role, server side only (the anon role has no column grant on is_pick, is_all_day or recurrence_evidence, and
// this adds none): the query is pinned to approved + is_pick rows and the output carries only fields already public on the site.
// A partial read is NEVER served as a feed: calendar clients treat a missing event as deleted, so on any incomplete read this
// answers 503 and the subscriber keeps their last good copy.
const { publicConfig, siteUrl } = require("./_lib/environment");
const { fetchAllPagedRows } = require("./_lib/paged-rows");
const { buildFeed, parseCats, WINDOW_DAYS } = require("./_lib/calendar-feed");

const COLUMNS = "id,title,category,is_pick,status,start_date,end_date,time_display,is_all_day,date_semantics,occurrence_dates,recurrence_evidence,venue_name_raw,venue_address_raw,venue_city_raw,event_url,ticket_url";

module.exports = async (req, res) => {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return res.status(405).end(); }
  const cfg = publicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cfg.ok || !serviceKey) { res.setHeader("Retry-After", "600"); return res.status(503).end(); }
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit" }).format(new Date());
    const last = new Date(Date.parse(today + "T12:00:00Z") + (WINDOW_DAYS - 1) * 86400000).toISOString().slice(0, 10);
    const url = `${cfg.supabaseUrl}/rest/v1/events?status=eq.approved&is_pick=eq.true&start_date=gte.${today}&start_date=lte.${last}&select=${COLUMNS}&order=start_date.asc,id.asc`;
    const result = await fetchAllPagedRows(url, { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` });
    if (!result.ok) { console.warn(`[calendar-feed] incomplete read (${result.rows.length} rows): ${result.error}`); res.setHeader("Retry-After", "600"); return res.status(503).end(); }
    // A good read with zero picks is a valid empty calendar (the week simply has no picks yet). A failed read, including the
    // is_pick column not existing yet, never reaches here: it answered 503 above, so subscribers keep their last good copy.
    const cats = parseCats(req.query && req.query.cats);
    const feed = buildFeed(result.rows, { siteUrl: siteUrl(), today, cats });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="313-events-picks.ics"');
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).send(feed.ics);
  } catch (err) {
    console.warn("[calendar-feed] failed: " + String((err && err.name) || "Error"));
    res.setHeader("Retry-After", "600");
    return res.status(503).end();
  }
};
