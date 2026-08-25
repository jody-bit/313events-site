# 313.events — Cultural Event Source Registry: Architecture Comparison

Written 2026-08-25 in response to a request to evaluate a proposed "Cultural
Event Source Registry" framework against the current 313.events architecture,
before any schema migration or ingestion code is written. **No schema changes
or new ingestion code have been made as a result of this document** — it is
analysis only, pending sign-off.

Companion file: `_research/313events_source_registry_draft.xlsx` — a 213-row
working draft covering the venue-taxonomy piece of this framework, produced
by a 7-zone web research sweep of the 75-mile radius. It is raw research
data, not yet loaded into Supabase. See its "Read Me" tab for exactly what it
does and doesn't cover.

## 1. What already exists

- A two-table Supabase schema: `venues` (name, address, city, website,
  lat/lng) and `events` (category enum, `status` workflow of
  `pending_review` / `approved` / `rejected`, a free-text `source` field,
  `external_id` for upsert/dedupe, `ticket_url`, pricing fields).
- Nine serverless cron functions (`api/cron-*.js`), each hardcoded to exactly
  one source: seven single-venue scrapers (Trinosophes, Redford Theatre,
  Cinema Detroit, Dossin, Halo, WDET, Belle Isle Nature Center) plus two
  broader regional sources (Metro Times — a general community calendar,
  currently blocked; Ticketmaster — a radius-based API search, not yet keyed).
- `sources.html` — a manually maintained, human-readable transparency page
  documenting each of those nine sources' confidence tier (high/moderate/
  blocked) and reasoning in prose. This is the closest thing to a "source
  registry" today, but it's prose in an HTML table, not structured/queryable
  data, and it only covers the nine sources that already have cron code
  written — none of the ~213 venues found in today's sweep, and nothing for
  promoters, festivals, presenters, or ticketing platforms as their own
  entities.
- `submit.html` + `api/submit.js` — an open intake channel for any
  organizer/venue in the 75-mile radius to self-submit events (lands as
  `pending_review`). No source-type distinction is captured on submission.
- `SERVICE_AREA.md` — the authoritative 75-mile geography reference (center
  point, distance table, explicit in-scope/just-outside lists, resolved
  naming and neighborhood-scope decisions).
- A documentation convention of writing real architecture/scope decisions
  into standalone root-level `.md` files (`AUDIT_AND_ARCHITECTURE.md`,
  `FOUNDATIONAL_ITEMS.md`, `SERVICE_AREA.md`) rather than letting them live
  only in code comments or chat — this document follows that same pattern.
- A "fail soft, document honestly" convention in the crons: a blocked or
  broken source returns HTTP 200 with an `error` field rather than throwing,
  and gets written up transparently in `sources.html` even when it doesn't
  work (e.g. Metro Times' confirmed 403).

## 2. What is missing

- **No `sources` table or equivalent entity in Supabase at all.** A source's
  existence today is implicit in "does a cron file exist for it" — there's
  no way to query "how many sources do we know about" or "which are
  promoters vs. venues vs. ticketing platforms" without reading code and
  prose by hand.
- **No source-type distinction anywhere in the data model.** `events.source`
  is a free-text label ('Manual', 'Ticketmaster', 'Venue Submission', a
  scraper's own string), not a foreign key into any registry, and it doesn't
  capture whether that source is a venue, promoter, presenter, festival,
  ticketing platform, or aggregator.
- **No venue-type taxonomy.** The existing `event.category` enum
  (music/theatre/dance/visual/museum/family/fest/food/film/nightlife)
  describes the *event's genre*, not the *venue's nature* — there's no field
  distinguishing an arena from a DIY space from a jazz club from a gallery.
- **None of the 26 requested per-source fields exist** — ticketed yes/no,
  primary/secondary ticketing platform, ticketing URL, affiliate-program
  availability, public API/RSS/iCal/JSON-LD availability, robots.txt
  findings, ingestion-method classification, automation feasibility,
  monetization opportunity, priority, last-checked date. None of this is
  tracked today, structured or otherwise.
- **Promoters, presenters, festivals, and aggregators aren't modeled at
  all.** The current architecture implicitly assumes "a venue produces its
  own events" — that breaks for a promoter booking shows across multiple
  rooms, a festival with no fixed address, a university arts program
  spanning several venues, or a film society that rents different theaters.
- **No monetization/affiliate tracking anywhere.** `ticket_url` is just an
  outbound link — nothing distinguishes an affiliate-tagged link from a
  plain courtesy link, or names which network it's tagged through.
- **No reverse-discovery work has been done.** Today's sweep (see the
  companion spreadsheet) was geography-first / venue-first. It did surface
  a long list of ticketing platforms in the wild (Ticketmaster, AXS, Etix,
  TicketWeb, ShowPass, TixHub, OvationTix, Crowdwork, LocalHop, ThunderTix,
  Tock, SevenRooms), but did not yet work backward from those platforms, nor
  research promoters, presenters, festival producers, university arts
  programs, film societies, or gallery collectives as their own entities.

## 3. What should be modified

- `events.source` (free text) should become a foreign key to a new
  `sources` table, so a source's metadata (type, ticketing platform,
  affiliate status, ingestion method) is defined once and referenced by
  every event it produces, instead of re-typed as a string per cron/event.
