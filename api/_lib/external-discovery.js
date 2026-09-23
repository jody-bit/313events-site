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
const AT_VENUE_RE = /\bat\s+([A-Z][A-Za-z0-9&''.-]*(?:\s+[A-Z][A-Za-z0-9&''.-]*){0,4})(?:\s+in\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?))?(?=[.,]|\s+(?:on|this|next|during|starting|opens|opening|for|from)\b)/;
const RETURNS_TO_VENUE_RE = /\breturns?\s+to\s+the\s+([A-Z][A-Za-z0-9&''.-]*(?:\s+[A-Z][A-Za-z0-9&''.-]*){0,4})\b/;

// Words that are never a venue name even when they're capitalized and
// happen to follow "at"/"the" -- common false-positive traps.
const VENUE_STOPWORDS = new Set([
  "the door", "the event", "the show", "the market", "the festival", "the preview",
]);

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
  if (atMatch && !VENUE_STOPWORDS.has(atMatch[1].toLowerCase())) {
    return { name: atMatch[1].trim(), city: atMatch[2] ? atMatch[2].trim() : null };
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

// discoverAuthoritativeDescription({ event, apiKey, fetchFn }) ->
//   { text, sourceUrl } | null
//
// ONE bounded search for an authoritative event/venue/organizer page
// describing THIS specific event. Verified the same way (official domain +
// event-title/venue-name match). The recovered text is capped and trimmed
// to a full-sentence boundary -- never embellished or "improved" here.
// This is Level 1 in the two-level description hierarchy; Level 2
// (buildFactualDescription, api/_lib/description-enrichment.js) is the
// fallback when this returns null.
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
  const subjectTerms = [event.title, venueName].filter(Boolean);
  const query = `${event.title.trim()}${venueName ? " " + venueName.trim() : ""} event details`;

  let results;
  try {
    results = await tavilySearch({ query, apiKey, fetchFn });
  } catch {
    return null;
  }

  const verified = results.find(
    (r) => verifyOfficialResult(subjectTerms, r) && typeof r.content === "string" && r.content.trim().length >= 20
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
  NON_OFFICIAL_DOMAINS,
};
