const crypto = require("crypto");
const { requireCronAuth } = require("./_lib/cron-auth"); // Package 1: fail-closed cron auth
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { milesFromDetroitBorder } = require("./_lib/detroit-boundary");
const { lookupExistingStatuses } = require("./_lib/status-lookup");
const { upsertEventRows } = require("./_lib/event-upsert");
const { isLikelyNotARealEvent } = require("./_lib/non-event-filter");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
// Vercel Cron job — runs on a schedule (see vercel.json) rather than being
// called from the browser. Pulls Detroit-area events from the Ticketmaster
// Discovery API and upserts them straight into Supabase as status='approved'
// events, keyed on external_id so re-runs update existing rows instead of
// duplicating them.
//
// Protect this endpoint: set CRON_SECRET in Vercel's Environment Variables.
// Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when it
// invokes scheduled functions once that env var exists — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs

const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
// Non-production deployments must never use the production database (api/_lib/environment.js).
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);
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

// Ticketmaster affiliate link wrapping (2026-09-04) — Jody has a live
// Ticketmaster affiliate account through Impact Radius (account id
// 7676879, confirmed directly from her own dashboard-issued link).
// Researched as a revenue idea in _revenue_research_2026-08-27.md but never
// actually wired up until now — every ticket_url from this source was a
// plain, untracked Ticketmaster link.
//
// Wraps the real per-event URL in Impact's redirect domain
// (ticketmaster.evyy.net) carrying the same query-string template
// Ticketmaster hands out for feed/API integrations — the exact shape of
// Jody's own account link, just with the destination swapped from
// ticketmaster.com's bare homepage to this specific event's real URL. The
// {clickid}/{irpid}/{irmpname}/{ircid} tokens are Impact's own macros,
// resolved by evyy.net itself at click time — passed through literally,
// never filled in here. 264167/4272 are Ticketmaster's own program/
// campaign ids on Impact (the same for every affiliate, confirmed by
// matching a competitor's own such link seen during separate research) —
// only the account id segment is Jody-specific.
const TM_AFFILIATE_ACCOUNT_ID = "7676879";
const TM_AFFILIATE_PROGRAM_PATH = "264167/4272";

function affiliateTicketUrl(eventUrl) {
  if (!eventUrl) return null;
  const sep = eventUrl.includes("?") ? "&" : "?";
  const destination =
    `${eventUrl}${sep}irgwc=1&clickid={clickid}&camefrom=CFC_BUYAT_{irpid}&impradid={irpid}` +
    `&REFERRAL_ID=tmfeedbuyat{irpid}&wt.mc_id=aff_BUYAT_{irpid}&utm_source={irpid}-{irmpname}` +
    `&impradname={irmpname}&utm_medium=affiliate&ircid={ircid}`;
  return `https://ticketmaster.evyy.net/c/${TM_AFFILIATE_ACCOUNT_ID}/${TM_AFFILIATE_PROGRAM_PATH}?u=${encodeURIComponent(destination)}`;
}


// Geographic radius search, not a city allowlist — 313.events' coverage area
// is 75 miles from Detroit's actual city BORDER, not its center point
// (switched 2026-09-20 — see SERVICE_AREA.md and api/_lib/detroit-boundary.js
// for the full reasoning). This pulls in dozens of cities/townships (Ann
// Arbor, Pontiac, Windsor ON, Toledo OH, Lansing, etc.) that a hardcoded
// city list would have silently dropped.
//
// Verified against Ticketmaster's own Discovery API docs (2026-08-25):
// latlong+radius+unit is real and currently works (default radius is even
// 100 "miles", so this fits), and size=200 * page<5 stays under their
// "size*page < 1000" deep-paging cap. One thing to revisit later: the docs
// flag `latlong` as "maybe removed in a future release, please use geoPoint
// instead" (a geohash string) — not urgent since it still works today, but
// worth switching before Ticketmaster actually pulls the plug.
const CENTER_LAT = 42.3314;
const CENTER_LON = -83.0458;
// The real service-area cutoff — 75 miles from Detroit's actual city
// border. Enforced precisely per-event below, in shapeForDb(), via
// milesFromDetroitBorder() against each venue's own coordinates. Matches
// SERVICE_AREA.md exactly so this stays in sync with that document if the
// radius or boundary source ever changes.
const RADIUS_MILES = 75;
// Ticketmaster's API only accepts a single center point + radius, so this
// is deliberately wider than RADIUS_MILES: an over-fetch buffer, not the
// real cutoff. A border-based service area reaches farther than a center-
// based circle of the same stated radius in every direction (border points
// are always at least as close to an outside location as the center is),
// and the biggest gap measured across a dozen checked directions during
// development (Milford, MI) was ~14.6mi — 90 leaves comfortable margin
// above that. This radius only controls what Ticketmaster bothers sending
// us; the real 75-mile-from-border line is drawn afterward, in code.
const TM_QUERY_RADIUS_MILES = 90;

