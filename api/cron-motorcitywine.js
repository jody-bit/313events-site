const crypto = require("crypto");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
// Vercel Cron job — pulls MotorCity Wine (Corktown, Detroit) events from
// their own public Google Calendar. Added 2026-09-18 after Jody asked "do
// we have a motor city wine cron?" (answer at the time: no, just one
// manual one-off — see supabase/archive/update_2026-09-14_motorcity-wine-
// hi-five-four.sql) and then sent their MailerLite weekly digest + their
// site's /calendar/ page as source material.
//
// SOURCE: motorcitywine.com/calendar/ embeds a Google Calendar iframe
// (id decodes to v82p5lga1ejf1pbq2g6slce9t8@group.calendar.google.com).
// That embed itself is a client-rendered SPA — a real fetch of the embed
// HTML comes back with none of the actual event titles in it (confirmed
// live, same due-diligence check every other cron here does before
// picking a source), so it's NOT scrapeable the way rockindetroit.com or
// dossin's page are. The calendar's own public ICS feed is: plain text,
// no JS needed, and is exactly what this file fetches instead.
//
// ICS_URL is Google's standard public-calendar export for that same
// calendar ID. No API key needed — this is the same feed format any
// calendar app uses to "subscribe" to a public Google Calendar.
//
// RRULE SUPPORT — deliberately narrow, matching what this specific
// calendar's feed actually contains (confirmed by inspecting all 93
// distinct RRULE strings live in the feed on 2026-09-18): every recurring
// series here is FREQ=WEEKLY (a single BYDAY matching DTSTART's own
// weekday — Tango Night every Wednesday, etc.) or FREQ=MONTHLY with a
// single Nth-or-last-weekday BYDAY (e.g. "3SU" = 3rd Sunday, "-1SU" =
// last Sunday — Beautiful Sunday, Hi-Five Four). No BYSETPOS, no
// FREQ=DAILY/YEARLY event series, no multi-day BYDAY lists were seen.
// expandRRule() below only implements those two shapes; anything else is
// skipped with a note rather than guessed at.
//
// OVERRIDES/CANCELLATIONS: a specific date within a recurring series can
// be overridden (RECURRENCE-ID — e.g. "Beautiful Sunday" -> "Beautiful
// Sunday with Rick Wilhite" on a specific date) or removed outright
// (EXDATE, no replacement). Every VEVENT carrying its own RECURRENCE-ID is
// itself a real, already-dated, concrete occurrence — pulled in directly
// via its own DTSTART/SUMMARY rather than needing to be "matched" back
// onto the master's generated sequence. The master's own generated
// sequence then has both EXDATE dates AND every one of its overrides'
// RECURRENCE-ID dates removed, so nothing shows up twice.
//
// TIMEZONE: this calendar's events are all America/New_York (same zone as
// Detroit), given either as DTSTART;TZID=America/New_York:<local wall
// clock> or as a plain UTC DTSTART:<...>Z. Both are normalized to the same
// "naive Eastern wall-clock" {y,m,d,h,min} shape before any RRULE math or
// display formatting runs, using Intl's real America/New_York conversion
// for the Z-form only (see toEasternParts()) — this project doesn't store
// true timestamps anywhere (start_date + time_display strings only), so
// wall-clock is exactly what's needed, nothing more.
//
// CATEGORY: this single calendar covers live jazz combos, DJ/dance
// nights, a weekly Tango Night, a monthly wine tasting, and several
// rotating food-truck pop-ups — there's no genre field in the feed at
// all, just a plain title. categoryForTitle() below is a best-effort
// keyword heuristic (Trio/Quartet/Band -> 'music', DJ/Sunday-night-series
// names -> 'nightlife', "pop-up"/"Food Truck" -> 'food', "Tango" ->
// 'dance', "Wine Tasting" -> 'food'), same "guess honestly, flag it"
// convention as every other best-effort field in this project — every row
// it produces carries a `note` saying the category was keyword-guessed,
// so a wrong call is visible and fixable in admin.html rather than silent.
//
// DEFAULT_STATUS = "approved" — MotorCity Wine is one specific, explicitly
// vetted venue (same trust tier as cron-oldmiami.js / cron-lagerhouse.js),
// not an unfiltered multi-venue feed. If the food-pop-up rows turn out to
// be more noise than signal on the live calendar, the fix is hiding them
// via admin.html's "Live events" search/takedown tool (or asking to
// exclude that category outright) — not something this cron should
// silently decide on its own.
//
// ** STATUS-PRESERVING UPSERT ** — see cron-lagerhouse.js's header for the
// bug this avoids (an approve/reject decision surviving a later re-run).
//
// ** BEST-EFFORT ** — built from a real fetched ICS feed and real RRULE
// math, but this is the first source in this project needing recurrence
// expansion at all. Spot-check the first live run against
// motorcitywine.com/calendar/ itself.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

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

