# EPIC-001 — Ingestion Platform Scaling

**Status:** **Approved as technical direction**, subject to the explicit Product Owner decisions in Appendix A (`APPENDIX-A-DECISIONS.md`, A1–A12 — all currently undecided). This is no longer a proposal awaiting review — the architecture and its phased backlog have been reviewed and adopted by the Product Owner. **Nothing has been implemented yet.** No code, schema, or migration has changed. **WP 0.17** (Phase 0, status-lookup safety) was pulled by the Product Owner on 2026-09-21 and is `IN PROGRESS` — see `epics/EPIC-001-ingestion-platform-scaling/phase-0-stabilize-instrument.md`. No other work package has been pulled.

## Objective (preserved verbatim from the architecture)

"Find every event in the Detroit Orbit, continuously. The Detroit Orbit is every point within 75 miles of Detroit's municipal border, across Michigan, Ohio and Ontario. Coverage should keep growing without the system getting more fragile as it grows."

## Why it matters

A comprehensive, evidence-based audit (`INGESTION_PLATFORM_ARCHITECTURE.md` §0–§1, verified against the repository at commit `4cfd997`) found 67 gaps, several of them live, ongoing defects — not just scaling limitations. Ticketmaster alone was 81% of upcoming approved events as of 2026-09-05, and the current one-file-per-source model (6,547 lines across 20 connectors, plus 77 hand-written SQL files in four weeks) cannot reach the hundreds-to-thousands of sources the Orbit realistically contains.

## The plan, in one paragraph

Sources become registry rows pointing at reusable adapters, not one bespoke file per source. Every source — automated or hand-captured — goes through the same staged, idempotent pipeline (fetch → extract → normalize → validate → resolve → match → merge → publish → reconcile → observe). Each sighting becomes a `source_record`; canonical `events` rows are built from one or more records by field-precedence merge, so moderator edits are never silently overwritten and a re-run can never silently reverse a rejection. Geography is computed once per venue against a stored PostGIS polygon, not guessed per event from a hard-coded city list. Health and coverage are measured, not assumed. The migration is incremental ("strangler" pattern): every existing cron keeps running until it's re-expressed as an adapter and passes a shadow-mode parity check — nothing is replaced wholesale. Full detail: `INGESTION_PLATFORM_ARCHITECTURE.md`; full phased backlog: `INGESTION_BACKLOG.md`. Neither is duplicated here — this epic and its phase files are the managed, trackable index over that detailed technical specification, which remains authoritative for the specifications themselves.

## The 10 phases

