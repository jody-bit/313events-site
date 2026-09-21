# 313.events — Product

This file is the durable record of what 313.events *is*: purpose, users, scope, capabilities, rules, and non-negotiable constraints. It should change infrequently — only when the product itself genuinely changes, not every session. Everything in it is sourced from the repository (code, schema, and prior architecture/decision documents actually committed to the repo) as of 2026-09-21. Nothing here is invented; anywhere the repo doesn't give a clear answer, that's marked `PRODUCT DECISION REQUIRED` with a linked backlog item instead of guessed at.

## Purpose

A comprehensive, filterable public calendar of arts, culture, nightlife, and community events across the Detroit region — modeled originally on ClevelandArtsEvents.com. The product's own stated goal for its ingestion side (from the 2026-09-21 architecture request) is "comprehensive event discovery," not merely more scrapers — an ingestion *platform* that can keep expanding coverage without becoming more fragile as it grows.

## Users

- **Event-goers** — the public, browsing/filtering the calendar (`index.html`, `calendar.html`, `map.html`, `radar.html`) to find things happening now, today, tonight, or in a date range.
- **Venues and organizers** — submit individual events (`submit.html` → `pending_review`) or register an ongoing calendar feed for automatic polling (`submit.html`'s feed tab → `feed_sources`, human-approved before polling starts).
- **Jody (Product Owner / moderator)** — reviews and approves/rejects submissions and feeds via `admin.html`'s tabbed queues (smoke tests, editorial review, user-submitted events, feed sources, "needs follow-up" gaps), and is the sole authority for backlog acceptance under this project's workflow.

## Geographic scope — the Detroit Orbit

The service area is a 75-statute-mile radius, measured from **Detroit's actual municipal border** (not a center point), spanning Michigan, Ohio, and Ontario. `SERVICE_AREA.md` is the authoritative source for this definition, its history, and its full in-scope/just-outside city tables — this file summarizes, `SERVICE_AREA.md` governs.

- Switched from center-point to border-point measurement 2026-09-20 (same 75-mile figure, more honest reference point — a strict expansion, nothing previously in-scope drops out).
- Boundary source: City of Detroit's own ArcGIS `City_of_Detroit_Boundary` layer, Douglas-Peucker-simplified to 70 points and embedded in `api/_lib/detroit-boundary.js` (server) and `index.html` (client, as a 96-entry `LOCATIONS` array covering 56 cities + 40 Detroit neighborhoods used as search origins).
- International and cross-state reach is real, not incidental: Windsor, Chatham, and Sarnia (Ontario), and Toledo/Bowling Green (Ohio) and Lansing/East Lansing (Michigan) are all in scope.
- **Enforcement today is inconsistent.** The 75-mile radius is enforced server-side only in `api/cron-ticketmaster.js` (the one cron that queries by geographic radius) and client-side in `index.html`'s search-origin logic. No other cron, and no server-side validation on manual/feed/editorial event creation, currently checks a new event against the Orbit boundary. This is a real gap, not a designed exception — see `DEBT-001` in `BACKLOG.md`.

## Coverage goals

Grow from the current source set (23 scheduled cron jobs, one per source, plus a generic self-service ICS feed poller) toward comprehensive coverage of the full Detroit Orbit — potentially hundreds to thousands of sources — without the ingestion system becoming more fragile as it scales. This is the subject of the proposed Ingestion Platform Scaling initiative (`ROADMAP.md`, `epics/EPIC-001-ingestion-platform-scaling.md`); it is a proposed design awaiting Product Owner review, not yet an accepted architecture.

## Capabilities that exist today (verified against code, 2026-09-21)

**Public site** (static HTML/CSS/vanilla JS, no framework/build step): `index.html` (calendar — month/list view, category chips, free-only toggle, text search, day-detail panel, static-data fallback if Supabase is unreachable), `calendar.html`, `map.html`, `radar.html`, `venues.html`, `event-template.html` + `venue-template.html` (server-rendered per-entity pages with dynamic OG cards via `api/event-meta.js` / `api/venue-meta.js`), `sources.html` (public transparency page listing data sources and their real connection status), `install.html`.

**Submission & moderation**: `submit.html` (single-event form → `api/submit.js` → `pending_review`; feed-registration tab → `api/submit-feed.js` → `feed_sources`, `pending_review`), `admin.html` (tabbed: smoke tests, editorial review, user submissions, feed sources, "needs follow-up" — each tab shows a pending-count badge), backed by `api/admin-events.js`, `api/admin-feeds.js`, `api/admin-editorial.js`, `api/admin-venues.js`, `api/admin-healthcheck.js`. Gated by `ADMIN_SECRET`.

**Automated ingestion**: 23 Vercel Cron jobs (`vercel.json`, one hour apart, `0 0-23 * * *` spread), each hardcoded to one source except `cron-feeds.js` (generic ICS poller over every approved `feed_sources` row) and `cron-ticketmaster.js` (radius-based API search covering Ticketmaster/TicketWeb/Front Gate/MoshTix/Universe sub-brands). `cron-editorial.js` pulls press/editorial articles and attempts to match them to existing events (`editorial_articles`, `editorial_article_events` tables) for the admin editorial-review queue. `cron-post-to-facebook.js` posts newly-approved events to 313.events' own Facebook Page feed (code complete; blocked on Jody completing Meta's external App Review process — see `BACKLOG.md`). `cron-healthcheck.js` + `healthchecks` table + `admin-healthcheck.js` give a daily automated check with pass/fail history.

