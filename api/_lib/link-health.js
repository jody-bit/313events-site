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

module.exports = { classifyUrlCheck, checkUrl, healEventUrl, registerRecoveryStrategy, hostnameOf };
