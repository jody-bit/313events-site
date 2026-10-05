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
//
// HARDENING (2026-10-05, before the first scheduled run). A second
// implementation of this pass had been through two independent adversarial
// reviews; the cases those reviews used to make it hide a REAL public event
// were run against this one. Each fix below only makes a merge harder:
//   - A PUBLIC ROW IS NEVER RETIRED IN FAVOUR OF ONE THE PUBLIC CANNOT SEE.
//     The survivor was "the more complete row"; a pending_review row (every
//     Localist row, every article candidate) is often the fuller one, and
//     retiring the approved row took the event off the site until someone
//     approved the other. Approved first; then a hand-entered row (its
//     category, description and link are a person's); then a first-party or
//     ticketing source before a listings aggregator; then completeness.
//   - THE "VENUE TBA" PLACEHOLDER IS NOT A PLACE. Ten upcoming rows from
//     seven sources in five cities were linked to the one "Venue TBA" venue
//     row that day; "the same venue_id" made a St. Clair Shores "Tree
//     Lighting" and any other city's the same event. A shared link counts
//     unless both rows' own venue text is a placeholder.
//   - ONE VENUE NAME IN TWO CITIES IS TWO PLACES ("City Hall", "Library",
//     "Senior Center" across the municipal feeds).
//   - TWO ROWS THAT BOTH STATE NO TIME ARE NOT THEREBY AT THE SAME TIME.
//     Three circus performances looked exactly like that while Ticketmaster
//     had only "Evening" for each. Same-source rows merge on an equal stated
//     start time, or when both are all-day; otherwise a person decides.
//   - A RETIRED ROW A REVIEWER RESTORES STAYS RESTORED (it was retired again
//     on the next run).
//   - THE IDENTITY IS RECORDED OR THE ROW IS NOT RETIRED (it was retired
//     either way, and the identity was simply lost).
//   - A description and the label saying who wrote it travel together (a
//     source's own description was being relabelled "generated"); "free" is
//     not set beside a price.
//   - A title in a non-Latin script is no longer reduced to nothing (every
//     Arabic or Japanese title on one date was "the same title"); a trailing
//     year equal to the event's own ("Youmacon 2026" in 2026) is ignored.
// And from an independent review of that hardening itself:
//   - ONE LISTING NEVER ABSORBS TWO PERFORMANCES. A row with no real time
//     ("Evening") matches a 2:00 PM row and a 6:30 PM row equally; kept as
//     the survivor it took both, and the matinee left the site. A survivor
//     that has taken one real start time sends a row with another to review.
//   - The row that stays is decided ONCE, by one ordering, so a row is never
//     retired into a row that is itself retired a moment later.
//   - A three-week run and its opening night are not the same row: end dates
//     must agree (an overnight end -- the next day -- is the same night).
//   - "Both all-day" is how an RSS feed writes EVERY row; two such rows of
//     one feed merge only if their descriptions agree too.
//   - A venue name shared by two sources is a place only if both state the
//     city; a shared venue link with no venue text of the row's own is a
//     place only if the cities do not disagree; the same CivicPlus item
//     number is the same item only within one municipality.
//   - What the survivor gains from one row is seen when the next is folded
//     in, so a later row cannot write over it.

const path = require("path");
const { recordSourceIdentity } = require(path.join(__dirname, "..", "api", "_lib", "event-source-identities"));
const { citiesConflict } = require(path.join(__dirname, "..", "api", "_lib", "venue-lookup"));

const PAGE_SIZE = 1000;
const MAX_PAGES = 40;
const MAX_MERGES_PER_RUN = 60;
const SELECT = "id,title,start_date,end_date,time_display,is_all_day,source,external_id,status,venue_id,venue_name_raw,venue_address_raw,venue_city_raw,description,description_source,image_url,ticket_url,event_url,is_free,price_from,internal_note,created_at";

// ---- normalization -------------------------------------------------------