**Self-service feed intake**: any venue/organizer can register their own ICS calendar URL through `submit.html`; after one-time human approval, `cron-feeds.js` polls it automatically and its events auto-publish as `approved` directly (the source itself was vetted at approval time — see `DECISIONS.md` DEC-008).

## Data model (as of migration_034)

Two core tables, plus supporting registries:

- **`venues`**: name, address, city (default `'Detroit'`), website, lat/lng, `neighborhood_id` (FK, Detroit-only), `neighborhood_confidence` (`geographic|multi_source|single_source|editorial_judgment|unconfirmed`), `neighborhood_source` (citation), `zip_code`, `venue_type` (free text), social links (Instagram/Facebook/TikTok/X).
- **`events`**: title, description, `category` (enum, `NOT NULL`, 14 values — see Taxonomy below), `venue_id` (FK, resolved going-forward via exact-name match — see DEC-012), `venue_name_raw`/`venue_city_raw`/`venue_address_raw` (free-text fallbacks, always used for display via `events_public`'s `coalesce`), `start_date` (`date`, `NOT NULL`) + `end_date` + `time_display` (loose human string, no structured time/timezone column exists), `is_all_day`, `is_free` (`NOT NULL`), `price_from`, `ticket_url`, `event_url` (distinct — a listing page vs. a buy-tickets link), `image_url`, `source` (free text, being migrated to `source_id` FK — see below), `status` (`pending_review|approved|rejected`), `note` (public-facing caveat) vs. `internal_note` (admin-only, never public), `external_id` (unique, the upsert/dedupe key, scoped per source), `ticket_status` (Ticketmaster-only), `is_clothing_optional`, `followup_dismissed` (+note/timestamp, for the admin "needs follow-up" queue), `neighborhood_id`/`confidence`/`source` (event-level exception path only, for pop-ups with no venue row), `organizer_id` (FK, largely unpopulated).
- **`categories`**: a real table (migration_026), not just the enum — 14 rows: music, theatre, dance, visual, museum, family, fest, food, film, nightlife, sports, community, vendor, training.
- **`organizers`**: schema exists (migration_002) but is deliberately, mostly unpopulated — see "Source ≠ organizer" below.
- **`sources`** (migration_004): a 26-field research/registry table (source type, ticketing platform, API/RSS/ICS/JSON-LD availability, robots.txt findings, ingestion method, priority, etc.) — schema exists but **no code populates or queries it today**; it's disconnected from the live pipeline. `events.source_id` FK exists but is unused.
- **`feed_sources`** (migration_008): live, in active use — the self-service ICS feed queue described above.
- **`neighborhoods`**: 39 Detroit-only reference rows (design/practical set, not a legal boundary survey) — see "Neighborhood scope" below.
- **`editorial_articles`** / **`editorial_article_events`**: press-article-to-event matching for the editorial review queue.
- **`healthchecks`**: daily automated pass/fail run history.
- **`schema_migrations`**: append-only log of applied migration filenames.

Views: `events_public` (the only view the public site actually reads — approved events joined to venue/neighborhood display fields).

## Editorial and data principles (repo conventions, apply project-wide)

- **Never guess.** Dates, venues, categories, the free/paid flag — if a source doesn't say, the field stays empty/null rather than being inferred. Applies to geography too (no invented neighborhoods, no fabricated coordinates).
- **Honest-gap convention.** A blocked, broken, or partial source fails soft (HTTP 200 + an `error` field, not a thrown exception) and is documented transparently on `sources.html` even when it doesn't work, rather than silently omitted.
- **Source ≠ organizer.** `events.source` records *where the listing was found* (an aggregator, a venue's own page, Ticketmaster); an organizer is *who's presenting it*. Auto-deriving organizers from `source` would fabricate organizer entities for what are really just aggregators. `organizers` is populated by hand-curation only, starting from names clearly visible as real promoters/institutions in the data (Paxahau is the only one populated so far).
- **Visibility ≠ authorization.** A page being publicly viewable doesn't mean automated access to it is permitted. robots.txt and Terms of Use are both checked and respected; the project does not bypass blocks, CAPTCHAs, or logins. Sources explicitly ruled out on this basis: Resident Advisor, Dice, AXS (and its venue network), Eventbrite's public search (deprecated 2020), Facebook (no public events API), Model D Media (ToS explicitly bars scraping/aggregation/republishing), BridgeDetroit (content license bars bulk republishing), and two venues that explicitly name AI/Claude crawlers in `robots.txt` — Senate Theater and Detroit House of Comedy/The Congregation Detroit — never scraped, by design.
- **An invited feed pull is not crawling.** When a venue/organizer hands over their own calendar URL through the self-service feed form, robots.txt (aimed at uninvited bots) doesn't govern that pull the same way — see `FEED_SUBMISSIONS.md` and DEC-008/DEC-010.
- **`SERVICE_AREA.md` is the geography authority.** No other file should redefine or recompute the Orbit radius or boundary independently.
- **Extend existing architecture, do not replace it**, absent an explicit decision to the contrary. The per-source-cron model, the `events`/`venues` two-table core, and the status-preserving upsert pattern are all treated as load-bearing and are only extended, not casually rewritten (see DEC-006, DEC-013).
- **Status-preserving upsert is mandatory for every cron.** Before any `POST .../events?on_conflict=external_id` upsert, the cron must first read the current `status` of any matching `external_id` rows and preserve a moderator's prior approve/reject decision — re-running a cron must never silently reset a rejected event back to visible, or an approved one back to pending. This became a hard rule after a live incident (Lager House, 2026-09-02).

## Non-negotiable constraints

- Public reads use the anon/publishable Supabase key and can only ever see `status='approved'` events (Row Level Security) — pending/rejected rows are never exposed client-side.
- Writes from crons/admin use the `service_role` key, server-side only, never shipped to the browser.
- A submitter can never self-approve — the insert RLS policy hard-codes `status='pending_review'` regardless of what the client sends.
- `internal_note` must never be selected by `events_public` or rendered anywhere public (migration_029) — this was written specifically because internal bookkeeping notes had previously leaked into the public `note` field (see `migration_015`/git history "Fix internal research notes leaking into the public note column").
- The 75-mile Detroit Orbit, border-measured, is the service area — see the enforcement gap noted above (`DEBT-001`) for where this isn't yet actually checked.
- No product functionality is implemented as a side effect of project-management/documentation work (this file's own creation included).

## Taxonomy

14 event categories (see `categories` table above) — `slug`/`label`/`color_var`/`sort_order`: music, theatre (Theatre & Comedy), dance (Dance & Opera), visual (Visual Arts), museum (Museums & History), family, fest (Festivals & Parades), food (Food & Markets), film, nightlife (Nightlife & Club), sports, community, vendor (Vendor Markets), training (Classes & Training). No sub-genre/drill-down level exists yet — flagged as `IDEA` in `BACKLOG.md` (from `FEATURE_BACKLOG.md` #4).

**Neighborhood scope — resolved, Detroit-only by design.** The 39-neighborhood reference system is intentionally scoped to Detroit only; every other city/township in the 75-mile radius is tracked at the city level (`venues.city`), not broken into neighborhoods. See DEC-004.

**The "313" name — resolved, kept.** 313 is Detroit's area code; the service area includes cities with other area codes (734, 810, 517, 419, 519). Decision: keep the name — Detroit is the largest, best-known city in the service area and "313" reads as a regional identifier, the way "Metro Times" or "Crain's Detroit" do. See DEC-001.

## Product decisions required

The following are open questions this file cannot answer from the repo alone. Each has a corresponding backlog entry (`DISCOVERY-###` or a linked `STORY`/`EPIC`) in `BACKLOG.md`, and should not be treated as settled until Jody records a decision in `DECISIONS.md`.

- **`PRODUCT DECISION REQUIRED`** — Should the Ingestion Platform Scaling architecture (`epics/EPIC-001-ingestion-platform-scaling.md`) be adopted as designed, adopted with changes, or rejected in favor of a smaller-scope extension of the current per-source-cron model? See the 12 open questions in that architecture document's Appendix A (auto-creating "unverified" venues, Canadian geocoding provider, Resident Advisor/Instagram capture policy, JS-rendering worker, auto-publish thresholds, and others) — none of these are decided yet.
- **`PRODUCT DECISION REQUIRED`** — Should the visitor-accounts / social-chat feature ("MySpace vibe," `FEATURE_BACKLOG.md` #5) be pursued at all? It requires net-new authentication, real-time infrastructure, and a moderation model that doesn't exist anywhere in this project today. Currently `IDEA` only (`epics/EPIC-005-social-community-layer.md`).
- **`PRODUCT DECISION REQUIRED`** — Should a sub-genre/category drill-down (`FEATURE_BACKLOG.md` #4) be built given that most sources don't supply genre-level detail today, meaning real coverage would likely be thin at first?
- **`PRODUCT DECISION REQUIRED`** — Is the `sources` table (migration_004, currently fully disconnected from the live pipeline) still the intended registry layer, or superseded by the Ingestion Platform architecture's proposed `source_records`/ledger model? `SOURCE_REGISTRY_ARCHITECTURE.md`'s four-phase plan and the new architecture doc were written five weeks apart and were not explicitly reconciled with each other.
- **`PRODUCT DECISION REQUIRED`** — Should Organizers (schema exists, deliberately unpopulated beyond Paxahau) be actively built out as a curated feature, and if so, on what timeline relative to the Ingestion Platform work?
- **`PRODUCT DECISION REQUIRED`** — Is the Detroit Orbit boundary check meant to be enforced server-side on every ingestion path (not just Ticketmaster), including manual admin entry and self-service feeds? Today an out-of-Orbit event could be entered through any of those paths with nothing stopping it.

## Sources ruled out for automation (current, verified against README.md and NEW_SOURCES_RESEARCH.md)

Resident Advisor, Dice, AXS (Masonic Temple, The Fillmore Detroit, Majestic Theatre, Magic Stick, Cliff Bell's, El Club, Music Hall Detroit, PJ's Lager House), Eventbrite's public search API (deprecated 2020 — organizer-login-only access remains, not usable for Comedy Bar Detroit/Garden Theater/Planet Ant/New Dodge Lounge), Facebook (no public events API), Senate Theater (explicitly names AI crawlers in robots.txt), Detroit House of Comedy and The Congregation Detroit (explicitly block AI/Claude crawlers), Model D Media (ToS bars scraping/aggregation/republishing), BridgeDetroit (no standing calendar; content license bars bulk republishing anyway), Crain's Detroit (out of scope — business/networking events, not arts/culture/nightlife). Scarab Club has a usable per-event ICS feed but robots.txt explicitly blocklists ~150 named bots — recommended path is asking them directly rather than scraping, not yet done.