// Ticketmaster segment/genre -> this calendar's category keys.
// Sports was excluded from day one (out of scope for an arts/culture/
// nightlife calendar) — decision reversed 2026-08-26, now included as its
// own 'sports' category. Requires migration_007_sports_category.sql to have
// run first (adds 'sports' to the event_category enum) or every Sports row
// in a cron run will fail the insert.
function mapCategory(classifications) {
  const c = (classifications && classifications[0]) || {};
  const segment = (c.segment && c.segment.name) || "";
  const genre = (c.genre && c.genre.name) || "";

  if (segment === "Music") {
    if (/comedy/i.test(genre)) return "theatre";
    return "music";
  }
  if (segment === "Arts & Theatre") {
    if (/dance|ballet/i.test(genre)) return "dance";
    if (/comedy/i.test(genre)) return "theatre";
    if (/theatre|musical/i.test(genre)) return "theatre";
    if (/visual|fine art/i.test(genre)) return "visual";
    return "theatre";
  }
  if (segment === "Film") return "film";
  if (segment === "Miscellaneous" && /family/i.test(genre)) return "family";
  if (segment === "Sports") return "sports";
  return null; // anything else unmapped (still) -> excluded
}

// 2026-09-05 fix — Jody asked to re-crawl for images across every upcoming
// event; auditing the live database first showed 981 of 981 upcoming
// Ticketmaster-sourced events (81% of every upcoming approved event on the
// whole site) had no image_url at all. Root cause: shapeForDb() below never
// read the API's own `images` array in the first place — not a data gap on
// Ticketmaster's end. Confirmed via Ticketmaster's own Discovery API docs
// (2026-09-05): every event's `images` array is always populated (falls back
// to the event's major-category stock image if it has no photo of its own),
// with entries shaped { ratio: "16_9"|"3_2"|"4_3", url, width, height,
// fallback }. Picks the largest real (non-fallback) 16_9 image up to 1024px
// wide — big enough for a sharp card image without pulling a multi-MB
// original — falling back to the largest available 16_9 image (even a
// fallback stock one beats no image at all), then to literally any image in
// the array as a last resort. Only returns null if the array is missing or
// empty outright, which per the docs above should never actually happen.
function pickImage(images) {
  if (!Array.isArray(images) || !images.length) return null;
  const ratio16x9 = images.filter((img) => img && img.ratio === "16_9" && img.url);
  const pool = ratio16x9.length ? ratio16x9 : images.filter((img) => img && img.url);
  if (!pool.length) return null;
  const real = pool.filter((img) => !img.fallback);
  const candidates = real.length ? real : pool;
  const withinCap = candidates.filter((img) => !img.width || img.width <= 1024);
  const chosenFrom = withinCap.length ? withinCap : candidates;
  return chosenFrom.reduce((best, img) => ((img.width || 0) > (best.width || 0) ? img : best), chosenFrom[0]).url;
}