| Phase | Theme | Outcome at phase end | WPs | Architecture Gate | File |
|---|---|---|---|---|---|
| 0 | Stabilize & instrument | Live data-loss defects fixed. Every legacy run is logged. Baselines are measurable. | 0.1–0.19 (19) | None | `EPIC-001-ingestion-platform-scaling/phase-0-stabilize-instrument.md` |
| 1 | Foundations | Repo tooling, shared library, core schema additions (timestamps, runs, records, registry extension, geography) | 1.1–1.15 (15) | **Opus 5 pre-phase review + post-phase conformance review** | `EPIC-001-ingestion-platform-scaling/phase-1-foundations.md` |
| 2 | Pipeline core | Queue, dispatcher, worker, adapter contract, validate/normalize/merge/reconcile, first adapter (ICS) live end to end | 2.1–2.18 (18) | **Opus 5 pre-phase gate** | `EPIC-001-ingestion-platform-scaling/phase-2-pipeline-core.md` |
| 3 | Legacy migration | All 20 connectors running on the pipeline, cron lines removed | 3.0–3.21 (22) | None (Opus reactive only, for failed migrations/parity problems) | `EPIC-001-ingestion-platform-scaling/phase-3-legacy-migration.md` |
| 4 | Entity resolution & dedupe | Venue resolution, geocoding, matcher (shadow → live), merge/unmerge, review UI | 4.1–4.13 (13) | **Opus 5 pre-phase gate + calibration review before live matching** | `EPIC-001-ingestion-platform-scaling/phase-4-entity-resolution-dedupe.md` |
| 5 | Registry, discovery & onboarding | Source console, probe/fingerprint, dry-run, research import, discovery channels | 5.1–5.13 (13) | Opus review recommended for select primitives (5.1, 5.5, 5.8) | `EPIC-001-ingestion-platform-scaling/phase-5-registry-discovery-onboarding.md` |
| 6 | Platform adapters & coverage | Multiplier adapters and first expansion batches across rings | 6.1–6.16 (16) | None (Opus reactive only, for architecture exceptions) | `EPIC-001-ingestion-platform-scaling/phase-6-platform-adapters-coverage.md` |
| 7 | Monitoring, alerting & metrics | Detectors, health model, digest, quality and coverage metrics | 7.1–7.12 (12) | Opus review recommended for 7.4, 7.9, 7.12 | `EPIC-001-ingestion-platform-scaling/phase-7-monitoring-alerting-metrics.md` |
| 8 | Assisted capture & JS worker | Manual lane on the pipeline; optional render worker | 8.1–8.7 (7) | Product Owner decisions (A3, A4) + Opus review for consequential architecture | `EPIC-001-ingestion-platform-scaling/phase-8-assisted-capture-js-worker.md` |
| 9 | Public-site integration & cleanup | Pages read the new model; legacy fields retired | 9.1–9.8 (8) | Opus 5 final decommissioning/conformance review before legacy infrastructure removal | `EPIC-001-ingestion-platform-scaling/phase-9-public-site-integration-cleanup.md` |

**Total: 143 work packages**, all preserving their original WP identifiers (`0.1`–`9.8`) exactly as `INGESTION_BACKLOG.md` numbers them.

## Milestones (preserved verbatim)

| Milestone | Reached at | What's true then |
|---|---|---|
| M0 | end of Phase 0 | Defect-free and observable |
| M1 | WP 2.13 | First source fully on the new pipeline |
| M2 | Phase 3 complete | No bespoke cron lines left |
| M3 | WP 4.10 | Automatic cross-source dedupe live |
| M4 | WP 5.8 | Zero-code onboarding live |
| M5 | WP 6.16 | Every ring has first-party sources |

## Critical path (preserved verbatim)

"1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.5 → 2.7 → 2.11 → 2.13 (ICS live) → 3.x → 4.8 → 4.10. Along the way, 2.5 also waits on 1.4, 1.6, 2.3, 2.4 and 2.6, and 2.13 on 2.8, 2.9, 2.10, 2.14 and 2.15." Three groups can run in parallel with the critical path once Phase 1 is done: Phase 5's registry/console work, Phase 7's detectors (need only `source_runs`), and the geography WPs (1.9–1.12, 4.1–4.4). Phase 6 explicitly must **not** start before Milestone M3 (WP 4.10) — see `phase-6-platform-adapters-coverage.md`.

## Effort (preserved verbatim)

165 focused days across all 143 WPs (75 S, 57 M, 11 L). The backlog's own recommended **minimum path to "scales without getting more fragile"** is 80 WPs / ~95 focused days: all of Phase 0; 1.1–1.11 and 1.13–1.15; 2.1–2.16 and 2.18; the Phase 3 migrations 3.1–3.6 (plus feeds via 2.13); 4.1, 4.2, 4.4–4.11; 5.1–5.8; 7.1–7.6. Explicitly deferrable without harming the core: WP 2.17 (custom DB role), WP 6.14 (LLM recipe suggester), the capture–recapture portion of WP 7.12, the density-per-10k metric (architecture §9.2, folded into Phase 7), WP 8.6 (render worker, only if A4 says yes), the full formula in WP 5.12 (v1 ships first), and WP 9.8 (retiring legacy fields).

