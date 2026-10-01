// api/_lib/external-discovery.js
//
// Bounded external web discovery for generic enrichment -- 2026-09-23,
// "CORRECTION TO ENRICHMENT PRODUCT BEHAVIOR." The Product Owner's
// instruction: "JODY SHOULD NOT BE THE EXTERNAL RESEARCH LAYER... when
// deterministic database/source recovery is exhausted, the system can
// perform bounded external factual discovery before sending an event to
// Needs Follow-up."
//
// This module is the ONE place a real external search provider is called
// from. It is deliberately provider-pluggable (an injectable fetchFn/apiKey
// pair, same dependency-injection convention as every other _lib module in
// this project) so the pipeline mechanics built on top of it (ordering,
// verification gating, persistence, revalidation, compounding reuse) are
// fully provable with a mocked provider in tests, independent of whether a
// real credential is configured.
//
// DEFAULT / UNCONFIGURED BEHAVIOR: every exported discovery function
// returns null immediately, with NO network call attempted, unless a real
// API key is present (TAVILY_API_KEY in the environment, or passed
// explicitly). This project has no such credential today (confirmed via a
// full .env.local variable audit, 2026-09-23). Per the Product Owner's
// explicit instruction -- "Do NOT purchase anything or invent credentials...
// Do not build against a fictional credential" -- this module is NOT wired
// to a fabricated key and makes NO live network call in production until
// Jody supplies a real one. See the delivery report for the researched,
// recommended provider and exact setup steps; this code has NOT been
// exercised against a live response, by design.
//
// RECOMMENDED PROVIDER: Tavily (api.tavily.com). Chosen over Brave Search
// API (as of 2026-09-23, now requires a saved credit card with open-ended
// auto-billing once its $5/mo credit is exhausted -- confirmed via Brave's
// own pricing page and independent reporting) and Google's Custom Search
// JSON API (closed to new customers entirely, and sunsetting for existing
// customers by 2027-01-01 -- confirmed via Google's own developer docs).
// Tavily's free tier is 1,000 credits/month, no credit card required, and
// hard-capped (requests simply stop when exhausted -- it does not silently
// convert to metered billing). That is the smallest safe fit for "bounded
// web discovery... NOT unrestricted crawling."
//
// VERIFICATION: never trust a search result just because it was returned.
// A result is only usable when its domain is not a known non-official
// aggregator/social/search host AND a real subject term (a venue name, an
// event title) appears in its title or content -- matching the Product
// Owner's explicit "Do not create venue knowledge from ambiguous search
// results." An unverified result is discarded, never guessed at, never
// picked "because it's the top result."
//
// BOUNDS: this module makes exactly one outbound search request per call.
// Per-run caps (distinct venues attempted, total description lookups) are
// enforced by the caller, scripts/generic-metadata-enrichment.js.

"use strict";

// Known non-official domains: aggregators, ticket resellers, social
// platforms, and search engines themselves. A result from one of these is
// never treated as an "authoritative official source," no matter how well
// its title/content matches -- it is evidence the SUBJECT exists, not
// evidence of the subject's own facts.
const NON_OFFICIAL_DOMAINS = new Set([
  "ticketmaster.com", "eventbrite.com", "songkick.com", "bandsintown.com",
  "yelp.com", "tripadvisor.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "wikipedia.org", "google.com", "bing.com",
  "yellowpages.com", "mapquest.com", "foursquare.com", "reddit.com",
  "ra.co", "residentadvisor.net",
  // Added 2026-10-01 -- RA candidate-recovery V1 experiment, production
  // dry run. All three are the same shape as the aggregators above (one
  // domain serving unrelated venues' event pages) but weren't yet known
  // to this list: ma.to was the "primary_authoritative" source for three
  // different, unrelated venues in a single 10-candidate batch (Big
  // Pink, Marble Bar, Spkrbox) -- the only way one domain legitimately
  // does that is by being an aggregator. discotech.me and
  // technobeatscloud.com are the same genre. This is a cheap defensive
  // backstop, NOT the primary fix for this class of problem -- see
  // domainPlausiblyOwnedByName in source-authority.js for the
  // generalized check that doesn't depend on enumerating aggregators by
  // name one at a time.
  "ma.to", "discotech.me", "technobeatscloud.com",
]);

