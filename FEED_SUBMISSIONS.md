# 313.events — Self-Service Feed Submissions

Built 2026-08-26 in response to: some venues/organizers already publish an
ongoing calendar feed of their own, and several were previously excluded
from automated ingestion specifically because their robots.txt blocks
scraping (thedetroitilove.com; Scarab Club, flagged already in
`NEW_SOURCES_RESEARCH.md` as "ask them directly for the feed rather than
pull it"). This feature turns that email-by-hand workaround into a real,
repeatable self-service path with a human approval gate before anything is
ever polled automatically.

## What this is, and isn't

`submit.html` now has two tabs: **Submit one event** (unchanged — the
original single-event form, still lands in `events` as `pending_review`)
and **Submit your event feed** (new — registers an ongoing feed *URL*, not
an event, in a new `feed_sources` table).

This is distinct from `sources` (`migration_004_source_registry.sql`):
that table is an internal *research* catalog of every venue/promoter this
project knows about, populated by hand, describing ingestion
characteristics (API/RSS/iCal/JSON-LD availability, robots.txt findings,
etc.) in detail — read-only to the public, never self-submitted.
`feed_sources` is narrower and operational — a queue of feed URLs
organizers *themselves* submitted through the public site, each needing a
one-time human approval before polling starts. It's the self-submission
analog of `sources`, the same way `events.status='pending_review'` is
already the self-submission analog of `venues`.

Since a venue is the one handing over the URL, this isn't crawling against
a site's wishes the way an uninvited scrape would be — robots.txt is a
signal aimed at uninvited bots, and an operator inviting a specific pull is
a different situation. The submission form still asks specifically for a
calendar/export link rather than "your website," since that's usually a
path robots.txt doesn't even touch (it's meant for calendar apps to
subscribe to).

## Format: iCalendar (.ics), not XML

The format that actually gets parsed is **iCalendar** (RFC 5545) — the
same plain-text format behind "Add to Google Calendar" links, Outlook
exports, Eventbrite's organizer-side export, and WordPress's "The Events
Calendar" plugin (already used elsewhere in this project via its JSON REST
API instead — `api/cron-wdet.js`, `api/cron-belle-isle-nature-center.js`).
It carries real `DTSTART`/`DTEND`/`LOCATION` fields, unlike generic RSS/XML
feeds, which have no native event-date semantics at all (a `<pubDate>` is
when the item was *posted*, not when the event *is*).

