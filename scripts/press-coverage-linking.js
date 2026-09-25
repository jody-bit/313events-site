// scripts/press-coverage-linking.js
//
// "AUTOMATE ADMIN -> PRESS COVERAGE" (2026-09-23). Goal: eliminate manual
// work from the Press Coverage queue (admin.html's "editorial" tab).
// cron-editorial.js already does a fast FIRST pass at ingest time
// (matchArticleToEvent(): exact title/venue substring against the
// article's own 280-char excerpt, a narrow day window, approved events
// only) and a wider retroactive RE-match pass (retryUnmatchedArticles()).
// Both are UNCHANGED by this file. What's left in the queue after both of
// those have had their shot is exactly the harder residual case this file
// exists for: an article whose HEADLINE doesn't name the event (Jody's own
// example: "The Cure co-founder Lol Tolhurst talks recovery, goth and
// Detroit" is actually about the "Recovery & Resilience Festival"), where
// the real identity only shows up in the article's own body text, past the
// short excerpt cron-editorial.js stores.
//
// PIPELINE, per still-unmatched/undismissed article:
//   1. Fetch the article's own live page (transient — see COPYRIGHT note
//      below; never persisted).
//   2. Deep-match against ALL current candidate events (not just a narrow
//      window/approved-only), searching the FULL body text, not just the
//      excerpt — same conservative title/venue+date rules as
//      cron-editorial.js's matchArticleToEvent(), just given more text and
//      a wider candidate set to work with. A match here never touches the
//      events table at all — only editorial_articles/
//      editorial_article_events, exactly like api/admin-editorial.js's
//      existing link_event action.
//   3. If nothing matches, extract a conservative event identity (title,
//      venue name, city, date(s), category) directly from the article's own
//      text — never inferred, never guessed; every field must be textually
//      present. Articles that share a normalized title + start date are
//      POOLED into one group and decided together (added 2026-09-23,
//      "SMALL CORRECTION BEFORE DEPLOYMENT" — item 3: two articles that
//      each independently lack a confident venue can still, together,
//      supply enough to create one event; deciding them one at a time was
//      failing both).
//   3a. Location requirement (relaxed 2026-09-23, item 1/2 of the same
//      correction): a confident venue name is preferred, but no longer an
//      absolute requirement on its own. When title/date/category are all
//      confident and no venue is present, ONE bounded external-discovery
//      attempt (api/_lib/external-discovery.js's discoverEventVenue — the
//      SAME search/verification machinery built for generic enrichment,
//      not a second search system) tries to resolve the venue from
//      title+city+organizer context before giving up. Separately, a group
//      with a confident CITY and an explicit distributed-event signal
//      (isDistributedEvent — "self-guided tour of seven kitchens," etc.) is
//      valid with city-only, never a fabricated single venue.
//   3b. If sufficient, create the event (reusing api/_lib/venue-lookup.js's
//      resolveVenueId exactly as admin-editorial.js's create_event does —
//      never invents/fuzzy-matches a venue) and link EVERY article in the
//      group to it — "cross-article duplicates prevented" in the summary
//      below.
//   4. Anything still unresolved stays in the queue for a human, with
//      concise reason code(s) (NO_TITLE_SIGNAL / NO_DATE_SIGNAL /
//      NO_CATEGORY_SIGNAL / NO_VENUE_OR_CITY_SIGNAL / NO_CONFIDENT_VENUE /
//      EXTERNAL_RESOLUTION_UNAVAILABLE / FETCH_FAILED) — never a guess.
//   5. Reuse the EXISTING generic enrichment pipeline
//      (scripts/generic-metadata-enrichment.js, unmodified) once at the
//      end to fill in whatever's still missing (description, venue
//      address/city, ticket/event link) on any event this file created —
//      not a second enrichment system, the same one already shipped.
//
// COPYRIGHT / STORAGE CONSTRAINT (unchanged from migration_011): the
// article's own body text is fetched HERE, in memory, purely to extract
// structured facts (a title, a venue name, a date, a category) — it is
// NEVER written to any table. Only the same kind of short, factual,
// derived data every other part of this project already stores (event
// title/venue/date/category, and — when the article's own sentence
// containing those facts is short and factual enough — a brief
// article-derived description, description_source='authoritative', same
// precedence semantics migration_038 already defined) ever reaches the
// database.
//
// SAFETY (same rules as every other repair/enrichment script in this
// project — see api/_lib/venue-lookup.js and scripts/generic-metadata-
// enrichment.js's own headers): never invents a date/time/venue/price/
// link; a field is only ever used when it is textually, confidently
// present in the article; venue resolution never fuzzy-matches (exact
// name match via the existing resolveVenueId, nothing more); no time is
// ever extracted or written by this file, full stop — an event this file
// creates always leaves time_display/is_all_day at their honest "unknown"
// defaults, the same "unknown beats a guess" gap this project surfaces
// everywhere else (admin.html's own NO_AUTHORITATIVE_TIME reason code).
// Every DB write here re-asserts the field it's writing is still blank
// (matched_event_id is.null on the link PATCH — identical to
// api/admin-editorial.js's own link_event/create_event guards), so a rerun
// can never duplicate a link or an event.
//
// Usage:
//   node scripts/press-coverage-linking.js            (writes)
//   node scripts/press-coverage-linking.js --dry-run   (reports only)
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.

const path = require("path");
const { buildVenueNameToIdMap, resolveVenueId, normalizeVenueName, upsertVenueKnowledge } = require(path.join(__dirname, "..", "api", "_lib", "venue-lookup"));
const {
  extractVenuePhraseFromText,
  discoverEventVenue,
  isExternalDiscoveryConfigured,
} = require(path.join(__dirname, "..", "api", "_lib", "external-discovery"));

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// How much of a fetched article page to keep in memory for extraction.
// Generous enough for a full news article's body; not unbounded.
const MAX_ARTICLE_CHARS = 20000;
const MAX_DESCRIPTION_CHARS = 400;

// Same "too generic to trust as a substring match" floor as
// cron-editorial.js's own MIN_MATCHABLE_LENGTH.
const MIN_MATCHABLE_LENGTH = 6;
const VENUE_MATCH_MAX_DAY_GAP = 21;