function isExternalDiscoveryConfigured(env = process.env) {
  return !!(env && typeof env.TAVILY_API_KEY === "string" && env.TAVILY_API_KEY.trim());
}

function hostnameOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeForMatch(s) {
  return typeof s === "string" ? s.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

// A result is "official" only when its domain isn't a known non-official
// aggregator/social/search host AND at least one of the given subject
// strings (venue name, event title, etc.) appears in its title or content.
// Never fuzzy -- an exact (normalized) substring match only. Subject terms
// shorter than 3 characters are ignored (too weak to mean anything).
function verifyOfficialResult(subjectTerms, result) {
  if (!result || typeof result.url !== "string") return false;
  const host = hostnameOf(result.url);
  if (!host || NON_OFFICIAL_DOMAINS.has(host)) return false;
  const haystack = normalizeForMatch(`${result.title || ""} ${result.content || ""}`);
  const terms = (Array.isArray(subjectTerms) ? subjectTerms : [subjectTerms])
    .map(normalizeForMatch)
    .filter((t) => t.length >= 3);
  if (terms.length === 0) return false;
  return terms.some((t) => haystack.includes(t));
}

// Conservative US street-address extractor. Only returns a match on a
// clearly street-address-shaped substring ("### Word[s] St/Ave/Blvd/...");
// returns null rather than guessing at anything looser. City is only
// returned when a ", <City>, MI" pattern immediately follows -- never
// inferred from the venue name or elsewhere. A verified official website
// with no extractable address is still valid, persistable knowledge (see
// discoverVenueKnowledge below) -- this extractor's job is only to avoid
// ever inventing an address that isn't plainly present.
const STREET_SUFFIX = "(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Pl|Place|Ct|Court|Hwy|Highway)";
const ADDRESS_RE = new RegExp(`\\b(\\d{1,6}\\s+[A-Z][A-Za-z0-9.'-]*(?:\\s+[A-Z][A-Za-z0-9.'-]*){0,3}\\s+${STREET_SUFFIX}\\.?)\\b`);
const CITY_RE = /,\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\s*,?\s*MI\b/;

function extractAddressFromContent(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  const addressMatch = content.match(ADDRESS_RE);
  if (!addressMatch) return null;
  const cityMatch = content.match(CITY_RE);
  return {
    address: addressMatch[1].trim(),
    city: cityMatch ? cityMatch[1].trim() : null,
  };
}

// "at <Venue Name>[ in <City>]" / "to the <Venue Name>" -- a Title-Case
// phrase of 1-5 words immediately after the preposition. Deliberately
// requires the preposition (never just "any capitalized phrase" -- that
// would catch far too much unrelated text, e.g. a person's name). Moved
// here 2026-09-23 (SMALL CORRECTION BEFORE DEPLOYMENT) from
// scripts/press-coverage-linking.js so the SAME pattern-matching machinery
// can pull a venue name both out of an article's own body text (that file's
// extractVenue, which now delegates here) AND out of a verified external
// search result's content (discoverEventVenue below) -- one venue-phrase
// extractor, two callers, not two search systems.
// PRODUCTION BUG FIX (2026-09-23): the trailing lookahead must tolerate an
// OPTIONAL space before the terminating period/comma (\s*[.,], not [.,]).
// stripHtml() (scripts/press-coverage-linking.js) turns an HTML tag
// boundary into a literal space, so real article text very often reads
// "...at Color Ink Studio in Hazel Park . The exhibition..." (a stray
// space before the period, from markup like "...Hazel Park</a>." or a
// trailing inline element) -- the original [.,] alternative required the
// punctuation to immediately follow the captured phrase with zero
// characters between, which real HTML-stripped text routinely violates,
// silently defeating this match on genuine, real production article pages
// even though the same phrase matches fine on hand-typed test fixtures.
// PRODUCTION BUG FIX (2026-09-23, item 2): two more real-world phrasings
// this pattern silently missed, found tracing the still-unresolved
// Recovery & Resilience Festival articles (both Metro Times pieces name
// the venue in full, but neither was ever extracted):
//   (a) "at THE <Venue Name>" -- an article ("the") between the
//       preposition and the venue's own name is extremely common ("at the
//       Downriver Council for the Arts") and was previously fatal: the
//       original pattern required the very next character after "at " to
//       be the capitalized start of the venue name itself.
//   (b) a venue name containing its own internal lowercase connector
//       word(s) ("Downriver Council for the Arts", "Detroit Institute of
//       Arts") -- the original repeating group required EVERY subsequent
//       word to itself start with a capital letter, so it silently
//       truncated at the first lowercase connector ("Downriver Council"),
//       which is worse than not matching at all (resolveVenueId never
//       fuzzy-matches, so a truncated name fails to resolve against the
//       real venue). "in" is deliberately excluded from the connector list
//       -- it stays reserved as the "at X in City" separator, so "at Color
//       Ink Studio in Hazel Park" still splits into venue/city exactly as
//       before, never absorbed into one phrase.
// Neither change touches RETURNS_TO_VENUE_RE or the stray-space fix above.
const VENUE_NAME_CONNECTOR = "(?:of|for|the|and|&)";
const AT_VENUE_RE = new RegExp(
  `\\bat\\s+(?:the\\s+)?([A-Z][A-Za-z0-9&''.-]*(?:\\s+(?:${VENUE_NAME_CONNECTOR}\\s+)*[A-Z][A-Za-z0-9&''.-]*){0,5})` +
  `(?:\\s+in\\s+([A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+)?))?` +
  `(?=\\s*[.,]|\\s+(?:on|this|next|during|starting|opens|opening|for|from)\\b)`
);
const RETURNS_TO_VENUE_RE = /\breturns?\s+to\s+the\s+([A-Z][A-Za-z0-9&''.-]*(?:\s+[A-Z][A-Za-z0-9&''.-]*){0,4})\b/;

// Words that are never a venue name even when they're capitalized and
// happen to follow "at"/"the" -- common false-positive traps. Checked
// against the bare captured phrase AND against "the " + that phrase, since
// AT_VENUE_RE's "at THE <Venue>" tolerance (above) means the captured group
// never itself includes the leading "the" -- a false-positive match on "at
// the door" now captures "Door", not "the door".
const VENUE_STOPWORDS = new Set([
  "the door", "the event", "the show", "the market", "the festival", "the preview",
]);

// A captured "at (the) X" phrase is rejected as a venue whenever X itself
// ends in a recognized EVENT-type noun -- e.g. "Tolhurst will speak at the
// Recovery and Resilience Festival" names the EVENT, not a place. Without
// this, the "at THE <Venue>" tolerance added above (for real venue phrasing
// like "at the Downriver Council for the Arts") would just as readily catch
// an article referring back to its own event by name, silently writing the
// event's own title in as its "venue." Same noun list
// scripts/press-coverage-linking.js's own TITLE_PHRASE_RE anchors an event
// TITLE with (duplicated intentionally, not imported -- this project's
// stated one-file-per-concern convention; see that file's own
// decodeEntities comment).
const VENUE_REJECT_EVENT_NOUN_RE = /\b(Festival|Fest|Market|Fair|Expo|Gala|Crawl|Showcase|Parade|Exhibition|Exhibit)$/;

// extractVenuePhraseFromText(text) -> { name, city } | null
//
// Conservative venue-phrase extraction, reused by both an article's own
// body text and a verified external search result's content.
function extractVenuePhraseFromText(text) {
  if (!text) return null;
  const returnsMatch = text.match(RETURNS_TO_VENUE_RE);
  if (returnsMatch && !VENUE_STOPWORDS.has(returnsMatch[1].toLowerCase())) {
    return { name: returnsMatch[1].trim(), city: null };
  }
  const atMatch = text.match(AT_VENUE_RE);
  if (atMatch) {
    const bare = atMatch[1].toLowerCase();
    const namesTheEventItself = VENUE_REJECT_EVENT_NOUN_RE.test(atMatch[1]);
    if (!namesTheEventItself && !VENUE_STOPWORDS.has(bare) && !VENUE_STOPWORDS.has("the " + bare)) {
      return { name: atMatch[1].trim(), city: atMatch[2] ? atMatch[2].trim() : null };
    }
  }
  return null;
}

async function tavilySearch({ query, apiKey, fetchFn, maxResults = 5 }) {
  const doFetch = fetchFn || fetch;
  const resp = await doFetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: maxResults, search_depth: "basic" }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data && data.results) ? data.results : [];
}

