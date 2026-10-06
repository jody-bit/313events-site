# 313.events — Engineering Readiness Review

**Type:** independent, read-only architecture and engineering baseline review
**Repository state reviewed:** `main` at `3eb2734` (2026-10-05), full history (411 commits, 2026-08-19 → 2026-10-05)
**Review date:** 2026-10-06 (includes the producer-level name/entity-matching addendum, same day)
**Changes made by this review:** this file only. No code, schema, data, schedule, deployment or branch was changed. No production system was queried.

---

## How to read this document

Every major finding is labeled:

- **OBSERVED** — directly visible in the repository (code, migrations, tests, git history, committed documents). Cited as `path:line` where possible.
- **INFERRED** — a conclusion drawn from observed evidence that the repository alone cannot prove (usually: what production actually contains or does).
- **RECOMMENDED** — what this review proposes.

**Production evidence.** This review had no access to the production database, Vercel dashboard, logs or analytics. Statements about production come from the project's own committed records (chiefly `project/BACKLOG.md`, `NEEDS_FOLLOWUP_ROOT_CAUSE.md`, `test/notes/postgrest-mixed-keys.md` and in-code incident notes) and are attributed as such. Where a claim needs one production query to confirm, the review says so.

**Method.** Full read of the shared libraries, write path, enrichment pipeline, schema and migrations, admin endpoints and public data-loading code; targeted reads of all 30 cron files; four parallel read-only sub-reviews (ingestion, database, frontend, AI/admin) whose headline claims were spot-checked against the code before inclusion; local execution of the test suite (no credentials present, no network calls); and local, pure-function probes of the location parser using the defect examples from the recent production audit.

**Addendum method (name/entity matching).** Six further independent read-only finders covered: venue-name matching paths, event-identity matching, alias persistence and repo data, content/title location extraction, an empirical normalizer probe, and tests/safeguards/cost. Each finder's output was checked by two adversarial verifiers, one for literal accuracy and one for overreach. 87 findings survived; none was refuted by both verifiers, and 54 had their wording or citations corrected. A synthesis was then reviewed by a completeness critic, and its 6 gaps and 4 errors were fixed in an amendment pass. The headline probes in §10.4 were re-run independently for this document.

**Model-tier labels.** Work packages recommend a Claude tier rather than a version: *deep-reasoning (Opus-class)*, *standard (Sonnet-class)*, *fast (Haiku-class)*.

**Where the name/entity-matching addendum lives:**
- §1 (verdict);
- §4 rows 12, 14, 18, 32, 34, 36, 37;
- §6.1–6.4 (content-producer intelligence and the Eastern Market trace);
- §7.4.1 (identity confidence model);
- **§10.1–10.9** (main assessment);
- §12.1–12.3 (tests and the gold-set plan);
- §14.1;
- §17 TD-33–TD-37;
- §18 SZ-13–SZ-15 and the do-not list;
- §19 P1-13–P1-17, P2-10, P2-11;
- §20–§25;
- Appendices B–D.

---

## 1. Executive verdict

**313.events is a working, carefully-documented prototype with several production-grade components, sitting on prototype-grade data foundations.** The public site works and the team diagnoses incidents rigorously. But the system has no enforced contract for what a publishable event row is. It has no rule for which writer wins a field, no environment other than production, no CI, and no alerting. Defects are therefore published first and repaired later — by nightly scripts, hand-written SQL, or a person. That is why more sources currently produce more manual work.

The core problem is not the stack, the two-table model, or the per-source cron design. **The problem is that the write path trusts every connector.**

