// Vercel serverless function — generates an XML sitemap listing every
// static page plus every approved event's own dedicated page
// (event.html?id=...), so search engines can discover and index individual
// events directly rather than only ever seeing them buried inside the
// single big list page. Wired up at the real /sitemap.xml URL via the
// rewrite in vercel.json (search engines expect that exact path — a
// sitemap living only at /api/sitemap would never be found by convention),
// and referenced from robots.txt.
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
// site. 5,000-row cap is far under the sitemap protocol's own 50,000-URL
// limit; revisit with real pagination (a sitemap index file referencing
// several child sitemaps) only if approved-event volume ever gets close.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE_URL = "https://313.events";
const MAX_EVENTS = 5000;

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
    { loc: `${SITE_URL}/submit.html`, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/sources.html`, changefreq: "monthly", priority: "0.3" },
    { loc: `${SITE_URL}/radar.html`, changefreq: "daily", priority: "0.6" },
  ];

  let eventRows = [];
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/events?status=eq.approved&start_date=gte.${floorISO(7)}&select=id,updated_at&order=start_date.asc&limit=${MAX_EVENTS}`;
      const resp = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (resp.ok) {
        const rows = await resp.json();
        if (Array.isArray(rows)) eventRows = rows;
      }
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

  const allUrls = [...staticUrls, ...eventUrls];
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
