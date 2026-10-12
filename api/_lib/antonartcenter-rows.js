"use strict";

// api/_lib/antonartcenter-rows.js
//
// Everything api/cron-antonartcenter.js decides WITHOUT touching the network
// or the database: what the Anton Art Center's two public sources say, how
// each becomes at most one event row, and which rows a person must look at
// before the public sees them. Pure functions over the sources' own markup
// and JSON, so the whole of it can be run against captured pages and checked
// row by row (test/cron-antonartcenter-rows.test.js, the fixtures under
// test/fixtures/antonartcenter/).
//
// WHAT THE SITE REALLY IS (inspected live, 2026-10-11)
// theartcenter.org is a Wix site with two unrelated content systems:
//
//  1. EXHIBITS (/exhibits). A Wix blog "post list". Each exhibition is a
//     blog post at /single-post/<slug>. The post's TITLE carries the run:
//       "Barbara Clay: Finding My Way | October 24 - December 23, 2026"
//     and the post body (Wix "Ricos" blocks, server-rendered) opens with the
//     same run on its own line, the gallery ("Level 2 Gallery"), then a
//     short description, then "---" rules, program, press release and the
//     gallery hours. og:image is the exhibition artwork (a Wix media URL
//     with a resize suffix; the original is the same URL without it).
//     /exhibits lists only the current/upcoming featured exhibitions (two on
//     2026-10-11); other current shows (an artist-choice show, a partner show)
//     are posted to the blog but not featured on that page.
//
//  2. EVENTS CALENDAR (/events). A third-party Wix app ("Events Calendar",
//     eventscalendar.co) rendered in an iframe. Its data is a public JSON
//     document (CALENDAR_API_URL) holding EVERY event it has ever had (558
//     on 2026-10-11, back to 2015). Per event: title, description (plain
//     text), location (free text), image {url, source, sizes}, buttons
//     [{label,url}], startDate / endDate ("YYYY-MM-DD" strings), startHour /
//     startMinutes / endHour / endMinutes, and three flags: allday, dateonly,
//     startonly. Facts that matter, each measured:
//       - startDate/endDate are the calendar days the organiser chose. The
//         numeric start/end are UTC midnight of those days, so converting
//         them to Detroit time lands on the PREVIOUS evening: never use
//         them as a date when startDate exists.
//       - allday and dateonly mean "no start time". A dateonly event still
//         carries startHour 12 / endHour 13 (the widget's default noon hour,
//         seen on exhibitions and on a one-day workshop); that is a
//         placeholder, not a time. No time is ever invented from it.
//       - one event (a partner workshop) has no startDate/endDate/timezone
//         at all, only the UTC-midnight timestamps.
//       - descriptions are free text and can disagree with the structured
//         fields ("Thursday,1-3pm on October 29" against 1:00-2:30 PM).
//       - the calendar also lists partner events held elsewhere (a school
//         district, a cultural centre, a recreation authority) and a
//         city-wide outdoor exhibition.
//     The same exhibition can be in both systems (Barbara Clay is).
//
// THE RULES THIS FILE ENFORCES
//   - An exhibition is ONE row with start_date and end_date (the run), never
//     a row per day. A multi-day calendar entry is the same.
//   - No time is invented. time_display is set only for a timed event whose
//     calendar entry gives hours; all-day / date-only / exhibition rows get
//     none, and is_all_day is true (the established signal that stops the
//     admin Needs Follow-up list asking for a start time).
//   - Ambiguity goes to pending_review, never to the public and never
//     silently resolved: a run that cannot be parsed, dates or times that
//     disagree between the page, the calendar and the description, a date
//     known only from a timestamp, a venue that is not the gallery (or is
//     unclear), an unclear eligibility. Each reason is a code in `review`.
//   - Nothing is written that the source does not say: no address for a
//     partner venue, no city that is not stated, no price.