// discoverVenueKnowledge({ venueName, apiKey, fetchFn }) ->
//   { name, website, address, city, sourceUrl } | null
//
// ONE bounded search for a venue's own official site. Returns null (no
// venue knowledge) whenever: no apiKey is configured (no network call is
// even attempted), the request fails, or no result passes
// verifyOfficialResult. Address/city are only included when confidently
// extracted (extractAddressFromContent) -- a verified official website
// alone (address/city still null) is still valid, useful, persistable
// knowledge; never a reason to guess further.
async function discoverVenueKnowledge({ venueName, apiKey = process.env.TAVILY_API_KEY, fetchFn } = {}) {
  if (!venueName || typeof venueName !== "string" || !venueName.trim()) return null;
  if (!apiKey || !apiKey.trim()) return null;

  let results;
  try {
    results = await tavilySearch({ query: `${venueName.trim()} official website Detroit venue address`, apiKey, fetchFn });
  } catch {
    return null; // fail closed -- never throw out of a discovery attempt
  }

  const verified = results.find((r) => verifyOfficialResult([venueName], r));
  if (!verified) return null;

  const host = hostnameOf(verified.url);
  if (!host) return null;
  const extracted = extractAddressFromContent(verified.content) || {};

  return {
    name: venueName.trim(),
    website: `https://${host}`,
    address: extracted.address || null,
    city: extracted.city || null,
    sourceUrl: verified.url,
  };
}

