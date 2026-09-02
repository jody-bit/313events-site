// Vercel Cron job — pulls Metro Times' community calendar (Gyrobase CMS).
//
// Metro Times' own EventSearch/listing UI is blocked by robots.txt, but its
// XML sitemap of individual event pages is NOT blocked, and neither are the
// event pages themselves. This scraper reads that sitemap, then fetches a
// bounded batch of the individual event pages it lists.
//
// Verified live before writing:
//   - community.metrotimes.com/detroit/Sitemap.xml?id=Event&view=recent is a
//     real urlset with ~300 <loc> entries, no pagination on this view.
//   - Individual event pages are plain server-rendered HTML (no JS needed).
//   - Venue name/address/geo come through cleanly in <meta> tags:
//       og:street-address, og:locality, og:region, og:latitude, og:longitude
//     which is far more reliable than parsing the visible venue link text.
//   - Date/time is NOT in a meta tag — it's plain body text shaped like
//     "When: Fri., Oct. 9, 7 p.m." (sometimes multiple dates on one line,
//     e.g. "Sun., Sept. 20, 7 p.m. and Sat., Nov. 28, 6 p.m."). No year is
//     given in that text, so a year is inferred (see below).
//
// SCOPE NOTE — why this writes status='pending_review', not 'approved':
// Metro Times' calendar is a general community calendar covering everything
// from concerts to Red Wings games. Unlike HALO/Trinosophes/Redford (single
// arts venues, everything they list is in scope), this feed is unfiltered —
// it will include plenty of events that don't belong on an arts/culture/
// nightlife calendar. Rather than guess a category from the title and
// auto-publish, every row lands in the moderation queue for a human to
// categorize and approve/reject. See admin.html.
//
// VOLUME CAP: the sitemap lists ~300 URLs; fetching all of them one by one
// would run past a serverless function's execution limit. This scrapes a
// bounded batch per run (EVENT_PAGE_LIMIT) in small concurrent groups —
// the daily cron schedule plus external_id-based upsert means later runs
// will keep working through fresh entries over time, not miss them outright.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const SITEMAP_URL = "https://community.metrotimes.com/detroit/Sitemap.xml?id=Event&view=recent";
const EVENT_PAGE_LIMIT = 40; // bounded batch per run — see VOLUME CAP note above
const CONCURRENCY = 5;
const DEFAULT_STATUS = "pending_review"; // see SCOPE NOTE above — unfiltered general calendar, needs human triage
// A standard browser UA, not a self-identifying one — Metro Times' own
// robots.txt already permits crawling this sitemap and its event pages, so
// there's nothing improper about this; a UA string that announces itself as
// a bot is more likely to get caught by generic hosting-provider bot
// filters that have nothing to do with this site's own stated policy.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "Fri., Oct. 9, 7 p.m." or "Sun., Sept. 20, 7 p.m. and Sat., Nov. 28, 6 p.m."
// — captures every "Mon. Day[, ]time" occurrence in the "When:" line.
const WHEN_ENTRY = /([A-Za-z]{3,4})\.?\s+(\d{1,2})(?:,)?\s*(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)?/gi;

function extractSitemapUrls(xml) {
  const urls = [];
  const re = /<loc>(?:<!\[CDATA\[)?(https?:\/\/[^<\]]+)(?:\]\]>)?<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) urls.push(m[1]);
  return urls;
}

// Decodes HTML entities in scraped text. The previous version only handled
// &amp;/&#8217; by name, which missed common WordPress numeric entities like
// &#038; (its usual encoding of "&") — those slipped straight through and
// showed up as literal "&#038;" text on the live site instead of "&".
// Numeric decoding (decimal and hex) is handled generically here so nothing
// needs to be added to a hand-picked list again.
function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function getMeta(html, name) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

function nextOccurrenceOf(monthIdx, day) {
  // No year in the "When:" text — assume the nearest future occurrence of
  // that month/day (Metro Times' "recent" sitemap only lists current/
  // upcoming events, so a past-seeming date almost certainly means next year).
  const now = new Date();
  let year = now.getFullYear();
  let candidate = new Date(year, monthIdx, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3)) {
    year += 1;
    candidate = new Date(year, monthIdx, day);
  }
  return candidate;
}