## Product Owner decisions (Appendix A)

See `EPIC-001-ingestion-platform-scaling/APPENDIX-A-DECISIONS.md` for the full A1–A12 table with options, the architecture's own recommendation, and exactly which phase each one blocks. **None of them blocks Phase 0.** A decision that blocks a later phase (e.g. A2/A6 → Phase 4, A3/A4 → Phase 8) does not block earlier, unrelated work.

## Phase 0 — recommended execution order

1. **WP 0.17 first, unconditionally.** The architecture names this explicitly: it verifies whether moderator/dedupe rejections have already been silently reversed by a live defect (a failed status-lookup defaulting rows to `approved`), and fixes the defect going forward. This is not a design preference — it's flagged as a live, ongoing correctness risk.
2. The remaining `READY` Phase 0 WPs (everything with no unmet dependency and no pending Product Owner OK) in any order the Product Owner prefers — see `phase-0-stabilize-instrument.md` for the full list with each WP's dependency state.
3. WP 0.11 before WP 0.7 (0.7 depends on it). WP 0.5 before WP 0.10, 0.13, and 0.18.
4. **WP 0.13 and WP 0.14 need a separate, quick Product Owner OK** before they're implemented (unscheduling Metro Times; routing new Trinosophes/Cinema Detroit rows to review) — this is a Phase-0-specific approval, not an Appendix A decision.
5. Phase 1 does not start until its own Opus 5 architecture-review gate has been conducted — that gate has not happened yet and is a separate step from Phase 0 grooming.

## Reconciliation with the general project backlog

Two items in `BACKLOG.md`'s general Bugs/Debt sections are now superseded by this program rather than tracked as independent tickets:

- **`BUG-001`** (possible status-lookup failure re-approving rejected events) is confirmed, not just suspected, by the architecture's audit (gap **D7**, severity S1) and is the exact subject of **WP 0.17**. `BUG-001` now points here as its authoritative implementation item — see `BACKLOG.md` for the cross-reference.
- **`DEBT-001`** (Detroit Orbit boundary not enforced outside `cron-ticketmaster.js`) corresponds to gap **G1** ("the Orbit rule is enforced only for Ticketmaster... WDET uses a narrower allowlist that drops valid Orbit events") and the broader geography rework in architecture §4. It is superseded by **WP 1.10** (PostGIS + `geo_regions`, the `in_orbit()` function), **WP 1.11** (venue geo columns + trigger computing `in_orbit` for every venue), and the pipeline's RESOLVE stage generally (§2.2 step 5, formalized per-source starting in Phase 3's migrations) — which computes Orbit membership for every event through every source, not just Ticketmaster. **WP 9.1/9.2** carry the fix through to the public site. See `BACKLOG.md` for the cross-reference.

A new inconsistency was found during this import and is **not** resolved here: **WP 4.13** ("Organizations from sources," Phase 4) reads as populating one organization per *source*, which is a different and narrower notion than this project's existing `DEC-005` ("source ≠ organizer" — organizers are hand-curated only, never auto-derived from `source`, established in `FOUNDATIONAL_ITEMS.md` and recorded in `DECISIONS.md`). This has been raised as `DISCOVERY-009` in `BACKLOG.md` rather than silently resolved — see that entry and the note in `phase-4-entity-resolution-dedupe.md` before WP 4.13 is scheduled.

## Relevant decisions

`DEC-011` (status-preserving upsert — this program's entire write-model redesign, §2.7, is an extension of this existing rule, not a replacement of it). `DEC-012` (venue_id resolution pattern — extended, not replaced, by the venue-resolution cascade in Phase 4). `DEC-006` (the `sources` table registry — this program **extends and populates** it, per WP 1.7/1.8, rather than deprecating it; `DISCOVERY-005` in `BACKLOG.md` is resolved accordingly). `DEC-013` (records the approval of this architecture itself — see `DECISIONS.md`).