- `venues` needs a venue-type field (the taxonomy the framework specifies —
  arena/club/jazz/DIY/gallery/museum/etc.) since today `venues` only
  captures name/address/city/website/coordinates and says nothing about what
  kind of space it is.
- The cron architecture (one hardcoded JS file per source) should pair with
  a `sources` table row per cron, so each cron's ticketing platform,
  ingestion method, and last-checked status live in queryable data instead
  of only in `sources.html` prose and code comments.
- `sources.html` shouldn't disappear — it's a good public-facing
  transparency page and matches the project's existing "always document,
  never silently drop" ethos — but once a structured registry exists, it
  should be *generated from* that data rather than hand-maintained, or the
  two will drift out of sync the same way the Metro Times/radius gaps did
  before.

## 4. What should remain unchanged

- The two-table `events`/`venues` core schema stays. It's the right shape
  for what actually gets published on the calendar; the registry is a new
  layer *above* it (a `sources` table plus a venue-type field), not a
  replacement.
- `events.status` (`pending_review`/`approved`/`rejected`) and the existing
  Row Level Security policies are correct and unrelated to source
  classification — no reason to touch them.
- `submit.html`/`api/submit.js`'s open, unrestricted intake for any
  organizer in the 75-mile radius stays open. The registry is about
  proactively *finding* sources, not gatekeeping who can self-submit.
- `SERVICE_AREA.md` stays the single source of truth for geography — the
  registry should reference it, not recompute or duplicate the radius logic.
- The "fail soft, document honestly" cron pattern (200 + error field instead
  of throwing; documented transparently even when blocked) is a good
  pattern and should extend to whatever new ingestion methods get built.

## 5. Recommended next phase

**Phase 1 — schema only, no ingestion code.** Add a `sources` table with the
26 requested fields (name, source_type, venue_type/category, city,
state/province, country, website, events/calendar URL, ticketed y/n/
sometimes, primary/secondary ticketing platform, ticketing URL, affiliate
availability, API/RSS/iCal/JSON-LD availability, other structured data,
extraction feasibility, robots.txt notes, integration status, ingestion
method, automation feasibility, monetization opportunity, last-checked,
priority, notes). Add a `venue_type` column to `venues`. Point
`events.source` at `sources.id` (keep the free-text column temporarily for
backfill, drop it once migrated).

**Phase 2 — populate the registry, still no ingestion code.** Load the 213
venues from today's sweep in as a first pass (`source_type = 'venue'`), then
run the reverse-discovery research the framework specifically calls for and
today's sweep didn't do: starting from the ticketing platforms already
surfaced (Ticketmaster, AXS, Etix, TicketWeb, ShowPass, TixHub, OvationTix,
Crowdwork, LocalHop) and working backward to venues/promoters on each, plus
direct research into regional promoters, presenters, festivals, university
arts programs, film societies, and gallery collectives that produce events
without owning a permanent venue.

**Phase 3 — classification pass.** For every row, assign one of the
ingestion-strategy classifications (API / Structured Website Data / RSS-
iCal / Permitted Website Extraction / Ticketing Platform Feed / Manual
Curation / Direct Partnership Required / Unable to Ingest-Restricted) and a
priority, verifying (not inferring) the technical fields the draft
spreadsheet currently marks "Unconfirmed" — actual API/RSS/iCal/JSON-LD
availability and robots.txt terms, one source at a time.

**Phase 4 — only after 1-3 are reviewed.** Build or extend ingestion code:
new crons, or ideally a generalized cron template driven by a source row's
`ingestion_method` field instead of one bespoke JS file per source, starting
with whichever rows Phase 3 marks highest priority and highest automation
feasibility.

Holding off on any schema migration or new cron code until this plan is
confirmed.