const SOURCE_NAME = "Anton Art Center";
const VENUE_NAME = "Anton Art Center";
// Stated in the site footer on every page and in the calendar's own location
// text for the gallery's events ("125 Macomb Place Mount Clemens, MI 48043").
const VENUE_ADDRESS = "125 Macomb Place";
const VENUE_CITY = "Mount Clemens";

const SITE = "https://www.theartcenter.org";
const EXHIBITS_URL = `${SITE}/exhibits`;
const EVENTS_PAGE_URL = `${SITE}/events`;
// The public JSON the Events Calendar widget loads (seen in the iframe's own
// network requests). The two ids are the widget's project and account; they
// are not secrets (they sit in the page's network traffic and the endpoint
// needs no token) but they are not ours, so a change on the site's side
// shows up as an error in the run log rather than as a quiet loss.
const CALENDAR_API_URL = "https://inffuse.eventscalendar.co/api/v0.1/projects/e033e2dd-5d50-4aa1-9d48-67146dab9827/data/public/events?user=7634a96f-510a-40f3-9879-7ce354e902d0&app=calendar";

const ID_PREFIX_EXHIBIT = "aac-ex-";
const ID_PREFIX_CALENDAR = "aac-cal-";

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};
const MONTH_RE = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?";

const pad = (n) => String(n).padStart(2, "0");
const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

