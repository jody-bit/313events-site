"use strict";

// api/_lib/dearborn-enrichment.js -- links and category hints for City of Dearborn ICS rows.
//
// WHY: the city's "Website Calendar" ICS (the source of truth for dates, times and places) carries no URL and
// no event-type field, but the city's own listing page (dearborn.gov/calendar, Drupal) shows, for each event,
// a category badge (Meeting, City Event, Classes & Programs, Important Date, ...) and a link to that event's
// page. This reads those cards and attaches the link and category to the matching ICS rows.
//
// RULES (owner decisions 2026-10-12/13):
//   - A HINT, never a gate: nothing is skipped, published or re-statused here. The category goes into the
//     reviewer note; the link into event_url. cron-feeds.js writes both for NEW rows only, so a reviewer's
//     edit to an existing row is never overwritten.
//   - Nothing is invented: a card is attached only on a safe match (same local date, and an identical
//     normalized title, or a close title plus the same start time) that is unique in both directions.
//   - Fail-soft and bounded: at most MAX_PAGES listing pages, one request at a time, and BUDGET_MS in total
//     (each request is also capped by TIMEOUT_MS and by what is left of the budget); results from earlier pages
//     are kept when a later one is slow or fails. A fetch or parse failure leaves rows unlinked and is reported
//     in the poll result, never failing the feed.
//   - The pager is followed only through the link the page itself exposes ("?page=..."), and a page that
//     adds no new event is the end. The category filter is not used (unproven as a plain GET).
//
// Markup it reads (saved page 2026-10-12, /mnt/project-files/ingestion/fixtures/dearborn-calendar.html):
//   div.event-card > div.badge (category), h2 (title), a[href="/events/YYYY/MM/DD/slug"], and date text such
//   as "Tuesday, Oct 13 2026 9am to 5pm". Emergency-alert blocks on the page are not event cards and are ignored.

const LISTING_URL = "https://www.dearborn.gov/calendar";
const SITE = "https://www.dearborn.gov";
const MAX_PAGES = 3;
const TIMEOUT_MS = 5000; // per page; never more than what is left of the budget
const BUDGET_MS = 8000; // the whole step, shared with every other feed in the 60 s cron (Reliability, 2026-10-13)
const UA = "313.events event calendar (City of Dearborn public listing)";

