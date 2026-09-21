# 313.events — Ingestion Platform Architecture

**Prepared:** 2026-09-20
**Status:** Design only. Nothing in this document has been implemented. No schema, cron, code, or source-page changes were made while producing it.
**Companion file:** `INGESTION_BACKLOG.md` (section 10: the phased work-package backlog).
**Builds on:** `PHASE0_acquisition_foundation_plan.md` (2026-09-05), `ASSESSMENT_regional_acquisition.md`, `SOURCE_REGISTRY_ARCHITECTURE.md`, `FEED_SUBMISSIONS.md`, `SERVICE_AREA.md`. Where this document agrees with those, it adopts their designs and says so. Where it departs from them, it says why.

**Objective:** find every event in the Detroit Orbit, continuously. The Detroit Orbit is every point within 75 miles of Detroit's municipal border, across Michigan, Ohio and Ontario. Coverage should keep growing without the system getting more fragile as it grows.

---

## Contents

- [0. Executive summary](#0-executive-summary)
- [0.1 What exists today (audited facts)](#01-what-exists-today-audited-facts)
- [1. Gap analysis](#1-gap-analysis)
- [2. Proposed ingestion architecture](#2-proposed-ingestion-architecture)
- [3. Source discovery and source registry](#3-source-discovery-and-source-registry)
- [4. Geographic coverage methodology](#4-geographic-coverage-methodology)
- [5. Deduplication and entity resolution](#5-deduplication-and-entity-resolution)
- [6. Source prioritization tiers](#6-source-prioritization-tiers)
- [7. Handling by source class](#7-handling-by-source-class)
- [8. Monitoring and failure detection](#8-monitoring-and-failure-detection)
- [9. Data-quality and coverage metrics](#9-data-quality-and-coverage-metrics)
- [10. Backlog (see INGESTION_BACKLOG.md)](#10-backlog)
- [Appendix A. Decisions needed from Jody](#appendix-a-decisions-needed-from-jody)
- [Appendix B. Current connector inventory](#appendix-b-current-connector-inventory)
- [Appendix C. Indicative Orbit county list](#appendix-c-indicative-orbit-county-list)

---

## 0. Executive summary

Today 313.events adds sources by writing code. Every automated source is its own serverless file with its own cron line in `vercel.json`, and its own copy of fetching, auth, entity decoding and upsert logic. There are 20 of these event-ingestion files: 6,547 lines, 4,167 of them non-comment. Beyond them, a large and growing share of the catalogue comes in by hand, as SQL files written one session at a time. There are 77 hand-written data SQL files in `supabase/` and `supabase/archive/`, covering 10 Resident Advisor pulls, 11 dedupe batches and 9 follow-up batches, all within four weeks. Both routes cost more per source than the last, and neither can reach hundreds or thousands of sources.

The fix is not more scrapers. It is to turn sources into data and build a small number of reusable adapters behind one pipeline:

1. **Sources become registry rows.** A row names the adapter to use (ICS, Tribe REST, Localist, JSON-LD and so on) and a config blob. Adding a source means inserting a row and approving a dry-run preview. No new file, no new cron line, no deploy.
2. **One staged pipeline with idempotent stages.** Every source, including hand captures, goes through the same stages: schedule, fetch, extract, normalize, validate, resolve entities (venue, geography), match to existing events, merge and publish, then reconcile what has disappeared. Each stage writes its own table, so any stage can be re-run, audited or tested alone.
3. **Records are not events.** Each sighting of an event in a source becomes a `source_record`. Canonical `events` rows are built from one or more records according to precedence rules and moderator field locks. This is the design `PHASE0` §2 proposed as `event_source_records`, adopted here. It makes deduplication reversible, lets cancellations propagate, and stops cron re-runs from overwriting moderator edits.
4. **Geography is computed once per venue, not guessed per event.** The Orbit becomes a stored PostGIS polygon: Detroit's official boundary buffered by 75 miles. Venues carry coordinates and a computed `in_orbit` flag, and events inherit it. The hard-coded city-name lookup in `index.html` (56 cities) gives way to a generated `places` table covering every municipality in the Orbit.
5. **Health is measured, not assumed.** Every run is logged. Detectors catch silent failures such as zero rows, sudden volume drops, placeholder values, block pages and drift in page structure. A per-source health state machine auto-quarantines broken sources and alerts on them. A daily digest replaces today's healthcheck, which is keyed on free-text source names and hard-coded lists.
6. **Coverage is measured, not felt.** A coverage matrix tracks sources and upcoming events per municipality × category. A benchmark recall sample and capture–recapture estimates put numbers on "how much are we missing". A dependency-concentration metric tracks reliance on any single source; Ticketmaster alone was 81% of upcoming approved events on 2026-09-05.

The migration is incremental ("strangler" pattern). Existing crons keep running until each is re-expressed as an adapter plus registry row and passes a shadow-mode parity check. Nothing is replaced wholesale. That honours the project's standing rule, "extend existing architecture; do not replace it". The stack stays Vercel + Supabase, adding Postgres extensions already available on Supabase (PostGIS, pg_trgm, pg_cron). The one optional addition is a separate worker for the few JavaScript-rendered sources whose terms permit automated access.

Section 1 lists the 67 gaps found. Several of them are live defects today, before any scaling work. The worst:

- `cron-belle-isle-nature-center.js` throws on every run.
- Every cron re-run overwrites moderator edits to fields other than `status`.
- No source ever retires an event that was cancelled or removed.
- The Ticketmaster query is probably truncated at the API's 1,000-result cap.
- A failed fetch reports HTTP 200, so the Vercel dashboard stays green.
- If the pre-write status lookup fails, rejected events (including dedupe rejections) are re-approved. This needs verifying immediately.

These are grouped into a Phase 0 "stabilize and instrument" batch of small, independent fixes that come before any architectural work.

---

## 0.1 What exists today (audited facts)

Everything in this subsection was verified directly against the repository at commit `4cfd997` (2026-09-20) unless marked otherwise. File:line references are to that commit.

| Area | Current state |
|---|---|
| Hosting | Vercel serverless (CommonJS, native `fetch`, **no `package.json`, no dependencies, no tests**) + Supabase Postgres via PostgREST, plus Supabase Storage (`event-flyers` bucket). |
| Scheduling | 23 `vercel.json` cron entries, all once daily at distinct UTC hours: 20 event-ingestion crons, plus `cron-editorial` (articles), `cron-healthcheck` and `cron-post-to-facebook`. |
| Connectors | 18 bespoke single-source crons, `cron-ticketmaster` (Discovery API, radius search) and `cron-feeds` (generic ICS poller over approved `feed_sources`). See Appendix B. |
| Parsing | Regex only. No DOM parser. `decodeEntities` is copy-pasted into 20 files and `timingSafeStringEqual` into 28. |
| Write path | Per cron: an optional status lookup `GET events?external_id=in.(…)`, then `POST events?on_conflict=external_id` with `Prefer: resolution=merge-duplicates`. About 45 lines duplicated 18+ times. |
| Identity | One unique index on `events.external_id` (`schema.sql:103`). IDs are prefixed per source. At least five connectors build IDs from the title (E2). |
| Registry | `sources` table (migration_004) exists but **nothing in `api/` or any page reads or writes it** (grep: zero references). `feed_sources` (migration_008) is a separate, working table for organizer-submitted ICS feeds. The research lives in three unreconciled spreadsheets: 213 draft venues, a 20-row SOURCE MASTER and a 52-row PRODUCTION REGISTRY. |
| Events model | `start_date date` + `time_display text` (a human string). No start timestamp, no timezone, no country or province, no currency. Moderation `status` enum: `pending_review`, `approved`, `rejected`. `ticket_status` text is set only for Ticketmaster. `is_recurring` exists, but nothing reads it. |
| Venues | `venues` has `lat`/`lng` columns, but most are unpopulated (per `DISCOVERY_PHASE1_AUDIT.md` §1). Since 2026-09-13, `_lib/venue-lookup.js` links `venue_id` by exact normalized name, never fuzzy, never creating venues. |
| Geography | Server side, only `cron-ticketmaster` applies the 75-mile-from-border rule (`_lib/detroit-boundary.js`). `cron-wdet` applies a narrower Detroit/Hamtramck/Highland Park allowlist. The other connectors apply nothing. Client side, `index.html` matches `venue_city` strings against the 56 city entries of a hard-coded 96-entry `LOCATIONS` list (`index.html:4665`, `4783-4787`; the other 40 entries are Detroit neighborhoods used only as search origins). An event whose city string isn't in that list is excluded from the Orbit view and from the hero count (`index.html:5503-5516`, `5617-5621`). The boundary polygon is duplicated in `index.html:4830` and `_lib/detroit-boundary.js`. |
| Dedupe | Same source: by `external_id`. Cross source: only `cron-visitdetroit` (one direction, normalized title + date). Everything else is manual SQL: 11 `*dedupe*` files, which mark losers `status='rejected'` (sometimes they hard-delete). |
| Monitoring | `cron-healthcheck` (daily) checks pages, auth, and "source freshness" (was any row with `source = '<free text>'` updated in N days?). It writes a JSON blob to `healthchecks`. Its hard-coded lists are missing 5 newer crons from auth checks and 3 from freshness checks. There is no alert channel. Failed fetches in connectors return **HTTP 200** with an `error` field. |
| Moderation tooling | `admin.html` tabs: pending review, follow-up queue (missing fields), feeds, editorial matching, venues. `update_fields` fills empty fields only. Dedupe, merges, venue fixes and bulk corrections happen in hand-written SQL, outside the app. |
| Manual lane | Resident Advisor, Instagram flyers (Paris Bar), Visit Detroit, Cranbrook and similar are captured in agent-assisted sessions and applied as `insert … on conflict (external_id) do update` SQL files. These bypass all validation, venue resolution and dedupe logic. |
| Volume (from in-code comments) | About 1,492 event rows (2026-09-13) and 83 venues (2026-09-13). 981 upcoming Ticketmaster events were 81% of all upcoming approved events (2026-09-05). |

### Conventions worth keeping

The audit also found conventions that are right and that the new design must preserve:

- **Honest gaps.** Never guess a date, category, venue or free/paid flag. Leave it null and flag it.
- **Status-preserving writes.** The Lager House incident on 2026-09-02 set the rule that a re-run never resets a moderation decision.
- **A trust model tied to the source.** A vetted venue feed auto-publishes. An unvetted aggregator lands in `pending_review`.
- **Public and internal notes stay separate.** `note` is visitor-facing; `internal_note` holds bookkeeping.
- **A feed an organizer invited us to pull is not crawling.**
- **Visibility is not authorization.** Never bypass blocks, CAPTCHAs, logins or terms (workbook HANDOFF #7).
- **`SERVICE_AREA.md` is the single authority on geography.**

---

## 1. Gap analysis

Severity key:
- **S1:** a live defect, or data being lost or corrupted today.
- **S2:** blocks scaling past roughly 50 sources.
- **S3:** blocks scaling past roughly 500 sources, or wastes significant human time.
- **S4:** quality or ergonomics.

Evidence is by file:line at `4cfd997` unless otherwise stated. "Resolved by" names the section of this document that fixes it.

### 1A. Architecture and scaling model

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| A1 | **Source = code.** Each new automated source needs a new file, a new cron line and a deploy. Engineering cost and maintenance surface grow linearly with the number of sources. | S2 | 20 bespoke ingestion files; `vercel.json` has one cron per source | §2.2, §2.4 |
| A2 | **One daily run per source, at a fixed hour.** There is no way to poll high-churn sources more often or quiet ones less. Cadence is set by `vercel.json`, not by how often the source changes. | S2 | `vercel.json` (all `0 H * * *`) | §2.6 |
| A3 | **No job queue.** A source's whole crawl must finish inside one function invocation. Long crawls hit `maxDuration`. The DMOD crawl fetches about 318 detail pages and needed `maxDuration: 180`. Playground's 3-second crawl delay × N pages kills the run past about 35 events and writes zero rows. | S2 | `cron-playgrounddetroit.js:366-373`; `vercel.json` functions block | §2.6 |
| A4 | **The generic feed poller runs sequentially inside a 60-second budget.** `cron-feeds` loops over every approved feed one at a time with no timeouts. At a few dozen feeds, or with one hung feed, it times out and polls nothing after that point. | S2 | `cron-feeds.js:294-361`; `vercel.json` `maxDuration: 60` | §2.6 |
| A5 | **No shared library for ingestion.** Auth, fetch, entity decoding, time formatting, status-preserving upsert and dedupe-within-batch are copy-pasted, and the copies have drifted. `cron-editorial.js:256-260` cites a "one-file-per-cron convention", but `_lib/` imports already work. | S2 | 28 copies of `timingSafeStringEqual`, 20 of `decodeEntities`, about 8 different 12-hour time formatters | §2.3 |
| A6 | **No test harness, fixtures or regression corpus.** Every parser is verified only against the live page on the day it was written. A source-side layout change is found by a human noticing missing events. | S2 | no `package.json`, no test files | §2.3, §8.6 |
| A7 | **No raw payloads are kept.** When a parse is wrong, it can't be re-run against what was actually fetched, and past failures can't become regression tests. | S3 | none stored anywhere | §2.5 |

### 1B. Source registry

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| B1 | **The `sources` table is unused.** It was migrated on 2026-08-25 and has never been written or read by code. `events.source_id` is never populated. | S2 | grep across `api/`, `*.html`: 0 references | §3.2 |
| B2 | **Two registries plus three spreadsheets.** `feed_sources` (live) and `sources` (empty) are separate tables. The research lives in three spreadsheets that don't agree with each other or with the code; PHASE0 §6 found Planet Ant still marked "Inconclusive" after its cron shipped. | S2 | migration_004 vs migration_008; PHASE0 §6 | §3.2, §3.6 |
| B3 | **Source identity is a free-text display string.** `events.source` holds things like "Rock In Detroit (rockindetroit.com/venue/old-miami)". The healthcheck keys freshness on these strings, so renaming a label silently breaks monitoring. | S2 | `cron-healthcheck.js` `SOURCE_FRESHNESS_TARGETS` | §3.2 |
| B4 | **No lifecycle states** (candidate, active, degraded, paused, blocked, retired). A broken or blocked source can't be paused without a code change. | S3 | — | §3.3 |
| B5 | **Policy basis isn't recorded in data.** Robots, terms and permission status live in code comments, `sources.html` prose and spreadsheet cells. Nothing checks them at run time. | S3 | `NEW_SOURCES_RESEARCH.md`, cron headers | §3.2, §7.1 |
| B6 | **No admin path to register a found feed or preview it (dry run).** Both were flagged in `FEED_SUBMISSIONS.md` and PHASE0 §5. | S3 | `admin-feeds.js` actions are approve/reject/pause/resume only | §3.5 |
| B7 | **Discovery produces spreadsheets, not candidates.** Research passes turned up 146 sources (PHASE0), 213 venues and 20 SOURCE MASTER rows. None of them became actionable registry rows, and the 213-row draft had essentially no influence on what was built. | S3 | PHASE0 §6 | §3.4 |

### 1C. Data model

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| C1 | **No real start/end timestamps or timezone.** `start_date` plus a free-text `time_display` makes sorting, "tonight", "happening now", calendar export and cross-source time matching all depend on re-parsing human strings. `time_display` has at least four formats in production. | S2 | `schema.sql:70-72`; agent audit of `time_display` formats; `index.html` `parseTimeRange()` | §2.5 |
| C2 | **No country, province or currency.** Windsor, Chatham and Sarnia events can't be told apart as Canadian in data, and CAD prices would display as USD. | S2 | `DISCOVERY_PHASE1_AUDIT.md` §1; `SERVICE_AREA.md` "Implications" | §4.7 |
| C3 | **Event lifecycle is mixed into moderation.** Cancelled or postponed isn't a state; only Ticketmaster writes `ticket_status`. A cancelled event is either still "approved" or hand-rejected, which loses the fact that it was cancelled. | S2 | migration_030 | §2.7 |
| C4 | **No provenance per field, and no field locks.** There's no record of which source supplied a value or whether a moderator set it. So a re-run can't tell a moderator's correction from stale source data. | S1 | see D1 | §2.5, §2.7 |
| C5 | **No series or recurrence model.** `is_recurring` is unused. Weekly events are hand-seeded (Lexus Velodrome). The ICS poller ignores RRULE entirely. MotorCity Wine has its own private RRULE expander. | S2 | `cron-feeds.js:23-31`; `cron-motorcitywine.js` | §2.8 (adopts PHASE0 §3) |
| C6 | **Categories are dual-tracked**: the `event_category` enum plus a `categories` table (migration_026) with `category_id`. Each new category needs its own enum migration (026/031/032). Mapping from source categories is inline code, duplicated per connector. | S3 | migrations 007, 009b, 018, 026, 031, 032 | §2.5 |
| C7 | **Organizer model is unused.** The `organizers` table is empty by design (migration_002). That was reasonable at 20 sources, but at scale organizer identity is a strong dedupe signal and the natural owner of a source. | S3 | migration_002 | §5.5 |
| C8 | **No concept of a sub-event or add-on.** Ticketmaster "VIP package", parking and suite-rental listings arrive as separate events and were hand-deduped (`update_2026-09-17_dedupe-batch3-tm-package-variants.sql`). | S3 | archive dedupe batch3 | §5.4 |

### 1D. Write path

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| D1 | **Re-runs overwrite moderator edits to every field except status.** `merge-duplicates` rewrites every column sent. Three examples: Metro Times would reset `category` to the `"music"` placeholder on every run (`cron-metrotimes.js:308`), which is latent only because the WAF block means it currently writes nothing; Popps Packing overwrites the reviewer-corrected `start_date` its own header tells reviewers to fix (`cron-poppspacking.js:232` vs `:46-49`); Ticketmaster sends `venue_address_raw: null` when the API lacks an address (`cron-ticketmaster.js:218,280`), wiping an address a moderator filled through `update_fields`. | S1 | as cited | §2.7 |
| D2 | **A failed venue lookup wipes venue links in bulk.** `buildVenueNameToIdMap` returns an empty map on any error (`_lib/venue-lookup.js:38-57`). Every row then sends `venue_id: null`, and merge-duplicates overwrites the existing links. | S1 | as cited | §2.7 |
| D3 | **One bad row fails the whole batch.** Redford can emit `title: null` (`cron-redford-theatre.js:209-264`) against `title NOT NULL`. History shows the pattern: duplicate IDs within one Ticketmaster fetch failed every Ticketmaster write from about 2026-09-18 until the 2026-09-20 fix (`cron-ticketmaster.js:324-341`). That instance is fixed, but the failure class remains. | S1 | as cited | §2.5 (validation stage) |
| D4 | **Rows in one bulk POST have different key sets.** Several connectors emit `undefined` for absent fields, so objects in the same bulk POST differ. Ticketmaster writes succeed with `description: e.info \|\| undefined`, so outright rejection is unlikely. The likelier behaviors are that PostgREST takes the column set from the **first** object, which would silently drop a key such as `description` for the whole batch whenever row 1 lacks it, or that it fills missing keys with NULL. Either way, data is lost or overwritten. **Unverified; needs a test** (backlog WP 0.11). | S1? | e.g. `cron-ticketmaster.js:270`, `cron-poppspacking.js:227,233` | §2.7 |
| D5 | **`external_id=in.(…)` lists are unquoted.** They break on IDs containing commas or parentheses. | S3 | every status lookup | §2.3 |
| D6 | **Manual SQL files bypass every check**: validation, venue resolution, geography and dedupe. | S2 | 77 data SQL files | §7.8 |
| D7 | **A failed status lookup re-publishes rejected events.** If the status lookup gets a non-OK response (a 414 on a very long URL, a 5xx, a timeout at the gateway), every connector falls through with an empty map and assigns `DEFAULT_STATUS`. About half of them also fall through on a network exception. `DEFAULT_STATUS` is `approved` in 17 of the 20 connectors, so moderator rejections, including every dedupe-batch rejection, are silently reversed on that run. `cron-lagerhouse.js:240-242` argues this is "not silently worse", but it is now, because rejections carry dedupe decisions. The Ticketmaster lookup puts ~1,000 IDs in one unchunked URL (~20 KB), which risks exceeding gateway URL limits. **Verify immediately** (WP 0.17): check whether rows rejected by the 2026-09-17 dedupe batches are still rejected. | S1 | `cron-ticketmaster.js:354-374`; `cron-lagerhouse.js:228-246`; same block in all 20 connectors | §2.7, WP 0.17 |

### 1E. Identity and deduplication

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| E1 | **No cross-source dedupe at ingestion.** Only `cron-visitdetroit` checks, and only one way: if Ticketmaster writes after Visit Detroit, both stay live. The 11 manual dedupe batches are the actual mechanism. | S2 | `cron-visitdetroit.js:~298`; archive dedupe files | §5 |
| E2 | **Title-derived IDs create duplicates when a source edits a title.** The new title makes a new row and the old row is never retired. | S1 | `cron-dossin.js:180`, `cron-halo.js:178`, `cron-redford-theatre.js:313`, `cron-trinosophes.js:182`, `cron-motorcitywine.js:442` | §5.2 |
| E3 | **Duplicates are "resolved" by rejecting or deleting rows.** Provenance is lost. Dependent rows (`editorial_article_events`) had to be re-pointed by hand (`update_2026-09-04_dedupe_detroitjazzfest.sql`). | S3 | PHASE0 §2 | §5.6 |
| E4 | **Venue identity is exact-name only.** "DIA" and "Detroit Institute of Arts" are different venues to the system. Unmatched venues stay `venue_id: null`, which also disables geography and neighborhood for those events. | S2 | `_lib/venue-lookup.js` | §5.5 |
| E5 | **Unbounded candidate queries.** Visit Detroit's dedupe query and editorial's candidate queries have no limit or pagination, so they're silently truncated at PostgREST's max-rows cap as the table grows. `venue-lookup` fetches `venues?limit=1000`, so the name map silently truncates once venues pass 1,000, which the scaling plan will do. | S2 | `cron-visitdetroit.js:~298`; `cron-editorial.js:452,541`; `_lib/venue-lookup.js:42` | §2.3 |

### 1F. Event lifecycle

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| F1 | **Nothing is ever retired.** No connector deletes, cancels or expires anything. An event removed or cancelled at its source stays approved on 313.events indefinitely. | S1 | grep: no DELETE/cancel paths in any cron | §2.7 |
| F2 | **Cancelled recurring series are still expanded** (MotorCity Wine). | S1 | `cron-motorcitywine.js:404` | §2.8 |
| F3 | **Ticketmaster `cancelled`/`postponed` status is stored but does nothing.** The event stays in listings. | S2 | migration_030; `cron-ticketmaster.js:254` | §2.7 |

### 1G. Geography

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| G1 | **The Orbit rule is enforced only for Ticketmaster.** Other sources aren't checked, and WDET uses a *narrower* allowlist that drops valid Orbit events (for example Ann Arbor or Pontiac). | S2 | `cron-wdet.js:40,166` | §4.3 |
| G2 | **The client filter is a city-name string match against 56 hand-kept city entries.** An event in a city missing from the list (for instance Chelsea, Dundee, Sandusky OH, Leamington ON) is **hidden** from the Orbit view and the hero count. A missing city is **assumed to be Detroit** (`e.city \|\| "Detroit"`). | S1 | `index.html:4665,5503,5617` | §4.4 |
| G3 | **Venue coordinates are sparse**, so venue-level geography, maps and radius search depend on city centroids. | S2 | `DISCOVERY_PHASE1_AUDIT.md` §1 | §4.5 |
| G4 | **The boundary polygon is duplicated** in `index.html` and `_lib/detroit-boundary.js`, kept in sync by hand. | S4 | as cited | §4.2 |
| G5 | **The Ticketmaster query is probably truncated.** It uses one center point (90 mi, 90 days, `size=200`, max 5 pages), so at most 1,000 results per run: the Discovery API's deep-paging cap. The 2026-09-05 figure of 981 upcoming Ticketmaster events is only weak evidence, because it's a count accumulated in the database over many runs, not a single-run result. It does sit close to the ceiling. Separately, `if (!r.ok) break` (`:187`) silently keeps a partial result when any page request fails. Needs verification against `page.totalElements` (WP 0.10). | S1? | `cron-ticketmaster.js:168-195` | §4.6 |
| G6 | **The 90-mile center query radius has thin margin.** The border-based Orbit reaches about 89.6 mi from the center point in the NW direction (Milford measurement at `cron-ticketmaster.js:93-102`). | S4 | as cited | §4.6 |
| G7 | **Large parts of the Orbit have no source research at all.** Examples: Erie and Ottawa Counties, OH (Sandusky/Cedar Point at about 60 mi, Port Clinton/Put-in-Bay at about 52 mi); the Thumb (Sanilac, Tuscola); Shiawassee; Jackson; Lenawee; Lansing/East Lansing (in scope since 2026-09-20). There are **no live Ontario connectors**. | S2 | Appendix C; PHASE0 §9-12 | §4.8 |

### 1H. Coverage and acquisition

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| H1 | **Heavy dependence on one aggregator.** Ticketmaster was 81% of upcoming approved events. That skews the catalogue toward large ticketed venues and makes the site fragile to one API key, quota or policy change. | S2 | `cron-ticketmaster.js:132-146` comment | §6, §9.2 |
| H2 | **No measurement of coverage.** There's no estimate of what fraction of real Orbit events 313.events carries, overall or by place or category. | S2 | — | §9.2 |
| H3 | **Platform multipliers identified in PHASE0 §8 have not been exploited.** These are Localist, Tribe Events, LibCal, Communico, LibraryCalendar, CivicPlus and GrowthZone. Each could serve dozens of sources with one adapter. | S2 | PHASE0 §8, §16 | §3.4, §7 |
| H4 | **The manual lane doesn't compound.** Each Resident Advisor or Instagram pull is a one-off SQL file. Nothing learned in one pull (a venue resolved, an organizer identified) is captured for reuse. | S3 | 10 RA pull files | §7.8 |

### 1I. Fetch hygiene and policy consistency

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| I1 | **No fetch timeouts anywhere** (0 uses of `AbortController`/`signal`). One hung server consumes the whole function budget. | S1 | grep | §2.3 |
| I2 | **No conditional GET** (ETag / If-Modified-Since) and no content-hash short-circuit. Unchanged sources are fully re-parsed and re-written every day. | S3 | — | §2.6 |
| I3 | **The User-Agent convention is inconsistent.** There are three styles, and two files (`cron-metrotimes.js:210`, `cron-editorial.js:360`) send a spoofed Chrome UA. That contradicts the stated honest-UA convention (`cron-planetanttheatre.js:106-109`). | S2 (policy) | as cited | §7.1 |
| I4 | **robots.txt is not checked at run time**, and there is no per-host rate limiting. Only Playground honours a crawl delay, and that one is hand-coded. | S3 | — | §2.6, §7.1 |
| I5 | **Blocked sources keep getting hit daily.** Metro Times gets a WAF 403 and Planet Ant had Cloudflare 403s. There is no block classifier and no backoff. | S3 | `cron-metrotimes.js:181-190`; `cron-planetanttheatre.js:93-113` | §7.7, §8.3 |

### 1J. Time handling

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| J1 | **"Today" is computed in UTC while jobs run on the previous Eastern evening.** Lager House (00:00 UTC), DMOD, Planet Ant (02:00, which even requests `start=` tomorrow) and Playground skip same-night events. | S1 | `cron-lagerhouse.js:177`; `cron-planetanttheatre.js:258,263` | §2.5 |
| J2 | **Year inference and rollover bugs.** DetroitTraining gives Dec→Jan ranges an end before the start (`cron-detroittraining.js:144,179-184`). Metro Times and Trinosophes infer the year from server-local time. | S2 | as cited | §2.5 |

### 1K. Monitoring and failure detection

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| K1 | **Failures report success.** Fetch failures return HTTP 200, so Vercel's dashboard is green while a source writes nothing. | S1 | every connector's fetch-error branch | §8 |
| K2 | **No run log.** There's no per-run record of rows fetched, parsed, written or errored. Only `feed_sources.last_poll_result` exists, for feeds. | S2 | — | §8.1 |
| K3 | **Freshness is inferred from `events.updated_at` keyed on free-text `source`.** That proves some row was touched, not that the source is complete. Zero rows parsed looks the same as "nothing changed". | S2 | `cron-healthcheck.js` `checkSourceFreshness` | §8.2 |
| K4 | **Healthcheck lists are hard-coded and stale.** `CRON_ENDPOINTS` misses oldmiami, poppspacking, outerlimitslounge, motorcitywine and detroittraining. Freshness targets miss Outer Limits, MotorCity Wine and Detroit Training. | S2 | `cron-healthcheck.js` | §8.5 |
| K5 | **No alerting.** Results go to a table that someone has to open. The Belle Isle crash (A-level defect, every run) has no automated path to anyone's attention. Its 7-day freshness check has probably been failing daily, so the whole healthcheck reads "fail" constantly and teaches the reader to ignore it. | S1 | `cron-belle-isle-nature-center.js:135`; `cron-healthcheck.js` | §8.4 |
| K6 | **No detectors for silent wrongness.** Nothing catches placeholder values. Examples: Ticketmaster writes the string `"Evening"` when there's no local time, and hard-codes `is_free: false` (`cron-ticketmaster.js:160,284`). Trinosophes' "7:00 PM" (`cron-trinosophes.js:196`) is a deliberate default Jody chose, disclosed in the public `note`, but in the data it's indistinguishable from a real time. The same gap misses junk titles (every non-noise line becomes an event, `:129-134`), first-date-on-page misparses (`cron-cinema-detroit.js:46,89`) or a crawler stuck on the same 40 entries (`cron-metrotimes.js:266`). | S2 | as cited | §8.3 |

### 1L. Admin and moderation tooling

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| L1 | **No source console.** Source health, run history and parsed-output previews can't be seen, and a source can't be paused or re-run, without the Vercel dashboard or SQL. | S2 | `admin.html` | §3.5, §8.5 |
| L2 | **No merge/unmerge UI.** Dedupe is SQL-only. | S2 | — | §5.7 |
| L3 | **Review queues are fragmented** (pending, follow-up, editorial, feeds) and none of them is prioritized by impact. | S3 | `admin.html` tabs | §2.9 |
| L4 | **Corrections made in SQL aren't protected from the next cron run** (see D1). So the same fixes recur, as the follow-up batches show. | S1 | 9 follow-up batch files | §2.7 |

### 1M. Security and operations

| # | Gap | Sev | Evidence | Resolved by |
|---|---|---|---|---|
| M1 | **Cron auth is optional.** `if (CRON_SECRET) {…}` in every connector, so an unset env var opens every endpoint. That includes the roughly 318-request DMOD crawl, which could be triggered repeatedly against a third party's site. The healthcheck does test for 401, which partly mitigates this. | S2 | e.g. `cron-halo.js:141` | §2.3 |
| M2 | **Service-role key used for everything.** No narrower Postgres role for ingestion writes. | S4 | — | §2.3 |

### 1N. Connector-level defects (details in Appendix B)

The defects that need a fix *before* migration, because they corrupt or lose data now, are:

- The Belle Isle crash.
- The Redford null-title batch failure.
- The Trinosophes junk events (every non-noise line becomes an event).
- The Trinosophes time default, which is Jody's deliberate choice and is disclosed publicly, but isn't marked approximate in the data.
- The Cinema Detroit first-date misparse.
- MotorCity Wine expanding a cancelled series.
- Popps Packing re-upserting past posts and resetting dates.
- Metro Times resetting categories.
- Playground timing out before writing.
- The UTC-today skips (J1).

### 1O. What the gaps have in common

Almost every S1 defect above traces to one of three structural causes:

1. **Connectors write directly to the published table.** There's no intermediate record, so every re-run is a destructive overwrite, and nothing can express "this source no longer lists it".
2. **Each connector re-implements the pipeline.** Every fix, such as status preservation, batch dedupe or timeouts, has to be copied into 18 or more places and inevitably misses some.
3. **Success is defined as "didn't throw".** Nothing measures whether a run produced the *right* output, so silent wrongness is the normal failure mode.

The architecture in §2 is organized to remove those three causes, rather than to fix the listed symptoms one at a time.

---

## 2. Proposed ingestion architecture

### 2.1 Design principles

These principles come from the audit. Each one names the gap class it removes.

1. **Sources are data; adapters are code.** A new source is a registry row that points at an adapter and carries a config blob. A new *adapter* is code, and it gets written once per platform or format, not once per venue. Target: at least 90% of onboarded sources need zero new code. *(A1, A5, H3)*
2. **Never write sources directly to published events.** Adapters emit `SourceEvent` records. The pipeline decides what becomes a canonical event, and when. *(1O cause 1)*
3. **Stages are idempotent and separately replayable.** Raw fetch → extracted records → normalized records → resolved records → canonical events. Each stage's output is persisted, so any stage can be re-run from the one before it without refetching. *(A7, D3)*
4. **Humans outrank machines, field by field.** Anything a moderator sets is locked against automated overwrite unless the moderator unlocks it. *(D1, L4)*
5. **Absence is information.** A source that stops listing an event is a signal to process, not a no-op. *(F1)*
6. **Loud failure, soft degradation.** One bad row never fails a batch, and one bad source never blocks the others. But every failure is recorded, classified and surfaced. *(K1, D3)*
7. **Geography belongs to places, not strings.** Orbit membership is computed from coordinates against a stored polygon. *(G1–G3)*
8. **Policy is data and is enforced at run time.** The permission basis, robots status and access class live on the source row. The fetcher refuses what the policy doesn't allow. *(B5, I3, I4)*
9. **Same pipeline for automated and hand-captured data.** An Instagram flyer or a Resident Advisor capture enters as a `SourceEvent` from a registered manual source, exactly like an ICS row. *(D6, H4)*
10. **Extend, don't replace.** Same stack, same tables where possible, incremental migration with shadow-mode parity checks. *(project rule)*

### 2.2 Component overview

```
                        ┌──────────────────────── REGISTRY ────────────────────────┐
                        │ sources (extended)   platforms   places   geo_regions    │
                        │ category_mappings    venue_aliases        policy fields  │
                        └──────────────┬───────────────────────────────────────────┘
                                       │ due sources (next_run_at ≤ now, health ok)
  pg_cron / Vercel cron ──► DISPATCHER ─┴─► ingest_jobs (Postgres queue, SKIP LOCKED)
                                                     │
                     ┌───────────────────────────────┼─────────────────────────────┐
                     ▼                               ▼                             ▼
              WORKER (Vercel fn)              WORKER (Vercel fn)          RENDER WORKER (optional,
              time-boxed, N jobs              …                           separate host; only for
                     │                                                    permitted JS-only sources)
   ┌─────────────────┼────────────────────────────────────────────────────────────────┐
   │ 1 FETCH     politeness gate (robots, per-host rate, policy) → HTTP w/ timeout,    │
   │             conditional GET → source_fetches + raw snapshot (Storage, by hash)    │
   │ 2 EXTRACT   adapter.parse(raw, source.config) → SourceEvent[] (pure function)     │
   │ 3 NORMALIZE times→start_at/tz, text cleanup, price/currency, category mapping     │
   │ 4 VALIDATE  hard rules (reject row, not batch) + soft rules (quality flags)       │
   │ 5 RESOLVE   venue (alias/fuzzy/geo), coordinates, in_orbit, organizer            │
   │ 6 UPSERT    source_records (one per source×native key; hash-diffed; seen_at)     │
   └─────────────────┬────────────────────────────────────────────────────────────────┘
                     ▼
   ┌───────────────── CANONICALIZE (per affected record, same run) ─────────────────┐
   │ 7 MATCH     block → score → auto-link | match_candidates (review) | new event   │
   │ 8 MERGE     field precedence + locks → events row (canonical)                   │
   │ 9 PUBLISH   status policy (trust tier × quality × geo × match certainty)        │
   └─────────────────┬───────────────────────────────────────────────────────────────┘
                     ▼
   10 RECONCILE (end of successful full run): records not seen → missing_count++ →
      lifecycle rules (unconfirmed / cancelled / stale) → ingestion_issues
                     ▼
   11 OBSERVE  source_runs metrics → detectors → health state → alerts/digest
                     ▼
   ADMIN INBOX (ingestion_issues: match review, venue review, geo review, quality,
                source health, policy) + SOURCE CONSOLE (registry, dry-run, runs)
```

### 2.3 Code layout (shared library)

Everything moves into one shared module tree. Vercel functions become thin entry points.

```
lib/ingest/
  http.js            fetchWithPolicy(): timeout (AbortController), retries w/ jitter on 429/5xx,
                     conditional GET, UA, size cap, per-host lease (DB-backed, shared by all
                     workers), block-page classifier
  robots.js          fetch+cache robots.txt per host (24h), evaluate for our UA and for "*"
  auth.js            requireCronSecret() — FAILS CLOSED if CRON_SECRET unset (fixes M1)
  supabase.js        typed REST helpers: paginated select (fixes E5), quoted in() lists (D5),
                     bulk upsert of uniformly-shaped rows only (records always carry
                     the full SourceEvent shape; canonical events are PATCHed, never
                     bulk-upserted — fixes D4), RPC calls
  time.js            one timezone-aware parser/formatter set; "today" always America/Detroit (J1);
                     year inference with rollover rules (J2); ICS date handling (from cron-feeds)
  text.js            decodeEntities, whitespace/emoji cleanup, title normalization for matching
  ics.js             RFC 5545 parser + RRULE/EXDATE/RDATE/RECURRENCE-ID (lifted from
                     cron-motorcitywine.js, with its F2/UNTIL/COUNT bugs fixed and unit-tested)
  schema/source-event.js   SourceEvent v1 schema + validator (hard/soft rules)
  normalize/         category mapping (table-driven), price/currency, url canonicalization
  resolve/           venue resolver, geocoder client + cache, orbit classifier, organizer resolver
  match/             blocking, feature extraction, scoring, decision (see §5)
  merge/             field precedence engine, locks, status policy
  reconcile.js       missing/stale/cancel lifecycle rules
  observe/           run metrics, detectors, health state machine
  adapters/
    ics.js  rss-events.js  jsonld.js  tribe-rest.js  wp-mec.js  squarespace-json.js
    localist.js  libcal.js  communico.js  librarycalendar.js  civicplus.js  growthzone.js
    ticketmaster.js  algolia-visitdetroit.js  crowdwork.js  fever.js  humanitix.js
    eventbrite-org.js  html-recipe.js  manual-capture.js  sitemap-detail.js (crawl helper)
    legacy/<source>.js  (bespoke parsers kept verbatim during migration, behind the same interface)
api/
  ingest-dispatch.js   (cron) enqueue due jobs
  ingest-worker.js     (cron/pg_net) claim + run jobs within time budget
  ingest-intake.js     (authenticated) accepts SourceEvents from render worker / manual capture
  admin-sources.js     registry CRUD, probe, dry-run, pause/resume, run history
  admin-issues.js      unified review inbox actions (merge/unmerge, venue confirm, geo confirm…)
test/
  fixtures/<adapter>/<case>.{raw,expected.json}   golden files; every production bug becomes one
```

`package.json` arrives with this change, carrying a minimal dependency set. Two are recommended:

- `cheerio`, for real DOM parsing in `html-recipe` and `jsonld`. It replaces the regex parsers where they're fragile.
- A test runner. Node's built-in `node:test` needs no dependency.

Everything else stays dependency-free, following the project's current lean posture.

### 2.4 The adapter contract

An adapter is a pure module:

```js
module.exports = {
  key: "tribe-rest",            // registry sources.adapter value
  version: 3,                   // bumped on behavior change; stamped on every record
  accessClass: "structured_api",// §7 class, for policy gate
  configSchema: {...},          // JSON schema for sources.config (validated on save)
  plan(source, state) → Request[]            // what to fetch this run (pagination, date window,
                                             //  child jobs for detail pages); may use cursor state
  parse(response, source, ctx) → { events: SourceEvent[], next?: Request[], cursor?: any,
                                   coverageWindow?: {from, to}, warnings: [] }
  probe?(url) → { confidence, suggestedConfig }   // fingerprinting for discovery (§3.4)
}
```

What the contract enforces:

- `parse` has no database or network access. It maps a response to records, and that is what makes golden-file testing possible.
- `coverageWindow` states which date range this run *authoritatively* covered. Ticketmaster covers the next 90 days; a venue's upcoming page covers its visible horizon. Reconciliation (§2.7) only counts a missing record as missing when it falls inside that window. That rule is what makes absence detection safe for windowed sources.
- Detail-page crawls (DMOD, Metro Times, Playground) return `next` requests. They become child jobs in the queue, which removes the single-invocation time limit (A3).

### 2.5 Canonical intermediate record: `SourceEvent` v1

Every adapter, including manual capture, emits this shape. Fields are optional unless marked required. Each field value can carry `{value, confidence, raw}` when the adapter inferred it rather than read it.

| Field | Notes |
|---|---|
| `source_key` **(req)** | Stable native identifier: UID, API id, canonical URL path. **Never derived from the title** (fixes E2). If the source has no stable ID, the adapter emits `null` and the record-continuity rule in §5.2 applies. |
| `title` **(req)** | Raw title. A normalized title is computed downstream. |
| `start` **(req)** | One of: `{local: "2026-10-02T21:00", tz: "America/Detroit"}`, `{utc: …}` or `{date: "2026-10-02"}` (all-day). `start_precision: minute\|day\|month` (month for "sometime in October" listings, which never auto-publish). |
| `end` | Same shape as `start`. `doors` (optional local time) is kept separately, because sources disagree on doors vs show time. |
| `recurrence` | `{rrule, exdates[], rdates[]}` when the source supplies a rule. Otherwise every occurrence is its own record. |
| `occurrence_status` | `scheduled \| cancelled \| postponed \| rescheduled \| sold_out \| unknown`, taken from the source (Ticketmaster `dates.status`, ICS `STATUS`, schema.org `eventStatus`). |
| `venue` | `{name, address:{line1, city, region, postal, country}, lat, lng, external_ids:{tm, osm, google, localist…}}` |
| `online` | `true` for virtual events. They're kept, but excluded from Orbit counts unless the organizer is in the Orbit. |
| `organizer` | `{name, url, external_ids}` |
| `performers` | `[names]` when present. A strong dedupe signal. |
| `description`, `image_url`, `event_url`, `ticket_url` | `event_url` is the canonical listing page; `ticket_url` is the purchase link. Kept separate, as in migration_022. |
| `price` | `{min, max, currency, is_free: true\|false\|null}`. **`is_free` is null unless the source says free**. This fixes the WDET and Belle Isle guess ("empty cost means free"). |
| `categories_raw` | Source tags, verbatim. Mapping happens in normalize, through the `category_mappings` table. |
| `listing_kind` | `event \| add_on \| series_parent \| exhibition_run`. Ticketmaster package, parking and suite listings become `add_on` (fixes C8). |
| `age_restriction`, `is_clothing_optional`, `accessibility` | Structured where the source supplies them. Otherwise left to editorial (migration_034 posture). |
| `provenance` | `{adapter, adapter_version, fetch_id, url, fetched_at}`, added by the pipeline. |

**The schema must allow honest gaps.** Today `events.category` is `NOT NULL` (an enum), which is why Metro Times sends a `"music"` placeholder. `is_free` is `NOT NULL DEFAULT false`. Both constraints force guesses. WP 1.15 makes `category` nullable, rendered as "Other" and routed to the follow-up queue, and makes `is_free` nullable, meaning unknown. Both changes are additive: existing rows keep their values.

Normalization writes three new canonical columns on `events`: **`start_at timestamptz`, `end_at timestamptz`, `timezone text`** (fixes C1). `start_date` and `time_display` stay, derived from the new columns during migration, so nothing downstream breaks. Pages can switch to the new columns one at a time.

### 2.6 Scheduling, queue and politeness

**The queue is Postgres.** An `ingest_jobs` table holds these columns: `id, source_id, kind (run|page|probe|reconcile), payload jsonb, run_after, priority, attempts, max_attempts, status, locked_by, locked_until, parent_job_id, created_at`. A `claim_jobs(worker_id, n, lease)` SQL function uses `FOR UPDATE SKIP LOCKED`, so parallel workers never claim the same job at the same time. `SKIP LOCKED` alone doesn't prevent a job running twice after its lease expires, so three more rules apply:

- **Fencing.** `claim_jobs` increments `attempts`. `complete_job`/`fail_job` succeed only if `locked_by` and `attempts` still match, so a worker whose lease expired can't commit its result.
- **Lease length.** The lease is longer than the function's `maxDuration`.
- **Idempotent stages.** Every stage is idempotent anyway (hash-diffed record upserts, patch-only merges), so a rare duplicate run costs time, not correctness.

There's no new infrastructure: it's plain Supabase.

**Triggering has two options** (decision A1 in Appendix A):

- **Recommended: `pg_cron` + `pg_net` in Supabase.** They call `/api/ingest-worker` every 5 minutes and `/api/ingest-dispatch` every 15. This doesn't depend on the Vercel plan's cron frequency limits. Today's once-daily, one-cron-per-hour layout suggests the current plan may limit cron frequency; verify. Three caveats come with this:
  - `pg_net` requests are asynchronous, with a short default timeout and no retries. The worker must therefore acknowledge immediately (HTTP 202) and continue with `waitUntil` (`@vercel/functions`), or the call must tolerate a client-side timeout. Lost ticks are harmless, because the next tick picks up the queue.
  - `CRON_SECRET` lives in Supabase Vault, not in the cron SQL.
  - The worker verifies the secret like any cron.
- **Alternative: Vercel Cron, if the plan allows sub-daily schedules.** With either option, the worker drains jobs until its time budget is nearly spent (for example 80% of `maxDuration`), then exits. Leftover jobs wait for the next tick.

**Cadence is per source, and adaptive.** `sources.cadence_minutes` sets the base: T1 and P0 sources daily or twice daily, the long tail weekly.

- If the last *k* runs saw no content change (same raw hash), cadence backs off ×2, up to `max_cadence`.
- A detected change resets it to base.
- Failures back off exponentially with jitter.
- Event proximity also counts: a source whose next event is within 48 hours gets a same-day re-check, which catches last-minute cancellations.

**Politeness is enforced in `fetchWithPolicy`, not left to each connector:**

- robots.txt is checked for our UA and for `*`. A disallowed fetch is refused and logged as a policy issue, never attempted.
- Crawl-delay is honoured.
- Per-host concurrency is 1 by default. The minimum interval is `max(crawl-delay, 2 s)`, configurable per host. It's enforced through a `host_leases(host, locked_by, next_allowed_at)` row that every worker, including the render worker (via intake), must acquire before fetching. An in-memory limiter wouldn't hold across parallel invocations.
- Conditional GET uses stored `ETag`/`Last-Modified`.
- If the content hash is unchanged, the job ends there: nothing is parsed or written. Most runs of most sources will end at this step, which is what keeps a thousand-source registry cheap.
- A response-size cap applies.
- **Timeouts:** 15 s connect+headers and 30 s total by default.

**Capacity sketch** (to be validated in Phase 1 instrumentation):

| Measure | Estimate |
|---|---|
| Fetches/day at 1,000 sources, average cadence ~1.3 days | ~750 fetches, plus detail pages for crawl-type sources (~2–5k) |
| After conditional GET + hash short-circuit | Parse/write work drops to the fraction that changed |
| Worker time per invocation | Well within Vercel limits: at 5-minute ticks there are 288 invocations/day |
| Storage, 1,000 sources × ~200 KB × 14-day retention × fraction changed | Worst case ~2.8 GB if every source changed daily; expect well under 1 GB |

Snapshots are stored gzip-compressed and content-addressed, so an unchanged page stores nothing new. Retention is decision A7.

### 2.7 Write model: records → canonical events

**`source_records`** is the ledger. PHASE0 §2 called it `event_source_records`; this design renames it and extends it. There is one row per `(source_id, source_key)`, with these columns:

| Column(s) | Holds |
|---|---|
| `payload jsonb` | Normalized `SourceEvent` |
| `payload_hash` | Hash of the payload |
| `first_seen_at`, `last_seen_at`, `last_changed_at` | Sighting history |
| `last_seen_run_id` | Last run that saw the record |
| `missing_count` | Consecutive runs that didn't see it |
| `state` | `active \| missing \| gone \| superseded \| out_of_orbit` |
| `event_id` | FK to the canonical event |
| `link_type` | `auto \| manual \| created` |
| `match_score` | Score of the match to that event |
| `venue_id`, `in_orbit` | Resolved venue and geography |
| `quality_score`, `quality_flags[]` | Quality assessment |

An upsert with an unchanged hash only touches `last_seen_*`, so the canonical event isn't recomputed.

**`source_record_versions`** (append-only) gets one row per *change*: `record_id, payload, payload_hash, seen_at, run_id`. That keeps the append-only ledger PHASE0 §2 specified. `source_records` is the current-state projection of it, which keeps matching and merge queries cheap. Because a version row is written only when the hash changes, storage grows with churn, not with run count.

**Canonical `events`** keeps its current role as the published table, and gets new columns:

| Column(s) | Purpose |
|---|---|
| `start_at, end_at, timezone` | Real timestamps (C1) |
| `occurrence_status` | `scheduled\|cancelled\|postponed\|rescheduled\|sold_out\|unknown` (C3). **Independent of moderation `status`.** |
| `status` enum + `'merged'` | Moderation. Adopts PHASE0 §2's `'merged'` value and `canonical_event_id`, named here `merged_into_event_id`. |
| `locked_fields text[]` | Fields a moderator set (D1) |
| `field_sources jsonb` | Which record or moderator supplied each field, e.g. `{"description": {"record": "<id>", "at": "…"}}` |
| `primary_record_id` | The display-primary record |
| `series_id`, `recurrence_id` | Adopted from PHASE0 §3 |
| `parent_event_id` | Festival → day, exhibition → performance, event → add-on |
| `country, region, currency` | Via venue, plus event-level fallback |
| `quality_score` | Computed quality |

**Merge (field precedence).** For each field, the merged value is the first non-null value from, in order:

1. The moderator. Any field in `locked_fields` wins, always.
2. The highest-precedence source record that supplies the field, where precedence comes from `sources.precedence` per field group:

| Field group | Precedence (highest first) |
|---|---|
| Time/date | Venue or organizer first-party (T1) > official platform API (T2) > curated aggregator (T3) > open aggregator (T4) > manual social capture (T5) |
| Ticketing (`ticket_url`, price, `occurrence_status` sold-out/on-sale) | Ticketing platform > first-party > others |
| Description | Best-quality non-empty description by tier, then length within limits |
| Image | Highest-resolution non-fallback image by tier. Ticketmaster `fallback: true` images rank last. |
| Venue | Resolved `venue_id` by the highest-confidence resolution, not by tier |

3. If nothing supplies a value, the field keeps its **existing value**. **A lower-precedence source can fill an empty field but can never overwrite a value supplied by a higher-precedence source or a moderator.** A source sending `null` never clears a field. This fixes D1, D2 and D4 structurally: the merge engine computes a patch and PATCHes only the changed columns. It never bulk-upserts whole rows.

**Moderator edits.** Every `admin-events` edit writes the value, adds the field to `locked_fields`, and records `field_sources[field] = {moderator, at}`. The admin UI shows a lock icon with an unlock action. Existing SQL-applied corrections get backfilled as locks where they can be identified from the follow-up batch files (WP 2.12).

**Publish (status policy).** Ingestion sets `status` only when it *creates* a canonical event. After that, status is moderator-owned, which generalizes today's status-preserving upsert. The initial status is:

| Condition | Status |
|---|---|
| Source trust ≥ T2 **and** quality ≥ threshold **and** `in_orbit = true` (venue-level geocode) **and** match decision certain (new, or auto-linked) **and** `start_precision = minute\|day` | `approved` |
| Source T3 with all of the above | `approved`, if the source's rolling moderator-overturn rate is < 2%; else `pending_review` |
| T4, T5, any failed hard-publish rule, `in_orbit` from city centroid inside the boundary band (§4.5), or an open match candidate | `pending_review` |

**Reconcile (absence handling, fixes F1 and F3).** This runs at the end of a *successful, complete* run: all planned pages fetched, and the error rate below threshold. Records inside the run's `coverageWindow` that weren't seen get `missing_count++`. Then:

- `missing_count ≥ 2` (configurable per source) → record `state = missing`.
- If **every** active record for a canonical event is missing, and the event is in the future:
  - The primary source is T1 or T2 → `occurrence_status = 'unknown'` and a high-priority `ingestion_issue` ("source no longer lists this"). If still missing after `missing_count ≥ 4` and the event is less than 7 days out, it's auto-hidden from listings (status stays; a `listing_visibility` flag is set), pending review.
  - Otherwise → an issue only.
- If some records remain, the canonical event is recomputed from the remaining records.
- An explicit `occurrence_status = cancelled` from any T1 or T2 record propagates immediately: the event shows "Cancelled" in listings for 7 days, then drops off. Event pages stay reachable, since that matters for people who bought tickets.
- Past events are never reconciled. Records simply age out.
- **Capped results.** When a run returns exactly the source's page or result cap (e.g. WDET and Belle Isle `per_page=50` without paging, or a limited Squarespace collection), the adapter's declared window is not trusted. The effective window becomes `[now, latest start seen in this run]`, so events past the cap aren't marked missing.
- **Child-job runs.** For sources crawled through child jobs, completeness is judged per listing page: records belonging to listing pages that fetched successfully can be reconciled even if some detail pages failed. A listing-page failure suppresses reconcile for the whole run.
- **Change detection hashes the extracted set too.** Raw-response hashes are defeated by nonces, timestamps and rotating ads. The worker therefore also hashes the normalized `SourceEvent` set, and treats the run as unchanged when that hash matches even if the raw hash doesn't.
- **A run that fails or is partial never reconciles.** A broken source must not "cancel" its events.

### 2.8 Series and recurrence

This adopts PHASE0 §3 unchanged (`event_series`, 90-day rolling materialization, RECURRENCE-ID overrides). There is one refinement: materialized occurrences are `source_records` of a synthetic per-series source key (`series:<id>:<local start datetime>`, not just the date, so a series with a matinee and an evening show on the same day produces two distinct keys). That lets them flow through the same match, merge and reconcile stages as everything else. In particular, a venue's own feed listing that same Tuesday skate night matches the materialized occurrence instead of duplicating it.

### 2.9 Unified review inbox

One `ingestion_issues` table replaces today's separate queues. It covers pending review and the follow-up queue, and adds the new kinds of issue. Columns:

- `id`, `kind`, `severity`, `entity_type`, `entity_id`, `source_id`
- `summary`, `details jsonb`, `suggested_action jsonb`
- `status` (`open\|resolved\|dismissed\|snoozed`), `created_at`, `resolved_by`, `resolved_at`, `resolution jsonb`

The kinds of issue:

| Group | Kinds |
|---|---|
| Moderation | `event_pending` |
| Matching | `match_review`, `venue_new`, `venue_match_review` |
| Geography | `geo_unresolved`, `geo_boundary_band` |
| Lifecycle | `lifecycle_missing`, `lifecycle_cancelled` |
| Quality | `quality_missing_fields` (today's follow-up queue), `quality_suspect_value` (placeholder time, junk title) |
| Sources | `source_failing`, `source_blocked`, `source_drift`, `policy_denied`, `source_candidate` |

The inbox is ordered by **impact**: severity × event proximity × tier, with a boost for events on the homepage. So the next 48 hours' problems come first. Every resolution is recorded, which gives the measurement data for §9: overturn rates, matcher precision and time-to-resolve.

### 2.10 Runtime topology and permissions

| Where it runs | What runs there |
|---|---|
| Supabase | Tables, queue, PostGIS, pg_trgm, pg_cron/pg_net, Storage (snapshots), RPC functions for claim/merge |
| Vercel | Dispatcher, worker, intake, admin APIs. The existing crons keep running until they're migrated. |
| Optional render worker (Appendix A decision A4) | GitHub Actions scheduled workflow or a small container, running Playwright. It only takes jobs whose source has `access_class = js_rendered` and `permission_basis` allowing automation. It posts raw HTML or `SourceEvent`s to `/api/ingest-intake` with its own secret. It never gets the service-role key. |

On the database side, a dedicated Postgres role `ingest_writer` gets insert/update on the ingestion tables and patch-only on `events` through an RPC. That replaces blanket service-role use in workers (M2). Admin APIs keep using service-role.

### 2.11 Migration strategy (strangler)

Each legacy connector migrates in five steps:

1. Wrap it in the adapter interface as `adapters/legacy/<name>.js`, with its parse logic unchanged.
2. Register it as a `sources` row.
3. Run it in **shadow mode**: the pipeline writes `source_records` only, with no merge, and a diff report compares what the new path *would* produce against what the old cron wrote.
4. Once parity passes (or the differences are intended fixes, documented in the WP), enable merge and remove the old cron line from `vercel.json`.
5. Optionally rewrite onto a generic adapter later. Outer Limits → `squarespace-json`, WDET and Belle Isle → `tribe-rest`, MotorCity → `ics`.

Two connectors migrate first. `cron-feeds` goes first because it's already generic, and the ICS adapter is the highest-leverage adapter. Ticketmaster goes second because it's the largest volume and the riskiest (G5).

---

## 3. Source discovery and source registry

### 3.1 Vocabulary

Four entities are kept distinct. Conflating them is the root of B3 and of the "source vs organizer" confusion that `FOUNDATIONAL_ITEMS.md` §3 flagged.

| Entity | Meaning | Example |
|---|---|---|
| **Organization** | Who publishes or presents | Ann Arbor District Library; Paxahau; City of Royal Oak |
| **Source** | One ingestible endpoint belonging to an organization, with one adapter and one config | AADL's events ICS feed; Paxahau's Instagram (manual source) |
| **Platform** | Software many sources share. A platform is what an adapter targets. | Localist, The Events Calendar (Tribe), LibCal, Communico, CivicPlus, GrowthZone |
| **Place** | Physical location. Venues and municipalities. | Masonic Temple; Ypsilanti (city) |

The rules: one organization can have many sources; one source can list events at many venues (aggregators, library branches); one platform serves many sources. `organizers` (migration_002) becomes `organizations`, or gains the needed columns. It's populated *from sources first*, which is uncontroversial because a source's publisher is a fact. Performer-level "who is presenting" stays hand-curated, as `FOUNDATIONAL_ITEMS.md` intended.

### 3.2 Registry schema

Extend the existing `sources` table from migration_004 rather than creating a new one. Its research columns keep their meaning. Then **merge `feed_sources` into it** by adding `origin = 'organizer_submitted'` and keeping `submit-feed.js` working against a compatibility view. After that there's one registry.

New or changed columns, grouped:

| Group | Columns |
|---|---|
| Identity | `slug` (stable machine id; replaces free-text `events.source` as the key, fixes B3), `display_name` (the "via …" label), `organization_id`, `platform_id`, `homepage_url`, `events_url` |
| Acquisition | `adapter` (key), `adapter_config jsonb` (validated against the adapter's schema), `access_class` (§7), `auth_ref` (name of env secret, never the secret) |
| Policy | `permission_basis` enum: `public_api_terms \| published_feed \| organizer_submitted \| written_permission \| robots_permitted_public_page \| manual_only \| not_permitted`; `robots_status` + `robots_checked_at`; `tos_url` + `tos_summary` + `tos_checked_at`; `ai_crawler_block bool` (robots names ClaudeBot or AI crawlers: a harder "no", per ASSESSMENT §6); `policy_notes` |
| Trust and precedence | `trust_tier` (T1–T5, §6.1), `precedence jsonb` (per field group; defaults derived from the tier), `auto_publish bool` (derived; overridable) |
| Priority and schedule | `priority_tier` (P0–P3, §6.2), `priority_score numeric`, `cadence_minutes`, `max_cadence_minutes`, `next_run_at`, `window_days` |
| Geography | `primary_place_id`, `coverage_places uuid[]`, `in_orbit` (for single-venue sources), `country` |
| Coverage tags | `category_families text[]`, `audience_tags text[]` (family, 21+, students…) |
| Lifecycle | `state` enum: `candidate \| researching \| ready \| active \| degraded \| quarantined \| paused \| blocked \| retired`; `state_reason`; `state_changed_at` |
| Health | `health` (`healthy\|warning\|failing\|unknown`), `last_run_id`, `last_success_at`, `consecutive_failures`, `baseline_records` (trailing median) |
| Provenance | `origin` (`research_import\|organizer_submitted\|admin_registered\|discovered:<channel>`), `imported_from`, `discovered_at`, `owner` (who maintains), `contact_email` |
| Commercial (existing) | `ticketed`, `primary_ticketing_platform`, `affiliate_program_available`, `monetization_opportunity` |

Supporting tables:

| Table | Purpose |
|---|---|
| `platforms` | `key, name, adapter, fingerprint_rules jsonb, docs_url, policy_summary, notes` |
| `organizations` | `id, name, type, website, instagram_url, facebook_url, place_id, notes`. Venue social columns (migration_033) are the model. |
| `source_runs`, `source_fetches` | §8.1 |
| `source_state_log` | Every lifecycle transition with actor and reason, for audit |

`events.source` (free text) stays as the display label, derived from `sources.display_name` and set by merge. `events.source_id` finally gets populated as the primary record's source.

### 3.3 Source lifecycle

```
candidate ──triage──► researching ──probe+policy ok──► ready ──dry-run approved──► active
    │                      │                                                       │  ▲
    │                      └─► blocked (policy: not_permitted / ai_crawler_block)  │  │ auto-recover
    └─► retired (dup / out of orbit / no events)                                   ▼  │ after N good runs
                                                          degraded (warnings) ─► quarantined (auto,
                                                                                 N consecutive fails)
                                                          paused (manual) ; retired (manual)
```

**Transition rules:**

- `ready → active` needs a **dry-run preview that a human approved**. The preview shows the parsed events, geography verdicts, duplicate candidates against existing events, and quality flags. This closes the "approve without preview" risk that `FEED_SUBMISSIONS.md` flagged.
- `active → quarantined` is automatic after `N` consecutive failed runs (default 3, or 1 for block-page detections). A quarantined source keeps its existing events but writes no new records. Reconcile never runs on it.
- `blocked` (policy: robots, terms, AI-crawler block) is re-probed automatically every 30 days, which covers robots changes. It never auto-reactivates: re-probing produces a `source_candidate` issue. A *technical* block (WAF/challenge) puts an active source into `quarantined`, re-probed after 7 days and then every 30 (§7.7).

### 3.4 Discovery strategy: channels that scale

Discovery has to produce **registry candidates**, not spreadsheets (B7). Each discovery channel (DC1–DC7) below writes `sources` rows with `state = candidate` and `origin = discovered:<channel>`. A candidate is **auto-probed** (§3.5). Only candidates that probe well, or rank high on priority, reach a human.

| # | Channel | How it works | Why it scales |
|---|---|---|---|
| DC1 | **Platform tenant enumeration** | For each platform with an adapter, enumerate its tenants inside the Orbit. Seed lists: state library directories (MI, OH), Ontario public library list, Census place list → municipality sites, chamber directories, university lists. Then fingerprint each candidate site (below). The regional research sections of PHASE0 (§9, §12) report the multipliers: Localist (UM, BGSU, Macomb CC; Wayne State likely), GrowthZone (6 of 9 SE Michigan chambers), CivicPlus (5 of 8 SE Michigan municipalities/DDAs), Communico (Toledo-Lucas, Clinton-Macomb and Essex County), LibraryCalendar (3 suburban systems), Tribe Events (Michigan Science Center, TWEPI, Capitol Theatre Windsor, EPIC Wine Country). PHASE0's own summary table in §8 is more conservative: it confirms only one CivicPlus user, calls Communico "only two" systems, and lists LibraryCalendar's feed status as unconfirmed. The probe step (§3.5) settles each claim before anything is built on it | One adapter serves N sources. Onboarding cost is a probe and a preview per tenant. |
| DC2 | **Jurisdiction sweep** | For every municipality/township/CSD in `places` (§4.4), a fixed checklist of expected publishers: municipal calendar, parks & rec, library, DDA / Main Street, chamber, school district community ed, historical society, tourism bureau, major venue(s). Each unchecked item becomes a research task; each found calendar becomes a candidate. | Turns "comprehensive" into a finite, measurable checklist (§9.2 coverage matrix). |
| DC3 | **Venue-driven reverse discovery** | Every venue that appears in aggregator records (Ticketmaster, Visit Detroit, submissions, manual captures) but has no first-party source of its own becomes a candidate: "find this venue's own calendar". Ranked by event count seen via aggregators. | The aggregators we already ingest effectively list venues that have a calendar worth ingesting directly. |
| DC4 | **Outbound-link mining** | `event_url`, `ticket_url` and description links in ingested records are grouped by domain. Recurring organizer domains that aren't in the registry become candidates. The same applies to `editorial_articles` links and venue mentions. | Zero-cost: it's data we already hold. |
| DC5 | **Inbound** | `submit-feed` (organizer ICS), `submit.js` (event submissions): each new `submitter_org_name` becomes an organization candidate with a "does this org publish a calendar?" task. Also a "claim your venue / connect your calendar" CTA on venue pages. | The ecosystem does the work. |
| DC6 | **Assisted web research** | Periodic research runs (agent-assisted, human-reviewed) per `place × category family`, using search queries such as "`<city>` events calendar", "`<city>` library events", "`<county>` parks programs". Results are proposed as candidates, never auto-activated. | Covers the long tail that DC1–DC5 miss. |
| DC7 | **Research import** | One-time import of the 213-row draft, SOURCE MASTER (20) and PRODUCTION REGISTRY (52), in the order and with the Planet Ant special case from PHASE0 §7, then re-verification against code. | Preserves prior research instead of repeating it. |

### 3.5 Probing and fingerprinting (the onboarding multiplier)

`probe(url)` is the single most important discovery tool: it is what makes onboarding a registry operation instead of a coding task. Given any URL, it runs a fixed, polite battery of checks: a few requests at most, and it honours robots:

1. Fetches `robots.txt` and evaluates it for our UA, `*`, and named AI crawlers. It also finds the terms-of-service link, recorded for human review.
2. Scans the page HTML:
   - `<link rel="alternate" type="text/calendar">` and `application/rss+xml`
   - `webcal:` links and `.ics` hrefs, including "Add to calendar" and "Subscribe" links
   - JSON-LD blocks with `@type: Event` / `EventSeries`
   - microdata `itemtype=schema.org/Event`
   - generator meta tags: WordPress, Squarespace, Wix, Drupal
3. Probes the platform endpoints the fingerprints point to:

| Platform | Endpoint(s) probed |
|---|---|
| Tribe | `/wp-json/tribe/events/v1/events?per_page=1`, `?ical=1` |
| WordPress MEC | `/wp-json/wp/v2/mec-events` |
| Squarespace | `?format=json` on the events collection |
| Localist | `/api/2/events` |
| LibCal | `/1.1/events` (needs a key, so recorded as key-gated), or the public `calendar?cid=…&t=d&d=0000-00-00&cal=…&inc=0` ICS |
| Communico | `/eeventcaldata` pattern (verify) |
| CivicPlus | `/RSSFeed.aspx?ModID=58`, `/iCalendar.aspx` |
| LibraryCalendar | `/events/feed/json` |
| Eventbrite organizer | page → organizer ID (organizer-authorized only) |
| CrowdWork / Tixr / Fever / Humanitix | ticketing-link domains |

4. Checks the sitemap for `/event/` or `/events/` path clusters, for detail-crawl feasibility.
5. Checks whether the page needs JavaScript to render: little server-rendered text plus a script-heavy page. If so, it looks for an XHR API pattern such as Algolia, a known JSON endpoint, or `__NEXT_DATA__`.

The output fills in the capability flags the existing `sources` columns already model: `public_api_available`, `rss_available`, `ical_available`, `jsonld_available`, `website_extraction_feasible`. It also produces a **ranked list of (adapter, suggested config, confidence)** and a **policy verdict**. The admin console shows this next to a dry-run of the top suggestion, so onboarding becomes: paste URL → review → approve.

### 3.6 Admin source console

This is a new tab in `admin.html` that sits alongside the existing ones, with actions through `api/admin-sources.js`. It offers:

- **Registry list.** Filter by state, health, tier, place, platform and adapter.
- **Per-source page.** Config, policy block, last 30 runs (counts, duration, errors), current records, and the canonical events it contributes to, including which ones it alone supplies.
- **Actions.** Probe, dry-run, approve, pause/resume, run now, retire, edit config (validated).
- **Register a found feed or URL** (PHASE0 §5's admin "register" action, generalized to any adapter).
- **Candidate triage queue**, sorted by `priority_score`.

`sources.html` becomes a generated public view over the registry, as SOURCE_REGISTRY_ARCHITECTURE §3 and PHASE0 §7 recommend. It shows only `display_name`, platform, state and category families, never policy notes.

---

## 4. Geographic coverage methodology

### 4.1 Definition (unchanged, made computable)

**Detroit Orbit** = every point whose geodesic distance to the City of Detroit's official boundary is at most **75 statute miles (120,700.8 m)**. Points inside the city are at distance 0. This is exactly the `SERVICE_AREA.md` definition of 2026-09-20; nothing about scope changes here. What changes is **where the rule is evaluated**:

- today: one connector plus a client-side string lookup;
- proposed: once per venue, in the database, against the full-precision polygon.

### 4.2 Stored geometry (single source of truth)

This needs one Supabase extension, `postgis`, and one reference table:

- `geo_regions(key, name, geom geography, source, retrieved_at, vertex_count, notes)`. It holds three regions:
  - `detroit_boundary`: the full 1,090-vertex outer ring from the City of Detroit's `City_of_Detroit_Boundary` layer, per SERVICE_AREA.md.
  - `detroit_orbit`: a derived buffer, `ST_Buffer(detroit_boundary, 120700.8)`. It's used only for display, tiling and client export, never for membership decisions.
  - `orbit_review_band`: the ring between 74 and 76 miles, used for review routing.
- Membership is computed exactly, not from the buffer. On `geography`, PostGIS measures on the spheroid by default (`use_spheroid = true`). That is the canonical measure from now on. It will differ slightly from SERVICE_AREA.md's figures, which came from an equirectangular approximation on a 70-point ring (±0.15 mi). WP 1.10 re-derives SERVICE_AREA.md's table under the new measure, and reports every place whose in/out status changes to Jody before anything depends on it. Near-line places like Saginaw (75.4), Clinton County (75.4) and Hillsdale (75.5) are exactly the cases that could flip. The in-orbit test is `ST_DWithin(point, detroit_boundary, 120700.8)`, and the distance column is `ST_Distance(point, detroit_boundary) / 1609.344`. Because the boundary is stored as a polygon, the distance is naturally 0 inside the city, including the Hamtramck/Highland Park enclaves, since only the outer ring is used. Using the full-precision ring also removes the ±0.15 mi simplification error the current JS function documents.
- The client and server JS copies of the polygon (`index.html:4830`, `_lib/detroit-boundary.js`) become **generated artifacts**, exported from `geo_regions` by a script. A parity test checks the JS function against PostGIS for 200 sample points (G4).

### 4.3 Where the rule is applied

| Step | Rule |
|---|---|
| Venue resolve (pipeline stage 5) | Every venue gets `lat`, `lng`, `geo_precision` (`rooftop\|street\|postal\|place_centroid\|unknown`), `geo_source`, `distance_from_border_mi`, `in_orbit`, `place_id`, `country`, `region`. These are stored columns, refreshed by a trigger whenever coordinates change. |
| Record | Inherits `in_orbit` from its venue. For online events it is `in_orbit = organizer's place in orbit`, and the event is flagged `online`. |
| Out-of-orbit records | **Kept, not dropped**, with `state = out_of_orbit`. They're never published. This preserves the evidence for boundary reviews and lets a future radius decision (Saginaw at 75.4 mi) be applied by recomputation instead of re-ingestion. |
| Source-level filters | Removed. WDET's city allowlist (`cron-wdet.js:40`) is deleted during migration, so every source is judged by the same rule (G1). |
| Publish policy | Auto-publish requires `in_orbit = true` with `geo_precision ≥ street`, or `place_centroid` with the whole place inside the Orbit (§4.5). |

### 4.4 `places`: the municipal reference layer

This replaces the hand-kept `LOCATIONS` array in `index.html` (G2): 56 cities plus 40 Detroit neighborhoods.

- **Contents.** Every incorporated place, census-designated place and **county subdivision (township)** in the Orbit. Townships matter in Michigan: a large share of suburban venues are addressed "X Township" or "Charter Township of X". Ontario gets census subdivisions. Each place carries its county.
- **Columns.** `id, name, kind (city|village|township|cdp|csd|neighborhood), county, region (MI|OH|ON), country (US|CA), geom (polygon), centroid, area_sq_mi, population, distance_from_border_mi, in_orbit (full|partial|none), aliases text[]`. Aliases cover forms like "Charter Twp of Clinton", "Clinton Twp" and "Mt. Clemens".
- **Sources.** US Census TIGER/Line places + county subdivisions + Gazetteer centroids and population (MI, OH), and Statistics Canada census subdivision boundaries (ON). These are public-domain or open-licence datasets, imported once by a script (WP 1.9). Note that this cloud workspace's network policy blocked census.gov during this audit, so the import may need to run on Jody's machine or from files she downloads.
- **Detroit neighborhoods** stay as they are (the `neighborhoods` table, Detroit-only by the 2026-08-24 decision). They can optionally get polygons later (FOUNDATIONAL §5 deferred PostGIS; this makes it cheap).
- **What uses it:**
  - city-string normalization in the venue resolver;
  - centroid fallback geocoding;
  - the client location picker, exported as a static JSON file at deploy;
  - the coverage matrix (§9.2);
  - the jurisdiction sweep (§3.4 DC2).

### 4.5 Coordinate acquisition hierarchy and the boundary band

Resolution order for a venue's coordinates, stopping at the first success. Each result records precision and source.

1. **Source-supplied coordinates**: Ticketmaster `venues[].location`, Localist `geo`, JSON-LD `geo`, ICS `GEO`. They're accepted if they fall within 25 km of the geocoded address, when one exists. That guards against junk (0,0) coordinates.
2. **Existing venue match** through aliases (§5.5), inheriting that venue's coordinates.
3. **Address geocoding.** Use the US Census Geocoder for US addresses: free, no key, with a batch endpoint. Canadian addresses need a separate provider; this is decision A6. Nominatim (OSM) works within its usage policy of 1 request/second, caching and attribution. Results are cached permanently in `geocode_cache(address_norm, provider, result, at)`. Commercial geocoders often restrict storing results, so those terms need checking before one is picked.
4. **Place centroid** from `places`, matched by normalized city + region.
5. Otherwise `unknown`, which raises a `geo_unresolved` issue. The event is still published in non-geographic views if its source is T1/T2 and its city resolves to an Orbit place; it's never counted in Orbit stats until resolved.

The **review band scales with precision**, so manual review happens only where the answer is genuinely uncertain:

| Precision | Band that triggers `geo_boundary_band` review |
|---|---|
| rooftop / street | 74.8–75.2 mi |
| postal | 74–76 mi |
| place_centroid | 75 ± *r*, where *r* = √(place area / π), the place's effective radius. A place wholly inside (distance + *r* ≤ 75) needs no review. |

### 4.6 Radius-query sources: tiling instead of one big circle

This is for APIs queried by point and radius (Ticketmaster today; Eventbrite-style, Fever and similar later). Adapters use **adaptive tiling**:

1. Cover the `detroit_orbit` polygon with a set of query circles, **generated algorithmically**: a hexagonal grid of 40-mile circles, keeping those that intersect the Orbit. The generator's test checks that every point of the Orbit polygon (sampled at 1-mile spacing along and inside its edge) lies at least 2 miles inside some circle. A hand-picked set of 7 circles of radius *R*/2 would have zero margin: the Orbit reaches about 89.6 mi from Detroit's center point, and that figure was only measured in 12 directions.
2. For each circle and each time slice (start with 30-day slices across the 90-day window), query and read `page.totalElements`.
3. If a query saturates (`totalElements > 1000`, beyond what Ticketmaster's `size × page < 1000` cap lets you page through), split it. Break the time slice first (30 → 10 → 3 days), then the circle, into 4 children of radius *r*/√2 centered on its quadrants, which is the minimum that still covers the parent. Re-query. Any failed page request marks the run `partial` (no reconcile) instead of silently keeping what it got.
4. Union the results, dedupe by native ID, then apply the exact Orbit test per venue (§4.3).

This fixes G5 (probable truncation) and G6 (thin center-radius margin). The same code also migrates from `latlong` to the documented `geoPoint` parameter (the `cron-ticketmaster.js:78-84` note). The tiling plan and saturation counts are logged in `source_runs`, so truncation becomes visible instead of silent.

### 4.7 Cross-border and multi-state specifics

- `country` (`US`/`CA`) and `region` (`MI`/`OH`/`ON`) live on venues and places. Events inherit them.
- **Currency**: prices carry a currency. The display rule is to show "CA$" for CAD; conversion is out of scope.
- **Address parsing** handles Canadian postal codes (`A1A 1A1`) and provinces.
- **Time zones**: every Orbit location is in US Eastern or Ontario Eastern time, and both follow the same DST rules. Store the IANA zone anyway (`America/Detroit`, `America/Toronto`, `America/New_York`) so the model doesn't bake in an assumption.
- **The Ontario source landscape differs.** Govstack municipal CMS (PHASE0 §9), Communico (Essex County Library) and TWEPI's Tribe feed are already identified. There are no live Ontario connectors, so Ontario is a coverage-matrix priority (§9.2).

### 4.8 Coverage rings and the place checklist

Coverage is reported by **ring**, so the sparse outer Orbit isn't drowned out by the dense core:

| Ring | Definition | Examples |
|---|---|---|
| R0 Core | Detroit + Hamtramck + Highland Park | — |
| R1 Inner | 0–15 mi from border | Dearborn, Royal Oak, Ferndale, Southfield, Windsor, Grosse Pointes, Warren, Pontiac (13.5) |
| R2 Middle | 15–40 mi | Ann Arbor, Ypsilanti, Rochester, Monroe, Brighton, Howell, Fenton, Chatham ON |
| R3 Outer | 40–75 mi | Flint, Port Huron, Sarnia, Toledo, Adrian, Jackson, Lansing/East Lansing, Bowling Green, Sandusky OH, Port Clinton |

Appendix C gives an **indicative** county list, computed during this audit with the project's own boundary function against approximate county-seat coordinates. The authoritative list comes from the `places` import (WP 1.9) through polygon intersection. It already shows several areas absent from all prior research: **Erie County OH** (Sandusky / Cedar Point, about 60 mi), **Ottawa County OH** (Port Clinton / Put-in-Bay / Lake Erie islands, about 52 mi), **Sandusky County OH** (Fremont), the **Thumb** (Sanilac, Tuscola), **Shiawassee**, **Jackson** and **Lenawee**. It also shows the partial counties along the line (Clinton, Saginaw, Hillsdale, Henry OH, Middlesex ON).

---

## 5. Deduplication and entity resolution

This section **adopts PHASE0 §2's design**: an append-only record ledger (`source_record_versions`, §2.7), a review queue, a tiered cascade, precedence, a hard rule that differing showtimes never merge, and replaying the historical incidents as regression tests. It then extends that design in six places: record continuity, blocking, explicit feature scoring, listing kinds, venue resolution and evaluation.

**Departures from PHASE0, stated explicitly:**

1. Two renames. `event_source_records` becomes `source_records` plus `source_record_versions`. `dedup_review_queue` becomes `match_candidates` (the scored pairs) plus `match_review` items in the unified `ingestion_issues` inbox.
2. PHASE0 §4 recommended "no geocoding, not a full entity-resolution rebuild" for venues. This design adds geocoding and a scored venue resolver (§5.5), because the Orbit rule and radius search need coordinates for every venue, not just dedupe. That is a deliberate expansion of scope, covered by decision A2 and WP 4.2–4.4.
3. PHASE0 excluded `is_recurring` rows from automated matching entirely. That exclusion is kept for **legacy** rows with `is_recurring = true` (review-only). New series occurrences are matchable, but only to records on the same local date and start time (§5.4).

### 5.1 Three identity layers

| Layer | Question | Mechanism |
|---|---|---|
| **Record identity** | Is this the same listing *within one source* as last run? | `(source_id, source_key)`; record continuity (§5.2) |
| **Entity identity** | Is this the same venue / organization / performer? | Alias tables, external IDs, coordinates, fuzzy name (§5.5) |
| **Event identity** | Are these records the same real-world occurrence? | Blocking, scoring, decision (§5.3–5.4) → cluster = one canonical `events` row |

### 5.2 Record continuity (fixes E2)

Adapters must emit native stable keys: an API id, ICS `UID` (plus `RECURRENCE-ID` for overrides), or a canonical URL slug when the source's URLs are stable. Where a source has none (HTML-line parsers such as Dossin, HALO, Redford and Trinosophes), the adapter emits `source_key = null` and the pipeline applies **continuity matching within that source**:

- A new keyless record is compared to that source's records that went *missing in the same run*.
- If it has the same start (±15 min), the same venue, and title similarity ≥ 0.6 (token-set), it is treated as **the same record with an edited title**. It inherits the old key.
- Otherwise it gets a synthetic key, `hash(source_id, local start minute, venue_id or place)`.

For keyless sources the synthetic key deliberately **excludes the title**. Two different shows at the same venue and minute are then distinct only by title. That case is rare, and it's caught because the continuity comparison runs before the key is assigned.

### 5.3 Blocking and features

Pair-scoring every record against every event would be quadratic, so candidates are **blocked** first. A record is only compared with existing canonical events that share at least one blocking key:

1. `(local_date, venue_id)` when the venue is resolved.
2. `(local_date, geohash6)` when there are coordinates but no venue. Geohash6 cells are about 1.2 × 0.6 km.
3. `(local_date, place_id, title_key)` when only the city is known. `title_key` is the first two significant normalized tokens.
4. `(performer, local_date)` when performers are present.
5. For multi-day runs: overlap of `[start_date, end_date]` with the same venue.

Features computed per candidate pair:

| Feature | Computation |
|---|---|
| `title_sim` | Max of token-set ratio and trigram similarity on **normalized** titles. Normalization strips presenter prefixes ("X presents:"), tour suffixes after ` – ` / `:` (kept as a secondary token set), "SOLD OUT", "(18+)", ticket-tier words ("VIP", "GA", "Package", "Parking", "Suite") and punctuation, and case-folds and removes diacritics. |
| `time_delta_min` | Absolute difference of `start_at`. Null when either side is date-only. |
| `venue_level` | `same_id` > `alias` > `same_geohash7` > `same_place` > `different` > `unknown` |
| `performer_overlap` | Jaccard of performer sets |
| `url_overlap` | Same `ticket_url`/`event_url` after canonicalization. The same Ticketmaster event id in an affiliate-wrapped URL counts. |
| `organizer_match` | Same organization id or domain |
| `price_consistent` | Min price within 20% or both free |
| `source_relation` | Same source (should already be caught by continuity), sibling sources (same organization), or independent |

### 5.4 Decision rules

**Hard constraints** (never auto-merge):

- **Different start times listed by the same source** for the same title and date. The source itself says these are distinct shows (Mojo Brookzz 7 pm / 10 pm). This is PHASE0 §2 rule 5, kept as a hard block.
- **Across sources**, `time_delta_min > 90` blocks. Where `15 < time_delta_min ≤ 90`, the pair can **never auto-link**; it goes to review, because the gap may be doors vs show time or a genuine second show. Only `time_delta_min ≤ 15`, or one side being date-only, can auto-link. That is stricter than a single 90-minute threshold, and it matches the intent of PHASE0's rule while tolerating the common doors-vs-show disagreement between sources.
- `venue_level = different`, both venues have street-precision coordinates more than 1 km apart, and there's no url or performer overlap. This is the Fillmore vs Freedom Hill Young Thug case.
- Different `listing_kind` (`add_on` vs `event`). Add-ons are *attached*, not merged (below).
- Both records come from the **same source** with different native keys. A source listing two items means two items; trust it, unless the moderator merges them.
- Either side is a materialized series occurrence and the other has a different local date.

**Scoring.** v1 uses an explainable weighted rule score:

```
score = Σ wᵢ·fᵢ / Σ wᵢ   over the features actually present on both sides
weights: title 0.45, venue 0.20, time 0.15, url 0.10, performer 0.05, organizer 0.05
```

The sum runs only over features present on both sides. A missing performer list or organizer doesn't count as zero, so a perfect title + venue + time match scores 1.0, not 0.80. There's also a **deterministic rule** alongside the score: title_sim ≥ 0.95 **and** venue_level ∈ {same_id, alias} **and** time_delta_min ≤ 15 **and** no hard constraint means auto-link regardless of score. That covers the common Ticketmaster × venue-feed case without depending on calibration.

`venue_score` and `time_score` are mapped to the range 0–1. Weights and thresholds are **calibrated on the gold set (§5.8) before any auto-merge is enabled**. The starting thresholds are:

| Score / condition | Action |
|---|---|
| Deterministic rule above, **or** score ≥ 0.90 with no hard constraint, **or** `url_overlap = 1` with the same date | **Auto-link** (PHASE0 Tier 2) |
| 0.70–0.90 | Link *provisionally*, i.e. the record creates or keeps its own canonical event, **and** open a `match_review` issue. Nothing is hidden by a guess (PHASE0 Tier 3). |
| < 0.70 | New canonical event (PHASE0 Tier 4) |

**Special structures:**

| Structure | Handling |
|---|---|
| **Add-ons** (Ticketmaster "VIP Package", "Parking", "Suite Rental", "Premium Seating") | Detected by title patterns plus Ticketmaster classification/subtype. They become `listing_kind = add_on` and attach as children (`parent_event_id`) of the matching main event, shown as "more ticket options" and never listed on their own. Replaces the manual `dedupe-batch3-tm-package-variants` work. |
| **Multi-performance runs** (plays, "A Christmas Carol" × 9) | One canonical event per performance, grouped under a `series_parent` or `exhibition_run` parent where a source supplies the run. Never merged across dates (PHASE0 test C). |
| **Festivals / multi-day** with source-dependent ranges | A container event (`series_parent`) plus day-level children where any source lists days. Conflicting ranges become `match_review` (PHASE0 test D). |
| **Exhibitions** | One `exhibition_run` spanning dates. Per-date listings from sources such as RA's per-date "House of Tarot" attach as children. |
| **Recurring series** | Materialized occurrences match venue-feed listings on the same date (§2.8). |

### 5.5 Venue and organization resolution

The design adopts PHASE0 §4's `venue_aliases` and extends it:

1. **Exact alias or name hit** within the same place → link.
2. **External-ID hit**: `venue_external_ids(venue_id, system, external_id)`, where the system is Ticketmaster venue id, OSM id, Localist place id, Google place id if used. This is the strongest signal. Ticketmaster venue IDs alone would resolve most of the ~80% Ticketmaster share deterministically.
3. **Candidate generation**: venues within 300 m of the record's coordinates, or in the same place, with name trigram ≥ 0.3.
4. **Scoring** uses name similarity after venue normalization. That strips "The", "Detroit", "Theatre/Theater", "Hall" and similar generic words, and removes room names ("Magic Stick" vs "Majestic Theatre" are **different rooms in one complex**, so rooms become child venues). The other signals are address-number and street match, distance, and the website domain.
5. **Decision:**
   - Score ≥ 0.9 and within 150 m → link, and record the raw name as an `auto` alias.
   - 0.6–0.9 → `venue_match_review`.
   - No candidate and street-precision coordinates → **create the venue as `unverified`**, with `created_by = pipeline`, and queue `venue_new`.
   - Otherwise leave the record unlinked with `geo_unresolved`.

**This is a deliberate change from today's rule** that a cron "never creates a venue" (`_lib/venue-lookup.js` header). That rule was right with 83 hand-researched venues. With thousands of sources it guarantees most events stay unlinked, and so without geography. Unverified venues are fully usable for geography, but they're visibly marked in admin, and neighborhood assignment still follows FOUNDATIONAL §2's evidence rules. **Decision A2.**

Organizations get the same treatment, with website domain as the strongest key. A source's own organization is always known, since it's set at registration.

### 5.6 Merge mechanics (reversible)

| Operation | Effect |
|---|---|
| **Link** | Set `source_records.event_id` to the canonical event, then recompute the canonical fields (§2.7). |
| **Merge two canonical events** | This is a moderator action, or an auto-link that joins two existing clusters. The survivor keeps its `id`, which keeps its URL, Facebook posts and editorial links. The other gets `status = 'merged'` and `merged_into_event_id = survivor`. Its records re-point to the survivor. `editorial_article_events` rows re-point by trigger, which removes the manual re-pointing from the Jazz Fest incident. `event.html?id=<merged>` redirects to the survivor. |
| **Unmerge** | Re-point the chosen records to a restored or new canonical row. Nothing is ever deleted, so every merge is reversible (PHASE0 §2 provenance). |
| **Survivor selection** | Prefer the event that already has the most external references (Facebook post, editorial links, submitter). Otherwise the oldest. |

### 5.7 Review UX

A `match_review` item shows the two events side by side, with a per-field diff, the signals and score, the records behind each, and a map pin for each venue. The actions are **Same event** (merge), **Different** (records a *negative pair* so the matcher never re-proposes it), **Add-on of** and **Part of series**. Every decision is written to `match_decisions`, which feeds calibration.

### 5.8 Evaluation (gold set)

The gold set is built from real, already-adjudicated history before any auto-merge is enabled:

- **Positives:** every pair resolved in the 11 archive dedupe files (`update_2026-09-04_dedupe_*`, `update_2026-09-17_dedupe-batch1..4`, `dedupe-313-andy-arts`, `numa-crew-ra-merge`, and so on). The 21-pair Manual-vs-Ticketmaster sweep, 41 Ticketmaster-vs-Visit Detroit pairs, and the Ticketmaster package variants.
- **Hard negatives:** Mojo Brookzz's two Ticketmaster showtimes, the suite rental, Fillmore vs Freedom Hill, the "A Christmas Carol" performances, and the "House of Tarot" per-date listings.

The gold set must also contain **random non-duplicate pairs drawn from the same blocks**, for example same venue and date with different titles. Hard negatives alone are too few, and a set that's mostly positives says little about precision. The matcher runs in **shadow mode** over all existing rows (WP 4.8) and must reach **precision ≥ 0.98 at the auto-link threshold** on the gold set, with recall reported. The live check in WP 4.10 then samples at least 150 auto-links. With zero errors, 150 samples give a 95% lower confidence bound of about 0.98; 50 would only support about 0.94. Only then is auto-link enabled. After that, precision is tracked continuously from review outcomes and from sampled audits (§9.1).

### 5.9 Backfill

Backfill happens in four steps:

1. Create one `source_record` per existing `events` row. Use `external_id` as the `source_key`, and map `source` text to a `sources` row (WP 2.10).
2. For the rows the archive dedupe files marked `rejected` as duplicates (they still exist), create records linked to their survivor with `link_type = manual`. That recovers provenance. Some early files **hard-deleted** the losers instead: PHASE0 §2 describes `update_2026-09-04_dedupe_common_events.sql` as deleting 21 pairs. Those rows are gone. Their SQL comments are used only as gold-set labels, not reconstructed.
3. Run the matcher in shadow mode, and queue proposals only.
4. Backfill venues: aliases from distinct `venue_name_raw` values, and Ticketmaster venue external IDs from Ticketmaster records. That requires one Ticketmaster run that retains venue IDs, a field the current connector doesn't store.

---

## 6. Source prioritization tiers

Three independent axes are kept separate on purpose. Today's `sources.priority` and `automation_feasibility` blend them together.

- **Trust tier (T1–T5):** how much the source is believed. It governs auto-publish and field precedence.
- **Priority tier (P0–P3):** how soon to onboard the source and how hard to maintain it. It governs the triage order and crawl cadence.
- **Access class (§7):** what technical and policy route the source takes.

### 6.1 Trust tiers

| Tier | Definition | Examples (current + planned) | Default publish | Default precedence |
|---|---|---|---|---|
| **T1 First-party** | The venue or organizer's own system, or an organizer-submitted feed, or an official institutional calendar | Lager House, Outer Limits, Planet Ant (CrowdWork is the venue's box office), MotorCity Wine GCal, approved `feed_sources`, library/university/municipal calendars | Auto (quality + geo gates) | Highest for time/date/description |
| **T2 Official platform API** | Ticketing or registration platform data published by the organizer through that platform | Ticketmaster, Localist, LibCal, Eventbrite (organizer-authorized), Fever, Humanitix | Auto (gates) | Highest for ticketing/price/sold-out; second for time |
| **T3 Curated aggregator** | Editorially maintained regional calendar | Visit Detroit, WDET, TWEPI, Destination Toledo, chambers | Auto if overturn rate < 2%, else review | Fills gaps only |
| **T4 Open aggregator / community** | Self-serve or unmoderated listings | Metro Times community calendar, public `submit.js` submissions | Review | Fills gaps only |
| **T5 Assisted capture** | Human-captured from social media or blocked pages, low machine-verifiability | Instagram flyers (Paris Bar), manual Resident Advisor captures (subject to decision A3) | Review, or auto if captured by an admin with a verification checklist | Lowest |

A source's tier can be **demoted automatically** when its rolling overturn rate crosses 5%, meaning moderators rejecting or correcting its auto-published events. The demotion is recorded in `source_state_log`.

### 6.2 Priority tiers and scoring

**Priority score:**

```
priority_score = (expected_unique_events_per_year × audience_weight × geo_gap_weight)
               ÷ (integration_cost × maintenance_risk)
               × access_feasibility
```

| Term | Estimation |
|---|---|
| `expected_unique_events_per_year` | The source's volume (from probe or a dry run) × uniqueness, where uniqueness = 1 − the share of its events already carried by existing sources. The dry-run duplicate check measures uniqueness directly: a venue whose shows are all on Ticketmaster scores low. |
| `audience_weight` | 1.0 by default. >1 for categories where coverage is weakest (§9.2): community, family, free, Ontario. |
| `geo_gap_weight` | 1 + (normalized deficit of the source's places in the coverage matrix). Sources in empty municipalities rank up. |
| `integration_cost` | 1 when an existing adapter just needs config. 3 for a new platform adapter, but amortized across tenants (÷ number of known tenants). 5 for a bespoke HTML recipe. 8 for the JS render worker. |
| `maintenance_risk` | 1 for API/ICS, 2 for structured data, 3 for HTML recipes, 5 for JS-rendered. |
| `access_feasibility` | 1 when permitted and working, 0.5 when a partnership ask is needed, 0 when not permitted. A score of 0 never enters the build queue; it goes to outreach instead. |

| Tier | Rule of thumb | Examples | Cadence |
|---|---|---|---|
| **P0** | Platform multipliers and very high unique volume | Localist (UM, Wayne State, MSU, BGSU, Macomb CC, UToledo if confirmed); Tribe tenants (TWEPI, Capitol Windsor, MiSci, EPIC Wine Country); Huron-Clinton Metroparks; Metroparks Toledo; LibCal and LibraryCalendar tenants with public feeds; Ticketmaster (existing). Communico, GrowthZone and other **key- or vendor-gated** platforms stay P1 until access is granted, as in PHASE0 §16 Tier 2. | 12–24 h |
| **P1** | Single sources with structured feeds and meaningful unique volume | Venue ICS/Tribe/Squarespace feeds; tourism DMOs; chambers on GrowthZone once keyed | 24 h |
| **P2** | HTML-only sources with moderate unique volume and a permitted route | Current HTML-line connectors; small venues | 24–72 h, adaptive |
| **P3** | Long tail, seasonal, low volume, manual-only | Cider mills, faith communities, one-off festivals | Weekly / seasonal / manual |

### 6.3 Build order implied by the tiers

Multipliers come first, because one adapter plus N registry rows is the cheapest route to coverage. Next come first-party feeds in empty places, then HTML recipes, and last the JS worker. This matches PHASE0 §16's Tier 1 list (Localist, Fever, Huron-Clinton Metroparks, TWEPI) and the first batch in §18. The one addition is that **Tribe REST/ICS and generic JSON-LD** move up alongside Localist. They are the two most common structured patterns probing will find, and neither needs any outreach.

---

## 7. Handling by source class

### 7.1 The access ladder and policy gate

Every source is classified into exactly one `access_class`. The pipeline always prefers the highest rung available. That matches the preference order already set in the workbook's START HERE sheet: API → RSS/ICS → JSON-LD → permitted HTML → partnership → manual.

| Rung | Access class | Adapter(s) | Fragility | Notes |
|---|---|---|---|---|
| 1 | `official_api` | ticketmaster, localist, libcal, fever, humanitix, eventbrite-org, crowdwork, growthzone | Low | Needs keys: `auth_ref` names the secret. Honor rate limits from response headers. |
| 2 | `calendar_feed` | ics, rss-events | Low | ICS: full RFC 5545 plus RRULE (shared `lib/ingest/ics.js`). RSS: see 7.3. |
| 3 | `structured_data` | jsonld, tribe-rest, wp-mec, squarespace-json, sitemap-detail + jsonld | Low–Med | JSON-LD parsed as JSON, never by key-order regex (the DMOD fragility). |
| 4 | `html_recipe` | html-recipe (declarative) | Med–High | Selector recipes stored in `adapter_config`, no per-site code (7.5). |
| 5 | `js_rendered` | render worker + jsonld/html-recipe | High | Only after proving no underlying JSON endpoint exists (7.6). |
| 6 | `partnership_required` | (none until an agreement) | — | Etix, RA, DICE, AXS, See Tickets, Tixr: tracked for outreach. |
| 7 | `manual_capture` | manual-capture | — | Assisted capture into the same pipeline (7.8). |
| 8 | `not_permitted` | — | — | Recorded with reason; re-probed every 30 days; outreach candidate. |

**The policy gate** runs in `fetchWithPolicy` on every request, not just once at onboarding:

- It refuses the fetch unless `permission_basis ≠ not_permitted` and robots allows the path for our UA.
- For `robots_permitted_public_page`, the source's recorded ToS review must not prohibit automated access.
- A source whose `ai_crawler_block = true` is never fetched automatically, even if it has a path otherwise allowed for `*`. That's the harder "no" that ASSESSMENT §6 describes.
- The gate is a pure function of the registry row plus cached robots. It's unit-tested, and it logs a `policy_denied` issue whenever it refuses.

**One identity, one honest User-Agent.** The UA is `313eventsBot/1.0 (+https://313.events/bot; events@313.events)`, backed by a public `/bot` page that explains what the bot collects and how to opt out or submit a feed. This replaces the three current UA styles, including the spoofed Chrome UA in `cron-metrotimes.js:210` and `cron-editorial.js:360`, which contradicts the project's own stated convention (I3). Using a distinct bot token also means sites can allow or deny 313.events specifically, which is the point.

### 7.2 APIs

- Each API adapter declares its paging model, rate limits, window and saturation signal. Ticketmaster's saturation signal is `totalElements ≥ 1000`; see §4.6.
- API responses are snapshotted like any other fetch, keeping fixtures and replay available.
- Keys live in Vercel env and are referenced by name.
- Key-gated platforms (GrowthZone, LibCal, Communico partner APIs) are registered in the `platforms` table with `requires_key`. Their tenants sit in `ready` with `state_reason = 'awaiting key'` until one arrives.

### 7.3 RSS and ICS

- **ICS** is the workhorse. The shared parser handles:
  - folding, TZID with VTIMEZONE, floating times, `VALUE=DATE`;
  - RRULE: FREQ DAILY/WEEKLY/MONTHLY/YEARLY, **INTERVAL** (biweekly events are common), BYDAY with ordinals (including negatives such as `-1SU`, "last Sunday"), BYMONTHDAY, BYSETPOS.
  - **COUNT** limits the rule's own generated instances. Dates later removed by EXDATE still use up COUNT, and RDATEs don't count toward it.
  - **UNTIL** is inclusive. It must be a UTC date-time when DTSTART has a TZID, and a DATE when DTSTART is a DATE; both forms are handled.
  - EXDATE, RDATE and RECURRENCE-ID overrides, and `STATUS:CANCELLED` for both the master and its instances (fixes F2);
  - `GEO`, `LOCATION`, `URL`, `IMAGE`.
- **Multi-venue ICS feeds** such as library systems and aggregators resolve each event's own `LOCATION` through the venue resolver, instead of forcing `feed_sources.venue_name` onto every event (a `FEED_SUBMISSIONS.md` known limit).
- **RSS** is only accepted as an *event* source when it carries event semantics:
  - event-namespaced RSS: `ev:startdate`, Tribe or LibCal RSS with explicit dates, CivicPlus calendar RSS;
  - or RSS items whose link pages carry JSON-LD `Event`. The adapter then treats the RSS as a discovery list for `sitemap-detail`-style child fetches.
- **Generic blog RSS never becomes events.** That preserves the `FEED_SUBMISSIONS.md` rule not to guess dates from `pubDate`, and the workbook rule that editorial RSS never creates events.

### 7.4 Structured data on ordinary sites

- **`jsonld`** parses every `<script type="application/ld+json">` block as JSON and walks `@graph`. It accepts `Event` and its subtypes (MusicEvent, TheaterEvent…), plus `EventSeries`, and maps `location`, `offers`, `eventStatus` (Cancelled/Postponed/Rescheduled), `performer` and `organizer`.
- **Listing pages** without JSON-LD but with detail pages that have it get `sitemap-detail` or listing-page link discovery, then per-detail child jobs.
- **Platform JSON**: Tribe REST, WP MEC, Squarespace `?format=json`, Wix `event-pages-sitemap.xml` + JSON-LD (the DMOD pattern, generalized). These are the proven patterns already in the codebase, re-expressed as configurable adapters.

### 7.5 Ordinary web pages: declarative HTML recipes

For sources with no feed and no structured data, and **only** where the policy gate permits: `html-recipe` evaluates a stored recipe using `cheerio`. The recipe declares:

- `item_selector`;
- per-field selectors with transforms: text, attr, regex capture, date-format hints, "inherit from nearest preceding heading" for date-grouped lists like Trinosophes;
- a `required` set;
- a `page_fingerprint`: a structural hash of the container's tag/class skeleton, used for drift detection (§8.3).

```json
{
  "item_selector": ".event-card",
  "fields": {
    "title": {"sel": ".event-title", "get": "text", "required": true},
    "start": {"sel": "time[datetime]", "get": "attr:datetime"},
    "date_text": {"sel": ".date", "get": "text", "date_hint": "MMM d"},
    "time_text": {"sel": ".time", "get": "text"},
    "event_url": {"sel": "a.more", "get": "attr:href", "absolute": true}
  },
  "year_rule": "next_occurrence",
  "time_default": null
}
```

- **No *undeclared* default times.** A missing time gives `start_precision = day` and a quality flag. Where Jody has made a deliberate per-source call (the Trinosophes "doors ~7:00 PM" default, `cron-trinosophes.js:189-197`), the recipe declares it as `time_default` with `time_approximate = true` and a public note. The data then records that the time is an editorial estimate, and the constant-value detector (§8.3) ignores declared defaults.
- **Recipes are authored with help, not generated at run time.** An LLM-assisted "suggest recipe" step in the admin console can propose selectors from a sample page. A human approves the dry-run output, and the recipe then runs deterministically. The LLM is never in the run-time path for date extraction, because silent date errors are the failure mode this project most wants to avoid.
- **Existing bespoke parsers** (Redford's multi-date state machine, HALO's block machine and so on) are kept as `legacy/*` adapters where a recipe can't express them. They're still migrated onto the pipeline, so they get validation, continuity, reconcile and monitoring for free.

### 7.6 JavaScript-rendered sites

1. **Find the data behind the page first.** Most JS calendars fetch JSON from an endpoint that can be called directly. That is how CrowdWork (Planet Ant) and Algolia (Visit Detroit) were integrated. The probe (§3.5) checks for known patterns: Algolia, `__NEXT_DATA__`, `/api/` XHRs, embedded calendar widgets (Google Calendar embed → its public ICS; Tockify, Timely, Elfsight → their feed endpoints).
2. **Only when that fails, and the policy permits automated access,** route to the render worker: headless Chromium outside Vercel, low cadence (at most daily, adaptive), same UA, same robots gate, one page per host at a time. It snapshots rendered HTML, which then goes through `jsonld`/`html-recipe` like any other page.
3. **Cost cap.** The render worker has a daily page budget. Sources compete for it by `priority_score`.

### 7.7 Bot-blocked sources

**Policy, restated from the project's own rules** (workbook HANDOFF #7; ASSESSMENT §6):

- The system never evades a block. No residential or rotating proxies. No UA or TLS-fingerprint spoofing. No CAPTCHA solving. No headless-stealth plugins. No retrying through challenge pages. No logging in to reach content.
- A WAF or challenge block is treated as the site operator saying no to automated access from us, *even when robots.txt would permit it*.

**Mechanics:**

- **Block classifier** in `http.js`. It recognizes HTTP 403/429/503 with challenge signatures: Cloudflare `cf-mitigated`/challenge HTML, DataDome, Akamai, Imperva/Incapsula, PerimeterX and generic "Access denied" pages. Each is recorded as `block_type`.
- **On a block:**
  - Record a `source_blocked` issue.
  - Stop the run without reconciling, so none of the source's events are marked missing.
  - Move the source to `quarantined` with `state_reason = blocked:<type>`.
  - Re-probe on a slow schedule: 7 days, then 30.
- **The route out of a block is always one of these:**
  1. An official feed or partnership: ask the operator. This is outreach, tracked on the source.
  2. The organizer submits their own feed (`submit-feed`).
  3. Aggregator coverage: check whether Ticketmaster, Visit Detroit or a Localist tenant already carries the events. The dry-run uniqueness metric answers this.
  4. The manual capture lane, **only where the source's terms allow it** (7.8).

**Current blocked or restricted sources and their routes:**

| Source | Block / restriction | Route |
|---|---|---|
| Metro Times | WAF 403 to Vercel IPs (`cron-metrotimes.js:181-190`) | Partnership / feed ask; also a T4 source, so its value is mostly discovery (DC4 link-mining), not events |
| Planet Ant / CrowdWork | Cloudflare 403 on 2026-09-04; header fix attempted 2026-09-05, outcome not recorded in code | Verify via run log (WP 0.13). If still blocked: ask CrowdWork or the venue for a feed. |
| Resident Advisor | ToS prohibits automated access; DataDome challenges seen during manual sessions (git log 2026-09-18) | Partnership request. Manual pulls are **decision A3**. |
| DICE, AXS, Etix, See Tickets, Tixr | ToS / partner-gated | Partnership; aggregator overlap audit |
| Senate Theater, Detroit House of Comedy, The Congregation, Northern Lights, Painted Lady, Eastern Market Brewing, Mic Drop, Mato, TV Lounge, Spot Lite | robots names AI crawlers | `not_permitted`; outreach for ICS / `submit-feed` |
| Scarab Club | ~150 bots disallowed, but an ICS feed exists | Outreach: the ask is simply for permission to subscribe to the feed |
| Instagram, Facebook | No third-party read API; ToS | Manual capture lane (T5) or organizer submission |

### 7.8 The manual and assisted capture lane

Today's manual lane produces the most valuable long-tail data: Resident Advisor nightlife, Instagram flyers, and editorial finds such as Cranbrook. But its output is SQL files that skip every check (D6, H4). The proposal routes it through the pipeline instead.

- **Manual sources are registry rows** such as `ig-parisbar`, `ra-manual` and `editorial-desk`, with `access_class = manual_capture`, T5 trust (or T3 for editorial desk captures), and their own policy notes.
- **A capture tool** (`admin.html` → "Capture") takes a URL, pasted text, an uploaded flyer image or a screenshot:
  - An extraction step, which can be LLM-assisted, drafts one or more `SourceEvent`s.
  - The pipeline shows venue resolution, geography, duplicate candidates and quality flags **before** submit.
  - The human corrects and confirms, and the records enter through `/api/ingest-intake` exactly as an adapter's would.
  - The flyer image is uploaded to `event-flyers` in the same step, replacing the separate `update_*_image.sql` files.
- **Agent-assisted sessions** (a Claude session in Jody's browser) produce capture-tool payloads (JSON `SourceEvent`s) instead of SQL. Each payload is reviewed in the same preview.
- **The benefits compound.** Venues, aliases and organizations created during capture persist, and duplicates are caught at capture time, not in a later dedupe batch. Reconcile *does not* apply to manual sources, since their absence carries no information, so manual events rely on `occurrence_status` updates made by hand.
- **Policy caution (decision A3).** Resident Advisor's terms prohibit automated access, and its bot protection has challenged sessions. A browser session driven by an agent is still automated access in the sense most terms use, even when a human asks for each pull. The honest options are: (a) pursue a written RA partnership; (b) restrict RA captures to details a human reads and enters personally; or (c) accept the ToS risk knowingly. This document doesn't make that call. It flags that the current practice is closer to (c) than the prior-session framing suggested. The same question applies, less sharply, to Instagram. A human transcribing a flyer is fine; bulk agent-driven browsing of profiles is less clearly fine.

---

## 8. Monitoring and failure detection

### 8.1 What gets recorded

The record is kept at three levels: run, fetch and record.

- **`source_runs`**, one row per run:
  - identity: `id, source_id, adapter, adapter_version, trigger (schedule|manual|retry|dryrun)`
  - timing: `started_at, finished_at, duration_ms`
  - outcome: `outcome (success|partial|failed|blocked|skipped_unchanged|policy_denied)`
  - fetches: `fetches, fetch_errors, bytes`
  - records: `records_parsed, records_valid, records_rejected (+ reasons histogram), new, changed, unchanged, missing, out_of_orbit`
  - quality: `field_completeness jsonb` (share of records with time, venue, image, description, price…)
  - window and state: `coverage_window, content_hash, page_fingerprint, tiling jsonb (radius sources: tiles, saturation)`
  - `error_class, error_sample, warnings`
- **`source_fetches`**, one row per HTTP request: `url, status, ms, bytes, etag, block_type, snapshot_path`. Pruned after 30 days.
- **Rejected records** are kept with their validation reasons in `source_record_rejects` (14 days), so "why is this event missing?" can be answered.

**Legacy crons get the same logging before they're migrated.** WP 0.5 wraps them with a `withRunLog()` helper. Instrumentation comes first so that migration parity can be *measured*.

### 8.2 Health model

Each source has a health state computed after every run from its trailing history:

| State | Entered when | Effect |
|---|---|---|
| `healthy` | Last run success/unchanged and no detector firing | — |
| `warning` | One failed run, or any *soft* detector (below) | Listed in the digest |
| `failing` | ≥ 2 consecutive failed runs, or any *hard* detector | Alert (P0/T1 immediately, others in digest); `source_failing` issue |
| *(lifecycle →)* `quarantined` | ≥ 3 consecutive failures, or 1 block detection | Not a health value: the health model moves the source's **lifecycle** `state` to `quarantined` (§3.3). New records are paused, reconcile doesn't run, and the source is re-probed slowly. Health keeps reporting `failing` until it recovers. |
| `unknown` | No run within 2× cadence | Treated as failing for alerting ("the scheduler itself may be broken") |

The **freshness** SLO is measured from `source_runs.finished_at` against the source's cadence. It replaces today's "was any `events` row with this `source` text updated" (K3).

### 8.3 Detectors (silent-failure catalog)

Each detector is a small pure function over `(this run, trailing runs, records)`. It has fixture tests and a severity.

| Detector | Fires when | Sev | Catches (real examples) |
|---|---|---|---|
| **Zero-yield** | `records_valid = 0` and trailing median ≥ 3 | Hard | Dossin's zero-row bug (fixed 2026-09-20), Metro Times "200 but zero rows" |
| **Volume drop** | `records_valid` < 50% of trailing 8-run median (seasonality-aware for known seasonal sources: DMOD, festivals) | Soft→Hard at <20% | Partial parse breakage; Ticketmaster truncation changes |
| **Volume spike** | > 3× median | Soft | Junk-line parsing (Trinosophes-style), duplicated pages |
| **Mass missing** | > 30% of in-window records missing in one run | Hard, **suppresses reconcile** | Source restructure, pagination break. Prevents mass false "cancellations". |
| **Reject spike** | Validation reject rate > 20% | Hard | Redford null titles; date parse failure |
| **Constant value** | One field has the same non-null value on > 90% of records, where the field is expected to vary (time, price, category) | Soft | Ticketmaster's `"Evening"` time placeholder; Metro Times' `"music"` placeholder. Declared per-source defaults (Trinosophes, §7.5) are excluded. |
| **All-past / far-future** | > 50% of records start in the past, or > 18 months out | Hard | Popps re-upserting 2025 posts; year-inference bugs |
| **Inverted ranges** | Any `end < start` | Soft (row rejected) | DetroitTraining Dec→Jan (migration_017 had to clean these up) |
| **Junk title** | Titles match nav/footer vocabulary, are duplicated across > 5 dates with no time, or are < 3 chars / > 200 chars | Soft | Trinosophes footer text; Cinema Detroit "About" pages |
| **Stuck window** | Crawl-type source fetches an identical URL set N runs in a row while the sitemap grows | Soft | Metro Times `slice(0, 40)` |
| **Drift** | `page_fingerprint` changed since last success | Soft (early warning) | Layout changes before they break parsing |
| **Block page** | Challenge signatures (§7.7) | Hard → quarantine | Metro Times WAF, Planet Ant Cloudflare, RA DataDome |
| **Saturation** | A radius or paged API returned exactly its cap | Hard | Ticketmaster 1,000 cap (G5) |
| **Timeout / budget** | A job was killed by the time budget | Hard | Playground's 3 s × N |
| **Stale calendar** | Source content unchanged 60+ days and no future events | Soft → suggest `retired` | Abandoned venue calendars |
| **Orbit leakage** | > 20% of a single-venue source's records resolve out-of-orbit | Soft | Wrong venue config / geocode error |

### 8.4 Alerting

- **Immediate alerts** go by email through the existing Resend integration, with optional push. They're sent only for: a P0 or T1 source entering `failing` or `quarantined`; the scheduler or worker not running (no `source_runs` rows in 2 hours); a saturation or mass-missing detector on Ticketmaster; and policy-denied events for a source that was previously active (robots changed). Alerts are **deduplicated**: one per source per state change, not one per run.
- **A daily digest at 8 am ET** is one email covering:
  - sources by health state, with changes since yesterday;
  - top detector firings;
  - new candidates discovered;
  - inbox counts by kind and age;
  - yesterday's new, changed and cancelled events;
  - coverage deltas.
- **A weekly quality report** covers the §9 metrics trend.

The digest is the **single place to look**. The current `healthchecks` table read-out becomes one section of it.

### 8.5 Healthcheck rework

`cron-healthcheck.js` keeps its useful platform checks: pages, auth 401s, submit validation, upload, sitemap. But its **source lists become queries over the registry**, so they can't go stale (K4). Every `state = active` source is checked for freshness, and every cron-style endpoint is checked for auth. The "source freshness" checks move to the health model (§8.2). Belle Isle-style breakage then surfaces as one `failing` source rather than a permanently red overall status.

### 8.6 Testing as monitoring

- **Golden fixtures per adapter.** Stored raw responses and their expected `SourceEvent[]` output run in CI (GitHub Actions on push). Every production parse bug becomes a new fixture before it's fixed.
- **Replay.** Any stored snapshot can be re-parsed with the current adapter version (`admin: re-parse run X`). Parser fixes can then be verified against real data, and backfilled without refetching.
- **Canary expectations (optional per source).** A source can declare "at least one event per week" or "a known recurring event (e.g., weekly skate night) appears within 14 days". Violations fire a soft detector.
- **Synthetic end-to-end check.** A registered internal test ICS feed with a rotating future event is ingested every hour. The healthcheck verifies it reached `events_public`, which proves the whole pipeline end to end.

---

## 9. Data-quality and coverage metrics

These metrics are computed nightly into `metrics_daily(date, scope_type, scope_id, metric, value)`, where scope is global, source, place, ring, county or category. They're shown in the admin console and the weekly report. **Baselines are unknown today.** Phase 0/1 instrumentation measures them first, and targets are set against measured baselines. The figures in the target column are proposed starting targets, not commitments.

### 9.1 Quality metrics

| Metric | Definition | Proposed target |
|---|---|---|
| **Completeness score** (per event, 0–100) | Weighted presence: `start_at` with time (20), resolved venue with street-precision coordinates (20), description ≥ 80 chars (15), image non-fallback (10), `event_url` or `ticket_url` (15), price or explicit free (10), category mapped (10) | Median ≥ 75 for published events |
| **Field completeness** | Share of upcoming published events with each field. Tracked per source, which drives the follow-up queue. | Time ≥ 95%, venue_id ≥ 95%, image ≥ 85%, description ≥ 70% |
| **Validity rate** | Share of records passing hard validation, per source | ≥ 98% for API/ICS; ≥ 90% for HTML |
| **Accuracy (audited)** | Weekly random sample of 30 published upcoming events, stratified by tier, checked by a human against the live source page for date, time, venue and status. Recorded in `quality_audits`. | ≥ 97% correct on date+time+venue |
| **Published duplicate rate** | Share of sampled published events that have a published duplicate (the audit also checks this), plus user and moderator reports | < 1% |
| **Stale rate** | Share of published upcoming events whose every source record is `missing`/`gone` | < 0.5% |
| **Cancellation latency** | Median hours from the source marking cancelled (or first missing) to our event showing cancelled or hidden | < 24 h for T1/T2 |
| **Change latency** | Median hours from a source change (hash change) to the canonical update | < cadence + 1 h |
| **Lead time** | Median days between `first_seen_at` and event start, per category and source. Low lead time means we find events too late. | Track; improve via cadence |
| **Moderator overturn rate** | Share of auto-published events later rejected or materially corrected, per source | < 2% (drives T3 auto-publish, §6.1) |
| **Matcher precision / recall** | From `match_decisions` + audits | Precision ≥ 0.98 at auto-link |
| **Geo resolution rate** | Share of upcoming events with `geo_precision ≥ street` | ≥ 90% |

### 9.2 Coverage metrics

| Metric | Definition | Why |
|---|---|---|
| **Coverage matrix** | For each `place × category family`: active sources, candidate sources, and upcoming 30-day published events. Rolled up by county and ring. The checklist view from §3.4 DC2 shows which expected publishers (library, parks, municipal, chamber, DDA, venues) are covered, a candidate, or unknown. | Makes "comprehensive" a finite, visible checklist. Empty cells are the work queue. |
| **Event density vs expectation** | Upcoming events per 10k residents per place, compared with peer places in the same ring. Outliers low mean likely gaps. | Finds the gaps where no one has looked |
| **Benchmark recall** (headline metric) | Each week, a human assembles an **independent sample** of about 50 real upcoming Orbit events, discovered **through channels independent of our sources**: flyers, newspaper print listings, social posts, venue marquees, word of mouth, a random place × category draw. We measure the share already in 313.events. At n = 50 the 95% margin is about ±14 points, so the headline figure is a rolling 4-week pool (n ≈ 200, about ±7). Per-ring and per-category figures are reported only once each stratum has at least 50 accumulated samples. | The only direct measure of "how much are we missing". Also yields new candidate sources for free. |
| **Capture–recapture estimate** | For strata where two sources plausibly capture events independently, use the Chapman estimator N̂ = (n₁+1)(n₂+1)/(m+1) − 1, where *m* is the matched overlap. Examples are Visit Detroit vs Localist tenants, or benchmark-recall samples vs the whole catalogue. A venue's own feed vs Ticketmaster is a **poor pair**, because the venue sells through Ticketmaster and the feed is close to a full listing. Caveats go on every report. Positive dependence between sources (big events are on everything) biases N̂ low. Missed matches shrink *m* and bias N̂ high. So the figure is a rough, stratum-level sanity check on benchmark recall, not a bound. | A second, model-based view of the universe size, to sanity-check benchmark recall |
| **Dependency concentration** | Share of upcoming published events whose *only* source is X, for the top 5 sources. A Herfindahl index across sources. | Tracks the Ticketmaster dependency (81% on 2026-09-05). Target: no single source is the sole source for > 40% of events. |
| **Unique contribution per source** | Events only this source supplies, per 30 days | Maintenance ROI. A broken source that contributes 0 unique events is low priority. |
| **Ring balance** | Upcoming events per ring vs population per ring | Keeps the outer Orbit (R3) from staying empty |
| **Category balance** | Share by category vs a target mix Jody sets | Community, family and free are currently underweighted (ASSESSMENT §8–10) |

### 9.3 Operational metrics

| Metric | Definition |
|---|---|
| Sources by state, tier and access class | Registry growth |
| **Zero-code onboarding share** | Share of sources activated this month that needed no new code (target ≥ 90%, the core scaling claim) |
| Median time to onboard | Candidate → active |
| Mean time to detect / repair | Detector firing → back to healthy |
| Inbox volume and age | Open issues by kind, median age, share resolved within 48 h |
| Human minutes per 100 published events | Estimated from inbox actions. Should *fall* as coverage grows: the anti-fragility measure. |
| Pipeline cost | Fetches/day, render-worker pages/day, storage, geocode calls |

---

## 10. Backlog

The phased implementation backlog is in **`INGESTION_BACKLOG.md`**. It has 10 phases and 143 work packages, each small and independently testable with an explicit acceptance test. Phase 0 (stabilize and instrument) can start immediately after this document is approved, and doesn't depend on any architectural decision in Appendix A. The backlog also gives an effort estimate (about 165 focused days in total, about 95 on the dependency-closed minimum path) and a list of deferrable packages.

---

## Appendix A. Decisions needed from Jody

These are the choices only the product owner can make. Each is followed by a recommendation. None of them blocks Phase 0.

| # | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| A1 | Job trigger | (a) Supabase `pg_cron` + `pg_net` calling the worker every 5 min; (b) Vercel Cron sub-daily (plan-dependent); (c) GitHub Actions schedule | (a): no plan dependency, lives with the queue | Phase 2 |
| A2 | Pipeline may **create unverified venues** | Keep "never create" / allow create-as-unverified with review | Allow, as unverified plus a `venue_new` issue. Needed for geography at scale (§5.5). | Phase 4 |
| A3 | Resident Advisor (and Instagram) capture practice | (a) pursue RA partnership, pause agent-driven pulls; (b) human-read-and-enter only; (c) continue knowingly | (a) + (b) in the interim. See §7.8 for the reasoning. | Phase 8 |
| A4 | Render worker for JS-only sources | None / GitHub Actions Playwright / small container host | Defer until probing shows ≥ 10 permitted JS-only P0–P1 sources. Then GitHub Actions. | Phase 8 |
| A5 | Auto-publish thresholds | Per §2.7 table | Start conservative: T1/T2 only, completeness ≥ 60, street-precision geo. Loosen by measured overturn rate. | Phase 2 |
| A6 | Geocoding provider for Canada (and US fallback) | Nominatim (policy-limited, free) / commercial (check result-storage terms) | Census (US) + Nominatim (ON, low volume, cached). Revisit if Ontario volume grows. | Phase 4 |
| A7 | Raw snapshot retention | 7 / 14 / 30 days; errors-only after N days | 14 days for all, 90 days for failed or changed-parse runs (fixture material) | Phase 1 |
| A8 | Near-boundary places | Keep 75.0 strict (Saginaw 75.4, Clinton County 75.4, Hillsdale 75.5 out) / adopt a tolerance | Keep strict. Out-of-orbit records are retained (§4.3), so a later change is a recomputation. | — |
| A9 | Online-only events | Exclude / include when the organizer is in the Orbit | Include, flagged `online`, excluded from Orbit counts and the map | Phase 2 |
| A10 | Category mix targets | For the category-balance metric | Set after the Phase 1 baseline | Phase 7 |
| A11 | Outreach ownership | Who sends partnership / feed requests (Scarab, Communico, GrowthZone, RA, CrowdWork) | Jody, with drafted asks generated from registry rows | Phase 5 |
| A12 | LLM-assisted extraction budget | For the recipe suggester and the capture tool | Admin-triggered only, never on the scheduled path | Phase 8 |

---

## Appendix B. Current connector inventory

This inventory is from the full-file audit of each connector at `4cfd997`. "Class" is the §7 access class the connector *should* have. "Target adapter" is where it migrates.

| Connector | Source / method today | Status / trust | Key defects (see §1) | Class → target adapter |
|---|---|---|---|---|
| cron-ticketmaster | Discovery API, 1 center, 90 mi, 90 d, ≤ 5×200 | approved / T2 | G5 truncation likely; G6; D1 (address null overwrite); D4?; no venue external ids stored | official_api → `ticketmaster` (tiled) |
| cron-visitdetroit | Algolia public key, 1000 hits, 1 page | approved / T3 | one-way dedupe; unpaged dedupe query (E5); no geo filter | official_api → `algolia-visitdetroit` |
| cron-feeds | ICS, approved `feed_sources`, sequential | approved / T1 | A4; no RRULE (C5); single-venue assumption; no timeouts | calendar_feed → `ics` |
| cron-wdet | Tribe REST, 50/pg, no paging | approved / T3 | narrower-than-Orbit city allowlist (G1); `is_free` guess; no end_date | structured_data → `tribe-rest` |
| cron-belle-isle-nature-center | Tribe REST, 50, no paging | **crashes every run** (`venueId` undeclared, :135) | also `is_free` guess (:138) | structured_data → `tribe-rest` |
| cron-motorcitywine | Google Calendar ICS + custom RRULE | approved / T1 | cancelled series expanded (:404); UNTIL/COUNT; title-hash id | calendar_feed → `ics` |
| cron-outerlimitslounge | Squarespace `?format=json` | approved / T1 | clean | structured_data → `squarespace-json` |
| cron-planetanttheatre | CrowdWork JSON | approved / T1 | UTC today (J1); Cloudflare history | official_api → `crowdwork` |
| cron-detroitmonthofdesign | Wix sitemap + JSON-LD detail (≈318) | approved / T1 | key-order JSON-LD regex; long crawl | structured_data → `sitemap-detail` + `jsonld` |
| cron-playgrounddetroit | WP MEC REST + detail pages, 3 s delay | approved / T1 | timeout before write past ~35 events (A3) | structured_data → `wp-mec` (child jobs) |
| cron-lagerhouse | Angular SSR HTML | approved / T1 | UTC today skips tonight (J1) | html_recipe (or legacy) |
| cron-oldmiami | rockindetroit.com HTML | approved / T3 | sequential detail fetch; inconsistent price nulls | html_recipe (legacy) |
| cron-halo | Wix HTML state machine | approved / T1 | title-based id (E2) | legacy → continuity keys |
| cron-dossin | detroithistorical.org HTML lines | approved / T1 | title-based id; zero-row bug fixed 2026-09-20 | legacy / html_recipe |
| cron-redford-theatre | Elementor HTML multi-date parser | approved / T1 | null title fails batch (D3); all 'film' | legacy (validation fixes) |
| cron-trinosophes | HTML lines | approved / T1 (header: "UNVERIFIED") | every line becomes an event; the 7 PM default is Jody's call but not marked approximate in data | html_recipe (strict) or pause |
| cron-cinema-detroit | WP pages + first-date regex | approved / T1 (header: "LOW CONFIDENCE") | any page with a date becomes a film (K6) | structured_data/html_recipe; pause pending |
| cron-detroittraining | 17 Squarespace pages, regex | pending / T1 | year rollover (J2); cap before dedupe | html_recipe |
| cron-poppspacking | WP posts (cat 16), free-text dates | pending / T4-like | no future filter; overwrites reviewer dates (D1) | rss-events/html_recipe with `start_precision` |
| cron-metrotimes | Gyrobase sitemap + detail, spoofed UA | pending / T4 | WAF-blocked; first-40 slice; category overwrite | `not_permitted` until partnership |
| *(manual)* RA pulls | agent-assisted, SQL files | approved / T5 | bypasses pipeline (D6); ToS (A3) | manual_capture |
| *(manual)* Instagram flyers | agent-assisted, SQL + image uploads | approved / T5 | bypasses pipeline | manual_capture |
| cron-editorial | 13 RSS/Atom feeds → `editorial_articles` | n/a (articles) | match churn (`matched_event_id` nulling, :628); unbounded queries | Stays separate. Uses the shared lib and registry for its feed list, and its matcher reuses §5 title normalization. **Never creates events** (workbook rule). |

---

## Appendix C. Indicative Orbit county list

This list was computed during the audit with `api/_lib/detroit-boundary.js` against *approximate* county-seat or principal-city coordinates. **It is indicative only.** Counties are large, so "seat outside" doesn't mean "county outside". The authoritative list comes from the WP 1.9 polygon intersection. The distances match `SERVICE_AREA.md`'s published figures wherever the two overlap (Monroe 26.3, Flint 44.3, Toledo 45.8, Bowling Green 65.7).

| Status | Michigan | Ohio | Ontario |
|---|---|---|---|
| **Seat well inside (≤ 60 mi)** | Wayne, Macomb (Mt Clemens 10.6), Oakland (Pontiac 13.5), Washtenaw (Ann Arbor 24.8), Monroe (26.3), Livingston (Howell 34.6), Lapeer (42.0), Genesee (Flint 44.3), St. Clair (Port Huron 44.5), Lenawee (Adrian 49.9), Shiawassee (Corunna 56.3), Jackson (57.9), Ingham (Mason 59.7) | Lucas (Toledo 45.8), Ottawa (Port Clinton 52.5) | Essex (Windsor 0.7; Leamington 26.4; Pelee Island 42.6), Chatham-Kent (Chatham 36.7), Lambton (Sarnia 45.3; Petrolia 50.4) |
| **Seat inside (60–75 mi)** | Sanilac (Sandusky MI 67.2), Tuscola (Caro 72.6) | Erie (Sandusky OH 60.2), Sandusky Co. (Fremont 62.5), Wood (Bowling Green 65.7), Fulton (Wauseon 69.8) | — |
| **On the line (seat 75–80 mi): partial counties** | Clinton (St. Johns 75.4), Saginaw (75.4), Hillsdale (75.5), Eaton (Charlotte 79.4) | Henry (Napoleon 77.2), Seneca (Tiffin 78.7) | Middlesex (Strathroy 75.7) |
| **Seat outside (> 80 mi): check for slivers** | Bay (85.2), Calhoun (86.0), Huron (93.3), Branch (92.8) | Hancock (87.2), Williams (88.9), Defiance (90.5), Putnam (96.5) | Elgin (St. Thomas 91.0), London city (93.5) |

**Research coverage today by region**, from PHASE0 plus the workbooks. Research exists for Windsor/Essex, Toledo/Lucas, Bowling Green/Wood, and SE Michigan's core counties. **No research exists** for Erie, Ottawa, Sandusky or Fulton (OH); Sanilac, Tuscola, Shiawassee, Jackson, Lenawee, Lapeer, or Ingham (Lansing/East Lansing, in scope since 2026-09-20); or Chatham-Kent and Lambton beyond the 213-row draft's Chatham/Sarnia venue entries.