// discoverEventVenue({ eventTitle, city, contextTerms, apiKey, fetchFn }) ->
//   { venueName, city, address, website, sourceUrl } | null
//
// Added 2026-09-23 ("SMALL CORRECTION BEFORE DEPLOYMENT -- do not broaden
// scope"). Same bounded-search/verification machinery as
// discoverVenueKnowledge above (tavilySearch + verifyOfficialResult) -- NOT
// a second search system -- composing a query from what an article-derived
// event identity actually has (title + city + one context entity such as an
// organizer/performer) instead of a venue name, for the specific case where
// an article covers a real event confidently enough (title/date/category
// all present) but never names its own venue. Returns null immediately with
// no network call when unconfigured (no apiKey), same fail-closed default
// as every other function in this file. A verified result that yields
// neither a venue phrase nor a street address is treated as unusable and
// also returns null -- this function never returns a "maybe," only a
// confidently-extracted venue or nothing.
async function discoverEventVenue({ eventTitle, city, contextTerms = [], apiKey = process.env.TAVILY_API_KEY, fetchFn } = {}) {
  if (!eventTitle || typeof eventTitle !== "string" || !eventTitle.trim()) return null;
  if (!apiKey || !apiKey.trim()) return null;

  const queryParts = [eventTitle.trim()];
  if (city) queryParts.push(city.trim());
  if (Array.isArray(contextTerms) && contextTerms.length && contextTerms[0]) queryParts.push(contextTerms[0]);
  queryParts.push("venue location");
  const query = queryParts.join(" ");

  let results;
  try {
    results = await tavilySearch({ query, apiKey, fetchFn });
  } catch {
    return null; // fail closed -- never throw out of a discovery attempt
  }

  const subjectTerms = [eventTitle, city].filter(Boolean);
  const verified = results.find((r) => verifyOfficialResult(subjectTerms, r));
  if (!verified) return null;

  const host = hostnameOf(verified.url);
  if (!host) return null;

  const venuePhrase = extractVenuePhraseFromText(verified.content || "");
  const addressExtracted = extractAddressFromContent(verified.content) || {};
  if (!venuePhrase && !addressExtracted.address) return null; // nothing confidently extracted -- never guess

  return {
    venueName: venuePhrase ? venuePhrase.name : null,
    city: (venuePhrase && venuePhrase.city) || addressExtracted.city || city || null,
    address: addressExtracted.address || null,
    website: `https://${host}`,
    sourceUrl: verified.url,
  };
}