function parseEventPage(html, url) {
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;
  if (!title) return null;

  const whenMatch = html.match(/When:?<\/[^>]+>\s*([^<]{4,120})|When:\s*([^<\n]{4,120})/i);
  const whenText = whenMatch ? (whenMatch[1] || whenMatch[2] || "").trim() : null;
  if (!whenText) return null;

  const occurrences = [];
  let m;
  WHEN_ENTRY.lastIndex = 0;
  while ((m = WHEN_ENTRY.exec(whenText))) {
    const monthKey = m[1].slice(0, 3).toLowerCase();
    const monthIdx = MONTHS[monthKey];
    if (monthIdx === undefined) continue;
    const day = parseInt(m[2], 10);
    if (!day || day > 31) continue;
    const d = nextOccurrenceOf(monthIdx, day);
    occurrences.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      time: m[3] || null,
    });
  }
  if (!occurrences.length) return null;
  const first = occurrences[0]; // multi-date listings get one row for the first occurrence

  const venueMatch = html.match(/<a[^>]+href="[^"]*\/location\/[^"]*"[^>]*>([^<]+)<\/a>/i);
  const venueName = venueMatch ? decodeEntities(venueMatch[1].trim()) : (getMeta(html, "og:site_name") || "Detroit Metro Times");

  const idMatch = url.match(/-(\d+)$/);
  const id = idMatch ? idMatch[1] : url;

  return {
    external_id: `metrotimes-${id}`,
    title,
    venue_name_raw: venueName,
    start_date: first.date,
    time_display: first.time || null,
    ticket_url: url,
    note: occurrences.length > 1 ? "Metro Times lists multiple dates for this listing — only the first was captured." : null,
  };
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.text();
}

async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  let sitemapXml;
  try {
    sitemapXml = await fetchText(SITEMAP_URL);
    if (!sitemapXml) {
      res.status(200).json({ upserted: 0, error: "Sitemap fetch failed" });
      return;
    }
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Sitemap fetch failed: " + err.message });
    return;
  }

  const urls = extractSitemapUrls(sitemapXml).slice(0, EVENT_PAGE_LIMIT);
  if (!urls.length) {
    res.status(200).json({ upserted: 0, note: "Sitemap returned no event URLs — layout may have changed.", fetchedAt: new Date().toISOString() });
    return;
  }

  const pages = await mapLimit(urls, CONCURRENCY, async (url) => {
    try {
      const html = await fetchText(url);
      return html ? parseEventPage(html, url) : null;
    } catch {
      return null;
    }
  });

  const rows = pages.filter(Boolean).map((e) => ({
    external_id: e.external_id,
    title: e.title,
    category: "music", // placeholder — Metro Times' calendar spans every category; a human sets the real one during moderation
    venue_name_raw: e.venue_name_raw,
    start_date: e.start_date,
    time_display: e.time_display,
    ticket_url: e.ticket_url,
    note: e.note,
    source: "Metro Times",
  }));

  if (!rows.length) {
    res.status(200).json({ upserted: 0, fetchedAt: new Date().toISOString(), checked: urls.length });
    return;
  }

  try {
    // Look up each row's current status before writing, so an admin's
    // approve/reject decision on an existing row isn't reset to
    // DEFAULT_STATUS by this merge-duplicates upsert — for this cron
    // specifically, that meant an admin-approved event getting yanked back
    // into pending_review on the very next run. 2026-09-02 fix for the
    // status-clobbering bug — see cron-lagerhouse.js's header comment for
    // the full story.
    const idList = rows.map((r) => r.external_id).join(",");
    const existingStatusByExternalId = new Map();
    try {
      const lookupResp = await fetch(
        `${SUPABASE_URL}/rest/v1/events?external_id=in.(${idList})&select=external_id,status`,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      if (lookupResp.ok) {
        const existingRows = await lookupResp.json();
        if (Array.isArray(existingRows)) {
          existingRows.forEach((row) => existingStatusByExternalId.set(row.external_id, row.status));
        }
      }
    } catch {
      // Lookup failed — fall through with an empty map, same as this
      // scraper's first-ever run.
    }
    const rowsWithStatus = rows.map((row) => ({
      ...row,
      status: existingStatusByExternalId.get(row.external_id) || DEFAULT_STATUS,
    }));

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rowsWithStatus),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      res.status(502).json({ upserted: 0, error: "Supabase upsert failed: " + errText });
      return;
    }
    res.status(200).json({ upserted: rowsWithStatus.length, checked: urls.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