function formatTime(dateObj) {
  if (!dateObj || !dateObj.localTime) return "Evening";
  const [h, m] = dateObj.localTime.split(":");
  let hour = parseInt(h, 10);
  const ap = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m} ${ap}`;
}

// Returns { events, complete, reason, httpStatus, totalElements, pagesFetched, windows }.
// `events` is every event seen. The extra fields exist so the run can be logged honestly (source reliability PR 1):
// a page that fails, or a window Ticketmaster will not page through, makes the run "partial" instead of a silent
// success.
//
// TRUNCATION (REL-3 Ticketmaster fix, 2026-10-18): the Discovery API will not page past size*page = 1,000, so one
// 90-day query silently sees at most 1,000 events however many exist. The query now starts as one window over the
// whole 90 days and, when a window reports more than 1,000 results, splits it in half and queries each half, down to
// one day. A window that still exceeds 1,000 at one day, an exhausted request budget, or a failed page makes the run
// "partial" and says so; nothing is silently dropped. Rows are de-duplicated by id (windows overlap at their edges).
const PAGE_SIZE = 200;
const MAX_PAGES = 5;                       // size*page must stay under 1,000
const WINDOW_RESULT_CAP = PAGE_SIZE * MAX_PAGES;
const MAX_REQUESTS = 40;                   // per run; ~4 requests/second keeps this well inside the 5/s API limit
const REQUEST_GAP_MS = 250;
const DAY_MS = 24 * 60 * 60 * 1000;

const isoSecond = (ms) => new Date(ms).toISOString().slice(0, 19) + "Z";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTicketmasterEvents(opts) {
  const now = (opts && opts.now) || Date.now();
  const gap = opts && opts.gapMs != null ? opts.gapMs : (process.env.TICKETMASTER_REQUEST_GAP_MS != null ? Number(process.env.TICKETMASTER_REQUEST_GAP_MS) : REQUEST_GAP_MS);
  const byId = new Map();
  const info = { complete: true, reason: null, httpStatus: null, totalElements: null, pagesFetched: 0, requests: 0, windows: 0, abort: false };
  const incomplete = (reason) => { info.complete = false; if (!info.reason) info.reason = reason; };

  async function getPage(startMs, endMs, page) {
    if (info.requests >= MAX_REQUESTS) { incomplete(`request budget of ${MAX_REQUESTS} reached`); info.abort = true; return null; }
    if (info.requests > 0 && gap) await sleep(gap);
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", TICKETMASTER_API_KEY);
    url.searchParams.set("latlong", `${CENTER_LAT},${CENTER_LON}`);
    url.searchParams.set("radius", String(TM_QUERY_RADIUS_MILES));
    url.searchParams.set("unit", "miles");
    url.searchParams.set("startDateTime", isoSecond(startMs));
    url.searchParams.set("endDateTime", isoSecond(endMs));
    url.searchParams.set("size", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));
    const r = await fetch(url.toString());
    info.requests += 1;
    info.httpStatus = r.status;
    if (r.ok) info.pagesFetched += 1; // successful pages only: "blocked" means the very first page was refused
    if (!r.ok) {
      incomplete(`page ${page} failed: HTTP ${r.status} (window ${isoSecond(startMs)}..${isoSecond(endMs)})`);
      if (r.status === 401 || r.status === 403 || r.status === 429) info.abort = true; // key or quota problem: stop, do not hammer
      return null;
    }
    return r.json();
  }

  async function fetchWindow(startMs, endMs, isRoot) {
    if (info.abort) return;
    const first = await getPage(startMs, endMs, 0);
    if (!first) return;
    const total = first.page && typeof first.page.totalElements === "number" ? first.page.totalElements : null;
    if (isRoot) info.totalElements = total;
    if (total != null && total > WINDOW_RESULT_CAP && endMs - startMs > DAY_MS) {
      const mid = startMs + Math.floor((endMs - startMs) / 2);
      await fetchWindow(startMs, mid, false);
      await fetchWindow(mid, endMs, false);
      return;
    }
    info.windows += 1;
    const take = (data) => { for (const e of (data._embedded && data._embedded.events) || []) if (e && e.id && !byId.has(e.id)) byId.set(e.id, e); };
    take(first);
    const totalPages = (first.page && first.page.totalPages) || 1;
    for (let page = 1; page < Math.min(totalPages, MAX_PAGES); page++) {
      const data = await getPage(startMs, endMs, page);
      if (!data) return;
      take(data);
    }
    if (totalPages > MAX_PAGES) incomplete(`window ${isoSecond(startMs)}..${isoSecond(endMs)} has ${total} results and cannot be split further; only the first ${WINDOW_RESULT_CAP} were fetched`);
  }

  await fetchWindow(now, now + 90 * DAY_MS, true);
  const { abort, ...rest } = info;
  return { events: Array.from(byId.values()), ...rest };
}

function shapeForDb(e, venueMap) {
  // 2026-10-01 (Needs Follow-up remaining-gap product pass): Ticketmaster's
  // Discovery API returns a separate "<Artist> - Suite Rental" listing
  // alongside the real underlying concert — a corporate-box upsell
  // add-on, not a standalone public event. Skipped here, before category
  // mapping, same as the `!cat` early-return below.
  if (isLikelyNotARealEvent({ title: e.name })) return null;

  const cat = mapCategory(e.classifications);
  if (!cat) return null;

  const venue0 = e._embedded && e._embedded.venues && e._embedded.venues[0];
  const venueName = venue0 ? venue0.name : "Venue TBA";
  const venueCity = venue0 && venue0.city ? venue0.city.name : null;
  // 2026-09-16 (Jody: "how can we automate that process more?", after
  // clearing the admin follow-up queue by hand yet again) — by far the
  // single biggest bucket in that queue was "missing address" on
  // Ticketmaster events (151 of 193 flagged, ~78%, per a live count of the
  // actual queue that day). Turned out Ticketmaster's own Discovery API
  // response already carries the venue's street address the whole time
  // (`_embedded.venues[0].address.line1`, documented at
  // developer.ticketmaster.com) — this file was just never reading it,
  // unlike cron-visitdetroit.js's parseAddress() which already does the
  // equivalent for its own source. Same "absent for some listings" caveat
  // as that description/`info` fix above: a handful of venues (livestream/
  // TBA-style listings) genuinely have no address in Ticketmaster's own
  // data, and those should still land in the follow-up queue rather than
  // being masked with a blank string.
  const venueAddress = venue0 && venue0.address ? venue0.address.line1 : null;
  // No city allowlist here on purpose — the latlong+radius params above
  // constrain results geographically (with a wider buffer than the real
  // cutoff — see TM_QUERY_RADIUS_MILES above), so every venue Ticketmaster
  // returns is already roughly in range. venueCity IS still captured (into
  // venue_city_raw below) so the site can display it — this radius pulls in
  // Rochester Hills, Sterling Heights, Clarkston, etc., and without a
  // visible city label those all silently read as Detroit on the calendar.
  // See migration_006.
  //
  // The real 75-mile-from-Detroit's-border cutoff (switched 2026-09-20 from
  // a center-point measurement — see SERVICE_AREA.md) is enforced right
  // here, against the venue's own coordinates, since TM_QUERY_RADIUS_MILES
  // above is deliberately looser than the true boundary. A venue with no
  // location data from Ticketmaster (rare) falls back to trusting TM's own
  // radius search rather than guessing — conservative, not lax, given that
  // search already over-fetches.
  const venueLat = venue0 && venue0.location ? parseFloat(venue0.location.latitude) : null;
  const venueLng = venue0 && venue0.location ? parseFloat(venue0.location.longitude) : null;
  if (venueLat != null && venueLng != null && !Number.isNaN(venueLat) && !Number.isNaN(venueLng)) {
    if (milesFromDetroitBorder(venueLat, venueLng) > RADIUS_MILES) return null;
  }

  const start = e.dates && e.dates.start;
  if (!start || !start.localDate) return null;

  const priceRange = e.priceRanges && e.priceRanges[0];

  // ticket_status (2026-09-16, Jody: "see if the event is sold out ... to
  // get tickets cheaper on the resale apps") -- Discovery API's own
  // dates.status.code, values per Ticketmaster's docs: onsale, offsale,
  // cancelled, postponed, rescheduled. See migration_030's header comment
  // for the important caveat: "offsale" alone does NOT reliably mean sold
  // out (could also mean the sale window just hasn't opened), so
  // event.html deliberately hedges its wording rather than asserting
  // "SOLD OUT" off this field alone.
  const ticketStatus = e.dates && e.dates.status ? e.dates.status.code : null;

  return {
    external_id: e.id,
    title: e.name,
    // 2026-09-05 (Jody: "any way to automate the missing details?", asked
    // after every single Ticketmaster event turned up in admin.html's
    // "Needs follow-up" queue for a missing description) — this field was
    // simply never read before. Ticketmaster's own docs describe `info` as
    // "event's information" — the closest thing their API has to a real
    // description — as opposed to `pleaseNote`, which is ticketing/box-
    // office logistics ("no tickets delivered before...", etc.), not a
    // description of the event itself, so that one is deliberately left
    // out here rather than mislabeled as one. BEST-EFFORT, not a full fix:
    // `info` is optional and, in practice, absent on most events — expect
    // this to shrink the queue, not empty it.
    description: e.info || undefined,
    category: cat,
    venue_name_raw: venueName,
    // See api/_lib/venue-lookup.js — this cron spans the whole 75-mile
    // radius, so venue_id is resolved per-event against its own venue name.
    // Links to an existing venues row if one matches; never creates or
    // guesses a fuzzy one (most Ticketmaster venues outside the original
    // 83 stay unlinked until researched — see NEW_SOURCES_RESEARCH.md's
    // don't-guess-at-geography precedent).
    venue_id: resolveVenueId(venueMap, venueName),
    venue_address_raw: venueAddress,
    venue_city_raw: venueCity,
    start_date: start.localDate,
    time_display: formatTime(start),
    is_free: false,
    price_from: priceRange ? priceRange.min : null,
    ticket_url: affiliateTicketUrl(e.url),
    image_url: pickImage(e.images),
    source: "Ticketmaster",
    ticket_status: ticketStatus,
  };
}


// FIELD PROTECTION (REL-3 Ticketmaster fix, 2026-10-18; DEBT-011 / D1).
// The merge-duplicates upsert sets every key it is sent, so a daily run would revert any correction made to a stored
// Ticketmaster row (title, time, venue, address, city, category, image, ticket link) by an admin or a P0 repair. For a
// row that already exists, only the fields that are Ticketmaster's own live facts are sent, and only when Ticketmaster
// actually supplies a value: ticket_status (onsale, offsale, cancelled, postponed, rescheduled). Everything else keeps its
// stored value. (An upsert that merely omits keys cannot do this, because NOT NULL columns such as title are checked
// on the proposed row first, so stored rows get a column-only UPDATE: see refreshTicketStatus.) A new event is sent in full.
// Date, time, price and venue changes are not applied to a stored row: the dry-run reports them for review. Widening this list
// needs an owner decision (and the #185 owner-correction marker once it exists).
const LIVE_FIELDS_FOR_EXISTING = ["ticket_status"];

// Stored vs incoming, for the dry-run report. `description` is never compared: it is never sent for a stored row.
const DIFF_FIELDS = ["title", "category", "venue_name_raw", "venue_address_raw", "venue_city_raw", "start_date", "time_display", "price_from", "ticket_url", "image_url", "ticket_status"];
const norm = (v) => (v === null || v === undefined || v === "" ? null : typeof v === "number" ? v : String(v).trim());
function diffAgainstStored(row, stored) {
  const diff = {};
  for (const f of DIFF_FIELDS) {
    const inc = norm(row[f]);
    const cur = norm(stored[f]);
    if (inc === null && f !== "ticket_status") continue; // a blank incoming value changes nothing
    if (typeof inc === "number" || typeof cur === "number") { if (Number(inc) === Number(cur)) continue; }
    else if (inc === cur) continue;
    diff[f] = { stored: cur, incoming: inc };
  }
  return diff;
}

async function fetchStoredRows(ids) {
  const stored = new Map();
  const cols = ["id", "external_id", "status", "internal_note", "description", "venue_id"].concat(DIFF_FIELDS).join(",");
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const url = `${SUPABASE_URL}/rest/v1/events?select=${cols}&source=eq.Ticketmaster&external_id=in.(${chunk.map(encodeURIComponent).join(",")})`;
    const r = await fetch(url, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });
    if (!r.ok) throw new Error(`stored-row lookup failed: HTTP ${r.status}`);
    for (const row of await r.json()) stored.set(row.external_id, row);
  }
  return stored;
}


// Refreshes ticket_status on stored Ticketmaster rows, one UPDATE per (status value, chunk of <=100 ids). It touches
// only that column. Rows with no status from Ticketmaster are skipped (a blank never overwrites a stored value).
async function refreshTicketStatus(existingRows) {
  const byStatus = new Map();
  for (const row of existingRows) {
    if (!row.ticket_status) continue;
    if (!byStatus.has(row.ticket_status)) byStatus.set(row.ticket_status, []);
    byStatus.get(row.ticket_status).push(row.external_id);
  }
  let updated = 0;
  const failed = [];
  for (const [status, ids] of byStatus) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/events?source=eq.Ticketmaster&external_id=in.(${chunk.map(encodeURIComponent).join(",")})`, {
          method: "PATCH",
          headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ ticket_status: status }),
        });
        if (r.ok) updated += chunk.length;
        else failed.push(`${status}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      } catch (e) {
        failed.push(`${status}: ${e.message}`);
      }
    }
  }
  return { updated, failed };
}

const DRY_DIFF_LIST_CAP = 200;
// Previously corrected rows (Event Intelligence, 2026-10-18): the dry-run shows each one's stored values next to what
// Ticketmaster says, so the owner can see that a run leaves them alone. Matched by the start of the row id.
const FIXTURE_ID_PREFIXES = ["0b6b0237", "d2d2f14d", "c03e0db6", "634fbd6a", "48e6e18e", "c5f6b1b5", "355a0734"];
const PROTECTED_VIEW = ["status", "title", "time_display", "venue_id", "venue_address_raw", "venue_city_raw", "image_url", "price_from", "ticket_url", "description"];

// Stored upcoming approved Ticketmaster rows (id, title, date) for the "no longer returned by the API" report.
async function fetchStoredUpcoming() {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${SUPABASE_URL}/rest/v1/events?source=eq.Ticketmaster&status=eq.approved&start_date=gte.${today}&select=external_id,title,start_date&order=start_date.asc&limit=5000`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!r.ok) throw new Error(`stored-upcoming lookup failed: HTTP ${r.status}`);
  return r.json();
}