// --- Event-specific identity verification -- 2026-10-01, RA candidate-
// recovery V1 hardening (production dry-run exposed unsafe description-
// source acceptance; see RA_CANDIDATE_RECOVERY_PROPOSAL / Product Owner
// decision set, same date). verifyOfficialResult above answers "is this
// domain not a known aggregator, and does SOME subject term (title OR
// venue name) appear somewhere" -- that bar is correct for establishing
// VENUE knowledge (discoverVenueKnowledge/discoverEventVenue below, both
// unchanged), but is not nearly enough to accept a page as evidence of
// an EVENT-SPECIFIC fact like a description. A venue's own generic
// homepage, a different calendar instance of the same recurring series,
// or a third-party aggregator that happens to repeat the venue's name
// all passed that bar in production and should not have ("Search result
// relevance is not authority" -- Product Owner, 2026-10-01). The two
// checks below are what discoverAuthoritativeDescription actually needs:
// the event's own TITLE must be substantially present (not the venue
// name alone), and any date mentioned anywhere in the result must agree
// with the event's own date. Scope is deliberately narrow: only
// discoverAuthoritativeDescription uses these; venue-identity discovery
// is unaffected ("generic venue homepages/calendar pages may establish
// venue knowledge but cannot establish event-specific description facts
// unless the exact event is independently identified on the page").