function decode(str) {
  return String(str || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
const text = (html) => decode(String(html || "").replace(/<svg[\s\S]*?<\/svg>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// "9am", "6:30pm" -> minutes after midnight, or null.
function toMinutes(h, m, ap) {
  let hh = parseInt(h, 10) % 12;
  if (/^p/i.test(ap)) hh += 12;
  return hh * 60 + (m ? parseInt(m, 10) : 0);
}

// Event cards on one listing page: [{ category, title, path, date, startMin }].
function parseListing(html) {
  const cards = [];
  const parts = String(html || "").split(/<div class="event-card\b/).slice(1);
  for (const part of parts) {
    const chunk = part.split(/<div class="views-row"/)[0];
    const href = (chunk.match(/href="(\/events\/(\d{4})\/(\d{2})\/(\d{2})\/[^"#?]+)"/) || []);
    const titleHtml = (chunk.match(/<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/i) || [])[1];
    const badge = (chunk.match(/<div class="badge[^"]*">([\s\S]*?)<\/div>/i) || [])[1];
    if (!href[1] || !titleHtml) continue; // not an event card (or incomplete): never guessed at
    const plain = text(chunk);
    const t = plain.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+to\b/i);
    cards.push({
      category: badge ? text(badge) : null,
      title: text(titleHtml),
      path: href[1],
      date: `${href[2]}-${href[3]}-${href[4]}`,
      startMin: t ? toMinutes(t[1], t[2], t[3]) : null,
    });
  }
  return cards;
}

function nextPageUrl(html, currentUrl) {
  const hrefs = [...String(html || "").matchAll(/href="(\?page=[^"]+)"/g)].map((m) => decode(m[1]));
  const target = hrefs.find((h) => LISTING_URL + h !== currentUrl);
  return target ? LISTING_URL + target : null;
}

const STOP = new Set(["the", "a", "an", "of", "at", "in", "and", "to", "by", "host", "hosted", "for", "on"]);
function tokens(title) {
  return new Set(String(title || "").toLowerCase().replace(/^\s*cancell?ed\s*[-:]\s*/, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)));
}
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
function jaccard(a, b) { const i = [...a].filter((x) => b.has(x)).length; return i / (a.size + b.size - i || 1); }

// "7:30 PM – 9:00 PM" (time_display built by cron-feeds) -> minutes, or null.
function rowStartMin(timeDisplay) {
  const m = String(timeDisplay || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  return m ? toMinutes(m[1], m[2], m[3]) : null;
}

// Safe one-to-one matches only. Returns Map(row -> card).
function matchRows(rows, cards) {
  const candidates = new Map(); // row -> Set(card)
  for (const row of rows) {
    const rt = tokens(row.title);
    const rm = rowStartMin(row.time_display);
    const hits = [];
    for (const card of cards) {
      if (card.date !== row.start_date) continue;
      const ct = tokens(card.title);
      if (sameSet(rt, ct)) hits.push(card);
      else if (rm !== null && card.startMin !== null && rm === card.startMin && jaccard(rt, ct) >= 0.5) hits.push(card);
    }
    if (hits.length) candidates.set(row, hits);
  }
  const rowsPerCard = new Map();
  for (const hits of candidates.values()) for (const c of hits) rowsPerCard.set(c, (rowsPerCard.get(c) || 0) + 1);
  const out = new Map();
  for (const [row, hits] of candidates) {
    if (hits.length === 1 && rowsPerCard.get(hits[0]) === 1) out.set(row, hits[0]); // ambiguous either way: leave unlinked
  }
  return out;
}

async function fetchPage(url, fetchImpl, timeoutMs) {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: ctl ? ctl.signal : undefined });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { if (timer) clearTimeout(timer); }
}

// Marks matched rows with row._enrichment = { event_url, category } (internal; cron-feeds.js applies it to NEW
// rows only and strips it before the write). Returns a short note for last_poll_result; never throws.
async function enrichRows(rows, _feedSource, opts) {
  const fetchImpl = (opts && opts.fetch) || global.fetch;
  const budgetMs = (opts && opts.budgetMs) || BUDGET_MS;
  const started = Date.now();
  const cards = [];
  const seen = new Set();
  let url = LISTING_URL;
  let pages = 0;
  try {
    while (url && pages < MAX_PAGES) {
      const left = budgetMs - (Date.now() - started);
      if (left < 250) { var budgetNote = " (time budget reached)"; break; }
      const html = await fetchPage(url, fetchImpl, Math.min(TIMEOUT_MS, left));
      pages++;
      const fresh = parseListing(html).filter((c) => !seen.has(c.path));
      fresh.forEach((c) => { seen.add(c.path); cards.push(c); });
      if (!fresh.length) break; // a page that adds nothing is the end (or the pager did not work)
      url = nextPageUrl(html, url);
    }
  } catch (err) {
    if (!cards.length) return `enrichment failed: ${err.message}`;
    // keep what earlier pages gave; report the partial failure below
    var partial = ` (page ${pages + 1} failed: ${err.message})`;
  }
  const matches = matchRows(rows, cards);
  for (const [row, card] of matches) row._enrichment = { event_url: SITE + card.path, category: card.category };
  return `enrichment: ${matches.size}/${rows.length} rows linked from ${cards.length} listing cards on ${pages} page${pages === 1 ? "" : "s"}${partial || ""}${budgetNote || ""}`;
}

// What an EXISTING, still-unreviewed row may gain from a safe match (Stage 5, owner decision 2026-10-16). Pure and
// idempotent: it only fills an EMPTY event_url, and appends the page-category hint to the note once. It never returns
// a title, date, description, category or status, and returns nothing for a link or hint already in place.
function backfillPatch(stored, enrichment) {
  const patch = {};
  if (!stored || !enrichment) return patch;
  if (enrichment.event_url && !stored.event_url) patch.event_url = enrichment.event_url;
  const note = String(stored.note || "");
  if (enrichment.category && !/Source page category:/i.test(note)) {
    patch.note = `${note ? note + " " : ""}Source page category: ${enrichment.category}.`;
  }
  return patch;
}

module.exports = { backfillPatch, parseListing, nextPageUrl, matchRows, enrichRows, LISTING_URL, MAX_PAGES, BUDGET_MS };
