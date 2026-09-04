const crypto = require("crypto");
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
//   - Detroit Music Magazine: hit-tested live (2026-08-28) at
//     detroitmusicmag.com/feed/atom/ — real, valid, but ATOM not RSS 2.0
//     (<entry>/<link href=".."/>/<published>/<summary>, not <item>/<link>
//     text/<pubDate>/<description>). This is the outlet with real Detroit
//     techno/electronic coverage (Movement Festival reviews, etc.) plus its
//     own Events section — parseFeedItems() below was extended to handle
//     both shapes so this one isn't left out just because of format.
//   - Hour Detroit, PLAYGROUND DETROIT, Eater Detroit, Hip In Detroit: added
//     on their platform's own standard feed path (WordPress /feed/, Vox
//     Media /rss/index.xml, Blogger /feeds/posts/default) but NOT
//     independently hit-tested against the live feed the way the four
//     outlets above were — same "couldn't fetch it directly, add it and let
//     the run report the truth" situation already documented for Model D
//     below, not a claim these definitely work. Hour Detroit specifically
//     was investigated once before and excluded for lack of any confirmable
//     feed at all; this is a second attempt on the same unresolved
//     question, not new evidence it exists — if results.source="Hour
//     Detroit" comes back 404/error on the first run, that's this guess
//     being wrong, not a new bug.
//   - Ann Arbor Observer: added 2026-08-28 from a Jody-supplied list of ~29
//     Metro Detroit media outlets, researched against the 75-mile Detroit
//     Orbit boundary in SERVICE_AREA.md (Ann Arbor is 36mi — in scope).
//     Independently hit-tested live via a real browser fetch (this
//     project's own sandbox can't reach most outside hosts directly, see
//     sources.html's "Investigated — Inconclusive" entries for outlets that
//     couldn't get this same confirmation): annarborobserver.com/feed/ is a
//     real, live WordPress RSS 2.0 feed, most recent items dated the same
//     day as the check. robots.txt is permissive (only disallows
//     /wp-login.php and /wp-admin/, standard WordPress defaults; no
//     AI-crawler blocklist) but does set `Crawl-delay: 600` — a Vercel Cron
//     firing far less often than every 10 minutes already respects that, so
//     no special handling was needed. No Terms of Service page could be
//     found at either of this site's two standard paths (/terms/,
//     /terms-of-service/ both 404) to check for a scraping restriction the
//     way Model D's or Eventbrite's explicitly do (see sources.html) — its
//     general feed mixes real event previews (tagged "Event Reviews" —
//     concert/exhibit coverage at UMMA, Hill Auditorium, etc.) in with
//     ordinary news, obituaries, and real estate features, which is exactly
//     what looksLikeEventCoverage() below already exists to sort out, same
//     as WDET's mixed general feed.
//     Of the other 19 outlets from that same list, most weren't added — see
//     sources.html's "Editorial & news coverage" section for the full
//     outcome of each (explicit ToS/robots.txt blocks, confirmed wrong
//     content type, or a real feed this project's sandbox simply couldn't
//     independently confirm, which is a tooling gap, not a finding that
//     they don't work).
//   - C&G Newspapers, Grosse Pointe News, Michigan Chronicle: added
//     2026-08-28, same batch as Ann Arbor Observer above but on a SECOND
//     pass — Jody pushed back ("could we really find NOTHING in all of
//     those media outlet feeds?") after the first pass only added one
//     outlet, and she was right to: the first pass leaned on subagents
//     whose own sandboxes couldn't reliably reach these sites and reported
//     "no feed found" for two of these three, when a direct browser fetch
//     (this project's one tool with real, unrestricted network access)
//     shows all three have real, live, standard WordPress RSS 2.0 feeds at
//     the standard /feed/ path — genuine local news with real event
//     coverage mixed in (Michigan Chronicle: "40 Under 40" honoree
//     coverage; C&G/Grosse Pointe News: municipal news plus real
//     Life & Leisure / community-event pieces). robots.txt checked live for
//     all three: C&G and Grosse Pointe News are fully permissive (only the
//     standard wp-admin disallow). Michigan Chronicle's is also permissive
//     of the /feed/ path itself, but sets `Request-rate: 1/20`,
//     `Crawl-delay: 22`, and `Visit-time: 0700-1300` (UTC) — a courtesy
//     window this project doesn't currently enforce per-outlet (every cron
//     just runs on Vercel's own schedule); flagged here rather than quietly
//     ignored. A single once-daily fetch is a trivial load either way, but
//     if this outlet's cron schedule is ever tuned specifically, keep it
//     inside that window.
//     This second pass also caught the inverse mistake: El Central Hispanic
//     News (elcentralmedia.com) DOES have a real, content-rich feed, but
//     its own robots.txt explicitly disallows /feed/ (a default Yoast SEO
//     block, not clearly deliberate anti-scraping — but this project
//     respects robots.txt regardless of the site's apparent intent, same
//     posture as every other entry in sources.html's robots.txt-blocked
//     section) — NOT added, despite the feed working. See sources.html.
const OUTLETS = [
  { source: "Metro Times", feedUrl: "https://www.metrotimes.com/feed/?partner-feed=arts-culture" },
  { source: "BridgeDetroit", feedUrl: "https://www.bridgedetroit.com/feed" },
  { source: "WDET", feedUrl: "https://wdet.org/feed/" },
  { source: "Model D", feedUrl: "https://feeds.feedburner.com/ModelDMedia" },
  { source: "Detroit Music Magazine", feedUrl: "https://www.detroitmusicmag.com/feed/atom/" },
  { source: "Hour Detroit", feedUrl: "https://www.hourdetroit.com/feed/" },
  { source: "PLAYGROUND DETROIT", feedUrl: "https://playgrounddetroit.com/feed/" },
  { source: "Eater Detroit", feedUrl: "https://detroit.eater.com/rss/index.xml" },
  { source: "Hip In Detroit", feedUrl: "https://www.hipindetroit.com/feeds/posts/default?alt=rss" },
  { source: "Ann Arbor Observer", feedUrl: "https://annarborobserver.com/feed/" },
  { source: "C&G Newspapers", feedUrl: "https://www.candgnews.com/feed/" },
  { source: "Grosse Pointe News", feedUrl: "https://www.grossepointenews.com/feed/" },
  { source: "Michigan Chronicle", feedUrl: "https://michiganchronicle.com/feed/" },
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

// Retroactive re-match window for ALREADY-STORED unmatched articles (see
// retryUnmatchedArticles() below) — deliberately much wider than the -5/+60
// day window above, which is tuned for freshly-fetched articles against
// near-term events. An old article sitting unmatched in the queue may only
// find its event MONTHS after ingestion — e.g. a roundup article already
// mentioning a festival before that festival's full season of dates ever got
// added to the database (exactly what happened the week this was built,
// 2026-09-04) — so this pass checks against every current/future event, not
// just a narrow window around "now".
const RETRY_CANDIDATE_DAYS_BACK = 90;

// 2026-09-04 (Jody: "if an event is happening in the past, I don't need the
// article that goes with it") — an unmatched article that's still sitting in
// admin.html's Press Coverage queue this long after publication has already
// had its shot at matching a real event through every wider-window pass this
// file runs (including RETRY_CANDIDATE_DAYS_BACK above, itself already wider
// than this). At that point it's essentially certain the event it covered
// has come and gone without ever making it into 313.events, and there's no
// realistic future event left for it to match — so retryUnmatchedArticles()
// below auto-dismisses it (admin_dismissed=true, same reversible flag the
// "Not a fit" button sets — never a hard delete) rather than leaving it to
// clutter the queue forever. Set comfortably past RETRY_CANDIDATE_DAYS_BACK
// so an article isn't dismissed while it might still have a plausible match
// pending. One-time cleanup of the pre-existing backlog (the three 2018
// Detroit Music Magazine articles Jody's screenshot showed) is handled
// separately by supabase/update_2026-09-04_dismiss_stale_editorial.sql,
// since this only runs going forward on the cron schedule.
const STALE_ARTICLE_DISMISS_DAYS = 120;

// A title (or venue name) shorter than this is too generic to trust as a
// substring match on its own (e.g. "Live", "Detroit", "Show") — skipped
// rather than risk a false positive.
const MIN_MATCHABLE_LENGTH = 6;

// How much of an article's description to keep as `excerpt`. Plenty for
// the "As seen in" link's tooltip and for a possible future teaser; nowhere
// near the full article, which is the point (see migration_011's header).
const EXCERPT_MAX_LENGTH = 280;

// 2026-08-28 (Jody, after radar.html started showing every unmatched
// article as a "General coverage" card): outlets like WDET publish a single
// general news/arts RSS feed that mixes real event previews in with daily
// news-show segments and recurring music columns — see this file's own
// OUTLETS comment, "WDET's general news/arts feed" — and this project had
// no topical filter before this point, only the event-MATCHING step above.
// That was a reasonable design as long as an unmatched row was stored but
// never shown to a visitor; once radar.html started rendering every
// unmatched row as its own card, that same daily-news content started
// reading as if 313.events considered "Wayne County Reports First Human
// West Nile Virus Case" or "Dolly Parton, Queen of Country, Has Died" to be
// event coverage. These two lists exist to stop that at the source, before
// a non-event row is even stored, rather than trying to filter it back out
// on the display side.
//
// NON_EVENT_SEGMENT_PREFIXES: known recurring news-show/column names these
// outlets publish that are NEVER about one specific event, matched against
// the start of the normalize()'d title (every one of these follows a
// "Segment Name: topic" or "Segment Name (dates)" convention). An article
// that already matched a real event (see matchArticleToEvent() above)
// always bypasses this — a "Visions:" segment that happens to preview a
// real, matchable event (e.g. "Visions: Detroit Jazz Festival preview",
// seen live 2026-08-28) still gets through and is correctly shown as that
// event's own coverage; this list only affects articles nothing already
// matched. Extend as new noisy recurring segments turn up.
const NON_EVENT_SEGMENT_PREFIXES = [
  "the metro", "detroit evening report", "in the groove", "big sonic heaven",
  "mi local", "the shake out", "visions", "acoustic caf", "rob reinhart",
  "container on the metro", "free will astrology", "michmash",
  "metro events guide",
];

// EVENT_SIGNAL_RE: for any unmatched article NOT caught by the denylist
// above, require at least one loose event-indicating word in its title or
// excerpt before it's stored at all. Deliberately loose/keyword-based
// rather than another attempt at precise matching — the bar here is much
// lower than matchArticleToEvent()'s ("is this even plausibly about an
// event," not "which one"). Verified against every unmatched article live
// on radar.html on 2026-08-28: correctly keeps genuine misses ("Colors Wine
// Fest Returns to Detroit," "Comedian Jim Gaffigan Adds Second Fox Theatre
// Show," "Michigan Renaissance Festival Returns...") while excluding
// ordinary news, politics, and community journalism. False negatives (a
// real event preview that happens to avoid all of these words) are an
// accepted cost — same "no match beats a wrong match" posture as
// matchArticleToEvent() itself, extended here to "no display beats
// irrelevant display."
const EVENT_SIGNAL_RE = /\b(festival|fest|concert|tour|screening|exhibit(ion)?|showcase|matinee|gala|expo|parade|market days?|art fair|open mic|trivia night|ticket|opening reception)\b/i;

function looksLikeEventCoverage(item) {
  const title = normalize(item.title);
  if (NON_EVENT_SEGMENT_PREFIXES.some((prefix) => title.startsWith(prefix))) return false;
  return EVENT_SIGNAL_RE.test(`${item.title} ${item.excerpt || ""}`);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Timing-safe secret comparison — a plain `!==` string compare leaks how
// many leading characters matched via response timing, since JS's string
// equality short-circuits at the first mismatched character. That's a real,
// if narrow, side channel against CRON_SECRET / ADMIN_SECRET. Buffers of
// different lengths still get run through timingSafeEqual (against
// themselves) rather than returning immediately, so a length mismatch takes
// the same code path as a same-length mismatch instead of returning early.
// Added 2026-09-02 site audit.
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
// The original four outlets are all plain RSS 2.0 <item> feeds; Detroit
// Music Magazine (added 2026-08-28) is Atom <entry> instead — same
// information, different tag names (<link href=".."/> not <link>text</link>,
// <published>/<updated> not <pubDate>, <summary>/<content> not
// <description>). parseFeedItems() below detects which shape a feed is in
// and extracts accordingly, rather than maintaining two separate call paths.

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

// Atom's <link> is a self-closing, attribute-only tag — often more than one
// per entry (rel="alternate" is the actual article; feeds sometimes also
// carry a rel="self"/rel="edit" link pointing at the feed/API, not the
// article). Prefers rel="alternate", falls back to the first href found so
// a feed that omits rel entirely on a single <link> still resolves.
function extractAtomLink(entryXml) {
  const linkRe = /<link\b[^>]*\/?>/gi;
  let m, firstHref = null;
  while ((m = linkRe.exec(entryXml))) {
    const hrefMatch = m[0].match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    if (!firstHref) firstHref = hrefMatch[1];
    const relMatch = m[0].match(/rel=["']([^"']+)["']/i);
    if (!relMatch || relMatch[1] === "alternate") return hrefMatch[1];
  }
  return firstHref;
}

function parseFeedItems(xml) {
  const isAtom = /<entry[\s>]/i.test(xml);
  const items = [];
  const blockRe = isAtom ? /<entry[^>]*>([\s\S]*?)<\/entry>/gi : /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = blockRe.exec(xml))) {
    const itemXml = m[1];
    const rawTitle = extractTag(itemXml, "title");
    const link = isAtom ? extractAtomLink(itemXml) : extractTag(itemXml, "link");
    if (!rawTitle || !link) continue;
    const pubDateRaw = extractTag(itemXml, "pubDate") || extractTag(itemXml, "dc:date")
      || extractTag(itemXml, "published") || extractTag(itemXml, "updated");
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    const description = extractTag(itemXml, "description") || extractTag(itemXml, "content:encoded")
      || extractTag(itemXml, "summary") || extractTag(itemXml, "content");
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

// ---- Retroactive re-match (2026-09-04) ----
// Jody: "can we re-crawl the media to automatically associate the press to
// the event so I don't have to do it by hand?" The per-outlet loop below
// only ever re-evaluates whatever's CURRENTLY in each outlet's live RSS feed
// — an article that aged out of the feed (the normal case; feeds only carry
// recent items) never gets its match re-attempted, even after a new event
// gets added that it would now match. This pass closes that gap: it reloads
// every still-unmatched, non-dismissed article already in the table
// (exactly what shows in admin.html's Press Coverage queue) and re-runs the
// same matchArticleToEvent() against a much wider candidate window than the
// per-outlet loop uses (see RETRY_CANDIDATE_DAYS_BACK above) — wide enough to
// cover events that didn't exist yet when the article was first ingested.
// Runs on every scheduled invocation of this cron from now on, so this
// self-heals going forward without a one-off manual trigger every time new
// events get added — though Jody can still trigger this cron on-demand from
// Vercel's dashboard to apply it immediately rather than waiting for the
// next scheduled run. Writes the same two places api/admin-editorial.js's
// link_event action does (matched_event_id, guarded to only ever set it once
// per article, plus a row in the editorial_article_events join table —
// migration_021) so an auto-found match reads back identically to a manual
// one everywhere on the site.
async function retryUnmatchedArticles(sbHeaders) {
  const now = new Date();
  const floor = new Date(now); floor.setDate(floor.getDate() - RETRY_CANDIDATE_DAYS_BACK);

  let unmatched;
  try {
    const url = `${SUPABASE_URL}/rest/v1/editorial_articles?matched_event_id=is.null&admin_dismissed=eq.false&select=id,title,excerpt,url,published_at`;
    const r = await fetch(url, { headers: sbHeaders });
    unmatched = await r.json();
    if (!Array.isArray(unmatched)) throw new Error("Unexpected response shape loading unmatched articles");
  } catch (err) {
    return { checked: 0, matched: 0, error: "Failed to load unmatched articles: " + err.message };
  }
  if (!unmatched.length) return { checked: 0, matched: 0 };

  let wideCandidates;
  try {
    // status=in.(approved,pending_review) — same "check pending too" call
    // api/admin-events.js's includePending search already makes: a real
    // match still sitting in the submission queue is exactly what this pass
    // is for, not just already-live events.
    const evUrl = `${SUPABASE_URL}/rest/v1/events?status=in.(approved,pending_review)&start_date=gte.${toISO(floor)}&select=id,title,venue_name_raw,start_date`;
    const r = await fetch(evUrl, { headers: sbHeaders });
    wideCandidates = await r.json();
    if (!Array.isArray(wideCandidates)) throw new Error("Unexpected response shape loading candidate events");
  } catch (err) {
    return { checked: unmatched.length, matched: 0, error: "Failed to load candidate events: " + err.message };
  }

  let matchedCount = 0;
  let dismissedStaleCount = 0;
  const staleFloor = new Date(now); staleFloor.setDate(staleFloor.getDate() - STALE_ARTICLE_DISMISS_DAYS);
  for (const article of unmatched) {
    const match = matchArticleToEvent(article, wideCandidates);
    if (!match) {
      // See STALE_ARTICLE_DISMISS_DAYS above — an old article that still
      // isn't matching anything gets auto-dismissed instead of sitting in
      // the queue forever. published_at can be missing on some feeds' items
      // (see cron-editorial.js's own item-shape comments elsewhere); treat
      // "no published_at at all" as not-stale rather than guessing, so it
      // stays visible for a human to look at instead of silently vanishing.
      if (article.published_at && new Date(article.published_at) < staleFloor) {
        try {
          const dismissResp = await fetch(
            `${SUPABASE_URL}/rest/v1/editorial_articles?id=eq.${encodeURIComponent(article.id)}&matched_event_id=is.null`,
            {
              method: "PATCH",
              headers: { ...sbHeaders, Prefer: "return=minimal" },
              body: JSON.stringify({ admin_dismissed: true }),
            }
          );
          if (dismissResp.ok) dismissedStaleCount++;
        } catch {
          // Same "one bad write never aborts the pass" convention as below.
        }
      }
      continue;
    }
    try {
      // is.null guard — same belt-and-suspenders reasoning as
      // api/admin-editorial.js's link_event action: never overwrite a match
      // a moderator set by hand between the load above and this write.
      const patchResp = await fetch(
        `${SUPABASE_URL}/rest/v1/editorial_articles?id=eq.${encodeURIComponent(article.id)}&matched_event_id=is.null`,
        {
          method: "PATCH",
          headers: { ...sbHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ matched_event_id: match.event.id, match_type: match.matchType }),
        }
      );
      if (!patchResp.ok) continue;
      await fetch(`${SUPABASE_URL}/rest/v1/editorial_article_events?on_conflict=article_id,event_id`, {
        method: "POST",
        headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ article_id: article.id, event_id: match.event.id }),
      });
      matchedCount++;
    } catch {
      // One bad write never aborts the rest of the pass — same "one bad item
      // never aborts the whole run" convention as every other cron here.
    }
  }
  return { checked: unmatched.length, matched: matchedCount, dismissedStale: dismissedStaleCount };
}

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (!timingSafeStringEqual(auth || "", `Bearer ${CRON_SECRET}`)) {
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
      const items = parseFeedItems(xml);
      if (!items.length) {
        outletResult = "Fetched OK — 0 items parsed (feed may be empty or in an unsupported shape)";
      } else {
        // PRESERVE MANUAL LINKS — admin.html's "create event from this
        // article" action (api/admin-editorial.js) sets matched_event_id +
        // match_type='manual' by hand for an article the auto-matcher
        // couldn't place. Without this lookup, the very next run of this
        // cron recomputes matchArticleToEvent() for every article again
        // (including that one) and the upsert below always writes
        // matched_event_id/match_type from that fresh computation — which
        // silently un-links the admin's manual connection the moment the
        // heuristic doesn't reproduce it (a near-certainty, since it's a
        // different admin-created event the auto-matcher has no special
        // knowledge of). Scoped to this outlet's feed_url since match_type
        // is only ever 'manual' for a handful of articles at most — same
        // "look up what already exists before overwriting it" pattern as
        // api/cron-lagerhouse.js's status-preserving upsert. 2026-09-02 audit fix.
        let manualByUrl = new Map();
        try {
          const lookupUrl = `${SUPABASE_URL}/rest/v1/editorial_articles?feed_url=eq.${encodeURIComponent(outlet.feedUrl)}&match_type=eq.manual&select=url,matched_event_id`;
          const lookupResp = await fetch(lookupUrl, { headers: sbHeaders });
          if (lookupResp.ok) {
            const existingManual = await lookupResp.json();
            if (Array.isArray(existingManual)) {
              existingManual.forEach((row) => manualByUrl.set(row.url, row.matched_event_id));
            }
          }
          // If the lookup fails, fall through with an empty map — same
          // "not silently worse than before this fix existed" fallback as
          // cron-lagerhouse.js's status lookup.
        } catch (_) {
          // network/parse error on the lookup itself — same fallback as above
        }

        // Match every item first, then only keep ones that either matched a
        // real event or pass looksLikeEventCoverage() — see that function's
        // header for why. A matched item always survives regardless (it's
        // definitionally event coverage); an unmatched one has to look like
        // event coverage on its own to be worth storing at all.
        const withMatches = items.map((item) => ({ item, match: matchArticleToEvent(item, candidateEvents) }));
        const skippedNonEvent = withMatches.filter(({ item, match }) => !match && !looksLikeEventCoverage(item)).length;
        const rows = withMatches
          .filter(({ match, item }) => match || looksLikeEventCoverage(item))
          .map(({ item, match }) => {
            if (match) totalMatched++;
            const manualEventId = manualByUrl.get(item.url);
            if (manualEventId !== undefined) {
              // An admin manually linked this exact article — keep it linked
              // regardless of what this run's auto-matcher decided.
              return {
                source: outlet.source,
                feed_url: outlet.feedUrl,
                title: item.title,
                excerpt: item.excerpt || null,
                url: item.url,
                thumbnail_url: item.thumbnailUrl || null,
                published_at: item.publishedAt,
                matched_event_id: manualEventId,
                match_type: "manual",
              };
            }
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

        if (!rows.length) {
          outletResult = `Fetched OK — ${items.length} item${items.length === 1 ? "" : "s"} parsed, all ${skippedNonEvent} skipped as non-event coverage`;
        } else {
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
            const matchedRows = rows.filter((r) => r.matched_event_id);
            // The upsert above only writes editorial_articles.matched_event_id
            // — it has no article id to write with (on_conflict upserts don't
            // return rows), so a freshly-matched article never gets its
            // editorial_article_events join-table row here. Since
            // index.html/event.html read exclusively through that join table
            // (migration_021, 2026-09-04), a match made on this first pass
            // would otherwise never actually show up anywhere on the site —
            // and retryUnmatchedArticles() below wouldn't catch it either,
            // since its is.null filter skips rows that already have
            // matched_event_id set. Re-fetch just this outlet's rows by URL to
            // get their ids, then upsert the join rows the same way
            // retryUnmatchedArticles() and admin-editorial.js's link_event do.
            if (matchedRows.length) {
              try {
                const urlList = matchedRows.map((r) => `"${r.url.replace(/"/g, '\\"')}"`).join(",");
                const idLookupResp = await fetch(
                  `${SUPABASE_URL}/rest/v1/editorial_articles?url=in.(${urlList})&select=id,url`,
                  { headers: sbHeaders }
                );
                if (idLookupResp.ok) {
                  const withIds = await idLookupResp.json();
                  const idByUrl = new Map(withIds.map((r) => [r.url, r.id]));
                  const joinRows = matchedRows
                    .map((r) => ({ article_id: idByUrl.get(r.url), event_id: r.matched_event_id }))
                    .filter((jr) => jr.article_id);
                  if (joinRows.length) {
                    await fetch(`${SUPABASE_URL}/rest/v1/editorial_article_events?on_conflict=article_id,event_id`, {
                      method: "POST",
                      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
                      body: JSON.stringify(joinRows),
                    });
                  }
                }
              } catch {
                // Join-row write failing never aborts ingestion — the next
                // scheduled run's retryUnmatchedArticles pass can't recover
                // this one (matched_event_id is already set), but a moderator
                // can still see and re-link it manually from admin.html.
              }
            }
            outletResult = `${rows.length} item${rows.length === 1 ? "" : "s"} found, ${matchedRows.length} matched to an event, ${skippedNonEvent} skipped as non-event coverage`;
          }
        }
      }
    } catch (err) {
      outletResult = "Error: " + err.message;
    }
    results.push({ source: outlet.source, feedUrl: outlet.feedUrl, result: outletResult });
  }

  // Retroactive pass — re-checks every still-unmatched article (not just this
  // run's fresh RSS items) against a much wider candidate window. See
  // retryUnmatchedArticles()'s own header comment for why this exists.
  const retryResult = await retryUnmatchedArticles(sbHeaders);

  res.status(200).json({
    upserted: totalUpserted,
    matched: totalMatched,
    candidateEvents: candidateEvents.length,
    outletsChecked: OUTLETS.length,
    results,
    retroactiveRematch: retryResult,
    fetchedAt: new Date().toISOString(),
  });
};
