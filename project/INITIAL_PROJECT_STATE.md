# 313.events — Initial Project State Report

One-time reconstruction, produced 2026-09-21 as part of establishing the `/project` workflow. This is a historical snapshot, not a living document — `PRODUCT.md`/`ROADMAP.md`/`BACKLOG.md`/`DECISIONS.md` are the living ones going forward.

## Method

Direct inspection of the live repository (`313events-site`, via the device bridge) as of commit `4cfd997`: `README.md`, `AUDIT_AND_ARCHITECTURE.md`, `FOUNDATIONAL_ITEMS.md`, `SERVICE_AREA.md`, `SOURCE_REGISTRY_ARCHITECTURE.md`, `NEW_SOURCES_RESEARCH.md`, `FEED_SUBMISSIONS.md`, `FACEBOOK_SETUP.md`, `DISCOVERY_PHASE1_AUDIT.md`, `FEATURE_BACKLOG.md`, all 32 numbered `supabase/migration_*.sql` files plus `schema.sql`, the full `api/` directory listing and several key files (`api/_lib/venue-lookup.js`, `vercel.json`), and recent `git log`. Cross-referenced against the separately-produced `INGESTION_PLATFORM_ARCHITECTURE.md` / `INGESTION_BACKLOG.md` (a full ingestion-system audit and scaling design completed the same day, prior to this reconstruction).

## Existing functionality (confirmed live in code)

A static-HTML/vanilla-JS calendar (`index.html` + `calendar.html`/`map.html`/`radar.html`/`venues.html`) reading `events_public` from Supabase, with event submission, moderation, 23 scheduled ingestion crons (one per source, plus a generic self-service ICS feed poller), editorial-article-to-event matching, Facebook auto-posting (code-complete, external setup incomplete), and automated daily healthchecks. Full detail in `PRODUCT.md`.

## Partially implemented functionality

- **`organizers`** — schema exists (migration_002), deliberately populated with only one real entry (Paxahau). No organizer-facing pages.
- **`sources`** — schema exists (migration_004, 26 fields), fully disconnected from the live pipeline; no code populates or queries it.
- **Venue geography** — `venues.lat`/`lng`/`zip_code` columns exist, essentially unpopulated for most rows.
- **Neighborhood assignment** — real for the ~22 venues explicitly reviewed in migration_002/005, with confidence tiers recorded; not attempted for the ~60 other venues implied by 83 total venue rows referenced in `venue-lookup.js`'s comment.
- **Structured event time** — `time_display` is a loose string; no real `start_time` column.
- **Facebook auto-post** — code complete, inactive pending Jody's external Meta App Review process.

## Resolved since the last time these were documented (consolidation-relevant)

Three separate documents (`FOUNDATIONAL_ITEMS.md`, `DISCOVERY_PHASE1_AUDIT.md`, `AUDIT_AND_ARCHITECTURE.md`) each flagged `events.venue_id` as permanently unpopulated as a load-bearing gap. This was closed 2026-09-13 (`api/_lib/venue-lookup.js` + a one-time backfill migration) — those three documents are now stale on this specific point. Similarly, `AUDIT_AND_ARCHITECTURE.md`'s "no per-entity URLs exist" finding is stale: `event-template.html`/`venue-template.html`/`venues.html` now exist.

## Known bugs / open technical questions found

- `BUG-001` — unverified: does a failed cron status-lookup risk re-approving a previously-rejected event? Flagged during architecture review, not yet confirmed against live code.
- `DEBT-001` — the Detroit Orbit 75-mile boundary is enforced server-side only in `cron-ticketmaster.js`; no other write path checks it.
- 67 gaps (S1–S4 severity) documented in `INGESTION_PLATFORM_ARCHITECTURE.md` §1, covering the ingestion system specifically — not reproduced here; see that document.

## Documented future work / unfinished migrations

- `SOURCE_REGISTRY_ARCHITECTURE.md`'s Phases 2–4 (populate/classify/build ingestion code against the `sources` registry) were never started — Phase 1 (schema) is the only piece that shipped.
- `DISCOVERY_PHASE1_AUDIT.md`'s full discovery-shell design (time/location navigation) — designed, not started.
- `AUDIT_AND_ARCHITECTURE.md`'s Phase 2–4 (organizer/neighborhood schema — partially done — venue/organizer profile pages, event detail pages, map/search expansion) — partially done (venue/event pages shipped; organizer pages and map view not built as dedicated pages, though `map.html` exists and its actual functionality wasn't independently verified in this pass).

## No commented-out functionality or stray TODO/FIXME/HACK markers were found

A repo-wide grep for `TODO|FIXME|XXX|HACK` across `api/*.js` and `*.html` returned no matches — this codebase's convention is evidently to document open work in root-level `.md` files (now being consolidated into `/project`) rather than inline code comments.

## Existing planning docs — consolidation recommendation

`README.md` is materially stale (describes a 4-cron, Detroit-only product) — `TASK-001` tracks bringing it current. `FEATURE_BACKLOG.md` is a second, drifting backlog (doesn't reflect that its own item #2 already shipped) — `TASK-002` tracks folding it into this `/project` structure. `AUDIT_AND_ARCHITECTURE.md`, `FOUNDATIONAL_ITEMS.md`, and `DISCOVERY_PHASE1_AUDIT.md` remain valuable as historical design records (their reasoning and research are real and cited throughout `PRODUCT.md`/`DECISIONS.md`) but contain some now-stale factual claims (see above) — recommend adding a short "superseded in part, see `/project`" note at the top of each rather than deleting them, so the research isn't lost. `SOURCE_REGISTRY_ARCHITECTURE.md` needs the reconciliation decision tracked as `DISCOVERY-005` before its own status can be called current or superseded. `SERVICE_AREA.md` remains fully current and authoritative — no change recommended.

## Historical ideas explicitly not treated as active scope

`FEATURE_BACKLOG.md`'s visitor-profiles/social-chat suggestion is captured as `EPIC-005` / `DISCOVERY-003`, `IDEA` status — not assumed to be wanted, not scoped, not started.
