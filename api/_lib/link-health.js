"use strict";

// api/_lib/link-health.js
//
// Generic (source-agnostic) "is this stored URL actually still alive"
// framework -- 2026-09-28, Needs Follow-up self-healing pass 2.
//
// ROOT PROBLEM THIS CLOSES: a non-null ticket_url/event_url was always
// treated as healthy by Needs Follow-up purely because the DB field wasn't
// blank -- never because anyone confirmed the URL still resolves.
// VisitDetroit's Christmas Cookie Coach Tour and The Original Detroit
// Christmas Bakery Bus Tour both carry a stored ticket_url that 404s on
// the live site (confirmed 2026-09-28 -- visitdetroit.com restructured its
// URL shape from /<slug>/ to /events/<slug>/ at some point after these
// were ingested, and its own Algolia search index -- the source
// api/cron-visitdetroit.js reads -- was never updated to match). See
// migration_042_link_check_status.sql for the columns this writes, and
// api/_lib/visitdetroit-link-recovery.js for VisitDetroit's own
// deterministic recovery rule, registered below as this module's only
// current strategy.
//
// DEAD AUTHORITATIVE EVENT URL -> RECOVER CANONICAL EVENT PAGE -> VERIFY
// EVENT IDENTITY -> PERSIST -> REVALIDATE. That's the whole shape; nothing
// here is VisitDetroit-specific except the one registered strategy.

// classifyUrlCheck(status) -> 'ok' | 'dead' | 'inconclusive'
//   200-399 (after following any redirect)             -> ok
//   404, 410                                            -> dead (a
//     definitive claim from the server that the resource is gone -- the
//     ONLY statuses eligible to trigger a recovery attempt)
//   everything else (401/403/429/5xx, or null for a thrown
//     network error/timeout)                            -> inconclusive.
// A lookup failure is NEVER evidence the page is dead -- a rate limit or a
// transient server error says nothing about whether the event's own page
// still exists. inconclusive never triggers recovery and never overwrites
// a prior link_check_status.
function classifyUrlCheck(status) {
  if (status === null || status === undefined) return "inconclusive";
  if (status >= 200 && status < 400) return "ok";
  if (status === 404 || status === 410) return "dead";
  return "inconclusive";
}

// checkUrl(url, { fetchFn }) -> { classification, status, finalUrl }
// A single live check of one URL. Follows redirects (fetch's own default
// behavior) and reports the FINAL resolved URL, since a repair persists
// the canonical destination, not a redirecting shim -- "redirects: follow
// and persist canonical destination when appropriate."
async function checkUrl(url, { fetchFn = fetch } = {}) {
  if (!url) return { classification: "inconclusive", status: null, finalUrl: null };
  try {
    const resp = await fetchFn(url, { method: "GET", redirect: "follow" });
    return {
      classification: classifyUrlCheck(resp.status),
      status: resp.status,
      finalUrl: resp.url && resp.url !== url ? resp.url : url,
    };
  } catch (err) {
    return { classification: "inconclusive", status: null, finalUrl: null, error: err.message };
  }
}

// A recovery strategy: (deadUrl, { title, fetchFn }) -> Promise<string|null>.
// Must return a candidate URL it has ALREADY identity-verified as the same
// event (see visitdetroit-link-recovery.js for what "verified" means for
// that source), or null if it can't confidently recover one. Registered
// per authoritative-source hostname. A source with no registered strategy
// simply can't be auto-repaired here -- healEventUrl still correctly
// reports 'dead' so it surfaces in Needs Follow-up rather than being
// silently dropped.
const RECOVERY_STRATEGIES = new Map();

