const crypto = require("crypto");
const path = require("path");
const { buildVenueNameToIdMap, resolveVenueId, buildVenueDetailsMap, buildLearnedVenueAddressCityMap, resolveVenueAddressCityRepair, resolveVenueFromCandidate } = require("./_lib/venue-lookup");
const { parseIcsLocation } = require("./_lib/ics-location");
const { lookupExistingStatuses } = require("./_lib/status-lookup");
const { upsertEventRows } = require("./_lib/event-upsert");
const { isLikelyNoFixedVenue } = require("./_lib/mobile-event");
const { isLikelyNotARealEvent } = require("./_lib/non-event-filter");
// Reused, not reimplemented (2026-09-29 correction, see FEED_SUBMISSIONS.md's
// "Production track record") — scripts/press-coverage-linking.js's
// extractCategory() already does keyword-based category derivation against
// this project's real taxonomy (api/admin-editorial.js's VALID_CATEGORIES)
// and already returns null (never a guess) when nothing confidently matches.
// api/cron-editorial.js and api/admin-editorial.js already require a
// scripts/*.js module the same way (see their own `require(path.join(...))`
// lines) — this is an established pattern, not a new one. Deliberately NOT
// modifying extractCategory()/CATEGORY_KEYWORDS itself in this change (no
// community/gaming keywords added, no dance/family reordering, no
// Congregation-specific rule) — that's shared logic other consumers
// (press-coverage matching) also depend on, and changing it is a separate
// decision.
const { extractCategory } = require(path.join(__dirname, "..", "scripts", "press-coverage-linking"));
// Vercel Cron job — polls every APPROVED row in feed_sources (organizer-
// submitted event feeds, registered via submit.html and approved through
// admin.html/api/admin-feeds.js) and upserts what it finds into `events`.
//
// Unlike every other cron in this project (one file hardcoded to exactly
// one venue), this one is generic: it loops over however many approved
// feeds exist, so a new self-service submission never needs a new
// deployment — only a human approval. See migration_008_feed_sources.sql
// for the full reasoning and the trust model this implements.
//
// ** v1 SCOPE — ICS, now also RSS (best-effort) and 'manual' (never polled) **
// feed_sources.feed_format is 'ics', 'rss', or 'manual' (migration_044,
// 2026-10-03 — see that migration's header for why).
//
// 'ics' — parsed in full, as always (DTSTART/DTEND/LOCATION are real,
// structured fields — see icsEventsToRows() below).
//
// 'rss' — as of 2026-10-03, actually polled and parsed (see
// rssEventsToRows() below), but on an explicitly best-effort basis: a
// generic RSS <pubDate> is when the item was POSTED, not necessarily when
// the event IS, and most RSS feeds carry no other structured date field at
// all. This project has a specific, hard-won reason to be careful about
// silently-wrong dates (see the HTML-entity leak fix) — so rather than
// trusting pubDate blindly, every RSS item's own title+description is
// first searched for an explicit, fully-qualified date (month/day/year).
// When one is found, that's used and the row still lands at the feed's
// normal trust tier. When none is found, pubDate is used as a last-resort
// placeholder, but the row is forced to status='pending_review' (never
// auto-published) with a visible note asking for a human to verify the
// date against the source — never silently treated as equally trustworthy
// as an ICS DTSTART. An item with no date signal at all (no extractable
// date AND no pubDate) is skipped entirely, same as an ICS VEVENT with no
// DTSTART.
//
// 'manual' — NOT a feed. The venue/organizer has no calendar export of any
// kind (the MBMC / Detroit History Tours pattern, 2026-10-03) and
// submitted feed_url as just "a link to where their events are listed" —
// never fetched, never scraped, never parsed here. This row exists purely
// so it shows up in admin.html's queue for a human to follow up on by hand
// (a one-time manual pull, same as those two sources), not for this cron
// to act on automatically. Generic HTML scraping of an arbitrary site
// structure is deliberately NOT attempted — this project's own convention
// is "never invent, always flag" (see FEED_SUBMISSIONS.md), and a generic
// scraper would have no way to honestly tell a real event date from
// unrelated page text the way the ICS/RSS parsers above can.
//
// ** No RRULE expansion. ** A VEVENT with a recurrence rule and no further
// explicit instances is read as its single DTSTART occurrence only, not
// expanded into a real recurring series. Most calendar exports meant for
// subscription (Google Calendar's "secret address", WordPress's Events
// Calendar plugin) already expand near-term recurring instances into
// individual VEVENTs on their own, so this covers the common case; a feed
// that relies on RRULE expansion for future dates will undercount until
// re-polled closer to each occurrence. Flagged here rather than silently
// mishandled.

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

