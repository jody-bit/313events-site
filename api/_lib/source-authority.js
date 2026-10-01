"use strict";

// api/_lib/source-authority.js
//
// Source-authority tier classification -- 2026-10-01, RA candidate-recovery
// MVP (Product Owner decision 4). Generic/source-agnostic: classifies any
// VERIFIED external-discovery hit (api/_lib/external-discovery.js's
// verifyOfficialResult has already confirmed the domain isn't a known
// non-official aggregator/social/search host AND that a real subject term
// matched) into one of three tiers, so a record of "this fact came from
// somewhere independent" can also say HOW independent:
//
//   primary_authoritative   -- the official venue, promoter, organizer,
//                               event-series, or label/collective's own
//                               account or site.
//   secondary_corroborating -- a participating artist's own account, or an
//                               official event partner (not the venue/
//                               organizer itself, but directly tied to this
//                               event).
//   discovery_only          -- an aggregator, recommendation engine, repost,
//                               fan account, or otherwise unaffiliated
//                               source. Evidence the event exists, never
//                               evidence of its own facts.
//
// Authority is about the ACCOUNT'S RELATIONSHIP to the event, not about
// whether the source happens to be a traditional website vs. a social
// profile (Product Owner, 2026-10-01: "Official Instagram posts... may
// establish individual event facts... Authority is based on the
// relationship of the account to the event, not on whether the source is
// a traditional website"). This module does not itself fetch or search
// anything, and does not special-case any one platform (no Instagram-
// specific code here, by explicit instruction -- that acquisition layer is
// deferred). It only classifies a hit a CALLER already has.
//
// Never upgrades a tier by guessing. A hit that doesn't clearly match the
// venue/organizer's own identity, and carries no other signal, is always
// discovery_only -- the conservative default -- never primary or
// secondary "because it seems likely."
//
// Deliberately excludes grading on imagery/context (Product Owner: "Never
// infer a fact merely from imagery or context when it is not explicitly
// supported") -- this module only ever looks at the matched text signal
// the caller hands it (a venue-name/organizer-name match vs. an artist/
// context-term match), never at an image.

const path = require("path");
const { NON_OFFICIAL_DOMAINS, hostnameOf } = require(path.join(__dirname, "external-discovery"));

const TIERS = Object.freeze({
  PRIMARY_AUTHORITATIVE: "primary_authoritative",
  SECONDARY_CORROBORATING: "secondary_corroborating",
  DISCOVERY_ONLY: "discovery_only",
});

function normalize(s) {
  return typeof s === "string" ? s.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

// classifySourceTier({ url, matchedOn }) -> one of TIERS
//
// `url` is the verified hit's own URL (e.g. discovery.sourceUrl /
// authoritative.sourceUrl from external-discovery.js). `matchedOn` is the
// caller's own honest account of WHAT the verified subject-term match was
// against:
//   'venue'     -- matched the venue/organizer's own name -- the search
//                  was itself a venue/organizer-identity search (today's
//                  only real call sites: discoverVenueKnowledge,
//                  discoverAuthoritativeDescription when only venueName
//                  matched).
//   'organizer' -- matched a known promoter/series/label name explicitly
//                  passed by the caller (same tier as 'venue' -- both are
//                  the event's own official operator, not a participant).
//   'artist'    -- matched a participating artist/performer's own name,
//                  not the venue/organizer -- secondary, not primary.
//   undefined/other -- no specific signal available; classified by domain
//                  alone.
// A URL on a known non-official domain (NON_OFFICIAL_DOMAINS -- ticket
// resellers/aggregators, social search engines, Wikipedia, ra.co itself,
// etc.) is ALWAYS discovery_only, regardless of matchedOn -- an aggregator
// listing an event is evidence the event exists, never evidence of the
// venue/organizer's own facts.
function classifySourceTier({ url, matchedOn } = {}) {
  const host = hostnameOf(url);
  if (!host) return TIERS.DISCOVERY_ONLY;
  if (NON_OFFICIAL_DOMAINS.has(host)) return TIERS.DISCOVERY_ONLY;

  const on = normalize(matchedOn);
  if (on === "artist") return TIERS.SECONDARY_CORROBORATING;
  if (on === "venue" || on === "organizer") return TIERS.PRIMARY_AUTHORITATIVE;

  // No explicit signal: this is still a verified-official-domain hit (the
  // caller only ever hands this function something that already passed
  // verifyOfficialResult), so it is independent, real evidence -- just not
  // confidently tied to the venue/organizer's own identity specifically.
  // Conservative default: treat as discovery_only rather than assume.
  return TIERS.DISCOVERY_ONLY;
}

module.exports = { TIERS, classifySourceTier };
