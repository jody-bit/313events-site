// Vercel Cron job — pulls a fixed, curated list of local Detroit outlets'
// own RSS/Atom feeds, stores just enough to point back to each article
// (title/excerpt/url/source/thumbnail — NEVER the full article body, see
// migration_011_editorial_articles.sql), then matches each article to a
// specific event in `events` by venue/title text so index.html can render
// "As seen in: [Article title] →" on that one event's row.
//
// OUTLET LIST — curated here, not self-service (contrast feed_sources /
// cron-feeds.js, which polls organizer-submitted feeds): editorial
// coverage isn't submitted by the outlets themselves, so there's no
// approval-queue model that fits. Verified live before writing (2026-08-27):
//   - Metro Times: metrotimes.com/syndication/ documents per-section partner
//     feeds at metrotimes.com/feed/?partner-feed=<section> — the
//     "arts-culture" section is real, valid RSS 2.0, and is Metro Times'
//     EDITORIAL writing, distinct from the community-calendar sitemap
//     api/cron-metrotimes.js already scrapes (that one is event listings,
//     not articles — no overlap).
//   - BridgeDetroit: bridgedetroit.com/feed is real, valid RSS 2.0 (linked
//     from the site's own footer).
//   - WDET: wdet.org/feed/ is real, valid RSS 2.0 — WDET's general
//     news/arts feed, which regularly includes its own "Metro Events Guide"
//     roundups alongside straight news, both fine matching candidates.
//   - Model D Media: found via a third-party RSS directory pairing
//     "Model D" with feeds.feedburner.com/ModelDMedia. NOT independently
//     hit-tested against the live feed (this project's sandbox couldn't
//     fetch feedburner.com directly) — first live run's last_poll_result
//     (see the results array this handler returns) will confirm or refute
//     it; if it 404s, this row's next run just reports that plainly rather
//     than silently doing nothing, same "fail soft, document honestly"
//     convention as every other cron here.
//   - Hour Detroit was asked for but is NOT included: no public RSS feed
//     could be confirmed for hourdetroit.com by any means available while
//     writing this (no <link rel="alternate"> found, no third-party
//     directory listing, no working /feed/ guess). Guessing a feed URL
//     that might not exist isn't worth silently failing every run — add it
//     here once a real feed URL is confirmed.
const OUTLETS = [
  { source: "Metro Times", feedUrl: "https://www.metrotimes.com/feed/?partner-feed=arts-culture" },
  { source: "BridgeDetroit", feedUrl: "https://www.bridgedetroit.com/feed" },
  { source: "WDET", feedUrl: "https://wdet.org/feed/" },
  { source: "Model D", feedUrl: "https://feeds.feedburner.com/ModelDMedia" },
];

// Matching window: how far an event's start_date can be from "now" to even
// be considered a candidate. Editorial coverage of an event is almost
// always published in the run-up to it (previews, "what to do this
// weekend" roundups) or, less often, just after (recaps) — so this is
// asymmetric on purpose: a wide look-ahead, a short look-back.
const CANDIDATE_DAYS_BACK = 5;
const CANDIDATE_DAYS_AHEAD = 60;

// A venue-name match alone is too weak on its own — "The Fillmore" or
// "Masonic Temple" appears in dozens of unrelated articles. It only counts
// when corroborated by the article's publish date landing within this many
// days of the event's own start_date (see match_type='venue_date').
const VENUE_MATCH_MAX_DAY_GAP = 21;

// A title (or venue name) shorter than this is too generic to trust as a
// substring match on its own (e.g. "Live", "Detroit", "Show") — skipped
// rather than risk a false positive.
const MIN_MATCHABLE_LENGTH = 6;

// How much of an article's description to keep as `excerpt`. Plenty for
// the "As seen in" link's tooltip and for a possible future teaser; nowhere
// near the full article, which is the point (see migration_011's header).
const EXCERPT_MAX_LENGTH = 280;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Same generic numeric/named entity decoder used across every other cron in
// this project (see e.g. cron-wdet.js, cron-metrotimes.js) — kept in sync
// deliberately rather than shared via an import, matching this project's
// existing one-file-per-cron convention (Vercel deploys each api/*.js as an
// independent serverless function).
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