const DEFAULT_STATUS = "approved";
// Used instead of DEFAULT_STATUS for a brand-new row derived from an RSS
// item whose date came from a best-effort extraction rather than a real
// structured date field (see rssEventsToRows() below). Matches
// api/submit.js's own single-submission default — "needs a human look
// before it's trusted," not "auto-published at the feed's trust tier."
// Never applied to a row whose external_id already has a status an admin
// set (the same existingStatusByExternalId lookup that protects ICS rows
// protects these too — see the main loop below).
const RSS_FALLBACK_STATUS = "pending_review";

// Same generic numeric-entity decoder used across the other crons (see e.g.
// cron-wdet.js) — applied defensively here too, since an organizer's feed
// could come from literally any calendar platform, some of which are known
// to leak HTML entities (WordPress's &#038; being the recurring example
// this project already had to fix everywhere else).
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

// ---- iCalendar (RFC 5545) parsing ----

// A line starting with a space or tab continues the previous line ("line
// folding") — has to be undone before anything else can be parsed.
function unfoldIcs(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .reduce((lines, line) => {
      if (/^[ \t]/.test(line) && lines.length) {
        lines[lines.length - 1] += line.slice(1);
      } else {
        lines.push(line);
      }
      return lines;
    }, []);
}

function parseIcsPropertyLine(line) {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;
  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = left.split(";");
  const params = {};
  paramParts.forEach((p) => {
    const eq = p.indexOf("=");
    if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  });
  return { name: name.toUpperCase(), value, params };
}

// Unescapes ICS TEXT-value escaping (RFC 5545 §3.3.11) — \n, \, \; \\.
// Distinct from HTML-entity decoding above; a feed can need both.
function unescapeIcsText(str) {
  if (!str) return str;
  return str.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseIcsEvents(icsText) {
  const lines = unfoldIcs(icsText);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (!line) continue;
    if (line === "BEGIN:VEVENT") { current = {}; continue; }
    if (line === "END:VEVENT") { if (current) events.push(current); current = null; continue; }
    if (!current) continue; // ignore VCALENDAR/VTIMEZONE/etc. properties outside a VEVENT
    const prop = parseIcsPropertyLine(line);
    if (!prop) continue;
    if (prop.name === "DTSTART") current.dtstart = { value: prop.value, params: prop.params };
    else if (prop.name === "DTEND") current.dtend = { value: prop.value, params: prop.params };
    else if (prop.name === "SUMMARY") current.summary = decodeEntities(unescapeIcsText(prop.value));
    else if (prop.name === "LOCATION") current.location = decodeEntities(unescapeIcsText(prop.value));
    else if (prop.name === "DESCRIPTION") current.description = decodeEntities(unescapeIcsText(prop.value));
    else if (prop.name === "URL") current.url = prop.value;
    else if (prop.name === "UID") current.uid = prop.value;
    // 2026-09-05 addition — RFC 7986 §5.10 defines an IMAGE property for
    // exactly this ("a graphic image associated with the calendar or a
    // calendar component"). No organizer feed has been seen using it yet in
    // this project (v1 scope is small), but it's a real, specified property —
    // not a guess — and worth reading defensively now rather than silently
    // dropping it whenever the first feed that does set it shows up. A bare
    // URI value (the common case) reads straight into current.image; a
    // BINARY-encoded inline image (params.VALUE === "BINARY") is skipped —
    // this project stores image URLs, not raw bytes, and does not decode one.
    else if (prop.name === "IMAGE" && prop.params.VALUE !== "BINARY" && prop.value) current.image = prop.value;
  }
  return events;
}

// Parses one DTSTART/DTEND value into { date: 'YYYY-MM-DD', hour, minute }.
// hour/minute are null for an all-day (date-only) value.
//
// Timezone handling: a trailing "Z" means the digits are UTC and get
// converted to America/Detroit for display. Anything else — a named TZID
// (almost always America/Detroit or America/New_York for a Detroit-area
// venue's own feed) or a "floating" time with no zone at all — is read as
// already being local wall-clock time, no conversion needed. Only the UTC
// case actually needs Date/timezone math.
function parseIcsDate(raw, params) {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const isDateOnly = params.VALUE === "DATE" || h === undefined;

  if (isDateOnly) {
    return { date: `${y}-${mo}-${d}`, hour: null, minute: null };
  }
  if (z) {
    const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
    // Intl can render midnight as "24" with hour12:false in some environments.
    const hour24 = parts.hour === "24" ? 0 : parseInt(parts.hour, 10);
    return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: hour24, minute: parseInt(parts.minute, 10) };
  }
  return { date: `${y}-${mo}-${d}`, hour: parseInt(h, 10), minute: parseInt(mi, 10) };
}

