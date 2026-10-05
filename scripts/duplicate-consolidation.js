"use strict";

// scripts/duplicate-consolidation.js — ONE REAL-WORLD EVENT -> ONE CANONICAL
// 313.events EVENT (Product Owner, 2026-10-05).
//
// Measured in production on 2026-10-05: 74 groups of upcoming rows shared a
// normalized title and start date. Most were legitimate (two performances
// of the same show, 2:00 PM and 7:30 PM). The real duplicates had three
// deterministic shapes:
//
//   1. SAME FEED, TWICE. A feed republishes one VEVENT under two UIDs
//      (Eastern Market's Fresh Truck markets, Royal Oak's holiday closures,
//      Livonia's Mackinac trip). Same source, title, date, time and place.
//   2. SIBLING FEEDS OF ONE MUNICIPALITY. CivicPlus publishes one calendar
//      item in several category feeds; its item id is the tail of the
//      external_id ("feed-<feed uuid>-4736"). Same item id, title, date and
//      time across two feeds (Livonia Community Events + Parks & Rec,
//      Sterling Heights Library + Parks & Rec).
//   3. TWO SOURCES, ONE EVENT. A Manual/RA row and a VisitDetroit row at the
//      SAME canonical venue (same venue_id or the same normalized venue
//      name) with compatible times -- equal, or one side has no real time
//      ("Evening", "All day", blank).
//
// Everything else in a same-title-same-date group is NOT merged: a
// different start time at the same place is another performance; a
// different source at a different place, or a conflicting time, goes to
// the review list (Admin > Duplicates) for a person. No fuzzy matching: a
// title must be identical after normalization.
//
// Consolidation keeps everything useful:
//   - the survivor is the more complete row (venue link, description, art,
//     links, a real time), oldest row on a tie;
//   - the survivor's blank fields are filled from the loser (blank-only);
//   - the loser's (source, external_id) is recorded in event_source_identities
//     against the survivor, so the canonical event carries every identity;
//   - editorial links (editorial_articles.matched_event_id and the
//     editorial_article_events join) move to the survivor;
//   - the loser becomes status 'rejected' with a DUP_MERGED_INTO line in its
//     internal_note. Every connector preserves an existing row's status on
//     re-upsert (lookupExistingStatuses, WP 0.17), so the nightly feed cannot
//     resurrect it; the row is kept, never deleted, so nothing is lost.
//
// Review decisions persist without a schema change: "not a duplicate" writes
// a DUP_DISTINCT line naming the other row into both internal_notes, and the
// pair is never offered again. Dry run: DUPLICATE_CONSOLIDATION_DRY_RUN=true.

const path = require("path");
const { recordSourceIdentity } = require(path.join(__dirname, "..", "api", "_lib", "event-source-identities"));

const PAGE_SIZE = 1000;
const MAX_PAGES = 40;
const MAX_MERGES_PER_RUN = 60;
const SELECT = "id,title,start_date,end_date,time_display,is_all_day,source,external_id,status,venue_id,venue_name_raw,venue_address_raw,venue_city_raw,description,description_source,image_url,ticket_url,event_url,is_free,price_from,internal_note,created_at";

