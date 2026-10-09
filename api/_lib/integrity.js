"use strict";

// api/_lib/integrity.js — Admin Hardening Slice 2, Part A: the event
// integrity engine.
//
// WHAT IT IS
// Pure, deterministic rules over an event row (the shape
// api/admin-integrity.js reads: the events columns below plus an embedded
// `venues` object). No network, no clock except the `today` a caller
// passes in, no writes. The same input always gives the same answer, so
// Admin, the healthcheck and the tests all see one judgement.
//
// WHAT IT IS NOT
// It never changes an event. It never changes status: nothing here is a
// publication gate, and a "blocked" verdict is a statement about the data
// (the listing cannot be true as stored), not an action. The one existing
// hard publication invariant (api/_lib/event-contract.js, Dossin only)
// is left exactly where it is.
//
// FINITE STATES (most severe wins; every non-cleared verdict says why)
//   cleared         nothing found.
//   advisory        a real gap or weakness that does not make the listing
//                   wrong: no start time, a generated description, a link
//                   to a homepage, a long exhibit run, not re-seen at its
//                   source yet. Worth knowing; nobody has to act.
//   repairable      wrong or weak in a way a deterministic rule could fix
//                   from data already held (a relative CivicPlus feed link,
//                   "Detroit, MI 48226" in a city field, an RA link whose
//                   id disagrees with the event's own RA id). Repairs are
//                   NOT performed here; the class just says one exists.
//   needs_decision  only a person can settle it: a placeholder venue that
//                   asserts a city, two cities that disagree, a malformed
//                   link, a duplicate pair the rules would not merge.
//   blocked         the stored listing cannot be true: an end before the
//                   start, a start date that is not a date, no title.
//
// SYSTEMIC, NOT PER-EVENT
// Every reason carries a stable `code`. summarizeInventory() groups by
// code, so 600 CivicPlus feed links are ONE repair class with an affected
// count and a per-source breakdown, never 600 tasks.

const STATES = Object.freeze(["cleared", "advisory", "repairable", "needs_decision", "blocked"]);
const STATE_RANK = Object.freeze(Object.fromEntries(STATES.map((s, i) => [s, i])));

function worstState(a, b) {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

function text(v) {
  return typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v).trim();
}

// ---- links ---------------------------------------------------------------

// Link classes, best first. An event's own link verdict is the best class
// among its event_url and ticket_url (the public page shows both).
const LINK_CLASSES = Object.freeze(["specific", "shared_generic", "homepage", "wrong_event", "feed_export", "relative", "malformed", "missing"]);
const LINK_RANK = Object.freeze(Object.fromEntries(LINK_CLASSES.map((c, i) => [c, i])));

