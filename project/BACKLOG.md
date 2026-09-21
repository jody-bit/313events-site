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

## Epics

| ID | Title | Status | Priority | Related file |
|---|---|---|---|---|
| EPIC-001 | Ingestion Platform Scaling | **APPROVED (design)** — execution BACKLOG | High | `epics/EPIC-001-ingestion-platform-scaling.md` |
| EPIC-002 | Discovery Shell (time & location navigation) | BACKLOG | Medium | `epics/EPIC-002-discovery-shell.md` |
| EPIC-003 | Entity & Identity Data Buildout | BACKLOG | Medium | `epics/EPIC-003-entity-identity-buildout.md` |
| EPIC-004 | Admin & Editorial Workflow Improvements | BACKLOG | Low-Medium | `epics/EPIC-004-admin-editorial-ux.md` |
| EPIC-005 | Social / Community Layer | IDEA | Unscored | `epics/EPIC-005-social-community-layer.md` |

**EPIC-001 note:** the architecture is approved as technical direction (`DEC-013`). The full 143-work-package phased backlog is imported into managed tracking under `epics/EPIC-001-ingestion-platform-scaling/` (one file per phase, 0–9, plus `APPENDIX-A-DECISIONS.md` for the still-undecided A1–A12) — not duplicated in this file. `INGESTION_BACKLOG.md` (repo root) remains the authoritative detailed technical specification. **Nothing is implemented. Nothing is `IN PROGRESS`.**

### Ingestion program dashboard

- **Current phase:** Phase 0 (Stabilize & instrument) — the only phase with no architecture-gate or Appendix A blocker. Prepared for grooming, not started.
- **Recommended first item:** **WP 0.17** (status-lookup safety) — explicitly named "do first" by the architecture.
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