// ---- normalization -------------------------------------------------------

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[‘’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function normalizeVenue(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
const PLACEHOLDER_VENUE_RE = /^(venue tba|location tba|tba|venue tbd|tbd|to be announced)\b/;
function isPlaceholderVenue(name) {
  return PLACEHOLDER_VENUE_RE.test(normalizeVenue(name));
}
// "7:30 PM – 11:59 PM" -> "7:30 pm"; "Evening", "All day", null -> null (no real time)
function normalizeStartTime(timeDisplay) {
  const m = /(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(String(timeDisplay || ""));
  if (!m) return null;
  return `${parseInt(m[1], 10)}:${m[2]} ${m[3].toLowerCase()}`;
}
function timesCompatible(a, b) {
  const ta = normalizeStartTime(a.time_display);
  const tb = normalizeStartTime(b.time_display);
  if (ta && tb) return ta === tb;
  return true; // one or both sides state no real time
}
function timesEqual(a, b) {
  const ta = normalizeStartTime(a.time_display);
  const tb = normalizeStartTime(b.time_display);
  return ta === tb; // both null counts as equal
}
function civicItemId(externalId) {
  // "feed-<feed uuid>-<item id>" -- the item id is what CivicPlus assigns
  const m = /^feed-[0-9a-f-]{36}-(\d+)$/.exec(String(externalId || ""));
  return m ? m[1] : null;
}
function samePlace(a, b) {
  if (a.venue_id && b.venue_id) return a.venue_id === b.venue_id;
  const va = normalizeVenue(a.venue_name_raw);
  const vb = normalizeVenue(b.venue_name_raw);
  if (!va || !vb || isPlaceholderVenue(va) || isPlaceholderVenue(vb)) return false;
  return va === vb;
}
function sameCity(a, b) {
  const ca = String(a.venue_city_raw || "").trim().toLowerCase();
  const cb = String(b.venue_city_raw || "").trim().toLowerCase();
  return !!ca && ca === cb;
}
function distinctMarked(a, b) {
  const na = String(a.internal_note || "");
  const nb = String(b.internal_note || "");
  return na.includes(`DUP_DISTINCT | v1 | other=${b.id}`) || nb.includes(`DUP_DISTINCT | v1 | other=${a.id}`);
}

// ---- classification -------------------------------------------------------

// Returns { kind: 'deterministic', rule } | { kind: 'review', reason } | null
function classifyPair(a, b) {
  if (normalizeTitle(a.title) !== normalizeTitle(b.title) || a.start_date !== b.start_date) return null;
  if (distinctMarked(a, b)) return null;
  const place = samePlace(a, b);
  const sameSource = a.source === b.source;
  const itemA = civicItemId(a.external_id);
  const itemB = civicItemId(b.external_id);

  if (sameSource && timesEqual(a, b) && (place || (!a.venue_id && !b.venue_id && normalizeVenue(a.venue_name_raw) === normalizeVenue(b.venue_name_raw)))) {
    return { kind: "deterministic", rule: "same_feed_twice" };
  }
  if (itemA && itemB && itemA === itemB && timesEqual(a, b)) {
    return { kind: "deterministic", rule: "civicplus_sibling_feeds" };
  }
  if (!sameSource && place && timesCompatible(a, b)) {
    return { kind: "deterministic", rule: "two_sources_one_place" };
  }
  // Same source, same place, different real times: another performance. Not a duplicate.
  if (sameSource && place) return null;
  // Two sources, same place, two real times that differ (8:00 PM doors vs
  // 7:30 PM show, or genuinely two performances): a person decides.
  if (place) return { kind: "review", reason: "two_sources_same_place_time_conflict" };
  // Place differs or is unknown. In the same city (or a placeholder/blank
  // side) this may be one event described two ways: a person decides.
  // Different real times AND different places from ONE source is two
  // things; from two sources in the same city it is as likely a doors-time
  // versus show-time disagreement about one event ("Brand New": Ticketmaster
  // 8:00 PM at Fox Theatre Detroit, VisitDetroit 7:30 PM at Fox Theatre).
  if (!timesCompatible(a, b)) {
    return !sameSource && sameCity(a, b) ? { kind: "review", reason: "two_sources_time_and_place_differ" } : null;
  }
  if (sameCity(a, b) || isPlaceholderVenue(a.venue_name_raw) || isPlaceholderVenue(b.venue_name_raw) || !a.venue_city_raw || !b.venue_city_raw) {
    return { kind: "review", reason: sameSource ? "same_source_place_differs" : "two_sources_place_differs" };
  }
  return null;
}

function completeness(row) {
  let s = 0;
  if (row.venue_id) s += 3;
  if (row.description) s += 2;
  if (row.image_url) s += 1;
  if (row.ticket_url || row.event_url) s += 1;
  if (normalizeStartTime(row.time_display)) s += 1;
  if (row.external_id) s += 1;
  if (row.venue_address_raw) s += 1;
  if (row.status === "approved") s += 1;
  return s;
}
function pickSurvivor(a, b) {
  const sa = completeness(a);
  const sb = completeness(b);
  if (sa !== sb) return sa > sb ? [a, b] : [b, a];
  return String(a.created_at || "") <= String(b.created_at || "") ? [a, b] : [b, a];
}

const FILL_FIELDS = ["description", "description_source", "image_url", "ticket_url", "event_url", "venue_id", "venue_address_raw", "venue_city_raw", "price_from", "end_date"];
function blank(v) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}
// What the survivor gains from the loser: blank-only, plus a real time when
// the survivor only says "Evening".
function fillPatch(survivor, loser) {
  const patch = {};
  for (const f of FILL_FIELDS) {
    if (blank(survivor[f]) && !blank(loser[f])) patch[f] = loser[f];
  }
  if (!normalizeStartTime(survivor.time_display) && normalizeStartTime(loser.time_display)) patch.time_display = loser.time_display;
  if (survivor.is_free !== true && loser.is_free === true) patch.is_free = true;
  return patch;
}

// Groups rows by normalized title + start_date and returns the plan.
function planConsolidation(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!r || r.status === "rejected" || !r.title || !r.start_date) continue;
    const key = `${normalizeTitle(r.title)}|${r.start_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const merges = []; // { survivor, loser, rule }
  const reviews = []; // { a, b, reason }
  const merged = new Set();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // deterministic pairs first, each row consumed once
    const ordered = group.slice().sort((x, y) => completeness(y) - completeness(x) || String(x.created_at).localeCompare(String(y.created_at)));
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i];
        const b = ordered[j];
        if (merged.has(a.id) || merged.has(b.id)) continue;
        const c = classifyPair(a, b);
        if (!c) continue;
        if (c.kind === "deterministic") {
          const [survivor, loser] = pickSurvivor(a, b);
          merges.push({ survivor, loser, rule: c.rule });
          merged.add(loser.id);
        } else {
          reviews.push({ a, b, reason: c.reason });
        }
      }
    }
  }
  return { merges, reviews, groupsConsidered: groups.size };
}

// ---- I/O ------------------------------------------------------------------

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Detroit" });
}

async function fetchUpcomingRows(SUPABASE_URL, sbHeaders, fetchFn) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${SUPABASE_URL}/rest/v1/events?start_date=gte.${todayIso()}&status=neq.rejected&select=${SELECT}&order=start_date.asc,id.asc&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
    const resp = await fetchFn(url, { headers: sbHeaders });
    if (!resp.ok) throw new Error(`Failed to fetch events for duplicate consolidation: HTTP ${resp.status}`);
    const batch = await resp.json();
    if (!Array.isArray(batch)) throw new Error("Unexpected response shape fetching events");
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function patchEvent(SUPABASE_URL, sbHeaders, fetchFn, id, patch, filter = "") {
  const resp = await fetchFn(`${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}${filter}`, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  return resp.ok;
}

function appendNote(existing, line) {
  const cur = String(existing || "").trim();
  return cur ? `${cur}\n${line}` : line;
}

// Applies one merge. Exported so Admin's manual "merge" uses the exact same
// steps as the nightly pass.
async function applyMerge(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { survivor, loser, rule }, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  const result = { survivorId: survivor.id, loserId: loser.id, rule, filled: [], identityRecorded: false, articlesMoved: false, retired: false };

  // 1. survivor gains what it lacks (blank-only)
  const patch = fillPatch(survivor, loser);
  if (Object.keys(patch).length) {
    const ok = await patchEvent(SUPABASE_URL, sbHeaders, fetchFn, survivor.id, patch);
    if (ok) result.filled = Object.keys(patch);
  }
  // 2. the loser's identity now belongs to the canonical row
  if (loser.external_id && loser.source) {
    result.identityRecorded = await recordSourceIdentity(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { eventId: survivor.id, source: loser.source, sourceId: loser.external_id }, { fetchFn });
  }
  // 3. editorial links follow the canonical row
  try {
    const r1 = await fetchFn(`${SUPABASE_URL}/rest/v1/editorial_articles?matched_event_id=eq.${encodeURIComponent(loser.id)}`, {
      method: "PATCH", headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ matched_event_id: survivor.id }),
    });
    const r2 = await fetchFn(`${SUPABASE_URL}/rest/v1/editorial_article_events?event_id=eq.${encodeURIComponent(loser.id)}&select=article_id`, { headers: sbHeaders });
    let joinOk = true;
    if (r2.ok) {
      const links = await r2.json();
      for (const link of Array.isArray(links) ? links : []) {
        const r3 = await fetchFn(`${SUPABASE_URL}/rest/v1/editorial_article_events?on_conflict=article_id,event_id`, {
          method: "POST", headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify({ article_id: link.article_id, event_id: survivor.id }),
        });
        joinOk = joinOk && r3.ok;
      }
    }
    result.articlesMoved = r1.ok && joinOk;
  } catch {
    result.articlesMoved = false;
  }
  // 4. retire the loser; keep it, never delete it. Guarded on its current
  //    status so a row an admin changed meanwhile is left alone.
  const retired = await patchEvent(SUPABASE_URL, sbHeaders, fetchFn, loser.id,
    { status: "rejected", internal_note: appendNote(loser.internal_note, `DUP_MERGED_INTO | v1 | survivor=${survivor.id} | rule=${rule} | at=${new Date().toISOString().slice(0, 10)}`) },
    `&status=eq.${encodeURIComponent(loser.status || "approved")}`);
  result.retired = retired;
  return result;
}

async function markDistinct(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, a, b, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  const okA = await patchEvent(SUPABASE_URL, sbHeaders, fetchFn, a.id, { internal_note: appendNote(a.internal_note, `DUP_DISTINCT | v1 | other=${b.id}`) });
  const okB = await patchEvent(SUPABASE_URL, sbHeaders, fetchFn, b.id, { internal_note: appendNote(b.internal_note, `DUP_DISTINCT | v1 | other=${a.id}`) });
  return okA && okB;
}

function reviewSummary(r) {
  const pick = (e) => ({ id: e.id, title: e.title, start_date: e.start_date, time_display: e.time_display, source: e.source, venue_name_raw: e.venue_name_raw, venue_city_raw: e.venue_city_raw, venue_id: e.venue_id, status: e.status, external_id: e.external_id });
  return { reason: r.reason, a: pick(r.a), b: pick(r.b) };
}

// The nightly / Admin entry point.
async function consolidateDuplicates({
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  dryRun = process.env.DUPLICATE_CONSOLIDATION_DRY_RUN === "true",
  fetchFn = fetch,
  fetchRows = null,
  applyMergeFn = applyMerge,
  maxMerges = MAX_MERGES_PER_RUN,
  logger = console,
} = {}) {
  const counts = { considered: 0, groups: 0, deterministic: 0, merged: 0, deferredByCap: 0, failed: 0, review: 0, reviewDetail: [], mergeDetail: [], writtenIds: [], dryRun };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  const rows = fetchRows ? await fetchRows() : await fetchUpcomingRows(SUPABASE_URL, sbHeaders, fetchFn);
  counts.considered = rows.length;
  const plan = planConsolidation(rows);
  counts.groups = plan.groupsConsidered;
  counts.deterministic = plan.merges.length;
  counts.review = plan.reviews.length;
  counts.reviewDetail = plan.reviews.map(reviewSummary);

  let applied = 0;
  for (const m of plan.merges) {
    if (applied >= maxMerges) { counts.deferredByCap++; continue; }
    if (dryRun) {
      counts.mergeDetail.push({ survivorId: m.survivor.id, loserId: m.loser.id, rule: m.rule, dryRun: true, title: m.survivor.title, start_date: m.survivor.start_date });
      applied++;
      continue;
    }
    try {
      const r = await applyMergeFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, m, { fetchFn });
      counts.mergeDetail.push({ ...r, title: m.survivor.title, start_date: m.survivor.start_date });
      if (r.retired) { counts.merged++; counts.writtenIds.push(m.survivor.id, m.loser.id); } else counts.failed++;
    } catch (err) {
      counts.failed++;
      counts.mergeDetail.push({ survivorId: m.survivor.id, loserId: m.loser.id, rule: m.rule, error: err.message });
    }
    applied++;
  }
  return counts;
}

module.exports = {
  consolidateDuplicates, planConsolidation, classifyPair, pickSurvivor, fillPatch, applyMerge, markDistinct, reviewSummary,
  normalizeTitle, normalizeVenue, normalizeStartTime, civicItemId, samePlace, fetchUpcomingRows, SELECT, MAX_MERGES_PER_RUN,
};

if (require.main === module) {
  consolidateDuplicates({ dryRun: process.argv.includes("--dry-run") || process.env.DUPLICATE_CONSOLIDATION_DRY_RUN === "true" })
    .then((c) => { console.log(JSON.stringify(c, null, 2)); })
    .catch((e) => { console.error(e); process.exit(1); });
}