const CALENDAR_ID = "v82p5lga1ejf1pbq2g6slce9t8@group.calendar.google.com";
const ICS_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
const VENUE_NAME = "MotorCity Wine"; // matches the existing venues row exactly (Corktown) — see supabase/archive/update_2026-09-14_motorcity-wine-hi-five-four.sql
const VENUE_ADDRESS = "1949 Michigan Ave";
const VENUE_CITY = "Detroit";
const DEFAULT_STATUS = "approved";
const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (313.events event calendar)" };
const WINDOW_DAYS = 60; // how far forward to expand recurring series each run
const MAX_EVENTS_PER_RUN = 150; // safety cap — this calendar typically has ~25-35 occurrences in a 60-day window

// ---------------------------------------------------------------------------
// ICS parsing
// ---------------------------------------------------------------------------

function unfoldICS(text) {
  // RFC5545 line folding: a line starting with a single space or tab is a
  // continuation of the previous line (the space/tab itself is not part of
  // the value).
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeICSText(str) {
  if (!str) return str;
  return str
    .replace(/^<html-blob>/, "") // seen on some DESCRIPTION values — not real HTML, just a literal marker prefix
    .replace(/<[^>]+>/g, " ")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// Splits "NAME;PARAM=X:VALUE" into { name, params: {PARAM:"X"}, value }.
function parsePropertyLine(line) {
  const colonIdx = line.indexOf(":");
  if (colonIdx < 0) return null;
  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const parts = head.split(";");
  const name = parts[0].toUpperCase();
  const params = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq < 0) continue;
    params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
  }
  return { name, params, value };
}

// Parses a DATE-TIME value (either "YYYYMMDDTHHMMSSZ" or a bare
// "YYYYMMDDTHHMMSS" local wall-clock under a TZID param) into naive
// {y,m,d,h,min} parts already in America/New_York wall-clock terms.
function toEasternParts(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", , z] = m;
  if (z || !params || !params.TZID) {
    // UTC instant (or a bare date with no timezone info at all, treated as
    // UTC midnight) — convert to real America/New_York wall-clock via Intl
    // rather than hand-rolling DST rules.
    const utcDate = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = {};
    for (const p of fmt.formatToParts(utcDate)) parts[p.type] = p.value;
    return { y: +parts.year, mo: +parts.month, d: +parts.day, h: parts.hour === "24" ? 0 : +parts.hour, mi: +parts.minute };
  }
  // TZID=America/New_York (or America/Detroit — same zone): already local
  // wall-clock, no conversion needed.
  return { y: +y, mo: +mo, d: +d, h: +h, mi: +mi };
}

// A "naive" Date object — the Eastern wall-clock numbers stored AS IF they
// were UTC, purely so getUTCDay()/Date.UTC() calendar math works
// predictably regardless of the server's own timezone. Never used as a
// real instant/for real elapsed time.
function naiveDate(parts) {
  return new Date(Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi));
}