const DEFAULT_STATUS = "approved";
const SOURCE_SLUG = SLUGS.ticketmaster; // see api/_lib/source-slugs.js

module.exports = async (req, res) => {
  if (!requireCronAuth(req, res)) return;

  // Run logging (source reliability PR 1, 2026-10-11): this connector wrote
  // no source_runs row before, so "ran and wrote nothing", "blocked" and
  // "never ran" were indistinguishable. Logging only; no publication change.
  // DRY RUN (?dry=1, same cron auth): fetch, parse and compare with the stored rows, and report. No events write
  // and no run-log row (a dry run must not look like a real run to the healthcheck and the freshness checks).
  const dry = String((req.query && req.query.dry) || (new URL(req.url || "/", "http://x").searchParams.get("dry")) || "") === "1";
  const runHandle = dry ? null : await startRun(SOURCE_SLUG);

  if (!TICKETMASTER_API_KEY) {
    if (dry) { res.status(200).json({ dry_run: true, error: "TICKETMASTER_API_KEY not configured" }); return; }
    await finishRun(runHandle, { outcome: "failed", error_sample: "TICKETMASTER_API_KEY not configured" });
    res.status(200).json({ upserted: 0, error: "TICKETMASTER_API_KEY not configured" });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }

  let raw;
  let fetchInfo;
  try {
    ({ events: raw, ...fetchInfo } = await fetchTicketmasterEvents());
  } catch (err) {
    if (dry) { res.status(200).json({ dry_run: true, error: "Ticketmaster fetch failed: " + err.message }); return; }
    await finishRun(runHandle, { outcome: "failed", error_sample: "Ticketmaster fetch failed: " + err.message });
    res.status(200).json({ upserted: 0, error: "Ticketmaster fetch failed: " + err.message });
    return;
  }
  // A complete fetch is "success"; a short one (a failed page, or more pages
  // than the cap) is "partial", or "blocked" when the very first page was
  // refused with 401/403 (bad key / quota / WAF).
  const blocked = !fetchInfo.complete && fetchInfo.pagesFetched === 0 && (fetchInfo.httpStatus === 401 || fetchInfo.httpStatus === 403 || fetchInfo.httpStatus === 429);
  const baseOutcome = fetchInfo.complete ? "success" : blocked ? "blocked" : (fetchInfo.pagesFetched === 0 ? "failed" : "partial");
  const runStats = {
    api_total_elements: fetchInfo.totalElements,
    pages_fetched: fetchInfo.pagesFetched,
    complete: fetchInfo.complete,
    incomplete_reason: fetchInfo.reason,
  };
  const logFinish = (extra) => finishRun(runHandle, {
    outcome: extra.outcome || baseOutcome,
    http_status: extra.http_status ?? fetchInfo.httpStatus,
    records_fetched: raw.length,
    records_parsed: extra.records_parsed,
    records_written: extra.records_written,
    error_sample: extra.error_sample ?? fetchInfo.reason ?? undefined,
    session_data: runStats,
  });

  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const rawRows = raw.map((e) => shapeForDb(e, venueMap)).filter(Boolean);

  // De-dupe by external_id before sending — Postgres's ON CONFLICT DO UPDATE
  // can't touch the same target row twice in one statement, so one duplicate
  // pair would otherwise fail the ENTIRE batch instead of just that pair
  // (same fix already applied in cron-dossin.js and
  // cron-detroitmonthofdesign.js — see their matching comments). Root-caused
  // 2026-09-20: Ticketmaster's own paginated Discovery API results can
  // return the same event id across two different pages of the same fetch
  // (confirmed the exact failure mode directly — `ERROR: 21000: ON CONFLICT
  // DO UPDATE command cannot affect row a second time`), and this cron had
  // no dedup step, so every run since roughly 2026-09-18 silently wrote
  // nothing at all once one such duplicate ID appeared in a fetch — the
  // whole POST failed, not just the duplicate pair, which is why ALL
  // Ticketmaster events (not just the offending one) stopped updating.
  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  if (dry) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { res.status(200).json({ dry_run: true, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" }); return; }
    let stored, storedUpcoming;
    try { stored = await fetchStoredRows(rows.map((r) => r.external_id)); storedUpcoming = await fetchStoredUpcoming(); }
    catch (e) { res.status(502).json({ dry_run: true, error: e.message }); return; }
    let wouldInsert = 0, unchanged = 0, wouldUpdateLive = 0, matchesRetired = 0;
    const heldFieldCounts = {}, wouldOverwriteNonNull = {}, wouldFillBlank = {}, diffs = [], fixtures = [];
    for (const row of rows) {
      const cur = stored.get(row.external_id);
      if (!cur) { wouldInsert += 1; continue; }
      if (cur.status === "rejected") matchesRetired += 1;
      const d = diffAgainstStored(row, cur);
      const names = Object.keys(d);
      const isFixture = FIXTURE_ID_PREFIXES.some((p) => String(cur.id).startsWith(p));
      if (isFixture) fixtures.push({ id: cur.id, external_id: row.external_id, stored: Object.fromEntries(PROTECTED_VIEW.map((f) => [f, cur[f] === undefined ? null : cur[f]])), incoming_differs: d, live_run_writes: LIVE_FIELDS_FOR_EXISTING.filter((f) => row[f] !== null && row[f] !== undefined && row[f] !== "") });
      if (!names.length) { unchanged += 1; continue; }
      const applied = names.filter((f) => LIVE_FIELDS_FOR_EXISTING.includes(f));
      const held = names.filter((f) => !LIVE_FIELDS_FOR_EXISTING.includes(f));
      if (applied.length) wouldUpdateLive += 1;
      for (const f of held) {
        heldFieldCounts[f] = (heldFieldCounts[f] || 0) + 1;
        if (d[f].stored === null) wouldFillBlank[f] = (wouldFillBlank[f] || 0) + 1; else wouldOverwriteNonNull[f] = (wouldOverwriteNonNull[f] || 0) + 1;
      }
      if (diffs.length < DRY_DIFF_LIST_CAP) diffs.push({ external_id: row.external_id, title: cur.title, status: cur.status, applied: applied.length ? applied : undefined, held, fields: d });
    }
    const returned = new Set(rows.map((r) => r.external_id));
    const notReturned = storedUpcoming.filter((r) => !returned.has(r.external_id));
    res.status(200).json({
      dry_run: true, wrote_events: false, wrote_run_log: false,
      fetch: { complete: fetchInfo.complete, reason: fetchInfo.reason, http_status: fetchInfo.httpStatus, total_elements: fetchInfo.totalElements, requests: fetchInfo.requests, windows: fetchInfo.windows, events_seen: raw.length, rows_parsed: rows.length },
      would_insert: wouldInsert, would_update_live_fields: wouldUpdateLive, unchanged_or_held_only: unchanged,
      api_events_matching_rejected_rows: matchesRetired,
      live_fields_for_existing: LIVE_FIELDS_FOR_EXISTING,
      held_field_differences: heldFieldCounts,
      held_would_overwrite_non_null: wouldOverwriteNonNull,
      held_would_fill_blank: wouldFillBlank,
      differences_listed: diffs.length, differences: diffs,
      fixtures,
      stored_upcoming_not_returned_by_api: { count: notReturned.length, sample: notReturned.slice(0, 50), note: "Reported only. Nothing is rejected or hidden automatically." },
      note: "Differences in held fields are NOT written to stored events; a live run refreshes ticket_status only. Images are never added to stored rows.",
    });
    return;
  }

  if (!rows.length) {
    await logFinish({ records_parsed: 0, records_written: 0 });
    res.status(200).json({ upserted: 0, fetchedAt: new Date().toISOString() });
    return;
  }

  try {
    // Look up each row's current status before writing, so an admin's
    // approve/reject decision on an existing row isn't reset to
    // DEFAULT_STATUS by this merge-duplicates upsert. 2026-09-02 fix for the
    // status-clobbering bug — see cron-lagerhouse.js's header comment for
    // the full story.
    // WP 0.17 (2026-09-22): fail-closed status lookup -- a failed lookup
    // (non-OK response, thrown network error, or an unusable response body)
    // must never silently default every row to DEFAULT_STATUS (D7). See
    // api/_lib/status-lookup.js for the full rationale and the chunking
    // (<=100 ids/request) this also fixes. Any failure aborts this run
    // entirely -- zero event writes, HTTP 502 -- rather than falling back
    // to an empty map the way this connector used to.
    let existingStatusByExternalId;
    try {
      existingStatusByExternalId = await lookupExistingStatuses(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        rows.map((r) => r.external_id)
      );
    } catch (lookupErr) {
      await logFinish({ outcome: "failed", records_parsed: rows.length, records_written: 0, error_sample: "Status lookup failed: " + lookupErr.message });
      res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
      return;
    }
    // FIELD PROTECTION (2026-10-18, supersedes the description-only safeguard of 2026-10-04, BUG-007 / DEBT-011).
    // That safeguard omitted just `description` from an existing row's upsert. It could not be widened the same way:
    // PostgreSQL checks NOT NULL on the proposed INSERT row before it looks for the conflict, so an upsert that omits
    // `title` fails outright (reproduced by the fake database, SQLSTATE 23502). So the two kinds of row travel
    // differently:
    //   - NEW event (no row with this external_id): upserted in full, with Ticketmaster's `info` as the description
    //     when it supplies one, exactly as before.
    //   - EXISTING event: never upserted. Only its ticket_status is refreshed, by an UPDATE of that one column, so
    //     title, description, time, venue, address, city, category, image, price and ticket link keep their stored
    //     values: corrections made by an admin or a P0 repair cannot be reverted by a daily run. The status is
    //     whatever the moderator last set and is never touched.
    // "Existing" is read from the fail-closed status lookup just above, which has an entry for exactly the rows that
    // are already stored, so a stored event can never be mistaken for a new one.
    // Differences in the other fields (reschedules, price, venue) are not applied; ?dry=1 lists them for review.
    const newRows = [];
    const existingRows = [];
    for (const row of rows) {
      if (existingStatusByExternalId.has(row.external_id)) existingRows.push(row);
      else newRows.push({ ...row, status: DEFAULT_STATUS });
    }

    let written = 0;
    if (newRows.length) {
      // Upsert on external_id — see the unique index in supabase/schema.sql.
      const resp = await upsertEventRows(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, newRows);
      if (!resp.ok) {
        const errText = await resp.text();
        await logFinish({
          outcome: "failed",
          http_status: resp.status,
          records_parsed: rows.length,
          records_written: resp.written,
          error_sample: "Supabase upsert failed: " + errText,
        });
        res.status(502).json({ upserted: resp.written, error: "Supabase upsert failed: " + errText });
        return;
      }
      written += newRows.length;
    }

    const patch = await refreshTicketStatus(existingRows);
    written += patch.updated;
    if (patch.failed.length) {
      const msg = `ticket_status refresh failed for ${patch.failed.length} stored rows: ${patch.failed[0]}`;
      await logFinish({ outcome: "partial", records_parsed: rows.length, records_written: written, error_sample: msg });
      res.status(502).json({ upserted: written, error: msg });
      return;
    }

    await logFinish({ records_parsed: rows.length, records_written: written });
    res.status(200).json({ upserted: written, inserted: newRows.length, status_refreshed: patch.updated, fetchedAt: new Date().toISOString() });
  } catch (err) {
    await logFinish({ outcome: "failed", records_parsed: rows.length, error_sample: err.message });
    res.status(500).json({ upserted: 0, error: err.message });
  }
};

// Exposed for direct unit testing (test/cron-ticketmaster-non-event-filter.test.js)
// — this file had no prior test coverage/export surface, and building a
// full mocked-Discovery-API handler harness is unwarranted just to verify
// a single early-return filter. The default export above (Vercel's actual
// entry point) is unchanged.
module.exports.shapeForDb = shapeForDb;
module.exports.fetchTicketmasterEvents = fetchTicketmasterEvents;
module.exports.refreshTicketStatus = refreshTicketStatus;
module.exports.diffAgainstStored = diffAgainstStored;