`feed_sources.feed_format` accepted `'rss'` from the start (so the schema
wouldn't need a migration later), but until 2026-10-03 `api/cron-feeds.js`
only actually parsed `'ics'` — an `'rss'` row was recorded every run as
"not polled" rather than guessed at. **As of migration_044 (2026-10-03),
RSS is actually polled too, best-effort** — see "RSS and manual intake
(2026-10-03 update)" below for what changed and, more importantly, what
didn't: this is still not treated as equally trustworthy as a real ICS
`DTSTART`.

## How it works end to end

1. **Submission** (`submit.html` → `api/submit-feed.js`) — an organizer
   provides their feed URL, a default category (applied to every event the
   feed produces — same one-venue-one-genre assumption every single-venue
   cron in this project already makes, e.g. `cron-cinema-detroit.js`'s
   hardcoded `VENUE_NAME`/category), venue/org name, contact email, and
   optional notes. Lands in `feed_sources` as `status='pending_review'`,
   server-validated the same way `api/submit.js` validates single events
   (required fields, http(s)-only URLs, valid email). Triggers the same
   best-effort Resend email alert `api/submit.js` already sends for single
   events, reusing `RESEND_API_KEY`/`SUBMISSION_NOTIFY_EMAIL`.

2. **Approval** (`admin.html` → `api/admin-feeds.js`) — a new "Feed
   sources" section alongside the existing event queue, grouped by status
   (Pending review / Active / Paused / Rejected). Approve/Reject on a
   pending feed; Pause/Resume on an already-approved one (for a feed that
   turns out to be low-quality or breaks). Approving does **not** trigger
   an immediate poll — the feed starts getting pulled on
   `api/cron-feeds.js`'s next normal scheduled run, same as every other
   source in this project (nothing else runs on-demand either).
   `last_polled_at`/`last_poll_result` show up on each card once that first
   run happens, so approval isn't a black box.

3. **Polling** (`api/cron-feeds.js`, daily at 22:00 UTC per `vercel.json`)
   — generic, not hardcoded to one venue like every other cron here: loops
   over every `status='approved'` row, fetches its `feed_url`, parses ICS
   (unfolds RFC 5545 line-folding, decodes both ICS's own text-escaping and
   HTML entities defensively, handles UTC/named-timezone/floating
   `DTSTART` values, handles all-day multi-day spans), and upserts into
   `events` with `external_id = feed-<feed_source.id>-<uid>` for dedupe on
   re-runs. Every feed's events land `status='approved'` directly — the
   *source* was what got human-reviewed, so its events auto-publish at the
   same trust tier as Trinosophes/HALO/Redford/etc.'s single-venue crons
   (contrast Metro Times, which lands `pending_review` because *it* is an
   unvetted general calendar, not one approved venue). One feed failing to
   fetch or parse never blocks the others — same fail-soft, document-
   honestly convention as every other cron (see `sources.html`).

## Production track record

- **2026-09-29 — The Congregation: first `feed_sources` feed to reach
  production, verified end to end.** Approved in `admin.html` (validated
  safe for the then-current single-venue architecture, `location_per_event`
  left `false`), migration 043 applied, then `api/cron-feeds.js` manually
  triggered from the Vercel dashboard (no scheduled run had occurred yet
  since approval). Result, verified read-only against production directly
  (anon-key reads of `events`, not just the run's own reported status):
  upcoming approved events **1,037 → 1,067 (+30)**, all 30 attributable to
  this one feed (`external_id` prefix `feed-<feed_source.id>-...`), zero
  duplicate `external_id`s against the pre-existing 1,037 or each other,
  every row's `ticket_url` resolving to a real
  `thecongregationdetroit.com/publicevents/...` page. This is the first
  live confirmation that the generic ICS connector (`api/cron-feeds.js`,
  live since migration_008) works end to end for a real, previously-
  unreachable venue — The Congregation's own `robots.txt` blocks AI/Claude
  crawlers (`INGESTION_PLATFORM_ARCHITECTURE.md`'s source classification
  table), so this self-service feed path was the only permitted way in.
- **Two data-quality gaps this first real batch exposed:**
  (1) **Category — fixed 2026-09-29.** All 30 events had inherited the
  feed's flat `default_category = "nightlife"`, including clearly
  non-nightlife programming (yoga, a mental-health workshop, an AI meetup,
  a nail-art workshop). `icsEventsToRows()` now derives each event's
  category from its own `SUMMARY`/`DESCRIPTION` via the same shared
  `extractCategory()` `scripts/press-coverage-linking.js` already uses for
  press-coverage matching (reused, not reimplemented — no new classifier,
  no Congregation-specific rules), falling back to `feedSource.default_category`
  only when nothing confidently matches. Applies identically whether a feed
  is `location_per_event` or not. `CATEGORY_KEYWORDS` itself was
  deliberately left unchanged in this pass (no `community`/`gaming`
  keywords added, no `dance`/`family` reordering) — those are shared-logic
  decisions for later, not slipped in here.
  (2) **Venue resolution — root-caused, data fix pending as of 2026-09-29.**
  All 30 events carry `venue_id = null` and no
  `venue_address_raw`/`venue_city_raw`. Root cause confirmed to be a
  missing `venues` row (no canonical venue named or addressed like "The
  Congregation" exists yet under any spelling) — not a resolution bug;
  `resolveVenueId`/SH.1's `resolveVenueAddressCityRepair` are both behaving
  exactly as designed by declining to guess. Smallest fix identified: one
  new `venues` row (`name: "The Congregation"`, `address: "9321 Rosa Parks
  Blvd"`, `city: "Detroit"`, `neighborhood_id` left `null` pending your own
  editorial assignment, same convention as every other venue) plus running
  `admin.html`'s existing Auto-Repair action once it exists — no code
  change required for the backfill itself.

## RSS and manual intake (2026-10-03 update)

Prompted by Jody: *"do we have in the submit form for venues and promoters
to be able to add the multitude of ways we are seeing events feeds but
being blocked?"* — surfaced while onboarding Midwest Buddhist Meditation
Center and Detroit History Tours as one-time manual pulls the same day,
both of which have no feed/export of any kind. Audit found three real
gaps; migration_044 and this update close two of them and give the third
an honest home instead of silence:

1. **RSS was accepted by the validator, offered nowhere in the UI, and
   never actually polled.** Now: `submit.html`'s feed tab has a real
   format picker (ICS / RSS / "no feed at all"), and `api/cron-feeds.js`
   polls `'rss'` rows. Per-item date handling is deliberately two-tier,
   never silently uniform:
   - An item whose own title/description contains an explicit,
     fully-qualified date (month+day+**year** — a bare month/day with no
     year is never guessed at) uses that date and lands at the feed's
     normal trust tier, same as an ICS event.
   - An item with no such date falls back to its RSS `<pubDate>` (when
     the item was *posted*, not necessarily when the event *is*), but is
     forced to `status='pending_review'` regardless of the feed's own
     approval, with a visible `note` asking a human to verify it. This is
     the recommended, explicitly-chosen tradeoff over either (a) treating
     every RSS date as fully trusted (reintroduces the exact
     silently-wrong-date risk this file originally called out) or (b)
     refusing to parse RSS at all (leaves real sources unreachable).
   - An item with no date signal at all (neither an extractable date nor
     a `pubDate`) is skipped entirely — same as an ICS `VEVENT` with no
     `DTSTART`.
   - An admin's prior approve/reject on an already-ingested row is never
     clobbered by a re-poll — the same fail-closed status-lookup guard
     ICS already had (`upsertParsedRows()`) now covers RSS too.
   - RSS v1 does not support `location_per_event`, `end_date`, or a
     parsed `time_display` — none of those have a reliable signal in
     generic RSS, so none are invented. Worth revisiting if a real RSS
     source needs them.
2. **No path at all existed for a venue/organizer with no feed or export
   of any kind** — the MBMC/Detroit History Tours pattern was a one-time
   manual SQL pull each time, not a standing self-service option. Now:
   `feed_format = 'manual'` (migration_044). `submit.html`'s format picker
   offers "No feed/export at all — just my website"; the submitted URL is
   just a link for a human to look at, never fetched or parsed.
   `api/cron-feeds.js` always skips a `'manual'` row (never fetches,
   scrapes, or guesses at its contents — see that file's own header on
   why generic HTML scraping stays a human decision). It still flows
   through the exact same `admin.html` queue and `api/admin-feeds.js`
   approve/reject/pause/resume actions as ICS/RSS — approving one is
   simply the record that a human should follow up (an outreach email, a
   one-time manual pull), not a trigger for automated polling.
3. **`api/submit-feed.js`'s `VALID_CATEGORIES` whitelist was missing
   `'gaming'`** (added to `api/submit.js`'s own whitelist back on
   2026-09-22, migration_036/037, but never mirrored here) — a feed
   source trying to register with `gaming` as its default category would
   have failed validation even though it's a real, valid category in the
   database. Fixed in the same pass; `api/submit.js` needed no change
   (its own whitelist already had `gaming`).

**Automated test coverage added the same day** (`api/submit.js`,
`api/submit-feed.js`, and `api/admin-feeds.js` had none before this):
`test/submit-validation.test.js`, `test/submit-feed-validation.test.js`,
`test/admin-feeds-actions.test.js`, `test/cron-feeds-rss.test.js`,
`test/cron-feeds-manual-skip.test.js`.

## Known v1 limitations (real, not silently papered over)

- **No RRULE expansion.** A recurring event with no explicit further
  instances is read as its single `DTSTART` occurrence only. Most
  subscription-oriented exports (Google Calendar's "secret address",
  WordPress's Events Calendar plugin) already expand near-term recurring
  instances into individual `VEVENT`s on their own, so this covers the
  common case — a feed relying on `RRULE` expansion for far-future dates
  will undercount until re-polled closer to each occurrence.
- **RSS dates are best-effort, not structured.** See "RSS and manual
  intake" above — an explicit date in the item's own text is trusted at
  the feed's normal tier; a `pubDate` fallback is always held for human
  verification; nothing is ever silently guessed beyond that.
- **'manual' rows are never automated.** By design — see above. If a
  'manual' source turns out to have a parseable structure after all (the
  way Detroit History Tours' plain-text calendar page did), building a
  dedicated `html_recipe`-style connector for it is still a separate,
  deliberate decision, not something this intake path does on its own.
- **One feed = one venue, UNLESS `location_per_event` is set.**
  `migration_043_feed_sources_location_per_event.sql` (2026-09-29) added an
  opt-in per-feed switch for exactly the case this limitation used to
  describe: an aggregator/organization feed (Tourism Windsor Essex,
  Downtown Windsor BIA, a CivicPlus municipal calendar, etc.) whose own
  name is never itself a real event venue. When set, `icsEventsToRows()`
  resolves each `VEVENT`'s own `LOCATION` (see `api/_lib/ics-location.js`)
  into that event's venue instead of forcing `feedSource.venue_name` onto
  every row — a canonical venue match when confidently resolved, the
  parsed candidate name/address/city verbatim when not, "Venue TBA" only
  when `LOCATION` is genuinely blank, or the sanitized raw text when
  `LOCATION` is present but doesn't match either recognized grammar (never
  discarded, never force-parsed into invented structure). Defaults to
  `false` for every feed — nothing already approved changes unless an
  admin explicitly flags it. Still not solved by default for a plain
  single-venue feed that also happens to run events in a few different
  rooms under one name (that case still wants the feed's own venue_name,
  which is why this is opt-in rather than automatic) — flagged for whoever
  hits that narrower case.
- **No immediate "preview what this feed contains" step before approval.**
  An admin approving a feed is trusting the URL based on what's in the
  submission form (venue name, notes, a quick manual check of the feed URL
  in a browser) — there's no in-app "here's what we'd pull" dry run yet.
  Worth adding if a bad feed ever gets approved by mistake.

## Future: Self-Service Calendar Connection (concept captured 2026-10-02, not built)

Today's self-service path is narrower than the long-term shape this is
heading toward. `submit.html`'s two tabs are **Submit one event**
(single-event form) and **Submit your event feed** (ICS URL only, via
`feed_sources`/`cron-feeds.js` above). Meanwhile, the ingestion side has
started building real, reusable multi-tenant adapters of its own —
`cron-eventbrite.js` (organizer-authorized Eventbrite API, WP 6.12) and
`cron-localist.js` (multi-tenant campus/institutional API, WP 6.1/6.2) —
each currently onboarded by hand (a developer adding a config-array entry
and, for Eventbrite, an organizer's token as a Vercel env var). The
product direction captured here, **not implemented yet**, is to let
`submit.html` itself be the on-ramp for both of these adapters (and every
future one), instead of a developer doing it by hand per source.

**Two concepts, not one, on the Submit page:**

- **Submit an Event** — today's existing single-event form, unchanged.
- **Add an Organization / Calendar** — new. Organizer-facing language
  describes the *capability*, never the underlying adapter/mechanism:
  *"Run events regularly? Connect your calendar once and 313.events can
  keep your upcoming events updated automatically."* The person submitting
  does not need to know or care whether their calendar happens to be
  Localist, Tribe, CivicPlus, a plain ICS export, or Eventbrite — they
  give us a URL (or, for Eventbrite, connect an account — see below) and
  the system figures out the rest.

**A second, distinct use case the same surface must preserve:** someone
who does not run the organization but knows of a calendar 313.events
should be following — *"I found a calendar 313.events should follow."*
This is the suggestion-only path: an ordinary visitor can point at an
authoritative public source (a public Localist/Tribe/CivicPlus/ICS
calendar) without needing to own or authorize anything, matching how
`NEW_SOURCES_RESEARCH.md` candidates get surfaced today, just opened up to
anyone instead of staying an internal research exercise. Critically, this
suggestion path can **never** stand in for the first one where
authorization is actually required: a visitor can suggest "here's a
calendar worth following," but cannot authorize access to somebody else's
Eventbrite organization on that organization's behalf (see the Eventbrite
amendment below) — "I run this" and "I found this" are different trust
levels, not two labels for the same action.

**Future behavior (not built):**

```
calendar URL → platform detection → source validation → adapter selection
  → source registration → normal ingestion/dedupe/self-healing
```

Platform detection and adapter selection are what let one submission box
cover every mechanism this project already has, or plans to have:
Localist, Tribe/The Events Calendar, CivicPlus, plain ICS, Eventbrite, and
whatever future adapter joins them. A public/permitted source (Localist,
Tribe, CivicPlus, ICS) needs only validation + registration, the same
admin-approval-then-poll shape `feed_sources` already uses today. A source
that requires the owner's own authorization (Eventbrite today; potentially
others later) needs an actual consent/authentication step before
registration — see the Eventbrite-specific amendment immediately below for
what that looks like end to end.

This is a product-direction placeholder, not a spec: real design work
(exact platform-detection heuristics, the validation/dry-run UX, how
adapter selection maps a detected platform to one of the existing
`api/cron-*.js` handlers vs. a future generic registry-row model per
`INGESTION_PLATFORM_ARCHITECTURE.md`) is still to be done. Recorded here
so neither `cron-eventbrite.js` nor `cron-localist.js` (nor any future
multiplier adapter) is designed as a dead end that only a developer can
ever onboard a new tenant into.

### Eventbrite Organizer Connection (amendment, 2026-10-02)

Eventbrite is the one mechanism in the list above that cannot be
"validate and register" like a public feed — per `cron-eventbrite.js`'s
own header and the activation research behind it, Eventbrite requires the
organizer's own affirmative authorization before their events are
reachable at all (there is no general-purpose token that reaches an
arbitrary organizer). The future **Add an Organization / Calendar** flow
must therefore support Eventbrite as an *authenticated* calendar
connection, distinct from the unauthenticated validate-and-register path
public sources use:

> *"Use Eventbrite for your events? Connect your Eventbrite account and
> 313.events can automatically keep your events up to date."*

Future flow: **Connect my Eventbrite → Eventbrite OAuth consent →
organization authorized → token securely stored → organization registered
as an ingestion source → events continuously synchronized through the
generalized `eventbrite-org` adapter.** The organizer should never need to
understand API tokens, environment variables, organizer IDs, cron jobs, or
adapters — all of that stays implementation detail behind one "Connect"
button.

Requirements to preserve for whenever this is actually implemented:

- One 313.events Eventbrite OAuth application (registered once, not
  per-organizer — see the activation research for why this differs from
  today's MVP per-organizer-private-token model).
- The organizer explicitly authorizes access through Eventbrite's own
  consent screen — never implied, never defaulted.
- Discover/select the authorized Eventbrite organization(s) where an
  account manages more than one.
- Store the resulting authorization securely in the database (a real
  table, analogous to `feed_sources`), not as a Vercel environment
  variable per organizer — today's `EVENTBRITE_TOKEN_<NAME>` env-var
  pattern is the proof-of-ingestion MVP, not the onboarding mechanism this
  is meant to replace.
- Connect that stored authorization to the existing, unmodified
  generalized `eventbrite-org` adapter (`cron-eventbrite.js`'s `ORGANIZERS`
  config shape would need to become data-driven from this table instead of
  a frozen in-code array, but the adapter's own parsing/venue/category/
  status logic does not change).
- Automatic, continuous future synchronization once connected — no
  further manual steps.
- Source-health monitoring per connected organization, and detection of an
  expired/revoked/invalid authorization (Eventbrite's own OAuth token
  lifecycle is not well documented publicly — see the activation
  research — so this needs to be observed defensively, the same fail-safe
  posture `cron-eventbrite.js` already takes toward a 401/403).
- An organizer-facing reconnect flow for exactly that expired/revoked
  case.
- An organizer-facing disconnect flow. Disconnecting stops future
  acquisition only — it must never delete the organization's legitimate
  historical event records.
- Every event that arrives this way still goes through 313.events' normal
  dedupe, canonicalization, and self-healing/review rules — connecting
  Eventbrite is an acquisition mechanism, not a bypass.
- Connecting Eventbrite does not, by itself, grant publication or
  editorial privileges beyond 313.events' normal policy — authorizing
  ingestion is not the same thing as earning auto-approval.

And, restating the general distinction above in Eventbrite-specific terms:
**"I run this organization"** can connect an authenticated system like
Eventbrite on that organization's behalf. **"I found a calendar 313.events
should follow"** can suggest a public, authoritative source, but can never
authorize somebody else's Eventbrite organization — that consent can only
come from Eventbrite's own OAuth screen, completed by someone with real
access to that organization's Eventbrite account.

**Not building this now.** The existing per-organizer, env-var-token
`eventbrite-org` adapter remains the technical MVP and the actual proof
that ingestion works end to end. OAuth is the self-service onboarding
*layer on top of* that adapter, to be designed and built separately, once
prioritized.

## Files touched

- `supabase/migration_008_feed_sources.sql` — new `feed_sources` table,
  `feed_format`/`feed_status` enums, RLS (public insert-only, always
  pending), `events.feed_source_id` FK.
- `api/submit-feed.js` — submission endpoint.
- `api/admin-feeds.js` — approval/pause/resume endpoint.
- `api/cron-feeds.js` — the generic ICS poller. `icsEventsToRows()` now
  derives each event's category via `scripts/press-coverage-linking.js`'s
  existing `extractCategory()` (see "Production track record" above),
  falling back to `feedSource.default_category` only when unmatched — no
  change to `extractCategory()`/`CATEGORY_KEYWORDS` itself.
- `test/cron-feeds-category.test.js` (2026-09-29) — per-event category
  derivation contract tests (confident match overrides default, no-match
  falls back, identical across `location_per_event`, representative real
  Congregation fixtures) — deliberately does not lock in the full 30-event
  production distribution, since the shared taxonomy/keyword list is
  expected to evolve.
- `api/_lib/ics-location.js` (2026-09-29) — per-`VEVENT` `LOCATION` parser
  for the `location_per_event` feeds above; shared infrastructure also
  intended for Phase 6's future Tribe (`WP 6.4`) and CivicPlus (`WP 6.8`)
  batches — see `project/epics/EPIC-001-ingestion-platform-scaling/phase-6-platform-adapters-coverage.md`.
- `api/_lib/venue-lookup.js` — added `resolveVenueFromCandidate()`, reusing
  the same exact-match-only tiers as SH.1's own repair, for resolving a
  per-event `LOCATION` candidate rather than a whole feed's `venue_name`.
- `supabase/migration_043_feed_sources_location_per_event.sql` — the
  `location_per_event` opt-in column.
- `submit.html` — added the tab switcher and the feed-submission form;
  also added `sports` to the shared category list (present in the data
  model since `migration_007_sports_category.sql` but missing from this
  page's own category picker until now) and fixed `#confirmPanel`'s stale
  placeholder copy ("in production, this would enter a moderation queue")
  to reflect that it already does.
- `admin.html` — added the "Feed sources" section and its status-grouped
  card rendering.
- `vercel.json` — new daily cron entry + `maxDuration: 60` (same override
  `cron-metrotimes.js` already needed, for the same reason: fetching
  several external URls in one run can run long).

### 2026-10-03 update (RSS + manual intake) — see that section above

- `supabase/migration_044_feed_sources_rss_and_manual.sql` — adds
  `'manual'` to the `feed_format` enum.
- `api/submit-feed.js` — accepts `'manual'` as a `feedFormat`; fixed the
  missing `'gaming'` category; format-aware notification email.
- `api/cron-feeds.js` — `parseRssItems()`/`extractExplicitDateFromText()`/
  `parseRssPubDate()`/`rssEventsToRows()` (new); `upsertParsedRows()`
  factored out and shared by the ics and rss branches (same fail-closed
  status-lookup guarantee, now in one place); a `'manual'` row is always
  skipped, never fetched.
- `submit.html` — feed tab now has a real format picker (ICS / RSS / no
  feed at all) instead of a hardcoded `'ics'`; per-format label/hint text.
- `admin.html` — feed cards now render format-aware link/poll-status
  lines (`feedLinkLineFor()`/`feedPollStatusLineFor()`), and a `'manual'`
  row gets a visible "needs manual follow-up" badge.
- `test/submit-validation.test.js`, `test/submit-feed-validation.test.js`,
  `test/admin-feeds-actions.test.js` (new — these three endpoints had no
  coverage before this), `test/cron-feeds-rss.test.js`,
  `test/cron-feeds-manual-skip.test.js`.
