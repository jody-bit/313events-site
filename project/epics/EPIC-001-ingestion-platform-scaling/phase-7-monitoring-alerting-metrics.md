# EPIC-001 / Phase 7 — Monitoring, Alerting & Metrics

**Architecture Gate:** No blanket pre-phase gate. Per the routing directive: "Primarily Sonnet 5. Opus review of health/coverage architecture where appropriate." Flagged below for WP 7.4 (health state machine — the core model everything else in this phase reacts to) and WP 7.9/7.12 (coverage matrix and capture–recapture estimation — statistically consequential).
**Recommended Model:** Sonnet 5 by default; Opus 5 review recommended (not mandatory) for 7.4, 7.9, and 7.12.
**Milestone:** None of this phase's WPs is itself a named milestone, but several (7.1–7.6) are on the "minimum path to scale without fragility."
**Product Owner Decision relevant to this phase:** **A10** (category mix targets) is listed by Appendix A as blocking "Phase 7," most plausibly relevant to WP 7.9/7.10 (coverage/quality metrics), though it isn't explicitly cited by WP number in either source document. Noted as-is. No other Appendix A decision blocks this phase.
**Status of this phase:** Prepared for grooming. Nothing implemented. Nothing in `IN PROGRESS`.

Full technical detail: `INGESTION_PLATFORM_ARCHITECTURE.md` §8 (monitoring and failure detection) and §9 (data-quality and coverage metrics, including the Chapman capture–recapture formula).

**Note on the "§9.2" deferral:** the Effort/deferral table in `INGESTION_BACKLOG.md` lists "§9.2 — the density-per-10k metric" as deferrable. That `§9.2` is a reference to a subsection of `INGESTION_PLATFORM_ARCHITECTURE.md`'s data-quality section (part of the coverage/quality metrics this phase implements, likely folded into WP 7.9 or 7.10) — it is **not** a reference to Phase 9's WP 9.2 (the `index.html` Orbit-filter rework), which is an unrelated WP in a different phase. Flagged here to avoid that mix-up.

---

## Technical specification (verbatim from INGESTION_BACKLOG.md — authoritative)

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

## Project-management tracking

| WP | Status | Priority | Recommended Model | Architecture Gate | Product Owner Decision | Blocked By |
|---|---|---|---|---|---|---|
| 7.1 | BACKLOG | High (minimum path) | Sonnet 5 | None flagged | — | WP 2.5 |
| 7.2 | BACKLOG | High (minimum path) | Sonnet 5 | None flagged | — | WP 7.1 |
| 7.3 | BACKLOG | Medium (not on minimum path, but replays real historical incidents — high evidentiary value) | Sonnet 5 | None flagged | — | WP 7.2 |
| 7.4 | BACKLOG | High (minimum path) | Sonnet 5 | Opus 5 review recommended (core health-state model) | — | WP 7.2 |
| 7.5 | BACKLOG | High (minimum path) | Sonnet 5 | None flagged | — | WP 7.4 |
| 7.6 | BACKLOG | High (minimum path) | Sonnet 5 | None flagged | — | WP 7.4, 1.13 |
| 7.7 | BACKLOG | Medium (not on minimum path; replaces today's hard-coded, already-stale healthcheck lists) | Sonnet 5 | None flagged | — | WP 7.4 |
| 7.8 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None flagged | — | WP 2.13 (M1) |
| 7.9 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | Opus 5 review recommended (statistically consequential) | A10 (category mix targets) — plausibly relevant, not explicitly cited by WP number | WP 1.9, 2.10 |
| 7.10 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None flagged | A10 (category mix targets) — plausibly relevant, not explicitly cited by WP number | WP 7.1, 2.7 |
| 7.11 | BACKLOG | Medium (not on minimum path) | Sonnet 5 | None flagged | — | WP 1.13 |
| 7.12 | BACKLOG | Medium overall; **the capture–recapture component specifically is explicitly deferrable** | Sonnet 5 | Opus 5 review recommended (statistically consequential) | — | WP 7.9; Milestone M3 (WP 4.10) |
