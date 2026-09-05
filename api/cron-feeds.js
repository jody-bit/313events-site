const crypto = require("crypto");
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
// ** v1 SCOPE — ICS ONLY **
// feed_sources.feed_format can be 'ics' or 'rss', but only 'ics' is
// actually parsed here. Generic RSS has no reliable event start-date
// semantics (a <pubDate> is when the item was posted, not when the event
// IS) — auto-parsing it risks silently wrong dates, which is exactly the
// kind of silent-wrongness this project has already been burned by once
// (see the HTML-entity leak fix). An 'rss' row is left alone — recorded as
// "not polled" every run — rather than guessed at. Worth building properly
// later, not stubbed out badly now.
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

// Converts parsed ICS VEVENTs into rows shaped for the `events` table,
// scoped to one feed_source (which supplies venue name + default category —
// v1 assumes one feed = one venue, same assumption every single-venue cron
// in this project already makes, e.g. cron-cinema-detroit.js's VENUE_NAME).
function icsEventsToRows(icsEvents, feedSource) {
  const rows = [];
  for (const ev of icsEvents) {
    if (!ev.dtstart) continue; // no start date at all — can't place this on the calendar
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

    rows.push({
      external_id: `feed-${feedSource.id}-${uidOrHash}`.slice(0, 250),
      title: ev.summary || "Untitled event",
      description: ev.description ? ev.description.slice(0, 1000) : null,
      category: feedSource.default_category,
      venue_name_raw: feedSource.venue_name,
      start_date: start.date,
      // All-day multi-day spans only (start.hour === null) — a timed event's
      // DTEND is just its own end time, already folded into time_display
      // above, not a separate calendar day.
      end_date: (end && end.date && end.date !== start.date && start.hour === null) ? end.date : null,
      time_display: timeDisplay,
      ticket_url: ev.url || null,
      image_url: ev.image || null,
      // Just the venue name, matching every other single-venue cron's
      // convention (e.g. cron-trinosophes.js's source:"Trinosophes") — the
      // site renders this as "via {source}", so a value like "Feed: X"
      // would read as the redundant "via Feed: X".
      source: feedSource.venue_name,
      // The SOURCE (this feed URL) was human-approved in admin.html — every
      // event it produces auto-publishes at that same trust tier, same as
      // Trinosophes/HALO/Redford/etc.'s single-venue crons. Contrast Metro
      // Times, which lands pending_review because IT is an unvetted general
      // calendar, not a single approved venue.
      feed_source_id: feedSource.id,
    });
  }
  return rows;
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

  for (const feedSource of feedSources) {
    let pollResult;
    try {
      if (feedSource.feed_format !== "ics") {
        pollResult = "Skipped — only .ics feeds are polled in this version (see cron-feeds.js header note)";
      } else {
        const r = await fetch(feedSource.feed_url, {
          headers: { "User-Agent": "313.events event calendar (feed submitted directly by this venue/organizer)" },
        });
        if (!r.ok) {
          pollResult = `Fetch failed: HTTP ${r.status}`;
        } else {
          const text = await r.text();
          const icsEvents = parseIcsEvents(text);
          const rows = icsEventsToRows(icsEvents, feedSource);

          if (!rows.length) {
            pollResult = "Fetched OK — 0 events found (feed may be empty, all-past, or in an unsupported shape)";
          } else {
            // Look up each row's current status before writing, so an
            // admin's approve/reject decision on an existing row isn't reset
            // to DEFAULT_STATUS by this merge-duplicates upsert. 2026-09-02
            // fix for the status-clobbering bug — see cron-lagerhouse.js's
            // header comment for the full story.
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
              // feed's first-ever poll.
            }
            const rowsWithStatus = rows.map((row) => ({
              ...row,
              status: existingStatusByExternalId.get(row.external_id) || DEFAULT_STATUS,
            }));

            const upsertResp = await fetch(`${SUPABASE_URL}/rest/v1/events?on_conflict=external_id`, {
              method: "POST",
              headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
              body: JSON.stringify(rowsWithStatus),
            });
            if (!upsertResp.ok) {
              const errText = await upsertResp.text();
              pollResult = `Parsed ${rows.length} event${rows.length === 1 ? "" : "s"} but Supabase upsert failed: ${errText}`;
            } else {
              totalUpserted += rows.length;
              pollResult = `${rows.length} event${rows.length === 1 ? "" : "s"} found`;
            }
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