// `startDate` (YYYY-MM-DD), when given, lets a trailing year equal to the
// event's own year be dropped: "Youmacon 2026" on 2026-10-29 is "Youmacon".
function normalizeTitle(title, startDate) {
  const lower = String(title || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[‘’'`]/g, "");
  // Latin titles fold exactly as before. A title with letters of another
  // script keeps them (it used to be reduced to its digits, or to nothing).
  const otherScript = /[^\p{Script=Latin}\P{L}]/u.test(lower);
  let out = (otherScript ? lower.replace(/[^\p{L}\p{M}\p{N}]+/gu, " ") : lower.replace(/[^a-z0-9]+/g, " ")).trim();
  const year = typeof startDate === "string" && /^\d{4}-/.test(startDate) ? startDate.slice(0, 4) : null;
  if (year && out.endsWith(` ${year}`) && out.length > year.length + 1) out = out.slice(0, -(year.length + 1));
  return out;
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
// A description with its links and white space removed: two feed items that
// differ only in the item's own URL say the same thing.
function descriptionText(row) {
  return String(row.description || "").replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
// Both rows SAY when: the same real start time; or both all-day AND nothing
// in their descriptions tells them apart (an RSS feed marks every row
// all-day, so "both all-day" alone is two storytimes as easily as one).
function sameStatedTime(a, b) {
  const ta = normalizeStartTime(a.time_display);
  const tb = normalizeStartTime(b.time_display);
  if (ta && tb) return ta === tb;
  return a.is_all_day === true && b.is_all_day === true && descriptionText(a) === descriptionText(b);
}
// The last day of each, and whether they agree. An end the day after the
// start is the same night told two ways (10 PM - 4 AM).
function plusOneDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
function endDatesAgree(a, b) {
  const ea = a.end_date || a.start_date;
  const eb = b.end_date || b.start_date;
  if (ea === eb) return true;
  const overnight = plusOneDay(a.start_date);
  return (ea === a.start_date && eb === overnight) || (eb === b.start_date && ea === overnight);
}
// "City of Livonia - Senior Center" -> "city of livonia": whose calendar.
function municipalityOf(source) {
  return String(source || "").split(" - ")[0].trim().toLowerCase();
}
function civicItemId(externalId) {
  // "feed-<feed uuid>-<item id>" -- the item id is what CivicPlus assigns
  const m = /^feed-[0-9a-f-]{36}-(\d+)$/.exec(String(externalId || ""));
  return m ? m[1] : null;
}
function bothPlaceholders(a, b) {
  return isPlaceholderVenue(a.venue_name_raw) && isPlaceholderVenue(b.venue_name_raw);
}
function samePlace(a, b) {
  // A shared link to the "Venue TBA" venue row is a shared unknown, not a
  // shared place: it counts unless both rows' own venue text is a placeholder.
  const va = normalizeVenue(a.venue_name_raw);
  const vb = normalizeVenue(b.venue_name_raw);
  const noOwnText = (v) => !v || isPlaceholderVenue(v);
  if (a.venue_id && b.venue_id) {
    if (a.venue_id !== b.venue_id || bothPlaceholders(a, b)) return false;
    // A link is all one of them has to say where it is: then the cities must not disagree.
    return !((noOwnText(va) || noOwnText(vb)) && citiesConflict(a.venue_city_raw, b.venue_city_raw));
  }
  if (noOwnText(va) || noOwnText(vb)) return false;
  if (va !== vb || citiesConflict(a.venue_city_raw, b.venue_city_raw)) return false; // one name in two cities is two places
  // Two SOURCES using one name ("Library") are at one place only if both say which city.
  return a.source === b.source || (!!String(a.venue_city_raw || "").trim() && !!String(b.venue_city_raw || "").trim());
}
// ONE feed's two rows with the same venue TEXT and no real venue link: both
// blank, both the same unlinked name, or both the same placeholder.
function sameUnlinkedVenueText(a, b) {
  if (normalizeVenue(a.venue_name_raw) !== normalizeVenue(b.venue_name_raw)) return false;
  if (citiesConflict(a.venue_city_raw, b.venue_city_raw)) return false;
  return (!a.venue_id && !b.venue_id) || bothPlaceholders(a, b);
}
function sameCity(a, b) {
  const ca = String(a.venue_city_raw || "").trim().toLowerCase();
  const cb = String(b.venue_city_raw || "").trim().toLowerCase();
  return !!ca && ca === cb;
}
function distinctMarked(a, b) {
  const na = String(a.internal_note || "");
  const nb = String(b.internal_note || "");
  if (na.includes(`DUP_DISTINCT | v1 | other=${b.id}`) || nb.includes(`DUP_DISTINCT | v1 | other=${a.id}`)) return true;
  // Only active rows are ever compared. An ACTIVE row that says it was merged
  // into the other was restored by a reviewer: that is a decision too.
  return na.includes(`DUP_MERGED_INTO | v1 | survivor=${b.id} `) || nb.includes(`DUP_MERGED_INTO | v1 | survivor=${a.id} `);
}

// ---- classification -------------------------------------------------------

// Returns { kind: 'deterministic', rule } | { kind: 'review', reason } | null
function classifyPair(a, b) {
  const result = classifyByTitleTimePlace(a, b);
  // A run and one night of it, or two runs of different lengths, are not
  // one row: whatever else agrees, a person decides.
  if (result && result.kind === "deterministic" && !endDatesAgree(a, b)) return { kind: "review", reason: "end_dates_differ" };
  return result;
}
function classifyByTitleTimePlace(a, b) {
  const title = normalizeTitle(a.title, a.start_date);
  if (!title || title !== normalizeTitle(b.title, b.start_date) || a.start_date !== b.start_date) return null;
  if (distinctMarked(a, b)) return null;
  const place = samePlace(a, b);
  const sameSource = a.source === b.source;
  const itemA = civicItemId(a.external_id);
  const itemB = civicItemId(b.external_id);

  if (sameSource && (place || sameUnlinkedVenueText(a, b))) {
    if (sameStatedTime(a, b)) return { kind: "deterministic", rule: "same_feed_twice" };
    // Neither states a real time (blank, "Evening"): the same listing twice,
    // or two performances whose times are not known yet. A person decides.
    if (timesEqual(a, b)) return { kind: "review", reason: "same_source_time_unknown" };
  }
  // The same item of one municipality's calendar -- not the same small item
  // number in two cities' calendars.
  if (itemA && itemB && itemA === itemB && timesEqual(a, b) && !citiesConflict(a.venue_city_raw, b.venue_city_raw) && (municipalityOf(a.source) === municipalityOf(b.source) || sameCity(a, b))) {
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
  // Two different stated cities are two events, placeholder venue or not.
  if (citiesConflict(a.venue_city_raw, b.venue_city_raw)) return null;
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
// A listing somebody else compiled. When one of these and a first-party or
// ticketing row describe one event, the other row stays (and gains this
// one's image, address and so on): its time, link and category are the
// organiser's or the seller's own.
const LISTINGS_AGGREGATORS = new Set(["VisitDetroit", "Metro Times"]);
// Which row stays, before completeness is asked: a public row is never
// retired in favour of one the public cannot see; a hand-entered row before
// a connector's; a first-party row before an aggregator's.
function authorityRank(row) {
  return [row.status === "approved" ? 0 : 1, row.source === "Manual" ? 0 : 1, LISTINGS_AGGREGATORS.has(row.source) ? 1 : 0];
}
// THE one ordering: negative when `a` stays over `b`. Authority, then the
// more complete row, then the older.
function compareSurvivors(a, b) {
  const ra = authorityRank(a);
  const rb = authorityRank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] - rb[i];
  }
  const sa = completeness(a);
  const sb = completeness(b);
  if (sa !== sb) return sb - sa;
  return String(a.created_at || "").localeCompare(String(b.created_at || ""));
}
function pickSurvivor(a, b) {
  return compareSurvivors(a, b) <= 0 ? [a, b] : [b, a];
}

const FILL_FIELDS = ["description", "image_url", "ticket_url", "event_url", "venue_id", "venue_address_raw", "venue_city_raw", "price_from", "end_date"];
function blank(v) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}
// What the survivor gains from the loser: blank-only, plus a real time when
// the survivor only says "Evening".
function fillPatch(survivor, loser) {
  const patch = {};
  for (const f of FILL_FIELDS) {
    if (f === "price_from" && survivor.is_free === true) continue; // never a price beside "free"
    if (blank(survivor[f]) && !blank(loser[f])) patch[f] = loser[f];
  }
  // A link to the placeholder venue row is not a venue to pass on.
  if ("venue_id" in patch && isPlaceholderVenue(loser.venue_name_raw)) delete patch.venue_id;
  // A description travels with the label saying who wrote it; the label is
  // never changed on its own (that relabelled a source's own description as
  // "generated", which the enrichment job is then free to replace).
  if ("description" in patch && (!blank(loser.description_source) || !blank(survivor.description_source))) {
    patch.description_source = blank(loser.description_source) ? null : loser.description_source;
  }
  if (!normalizeStartTime(survivor.time_display) && survivor.is_all_day !== true && normalizeStartTime(loser.time_display)) patch.time_display = loser.time_display;
  // "Free" is never set beside a price.
  if (survivor.is_free !== true && loser.is_free === true && blank(survivor.price_from) && !("price_from" in patch)) patch.is_free = true;
  return patch;
}

// Groups rows by normalized title + start_date and returns the plan.
function planConsolidation(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!r || r.status === "rejected" || !r.title || !r.start_date) continue;
    const title = normalizeTitle(r.title, r.start_date);
    if (!title) continue; // a title of punctuation or emoji is not "the same title" as another
    const key = `${title}|${r.start_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const merges = []; // { survivor, loser, rule }
  const reviews = []; // { a, b, reason }
  const merged = new Set();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // In survivor order, so the earlier row of any pair is the one that
    // stays: a row is consumed once and is never retired into a row that is
    // retired later.
    const ordered = group.slice().sort(compareSurvivors);
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i];
      if (merged.has(a.id)) continue;
      // The real start times this row stands for: its own, and those of the
      // rows folded into it.
      const times = new Set([normalizeStartTime(a.time_display)].filter(Boolean));
      for (let j = i + 1; j < ordered.length; j++) {
        const b = ordered[j];
        if (merged.has(b.id)) continue;
        const c = classifyPair(a, b);
        if (!c) continue;
        if (c.kind !== "deterministic") {
          reviews.push({ a, b, reason: c.reason });
          continue;
        }
        const time = normalizeStartTime(b.time_display);
        if (time && times.size && !times.has(time)) {
          // `a` has no time of its own and has already taken one performance.
          reviews.push({ a, b, reason: "one_listing_two_performances" });
          continue;
        }
        if (time) times.add(time);
        merges.push({ survivor: a, loser: b, rule: c.rule });
        merged.add(b.id);
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
    if (ok) {
      result.filled = Object.keys(patch);
      // The next row folded into this survivor must see what it now has.
      Object.assign(survivor, patch);
    }
  }
  // 2. the loser's identity now belongs to the canonical row
  if (loser.external_id && loser.source) {
    result.identityRecorded = await recordSourceIdentity(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { eventId: survivor.id, source: loser.source, sourceId: loser.external_id }, { fetchFn });
    // No record of whose row this was, no retirement: it is tried again on
    // the next run, and until then both rows stay as they are.
    if (!result.identityRecorded) return result;
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
  normalizeTitle, normalizeVenue, normalizeStartTime, civicItemId, samePlace, sameStatedTime, endDatesAgree, compareSurvivors, fetchUpcomingRows, SELECT, MAX_MERGES_PER_RUN,
};

if (require.main === module) {
  consolidateDuplicates({ dryRun: process.argv.includes("--dry-run") || process.env.DUPLICATE_CONSOLIDATION_DRY_RUN === "true" })
    .then((c) => { console.log(JSON.stringify(c, null, 2)); })
    .catch((e) => { console.error(e); process.exit(1); });
}