// ---------------------------------------------------------------------------
// Text helpers — duplicated from cron-editorial.js rather than imported,
// matching this project's own stated one-file-per-endpoint convention
// ("kept in sync deliberately rather than shared via an import" — see that
// file's own decodeEntities comment).

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(str) {
  if (!str) return "";
  // Drop script/style blocks entirely (their content is never real article
  // text) before the generic tag strip.
  const noScripts = str.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return decodeEntities(noScripts.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

function normalize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// "Recovery and Resilience Festival" vs "Recovery & Resilience Festival" —
// the same event, spelled two ways across two real articles. normalize()
// alone treats "and"/"&" as different tokens; this collapses both to the
// same word before normalizing so a title match isn't defeated by that one
// spelling difference. Deliberately narrow (this exact substitution only) —
// not a general fuzzy-matching step.
function normalizeAmpersand(str) {
  return normalize((str || "").replace(/&/g, " and "));
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T12:00:00");
  const b = new Date(isoB + "T12:00:00");
  return Math.abs(Math.round((a - b) / 86400000));
}

// 2026-09-25 ("RESOLVE EMBEDDED FUTURE EVENTS"): every article page on at
// least one of this project's real outlets (C&G Newspapers) appends a
// trailing "You May Also Be Interested In..." teaser block linking to
// OTHER, unrelated articles -- including THEIR OWN dates and venue-shaped
// "at <Place>" phrases (a real example, captured live while tracing this
// fix: "...the 5K will return to Twelve Mile Crossing at Fountain Walk on
// Oct...."). stripHtml()'s own whitespace-flattening makes that block
// textually indistinguishable from the real article body to every
// extractor below (title/venue/date/category/address alike), so it has to
// be cut BEFORE any extraction ever sees it -- not worked around case by
// case. Deliberately narrow: only a known boilerplate heading trims the
// text, and only the text AFTER that heading is discarded -- never a guess
// at where the real article "seems" to end.
const TRAILING_BOILERPLATE_RE = /\b(You May Also Be Interested In|Related Articles|More From This Section|Read Next|You Might Also Like)\b/i;

function trimTrailingBoilerplate(text) {
  if (!text) return text;
  const m = text.match(TRAILING_BOILERPLATE_RE);
  if (!m) return text;
  return text.slice(0, m.index).trim();
}

async function fetchArticleText(url, fetchFn) {
  try {
    const doFetch = fetchFn || fetch;
    const resp = await doFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
    if (!resp.ok) return null;
    const html = await resp.text();
    return trimTrailingBoilerplate(stripHtml(html)).slice(0, MAX_ARTICLE_CHARS);
  } catch {
    return null; // fail closed — never throws; caller treats this as "no body text available"
  }
}

// ---------------------------------------------------------------------------
// Deep matching — the same conservative rules as cron-editorial.js's own
// matchArticleToEvent(), applied to the FULL article body (title + excerpt
// + fetched page text) instead of just the excerpt, against whatever
// candidate events the caller passes in (this run's full, current set —
// including anything this same run has already created, which is exactly
// what makes cross-article same-event dedup work).

function deepMatchArticleToEvent(searchText, articleDateIso, candidateEvents) {
  const haystack = normalizeAmpersand(searchText);
  let best = null;
  for (const ev of candidateEvents) {
    const normTitle = normalizeAmpersand(ev.title);
    if (normTitle.length >= MIN_MATCHABLE_LENGTH && haystack.includes(normTitle)) {
      const dayGap = ev.start_date ? daysBetween(articleDateIso, ev.start_date) : 0;
      if (!best || best.matchType !== "title" || dayGap < best.dayGap) {
        best = { event: ev, matchType: "title", dayGap };
      }
      continue;
    }
    if (best && best.matchType === "title") continue;
    const normVenue = normalize(ev.venue_name_raw);
    if (normVenue.length >= MIN_MATCHABLE_LENGTH && haystack.includes(normVenue) && ev.start_date) {
      const dayGap = daysBetween(articleDateIso, ev.start_date);
      if (dayGap <= VENUE_MATCH_MAX_DAY_GAP && (!best || dayGap < best.dayGap)) {
        best = { event: ev, matchType: "venue_date", dayGap };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Entity extraction for CREATING a new event. Every function here returns
// null the instant it isn't confident — no fallback guess, matching this
// project's "no match/no value beats a wrong one" posture used everywhere
// else (venue-lookup.js's exact-match-only tiers, cron-editorial.js's own
// matcher, description-enrichment.js's never-invent list).

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_NAMES_RE = "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\\.?";
const DATE_RE = new RegExp(`\\b${MONTH_NAMES_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi");

// How many days a bare "<Month> <Day>" (no year stated) is allowed to fall
// BEHIND the article's own publish date before extractDates() concludes it
// must mean next year rather than this year. 2026-09-25 ("FIX PAST-EVENT
// RECAP CLUTTER"): this was 5 days, tuned for "a festival covered the day
// it starts, or a recap published a day or two after" — too narrow for how
// this project's actual outlets behave. Two real C&G Newspapers recaps
// ("Lathrup Village Music Festival," Sept. 12 event published Sept. 24;
// "Senior Expo," Sept. 15 event published Sept. 24) run their recaps 9-12
// days after the event — well past the old 5-day window — which silently
// rolled BOTH into next year (e.g. "2027-09-12") instead of correctly
// landing on the real, already-past 2026 date. A wrongly-future-dated recap
// is worse than merely unhelpful: nothing downstream can ever recognize it
// as coverage of something already over (see the past-event dismissal in
// linkPressCoverageQueue below), so it would sit in the queue forever, or
// -- worse -- get created as a bogus future event if every other field
// happened to extract cleanly. 30 days comfortably covers this project's
// observed local-news recap lag while still treating a "Month Day" that's
// merely a FEW days ahead of publish (an ordinary preview) as this year,
// same as before.
const RECAP_TRAILING_SLACK_DAYS = 30;

// Finds every explicit "<Month> <Day>[, <Year>]" occurrence in the text and
// resolves each to a real ISO date. No year stated -> the nearest date
// on/after the article's own publish date (rolling into next year only
// when the month/day has already passed relative to publish date, by more
// than RECAP_TRAILING_SLACK_DAYS) — the same inference any reader makes of
// a news article that says "opening on Sept. 19" without restating the
// year, never a value pulled from thin air. Returns dates sorted ascending,
// deduped.
// resolveDateMatch(m, publishedYear, publishedDate) -> iso string | null
//
// Pure year-inference + validity logic factored out of extractDates()
// 2026-09-25 ("RESOLVE EMBEDDED FUTURE EVENTS") so extractEventDates()
// below can reuse the EXACT same "no year stated -> nearest date on/after
// publish, unless already RECAP_TRAILING_SLACK_DAYS behind" rule while
// layering its own separate window/cue filtering on TOP -- never a second,
// slightly-different copy of this logic. A pure refactor: extractDates()'s
// own behavior/tests are unchanged by this.
function resolveDateMatch(m, publishedYear, publishedDate) {
  const month = MONTHS[m[1].toLowerCase().replace(/\.$/, "")];
  const day = parseInt(m[2], 10);
  if (!month || !day || day < 1 || day > 31) return null;
  let year = m[3] ? parseInt(m[3], 10) : publishedYear;
  if (!m[3]) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    const publishedFloor = new Date(Date.UTC(publishedYear, publishedDate.getUTCMonth(), publishedDate.getUTCDate()));
    const slackFloor = new Date(publishedFloor.getTime() - RECAP_TRAILING_SLACK_DAYS * 86400000);
    if (candidate < slackFloor) year += 1;
  }
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const check = new Date(iso + "T00:00:00Z");
  if (check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null; // rejects e.g. Feb 30
  return iso;
}

function extractDates(text, publishedAtIso) {
  if (!text) return [];
  const publishedDate = publishedAtIso ? new Date(publishedAtIso) : new Date();
  const publishedYear = publishedDate.getUTCFullYear();
  const found = new Set();
  let m;
  DATE_RE.lastIndex = 0;
  while ((m = DATE_RE.exec(text))) {
    const iso = resolveDateMatch(m, publishedYear, publishedDate);
    if (iso) found.add(iso);
  }
  return Array.from(found).sort();
}

// How far forward (characters) from the extracted title's first mention in
// the body to keep searching for THIS event's own date -- long enough to
// cover a real article's lead paragraph and its own deadline/detail
// sentence, short enough to exclude an unrelated OTHER event's date
// mentioned later in the same article (a real example: C&G's "Photos
// sought..." article mentions the Tiny Art Show, a completely different,
// already-running exhibit, well over a thousand characters after "Backyard
// and Beyond" is first introduced). Chosen empirically against that real
// article -- both Oct. 10 deadline mentions AND the real Nov. 9 event date
// sit well inside this window; the unrelated Tiny Art Show date does not.
const DATE_SEARCH_WINDOW_CHARS = 800;

// Cue words/phrases immediately preceding a date that describe the event
// itself actually HAPPENING -- vs. NON_EVENT_DATE_CUE_RE below, which
// describes some OTHER date tied to the same event (most often a
// submission/registration deadline) that must never be mistaken for when
// the event itself occurs. Both lists are deliberately closed and narrow --
// same "never guess" posture as every other extractor in this file.
const EVENT_OCCURRENCE_CUE_RE = /\b(?:opens?|open(?:ing)?|starts?|starting|begins?|beginning|goes? live|kicks? off|runs? (?:from|through)|unfolds?|held|takes? place|scheduled for)\b/i;
const NON_EVENT_DATE_CUE_RE = /\b(?:deadline|due by|due date|submissions? (?:close|closes|closing|due)|register(?:ation)? by|rsvp by|apply by|applications? (?:close|closes|closing|due))\b/i;

// nearestCueIndexBefore(text, re, fromIdx) -> the START index of the
// CLOSEST match of re that occurs strictly before fromIdx, scanning the
// WHOLE preceding text -- not just the same sentence/clause. A real
// example has the deadline cue and the event-occurrence cue in the SAME
// sentence, separated only by a comma ("The exhibit goes live on Monday,
// Nov. 9, ... but the deadline for submissions is Saturday, Oct. 10."), so
// a clause- or sentence-boundary approach would either merge both dates
// together or wrongly split mid-clause. Returns -1 when no match exists
// before fromIdx.
function nearestCueIndexBefore(text, re, fromIdx) {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const g = new RegExp(re.source, flags);
  let best = -1;
  let m;
  while ((m = g.exec(text))) {
    if (m.index >= fromIdx) break;
    best = m.index;
    if (g.lastIndex === m.index) g.lastIndex++; // guard against zero-width matches
  }
  return best;
}

// extractEventDates(bodyText, publishedAtIso, titlePhrase) -> string[] (ISO, sorted)
//
// 2026-09-25 ("RESOLVE EMBEDDED FUTURE EVENTS" -- Jody: "Fix the generic
// extraction logic so articles whose primary framing is a submission call,
// registration notice, announcement, preview, road closure, volunteer
// call, or similar can still identify... a clearly described future event
// embedded in the article body"): extractDates() alone just returns EVERY
// date anywhere in the article, in order -- fine for an article that's
// ABOUT the event, but not for one primarily framed as a call to action
// (submit photos by X, register by Y) where the event's own date is just
// one date among several, possibly including a completely unrelated OTHER
// event's date. This narrows (never widens) extractDates()'s own result
// using two independent, additive signals -- a match failing EITHER one is
// dropped:
//   1. Proximity: only a date within DATE_SEARCH_WINDOW_CHARS of the
//      extracted title's own first mention in the body -- the same
//      "textually tied to the event, not just present somewhere in the
//      article" posture every other extractor here already uses.
//   2. Cue words: a date immediately preceded by a NON_EVENT_DATE_CUE_RE
//      cue (a submission/registration deadline) CLOSER than any
//      EVENT_OCCURRENCE_CUE_RE cue is excluded -- it describes a different
//      date than the event's own. A date with no cue of either kind
//      nearby, or whose nearest cue is an EVENT_OCCURRENCE_CUE_RE one, is
//      kept (same "default to including, only exclude on a confident
//      signal" posture as the rest of this file -- most real event dates
//      have no cue word at all, e.g. a plain "the festival returns Sept.
//      12").
// Falls back to extractDates()'s own full, unfiltered result whenever
// there's no title, or the title never actually appears in the body text
// (both cases where a window can't be anchored at all) -- this never makes
// extraction MORE permissive than extractDates() already is, only ever
// narrower. Never infers a missing end date, time, or price -- purely a
// disambiguation of dates the article itself already, textually, states.
function extractEventDates(bodyText, publishedAtIso, titlePhrase) {
  const text = bodyText || "";
  const allDates = extractDates(text, publishedAtIso);
  if (!titlePhrase) return allDates;
  const titleIdx = text.indexOf(titlePhrase);
  if (titleIdx === -1) return allDates;

  const publishedDate = publishedAtIso ? new Date(publishedAtIso) : new Date();
  const publishedYear = publishedDate.getUTCFullYear();
  const windowEnd = titleIdx + titlePhrase.length + DATE_SEARCH_WINDOW_CHARS;

  const found = new Set();
  let m;
  DATE_RE.lastIndex = 0;
  while ((m = DATE_RE.exec(text))) {
    if (m.index >= windowEnd) continue;
    const eventCueIdx = nearestCueIndexBefore(text, EVENT_OCCURRENCE_CUE_RE, m.index);
    const nonEventCueIdx = nearestCueIndexBefore(text, NON_EVENT_DATE_CUE_RE, m.index);
    if (nonEventCueIdx > eventCueIdx) continue; // a closer non-event (deadline-type) cue -> a different date, exclude
    const iso = resolveDateMatch(m, publishedYear, publishedDate);
    if (iso) found.add(iso);
  }
  return Array.from(found).sort();
}

// Recognized event-type nouns an extracted title phrase must end with —
// deliberately the same spirit as cron-editorial.js's own EVENT_SIGNAL_RE,
// reused here to anchor TITLE extraction rather than just a yes/no filter.
const EVENT_NOUN_RE = "(Festival|Fest|Market|Fair|Expo|Gala|Crawl|Showcase|Parade|Exhibition|Exhibit)";
// "the <Title Case Phrase> <Festival|Market|...>" in the body — e.g. "the
// Recovery & Resilience Festival", "the Tau Beta Fall Market".
const TITLE_PHRASE_RE = new RegExp(
  `\\b[Tt]he\\s+(?:first\\s+|\\d+(?:st|nd|rd|th)\\s+|annual\\s+|inaugural\\s+)?([A-Z][A-Za-z0-9&''.-]*(?:\\s+(?:&|and|[A-Z][A-Za-z0-9&''.-]*)){0,6}\\s+${EVENT_NOUN_RE})\\b`
);
// A quoted phrase in the headline itself — e.g. 'Heroes of the Revolution'.
const QUOTED_TITLE_RE = /["'‘’“”]([A-Z][^"'‘’“”]{3,70})["'‘’“”]/;

// 2026-09-25 ("RESOLVE EMBEDDED FUTURE EVENTS" -- Jody, overriding an
// earlier "not a fit" call on the real C&G Newspapers article "Photos
// sought for exhibit celebrating America's 250th birthday": "The article
// explicitly contains a future public event, 'Backyard and Beyond'... Fix
// the generic extraction logic so articles whose primary framing is a
// submission call, registration notice, announcement, preview, road
// closure, volunteer call, or similar can still identify... a clearly
// described future event embedded in the article body"): a formal event
// name sometimes appears nowhere in the headline at all -- not even as a
// quoted headline phrase -- only inside the body, introduced by an
// explicit naming verb ("titled/called/named/known as <quoted phrase>").
// Deliberately anchored to one of those four verbs, never a blind
// first-quote-in-body match -- a real article body routinely quotes
// unrelated speech (an organizer's own words, a spokesperson's quote), and
// a blind match would just as easily grab one of those instead of the
// event's real name.
const QUOTED_BODY_TITLE_RE = /\b(?:titled|called|named|known as)\s+["'‘’“”]([A-Z][^"'‘’“”]{2,70})["'‘’“”]/;

// Strips trailing sentence/clause punctuation a quoted-title capture can
// pick up when the article's own punctuation sits INSIDE the closing quote
// (AP style — e.g. "titled 'Backyard and Beyond.'" captures a trailing
// period that's punctuation, not part of the event's real name).
function stripTrailingPunctuation(str) {
  return (str || "").replace(/[.,;:!?]+$/, "").trim();
}

// 2026-09-25 ("FIX PAST-EVENT RECAP CLUTTER" — real example: Grosse Pointe
// News' "Get amped up with Mac Watts at outdoor concert"): a single-
// performer concert/show article often has no formal "event name" at
// all — neither a "the X Festival/Market/..." phrase nor a quoted title —
// because the performer's own name IS the event's identity, exactly how a
// calendar listing would title it ("Mac Watts," not "the Mac Watts
// Concert"). Deliberately narrow, same "never guess" posture as every
// other extractor here: only a clear "<Proper Name> will <performance
// verb>" construction counts (at most 4 capitalized words, so it can't run
// on into an unrelated sentence), and the verb list is a closed set of
// unambiguous performance terms — never a bare proper-noun mention on its
// own, which would false-positive on any person's name quoted anywhere in
// an article (a biographical aside, an organizer's name, etc.).
const PERFORMANCE_VERB_RE = "(?:take[s]? the stage|perform(?:s)?|headline[s]?|play[s]?|return[s]? to the stage)";
const PERFORMER_TITLE_RE = new RegExp(
  `\\b([A-Z][A-Za-z0-9&''.-]*(?:\\s+[A-Z][A-Za-z0-9&''.-]*){0,3})\\s+will\\s+${PERFORMANCE_VERB_RE}\\b`
);

function extractTitle(headline, bodyText) {
  const phraseMatch = (bodyText || "").match(TITLE_PHRASE_RE) || (headline || "").match(TITLE_PHRASE_RE);
  if (phraseMatch) return phraseMatch[1].replace(/\s+/g, " ").trim();
  const quoted = (headline || "").match(QUOTED_TITLE_RE);
  if (quoted) return quoted[1].trim();
  const bodyQuoted = (bodyText || "").match(QUOTED_BODY_TITLE_RE);
  if (bodyQuoted) return stripTrailingPunctuation(bodyQuoted[1].trim());
  const performer = (bodyText || "").match(PERFORMER_TITLE_RE);
  if (performer) return performer[1].replace(/\s+/g, " ").trim();
  return null;
}

// Venue-phrase extraction ("at <Venue Name>[ in <City>]" / "to the <Venue
// Name>") moved to api/_lib/external-discovery.js 2026-09-23 (SMALL
// CORRECTION BEFORE DEPLOYMENT) so the SAME regex machinery can also pull a
// venue name out of a verified external search result's content
// (discoverEventVenue) — one extractor, two callers. This just delegates.
function extractVenue(bodyText) {
  if (!bodyText) return null;
  return extractVenuePhraseFromText(bodyText);
}

// Detroit-metro place names an article might name as an event's location
// even when no single conventional venue is ever mentioned — reused from
// the cities SERVICE_AREA.md documents as in-scope, plus the common
// Detroit-area suburb names that show up in local press coverage. Sorted
// longest-first so "Grosse Pointe Park" is matched (and preferred) ahead of
// the shorter "Grosse Pointe" it contains.
const KNOWN_CITIES = [
  "Grosse Pointe Farms", "Grosse Pointe Park", "Grosse Pointe Woods", "Grosse Pointe Shores", "Grosse Pointe City", "Grosse Pointe",
  "Highland Park", "Hazel Park", "Madison Heights", "Sterling Heights", "Harper Woods", "St. Clair Shores", "Farmington Hills",
  "Dearborn Heights", "Rochester Hills", "Bloomfield Hills", "East Lansing", "Bowling Green", "Port Huron", "River Rouge",
  "Huntington Woods", "Center Line", "Garden City",
  "Detroit", "Hamtramck", "Dearborn", "Ferndale", "Royal Oak", "Berkley", "Southfield", "Birmingham", "Troy", "Warren",
  "Roseville", "Wyandotte", "Lincoln Park", "Melvindale", "Allen Park", "Southgate", "Taylor", "Wayne", "Westland",
  "Livonia", "Redford", "Novi", "Farmington", "Northville", "Plymouth", "Canton", "Ypsilanti", "Ann Arbor",
  "Pontiac", "Rochester", "Clarkston", "Milford", "Brighton", "Howell", "Monroe", "Flint", "Windsor", "Chatham", "Sarnia",
  "Toledo", "Jackson", "Owosso", "Lansing", "Adrian", "Ecorse", "Trenton", "Riverview", "Woodhaven", "Belleville", "Romulus",
  "Inkster", "Eastpointe", "Clawson", "Oak Park",
];
const KNOWN_CITIES_SORTED = [...KNOWN_CITIES].sort((a, b) => b.length - a.length);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Exact-name match against KNOWN_CITIES, requiring exactly ONE distinct
// city to appear (a longer match like "Grosse Pointe Park" absorbs its own
// shorter substring "Grosse Pointe" rather than counting as two). Two or
// more genuinely different cities named in the same article is treated as
// ambiguous — null, never a guess at which one is the event's location.
function extractCityFromKnownList(text) {
  if (!text) return null;
  const matches = [];
  for (const city of KNOWN_CITIES_SORTED) {
    if (new RegExp(`\\b${escapeRegex(city)}\\b`).test(text)) matches.push(city);
  }
  const distinct = matches.filter(
    (c) => !matches.some((other) => other !== c && other.length > c.length && other.includes(c))
  );
  const uniqueDistinct = Array.from(new Set(distinct));
  return uniqueDistinct.length === 1 ? uniqueDistinct[0] : null;
}

// extractCity(bodyText, titlePhrase) -> city string | null
//
// Added 2026-09-23 for a legitimately venueless/distributed event (item 2
// of the correction) — an event can have a confident CITY without a single
// conventional venue. Tries the phrase directly tied to the event first
// ("<title> in <City>", e.g. "The Recovery & Resilience Festival in
// Wyandotte will feature..."), falling back to the KNOWN_CITIES list only
// when that fails.
function extractCity(bodyText, titlePhrase) {
  if (bodyText && titlePhrase) {
    const m = bodyText.match(new RegExp(`${escapeRegex(titlePhrase)}\\s+in\\s+([A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+)?)\\b`));
    if (m) return m[1].trim();
  }
  return extractCityFromKnownList(bodyText || "");
}

// extractStreetAddress(text) -> { address, city } | null
//
// 2026-09-25 ("FIX PAST-EVENT RECAP CLUTTER" — same Mac Watts article as
// PERFORMER_TITLE_RE above): a real, specific numbered street address
// ("15118 Mack, Grosse Pointe Park") pins down an event's location just as
// confidently as a named venue does — often more so — even when the
// article never states a conventional venue name (an outdoor fundraiser in
// a parking lot between two businesses, one of which doesn't exist yet, is
// a real example this project has to handle, not a hypothetical). This is
// deliberately narrow and anchored, same "never guess" posture as every
// other extractor here: requires a leading street number, 1-4 capitalized
// words, then a comma and one of this project's own KNOWN_CITIES immediately
// after — the known-city anchor is what keeps this from ever mistaking an
// ordinary number in running text (a price, a phone number, a year) for an
// address; a street number with no recognized city right after it is never
// matched at all.
const STREET_ADDRESS_RE = new RegExp(
  `\\b(\\d{2,6}\\s+[A-Z][A-Za-z]*(?:\\s+[A-Z][A-Za-z]*){0,3})\\s*,\\s*(${KNOWN_CITIES_SORTED.map(escapeRegex).join("|")})\\b`
);

function extractStreetAddress(text) {
  if (!text) return null;
  const m = text.match(STREET_ADDRESS_RE);
  if (!m) return null;
  return { address: m[1].trim(), city: m[2].trim() };
}

// extractContextEntities(bodyText) -> string[]
//
// A narrow organizer/performer signal ("featuring/hosted by/presented by/
// organized by/guest speaker <Name>") used only to strengthen an external
// venue-discovery search query (see discoverEventVenue) — never a hard gate
// on its own, so a real gap here (e.g. a sentence phrased without any of
// these anchors) only weakens a search query, it never blocks anything.
const CONTEXT_ENTITY_RE = /\b(?:featuring|hosted by|presented by|organized by|guest speaker)\s+([A-Z][A-Za-z.''-]*(?:\s+[A-Z][A-Za-z.''-]*){0,3})/;

function extractContextEntities(bodyText) {
  if (!bodyText) return [];
  const m = bodyText.match(CONTEXT_ENTITY_RE);
  return m ? [m[1].trim()] : [];
}

// isDistributedEvent(text) -> boolean
//
// Added 2026-09-23 (item 2 of the correction) — a narrow, explicit textual
// signal that an event legitimately has no single venue (a self-guided
// tour of several locations, a crawl, a progressive dinner) rather than
// just being under-reported. Deliberately narrow: only a recognized phrase
// or an explicit "tour/visit N <places>" pattern counts — this is never
// inferred from the mere absence of a venue.
const DISTRIBUTED_EVENT_RE = /\b(self-guided|multiple locations|various venues|citywide|studio tour|home tour|kitchen tour|progressive dinner|scavenger hunt|pub crawl|gallery crawl)\b/i;
const NUMERIC_TOUR_RE = /\b(?:tour(?:s)?|visit)\s+(?:of\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+[a-z]+/i;

function isDistributedEvent(text) {
  if (!text) return false;
  return DISTRIBUTED_EVENT_RE.test(text) || NUMERIC_TOUR_RE.test(text);
}

// Keyword -> category, using ONLY this project's real 15-category taxonomy
// (see api/admin-editorial.js's own VALID_CATEGORIES). A confident keyword
// hit is required; no default/fallback category is ever guessed.
const CATEGORY_KEYWORDS = [
  [/\b(exhibit(?:ion)?|gallery|retrospective|photography)\b/i, "visual"],
  [/\b(festival|fest)\b/i, "fest"],
  [/\b(market|fair|expo|vendor)\b/i, "vendor"],
  [/\b(concert|concert tour|album|band|musician|\bdj\b)\b/i, "music"], // "tour" alone is too ambiguous (home tours, walking tours) -- requires "concert tour" or another unambiguous music word
  [/\b(screening|film|movie|cinema)\b/i, "film"],
  [/\b(theatre|theater|play\b)\b/i, "theatre"],
  [/\b(dance|ballet)\b/i, "dance"],
  [/\b(museum)\b/i, "museum"],
  [/\b(family|kids)\b/i, "family"],
  [/\b(food|tasting|culinary)\b/i, "food"],
  [/\b(nightlife|club\b|bingo)\b/i, "nightlife"],
  [/\b(sports?|game\b|athletic)\b/i, "sports"],
  [/\b(training|workshop|class\b|seminar)\b/i, "training"],
];

function extractCategory(headline, bodyText) {
  const text = `${headline || ""} ${bodyText || ""}`;
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return cat;
  }
  return null;
}

// The single sentence (bounded) containing the extracted title, used as a
// safe, article-derived description — "article-derived factual
// descriptions may outrank generic template descriptions." Only the
// sentence itself is ever kept (never the surrounding paragraph), capped,
// and only when it's genuinely present — never fabricated or paraphrased.
// Common abbreviations whose trailing "." must never be mistaken for a
// sentence boundary (month abbreviations above all — "opening on Sept. 19"
// is one sentence, not two). Checked against the word immediately before
// the candidate boundary.
const SENTENCE_ABBREV = new Set([
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "mr", "mrs", "ms", "dr", "st", "ave", "jr", "sr", "vs", "etc", "no", "inc", "ltd",
]);

function endsWithAbbreviation(text, periodIdx) {
  const m = text.slice(0, periodIdx).match(/([A-Za-z]+)$/);
  return !!(m && SENTENCE_ABBREV.has(m[1].toLowerCase()));
}

// Scans forward from fromIdx for the next real ". " sentence boundary,
// skipping any that immediately follow a known abbreviation.
function findSentenceEnd(text, fromIdx) {
  let searchFrom = fromIdx;
  while (true) {
    const dotIdx = text.indexOf(". ", searchFrom);
    if (dotIdx === -1) return -1;
    if (endsWithAbbreviation(text, dotIdx)) { searchFrom = dotIdx + 2; continue; }
    return dotIdx;
  }
}

function extractDescriptionSentence(bodyText, titlePhrase) {
  if (!bodyText || !titlePhrase) return null;
  const idx = bodyText.indexOf(titlePhrase);
  if (idx === -1) return null;
  const before = bodyText.lastIndexOf(". ", idx);
  const after = findSentenceEnd(bodyText, idx);
  let start;
  if (before === -1) {
    const roughStart = Math.max(0, idx - 120);
    // Round forward to the next word boundary so a fallback (no real
    // sentence-start found nearby) never begins mid-word.
    const nextSpace = bodyText.indexOf(" ", roughStart);
    start = nextSpace !== -1 && nextSpace < idx ? nextSpace + 1 : roughStart;
  } else {
    start = before + 2;
  }
  const end = after === -1 ? Math.min(bodyText.length, idx + 300) : after + 1;
  const sentence = bodyText.slice(start, end).trim();
  if (sentence.length < 20) return null;
  return sentence.length > MAX_DESCRIPTION_CHARS ? sentence.slice(0, MAX_DESCRIPTION_CHARS).trim() + "…" : sentence;
}

function extractEventIdentity(headline, bodyText, publishedAtIso) {
  const title = extractTitle(headline, bodyText);
  const venue = extractVenue(bodyText || "");
  const streetAddress = extractStreetAddress(bodyText || "");
  const category = extractCategory(headline, bodyText);
  // 2026-09-25 ("RESOLVE EMBEDDED FUTURE EVENTS"): extractEventDates(), not
  // the raw extractDates(), so an article framed primarily as a submission
  // call/registration notice/announcement can still resolve to its real
  // future event date without being confused by a nearby deadline mention
  // or an unrelated other event's own date -- see extractEventDates's own
  // header for the full rule. Narrows extractDates()'s result only; never
  // adds a date extractDates() itself wouldn't have found.
  const dates = extractEventDates(bodyText || "", publishedAtIso, title);
  const description = title ? extractDescriptionSentence(bodyText || "", title) : null;
  // Prefer the venue's own stated city, then the city anchored right next
  // to a stated street address (both confident, textually-tied-to-the-
  // event signals) before falling back to the loose whole-text
  // KNOWN_CITIES scan — that scan has no way to tell an event's own city
  // apart from an unrelated city mentioned in passing (a performer's
  // hometown, an organizer's home base), so a more specific signal always
  // wins when one exists.
  const city = (venue && venue.city) || (streetAddress && streetAddress.city) || extractCity(bodyText || "", title);
  return {
    title,
    venueName: venue ? venue.name : null,
    city,
    streetAddress: streetAddress ? streetAddress.address : null,
    category,
    startDate: dates.length ? dates[0] : null,
    endDate: dates.length > 1 ? dates[dates.length - 1] : null,
    description,
    contextTerms: extractContextEntities(bodyText || ""),
    isDistributed: isDistributedEvent(`${headline || ""} ${bodyText || ""}`),
  };
}

// isSufficientForCreate(identity) -> { sufficient, missing }
//
// Relaxed 2026-09-23 ("SMALL CORRECTION BEFORE DEPLOYMENT — do not broaden
// scope"): a conventional venue is no longer a hard requirement on its own.
// Title/date/category are still always required — this correction touches
// ONLY the venue/location requirement, nothing else. Location is satisfied
// by EITHER a confident venue name OR (a confident city AND an explicit
// distributed-event signal — see isDistributedEvent) — never a bare city
// alone, which would risk accepting an ordinary under-reported single-venue
// event just because a city happened to be named somewhere in the article.
//
// 2026-09-25: a confident CITY plus a confident STREET ADDRESS (see
// extractStreetAddress) is a third way to satisfy location — a specific
// numbered address pins down one exact place at least as precisely as a
// named venue does, so it's never treated as a lesser substitute the way a
// bare city is.
function isSufficientForCreate(identity) {
  const missing = [];
  if (!identity.title) missing.push("NO_TITLE_SIGNAL");
  if (!identity.startDate) missing.push("NO_DATE_SIGNAL");
  if (!identity.category) missing.push("NO_CATEGORY_SIGNAL");
  const hasLocation = !!identity.venueName
    || (!!identity.city && !!identity.isDistributed)
    || (!!identity.city && !!identity.streetAddress);
  if (!hasLocation) missing.push(identity.city ? "NO_CONFIDENT_VENUE" : "NO_VENUE_OR_CITY_SIGNAL");
  return { sufficient: missing.length === 0, missing };
}

// mergeIdentities(identities[]) -> merged identity
//
// Added 2026-09-23 (item 3 of the correction) — pools the extracted
// identity of every article in a same-event group (see linkPressCoverageQueue's
// grouping phase) BEFORE a create/stay-human decision is made, so two
// articles that each independently lack a confident venue but together
// supply title+date+category+city aren't each rejected on their own. Each
// scalar field takes the first non-null value across the group (article
// order = queue order = published_at ascending, so "first" means "earliest
// published"); endDate takes the latest; contextTerms/isDistributed union.
function mergeIdentities(identities) {
  const first = (field) => {
    for (const id of identities) {
      if (id[field]) return id[field];
    }
    return null;
  };
  const endDates = identities.map((id) => id.endDate).filter(Boolean).sort();
  return {
    title: first("title"),
    venueName: first("venueName"),
    city: first("city"),
    streetAddress: first("streetAddress"),
    category: first("category"),
    startDate: first("startDate"),
    endDate: endDates.length ? endDates[endDates.length - 1] : null,
    description: first("description"),
    contextTerms: Array.from(new Set(identities.flatMap((id) => id.contextTerms || []))),
    isDistributed: identities.some((id) => id.isDistributed),
  };
}

// ---------------------------------------------------------------------------
// Default Supabase I/O — same headers/patterns as every other script in
// this project.

async function fetchQueueDefault(SUPABASE_URL, sbHeaders) {
  const url = `${SUPABASE_URL}/rest/v1/editorial_articles?matched_event_id=is.null&admin_dismissed=eq.false&select=id,source,title,excerpt,url,published_at&order=published_at.asc&limit=200`;
  const resp = await fetch(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch press coverage queue: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching press coverage queue");
  return rows;
}

async function fetchCandidateEventsDefault(SUPABASE_URL, sbHeaders) {
  const floor = new Date(); floor.setDate(floor.getDate() - 30);
  const floorIso = floor.toISOString().slice(0, 10);
  const url = `${SUPABASE_URL}/rest/v1/events?status=in.(approved,pending_review)&start_date=gte.${floorIso}&select=id,title,venue_name_raw,venue_id,start_date&limit=2000`;
  const resp = await fetch(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch candidate events: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching candidate events");
  return rows;
}

// Same is.null-guarded PATCH + on_conflict join upsert as
// api/admin-editorial.js's link_event action — a rerun can never duplicate
// or clobber an existing link.
async function applyLink(SUPABASE_URL, sbHeaders, articleId, eventId, matchType) {
  const patchResp = await fetch(
    `${SUPABASE_URL}/rest/v1/editorial_articles?id=eq.${encodeURIComponent(articleId)}&matched_event_id=is.null`,
    { method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ matched_event_id: eventId, match_type: matchType }) }
  );
  if (!patchResp.ok) return false;
  await fetch(`${SUPABASE_URL}/rest/v1/editorial_article_events?on_conflict=article_id,event_id`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ article_id: articleId, event_id: eventId }),
  });
  return true;
}

// 2026-09-25 ("FIX PAST-EVENT RECAP CLUTTER") — the SAME reversible flag
// admin.html's own "Not a fit" button sets (see api/admin-editorial.js's
// dismiss action): admin_dismissed=true, never a hard delete. Used by
// linkPressCoverageQueue below to auto-dismiss recap/retrospective coverage
// of an event that's already over, the same disposition a human would give
// it by hand — just without making a human click it. Re-asserts
// admin_dismissed=false in the PATCH filter for the same "never clobber
// something already decided" reason applyLink/createEvent guard their own
// writes.
async function dismissArticle(SUPABASE_URL, sbHeaders, articleId) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/editorial_articles?id=eq.${encodeURIComponent(articleId)}&admin_dismissed=eq.false`,
    { method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ admin_dismissed: true }) }
  );
  return resp.ok;
}

// Same row shape / venue resolution as api/admin-editorial.js's
// create_event action (source distinguishes how it was made). NEVER sets
// time_display/is_all_day — see file header. venue_name_raw falls back to
// the literal "Venue TBA" placeholder this project already uses elsewhere
// (api/cron-detroitmonthofdesign.js, api/cron-planetanttheatre.js,
// api/cron-ticketmaster.js, api/event-meta.js) whenever isSufficientForCreate
// accepted this identity WITHOUT a venue name — the city+distributed path,
// or the city+streetAddress path added 2026-09-25 — rather than writing a
// blank/null display name.
async function createEvent(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders, identity, venueIdMap) {
  const row = {
    title: identity.title,
    description: identity.description || null,
    description_source: identity.description ? "authoritative" : null,
    category: identity.category,
    venue_name_raw: identity.venueName || "Venue TBA",
    venue_id: resolveVenueId(venueIdMap, identity.venueName),
    venue_city_raw: identity.city || null,
    venue_address_raw: identity.streetAddress || null,
    start_date: identity.startDate,
    end_date: identity.endDate || null,
    source: "Editorial Review (Automated)",
    status: "approved",
  };
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!resp.ok) return null;
  const [inserted] = await resp.json();
  return inserted || null;
}

// ---------------------------------------------------------------------------
// The orchestrator. Every dependency is injectable, same DI convention as
// every other repair/enrichment script in this project, so the full
// pipeline (matching, extraction, creation, cross-article dedup,
// enrichment reuse) is provable against mocked Supabase/network without a
// real request ever leaving the process.
async function linkPressCoverageQueue({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchQueue = fetchQueueDefault,
  fetchCandidateEvents = fetchCandidateEventsDefault,
  fetchArticleTextFn = fetchArticleText,
  applyLinkFn = applyLink,
  createEventFn = createEvent,
  dismissArticleFn = dismissArticle, // 2026-09-25, past-event auto-dismissal
  buildVenueIdMap = buildVenueNameToIdMap,
  discoverEventVenueFn = discoverEventVenue, // item 1 of the 2026-09-23 correction
  upsertVenueKnowledgeFn = upsertVenueKnowledge, // persists a successful external resolution
  isExternalDiscoveryConfiguredFn = isExternalDiscoveryConfigured,
  tavilyApiKey = process.env.TAVILY_API_KEY,
  repairGenericMetadataFn = null, // injected by callers that want the reuse step; see api/cron-editorial.js / api/admin-editorial.js wiring
  // 2026-09-25 ("FIX PAST-EVENT RECAP CLUTTER"): "today," injectable so
  // tests stay deterministic instead of drifting with the real calendar
  // (see test/press-coverage-linking.test.js's own nowIso usage). Real
  // callers always get the real current date.
  nowIso = new Date().toISOString().slice(0, 10),
} = {}) {
  const counts = {
    totalConsidered: 0,
    autoMatched: 0,
    autoCreated: 0,
    crossArticleDuplicatesPrevented: 0,
    stillHuman: 0,
    stillHumanDetail: [], // [{ articleId, title, url, reasons }]
    autoDismissedPast: 0,
    autoDismissedPastDetail: [], // [{ articleId, title, url, date }]
    fetchFailed: 0,
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  // PRODUCTION BUG FIX (2026-09-23): must set Content-Type explicitly, the
  // same way api/admin-editorial.js's own (working) sbHeaders always has --
  // without it, a POST/PATCH body defaults to Content-Type: text/plain and
  // PostgREST rejects EVERY write with 400 PGRST102 "Content-Type not
  // acceptable: text/plain," silently converted by this file's own
  // !resp.ok checks into CREATE_FAILED/LINK_WRITE_FAILED -- i.e. every
  // article stays human with no visible error, however sufficient its
  // extracted identity was. Confirmed against live production Supabase
  // (a real, side-effect-free 400 without this header, 204 with it).
  const sbHeaders = { "Content-Type": "application/json", apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  const queue = await fetchQueue(SUPABASE_URL, sbHeaders);
  counts.totalConsidered = queue.length;
  if (!queue.length) return counts;

  const candidateEvents = await fetchCandidateEvents(SUPABASE_URL, sbHeaders);
  const venueIdMap = await buildVenueIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Phase A — deep-match every article against real, already-existing DB
  // candidate events, exactly as before this correction. Whatever doesn't
  // match carries its extracted identity forward to phase B instead of
  // being decided article-by-article right here — that's what lets two
  // articles about the same not-yet-created event pool their evidence
  // BEFORE the venue requirement can fail them independently (item 3).
  const unresolved = [];
  for (const article of queue) {
    const articleDateIso = (article.published_at || new Date().toISOString()).slice(0, 10);
    const bodyText = await fetchArticleTextFn(article.url);
    if (bodyText === null) counts.fetchFailed++;
    const searchText = `${article.title || ""} ${article.excerpt || ""} ${bodyText || ""}`;

    const match = deepMatchArticleToEvent(searchText, articleDateIso, candidateEvents);
    if (match) {
      if (!dryRun) {
        const applied = await applyLinkFn(SUPABASE_URL, sbHeaders, article.id, match.event.id, match.matchType);
        if (!applied) {
          counts.stillHuman++;
          counts.stillHumanDetail.push({ articleId: article.id, title: article.title, url: article.url, reasons: ["LINK_WRITE_FAILED"] });
          continue;
        }
      }
      counts.autoMatched++;
      continue;
    }

    const identity = extractEventIdentity(article.title, bodyText, article.published_at);

    // 2026-09-25 ("FIX PAST-EVENT RECAP CLUTTER" -- Jody: "I should not have
    // to manually dismiss obvious past-event coverage"): an article whose
    // ONLY textually-stated date(s) are already behind us describes
    // something that's already happened -- recap/retrospective coverage,
    // never a future event to list. Never inferred/guessed: this only
    // fires when extractDates() found a real, explicit date in the
    // article's own text (identity.startDate/endDate come straight from
    // it) and the LATEST one found is still strictly before today. Since
    // extractDates() returns dates sorted ascending, endDate (when present)
    // or else startDate IS the latest one found -- so this one comparison
    // is equivalent to checking every extracted date, not just the first.
    // An article naming BOTH a past reference and a real upcoming date
    // (e.g. "last year's turnout was huge; this year's is Nov 3") is
    // untouched by this -- only when every extracted date is in the past.
    // Auto-dismissed the exact same reversible way "Not a fit" does
    // (admin_dismissed=true, never a hard delete, undoable by a human) --
    // never left for a human to dismiss by hand, and never carried forward
    // to Phase B where a lucky full extraction could otherwise create it as
    // a bogus past-dated event.
    const latestKnownDate = identity.endDate || identity.startDate;
    if (latestKnownDate && latestKnownDate < nowIso) {
      if (!dryRun) await dismissArticleFn(SUPABASE_URL, sbHeaders, article.id);
      counts.autoDismissedPast++;
      counts.autoDismissedPastDetail.push({ articleId: article.id, title: article.title, url: article.url, date: latestKnownDate });
      continue;
    }

    unresolved.push({ article, identity });
  }

  // Phase B — group the still-unresolved articles by shared event identity:
  // same normalized title, and a start date that doesn't conflict (a
  // missing date on either side is compatible — a second article covering
  // the same festival doesn't always restate the date the first one gave;
  // an explicit disagreement between two dates is NOT grouped). An article
  // with no extracted title can't be confidently grouped with anything and
  // is decided alone. Multiple articles about the same event decide
  // together, not independently — item 3 of the 2026-09-23 correction.
  const groups = []; // [{ titleKey, startDate, items: [...] }]
  for (const item of unresolved) {
    const { title, startDate } = item.identity;
    if (!title) {
      groups.push({ titleKey: null, startDate: null, items: [item] });
      continue;
    }
    const titleKey = normalizeAmpersand(title);
    const existing = groups.find(
      (g) => g.titleKey === titleKey && (!g.startDate || !startDate || g.startDate === startDate)
    );
    if (existing) {
      existing.items.push(item);
      if (!existing.startDate && startDate) existing.startDate = startDate;
    } else {
      groups.push({ titleKey, startDate: startDate || null, items: [item] });
    }
  }

  // Phase C — for each group: merge the pooled evidence, attempt bounded
  // external venue resolution ONCE per group when title/date/category are
  // all confident but no venue/city-distributed location is (item 1),
  // then decide once for the whole group (item 2's city-only-when-
  // distributed rule lives in isSufficientForCreate).
  for (const group of groups) {
    const members = group.items;
    let merged = mergeIdentities(members.map((m) => m.identity));

    const hasCore = !!merged.title && !!merged.startDate && !!merged.category;
    const hasLocation = !!merged.venueName || (!!merged.city && !!merged.isDistributed);
    let externalAttempted = false;

    if (hasCore && !hasLocation && isExternalDiscoveryConfiguredFn({ TAVILY_API_KEY: tavilyApiKey })) {
      externalAttempted = true;
      let discovery = null;
      try {
        discovery = await discoverEventVenueFn({
          eventTitle: merged.title,
          city: merged.city,
          contextTerms: merged.contextTerms,
          apiKey: tavilyApiKey,
        });
      } catch {
        discovery = null; // fail closed — an external-resolution error is treated as "unavailable," never surfaced as a crash
      }
      if (discovery && discovery.venueName) {
        merged = { ...merged, venueName: discovery.venueName, city: discovery.city || merged.city };
        if (!dryRun) {
          const persisted = await upsertVenueKnowledgeFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            name: discovery.venueName,
            address: discovery.address,
            city: discovery.city,
            website: discovery.website,
          });
          // Persisted venue knowledge is immediately usable by createEventFn
          // below (same run) — "persist learned venue knowledge normally"
          // (the PO's own words), reusing the same normalizeVenueName key
          // resolveVenueId itself looks up by.
          if (persisted && persisted.id) venueIdMap.set(normalizeVenueName(persisted.name), persisted.id);
        }
      }
    }

    const { sufficient, missing } = isSufficientForCreate(merged);
    if (!sufficient) {
      const reasons = externalAttempted ? [...missing, "EXTERNAL_RESOLUTION_UNAVAILABLE"] : missing;
      for (const { article } of members) {
        counts.stillHuman++;
        counts.stillHumanDetail.push({ articleId: article.id, title: article.title, url: article.url, reasons });
      }
      continue;
    }

    if (dryRun) {
      logger.log(`[dry-run] would create event from ${members.length} article(s):`, merged);
      counts.autoCreated++;
      if (members.length > 1) counts.crossArticleDuplicatesPrevented += members.length - 1;
      continue;
    }

    const created = await createEventFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders, merged, venueIdMap);
    if (!created) {
      for (const { article } of members) {
        counts.stillHuman++;
        counts.stillHumanDetail.push({ articleId: article.id, title: article.title, url: article.url, reasons: ["CREATE_FAILED"] });
      }
      continue;
    }
    let anyLinked = false;
    for (const { article } of members) {
      const applied = await applyLinkFn(SUPABASE_URL, sbHeaders, article.id, created.id, "manual");
      if (applied) anyLinked = true;
    }
    if (!anyLinked) {
      // Shouldn't happen (the event was just created), but never silently
      // drop an article — leave it for a human rather than lose it.
      for (const { article } of members) {
        counts.stillHuman++;
        counts.stillHumanDetail.push({ articleId: article.id, title: article.title, url: article.url, reasons: ["LINK_WRITE_FAILED"] });
      }
      continue;
    }
    counts.autoCreated++;
    if (members.length > 1) counts.crossArticleDuplicatesPrevented += members.length - 1;
  }

  if (!dryRun && counts.autoCreated > 0 && typeof repairGenericMetadataFn === "function") {
    try {
      counts.enrichment = await repairGenericMetadataFn({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
    } catch (err) {
      counts.enrichmentError = err.message;
    }
  }

  return counts;
}

module.exports = {
  linkPressCoverageQueue,
  deepMatchArticleToEvent,
  extractEventIdentity,
  extractTitle,
  extractVenue,
  extractCity,
  extractStreetAddress,
  extractContextEntities,
  isDistributedEvent,
  extractCategory,
  extractDates,
  extractEventDates,
  trimTrailingBoilerplate,
  extractDescriptionSentence,
  isSufficientForCreate,
  mergeIdentities,
  normalizeAmpersand,
  fetchQueueDefault,
  fetchCandidateEventsDefault,
  applyLink,
  createEvent,
  dismissArticle,
  fetchArticleText,
};

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  const { repairGenericMetadata } = require(path.join(__dirname, "generic-metadata-enrichment"));
  linkPressCoverageQueue({ dryRun, repairGenericMetadataFn: repairGenericMetadata })
    .then((counts) => {
      console.log(`\nPress coverage linking ${dryRun ? "(dry run) " : ""}summary:`);
      console.log(counts);
    })
    .catch((err) => {
      console.error("Press coverage linking failed:", err);
      process.exitCode = 1;
    });
}
