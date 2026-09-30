# Needs Follow-up / self-healing root-cause investigation (2026-09-30)

Jody's brief: production Admin showed 68 actionable Needs Follow-up events
with Auto-Repair fixing 0 of them. Investigate root cause across the whole
ingestion → normalization → venue resolution → enrichment → Admin UI
pipeline; do not patch the individual cards; fix the generalized mechanism.
Also investigate the Press Coverage one-article-to-many-events problem
(C&G "Fall festivals to take place in Southfield, Lathrup Village").

## Method

Queried live production `events` via the public anon key (read-only,
`status=in.(pending_review,approved)`, `start_date>=today`, the exact shape
`api/admin-events.js`'s `?incomplete=1` uses) and reproduced
`admin.html`'s `getMissingFields()`/`classifyMissingFields()` logic exactly,
client-side, against the real rows — not a guess at what the UI shows, the
literal same computation.

At query time this returned **97 actionable events** (4 more excluded as
source-limited) — Jody's "68" was almost certainly correct as of when she
looked; the queue has grown since, but the *shape* of the breakdown is
what matters here, not the exact count on any given day.

## Breakdown by missing field

| Field | Count | % |
|---|---|---|
| VENUE ADDRESS/CITY | 79 | 81% |
| START TIME | 15 | 15% |
| TICKET/EVENT LINK | 4 | 4% |
| DESCRIPTION | 0 | 0% |
| DEAD EVENT/TICKET LINK | 0 | 0% |

Description generation and dead-link detection are working — zero gaps in
either. The overwhelming majority of the backlog is one field: venue
address/city.

## Root cause #1 (79 of 97 cards, 81%): `ics-location.js`'s LOCATION grammars were too narrow

`api/_lib/ics-location.js`'s `parseIcsLocation()` (added migration_043,
2026-09-29, "Phase 6 per-event venue-resolution shared infrastructure") is
exactly the mechanism meant to solve this — split a VEVENT's own LOCATION
into name/address/city instead of stamping every event with the feed
organization's own name. It **is** wired in and running for every affected
feed (confirmed: `venue_name_raw` values for these events are the feed's
own varied per-event location text, not a constant organizational name —
proof the per-event path is active, not skipped).

The bug: its two recognized grammars (`TRIBE_LOCATION_RE`,
`CIVICPLUS_LOCATION_RE`) were narrower than the real LOCATION strings these
already-registered feeds emit. Confirmed against real production values:

- **Downtown Windsor BIA** (29 cards): `"Windsor Public Library, 185
  Ouellette Ave, Windsor, Ontario, WindN9A 5S8, Canada"` — spells the
  region out in full ("Ontario"), never abbreviates. The old regex
  required an exact 2-letter code.
- **Eastern Market Partnership** (16 cards): `"Cool Cities / Hope Village,
  14150 Woodrow Wilson, Detroit, 48238, United States"` — omits the region
  field entirely (organizer never filled in a state).
- **Windsor Symphony Orchestra** (8 cards): same Windsor/Ontario shape.

53 of the 79 venue-address/city gaps (67%) trace to this one narrow
regex constraint. When the grammar failed to match, the text correctly
fell through to the safe, honest `"unparseable"` fallback and was written
WHOLE into `venue_name_raw` — real, useful address data, just never split
out of that one field, and (confirmed by reading `resolveIcsEventVenue`'s
full branch) nothing downstream (SH.1, generic-metadata-enrichment's
reverse/forward venue resolution) ever re-parses `venue_name_raw` looking
for trapped structure. That's why Auto-Repair fixed 0: every one of its
existing repair tiers assumes the address/city fields are the source of
truth, and here they were correctly, honestly null — the real data was
sitting one column over the whole time.

