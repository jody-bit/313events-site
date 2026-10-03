# 313.events — Backlog

This is the authoritative record of work. Conversation is not the backlog — anything mentioned as a feature, bug, improvement, debt, idea, gap, or open question gets captured here (as `IDEA`/`BACKLOG` if underspecified), not relied on from memory.

## ID scheme

`EPIC-###`, `STORY-###`, `TASK-###`, `BUG-###`, `DEBT-###`, `DISCOVERY-###` — each series numbered independently.

## Status vocabulary (exactly these values)

- **IDEA** — raised, not yet evaluated for scope/feasibility.
- **BACKLOG** — evaluated, real, but not yet ready to schedule (missing a decision, a dependency, or acceptance criteria).
- **READY** — scoped, acceptance criteria written, no blocking dependency — could be picked up next.
- **IN PROGRESS** — actively being worked.
- **BLOCKED** — work started or ready to start, but stopped on an external dependency.
- **REVIEW** — implementation believed complete, awaiting Product Owner review.
- **ACCEPTED** — Product Owner has explicitly approved. **Only Jody can move an item here — this is never done unilaterally.**
- **DONE** — accepted, and post-acceptance cleanup (moving detail to `/project/completed`, final doc updates) is complete. Never set just because code was written or tests passed.

## Model routing (for READY items)

Sonnet 5 (default) — defined features, UI, forms/filters, individual adapters, tests, routine migrations, straightforward debugging, refactors with clear boundaries. Opus 5 — new subsystem/database/data-model/cross-cutting architecture, complex entity-resolution/dedup strategy, significant ingestion-architecture work, hard repeated-failure debugging, multi-system planning. Fable — escalation only, after Opus has failed or for codebase-wide/very-hard multi-system problems. Never escalate model just because a task is large — decompose instead.

---

## Product priorities (current)

Set by the Product Owner 2026-09-22 ("NEXT PRIORITY — REDUCE NEEDS FOLLOW-UP HUMAN INTERVENTION"). Optimize for **human intervention eliminated**, not raw database completeness.

- **CURRENT:** Needs Follow-up human-intervention reduction (`EPIC-006`). First repair: **SH.9** (Redford Theatre description/event_url/ticket_url recovery, `REVIEW`, commit `69ad2c4`) — see `epics/EPIC-006-metadata-self-healing.md`.
- **NEXT:** Editorial Review human-intervention reduction (not yet scoped).
- **THEN:** Detroit Orbit coverage expansion / comprehensive event acquisition.
- **BACKLOG (not sequenced next):** Image/asset discovery.
- **TASK-004 (GottaGacha)** is complete (`REVIEW`) and is no longer the active task.

---

## Epics

| ID | Title | Status | Priority | Related file |
|---|---|---|---|---|
| EPIC-001 | Ingestion Platform Scaling | **APPROVED (design)** — execution BACKLOG | High | `epics/EPIC-001-ingestion-platform-scaling.md` |
| EPIC-002 | Discovery Shell (time & location navigation) | BACKLOG | Medium | `epics/EPIC-002-discovery-shell.md` |
| EPIC-003 | Entity & Identity Data Buildout | BACKLOG | Medium | `epics/EPIC-003-entity-identity-buildout.md` |
| EPIC-004 | Admin & Editorial Workflow Improvements | BACKLOG | Low-Medium | `epics/EPIC-004-admin-editorial-ux.md` |
| EPIC-005 | Social / Community Layer | IDEA | Unscored | `epics/EPIC-005-social-community-layer.md` |
| EPIC-006 | Metadata Self-Healing | **No remaining acceptance blocker (2026-10-01)** — SH.1/SH.2/SH.5/SH.9 complete & production-verified; SH.N/SH.8/SH.3/SH.6/SH.7 `ACCEPTED`; SH.4 deployed, correct, currently unverifiable only because its source (Metro Times) has zero live rows. Formal epic-level `ACCEPTED`/`DONE` is Jody's call. | High | `epics/EPIC-006-metadata-self-healing.md` |
| EPIC-007 | Radar Candidate Intelligence | BACKLOG (documentation/scoping only, captured 2026-10-01) | Unscored | `epics/EPIC-007-radar-candidate-intelligence.md` |
| EPIC-008 | Editorial Radar Workbench | BACKLOG — hard dependency on EPIC-007 | Unscored | `epics/EPIC-008-editorial-radar-workbench.md` |
| EPIC-009 | Consumer Discovery Surfaces | BACKLOG — blocked on the "On the Radar" naming decision (`DISCOVERY-010`) for part of its scope | Unscored | `epics/EPIC-009-consumer-discovery-surfaces.md` |
| EPIC-010 | Editorial vs. Paid Promotion / Trust Architecture | BACKLOG — principle decided (`DEC-015`), naming/implementation open | Unscored | `epics/EPIC-010-editorial-trust-architecture.md` |
| EPIC-011 | Event Connections + Commercial Analytics | BACKLOG — foundational to EPIC-012–017 (documentation/scoping only, captured 2026-10-01) | Unscored | `epics/EPIC-011-event-connections-commercial-analytics.md` |
| EPIC-012 | Audience Growth Engine | BACKLOG — runs alongside the revenue epics per `DEC-019` | Unscored | `epics/EPIC-012-audience-growth-engine.md` |
| EPIC-013 | Retention + Personal Discovery | BACKLOG — runs alongside the revenue epics per `DEC-019` | Unscored | `epics/EPIC-013-retention-personal-discovery.md` |
| EPIC-014 | Commerce + Affiliate Revenue | BACKLOG — partially live already (Ticketmaster affiliate link); build-order priority 2 | Unscored | `epics/EPIC-014-commerce-affiliate-revenue.md` |
| EPIC-015 | Self-Service Event Promotion | BACKLOG — not yet scoped into stories; waits on EPIC-016 proving demand per `DEC-019` | Unscored | `epics/EPIC-015-self-service-event-promotion.md` |
| EPIC-016 | Native Display Advertising + Sponsorship | BACKLOG — build-order priority 3; hard requirements + density ceiling locked (`DEC-018`) | Unscored | `epics/EPIC-016-native-display-advertising-sponsorship.md` |
| EPIC-017 | Organizer Pro + Commercial Intelligence | BACKLOG — not yet scoped into stories; last in build order per `DEC-019` | Unscored | `epics/EPIC-017-organizer-pro-commercial-intelligence.md` |

**EPIC-006 note (updated 2026-10-01, closure audit — supersedes all prior status in this entry):** every work package now has deployed, tested code; `git merge-base --is-ancestor` confirms every named commit below is live. **SH.1** (venue address/city repair), **SH.2** (generated descriptions), and **SH.9** (Redford Theatre recovery) are **complete and production-verified** by direct live-data queries (anon key, 2026-10-01) — e.g. 524 live `venue_id`-linked events now show canonical-matching addresses, 110 live rows carry `description_source='generated'`, 93% of live Redford Theatre events now have a description. **SH.N** and **SH.8** remain `ACCEPTED` (Product Owner, 2026-09-21); **SH.4**'s code is deployed and tested but its target source (Metro Times) currently has zero live rows to verify against — a source-volume fact, not a defect, same as SH.8's target (Cinema Detroit). **SH.6** (field-level provenance) and **SH.7** (Needs Follow-up exception queue) are both implemented and production-verified, but in deliberately narrower forms than their original written specs — sufficient for what they actually gate/serve today (SH.6: one column gating SH.2's description generation; SH.7: `admin.html`'s source-limited exclusion list, closed 2026-09-23 per `NEEDS_FOLLOWUP_CLOSURE.md`) — whether the broader originally-specified versions are still wanted is a Product Owner call, not an open engineering gap. **SH.3**'s original scope (event-specific link repair, explicitly prohibiting a generic venue/calendar URL in `ticket_url`/`event_url`) is superseded by a later, broader mechanism (`generic-metadata-enrichment.js`'s tiered link resolution, confirmed live — Trinosophes: 14/22 current events now have a link despite that source never providing one) whose last-resort "digital home" tier appears to do the exact thing SH.3's own acceptance criteria prohibited; flagged for Product Owner review, not silently resolved. **2026-10-01 closure decisions (Product Owner) and confirmation:** **SH.3 approved** — the live digital-home fallback is a deliberate supersession of the older "never write a generic link" criterion, with a revised, binding fallback hierarchy (direct ticket link → event-specific authoritative page → official venue/organizer site → official Facebook/social/digital home → unresolved), a generic-but-verified digital home acceptable only as a last resort and never represented as event-specific. **SH.6 and SH.7 accepted as their current V1 implementations** — general field-level provenance (SH.6) and the richer multi-state exception queue (SH.7) are not required to close this epic and are moved to future backlog/debt. **SH.5 implemented, deployed, and confirmed live**: `api/cron-enrichment.js` now logs to `source_runs` via the same `startRun()`/`finishRun()` pattern every ingestion connector uses (a new, deliberately narrow, named `"enrichment"` slug — not a reopening of WP 0.5's ingestion-only scope), with a new top-level `try`/`catch` so a failure in the one previously-unwrapped repair step now logs `outcome='failed'` instead of crashing with nothing recorded. Pushed to `origin/main` (`4b7230a`) by Jody; the very next regularly-scheduled Vercel invocation (`User-Agent: vercel-cron/1.0`, not a manual trigger) produced a real `source_runs` row (`outcome='success'`, `records_written=0`, `error_sample=null`) — direct proof the cron fires on its own schedule and telemetry captures it, which is exactly what was missing before today. New test file `test/cron-enrichment-runlog.test.js` (4 cases) plus an updated `test/source-slugs.test.js` pass; full regression suite (67 files) passes except the pre-existing, unrelated `cron-bigtimebingo-runlog.test.js` flake. **EPIC-006 has no remaining acceptance blocker.** Full detail, including the live `source_runs` row, is in `epics/EPIC-006-metadata-self-healing.md`'s "2026-10-01" sections (closure audit, closure decisions, SH.5 implementation note, and final verdict). Formal epic-level `ACCEPTED`/`DONE` remains Jody's call per this file's own status vocabulary.

