# 313.events — Ingestion Platform Backlog

**Prepared:** 2026-09-20
**Status:** Plan only. Nothing here has been implemented.
**Companion to:** `INGESTION_PLATFORM_ARCHITECTURE.md`. Section references (§) point there. Gap IDs (A1, D1, G5…) point to its §1.

## How to read this

- **Work package (WP)** means one small unit you can merge on its own. Each WP has a single deliverable and a test that can prove it's done. Where it can, a WP gets shipped, verified and left in production before the next one that depends on it starts.
- **Size** is a relative estimate of focused implementation effort: **S** ≤ ½ day, **M** ≈ 1–2 days, **L** ≈ 3–5 days. Nothing here is XL. Anything bigger has already been split.
- **Dep** lists the WPs that have to be merged first. A dash (—) means the WP can start right away.
- **Test** is the acceptance test. "Fixture test" means an automated test against stored inputs, which runs in CI once WP 1.2 exists. Before that, the test is a manual script checked into `test/`, plus the observed result recorded in the WP's commit message.
- **Rules that apply to every WP:**
  - Each migration is its own file: `supabase/migration_0NN_*.sql`, idempotent, and it logs itself to `schema_migrations`.
  - Any enum change gets its own standalone migration (the project's existing rule).
  - No WP removes a legacy cron until its shadow-parity WP passes.
  - Each WP updates the docs it makes stale. That includes `SERVICE_AREA.md`, `sources.html` and cron headers.

## Phase map

| Phase | Theme | Outcome at phase end | WPs |
|---|---|---|---|
| **0** | Stabilize & instrument | Live data-loss defects fixed. Every legacy run is logged. Baselines are measurable. | 0.1–0.19 |
| **1** | Foundations | Repo tooling, shared library, core schema additions (timestamps, runs, records, registry extension, geography) | 1.1–1.15 |
| **2** | Pipeline core | Queue, dispatcher, worker, adapter contract, validate/normalize/merge/reconcile, and the first adapter (ICS) live end to end | 2.1–2.18 |
| **3** | Legacy migration | All 20 connectors running on the pipeline and their cron lines removed | 3.0–3.21 |
| **4** | Entity resolution & dedupe | Venue resolution, geocoding, matcher (shadow → live), merge/unmerge, review UI | 4.1–4.13 |
| **5** | Registry, discovery & onboarding | Source console, probe/fingerprint, dry-run, research import, discovery channels | 5.1–5.13 |
| **6** | Platform adapters & coverage | Multiplier adapters and the first expansion batches across rings | 6.1–6.16 |
| **7** | Monitoring, alerting & metrics | Detectors, health model, digest, quality and coverage metrics | 7.1–7.12 |
| **8** | Assisted capture & JS worker | Manual lane on the pipeline; optional render worker | 8.1–8.7 |
| **9** | Public-site integration & cleanup | Pages read the new model; legacy fields retired | 9.1–9.8 |

**Critical path** (each arrow is a real dependency): 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.5 → 2.7 → 2.11 → 2.13 (ICS live) → 3.x → 4.8 → 4.10. Along the way, 2.5 also waits on 1.4, 1.6, 2.3, 2.4 and 2.6, and 2.13 on 2.8, 2.9, 2.10, 2.14 and 2.15.

Three groups can run in parallel with the critical path once Phase 1 is done: Phase 5's registry and console work, Phase 7's detectors (which only need `source_runs`), and the geography WPs (1.9–1.12, 4.1–4.4).

**Milestones:**

| Milestone | Reached at | What's true then |
|---|---|---|
| M0 | end of Phase 0 | Defect-free and observable |
| M1 | WP 2.13 | First source fully on the new pipeline |
| M2 | Phase 3 complete | No bespoke cron lines left |
| M3 | WP 4.10 | Automatic cross-source dedupe live |
| M4 | WP 5.8 | Zero-code onboarding live |
| M5 | WP 6.16 | Every ring has first-party sources |

---

## Phase 0 — Stabilize & instrument

This phase needs no architecture decisions. Every WP is a targeted fix to existing files. Together they stop today's data loss and create the run log that later phases measure against. Two WPs change product behavior and need Jody's quick OK first: 0.13 (unscheduling Metro Times) and 0.14 (routing new Trinosophes and Cinema Detroit rows to review). **Do 0.17 first:** it checks whether moderator rejections are being silently reversed today.

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 0.1 | Fix Belle Isle crash | S | — | Call `buildVenueNameToIdMap` and use `resolveVenueId` in `cron-belle-isle-nature-center.js:135`. Set `is_free` only when cost says free (:138). | Manual run returns `upserted > 0`. The healthcheck freshness check for Belle Isle passes within 24 h. |
| 0.2 | Cron auth fails closed | S | — | In all 23 cron handlers, missing `CRON_SECRET` returns 500, not open access. Keep the existing timing-safe compare. | With the env var unset locally, every cron endpoint returns 500. With a wrong secret, 401. The healthcheck auth checks still pass in prod. |
| 0.3 | Fetch timeouts everywhere | S | — | Add `AbortSignal.timeout(30000)` (Node ≥ 18) to every outbound `fetch` in `api/cron-*.js` and `_lib`. | `grep -L "AbortSignal.timeout\|signal:" api/cron-*.js` is empty for files that fetch. A test against a hanging local server aborts in ≤ 31 s. |
| 0.4 | Failures return non-200 | S | — | Fetch-failure branches return 502 with the same JSON body. "Not configured" returns 500. | Vercel's function log shows the failure status for a forced-failure run (bad URL env override). |
| 0.5 | `source_runs` table + `withRunLog()` wrapper | M | — | Migration adding `source_runs` (the §8.1 subset: `source_slug, started_at, finished_at, outcome, http_status, records_parsed, records_written, error_sample, duration_ms`) and `_lib/run-log.js`. Wrap all 20 ingestion handlers. | After one day of crons, `select source_slug, count(*) from source_runs group by 1` shows 20 slugs. A forced failure logs `outcome='failed'`. |
| 0.6 | Venue-lookup failure aborts instead of wiping | S | — | `buildVenueNameToIdMap` returns `null` on failure. Callers then **omit `venue_id` from the payload** rather than sending null (fixes D2). | Simulated lookup failure (bad key): the run completes, and existing `venue_id` values are unchanged (before/after count query). |
| 0.7 | Don't send nulls over existing values (interim) | M | 0.11 | In each connector, drop keys whose value is null or undefined before upsert, then **group rows by identical key set and send one bulk request per group**. A single `columns=` list can't be used here: PostgREST would fill the omitted keys with NULL and the merge would overwrite existing values. This gives deterministic key-set handling (D1/D4 interim), and the Ticketmaster address fix falls out of it. | Fill `venue_address_raw` on a Ticketmaster event with no API address. It survives the next Ticketmaster run. |
| 0.8 | Stop per-run overwrites of reviewer-owned fields (interim) | S | — | Metro Times stops sending `category` on update, and Popps stops sending `start_date`/`time_display` for rows that already exist (look up first, as the status lookup does). | Change a Metro Times row's category, run the cron, and the category persists. Same for a Popps `start_date`. |
| 0.9 | Row-level validation guard (interim) | S | — | A shared `_lib/validate-row.js` drops rows with a null title, invalid `start_date`, or `end_date < start_date`, and counts them in the run log. Apply it in all connectors (fixes Redford D3). | Fixture: a Redford page with a leading date line produces a skipped row, not a 502. |
| 0.10 | Measure Ticketmaster truncation | S | 0.5 | Log `page.totalElements` and pages fetched to `source_runs`. | One run's record shows whether `totalElements > 1000`. The result goes into this backlog, and if it's saturated, WP 3.2 is prioritized. |
| 0.11 | Verify PostgREST mixed-key bulk behavior | S | — | A scratch test: bulk POST to a scratch table with objects that have different key sets, with and without `columns=`. Record the behavior. | A written result (error vs null-fill) in `test/notes/postgrest-mixed-keys.md`. It decides the details of WP 0.7. |
| 0.12 | "Today" in America/Detroit | S | — | A shared `_lib/today.js`, used by Lager House, Planet Ant (`start=` too), DMOD, Playground and every other `todayISO` use. | Run Lager House at 00:30 UTC; a same-evening ET show is included. |
| 0.13 | Planet Ant / Metro Times block status | S | 0.5 | Record the live outcome of both in the run log for 3 days. If Metro Times is still 403, mark it `blocked` in `sources.html` and stop scheduling it (remove the cron line, keep the code). **Needs Jody's OK** to unschedule. | Run-log evidence is attached. If it's still blocked, `vercel.json` no longer schedules Metro Times. |
| 0.14 | MotorCity cancelled series + Trinosophes/Cinema safety | S | — | Skip `STATUS:CANCELLED` masters that have an RRULE (`:404`). Trinosophes: keep Jody's 7:00 PM doors default and its public note, but route new rows to `pending_review`, because junk lines become events. Cinema Detroit: new rows go to `pending_review` until migrated. **Needs Jody's OK.** | Fixture: a cancelled weekly master yields 0 rows. A new Trinosophes row lands pending with the declared default time and note. |
| 0.15 | Playground: write before timeout | S | — | Upsert in chunks as detail pages complete, with a time-budget check that stops at 80% of `maxDuration`. | A run with 60 events writes its first chunks, and the log shows a `partial` outcome instead of zero rows. |
| 0.16 | Healthcheck lists complete (interim) | S | — | Add the 5 missing crons to `CRON_ENDPOINTS` and the 3 missing freshness targets. | The next healthcheck row includes checks for all 20 ingestion crons. |
| 0.17 | **Status-lookup safety (do first)** | S | — | Two parts. (1) **Verify:** query whether rows rejected by the 2026-09-17 dedupe batches (archive `update_2026-09-17_dedupe-batch*.sql` id lists) are still `rejected`. (2) **Fix in all 20 connectors:** send the status lookup in chunks of ≤ 100 IDs. If any chunk fails, with a non-OK response or an exception, **abort the upsert** and log `outcome='failed'`, rather than defaulting every row to `approved` (D7). | (1) A written result: count of re-approved rows, with those rows re-rejected if any. (2) With the lookup URL forced to fail, the run writes nothing and returns 502. A ~1,000-ID Ticketmaster run uses ≥ 10 chunked lookups. |
| 0.18 | Ticketmaster interim: time slicing + partial detection | S | 0.10 | Query the 90-day window as three 30-day slices (each ≤ 1,000 results), and dedupe by ID. Any `!r.ok` page marks the run `partial` in the log instead of silently `break`ing (`:187`). This covers G5 until the tiled adapter (3.2). | `totalElements` per slice is logged. Upserted count ≥ the pre-change count. A forced page failure logs `partial`. |
| 0.19 | Admin "register a feed" (PHASE0 §5) | S | — | An `admin-feeds.js` `action: "register"` inserts a `feed_sources` row as `approved`, reusing `submit-feed.js` validation. Zero schema changes, as PHASE0 §5 designed. | A registered test ICS feed is polled by the next `cron-feeds` run. Bad input returns 400, and an unauthenticated call returns 401. |

---

## Phase 1 — Foundations

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 1.1 | `package.json` + dependency policy | S | — | Minimal `package.json`: `cheerio` plus the built-in `node:test`. Lockfile committed. Confirm Vercel builds the functions unchanged. | Deploy preview passes, and all existing endpoints respond identically (the healthcheck passes on the preview URL). |
| 1.2 | CI test runner + fixture layout | S | 1.1 | `test/` tree and a GitHub Actions workflow running `node --test` on push. | A deliberately failing test fails CI, and a passing one passes. |
| 1.3 | Shared lib: auth, http, text, time | M | 1.2, 0.2, 0.3, 0.12 | `lib/ingest/{auth,http,text,time}.js` with unit tests. `fetchWithPolicy` without the robots/policy gate yet: timeout, retries with jitter, conditional GET, size cap, honest UA constant. | Unit tests: retry on 503, no retry on 404, timeout, ETag round trip, entity decoding parity with the existing `decodeEntities`. |
| 1.4 | Shared lib: Supabase REST helpers | S | 1.3 | Paginated select, quoted and chunked `in()` lists, bulk upsert **only for uniformly-shaped rows** (it throws if rows have different key sets), RPC call. | Unit tests with a mocked fetch: pagination follows `Content-Range`; an ID containing `,` or `)` is quoted; a mixed-key batch throws before sending. |
| 1.5 | Migration: event timestamps | M | — | `events.start_at timestamptz, end_at timestamptz, timezone text default 'America/Detroit'`, plus a backfill from `start_date` + `time_display` via a SQL parse function (`null` where unparseable), plus an index. `start_date` and `time_display` stay. | The backfill report lists the count parsed vs null. A spot check of 50 rows matches the displayed time. |
| 1.6 | Migration: `source_records` | M | 1.5 | The table from §2.7, with a unique `(source_id, source_key)` and indexes on `event_id` and `last_seen_at`. | Insert/upsert round trip via an RPC. The unique constraint rejects a duplicate key. |
| 1.7 | Migration: extend `sources` registry | M | — | The columns from §3.2 (identity, adapter, policy, trust, schedule, lifecycle, health, provenance), plus a `platforms` table and `source_state_log`. `feed_sources` is untouched for now. | The migration applies cleanly on a Supabase branch or copy. The existing (empty) `sources` table survives. |
| 1.8 | Seed `sources` rows for the 20 live connectors + manual lanes | S | 1.7 | A data file inserting one row per connector (slug, display name equal to today's `events.source` string, adapter `legacy/<name>`, trust tier, state `active`), plus `ra-manual`, `ig-*`, `editorial-desk`, `manual`, `venue-submission`. Also a mapping table `legacy_source_labels(label → source slug)` for the long tail of labels: one label per feed venue name (→ its feed source), and 'Manual', 'Resident Advisor', '19hz.info', 'Dice' and similar (→ manual sources). | Every distinct `events.source` value maps to a slug through the connector rows or `legacy_source_labels`. The mapping query returns 0 unmapped labels, and the label list is reviewed by Jody once. |
| 1.9 | `places` import (TIGER + StatCan) | L | — | A script plus migration creating `places` (§4.4), loaded with MI/OH places + county subdivisions and ON CSDs whose polygons intersect the Orbit. Aliases are seeded from the 56 city entries in `index.html`'s `LOCATIONS`. The 40 neighborhood entries map to the existing `neighborhoods` table instead. May need to run on Jody's machine, since census.gov was unreachable from the cloud workspace. | All 56 LOCATIONS cities resolve to a place, and all 40 neighborhood entries resolve to `neighborhoods` rows. Totals per county are reported. Appendix C is replaced with the computed list. |
| 1.10 | Migration: PostGIS + `geo_regions` | S | — | Enable `postgis`. Load the full 1,090-vertex Detroit boundary from the City GIS layer. Add `in_orbit(lat,lng)` and `miles_from_border(lat,lng)` SQL functions, spheroidal (`use_spheroid = true`, §4.2). | Re-derive SERVICE_AREA.md's two tables under the new measure. Report every difference > 0.2 mi, and **every in/out flip** (watch Saginaw 75.4, Clinton County 75.4, Hillsdale 75.5) to Jody before any later WP relies on the function. SERVICE_AREA.md is updated with the new figures. |
| 1.11 | Venue geo columns + trigger | S | 1.10 | `venues.geo_precision, geo_source, distance_from_border_mi, in_orbit, place_id, country, region`, plus a trigger computing distance and `in_orbit` on lat/lng change. | Updating a venue's lat/lng recomputes its distance. A NULL lat/lng gives `in_orbit` NULL. |
| 1.12 | Boundary JS generated from DB + parity test | S | 1.10 | A script that exports the simplified ring into `_lib/detroit-boundary.js` and `index.html`'s copy, plus a parity test over 200 random points. | The test passes (max delta ≤ 0.2 mi). CI fails if the two copies drift. |
| 1.13 | Migration: `ingestion_issues` | S | — | The unified inbox table (§2.9). | Insert/resolve round trip. Indexes on `(status, kind, severity)`. |
| 1.14 | Migration: `category_mappings` | S | — | `(adapter or source_id, raw_value) → category slug`, seeded from the inline maps in the Ticketmaster, WDET, Visit Detroit and Playground connectors. | Every inline mapping in those 4 files has an equivalent row (a script diffs the two). |
| 1.15 | Migration: honest-gap constraints | S | — | `events.category` becomes nullable, rendered as "Other" and flagged for follow-up. `events.is_free` becomes nullable (unknown). Additive: existing rows are unchanged. Page code handles null for both. | Insert a row with null category and null `is_free`. It renders on the calendar and event page, and appears in the follow-up queue. |

---

## Phase 2 — Pipeline core

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 2.1 | `SourceEvent` v1 schema + validator | M | 1.3 | `lib/ingest/schema/source-event.js`: the §2.5 fields, hard rules (reject row) and soft rules (quality flags). | Fixture tests: a null title is rejected; `end < start` is rejected; month-precision is flagged not-publishable; an unknown field is warned. |
| 2.2 | Normalizer | M | 2.1, 1.14 | Time → `start_at`/`timezone` (with year rollover rules); text cleanup; price and currency; category mapping via the table; URL canonicalization (strips tracking, unwraps affiliate wrappers to get the matching key while keeping the display URL). | Fixtures cover Dec→Jan ranges, all four legacy `time_display` formats, a CAD price, and a Ticketmaster affiliate URL unwrapping to the Ticketmaster event id. |
| 2.3 | Migration + RPC: `ingest_jobs` queue | M | — | The table (§2.6), plus `claim_jobs(worker, n, lease_seconds)` using `FOR UPDATE SKIP LOCKED`, fenced `complete_job`/`fail_job` (they check `locked_by` and `attempts`; backoff on failure), and a `host_leases` table with an acquire/release RPC. | Concurrency test: two parallel claimers over 100 jobs, no job claimed twice, all completed. Fencing test: a worker whose lease expired can't complete a re-claimed job. Host lease: two workers never fetch the same host within its interval. |
| 2.4 | Adapter contract + registry loader | S | 2.1, 1.7 | `lib/ingest/adapters/index.js`: registry of adapters, a `configSchema` check, and `plan`/`parse` invocation helpers. | A dummy adapter with an invalid config is rejected at load. With a valid config, `plan()` returns requests. |
| 2.5 | Worker endpoint (fetch → extract → validate → upsert records) | L | 2.3, 2.4, 2.2, 2.6, 1.6, 1.4 | `api/ingest-worker.js`: claims jobs, runs `fetchWithPolicy`, stores the snapshot via 2.6, runs `parse`, normalizes, validates, and upserts `source_records` (hash-diffed on both the raw response and the extracted set), plus `source_record_versions` on change, within a time budget. Child jobs for `next` requests. Writes `source_runs`. It acknowledges `pg_net` calls immediately and continues via `waitUntil`. | E2E on a preview deploy: a local fixture ICS source is registered, and one tick yields `source_records` rows plus a `source_runs` success. A second tick with unchanged content yields `skipped_unchanged`. |
| 2.6 | Raw snapshot storage | S | 1.3 | A private Storage bucket `ingest-snapshots` plus a `lib/ingest/snapshots.js` helper (content-addressed, gzip), and a retention prune job (A7). No worker dependency: the helper is tested on its own. | The same content saved twice stores once. Prune deletes objects past retention and nothing else. |
| 2.7 | Merge engine (records → canonical) | L | 1.6, 2.1 | `lib/ingest/merge`: field precedence, `locked_fields`, `field_sources`, and patch-only updates. The migration adds `events.locked_fields, field_sources, primary_record_id, occurrence_status, listing_visibility`. | Fixtures: a lower-tier source can't overwrite a higher-tier value; `null` never clears; a locked field never changes; only changed columns are PATCHed. |
| 2.8 | Publish policy | S | 2.7 | The status assignment on canonical creation, per §2.7 (thresholds from config, A5). Status is never touched afterwards. | Fixtures for each row of the policy table. An existing `rejected` event stays rejected after a new record links to it. |
| 2.9 | Linker v0 (same-source only) | S | 2.7 | For now, a record either links to its existing canonical event (by previous link) or creates a new one. Cross-source matching comes in Phase 4. | Records from one source create and update canonical events 1:1, with no duplicates across two runs. |
| 2.10 | Legacy `events.source` → `source_id` backfill | S | 1.6, 1.8 | Populate `events.source_id` from the slug mapping. Create `source_records` for all existing rows (§5.9 step 1), keyed so the migrated adapters reproduce the same keys, or with an explicit mapping (see the Phase 3 recipe). | Zero events with a non-null `source` lack a `source_id`. The record count equals the event count. |
| 2.11 | Reconcile stage | M | 2.5, 2.7 | Missing counting within `coverageWindow`, gated on a complete run. Lifecycle rules. `lifecycle_missing` issues. `occurrence_status = cancelled` propagation. | Fixtures: a partial run never marks missing; a record absent twice in-window becomes `missing`; an out-of-window absence is ignored; a cancelled record shows cancelled. |
| 2.12 | Moderator edits set locks | S | 2.7 | `admin-events.js` `update_fields` and future edits append to `locked_fields` and set `field_sources`. A lock/unlock UI affordance in `admin.html`. A one-time lock backfill for fields edited by the follow-up batch SQL files, where they can be identified. | Edit a description in admin, then a source run with a different description: the moderator's value stays. Unlock and re-run: the source value applies. |
| 2.13 | ICS adapter + migrate `cron-feeds` (**M1**) | L | 2.5, 2.7, 2.8, 2.9, 2.10, 2.11, 2.14, 2.15 | `adapters/ics.js` on the shared `lib/ingest/ics.js`, with per-event `LOCATION` resolution. Every approved `feed_sources` row is mirrored into `sources` (`origin = organizer_submitted`), **plus a trigger that mirrors future approvals, pauses and rejections** until WP 5.8 merges the tables. Then shadow run → parity diff → cutover, and `cron-feeds` is removed from `vercel.json`. | The parity report shows the same event set (plus intended fixes such as expanded recurrences). A feed approved *after* cutover is polled within one cadence. Seven days of healthy runs. |
| 2.14 | Dispatcher + trigger (A1) | S | 2.3 | `api/ingest-dispatch.js` enqueues due sources (`next_run_at`), with adaptive cadence updates. `pg_cron` + `pg_net` schedules (or the alternative from A1). | For 24 h, every active source runs within its cadence ±15 min (query over `source_runs`). |
| 2.15 | Shared ICS/RRULE library | M | 1.3 | `lib/ingest/ics.js`, lifted from `cron-motorcitywine.js` and generalized. It adds INTERVAL, negative BYDAY ordinals, BYSETPOS, correct COUNT semantics (EXDATEs consume COUNT; RDATEs don't), UNTIL as a UTC date-time or DATE, cancelled masters, EXDATE/RDATE and RECURRENCE-ID. | An RFC 5545 fixture suite of ≥ 30 cases, including the MotorCity real-feed snapshot, a biweekly series, a "last Sunday" series, and a COUNT + EXDATE interaction. |
| 2.16 | Series model (PHASE0 §3) + materializer | M | 2.15, 2.7 | Migration: `event_series`, plus `events.series_id` and `recurrence_id`. A materializer job emits series occurrences as `source_records` keyed `series:<id>:<local start datetime>` (§2.8), on a 90-day horizon. | A weekly series materializes 13 occurrences. An EXDATE removes one. An override row replaces one. A same-day matinee + evening pair yields 2 records. Re-running is idempotent. |
| 2.17 | `ingest_writer` database role (**deferrable**) | M | 2.5, 2.7 | A Postgres role with insert/update on the ingestion tables, and `events` changes only through the merge RPC. The worker uses it instead of service-role (M2). This needs a custom-signed JWT for the role, or a direct Postgres connection from the worker, so it can wait until after Phase 3. | The worker runs end to end under the role. A direct `DELETE FROM events` with the role's credentials is refused. |
| 2.18 | Record continuity for keyless sources | M | 2.5 | §5.2: a keyless record is compared with the same source's records that went missing in the same run (start ±15 min, same venue, title similarity ≥ 0.6). On a match it inherits the old key. Otherwise it gets a synthetic key, `hash(source_id, local start minute, venue_id or place)`. | Fixtures: a title edit keeps the key (no new canonical event); two different shows at the same venue on different days get different keys; a title change combined with a time change beyond ±15 min creates a new record. |

---

## Phase 3 — Legacy migration (strangler)

**The standard recipe for every WP in this phase:**

1. Wrap the connector's parse logic unchanged as `adapters/legacy/<name>.js`, or map it straight onto a generic adapter where the last column says so.
2. Register it in the source registry.
3. **Key mapping.** If the new adapter's `source_key` differs from the old `external_id` (UID instead of title-hash, continuity keys, and so on), write an explicit old → new key map from the shadow run. Re-key the 2.10 backfill records *before* cutover, so they aren't all marked missing and duplicated.
4. Shadow-run it for ≥ 3 runs.
5. Produce a parity diff report (`test/parity/<name>.md`).
6. Fix the intended differences.
7. Cut over, delete the cron line, and move the old file into `api/_legacy/` for one release, then delete it.

**Every WP's test:** a parity report with 0 unexplained differences, then 7 days `healthy` after cutover.

| WP | Connector | Size | Dep | Target | Notes / intended fixes during migration |
|---|---|---|---|---|---|
| 3.0 | *(prerequisite, not a connector)* `html-recipe` engine | M | 1.1, 2.4 | `html-recipe` | The declarative engine from §7.5 (cheerio): item selectors, field transforms, date hints, inherit-from-heading, required set, declared defaults with `time_approximate`, and page fingerprint. No LLM. **Test:** three HTML fixture pages (a date-grouped list, a card grid, a table) parse to the expected `SourceEvent`s, and a missing required field rejects the row, not the page. |
| 3.1 | Outer Limits Lounge | S | 2.13 | `squarespace-json` (new generic) | Clean. It's the first generic-adapter proof. |
| 3.2 | Ticketmaster | L | 2.13, 4.1 | `ticketmaster` (tiled, §4.6) | Adaptive tiling, `geoPoint`, venue external IDs retained, add-on detection hook, affiliate URL kept for display. Fixes G5, G6 and D1. |
| 3.3 | Visit Detroit | M | 2.13 | `algolia-visitdetroit` | **Keep** its private one-way dedupe as a pre-merge filter until WP 4.10 turns on live matching; remove it in 4.10. Add paging. Mapping moves into `category_mappings`. |
| 3.4 | WDET | S | 3.5 | `tribe-rest` | Remove the city allowlist (G1). Real pagination. No free guess. |
| 3.5 | Belle Isle Nature Center | S | 2.13 | `tribe-rest` (new generic) | First Tribe proof. `end_date` handled. |
| 3.6 | MotorCity Wine | S | 2.13 | `ics` | Replaces the private RRULE code. Fixes the cancelled series. The title-hash ID is replaced by UID + RECURRENCE-ID. |
| 3.7 | Planet Ant (CrowdWork) | S | 2.13 | `crowdwork` | Detroit-local window. Record the block status. |
| 3.8 | Detroit Month of Design | M | 2.13 | `sitemap-detail` + `jsonld` (new generic) | Real JSON-LD parsing. Detail pages become child jobs (removes the 180 s requirement). |
| 3.9 | Playground Detroit | M | 3.8 | `wp-mec` + child jobs | Crawl delay through per-host politeness instead of `sleep`. |
| 3.10 | Lager House | M | 2.13, 3.0 | `html-recipe` or `legacy` | Venue split (Lager House vs After Hours @ Brooklyn) through venue resolution. |
| 3.11 | Old Miami (rockindetroit) | S | 2.13 | `legacy` | Consistent price nulls. |
| 3.12 | HALO | S | 2.13, 2.18 | `legacy` + continuity keys | Title-based ID replaced (§5.2). |
| 3.13 | Dossin | S | 2.13, 2.18 | `legacy` + continuity keys | Same. |
| 3.14 | Redford Theatre | M | 2.13, 2.18 | `legacy` + continuity | Category mapping by keywords instead of all "film". Null titles handled by validation. |
| 3.15 | Trinosophes | M | 2.13, 3.0 | `html-recipe` (strict) | Date-grouped recipe; null time instead of 7 PM; no junk lines. If the recipe can't reach parity with correct output, pause the source. |
| 3.16 | Cinema Detroit | M | 2.13, 3.0 | `jsonld`/`html-recipe` | Scope limited to film pages. Pending until the audit passes. |
| 3.17 | Detroit Training | S | 2.13, 3.0 | `html-recipe` | Rollover fix through the normalizer. Cap after dedupe. |
| 3.18 | Popps Packing | S | 2.13 | `legacy` with `start_precision` | Future filter. Reviewer dates protected by locks (2.12). |
| 3.19 | Metro Times | S | 0.13 | registry row `blocked` | No migration of fetch code. Registry row plus outreach task only (§7.7). |
| 3.20 | Editorial feeds onto shared lib | M | 1.3, 1.4 | `cron-editorial` uses the shared http/text libs and paginated queries, and stops nulling `matched_event_id` on non-match (the :628 churn). The feed list moves to a table. | The match-churn test: a retry-matched article keeps its match after the next nightly run. |
| 3.21 | Remove legacy boilerplate | S | 3.1–3.18 | Delete `api/_legacy/*`. `vercel.json` ingestion crons are gone except the dispatcher and worker. | `grep -l timingSafeStringEqual api/` shows only `lib/ingest/auth.js` consumers. `vercel.json` cron count drops by 20. |

---

## Phase 4 — Entity resolution & dedupe

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 4.1 | `venue_aliases` + `venue_external_ids` | S | 1.11 | Migration (PHASE0 §4, extended with external IDs). Seeded from distinct `venue_name_raw` values that exactly match existing venues. | Every current exact-name match is reproduced through the alias path. |
| 4.2 | Geocoder client + cache (A6) | M | 1.11 | `resolve/geocode.js`: Census (US) and the chosen Canadian provider, a permanent `geocode_cache`, and rate limiting. | Fixture addresses (US and ON) geocode. The second call is a cache hit. The rate limit is respected under load. |
| 4.3 | Venue coordinate backfill | M | 4.2 | Geocode every venue lacking lat/lng; precision recorded; `geo_unresolved` issues for failures. | ≥ 90% of venues have street precision or better. The remainder are in the inbox. |
| 4.4 | Venue resolver (full cascade) | L | 4.1, 4.2, 1.9 | §5.5 cascade: alias → external ID → candidates → score → link / review / create-unverified (A2). | The gold venue set (≥ 60 pairs, including DIA variants, Majestic/Magic Stick rooms, "Theatre/Theater") is resolved with precision ≥ 0.98. |
| 4.5 | Title normalizer + add-on classifier | M | 2.2 | `match/normalize.js` and `listing_kind` detection (Ticketmaster packages, parking, suites). | Fixtures from `dedupe-batch3-tm-package-variants`: all variants become `add_on`, and the main events stay `event`. |
| 4.6 | Blocking + features | M | 4.5, 4.4 | `match/block.js`, `match/features.js` (§5.3). | Unit tests per feature. Blocking recall on the gold set is 100% (every true pair shares a block). |
| 4.7 | Gold set assembly | M | 2.10 | `test/gold/event_pairs.json`, built from the archive dedupe files (positives; hard-deleted pairs from their SQL comments), the hard negatives (§5.8), **and random non-duplicate pairs drawn from the same blocks**. | ≥ 150 positive and ≥ 300 negative labelled pairs, each with the source of its label cited. |
| 4.8 | Matcher in shadow mode | M | 4.6, 4.7 | Scoring and decisions (§5.4) run over all records. Proposals are written to `match_candidates`, with no links changed. | Precision/recall report on the gold set. Weights and thresholds are calibrated until precision ≥ 0.98 at auto-link. |
| 4.9 | Merge/unmerge RPCs | M | 2.7 | `merge_events(survivor, loser)` and `unmerge(record_ids)`. The `'merged'` status (standalone enum migration), `merged_into_event_id`, `editorial_article_events` re-pointing, and the `event.html` redirect for merged ids. | Merge then unmerge restores the original state (a snapshot diff is empty). An editorial link follows the merge. |
| 4.10 | Enable live matching (**M3**) | S | 4.8, 4.9, 4.11 | Auto-link at the calibrated threshold and deterministic rule. The review band opens `match_review` issues. Visit Detroit's private dedupe is removed (see 3.3). | One week live: ≥ 150 sampled auto-links, all correct, which gives a 95% lower bound of ≈ 0.98 on precision. No hard-constraint violations in the logs. |
| 4.11 | Match review UI | M | 1.13, 4.9 | An `admin.html` inbox panel: side-by-side diff, signals, and Same / Different / Add-on / Series actions. Negative pairs are stored. | A moderator can resolve 10 queued items. A "Different" pair is never re-proposed. |
| 4.12 | Historical duplicate reconstruction | S | 4.9, 2.10 | Duplicates that archive files **rejected** (they still exist) are re-linked to their survivors as `manual` records (§5.9 step 2). Hard-deleted duplicates are out of scope, since only their SQL comments remain. | Every row still present and rejected by a dedupe file is `merged` into its survivor, with its provenance visible. |
| 4.13 | Organizations from sources | S | 1.7 | Rename or extend `organizers` into organizations. Populate one per source. `organizer_match` feature enabled. | Every source has an organization. Feature tests pass. |

---

## Phase 5 — Registry, discovery & onboarding

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 5.1 | Policy gate in `fetchWithPolicy` | M | 1.3, 1.7 | `robots.js` (cache, UA and `*`, AI-crawler detection), the permission-basis check, and `policy_denied` issues. The honest UA and a public `/bot` page. | Fixtures: a disallowed path is refused, an AI-crawler-block source is refused, an allowed path passes. The `/bot` page is live. |
| 5.2 | Block-page classifier | S | 1.3 | Signatures for Cloudflare, DataDome, Akamai, Imperva, PerimeterX and generic 403 → `block_type`. On a block, the source is quarantined and reconcile is suppressed. | Stored challenge-page fixtures are classified correctly. A clean 403 JSON error is not called a challenge. |
| 5.3 | `admin-sources.js` API | M | 1.7, 1.13 | List/filter, detail, config edit (schema-validated), pause/resume/retire, run now. | Auth tests (401), a config validation error returns 400, pause stops dispatch (no new runs for 24 h). |
| 5.4 | Source console UI | L | 5.3 | An `admin.html` "Sources" tab: registry list, per-source page, the last 30 runs, records, and unique-contribution count. | A moderator can find a failing source, see its error sample and pause it without SQL. |
| 5.5 | Probe / fingerprint engine | L | 5.1, 2.4 | `probe(url)` (§3.5), plus a `probe` method for the ICS, Tribe, Squarespace, JSON-LD, Localist, LibCal, CivicPlus and LibraryCalendar adapters. | A fixture suite of 20 saved home pages (known platforms), with correct adapter suggestions for ≥ 18. |
| 5.6 | Dry-run preview | M | 2.5, 4.4, 4.8 | `trigger = dryrun` runs: parse, resolve, match, but never merge. The preview shows events, the geo verdict, duplicate candidates and quality flags. | A dry run of a registered fixture source writes no `events` or `source_records` rows and returns a preview payload. |
| 5.7 | Admin "register a URL / feed" | S | 5.5, 5.6 | Paste URL → probe → pick a suggestion → dry run → approve → `active`. Generalizes PHASE0 §5. | End to end: a real public ICS URL goes from paste to active in under 5 minutes of moderator time. |
| 5.8 | Merge `feed_sources` into `sources` (**M4**) | M | 2.13, 5.7 | `submit-feed.js` writes `sources` (`state = candidate`, `origin = organizer_submitted`). A compatibility view keeps the `admin-feeds` endpoint working. Organizer submissions get the dry-run preview before approval. | The public submit flow still works. A submission appears in the console with a preview. The healthcheck `submit-feed validation` still passes. |
| 5.9 | Research import (PHASE0 §7) | M | 1.7 | A script importing the 213-row draft, SOURCE MASTER and PRODUCTION REGISTRY, in that order, with the Planet Ant special case and `imported_from` provenance, then re-verification against the live registry rows. | Row counts reconcile (imported = 213 + 20 + 52 − documented overlaps). No imported row overrides a live connector's state. |
| 5.10 | Discovery: venue-driven reverse discovery (DC3) | S | 4.4 | A nightly job: venues with ≥ 3 upcoming aggregator-only events and no first-party source become `source_candidate` issues, ranked. | Produces a ranked list. The top 10 are spot-checked for sanity. |
| 5.11 | Discovery: outbound-link mining (DC4) | S | 1.6 | Domains in record URLs that aren't in the registry are grouped and ranked, then turned into candidates. | Candidates include known organizer domains seen in Ticketmaster and RA records. |
| 5.12 | Priority scoring (start simple) | S | 5.6, 7.9 | v1 sorts the triage queue by dry-run unique events per month × a geo-gap flag (place has no active source). The full §6.2 formula is adopted only if v1's ordering proves inadequate. | The queue sorts by the v1 score. A candidate in an empty place outranks an equal-volume one in a covered place. |
| 5.13 | Generated `sources.html` | M | 5.4 | The public page is rendered from the registry (display fields only). The hand-maintained tables are removed. | Page parity check: every source currently on the page appears (or is intentionally retired), and none of the policy notes leak. |

---

## Phase 6 — Platform adapters & coverage expansion

Each adapter WP delivers four things: the adapter, a fixture suite, `probe` support, and **one pilot source** taken through dry run to active. It is not done until the pilot has 7 healthy days.

Each *batch* WP is registry work only: probe, dry run and approve N tenants. No new code.

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 6.1 | `localist` adapter | M | 5.6 | The Localist API v2 adapter, paginated, with the place → venue mapping. Pilot: University of Michigan. | Pilot active. Venue resolution ≥ 90% linked. |
| 6.2 | Batch: Localist tenants | S | 6.1 | Probe and onboard BGSU, then confirm and onboard Wayne State, Macomb CC, MSU and UToledo if they're Localist tenants. | Each tenant is active or documented as not Localist. |
| 6.3 | `jsonld` generic adapter hardening | M | 3.8 | Listing-page discovery, `EventSeries`, and `eventStatus` mapping. Pilot: one first-party venue found by probing. | The fixture suite covers 5 real-world JSON-LD variants. |
| 6.4 | Batch: Tribe tenants | S | 3.5 | TWEPI (first Ontario source), Capitol Theatre Windsor, Michigan Science Center, EPIC Wine Country, plus any found by probing. | ≥ 3 active, and Ontario events visible with `country = CA`. |
| 6.5 | `libcal` adapter | M | 5.6 | The public calendar ICS/RSS or the API (keyed). Pilot: Wood County District Public Library. | Pilot active, with library branches resolved as venues. |
| 6.6 | `librarycalendar` adapter | M | 5.6 | Pilot: Novi, Orion Township or Plymouth District Library. | Pilot active. |
| 6.7 | `communico` adapter (keyed or public) | M | 5.6, A11 | Pilot: Essex County Library, Toledo-Lucas County Public Library or Clinton-Macomb Public Library, once access is confirmed. | Pilot active, or a documented partnership ask. |
| 6.8 | `civicplus` adapter | M | 5.6 | The CivicEngage calendar RSS/iCal. Pilot: Royal Oak or Ferndale. | Pilot active. |
| 6.9 | Batch: municipal CivicPlus tenants | S | 6.8 | Wyandotte, Taylor, Plymouth DDA, Dearborn Heights, and those found by the DC2 sweep. | ≥ 4 active. |
| 6.10 | Parks: Huron-Clinton Metroparks + Metroparks Toledo | M | 5.6 | Adapter chosen by probe (likely Tribe/JSON-LD for HCMA; WebTrac for Toledo, which is a recipe or needs a partnership). | ≥ 1 active, and its many venues resolved. |
| 6.11 | `fever` adapter | M | 5.6 | The self-serve API (OAuth2). Pilot: Michigan Central. | Pilot active. Uniqueness vs Ticketmaster reported. |
| 6.12 | `humanitix` + `eventbrite-org` adapters | M | 5.6 | Organizer-authorized keys only. Pilot: any regional organizer who grants access. | Adapter fixture tests pass. Pilot active, or it waits on an organizer. |
| 6.13 | `growthzone` adapter | M | 5.6, A11 | Keyed per chamber or vendor. Pilot: one chamber that provides a key. | Pilot active, or a documented pending key. |
| 6.14 | Recipe suggester (LLM-assisted, **deferrable**) | M | 3.0, 5.6 | An admin "suggest recipe" action that proposes selectors from a sample page (A12). The result is always a draft; a human approves the dry-run output before activation. | A suggested recipe for a fixture page parses correctly after approval. An unapproved suggestion can't activate. |
| 6.15 | Batch: jurisdiction sweep, ring R3 first | M | 5.9, 7.9, 1.9 | Run the DC2 checklist for every R3 place (Lansing/East Lansing, Jackson, Flint, Port Huron, Sarnia, Chatham, Toledo, Sandusky OH, Port Clinton, Adrian, Owosso, Bowling Green). Candidates probed. | The coverage matrix shows every R3 place with ≥ 1 active or candidate source per checklist item, or "none exists" recorded. |
| 6.16 | Batch: jurisdiction sweep, R2 then R1 | L | 6.15 | Same for R2 and R1 places. | The same criterion for R2 and R1. |

---

## Phase 7 — Monitoring, alerting & metrics

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 7.1 | Full `source_runs` + `source_fetches` schema | S | 2.5 | The §8.1 columns (extends 0.5), fetch rows and rejected-record log, with pruning. | A run writes the full record. Pruning keeps 30 days. |
| 7.2 | Detector framework + first 6 detectors | M | 7.1 | Zero-yield, volume drop, mass missing (suppresses reconcile), reject spike, block page, saturation. | Fixture histories trigger each detector exactly when expected. |
| 7.3 | Remaining detectors | M | 7.2 | Constant value, all-past/far-future, inverted ranges, junk title, stuck window, drift, timeout, stale calendar, orbit leakage (§8.3). | Replays of the real incidents (Trinosophes, Popps, Metro Times slice, Cinema Detroit pages) fire the right detectors. |
| 7.4 | Health state machine | S | 7.2 | §8.2 transitions, auto-quarantine and auto-recovery, `source_state_log`. | Scripted run sequences produce the expected state paths. |
| 7.5 | Alerts (immediate) | S | 7.4 | Email through Resend on the §8.4 conditions, deduplicated per state change. | A forced P0 failure gives exactly one email. A second failure run gives no new email. |
| 7.6 | Daily digest | M | 7.4, 1.13 | The 8 am ET email (§8.4 contents). | The digest renders from real data. All sections are present. It's sent once per day. |
| 7.7 | Healthcheck rework | S | 7.4 | Source lists generated from the registry. The freshness logic is replaced by the health model. Platform checks kept. | Adding a source adds its checks automatically. There are no hard-coded source names left in the file. |
| 7.8 | Synthetic end-to-end canary | S | 2.13 | An internal ICS feed with a rotating event, ingested hourly; the healthcheck asserts it's visible in `events_public`. | Breaking any stage (e.g. disabling the worker) fails the canary within 2 hours. |
| 7.9 | Coverage matrix | M | 1.9, 2.10 | `metrics_daily` jobs: place × category active sources, candidates and upcoming events, with ring and county rollups, and an admin view. | Totals reconcile with direct counts. Empty cells are listed. |
| 7.10 | Quality metrics | M | 7.1, 2.7 | Completeness score, field completeness, validity, stale rate, cancellation and change latency, lead time, overturn rate (§9.1). | Metrics are computed for a day, and spot checks of 3 metrics against manual queries match. |
| 7.11 | Audit sampling tool | S | 1.13 | A weekly stratified sample of 30 events presented for human verification, with results stored in `quality_audits`. It also checks for duplicates. | A sample is generated, results are recorded, and accuracy is computed. |
| 7.12 | Benchmark recall + capture–recapture (**capture–recapture deferrable**) | M | 7.9, 4.10 | A benchmark sample entry form for events found through channels independent of our sources, matched against the catalogue. Recall is reported as a rolling 4-week pool. Dependency concentration (HHI and sole-source share). Chapman estimates per stratum, with the caveats from §9.2. | Recall is reported with a confidence interval. The Ticketmaster sole-source share matches a direct query. |

---

## Phase 8 — Assisted capture & JS worker

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 8.1 | `api/ingest-intake` | S | 2.5 | An authenticated endpoint accepting `SourceEvent[]` for a registered manual or render source. Same validation and upsert path. | Posted records appear as `source_records` for the right source. A bad secret gives 401. |
| 8.2 | Capture tool UI | L | 8.1, 4.4, 4.8 | `admin.html` "Capture": paste URL/text/flyer, extract a draft, preview (venue, geo, duplicate candidates, flags), confirm. The flyer uploads to `event-flyers` in the same step. | One real flyer goes from upload to published with no SQL, and its duplicate check caught against a seeded duplicate. |
| 8.3 | Agent-session payload format | S | 8.1 | A documented JSON payload that agent-assisted sessions produce instead of SQL files, validated by 8.1. | A sample session output validates and imports. |
| 8.4 | Migrate recent manual SQL batches as records | S | 8.1, 2.10 | RA pulls 1–9 and the Instagram pulls are represented as `source_records` of their manual sources (provenance only). | Every `ra-*` event has a record under `ra-manual`. |
| 8.5 | RA / Instagram policy decision applied (A3) | S | — | Whatever Jody decides for A3 is recorded in the registry policy fields, and in `sources.html` if it's public. | Registry rows reflect the decision. The capture tool shows the policy note on those sources. |
| 8.6 | Render worker (if A4 approved) | L | 5.1, 8.1 | A GitHub Actions scheduled Playwright job that claims `js_rendered` jobs through the API, respects robots, the UA and per-host limits, and posts HTML snapshots or records to intake. | Pilot: one permitted JS-only source is active. The worker never processes a source whose policy denies it (test with a denied fixture). |
| 8.7 | Outreach tracker | S | 5.3 | Registry fields and a console view for partnership and feed asks (sent, response, outcome), with drafted ask text generated from the source row. | The Scarab, Metro Times, RA, CrowdWork and Communico asks are tracked. |

---

## Phase 9 — Public-site integration & cleanup

| WP | Title | Size | Dep | Deliverable | Test |
|---|---|---|---|---|---|
| 9.1 | `events_public` v2 | S | 1.5, 1.11, 2.7 | The view adds `start_at, end_at, timezone, occurrence_status, venue_lat, venue_lng, in_orbit, distance_from_border_mi, country, currency, place_name`, **appended at the end of the column list** (the lesson from migration_034). It excludes `merged` and `listing_visibility = hidden`. | Existing pages are unaffected (healthcheck). The new columns are populated. |
| 9.2 | `index.html` Orbit filter uses `in_orbit` / coordinates | M | 9.1, 1.9 | The Orbit view and hero count use `in_orbit`. Radius filters use venue coordinates. The location picker comes from generated `places` JSON. The hard-coded `LOCATIONS` is removed. | An event in a city not in the old list (e.g. Chelsea) now appears in the Orbit view. Hero count parity is explained. |
| 9.3 | Time display from `start_at` | M | 9.1 | Tonight, now and sorting all use `start_at`. `time_display` is rendered from timestamps where present. | "Tonight" matches a direct SQL query for the next 24 h in America/Detroit. |
| 9.4 | Cancelled / postponed display | S | 9.1, 2.11 | A badge on cards and event pages. Cancelled events drop off listings after 7 days. | A seeded cancelled event shows the badge and is hidden after 7 days. |
| 9.5 | CAD price display | S | 9.1 | "CA$" for CAD prices. | An Ontario event shows CA$. |
| 9.6 | Add-on / series display | S | 4.5, 2.16 | Add-ons appear as "more ticket options" on the parent. Series show "also on…". | A Ticketmaster event with packages shows one card and the options on its event page. |
| 9.7 | README + docs refresh | S | 3.21 | The README describes the pipeline. `SOURCE_REGISTRY_ARCHITECTURE.md` and `FEED_SUBMISSIONS.md` are marked superseded, with pointers. `SERVICE_AREA.md` references `geo_regions`. | Docs review checklist complete. |
| 9.8 | Retire legacy fields (optional, later) | S | 9.2, 9.3 | Decide whether `start_date`/`time_display`/`venue_city_raw` stay as derived columns or are dropped. | A decision recorded. If dropped, all readers are migrated first (grep = 0). |

---

## Gap → WP traceability

Every gap in `INGESTION_PLATFORM_ARCHITECTURE.md` §1 maps to at least one WP. A gap is **closed** when its last listed WP is done.

| Gap(s) | WPs |
|---|---|
| A1 source = code | 2.4, 2.13, 3.x, 5.7 |
| A2 fixed daily cadence | 2.14 |
| A3 single-invocation crawls | 0.15 (interim), 2.5 (child jobs), 3.8, 3.9 |
| A4 sequential feed poller | 2.13 |
| A5 no shared lib | 1.3, 1.4, 3.21 |
| A6 no tests | 1.2, all fixture tests |
| A7 no raw payloads | 2.6 |
| B1–B3 registry unused / fragmented / free-text identity | 1.7, 1.8, 2.10, 5.8 |
| B4 lifecycle | 1.7, 7.4 |
| B5 policy not data | 1.7, 5.1 |
| B6 admin register / preview | 0.19, 5.6, 5.7 |
| B7 discovery → spreadsheets | 5.9, 5.10, 5.11, 6.15, 6.16 |
| C1 timestamps | 1.5, 2.2, 9.3 |
| C2 country / currency | 1.9, 1.11, 9.5 |
| C3 lifecycle vs moderation | 2.7, 2.11, 9.4 |
| C4 provenance / locks | 2.7, 2.12 |
| C5 recurrence | 2.15, 2.16 |
| Honest-gap constraints (§2.5) | 1.15 |
| C6 categories | 1.14 (the enum→table consolidation itself is left optional; `category_mappings` removes the inline-code duplication) |
| C7 organizers | 4.13 |
| C8 add-ons | 4.5, 9.6 |
| D1 overwrites | 0.7, 0.8 (interim), 2.7, 2.12 |
| D2 venue wipe | 0.6, 2.7 |
| D3 batch failure | 0.9, 2.1 |
| D4 mixed keys | 0.11, 0.7, 1.4 |
| D5 unquoted in() | 1.4 |
| D6 manual bypass | 8.1–8.4 |
| D7 status-lookup failure re-approves | 0.17, 2.7 |
| E1 cross-source dedupe | 4.6–4.10 |
| E2 title IDs | 2.18, 3.12–3.15 |
| E3 destructive dedupe | 4.9, 4.12 |
| E4 venue identity | 4.1, 4.4 |
| E5 unbounded queries | 1.4, 3.3, 3.20 |
| F1–F3 lifecycle | 0.14, 2.11, 3.6 |
| G1 one-connector geo | 3.4, §4.3 via 4.4 |
| G2 client string lookup | 1.9, 9.2 |
| G3 sparse coordinates | 4.2, 4.3 |
| G4 duplicated polygon | 1.12 |
| G5–G6 Ticketmaster truncation / margin | 0.10, 0.18, 3.2 |
| G7 unresearched Orbit areas | 1.9, 6.15, 6.16 |
| H1 Ticketmaster dependency | 6.x, 7.12 |
| H2 no coverage measure | 7.9, 7.12 |
| H3 multipliers unexploited | 6.1–6.13 |
| H4 manual lane doesn't compound | 8.2, 8.3 |
| I1 timeouts | 0.3, 1.3 |
| I2 conditional GET | 1.3, 2.5 |
| I3 UA inconsistency | 1.3, 5.1 |
| I4 robots / rate limits | 5.1, 2.5 |
| I5 blocked-source hammering | 0.13, 5.2 |
| J1–J2 time bugs | 0.12, 2.2 |
| K1 200-on-failure | 0.4 |
| K2 no run log | 0.5, 7.1 |
| K3–K4 freshness / healthcheck lists | 0.16 (interim), 7.4, 7.7 |
| K5 no alerting | 7.5, 7.6 |
| K6 silent-wrongness detectors | 0.14 (interim), 7.2, 7.3 |
| L1 no source console | 5.3, 5.4 |
| L2 no merge UI | 4.11 |
| L3 fragmented queues | 1.13, 4.11, 7.6 |
| L4 corrections not protected | 2.12 |
| M1 optional cron auth | 0.2 |
| M2 service-role everywhere | 2.17 |

---

## Effort, and what to defer

By size class, the backlog has 75 S, 57 M and 11 L packages. At the midpoints (S ≈ ½ day, M ≈ 1½, L ≈ 4) that's roughly **165 focused days**. That's a lot for a one-person project, even with Claude doing most of the implementation, so here is the minimum path.

**Minimum path to "scales without getting more fragile"** (80 WPs, about 95 focused days, dependency-closed):

- Phase 0 (all 19)
- 1.1–1.11, 1.13–1.15
- 2.1–2.16 and 2.18
- the Phase 3 migrations 3.1–3.6 (Outer Limits, Ticketmaster, Visit Detroit, WDET, Belle Isle, MotorCity), plus feeds via 2.13
- 4.1, 4.2, 4.4–4.11
- 5.1–5.8
- 7.1–7.6

**Deferrable without harming the core:**

| WP(s) | What's deferred |
|---|---|
| 2.17 | Custom database role |
| 6.14 | LLM recipe suggester |
| 7.12 | The capture–recapture part |
| §9.2 | The density-per-10k metric |
| 8.6 | Render worker (only if A4 says yes) |
| 5.12 beyond v1 | Full priority scoring |
| 9.8 | Retiring legacy fields |

**Order of expansion vs. foundation:** don't start Phase 6 batches before 4.10 (live matching). Every multiplier adapter adds sources that overlap Ticketmaster and Visit Detroit, and without matching they multiply duplicates. That's the exact failure the 11 manual dedupe batches were cleaning up.

## Suggested first sprint (after approval)

All of Phase 0 (19 WPs, nearly all size S; 0.17 first), plus WPs 1.1 and 1.2. None of these depend on any Appendix A decision. Only 0.13 and 0.14 need a quick product OK. Afterwards, the site is:

- **defect-free** on the known S1 issues,
- **observable**, because every run is logged with outcomes,
- **measurable**, with Ticketmaster truncation and block status confirmed with evidence.

Phase 1 then starts from measured baselines rather than estimates.
