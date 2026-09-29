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

module.exports = {
  classifyUrlCheck,
  checkUrl,
  healEventUrl,
  registerRecoveryStrategy,
  hostnameOf,
  normalizeForIdentityMatch,
  htmlContainsTitle,
  classifyRecoveryOutcome,
};
