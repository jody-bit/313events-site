// Vercel serverless function — generates an XML sitemap listing every
// static page, every approved event's own dedicated page
// (event.html?id=...), and (2026-09-13, now that the venue_id gap is
// closed — see supabase/update_2026-09-13_backfill_venue_id_matched_venues.sql)
// every venue's own dedicated page (venue.html?id=...), so search engines
// can discover and index individual events and venues directly rather than
// only ever seeing them buried inside the single big list page. Wired up
// at the real /sitemap.xml URL via the rewrite in vercel.json (search
// engines expect that exact path — a sitemap living only at /api/sitemap
// would never be found by convention), and referenced from robots.txt.
//
// Regenerated fresh on every request rather than written to disk at build
// time — this project has no build step (see README.md: "Static HTML +
// Vercel serverless functions, no build step"), so a live query is the only
// option, same as every other page's own Supabase fetch. The Cache-Control
// header below still lets Vercel's edge cache absorb repeat crawler hits
// without re-querying Supabase on every single one.
//
// Scope: only approved events from roughly the last week onward — a
// sitemap entry for an event that already happened months ago has no SEO
// value and just dilutes the crawl budget search engines spend on this
// site. Event and venue rows are read with real paging (2026-11-09: the old
// limit=5000 was silently capped at 1,000 rows by the server). The file stays
// under the sitemap protocol's own 50,000-URL limit (MAX_URLS below); revisit
// with a sitemap index file only if approved-event volume ever gets close.

// 2026-09-13 smoke test finding: sitemap.js is the only server-side file in
// this codebase that ever referenced SUPABASE_ANON_KEY — every other
// function uses SUPABASE_SERVICE_ROLE_KEY (see admin-events.js/
// admin-editorial.js/every cron). Vercel's project env vars were never
// actually set up with a SUPABASE_ANON_KEY entry, since nothing else needed
// one — so process.env.SUPABASE_ANON_KEY was undefined in production the
// whole time, the `if (SUPABASE_URL && SUPABASE_ANON_KEY)` guard below
// silently skipped both fetches, and event.html URLs never actually made
// it into the live sitemap despite the code intending to add them. Falling
// back to the same publishable/anon key every client-facing page already
// hardcodes (venue.html, event.html, index.html, calendar.html, map.html —
// explicitly documented there as "safe for client code, read-only via
// RLS") fixes this without depending on a Vercel dashboard change; an
// explicitly-configured env var (if one's ever added later) still wins.
const { publicConfig, siteUrl } = require("./_lib/environment");
const { fetchAllPagedRows } = require("./_lib/paged-rows");
const EventDates = require("../event-dates.js");
// Non-production has NO production fallback (api/_lib/environment.js).
const _cfg = publicConfig();
const SUPABASE_URL = _cfg.ok ? _cfg.supabaseUrl : "";
const SUPABASE_ANON_KEY = _cfg.ok ? _cfg.supabaseAnonKey : "";
const SITE_URL = siteUrl();
// The sitemap protocol allows 50,000 URLs and 50 MB per file. Events are paged in full (api/_lib/paged-rows.js: the server
// caps every request at 1,000 rows whatever limit= asks for); if the total ever exceeds this ceiling, event URLs are cut
// (soonest first) rather than emitting an invalid file, and the cut is logged. Past that, build a sitemap index.
const MAX_URLS = 50000;

function xmlEscape(str) {
  return String(str || "").replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[c]));
}