- 20 of 25 event connectors publish new rows directly as `approved` (`DEFAULT_STATUS = "approved"`), and the database default for `events.status` is `'approved'` (`supabase/schema.sql:81`).
- No shared validator exists anywhere in `api/` or `scripts/` (no `validate*` function). Each connector cleans its own fields, in its own way.
- Every re-run overwrites every column the connector sends, including explicit `null`s, over human and enrichment corrections (`api/_lib/event-upsert.js:74`; project's own `DEBT-011`).

Everything downstream — "self-healing", the Needs Follow-up queue, dedupe batches, 85 hand-written data-patch SQL files — is compensation for that one missing gate.

**Entity identity is simultaneously too strict and too loose** (§10.1–10.9):
- **Too strict.** The venue linker matches only after lowercasing and whitespace collapse. "Fox Theater" vs "Fox Theatre", curly vs straight apostrophes, "St." vs "Saint" and a leading "The" all fail. Exact matching has already split real venues into duplicate canonical rows (e.g. "Magic Stick" and "The Magic Stick").
- **Too loose.** Several paths let a single signal decide identity: an address alone, a title alone, or a substring. A probe links "Big Time Bingo" at its poster's "4120 Woodward Ave" to The Magic Stick, and renames the event's venue. The venue's own listing gives Garden Bowl as 4140.
- **No learning.** Nothing persists a confirmed alias, so every reconciliation, human or automated, is lost.

### Short answers

| Question | Answer |
|---|---|
| **What is production-ready?** | Vercel + Supabase hosting. The shared discovery semantics in `discovery.js` (homepage only). The uniform-batch upsert helper (`api/_lib/event-upsert.js`). The fail-closed status lookup. The submission → `pending_review` moderation path. Soft-reject duplicate consolidation and non-event retirement. The Localist connector (the reference implementation). The test fixture that reproduces PostgREST's write rules. The decision log. |
| **What is still prototype-grade?** | Field-level data contracts and validation. Overwrite authority. The temporal model (`date` + free-text `time_display`). Eligibility (a 3-rule title denylist). Venue/entity identity (exact-only name keys, no aliases, no learning, while address-only, title-only and substring paths still decide identity on one signal). The web-search enrichment tier. Admin queue metrics. Monitoring/alerting. Environments, release and migrations. Public data loading at scale (whole inventory to the browser). |
| **Keep** | The stack. The two-table core. Per-source connectors for now. `discovery.js`. `event-upsert.js`. Soft retirement. The "never guess / honest gap" principles. The documentation and decision discipline. |
| **Harden** | Write path (contract + field authority). RLS/grants. Cron auth. Run logging. Location parser. Single-signal identity paths (SZ-13). Event-identity matchers. Release process. Test suite (CI). Admin auth. SSR pages. |
| **Refactor** | Temporal model (additive timestamps). Eligibility (filter → decision layer). Venue/entity identity decision layer (one normalizer, alias store, corroboration scoring; §10). Admin queue (client-side blankness → persisted issues). Healthcheck. Frontend data access. Calendar/Map onto `discovery.js`. Migrations tooling. Self-healing orchestration. Template descriptions (store → render). Connector layer → adapters (later, P2). |
| **Rebuild** | One thing: the **web-search research tier** (`api/_lib/external-discovery.js` and its callers). It publishes raw search-snippet text as `authoritative` and creates canonical venues from third-party pages. Heuristic hardening already failed once in production (`project/BACKLOG.md` `BUG-010`). It is gated closed today. It should come back only as a propose → verify → gate researcher. |
| **Retire** | Static fallback dataset and 103 KB stale JSON-LD in `index.html`. Source-specific post-publication repair scripts. Hand-written SQL as an operating mode. Spoofed browser User-Agents. Unused `sources` table and `category_id` mirror. The RA git message-bus on `main` in its current form. Creating canonical venue rows from variant spellings. `VENUE_NAME` string constants as connector identity. `"Venue TBA"` as stored data. |

### Recommendation on feature work

**Partially continue** (detail in §25):

- **Pause** new source connectors, re-opening search enrichment, and monetization/social features.
- **Run a 4–6 week "Production Foundation" Sprint Zero** (§18). The addendum adds three identity packages, SZ-13–SZ-15.
- **Continue** small presentation work that does not touch the data model.

---

## 2. Current architecture map

```
                       ┌─────────────────────────── Vercel (single production project) ───────────────────────────┐
  Browser              │                                                                                           │
  (static HTML,        │  Static pages: index (7,780 lines), calendar (2,985), map (1,941), radar, venues,         │
  inline JS, no build) │  neighborhoods, submit, admin (1,870), sources, legal pages                               │
     │                 │  Shared JS: discovery.js (homepage only), paged-fetch.js, legal-*.js                      │
     │  anon key       │                                                                                           │
     ├────────────────►│  SSR meta: api/event-meta.js, api/venue-meta.js, api/sitemap.js  ──(anon key)──┐          │
     │  direct REST    │                                                                                 │          │
     │  (events,       │  Submission: api/submit.js, api/submit-feed.js, api/upload-image.js ──(service)─┤          │
     │  events_public, │  Admin API:  api/admin-{events,feeds,editorial,venues,ra,healthcheck}.js        │          │
     │  venues, …)     │              (shared ADMIN_SECRET header)                       ──(service)─────┤          │
     │                 │                                                                                 │          │
     │                 │  Vercel Cron (24 daily schedules, one per hour)                                 │          │
     │                 │   25 event connectors api/cron-*.js  ── fetch → parse → row → venue_id →        │          │
     │                 │        status lookup → upsertEventRows (merge-duplicates) ──(service)───────────┤          │
     │                 │   cron-enrichment (12:30 UTC): RA promotion → SH.1 → OuterLimits/Dossin/Redford │          │
     │                 │        repairs → generic enrichment (Tavily search, gated off) → re-parse →     │          │
     │                 │        non-event retirement → duplicate consolidation   ──(service)─────────────┤          │
     │                 │   cron-editorial, cron-healthcheck, cron-post-to-facebook                       │          │
     │                 └─────────────────────────────────────────────────────────────────────────────────┼──────────┘
     │                                                                                                   ▼
     │                 ┌──────────────────────── Supabase (single production project) ────────────────────────┐
     └────────────────►│ events (45 cols) · venues · events_public view · categories · neighborhoods ·         │
                       │ feed_sources · source_runs · event_source_identities · editorial_* · healthchecks ·  │
                       │ schema_migrations · sources (unused) · organizers (unused) · storage: event-flyers   │
                       └──────────────────────────────────────────────────────────────────────────────────────┘
                                    ▲                                              ▲
  Owner's browser session           │ (SQL Editor: 85 hand-written update_*.sql)   │
  RA browser acquisition ── git push to main ra-sync/inbox/*.json ── GitHub Action ── POST /api/cron-ra
```

| Component | Size (OBSERVED) | Boundary quality |
|---|---|---|
| Event connectors (`api/cron-*.js`, 25) | 10,912 LOC | Each owns fetch, parse, normalize, time, dedupe and auth. Only the write and the status lookup are shared. |
| Shared libraries (`api/_lib/`, 20 files) | 4,754 LOC | Good, pure, testable modules. Adoption is uneven (§16). |
| Repair/enrichment scripts (`scripts/`, 15) | 5,588 LOC | Run in-process from crons and Admin, and as CLIs. Two step lists drift apart (`api/cron-enrichment.js` vs `api/admin-events.js:538-720`). |
| Other API (admin, submit, SSR) | ~5,000 LOC | Admin endpoints import repair scripts directly. |
| Public pages (HTML with inline JS/CSS) | 19,765 lines | Only `index.html` uses `discovery.js`. 71 function names are defined in 2+ pages. |
| Tests (`test/`, 104 files) | 28,568 LOC | Roughly equal to production server code. No runner, no CI. |
| Planning documents | 5,151 lines in 19 files | Rich and candid, but statuses go stale (§16). |

**Coupling and cohesion.**

- **OBSERVED:** the biggest coupling is the `events` table itself. 25 connectors, 9 enrichment steps, 6 admin endpoints, 85 SQL patches and the browser all write or read it directly, with no intermediate record and no field ownership.
- **OBSERVED:** the business rules that should be cohesive are scattered:
  - city validation exists only in `api/_lib/ics-location.js` and `api/_lib/localist-rows.js`;
  - there are four different "placeholder venue" definitions (`admin.html:638`, `api/_lib/venue-lookup.js:273`, `scripts/duplicate-consolidation.js:126`, `api/_lib/description-enrichment.js:67`);
  - "today" is computed four ways on the frontend (§9).

---

## 3. Production-ready vs prototype-grade matrix

Grades: **PR** = production-ready · **PG** = production-capable with gaps · **PT** = prototype-grade · **—** = absent.

| Capability | Grade | Key evidence |
|---|---|---|
| Hosting, CDN, serverless runtime | PR | Vercel static + functions; no dependencies, so no supply-chain surface. |
| Public discovery semantics (homepage) | PR | `discovery.js:43-75` defines the WHEN/WHERE/WHAT semantics once; thorough tests (`test/discovery*.test.js`). |
| Public discovery semantics (Calendar, Map, Radar, venue pages) | PT | Own filter copies. Map omits running events (`map.html:1921`). Four definitions of "today". |
| Public data loading at scale | PT | Whole inventory to the browser via `paged-fetch.js` (cap 50,000, `paged-fetch.js:55`). Calendar loads all history. |
| SSR event/venue pages, sitemap | PG | Soft 404s. Sitemap unpaged, so capped at 1,000 rows (`api/sitemap.js:81`). |
| Event submission + moderation | PG | Server validation, honeypot, timing check (`api/submit.js:176-196`). No rate limit. Unused anon INSERT grant. |
| Batch write helper | PR | `api/_lib/event-upsert.js`: uniform batches, partial-failure reporting, 250 generated-batch test. |
| Status preservation on re-ingest | PR | Fail-closed lookup (`api/_lib/status-lookup.js`). IDs not URL-encoded (`:127`). |
| Row validation / data contract | — | No shared validator. DB has only NOT NULL, two enums and three CHECKs. |
| Field overwrite authority | — | Last writer wins per column; one-off protections in a handful of connectors (DEBT-011). |
| Temporal model | PT | `start_date date` + `time_display text` (`supabase/schema.sql:70-72`); `end_date` means different things per connector. |
| Eligibility | PT | Title denylist, 3 rule families (`api/_lib/non-event-filter.js:79-122`); used at ingest by 3 connectors. |
| Venue/entity resolution | PT | Exact normalized name or exact address+city only (`api/_lib/venue-lookup.js:26-29, 426-443`). No aliases, candidates, corroboration scoring or learning. Address-only and title-only identity decisions exist (§10). |
| Producer-level name matching | — | Normalization folds only case and whitespace; 13+ normalizers disagree; nothing persists a confirmed variant (§10.1–10.9). |
| Evidence / provenance | — | `description_source` (one column) plus free-text `internal_note` lines. |
| Research / enrichment | PT | Tavily search + regex. Gated off after publishing wrong facts (`BUG-010`). |
| Duplicate consolidation / non-event retirement | PG | Deterministic, soft (`status='rejected'`), capped per run. Run detail not persisted. |
| Run logging | PG | `source_runs` via `api/_lib/run-log.js`; 11 connectors don't call it. |
| Health checking | PT | Hard-coded, stale lists; "advisory" fallback; no data-quality checks (`api/cron-healthcheck.js:89-105, 194-229`). |
| Alerting | — | No channel. Resend is used only for submission emails. |
| Admin exception handling | PT | Client-side blankness test; dismissal hides the whole event (`admin.html:483-535, 768`). |
| Environments / release | — | Production only. 0 pull requests ever. Pushes to `main` deploy production. |
| Migrations | PT | Pasted into the SQL editor. Ledger incomplete. Repo cannot rebuild the production schema. |
| Automated tests | PG | 104 files, 103 pass locally. Nothing runs them automatically. |
| Security posture | PG | Admin fails closed. Cron auth fails open in 29 of 30 crons. Probable column exposure via anon key (§15). |
| Backup / recovery | — (unknown) | Nothing in the repo describes backups, PITR or a restore drill. |

---

## 4. KEEP / HARDEN / REFACTOR / REBUILD / RETIRE matrix

| # | Subsystem | Class | Why (evidence) |
|---|---|---|---|
| 1 | Platform: Vercel static + serverless, Supabase Postgres, no build step | **KEEP** | Adequate for the foreseeable scale. Zero npm dependencies is a real strength. The problems found are in how it is used, not the platform. |
| 2 | `events` / `venues` two-table core | **KEEP** | Sound. What's missing (constraints, authority, timestamps, issues, claims) is additive (DEC-006). |
| 3 | `discovery.js` shared semantics | **KEEP** | One definition of current/upcoming/running/orbit (`discovery.js:43-75`), well tested. Extend it to every page. |
| 4 | `api/_lib/event-upsert.js` | **KEEP** | Correct handling of PostgREST's uniform-key rule (`test/notes/postgrest-mixed-keys.md`). It is the right place to attach the contract. |
| 5 | `api/_lib/status-lookup.js` | **HARDEN** | Fail-closed and chunked (good). `external_id=in.(…)` is built without quoting/encoding (`:127`). |
| 6 | Localist connector (`api/cron-localist.js`, `api/_lib/localist-rows.js`) | **KEEP** | Closed city list, late-night spans, folded runs, fetch timeouts, keep-when-blank. One bug: `ticket_url` is in `KEEP_STORED_WHEN_BLANK` but not in `STORED_SELECT` (`cron-localist.js:234-236`). Use it as the reference implementation. |
| 7 | Per-source connector layer (25 files) | **REFACTOR** (P2) | 10,912 LOC re-implementing fetch, parse, normalize and time handling. `timingSafeStringEqual` is copied into 37 files and `decodeEntities` into 22. Fine at 25 sources; impedes scale to hundreds. Harden through the shared write path first (P0); move to adapters later. |
| 8 | Row validation (per-connector, ad hoc) | **REFACTOR** | Three different HTML strippers. CSS in `<style>` survives the tag-only strippers (reproduced, §5.3). Placeholders written as data (`"Untitled event"`, `"Venue TBA"`, `"Evening"`). Consolidate into one contract module. |
| 9 | Field overwrite semantics | **REFACTOR** | `merge-duplicates` overwrites every sent key. Explicit-`null` erasers in at least 7 connectors (§5.4). Venue map fails soft to empty, nulling all links (`venue-lookup.js:51-73`). |
| 10 | Temporal model | **REFACTOR** | Cannot represent time, timezone, overnight or occurrence. Fix additively (§9). Not a rebuild. |
| 11 | Eligibility (`non-event-filter.js` + `retire-non-events.js`) | **REFACTOR** | The rules are carefully engineered, but eligibility is not a domain concept: no column, no UNCERTAIN state, no evidence (§8). Keep the rules as one input to a decision layer. |
| 12 | Venue/entity identity resolution (`venue-lookup.js` and the event-identity matchers) | **REFACTOR** | The exact-key core, the `AMBIGUOUS_VENUE_NAME` sentinel and `citiesConflict` are sound; KEEP them. But the identity *decision layer* is wrong in both directions (§10):<br>- harmless variants never match (normalizer folds only case and whitespace, `:26-29`);<br>- an address alone links and renames (`:387-402, 437-441`; `cron-feeds.js:309`);<br>- `resolveVenueId` is city-blind, last-row-wins and placeholder-blind (`:61-64, 76-80`);<br>- nothing is learned (no alias, external-id or decision store).<br>Guard now (SZ-13, SZ-14); refactor into one resolver with a durable identity store and corroboration scoring (P1-13–P1-15). |
| 13 | ICS location parser (`ics-location.js`) | **HARDEN** | Good grammar design. `stripHtmlTags` keeps `<style>` bodies (`:100-102`). `"MI 48207"` lands in postal. |
| 14 | Web-search research tier (`external-discovery.js`, Level-1 path in `generic-metadata-enrichment.js`, `discoverEventVenue`) | **REBUILD** | The model itself is wrong (§7): it stores raw snippet text as an `authoritative` description; it creates canonical venues with the result page's host as `website`; and the authority tier is a label, not a gate (`generic-metadata-enrichment.js:455-470`). It mints a new canonical venue row from a variant spelling (`venue-lookup.js:592-597`). Its "daily" budget resets per invocation, with no negative cache (P1-17). The 2026-10-01 heuristic hardening did not prevent wrong facts (`BUG-010`). |
| 15 | Template "generated" descriptions (`description-enrichment.js`) | **REFACTOR** | Stores derivable text as a fact. Can print placeholders. Satisfies the follow-up queue while adding no information. Render at display time instead. |
| 16 | Source-specific repair scripts (Outer Limits, Dossin, Redford, VisitDetroit backfills/repairs) | **RETIRE** | These are connector capture defects repaired after publication. Fold each fix into its connector, then delete the script. |
| 17 | Self-healing orchestration (`cron-enrichment.js`, Admin Auto-Repair) | **REFACTOR** | Two hand-maintained step lists, "duplicated here deliberately" (`cron-enrichment.js:139-143`). Order spends work on rows about to be retired. No `maxDuration`. No per-step persistence. |
| 18 | Duplicate consolidation, non-event retirement scripts | **KEEP** | Deterministic, soft, capped (`duplicate-consolidation.js:103`, `retire-non-events.js:40`), human-restore respected. Add persisted run detail. One guard to add: `samePlace` skips the city veto when two rows share a `venue_id` and both have their own venue text (`duplicate-consolidation.js:192-196`). A probe auto-merged "City Hall" events in Livonia and Troy (SZ-13). |
| 19 | Admin Needs-Follow-up queue | **REFACTOR** | Measures blankness client-side. Template text, placeholders and wrong facts all "resolve" a gap. Dismissal hides the whole event permanently (`admin.html:768`). Feed it from a persisted issues table (§13). |
| 20 | Run logging (`run-log.js`, `source_runs`) | **HARDEN** | Good schema and redaction. Missing in 11 connectors. "Parsed 0" logs `success`. |
| 21 | Healthcheck (`cron-healthcheck.js`) | **REFACTOR** | Hard-coded lists missing 7 connectors (`:89-105, 194-229`). Advisory by construction. No data quality. No alerting. |
| 22 | Database constraints, grants, RLS | **HARDEN** | No CHECK on dates, URLs, price, coordinates. Default status `approved`. Unused `grant insert on events to anon` (`migration_009a:18`). Row-only SELECT policy on the base table. |
| 23 | Migration process | **REFACTOR** | Pasted manually. Missing files (`migration_010…` is in the ledger but in no commit). Two `042`s. DDL inside a data patch. Fresh rebuild impossible. Re-baseline and move to CLI-driven migrations. |
| 24 | Hand-written SQL data patches as an operating mode | **RETIRE** | 85 `update_*` files (29 root + 56 archived), with 1,049 `where id = '<uuid>'` clauses. Some are unguarded upserts that revert edits when re-run. |
| 25 | Release process (push to `main` = production) | **HARDEN** | Sound platform, missing gates: no PRs, no CI, no staging; `TEMPORARY` canaries and probes committed to `main` (e.g. `12bb437`, `f75d91f`, `c9d8319`). |
| 26 | Test suite | **HARDEN** | Valuable and incident-driven, but optional. One test is already failing on the wall clock (`test/cron-bigtimebingo-runlog.test.js:161`). No real-Postgres or browser tests. |
| 27 | Admin authentication | **HARDEN** | Fails closed, timing-safe (`admin-events.js:84-93, 205-209`). Shared secret, no rate limit, no actor on actions. Proportionate for one operator; add a limiter and an audit trail. |
| 28 | Frontend data access (browser ↔ Supabase REST) | **REFACTOR** | Full inventory per visit. Unpaged reads silently capped (sitemap, radar, neighborhoods). Production config hard-coded in 11 files. |
| 29 | Calendar/Map filter logic | **REFACTOR** | Move onto `discovery.js`; an unmerged branch already does it (`origin/claude/calendar-map-shared-layer-repcmh`). |
| 30 | Static `FALLBACK_EVENTS` and the static JSON-LD block | **RETIRE** | 187 hand-curated events rendered first on every load (`index.html:4601-4802`, copy in `calendar.html:983-1184`). 103 KB of schema.org Events in `<head>` (`index.html:42-3360`), 150 of them already past. |
| 31 | `sources` table (migration_004), `events.source_id`, `events.category_id` | **RETIRE** | No code reads or writes them (`category_id` has no writer after a one-time backfill). Either adopt `sources` as the registry in P2 or drop it; don't keep a dormant second registry. |
| 32 | Editorial article matching (`cron-editorial.js`, `press-coverage-linking.js`) | **HARDEN** | Article-page text stored as an `authoritative` description, page chrome included (`BUG-010` item 3). Unpaged candidate queries. Spoofed UA. Venue-and-date and title links use substrings with no word boundary and no corroboration (`cron-editorial.js:383-406`; `press-coverage-linking.js:203-225`; a probe matched "Rave On!" inside "brave one"). Automated duplicate links are stamped `manual` (`press-coverage-linking.js:1136-1160`). → P1-16. |
| 33 | Spoofed browser User-Agents | **RETIRE** | `cron-metrotimes.js:79`, `cron-editorial.js:257`, `press-coverage-linking.js:104` send desktop Chrome. That contradicts the stated honest-UA convention, and Metro Times WAF-blocks the connector. |
| 34 | RA acquisition lane (browser-driven ra.co walk + git message-bus on `main`) | **RETIRE** (current form) | `DEC-010` declares RA manual-only because its Terms prohibit automated scraping. `scripts/ra-sync.js:16-22` documents a scheduled browser session designed around RA's DataDome anti-bot defenses. The transport commits payloads to the production branch (27 `ra-sync: submit` commits). Needs an explicit policy decision (`DISCOVERY-001`). The server-side derivation code is reusable, except `findConservativeDuplicate`: it decides duplicates on title tokens alone, ignoring venue, city and status (it matches rejected rows), and records a permanent identity (`ra-sync.js:392-424, 683-696`). Harden it before reuse (SZ-13). |
| 36 | Single-venue connector `VENUE_NAME` constants as identity (~13–16 connectors, e.g. `cron-oldmiami.js:91`, `cron-lagerhouse.js:83`) | **RETIRE** | Each constant must equal `venues.name` byte-for-byte, so a canonical rename silently unlinks every event. Replace with a source → `venue_id` mapping (`venue_external_ids`, P1-13). |
| 37 | Cross-source event suppression in VisitDetroit (`cron-visitdetroit.js:357-377`) | **HARDEN** | Suppresses a new row on exact title + date from any other source, in any city and any status, over an unpaged read. Require venue/city non-conflict and exclude rejected rows (P1-16). |
| 35 | Project documentation and decision system (`project/`) | **HARDEN** | Unusually strong decision records. Statuses drift: e.g. `BUG-007`'s status line says "not merged, not deployed" while its body says deployed as `7bdce19`. README describes a 4-cron product. |

---

## 5. Data-contract assessment

### 5.1 Verdict

**OBSERVED:** canonical event data has **no explicit, enforced contract** — not in code, not in the database. The real contract is "whatever each connector's row literal contains, minus what Postgres rejects."

Postgres rejects very little:
- NOT NULL on `title`, `start_date`, `category`, `is_free`, `source`, `status`;
- the `event_category` and `event_status` enums;
- `description_source` CHECK (`migration_038`).

There is no CHECK on dates, times, URLs, price, coordinates or city.

**Runtime/schema validation is not strong enough** to stop semantically invalid values becoming canonical, and the recent audit's symptoms (address in city, CSS in names, placeholders, misleading day semantics) are the expected result.

### 5.2 Field-family contract table

"Authority/overwrite" describes what happens on the next connector run. "AI permission" describes what automation may write today.

| Field family | Accepted input / normalization | Validation | Authority & overwrite | Null / unknown | DB constraint | Automation may write? | Failure behavior |
|---|---|---|---|---|---|---|---|
| **Title** | Free text. Per-connector entity decode and tag strip (3 different strippers). | None shared. No length or markup check. | Source wins every run. | `"Untitled event"` placeholder published (`cron-feeds.js:476,712`). | `NOT NULL` | No. | A `null` title failed a whole batch historically. |
| **Eligibility** | Not a field. | Title denylist at ingest in 3 connectors (`cron-feeds.js:457,702`, `cron-ticketmaster.js:206`, `localist-rows.js:84`); nightly retirement for the rest. | Retirement → `rejected` + note line. | Uncertain items publish. | None | Retirement script only. | A non-event stays public until the 12:30 UTC run. |
| **Category** | Per-connector mapping; the enum forces a choice. | Enum. | Re-derived every run, reverting moderator edits (Metro Times `"music"` placeholder, `cron-metrotimes.js:359`). | No "unknown" value, so a default category is guessed. | Enum `NOT NULL`. The `category_id` mirror is never written. | — | Unknown enum value rejects the whole batch (10 GottaGacha runs failed on `gaming`, `BUG-008`). |
| **Start / end date, time** | `date` + free-text `time_display`. 13 connectors compute "today" in UTC. | No CHECK `end_date >= start_date` (cleanup only, `migration_017`). | Source wins. | Placeholders `"Evening"` (`cron-ticketmaster.js:163`) and a fixed `"7:00 PM"` (Trinosophes). | `start_date NOT NULL` only | — | Silent misinterpretation (§9). |
| **Occurrence / recurrence** | One row per date per connector; Localist folds runs; MotorCity Wine has its own RRULE expander; ICS ignores RRULE. | — | — | `is_recurring` unused. | — | — | Same exhibition stored per-date by one source and as a span by another. |
| **Venue** | `venue_name_raw` text + `venue_id` by exact name. | `isPlaceholderVenueName` guards repair tiers only, not `resolveVenueId`. | `venue_id` re-sent as `null` when unmatched, and for every row if the venue fetch fails. | `"Venue TBA"` stored as a literal value by ≥4 writers; string-matched in 18 files. | FK `SET NULL` | Search tier created venues (now gated). | Silent link loss. |
| **Street / city / state / postal / country** | `venue_address_raw`, `venue_city_raw` free text. Events have no state, postal or country. | Closed city list (`orbit-cities.js` `knownCity`) used only in `ics-location.js` and `localist-rows.js`. | Source wins; enrichment refills; source blanks again daily (DEBT-011 #5). | DMOD defaults to `"Detroit"` (`cron-detroitmonthofdesign.js:234`); `venues.city` defaults to `'Detroit'`; RA address parse anchored on `MI` only (`scripts/ra-sync.js:160`). | None | Search tier wrote cities (gated). | Address-shaped text accepted as a city. |
| **Neighborhood** | Via the venue only (the view ignores the event-level column). | Confidence enum on venue. | — | ~1 in 5 upcoming events has one (`DEBT-004`). | FK | No. | — |
| **Coordinates** | `venues.lat/lng`, sparse. Events have none. | No range check. | — | Discovery uses city centres (`discovery.js:67`). | None | No. | — |
| **Description** | Source text, truncated to 500/1000 in some connectors; template text; search snippet. | Search: title-token coverage ≥70% and date-conflict heuristics (failed in production). | Explicit `null` from 7+ connectors erases enrichment (§5.4). | `description_source` not maintained by any connector. | CHECK on `description_source` only | Template (yes); search (gated). | Daily flip-flop between generated text and `null` (INFERRED). |
| **Organizer** | Unused (`DEC-005`). | — | — | — | FK | — | — |
| **Source / event / ticket URL** | Free text. | None at write; `safeUrl()` at render (`event-template.html:334`). | Source wins; Localist erases `ticket_url` (§4 #6). | — | None | Digital-home fallback copies `venues.website` (polluted by search, `BUG-010`). | Malformed or aggregator URLs reach pages. |
| **Image** | Free text. | None. | Ticketmaster always sends, replacing hand-set images (DEBT-011 #4). | Some connectors always send `null`. | None | No. | — |
| **Price / free** | `price_from numeric(10,2)`; `is_free boolean NOT NULL default false`. | No `>= 0`, no currency (Ontario sources in scope). | Source wins; explicit `null` blanks a stored price. | **Unknown collapses to `is_free=false`** (tri-state lost); Ticketmaster hard-codes `false` (`:294`). | None | No. | Silent misstatement. |
| **Age restriction** | No column (`migration_034` decision). | — | — | Lives in titles, notes and descriptions. | — | — | Unfilterable. |
| **Publication status** | `pending_review / approved / rejected`. | — | Preserved by fail-closed lookup (good). | `rejected` is overloaded: moderator, duplicate, non-event. No `cancelled`. | Enum, **default `approved`** | Retire / merge scripts. | — |
| **Provenance** | `description_source`; `internal_note` text lines (e.g. `RA_ENRICHMENT v1 …`); `event_source_identities` (identity only). | — | GottaGacha and Eventbrite replace `internal_note` wholesale, erasing `DUP_MERGED_INTO` / `NON_EVENT_RETIRED` lines (`cron-gottagacha.js:288`, `cron-eventbrite.js:212`). | — | None | — | Provenance silently lost. |

### 5.3 Reproduced defects (local, pure-function probes; no network)

`parseIcsLocation()` from `api/_lib/ics-location.js`:

| Input | Output (OBSERVED) | Matches audit symptom |
|---|---|---|
| `<style>.x{color:red}</style>The Fillmore, 2115 Woodward Ave, Detroit, MI` | `candidateName: ".x{color:red} The Fillmore"` | **CSS in venue names.** `stripHtmlTags` is `/<[^>]*>/` (`:100-102`); the style body survives. The same tag-only pattern is in 7 connectors. |
| `Eastern Market Shed 3, 2810 Russell St., Detroit, MI 48207` | name `"Eastern Market Shed 3"`, postal `"MI 48207"` | Region not split from postal. |
| `2810 Russell St., Detroit, MI` | `status: "unparseable"` | A bare address is stored whole as `venue_name_raw`. |
| `Eastern Market Shed 3` | `status: "unparseable"` | No venue resolution (see §6). |

**INFERRED (address-in-city):** the repository cannot show which path wrote `"2810 Russell St."` into a city field. The structural cause is clear, though: city is validated against the closed place list in only 2 of ~27 write paths. No database or shared-library rule rejects a street-shaped city.

### 5.4 The "ingestion erased a generated description" path

- **OBSERVED:** `scripts/generic-metadata-enrichment.js:483-495` fills blank descriptions as `description_source='generated'`.
- **OBSERVED:** these connectors then send `description: <source> || null`:
  - `cron-feeds.js:477` (ICS) and `:713` (RSS)
  - `cron-wdet.js:212`
  - `cron-visitdetroit.js:303`
  - `cron-redford-theatre.js:542` — `null` even when the detail fetch merely failed (`:414, :436`)
  - `cron-belle-isle-nature-center.js:164`
  - `cron-gottagacha.js:276`
- **OBSERVED:** `merge-duplicates` writes that `null` (`event-upsert.js:25-41, 74`).
- **OBSERVED:** only three connectors keep a stored description (`cron-bagleycommunity.js:499`, `cron-bigtimebingo.js:137`, `cron-outerlimitslounge.js:323`). Ticketmaster omits the key for existing rows.
- **OBSERVED:** no connector touches `description_source`, so an erased row still claims `generated`.
- **INFERRED:** affected rows oscillate daily between generated text (12:30 UTC) and `null` (the connector's hour).

### 5.5 RECOMMENDED contract (shape, not taxonomy)

One module, e.g. `api/_lib/event-contract.js`, called inside `upsertEventRows` so no connector can bypass it. It provides:

1. **Sanitize:** decode entities, then remove `<script>`/`<style>` *with their bodies*, then strip tags, collapse whitespace, cap length. Apply to every text field.
2. **Normalize:** placeholders become `null` plus a reason code (never a stored `"Venue TBA"` / `"Evening"` / `"Untitled event"`). City must be a known place for its state/province, otherwise `null` + issue. Price ≥ 0 plus currency by country. Unknown-free stays unknown (requires `is_free` to become nullable or a new `price_status`).
3. **Validate (hard):** title present after sanitizing; `start_date` within a sane horizon; `end_date >= start_date`; URLs `http(s)` and parseable. A failing row is **not written**, and is counted as `rejected_by_contract` in the run log.
4. **Validate (soft):** missing venue, missing time, unknown city, uncertain eligibility. The row is written but **not published** (§8, `held` state), and issues are recorded (§13).
5. **Field policy (DEBT-011):** each field is declared `source_authoritative`, `fill_blank_only`, or `human_locked_when_edited`. The writer never sends `null` over a stored value for non-source-authoritative fields.
6. **DB backstops:**
   - `CHECK (end_date IS NULL OR end_date >= start_date)`
   - `CHECK (price_from IS NULL OR price_from >= 0)`
   - URL-scheme CHECKs
   - `events.status` default → `pending_review`

   Each CHECK is added as `NOT VALID` first, then validated after cleanup.

Ship it in **report-only (shadow) mode for one week** to measure rejection rates per source, then enforce.

---

## 6. Event-producer intelligence assessment

**Question:** can the architecture support an AI-assisted *digital event producer* that resolves "Eastern Market Shed 3 - ProsperUs Detroit Family Block Party" instead of defaulting to Venue TBA?

**Verdict:** not cleanly, today. The resolution *tiers* that exist are well designed (deterministic, internal-first, ambiguity-aware), but four foundations are missing.

**What exists (OBSERVED):**
- **Locked authority order** (`venue-lookup.js:97-118, 312-363`): A existing `venue_id`, then B exact canonical name, then C exact "learned" name from historical events (dropped when histories disagree).
- **Reverse address → venue** (`:387-402`).
- **Ambiguity sentinel** for same-name venues in different cities (`AMBIGUOUS_VENUE_NAME`, `:135`) and a `citiesConflict` guard (`:305-310`).
- **Location grammars** for Tribe/CivicPlus feeds (`ics-location.js:28-60`); Localist's closed-list city resolution (`localist-rows.js:395-500`).

### 6.1 Does the system interrogate its own knowledge first?

For "Eastern Market Shed 3 - ProsperUs Detroit Family Block Party":

| Producer question | Answer from the repository (OBSERVED unless marked) |
|---|---|
| Do we already know Eastern Market? | **Partly, three ways that the schema cannot tell apart:** a venue row with **name and city only, no address** (`supabase/seed.sql:21`); a district in `neighborhoods` (`migration_002:61`); and a feed organization, "Eastern Market Partnership" (`migration_043:5-9`). Archive notes record a deliberate decision not to store an address (`archive/seed_2026-09-04_more_annual_events.sql:40-43, 64-67`). |
| Do we know "Shed 3", or an alias? | No. There is no alias, parent or child store (`grep alias supabase/` → 0). "Shed 5, 2810 Russell St" appears only in a test fixture (`test/cron-feeds-city-recovery.test.js:268-282`), and must not be used as data. |
| Does a verified record establish its address? | No committed SQL sets one. "2810 Russell" appears nowhere in repo data. Production may differ (Appendix C). |
| Does the incoming record carry corroborating evidence elsewhere? | Often, but it is never read. Connectors mine titles and descriptions for category, non-event rules and `no_fixed_venue`, never for place (`api/cron-feeds.js:444, 459, 488`). A description's address would be recoverable with the existing extractors, but no connector calls them. |
| Does the source carry more location evidence? | Discarded at ingest: Ticketmaster venue id and coordinates, ICS `GEO`/`ORGANIZER`, Localist geo (except for the Orbit check) (`api/cron-ticketmaster.js:245-249`; `api/cron-feeds.js:180-196`; `api/_lib/localist-rows.js:425-516`). |

**Policy note (OBSERVED).** "Never infer a venue from a title" is a recorded convention, not an oversight: `api/_lib/localist-rows.js:79` and `api/_lib/ics-location.js:42-52`. Producer-level extraction therefore needs an explicit decision. It is safe only if extraction **proposes candidates** that must be corroborated, and **never writes canonical fields directly**.

### 6.2 What happens today, by arrival shape

These were run through the real `cron-feeds` handler with mocked fetch (sub-review CX, verified).

| Arrival shape | What happens today |
|---|---|
| Title only, blank LOCATION | `"Venue TBA"` written (`cron-feeds.js:282`), `venue_id` null, city null, `status` approved. Admin exempts an exact "Venue TBA" as source-limited (`admin.html:637-649, 766-779`), so nobody is asked. |
| Title + a description containing the address | Same as title only. The description is never read for location. |
| LOCATION `"Eastern Market Shed 3"` | Unparseable, stored whole as `venue_name_raw`, unlinked. Admin shows `NO_CANONICAL_VENUE_DATA`. With the search gate open, it is queued for an external search of the literal string. INFERRED: research would mint a separate canonical venue "Eastern Market Shed 3" with city defaulted to Detroit (`venue-lookup.js:592-597`). The test asserts that "Shed 5" is searched (`test/venue-lookup-placeholder-and-city.test.js:168-187`). |
| Tribe `"Shed 3, 2810 Russell St, Detroit, MI 48207"` | Name "Shed 3", unlinked. It leaves the queue because it has an address. |
| Comma composite `"Eastern Market, Shed 3, Detroit, MI 48207"` | Links to Eastern Market by name, but stores `venue_address_raw = "Shed 3"` (`cron-feeds.js:311`). |
| No location at all | `"Venue TBA"` as data, published. |

Two further effects:
- Event dedupe never pairs the title-prefixed "Venue TBA" row with a placed copy of the same event (probe: 2 groups considered, 0 merges, 0 reviews).
- The article matcher misses it because the event title carries the place prefix.

The extractors that already exist are wired only to editorial articles and search results:
- `extractStreetAddress` / `extractCity` (`scripts/press-coverage-linking.js:519-573`);
- `extractVenuePhraseFromText` (`api/_lib/external-discovery.js:262-277`).

They have defects that block reuse as-is (OBSERVED by probe):
- the "at [Venue]" pattern rejects any phrase ending in "Market", "Fair" or "Festival" (`:256`);
- it cannot capture numbered sub-units;
- its character class lists the straight apostrophe twice and omits `’` (`:229`);
- the "returns to" branch truncates to "Eastern Market Shed" (`:233, 264-267`);
- `extractCity` finds "Detroit" inside the organization name "ProsperUs Detroit".

**Conclusion on "Venue TBA" (OBSERVED + INFERRED):** today "Venue TBA" is the **first** fallback, not the final unresolved state.
- It is written the moment a structured location field is blank or unparseable, before any title, description, internal-history or alias evidence is consulted. It is written even when an address and city were parsed (`cron-feeds.js:316`).
- It is then effectively **terminal**:
  - it blocks the reverse address tier (`venue-lookup.js:391`);
  - repair and discovery skip it as a placeholder;
  - via the unguarded `resolveVenueId` it can link to the seeded "Venue TBA" venue row (`supabase/seed.sql:47`), whose "Detroit" city then flows onto the event;
  - Admin exempts it, while the *more informative* "Eastern Market Shed 3" is escalated. Escalation is inverted.
- "Unknown venue" has at least six encodings ("Venue TBA", "Location TBA", null, skipped, a link to the placeholder row, "Venue TBA (Detroit)"/"Multiple Locations" rows). Placeholder detection is implemented four different ways.

**What "Venue TBA" should mean (RECOMMENDED).** `venue_id` and `venue_name_raw` are null. An explicit resolution state carries a reason code and evidence trail:

| State | Meaning | Public? | Admin? |
|---|---|---|---|
| `source_blank_uninvestigated` | Transient: resolvers still running | No (`held`, SZ-08) | No |
| `source_states_tba` | The source explicitly says TBA / secret location | Yes, rendered as "Venue TBA" | No (a real source limitation) |
| `investigated_unresolved` | Every internal step and permitted research exhausted; attempts recorded | Policy choice (rendered "Venue TBA") | Yes, as an issue with the candidate list |
| `no_fixed_venue` | Existing flag (`migration_040`): walks, tours, crawls | Yes | No |

"Venue TBA" becomes display text derived from the state, never a stored name. Existing "Venue TBA" rows that also carry an address or city are migrated to null + reason, so the deterministic tiers can fire again. The placeholder venue rows are flagged `kind = placeholder` and excluded from every lookup.

### 6.3 Target outcomes for the example (RECOMMENDED, consistent with the §7.4.1 confidence model)

Assumes the repo's reference data (Eastern Market has no stored address, coordinates or verified website).

| Arrival shape | Evidence available | First arrival | After an Admin-verified child or alias exists |
|---|---|---|---|
| Title only, blank LOCATION | Title-derived known-parent prefix (V 0.45). No city: "Detroit" inside "ProsperUs Detroit" is an organization name and contributes nothing. | **Held → propose** a claim: parent Eastern Market, sub-unit "Shed 3", title span as evidence. One research attempt through the gateway (P1-17). Then escalate with the candidate pre-filled for one-click confirmation. **Never "Venue TBA", never a new canonical row.** | Verified, specific alias (A 0.60). Auto-links only when this feed already has ≥ 3 human- or S-anchored decisions for this alias (C1, giving 0.85); otherwise one click. |
| Title + description with address and city | V 0.45 + city from the description address (L3 0.25) = 0.70 | **Held → propose** child "Shed 3", with the description address as evidence | A 0.60 + L1 0.35 (if the verified child address equals it) + L3 0.25 → **auto-link to the child** |
| LOCATION "Eastern Market Shed 3" | V 0.45 | Same as title only | Same as title only |
| Comma composite (after the parser fix) | Exact structured name (A 0.60) + city (L3 0.25) = 0.85 | **Auto-link to parent Eastern Market**. "Shed 3" is kept as a sub-location claim (never as `venue_address_raw`), and a child venue is proposed. | Link to the child if one is verified |
| Tribe "Shed 3, 2810 Russell St, …" | A generic room label (no global alias allowed) + city; address agreement only against a verified child | **Held → propose** | Parent-scoped alias "Shed 3" + L1 → auto-link to the child |

**Safety outcome:** only the fully structured shape auto-links on first arrival. Every other shape produces a held row with a recorded, pre-filled proposal. This is the correct producer behavior: investigate, propose, and ask once, not guess and not give up.

**Prerequisite (SZ-15, P1-13):** Eastern Market needs `kind` = district/campus parent, a verified official website and coordinates, and child sheds with addresses from authoritative sources only. Without those, most shapes correctly stay held.

**Guards required:**
- "Eastern Market Partnership" events at other places must not link to Eastern Market. Its feed carries, for example, an Ecorse Senior Center event (`test/duplicate-consolidation.test.js:27-28`).
- An organization or series name never supplies venue or city evidence.

### 6.4 Foundational changes required (RECOMMENDED)

1. **A claims/evidence store** (§7) so a resolver can record a candidate with its method, authority, evidence and confidence instead of writing straight into canonical columns.
2. **Place model extensions and a durable identity store** (§10.7):
   - `venue_aliases` (scoped, with status and evidence);
   - `venue_external_ids`;
   - `entity_match_decisions` (positive and negative);
   - `resolution_attempts`;
   - `venues.parent_venue_id` for sub-venues (Eastern Market → Shed 3/5);
   - `venues.kind` (`venue | room | campus | district | outdoor_area | virtual | placeholder`), because "Eastern Market" is both a market venue and a district.
3. **A resolver chain** run per unresolved field, in fixed order, each step returning a claim or nothing:
   1. source structured fields and source venue ids;
   2. source unstructured text (title segments split on ` - `, ` – `, `: `, ` | `, `@`, ` at `; `TBA - <place> | <addr>` strings; description address/city/"at …");
   3. internal canonical venues, verified aliases and known parents (gazetteer longest-prefix / token-boundary match);
   4. prior human- or S-anchored decisions for the same source;
   5. authoritative external lookup, only for held residual cases and only after checking `resolution_attempts` (the venue's own site; a geocoder for address → coordinates);
   6. LLM extraction only for residual segmentation, constrained to quote its evidence;
   7. independent self-check (§7.4.1);
   8. confidence gate (§7.4.1).
4. **A `held` publication state** (§8) so an unresolved row is not public while automation is still working on it, and **issue records** (§13) so the final escalation to Admin is explicit and counted.

None of this requires replacing `venue-lookup.js`. Its tiers become steps 3–4 of the chain. The name-matching part of this (normalization, aliases, candidate generation, corroboration, false-match vetoes, learning) is assessed in §10.1–10.9.

---

## 7. AI / evidence architecture assessment

### 7.1 What "AI" actually is today (OBSERVED)

- **There are no LLM calls in the codebase.** No Anthropic/OpenAI endpoint, SDK or API key appears in `api/`, `scripts/`, the HTML pages or `.github/`.
- The "AI/enrichment" layer is:
  - **Level 2 "generated" descriptions:** a deterministic string template, `"${title} takes place at ${venue} on ${date} at ${time}."` (`api/_lib/description-enrichment.js:81-108`).
  - **Level 1 "authoritative" descriptions and venue research:** Tavily web search (`external-discovery.js:285`, `max_results` 5) plus regex extraction. The description is the result's raw `content` trimmed to 400 characters (`:563-593`), which is how navigation text was published.
- **Cost controls:**
  - per-run caps of 25 venue lookups and 50 description lookups (`generic-metadata-enrichment.js:109-110`);
  - a "daily" budget of 20 that is an **in-memory counter per invocation** (`:127-128, :247-251`). INFERRED: four routes call it (cron-enrichment, cron-editorial, Admin Auto-Repair, editorial auto-link), each with a fresh budget.

### 7.2 The production incident, read architecturally

- **OBSERVED** (`BUG-010`; commit `e244876`): between 2026-10-01 and 10-03 the search tier published, as `authoritative` descriptions, site navigation text, other dates' pages and other events' pages. It also created venue rows whose `website` was an aggregator homepage (seatgeek.com, dice.fm, …), with a defaulted city, and once with a placeholder name.
- **OBSERVED gate:** `WEB_SEARCH_ENRICHMENT_ENABLED === "true"` in the one module that sends search requests (`external-discovery.js:119-131`).
- **OBSERVED — not done:**
  - the wrong rows were not corrected;
  - five bad venue rows remain canonical and are still read by deterministic steps (that is how four further event links were written);
  - article-derived descriptions still publish as `authoritative` and are not gated.

What this reveals:

1. **Authority is a label, not a condition.** The description PATCH hard-codes `description_source: "authoritative"` regardless of the computed `descTier` (`generic-metadata-enrichment.js:455-470`). The venue path hard-codes `matchedOn: "venue"` (`:369`), so any non-denylisted host is classified `primary_authoritative`.
2. **No quarantine.** Results went straight onto `approved`, public rows.
3. **No evidence store.** Attribution required forensic timestamp reasoning because three of four write routes log no run (`BUG-010`: writes at hours with no recorded run).
4. **Derived facts became canonical and then fed other automation.** Search-created venues are trusted as "a human already confirmed" by `resolveDigitalHomeLink` (`venue-lookup.js:455-473`).
5. **Comments drifted from behavior:**
   - `external-discovery.js:18-28` still says the code was never exercised live;
   - `admin.html:606` says "no web-search capability".
6. **Provenance write bug (OBSERVED):** `generic-metadata-enrichment.js:384` assigns `event.note` (the column renamed to `internal_note` in `e812962`). A later description write in the same pass re-appends to a stale note and drops the venue provenance line.

### 7.3 Deterministic vs semantic: misallocations

| Where | Today | Better |
|---|---|---|
| Venue address/website from search snippets | Regex over third-party pages | Deterministic: canonical internal data → the venue's own domain → a geocoder for address/coordinates. Never take an aggregator page as a venue fact. |
| Descriptions | Snippet text (search) or template (derivable) | Source-stated text first, including JSON-LD the connectors currently discard (EPIC-006 SH.8). LLM summarization **of source text only**, quote-checked. Templates rendered, not stored. |
| Eligibility | Hand-built regex; each rule took three rounds of adversarial review (`non-event-filter.js:40-63`) | Deterministic rules for clear cases plus LLM classification **only for UNCERTAIN**, with quoted evidence and a confidence gate. |
| Venue extraction from titles/prose | Deliberately not attempted (`ics-location.js:43-50`) | Deterministic segment + alias match first; LLM extraction for residual prose; every result verified against canonical venues. |
| Catch-all source categories | Per-connector default category | Classifier on title + description with a confidence threshold; below it, an `uncertain` category state rather than a guessed enum value. |
| Dates, times, prices | Deterministic parse (correct choice) | Keep deterministic. No AI permission for these fields. |

### 7.4 RECOMMENDED evidence model (minimal, additive)

Table `event_field_claims` (name illustrative):

| Column | Purpose |
|---|---|
| `event_id`, `field` | What the claim is about |
| `value jsonb` | The proposed value |
| `method` | `source_stated`, `deterministic_parse`, `internal_match`, `external_lookup`, `researched`, `ai_proposed`, `human` |
| `authority` | `primary_source`, `official_owner`, `canonical_internal`, `trusted_aggregator`, `discovery_only`, `inferred` |
| `confidence numeric` | Calibrated per method (start with fixed values per method/authority) |
| `evidence jsonb` | `url`, `fetched_at`, verbatim quote (or hash + offset), `matched_on` |
| `competing_claim_ids` | Conflicting claims for the same field |
| `run_id` | `source_runs.id`, or an actor for humans |
| `status`, `decided_by`, `decided_at` | `proposed` / `accepted` / `rejected`; decided by `gate` or `human` |

Rules:

- **Canonical columns are a projection of accepted claims.** Start with only the fields automation writes (venue, address, city, description, eligibility, time). Source-stated fields continue on the current path, protected by field policy (§5.5) and history (§14).
- **An AI or researched claim can be accepted only if:**
  - (a) its quote exists verbatim in the fetched evidence and contains the value;
  - (b) for event-specific facts, the page independently mentions the event's date and a title anchor;
  - (c) no accepted claim of higher authority conflicts;
  - (d) the per-field threshold is met.

  Otherwise the row stays `held` and the next resolver runs; if all resolvers are exhausted, an issue is raised for Admin.
- **Budgets:** persisted per day in the database, not per invocation, and shared by every entry point, press-coverage search included (P1-17). Cache by content hash. Only run on rows the deterministic chain left UNCERTAIN.
- **An LLM never makes an identity decision and never performs normalization.** At most it proposes quote-constrained candidates, which the deterministic gate below decides.

### 7.4.1 Identity claims: evidence families, vetoes and thresholds (RECOMMENDED)

A lean, deterministic rule-plus-score model, the same for venue identity and event identity. **The weights are starting values to be calibrated against the gold set (SZ-14, P2-10); the structural properties are the requirement.**

**Evidence families.** A candidate collects at most one value per family; scores do not stack within a family.

| Family | Evidence | Start weight |
|---|---|---|
| **I. Identity anchor** | **S:** confirmed `(source, source_venue_id)` mapping, or the source *is* the venue (a single-venue connector mapped by `venue_id`) | 1.00 |
| | **A:** exact match under normalizer v1, or a *verified* alias in scope | 0.60 |
| | **V:** variant-equivalence candidate (Theatre/Theater, St./Saint, leading article, & / and, known city/room-suffix strip, known-parent prefix) | 0.45 |
| | **F:** fuzzy candidate (edit distance ≤ 2 on names of ≥ 8 characters, token-boundary containment) | 0.20 |
| **II. Location** | **L1:** standardized address (number + street + suffix) and city equal | 0.35 |
| | **L2:** coordinates within ~75 m | 0.35 |
| | **L3:** stated city resolves to the same canonical place id. Counts only if the venue's city has non-default provenance: `venues.city` defaults to `'Detroit'` (`schema.sql:31`), and seeded cities have been wrong, e.g. Elektricity seeded as Detroit but in Pontiac (`migration_002:164-167`). | 0.25 |
| | *(use `max(L1, L2) + L3`)* | |
| **III. Context** (capped at 0.30) | **C1:** ≥ 3 prior decisions for this same source key that were made by a **human** or anchored by **S**. Never links made by A/V/F/C1, which would make evidence circular. Counted as distinct decisions, not events, so one decision fanned over a series counts once. Not applicable to generic or room labels on aggregator feeds (`location_per_event = true`, `migration_043:29-30`). | 0.25 |
| | **C2:** the event URL or organizer domain equals the venue's *human-verified* website | 0.25 |
| | **C3:** recorded organizer → venue relationship (P2-11) | 0.15 |

**Hard vetoes.** Any one rejects the candidate whatever the score:
- the stated city, state or country resolves to a different place id;
- coordinates more than ~1 km apart;
- a recorded negative decision for this (candidate, alias or source key);
- the event date is outside the venue's or alias's `valid_from`/`valid_to`;
- the address matches, but the stated name matches a **different known occupant or room** at that address;
- the candidate is a placeholder, or a district when a venue is required (a district can only be a parent);
- the candidate came only from an organization or series name;
- two or more candidates survive within a 0.30 margin (ambiguity);
- for researched evidence, the quote does not contain the value verbatim.

**Auto-link** requires all of:
- (a) no veto;
- (b) exactly one surviving candidate;
- (c) score ≥ 0.85;
- (d) an A or S anchor, *or* a V anchor plus ≥ 0.40 of location evidence;
- (e) at least one family besides I contributes, unless the anchor is S.

**Resulting guarantees (checked):**

| Evidence present | Score | Outcome |
|---|---|---|
| Name similarity alone (V or F), with any context | ≤ 0.75 | **Never auto-links** |
| Address + city alone, no name anchor | 0.60 | **Never auto-links** (fails d) |
| Exact name, blank city, no context | 0.60 | Held |
| Exact name, blank city, C1 (human/S history) or C2 (verified domain) | 0.85 | Auto-link (deliberate) |
| Exact name + agreeing city of non-default provenance | 0.85 | Auto-link (today's common correct path keeps working) |
| V + L1 + L3 (e.g. "Fox Theater" at the standardized Fox address) | 1.05 | Auto-link, and propose "Fox Theater" as a verified-pending alias |
| Exact name + address of a different known room in the same complex | — | Veto, then held / escalate |

**Outcome bands:**
- **Held-continue:** 0.50 to < 0.85, or vetoed by ambiguity only. Next resolvers run.
- **Propose:** research, or a V/F match with corroboration, creates a *proposed* alias or child venue, never a canonical row.
- **Escalate:** resolvers exhausted, or a hard name-versus-occupant conflict. An `event_issue` carries the candidates, scores and evidence.
- **Unresolved:** below 0.50 with no candidates; record `investigated_unresolved`.

**Self-check (step 9).** Before writing, a separate pure function recomputes the decision from the persisted evidence bundle, against the canonical row re-read fresh. It re-checks every veto, and for researched evidence confirms that the page's address and city match the candidate's stored address and city. Any disagreement leaves the row held.

**Alias promotion.** Proposed → verified only by a human, or by ≥ 2 independent auto-links from *different sources* with no conflicts. A verified alias resolves later variants deterministically, at zero research cost.

**Address and number rules** (amends P1-14):
- House numbers match only by exact equality after standardization; never by digit edit distance. 4120 and 4140 Woodward are one edit apart and are different rooms.
- A malformed number (`2l11`) is treated as no address and raises a data-quality issue; it is never auto-corrected.
- A range (`4120-4140 Woodward Avenue`, as RA writes it, `update_2026-09-18_ra-manual-pull-6.sql:76`) is compatible with each number inside it but is never L1. In a complex it signals ambiguity.
- ZIP is a consistency check against the city's ZIP set. A mismatch raises an issue and weakens L1; it never establishes or vetoes identity alone. Today ZIP is stripped from city comparison (`venue-lookup.js:289-293`), and `venues.zip_code` (`migration_005:40`) is never read.
- When a name-anchored candidate's stored address differs from the stated one on the same street, record `address_discrepancy` on the claim. Do not veto (sources misprint) and never overwrite the canonical address.
- An unknown city spelling ("Detriot") resolves to *unknown*, not *conflict* and not *same*.

---

## 8. Eligibility architecture assessment

**Current state (OBSERVED):** eligibility is **implicit, source-specific, keyword-based and partly post-ingestion cleanup.** It is not a coherent domain concept.

- **Implicit:** connector authors decide what to fetch (e.g. WDET filters out travel listings in its own code). There is no eligibility column, reason or evidence.
- **Keyword-based:** `non-event-filter.js` has three title-only rule families: private-event closures, suite rentals, civic closure notices. It is deliberately narrow and grows only "when a new case is confirmed live" (`:23-29`).
- **Partial at ingest:** called by 3 of 25 connectors (`cron-feeds`, `cron-ticketmaster`, `localist-rows`). The rest rely on `scripts/retire-non-events.js`, nightly, after publication.
- **Undecided cases publish:** government meetings are explicitly not matched pending a product decision (`:65-68`), so they publish as `approved`.
- **No UNCERTAIN state:** the only non-public, non-rejected state is `pending_review`, which means "a human must look". UNCERTAIN would therefore automatically mean Admin, the exact outcome the product wants to avoid.

**INFERRED:** the denylist approach does not scale with sources. Each new municipal or institutional calendar brings new calendar-shaped non-events (meetings, deadlines, room bookings, office hours). Each needs a confirmed-live incident and adversarial review before it can be excluded. Production becomes the discovery mechanism, and engineering review becomes the clerical work.

### RECOMMENDED (architecture only; taxonomy deliberately not designed here)

1. **Columns:** `eligibility` (`positive | negative | uncertain`), `eligibility_reason` (code), `eligibility_confidence`, `eligibility_decided_by` (rule id / classifier / human), stored as a claim (§7.4) so evidence is retained.
2. **Decision chain at ingest**, before publication:
   1. **source priors** (source type and calendar kind: a ticketing API is a strong positive prior; a municipal "all items" feed is a weak prior);
   2. **deterministic negative rules** (the existing filter);
   3. **deterministic positive signals** (ticket URL, performer or exhibition structure, category from a curated source);
   4. **classifier for the remainder**, with quoted evidence;
   5. **gate.**
3. **Outcome mapping:**
   - `positive` + contract pass → `approved`;
   - `negative` → not published (soft `rejected` with reason; kept for audit and so it isn't re-ingested as new);
   - `uncertain` → `held`, retried with more evidence (description fetch, source detail page);
   - still uncertain after the chain → **sampled** human review. Not every item: review a sample per source to set the source's prior, then automate.
4. **Measurement:** precision and recall of the chain per source on a labeled sample. That replaces "three rounds of review per regex" as the quality mechanism.

The existing architecture can support this cleanly *once* the write path has a gate (§5.5) and a `held` state. Neither exists today.

---

## 9. Temporal-model assessment

### 9.1 Observed model

- **Storage:**
  - `start_date date NOT NULL`, `end_date date`, `time_display text`, `is_all_day bool` (`supabase/schema.sql:70-72`, `migration_028`);
  - no timestamp, no timezone, no time precision, no occurrence or series entity.
- **`end_date` means different things per writer:**
  - **RA:** next calendar day for an overnight set (`scripts/ra-sync.js:130-146`);
  - **ICS all-day:** set from `DTEND`, which RFC 5545 defines as exclusive. A one-day all-day event becomes two days, and a test asserts the off-by-one (`cron-feeds.js:511`; `test/cron-feeds-all-day.test.js:119-125`);
  - **ICS timed multi-day:** end date dropped (`:511` requires `start.hour === null`);
  - **seed/manual data:** overnight stored as start date only with `"10:00 PM–2:00 AM"`.
- **Times:** free text parsed by regex at render time (`discovery.js:354-391`, plus 4 copies in HTML). Placeholders `"Evening"` and a default `"7:00 PM"` are indistinguishable from real times.
- **Timezone at ingest:**
  - 13 connectors compute "today" as the UTC date (`toISOString().slice(0,10)`); those scheduled 00:00–04:00 UTC run during the previous Detroit evening and skip that night's events;
  - some parse local wall time with `getHours()` on a UTC server (`cron-belle-isle…:69`, `cron-wdet.js:126`, `cron-gottagacha.js:197`).
- **Timezone at display:**

  | Basis | Where |
  |---|---|
  | America/Detroit | Homepage (`discovery.js:310, 497`) |
  | Browser local time | `calendar.html:1297`, `map.html:812`, `radar.html:387`, `venues.html:186`, `neighborhoods.html:190` |
  | UTC | `venue-template.html:376`, admin follow-up query (`admin-events.js:258`) |
  | Server (UTC) | `api/sitemap.js:51-55` |

- **Filtering:**
  - homepage: correct "current + upcoming" (`start >= today OR end >= today`);
  - **Map: `start_date >= today-8` only** (`map.html:1921`; `DQA-001` on the unmerged branch), so running exhibitions are never loaded;
  - Calendar/Map "today/weekend" require `e.date === today`, so running multi-day events are hidden;
  - Radar labels running shows "Past event" (`radar.html:410`).
- **Lifecycle:** there is no cancelled state. Ticketmaster's `ticket_status` is stored but does not hide anything. Nothing retires an event the source stopped listing (prior audit F1, still open).

### 9.2 The Saturday 9 PM → Sunday 3 AM case

- **OBSERVED:** an RA row gets `start_date = Sat`, `end_date = Sun`, `time_display = "9:00 PM–3:00 AM"`. `discovery.js` treats every date from start to end as occupied (`:46-53`, `:875-889`), so the event is "current" for all of Sunday and appears in Sunday's lists.
- **OBSERVED:** stored without `end_date`, the same event drops out of every forward view at 1:00 AM Sunday, while it is still happening (`test/discovery.test.js:308`). `endedByClock` only protects a midnight-crossing range during its *start* date (`discovery.js:402-407`).
- **Neither representation is correct**, because the model cannot distinguish "spans two calendar days" from "a single night that ends after midnight."

### 9.3 Verdict

**The underlying model requires structural change, but additive — REFACTOR, not REBUILD.**

RECOMMENDED:

1. **Add:**
   - `start_at timestamptz`, `end_at timestamptz` (nullable);
   - `timezone text` (default `America/Detroit`; `America/Toronto` for Ontario);
   - `time_precision` (`exact | approximate | date_only | all_day | unknown`);
   - `service_date date` — the "night it belongs to". An end before ~06:00 the next day keeps the start's service date.
2. **Write path:** connectors supply `start_at`/`end_at` where the source has them. The contract derives `start_date`/`end_date`/`time_display` from them, so existing readers keep working. Placeholders become `time_precision = approximate | unknown`, not text.
3. **Semantics:**
   - `end_date` means *last service date of a multi-day run*;
   - overnight is expressed by `end_at`, not by `end_date`;
   - one shared `isCurrent(event, now)` lives in `discovery.js` and is ported to SQL as an indexed expression.
4. **Occurrences:** keep one row per occurrence (the current practice) but add `series_key` so weekly series and folded runs are identifiable. A separate occurrences table is P2, and only if needed (§21).
5. **DST:** with `timestamptz` + IANA zone, DST is handled by Postgres/`Intl`. Remove all `getHours()`-on-server parsing.
6. **Backfill:** derive `start_at` from `start_date` + parsed `time_display` where unambiguous; otherwise `time_precision = date_only`.

---

## 10. Entity-resolution assessment

| Area | OBSERVED state | Gap |
|---|---|---|
| Canonical venues | 83 rows on 2026-09-13 per the `venue-lookup.js` header comment (current count not in the repo); unique on `(lower(name), lower(city))` (`schema.sql:46`) | No state/country, no `updated_at`, no provenance, `city` defaults to `'Detroit'`. Five search-created rows with aggregator websites are still canonical (`BUG-010`). |
| Aliases | None ("No fuzzy… No alias inference", `venue-lookup.js:116-118`; `grep alias supabase/` → 0) | *Supersedes the prior "DIA ≠ Detroit Institute of Arts" note (audit E4).* "DIA – Detroit Film Theatre", "DIA – Rivera Court" and "Detroit Institute of Arts" are three separate canonical rows (`seed.sql:16,17,19`), so DIA is both an acronym-alias problem and a parent/room problem. A substring gate already mis-verifies "DIA" inside "Indian Village" (`external-discovery.js:150-160`). → P1-13: verified, city-scoped acronym alias; DFT and Rivera Court as children of DIA; never substring. |
| Name variants / normalizers | Linker folds only case and whitespace (`venue-lookup.js:26-29`); 13+ other normalizers with incompatible rules | Harmless variants miss; the same pair is "same place" in dedupe and "different" in the linker (§10.2). → SZ-14. |
| Same-name venues | `AMBIGUOUS_VENUE_NAME` sentinel + `citiesConflict` (good), but only in the detail-map tiers | `resolveVenueId` (the ingest linker in ~28 files) is city-blind and last-row-wins. SQL patches link by name only, ignoring city (e.g. `update_2026-09-20_ra-manual-pull-9.sql:121-125`). → SZ-13. |
| Address matching | Exact normalized address + city key, **used as identity on its own** (`venue-lookup.js:387-402, 437-441`) | Address-only links that rename the event's venue (§10.4). No street standardization ("St." vs "Street", "Ave" vs "Avenue"); raw "Detroit, MI 48207" in the key; ZIP unused; house-number transcription errors undetected. → SZ-13, P1-14. |
| Title/description extraction | None in connectors (a deliberate "never guess" convention, `localist-rows.js:79`) | Required for the producer workflow (§6). → P1-15. |
| Learning / persistence | Nothing persists a confirmed name relationship. Admin cannot set `venue_id` (`admin-events.js:372`). The learned map is recomputed from the 500 newest rows (`venue-lookup.js:200-228`). | The system never learns; variants are re-resolved, or minted as duplicate venues. → P1-13. |
| Research cost | Per-invocation "daily" budget, no negative cache, research before internal steps | → P1-17. |
| Source-stated location | Good in Localist and ICS; per-connector elsewhere | No shared location contract. |
| City inference | Closed list in 2 paths; defaults to "Detroit" in DMOD, the venues table and search-created venues | Unknown city should be `null` + issue, never a default. |
| Neighborhood inheritance | Via venue only; event-level column ignored by `events_public` | Coverage ~20% of upcoming events (`DEBT-004`). |
| Coordinates | Sparse on venues; none on events | Map and radius filters use city centres (`discovery.js:67`). |
| Cross-source identity | `event_source_identities` (`migration_045`) written by merge/RA; **no connector reads it before writing**; only VisitDetroit checks cross-source at ingest, unpaged (`cron-visitdetroit.js:357-372`) | Duplicates publish first, consolidate nightly (`duplicate-consolidation.js`). |
| Duplicate identity | Title-derived external IDs in 5 connectors (`cron-halo`, `cron-trinosophes`, `cron-dossin`, `cron-redford-theatre`, `cron-motorcitywine` md5 of title) | An edited title creates a new row; the old row is never retired (prior audit E2, still open). |
| Venue fetch failure | Returns empty map (`venue-lookup.js:51-73`) | One failed fetch sends `venue_id: null` for every row (DEBT-011 #6). |
| Scale | `venues?limit=1000` unpaged (`:55`); learned map reads 500 rows (`:205`) | Silent truncation past 1,000 venues. |

**"Venue TBA" verdict:** convenient first fallback, not a final unresolved state. It should become one of four explicit resolution states (§6.2).

**RECOMMENDED:**
- placeholder → `null` + reason state;
- false-match guards on existing paths (SZ-13);
- one shared normalizer and gold-set precision gate (SZ-14);
- reproducible venue reference data (SZ-15);
- a durable identity store with aliases, external ids and decisions (P1-13);
- candidate generation plus corroboration scoring (P1-14);
- content location candidates (P1-15);
- event-identity matcher hardening (P1-16);
- internal-first research with a negative cache (P1-17);
- fail-closed venue map and paged venue reads (SZ-06, P2-05);
- connectors consult `event_source_identities` and `venue_external_ids` before insert.

### 10.1 Producer-level name/entity matching: capability against the target reasoning sequence

| Step | Status | What exists (OBSERVED) | Gap |
|---|---|---|---|
| 1. Normalize harmless differences | **Partial** | The linker folds case and whitespace, including NBSP (`venue-lookup.js:26-29`). At least 13 other normalizers fold different things: dedupe strips punctuation and drops accented letters (`scripts/duplicate-consolidation.js:110-125`); `source-authority` strips a leading "the" (`:105-107`); the city comparator expands only mt/twp/hts (`venue-lookup.js:280`). | No single versioned normalizer. Curly quotes, dashes, & / and and diacritics are not folded in the linker; no street-suffix standardization. |
| 2. Search canonical entities and known aliases | **Partial** | Exact lookups by name or by address+city; a "learned" name → address map rebuilt each run from 500 rows (`venue-lookup.js:51-80, 147-183, 200-228`). | No alias, external-id or parent store. Legacy and source spellings live only in SQL comments and connector constants (e.g. `update_2026-10-01_bagley-venues-and-boundary.sql:29-33`; `cron-oldmiami.js:91`). |
| 3. Generate candidates via similarity | **Absent** (in the linker) | None, by design (`venue-lookup.js:116-118`). Where similarity exists elsewhere, it **decides** rather than proposes: editorial substring links (`cron-editorial.js:383-406`); RA title-token ≥ 0.8 (`ra-sync.js:392-424`); `verifyOfficialResult` substring (`external-discovery.js:150-160`). No `pg_trgm`/edit-distance anywhere. | No candidate generator that feeds corroboration or review. Variant duplicates never reach Admin. |
| 4. Corroborate with independent evidence | **Absent** | An exact address+city match is an *alternative identity key*, not corroboration. Coordinates (`venues.lat/lng`, never selected, `venue-lookup.js:153`), source venue ids, official domain, organizer and source history are never used for venue identity. Ticketmaster venue id/coordinates and ICS `GEO`/`ORGANIZER` are discarded at ingest. | The design rule is "no contradiction ⇒ same", not "independent corroboration ⇒ same". |
| 5. Detect conflicting evidence | **Partial** | `citiesConflict` veto when both cities are stated; the ambiguity sentinel in the detail maps; the learned map drops disagreeing names; dedupe's city veto and `DUP_DISTINCT`; Localist refuses address links (`cron-localist.js:652-658`). | Not in `resolveVenueId`. The address tier never compares names. `samePlace` skips the city veto on a shared `venue_id`. RA dedupe never checks venue, city or status. "St."/"Saint" city spellings produce false conflicts. |
| 6. Confidence from combined evidence | **Absent** | Every tier is a binary hit or nothing, with no score, candidate list or reason code. On collision the sentinel discards all candidates, even when a stated city would uniquely identify one. | No evidence/confidence structure (→ §7.4.1). |
| 7. Auto-resolve only above a threshold | **Absent** | Any single exact key auto-links and writes `venue_id`. In `cron-feeds` and the re-parse repair it also overwrites `venue_name_raw` with the canonical name (`cron-feeds.js:296-312`; `scripts/venue-raw-reparse-repair.js:158-165`). | No threshold and no held outcome. Placeholder literals link to the seeded "Venue TBA" row. |
| 8. Research when internal evidence is insufficient | **Partial** (gated off) | Tavily `discoverVenueKnowledge`/`discoverEventVenue`; the query is hard-coded to "Detroit" (`external-discovery.js:311`); results persist as a **new canonical row named with the variant spelling** (`venue-lookup.js:557-611`). | Runs before cheaper internal steps (`cron-enrichment.js:177` vs `:194`). It cannot verify the canonical page from a variant, because the verifier requires the raw variant string. |
| 9. Self-check before writing | **Absent** | Post-upsert "revalidation" re-runs the same exact match (`generic-metadata-enrichment.js:354-355`); press-coverage skips even that. | Nothing checks a proposed link against address, city, coordinates or the page's canonical name. A probe created a duplicate "Majestic Theater" row at an address already held by two rows. |
| 10. Escalate only when automation is exhausted | **Partial** | Needs Follow-up, `NO_CANONICAL_VENUE_DATA`, the duplicate review list. | **Inverted:** an exact "Venue TBA" is exempted while "Eastern Market Shed 3" is escalated (`admin.html:600-605, 637-649`). Escalations carry no candidates or evidence. Admin cannot set `venue_id` (`admin-events.js:372`), so a human identity decision is never captured. |

### 10.2 Variant classes

"Linker" means `normalizeVenueName` / `resolveVenueId` and the detail-map tiers. All results are from local probes of the actual functions.

| Variant class | Linker today | Elsewhere | Safe fix class |
|---|---|---|---|
| Capitalization | Handled | All normalizers fold case | normalization |
| Spacing / NBSP / double space | Handled | Admin autofill, map/calendar pin keys and SQL backfills do not collapse internal whitespace (`admin-venues.js:90,110`; `map.html:1184,1797`) | normalization |
| Curly vs straight apostrophe | **Not handled** ("Cliff Bell's" ≠ "Cliff Bell’s") | Dedupe/press/editorial fold it; `external-discovery`'s "at [Venue]" class omits `’` (`:229`) | normalization |
| Punctuation, trailing period, en dash vs hyphen | **Not handled**. The seeded "DIA – Detroit Film Theatre" (en dash) misses the hyphen form | Dedupe folds them | normalization (identity key only; display keeps the source text) |
| Hyphenation / compound spacing (Hart-Plaza; Spkrbox / Spkr Box) | **Not handled** | Dedupe folds hyphens, not compounds | hyphen: normalization; compounds: candidate + corroboration |
| & vs and | **Not handled** | Only `normalizeTitle` and press `normalizeAmpersand` | normalization |
| Diacritics (Café / Cafe) | **Not handled** | Dedupe **deletes** accented letters ("Café" → "caf"). That is untested for venues; `test/duplicate-consolidation.test.js:16` locks it for titles. | normalization (NFKD + strip marks; deliberate test change for titles) |
| Leading article ("The Magic Stick" / "Magic Stick") | **Not handled**. The repo holds both as separate canonical rows (`seed.sql:29`; `archive/update_2026-09-15_admin-followup-batch2.sql:75`) | Only `source-authority` strips it | candidate key only, then verified alias ("The Loft" vs "Loft" can be distinct) |
| St. vs Saint | **Not handled**, for names or cities. `citiesConflict("St. Clair Shores","Saint Clair Shores")` is **true** (a false conflict) | None | alias / place alias. **Never folded inside street addresses**: "12138 St Aubin" is Saint, while "… St" is Street. |
| Theater vs Theatre | **Not handled**. It already produced a duplicate canonical row (`seed.sql:30-31`), merged by hand with the legacy spelling deleted (`migration_002:174-182`) | None | candidate + corroboration, then persisted alias |
| Abbreviations / acronyms (DIA, LCA, MOCAD, DSO; Ave/Avenue; Pte/Pointe) | **Not handled** | Substring gates collide: "DIA" ⊂ "Indian Village" (verified probe) | verified, scoped alias for names; an address standardizer for suffixes |
| Common misspellings / transcription errors (Trinosophez, Ford Feild, "Detriot") | **Not handled**; fails safe for names (no link). A misspelled city is a *false conflict*. | None | candidate (edit distance ≤ 2, names ≥ 8 chars) + corroboration; persist alias once confirmed |
| Transcription errors in numbers (`2221` for `2211`; `2l11`; transposed ZIP) | Fails safe (no link), but L1 and learned knowledge are lost. **One wrong digit in a multi-room complex points at a different real room** (§10.4). | ZIP stripped and never compared | exact house numbers only; ZIP as a consistency check; data-quality issue on malformed numbers |
| Shortened names / city or room suffix ("Lager House" / "PJ's Lager House"; "Fox Theatre - Detroit"; "Paris Bar (Hamtramck)") | **Not handled** | Containment matchers accept these as substrings with no corroboration: the dangerous direction | candidate (strip a known city suffix and require that city to agree) + corroboration; persist alias |
| Sub-place / parent ("Eastern Market Shed 3", "DIA – Rivera Court", "Black Box at Planet Ant") | **Not handled**. No parent model; the address tier collapses rooms into whichever row holds the address | — | known-parent prefix candidate + `parent_venue_id`; new child proposed, never auto-created |
| Alternate / legacy names (Pine Knob ↔ DTE Energy Music Theatre; Live6 Alliance ↔ Neighborhood Home Base) | **Not handled**; recorded only in SQL comments; renames done by one-off SQL that discards the old name | — | alias `kind=legacy` with `valid_from`/`valid_to`; research or human to confirm |
| Source-specific variations ("Old Miami" vs "The Old Miami"; RA "Magic Stick" at "4120-4140 Woodward Avenue"; "TBA - place" strings with a pipe-separated address) | **Partial**. ~13–16 single-venue connectors hard-code a `VENUE_NAME` that must equal `venues.name` byte-for-byte | Hand-fixed per event in SQL | source-scoped mapping to `venue_id` (`venue_external_ids`) |
| Placeholder spellings ("Location TBD", "Venue: TBA", "TBA - Detroit") | **Partial**. A 6-string set in detail maps (`venue-lookup.js:273-277`); probe: `isPlaceholderVenueName("Location TBD")` → **false** | 4 different implementations | one shared placeholder classifier (SZ-14), placeholder → null + reason (SZ-05) |

### 10.3 False-match safeguards

| Risk | Status | Current behavior (OBSERVED) | Required rule (RECOMMENDED) |
|---|---|---|---|
| Similar or identical names in different cities | **Partial** | `citiesConflict` vetoes the detail-map tiers and Localist, but only when both cities are stated. `resolveVenueId` is city-blind and last-row-wins (`venue-lookup.js:61-64, 76-80`). A name-only match with a blank event city links (probe: blank-city "The Loft" links; "Ferndale" is refused), and the test asserts this (`test/venue-lookup-placeholder-and-city.test.js:136-139`). The repair then **writes the venue's city onto the event**, manufacturing the corroboration later checks rely on. | City agreement must be *positive* evidence (same canonical place id), not just absence of conflict. Blank city + name ⇒ held, unless an S mapping or human/S source history exists (§7.4.1). Never resolve same-name collisions by fetch order. |
| Chains / multiple locations | **Absent** | No brand or parent concept. Unique `(lower(name), lower(city))` allows one row per city, so two branches in one city cannot both carry the brand name. | A brand name alone is never sufficient; require address/coordinates or a source venue id. Brand and generic aliases must be city- or source-scoped. Optional `brand_id` (P2-11). |
| Renamed venue at the same address | **Absent** | The address tier links the new name to the old row and **overwrites `venue_name_raw` with the old canonical name** (`venue-lookup.js:437-441`; `cron-feeds.js:309`). Renames are one-off SQL that discard the old spelling. | Address match + different name ⇒ propose a `legacy` alias with `valid_from`, held for corroboration (official site or human). Never a silent link plus a silent rename. |
| Different venues sequentially at one address | **Absent** | Same mechanism: the new occupant is linked to the previous one. Only Localist refuses address links, after a production false match (`cron-localist.js:652-657`). | Address equality alone is never identity. Venue rows and aliases carry `valid_from`/`valid_to`; an event date outside the window is a veto. |
| Multiple rooms or venues in one building or complex (4120/4140 Woodward; Saint Andrew's Hall / The Shelter; Planet Ant / Black Box; Eastern Market sheds) | **Partial** | The sentinel refuses a link when ≥ 2 rows share the exact address string (works at 4140 Woodward). With one row on file, every room links to it and is renamed (probe: "Planet Ant Theatre" → "Black Box"). | `parent_venue_id` + `kind`. A room name at a parent address resolves to the known child, or proposes one. Never overwrite the stated name. |
| Event series vs venue names (Movement vs Hart Plaza; "Eastern Market Partnership" org vs Eastern Market venue) | **Partial** | `external-discovery`'s noun filter rejects phrases ending "Festival/Market/Fair", which also blocks real places like "Eastern Market". RA dedupe treats a series title as identity across venues. | Decide by gazetteer + aliases + corroboration, not token lists. Event identity needs venue or city agreement as well as title. An organization or series name never supplies venue evidence. |
| Similar organization or venue abbreviations (DIA vs Indian Village; DSO vs DSA; DPL vs DPL-Campbell Branch) | **Partial** | Exact keys never expand acronyms (so no collisions there), but substring gates collide (verified probe). | Acronyms resolve only through verified, scoped aliases. Token-boundary matching at minimum. Tokens of ≤ 5 characters never generate candidates without an exact alias. |
| Name similarity alone establishes identity | **Partial** | Prevented in the linker. Violated by: editorial/press substring links (persisted, with no unlink); RA title-only dedupe (recorded permanently in `event_source_identities`, `ra-sync.js:683-696`); VisitDetroit title+date suppression; `verifyOfficialResult` (website persisted, later trusted as "human-confirmed", `venue-lookup.js:455-476`). | Similarity only proposes. Every persisted identity decision needs ≥ 1 non-name corroborator, no veto, and a recorded method, evidence and actor. |
| **Address equality alone establishes identity** | **Absent** | Violated in `resolveVenueFromCandidate` (callers: `cron-feeds`, re-parse repair) and `resolveVenueNameFromAddressRepair` (generic enrichment). Policy is inconsistent with Localist. | Address + agreeing name (exact, verified alias, or corroborated variant) ⇒ link. Address + blank name ⇒ held / propose. Address + conflicting name ⇒ conflict ⇒ held / research / escalate. |
| Shared `venue_id` treated as proof in event dedupe | **Partial** | `samePlace` accepts a shared `venue_id` without a city veto when both rows have their own venue text (`duplicate-consolidation.js:192-196`). A probe auto-merged Livonia vs Troy "City Hall" events (confirmed by both verifiers). | Run the city veto unconditionally before any deterministic merge (SZ-13). |
| Placeholder treated as a venue | **Partial** | Guarded in the detail maps and search skip; **not** in `resolveVenueId`. Ticketmaster, Planet Ant and DMOD "Venue TBA", and RA "Location TBA", can link to seeded placeholder rows (`seed.sql:36, 47-50`), whose "Detroit" city then flows onto the event. | Placeholders become null + reason; placeholder venue rows are flagged `kind=placeholder` and excluded from every lookup. |

**Principle check.** Neither name similarity nor address equality alone should establish identity:
- **Name similarity:** respected by the venue linker; violated by the article, RA and VisitDetroit matchers and the research verifier.
- **Address equality:** violated by the shared resolver, the re-parse repair and generic enrichment.

### 10.4 Reproduced probes

Local, pure functions, using venue rows built from repo data (`archive/update_2026-09-15_admin-followup-batch2.sql:75`; `update_2026-09-22_gardenbowl-venue.sql`).

| Input (name, address, city) | `resolveVenueFromCandidate` result | What it shows |
|---|---|---|
| "Big Time Bingo", "4120 Woodward Ave", "Detroit" | **The Magic Stick** | The Big Time Bingo poster prints **4120** for Garden Bowl, whose own listing gives 4140 (`api/_lib/bigtimebingo-occurrences.js:13-18`; `update_2026-09-22_gardenbowl-venue.sql:14-32`). 4120 is the Magic Stick's address, so a one-digit discrepancy links a different real room by address alone. `cron-feeds.js:309` would then rename the event's venue. |
| "Some Pop-Up Gallery", "2211 Woodward Ave", "Detroit" | **Fox Theatre** | Address alone overrides a conflicting stated name |
| "Planet Ant Theatre", "2357 Caniff Ave", "Hamtramck" | **Black Box** | Room / venue collapse at one address |
| "Fox Theater", "2211 Woodward Avenue", "Detroit" | **null** | A harmless name variant plus a suffix variant both miss |
| "The Loft", no address, no city | **The Loft** (Detroit row) | Name-only identity with a blank city |
| "The Loft", no address, "Ferndale" | null | The city veto works when the city is stated |
| `resolveVenueId(map with "venue tba" row, "Venue TBA")` | **links to the placeholder row** | No placeholder guard in the ingest linker |
| `normalizeVenueName` pairs: Saint/St.; Theatre/Theater; "The Fillmore Detroit" / "Fillmore Detroit"; "Cliff Bell's" / "Cliff Bells"; hyphenation; "Eastern Market" / "Eastern Market Shed 3" | all **no match** | Only case and whitespace fold |
| `normalizeAddressCity`: "2810 Russell St." vs "2810 Russell Street" | **no match** | No address standardization |
| `isPlaceholderVenueName("Location TBD")`, `("TBA - Detroit")` | **false**, **false** | Placeholder set is incomplete |

### 10.5 Exact-string dependencies and loose-match hazards (summary)

**Exact-string dependencies (OBSERVED).** Each of these breaks on a harmless variant:
- `resolveVenueId` (~28 files);
- the detail-map name/address keys;
- the learned map (an "Ave" vs "Avenue" difference drops knowledge, e.g. "Pronto Royal Oak" in `update_2026-09-18_ra-manual-pull-5.sql:100` vs `ra-manual-pull-7.sql:111`);
- `VENUE_NAME` constants in single-venue connectors;
- four placeholder checks (`venue-lookup.js:273-277`, `admin.html:637-639`, `description-enrichment.js:67`, `ra-sync.js:394`);
- map/calendar pins keyed by display name, not `venue_id` (`map.html:1184-1218`);
- the Admin venue autofill;
- 36 SQL files repeating the `lower(trim(venue_name_raw)) = lower(trim(name))` backfill;
- the unique index `(lower(name), lower(city))`, which cannot catch Theater/Theatre or "The X"/"X" duplicates;
- event dedupe grouping on exact `normalizeTitle|start_date` (`duplicate-consolidation.js:345-354`);
- the reverse address tier, which fires only when the name is blank, so a literal "Venue TBA" blocks it permanently (`venue-lookup.js:391`).

**Loose-match hazards (OBSERVED).** Each lets one signal decide identity:
- address-only links and renames (above);
- name-only with a blank city, where the repair then writes the venue's city onto the event;
- the learned map keyed by name with no source or parent scope ("Library" or "Shed 3" learned in one city fills a city-less event elsewhere);
- `upsertVenueKnowledge` PATCHes the first same-named row in **any city** (latent behind the gate, `venue-lookup.js:562-590`);
- the enrichment discovery guard **fails open on an ambiguous name**: it tests `typeof sameNameRow === "object"`, and the sentinel is a Symbol (`generic-metadata-enrichment.js:309-313`);
- editorial/press venue-and-date and title substrings with no word boundary;
- RA title-only dedupe against rejected rows too;
- VisitDetroit title+date suppression;
- `samePlace` on a shared `venue_id`;
- map pins merging same-name venues.

### 10.6 Persistence and learning

**OBSERVED: nothing persists a confirmed name relationship.**
- **No store.** There is no alias, legacy-name, parent, source-venue-id or match/non-match table or column (`schema.sql:27-46` and later venue ALTERs).
- **The "learned" tier isn't learning.** It is recomputed every run from the 500 most recently updated events and yields only address/city text, never a `venue_id` or an alias. `updated_at` churns on every upsert, so older knowledge ages out.
- **The only automated write path mints a new canonical row** named with the variant spelling (`upsertVenueKnowledge`, `venue-lookup.js:557-611`). A probe created "Majestic Theater" again at 4140 Woodward. Repo-recorded production damage from this path already exists (`BUG-010`).
- **Resolved variants are overwritten** with the canonical name, destroying the evidence (`cron-feeds.js:309`; `venue-raw-reparse-repair.js:163`).
- **Human decisions are not captured.** Admin cannot set `venue_id` (`admin-events.js:372`). `DUP_DISTINCT` is free text in `internal_note`, which GottaGacha and Eventbrite overwrite (`cron-gottagacha.js:288`; `cron-eventbrite.js:212`).
- **Manual reconciliation went into one-off SQL:**
  - 36 files repeat the exact-name backfill;
  - 23 `insert into venues` statements and 27 `update venues` statements;
  - 128 per-event address assignments in 5 archive files;
  - the Majestic Theater merge *deleted* the legacy spelling (`migration_002:174-182`);
  - two rename files are listed in the ledger but absent from the repo (`migration_023:97,101`).
- **Negative research results** are remembered within one call only (`generic-metadata-enrichment.js:247`).

**INFERRED consequences:**
- Today the only way to "teach" a variant is to mint another venue row, which splits canonical identity: "Magic Stick" / "The Magic Stick"; "Majestic Theatre" / "The Majestic Theatre" (`seed.sql:29-31`; `batch2.sql:75-76`).
- Once research reopens, every variant costs again on every run.

**Answer to the learning question.** Yes, confirmed aliases and spelling variations should be persisted. That is the single biggest lever on both clerical work and research cost:
- a verified alias makes every later occurrence resolve deterministically, at zero AI/research cost;
- a recorded *negative* decision stops the same false pair being re-proposed;
- a `resolution_attempts` row stops the same unresolvable name being re-researched.

A verified alias only survives connector re-runs if `venue_id` is protected by field authority (SZ-06; `DEBT-011` #6).

### 10.7 Durable identity storage (RECOMMENDED, minimal and additive; P1-13)

Mirrors the existing `event_source_identities` crosswalk (`migration_045`), but fixes its weakness: it uses ignore-duplicates, so a conflicting key is silently accepted (`api/_lib/event-source-identities.js:94-104`).

1. **`venues` additions:**
   - `normalized_key` (normalizer v1 + version);
   - `kind` (`venue | room | campus | district | outdoor_area | virtual | placeholder`, separate from the free-text `venue_type`);
   - `parent_venue_id`;
   - `valid_from` / `valid_to`;
   - `source_provenance` (`human | seed | research | migration`);
   - `website_provenance` (the code wrongly assumes the website is human-confirmed, `venue-lookup.js:455-456`);
   - `updated_at`;
   - `merged_into_venue_id` (merge by redirect + legacy alias, **never DELETE**).
2. **`venue_aliases`:**
   - `venue_id`, `alias_display` (verbatim), `alias_key` (normalizer v1 + version);
   - `kind` (`spelling | legacy | abbreviation | source_label | room_label`);
   - `scope_source`, `scope_city_place_id` (generic and brand aliases **must** be scoped);
   - `valid_from` / `valid_to`;
   - `status` (`proposed | verified | rejected`), `confidence`, `evidence` (method, matched_on, url + quote or event ids, run_id);
   - `created_by`, `decided_by` (`gate | human:<id>`), timestamps.
   - Unique on `(alias_key, scope_source, scope_city_place_id)` where not rejected. One key cannot map to two venues in one scope.
3. **`venue_external_ids`:**
   - primary key `(source, source_venue_id)` → `venue_id`, plus `first_seen_at`, `last_seen_at`, `status`, `decided_by`;
   - covers Ticketmaster/Eventbrite/Localist venue ids and replaces `VENUE_NAME` constants;
   - a conflicting insert **fails loudly**.
4. **`entity_match_decisions`:** `entity_type` (venue/event/organizer), `subject_key`, `object_id`, `decision` (`same | different | parent_of | renamed_to`), `reason`, `evidence`, `decided_by`, `decided_at`, `superseded_by`. It replaces `DUP_DISTINCT` free text and stops nightly re-proposal of rejected pairs.
5. **`resolution_attempts`:** `subject_key`, `kind`, `method`, `outcome` (`resolved | none | error | ambiguous`), `evidence_ref`, `cost_units`, `attempted_at`, `next_retry_at` (exponential TTL). Consulted before **any** external call. It never blocks deterministic resolution.
6. **`place_aliases`** for cities: a closed list of canonical place ids plus aliases (St./Saint Clair Shores, Grosse Pte/Pointe, "Detroit, MI"). Distinct municipalities (Plymouth vs Plymouth Township) stay distinct.
7. **On `events`:** `venue_link_method` and a link-evidence/claim id, so a later alias revocation or merge can find and re-evaluate the events it affected. These are also needed for the non-circular C1 rule in §7.4.1.

### 10.8 AI / research cost implications

- **Today (OBSERVED).**
  - There are no LLM calls. A repo-wide grep for Anthropic/OpenAI endpoints matches only comments in `api/_lib/description-enrichment.js:11,23`, and there is no `package.json`, so no SDK.
  - Research means Tavily search credits: `fetch("https://api.tavily.com/search")` at `external-discovery.js:285`, on a 1,000-credit/month free tier (`:36-38`).
  - The gate is closed, so current spend is 0.
- **If the gate reopened under today's design (mechanics OBSERVED, spend INFERRED).**
  - **The budget is per call, not per day.** The "20/day" budget is an in-memory counter created per call (`generic-metadata-enrichment.js:112-128, 247-251`). The code comment assumes one daily cron run. In fact it is reached directly from `cron-enrichment.js:177-178` and Admin `admin-events.js:582-583`, and conditionally through `linkPressCoverageQueue` from `cron-editorial.js:720` and Admin `admin-editorial.js:166`. Each call gets a fresh 20.
  - **Press-coverage venue search sits outside the budget.** It is uncapped and runs even in dry-run mode (`press-coverage-linking.js:1084-1096`).
  - **No negative cache, and variants multiply.** An unresolvable name costs one search per call for as long as its events are upcoming, and every spelling variant costs its own search.
  - **Starvation and wasted spend.** Candidates are unordered, so the same first ~20 names starve the rest. Research runs before cheaper internal steps.
  - **Success creates more work.** A successful search is stored as a duplicate canonical row, which creates more unresolved variants later.
  - **Scale.** At one credit per search, one daily run at cap is ~600 credits/month; about 20 extra Admin clicks exhaust the quota.
- **With the recommended design.**
  - Internal-first, free steps run first: normalizer → verified aliases/external ids → content candidates and gazetteer → source history.
  - Research runs only for held residual cases, through one gateway that checks `resolution_attempts` and a persisted budget shared by every entry point (P1-17).
  - A verified alias makes every later variant cost 0. INFERRED: research volume should *fall* over time as aliases accumulate, rather than recur nightly.
- **LLM use, if introduced.**
  - Fast tier (Haiku-class), only for residual title/description segmentation that the grammars cannot parse.
  - Quote-constrained and cached by content hash.
  - **Never** for normalization or for the identity decision itself.

### 10.9 Classification and verdict

**REFACTOR the identity decision layer; KEEP its strict core.**

- **Keep:**
  - exact-key determinism as the only *automatic name* path;
  - `AMBIGUOUS_VENUE_NAME` and `citiesConflict`;
  - Localist's name+city-required, no-address-link policy;
  - duplicate consolidation's discipline (deterministic merge only on multi-signal agreement, everything else to review, identity recorded before retire).
- **Harden now (SZ-13):** `resolveVenueId` gets city, ambiguity and placeholder checks; address tiers never decide identity alone; the `samePlace` city veto becomes unconditional; the RA, editorial and VisitDetroit matchers require corroboration.
- **Refactor (P1-13–P1-16):** one resolver with:
  - one shared normalizer and placeholder classifier (replacing 13+);
  - a durable alias, external-id and decision store;
  - scored candidates with evidence;
  - the veto + threshold model;
  - held instead of default;
  - escalation with candidates.
- **Rebuild:** the research verifier and persistence (P1-04/P1-17).
- **Retire:**
  - creating canonical rows from variants;
  - raw substring identity decisions;
  - `"Venue TBA"` as stored data;
  - `VENUE_NAME` constants as identity.

**Why not KEEP or REBUILD.** The exact matcher is *safe but brittle*: it has already split canonical identity and forgets every reconciliation. The real false matches occur in the loose paths *outside* it: address-only, blank-city name-only, substring and title-only. The tiers and safeguards are sound and well tested, so incremental refactoring is cheaper and safer than a rebuild. **Bolting fuzzy matching onto today's linker would remove the one property that keeps it safe.**

---

## 11. Environment and release assessment

### 11.1 Current reality (OBSERVED)

| Environment | Exists? | Evidence |
|---|---|---|
| Local / development | Code and tests only | No `package.json`, no local DB, no `vercel dev` instructions. Tests run as `node test/x.test.js` against an in-memory PostgREST fake. |
| Staging / QA | **No** | No second Supabase project. No `VERCEL_ENV` awareness anywhere. The production Supabase URL and anon key are hard-coded in 8 HTML files and are the **fallback** in `api/event-meta.js:70,76`, `api/venue-meta.js`, `api/sitemap.js`. A preview deployment with unset env vars silently reads production. |
| Production | Yes | Deploys from `main`: README "Deploying" section and BACKLOG entries such as "deployed … as commit `660b81f`". `vercel.json` has no ignore-build setting; the Vercel project settings themselves are not visible from the repo. |

| Practice | OBSERVED |
|---|---|
| Branch discipline | 411 commits on `main`, 3 merges, **0 pull requests ever** (GitHub API). `TEMPORARY` canaries, probes and reverts committed straight to `main`: `12bb437`/`dcad756`, `f75d91f`/`2f9241f`, `0e7a18a`/`34edf9b`, `c9d8319`. |
| Deployment gates | None automated. Acceptance is recorded in prose (`BACKLOG.md`: "verified in production"). |
| Production verification | Daily `cron-healthcheck` (pages, auth, freshness) plus manual browser checks. |
| Feature flags | Env-var gates exist (`WEB_SEARCH_ENRICHMENT_ENABLED`, `RA_CANDIDATE_PROMOTION_ENABLED`, `*_DRY_RUN`). Source holds are done by **editing `vercel.json` and redeploying** (`c9d8319`). |
| Secrets | Vercel env vars plus a fine-grained PAT (`GH_PUSH_TOKEN`) in Actions. Reasonable. |
| Migrations | Pasted into the SQL editor. Ledger incomplete. `BUG-008`: a migration written 2026-09-22 was still not applied on 2026-10-03, so 10 consecutive GottaGacha runs failed. |
| Rollback | Code: Vercel's previous deployment (not documented). Data: none beyond reverse SQL written by hand. Schema: none. |
| Release tagging | None for releases. 24 tags, all RA-sync transport. |
| Hotfix process | Same as any change: push to `main`. |
| Git as message bus | RA payloads committed to `ra-sync/inbox/` on `main` (27 commits). The Action is triggered by push to `main` (`.github/workflows/ra-sync-bridge.yml`). INFERRED: each payload commit also triggers a production deploy. |

**INFERRED consequence:** production is the integration test environment. The project's own records show it: the Ticketmaster write outage (`BUG-007`), the gaming enum (`BUG-008`), wrong search facts (`BUG-010`), and the 1,000-row cap (`BUG-005`) were all discovered in production, in some cases weeks later.

### 11.2 Explicit environment recommendation

**1. Should 313.events have separate development, staging/QA and production environments?**
Yes. A lean three-tier setup is justified now. The failure classes above (schema drift, write-shape rejections, enrichment correctness, cap truncation) are exactly what a staging database and CI catch, and they cost real data and manual cleanup each time.

**2. Leanest architecture with meaningful isolation:**

| Tier | Composition | Cost |
|---|---|---|
| **Local** | Supabase CLI local stack (Docker) built from migrations + a fixture seed. Tests run against the fake *and* (new) a real local Postgres for schema/RLS tests. | Free |
| **Staging** | A **second Supabase project** (free tier is enough at current volume). **Vercel Preview environment variables** point every preview deployment at it. No second Vercel project. | ~$0 |
| **Production** | Unchanged platform; deploys only from merged PRs. | — |

Required enablers:
- **(a)** replace hard-coded Supabase constants in 11 files with one environment-served config (e.g. a `/config.js` route that reads env);
- **(b)** make missing env vars fail loudly instead of falling back to production;
- **(c)** move the RA inbox off `main` (a dedicated branch or `repository_dispatch`) so `main` can be protected.

Supabase Branching is an alternative if the plan includes it; it is not required.

**3. What data staging should contain:**
- schema built only from migrations;
- reference data (venues, aliases, categories, neighborhoods, feed sources with polling flags) synced weekly from production;
- a snapshot of recent and upcoming events with PII removed (`submitter_email`, `submitter_org_name` nulled);
- a **golden adversarial fixture set**: overnight, multi-day, all-day ICS, Ontario address, address-shaped city, CSS-in-name, "Eastern Market Shed 3", closure notice, government meeting, placeholder venue/time, duplicate across sources, cancelled event;
- separate low-budget API keys (Tavily, Ticketmaster); Facebook posting disabled; Resend in test mode.

**4. How scheduled ingestion should be tested before production:**
1. **CI:** connector tests against recorded payload fixtures. Start retaining raw payloads (prior audit A7) so production failures become fixtures.
2. **Staging shadow run:** a GitHub Actions `workflow_dispatch`/nightly job invokes connector handlers (the existing `test/fixtures/connector-harness.js` pattern) against **live sources**, writing to **staging**. It emits a diff report: rows new / changed / nulled per field, contract rejections, `held` counts.
3. **Production canary:** the first production run of a new or changed connector uses a DB-stored per-source `dry_run` flag, producing the same diff without writing. Promote by flipping the flag, not by editing `vercel.json`.

**5. How migrations should travel:**
1. Adopt `supabase/migrations/<timestamp>_<name>.sql` (Supabase CLI).
2. Re-baseline once from a production schema dump to absorb drift (missing `migration_010`, the Facebook columns, the unapplied 036/037/045).
3. PR → CI applies all migrations to an ephemeral Postgres and runs schema/RLS tests → merge → auto-apply to staging → **manual-approval** GitHub Environment job applies to production *before* code that depends on it deploys.
4. Rules:
   - expand/contract only (backward-compatible with the running code);
   - enum additions in their own migration;
   - data corrections as migrations or admin actions, never pasted SQL;
   - destructive steps preceded by an archive copy of affected rows.

**6. What constitutes a release gate:**
1. CI green: all tests, migrations apply, schema/RLS tests, and lint rules for known foot-guns:
   - no `if (CRON_SECRET)`;
   - no `fetch(` without a timeout in connectors;
   - every `vercel.json` cron has a healthcheck entry and a run-log slug;
   - no `toISOString().slice(0,10)` for "today".
2. Preview deployment smoke test against staging: Playwright, 5 pages, row counts > 0, no console errors.
3. For ingestion/enrichment changes: staging shadow-run diff attached to the PR and approved.
4. Migration already applied to staging.
5. Post-deploy: healthcheck and data-quality assertions run automatically, alerting on regression.

**7. What rollback capability is appropriate:**
- **Code:** Vercel Instant Rollback (promote the previous production deployment). Document it and rehearse once.
- **Behavior:** kill switches as DB flags per source and per enrichment step (instant, no deploy).
- **Data:** an `events_history` trigger table (old row + changed columns + `run_id`/actor) so a bad run can be reverted by `run_id`. This is the single most valuable rollback primitive for this product.
- **Database:** confirm the Supabase plan's backup/PITR coverage and run one restore drill to a scratch project.
- **Schema:** forward-fix only, with pre-migration archive copies.
- **Release tagging:** date-based tags on production promotions (e.g. `release-2026.10.06-1`) created by the deploy workflow. **Semantic versioning is unnecessary** for a website without API consumers.

---

## 12. Testing assessment

### 12.1 Inventory (OBSERVED; suite run locally on 2026-10-05: 103 of 104 files pass)

| Kind | Present | Evidence / notes |
|---|---|---|
| Unit tests | **Extensive** | `discovery`, `non-event-filter`, `venue-lookup*`, `ics-location`, `localist-rows`, `status-lookup`, `event-upsert` (250 generated batches). |
| Integration (handler + fake DB) | **Yes, many connectors** | `test/fixtures/mock-postgrest.js` reproduces production write rules: PGRST102, 21000, 23502, 22P02, the 1,000-row cap. |
| Connector contract tests | Partial | `wp07-connector-coverage.test.js` (structural: all 25 use the helper), `wp017-*`. No shared row-contract tests, because no contract exists. |
| Parser fixtures | Partial | Inline fixtures for some scrapers; `localist-api.js` fixture. No recorded-payload corpus; raw payloads are not retained. |
| Database tests (real Postgres) | **None** | The schema is hand-mirrored in the fake (`mock-postgrest.js:55-73`), and that mirror already differs from the migrations (§14). |
| Migration tests | **None** | — |
| Regression tests | **Many, incident-driven** | e.g. `cron-ticketmaster-description-safeguard`, `paged-loading-pages`, `admin-events-incomplete-paging`. |
| Frontend tests | Function-level | Functions regex-extracted from HTML and run in `vm`; `fake-dom.js` for two homepage tests. |
| Browser / e2e tests | **None** | No Playwright/Puppeteer/jsdom. |
| Production smoke tests | Partial | `cron-healthcheck` checks pages, auth and freshness, not data. |
| Data-quality assertions | **None persisted** | Audits were ad hoc anon-key queries (`NEEDS_FOLLOWUP_ROOT_CAUSE.md:12-19`). |
| Adversarial / malformed input | Targeted, not systematic | Excellent adversarial titles for the closure rule; placeholder/city tests; submit validation. No fuzzing of parsers. |
| Test runner / CI | **None** | Only workflow is `ra-sync-bridge.yml`. Nothing runs tests on push. |
| Clock independence | **Broken in one place** | `test/cron-bigtimebingo-runlog.test.js:161` fails because the handler uses the real date (`api/cron-bigtimebingo.js:85`) and the test hard-codes 2026-09-28. Its later sections, including write-path checks, no longer execute. `BACKLOG.md` (BUG-007 "Known limits") notes it was already failing on `main` and it was accepted. Its venue-resolution assertions pass before the failure point, so it is not a matching failure. |
| Identity / name-matching precision | **Partial, exact-only** | 25 matching-related files pass locally (262 PASS lines): `venue-lookup*`, `venue-address-repair`, `venue-raw-reparse-repair`, `sh1-repair-existing-events`, `sh-n-venue-display`, `admin-auto-repair-venue`, `cron-feeds-location-per-event`, `cron-feeds-city-recovery`, `cron-feeds-venue-repair`, `cron-feeds-no-fixed-venue`, `ics-location`, `localist-rows`, `duplicate-consolidation`, `event-source-identities`, `ra-sync`, `press-coverage-linking`, `external-discovery*`, `generic-metadata-enrichment`, `source-authority`, `link-health`, `visitdetroit-link-recovery`. They cover case and whitespace positives; typo, extra-word and leading-article *negatives* (`test/venue-lookup.test.js:108-118`); the city veto; placeholders; ambiguity in the detail maps; two venues at one address. **Not covered:** `resolveVenueId` with duplicates, placeholders or city; address-only identity with one row on file; chains; renames; sequential occupants; abbreviations; title-embedded places; Theater/Theatre or St./Saint for venues; editorial venue-and-date links (0 files); RA same-title-at-another-venue. There is no cross-module gold set and no precision gate. |

### 12.2 Failures that can reach production today with nothing to stop them

1. Any failing test (no CI; one test already failing and tolerated).
2. Schema/migration drift: tests validate against a hand-maintained fake schema, not migrations (`BUG-008` class).
3. Semantically invalid values: address-as-city, CSS/HTML in names, placeholders, `end < start`, bad URLs. There is no contract, so there is nothing to test.
4. Overwrite regressions: a connector newly sending `null` for a field (DEBT-011 class). Only Ticketmaster descriptions are protected by a test.
5. Live-source layout or schema changes: no recorded payloads, no drift detectors; "parsed 0" logs `success`.
6. Cross-page semantic drift: Calendar/Map are not on `discovery.js`, and a test locks in Map's start-date floor (`test/paged-loading-pages.test.js:190`).
7. Timezone/DST/clock behaviors: UTC "today" in 13 connectors; real-clock tests.
8. Wrong-but-plausible enrichment facts: unit tests passed, production failed (`BUG-010`).
9. RLS/column exposure: no security tests.
10. Rendering regressions: no browser tests.
11. A new connector missing from healthcheck/run-log: no enforcement test (prior audit K4, still open).
12. A false identity link: wrong venue, wrong merge, wrong article link, or a suppressed event. There is no cross-module gold set and no precision gate, and several existing assertions encode single-signal behavior (e.g. a blank-city name-only link, `test/venue-lookup-placeholder-and-city.test.js:136-139`).

### 12.3 Identity regression plan (RECOMMENDED; SZ-14)

1. **Golden identity fixtures** (`test/fixtures/entity-gold.json`). Each record holds an input, a canonical set, the expected decision (`link:<id> | held | propose_alias | escalate | distinct`) and the evidence families that must be recorded. Seed from **repo evidence only**, never from synthetic probe values.
   - **Positives:**
     - curly/straight apostrophes; en dash/hyphen (`seed.sql:16`); trailing period; NBSP; accents; & / and;
     - Majestic Theater/Theatre; Magic Stick / The Magic Stick; Paris Bar (Hamtramck) / Paris Bar; Old Miami / The Old Miami;
     - "Fox Theatre - Detroit"; "608 Washington Ave" vs "Ave."; "Detroit, MI 48207" as a city;
     - Mt./Mount Clemens; St./Saint Clair Shores (city);
     - the Eastern Market shapes from §6.3 with their expected (mostly *held/propose*) outcomes.
   - **Negatives and adversarial cases:**
     - The Loft (Detroit vs Ferndale); Black Box (Hamtramck vs Ann Arbor); "Library"/"Community Center" with no city;
     - an unrelated name at a known address; Planet Ant Theatre vs Black Box at 2357 Caniff; the 4120/4140 Woodward rooms; **Big Time Bingo at "4120 Woodward" (must not link to Magic Stick)**; Saint Andrew's Hall vs The Shelter;
     - a rename at the same address; sequential occupants with validity windows;
     - Eastern Market Partnership (organization) vs the Eastern Market venue; Movement vs Hart Plaza; "ProsperUs Detroit" (a city inside an organization name);
     - DIA vs Indian Village; DSO vs DSA; DPL vs DPL–Campbell Branch; Majestic Theatre vs Majestic Cafe;
     - Trinosophez (typo with no corroborator: held, not link); Plymouth vs Plymouth Township; "12138 St Aubin" (Saint inside an address);
     - placeholder spellings; "Techno Tuesday" at different venues; a rejected-status match target; "rave on" vs "brave one"; a recap article;
     - malformed and wrong-digit house numbers; a transposed ZIP; "Detriot";
     - every `BUG-010` production failure.
2. **One harness runs every identity path** against the same gold set, so cross-module divergence fails a test: `resolveVenueId`, `resolveVenueFromCandidate`, the repair tiers, venue upsert (proposal mode), dedupe `samePlace`/classification, RA `findConservativeDuplicate`, the editorial/press matchers, the map pin key and the placeholder classifier.
3. **Precision gate in CI** (amends SZ-03):
   - **zero** false links on the negative/adversarial set (hard fail);
   - recall on positives reported, and allowed to decrease only with a recorded justification;
   - both the decision *and* its recorded evidence families asserted;
   - a property test: candidates with only a name family, or only an address family, never auto-link.
4. **Cost assertions:** a verified alias resolves with 0 external calls; a negative `resolution_attempts` row prevents a repeat call within its TTL; dry-run makes 0 searches; the persisted budget is shared across all entry points.
5. **Shadow mode** for every normalizer or alias change: run old and new resolvers side by side on staging data and review every gained and lost link before enforcing.
6. **Production-sampled gold:** once staging holds a production snapshot (SZ-15), add 50–100 human-labelled real `venue_name_raw` values that failed to link, refreshed quarterly.

**Deliberate test rewrites, not silent flips:**
- `venue-lookup.test.js:108-118`: split into harmless (normalizer v1) cases and must-stay-distinct-until-alias cases;
- `venue-lookup-placeholder-and-city.test.js:136-139` (blank-city name link) and `:168-187` ("Shed 5" searched externally);
- `cron-feeds-location-per-event.test.js:158-170` ("Venue TBA" only after the content step has run);
- `duplicate-consolidation.test.js:16` (title accent folding; venue accent folding has no test and needs one).

---

## 13. Observability assessment

### 13.1 What exists (OBSERVED)

- **`source_runs`:** a per-run row with outcome, HTTP status, fetched/parsed/written counts, redacted error sample and duration (`api/_lib/run-log.js:87-171`). A good foundation.
- **`healthchecks`:** a daily JSON blob (pages, cron auth probe, freshness), shown as an admin banner.
- **Admin RA panel** reads `source_runs`; **Admin Needs Follow-up** shows a badge.

### 13.2 Gaps

- **Run logs don't cover everything.** 11 of 25 connectors write no `source_runs` row: DMOD, Detroit Training, Feeds, Metro Times, MotorCity Wine, Old Miami, Planet Ant, Playground, Popps, Ticketmaster, VisitDetroit. Admin Auto-Repair, `cron-editorial` and `admin-editorial` write none either.
- **The funnel is incomplete.** `fetched → parsed → written` exists where logged. `→ contract-passed → usable (complete) → public → still public` does not. "Parsed 0" logs `success` (e.g. `cron-lagerhouse.js:199-204`).
- **Health lists are hard-coded and stale.** `CRON_ENDPOINTS` omits 7 crons (`cron-healthcheck.js:89-105`) and `SOURCE_FRESHNESS_TARGETS` omits 7 sources (`:194-229`). Sources without a run log fall back to "advisory only".
- **Failures look healthy.** Ticketmaster wrote nothing for a month and was reported `ok: true` (`DEBT-010`). Upstream fetch failures return HTTP 200.
- **No alerting.** Resend is only used for submissions.
- **No data-quality metrics.** Nothing counts placeholder values, address-shaped cities, markup in names, `end < start`, linked-to-bad-venue, or public events with no venue or time.
- **No data-drift detection.** No volume-drop, field-null-rate or category-distribution detectors.
- **No AI/research outcome metrics.** No record of attempts, acceptances or rejections; writes at unlogged hours.

### 13.3 The Admin queue failure, evaluated explicitly

**OBSERVED mechanics:**
- membership is computed **in the browser** by `getMissingFields()` (`admin.html:483-535`), which tests **blankness only**;
- `classifyMissingFields()` removes source-wide limitations (Trinosophes, DHS, Outer Limits; `:619-623`) and exact "Venue TBA" (`:637-639`);
- dismissed events are removed entirely (`:768`), with no dismissed count shown;
- the badge is `flagged.length` (`:780`);
- server membership is `start_date >= UTC today` (`admin-events.js:258`).

**The count can fall while defects remain public (OBSERVED rules; INFERRED consequences):**

| Cause | Effect on the count | Underlying truth |
|---|---|---|
| Template description written (`description_source='generated'`) | Gap resolved | No real description. `NEEDS_FOLLOWUP_ROOT_CAUSE.md` shows DESCRIPTION at 0% resolved by real data. |
| Wrong `authoritative` description or aggregator `event_url` | Gap resolved | Wrong fact public. |
| `"Evening"` placeholder time | Gap resolved | Unknown time. |
| City without address, including a defaulted "Detroit" | Gap resolved | Location unknown or wrong. |
| Dismissal | Whole event hidden permanently; also excluded from self-healing (`generic-metadata-enrichment.js:156`) | New gaps (e.g. a link dies later) are never seen. |
| Source-limitation list, exact "Venue TBA" | Excluded (count note shown) | Unresolved by design. |
| UTC date window, `start_date` only | Tonight's events drop after ~8 PM; running multi-day events never counted | Still public. |
| Connector blanks a field at 13:00 that enrichment filled at 12:30 | Count oscillates by time of day | Same defects. |

**Verdict:** the queue measures *what the UI flags*, not *what is wrong*. Operational metrics must come from persisted system truth.

**RECOMMENDED:** an `event_issues` table:

| Column | Notes |
|---|---|
| `event_id`, `issue_code`, `field` | — |
| `severity` | — |
| `detected_by` | rule / run |
| `detected_at`, `resolved_at` | — |
| `resolution_method` | `source`, `deterministic`, `research`, `human`, `expired`, `suppressed_by_rule` |
| `suppressed_reason`, `suppressed_until` | Per issue, not per event |

- Written by the contract (§5.5), resolvers (§6) and nightly data-quality assertions.
- The Admin queue becomes a server-side query over open, unsuppressed, escalated issues.
- **Dashboards report open issues on public events by code and source**, independent of the UI, alongside suppressed counts.

---

## 14. Database and scalability assessment

### 14.1 Schema and migrations (OBSERVED)

- `events` has 45 columns. Two (`facebook_post_id`, `facebook_posted_at`) exist only via DDL inside an archived data patch (`supabase/archive/update_2026-09-14_facebook-auto-post.sql:19-25`).
- **`schema.sql` is stale** (22 columns, a 10-value enum). **The repo cannot rebuild production:**
  - `migration_010_neighborhood_review_2026-08-27.sql` is recorded in the ledger (`migration_023:63`) but exists in no commit;
  - there are two `042` files;
  - 036/037/045 were marked not applied;
  - the test fixture's production column list (42 columns, `test/fixtures/mock-postgrest.js:55-73`) lacks `source_id` and the Facebook columns. INFERRED: production and repo disagree.
- **Ledger:** `schema_migrations` stores filenames only; 043–045 omit their ledger insert.
- **Data patches:**
  - 85 `update_*` files plus 7 archived seeds, against 45 migrations;
  - 1,049 `where id = '<uuid>'` targets;
  - some unguarded `on conflict … do update set …` that revert moderator edits on re-run (e.g. RA manual pulls);
  - one non-idempotent note append (`update_2026-09-20_numa-crew-ra-merge.sql:23-24`).
- **Hard deletes:** in `migration_002:182`, `migration_015:42-43` and 7 archived patches. No transactions, archive tables or row-count assertions. `editorial_article_events` cascades on event delete (`migration_021:27`).
- **Integrity:** FKs are present and appropriate (`SET NULL`/cascade). `status` default `approved`. `rejected` overloaded. No `updated_at` on venues.
- **Identity schema:** there is no alias, external-id, parent, validity-window or match-decision structure for venues. `venues.zip_code` exists (`migration_005:40`) but the resolver never selects it (`venue-lookup.js:153`). The venue registry cannot be rebuilt from the repo: about 83 production venues on 2026-09-13 against about 42 committed inserts (`archive/update_2026-09-13_backfill_venue_id_matched_venues.sql:6-10`), and two rename files are absent. The repo also contradicts itself on some venue cities (`seed.sql:38,40` vs `migration_002:169-171`). → SZ-15, P1-13 (§10.7).

### 14.2 Query patterns and indexes

- **Public "current + upcoming" filter** `or=(start_date.gte.X,end_date.gte.Y)` (`discovery.js:1016`): **no `end_date` index**, and the OR defeats `(status, start_date)` (`migration_024:36`). RECOMMENDED: an expression index on `coalesce(end_date, start_date)` with `status`, and rewrite the filter as `coalesce(end_date,start_date) >= today`.
- **Paging:** offset paging over the 1,000-row server cap. At 50k rows, deep offsets get slower; prefer keyset.
- **Redundant indexes:** `events_status_idx`, `events_start_date_idx` (covered by the composite).
- **Unpaged reads silently capped at 1,000:**
  - `api/sitemap.js:81` — INFERRED: about half of today's ~2,200 current events are missing from the sitemap;
  - `radar.html:324`, `neighborhoods.html:247`, `index.html:7618`;
  - venue coordinates `limit=1000`;
  - `venue-lookup.js:55`;
  - enrichment candidates `limit=1000` (`generic-metadata-enrichment.js:161`, and the Dossin/Redford/Outer Limits/re-parse scripts);
  - VisitDetroit cross-source check (`:357`);
  - `cron-editorial.js:455,544`.

### 14.3 Growth behavior

| Load (current + upcoming rows) | Public pages | Ingestion / enrichment | Admin |
|---|---|---|---|
| **~2.2k (today)** | ~0.6–0.9 MB gzip per homepage visit; Calendar loads all approved history (~3k rows) | OK | OK |
| **10k** | ~3–4 MB gzip; 10 parallel page requests + counts per visit; mobile degraded. Sitemap/radar/neighborhoods silently partial. | Enrichment scripts see only the first 1,000 candidates. `cron-feeds` sequential within 60 s; one slow feed or a status-lookup failure aborts the rest (`cron-feeds.js:869,903`). Feeds re-upsert their whole ICS history nightly. | Needs Follow-up loads all upcoming pending+approved rows into the browser: slow. |
| **50k** | Unusable on mobile (~55–80 MB raw); deep offsets slow | `cron-enrichment` (9 sequential steps, one-row PATCHes, no `maxDuration`) times out. Venue map silently truncates past 1,000 venues. | Unusable. |
| **100k+** | `fetchAllRows` stops at 50,000 (`paged-fetch.js:55`), silently dropping the later half | Requires a job queue and set-based SQL repairs | Requires server-side paging of issues. |

**INFERRED:** the database itself (Postgres) is not the bottleneck at 100k rows. The bottlenecks are client-side full loads, unpaged/serial scripts, and one-function-per-run budgets.

**RECOMMENDED** (P1/P2):
- a cached server-side query layer (Vercel function or Supabase RPC + CDN `s-maxage`) returning window-limited, field-limited payloads;
- materialized counts;
- set-based SQL for repairs;
- keyset paging;
- per-source job fan-out (pg_cron or a small queue table) when the source count passes about 50.

---

## 15. Security and reliability assessment

Proportionate to a public events product.

| Area | OBSERVED | Risk | RECOMMENDED |
|---|---|---|---|
| **Column exposure via anon key** | The only `events` SELECT policy is row-level (`status = 'approved'`, `schema.sql:130-132`); no column revokes in any migration; Calendar, Map and the event page read the **base table** with the public key (`calendar.html:2964`, `map.html:1921`, `event-template.html:912`). | **INFERRED (high confidence; depends on Supabase's default grants, which the repo can't show):** anyone can read `submitter_email`, `submitter_org_name`, `internal_note`, `followup_dismissed_note` for approved rows via `/rest/v1/events?select=submitter_email`. That is **PII exposure** for approved user submissions. | **Verify with one anon request today.** Then revoke anon SELECT on `events` (or grant column-level SELECT) and move all pages to views. |
| **Anon INSERT** | `grant insert on events to anon` (`migration_009a:18`) + insert policy; the app inserts with the service role (`api/submit.js:288`). | Unused path that bypasses server validation; can pre-claim `external_id` keys (INFERRED). | Revoke. Same review for `feed_sources` anon insert. |
| **Cron auth** | 29 of 30 crons skip auth when `CRON_SECRET` is unset (`if (CRON_SECRET) {…}`); only `cron-ra.js:73-76` fails closed. | One env misconfiguration opens every crawler, including large third-party crawls. | One shared `requireCron(req)` helper that fails closed. |
| **Admin** | Shared secret header, timing-safe, fails closed. No rate limit, no actor identity, no security headers. | Brute force is unlikely but possible; no audit trail of who changed what. | Rate limit; log admin actions with actor; add basic security headers. Real auth (Supabase Auth) only when a second operator exists. |
| **Submission and upload** | Honeypot + timing; no rate limit (`api/submit.js:176`); unauthenticated 4 MB uploads to a public bucket (`api/upload-image.js:57`). | Spam/storage abuse. | Rate limiting (Vercel KV or Supabase table), upload tied to a submission token. |
| **Secrets** | Env vars; fine-grained PAT; anon key public by design. Production URL/key hard-coded as fallbacks. | Environment bleed (§11). | Fail loudly on missing env. |
| **Destructive operations** | Repair scripts write by default (`dryRun=false`); retire/merge are soft and capped (good); hand-run deletes. | Irreversible manual errors. | `events_history`; deletes only via reviewed migrations with archive copies. |
| **Backup / recovery** | Nothing in the repo. | Unknown. | Confirm plan coverage; run a restore drill. |
| **Fetch reliability** | Timeouts only in Localist and run-log (`AbortSignal`). Ticketmaster keeps partial results on a failed page (`cron-ticketmaster.js:190`). | Hung source consumes the function; partial data treated as complete. | Shared `fetchWithPolicy` (timeout, retry, UA, size cap). |
| **Source-terms compliance** | `DEC-010`: RA is manual-only on ToS grounds. `scripts/ra-sync.js:16-22` documents scheduled browser acquisition designed around DataDome. Spoofed Chrome UAs in 3 files, one against a WAF-blocked site. `robots.txt` is not checked at runtime. | Legal and reputational risk that contradicts the project's own published principles. | Owner decision on `DISCOVERY-001`. Honest UA everywhere. Runtime policy gate. |
| **Dependencies** | None; Actions pinned to major tags. | Low. | Optionally pin Actions by SHA. |
| **XSS** | `escapeHtml` (9 copies) and `safeUrl` (6 copies) at render; stored data contains raw HTML/CSS strings. | Not exhaustively audited here. | Centralize escaping helpers; add a test that renders hostile strings. |

---

## 16. Code-quality assessment

**Strengths (OBSERVED):**
- Clear names; pure, testable shared modules.
- Connectors are handler functions with injectable `fetch`, which makes them testable.
- Honest, specific comments explaining *why*.
- A test corpus as large as the production server code.
- A decision log that captures rejected alternatives.

**Problems (OBSERVED):**

| Problem | Evidence |
|---|---|
| **Duplication (server)** | `timingSafeStringEqual` ×37; `decodeEntities` ×22; ~10 `stripHtml` variants; ~8 time formatters; `mapWithConcurrency`/`fetchWithRetry` ×4. |
| **Duplication (frontend)** | 71 function names in 2+ pages, 41 in 3+; category list ×7 plus the DB table; Supabase config ×11; `parseTimeRange` ×5; `resolveVenueDisplay` ×4 plus a Node twin, with "keep every copy identical" comments (`calendar.html:2830-2835`). |
| **Large files** | `index.html` 7,780 lines (~294 KB inline JS); `calendar.html` 2,985; `scripts/press-coverage-linking.js` 1,225; `api/cron-feeds.js` 918; `scripts/ra-sync.js` 903. Individual functions are reasonably sized; the weight is global state and template strings. |
| **Comment volume** | 21–33% of frontend JS bytes are comments, much of it dated incident narrative. Valuable history, poor at telling you current behavior. Several safety comments are now **false** (`external-discovery.js:18-28`, `admin.html:606`, `cron-healthcheck.js:61-75`, `migration_038`'s "authoritative not written by any script"). |
| **Source-specific patches that should be general** | Per-connector field preservation (§5.4); per-source repair scripts; `SOURCE_FIELD_LIMITATIONS` keyed by source name in `admin.html`; ~6 per-feed regex grammars in `ics-location.js`. |
| **Dead / dormant code** | `sources` table; `events.source_id`, `category_id`, `is_recurring`; Eventbrite cron (never scheduled); four held crons still deployed; `rollingWindowDates` in `index.html`; `FALLBACK_EVENTS`; static JSON-LD. |
| **Documentation drift** | README describes a 4-source Detroit-only month calendar. `BUG-007` status line contradicts its body. `PRODUCT.md` "23 scheduled cron jobs" vs 24 in `vercel.json` today. |
| **Onboarding** | A new engineer needs to read ~5,000 lines of planning documents plus long in-code narratives to learn the current rules, and the rules are distributed (four placeholder definitions, four "today"s). There is no single "how data flows and what the invariants are" page. |

---

## 17. Technical-debt register

Severity: **S1** = live data loss/corruption or exposure · **S2** = blocks scaling or causes recurring manual work · **S3** = quality/ergonomics.

| ID | Debt | Sev | Evidence | Addressed by |
|---|---|---|---|---|
| TD-01 | No canonical row contract or sanitizer | S1 | §5 | SZ-05 |
| TD-02 | Last-writer-wins overwrites, explicit-`null` erasure | S1 | §5.4; DEBT-011 | SZ-06 |
| TD-03 | Probable PII/internal column exposure via anon key; unused anon INSERT | S1 | §15 | SZ-01 |
| TD-04 | Wrong search-derived facts and 5 bad venues still canonical | S1 | BUG-010 | SZ-02 |
| TD-05 | No staging; production config hard-coded with production fallbacks | S1 | §11 | SZ-04 |
| TD-06 | No CI; failing test tolerated | S2 | §12 | SZ-03 |
| TD-07 | Repo cannot rebuild schema; migrations drift | S2 | §14.1 | SZ-04 |
| TD-08 | Run logs missing in 11 connectors; health lists stale; no alerting | S1 | §13 | SZ-09 |
| TD-09 | Admin queue measures blankness client-side; dismissal hides events | S2 | §13.3 | SZ-08, P1-05 |
| TD-10 | Temporal model (date + text; overloaded `end_date`; UTC "today") | S2 | §9 | SZ-11, P1-01 |
| TD-11 | Eligibility not a domain concept; no UNCERTAIN state | S2 | §8 | SZ-08, P1-02 |
| TD-12 | Exact-match-only venue resolution; "Venue TBA" as data | S2 | §6, §10 | SZ-05, SZ-14, P1-03, P1-13–P1-15 |
| TD-13 | No provenance/evidence model | S2 | §7 | P1-03 |
| TD-14 | No write history / data rollback | S1 | §11.2(7) | SZ-07 |
| TD-15 | Cron auth fails open | S2 | §15 | SZ-01 |
| TD-16 | Whole-inventory client loads; unpaged capped queries | S2 | §14 | SZ-10, P1-06 |
| TD-17 | Calendar/Map not on `discovery.js`; four "today"s | S2 | §9.1 | SZ-10, P1-06 |
| TD-18 | Title-derived external IDs (5 connectors) | S2 | §10 | P1-08 |
| TD-19 | No cancellation/removal lifecycle | S2 | §9.1 | P1-08 |
| TD-20 | ICS all-day `DTEND` off-by-one; timed multi-day end dropped | S1 | §9.1 | SZ-10 |
| TD-21 | Localist `ticket_url` erased (select omission) | S1 | §4 #6 | SZ-10 |
| TD-22 | `resolveVenueId` no placeholder guard; venue map fail-soft | S1 | §10 | SZ-06 |
| TD-23 | `status-lookup` IDs unencoded; one feed failure aborts all feeds | S2 | §4 #5; `cron-feeds.js:869,903` | SZ-10 |
| TD-24 | `internal_note` replaced wholesale by 2 connectors; enrichment stale-note bug (`:384`) | S2 | §5.2; §7.2 | SZ-06 |
| TD-25 | Static fallback events and stale JSON-LD | S3 | §4 #30 | SZ-10 |
| TD-26 | 85 hand-written data patches as an operating mode | S2 | §14.1 | SZ-04 |
| TD-27 | Duplicated helpers (server + frontend) | S3 | §16 | P2-04 |
| TD-28 | Per-source repair scripts | S3 | §4 #16 | P1-07 |
| TD-29 | Unused `sources`, `source_id`, `category_id`, `is_recurring` | S3 | §4 #31 | P2-01 |
| TD-30 | RA acquisition policy contradiction; git bus on `main`; spoofed UAs | S2 | §15 | SZ-12, P1-09 |
| TD-31 | Missing `end_date` index; offset paging | S3 | §14.2 | P2-05 |
| TD-32 | Doc/status drift; stale safety comments | S3 | §16 | ongoing |
| TD-33 | Single-signal identity decisions: address-only links that rename, blank-city name-only links, RA title-only dedupe, editorial substring links, VisitDetroit title+date suppression, `samePlace` on a shared `venue_id` | S1 | §10.3–10.5 | SZ-13, P1-16 |
| TD-34 | 13+ divergent name normalizers; 4+ placeholder definitions | S2 | §10.2, §10.5 | SZ-14 |
| TD-35 | No alias, external-id or match-decision store; Admin cannot set `venue_id`; the system cannot learn | S2 | §10.6 | P1-13 |
| TD-36 | Venue reference data not reproducible from the repo; duplicate and placeholder canonical rows | S2 | §14.1 | SZ-15 |
| TD-37 | Research budget per invocation; no negative cache; research before internal steps; research creates canonical rows from variants | S2 | §10.8 | P1-17, P1-04 |

---

## 18. Sprint Zero — Production Foundation (P0)

**Goal:** make defects stop at the write path, make failures loud, and stop using production as the test environment. All P0 items should exist before significant audience or source expansion.

**Shape:** roughly 4–6 weeks for one owner working with Claude sessions. The identity packages SZ-13–SZ-15 add about a week. Items are ordered by dependency, except SZ-13–SZ-15, which are numbered after the original twelve; §24 gives the actual sequence.

### SZ-01 — Close exposure and fail-open paths
- **Priority:** P0
- **Problem:** probable anon read of `submitter_email`/`internal_note`; unused anon INSERT; 29 crons skip auth when `CRON_SECRET` is unset.
- **Risk if ignored:** PII exposure; a validation-bypassing insert path; open crawler endpoints.
- **Scope:**
  1. One anon request to confirm exposure.
  2. Migration revoking anon SELECT on `events` (or a column-level grant), plus the pages that read the base table moved to `events_public` (extend the view with `lat`/`lng` and the needed columns).
  3. Revoke anon INSERT on `events` (and review `feed_sources`).
  4. A shared fail-closed `requireCron()` used by every cron.
  5. `events.status` default → `pending_review`.
- **Acceptance criteria:**
  - an anon request for `submitter_email` returns an error or empty;
  - all pages render from views;
  - every cron returns 401/500 with `CRON_SECRET` unset (a test enumerates `api/cron-*.js`);
  - a migration test asserts the grants.
- **Dependencies:** none. The migration can be hand-applied once, then re-captured in SZ-04's baseline.
- **Claude environment/model:** cloud session; standard (Sonnet-class); the owner runs the verification request and applies the migration.
- **Effort:** S

### SZ-02 — Contain the BUG-010 aftermath
- **Priority:** P0
- **Problem:** wrong `authoritative` descriptions and 5 aggregator-website venues remain canonical; deterministic steps build on them; article-derived descriptions publish page chrome as `authoritative`.
- **Risk if ignored:** wrong facts stay public and propagate.
- **Scope:**
  1. Export the affected rows.
  2. Null/replace the bad descriptions (mark them for regeneration).
  3. Fix or merge the 5 venues, removing aggregator websites.
  4. Gate the article-derived description path the same way, or label it `discovery_only` and keep it non-public.
  5. Fix `generic-metadata-enrichment.js:384`.
  6. Make `description_source` follow the computed tier.
- **Acceptance criteria:**
  - no venue `website` on an aggregator domain (assertion query);
  - no `authoritative` description sourced from the search tier;
  - article path gated or test-proven to sanitize chrome.
- **Dependencies:** none.
- **Claude environment/model:** cloud; standard (Sonnet-class); owner approves the row list.
- **Effort:** S

### SZ-03 — CI gate on every change
- **Priority:** P0
- **Problem:** tests are optional; a failing test was tolerated; changes go straight to `main`.
- **Risk if ignored:** regressions ship; test value erodes.
- **Scope:**
  1. A `test/run-all.js` (or `node --test`) runner.
  2. A GitHub Actions workflow on PR and push.
  3. Fix the clock-dependent test by injecting a clock.
  4. Lint checks listed in §11.2(6).
  5. Branch protection on `main` requiring PR + green CI.
  6. Move the RA inbox off `main` first so protection doesn't break it.
- **Acceptance criteria:**
  - all 104 test files pass in CI;
  - a deliberately failing test blocks merge;
  - the lint rules catch a planted `if (CRON_SECRET)`.
- **Dependencies:** RA transport change (small) before branch protection.
- **Claude environment/model:** cloud; standard (Sonnet-class).
- **Effort:** S

### SZ-04 — Staging environment and migration pipeline
- **Priority:** P0
- **Problem:** no staging; the repo cannot rebuild production; migrations are pasted by hand and drift (BUG-008).
- **Risk if ignored:** every schema or ingestion change is tested on the public site.
- **Scope:**
  1. Production schema dump becomes a new baseline in `supabase/migrations/`; reconcile the missing/unapplied files.
  2. A second Supabase project for staging.
  3. Vercel Preview env vars point at staging.
  4. Replace hard-coded config in 11 files with an environment-served config; missing env fails loudly.
  5. CI applies migrations to an ephemeral Postgres.
  6. Workflow: merge → staging apply; manual-approval → production apply.
  7. Staging seed: reference data + PII-stripped events + the golden adversarial fixtures.
  8. Data corrections only as migrations or admin actions from now on.
- **Acceptance criteria:**
  - a fresh staging database builds from the repo alone and matches production's schema diff = 0;
  - a preview deployment reads staging (verified by a marker row);
  - a migration PR cannot reach production without approval.
- **Dependencies:** SZ-03.
- **Claude environment/model:** local Claude Code with Docker + Supabase CLI and owner-held credentials; deep-reasoning (Opus-class) for drift reconciliation, standard for plumbing.
- **Effort:** M

### SZ-05 — Canonical row contract (sanitize, normalize, validate), shadow → enforce
- **Priority:** P0
- **Problem:** no shared validation; placeholders, markup, address-as-city and impossible dates become canonical.
- **Risk if ignored:** every new source adds defects at a constant rate per row; clerical cleanup scales with volume.
- **Scope:**
  - `api/_lib/event-contract.js` invoked inside `upsertEventRows` (and in the RA/article/submit paths), per §5.5;
  - placeholder values become `null` + issue codes (`Venue TBA`, `Evening`, `Untitled event`);
  - closed-list city validation for all connectors;
  - week 1 in report-only mode logging would-reject/would-hold counts per source to `source_runs`; then enforce;
  - DB CHECKs added `NOT VALID`, validated after cleanup.
- **Acceptance criteria:**
  - every connector's rows pass through the contract (structural test over all 25 plus RA/article/submit);
  - the golden fixtures produce the expected accept/hold/reject outcomes;
  - `<style>` bodies never survive;
  - shadow-week report reviewed before enforcement.
- **Dependencies:** SZ-03; SZ-08 for the `held` state and issues (can land together).
- **Claude environment/model:** cloud; deep-reasoning (Opus-class) to design the rules, standard (Sonnet-class) to wire connectors.
- **Effort:** M–L

### SZ-06 — Field authority policy and locks (DEBT-011)
- **Priority:** P0
- **Problem:** connectors overwrite human and enrichment corrections; explicit `null`s erase; venue map fail-soft wipes links; `internal_note` replaced wholesale.
- **Risk if ignored:** corrections don't stick; recurring manual work; restores don't hold.
- **Scope:**
  1. A per-field policy table in code (source-authoritative / fill-blank-only / human-locked).
  2. `events.locked_fields text[]` set by admin edits.
  3. A shared policy step in the write path that reads stored values via the existing fail-closed lookup.
  4. Never `null` over a value for non-authoritative fields.
  5. Venue map fails closed.
  6. `resolveVenueId` placeholder guard.
  7. `internal_note` written line-wise only.
  8. Remove per-connector one-offs once covered.
- **Acceptance criteria:**
  - regression tests per field in the style of `cron-ticketmaster-description-safeguard.test.js`;
  - a staging shadow run shows 0 nulls written over stored values for fill-blank fields;
  - a locked field is never changed by any connector.
- **Dependencies:** SZ-05 (same module), SZ-07 (to measure).
- **Claude environment/model:** cloud; deep-reasoning (Opus-class) for the policy, standard to implement.
- **Effort:** M

### SZ-07 — Write history (data rollback and churn measurement)
- **Priority:** P0
- **Problem:** no record of what a run changed; rollback is hand-written SQL.
- **Risk if ignored:** a bad run (like BUG-010) can't be precisely reverted or measured.
- **Scope:**
  - an `events_history` trigger capturing old values of changed columns, `run_id` (via a session setting from the write path) or admin actor, and a timestamp;
  - a revert-by-`run_id` script (dry-run default);
  - a retention policy.
- **Acceptance criteria:**
  - every UPDATE/DELETE on `events` produces a history row;
  - reverting a staged bad run restores the prior values exactly in staging.
- **Dependencies:** SZ-04.
- **Claude environment/model:** cloud or local; standard (Sonnet-class).
- **Effort:** S

### SZ-08 — `held` state and persisted issues
- **Priority:** P0
- **Problem:** UNCERTAIN can only mean public (`approved`) or Admin (`pending_review`); queue metrics are UI-derived.
- **Risk if ignored:** either bad rows publish or Admin floods; metrics misrepresent reality.
- **Scope:**
  - add `held` to `event_status` (own migration): not public, owned by automation, retried;
  - `event_issues` table per §13.3;
  - the contract and nightly assertions write issues;
  - Admin badge reads server-side open issues (minimal change; the full queue redesign is P1-05);
  - per-issue suppression with expiry replaces event-level dismissal for new dismissals.
- **Acceptance criteria:**
  - a held row never appears in `events_public`;
  - open-issue counts are queryable by code, source and public/held;
  - dismissing one issue doesn't hide others.
- **Dependencies:** SZ-04.
- **Claude environment/model:** cloud; deep-reasoning (Opus-class) design, standard implementation.
- **Effort:** M

### SZ-09 — Truthful monitoring and alerting
- **Priority:** P0
- **Problem:** 11 connectors unlogged; stale hard-coded health lists; "parsed 0" is success; no alerts.
- **Risk if ignored:** month-long silent outages recur (BUG-007).
- **Scope:**
  1. Every connector and enrichment route logs `source_runs`, with funnel counts including contract outcomes.
  2. The health registry is derived from one source list, with a test that every `vercel.json` cron is covered.
  3. Failure rules: failed/partial, fetched > 0 and written = 0, no run inside the interval, volume drop > X%.
  4. Nightly data-quality assertions (§13.2 list) stored and trended.
  5. Daily digest plus immediate email on failure via the existing Resend.
  6. Per-source `enabled`/`dry_run` flags in the DB, replacing `vercel.json` edits for holds.
- **Acceptance criteria:**
  - killing a connector's write in staging produces an alert within one cycle;
  - the healthcheck covers 100% of scheduled crons (enforced by test);
  - DQ assertion counts are visible in Admin.
- **Dependencies:** SZ-03; SZ-08 for issues.
- **Claude environment/model:** cloud; standard (Sonnet-class).
- **Effort:** M

### SZ-10 — Confirmed-defect sweep
- **Priority:** P0
- **Problem:** confirmed defects not yet in the backlog, plus visible ones from the production audit.
- **Risk if ignored:** known-wrong data continues daily.
- **Scope:**
  - ICS all-day `DTEND` exclusive handling, and timed multi-day end;
  - Localist `ticket_url` added to `STORED_SELECT`;
  - `status-lookup` ID encoding;
  - per-feed isolation, in-batch dedupe and a past-date floor in `cron-feeds`;
  - Map query uses `Discovery.inventoryFilter()` (DQA-001);
  - sitemap/radar/neighborhoods paged;
  - "today" in America/Detroit across connectors and pages;
  - retire `FALLBACK_EVENTS` and the static JSON-LD.
- **Acceptance criteria:**
  - each defect has a regression test that fails on the old code;
  - Map, homepage and Calendar show the same "current" counts for the same filter.
- **Dependencies:** SZ-03.
- **Claude environment/model:** cloud; standard (Sonnet-class); fast (Haiku-class) for the mechanical "today" replacement.
- **Effort:** M

### SZ-11 — Overnight semantics stopgap
- **Priority:** P0
- **Problem:** overnight events show as next-day events, or vanish after midnight.
- **Risk if ignored:** misleading listings for nightlife, a core category.
- **Scope:**
  1. A contract rule: an end before 06:00 on the day after the start is an overnight end, not a second service day (`end_date` stays `null`; the end time stays in `time_display`).
  2. `discovery.js` keeps an overnight event current until its parsed end on the following morning.
  3. Backfill RA/Localist rows.
- **Acceptance criteria:**
  - a Sat 9 PM–Sun 3 AM fixture appears on Saturday, is "happening now" at 1 AM Sunday, and is absent from Sunday's daytime lists;
  - multi-day runs are unaffected.
- **Dependencies:** SZ-05.
- **Claude environment/model:** cloud; standard (Sonnet-class).
- **Effort:** S

### SZ-12 — Source-policy decision record
- **Priority:** P0 (decision, not code)
- **Problem:** RA browser acquisition contradicts `DEC-010`; spoofed UAs; the git bus sits on `main`.
- **Risk if ignored:** legal/reputational exposure; it blocks protecting `main`.
- **Scope:**
  1. Owner decides `DISCOVERY-001`.
  2. Honest UA in the 3 files.
  3. Move the RA transport off `main` (or retire it).
  4. Record the decision in `DECISIONS.md`.
- **Acceptance criteria:**
  - the decision is recorded;
  - no spoofed UA strings remain (lint);
  - the RA bridge doesn't commit to `main`.
- **Dependencies:** none.
- **Claude environment/model:** cloud; standard (Sonnet-class) for code; the decision is the owner's.
- **Effort:** XS–S

### SZ-13 — False-match vetoes on existing identity paths
- **Priority:** P0
- **Problem:** several shipped paths let a single signal establish identity (§10.3–10.5):
  - `resolveVenueId` is city-blind, last-row-wins and placeholder-blind (`venue-lookup.js:61-64, 76-80`);
  - the address tiers link **and rename** on address alone (`:387-402, 437-441`; `cron-feeds.js:309`; `venue-raw-reparse-repair.js:163`);
  - `samePlace` skips the city veto on a shared `venue_id` (`duplicate-consolidation.js:192-196`);
  - RA dedupe decides on title alone, against rejected rows too, and records the identity permanently (`ra-sync.js:392-424, 683-696`);
  - the enrichment discovery guard fails open on an ambiguous name (`generic-metadata-enrichment.js:309-313`);
  - `upsertVenueKnowledge` patches same-named rows in other cities (`venue-lookup.js:562-590`).
- **Risk if ignored:** every new source multiplies same-name venues and shared addresses. The expected harms:
  - silent wrong-city links;
  - events renamed to a different room (the Big Time Bingo → Magic Stick probe);
  - real events suppressed by a permanent RA crosswalk;
  - auto-merges that retire public events.
- **Scope:** small guard-only changes, with **no new matching capability**. Each lands first in shadow (logging would-have-refused counts), then enforces.
  1. `resolveVenueId` takes an optional city; returns null on duplicate normalized names; refuses on `citiesConflict`; links a blank-city event only when the name is unique **and** the source is a single-venue connector. This amends SZ-06's placeholder guard and fail-closed map, which touch the same function.
  2. The address tier links only when the stated name is blank (repair) or agrees with the canonical name. Otherwise it returns `conflict` and keeps the source name. **Never overwrite `venue_name_raw`.** This aligns `cron-feeds`, the re-parse repair and enrichment with Localist's policy.
  3. `samePlace` applies `citiesConflict` unconditionally.
  4. `findConservativeDuplicate` also requires no venue conflict, no city conflict, and a non-rejected target; otherwise it reports a candidate and records no identity.
  5. The discovery guard treats the ambiguity sentinel as not discoverable.
  6. `upsertVenueKnowledge` never PATCHes a row whose city conflicts (it stays dormant behind the gate).
- **Acceptance criteria:**
  - adversarial tests for each case (The Loft ×2; Black Box Ann Arbor; Planet Ant at 2357 Caniff; Big Time Bingo at 4120 Woodward; an unrelated name at a known address; Livonia/Troy "City Hall"; "Techno Tuesday" at different venues; a rejected target; the ambiguous-name search) each assert no link, no merge and no identity record;
  - the existing suite passes except the documented deliberate rewrites (§12.3);
  - a staging shadow run lists every link that would change, and each is reviewed before enforcement.
- **Dependencies:** SZ-03, SZ-04, SZ-06; SZ-15 makes the shadow diff interpretable.
- **Claude environment/model:** cloud; standard (Sonnet-class) for implementation; deep-reasoning (Opus-class) to review the shadow diff.
- **Effort:** M

### SZ-14 — Shared identity normalizer v1, placeholder classifier, gold set and precision gate
- **Priority:** P0
- **Problem:**
  - 13+ name, place and placeholder normalizers disagree on the same pairs, e.g. curly apostrophes are "same place" to dedupe and "different" to the linker;
  - placeholder rules are implemented four different ways;
  - no test guards identity precision across modules (§10.2, §12.1).
- **Risk if ignored:**
  - any P1 alias or candidate work would write keys other modules cannot read;
  - each new source's spelling quirks become new canonical rows or silent misses;
  - there is no objective way to show that a matching change did not add false links.
- **Scope:**
  1. `api/_lib/identity-normalize.js`, normalizer **v1**, folds only **harmless** differences: case, whitespace including NBSP, curly → straight quotes, dash variants → hyphen, NFKD diacritic strip, & → "and", and punctuation → space in the comparison key. It exposes a version. Variant folds (Theatre/Theater, St./Saint, leading article) live in a separate `candidateKeys()` that is **not** used for linking until P1-14.
  2. One placeholder classifier returning `generic_placeholder | specific_placeholder_row | not_placeholder`. This keeps the deliberate "Venue TBA (Paxahau)" distinction.
  3. The linker, dedupe, Admin autofill and map pin keys adopt v1 **in shadow**, logging both keys and reporting link differences before switching.
  4. The gold set, harness and CI precision gate from §12.3.
- **Acceptance criteria:**
  - ≥ 60 gold records from repo evidence, ≥ 25 of them adversarial;
  - the harness covers every identity path;
  - CI fails on any false link;
  - the shadow diff on a staging snapshot shows only v1-harmless changes (e.g. the en-dash DIA row) and is reviewed;
  - every module imports the shared placeholder classifier.
- **Dependencies:** SZ-03, SZ-04; feeds SZ-05 (placeholder → null + reason).
- **Claude environment/model:** cloud; deep-reasoning (Opus-class) for the fold policy and gold-set curation; standard (Sonnet-class) for implementation.
- **Effort:** M

### SZ-15 — Venue reference-data snapshot and identity-debt inventory
- **Priority:** P0
- **Problem:**
  - the canonical venue registry cannot be rebuilt from the repo (§14.1);
  - duplicate canonical pairs exist in repo data: Magic Stick / The Magic Stick, Majestic, Small's, Paris Bar;
  - placeholder rows are canonical (`seed.sql:36, 47-50`), and `BUG-010` search-created venue rows remain.
- **Risk if ignored:**
  - staging seeded from the repo would resolve far fewer venues than production, so the SZ-13/SZ-14 shadow diffs, and all P1 alias work, would be validated against the wrong reference data;
  - duplicate rows keep splitting events;
  - placeholder rows keep absorbing links.
- **Scope:**
  - an owner-run, read-only export of production venues (id, name, city, address, lat/lng, website, created_at), plus the distinct `(venue_name_raw, venue_city_raw, venue_id)` values on events with counts, into staging and a versioned reference file;
  - an inventory of: duplicate normalized names across cities; variant-duplicate clusters; placeholder rows and their linked event counts; `BUG-010` rows; the top unlinked `venue_name_raw` values by event count.
  - Each finding is assigned to SZ-02/SZ-10 (cleanup) or P1-13 (alias seeds).
  - **No production writes.**
- **Acceptance criteria:**
  - staging venue names and count equal production at the snapshot date;
  - the inventory answers the Appendix C identity questions;
  - `seed.sql` no longer re-introduces merged variants.
- **Dependencies:** SZ-04; SZ-01 (secure read access); owner-run export.
- **Claude environment/model:** cloud for analysis; standard (Sonnet-class); the export is run by the owner.
- **Effort:** S

### Work that should NOT be done yet

- **New bespoke source connectors**, or onboarding sources that publish directly, until SZ-05/06/08/09 and SZ-13/14 exist. The ICS self-service feed may continue only in `held`/dry-run mode.
- **Re-opening web-search enrichment**, or adding LLM generation of descriptions, before the evidence model, the research rebuild and the research gateway exist (P1-03/P1-04/P1-17). Research must never create a canonical venue row; it may only propose.
- **Fuzzy, trigram or edit-distance matching in any auto-link path** before the P1-14 veto + threshold model and the SZ-14 precision gate exist. Today's strict keys are the main reason name keys do not false-match.
- **Changing `normalizeVenueName` in place.** About 28 files depend on it. Ship normalizer v1 in shadow with a link-diff review.
- **Treating address equality, or a shared `venue_id`, as identity**, or overwriting a source's stated venue name with the canonical name.
- **Token folds inside street addresses** (St. → Saint), or collapsing distinct municipalities (Plymouth vs Plymouth Township).
- **Global aliases for generic or room names** ("Black Box", "Shed 3", "Main Stage", "Library", "The Loft"). Scope them to a source, city or parent.
- **Merging duplicate venues by DELETE + rename SQL** (as `migration_002:174-182` did). Use a redirect plus a legacy alias so the variant keeps resolving.
- **Seeding aliases or addresses from test fixtures or probe values** (e.g. "Shed 5, 2810 Russell St"). Seed only from verified production or authoritative evidence.
- **LLM identity decisions or LLM normalization.** LLMs may only propose quote-constrained candidates.
- **Auto-linking a title-derived place on its own.** An organization or series name never qualifies as evidence.
- **New `VENUE_NAME` constants, per-connector content regexes** (like the Lager House sister-room rule), **new placeholder literals, or wider placeholder exemptions in Admin.**
- **The full EPIC-001 platform** (registry, job queue, `source_records`, adapters) before the contract, authority and temporal foundations; it would encode today's ambiguities into a bigger system.
- **Monetization (EPIC-011–017), the social layer (EPIC-005), and Radar scoring (EPIC-007)** on top of data whose accuracy is unmeasured.
- **A frontend framework migration** or SSR rewrite.
- **Microservices, a separate worker fleet, or a second database technology.**
- **More admin tabs that compute counts in the browser.**

---

## 19. P1 / P2 roadmap

### P1 — before major public launch or promotion

| ID | Work package | Problem → outcome | Acceptance | Deps | Claude env / model | Effort |
|---|---|---|---|---|---|---|
| P1-01 | **Temporal model v2** | Date + text → `start_at`/`end_at timestamptz`, `timezone`, `time_precision`, `service_date`, `series_key` (§9.3); readers derive from them; shared `isCurrent` in JS and SQL | Fixture suite (overnight, DST weekends, all-day, multi-week, Ontario) passes in JS and SQL; Calendar, Map, Home and SSR agree | SZ-05, SZ-11 | cloud; deep-reasoning design, standard implementation | L |
| P1-02 | **Eligibility decision layer** | Denylist → positive/negative/uncertain chain with evidence (§8); per-source priors; sampled review | Labeled sample per source; precision ≥ agreed target; UNCERTAIN routes to `held`, not Admin | SZ-05, SZ-08, P1-03 | cloud; deep-reasoning | M–L |
| P1-03 | **Evidence/claims model + venue resolver chain** | Direct writes → claims with method, authority, evidence; aliases; `parent_venue_id`; `venues.kind`; title/description location extraction (§6, §7.4) | The Eastern Market shapes produce the outcomes in §6.3: the comma composite auto-links to the parent; the other shapes are held with a recorded parent + sub-unit proposal, never "Venue TBA" and never a new standalone venue. Ambiguous cases become issues, never defaults. | SZ-05, SZ-08; delivered with P1-13–P1-15 | cloud; deep-reasoning | L |
| P1-04 | **Rebuild research tier** | Snippet → propose-with-quote, verified, gated; never creates venues directly (proposes); persisted daily budget; per-attempt log | Every BUG-010 production failure kept as a fixture and rejected; dry run reviewed line-by-line before enabling (BUG-010 release conditions) | P1-03, P1-17, SZ-09 | cloud; deep-reasoning | M |
| P1-05 | **Admin exceptions queue on `event_issues`** | Client blankness → server-side open, escalated issues; suppression per issue; shows suppressed and held counts | Badge equals a SQL count of open escalated issues; no client-side membership logic | SZ-08 | cloud; standard | M |
| P1-06 | **Public data-access layer + page unification** | Whole inventory → cached, windowed endpoint(s); Calendar no all-history load; Calendar/Map/Radar/venue pages on `discovery.js` (merge and complete the existing branch); one "today" | Homepage payload under an agreed budget (e.g. < 300 KB gzip) at 10k rows in staging; identical counts across pages | SZ-10 | cloud; standard | M–L |
| P1-07 | **Retire per-source repair scripts; template descriptions at render time** | Fold Outer Limits/Dossin/Redford/VisitDetroit fixes into connectors; one ordered enrichment step registry used by cron and Admin | Scripts deleted; cron and Admin share one step list; no stored template descriptions | SZ-06 | cloud; standard | M |
| P1-08 | **Lifecycle and identity** | Cancelled/postponed handled; `last_seen_at` per source identity → stale or removed events handled; stable IDs for the 5 title-keyed connectors; connectors consult `event_source_identities` | Cancelled TM event leaves public views; a source-removed event is flagged within N runs; title edit doesn't fork | SZ-06 | cloud; standard | M |
| P1-09 | **Source policy implementation** | Apply the SZ-12 decision; runtime robots/terms gate per source | Policy recorded per source in data; gate test | SZ-12 | cloud; standard | S |
| P1-10 | **Backup and restore drill** | Unknown → verified recovery | Restore of a production backup into a scratch project documented with timing | SZ-04 | owner + local | S |
| P1-11 | **Browser smoke tests in the release gate** | No browser tests → Playwright smoke on preview + staging | Smoke runs on every PR; blocks on failure | SZ-03, SZ-04 | cloud (Chromium preinstalled); standard | S |
| P1-12 | **Rate limiting and admin audit** | Submit/upload abuse; no actor trail | Limits enforced; admin actions logged with actor | SZ-07 | cloud; standard | S |
| P1-13 | **Durable identity store** (§10.7) | Nothing learned → `venue_aliases`, `venue_external_ids`, `entity_match_decisions`, `resolution_attempts`, `place_aliases`, venue `kind`/`parent_venue_id`/validity/provenance. Resolution order: external id → verified alias in scope → exact key. Admin actions "link to venue", "save as alias (scoped)", "different place", "merge venues (redirect + legacy alias)" (amends P1-05). Single-venue connectors map by `venue_id`, not `VENUE_NAME`. Aliases seeded as *proposed* from the SZ-15 inventory, verified by a human. | In staging: an Admin alias for "Majestic Theater" makes the next ingest link with 0 external calls and no new venue row; a "different place" decision suppresses that pair from future candidates; merging Magic Stick / The Magic Stick redirects events and keeps both spellings resolvable; a conflicting external-id insert fails loudly; gold-set precision stays 100% | SZ-06, SZ-08, SZ-14, SZ-15; P1-03 | cloud; deep-reasoning for schema and policy, standard to implement | L |
| P1-14 | **Candidate generation + corroboration scorer** (§7.4.1) | No candidates or evidence combination → candidate generators that only *propose* (normalizer v1 exact, `candidateKeys` variant folds, token-boundary containment, edit distance ≤ 2 on names of ≥ 8 chars, known-parent prefix); address standardizer (number/street/suffix/directional/unit/range, never St. → Saint); city → place id via `place_aliases`; capture Ticketmaster venue id + coordinates, Eventbrite venue id, ICS `GEO`, Localist place id/geo at ingest; read `venues.lat/lng`; scorer, vetoes, bands and an independent self-check | 100% precision on gold negatives; ≥ 80% of gold positives auto-link or propose correctly with recorded evidence families; the name-only/address-only property test passes; a staging shadow report of every would-be link is human-sampled before enabling | SZ-13, SZ-14, P1-13; P1-03 claims | cloud; deep-reasoning for model and vetoes, standard to implement | L |
| P1-15 | **Content location candidates before any "Venue TBA"** (§6) | Titles and descriptions unused → after structured fields and **before** any placeholder: title segmentation; "TBA - place" string parsing; description address/city/"at …" extraction (fixed for `’`, numbered sub-units, the "Market" rejection and truncation); gazetteer parent + sub-unit match; fixed `parseIcsLocation` composites (never "Shed 3" as an address); the four "Venue TBA" states, with the Admin exemption narrowed to `source_states_tba`; replace the Lager House sister-room regex. Requires a recorded policy decision reversing "no venue from title" (candidates only). Optional fast-tier LLM segmentation for residual cases, quote-constrained and cached. | §6.3 outcomes in staging; Eastern Market Partnership events elsewhere do **not** link to Eastern Market; "ProsperUs Detroit" contributes no city; the rewritten `cron-feeds-location-per-event` test asserts "Venue TBA" only after the content step has run; zero external calls when internal evidence suffices | P1-13, P1-14, SZ-05, SZ-08, SZ-12 | cloud; deep-reasoning for grammar and policy, standard to implement, fast (Haiku-class) for any residual segmentation | L |
| P1-16 | **Event-identity matching: similarity proposes, corroboration decides** | Single-signal event matchers → variant candidates (shared normalizer + `candidateKeys` + date ±1) feed the Admin duplicate review list only. Editorial/press: word-boundary matching, placeholder venues excluded, venue-and-date links need a title or performer anchor, date bounds on every pass, a distinct `match_type` for automated links (not `manual`), and an unlink action. VisitDetroit filter: venue/city non-conflict, rejected rows excluded, paged read. PostgREST `or=()` values quoted. Decisions recorded in `entity_match_decisions`. | Gold event pairs (Devils/Devil's, Café/Cafe, St./Saint, Shed 3 prefix, "Trivia Night" in different cities, "rave on"/"brave one", recap article, placeholder-venue article) produce the expected review/link/no-link; no automated link is labelled `manual`; a comma-containing title is retrieved correctly in staging | SZ-13, SZ-14, P1-13; P1-05 | cloud; standard | M |
| P1-17 | **Internal-first research gateway and negative cache** | Every external call goes through one gateway that checks `resolution_attempts` (TTL + backoff) and verified aliases first, and decrements **one persisted daily budget shared by all entry points**, press-coverage included. Research runs only for held residual cases, after content candidates, gazetteer, re-parse and duplicate checks. The query uses the event's resolved city, not hard-coded "Detroit". Dry-run makes no external calls. Candidates are ordered by priority with rotation, so names don't starve. (Amends P1-04.) | A second call within the TTL makes 0 searches; a verified alias makes 0 searches; three entry points together cannot exceed the cap; dry-run makes 0 searches; a staging report shows ≤ 1 search per distinct subject per TTL | P1-13, P1-04 | cloud; standard | S |

### P2 — scalability and maintainability

| ID | Work package | Trigger to start | Effort |
|---|---|---|---|
| P2-01 | **Adapters + source registry (strangler)**: Localist/Tribe/ICS/JSON-LD adapters as registry rows; adopt or drop the `sources` table; per-source cadence | Source count heading past ~40, or more than ~2 new sources per month | XL |
| P2-02 | **Geography**: venue coordinates (geocoder), PostGIS Orbit polygon, places table, server-side Orbit enforcement (DEBT-001) | Radius/map features promoted; Ontario/Ohio coverage | L |
| P2-03 | **Shared `fetchWithPolicy`**: timeouts, retries, honest UA, conditional GET, size caps, raw payload retention | With P2-01 | M |
| P2-04 | **De-duplicate helpers**: `api/_lib/http.js`, `text.js`, `auth.js`; frontend `site.js` (escape, safeUrl, categories from DB, venue display) | Opportunistic, with each touched file | M |
| P2-05 | **Query scaling**: `coalesce(end_date,start_date)` index, keyset paging, materialized counts, set-based SQL repairs | > 10k current rows | M |
| P2-06 | **Job queue**: pg_cron or a queue table with per-source jobs | > 50 sources or crawls exceeding function limits | M |
| P2-07 | **Coverage measurement**: per place × category; recall sampling | Before marketing "comprehensive" claims | M |
| P2-08 | **Least-privilege DB roles** for ingestion vs admin | With P2-01 | S |
| P2-09 | **Organizer entity** (DISCOVERY-006/009) | Organizer pages or dedupe needs | M |
| P2-10 | **Identity quality monitoring and calibration**: weekly sampled audit of auto-links and auto-promoted aliases; precision/recall per source; weight recalibration against labelled data; a revocation workflow that re-resolves events linked through a revoked alias; `pg_trgm` candidate generation only when in-memory scans become slow | After P1-14 is live; `pg_trgm` beyond ~1,000 venues (`venue-lookup.js:55` reads `limit=1000`) | M |
| P2-11 | **Organizer, series and brand entities for disambiguation**: organizers and series with scoped aliases (same pattern as `venue_aliases`); organizer → venue relationships (feeds C3 evidence); optional `venues.brand_id` for chains. Extends P2-09. | Organizer/series confusion or chain collisions appear in the gold set or the audits | M |

---

## 20. "Do not rebuild these things"

- **The stack** (Vercel + Supabase + vanilla HTML/JS, no build). It is cheap, fast and adequate. The problems are contracts and process, not technology.
- **The `events`/`venues` core.** Extend it with timestamps, issues, claims, aliases and history.
- **Per-source connectors as a whole.** Harden them through the shared write path now; strangle them into adapters later (P2-01). A big-bang ingestion rewrite would stall coverage and re-learn every source's quirks.
- **`discovery.js`.** It is the best-specified part of the frontend; spread it.
- **`event-upsert.js` and the fail-closed `status-lookup.js`.** Both are correct and production-proven.
- **The Localist connector.** It is the template for future adapters.
- **The strict identity core:** the exact-key linker, `AMBIGUOUS_VENUE_NAME`, `citiesConflict`, and Localist's no-address-link policy. Add guards, aliases and corroborated candidates *around* it (§10.9); do not replace it with a fuzzy matcher.
- **Duplicate consolidation and non-event retirement.** Deterministic, soft, capped and reversible enough. Keep them, and log them.
- **The mock PostgREST fixture.** Keep it alongside (not instead of) real-Postgres tests.
- **The submission → moderation path and the self-service ICS feed concept.**
- **`sources.html`** transparency and the project's honest-gap principles.
- **The decision log and backlog discipline.** Fix staleness; don't replace the system.

---

## 21. "Rebuild only if…"

| Component | Rebuild only if |
|---|---|
| Ingestion connectors | Adapters (P2-01) cannot express ≥ 80% of connectors after two attempts, **or** the per-source contract-rejection rate stays high after SZ-05/06 because connectors' parsing itself is unfixable. |
| Temporal model (to a separate occurrences/series schema) | Additive `start_at`/`end_at` + `series_key` cannot represent ≥ 95% of real sources' schedules (e.g. many-session festivals with per-session venues), measured on staging data. |
| Frontend (framework/SSR) | Listing pages need server rendering for SEO beyond what SSR meta + JSON-LD provide, **or** the shared-module extraction (P2-04) cannot be done without a build step, **or** more than ~2 regular contributors make inline-script coordination costly. |
| Admin | More than one human moderator needs roles and permissions, **or** issue volume needs workflow features (assignment, SLA) that a single page can't serve. |
| Database platform | Never on current evidence. Postgres handles 100k+ rows trivially; the bottlenecks are elsewhere. |
| Venue/entity resolution | Aliases + hierarchy + the resolver chain + corroboration scoring (P1-03, P1-13–P1-15) still leave > ~10% of upcoming events unlinked after a month, **or** the gold-set precision gate cannot be held at 100% without dropping recall below a useful level. Even then, add a geocoder and source-supplied coordinates before redesigning. |
| Research tier (after the P1-04 rebuild) | Measured precision on a labeled sample is below the publication threshold. Then keep it proposal-only (Admin-assisted), not autonomous. |

---

## 22. Ten highest-risk findings

1. **No write-path gate.**
   - 20 of 25 connectors and the DB default publish rows as `approved` with no shared validation.
   - Every defect class (placeholders, markup, address-as-city, impossible dates) is public until repaired.
   - Evidence: §5; `schema.sql:81`.
2. **Re-ingestion erases corrections.**
   - Explicit `null`s and whole-row overwrites undo human and enrichment work daily.
   - A failed venue fetch nulls every venue link.
   - Evidence: §5.4; DEBT-011; `venue-lookup.js:51-73`.
3. **Probable PII/internal-note exposure through the public key** on the base `events` table, plus an unused anon INSERT path.
   - Evidence: §15. INFERRED — verify today.
4. **Production is the test environment.**
   - 0 PRs; no CI; no staging; canaries on `main`; the repo can't rebuild the schema.
   - Unapplied migrations broke a source for 10 days.
   - Evidence: §11; BUG-008.
5. **Silent failure is the default.**
   - A month-long Ticketmaster write outage was reported healthy.
   - 11 connectors are unlogged; there is no alerting.
   - Evidence: §13; DEBT-010.
6. **Entity identity is decided on single signals, and wrong derived facts become canonical.**
   - Address-only links rename events to a different room (probe: "Big Time Bingo" @ "4120 Woodward" → The Magic Stick). Blank-city names link city-blind. RA title-only dedupe and editorial substring links are recorded permanently.
   - Search-derived facts are stored as `authoritative` and feed other automation; authority is a label, not a gate.
   - Nothing is learned, so the same reconciliations recur.
   - Evidence: §7.2, §10.3–10.6; BUG-010.
7. **The temporal model can't represent the product's core inventory** (overnight nightlife, running exhibitions).
   - Semantics differ per connector and per page.
   - Evidence: §9.
8. **Operational metrics describe UI visibility, not truth.**
   - The queue counts blankness client-side; dismissals hide events; there is no independent data-quality metric.
   - Evidence: §13.3.
9. **Silent truncation at the 1,000-row cap and whole-inventory client loads.**
   - The sitemap likely omits ~half of current events today; pages degrade non-linearly with growth.
   - Evidence: §14.2–14.3.
10. **Source-terms compliance contradiction.**
    - RA browser acquisition vs `DEC-010`; spoofed UAs; no runtime robots/terms gate.
    - Evidence: §15.

---

## 23. Ten highest-leverage improvements

1. **One canonical row contract inside `upsertEventRows`** (SZ-05). One module protects every source, present and future.
2. **Field authority + locks + never-null-over-value** (SZ-06). Makes corrections permanent and ends the daily flip-flops.
3. **`events_history` trigger** (SZ-07). Gives precise rollback, overwrite-churn metrics and an audit trail for one small migration.
4. **CI + PR gate** (SZ-03). Turns 28k lines of existing tests into an actual safety net.
5. **Staging Supabase + Preview env scoping + migration pipeline** (SZ-04). Ends production-as-test.
6. **`event_issues` + data-quality assertions + alerting** (SZ-08/09). Metrics become system truth; failures become loud.
7. **A `held` state** (SZ-08). Lets UNCERTAIN mean "automation is still working", not "public" or "Admin".
8. **Structured time** (SZ-11 → P1-01). Fixes overnight, running and "tonight" semantics at the root.
9. **A durable identity store + corroborated candidates + content location extraction** (P1-03, P1-13–P1-15), gated by the SZ-14 precision gate. This is the producer intelligence, built on the existing tiers. It makes the system *learn*: every confirmed alias resolves future variants at zero research cost.
10. **A cached, windowed public query layer** (P1-06). Flattens payload growth and removes silent caps.

---

## 24. Recommended sequence of work

| When | Work | Notes |
|---|---|---|
| **Week 0 (days)** | SZ-01 (verify exposure first) · SZ-02 · SZ-12 decision · RA transport off `main` · SZ-03 | Stop the bleeding; make tests mandatory. |
| **Weeks 1–2** | SZ-04 staging + baseline · SZ-15 venue reference snapshot with SZ-04 · SZ-07 history trigger · SZ-08 `held` + issues schema · SZ-05 contract in **shadow mode** · SZ-14 normalizer v1 + gold set in **shadow** | Measure before enforcing: one week of would-reject/would-hold data per source, and the identity link diff. |
| **Weeks 2–4** | SZ-06 field authority · SZ-13 identity vetoes (shadow, then enforce) · SZ-09 monitoring/alerting · SZ-10 defect sweep · SZ-11 overnight | Validate each in a staging shadow run with diff reports. |
| **Weeks 4–6** | Enforce SZ-05 and SZ-14's precision gate · release gate fully on · first post-Sprint-Zero quality audit | Repeat the 100-listing audit on the same method. Compare to the 19/100 baseline, and separately track "core fact wrong" (was 6/100) and wrong-venue links. |
| **P1 (≈ 8–12 weeks)** | P1-01 → P1-03 → P1-13 → P1-14 → P1-15 → P1-02; P1-17 together with P1-04; P1-16 after P1-13; P1-05 (with the P1-13 Admin actions) · P1-06 · P1-07/08 in parallel where independent · P1-10/11/12 | Temporal first (everything else references time). Claims and the identity store before eligibility and research (all of them store claims). Research reopens only after P1-17's gateway and negative cache exist. |
| **P2** | Triggered by the conditions in §19 | Don't start P2-01 until P1-03 exists. |

**Success measures for Sprint Zero** (all from persisted data, not UI):
- open S1 issue codes on public events trending down;
- 0 nulls written over stored fill-blank fields;
- 0 connectors without run logs;
- an alert fired for every injected failure in staging;
- 0 production-only discoveries of schema drift;
- 0 false links on the identity gold set, and 0 address-only or title-only identity writes in shadow logs after SZ-13 enforcement.

---

## 25. Explicit recommendation: pause, partially continue, or continue?

**Partially continue.**

**Pause until Sprint Zero's P0 is complete:**
- **New source connectors and source onboarding that auto-publish.** Each new source adds defects at today's per-row rate into a system that can't yet reject, hold, attribute or roll them back. This is the mechanism by which "more events create proportionally more manual work."
- **Re-opening or extending AI/search enrichment.** Without an evidence model, a gate, and a research gateway with a negative cache, it repeats BUG-010 and mints duplicate venues from spelling variants.
- **Monetization, social, and Radar-scoring features.** They depend on trustworthy, measured data, and they increase audience exposure to current error rates (19/100 fully correct in the recent sample).

**Continue, in parallel, with small scope:**
- Presentation and UX work that does not change the data model or data loading (copy, layout, accessibility).
- The self-service ICS feed path, only with new feeds in `held`/dry-run mode once SZ-08 exists.
- Decision work the foundations need: the eligibility taxonomy, the RA policy, and field-authority rules per field. These are product decisions, and they can proceed now.

**Resume source expansion** when SZ-03 through SZ-09 and SZ-13/SZ-14 are done and the post-Sprint-Zero audit shows:
- the "core fact wrong" rate is clearly below the 6/100 baseline;
- every defect class from the warning list is either rejected or held by the contract;
- the identity precision gate is green. New sources add same-name venues, shared addresses and spelling variants, and those must not turn into wrong links.

Then expand primarily through generic adapters (Localist-style), not bespoke scrapers.

**Why not pause everything:** the existing system works, its owners diagnose problems rigorously, and most foundations are additive. A full stop would lose momentum without making Sprint Zero faster.

**Why not continue normally:** the project's own records show the current rate of production-discovered defects, manual SQL patches (85 in ~4 weeks) and hand-written descriptions (529 of 604 upcoming Ticketmaster events during one outage, `BUG-007`). That rate does not survive another doubling of sources.

---

## Appendix A — Evidence index (primary files)

- **Write path:** `api/_lib/event-upsert.js`, `api/_lib/status-lookup.js`, `api/_lib/venue-lookup.js`, `api/_lib/non-event-filter.js`, `api/_lib/ics-location.js`, `api/_lib/localist-rows.js`, `api/_lib/run-log.js`
- **Connectors:** `api/cron-*.js` (connector table in the ingestion sub-review summarized in §4, §5, §10)
- **Enrichment:** `api/cron-enrichment.js`, `scripts/generic-metadata-enrichment.js`, `api/_lib/external-discovery.js`, `api/_lib/description-enrichment.js`, `scripts/duplicate-consolidation.js`, `scripts/retire-non-events.js`
- **Admin:** `admin.html` (`getMissingFields` `:483`, `classifyMissingFields` `:646`, dismissal filter `:768`), `api/admin-events.js`
- **Frontend:** `discovery.js`, `paged-fetch.js`, `index.html`, `calendar.html`, `map.html`, `radar.html`, `api/sitemap.js`, `api/event-meta.js`
- **Database:** `supabase/schema.sql`, `supabase/migration_*.sql`, `supabase/update_*.sql`, `supabase/archive/*`, `test/fixtures/mock-postgrest.js`
- **Process:** `vercel.json`, `.github/workflows/ra-sync-bridge.yml`, `ra-sync/README.md`, `project/BACKLOG.md` (BUG-005/007/008/010, DEBT-010/011), `project/DECISIONS.md` (DEC-010/011/012/013), `INGESTION_PLATFORM_ARCHITECTURE.md` §1 (prior gap analysis, 2026-09-20)

## Appendix B — Status of the prior (2026-09-20) gap analysis

`INGESTION_PLATFORM_ARCHITECTURE.md` §1 listed 67 gaps.

**Closed or materially improved since (OBSERVED):**
- **D4** — mixed-key batches: closed by `event-upsert.js`.
- **D7** — status lookup fail-open: now fail-closed.
- **A6** — no tests: a large suite now exists, but CI is still missing.
- **K2** — no run log: partial.

**Still open (OBSERVED):**
- **A1–A5** — source = code; shared library partial.
- **C1** — timestamps.
- **C3** — lifecycle.
- **C4** — provenance.
- **D1** — overwrites.
- **D2** — venue fail-soft.
- **D5** — unquoted IDs.
- **E1** — cross-source dedupe at ingest.
- **E2** — title IDs.
- **E4** — aliases: still open. It is broader than first stated (no alias, external-id or decision store; single-signal identity paths), and is superseded by SZ-13/SZ-14 and P1-13–P1-16 (§10).
- **F1** — retirement of removed events.
- **G1** — Orbit enforcement.
- **I1** — timeouts.
- **I3** — UA.
- **J1** — UTC today.
- **K1/K4/K5** — failure reporting, stale lists, alerting.
- **M1** — cron auth fail-open.

That pattern (problems well diagnosed, structural causes still in place) is the main reason this review puts foundations ahead of further expansion.

## Appendix C — Items this review could not verify without production access

1. Whether anon can actually SELECT `submitter_email` / `internal_note` on `events` (one anon request).
2. Whether production's schema matches any repo state (needs a schema dump).
3. Supabase plan, backup/PITR coverage, max-rows setting (documented as 1,000 in `paged-fetch.js`).
4. Whether Vercel deploys on RA payload commits (Vercel project settings).
5. Current counts behind the inferred sitemap truncation and the description flip-flop (queries against `events` / `events_history`-equivalent data).
6. The production venue registry (SZ-15):
   - duplicate and variant venue names (do both Magic Stick / The Magic Stick and both Majestic rows exist?);
   - whether the "Venue TBA" / "Location TBA" / "Multiple Locations" venue rows exist and how many events link to them;
   - whether Eastern Market has a stored address, coordinates or website;
   - the top unlinked `venue_name_raw` values by event count;
   - how many current links were made by address alone.

## Appendix D — Addendum evidence index (name/entity matching)

- **Matching code:**
  - `api/_lib/venue-lookup.js` — `normalizeVenueName :26-29`, `normalizeAddressCity :37-42`, `buildVenueNameToIdMap/resolveVenueId :51-80`, `AMBIGUOUS_VENUE_NAME :135`, detail maps `:147-183`, learned map `:200-228`, placeholders `:273-277`, city compare `:280-310`, reverse address tier `:387-402`, `resolveVenueFromCandidate :426-443`, `upsertVenueKnowledge :557-611`;
  - `scripts/duplicate-consolidation.js :110-129, 186-221, 345-354`;
  - `scripts/ra-sync.js :392-424, 683-696`;
  - `api/cron-editorial.js :383-406`; `scripts/press-coverage-linking.js :203-225, 519-573, 1084-1160`;
  - `api/cron-visitdetroit.js :357-377`;
  - `api/_lib/external-discovery.js :150-160, 228-277, 311, 319-331`;
  - `api/_lib/source-authority.js :105-116`;
  - `api/cron-feeds.js :276-316`; `api/_lib/ics-location.js :42-52, 100-102`; `api/_lib/localist-rows.js :79`; `api/cron-localist.js :652-658`;
  - `scripts/generic-metadata-enrichment.js :112-128, 247-251, 309-313, 354-355, 384, 455-470`;
  - `admin.html :600-605, 637-649, 766-779`; `api/admin-events.js :372`.
- **Data:**
  - `supabase/seed.sql :16-19, 21, 29-31, 36, 38, 40, 47-50`;
  - `supabase/migration_002_neighborhoods_and_organizers.sql :61, 164-182`;
  - `supabase/archive/update_2026-09-15_admin-followup-batch2.sql :75-76`;
  - `supabase/update_2026-09-22_gardenbowl-venue.sql`; `api/_lib/bigtimebingo-occurrences.js :13-18`;
  - `supabase/migration_043_feed_sources_location_per_event.sql :5-9, 29-30`; `supabase/migration_045_event_source_identities.sql`.
- **Tests:** the 25 matching-related files listed in §12.1, all passing locally (262 PASS lines). The assertions to rewrite deliberately are listed in §12.3.
