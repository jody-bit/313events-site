"use strict";
// api/_lib/walkerville-rows.js
//
// Pure functions behind api/cron-walkervillebrewery.js: no network, no database.
//
// SOURCE: https://www.walkervillebrewery.com/events (Walkerville Brewery, 525 Argyle Rd,
// Windsor, ON N8Y 4Z8). The site's URL shape (/events?view=calendar&month=11-2026,
// /events/holidaymarket-2026) is the Squarespace events collection. A Squarespace
// collection page returns JSON when asked with ?format=json: { upcoming: [...], past: [...] }
// (or { items: [...] } for a month view), each item carrying title, startDate/endDate in
// epoch milliseconds, fullUrl, assetUrl (the event's image), excerpt, body and location.
//
// DRAFT STATUS: written WITHOUT live access to the site (the build sandbox blocks the host).
// The field names above are Squarespace's documented/common shape, not measured on this
// tenant. Before activation, run the parser against one real ?format=json capture and add
// it as a fixture (test/fixtures/walkerville/). Every field read here is defensive: an item
// that does not parse is skipped and counted, never guessed.
//
// IMAGES: the brewery's owner confirmed by phone (relayed by Jody, 2026-11-06) that its
// event images are promotional and approved for promoting its events. Per the promotional
// photography policy they publish with NO visible credit; the source is kept in metadata only.

const VENUE_NAME = "Walkerville Brewery";
const VENUE_ADDRESS = "525 Argyle Rd";
const VENUE_CITY = "Windsor";
const SITE = "https://www.walkervillebrewery.com";
const TZ = "America/Toronto";
const IMAGE_SOURCE_NOTE = "Walkerville Brewery event image; supplied promotional, approved by the brewery (phone, per Jody, 2026-11-06)";

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, " ");
}
function plain(html) {
  return decodeEntities(String(html || "").replace(/<\/(p|div|li|h\d)>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// Epoch ms -> local (Windsor) date, 12-hour time and hour-minute flag.
function localParts(ms) {
  if (typeof ms !== "number" || !isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
  const h = parseInt(parts.hour, 10), m = parseInt(parts.minute, 10);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, h, m, display: `${h12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}` };
}

function absolute(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("/")) return SITE + s;
  return null;
}

// payload: parsed JSON from a Squarespace events collection (?format=json[&month=MM-YYYY]).
function listItems(payload) {
  if (!payload || typeof payload !== "object") return [];
  return [].concat(payload.upcoming || [], payload.items || [], payload.past || []);
}

function parseWalkervilleEvents(payload) {
  const items = listItems(payload);
  const events = [];
  let skipped = 0;
  for (const it of items) {
    const title = plain(it && it.title);
    const start = localParts(it && it.startDate);
    const url = absolute(it && it.fullUrl);
    if (!title || !start || !it.id) { skipped++; continue; }
    const end = localParts(it.endDate);
    const allDay = start.h === 0 && start.m === 0 && (!end || (end.h === 23 || end.h === 0));
    const loc = it.location || {};
    events.push({
      id: String(it.id),
      title,
      date: start.date,
      endDate: end && end.date > start.date ? end.date : null,
      timeDisplay: allDay ? null : start.display,
      description: plain(it.excerpt) || plain(it.body).slice(0, 600) || null,
      url,
      imageUrl: absolute(it.assetUrl),
      address: (loc.addressLine1 && String(loc.addressLine1).trim()) || null,
      locationTitle: (loc.addressTitle && String(loc.addressTitle).trim()) || null,
    });
  }
  return { events, itemsFound: items.length, skipped };
}

function buildRow(e, today) {
  if ((e.endDate || e.date) < today) return null;
  const offSite = e.address && !/argyle/i.test(e.address); // brewery pop-ups elsewhere keep their own address
  return {
    external_id: `walkervillebrewery-${e.id}-${e.date}`.slice(0, 250),
    title: e.title,
    description: e.description || undefined,
    venue_name_raw: offSite && e.locationTitle ? e.locationTitle : VENUE_NAME,
    venue_address_raw: offSite ? e.address : VENUE_ADDRESS,
    venue_city_raw: VENUE_CITY,
    start_date: e.date,
    end_date: e.endDate || undefined,
    time_display: e.timeDisplay || undefined,
    image_url: e.imageUrl || undefined,
    ticket_url: e.url || undefined,
    event_url: e.url || undefined,
    source: VENUE_NAME,
  };
}

// Cross-source duplicate check. The Tourism Windsor Essex feed already carries Walkerville Brewery events
// (R&Q prod read 2026-11-06: 7 rows, image_url NULL on all, titles like "<Show> at Walkerville Brewery").
// A row from this connector that matches an existing row on the same date is NOT written; it is reported so
// the existing row can be enriched (image) in a separate, reviewed step.
function normTitle(t) {
  return String(t || "").toLowerCase().replace(/\b(at|@)\s+(the\s+)?walkerville brewery\b/g, " ").replace(/\bwalkerville brewery\b/g, " ")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
}
function findDuplicate(row, existingRows) {
  const n = normTitle(row.title);
  if (!n) return null;
  return (existingRows || []).find((x) => x.start_date === row.start_date && x.external_id !== row.external_id &&
    (normTitle(x.title) === n || normTitle(x.title).includes(n) || n.includes(normTitle(x.title)) && normTitle(x.title).length > 6)) || null;
}

module.exports = { normTitle, findDuplicate, parseWalkervilleEvents, buildRow, listItems, localParts, VENUE_NAME, IMAGE_SOURCE_NOTE, SITE };