// Same splitting rule as scripts/ra-sync.js's tokenizeTitleForIdentity
// (Unicode-aware \p{L}/\p{N}, possessive-apostrophe stripped) --
// duplicated here rather than cross-required from scripts/, matching
// this file's existing one-file-per-concern convention (see
// VENUE_REJECT_EVENT_NOUN_RE's own comment above for the same choice
// made once already). Left as a pure "what are the words" primitive,
// same posture as normalizeForMatch -- short-token filtering happens at
// the point of use, not here.
function tokenizeForEvidence(text) {
  if (typeof text !== "string") return [];
  const noPossessive = text.toLowerCase().replace(/['’]/g, "");
  return noPossessive.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
}

// How much of the event title's own meaningful vocabulary must appear
// somewhere in a candidate result before the title counts as identified.
// Deliberately a DIFFERENT constant from scripts/ra-sync.js's
// TITLE_IDENTITY_MATCH_RATIO (0.8) -- that one is a SYMMETRIC title-vs-
// title comparison (two short strings); this is one-directional ("is the
// title's own evidence present in a much longer document"), a different
// enough shape of comparison that sharing the constant would be
// coincidence, not real consistency. 0.7 tolerates a page that
// paraphrases or pluralizes a word or two while still scoring 0 for a
// page that shares nothing but the venue's name -- exactly the real
// Family Affair / NO SKIPS / E L I X I R production failures below.
const TITLE_EVIDENCE_COVERAGE_RATIO = 0.7;
const MIN_EVIDENCE_TOKEN_LENGTH = 3; // same "too weak to mean anything" floor as verifyOfficialResult's subjectTerms filter

function titleEvidenceCoverage(title, haystack) {
  const significant = new Set(tokenizeForEvidence(title).filter((t) => t.length >= MIN_EVIDENCE_TOKEN_LENGTH));
  if (significant.size === 0) return 0;
  const haystackTokens = new Set(tokenizeForEvidence(haystack));
  let present = 0;
  for (const t of significant) {
    if (haystackTokens.has(t)) present++;
  }
  return present / significant.size;
}

// Date-mention extraction -- never invents a date; a "mention" is only
// ever something literally spelled out as "<day> <month>" / "<month>
// <day>" (optionally with a year), in prose OR in a URL path/slug. Both
// are checked: a URL date slug is exactly what exposed the Groove Night /
// Realms of Techno wrong-instance matches in production (the recovered
// page's own URL named a different date than its prose did).
const MONTH_NUMBER = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_PATTERN = Object.keys(MONTH_NUMBER).join("|");
// The negative lookahead after the day digits rejects a clock hour
// immediately followed by am/pm ("August 10pm") from being misread as a
// day-of-month -- a real false match this file's own regression fixtures
// caught ("Thursday, 6 August 10pm - 2am" must extract only day=6, never
// a second, spurious day=10 from the trailing time).
// (?!\d) immediately after each day-digit group stops \d{1,2} from
// greedily backtracking to match just the first digit of a longer
// number (e.g. "1" out of "10pm") once the am/pm lookahead rejects the
// full two-digit match.
const MONTH_DAY_RE = new RegExp(`\\b(${MONTH_PATTERN})\\b[\\s.,-]+(\\d{1,2})(?!\\d)(?!\\s*[ap]m\\b)(?:st|nd|rd|th)?(?:[\\s,-]+(\\d{4}))?`, "gi");
const DAY_MONTH_RE = new RegExp(`\\b(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?[\\s.,-]+(${MONTH_PATTERN})\\b(?:[\\s,-]+(\\d{4}))?`, "gi");

function extractDateMentions(text) {
  if (typeof text !== "string" || !text) return [];
  const mentions = [];
  let m;
  MONTH_DAY_RE.lastIndex = 0;
  while ((m = MONTH_DAY_RE.exec(text))) {
    mentions.push({ month: MONTH_NUMBER[m[1].toLowerCase()], day: Number(m[2]), year: m[3] ? Number(m[3]) : null });
  }
  DAY_MONTH_RE.lastIndex = 0;
  while ((m = DAY_MONTH_RE.exec(text))) {
    mentions.push({ month: MONTH_NUMBER[m[2].toLowerCase()], day: Number(m[1]), year: m[3] ? Number(m[3]) : null });
  }
  return mentions.filter((d) => d.day >= 1 && d.day <= 31);
}

function parseIsoDateParts(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function dateOrdinal(month, day) {
  return month * 100 + day;
}

// A mention is compatible when its year (if stated) doesn't contradict
// the event's own, and its month/day falls within the event's
// start_date..end_date span (same-day events -- the normal case here --
// just compare directly).
function mentionWithinRange(mention, start, end) {
  if (mention.year != null && mention.year !== start.year && mention.year !== end.year) return false;
  const lo = Math.min(dateOrdinal(start.month, start.day), dateOrdinal(end.month, end.day));
  const hi = Math.max(dateOrdinal(start.month, start.day), dateOrdinal(end.month, end.day));
  const o = dateOrdinal(mention.month, mention.day);
  return o >= lo && o <= hi;
}

// eventDateCompatible(event, haystack) -> boolean
// Conservative by design, matching this module's "never invent, only
// disqualify" posture elsewhere: an event with NO extractable date
// mention anywhere in the result is treated as compatible (a page can
// legitimately describe an event without restating its calendar date --
// absence of a date is not evidence of a wrong date). But EVERY mention
// that IS found -- in the prose, in the URL, wherever -- must agree with
// the event's own date; a single disagreeing mention is enough to reject
// the whole result. This is what catches both the wrong-calendar-
// instance failures (Realms of Techno, Groove Night) and the internally-
// inconsistent one (Marble Bar 11 Year Anniversary: its URL says Oct 3,
// its own recovered prose says Oct 4 -- the event's real date is Oct 3,
// so the prose mention alone is enough to reject it).
function eventDateCompatible(event, haystack) {
  if (!event || typeof event.start_date !== "string") return true;
  const start = parseIsoDateParts(event.start_date);
  if (!start) return true;
  const end = typeof event.end_date === "string" ? (parseIsoDateParts(event.end_date) || start) : start;
  const mentions = extractDateMentions(haystack);
  if (mentions.length === 0) return true;
  return mentions.every((m) => mentionWithinRange(m, start, end));
}

// verifyEventSpecificResult(event, result) -> boolean
// The actual gate discoverAuthoritativeDescription uses in place of
// verifyOfficialResult's "any one subject term" check. A known non-
// official domain is still always rejected. Beyond that: the event's own
// TITLE must be substantially present (titleEvidenceCoverage, above) --
// a result whose only evidence is the venue's name no longer qualifies
// -- and any date mentioned anywhere in the result must agree with the
// event's own date. Venue/organizer name is supporting evidence only
// (folded into the search query that produced these results in the first
// place), never sufficient alone to accept an event-specific fact.
function verifyEventSpecificResult(event, result) {
  if (!result || typeof result.url !== "string") return false;
  const host = hostnameOf(result.url);
  if (!host || NON_OFFICIAL_DOMAINS.has(host)) return false;
  const haystack = `${result.title || ""} ${result.content || ""} ${result.url || ""}`;
  if (titleEvidenceCoverage(event && event.title, haystack) < TITLE_EVIDENCE_COVERAGE_RATIO) return false;
  if (!eventDateCompatible(event, haystack)) return false;
  return true;
}

// discoverAuthoritativeDescription({ event, apiKey, fetchFn }) ->
//   { text, sourceUrl } | null
//
// ONE bounded search for an authoritative event/venue/organizer page
// describing THIS specific event. Verified by verifyEventSpecificResult
// above -- official domain + the event's own title substantially present
// + no date disagreement -- never venue-name-alone, as of 2026-10-01. The
// recovered text is capped and trimmed to a full-sentence boundary --
// never embellished or "improved" here. This is Level 1 in the two-level
// description hierarchy; Level 2 (buildFactualDescription,
// api/_lib/description-enrichment.js) is the fallback when this returns
// null -- which now happens more often, by design, than before this fix.
const MAX_DESCRIPTION_CHARS = 400;

function trimToSentenceBoundary(text) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= MAX_DESCRIPTION_CHARS) return trimmed;
  const cut = trimmed.slice(0, MAX_DESCRIPTION_CHARS);
  const lastPeriod = cut.lastIndexOf(". ");
  return lastPeriod > 40 ? cut.slice(0, lastPeriod + 1) : cut.trim() + "…";
}

async function discoverAuthoritativeDescription({ event, apiKey = process.env.TAVILY_API_KEY, fetchFn } = {}) {
  if (!event || typeof event.title !== "string" || !event.title.trim()) return null;
  if (!apiKey || !apiKey.trim()) return null;

  const venueName = (event.venues && event.venues.name) || event.venue_name_raw || "";
  const query = `${event.title.trim()}${venueName ? " " + venueName.trim() : ""} event details`;

  let results;
  try {
    results = await tavilySearch({ query, apiKey, fetchFn });
  } catch {
    return null;
  }

  const verified = results.find(
    (r) => verifyEventSpecificResult(event, r) && typeof r.content === "string" && r.content.trim().length >= 20
  );
  if (!verified) return null;

  return { text: trimToSentenceBoundary(verified.content), sourceUrl: verified.url };
}

module.exports = {
  isExternalDiscoveryConfigured,
  hostnameOf,
  verifyOfficialResult,
  extractAddressFromContent,
  extractVenuePhraseFromText,
  discoverVenueKnowledge,
  discoverEventVenue,
  discoverAuthoritativeDescription,
  // Event-specific identity verification (2026-10-01 hardening) --
  // exported for direct unit testing, same convention as the other
  // internal building blocks above.
  titleEvidenceCoverage,
  extractDateMentions,
  eventDateCompatible,
  verifyEventSpecificResult,
  NON_OFFICIAL_DOMAINS,
};