// A real calendar date, or null.
function isoDate(y, m, d) {
  if (!(y >= 1970 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
const dayNumber = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const isIso = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && isoDate(...v.split("-").map(Number)) === v;

function decodeEntities(str) {
  if (!str) return str;
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
const clean = (s) => decodeEntities(String(s == null ? "" : s)).replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();

function slugify(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
// Same-exhibition key: lower-case letters and digits only, the "| dates" tail dropped.
function titleKey(title) {
  return String(title || "").split("|")[0].toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

// ---------------------------------------------------------------------------
// Date ranges written in text ("October 24 - December 23, 2026").
// -> { start, end, problem }   (start/end ISO, end null for a single day)
// A shape this does not recognise is a `problem`, never a guess:
// "May - October, 2026" (no days) and "2026 - 2027" are real titles on the site.
function parseDateRangeText(text) {
  const t = clean(text).replace(/[–—]/g, "-");
  const sep = "\\s*-\\s*";
  let m;
  // Month D, YYYY - Month D, YYYY
  if ((m = new RegExp(`^${MONTH_RE}\\s+(\\d{1,2}),?\\s+(\\d{4})${sep}${MONTH_RE}\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i").exec(t))) {
    return finish(isoDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]), isoDate(+m[6], MONTHS[m[4].toLowerCase()], +m[5]));
  }
  // Month D - Month D, YYYY  (start year inferred: the end's, or the one before when the start month is later)
  if ((m = new RegExp(`^${MONTH_RE}\\s+(\\d{1,2})${sep}${MONTH_RE}\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i").exec(t))) {
    const sm = MONTHS[m[1].toLowerCase()], em = MONTHS[m[3].toLowerCase()], ey = +m[5];
    return finish(isoDate(sm > em ? ey - 1 : ey, sm, +m[2]), isoDate(ey, em, +m[4]));
  }
  // Month D - D, YYYY
  if ((m = new RegExp(`^${MONTH_RE}\\s+(\\d{1,2})${sep}(\\d{1,2}),?\\s+(\\d{4})$`, "i").exec(t))) {
    const mo = MONTHS[m[1].toLowerCase()];
    return finish(isoDate(+m[4], mo, +m[2]), isoDate(+m[4], mo, +m[3]));
  }
  // Month D, YYYY
  if ((m = new RegExp(`^${MONTH_RE}\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i").exec(t))) {
    const d = isoDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    return d ? { start: d, end: null, problem: null } : { start: null, end: null, problem: "DATE_RANGE_UNPARSEABLE" };
  }
  return { start: null, end: null, problem: "DATE_RANGE_UNPARSEABLE" };

  function finish(start, end) {
    if (!start || !end) return { start: null, end: null, problem: "DATE_RANGE_UNPARSEABLE" };
    if (dayNumber(end) < dayNumber(start)) return { start: null, end: null, problem: "DATE_RANGE_UNPARSEABLE" };
    return { start, end: end === start ? null : end, problem: null };
  }
}

// Every explicit date a free-text description states, as ISO strings.
// "October 29", "Oct. 29, 2026", "November 14 - December 23, 2026". A date with
// no year takes `fallbackYear`. Used only to DETECT a disagreement; never to
// supply a value.
function datesInText(text, fallbackYear) {
  const t = clean(text).replace(/[–—]/g, "-");
  const out = [];
  const re = new RegExp(`${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, "gi");
  let m;
  while ((m = re.exec(t))) {
    const year = m[3] ? +m[3] : fallbackYear;
    const d = isoDate(year, MONTHS[m[1].toLowerCase()], +m[2]);
    if (d) out.push(d);
  }
  // "Month D - D, YYYY": the second day is bare
  const re2 = new RegExp(`${MONTH_RE}\\s+(\\d{1,2})\\s*-\\s*(\\d{1,2}),?\\s+(\\d{4})`, "gi");
  while ((m = re2.exec(t))) { const d = isoDate(+m[4], MONTHS[m[1].toLowerCase()], +m[3]); if (d) out.push(d); }
  return out;
}

// Clock times a description states: [{start: minutes, end: minutes|null}].
// "1-3pm", "10:00am - 2pm", "6pm", "6 p.m.". Detection only.
function timesInText(text) {
  const t = clean(text).toLowerCase().replace(/[–—]/g, "-").replace(/\./g, "");
  const out = [];
  const clock = "(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?";
  // range: groups 1-3 start, 4-6 end (the end must carry am/pm); single: groups 7-9 (must carry am/pm)
  const re = new RegExp(`\\b${clock}\\s*(?:-|to)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b|\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b`, "g");
  const toMin = (h, mi, ap) => { let hh = +h % 12; if (ap === "pm") hh += 12; return hh * 60 + (mi ? +mi : 0); };
  let m;
  while ((m = re.exec(t))) {
    if (m[4] !== undefined) {
      const startAp = m[3] || m[6];
      out.push({ start: toMin(m[1], m[2], startAp), end: toMin(m[4], m[5], m[6]) });
    } else if (m[7] !== undefined) {
      out.push({ start: toMin(m[7], m[8], m[9]), end: null });
    }
  }
  return out;
}

function formatClock(hour, minute) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)} ${hour >= 12 ? "PM" : "AM"}`;
}

// ---------------------------------------------------------------------------
// EXHIBITS

// The /single-post/ links on /exhibits, in page order, each once.
function parseExhibitListing(html) {
  const urls = [];
  const re = /href=["'](?:https:\/\/www\.theartcenter\.org)?(\/single-post\/[a-z0-9][a-z0-9-]*)["']/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const url = SITE + m[1];
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

function metaContent(html, property) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property.replace(/[:.]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = re.exec(html);
  if (!tag) return null;
  const c = /content=["']([^"']*)["']/i.exec(tag[0]);
  return c ? decodeEntities(c[1]) : null;
}

// A Wix media URL with its resize suffix removed:
//   https://static.wixstatic.com/media/<id>~mv2.jpg/v1/fill/w_816,h_600,.../<id>~mv2.jpg
//   -> https://static.wixstatic.com/media/<id>~mv2.jpg
// Anything else is returned as is.
function originalImageUrl(url) {
  if (isBlank(url)) return null;
  const u = String(url).trim();
  const m = /^(https:\/\/static\.wixstatic\.com\/media\/[^/?#]+)\/v1\//.exec(u);
  return m ? m[1] : u;
}

// The post body as lines. Wix writes each block as its own element; a blank
// line is a block with only a <br>, a rule is a paragraph reading "---".
function postBodyLines(html) {
  const attr = html.indexOf('data-hook="post-description"');
  if (attr < 0) return [];
  const start = Math.max(0, html.lastIndexOf("<", attr)); // from the opening tag, not from inside it
  const end = html.indexOf("</article>", start);
  const body = html.slice(start, end < 0 ? undefined : end)
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|figure|section|button)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(body).split("\n").map((l) => l.replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim()).filter(Boolean);
}

const RULE_LINE = /^(?:-\s*){3,}$/;
const SECTION_LINE = /^(?:program|gallery hours|holiday hours|press release|opening reception|artist talk|hours)\b/i;

// One exhibition post. -> { title, name, rangeText, range, bodyRange, gallery, description, isFree, image_url, url, problems[] }
function parseExhibitPost(html, url) {
  const h = String(html || "");
  const ogTitle = metaContent(h, "og:title");
  const h1 = /<h1[^>]*data-hook="post-title"[^>]*>([\s\S]*?)<\/h1>/i.exec(h);
  const title = clean(ogTitle || (h1 ? h1[1].replace(/<[^>]+>/g, "") : ""));
  const problems = [];
  if (!title) return { title: "", name: "", problems: ["TITLE_MISSING"], url };

  const bar = title.lastIndexOf("|");
  const name = clean(bar >= 0 ? title.slice(0, bar) : title);
  const rangeText = bar >= 0 ? clean(title.slice(bar + 1)) : "";
  const range = rangeText ? parseDateRangeText(rangeText) : { start: null, end: null, problem: "DATE_RANGE_UNPARSEABLE" };
  if (range.problem) problems.push(range.problem);

  const lines = postBodyLines(h);
  // The body repeats the run on its first line. Compared, not trusted.
  const bodyRange = lines.length ? parseDateRangeText(lines[0]) : { start: null, end: null, problem: "DATE_RANGE_UNPARSEABLE" };
  if (!range.problem && !bodyRange.problem && (bodyRange.start !== range.start || bodyRange.end !== range.end)) problems.push("DATE_CONFLICT");
  if (range.problem && !bodyRange.problem) { /* the title was unclear but the body is not: still held, the title is what the site publishes */ }

  let gallery = null, descLines = [];
  let i = bodyRange.problem ? 0 : 1;
  if (lines[i] && lines[i].length <= 60 && /\b(gallery|floor|level|atrium|lobby|studio)\b/i.test(lines[i])) { gallery = lines[i]; i++; }
  for (; i < lines.length; i++) {
    if (RULE_LINE.test(lines[i]) || SECTION_LINE.test(lines[i])) break;
    descLines.push(lines[i]);
  }
  const description = descLines.join(" ").slice(0, 900) || null;
  const isFree = lines.some((l) => /\bgallery admission is free\b/i.test(l)) ? true : null;

  return {
    title, name, rangeText, range, bodyRange, gallery, description, isFree,
    image_url: originalImageUrl(metaContent(h, "og:image")),
    url: metaContent(h, "og:url") && /^https:\/\/www\.theartcenter\.org\/single-post\//.test(metaContent(h, "og:url")) ? metaContent(h, "og:url") : url,
    problems,
  };
}

// post -> { row, review[] } or null when there is nothing to write.
function exhibitRow(post) {
  if (!post || !post.name) return null;
  const slug = (/\/single-post\/([a-z0-9-]+)/.exec(post.url || "") || [])[1] || slugify(post.name);
  const review = [];
  if (post.problems.includes("DATE_RANGE_UNPARSEABLE")) review.push("DATE_RANGE_UNPARSEABLE");
  if (post.problems.includes("DATE_CONFLICT")) review.push("DATE_CONFLICT");
  // A row needs a start date. With none the post cannot be a row at all; it
  // is reported by the connector, not written.
  const start = post.range && post.range.start ? post.range.start : (post.bodyRange && post.bodyRange.start) || null;
  if (!start) return { row: null, review, name: post.name, url: post.url, reason: "no usable start date" };
  const end = post.range && post.range.start ? post.range.end : (post.bodyRange && post.bodyRange.end) || null;
  return {
    row: {
      external_id: ID_PREFIX_EXHIBIT + slug,
      title: post.name,
      category: "visual",
      venue_name_raw: VENUE_NAME,
      venue_address_raw: VENUE_ADDRESS,
      venue_city_raw: VENUE_CITY,
      start_date: start,
      end_date: end,
      is_all_day: true,
      time_display: null,
      description: post.description,
      image_url: post.image_url,
      event_url: post.url,
      is_free: post.isFree === true,
      source: SOURCE_NAME,
      _kind: "exhibit",
      _gallery: post.gallery || null,
    },
    review,
  };
}

// ---------------------------------------------------------------------------
// CALENDAR

// Free-text location -> { name, address, city, isGallery, partner, ambiguous }
// Only what the text states. "Anton Art Center, 125 Macomb Place, Mount Clemens, MI 48043"
// is the gallery with its stated address; "Anton Art Center, Admin Office, Level 2" is
// the gallery (no address stated: the gallery's own constant stands);
// "Downtown Mount Clemens ~ Anton Art Center" names two places.
function parseLocation(text) {
  const loc = clean(text);
  if (!loc) return { name: null, address: null, city: null, isGallery: false, partner: false, ambiguous: false, missing: true };
  const mentionsAnton = /\banton art center\b/i.test(loc);
  const multi = /[~&]|\band\b|\bdowntown\b/i.test(loc) && mentionsAnton;
  if (mentionsAnton && /^anton art center\b/i.test(loc) && !multi) {
    const stated = /\b(\d{1,5}\s+macomb place)\b/i.exec(loc);
    return { name: VENUE_NAME, address: VENUE_ADDRESS, city: VENUE_CITY, isGallery: true, partner: false, ambiguous: false, statedAddress: !!stated };
  }
  if (mentionsAnton) {
    // two places in one string (a city-wide exhibition): kept as stated, not narrowed to one
    return { name: loc, address: null, city: /\b(?:mount|mt\.?) clemens\b/i.test(loc) ? VENUE_CITY : null, isGallery: false, partner: false, ambiguous: true };
  }
  // A partner venue: name as stated; city only when the text itself ends with one ("..., Clinton Township").
  const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
  const city = parts.length > 1 ? parts[parts.length - 1] : null;
  return { name: parts.length > 1 ? parts.slice(0, -1).join(", ") : loc, address: null, city: city && !/\d/.test(city) ? city : null, isGallery: false, partner: true, ambiguous: false };
}

const CATEGORY_RULES = [
  [/\b(film|screening|cinema|movie)\b/i, "film"],
  [/\bmarket\b/i, "vendor"],
  [/\b(volunteer|orientation|reads|reading|library|book)\b/i, "community"],
];
function categoryFor(title) {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(title)) return cat;
  return "visual";
}
// Titles that may be for the organisation rather than the public.
const UNCERTAIN_AUDIENCE = /\b(volunteer orientation|staff meeting|board meeting|member(?:s)? only|private)\b/i;

// raw calendar event -> { row, review[] } | { row: null, reason }
function calendarRow(raw, ctx) {
  const today = (ctx && ctx.today) || null;
  if (!raw || typeof raw !== "object") return { row: null, reason: "not an object" };
  const title = clean(raw.title);
  if (!title) return { row: null, reason: "no title" };
  if (isBlank(raw.id)) return { row: null, reason: "no id" };
  const review = [];
  const description = isBlank(raw.description) ? null : String(raw.description).replace(/\r/g, "").trim();

  // ---- dates
  let start = isIso(raw.startDate) ? raw.startDate : null;
  let end = isIso(raw.endDate) ? raw.endDate : null;
  if (!start) {
    // Only a UTC-midnight timestamp is left. Its UTC date equals the organiser's date on every
    // event that has both (measured), but it is a derivation: held unless the description
    // independently states the same date.
    const ts = Number.isFinite(raw.start) ? new Date(raw.start) : null;
    const d = ts ? isoDate(ts.getUTCFullYear(), ts.getUTCMonth() + 1, ts.getUTCDate()) : null;
    if (!d) return { row: null, reason: "no usable date" };
    start = d;
    const te = Number.isFinite(raw.end) ? new Date(raw.end) : null;
    end = te ? isoDate(te.getUTCFullYear(), te.getUTCMonth() + 1, te.getUTCDate()) : null;
    const year = Number(start.slice(0, 4));
    if (!(description && datesInText(description, year).includes(start))) review.push("DATE_FROM_TIMESTAMP_ONLY");
  }
  if (end && dayNumber(end) < dayNumber(start)) { review.push("DATE_CONFLICT"); end = null; }
  if (end === start) end = null;

  // ---- time: never invented
  const flagged = !!(raw.allday || raw.dateonly);
  let timeDisplay = null;
  let structuredStart = null, structuredEnd = null;
  // A record with no timezone cannot say what its hours mean (the one such entry seen also had
  // no startDate): its hours are not used.
  if (!flagged && !isBlank(raw.timezone) && Number.isInteger(raw.startHour) && Number.isInteger(raw.startMinutes)) {
    const s = formatClock(raw.startHour, raw.startMinutes);
    if (s) {
      structuredStart = raw.startHour * 60 + raw.startMinutes;
      timeDisplay = s;
      if (Number.isInteger(raw.endHour) && Number.isInteger(raw.endMinutes)) {
        const endMin = raw.endHour * 60 + raw.endMinutes;
        if (endMin > structuredStart) { structuredEnd = endMin; timeDisplay = `${s} – ${formatClock(raw.endHour, raw.endMinutes)}`; }
      }
    }
  }
  if (!flagged && isBlank(raw.timezone) && Number.isInteger(raw.startHour)) review.push("TIMEZONE_MISSING");
  // 12:00-1:00 PM is the widget's default hour (every date-only entry carries it). Without a
  // date-only/all-day flag it is either a real noon event or an untouched default: not decidable here.
  if (timeDisplay && raw.startHour === 12 && raw.startMinutes === 0 && raw.endHour === 13 && raw.endMinutes === 0) review.push("TIME_POSSIBLY_DEFAULT");
  // a start-only flag carries only a start
  if (raw.startonly && timeDisplay) { structuredEnd = null; timeDisplay = formatClock(raw.startHour, raw.startMinutes); }

  // ---- agreement with the description (detection only)
  if (description) {
    const year = Number(start.slice(0, 4));
    const stated = datesInText(description, year);
    if (stated.length) {
      const matches = (d) => d === start || (end && d === end) || (end && dayNumber(d) > dayNumber(start) && dayNumber(d) < dayNumber(end));
      // a single-day event whose description names dates but never its own, or a run whose
      // description names an end date that is not its own
      if (!end && !stated.includes(start)) review.push("DATE_CONFLICT");
      else if (end && stated.some((d) => !matches(d)) && !(stated.includes(start) && stated.includes(end))) review.push("DATE_CONFLICT");
    }
    if (timeDisplay) {
      const times = timesInText(description);
      if (times.length) {
        const ok = times.some((t) => t.start === structuredStart && (t.end === null || t.end === structuredEnd));
        if (!ok) review.push("TIME_CONFLICT");
      }
    }
  }

  // ---- venue
  const loc = parseLocation(raw.location);
  if (loc.missing) review.push("VENUE_MISSING");
  else if (loc.ambiguous) review.push("VENUE_AMBIGUOUS");
  else if (loc.partner) review.push("PARTNER_VENUE");
  if (UNCERTAIN_AUDIENCE.test(title)) review.push("ELIGIBILITY_UNCERTAIN");

  // ---- links and image
  const button = Array.isArray(raw.buttons) ? raw.buttons.find((b) => b && /^https?:\/\//i.test(b.url || "")) : null;
  const img = raw.image && typeof raw.image === "object" ? (raw.image.source || raw.image.url) : (typeof raw.image === "string" ? raw.image : null);
  const free = description && /\bfree\b/i.test(description) && !/\bnot free\b/i.test(description) ? true : false;

  const row = {
    external_id: ID_PREFIX_CALENDAR + String(raw.id).replace(/^event_/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    category: categoryFor(title),
    venue_name_raw: loc.name,
    venue_address_raw: loc.address,
    venue_city_raw: loc.city,
    start_date: start,
    end_date: end,
    is_all_day: flagged || !timeDisplay,
    time_display: timeDisplay,
    description,
    image_url: originalImageUrl(img),
    event_url: button ? button.url : EVENTS_PAGE_URL,
    is_free: free,
    source: SOURCE_NAME,
    _kind: "calendar",
    _calendarId: raw.id,
  };
  if (today && (end || start) < today) return { row: null, reason: "past", past: true };
  return { row, review: Array.from(new Set(review)) };
}

// ---------------------------------------------------------------------------
// Putting the two sources together.

// Exhibition rows win over calendar rows for the same exhibition (same title key and
// overlapping dates): the post has the page, the artwork and the description. A calendar
// row that agrees on both dates is a duplicate; one that disagrees keeps both rows apart
// from the pairing and holds the post row.
// -> { rows: [{row, review}], duplicates: [{dropped, keptExternalId, reason}] }
function mergeSources(exhibits, calendars) {
  const rows = [];
  const duplicates = [];
  const byKey = new Map();
  for (const e of exhibits) { if (e.row) { rows.push(e); byKey.set(titleKey(e.row.title), e); } }
  for (const c of calendars) {
    if (!c.row) continue;
    const e = byKey.get(titleKey(c.row.title));
    const overlaps = e && dayNumber(c.row.start_date) <= dayNumber(e.row.end_date || e.row.start_date) && dayNumber(c.row.end_date || c.row.start_date) >= dayNumber(e.row.start_date);
    if (e && overlaps) {
      const agree = c.row.start_date === e.row.start_date && (c.row.end_date || null) === (e.row.end_date || null);
      if (!agree) {
        if (!e.review.includes("DATE_CONFLICT_BETWEEN_PAGES")) e.review.push("DATE_CONFLICT_BETWEEN_PAGES");
        e.conflict = { page: [e.row.start_date, e.row.end_date], calendar: [c.row.start_date, c.row.end_date] };
      }
      // the calendar entry can only fill what the post lacks
      if (isBlank(e.row.image_url) && !isBlank(c.row.image_url)) e.row.image_url = c.row.image_url;
      duplicates.push({ dropped: c.row.external_id, title: c.row.title, keptExternalId: e.row.external_id, reason: agree ? "same exhibition on the exhibits page and the calendar, same dates" : "same exhibition, DIFFERENT dates: exhibits-page row held" });
      continue;
    }
    rows.push(c);
  }
  return { rows, duplicates };
}

// Row fields the database has columns for (drops the _ working fields), keys uniform per
// row shape is handled by api/_lib/event-upsert.js.
function publicFields(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

module.exports = {
  SOURCE_NAME, VENUE_NAME, VENUE_ADDRESS, VENUE_CITY, SITE, EXHIBITS_URL, EVENTS_PAGE_URL, CALENDAR_API_URL,
  ID_PREFIX_EXHIBIT, ID_PREFIX_CALENDAR,
  parseDateRangeText, datesInText, timesInText, formatClock,
  parseExhibitListing, parseExhibitPost, exhibitRow, originalImageUrl, postBodyLines,
  parseLocation, categoryFor, calendarRow, mergeSources, publicFields, titleKey, isIso, isoDate, dayNumber,
};