function stripHtml(str) {
  if (!str) return "";
  return decodeEntities(str.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

function normalize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// ---- RSS/Atom parsing ----
// Every outlet in OUTLETS above is a plain RSS 2.0 <item> feed (verified
// live per the header note) — this does not attempt full generic Atom
// support, matching this project's "verify live before writing" convention
// rather than writing speculative code for a feed shape not actually in use.

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return cdata ? cdata[1].trim() : v;
}

function extractThumbnail(itemXml) {
  // Checks, in order: media:thumbnail, media:content (image type), and a
  // plain <enclosure> with an image MIME type — covers the handful of
  // shapes WordPress-family feeds (which all four outlets above run on)
  // actually use.
  let m = itemXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (m) return m[1];
  m = itemXml.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*medium=["']image["']/i)
    || itemXml.match(/<media:content[^>]+medium=["']image["'][^>]*url=["']([^"']+)["']/i)
    || itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (m) return m[1];
  m = itemXml.match(/<enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["']/i)
    || itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["']/i);
  if (m) return m[1];
  return null;
}

function parseRssItems(xml) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml))) {
    const itemXml = m[1];
    const rawTitle = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    if (!rawTitle || !link) continue;
    const pubDateRaw = extractTag(itemXml, "pubDate") || extractTag(itemXml, "dc:date");
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    const description = extractTag(itemXml, "description") || extractTag(itemXml, "content:encoded");
    items.push({
      title: decodeEntities(rawTitle),
      url: link.trim(),
      publishedAt: pubDate && !isNaN(pubDate.getTime()) ? pubDate.toISOString() : null,
      excerpt: stripHtml(description).slice(0, EXCERPT_MAX_LENGTH),
      thumbnailUrl: extractThumbnail(itemXml),
    });
  }
  return items;
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" } });
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.text();
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T12:00:00");
  const b = new Date(isoB + "T12:00:00");
  return Math.abs(Math.round((a - b) / 86400000));
}

// Finds the best candidate event for one article, or null. See the module
// header + MIN_MATCHABLE_LENGTH/VENUE_MATCH_MAX_DAY_GAP for the reasoning;
// this is intentionally conservative (no match beats a wrong match) — the
// same "silent wrongness" this project has already been burned by once
// with HTML entities is exactly the failure mode this guards against here.
function matchArticleToEvent(article, candidateEvents) {
  const haystack = normalize(`${article.title} ${article.excerpt}`);
  const articleDateIso = (article.publishedAt || new Date().toISOString()).slice(0, 10);

  let best = null; // { event, matchType, dayGap }
  for (const ev of candidateEvents) {
    const normTitle = normalize(ev.title);
    if (normTitle.length >= MIN_MATCHABLE_LENGTH && haystack.includes(normTitle)) {
      const dayGap = daysBetween(articleDateIso, ev.start_date);
      if (!best || best.matchType !== "title" || dayGap < best.dayGap) {
        best = { event: ev, matchType: "title", dayGap };
      }
      continue;
    }
    if (best && best.matchType === "title") continue; // a title match always outranks a venue_date match
    const normVenue = normalize(ev.venue_name_raw);
    if (normVenue.length >= MIN_MATCHABLE_LENGTH && haystack.includes(normVenue)) {
      const dayGap = daysBetween(articleDateIso, ev.start_date);
      if (dayGap <= VENUE_MATCH_MAX_DAY_GAP && (!best || dayGap < best.dayGap)) {
        best = { event: ev, matchType: "venue_date", dayGap };
      }
    }
  }
  return best;
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  const sbHeaders = {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  const now = new Date();
  const floor = new Date(now); floor.setDate(floor.getDate() - CANDIDATE_DAYS_BACK);
  const ceiling = new Date(now); ceiling.setDate(ceiling.getDate() + CANDIDATE_DAYS_AHEAD);

  let candidateEvents;
  try {
    const evUrl = `${SUPABASE_URL}/rest/v1/events?status=eq.approved&start_date=gte.${toISO(floor)}&start_date=lte.${toISO(ceiling)}&select=id,title,venue_name_raw,start_date`;
    const r = await fetch(evUrl, { headers: sbHeaders });
    candidateEvents = await r.json();
    if (!Array.isArray(candidateEvents)) throw new Error("Unexpected response shape loading candidate events");
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Failed to load candidate events: " + err.message });
    return;
  }

  const results = [];
  let totalUpserted = 0;
  let totalMatched = 0;

  for (const outlet of OUTLETS) {
    let outletResult;
    try {
      const xml = await fetchText(outlet.feedUrl);
      const items = parseRssItems(xml);
      if (!items.length) {
        outletResult = "Fetched OK — 0 items parsed (feed may be empty or in an unsupported shape)";
      } else {
        const rows = items.map((item) => {
          const match = matchArticleToEvent(item, candidateEvents);
          if (match) totalMatched++;
          return {
            source: outlet.source,
            feed_url: outlet.feedUrl,
            title: item.title,
            excerpt: item.excerpt || null,
            url: item.url,
            thumbnail_url: item.thumbnailUrl || null,
            published_at: item.publishedAt,
            matched_event_id: match ? match.event.id : null,
            match_type: match ? match.matchType : null,
          };
        });

        const upsertResp = await fetch(`${SUPABASE_URL}/rest/v1/editorial_articles?on_conflict=url`, {
          method: "POST",
          headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(rows),
        });
        if (!upsertResp.ok) {
          const errText = await upsertResp.text();
          outletResult = `Parsed ${rows.length} item${rows.length === 1 ? "" : "s"} but Supabase upsert failed: ${errText}`;
        } else {
          totalUpserted += rows.length;
          const matchedHere = rows.filter((r) => r.matched_event_id).length;
          outletResult = `${rows.length} item${rows.length === 1 ? "" : "s"} found, ${matchedHere} matched to an event`;
        }
      }
    } catch (err) {
      outletResult = "Error: " + err.message;
    }
    results.push({ source: outlet.source, feedUrl: outlet.feedUrl, result: outletResult });
  }

  res.status(200).json({
    upserted: totalUpserted,
    matched: totalMatched,
    candidateEvents: candidateEvents.length,
    outletsChecked: OUTLETS.length,
    results,
    fetchedAt: new Date().toISOString(),
  });
};
