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

## Known v1 limitations (real, not silently papered over)

- **No RRULE expansion.** A recurring event with no explicit further
  instances is read as its single `DTSTART` occurrence only. Most
  subscription-oriented exports (Google Calendar's "secret address",
  WordPress's Events Calendar plugin) already expand near-term recurring
  instances into individual `VEVENT`s on their own, so this covers the
  common case — a feed relying on `RRULE` expansion for far-future dates
  will undercount until re-polled closer to each occurrence.
- **RSS is schema-ready but not implemented.** See above.
- **One feed = one venue.** A multi-location organizer's feed will have
  every event attributed to the single venue name given at submission,
  regardless of each `VEVENT`'s own `LOCATION` field. Fine for the
  target case (a single venue registering its own calendar); wrong for an
  organizer that runs events at several different rooms/venues under one
  feed. Not solved now — flagged for whoever hits it.
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
- `api/cron-feeds.js` — the generic ICS poller.
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