function dateKey(parts) {
  return `${parts.y}${String(parts.mo).padStart(2, "0")}${String(parts.d).padStart(2, "0")}T${String(parts.h).padStart(2, "0")}${String(parts.mi).padStart(2, "0")}`;
}

function parseICS(text) {
  const lines = unfoldICS(text);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const prop = parsePropertyLine(line);
    if (!prop) continue;
    switch (prop.name) {
      case "UID": cur.uid = prop.value; break;
      case "SUMMARY": cur.summary = unescapeICSText(prop.value); break;
      case "DESCRIPTION": cur.description = unescapeICSText(prop.value); break;
      case "STATUS": cur.status = prop.value; break;
      case "DTSTART": cur.dtstart = toEasternParts(prop.value, prop.params); break;
      case "DTEND": cur.dtend = toEasternParts(prop.value, prop.params); break;
      case "RRULE": cur.rrule = prop.value; break;
      case "RECURRENCE-ID": cur.recurrenceId = toEasternParts(prop.value, prop.params); break;
      case "EXDATE":
        for (const v of prop.value.split(",")) {
          const p = toEasternParts(v, prop.params);
          if (p) cur.exdates.push(dateKey(p));
        }
        break;
      default: break;
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// RRULE expansion — see file header for exactly which shapes are supported
// ---------------------------------------------------------------------------

const DAY_IDX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRRule(str) {
  const out = { freq: null, interval: 1, byday: [], until: null, count: null };
  for (const part of str.split(";")) {
    const [k, v] = part.split("=");
    if (!k || v === undefined) continue;
    switch (k.toUpperCase()) {
      case "FREQ": out.freq = v.toUpperCase(); break;
      case "INTERVAL": out.interval = parseInt(v, 10) || 1; break;
      case "COUNT": out.count = parseInt(v, 10) || null; break;
      case "UNTIL": out.until = naiveDate(toEasternParts(v, null) || { y: 9999, mo: 1, d: 1, h: 0, mi: 0 }); break;
      case "BYDAY":
        out.byday = v.split(",").map((tok) => {
          const m = tok.match(/^(-?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
          if (!m) return null;
          return { n: m[1] ? parseInt(m[1], 10) : null, day: DAY_IDX[m[2]] };
        }).filter(Boolean);
        break;
      default: break;
    }
  }
  return out;
}

function nthWeekdayOfMonth(year, month0, n, dayIdx, h, mi) {
  if (n && n > 0) {
    const firstDay = new Date(Date.UTC(year, month0, 1)).getUTCDay();
    const offset = (dayIdx - firstDay + 7) % 7;
    const date = 1 + offset + (n - 1) * 7;
    return new Date(Date.UTC(year, month0, date, h, mi));
  }
  // last (or unspecified -> treat as last, though every observed case here is -1)
  const lastDayNum = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const lastWeekday = new Date(Date.UTC(year, month0, lastDayNum)).getUTCDay();
  const offset = (lastWeekday - dayIdx + 7) % 7;
  const date = lastDayNum - offset;
  return new Date(Date.UTC(year, month0, date, h, mi));
}

// Returns an array of naive Date objects for this master event's own
// occurrences (NOT yet filtered against EXDATE/overrides — see caller).
function expandRRule(dtstart, rrule, windowEndNaive) {
  const rule = parseRRule(rrule);
  const start = naiveDate(dtstart);
  const results = [];
  const SAFETY_CAP = 1000;

  if (rule.freq === "WEEKLY") {
    const bydays = rule.byday.length ? rule.byday.map((b) => b.day) : [start.getUTCDay()];
    for (const dayIdx of bydays) {
      // first occurrence of this weekday on/after DTSTART
      let cur = new Date(start);
      const diff = (dayIdx - cur.getUTCDay() + 7) % 7;
      cur.setUTCDate(cur.getUTCDate() + diff);
      let n = 0;
      while (results.length < SAFETY_CAP) {
        if (rule.until && cur > rule.until) break;
        results.push(new Date(cur));
        n++;
        if (rule.count && n >= rule.count) break;
        if (cur > windowEndNaive && (rule.until || rule.count)) {
          // still need to keep honoring UNTIL/COUNT precisely (series
          // identity), but once we're well past the window there's no
          // point computing further — bail once comfortably past it.
          if (cur.getTime() - windowEndNaive.getTime() > 30 * 24 * 3600 * 1000) break;
        } else if (cur > windowEndNaive) {
          break; // no UNTIL/COUNT — an open-ended series, safe to stop once past the window
        }
        cur.setUTCDate(cur.getUTCDate() + 7 * rule.interval);
      }
    }
  } else if (rule.freq === "MONTHLY" && rule.byday.length === 1) {
    const { n: nth, day: dayIdx } = rule.byday[0];
    let year = start.getUTCFullYear();
    let month0 = start.getUTCMonth();
    let count = 0;
    while (results.length < SAFETY_CAP) {
      const occ = nthWeekdayOfMonth(year, month0, nth, dayIdx, start.getUTCHours(), start.getUTCMinutes());
      if (occ >= start) {
        if (rule.until && occ > rule.until) break;
        results.push(occ);
        count++;
        if (rule.count && count >= rule.count) break;
      }
      month0 += rule.interval;
      if (month0 > 11) { year += Math.floor(month0 / 12); month0 = month0 % 12; }
      if (occ > windowEndNaive) {
        const pastBy = occ.getTime() - windowEndNaive.getTime();
        if (pastBy > 90 * 24 * 3600 * 1000) break;
      }
    }
  }
  // FREQ values other than WEEKLY/MONTHLY, or MONTHLY with >1 BYDAY entry,
  // aren't in this calendar's data as of 2026-09-18 — returns [] rather
  // than guessing at an expansion.
  return results;
}

// ---------------------------------------------------------------------------
// Category heuristic — see file header
// ---------------------------------------------------------------------------

function categoryForTitle(title) {
  const t = title.toLowerCase();
  if (/pop-?up|food truck|wine tasting/.test(t)) return "food";
  if (/tango/.test(t)) return "dance";
  if (/trio|quartet|quintet|ensemble|\bband\b|jazz/.test(t)) return "music";
  return "nightlife"; // DJ nights, "Beautiful Sunday", "Monday is The New Monday", "Tropicalia", "Maybe Tonight", "Sunday Sessions", etc.
}

function formatTime(h, mi) {
  const period = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(mi).padStart(2, "0")} ${period}`;
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

  let icsText;
  try {
    const r = await fetch(ICS_URL, { headers: FETCH_HEADERS });
    if (!r.ok) {
      res.status(200).json({ upserted: 0, error: `ICS fetch failed: HTTP ${r.status}` });
      return;
    }
    icsText = await r.text();
  } catch (err) {
    res.status(200).json({ upserted: 0, error: "ICS fetch failed: " + err.message });
    return;
  }

  const vevents = parseICS(icsText);

  const now = new Date();
  const todayParts = toEasternParts(
    `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}00Z`,
    null
  );
  const todayNaive = naiveDate({ ...todayParts, h: 0, mi: 0 });
  const windowEndNaive = new Date(todayNaive.getTime() + WINDOW_DAYS * 24 * 3600 * 1000);

  // Group by UID.
  const byUid = new Map();
  for (const e of vevents) {
    if (!e.uid) continue;
    if (!byUid.has(e.uid)) byUid.set(e.uid, []);
    byUid.get(e.uid).push(e);
  }

  const occurrences = []; // { dateNaive, summary, description }

  for (const [, group] of byUid) {
    const master = group.find((e) => !e.recurrenceId);
    const overrides = group.filter((e) => e.recurrenceId);

    // Every override is itself a concrete, already-dated occurrence.
    for (const ov of overrides) {
      if (!ov.dtstart) continue;
      if (ov.status === "CANCELLED") continue;
      occurrences.push({ dateNaive: naiveDate(ov.dtstart), summary: ov.summary, description: ov.description });
    }

    if (!master || !master.dtstart) continue;
    if (master.status === "CANCELLED" && !master.rrule) continue;

    const excludeKeys = new Set(master.exdates || []);
    for (const ov of overrides) {
      if (ov.recurrenceId) excludeKeys.add(dateKey(ov.recurrenceId));
    }

    if (master.rrule) {
      const occs = expandRRule(master.dtstart, master.rrule, windowEndNaive);
      for (const occ of occs) {
        const key = dateKey({ y: occ.getUTCFullYear(), mo: occ.getUTCMonth() + 1, d: occ.getUTCDate(), h: occ.getUTCHours(), mi: occ.getUTCMinutes() });
        if (excludeKeys.has(key)) continue;
        occurrences.push({ dateNaive: occ, summary: master.summary, description: master.description });
      }
    } else {
      // Plain single (non-recurring) event.
      occurrences.push({ dateNaive: naiveDate(master.dtstart), summary: master.summary, description: master.description });
    }
  }

  // Filter to the window, sort, cap.
  const inWindow = occurrences
    .filter((o) => o.dateNaive >= todayNaive && o.dateNaive <= windowEndNaive)
    .sort((a, b) => a.dateNaive - b.dateNaive)
    .slice(0, MAX_EVENTS_PER_RUN);

  const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const venueId = resolveVenueId(venueMap, VENUE_NAME);

  const rawRows = inWindow.map((o) => {
    const y = o.dateNaive.getUTCFullYear();
    const mo = o.dateNaive.getUTCMonth() + 1;
    const d = o.dateNaive.getUTCDate();
    const h = o.dateNaive.getUTCHours();
    const mi = o.dateNaive.getUTCMinutes();
    const dateISO = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const title = o.summary || "MotorCity Wine event";
    return {
      external_id: `mcw-ical-${dateISO}-${crypto.createHash("md5").update(title).digest("hex").slice(0, 10)}`,
      title,
      description: o.description || undefined,
      category: categoryForTitle(title),
      venue_name_raw: VENUE_NAME,
      venue_id: venueId,
      venue_address_raw: VENUE_ADDRESS,
      venue_city_raw: VENUE_CITY,
      start_date: dateISO,
      time_display: formatTime(h, mi),
      is_free: undefined, // this calendar never states pricing — never guessed, same convention as every other source
      source: "MotorCity Wine (public Google Calendar)",
      ticket_url: "https://motorcitywine.com/calendar/",
      note: "Category machine-guessed from the title by keyword heuristic (this calendar has no genre field) — please double check.",
    };
  });

  const seen = new Map();
  for (const row of rawRows) {
    if (!seen.has(row.external_id)) seen.set(row.external_id, row);
  }
  const rows = Array.from(seen.values());

  if (!rows.length) {
    res.status(200).json({ upserted: 0, note: "No occurrences parsed in the current window — layout/feed may have changed.", fetchedAt: new Date().toISOString() });
    return;
  }

  try {
    const idList = rows.map((r) => r.external_id).join(",");
    const lookupResp = await fetch(
      `${SUPABASE_URL}/rest/v1/events?external_id=in.(${idList})&select=external_id,status`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const existingStatusByExternalId = new Map();
    if (lookupResp.ok) {
      const existingRows = await lookupResp.json();
      if (Array.isArray(existingRows)) {
        existingRows.forEach((row) => existingStatusByExternalId.set(row.external_id, row.status));
      }
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
    res.status(200).json({ upserted: rowsWithStatus.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ upserted: 0, error: err.message });
  }
};