**EPIC-007–EPIC-010 note (added 2026-10-01):** this is the "Discovery + Editorial Intelligence" initiative — documentation/scoping only, captured per Product Owner request. **Not sequenced into "Product priorities (current)" below** — these four epics are preserved in the backlog for deliberate future scheduling, not treated as next-up work. Sequencing is EPIC-007 → EPIC-008 → (EPIC-009's public "On the Radar" surface); EPIC-009's V0 lenses that don't depend on Radar signals (Just Added, One Night Only) have no dependency and could be pulled independently; EPIC-010 is a standing constraint reviewed alongside the others, not a build in sequence with them. See each epic file for its own V0 (buildable now, existing data) vs. V1+ (needs schema/AI/learning) split — none of the V1+ scope is broken into stories yet, deliberately, per the Product Owner's own instruction to investigate existing-data opportunities first.

**EPIC-007 amendment (2026-10-03):** one candidate criterion added for "Don't Miss" — **Detroit routing significance** (is an act's appearance in Detroit / the Orbit unusually significant given its trajectory and touring behavior; broader than "rare Detroit appearance"; not reducible to popularity). Requirement captured only: not designed, not built, not scheduled. The existing approved requirements (`DEC-025`, `EPIC-007`, `EPIC-008`) are unchanged — the engine surfaces evidence, an editor decides. Full text in `epics/EPIC-007-radar-candidate-intelligence.md`; open decisions in `DISCOVERY-021`.

**EPIC-011–EPIC-017 note (added 2026-10-01):** the "Monetization & Growth Program" — documentation/scoping only, captured per Product Owner request. **Not sequenced into "Product priorities (current)" below** — preserved in the backlog for deliberate future scheduling. Build order is itself a decision (`DEC-019`): Measurement (`EPIC-011`) → Affiliate (`EPIC-014`) → Display/Sponsorship (`EPIC-016`) → Self-Service Promotion (`EPIC-015`) → Organizer Pro (`EPIC-017`), with Audience Growth (`EPIC-012`) and Retention (`EPIC-013`) running throughout rather than waiting in sequence. `EPIC-015` and `EPIC-017` are deliberately left without implementation-ready stories — scoping them further now would front-run the "prove demand before automating" principle the build order itself is built on.

**EPIC-001 note:** the architecture is approved as technical direction (`DEC-013`). The full 143-work-package phased backlog is imported into managed tracking under `epics/EPIC-001-ingestion-platform-scaling/` (one file per phase, 0–9, plus `APPENDIX-A-DECISIONS.md` for the still-undecided A1–A12) — not duplicated in this file. `INGESTION_BACKLOG.md` (repo root) remains the authoritative detailed technical specification. **WP 0.17 (status-lookup safety) is `REVIEW`** — implemented 2026-09-22 (local acceptance criteria pass, full regression suite green; production verification of the 2026-09-17 dedupe-batch rejections deferred by `DEBT-002`); see `epics/EPIC-001-ingestion-platform-scaling/phase-0-stabilize-instrument.md`. No other work package has been pulled.

### Ingestion program dashboard

- **Current phase:** Phase 0 (Stabilize & instrument) — the only phase with no architecture-gate or Appendix A blocker. **WP 0.17 is `REVIEW`** (implemented 2026-09-22); the rest of Phase 0 has not been started.
- **Recommended first item:** **WP 0.17** (status-lookup safety) — explicitly named "do first" by the architecture. **Pulled 2026-09-21, implemented 2026-09-22, now `REVIEW`** (production verification of the 2026-09-17 dedupe-batch rejections deferred by `DEBT-002`).
- **Phase 0 `READY` WPs (no unmet dependency, no pending Product Owner OK):** 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 0.9, 0.11, 0.12, 0.15, 0.16, 0.17, 0.19 (14 of 19).
- **Phase 0 `BACKLOG` WPs (waiting on an internal dependency or a Product Owner OK):** 0.7 (needs 0.11), 0.10 (needs 0.5), 0.13 (needs 0.5 + Jody's OK to unschedule Metro Times), 0.14 (needs Jody's OK for the review-routing portion), 0.18 (needs 0.10).
- **Phases 1–9:** all `BACKLOG`. Phases 1, 2, and 4 are additionally blocked on a not-yet-conducted Opus 5 architecture-review gate; Phase 3 is blocked on Milestone M1 (WP 2.13); Phases 5–9 are blocked on their own upstream dependencies (see each phase file and `epics/EPIC-001-ingestion-platform-scaling.md`'s phase table).
- **Product Owner decisions open:** A1–A12, all undecided (`epics/EPIC-001-ingestion-platform-scaling/APPENDIX-A-DECISIONS.md`). None blocks Phase 0.
- **Non-ingestion `READY` work** (STORY-001, STORY-003, STORY-004, STORY-005, STORY-007, TASK-001, TASK-002 below) remains `READY` and legitimate — its status/priority is unchanged by this import. The Product Owner decides whether ingestion Phase 0 or this other product work gets pulled first; neither is assumed to take priority.

---

## Stories

### STORY-001 — Editorial review: split one article into multiple events

- **Type:** STORY · **Status:** READY · **Priority:** Medium
- **Epic:** EPIC-004 · **Recommended Model:** Sonnet 5 · **Complexity:** Small–Medium
- **Dependencies:** None — `editorial_article_events` (migration_021) already supports a many-to-many article↔event relationship; no schema change needed.
- **Problem/User Need:** An editorial article sometimes genuinely covers multiple distinct event dates (e.g. a two-night show) that should become separate event records. Today the editorial review flow can only produce exactly one event per article.
- **Acceptance Criteria:** admin editorial-review UI has an "add another event from this article" (or equivalent) action; using it produces N separate `events` rows from one `editorial_articles` row, each correctly linked via `editorial_article_events`; the original single-event flow still works unchanged for the common case.
- **Implementation Notes:** confirm current `admin-editorial.js`/admin.html editorial-review UI behavior before starting — verify against live code, not just `FEATURE_BACKLOG.md`'s description.
- **Discovered Work:** —
- **Product Decisions Required:** none.

### STORY-002 — Multi-day event entry with per-day schedule

- **Type:** STORY · **Status:** BACKLOG (data-model shape not yet decided) · **Priority:** Medium
- **Epic:** EPIC-004 · **Recommended Model:** N/A until READY · **Complexity:** Medium (touches schema)
- **Dependencies:** A data-model decision — a per-day list of day/time-range pairs on one `events` row, vs. a linked series of single-day event records. Affects both the submission form and the admin editorial-entry flow.
- **Problem/User Need:** No clean way to enter an event spanning multiple days with different hours each day (e.g. a festival "Fri 2–7 PM · Sat 10 AM–7 PM · Sun 10 AM–4 PM"); today it's forced into one date/time field or split awkwardly.
- **Acceptance Criteria:** TBD once the data-model decision is made.
- **Implementation Notes:** —
- **Discovered Work:** —
- **Product Decisions Required:** which data-model shape to use (see Dependencies).

### STORY-003 — Homepage time-shortcut bar + URL state

- **Type:** STORY · **Status:** READY · **Priority:** Medium
- **Epic:** EPIC-002 · **Recommended Model:** Sonnet 5 · **Complexity:** Medium
- **Dependencies:** None — pure date-range logic over existing `matchesFilters()`/`byDate` data, per `DISCOVERY_PHASE1_AUDIT.md` §4/§5.
- **Problem/User Need:** No way to quickly ask "what's on now / today / tonight / this weekend" without manually navigating the month calendar.
- **Acceptance Criteria:** a NOW/TODAY/TONIGHT/THIS WEEKEND/DATE button group applies date-range filtering through the existing filter machinery; current date/view/category/search state is reflected in the URL (`URLSearchParams`, written via `history.replaceState`) and restored on load; an active-filter tray shows what's applied with a clear-all.
- **Implementation Notes:** see `DISCOVERY_PHASE1_AUDIT.md` §3 "Discovery bar" and §3 "URL state" for the specific design.
- **Discovered Work:** —
- **Product Decisions Required:** none.

### STORY-004 — Calendar viewport & info density improvements

- **Type:** STORY · **Status:** READY · **Priority:** Low
- **Epic:** EPIC-002 · **Recommended Model:** Sonnet 5 · **Complexity:** Small
- **Dependencies:** None.
- **Problem/User Need:** The header/notice-box padding pushes the calendar down with no real hero content; day cells don't show event-count density or a clear "today" label.
- **Acceptance Criteria:** header/notice vertical space is reduced (notice box becomes smaller/collapsible); day cells show an event-count line; `.day-cell.today` has an explicit "TODAY" text label, not just a background/ring style.
- **Implementation Notes:** see `DISCOVERY_PHASE1_AUDIT.md` §3 "Calendar cell density" / "Initial-viewport density."
- **Discovered Work:** —
- **Product Decisions Required:** none.

### STORY-005 — Static location reference dataset + predictive search + city-level radius filter

- **Type:** STORY · **Status:** READY · **Priority:** Medium
- **Epic:** EPIC-002 · **Recommended Model:** Sonnet 5 · **Complexity:** Medium
- **Dependencies:** None — hand-curated once, no external geocoding API, no schema migration required (ships as a static asset).
- **Problem/User Need:** No way to filter events by location/radius; the product now covers a 75-mile multi-city region.
- **Acceptance Criteria:** a static reference dataset of ~35–45 locations (Detroit's 39 neighborhoods + `SERVICE_AREA.md`'s cities + Windsor/Chatham/Sarnia, each with name/type/state-or-province/country/lat/lng) ships with the site; a location combobox offers predictive suggestions labeled by type; a radius chip group (5/10/25/50/75/ALL) filters events city-level via haversine distance against `events.venue_city_raw`; UI copy is explicit that this is city-level, not venue-level, precision; "USE MY LOCATION" requests browser geolocation only on click, with a graceful denied-permission fallback.
- **Implementation Notes:** the dataset must be sourced from `SERVICE_AREA.md` and the existing 39-row `neighborhoods` table — not re-researched independently, to avoid drifting from the authoritative geography file.
- **Discovered Work:** —
- **Product Decisions Required:** none.

### STORY-006 — Responsive WHEN/WHERE/FILTER restructuring + accessibility pass

- **Type:** STORY · **Status:** BACKLOG (blocked) · **Priority:** Low
- **Epic:** EPIC-002 · **Recommended Model:** N/A until READY · **Complexity:** Medium
- **Dependencies:** STORY-003, STORY-004, STORY-005 (needs the desktop discovery-bar controls to exist first).
- **Problem/User Need:** The discovery bar controls need a mobile-appropriate collapsed form (three-button WHEN/WHERE/FILTER sheet pattern) rather than being squeezed into the existing single breakpoint, plus keyboard/ARIA accessibility on the new controls.
- **Acceptance Criteria:** TBD at grooming, once STORY-003/004/005 land.
- **Implementation Notes:** —
- **Discovered Work:** —
- **Product Decisions Required:** none.

### STORY-007 — Venue photography field + upload flow

- **Type:** STORY · **Status:** READY · **Priority:** Low
- **Epic:** EPIC-003 · **Recommended Model:** Sonnet 5 · **Complexity:** Small–Medium
- **Dependencies:** None.
- **Problem/User Need:** Venue profile pages (`venue-template.html`) fall back to a placeholder for every venue today — no venue photography field exists at all.
- **Acceptance Criteria:** `venues` gains an image field; an upload path exists (reusing the pattern already built for event flyers — `api/upload-image.js`, the `event-flyers` storage bucket from migration_013); `venue-template.html` renders it when present, falls back to the existing placeholder when absent (never a fabricated stock photo).
- **Implementation Notes:** mirror the event-flyer upload pattern rather than building a new one.
- **Discovered Work:** —
- **Product Decisions Required:** none.

### STORY-008 — Radar Candidate Score v0: deterministic scoring query + explainability

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-007 · **Recommended Model:** Opus 5 (cross-cutting scoring logic touching several tables; get the shape right once) · **Complexity:** Medium
- **Dependencies:** None for a first pass — reads only already-live columns (`is_recurring`, `venue_id`, `category`, `end_date`/`start_date`, `created_at`) and the already-live `editorial_article_events` join. No migration.
- **Problem/User Need:** No mechanism anywhere in the product surfaces "this event is unusually interesting" independent of whether the press happened to cover it. An editor has no way to find Radar-worthy candidates except noticing them by chance.
- **Acceptance Criteria:** a query (shared helper under `api/_lib/`, following the existing `venue-lookup.js`-style convention) returns, for a given upcoming-events window, each event's matched signal list (e.g. `one_time`, `rarely_activated_venue`, `multi_source_press`) from the V0 signal set in `EPIC-007`; the score/reasons are computed, never stored (no new column/table in this story); nothing in `events_public` or any anon-key-reachable query exposes the score or reasons; the query runs correctly against a realistic live-data sample with no events miscounted due to null/missing fields (e.g. an event with `venue_id = null` must not crash the venue-activation-frequency signal, just skip it).
- **Implementation Notes:** see `epics/EPIC-007-radar-candidate-intelligence.md`'s V0 table for the exact signal-to-field mapping. Explainability (the reasons list) is mandatory from this first version, not a follow-on.
- **Discovered Work:** —
- **Product Decisions Required:** none for this story specifically — the broader V1+ signal questions are tracked in `EPIC-007`'s own open questions, not blocking this V0 slice.

### STORY-009 — Negative/routine-signal detection for Radar scoring

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-007 · **Recommended Model:** Sonnet 5 · **Complexity:** Small–Medium
- **Dependencies:** STORY-008 (this extends the same scoring query with downranking signals). Reuses `EPIC-006`'s Needs Follow-up field-completeness logic (`admin.html`'s `getMissingFields()`) rather than re-deriving it.
- **Problem/User Need:** Without downranking, a routine weekly happy-hour or trivia night with a complete, well-formed record could rank alongside a genuinely rare event purely on structural completeness — the product brief is explicit that negative signals should reduce editorial-review *priority* only, never remove an event from the comprehensive calendar.
- **Acceptance Criteria:** routine recurring patterns (long-running `is_recurring = true` series, category/title patterns matching known recurring-promo shapes) and incomplete-metadata events (via the reused `getMissingFields()` logic) reduce — never zero out destructively or hide — an event's candidate ranking; a unit test confirms a negatively-signaled event still appears in `events_public`/every public query unchanged.
- **Implementation Notes:** —
- **Discovered Work:** —
- **Product Decisions Required:** none.

### STORY-010 — Admin "Radar Candidates" tab + candidate cards

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-008 · **Recommended Model:** Sonnet 5 · **Complexity:** Medium
- **Dependencies:** STORY-008 (hard — nothing to render without the scoring query).
- **Problem/User Need:** An editor has no single place to review Radar candidates; today they'd have to notice something while working in an unrelated queue.
- **Acceptance Criteria:** a new `admin.html` tab, following the existing tabbed-layout/badge-count convention (`EPIC-004`), lists ranked candidates from STORY-008's query, 20–40 at a time (not the full upcoming-events table); each card shows title, date/time, venue, city/neighborhood, category, image where present, source/provenance, the matched signal reasons, recurrence info, and any existing press coverage (`editorial_article_events`, reused from the existing editorial-review tab's query, not re-derived).
- **Implementation Notes:** see `epics/EPIC-008-editorial-radar-workbench.md`.
- **Discovered Work:** —
- **Product Decisions Required:** exact tab label (implementation-level, not blocking).

### STORY-011 — Three-action editorial decision recording (On the Radar / Pass / Not noteworthy)

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-008 · **Recommended Model:** Sonnet 5 · **Complexity:** Medium (new schema)
- **Dependencies:** STORY-010 (the tab these actions live on).
- **Problem/User Need:** Without a recorded decision, there's no way to answer "why was this put On the Radar" later, and `EPIC-007`'s feedback loop has nothing to learn from.
- **Acceptance Criteria:** each of the three actions (On the Radar/Feature, Pass, Not noteworthy/Routine — no additional states) records who/when/which action against the candidate; a passed candidate can resurface later if its score changes; a "not noteworthy" decision is retrievable by `EPIC-007`'s future feedback-loop work without this story needing to implement that loop itself.
- **Implementation Notes:** schema for this decision log should be designed together with `EPIC-007`'s V1 persistence question (`DISCOVERY-011`), not independently — may end up as one table, not two.
- **Discovered Work:** —
- **Product Decisions Required:** `DISCOVERY-011` (shared schema shape) should be resolved before this is scheduled, or explicitly deferred with a placeholder shape accepted as a known migration risk.

### STORY-012 — "Just Added" and "One Night Only" discovery lenses

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-009 · **Recommended Model:** Sonnet 5 · **Complexity:** Small
- **Dependencies:** None — both read only already-live fields (`created_at`; `is_recurring` + `end_date`).
- **Problem/User Need:** No existing lens surfaces recently-added events or genuinely one-off events; both are directly computable today.
- **Acceptance Criteria:** "Just Added" surfaces events added within a configurable recent window (newest-first); "One Night Only" surfaces non-recurring, single-date events; both are additive entry points (e.g. homepage cards or chips) and do not alter the underlying comprehensive calendar/search behavior.
- **Implementation Notes:** keep each lens visually distinct from any future editorial ("On the Radar") surface per `EPIC-010`'s firewall and `EPIC-009`'s "editorial vs. algorithmic must be distinguishable" requirement.
- **Discovered Work:** —
- **Product Decisions Required:** none.

### STORY-013 — "Free" lens homepage surfacing

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-009 · **Recommended Model:** Sonnet 5 · **Complexity:** Small
- **Dependencies:** None — `is_free` filtering already exists in `index.html`; this is a discoverability/entry-point story, not new filter logic.
- **Problem/User Need:** The free-only toggle exists but isn't surfaced as its own discovery entry point the way a dedicated "Free" lens would be.
- **Acceptance Criteria:** a homepage entry point applies the existing free-only filter with a single click/tap, consistent with however `EPIC-009`'s other lenses are surfaced.
- **Implementation Notes:** coordinate with whatever homepage IA `EPIC-009`'s other lens stories settle on — don't build a one-off entry point inconsistent with the rest.
- **Discovered Work:** —
- **Product Decisions Required:** none.

### STORY-014 — Document the editorial/commercial trust firewall

- **Type:** STORY · **Status:** REVIEW · **Priority:** Unscored
- **Epic:** EPIC-010 · **Recommended Model:** N/A — documentation only · **Complexity:** Small
- **Dependencies:** None.
- **Problem/User Need:** The firewall between editorial selection and commercial placement needed to be written down as a binding principle before any monetization feature is ever proposed, per the Product Owner's explicit request.
- **Acceptance Criteria:** the principle is recorded in `PRODUCT.md` ("Discovery & editorial intelligence" section) and `DECISIONS.md` (`DEC-015`); the open naming/schema questions it doesn't resolve are tracked separately (`DISCOVERY-012`, `DISCOVERY-013`), not silently decided.
- **Implementation Notes:** satisfied by this same 2026-10-01 documentation pass — see `PRODUCT.md` and `DECISIONS.md`. Left `REVIEW` rather than `DONE`/`ACCEPTED` per this file's own status vocabulary (only Jody moves an item to `ACCEPTED`).
- **Discovered Work:** —
- **Product Decisions Required:** none for this story itself — see `EPIC-010`'s own open questions for what it deliberately leaves unresolved.

### STORY-015 — Define and record the Event Connections funnel/metric

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-011 · **Recommended Model:** N/A until READY — this is primarily a product-definition deliverable · **Complexity:** Small (definition) / Medium (if it includes the rollup query design)
- **Dependencies:** None.
- **Problem/User Need:** Every later monetization epic needs to report a real, consistent number to a promoter or sponsor. No such number is defined today, and inventing one ad hoc per feature would produce inconsistent, untrustworthy reporting.
- **Acceptance Criteria:** a written, Product-Owner-approved definition of "Event Connection" exists (which funnel stages count, with what weighting if any), recorded in `DECISIONS.md`; it's referenced, not redefined, by every later epic's own reporting scope.
- **Implementation Notes:** do this before STORY-016's instrumentation is built, so the instrumentation captures exactly what the definition needs — not the reverse.
- **Discovered Work:** —
- **Product Decisions Required:** the funnel-stage weighting question itself (`DISCOVERY-014`).

### STORY-016 — Outbound-click instrumentation + privacy policy update

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-011 · **Recommended Model:** Sonnet 5 · **Complexity:** Medium
- **Dependencies:** STORY-015 (needs the metric definition first).
- **Problem/User Need:** No outbound-click tracking exists on `ticket_url`/`event_url` anywhere today — only page-level GA4/Metricool analytics.
- **Acceptance Criteria:** outbound ticket/event/official-site link clicks are instrumented (extending GA4 via custom events, not a parallel tracking system); `privacy.html` is updated the same release to accurately describe the new tracking — treated as one acceptance unit, not a follow-up task; no per-visitor profile is exported or persisted beyond what the rollup needs (aggregate-only, per `DEC-021`).
- **Implementation Notes:** —
- **Discovered Work:** —
- **Product Decisions Required:** none beyond STORY-015's.

### STORY-017 — Programmatic date/category/city landing pages

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-012 · **Recommended Model:** Sonnet 5 · **Complexity:** Medium
- **Dependencies:** None — pure query-driven pages over existing `events`/`venues`/`neighborhoods` data, no schema change.
- **Problem/User Need:** No programmatic landing-page layer exists for date ranges, categories, cities, or seasonal themes — only individual event/venue pages and a handful of static directory pages are indexable today.
- **Acceptance Criteria:** a landing page per date-range/category/city combination is generated from live query results, not hand-authored; each page is genuinely useful on its own (real current listings, not an SEO shell); neighborhood landing pages extend `neighborhoods.html` rather than forking it.
- **Implementation Notes:** see `epics/EPIC-012-audience-growth-engine.md` for the full page-type list and the "genuinely useful, not filler" requirement.
- **Discovered Work:** —
- **Product Decisions Required:** which page types to build first (sequencing, not a blocking decision).

### STORY-018 — Schema.org JSON-LD emission on event/venue/landing pages

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-012 · **Recommended Model:** Sonnet 5 · **Complexity:** Small–Medium
- **Dependencies:** None for event/venue pages; depends on STORY-017 for landing pages specifically.
- **Problem/User Need:** 313.events consumes JSON-LD from other sites (`EPIC-001` §7.4) but doesn't emit any of its own, missing an easy, well-understood search-engine enhancement.
- **Acceptance Criteria:** `event-template.html`/`venue-template.html` emit valid schema.org `Event`/`Place` JSON-LD, validated against Google's Rich Results Test or equivalent; landing pages do the same once they exist.
- **Implementation Notes:** —
- **Discovered Work:** —
- **Product Decisions Required:** none.

### STORY-019 — Device-local event saves (no account)

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-013 · **Recommended Model:** Sonnet 5 · **Complexity:** Small
- **Dependencies:** None.
- **Problem/User Need:** No way for a visitor to save an event for later without an account.
- **Acceptance Criteria:** a visitor can save an event (device/browser-local storage, no account or email required); saved events are viewable in one place on the same device; nothing about saving requires identity.
- **Implementation Notes:** this is the minimal V0 slice — durable cross-device saves need STORY-020's email capture.
- **Discovered Work:** —
- **Product Decisions Required:** whether this ships standalone or alongside STORY-020 (sequencing, not blocking — see `DISCOVERY-015`-adjacent note in `EPIC-013`'s open questions).

### STORY-020 — Lightweight email capture + Weekend Signal digest

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-013 · **Recommended Model:** Sonnet 5 · **Complexity:** Medium
- **Dependencies:** Reuses the already-live Resend transactional-email integration. Content source is `EPIC-009`'s Tonight/This Weekend lens, once it exists.
- **Problem/User Need:** No way to opt into recurring content (a weekend digest) without creating a full account; no marketing-email capability exists today (Resend is transactional-only so far).
- **Acceptance Criteria:** an email-capture form collects an address plus basic preferences (categories/neighborhoods), with clear, working unsubscribe/preference management from message one; a "Weekend Signal" digest email is sent on a schedule, sourced from the same lens logic `EPIC-009` builds for the public site, not a separate selection.
- **Implementation Notes:** consult `DISCOVERY-015` (consent/compliance) before this ships, not after.
- **Discovered Work:** —
- **Product Decisions Required:** `DISCOVERY-015`.

### STORY-021 — Research which ticketing platforms offer a usable affiliate program

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-014 · **Recommended Model:** Sonnet 5 (research/web-verification task, not implementation) · **Complexity:** Small
- **Dependencies:** None.
- **Problem/User Need:** Only Ticketmaster's affiliate program is confirmed live today; whether Eventbrite (organizer-authorized), Fever, Humanitix, or others in the connector roster offer a comparable program is unresearched.
- **Acceptance Criteria:** a findings document (matching this project's existing research-before-build convention, e.g. `NEW_SOURCES_RESEARCH.md`'s format) lists each platform checked, whether an affiliate/referral program exists, its terms, and a recommendation — no link-rewriting code is written until this exists.
- **Implementation Notes:** —
- **Discovered Work:** —
- **Product Decisions Required:** none for the research itself; findings feed `DISCOVERY-016`.

### STORY-022 — 313 advertising design system (placement components + mandatory labeling)

- **Type:** STORY · **Status:** BACKLOG · **Priority:** Unscored
- **Epic:** EPIC-016 · **Recommended Model:** Sonnet 5 · **Complexity:** Medium
- **Dependencies:** None to build the components; needs `EPIC-008` to have produced real Radar selections before the Radar-sponsorship placement specifically means anything.
- **Problem/User Need:** No sponsorship/advertising placement components or labeling convention exist yet — needed before the first sponsorship can be sold and shown, per `DEC-019`'s "sell manually first" build order.
- **Acceptance Criteria:** at minimum, Signal Sponsor and Calendar-placement components exist, visually consistent with the product's brand, always carrying a clear "sponsored"/"promoted" label; the components respect the density ceiling and every hard requirement in `DEC-018` (no popups/interstitials/autoplay/layout-shift/etc.); the Radar-sponsorship variant includes the exact firewall copy from `DEC-020` and is not enabled until `EPIC-008` has real selections to attach it to.
- **Implementation Notes:** build this before any sponsor is sold, so the first sale has a real placement to show, per the epic's own build-order rationale.
- **Discovered Work:** —
- **Product Decisions Required:** none for the components themselves; see `DISCOVERY-018` for the exact density-ceiling number.

---

### STORY-023 — Submit form: an "Event features" group for promoter-declared attributes, aligned with Discovery features

- **Type:** STORY · **Status:** BACKLOG (recommendation recorded 2026-10-03; not approved, not started) · **Priority:** Unscored
- **Epic:** EPIC-009 for the filter side; the form side has no epic of its own yet · **Recommended Model:** Sonnet 5 · **Complexity:** Small for the regrouping; Medium once new attributes are added
- **Dependencies:** the shared discovery layer (`discovery.js`, approved 2026-10-03, not yet built) for the filter side.
- **Discovered:** 2026-10-03, while correcting the clothing-optional question (a promoter said it felt out of place after submitting — the checkbox was already in the form; the confirmation panel was echoing the raw payload, `"clothingOptional": false`, to every submitter. Fixed separately: reworded field with helper text, and the confirmation now lists a yes/no attribute only when checked).
- **Problem/User Need:** the single-event form has exactly three yes/no questions, each sitting in a different section: `clothingOptional` (Event details → `events.is_clothing_optional`), `recurring` (Date & time → `events.is_recurring`), `venueTba` (Location → not stored as a field at all; it appends "(address TBA)" to the venue name text). Two of those are properties of the schedule and the location and are reasonably placed. Only clothing-optional is an attendee-facing attribute, and there is no home for the next ones (age restriction, accessibility, family-friendly, outdoor) — today the description placeholder asks promoters to type those as prose ("dress code, age restriction, accessibility info"), which makes them unfilterable and forces any future filter to infer facts from descriptions. The feed-submission form has no way to declare any of them. The post-submission confirmation is still a raw JSON dump.
- **Acceptance Criteria (proposed, for Product Owner review):** (1) an "Event features" (or "Attendee information") group in the form, placed after Ticketing and before Organizer contact, holding promoter-declared attributes as plain checkboxes/selects with helper text — clothing-optional moves there; `recurring` and `venueTba` stay with Date & time and Location. (2) Each declared attribute is one stored, structured field, exposed through `events_public`, with who declared it (promoter / editor / source) — never inferred from description text. (3) Each one that is filterable appears in the shared Discovery `features` list under one key, marked as *declared* (supplied by the organizer or an editor) as distinct from today's *derived* features (has tickets, has photo, community-submitted, press coverage), so a filter can say what it is based on. (4) The confirmation panel becomes a readable summary instead of JSON. (5) No new attribute is added without a decision on whether it is a positive filter, a caution, or both.
- **Implementation Notes:** `is_clothing_optional` is already in `events_public` and already loaded by the homepage, so it can become the first declared Discovery feature with no schema change. `venueTba` should become a real field rather than text appended to the venue name (it currently pollutes venue names and venue matching). Do not add attributes speculatively — add one when a source or a promoter can actually supply it.
- **Discovered Work:** —
- **Product Decisions Required:** approve the grouping; which attributes to add first. **Decided 2026-10-03 (`DEC-024`):** clothing-optional is BOTH an eventual public label and a discovery filter when true; false/unset asserts nothing. **Also decided:** this story stays in the backlog and is not to be built yet — promoter-declared features will be designed coherently as part of the Discovery system rather than added piecemeal.

---

### STORY-024 — Shared discovery foundation (`discovery.js`)

- **Type:** STORY · **Status:** ACCEPTED — COMPLETE (built and tested 2026-10-03; approved by the Product Owner the same day with one semantic correction, since applied — `DEC-027`; accepted by the Product Owner in the final approval of 2026-10-03; deployed that day as merge commit `b1cae64`; `/discovery.js` verified in production; first consumer is `STORY-025`) · **Priority:** High
- **Epic:** EPIC-002 / EPIC-009 · **Recommended Model:** Opus 5 · **Complexity:** Large (cross-cutting)
- **Dependencies:** `BUG-005` (complete data loading — a shared predicate can only filter what a page has loaded).
- **Problem/User Need:** see `DEC-022`. Three pages each held a private, already-diverged copy of the discovery rules.
- **Acceptance Criteria (Product Owner, 2026-10-03):** plain shared vanilla JS, no framework/build dependency; pure definitions/state/semantics only — no DOM, network or stored state; canonical WHEN + WHERE + WHAT + SEARCH state; positive/additive category filtering, OR within WHAT, AND across dimensions; canonical URL serialization with legacy URL compatibility; `describe()` and `facets()` kept; genre-ready hierarchy with no genre exposed or inferred; surface-specific defaults preserved; declared vs derived features (`DEC-024`). Scope of this step: the file and its tests only — no page changed, no homepage visual work.
- **Implementation Notes:** `discovery.js` exposes one global, `Discovery`. Tests: `test/discovery.test.js` (every rule; loads with no DOM/network; mutation-checked — 29 deliberate rule breaks each fail a test) and `test/discovery-compat.test.js` (the homepage's real filter code executed against the shared rules over about 1.1 million comparisons with only the documented intended differences; every URL the homepage writes today decodes to the equivalent state; URLs written by `href()` fed to each page's real, unmodified URL reader; drift guards over every remaining copy of the definitions). Intended differences from today's homepage, for review: events in progress are shown (`DEC-023`); a multi-day run is matched when it overlaps the chosen dates, not only when it starts in them; an event that is already over today is hidden in every forward-looking view, not just the default and All Upcoming; an event in a category the page does not list is no longer hidden when no category is selected; "today" is Detroit time rather than the visitor's clock. Additions to the approved interface, for review: `featuresOf()`, `whens`, `radii`, an optional `ctx` on `href()`, and `inventoryFilter()` accepting a ctx as well as a date.
- **Discovered Work:** `admin.html`'s editorial form labels the `fest` category "Festivals"; every public page says "Festivals & Parades" (recorded in the drift guard as the one known difference). The stories `STORY-003`, `STORY-005` and `STORY-006` describe a per-page build that `DEC-022` supersedes and should be reconciled.
- **Product Decisions Required:** none outstanding on the foundation itself — the boundary, the interface additions (`featuresOf()`, `whens`, `radii`, `ctx`, removal patches in `describe()`, expanded `facets()`, broader `change()` patches) and the 51 KB size were approved 2026-10-03, with the historical-date correction recorded as `DEC-027`. Remaining steps, in the approved order: homepage adopts the shared file with no visual redesign (`STORY-025`); homepage UX evolution; review; Calendar and Map adoption.

### STORY-025 — Homepage adopts the shared discovery layer (no visual redesign)

- **Type:** STORY · **Status:** ACCEPTED — COMPLETE (built and tested 2026-10-03; accepted by the Product Owner in the final approval of 2026-10-03 after two bounded corrections — canonical Today shortcuts and the load window, `DEBT-008`; deployed that day as merge commit `b1cae64`; read-only production smoke test passed on all 19 approved checks) · **Priority:** High
- **Epic:** EPIC-002 / EPIC-009 · **Recommended Model:** Opus 5 · **Complexity:** Large (one page, every discovery code path)
- **Dependencies:** `STORY-024` (must be deployed together — `index.html` now loads `/discovery.js`).
- **Problem/User Need:** see `DEC-022`. The homepage is the first surface to stop carrying its own discovery rules.
- **Acceptance Criteria (Product Owner, 2026-10-03):** replace the homepage's duplicated discovery definitions and semantics with the shared layer wherever its contract covers them; preserve current presentation, layout, event cards and interactions; verify legacy URLs and existing interactions against the adopted layer; report behaviour changes rather than compensating for them; no homepage UX evolution, Don't Miss, Orbit preview, Calendar or Map migration, `STORY-023`, genre UI or unrelated cleanup.
- **Implementation Notes:** `index.html` loads `/discovery.js`, holds one canonical state changed only through `Discovery.change()`, and takes from Discovery: category keys/labels/order, the places table, the Orbit rule, "today" (Detroit time), every date window, the match predicate, counts (hero, cards, neighborhoods, list heading), the active-filter labels and removals, and URL reading and writing. Removed from the page: its own `CATS` labels, `LOCATIONS`, `CITY_LOOKUP`, the boundary and distance maths, `BLOCKED_NAMES`, `FEATURE_CHIPS`, the date helpers, `matchesFilters()` and friends, and `syncURL()`/`readStateFromURL()`'s own format — the page is about 500 lines shorter. Kept on the page because they are presentation or outside the contract: category colours, wording of headings and empty states, the day-grouped list index, time parsing for sort order and calendar export, and the "within 75 mi of you" count (`DEBT-009`). Tests: `test/homepage-discovery-adoption.test.js` runs the page's real script (with `test/fixtures/fake-dom.js`, a mock database and a fixed clock) through every control, card and old link form; `test/discovery-compat.test.js` now executes a frozen copy of the pre-adoption rules (`test/fixtures/homepage-before-discovery.js`) so the old-vs-shared comparison survives the old code's removal, and compares the old page's own URL reader with Discovery's, naming each approved difference; `test/dynamic-explore-neighborhoods.test.js` runs the adopted neighborhood counter. 35 deliberate breaks of the adopted page each fail a test. Also verified in a real browser before and after (120 states: every list and every card number equals what Discovery gives; all 1,475 event cards present both before and after are byte-identical; screenshots differ only where a number changed and in the "All types" chip) and read-only against production data.
- **Behaviour changes, for review** (every one measured; production figures from Sat 2026-10-03, 5:35 PM): events in progress are listed (default view 90 → 109 events); already-over events are no longer listed in Tonight / This Weekend / This Week (weekend 151 → 139); a multi-day event is listed on every day it overlaps the chosen dates, not only when it starts in them (tomorrow 30 → 51); "N events" in headings and on cards counts events, not event-days (hero 173 → 129; All Upcoming heading 2,363 → 1,890; Downtown card 106 → 36, and the list it opens now says the same 36 where it used to say 45); the site total includes events in progress (1,902 → 1,935); "today" is Detroit's date, not the device's; the URL is written in the shared form (no `date=`, `when=week`, `when=dates&from=&to=`) and old links still open the same view; bare `cats=` and turning the last category off mean all events (approved); a picked date now in the past is honoured (`DEC-027`); `when=now`/`today`/`next7`/`week`, `radius=all` without a place and `features=clothing_optional` in a link are honoured; the "All types" chip un-lights as soon as a category is turned off; uncategorised events show when no category is filtered; On the Radar no longer lists an event that already ended today.
- **Two corrections after review (Product Owner, 2026-10-03), both applied:** (1) the header's Today and the Free Today card use the canonical Today mode, not a picked date — "today in Detroit, whenever the link is opened": the link is `?when=today` (`?when=today&free=1`) and never goes stale, the chip reads "Today", and events that have already ended are left out; a literal picked date still serializes as that date and still shows everything that was on it. Production, 6:10 PM: Today lists 123 events where the picked date lists 156 (33 already ended); Free Today card 3 → 4 and its list 2 → 4. (2) the load window, `DEBT-008`: every current + upcoming event is now loaded and listable (default view 90 → 123; site total and loaded inventory both 1,954), with no other history loaded. With (2), the week strip's day counts include the long-running events on every day of the week (Monday 15 → 29).
- **Discovered Work:** `DEBT-007` (admin label), `DEBT-008` (homepage load window — corrected), `DEBT-009` (homepage rules still outside the shared contract, and decisions they need).
- **Product Decisions Required:** final approval to merge and deploy (with `STORY-024`). Everything else in the adoption — the behaviour changes above, the interface additions and `DEC-027` — was approved 2026-10-03.

---

## Tasks

### TASK-001 — Update README.md to reflect the current system

- **Type:** TASK · **Status:** READY · **Priority:** Low
- **Epic:** — · **Recommended Model:** Sonnet 5 · **Complexity:** Small
- **Dependencies:** None.
- **Problem/User Need:** `README.md` still describes a Detroit-only product with four crons (Ticketmaster, Trinosophes, WDET, HALO); the real system has 23 scheduled crons, self-service ICS feeds, editorial-article matching, Facebook auto-post, and healthchecks, across the full 75-mile Orbit. A new contributor reading `README.md` today would get a materially wrong picture.
- **Acceptance Criteria:** `README.md`'s source list, setup steps, and status description accurately reflect the current codebase; cross-checked against `vercel.json`'s actual cron list and `api/` directory contents, not rewritten from memory.
- **Implementation Notes:** if EPIC-001 execution reaches **WP 9.7** (README + docs refresh) before this is picked up, that WP supersedes this one for the ingestion-related portions of the README — check first rather than doing duplicate work. Status/priority unchanged by the 2026-09-21 ingestion-program import.
- **Discovered Work:** —
- **Product Decisions Required:** none.

### TASK-002 — Reconcile FEATURE_BACKLOG.md into /project and archive it

- **Type:** TASK · **Status:** READY · **Priority:** Low
- **Epic:** — · **Recommended Model:** Sonnet 5 · **Complexity:** Small
- **Dependencies:** None (this file's items — STORY-001, STORY-002, DISCOVERY-007 — already capture `FEATURE_BACKLOG.md`'s open items).
- **Problem/User Need:** `FEATURE_BACKLOG.md` is a second, independently-drifting backlog (it doesn't reflect that item #2, the tabbed admin layout, already shipped). Having two backlogs is exactly the "conversation/scattered docs are not the backlog" problem this `/project` structure exists to fix.
- **Acceptance Criteria:** `FEATURE_BACKLOG.md`'s content is confirmed fully represented in this file (STORY-001, STORY-002, DISCOVERY-007) and in `EPIC-004`; the file itself is either deleted or replaced with a short pointer to `/project/BACKLOG.md`, per Jody's preference — ask before deleting outright.
- **Implementation Notes:** don't delete without confirming — this is a documentation consolidation, flagged for Product Owner sign-off on the specific mechanism (delete vs. pointer stub).
- **Discovered Work:** —
- **Product Decisions Required:** delete `FEATURE_BACKLOG.md` outright, or leave a pointer stub?

### TASK-003 — Complete Facebook Page auto-post external setup

- **Type:** TASK · **Status:** BLOCKED · **Priority:** Low
- **Epic:** — (standalone, see `ROADMAP.md`) · **Recommended Model:** N/A — not an engineering task · **Complexity:** N/A
- **Dependencies:** Entirely external — Facebook/Meta Business verification, Meta App creation, App Review for `pages_manage_posts`/`pages_read_engagement`. All steps are documented in `FACEBOOK_SETUP.md` and must be done by Jody directly (need her own Facebook/Meta login).
- **Problem/User Need:** `api/cron-post-to-facebook.js` and its migration are code-complete and no-op safely until `FACEBOOK_PAGE_ID`/`FACEBOOK_PAGE_ACCESS_TOKEN` env vars exist.
- **Acceptance Criteria:** Meta App Review approved for the needed permissions; env vars set in Vercel; a `dryRun=1` check run and reviewed before enabling live posting; any large backlog of already-approved future events reviewed/backdated (`facebook_posted_at`) before first live run, to avoid a spammy posting burst.
- **Implementation Notes:** no code work remains.
- **Discovered Work:** —
- **Product Decisions Required:** none — purely blocked on external process completion.

### TASK-004 — Add GottaGacha as a new ingestion source

- **Type:** TASK · **Status:** REVIEW · **Priority:** Medium
- **Epic:** EPIC-001 (new-source addition to the ingestion program; not one of the 143 phased work packages) · **Recommended Model:** Sonnet 5 · **Complexity:** Medium
- **Dependencies:** None for the code. Canonical venue creation and the new `event_category` enum value are `BLOCKED` by `DEBT-002` (production migration state not verifiable/executable from this environment).
- **Discovered:** 2026-09-22, Product Owner "NEW SOURCE REQUEST — GOTTAGACHA" — a gaming venue (TCG, tabletop, fighting-game/esports tournaments, D&D) at 29200 Dequindre Rd #2B, Warren, MI 48092.
- **Problem/User Need:** 313.events had no gaming/esports/tabletop source. Discovery (browser-network-capture verified, since the public site is client-rendered and live fetches to the domain are egress-blocked in this environment) confirmed an authoritative unauthenticated first-party JSON API (`/api/events`) exists and is the correct ingestion source — not the public ICS calendar feed, which was checked and used only as corroborating evidence for recurrence behavior. GottaGacha's real event catalog (TCG nights, fighting-game/esports tournaments, D&D/tabletop RPG sessions) did not fit any existing category without force-fitting — Product Owner decision: add a new category, **Gaming & Esports** (15th category; the taxonomy was already 14, not the 11 originally referenced — that stale count is corrected here and in `index.html`/`calendar.html`'s own taxonomy-lock comments). `migration_009b`'s own header already establishes the taxonomy is count-locked, not size-locked, so this is a normal, deliberate expansion, not a taxonomy-lock violation.
- **Acceptance Criteria:** connector added following the 20 acceptance items the Product Owner specified (deterministic API parsing; stable series+date occurrence identity, provably distinct across dates in the same series and stable across reruns; non-recurring events stable; description/start/end time captured; gaming/movie/music/workshop events map deterministically to Gaming & Esports/Film/Music/Classes & Training; the one genuinely ambiguous real case found is not guessed; GottaGacha-location events resolve to the canonical venue once it exists, and fail safely to `venue_name_raw` until then; off-site events are not falsely assigned the GottaGacha venue; missing image/price never become populated/free; the bare site URL never becomes `event_url`; malformed API responses and fetch failures both produce zero writes; existing approved/rejected status is preserved on re-ingestion; `source_runs` logging is fail-safe; full regression suite passes) — all implemented and verified in `test/cron-gottagacha-runlog.test.js` (20+ PASS blocks) plus the full 19-file regression suite (`for f in test/*.test.js; do node "$f"; done`), all passing.
- **Implementation Notes:** `api/cron-gottagacha.js` (new connector, WP 0.5 `source_runs` instrumentation from day one, source slug `gottagacha` registered in `api/_lib/source-slugs.js` as the 21st entry). `DEFAULT_STATUS = "approved"` (matches the established policy for an official, structured, first-party source — same class as `cron-oldmiami.js`/`cron-dossin.js`); ambiguous-category rows get `pending_review` via the same placeholder-category pattern `cron-metrotimes.js` established (`category: "community", // placeholder`), not a silent Community fallback. Canonical venue: `supabase/update_2026-09-22_gottagacha-venue.sql`, using the established `update_YYYY-MM-DD_<venue>-venue.sql` convention (per `update_2026-09-20_rentfreehaus-venue.sql`), not a numbered migration — **NOT YET RUN AGAINST PRODUCTION, BLOCKED by `DEBT-002`**; the connector fails safe until it is (`venue_id` null, `venue_name_raw: "GottaGacha"`). New category: `supabase/migration_036_gaming_category.sql` / `migration_037_gaming_category_metadata.sql`, following the established `migration_007`/`009b`/`018`/`031`-`032` enum-then-metadata pattern — **also NOT YET RUN AGAINST PRODUCTION, BLOCKED by `DEBT-002`**. Scheduled hourly at 11:00 in `vercel.json` (the one open slot). Known, honestly-documented limitation: the one real off-site case in current data (GottaGacha appearing at Youmacon) is not detectable from the source's own location field as currently populated — off-site handling is implemented and tested generally, but this specific case is not caught; left as a documented gap rather than worked around with unauthorized inference. Commits: `f691b68` (taxonomy/schema), `910aba0` (connector + tests). Not pushed.
- **Discovered Work:** stale "11 categories" taxonomy-lock comments in `index.html`/`calendar.html`, and a stale "13-category"/"20 source slugs" comment in `api/admin-editorial.js`/`source-slugs.js`, corrected as part of this same change (in-scope — direct consequence of adding the 15th category and 21st source, not unrelated cleanup).
- **Product Decisions Required:** none outstanding for the code. Before GottaGacha can run in production: (1) `migration_036`/`migration_037` need to be run by hand in the Supabase SQL Editor (per `DEBT-002`'s standing workflow), (2) `update_2026-09-22_gottagacha-venue.sql` needs to be run the same way, (3) this branch needs to be pushed and merged once the Product Owner reviews it.

### TASK-005 — PRE-DETAIL CROSS-SOURCE MATCH OBSERVATION (RA listing-level entity matching, measurement only)

- **Type:** TASK · **Status:** BACKLOG (observation-only; explicitly not scheduled, not implemented) · **Priority:** Low-Medium
- **Epic:** EPIC-003 (Entity & Identity Data Buildout) — directly motivated by, and scoped against, the RA ingestion pipeline (`scripts/ra-sync.js`, `scripts/ra-candidate-promotion.js`) under EPIC-001. · **Recommended Model:** Sonnet 5 · **Complexity:** Medium (a real listing-level entity matcher is new logic, not a lookup)
- **Dependencies:** `event_source_identities` (this same session's implementation, 2026-10-03 — schema in `supabase/migration_045_event_source_identities.sql`, **not yet run against production**; read/write helpers in `api/_lib/event-source-identities.js`; wired into `scripts/ra-sync.js`'s `startRaSyncSession`/`completeRaSyncSession`, `scripts/ra-candidate-promotion.js`'s `promoteRaCandidates`, and `api/known-ra-ids.js`) must exist and be live first — this ticket's whole point is to measure a *predicted* pre-detail match against the *actual* post-detail identity/dedupe result that mechanism already produces.
- **Discovered:** 2026-10-03, Product Owner review of the RA coverage/observability/duplicate-identity implementation pass. The Product Owner's own eventual-optimization goal — avoid spending scarce RA detail-fetch capacity on listings that can already be confidently identified as an existing canonical event from listing metadata alone (e.g. a promoter's own direct submission that RA later also lists) — was explicitly separated out of that pass's approved scope rather than folded into it, because it is a different and larger problem than the id-level "is this RA id already known?" check `event_source_identities` answers: it requires matching *before* a detail fetch, using only RA's own listing-card metadata (title/date/venue), against events that may have entered 313.events through a different source entirely.
- **Problem/User Need:** Right now, every RA listing id not already known via `events.external_id` or `event_source_identities` gets a full detail fetch before any dedupe check runs (`findConservativeDuplicate` only runs post-detail, inside `completeRaSyncSession`/`promoteRaCandidates`). If RA's own listing-card fields (title, date, venue name) could reliably identify a canonical-event match on their own, detail-fetch capacity — the pipeline's scarcest resource, given RA's own DataDome blocking — could eventually be spent only on genuinely new candidates. But nobody has measured whether listing-level metadata alone is accurate enough for that, so skipping fetches on it today would be a guess, not a decision.
- **Acceptance Criteria:** this ticket delivers *measurement*, not a behavior change. For each newly-discovered RA listing, in addition to (not instead of) the existing pipeline: (1) run a conservative title/date/venue match of the RA listing's own metadata against existing canonical events (same conservative spirit as `findConservativeDuplicate`, but operating on listing-card fields only, before any detail fetch); (2) record the predicted match (or "no match"), without acting on it in any way; (3) continue the normal detail fetch and dedupe exactly as today; (4) once the post-detail result is known, compare the pre-detail prediction against it and record whether the prediction was correct, a false positive, or a false negative; (5) report aggregate precision/recall once enough observations exist. No fetch is ever skipped by this ticket, and no production behavior changes — it is additive instrumentation only.
- **Implementation Notes:** this is explicitly its own bounded ticket, not an extension of `event_source_identities` or of either `completeRaSyncSession`/`promoteRaCandidates`'s existing post-detail dedupe call. It needs a genuine listing-level entity matcher (new logic — the existing `findConservativeDuplicate` match surface and this one overlap in spirit but the input is different: full derived event row vs. bare RA listing-card metadata), plus a place to durably record predictions and their eventual correctness (schema not yet designed — likely a new table or columns, not scoped here). Do not begin implementation until this is separately scoped and approved; do not reuse this ticket to justify skipping any detail fetch.
- **Discovered Work:** —
- **Product Decisions Required:** none yet — this is a measurement ticket. The real decision (whether, and under what precision threshold, to ever skip a detail fetch based on a pre-detail match) is explicitly deferred until this observation period produces real precision/recall numbers; the Product Owner was explicit that fetch-skipping must not be enabled as part of this work.

---

## Bugs

### BUG-001 — Verify: does a failed status-lookup risk re-approving a previously-rejected event?

- **Type:** BUG · **Status:** **SUPERSEDED by WP 0.17** (`epics/EPIC-001-ingestion-platform-scaling/phase-0-stabilize-instrument.md`) · **Priority:** High
- **Epic:** EPIC-001 · **Recommended Model:** N/A — implementation tracked in WP 0.17, not here
- **Dependencies:** None.
- **Reconciliation (2026-09-21):** verified against the source documents, not assumed. The ingestion-architecture audit (`INGESTION_PLATFORM_ARCHITECTURE.md` gap **D7**, severity **S1**) confirms this is real, not merely suspected: "If the pre-write status lookup fails, rejected events (including dedupe rejections) are re-approved... `DEFAULT_STATUS` is `approved` in 17 of the 20 connectors, so moderator rejections, including every dedupe-batch rejection, are silently reversed on that run." **WP 0.17** is the exact, named fix — it (1) verifies whether rows rejected by the 2026-09-17 dedupe batches are still rejected today, and (2) fixes all 20 connectors to chunk the status lookup and abort the upsert on any lookup failure, rather than defaulting to `approved`. The architecture explicitly names WP 0.17 "do first."
- **Problem/User Need (historical, preserved):** During adversarial review of the ingestion-architecture proposal, a potential gap was identified in the status-preserving-upsert pattern (`DEC-011`): if a cron's pre-write status-lookup GET request itself fails, does the upsert logic correctly abort, or silently proceed as if no prior status existed? Originally flagged as unconfirmed against live code — now confirmed by the full audit.
- **Acceptance Criteria:** see WP 0.17 in `phase-0-stabilize-instrument.md` — not weakened or restated here.
- **Implementation Notes:** do not schedule this as a separate ticket. Any work here is WP 0.17.
- **Discovered Work:** —
- **Product Decisions Required:** none.

---

### BUG-002 — Detroit Historical Society/Dossin: adjacent-line date/time parsing gap

- **Type:** BUG · **Status:** REVIEW — FIXED (LIVE-UPSTREAM/PARSER VERIFIED, NEEDS PROD RUN VERIFICATION); awaiting a scheduled production run and PO acceptance · **Priority:** High
- **Epic:** EPIC-001 · **Recommended Model:** Sonnet 5
- **Dependencies:** None.
- **Discovered:** 2026-09-21, during the production ingestion-health incident triage (8 of 51 smoke checks failing). Distinct from the 2026-09-20 fix (`69e42b9`) already applied to this same file for a different, now-resolved defect (that one assumed date/time were never split at all; the site turned out to still split them, just differently than first diagnosed).
- **Problem/User Need:** `cron-dossin.js`'s `DATE_LINE` regex (then named `TITLE_DATE_TIME_LINE`) required an event's start time and end time to appear on one combined line. Reproduced live on 2026-09-21: the site actually renders the start date/time and the "- end time" as two separate lines/elements, so the regex never matched anything and the connector silently upserted zero rows on every run — exactly what the source-freshness smoke check was catching.
- **Acceptance Criteria:** current live markup produces events; start time parses correctly; end time parses correctly when it's on the line immediately after the start line; the old single-line combined format still works if it's ever used again; an unrecognized month name or an out-of-range day is skipped rather than producing a bad row; connector reaches a valid write payload.
- **Implementation Notes:** fixed in `api/cron-dossin.js` — `DATE_LINE` now accepts a start time with no same-line end time, then checks the next line for a bare `- H:MMam/pm` continuation. Verified against a local fixture (`test/cron-dossin-parse.test.js`, `node test/cron-dossin-parse.test.js`) and independently re-verified by re-running the fixed parsing logic against the live `detroithistorical.org/events` page: 5 Dossin events now parse correctly (0 before the fix). **This confirms the parser and the live upstream markup only** — it does not confirm the deployed scheduled ingestion/write path, which has not yet executed with this fix. Production-run verification is still needed before this can be called fully fixed.
- **Discovered Work:** —
- **Product Decisions Required:** none — implementation-level fix, no policy/scope question.

### BUG-003 — Detroit Month of Design: diagnose 7-day freshness silence (no upstream/parsing defect found)

- **Type:** BUG · **Status:** REVIEW (diagnostics added, awaiting next scheduled run's evidence) · **Priority:** Medium
- **Epic:** EPIC-001 · **Recommended Model:** Sonnet 5
- **Dependencies:** None.
- **Discovered:** 2026-09-21, during the production ingestion-health incident triage.
- **Problem/User Need:** `cron-detroitmonthofdesign.js` has had no row updated in 7+ days, but the upstream sitemap (367 event-details URLs, up from 318 at the connector's last capacity check on 2026-09-05), a sample detail page's JSON-LD, and a real future event (2026-10-17) were all confirmed healthy and correctly parseable live on 2026-09-21. No parsing or upstream defect was found. Leading, **unconfirmed** hypothesis: the connector may now be exceeding its 180s `maxDuration` before reaching the write step, given sitemap growth plus this source's documented Wix rate-limit retries — Vercel would kill the run silently, with zero rows written and nothing logged.
- **Acceptance Criteria:** diagnostic logging added (cron start, sitemap URL count, detail URLs attempted/completed, elapsed-time checkpoints, Wix retry/rate-limit counts, parsed event count, point reached before termination, write attempt/result) without changing `maxDuration`, concurrency, batching, or any ingestion semantics. No secrets logged. Once the next scheduled run's log evidence is available, it determines whether this is actually a timeout (and what fix that implies) or something else.
- **Implementation Notes:** implemented in `api/cron-detroitmonthofdesign.js` — cron-start timestamp, sitemap URL count, a per-50-pages progress checkpoint (elapsed ms + Wix retry-status counts) during the detail-page pass, a post-pass summary, per-chunk Supabase write attempt/response, and a final completion log, all as `[cron-detroitmonthofdesign] ...` lines. `maxDuration`/`FETCH_CONCURRENCY`/`SUPABASE_BATCH_SIZE` untouched. Verified via a mocked fetch harness (including a simulated 429-then-success retry) that the added logging doesn't change which rows get written. Vercel streams `console.log` output as it happens, so even if a run is later killed by a timeout, the last logged checkpoint should show how far it got — which is the specific evidence this WP needs.
- **Discovered Work:** —
- **Product Decisions Required:** none yet — revisit once the diagnostic evidence is in.

### BUG-004 — Popps Packing: diagnose 7-day freshness silence (separate from WP 0.8)

- **Type:** BUG · **Status:** REVIEW (diagnostics added, awaiting next scheduled run's evidence) · **Priority:** Medium
- **Epic:** EPIC-001 · **Recommended Model:** Sonnet 5
- **Dependencies:** None. Explicitly NOT the same defect as WP 0.8 (confirmed 2026-09-21 — see WP 0.8's own notes).
- **Discovered:** 2026-09-21, during the production ingestion-health incident triage.
- **Problem/User Need:** `cron-poppspacking.js` has had no row updated in 7+ days. The upstream WordPress REST API was confirmed live and healthy (200, real posts). The shared venue-lookup helper was ruled out as a crash source (`buildVenueNameToIdMap` is designed to never throw). No code-level defect was found — this connector had no diagnostic logging at all (unlike `cron-metrotimes.js`, which got exactly this kind of logging on 2026-09-14 for the same "200 but zero rows written, no visibility" problem), so there was no way to tell what actually happens on a real scheduled run.
- **Acceptance Criteria:** diagnostic logging added (cron started, upstream response status, number of upstream records fetched, number parsed, number eligible for write, Supabase write attempted, Supabase response/error, cron completion) without changing any ingestion behavior. No secrets/tokens/full payloads logged. Once the next scheduled run's log evidence is available, it determines the actual root cause.
- **Implementation Notes:** implemented in `api/cron-poppspacking.js` — all 8 required checkpoints logged as `[cron-poppspacking] ...` lines, verified via a mocked fetch harness to confirm the added logging doesn't change behavior or upsert results. Kept as its own commit, separate from the WP 0.8 fix, since the instrumentation is a distinct concern from the field-overwrite repair. Kept separate from WP 0.8 in scope too — WP 0.8 is a real, independently-confirmed defect (existing rows get their `start_date`/`time_display` overwritten) but does not explain total write silence, since even an overwritten row still gets its `updated_at` touched. Fixing WP 0.8 does not close this incident; the actual root cause is still unknown pending the next run's Vercel log output.
- **Discovered Work:** —
- **Product Decisions Required:** none yet — revisit once the diagnostic evidence is in.

---

### BUG-005 — Public pages silently lost every event past the API's 1,000-row cap (Calendar showed no upcoming events)

- **Type:** BUG · **Status:** REVIEW (Product Owner approved deployment 2026-10-03; deployed the same day as commit `ae65cd8`; production smoke check passed on Calendar, Homepage, Map and Venues — every row count matched the database) · **Priority:** Critical
- **Epic:** none (production correctness; prerequisite for the discovery-foundation work that follows it, but deliberately kept separable from it)
- **Dependencies:** None.
- **Discovered:** 2026-10-03, while measuring real counts for the homepage UX-evolution plan.
- **Problem/User Need:** Supabase returns at most its "Max rows" setting (1,000) per request regardless of the `limit=` a query asks for, with a success status and no error. Every public page made one un-paged event request (`limit=2000`/`5000`, added by earlier "audit fixes" on the belief that an explicit limit lifts the cap — it does not). Measured in production 2026-10-03: `calendar.html` (no date floor, oldest first) held the oldest 1,000 approved events, ending 2026-10-02 — **zero events starting today or later** (today's cell showed 19 of 151; all of October showed 438 event-days of 1,678). `index.html` and `map.html` held 686 of 1,902 upcoming events and nothing after 2026-10-20, so search, "All upcoming", date picks, neighborhood counts and radius filtering all stopped there. `venues.html`'s per-venue count query was at 822 rows, 178 from the same failure.
- **Acceptance Criteria (Product Owner, 2026-10-03):** not merely "pagination exists" — verified against production-equivalent data that events beyond the first 1,000 rows are actually available to each affected surface, and that the Calendar can represent the complete October inventory. Kept separable from the redesign. Not deployed without approval.
- **Implementation Notes:** new shared static include `paged-fetch.js` (same pattern as `legal-snippets.js`) exposing one function, `fetchAllRows()`: one exact-count request, then every page requested at once; trusted only if as many rows come back as the count promised, otherwise it falls back to one page at a time, advancing by however many rows actually came back — so it never assumes the cap is 1,000. Applied to the event queries in `calendar.html`, `index.html`, `map.html` and to both list queries in `venues.html`; each paged query's `order=` now ends in `id.asc` so the order is total. Tests: `test/paged-fetch.test.js` (helper, against a cap-enforcing mock API) and `test/paged-loading-pages.test.js` (each page's real `loadSupabaseEvents()` extracted and executed against a production-shaped 2,954-row data set; confirmed to FAIL against the unfixed pages). Production verification: each fixed page was run, byte-identical to this commit, against live data and compared with an independently paged copy of the database — Calendar 2,954 of 2,954 rows and all 31 October days matching; Homepage and Map 2,216 of 2,216 from their load floor (1,902 upcoming); Venues 822 of 822.
- **Discovered Work:** see `DEBT-003` (other queries still un-paged and the Calendar's unbounded history load), `DEBT-004`, `DEBT-005`, `DEBT-006` (data-coverage findings from the same measurement).
- **Product Decisions Required:** none outstanding (deployment approved and verified; formal acceptance is the Product Owner's to record).

### BUG-006 — Homepage header: search + Submit Event wrapped onto a second row at every desktop width

- **Type:** BUG · **Status:** ACCEPTED — COMPLETE (fixed 2026-10-03; approved by the Product Owner the same day, including the 16px link spacing and `flex-wrap:nowrap` above 900px; deployed that day as commit `660b81f`; verified in production in Chrome at 19 widths from 360px to 1,920px; Safari is checked visually by the Product Owner) · **Priority:** High
- **Epic:** EPIC-002
- **Dependencies:** None.
- **Discovered:** 2026-10-03, reported by the Product Owner on desktop Safari after the Discovery / homepage-adoption deployment and treated as a regression from it.
- **Problem/User Need:** search + Submit Event sat on a second row at the far left, under the logo, instead of at the right end of the header row.
- **Root cause (measured, not inferred):** not the Discovery deployment — the header's markup and every CSS rule are byte-identical before and after it, and the pre-Discovery production deployment renders the header at the same coordinates in the same browser. The cause is the ninth nav link, Neighborhoods, added 2026-10-01 (`07580f3`): `[logo 157] + [nine links 22px apart 806] + [search + submit 169] + [two 16px gaps]` is about 1,164px in a 1,140px header, so the last flex item wrapped at every desktop width, in every browser. The first fix (`77c45fe`, 2026-10-03: `min-width:0` on the nav, `flex-shrink:0` on the group) could not work: with `flex-wrap:wrap` a row breaks into lines before any item may shrink.
- **Acceptance Criteria:** on desktop the header is one row — logo, nav, search, Submit Event — with search + Submit Event at the right end; no change at tablet and mobile widths; no header redesign.
- **Implementation Notes:** `index.html` only, two CSS rules: `@media (min-width:901px){header.site{flex-wrap:nowrap;}}` and the nav's link gap 22px → 16px. With that, the logo, search and Submit Event are at exactly the coordinates they had when the header last fitted on one row (before the ninth link); between 901px and about 1,170px wide the nav wraps its links onto two lines and Submit Event stays top right; at 900px and below nothing changes (pixel-identical). `calendar.html` and `map.html` have seven links and were never affected. Test: `test/homepage-header-layout.test.js`. Verified in Chromium at 23 widths with the site's real fonts and in Chrome on macOS against production; Safari could not be driven from the build environment — a check page for it was left in the repo's git-ignored `_to_delete/` folder.
- **Discovered Work:** the nine-link nav has about 24px of slack on one row; a tenth link will not fit without another change.
- **Product Decisions Required:** none remaining — the 16px link spacing, `flex-wrap:nowrap` above 900px and deployment were approved by the Product Owner on 2026-10-03.

---

## Tech debt

### DEBT-001 — Detroit Orbit boundary is not enforced server-side outside cron-ticketmaster.js

- **Type:** DEBT · **Status:** **SUPERSEDED by WP 1.10, 1.11, and the pipeline's per-source geography resolution** (`epics/EPIC-001-ingestion-platform-scaling/phase-1-foundations.md`, `phase-9-public-site-integration-cleanup.md`) · **Priority:** Medium
- **Epic:** EPIC-001 · **Recommended Model:** N/A — implementation tracked in the WPs below, not here
- **Dependencies:** related to `DISCOVERY-008` (which write paths need enforcement — still open, see below).
- **Reconciliation (2026-09-21):** verified against the source documents. This item corresponds most directly to the ingestion audit's gap **G1** ("The Orbit rule is enforced only for Ticketmaster. Other sources aren't checked, and WDET uses a *narrower* allowlist that drops valid Orbit events") and the broader geography rework in `INGESTION_PLATFORM_ARCHITECTURE.md` §4. The approved architecture computes Orbit membership once per venue against a stored PostGIS polygon (**WP 1.10**, `in_orbit()`/`miles_from_border()` functions; **WP 1.11**, venue geo columns + trigger) rather than checking it per-cron — every event inherits `in_orbit` through venue resolution, not through a per-connector boundary check. **WP 9.1/9.2** carry this through to the public site (replacing the client-side hard-coded `LOCATIONS` list). This is a structural fix, not a per-write-path patch — it supersedes what a standalone `DEBT-001` fix would have done.
- **Problem/User Need (historical, preserved):** `milesFromDetroitBorder()` (`api/_lib/detroit-boundary.js`) is only actually called from `cron-ticketmaster.js`. Manual admin entry, single-event submission, self-service feed events, and every other single-source cron have no server-side check against the Orbit boundary today.
- **Acceptance Criteria:** see WP 1.10, 1.11, 9.1, 9.2 — not weakened or restated here.
- **Implementation Notes:** do not schedule a standalone per-cron patch; this is superseded by the pipeline-wide geography model. `DISCOVERY-008` (below) remains open as a narrower, still-relevant question: even after the pipeline lands, does every intake path (manual admin entry in particular) get an Orbit check, or only pipeline-ingested sources?
- **Discovered Work:** —
- **Product Decisions Required:** see `DISCOVERY-008`.

---

### DEBT-002 — Direct production observability / database access for Claude's execution environments

- **Type:** DEBT · **Status:** **Substantially superseded by actual practice (updated 2026-10-01) — original framing was narrower than what turned out to be achievable; see correction below.** Remaining scope, if any, is now just "should Claude get its own write-capable credential," not "Claude cannot reach production at all." · **Priority:** Low (downgraded from Medium-High)
- **Epic:** none (cross-cutting engineering-environment infrastructure, not a product epic)
- **Dependencies:** none.
- **Discovered:** 2026-09-21, during `EPIC-006`/SH.1's production-repair authorization. Investigated twice at the time: direct HTTP/Postgres reachability tests from Claude's own sandbox network stack, and the Supabase SQL Editor browser-automation fallback (which proved unreliable mid-task on that occasion).
- **Correction (2026-10-01):** the original finding — that Claude's cloud container and the Cowork-linked Mac cannot reach Supabase via a *direct* HTTP/Postgres connection from the sandbox's own network stack — remains true and was never retested or disputed. But that turned out not to be the only, or even the operative, path. Two things have since been true throughout this entire engagement, repeatedly and reliably, including through this very EPIC-006 closure audit: (1) **read access** — dozens of live production queries this session were made successfully via the Chrome browser tool's `javascript_tool`, executing a real `fetch()` in the browser's own page context against the Supabase REST API with the anon/publishable key. This is a different path than the direct-sandbox-egress tests DEBT-002 investigated (browser-mediated, not sandbox-network-mediated) and has not shown the unreliability the original SQL-Editor-automation fallback did. (2) **write access** — every actual production repair this epic needed (SH.1's backfill, the `ics-location.js` parser-driven repair pass, the generic-metadata-enrichment cron) was achieved without Claude's sandbox ever touching the database directly: a real Vercel-scheduled cron running server-side with the service-role key, or Jody's own click of `admin.html`'s Auto-Repair button. Neither needed Claude to hold a database credential at all — the architecturally-correct fix (wire the repair into a cron or an admin action, same as every other repair this project ships) sidestepped the need DEBT-002 was framed around.
- **Impact, restated:** read-only engineering diagnostics, completeness measurement, and source-health analysis are **not** blocked today — the anon-key/browser-fetch path covers them (within RLS's limits: tables with no public SELECT policy, e.g. `source_runs`, genuinely return zero rows to this path and require Jody's own service-role session to inspect — this is a real, narrower, still-true limitation, not resolved by this correction). Production *write* operations continue to go through normal deployed pathways (crons, admin actions) rather than through any direct Claude-held credential, and nothing in this engagement has actually needed that to change.
- **Future objective, narrowed:** if Jody still wants Claude to be able to run an ad hoc read query against RLS-protected tables (e.g. `source_runs`) or execute a one-off write outside the cron/admin-action pattern, the original scoped-Postgres-role idea is still the shape that would take — but nothing in this epic's actual history has required it, so it is no longer a blocker for any in-flight work.
- **Acceptance Criteria:** not applicable at this priority — this is now an optional convenience item, not a blocking gap. If pursued: an org-level decision on network egress to a Supabase host (unchanged from the original entry), then a scoped-role design pass.
- **Implementation Notes:** do not design or implement a solution unless Jody explicitly asks — nothing currently depends on it. Still distinct from the separate, already-tracked GitHub-authentication gap (no git push credential configured in these environments), which is unaffected by this correction.
- **Discovered Work:** —
- **Product Decisions Required:** none urgent. Only if Jody wants Claude to query RLS-protected tables directly (e.g. `source_runs`) or write outside the cron/admin-action pattern: whether to open network egress and provision a scoped Postgres role.

---

### DEBT-003 — Remaining un-paged queries, and the Calendar's unbounded history load

- **Type:** DEBT · **Status:** BACKLOG · **Priority:** Medium
- **Epic:** none (follow-up to `BUG-005`)
- **Dependencies:** `BUG-005`'s `paged-fetch.js`.
- **Discovered:** 2026-10-03, during `BUG-005`.
- **Problem/User Need:** `BUG-005` was deliberately limited to Calendar, Homepage, Map and Venues. The same single-request pattern remains in queries that are under the 1,000-row cap today but will fail the same silent way when they cross it (row counts measured 2026-10-03): `neighborhoods.html`'s per-neighborhood event rows (380); `radar.html`'s `editorial_articles` (114); `index.html`'s `editorial_article_events` (139); the venue-coordinate lookups in `calendar.html`/`map.html` (0 today). Separately, `calendar.html` loads every approved event ever (2,954 rows, about 2.8 MB of JSON before compression, in three requests) though it can only navigate 12 months back; that load grows without bound as history accumulates, and all but one of today's rows are less than 12 months old, so the cost is ahead, not behind.
- **Acceptance Criteria:** every list query a public page makes either pages through `fetchAllRows()` or is provably bounded; `calendar.html` loads only what its navigable window can show (events that start or are still running within it), with nothing currently visible lost.
- **Implementation Notes:** the Calendar floor must keep long-running events that started before the window (`or=(start_date.gte.FLOOR,end_date.gte.FLOOR)`), not just floor on `start_date`.
- **Discovered Work:** —
- **Product Decisions Required:** none.

---

### DEBT-004 — Neighborhood coverage: only about 1 in 5 upcoming events has a neighborhood

- **Type:** DEBT (data coverage) · **Status:** BACKLOG · **Priority:** Medium
- **Epic:** EPIC-003 (entity identity) / EPIC-006
- **Dependencies:** venue linkage (`DEBT-006`) — neighborhood resolves only through `events.venue_id → venues.neighborhood_id`.
- **Discovered:** 2026-10-03 (Product Owner asked for this to be visible in the backlog; recorded, not solved).
- **Problem/User Need:** measured 2026-10-03, 380 of 1,901 upcoming approved events carry a neighborhood, across 20 of the 45 neighborhoods in the table. Every neighborhood-based surface (Explore Neighborhoods cards, the neighborhood filter, `neighborhoods.html`, the planned "active neighborhoods" hero stat) therefore describes a fifth of the inventory. Neighborhood counts on the homepage are additionally counted in event-days, not events (a multi-day run counts once per day).
- **Acceptance Criteria:** to be set with the Product Owner — at minimum a tracked coverage figure and a target.
- **Implementation Notes:** do not guess a neighborhood from a name or address (`DEC-012`). Counting by distinct event is addressed separately by the shared discovery layer's counting rule.
- **Discovered Work:** —
- **Product Decisions Required:** coverage target; whether DEC-004's Detroit-only neighborhood granularity still stands as the site covers more of the Orbit.

---

### DEBT-005 — Events in cities missing from the places table disappear under location filtering

- **Type:** DEBT (data coverage) · **Status:** BACKLOG · **Priority:** Medium
- **Epic:** EPIC-002 / EPIC-009
- **Dependencies:** None.
- **Discovered:** 2026-10-03 (Product Owner asked for this to be visible in the backlog; recorded, not solved).
- **Problem/User Need:** location filtering and the map resolve an event's position by looking its city up in a hand-maintained places table. Measured 2026-10-03, at least 140 upcoming events are in cities that table does not contain (Richmond 46, Redford 27, Canton 16, Bowling Green 14, Plymouth 13, Macomb 8, Belleville 6, and others), so they are excluded whenever any radius filter is active and cannot be placed on the map (178 events in the Map's current load window are unplaceable). The places table has also drifted between pages: `index.html` has 96 entries; `calendar.html` and `map.html` have 92 (missing Lansing, East Lansing, Clinton Township and one neighborhood) and still measure the Orbit from Detroit's centre rather than its border, contrary to `DEC-003`.
- **Acceptance Criteria:** every city with upcoming events is either in the places table (verified inside the Orbit per `SERVICE_AREA.md`) or explicitly reported as out of area; surfaces say how many events they could not place rather than dropping them silently.
- **Implementation Notes:** the page-to-page drift is resolved by the shared discovery layer holding one places table; the missing cities are a data task on top of that. Some city values are themselves wrong at the source (e.g. suburban-library events stored with city "Detroit") — a separate ingestion-quality issue.
- **Discovered Work:** —
- **Product Decisions Required:** confirm each added city against the service area.

---

### DEBT-006 — Venue linkage is too thin for a trustworthy venue count

- **Type:** DEBT (data quality) · **Status:** BACKLOG · **Priority:** Medium
- **Epic:** EPIC-003
- **Dependencies:** `DEC-012` (venue resolution is going-forward-only, exact-match, no auto-creation).
- **Discovered:** 2026-10-03 (Product Owner asked for this to be visible in the backlog; recorded, not solved).
- **Problem/User Need:** measured 2026-10-03, the `venues` table has 130 rows; upcoming events name 309 distinct venues as free text; 84 venue rows are linked from upcoming events; 821 of 1,901 upcoming events have a `venue_id`; and 0 of 130 venue rows have coordinates. No single number among these is a defensible "venues" headline, so the Product Owner has held venue and city totals out of the homepage hero until this improves.
- **Acceptance Criteria:** to be set with the Product Owner — a venue count the site can state publicly without qualification.
- **Implementation Notes:** coordinates matter independently: without them every map position is a city centre.
- **Discovered Work:** —
- **Product Decisions Required:** what coverage level makes a venue count publishable.

---

### DEBT-007 — Admin editorial form labels the `fest` category "Festivals"; the public label is "Festivals & Parades"

- **Type:** DEBT (taxonomy label) · **Status:** BACKLOG · **Priority:** Low
- **Epic:** EPIC-004
- **Dependencies:** None.
- **Discovered:** 2026-10-03, by the discovery drift guard (`test/discovery-compat.test.js`), which records it as the one known difference so that any other divergence still fails.
- **Problem/User Need:** `admin.html`'s `EDITORIAL_CATEGORIES` lists `['fest', 'Festivals']`; every public surface, and `discovery.js`, says "Festivals & Parades". Same key, same events — only the admin-side wording differs.
- **Acceptance Criteria:** the admin label reads "Festivals & Parades" (or the Product Owner chooses a different single label for both); the `KNOWN_ADMIN_LABEL_DIFFERENCES` exception is removed from the drift guard.
- **Implementation Notes:** deliberately NOT changed as part of the discovery work (Product Owner, 2026-10-03: leave `fest` unchanged; do not mix this correction into Discovery adoption). The category key and the public label are untouched.
- **Discovered Work:** —
- **Product Decisions Required:** none beyond confirming the public wording is the one to keep.

---

### DEBT-008 — The homepage loaded only events that START within eight days back

- **Type:** DEBT (data loading) · **Status:** ACCEPTED — COMPLETE (corrected 2026-10-03 by Product Owner direction; part of `STORY-025` and accepted with it; deployed that day as merge commit `b1cae64`; verified in production — every current + upcoming event loads, including long-running events that began before the back-buffer) · **Priority:** Medium
- **Epic:** EPIC-002
- **Dependencies:** `STORY-025`; related to `DEBT-003` (Calendar's load window).
- **Discovered:** 2026-10-03, during the homepage's adoption of the shared discovery layer.
- **Problem/User Need:** `loadSupabaseEvents()` asked for `start_date >= today − 8 days`. An event that began earlier and is still running (a long exhibition, a season-long market) is part of the current + upcoming inventory (`DEC-023`) and counted in the site total, but was never loaded, so it could not be listed — measured 2026-10-03: 14 of 33 in-progress events, the longest running since January.
- **Decision (Product Owner, 2026-10-03):** fix it so every event eligible for the homepage's current + upcoming inventory can be loaded and displayed; do NOT turn it into unrestricted historical loading to support arbitrary old homepage date links — deep historical discovery remains a Calendar concern.
- **Acceptance Criteria:** every approved event that starts today or later, or is still running, is loaded and can be listed; no finished event from before the eight-day back-buffer is loaded.
- **Implementation Notes:** the smallest change with the existing schema is the filter itself: `start_date >= floor` became `start_date >= floor OR end_date >= today` (`or=(start_date.gte.<floor>,end_date.gte.<today>)` on `events_public`) — the same back-buffer, plus everything still running. A long-running event is listed from the back-buffer's first day rather than from its own start (otherwise the 60-listed-days guard, `MAX_EVENT_SPAN_DAYS`, would be spent on days the page never shows); the guard itself is unchanged, so a run longer than 60 days is listed on the next ~52 days. Measured on production 2026-10-03 (6:05 PM): 2,235 → 2,249 rows, the 14 added all in progress, none finished; the same three pages; +18 KB on 2.17 MB of JSON (+0.8%); load time unchanged within noise (medians about 0.56 s and 0.62 s over six runs each, ranges overlapping); all 1,954 events the database counts as current + upcoming are loaded (1,940 before). Tests: `test/paged-loading-pages.test.js` (long-running loaded, finished history not, every page of the query carries the bounded filter) and `test/homepage-discovery-adoption.test.js`.
- **Discovered Work:** an explicit date older than the back-buffer is still honoured as a selection (`DEC-027`) and still shows an empty list on the homepage — by the decision above, that is Calendar's job; a hand-off link from that empty state could be considered in the homepage UX evolution.
- **Product Decisions Required:** none outstanding.

---

### DEBT-009 — Homepage rules still outside the shared discovery contract, and the decisions they need

- **Type:** DEBT (discovery follow-ups) · **Status:** BACKLOG · **Priority:** Medium
- **Epic:** EPIC-002 / EPIC-009
- **Dependencies:** `STORY-025`.
- **Discovered:** 2026-10-03, during the homepage's adoption of the shared discovery layer. None of these was changed; each is reported rather than compensated for.
- **Problem/User Need:**
  1. **"Within 75 mi of you" (the "What's in your Detroit Orbit?" card).** Once a location is set, the card counts events within 75 miles of the visitor's own point. That is not one of Discovery's distance filters (5/10/25/50 mi from the chosen point, or the Detroit Orbit — 75 mi from Detroit's border), so it remains the card's own arithmetic; and the card's button applies the Detroit Orbit, not that radius, so the number and the list it opens are not the same thing (production, from Royal Oak: 1,733 on the card and 1,733 in the Orbit that day — equal only because every placeable event was within both).
  2. ~~**"Today" (header) and "Free Today" (card) are an explicit pick of today's date.**~~ **Settled 2026-10-03 (Product Owner):** both now use the canonical Today mode (`when.mode = 'today'`; Free Today is Today + free) — see `STORY-025`. A literal picked date remains a stable, dated selection.
  3. **The "Showing today — see everything" note still appears above search results**, which span every upcoming date (pre-existing wording condition, preserved).
  4. **A long-running event is listed under every day of its run.** Pre-existing for events starting today or later; now also true of events in progress, so one exhibition can account for dozens of rows in All Upcoming, a neighborhood or a search (production: a "jazz" search went from 7 rows to 66 for 7 events). A presentation question for the event stream in the homepage UX evolution.
  5. **Rendering cost of the widest views.** All Upcoming renders about 2,500 cards at once and search re-renders on every keystroke (unchanged by the adoption, but heavier since `BUG-005` loaded every event).
  6. **Time parsing exists twice**: inside `discovery.js` (for "tonight" and "is it over") and on the page (for sort order and calendar export). Not exposed by the contract.
- **Acceptance Criteria:** each item either decided and implemented, or explicitly accepted as is.
- **Implementation Notes:** items 2–5 are natural inputs to the homepage UX evolution.
- **Discovered Work:** —
- **Product Decisions Required:** item 1.

---

## Discovery / decisions needed

### DISCOVERY-001 — Resident Advisor / Instagram capture policy

- **Status:** BACKLOG · **Priority:** Medium · **Epic:** EPIC-001
- **Problem:** An earlier framing in this project understated the access-authorization issue with directing a logged-in browser session at RA/Instagram content (their ToS prohibits automated access outright; real sessions have hit DataDome challenges). Needs Jody's explicit choice among: pursue a written RA partnership, restrict to human-read-and-typed-in-only manual capture, or knowingly accept the ToS risk.
- **Cross-reference (2026-09-21):** this is the same open question as Appendix A decision **A3**, which blocks Phase 8 (specifically **WP 8.5**) and is tracked with its preserved identifier in `epics/EPIC-001-ingestion-platform-scaling/APPENDIX-A-DECISIONS.md`. Kept here too since it predates the ingestion-program import and is referenced from `DEC-010`.
- **Product Decisions Required:** the three-way choice above. See `DEC-010`/"Open, not yet decided" in `DECISIONS.md`.

### DISCOVERY-002 — Ingestion Platform Architecture: adopt, modify, or reject? — **RESOLVED (adopted)**

- **Status:** **RESOLVED** — approved as technical direction, see `DEC-013` in `DECISIONS.md` · **Priority:** — · **Epic:** EPIC-001
- **Problem (historical):** The full architecture proposal (`INGESTION_PLATFORM_ARCHITECTURE.md`) and its 143-WP backlog (`INGESTION_BACKLOG.md`) were complete but unreviewed by the Product Owner, including 12 specific open questions in the doc's Appendix A.
- **Resolution (2026-09-21):** the overall adopt/modify/reject call is decided — adopted, subject to Appendix A. The 12 individual sub-decisions are **not** resolved by this — they're now tracked under their original identifiers (A1–A12) in `epics/EPIC-001-ingestion-platform-scaling/APPENDIX-A-DECISIONS.md`, not as a generic `DISCOVERY` item. See that file for what each one blocks.
- **Product Decisions Required:** none remaining under this item — see A1–A12 instead.

### DISCOVERY-003 — Pursue the social/community layer at all?

- **Status:** IDEA · **Priority:** Unscored · **Epic:** EPIC-005
- **Problem:** Visitor accounts + profiles + chat, relayed from a friend of Jody's — no existing foundation (auth, real-time infra, moderation model) to build on.
- **Product Decisions Required:** pursue, defer indefinitely, or decline.

### DISCOVERY-004 — Is a structured start_time column worth the migration? — **direction set by DEC-013, execution not yet scheduled**

- **Status:** BACKLOG (answered in direction, not yet implemented) · **Priority:** Low · **Epic:** EPIC-001 / EPIC-003
- **Problem (historical):** `time_display` is a loose human string; NOW/TONIGHT-style logic (EPIC-002) can only approximate from it. A real `start_time` column would make that precise but is a genuine migration + backfill effort.
- **Resolution (2026-09-21):** the approved ingestion architecture answers "is it worth it" with yes — **WP 1.5** (Phase 1) adds `events.start_at timestamptz, end_at timestamptz, timezone text` with a backfill, additive and non-breaking. This doesn't move the work up in priority or imply it's scheduled; Phase 1 is `BACKLOG`, gated on its own Opus 5 architecture review. Tracked via WP 1.5 going forward, not as an independent product question.
- **Product Decisions Required:** none remaining on the "is it worth it" question — see WP 1.5's own scheduling for "when."

### DISCOVERY-005 — Reconcile or deprecate the `sources` table (migration_004) — **RESOLVED (extended, not deprecated)**

- **Status:** **RESOLVED** · **Priority:** — · **Epic:** EPIC-001
- **Problem (historical):** `sources` (26-field registry) exists in schema but is fully disconnected from the live pipeline — no code populates or queries it. It wasn't clear whether the newer Ingestion Platform proposal would reuse or replace it.
- **Resolution (2026-09-21):** the approved architecture **extends** `sources` rather than deprecating it — **WP 1.7** ("Migration: extend `sources` registry") adds the identity/adapter/policy/trust/schedule/lifecycle/health/provenance columns directly onto the existing table, and **WP 1.8** seeds it with one row per current connector. `DEC-006` is updated accordingly.
- **Product Decisions Required:** none remaining.

### DISCOVERY-009 — `organizations` (WP 4.13) vs. `DEC-005`'s "source ≠ organizer" rule

- **Status:** BACKLOG (flagged, not resolved) · **Priority:** Medium · **Epic:** EPIC-001 / EPIC-003
- **Problem:** Raised during the 2026-09-21 ingestion-program import, not invented as new scope — a genuine inconsistency between two already-approved things. `EPIC-001`'s Phase 4 **WP 4.13** ("Organizations from sources") reads: "Rename or extend `organizers` into organizations. Populate one per source." That populates an organization automatically for every *source*, which is a different and narrower concept than `DEC-005`'s established rule that an organizer (who's presenting an event) is not the same as a source (where a listing was found), and that `organizers` should be hand-curated only, never auto-derived from `source`. As written, WP 4.13 appears to contradict `DEC-005`.
- **Not resolved here.** This has not been silently reconciled or implemented either way — it's surfaced for Product Owner review before WP 4.13 is scheduled (which in any case is well downstream, gated on Phase 4's Opus 5 review).
- **Product Decisions Required:** does WP 4.13 need to be reinterpreted/rescoped to respect `DEC-005` (e.g., "organization" as a distinct concept from "organizer," clearly labeled and not surfaced as an organizer to the public site), or does `DEC-005` need revisiting in light of the new architecture? Either way, this is Jody's call, not a call to make unilaterally during implementation.

### DISCOVERY-006 — Organizer population strategy and timeline

- **Status:** BACKLOG · **Priority:** Low · **Epic:** EPIC-003
- **Problem:** `organizers` is deliberately, mostly unpopulated (`DEC-005`) — only Paxahau exists today. No organizer pages can be built until there's a real strategy and some real data.
- **Product Decisions Required:** when/how to prioritize hand-curating organizer entries, and whether it's tied to any other initiative's timeline.

### DISCOVERY-007 — Category sub-genre drill-down: pursue given thin likely initial coverage?

- **Status:** BACKLOG · **Priority:** Low · **Epic:** EPIC-004
- **Problem:** Requested (`FEATURE_BACKLOG.md` #4) — tap a top-level category to see sub-genres. Most sources (Ticketmaster, venue scrapers) don't supply genre-level detail today, so real coverage would likely be thin even if the UI were built.
- **Product Decisions Required:** pursue anyway (accepting thin initial coverage), or defer until more sources supply genre detail?

### DISCOVERY-008 — Scope of server-side Orbit boundary enforcement

- **Status:** BACKLOG · **Priority:** Medium · **Epic:** — (cross-cutting)
- **Problem:** See `DEBT-001`. Which write paths (manual admin entry, single submission, feed events, each individual cron) actually need a hard server-side Orbit check, versus relying on upstream source curation?
- **Product Decisions Required:** the enforcement scope itself, before `DEBT-001` can be scoped into an implementable ticket.

### DISCOVERY-010 — "On the Radar" naming collision between the live press-coverage page and the new human-curated layer

- **Status:** BACKLOG · **Priority:** Medium · **Epic:** EPIC-009
- **Problem:** `radar.html` and `index.html`'s "radar" filter chip are live today and mean "has press/editorial coverage" (automatic `editorial_article_events` match). `DEC-014` establishes a new, different "On the Radar" concept (human-selected as noteworthy, independent of press coverage). Same name, different meaning, both real — not reconciled.
- **Product Decisions Required:** rename the existing press-coverage page/filter and free up the name for the new layer; keep the existing name and label the new layer differently; or merge the two (press coverage becomes one visible signal on a Radar card, and the public "On the Radar" surface becomes the human-curated layer). See `EPIC-009` for the full option list.

### DISCOVERY-011 — Radar candidate persistence and editorial decision-log schema

- **Status:** BACKLOG · **Priority:** Low (not urgent — no V0 work is blocked by this) · **Epic:** EPIC-007 / EPIC-008
- **Problem:** `EPIC-007`'s V1 persisted-score design and `EPIC-008`'s editorial decision log are the same schema conversation (a decision is about a nomination, which may or may not correspond to a persisted candidate row) but haven't been designed together yet, since `EPIC-008` depends on `EPIC-007`'s V0 (unpersisted) query existing first.
- **Product Decisions Required:** whether to persist Radar candidates at all before the workbench (`EPIC-008`) proves it's needed, and if so, whether the decision log references a persisted candidate row or stands alone against `events.id` directly.

### DISCOVERY-012 — Public naming for future commercial placement ("Featured" or an alternative)

- **Status:** BACKLOG · **Priority:** Low (no commercial feature exists yet to need this) · **Epic:** EPIC-010
- **Problem:** "Featured" is a natural word for commercial placement but also reads as editorial endorsement — exactly the ambiguity `DEC-015`'s firewall exists to prevent. The Product Owner flagged this as explicitly unresolved, not defaulted.
- **Product Decisions Required:** the public label itself (`Featured` reserved for commercial only, with Radar-side language kept clearly distinct; or a different word entirely for commercial placement, e.g. `Promoted`/`Sponsored`/`Partner Pick`).

### DISCOVERY-013 — Commercial-placement schema separation

- **Status:** BACKLOG · **Priority:** Low (no commercial feature exists yet to need this) · **Epic:** EPIC-010
- **Problem:** If a future commercial-placement feature is built, should it live in a fully separate table (so `EPIC-007`'s Radar scoring query has no join path to it even by accident) or as reviewed columns alongside existing tables (e.g. on `events`, next to any future Radar-related columns)?
- **Product Decisions Required:** the schema-separation question itself — recommended answer (a separate table) is given in `EPIC-010`'s own reasoning, but not mandated as decided.

### DISCOVERY-014 — Event Connections funnel/metric definition

- **Status:** BACKLOG · **Priority:** Medium (blocks reporting in EPIC-011/014/015/016/017) · **Epic:** EPIC-011
- **Problem:** "Event Connections" is named as the product's core commercial metric, but which funnel actions count (impression, open, ticket click, official-site click, save, share, directions, follow, promotion interaction) and how they're weighted relative to each other hasn't been decided.
- **Product Decisions Required:** the funnel definition itself — see `STORY-015`.

### DISCOVERY-015 — Email-capture consent/compliance design

- **Status:** BACKLOG · **Priority:** Medium · **Epic:** EPIC-013
- **Problem:** 313.events has only ever sent transactional email (submission/feed confirmations via Resend). Marketing-style email capture (the Weekend Signal digest) is a new category with real compliance considerations (consent language, unsubscribe handling, preference granularity) that `privacy.html` doesn't currently address.
- **Product Decisions Required:** the specific consent/preference-management design — not yet scoped, flagged before `STORY-020` ships rather than after.

### DISCOVERY-016 — Which ticketing platforms beyond Ticketmaster offer a usable affiliate program

- **Status:** BACKLOG · **Priority:** Medium · **Epic:** EPIC-014
- **Problem:** Only Ticketmaster's affiliate program is confirmed live and disclosed (`terms.html`). Whether Eventbrite, Fever, Humanitix, or other roster/planned platforms offer comparable programs is unresearched.
- **Product Decisions Required:** none yet — this is a research gap (`STORY-021`), not a judgment call, until findings exist.

### DISCOVERY-017 — Self-service promotion package pricing and payment processor

- **Status:** BACKLOG · **Priority:** Low (explicitly deferred — see `DEC-019`) · **Epic:** EPIC-015
- **Problem:** No pricing evidence exists yet for Boost/Weekend Boost/Category Boost/Orbit Boost packages, and no payment processor has been selected.
- **Product Decisions Required:** both — deliberately left open until `EPIC-016` proves paid demand for the simpler, manually-sold sponsorship inventory first.

### DISCOVERY-018 — Exact advertising density-ceiling percentage

- **Status:** BACKLOG · **Priority:** Low (principle is locked; only the number is open) · **Epic:** EPIC-016
- **Problem:** `DEC-018` locks the *principle* of a density ceiling (~10% of the primary discovery experience) but not the exact, tested figure.
- **Product Decisions Required:** the final percentage, pending real testing once inventory exists.

### DISCOVERY-019 — Venue/organizer claim-verification mechanism and its relationship to DEC-005

- **Status:** BACKLOG · **Priority:** Low (no near-term work blocked) · **Epic:** EPIC-017
- **Problem:** `EPIC-017`'s free-tier "claim venue" flow needs some verification mechanism, and it's not yet decided whether a verified self-claim is governed by `DEC-005`'s existing hand-curation-only rule for `organizers`, or constitutes a new, distinct trust category.
- **Product Decisions Required:** both the verification mechanism and its relationship to `DEC-005` — not yet designed.

### DISCOVERY-020 — Self-Service Calendar Connection (generalize `submit.html` beyond single events and ICS)

- **Status:** BACKLOG (concept captured 2026-10-02, not designed or built) · **Priority:** not yet set · **Epic:** `EPIC-001` (ingestion platform); touches the self-service submission surface documented in `FEED_SUBMISSIONS.md`.
- **Problem:** `submit.html` today only self-serves two narrow paths — one event, or one ICS feed URL (`FEED_SUBMISSIONS.md`). Meanwhile the ingestion side now has two real, reusable multi-tenant adapters (`cron-eventbrite.js`, WP 6.12; `cron-localist.js`, WP 6.1/6.2), each onboarded today only by a developer hand-editing a config array (and, for Eventbrite, a Vercel env var per organizer). There is no self-service path for an organizer to connect their own Localist/Tribe/CivicPlus/ICS/Eventbrite calendar, and no path for an ordinary visitor to suggest a public authoritative calendar 313.events should follow, without filing it as an engineering request.
- **Full write-up:** `FEED_SUBMISSIONS.md`'s "Future: Self-Service Calendar Connection" section has the complete captured requirement, including the Eventbrite-specific OAuth amendment (connect/reconnect/disconnect, secure token storage replacing per-organizer env vars, source-health monitoring, the "I run this" vs. "I found this" trust distinction). Not duplicated here.
- **Product Decisions Required:** the platform-detection/validation UX for the "Add an Organization / Calendar" path; whether adapter selection targets today's per-file `api/cron-*.js` handlers or waits on `INGESTION_PLATFORM_ARCHITECTURE.md`'s generic registry-row model; Eventbrite OAuth app registration and review (not yet started); pricing/sequencing is not in scope for this item at all — this is an ingestion/self-service question, not a monetization one.
- **Explicitly not started:** no OAuth flow, no new submission UI, no registry-row model — the two existing adapters (`cron-eventbrite.js`, `cron-localist.js`) are the technical proof this would eventually plug into, not evidence this has been designed yet.

### DISCOVERY-021 — Evidence sources for Detroit routing significance ("Don't Miss" candidate criterion)

- **Status:** BACKLOG (requirement captured 2026-10-03, not designed or built) · **Priority:** not yet set · **Epic:** EPIC-007 (nomination) / EPIC-008 (review); public destination is `DEC-025`'s "Don't Miss" placement.
- **Problem:** The Product Owner added Detroit routing significance as a candidate criterion: whether an act, production or experience appearing in Detroit / the Detroit Orbit is unusually significant given its trajectory and touring behavior. Every signal in it compares this appearance with something the product does not hold today — who is appearing (there is no act/artist entity; an event has a title and a venue), when they last appeared here (the database holds only a few weeks of events), where else the tour goes (no routing or other-market data, e.g. Chicago and Toronto), and how the act's audience is moving (no momentum data).
- **Full write-up:** `epics/EPIC-007-radar-candidate-intelligence.md`, "Amendment (2026-10-03) — Detroit routing significance". Not duplicated here.
- **Product Decisions Required:** which evidence sources are acceptable, and on what terms of use; whether an act/artist entity is introduced and where it belongs (`EPIC-003`); which comparison markets count beyond Chicago and Toronto; whether editor-entered evidence comes first, before any automated collection.
- **Explicitly not started:** no data source evaluated, no schema, no scoring, no admin or public UI. The criterion must not be approximated by popularity in the meantime.