**This is not** "ingestion discarding metadata" (the raw text is fully
preserved) and **not** "Auto-Repair not invoking the generalized system"
(it's invoked, wired, and running correctly against the wrong assumption).
It's `parseIcsLocation()` — described in its own header as shared
infrastructure other future adapters will also depend on — not yet
covering real, recurring shapes.

### Fix implemented

`api/_lib/ics-location.js`: replaced the single-regex Tribe grammar with a
positional split (name / street / city / trailing fields) whose confidence
anchor is "at least one trailing segment looks like a postal/zip code
(US 5-digit, or Canadian letter-digit-letter[ ]digit-letter-digit) or a
bare 2-letter region code" — still a closed, specific, non-guessing check,
just no longer requiring the region field to be exactly 2 letters or even
present. Confirmed downstream (`resolveIcsEventVenue`) that
region/postal/country are never used past this module — only
name/address/city reach venue resolution — so widening how the tail is
recognized carries no behavioral risk beyond getting those three right.

New script `scripts/venue-raw-reparse-repair.js` (wired as Auto-Repair
Step 7, both the button and the daily cron): re-runs the now-fixed parser
against every already-ingested event whose `venue_name_raw` is still
holding a raw, unsplit location string (`venue_id`/`venue_address_raw`/
`venue_city_raw` all null). Only ever fires when the re-parse newly
succeeds; never touches a field that isn't blank; never invents; reuses
the exact same `resolveVenueFromCandidate()` canonical-venue tiering
already used at ingestion time. This is the "already-ingested backlog"
half of the fix — new events benefit automatically from the grammar fix at
ingestion time going forward.

Both changes are covered by tests (`test/ics-location.test.js`,
`test/venue-raw-reparse-repair.test.js`) using the real production
strings above as fixtures. Full existing suite (57 test files) re-run
clean except one pre-existing, unrelated failure
(`test/cron-bigtimebingo-runlog.test.js`, confirmed failing identically on
the untouched `main` branch before any of this work started).

### Deliberately NOT fixed in this pass (residual, smaller, higher-ambiguity tail)

7 of the 79 venue-address/city cards are CivicPlus-shaped strings that
don't fit `CIVICPLUS_LOCATION_RE`'s exact `name - digit-led-street  city
state zip` pattern:

- City of Wyandotte (4): dash positioned *after* the street+city block,
  not after the name (`"Theatre Square 1st & Elm St. Downtown Wyandotte -
  Wyandotte MI 48192"`) — genuinely ambiguous where the venue name ends
  and the street begins without a clearer delimiter; forcing a split here
  risks inventing structure that was never confidently stated, which is
  exactly what this codebase's "never guess" convention (see
  `venue-lookup.js`'s own header) forbids.
- City of Royal Oak (2): one is legitimately unparseable free text
  (correct, expected behavior, shape 3 in `ics-location.js`'s own header);
  one is an intersection-style street with no leading house number
  (`"Fifth and Washington Ave."`).
- Sterling Heights Library (1): leading-dash artifact with an empty name
  segment (`"- Sterling Heights MI 48313"`).

These are a real, generalizable-in-principle second wave, but each
requires its own confidence anchor to avoid guessing wrong, and the
highest-value, lowest-risk fix (67% of the whole 79-card bucket) is
already landed. Flagging as a follow-up item rather than rushing a
same-day second regex.

## Root cause #2 (15 of 97 cards): START TIME — Royal Oak's tour/travel packages

City of Royal Oak's remaining 14 cards (plus 1 from Tourism Windsor Essex
Pelee Island) are all multi-day tour/travel packages (Collette guided
tours, Shoreline Tours) — genuinely time-flexible, no single "start time"
any more than a bus tour has one (the exact same shape `no_fixed_venue`
already exists to handle for venue). This isn't a parsing bug; it's a
missing category-detection signal, parallel to the existing
`no_fixed_venue` (migration_040) mechanism but for `is_all_day`/start
time. Not fixed in this pass — flagged for a future generalized
"no-discrete-time-by-design" detection (title/category keyword signal,
never guessed, same posture as `no_fixed_venue`), scoped separately since
it's a different field/mechanism than the venue fix above.

## Root cause #3 (4 of 97 cards): TICKET/EVENT LINK — HALO Detroit

HALO Detroit's own connector never writes `ticket_status`, so these social
events (a cigar social, a monthly meetup) have no way to signal "this
genuinely has no advance-ticket mechanism by design" the way
migration_041's `NO_ADVANCE_TICKET_STATUSES` scheme lets other sources do.
Narrow, source-specific (one connector's own classification, not a shared
mechanism) — noted but out of scope for "generalized pipeline" work.

## Press Coverage: the one-article-to-many-events problem

Confirmed against the real production example (`editorial_articles` id
`4a099f45-9371-48c0-b2ae-3405d53b0bb5`, C&G Newspapers, "Fall festivals to
take place in Southfield, Lathrup Village", `matched_event_id: null`): the
article's own excerpt explicitly names **two distinct events** — "Southfield's
Boo Bash" and "Lathrup Village's Fall Fest" — different cities, different
names, same weekend (Oct. 17).

`scripts/press-coverage-linking.js` is a sophisticated, well-built system,
but every function in its extraction/matching/creation pipeline assumes
**exactly one event identity per article** (or per group of articles
about the *same* event — `mergeIdentities()` pools multiple articles into
one identity, never splits one article into several):
`extractEventIdentity()` returns a single object; `extractTitle()` returns
a single title (the first title-shaped phrase or quoted name it finds);
`isSufficientForCreate()`/`createEvent()` each operate on one identity.
There is no code path anywhere that asks "does this article describe more
than one event?" — a multi-event article either has its first-found
event extracted (silently dropping the second, with no trace in the queue
once `matched_event_id` is set) or fails extraction from the very first
step and sits in the "still human" queue with no way for Jody to see that
two events, not one, are the actual gap.

This is architecturally distinct from the venue-parsing fix above: it
isn't a narrow-grammar problem, it's a **data-model assumption** baked
into every function signature in the file (one identity in, one identity
out). Fixing it generally means changing `extractEventIdentity` to return
an array (typically length 1, length N when N confident, distinct
title+location pairings are found in one article), and threading that
through the matching/grouping/creation phases so each identity is
decided independently — a substantial rewrite of the core
extraction/orchestration logic, not an additive regex change.

Per your instruction to stop and ask before a "genuinely destructive
schema/product decision" — I'm treating the shape of that rewrite (how
multi-event splitting should work, what confidence bar a second event
needs to clear, whether a partial split ever risks creating a duplicate
of the same event twice) as exactly that kind of decision, rather than
guessing at an architecture and shipping it same-day. Flagged for your
input before I touch `press-coverage-linking.js`'s core extraction logic.

## Admin UI audit

The UI itself is not overclaiming or misrepresenting what exists — every
label, reason code, and Auto-Repair status line I found matches the
underlying mechanism's real behavior (this codebase has a strong,
consistently-applied "never guess, report honestly" culture throughout).
The actual UI gap is an *invisibility* problem, not a false claim:

- A "VENUE ADDRESS/CITY" card's `NO_CANONICAL_VENUE_DATA` reason code
  looks identical whether the real cause is "no venue on file yet" or
  "the address is sitting unparsed in `venue_name_raw`" — Jody has no way
  to tell these apart from the card alone. (Addressed going forward by the
  fix above making the unparsed case increasingly rare, but the
  distinction itself is still invisible in the UI.)
- The Press Coverage queue has no way to represent "this one article
  actually describes N events" — a matched/created article simply
  disappears from the queue, so a silently-dropped second event is
  invisible to Jody, not just to the pipeline.

Both are consequences of the underlying pipeline gaps above, not
independent UI defects — no separate UI fix is recommended ahead of the
architecture decision on Press Coverage.

## Deployment note

This sandbox has no push access to `jody-bit/313events-site` (confirmed:
`git push` is rejected by the org's git proxy, same constraint already
reported for the RA work). All changes above are complete, tested, and
sitting in this session's local clone — they need to either be applied by
someone with push access, or this session needs the repo added to its
authorized sources, before they reach production.