function floorISO(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

module.exports = async (req, res) => {
  const staticUrls = [
    { loc: `${SITE_URL}/`, changefreq: "hourly", priority: "1.0" },
    { loc: `${SITE_URL}/calendar.html`, changefreq: "hourly", priority: "0.9" },
    // Venue directory (2026-09-13) — the directory *listing* page itself,
    // distinct from the individual venue.html?id=... permalinks generated
    // in venueUrls below (those have been in the sitemap since the venue
    // pages feature shipped; this is the new index page pointing at them).
    { loc: `${SITE_URL}/venues.html`, changefreq: "daily", priority: "0.6" },
    // Neighborhood directory (2026-10-01) — same rationale as venues.html
    // above: the directory *listing* page for all 39 Detroit neighborhoods,
    // including ones with zero upcoming events (the homepage rail only
    // surfaces the top 20 by event count, so this is the only page that
    // links to every neighborhood).
    { loc: `${SITE_URL}/neighborhoods.html`, changefreq: "daily", priority: "0.6" },
    { loc: `${SITE_URL}/submit.html`, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/sources.html`, changefreq: "monthly", priority: "0.3" },
    { loc: `${SITE_URL}/radar.html`, changefreq: "daily", priority: "0.6" },
    { loc: `${SITE_URL}/install.html`, changefreq: "monthly", priority: "0.3" },
  ];

  let eventRows = [];
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      // Upcoming = starts from a week ago on, OR still running / has a later occurrence (end_date >= Detroit today); the shared
      // EventDates rule then decides which of the fetched rows are listed (ongoing exhibitions and recurring series were skipped before).
      const grace = floorISO(7);
      const today = EventDates.detroitClock().iso;
      const url = `${SUPABASE_URL}/rest/v1/events?status=eq.approved&or=(start_date.gte.${grace},end_date.gte.${today})&select=id,updated_at,start_date,end_date,date_semantics,occurrence_dates&order=start_date.asc,id.asc`;
      const result = await fetchAllPagedRows(url, { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` });
      // A partial read is still listed (fail-soft, as before) but is never silent.
      if (!result.ok) console.warn(`[sitemap] events read incomplete (${result.rows.length} rows): ${result.error}`);
      eventRows = result.rows.filter((r) => (r.start_date && r.start_date >= grace) || EventDates.isUpcoming(r, today));
    } catch (err) {
      // Fall through with whatever we have (just the static pages) rather
      // than fail the whole sitemap over one bad Supabase request — a
      // sitemap missing this run's event rows is far better than a sitemap
      // that 500s entirely.
    }
  }

  const eventUrls = eventRows
    .filter((r) => r.id)
    .map((r) => ({
      loc: `${SITE_URL}/event.html?id=${encodeURIComponent(r.id)}`,
      lastmod: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : undefined,
      changefreq: "weekly",
      priority: "0.7",
    }));

  // Every venue gets its own sitemap entry too, not just events with a
  // venue_id set (a venue page is useful/indexable on its own — address,
  // upcoming events list — even independent of any one event). No
  // start_date-style floor applies here since venues aren't time-scoped;
  // the full table is small (~100 rows as of 2026-09-13) so no separate
  // MAX cap is needed. `venues` has no updated_at column (see schema.sql),
  // so lastmod is simply omitted for these, same as any event row missing
  // updated_at above.
  let venueRows = [];
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/venues?select=id&order=name.asc,id.asc`;
      const result = await fetchAllPagedRows(url, { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` });
      if (!result.ok) console.warn(`[sitemap] venues read incomplete (${result.rows.length} rows): ${result.error}`);
      venueRows = result.rows;
    } catch (err) {
      // Same fail-soft behavior as the event fetch above — a sitemap
      // missing venue rows this run is far better than a 500.
    }
  }

  const venueUrls = venueRows
    .filter((r) => r.id)
    .map((r) => ({
      loc: `${SITE_URL}/venue.html?id=${encodeURIComponent(r.id)}`,
      changefreq: "weekly",
      priority: "0.6",
    }));

  const eventRoom = Math.max(0, MAX_URLS - staticUrls.length - venueUrls.length);
  if (eventUrls.length > eventRoom) {
    console.warn(`[sitemap] ${eventUrls.length} event URLs exceed the ${MAX_URLS}-URL file limit; keeping the soonest ${eventRoom}`);
  }
  const allUrls = [...staticUrls, ...eventUrls.slice(0, eventRoom), ...venueUrls];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    allUrls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${xmlEscape(u.loc)}</loc>\n` +
          (u.lastmod ? `    <lastmod>${xmlEscape(u.lastmod)}</lastmod>\n` : "") +
          `    <changefreq>${u.changefreq}</changefreq>\n` +
          `    <priority>${u.priority}</priority>\n` +
          `  </url>\n`
      )
      .join("") +
    `</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600"); // Vercel edge cache absorbs crawler traffic; refreshes hourly
  res.status(200).send(body);
};