function registerRecoveryStrategy(hostname, strategyFn) {
  RECOVERY_STRATEGIES.set(hostname, strategyFn);
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// normalizeForIdentityMatch(str) -> lowercase, HTML-entity-decoded,
// JSON-backslash-unescaped comparable form of a string.
//
// A recovered candidate page's raw HTML almost never repeats a title
// character-for-character: browsers/CMSes routinely re-encode quotes,
// ampersands and apostrophes as HTML entities inside <title>/meta tags
// (`&quot;`, `&amp;`, `&#8217;`...), and a JSON-LD <script> block escapes
// an internal quote as `\"` rather than `"`. A strategy comparing a DB
// title against raw fetched HTML with a plain case-insensitive substring
// search will silently, wrongly reject a genuine match purely because of
// this encoding noise -- confirmed 2026-09-29 against two real
// VisitDetroit events ("Wild West" Murder Mystery Interactive Dinner and
// What We Notice: Living in Art) whose own live /events/ pages matched
// in every way except this. Decoding first (never the reverse -- this
// normalizes toward plain text, never toward guessing) keeps the
// "confirm identity before trusting a recovered link" bar exactly as
// strict, just no longer defeated by markup escaping.
function normalizeForIdentityMatch(str) {
  return String(str)
    .replace(/\\"/g, '"') // JSON-LD's escaped internal quotes
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&rsquo;|&#8217;|&#x2019;/gi, "'")
    .replace(/&lsquo;|&#8216;|&#x2018;/gi, "'")
    .replace(/&ldquo;|&#8220;|&#x201c;/gi, '"')
    .replace(/&rdquo;|&#8221;|&#x201d;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .trim()
    .toLowerCase();
}

// htmlContainsTitle(html, title) -> boolean
// The shared identity check a recovery strategy should use before
// trusting a candidate page: true only if the page's own text confirms
// the same event title, after normalizing away markup-encoding noise on
// both sides (see normalizeForIdentityMatch above). Still a strict
// substring match, still "never guess" -- just no longer fooled by
// &quot;/&amp;/\" encoding differences between the DB's plain-text title
// and the page's raw HTML source.
function htmlContainsTitle(html, title) {
  if (!title || !String(title).trim()) return false;
  return normalizeForIdentityMatch(html).includes(normalizeForIdentityMatch(title));
}

// classifyRecoveryOutcome({ repaired }) -> one of Jody's 5 dead-link
// recovery outcome codes (2026-09-29 dead-link systematization):
//   LINK_DEAD_REPLACED         -- a strategy found + revalidated a
//                                 replacement (repaired === true).
//   RECOVERY_UNCERTAIN         -- confirmed dead, no strategy could
//                                 confidently replace it. The safe
//                                 default for every source/case this
//                                 project doesn't yet have a positive
//                                 signal for.
//   LINK_DEAD_REMOVED,
//   EVENT_CONFIRMED_CANCELLED,
//   EVENT_SOURCE_GONE           -- reserved for a FUTURE strategy that
//                                 can positively assert one of these
//                                 (e.g. "the source's own listing feed
//                                 no longer contains this event at all"
//                                 -> EVENT_SOURCE_GONE; "the source
//                                 itself marks this event cancelled" ->
//                                 EVENT_CONFIRMED_CANCELLED). Only ever
//                                 reachable via strategy-specific code
//                                 that positively confirms one of these,
//                                 never inferred from a dead link alone
//                                 -- per the explicit product rule, a
//                                 dead ticket/event link by itself is
//                                 NEVER evidence of cancellation or
//                                 source removal. Nothing in this
//                                 project currently produces these two
//                                 outcomes; the vocabulary is specified
//                                 now, ahead of any strategy that emits
//                                 them, so RECOVERY_UNCERTAIN never gets
//                                 silently reused to mean something more
//                                 specific once one is added.
function classifyRecoveryOutcome({ repaired }) {
  return repaired ? "LINK_DEAD_REPLACED" : "RECOVERY_UNCERTAIN";
}


// healEventUrl({ url, title, fetchFn }) -> {
//   checked: boolean,       -- false only when url itself was falsy
//   classification,         -- 'ok' | 'dead' | 'inconclusive' of the
//                              ORIGINAL url
//   repaired: boolean,      -- true only when a dead url was confidently
//                              recovered AND the replacement re-verified ok
//   newUrl: string|null,    -- the revalidated replacement, when repaired
// }
//
// NEVER acts on an inconclusive check. Only a confirmed 'dead'
// classification triggers a recovery attempt, and any candidate a strategy
// returns is ALWAYS re-checked via checkUrl before repaired is ever set
// true -- "revalidate the new URL before clearing the issue," and a
// strategy's own identity check is necessary but never treated as
// sufficient on its own.
async function healEventUrl({ url, title, fetchFn = fetch } = {}) {
  const initial = await checkUrl(url, { fetchFn });
  if (initial.classification !== "dead") {
    return { checked: !!url, classification: initial.classification, repaired: false, newUrl: null };
  }

  const strategy = RECOVERY_STRATEGIES.get(hostnameOf(url));
  if (!strategy) {
    return { checked: true, classification: "dead", repaired: false, newUrl: null };
  }

  let candidate = null;
  try {
    candidate = await strategy(url, { title, fetchFn });
  } catch {
    candidate = null;
  }
  if (!candidate) {
    return { checked: true, classification: "dead", repaired: false, newUrl: null };
  }

  const revalidated = await checkUrl(candidate, { fetchFn });
  if (revalidated.classification !== "ok") {
    return { checked: true, classification: "dead", repaired: false, newUrl: null };
  }

  return { checked: true, classification: "dead", repaired: true, newUrl: revalidated.finalUrl || candidate };
}

// ---------------------------------------------------------------------------
// LINK USABILITY (issue #99). A 200 response is not proof a link is useful: a
// "ticket_url" that is just a venue's homepage resolves fine and still sends
// the visitor nowhere near the event. These helpers CLASSIFY a stored URL by
// what it points at, and summarise usability by class and source. Pure (no
// network, no DB): the live reachability check above (checkUrl /
// link_check_status) is unchanged and independent of this.
//
// Classes:
//   direct_event      a page specific to this event (deep path or id), incl.
//                     facebook.com/events/<id>
//   ticket            a purchase/registration page: a known ticketing host
//                     with a recognised event path, a ticketing-platform
//                     subdomain root, or an event-specific path in a ticket
//                     field
//   venue             the venue's own page (matches the venue website)
//   listing           a page that lists events (a venue's events index, a
//                     ticketing platform's club/venue page): resolves, is not
//                     a direct event link, is never a reason to hide anything
//   generic_homepage  a bare site root or generic index (/, /events,
//                     /the-arts/tickets, /events/upcoming ...)
//   social            instagram / facebook (non-event) / tiktok / linktr.ee
//                     and similar: never usable as a ticket or event link
//   invalid           not an absolute http(s) URL; `reason` says why:
//                     relative_url, calendar_feed, malformed_url,
//                     unsupported_scheme
//   missing           no value
// Usable = direct_event or ticket. Nothing here suppresses a record: a
// missing ticket URL never hides a valid event or venue link, and unusable
// links are counted for review, never removed or used to gate display.
// Affiliate redirects (e.g. *.evyy.net with a u= target) are unwrapped and the
// TARGET is classified; a result reached that way carries unwrapped: true.
// The lists below are Platform's defaults for Event Intelligence to adjust.
const GENERIC_INDEX_SEGMENTS = new Set([
  "events", "event", "calendar", "whats-on", "whatson", "whats-happening", "shows", "tickets",
  "upcoming", "schedule", "home", "index", "programs", "happenings", "exhibitions", "lineup",
  "concerts", "performances", "box-office", "boxoffice", "buy-tickets", "list",
]);
// Words that make a single path segment a venue's events index
// ("events-exhibitions1") rather than one event's slug.
const LISTING_WORDS = new Set([
  "events", "event", "exhibitions", "exhibition", "shows", "calendar", "programs", "program",
  "whats", "on", "happening", "upcoming", "list", "schedule",
]);
// Ticketing hosts -> regex of recognised per-event paths, or null to fall back
// to "looks event-specific".
const TICKETING_HOSTS = {
  "ra.co": /^\/events\/\d+/,
  "eventbrite.com": /^\/e\//,
  "dice.fm": /^\/event\//,
  "ticketmaster.com": /(^|\/)event\//,
  "livenation.com": /(^|\/)event\//,
  "axs.com": /^\/events\/\d+/,
  "seetickets.us": /^\/event\//,
  "ticketweb.com": /^\/event\//,
  "eventim.us": /(^|\/)event\//,
  "showclix.com": /^\/event\//,
  "universe.com": /^\/events\//,
  "ticketleap.com": /^\/events\//,
  "posh.vip": /^\/e\//,
  "partiful.com": /^\/e\//,
  "fearticket.com": null, "etix.com": null, "tixr.com": null, "crowdwork.com": null, "veezi.com": null,
  "spektrix.com": null, "signupgenius.com": null, "bandsintown.com": null, "songkick.com": null,
};
// Platforms whose per-organisation subdomain root IS the sales page.
const TICKET_PLATFORM_SUBDOMAINS = ["fearticket.com", "ticketleap.com", "tixr.com", "eventbrite.com", "crowdwork.com", "spektrix.com"];
const SOCIAL_HOSTS = ["instagram.com", "facebook.com", "fb.com", "fb.me", "tiktok.com", "linktr.ee", "twitter.com", "x.com", "beacons.ai", "threads.net"];
// Affiliate links are sometimes wrapped more than once (a wrapper whose u= is
// itself a wrapper); unwrap up to this many levels, then classify what is left.
const MAX_UNWRAP_DEPTH = 3;
const CALENDAR_FEED_RE = /(\.ics(\?|#|$)|icalendar\.aspx|\/ical(endar)?(\/|\?|$)|webcal:)/i;

function bareHost(u) { return u.hostname.replace(/^www\./, "").toLowerCase(); }
function hostIn(host, list) { return list.some((h) => host === h || host.endsWith("." + h)); }
function pathSegments(u) { return u.pathname.split("/").filter(Boolean); }
function stripExt(seg) { return seg.replace(/\.(html?|php|aspx?)$/i, ""); }

// A query string only identifies a page when it carries an id-like parameter
// (e.g. ?p=123, ?event_id=...). Tracking parameters do not.
function hasIdentifyingQuery(u) {
  for (const k of u.searchParams.keys()) {
    if (/^(p|id|eid|event|event_id|eventid|post|pid|tribe_events)$/i.test(k)) return true;
  }
  return false;
}

function isGenericPath(u) {
  const segs = pathSegments(u).map((x) => stripExt(x).toLowerCase());
  if (hasIdentifyingQuery(u)) return false;
  if (segs.length === 0) return true;
  return segs.length <= 2 && GENERIC_INDEX_SEGMENTS.has(segs[segs.length - 1]);
}

function isListingPath(u) {
  const segs = pathSegments(u);
  if (segs.length !== 1 || hasIdentifyingQuery(u)) return false;
  const tokens = stripExt(segs[0]).toLowerCase().split(/[-_]/).filter((t) => t && !/^\d+$/.test(t));
  const base = tokens.length ? tokens.map((t) => t.replace(/\d+$/, "")).filter(Boolean) : [];
  return base.length > 0 && base.every((t) => LISTING_WORDS.has(t));
}

// Does the path look like it names one event? (depth, id-like segment, or a
// multi-word slug.)
function looksEventSpecific(u) {
  if (hasIdentifyingQuery(u)) return true;
  const segs = pathSegments(u).map(stripExt);
  if (segs.length === 0) return false;
  if (segs.length >= 2) return true;
  const last = segs[segs.length - 1];
  return /\d/.test(last) || last.split(/[-_]/).filter(Boolean).length >= 3;
}

function unwrapAffiliate(u) {
  const host = bareHost(u);
  if (!(host.endsWith("evyy.net") || host.endsWith("pxf.io") || host.endsWith("sjv.io"))) return null;
  const target = u.searchParams.get("u") || u.searchParams.get("url");
  if (!target) return null;
  let decoded = target;
  try { decoded = decodeURIComponent(target); } catch { /* keep raw */ }
  return decoded;
}

// classifyLinkDetail(url, { field: 'event'|'ticket', venueWebsite }) ->
//   { kind, reason?, unwrapped? }
function classifyLinkDetail(url, { field = "event", venueWebsite = null, _depth = 0 } = {}) {
  if (url === null || url === undefined || (typeof url === "string" && !url.trim())) return { kind: "missing" };
  if (typeof url !== "string") return { kind: "invalid", reason: "malformed_url" };
  const raw = url.trim();
  if (CALENDAR_FEED_RE.test(raw)) return { kind: "invalid", reason: "calendar_feed" };
  if (raw.startsWith("/") && !raw.startsWith("//")) return { kind: "invalid", reason: "relative_url" };
  let u;
  try { u = new URL(raw); } catch { return { kind: "invalid", reason: "malformed_url" }; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname) return { kind: "invalid", reason: "unsupported_scheme" };

  const wrapped = _depth < MAX_UNWRAP_DEPTH ? unwrapAffiliate(u) : null;
  if (wrapped) {
    const inner = classifyLinkDetail(wrapped, { field, venueWebsite, _depth: _depth + 1 });
    return { ...inner, unwrapped: true };
  }

  const host = bareHost(u);
  if (hostIn(host, SOCIAL_HOSTS)) {
    if (/(^|\.)facebook\.com$/.test(host) && /^\/events\/(\d+|s\/[^/]+\/\d+)/.test(u.pathname)) return { kind: "direct_event" };
    return { kind: "social" };
  }

  let v = null;
  try { v = venueWebsite ? new URL(venueWebsite) : null; } catch { v = null; }
  if (v && /^https?:$/.test(v.protocol) && bareHost(u) === bareHost(v) && pathSegments(u).join("/") === pathSegments(v).join("/") && !hasIdentifyingQuery(u)) {
    return { kind: pathSegments(u).length === 0 ? "generic_homepage" : "venue" };
  }

  const ticketingKey = Object.keys(TICKETING_HOSTS).find((h) => host === h || host.endsWith("." + h));
  if (ticketingKey) {
    const segs = pathSegments(u);
    const sub = host !== ticketingKey && host.replace(/^www\./, "") !== ticketingKey && host.split(".").length > ticketingKey.split(".").length;
    if (segs.length === 0 && sub && TICKET_PLATFORM_SUBDOMAINS.includes(ticketingKey) && host.split(".")[0] !== "www") return { kind: "ticket" };
    if (segs.length === 0 || isGenericPath(u)) return { kind: "generic_homepage" };
    const re = TICKETING_HOSTS[ticketingKey];
    if (re ? re.test(u.pathname) : looksEventSpecific(u)) return { kind: "ticket" };
    return { kind: "listing" };
  }

  if (isGenericPath(u)) return { kind: "generic_homepage" };
  if (isListingPath(u)) return { kind: "listing" };
  if (field === "ticket") return { kind: looksEventSpecific(u) ? "ticket" : "listing" };
  return { kind: "direct_event" };
}

function classifyLinkKind(url, opts) { return classifyLinkDetail(url, opts).kind; }

function isUsableLinkKind(kind) {
  return kind === "direct_event" || kind === "ticket";
}

// assessEventLinks(row, { venueWebsite }) -> per-field class + usability.
// hasUsableLink is true if EITHER field is usable, so a missing ticket_url
// never marks an event with a good event_url as unlinked (and vice versa).
// Descriptive only: callers must never use it to gate display.
function assessEventLinks(row, { venueWebsite = null } = {}) {
  const e = classifyLinkDetail(row && row.event_url, { field: "event", venueWebsite });
  const t = classifyLinkDetail(row && row.ticket_url, { field: "ticket", venueWebsite });
  return {
    event: { kind: e.kind, usable: isUsableLinkKind(e.kind), reason: e.reason || null, unwrapped: !!e.unwrapped },
    ticket: { kind: t.kind, usable: isUsableLinkKind(t.kind), reason: t.reason || null, unwrapped: !!t.unwrapped },
    hasUsableLink: isUsableLinkKind(e.kind) || isUsableLinkKind(t.kind),
    deadFlagged: !!(row && row.link_check_status === "dead"),
  };
}

// summarizeLinkUsability(rows, { venueWebsiteFor }) -> counts by class and
// by source, plus counts of why links were invalid. rows: events with source,
// event_url, ticket_url, link_check_status. venueWebsiteFor(row) optionally
// returns the linked venue's website. Read-only; the caller decides what to
// do with the counts.
function summarizeLinkUsability(rows, { venueWebsiteFor = null } = {}) {
  const emptyBucket = () => ({ events: 0, withUsableLink: 0, noUsableLink: 0, deadFlagged: 0, event_url: {}, ticket_url: {}, invalidReasons: {} });
  const total = emptyBucket();
  const bySource = {};
  const bump = (b, a) => {
    b.events += 1;
    if (a.hasUsableLink) b.withUsableLink += 1; else b.noUsableLink += 1;
    if (a.deadFlagged) b.deadFlagged += 1;
    b.event_url[a.event.kind] = (b.event_url[a.event.kind] || 0) + 1;
    b.ticket_url[a.ticket.kind] = (b.ticket_url[a.ticket.kind] || 0) + 1;
    for (const f of [a.event, a.ticket]) if (f.reason) b.invalidReasons[f.reason] = (b.invalidReasons[f.reason] || 0) + 1;
  };
  for (const row of rows || []) {
    const a = assessEventLinks(row, { venueWebsite: venueWebsiteFor ? venueWebsiteFor(row) : null });
    bump(total, a);
    const src = (row && row.source) || "unknown";
    bump((bySource[src] = bySource[src] || emptyBucket()), a);
  }
  return { total, bySource };
}

module.exports = {
  classifyUrlCheck,
  checkUrl,
  healEventUrl,
  registerRecoveryStrategy,
  hostnameOf,
  normalizeForIdentityMatch,
  htmlContainsTitle,
  classifyRecoveryOutcome,
  classifyLinkKind,
  classifyLinkDetail,
  isUsableLinkKind,
  assessEventLinks,
  summarizeLinkUsability,
};
