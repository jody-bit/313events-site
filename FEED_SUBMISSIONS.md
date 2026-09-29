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

`feed_sources.feed_format` accepts `'rss'` too (so the schema doesn't need
a migration later), but **`api/cron-feeds.js` only actually parses
`'ics'`** — an `'rss'` row is recorded every run as "not polled" rather than
guessed at. Auto-parsing generic RSS into event dates would risk silently
wrong information, which this project has a specific, hard-won reason to
avoid (see the HTML-entity-leak fix earlier this project). Shipping
ICS-only now and documenting RSS as a real but unfinished case beats
half-supporting it. The submit form doesn't even offer RSS as an option
today — only ICS.

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

## Known v1 limitations (real, not silently papered over)

- **No RRULE expansion.** A recurring event with no explicit further
  instances is read as its single `DTSTART` occurrence only. Most
  subscription-oriented exports (Google Calendar's "secret address",
  WordPress's Events Calendar plugin) already expand near-term recurring
  instances into individual `VEVENT`s on their own, so this covers the
  common case — a feed relying on `RRULE` expansion for far-future dates
  will undercount until re-polled closer to each occurrence.
- **RSS is schema-ready but not implemented.** See above.
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