// A link that serves a calendar feed or export, not a page about one event.
// CivicPlus's own iCalendar module is the measured case (relative, ~600
// upcoming rows); the absolute forms cover the same mistake from any feed.
const FEED_EXPORT_RE = /(?:\/common\/modules\/icalendar\/|icalendar\.aspx|[./]ics(?:[?#]|$)|[?&](?:format|output)=(?:ical|ics|rss|xml|json)\b|\/feed\/?(?:[?#]|$)|\/rss\/?(?:[?#]|$)|\/wp-json\/|\/calendar\/ical\/)/i;

// Known shared pages: one URL that many different events point at, so it
// says nothing about any single one. Measured 2026-10-08 (audit): the
// MotorCity Wine calendar page carried 62 distinct events. Kept tiny and
// explicit; summarizeInventory() also detects the pattern from the data
// itself (SHARED_LINK_MIN_TITLES distinct titles on one URL).
const KNOWN_GENERIC_PAGES = Object.freeze([
  /^https?:\/\/(?:www\.)?motorcitywine\.com\/calendar\/?$/i,
]);
const SHARED_LINK_MIN_TITLES = 3;

// Paths that are a site's front door rather than a page.
const HOMEPAGE_PATH_RE = /^\/?(?:index\.(?:html?|php|aspx?)|home\/?|en\/?)?$/i;

// Sources whose external_id carries the source's own event id, and the
// link shape that id should appear in. A link of that shape with a
// DIFFERENT id points at another event (the audit's House A La Mode case).
const ID_BEARING_LINKS = Object.freeze([
  {
    // ra-2545734 <-> https://ra.co/events/2545734
    externalId: /^ra-(\d+)$/,
    link: /^https?:\/\/(?:www\.)?ra\.co\/events\/(\d+)(?:[/?#]|$)/i,
    canonical: (id) => `https://ra.co/events/${id}`,
  },
  {
    // gottagacha-<uuid>-<yyyy-mm-dd> <-> /events/<uuid>?date=<yyyy-mm-dd>
    externalId: /^gottagacha-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d{4}-\d{2}-\d{2}$/i,
    link: /^https?:\/\/(?:www\.)?gottagacha\.com\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i,
    canonical: null,
  },
]);

function normalizeLinkKey(url) {
  return text(url).replace(/\/+$/, "").toLowerCase();
}

// classifyLink(url, { externalId, sharedLinks }) -> { linkClass, detail }
// sharedLinks: optional Set of normalizeLinkKey() values found shared by
// SHARED_LINK_MIN_TITLES+ distinct titles (see findSharedLinks).
function classifyLink(url, ctx = {}) {
  const raw = text(url);
  if (!raw) return { linkClass: "missing", detail: null };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && /\s/.test(raw) && /[a-z]{2,}\s+[a-z]{2,}/i.test(raw)) return { linkClass: "malformed", detail: `text, not a link ("${raw.slice(0, 40)}")` };
  if (/\s/.test(raw)) return { linkClass: "malformed", detail: "contains whitespace" };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    // No scheme: a path the public page cannot resolve to anything useful.
    if (FEED_EXPORT_RE.test(raw)) return { linkClass: "relative", detail: "relative feed/export path" };
    return { linkClass: "relative", detail: "relative path" };
  }
  if (!/^https?:\/\//i.test(raw)) return { linkClass: "malformed", detail: "not an http(s) link" };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { linkClass: "malformed", detail: "does not parse as a URL" };
  }
  if (!parsed.hostname || !parsed.hostname.includes(".")) return { linkClass: "malformed", detail: "no real host" };
  if (FEED_EXPORT_RE.test(parsed.pathname + parsed.search)) return { linkClass: "feed_export", detail: "calendar feed/export, not an event page" };

  const externalId = text(ctx.externalId);
  for (const rule of ID_BEARING_LINKS) {
    const own = rule.externalId.exec(externalId);
    const linked = rule.link.exec(raw);
    if (own && linked && own[1].toLowerCase() !== linked[1].toLowerCase()) {
      return {
        linkClass: "wrong_event",
        detail: `link id ${linked[1]} is not this event's id ${own[1]}`,
        canonical: rule.canonical ? rule.canonical(own[1]) : null,
      };
    }
  }

  if (KNOWN_GENERIC_PAGES.some((re) => re.test(raw))) return { linkClass: "shared_generic", detail: "known shared calendar page" };
  if (ctx.sharedLinks && ctx.sharedLinks.has(normalizeLinkKey(raw))) {
    return { linkClass: "shared_generic", detail: `shared by ${SHARED_LINK_MIN_TITLES}+ different events` };
  }
  if (HOMEPAGE_PATH_RE.test(parsed.pathname) && !parsed.search) return { linkClass: "homepage", detail: "site homepage, not an event page" };
  return { linkClass: "specific", detail: null };
}

// findSharedLinks(events) -> Set of link keys used by SHARED_LINK_MIN_TITLES
// or more distinct titles. Recurring listings of ONE title sharing a series
// page are fine; many different events on one URL is the generic-page
// pattern. Relative/feed links are classified on their own and skipped.
function findSharedLinks(events) {
  const titlesByLink = new Map();
  for (const e of events || []) {
    const title = text(e.title).toLowerCase();
    for (const url of [e.event_url, e.ticket_url]) {
      const raw = text(url);
      if (!/^https?:\/\//i.test(raw)) continue;
      const key = normalizeLinkKey(raw);
      if (!titlesByLink.has(key)) titlesByLink.set(key, new Set());
      titlesByLink.get(key).add(title);
    }
  }
  const shared = new Set();
  for (const [key, titles] of titlesByLink) if (titles.size >= SHARED_LINK_MIN_TITLES) shared.add(key);
  return shared;
}

// ---- place ---------------------------------------------------------------

// Text that names no place. Broader than duplicate-consolidation's
// PLACEHOLDER_VENUE_RE (which decides merges) because here the question is
// only "is this a place we can trust", never "are these the same place".
const PLACEHOLDER_VENUE_RE = /^(?:venue|location|place|address)?\s*(?:tba|tbd|to be (?:announced|determined))\b|^(?:secret|undisclosed)\s+(?:location|venue)\b|^(?:various|multiple)\s+(?:locations|venues|homes|sites)\b|\broute to be announced\b|^(?:online|virtual)(?:\s+event)?$|^see (?:website|description|details)\b/i;

// A region where a venue name belongs ("ON" from a Windsor feed's LOCATION).
const REGION_AS_VENUE_RE = /^(?:mi|michigan|on|ontario|oh|ohio|usa|us|canada|united states)\.?$/i;

function isPlaceholderVenueName(name) {
  return PLACEHOLDER_VENUE_RE.test(text(name));
}

// "Detroit, MI", "Detroit MI 48226", "48226", "Windsor, ON" -> artifacts a
// city field should not carry.
const CITY_ARTIFACT_RE = /(?:,\s*|\s+)(?:mi|michigan|on|ontario)\.?\s*(?:\d{5}(?:-\d{4})?)?\s*$|\b\d{5}(?:-\d{4})?\b/i;

function hasCityArtifact(city) {
  return CITY_ARTIFACT_RE.test(text(city));
}

function normalizeCity(city) {
  return text(city)
    .toLowerCase()
    .replace(CITY_ARTIFACT_RE, "")
    .replace(/\bst\.?\s/g, "saint ")
    .replace(/\btwp\.?\b|\btownship\b|\bcity of\b/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

// ---- dates and times -----------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LONG_RANGE_ADVISORY_DAYS = 30; // exhibits, seasons: real, but worth knowing
const LONG_RANGE_DECISION_DAYS = 366; // a listing running over a year is rarely one event

function parseIsoDate(v) {
  const s = text(v).slice(0, 10);
  if (!ISO_DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

const PLACEHOLDER_TIME_RE = /^(?:tba|tbd|time tba|to be announced|see (?:website|description)|n\/?a|none|null|undefined|-+)$/i;
const MALFORMED_TIME_RE = /\b(?:nan|undefined|invalid date|null)\b/i;

// ---- descriptions and provenance -------------------------------------------

// Publisher furniture that is never a description of an event.
// The last alternative is a site's navigation/social menu captured as text
// ("Facebook Instagram Linkedin X Youtube FOOD Food Restaurants ...").
const BOILERPLATE_RE = /\bfacebook\s+instagram\s+(?:linkedin|twitter|x|youtube|tiktok)\b|(?:\bcopyright\b|©)[^\n]{0,80}?\ball rights reserved\b|\bthis (?:website|site) uses cookies\b|\bsubscribe to (?:our|the) newsletter\b|\bsign up for (?:our|the) newsletter\b|\blorem ipsum\b|\bjavascript (?:is )?(?:required|disabled)\b|\benable javascript\b/i;
const PLACEHOLDER_DESCRIPTION_RE = /^(?:tba|tbd|n\/?a|none|no description(?: available)?|description coming soon|details (?:coming soon|to come|tba)|more (?:info(?:rmation)?|details) (?:coming soon|to come))\.?$/i;

// ---- evaluation ------------------------------------------------------------

const NO_ADVANCE_TICKET_STATUSES = new Set(["door", "rsvp_no_advance_sale", "free", "registration_required"]);

function reason(code, state, message, extra) {
  return Object.assign({ code, state, message }, extra || {});
}

// evaluateEvent(e, ctx) -> { id, state, reasons, linkClass, currency }
// ctx (all optional):
//   today        'YYYY-MM-DD' (for nothing date-relative today; kept so a
//                caller can pin the clock)
//   sharedLinks  Set from findSharedLinks()
//   duplicates   { review: Set<id>, pending: Set<id> } from duplicate-consolidation's plan
//   currency     (e) -> { state: 'current'|'stale'|'unknown', basis, message }
function evaluateEvent(e, ctx = {}) {
  const reasons = [];
  const venue = e.venues && typeof e.venues === "object" ? e.venues : null;

  // -- identity / blocked invariants --
  if (!text(e.title)) reasons.push(reason("title.missing", "blocked", "No title"));
  const start = parseIsoDate(e.start_date);
  if (!start) reasons.push(reason("date.malformed_start", "blocked", `Start date is not a real date (${text(e.start_date) || "blank"})`));
  const hasEnd = !!text(e.end_date);
  const end = hasEnd ? parseIsoDate(e.end_date) : null;
  if (hasEnd && !end) reasons.push(reason("date.malformed_end", "needs_decision", `End date is not a real date (${text(e.end_date)})`));
  if (start && end) {
    const days = Math.round((end - start) / 86400000);
    if (days < 0) reasons.push(reason("date.end_before_start", "blocked", `Ends ${text(e.end_date)}, before it starts ${text(e.start_date)}`));
    else if (days > LONG_RANGE_DECISION_DAYS) reasons.push(reason("date.range_over_year", "needs_decision", `Runs ${days} days — over a year is rarely one event`));
    else if (days > LONG_RANGE_ADVISORY_DAYS) reasons.push(reason("date.long_range", "advisory", `Runs ${days} days (exhibit or season?) — not blocked`));
  }

  // -- time --
  const time = text(e.time_display);
  if (time && MALFORMED_TIME_RE.test(time)) reasons.push(reason("time.malformed", "needs_decision", `Time is malformed ("${time.slice(0, 40)}")`));
  else if (time && PLACEHOLDER_TIME_RE.test(time)) reasons.push(reason("time.placeholder", "advisory", `Time is a placeholder ("${time}")`));
  else if (!time && !e.is_all_day) reasons.push(reason("time.missing", "advisory", "No start time"));

  // -- place --
  const rawName = text(e.venue_name_raw);
  const linkedName = venue ? text(venue.name) : "";
  const shownName = linkedName || rawName; // events_public: COALESCE(v.name, venue_name_raw)
  const placeholder = !!shownName && isPlaceholderVenueName(shownName);
  const rawCity = text(e.venue_city_raw);
  const linkedCity = venue ? text(venue.city) : "";
  if (!shownName && !e.no_fixed_venue) {
    reasons.push(reason("venue.missing", "needs_decision", "No venue at all"));
  } else if (placeholder) {
    if (venue && linkedCity && normalizeCity(linkedCity) !== normalizeCity(rawCity)) {
      // A shared "Venue TBA" row's city is the venues table's default, not
      // anything this event's source said. events_public shows it as fact.
      reasons.push(reason("place.placeholder_asserts_city", "needs_decision", `Placeholder venue "${shownName}" supplies the city "${linkedCity}"${rawCity ? ` (the source said "${rawCity}")` : " the source never stated"}`));
    } else {
      reasons.push(reason("venue.placeholder", "advisory", `Venue not announced ("${shownName}") — not treated as a place`));
    }
  } else if (REGION_AS_VENUE_RE.test(shownName)) {
    reasons.push(reason("venue.not_a_place", "needs_decision", `Venue is a region, not a place ("${shownName}")`));
  } else if (!e.no_fixed_venue) {
    if (rawCity && normalizeCity(shownName) && normalizeCity(shownName) === normalizeCity(rawCity)) {
      reasons.push(reason("venue.name_is_city", "advisory", `Venue name is just the city ("${shownName}")`));
    }
    const hasAddress = !!text(e.venue_address_raw) || !!rawCity || !!(venue && text(venue.address));
    if (!hasAddress) reasons.push(reason("place.address_missing", "advisory", "No address or city"));
  }
  if (venue && linkedCity && rawCity && !placeholder && normalizeCity(linkedCity) && normalizeCity(rawCity) && normalizeCity(linkedCity) !== normalizeCity(rawCity)) {
    reasons.push(reason("place.city_conflict", "needs_decision", `Linked venue is in "${linkedCity}", the source says "${rawCity}"`));
  }
  const artifactCity = [rawCity, linkedCity].find((c) => c && hasCityArtifact(c));
  if (artifactCity) reasons.push(reason("place.city_state_zip", "repairable", `City field carries state/ZIP ("${artifactCity}")`));

  // -- links --
  const linkCtx = { externalId: e.external_id, sharedLinks: ctx.sharedLinks };
  const eventLink = classifyLink(e.event_url, linkCtx);
  const ticketLink = classifyLink(e.ticket_url, linkCtx);
  const best = LINK_RANK[eventLink.linkClass] <= LINK_RANK[ticketLink.linkClass] ? eventLink : ticketLink;
  const linkFindings = [
    ["event_url", eventLink],
    ["ticket_url", ticketLink],
  ];
  for (const [field, c] of linkFindings) {
    const at = `${field}`;
    if (c.linkClass === "relative") reasons.push(reason(c.detail === "relative feed/export path" ? "link.relative_feed" : "link.relative", "repairable", `${at} is a relative ${c.detail === "relative feed/export path" ? "calendar-feed path" : "path"}, not an event page`, { field }));
    else if (c.linkClass === "feed_export") reasons.push(reason("link.feed_export", "repairable", `${at} is a calendar feed/export, not an event page`, { field }));
    else if (c.linkClass === "malformed") reasons.push(reason("link.malformed", "needs_decision", `${at} is malformed (${c.detail})`, { field }));
    else if (c.linkClass === "wrong_event") reasons.push(reason("link.wrong_event", c.canonical ? "repairable" : "needs_decision", `${at}: ${c.detail}`, { field, canonical: c.canonical || null }));
    else if (c.linkClass === "homepage") reasons.push(reason("link.homepage", "advisory", `${at} is a site homepage, not this event's page`, { field }));
    else if (c.linkClass === "shared_generic") reasons.push(reason("link.shared_generic", "advisory", `${at} is a page shared by many events (${c.detail})`, { field }));
  }
  const ticketStatusExplains = !!(e.ticket_status && NO_ADVANCE_TICKET_STATUSES.has(e.ticket_status));
  if (eventLink.linkClass === "missing" && ticketLink.linkClass === "missing" && !ticketStatusExplains) {
    reasons.push(reason("link.none", "advisory", "No event or ticket link"));
  }
  if (e.ticket_status === "onsale" && ticketLink.linkClass === "missing") {
    reasons.push(reason("link.ticket_missing_onsale", "advisory", "Marked on sale but has no ticket link"));
  }

  // -- description / provenance --
  const description = text(e.description);
  if (!description) reasons.push(reason("description.missing", "advisory", "No description"));
  else if (BOILERPLATE_RE.test(description)) reasons.push(reason("description.publisher_boilerplate", "repairable", "Description contains publisher boilerplate"));
  else if (PLACEHOLDER_DESCRIPTION_RE.test(description) || description.toLowerCase() === text(e.title).toLowerCase()) reasons.push(reason("description.placeholder", "advisory", "Description is a placeholder"));
  if (e.description_source === "generated") reasons.push(reason("description.generated", "advisory", "Description was generated, not written by the source"));
  if (!text(e.source)) reasons.push(reason("provenance.no_source", "needs_decision", "No source recorded"));
  else if (!text(e.external_id)) reasons.push(reason("provenance.no_source_record_id", "advisory", "No source record id (external_id) — cannot be re-matched to its source"));

  // -- duplicates (existing knowledge, reused; never merged here) --
  if (ctx.duplicates) {
    if (ctx.duplicates.review && ctx.duplicates.review.has(e.id)) reasons.push(reason("duplicate.needs_review", "needs_decision", "Possible duplicate the rules would not merge (Admin › Duplicates)"));
    else if (ctx.duplicates.pending && ctx.duplicates.pending.has(e.id)) reasons.push(reason("duplicate.pending_merge", "advisory", "Deterministic duplicate; the nightly pass will merge it"));
  }

  // -- currency (stale is NOT cancelled) --
  let currency = null;
  if (typeof ctx.currency === "function") {
    currency = ctx.currency(e) || null;
    if (currency && currency.state === "stale") reasons.push(reason("currency.not_reseen", "advisory", currency.message || "Not re-seen at its source on schedule — stale, not cancelled"));
  }

  const state = reasons.reduce((s, r) => worstState(s, r.state), "cleared");
  return { id: e.id, state, reasons, linkClass: best.linkClass, currency };
}

// One plain sentence per class, for the grouped view (a reason's own
// message is event-specific; a class needs a description of the problem).
const CLASS_DESCRIPTIONS = Object.freeze({
  "title.missing": "Events with no title",
  "date.malformed_start": "Start date is not a real date",
  "date.malformed_end": "End date is not a real date",
  "date.end_before_start": "Ends before it starts",
  "date.range_over_year": "Runs longer than a year",
  "date.long_range": "Runs longer than 30 days (exhibits, seasons) — legitimate, not blocked",
  "time.malformed": "Start time is malformed text",
  "time.placeholder": "Start time is a placeholder (TBA, n/a)",
  "time.missing": "No start time",
  "venue.missing": "No venue at all",
  "venue.placeholder": "Venue not announced (TBA, secret, various) — not treated as a place",
  "venue.not_a_place": "Venue field holds a region (\"ON\", \"MI\"), not a place",
  "venue.name_is_city": "Venue name is just the city",
  "place.placeholder_asserts_city": "A placeholder venue row supplies a city the source never stated",
  "place.address_missing": "No address or city",
  "place.city_conflict": "Linked venue's city disagrees with the source's city",
  "place.city_state_zip": "City field carries a state and/or ZIP (\"Warren, MI 48092\")",
  "link.relative_feed": "Link is a relative calendar-feed path (CivicPlus iCalendar), not an event page",
  "link.relative": "Link is a relative path with no site",
  "link.feed_export": "Link is a calendar feed/export, not an event page",
  "link.malformed": "Link field holds something that is not a working link",
  "link.wrong_event": "Link points at a different event (its id is not this event's)",
  "link.homepage": "Link is a site homepage, not the event's page",
  "link.shared_generic": "Link is a page shared by many different events",
  "link.none": "No event or ticket link",
  "link.ticket_missing_onsale": "Marked on sale with no ticket link",
  "description.missing": "No description",
  "description.publisher_boilerplate": "Description contains publisher boilerplate (footer, cookie notice, site menu)",
  "description.placeholder": "Description is a placeholder or repeats the title",
  "description.generated": "Description was generated, not written by the source",
  "provenance.no_source": "No source recorded",
  "provenance.no_source_record_id": "No source record id — cannot be re-matched to its source",
  "duplicate.needs_review": "Possible duplicate pair the rules would not merge (Admin › Duplicates)",
  "duplicate.pending_merge": "Deterministic duplicate the nightly pass will merge",
  "currency.not_reseen": "Not re-seen at its source on schedule — stale, not cancelled",
});

// summarizeInventory(events, ctx) -> {
//   evaluated, counts{state}, linkClasses{class}, currency{current,stale,unknown},
//   classes: [{ code, state, message, count, bySource{}, sampleIds[] }] most severe first,
//   results: [evaluateEvent output]
// }
function summarizeInventory(events, ctx = {}) {
  const list = Array.isArray(events) ? events : [];
  const sharedLinks = ctx.sharedLinks || findSharedLinks(list);
  const evalCtx = Object.assign({}, ctx, { sharedLinks });
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  const linkClasses = Object.fromEntries(LINK_CLASSES.map((c) => [c, 0]));
  const currency = { current: 0, stale: 0, unknown: 0 };
  const classes = new Map();
  const results = [];
  for (const e of list) {
    const r = evaluateEvent(e, evalCtx);
    results.push(r);
    counts[r.state] += 1;
    linkClasses[r.linkClass] += 1;
    const cs = r.currency && r.currency.state;
    if (cs === "current" || cs === "stale") currency[cs] += 1;
    else currency.unknown += 1;
    const seen = new Set();
    for (const why of r.reasons) {
      if (seen.has(why.code)) continue; // one event counts once per class
      seen.add(why.code);
      if (!classes.has(why.code)) classes.set(why.code, { code: why.code, state: why.state, message: CLASS_DESCRIPTIONS[why.code] || why.message, count: 0, bySource: {}, sampleIds: [] });
      const c = classes.get(why.code);
      c.state = worstState(c.state, why.state);
      c.count += 1;
      const src = text(e.source) || "(no source)";
      c.bySource[src] = (c.bySource[src] || 0) + 1;
      if (c.sampleIds.length < 5) c.sampleIds.push(e.id);
    }
  }
  const sortedClasses = Array.from(classes.values()).sort((a, b) => STATE_RANK[b.state] - STATE_RANK[a.state] || b.count - a.count || a.code.localeCompare(b.code));
  return { evaluated: list.length, counts, linkClasses, currency, classes: sortedClasses, results };
}

module.exports = {
  STATES,
  STATE_RANK,
  CLASS_DESCRIPTIONS,
  LINK_CLASSES,
  SHARED_LINK_MIN_TITLES,
  LONG_RANGE_ADVISORY_DAYS,
  LONG_RANGE_DECISION_DAYS,
  classifyLink,
  findSharedLinks,
  isPlaceholderVenueName,
  hasCityArtifact,
  normalizeCity,
  evaluateEvent,
  summarizeInventory,
  worstState,
};