function formatIcsTime(hour, minute) {
  if (hour === null || hour === undefined) return null;
  const ap = hour >= 12 ? "PM" : "AM";
  let h12 = hour % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${ap}`;
}

// The project's existing single-venue placeholder convention (see
// press-coverage-linking.js's createEvent, cron-detroitmonthofdesign.js,
// cron-planetanttheatre.js, cron-ticketmaster.js, api/event-meta.js) —
// used here only in the location_per_event branch below, and only when
// there is genuinely no per-event location signal to fall back on.
const VENUE_TBA = "Venue TBA";

// Resolves ONE VEVENT's own venue fields for a feed_source flagged
// location_per_event (migration_043) — added 2026-09-29 for the Phase 6
// per-event venue-resolution shared infrastructure (see
// api/_lib/ics-location.js's header for the full design). Never called for
// an ordinary (location_per_event=false) feed — see icsEventsToRows below,
// which keeps that path byte-for-byte as it was before this change.
//
// Three outcomes, matching the locked product decision (do not conflate
// these -- each is a genuinely different epistemic state, not just a
// different string):
//   - blank/missing LOCATION -> Venue TBA. There is no per-event signal at
//     all, so this is the one case where there's nothing to prefer over
//     "unknown" -- and it is NEVER feedSource.venue_name, because a feed
//     flagged location_per_event has already been judged (at onboarding)
//     to be an aggregator/organization, not itself a bookable venue.
//   - parseable LOCATION, confidently resolved against the canonical
//     venues table -> that canonical venue's own name/address/city/id
//     (same trust level as SH.1's own tier B/tier-by-address).
//   - parseable LOCATION, not matched to any canonical venue -> the
//     PARSED candidate name/address/city, verbatim -- an honest, real,
//     specific place this VEVENT actually named, just not yet linked to a
//     canonical row.
//   - present but UNPARSEABLE LOCATION (real text, matched neither known
//     grammar) -> the sanitized (HTML/entities stripped, whitespace
//     collapsed) raw text itself, as venue_name_raw, address/city left
//     null. This is the one case that must NOT collapse to Venue TBA or to
//     feedSource.venue_name — there IS a real, human-written location
//     signal here, it just isn't decomposable into name/address/city
//     without guessing, and discarding it would throw away real
//     information the source actually gave us.
function resolveIcsEventVenue(locationRaw, venueDetailsMaps) {
  const parsed = parseIcsLocation(locationRaw);

  if (parsed.status === "blank") {
    return { venue_name_raw: VENUE_TBA, venue_id: null, venue_address_raw: null, venue_city_raw: null };
  }

  if (parsed.status === "unparseable") {
    // BUG-012 (2026-10-04): the text is still kept whole as the honest raw
    // location and no venue name is derived from it -- but when it ends in
    // the source's own "<City> <ST> <ZIP>", the city is kept, and a plain
    // street address when one is stated (api/_lib/ics-location.js,
    // findTrailingCity). Before this, the city was discarded with the rest
    // and the event could not be placed.
    if (parsed.trailingCity) {
      const canonical = parsed.trailingAddress
        ? resolveVenueFromCandidate({ name: null, address: parsed.trailingAddress, city: parsed.trailingCity }, venueDetailsMaps)
        : null;
      if (canonical) {
        return {
          venue_name_raw: canonical.name || parsed.rawText,
          venue_id: canonical.id,
          venue_address_raw: canonical.address || parsed.trailingAddress,
          venue_city_raw: canonical.city || parsed.trailingCity,
        };
      }
      return {
        venue_name_raw: parsed.rawText,
        venue_id: null,
        venue_address_raw: parsed.trailingAddress || null,
        venue_city_raw: parsed.trailingCity,
      };
    }
    return { venue_name_raw: parsed.rawText, venue_id: null, venue_address_raw: null, venue_city_raw: null };
  }

  // status === "parsed"
  const candidate = { name: parsed.candidateName, address: parsed.candidateAddress, city: parsed.candidateCity };
  const canonical = resolveVenueFromCandidate(candidate, venueDetailsMaps);
  if (canonical) {
    return {
      // 2026-10-01: candidate.name can now genuinely be null (the two new
      // empty-name CivicPlus grammars in ics-location.js -- see that
      // file's header) -- || VENUE_TBA closes that gap for a brand-new row
      // (unlike the backfill script, there is no existing venue_name_raw
      // to fall back to here, so this can never silently write a bare
      // null into a freshly-inserted event). Never invents a name --
      // VENUE_TBA is this project's own existing, established "no name
      // available" convention, the same one the blank-LOCATION branch
      // above already uses.
      venue_name_raw: canonical.name || candidate.name || VENUE_TBA,
      venue_id: canonical.id,
      venue_address_raw: canonical.address || candidate.address || null,
      venue_city_raw: canonical.city || candidate.city || null,
    };
  }
  return {
    venue_name_raw: candidate.name || VENUE_TBA,
    venue_id: null,
    venue_address_raw: candidate.address || null,
    venue_city_raw: candidate.city || null,
  };
}

// ---- BUG-012 (2026-10-04): a feed's own city, for an event that states no
// place ---------------------------------------------------------------------
//
// Measured on 2026-10-04: 17 upcoming events from the City of Madison
// Heights calendar carried a LOCATION of "-" and reached the site with no
// city at all, so they could not be placed and each was queued for a person.
// Every other event in that same feed that states a city states Madison
// Heights. A municipal calendar's events are in that municipality unless
// they say otherwise.
//
// The rule is taken from the feed's own evidence, not from its name and not
// from a list kept by hand:
//   - only for a feed flagged location_per_event (an organization's
//     calendar; a single-venue feed already has its venue);
//   - only when the events in this fetch that DO state a city agree: one
//     city accounts for at least FEED_DEFAULT_CITY_MIN_SHARE of them, and
//     at least FEED_DEFAULT_CITY_MIN_EVIDENCE of them state it. Measured
//     across every approved feed on 2026-10-04, the share of the most
//     common city falls into two groups with nothing between them: one
//     municipality's or one institution's calendar, 96.4% to 100% (20
//     feeds); a regional organization's, 31% to 90.6% (Eastern Market
//     Partnership 31%, Garden City 67%, Tourism Windsor Essex 68%, Windsor
//     Symphony 91%). The 95% line sits in that gap. A regional feed
//     therefore never gets a default, and neither does a new feed until it
//     has shown where its events are;
//   - only for an event with no city, no street address and no linked
//     venue of its own. A stated place always wins. An event that by design
//     has no fixed venue (a tour, a parade) is left alone.
// Only venue_city_raw is filled. No venue and no address are invented:
// venue_name_raw stays whatever the event's own text produced.
const FEED_DEFAULT_CITY_MIN_EVIDENCE = 3;
const FEED_DEFAULT_CITY_MIN_SHARE = 0.95;

function feedDefaultCity(rows) {
  const seen = new Map(); // normalised city -> { city, count }
  for (const row of rows) {
    const city = typeof row.venue_city_raw === "string" ? row.venue_city_raw.trim() : "";
    if (!city) continue;
    const key = city.toLowerCase();
    if (!seen.has(key)) seen.set(key, { city, count: 0 });
    seen.get(key).count++;
  }
  let top = null;
  let total = 0;
  for (const entry of seen.values()) {
    total += entry.count;
    if (!top || entry.count > top.count) top = entry;
  }
  if (!top || top.count < FEED_DEFAULT_CITY_MIN_EVIDENCE) return null;
  return top.count / total >= FEED_DEFAULT_CITY_MIN_SHARE ? top.city : null;
}

// Fills venue_city_raw in place; returns how many rows were filled.
function applyFeedDefaultCity(rows) {
  const city = feedDefaultCity(rows);
  if (!city) return 0;
  const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";
  let filled = 0;
  for (const row of rows) {
    if (row.no_fixed_venue) continue;
    if (row.venue_id || !isBlank(row.venue_city_raw) || !isBlank(row.venue_address_raw)) continue;
    row.venue_city_raw = city;
    filled++;
  }
  return filled;
}

// Converts parsed ICS VEVENTs into rows shaped for the `events` table,
// scoped to one feed_source (which supplies default category, and — for
// every feed_source EXCEPT one flagged location_per_event (migration_043,
// 2026-09-29) — the venue name too: v1's original one-feed-one-venue
// assumption, same one every other single-venue cron in this project makes
// (e.g. cron-cinema-detroit.js's VENUE_NAME), still the correct default for
// a feed that genuinely is one venue's own calendar. A feed_source with
// location_per_event=true is an aggregator/organization (Tourism Windsor
// Essex, a CivicPlus municipal calendar, etc.) whose OWN name is never a
// real event venue — see resolveIcsEventVenue above for that branch, added
// for the Phase 6 per-event venue-resolution shared infrastructure so
// these feeds' events preserve and resolve their own VEVENT LOCATION
// instead of every event being mislabeled with the feed organization's
// name.
function icsEventsToRows(icsEvents, feedSource, venueMap, venueDetailsMaps, learnedVenueMap) {
  const rows = [];
  for (const ev of icsEvents) {
    if (!ev.dtstart) continue; // no start date at all — can't place this on the calendar
    // 2026-10-01 (Needs Follow-up remaining-gap product pass, Jody: a
    // "closed to the public" listing "should be skipped all together --
    // we don't want that listing in the site AT ALL"). Confirmed real
    // case: The Congregation's own feed publishes a literal "CLOSED FOR
    // PRIVATE EVENT" entry — skipped entirely here, before any row is
    // ever built, rather than ingested and hidden afterward.
    if (isLikelyNotARealEvent({ title: ev.summary })) continue;
    const start = parseIcsDate(ev.dtstart.value, ev.dtstart.params);
    if (!start) continue;
    const end = ev.dtend ? parseIcsDate(ev.dtend.value, ev.dtend.params) : null;

    let timeDisplay = null;
    if (start.hour !== null) {
      const startStr = formatIcsTime(start.hour, start.minute);
      const endStr = (end && end.hour !== null && end.date === start.date) ? formatIcsTime(end.hour, end.minute) : null;
      timeDisplay = endStr ? `${startStr} – ${endStr}` : startStr;
    }

    const uidOrHash = ev.uid || `${start.date}-${(ev.summary || "").slice(0, 40)}`;

    const venueFields = feedSource.location_per_event
      ? resolveIcsEventVenue(ev.location, venueDetailsMaps)
      : {
          venue_name_raw: feedSource.venue_name,
          // See api/_lib/venue-lookup.js — links to the existing venues row
          // if this feed's self-reported venue_name happens to match one
          // already in the database; never creates or guesses a fuzzy one.
          venue_id: resolveVenueId(venueMap, feedSource.venue_name),
          // Filled below by SH.1's resolveVenueAddressCityRepair when this
          // feed's venue is already known to 313.events; stays null
          // otherwise (unresolved), same honest-gap convention as venue_id
          // above.
          venue_address_raw: null,
          venue_city_raw: null,
        };

    const row = {
      external_id: `feed-${feedSource.id}-${uidOrHash}`.slice(0, 250),
      title: ev.summary || "Untitled event",
      description: ev.description ? ev.description.slice(0, 1000) : null,
      // 2026-09-29 correction — this used to be feedSource.default_category
      // unconditionally for every event a feed produces (flat, regardless of
      // that event's own title/description). Now: a confident per-event
      // derivation from the VEVENT's own title+description, via the same
      // shared extractCategory() press-coverage matching already uses,
      // falling back to the feed's own default only when extractCategory
      // finds no confident keyword match (never null, never invented) —
      // identical behavior whether this feed is location_per_event or not,
      // since category derivation doesn't depend on which venue-resolution
      // branch ran above.
      category: extractCategory(ev.summary, ev.description) || feedSource.default_category,
      // 2026-10-01 (Needs Follow-up remaining-gap product pass): this
      // shared helper (migration_040_no_fixed_venue.sql) already existed
      // for exactly this — "does this event legitimately have no
      // conventional fixed venue" — but was only ever wired into
      // cron-visitdetroit.js, never into this generic ICS pipeline. A real
      // confirmed case it already safely catches once wired in: City of
      // Northville's own "Northville High School Homecoming Parade" (the
      // existing TITLE_KEYWORD_RE already matches "parade" as a whole
      // word) — it was stuck in Needs Follow-up under VENUE ADDRESS/CITY
      // for a route description with no conventional street address, not
      // because the parser failed but because no_fixed_venue was never
      // being set for this pipeline at all. No structured per-event
      // category data exists in a generic ICS feed the way VisitDetroit's
      // Algolia index has eventCategories, so only the title-keyword
      // fallback applies here — same safe, narrow, never-a-guess posture
      // as cron-visitdetroit.js's own usage.
      no_fixed_venue: isLikelyNoFixedVenue({ title: ev.summary }),
      ...venueFields,
      start_date: start.date,
      // All-day multi-day spans only (start.hour === null) — a timed event's
      // DTEND is just its own end time, already folded into time_display
      // above, not a separate calendar day.
      end_date: (end && end.date && end.date !== start.date && start.hour === null) ? end.date : null,
      // 2026-10-01 bug fix (Needs Follow-up start-time investigation): this
      // row never set is_all_day at all, so every event ever ingested
      // through this generic ICS pipeline silently kept the column's own
      // `false` default -- regardless of whether the source's own DTSTART
      // was a genuine VALUE=DATE all-day value. Confirmed live: Royal
      // Oak's multi-day senior-center trips and Mount Clemens Library's
      // "Ask an Expert Coffee Hour" all publish "Time: All Day" on their
      // own authoritative event pages, yet landed in admin.html's Needs
      // Follow-up under START TIME -- because is_all_day was never
      // reaching the row, not because no time exists to find. parseIcsDate
      // already correctly derives hour===null for a date-only DTSTART (see
      // its own isDateOnly check above); this just finally carries that
      // signal through. admin.html's own classifyMissingFields already
      // skips the start-time check entirely when is_all_day is true (see
      // its own "check when a source has explicitly set is_all_day=true"
      // comment) -- so this one field fixes the false positive at its
      // source rather than papering over it downstream.
      is_all_day: start.hour === null,
      time_display: timeDisplay,
      ticket_url: ev.url || null,
      image_url: ev.image || null,
      // Just the feed's own organization/venue name, matching every other
      // single-venue cron's convention (e.g. cron-trinosophes.js's
      // source:"Trinosophes") — the site renders this as "via {source}",
      // so a value like "Feed: X" would read as the redundant "via Feed:
      // X". Deliberately always feedSource.venue_name, even in the
      // location_per_event branch — `source` attributes WHERE this event
      // was ingested FROM (still honest: it did come from this feed), not
      // where it physically takes place (that's venue_name_raw above).
      source: feedSource.venue_name,
      // The SOURCE (this feed URL) was human-approved in admin.html — every
      // event it produces auto-publishes at that same trust tier, same as
      // Trinosophes/HALO/Redford/etc.'s single-venue crons. Contrast Metro
      // Times, which lands pending_review because IT is an unvetted general
      // calendar, not a single approved venue.
      feed_source_id: feedSource.id,
    };

    // SH.1 (Metadata Self-Healing, 2026-09-21) — this connector has always
    // set venue_name_raw (and venue_id, when resolvable) per row but never
    // populated venue_address_raw/venue_city_raw, even when the feed's own
    // venue is already known to 313.events. Purely additive: it only ever
    // fills a field that's still blank at this point, never overwrites
    // anything venueFields above already produced (including the
    // location_per_event branch's own resolved/candidate/raw values) — see
    // api/_lib/venue-lookup.js's resolveVenueAddressCityRepair for the
    // exact/no-fuzzy repair rules (canonical venue_id match, then exact
    // canonical name match, then exact learned historical match — never a
    // guess).
    Object.assign(row, resolveVenueAddressCityRepair(row, venueDetailsMaps, learnedVenueMap));

    rows.push(row);
  }
  // BUG-012: see feedDefaultCity above. Runs once the whole fetch is known,
  // because the evidence is what the feed's other events say.
  if (feedSource.location_per_event) applyFeedDefaultCity(rows);
  return rows;
}

// ---- RSS (best-effort) parsing, added 2026-10-03 (migration_044) ----
//
// Deliberately NOT a general XML parser — same hand-rolled, no-new-deps
// style as the ICS parser above. RSS 2.0's actual grammar is small enough
// (a flat list of <item> blocks, each with a handful of known child tags)
// that a general XML library would be more surface area than this needs.

// Strips a CDATA wrapper if present, then runs the same HTML-entity
// decoder the ICS pipeline already uses — a title/description can come
// HTML-escaped either way, same reasoning as decodeEntities()'s own
// comment above.
function decodeRssText(raw) {
  if (raw == null) return null;
  const cdataMatch = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  const inner = cdataMatch ? cdataMatch[1] : raw;
  return decodeEntities(inner.trim());
}

// Pulls one tag's text content out of an <item> block. Not namespace-aware
// (no <dc:date> etc.) — v1 scope is the plain RSS 2.0 tags every common
// platform (WordPress's default feed, Squarespace, etc.) already emits.
function rssTag(itemXml, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const m = re.exec(itemXml);
  return m ? decodeRssText(m[1]) : null;
}

function parseRssItems(xmlText) {
  const items = [];
  const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xmlText))) {
    const block = m[1];
    items.push({
      title: rssTag(block, "title"),
      link: rssTag(block, "link"),
      description: rssTag(block, "description") || rssTag(block, "content:encoded"),
      pubDate: rssTag(block, "pubDate"),
      guid: rssTag(block, "guid"),
    });
  }
  return items;
}

// Full month name + common abbreviations -> 1-12. Used only by
// extractExplicitDateFromText below.
const MONTH_NAMES = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

// Searches free text (an RSS item's own title+description) for an
// explicit, fully-qualified (month+day+YEAR) date — never a bare
// month/day with no year, since guessing a year would be exactly the kind
// of invented-not-found information this project's "never invent, always
// flag" convention exists to avoid. Tries, in order: "Month D, YYYY" (or
// "Mon D YYYY"), "M/D/YYYY", and ISO "YYYY-MM-DD". Returns
// { date: 'YYYY-MM-DD' } for the first confident match, or null if none of
// these specific, unambiguous shapes appears anywhere in the text.
function extractExplicitDateFromText(text) {
  if (!text) return null;

  const monthNameRe = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i;
  let m = monthNameRe.exec(text);
  if (m) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month && day >= 1 && day <= 31) {
      return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    }
  }

  const slashRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
  m = slashRe.exec(text);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    }
  }

  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/;
  m = isoRe.exec(text);
  if (m) {
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: m[0] };
    }
  }

  return null;
}

// RFC 822-ish pubDate (e.g. "Tue, 03 Oct 2026 14:00:00 GMT") -> 'YYYY-MM-DD',
// converted to America/Detroit the same way parseIcsDate's UTC branch does.
// Returns null for anything JS's Date can't parse rather than guessing.
function parseRssPubDate(pubDate) {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Converts parsed RSS items into rows shaped for the `events` table, one
// feed_source at a time — the RSS analog of icsEventsToRows() above, but
// deliberately simpler: no location_per_event branch (not requested for
// v1), no end_date/time_display (RSS carries no reliable structured time
// at all, so none is invented), and every row carries an honest
// date-confidence note rather than presenting a guessed date the same way
// as a real DTSTART.
function rssEventsToRows(rssItems, feedSource, venueMap) {
  const rows = [];
  for (const item of rssItems) {
    if (!item.title && !item.description) continue; // nothing to even derive a category/title from
    if (isLikelyNotARealEvent({ title: item.title })) continue;

    const combinedText = `${item.title || ""} ${item.description || ""}`;
    const explicit = extractExplicitDateFromText(combinedText);
    const pubDateFallback = !explicit ? parseRssPubDate(item.pubDate) : null;
    const dateStr = explicit ? explicit.date : pubDateFallback;
    if (!dateStr) continue; // no date signal at all — can't place this on the calendar, same as ICS's missing-DTSTART skip

    const uidOrHash = item.guid || item.link || `${dateStr}-${(item.title || "").slice(0, 40)}`;

    const row = {
      external_id: `feed-${feedSource.id}-${uidOrHash}`.slice(0, 250),
      title: item.title || "Untitled event",
      description: item.description ? item.description.slice(0, 1000) : null,
      category: extractCategory(item.title, item.description) || feedSource.default_category,
      no_fixed_venue: isLikelyNoFixedVenue({ title: item.title }),
      venue_name_raw: feedSource.venue_name,
      venue_id: resolveVenueId(venueMap, feedSource.venue_name),
      venue_address_raw: null,
      venue_city_raw: null,
      start_date: dateStr,
      end_date: null,
      is_all_day: true, // no reliable per-event time signal in generic RSS — never invented
      time_display: null,
      ticket_url: item.link || null,
      image_url: null,
      source: feedSource.venue_name,
      feed_source_id: feedSource.id,
      // Visible, honest flag distinguishing the two ways this row's date
      // was produced — never silently indistinguishable from a real ICS
      // DTSTART. explicit._confidence is read by the caller below to pick
      // this row's status (pending_review for the fallback case).
      note: explicit
        ? "Date auto-extracted from this feed's own RSS item text — please verify it matches the source before relying on it."
        : "No explicit date found in this RSS item's own text — the date shown is a rough placeholder from the feed's publish date (pubDate), which is very likely wrong. Please verify against the source before publishing.",
      _dateConfidence: explicit ? "extracted" : "pubdate-fallback",
    };

    rows.push(row);
  }
  return rows;
}

// Shared by the ics and rss branches of the main loop below: looks up each
// row's current status (so an admin's prior approve/reject on an existing
// external_id is never clobbered — see WP 0.17's fail-closed comment on
// the original ICS-only version of this logic), then upserts. `statusForRow`
// picks the DEFAULT status for a genuinely NEW row only (ics: always
// DEFAULT_STATUS; rss: DEFAULT_STATUS for an explicit-date row,
// RSS_FALLBACK_STATUS for a pubDate-fallback row — see rssEventsToRows()'s
// _dateConfidence field). Returns { pollResult, upserted } on success, or
// null after already writing a 502 response itself (status-lookup failure
// aborts the WHOLE run, same fail-closed posture as before this was
// factored out — never silently falls back to an empty map).
async function upsertParsedRows(rows, statusForRow, sbHeaders, res) {
  let existingStatusByExternalId;
  try {
    existingStatusByExternalId = await lookupExistingStatuses(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      rows.map((r) => r.external_id)
    );
  } catch (lookupErr) {
    res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
    return null;
  }
  const rowsWithStatus = rows.map((row) => {
    // _dateConfidence/_ is an internal marker only (rssEventsToRows), never
    // sent to Supabase as a column.
    const { _dateConfidence, ...cleanRow } = row;
    return {
      ...cleanRow,
      status: existingStatusByExternalId.get(row.external_id) || statusForRow(row),
    };
  });

  const upsertResp = await upsertEventRows(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, rowsWithStatus);
  if (!upsertResp.ok) {
    const errText = await upsertResp.text();
    // `upserted` is what actually landed (rows in key-shape groups that
    // were accepted -- see api/_lib/event-upsert.js); `failed` keeps a
    // partial write from being read as a clean one by the caller.
    return { pollResult: `Parsed ${rows.length} event${rows.length === 1 ? "" : "s"} but Supabase upsert failed: ${errText}`, upserted: upsertResp.written, failed: true };
  }
  return { pollResult: `${rows.length} event${rows.length === 1 ? "" : "s"} found`, upserted: rows.length };
}

async function patchFeedSource(id, patch, sbHeaders) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/feed_sources?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...sbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
  } catch {
    // Best-effort status tracking only — never let this fail the poll loop.
  }
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

  let feedSources;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/feed_sources?status=eq.approved&select=*`, { headers: sbHeaders });
    feedSources = await r.json();
    if (!Array.isArray(feedSources)) throw new Error("Unexpected response shape");
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "Failed to load feed_sources: " + err.message });
    return;
  }

  if (!feedSources.length) {
    res.status(200).json({ upserted: 0, feedsChecked: 0, fetchedAt: new Date().toISOString() });
    return;
  }

  let totalUpserted = 0;
  const results = [];

  // See api/_lib/venue-lookup.js — one lookup for the whole run, reused
  // across every approved feed source below.
  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // SH.1 (Metadata Self-Healing) — same one-lookup-per-run pattern, for
  // venue_address_raw/venue_city_raw repair. See api/_lib/venue-lookup.js.
  const venueDetailsMaps = await buildVenueDetailsMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const learnedVenueMap = await buildLearnedVenueAddressCityMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  for (const feedSource of feedSources) {
    let pollResult;
    try {
      if (feedSource.feed_format === "manual") {
        // Never fetched, never scraped — see this file's header and
        // migration_044. This row exists purely for admin.html's queue;
        // a human follows up by hand (a one-time manual pull, same as
        // MBMC/Detroit History Tours), not this cron.
        pollResult = "Not polled automatically — no feed/export exists for this source; awaiting manual follow-up (see admin.html's Feed sources queue).";
      } else if (feedSource.feed_format === "rss") {
        const r = await fetch(feedSource.feed_url, {
          headers: { "User-Agent": "313.events event calendar (feed submitted directly by this venue/organizer)" },
        });
        if (!r.ok) {
          pollResult = `Fetch failed: HTTP ${r.status}`;
        } else {
          const text = await r.text();
          const rssItems = parseRssItems(text);
          const rows = rssEventsToRows(rssItems, feedSource, venueMap);

          if (!rows.length) {
            pollResult = "Fetched OK — 0 events found (feed may be empty, all-past, or carry no extractable date)";
          } else {
            const statusForRow = (row) => (row._dateConfidence === "extracted" ? DEFAULT_STATUS : RSS_FALLBACK_STATUS);
            const outcome = await upsertParsedRows(rows, statusForRow, sbHeaders, res);
            if (outcome === null) return; // upsertParsedRows already wrote the 502 response
            totalUpserted += outcome.upserted;
            const lowConfidenceCount = rows.filter((r) => r._dateConfidence !== "extracted").length;
            pollResult = outcome.upserted && !outcome.failed
              ? `${outcome.pollResult}${lowConfidenceCount ? ` (${lowConfidenceCount} with a pubDate-fallback date, needs human verification)` : ""}`
              : outcome.pollResult;
          }
        }
      } else if (feedSource.feed_format !== "ics") {
        // Unrecognized/future format value this deployment doesn't know
        // about yet — fail closed (skip), never guess at a parser.
        pollResult = `Skipped — unrecognized feed_format '${feedSource.feed_format}'`;
      } else {
        const r = await fetch(feedSource.feed_url, {
          headers: { "User-Agent": "313.events event calendar (feed submitted directly by this venue/organizer)" },
        });
        if (!r.ok) {
          pollResult = `Fetch failed: HTTP ${r.status}`;
        } else {
          const text = await r.text();
          const icsEvents = parseIcsEvents(text);
          const rows = icsEventsToRows(icsEvents, feedSource, venueMap, venueDetailsMaps, learnedVenueMap);

          if (!rows.length) {
            pollResult = "Fetched OK — 0 events found (feed may be empty, all-past, or in an unsupported shape)";
          } else {
            // Look up each row's current status before writing, so an
            // admin's approve/reject decision on an existing row isn't reset
            // to DEFAULT_STATUS by this merge-duplicates upsert. 2026-09-02
            // fix for the status-clobbering bug — see cron-lagerhouse.js's
            // header comment for the full story. WP 0.17 (2026-09-22):
            // fail-closed status lookup — see upsertParsedRows() above,
            // which this now shares with the rss branch.
            const outcome = await upsertParsedRows(rows, () => DEFAULT_STATUS, sbHeaders, res);
            if (outcome === null) return; // upsertParsedRows already wrote the 502 response
            totalUpserted += outcome.upserted;
            pollResult = outcome.pollResult;
          }
        }
      }
    } catch (err) {
      pollResult = "Error: " + err.message;
    }

    results.push({ id: feedSource.id, venue: feedSource.venue_name, result: pollResult });
    await patchFeedSource(feedSource.id, { last_polled_at: new Date().toISOString(), last_poll_result: pollResult }, sbHeaders);
  }

  res.status(200).json({ upserted: totalUpserted, feedsChecked: feedSources.length, results, fetchedAt: new Date().toISOString() });
};
