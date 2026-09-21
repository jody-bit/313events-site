# 313.events — Decisions

Settled questions, in decision-record form. Check this file before reopening any of these — don't casually reverse one. If new evidence suggests a past decision should change, flag it for Jody's review rather than changing it unilaterally.

All entries below are reconstructed from decisions already made and recorded in existing repo documentation (dates as given in those documents) or directly evidenced by committed code, as part of the initial `/project` setup on 2026-09-21 — not new decisions made during that setup.

---

### DEC-001 — Keep the "313" name despite regional expansion

**Date:** 2026-08-24
**Decision:** Keep "313.events" as the product name even though the 75-mile service area now includes cities with area codes other than 313 (Ann Arbor 734, Flint 810, Lansing 517, Toledo 419, Windsor 519).
**Context:** The service area expanded from Detroit-proper to a 75-mile regional radius, raising the question of whether the Detroit-area-code-based name still fits.
**Alternatives considered:** Not documented beyond keeping the name.
**Reason:** Detroit is the largest and best-known city in the service area; "313" is an established domain/brand and reads as a regional identifier the way "Metro Times" or "Crain's Detroit" do.
**Consequences:** Marketing/framing copy should treat "313" as a regional identifier, not a literal geographic restriction.
**Related backlog items:** —

---

### DEC-002 — Service area: 75-mile radius from Detroit (superseded by DEC-003)

**Date:** 2026-08-24
**Decision:** Expanded coverage from "City of Detroit + Hamtramck + Highland Park enclaves" to a 75-mile radius from Detroit's center point, matching the regional radius used by the area's music census work.
**Context:** The product had been Detroit-proper only; this was the first regional expansion.
**Alternatives considered:** Not documented.
**Reason:** Matched an existing regional-radius convention already in use for the area.
**Consequences:** Superseded by DEC-003 (border-point measurement) — the 75-mile figure itself did not change, only what it's measured from.
**Related backlog items:** —

---

### DEC-003 — Switch service-area measurement from Detroit's center to its actual border

**Date:** 2026-09-20
**Decision:** Measure the 75-mile service-area radius from Detroit's actual municipal border (City of Detroit's own ArcGIS boundary layer, Douglas-Peucker simplified to 70 points), not its center point. The 75-mile figure itself is unchanged.
**Context:** Lansing/East Lansing sat at 81.5 miles from Detroit's center point (just outside the old boundary) despite being a real regional hub; measuring from an abstract center point systematically under-counts places near the old cutoff.
**Alternatives considered:** Keeping center-point measurement; moving the mileage number itself (rejected — the ask was specifically "keep the number, change what it's measured from").
**Reason:** A border point is always at least as close to any outside location as the center is, so this is a strict expansion — nothing previously in-scope drops out, and it's a more honest way to ask "is this within reach of Detroit."
**Consequences:** Lansing (67.5 mi from the border) is now in scope. Saginaw (75.4 mi) remains just outside — flagged in `SERVICE_AREA.md` as a genuine near-miss, not a comfortable exclusion, since it's within the ~0.15 mi precision margin of the boundary calculation itself.
**Related backlog items:** `DEBT-001` (Orbit boundary is not enforced server-side outside `cron-ticketmaster.js`).

---

### DEC-004 — Neighborhood-level granularity stays Detroit-only

**Date:** 2026-08-24/25
**Decision:** The 39-neighborhood reference system stays scoped to Detroit only. Every other city/township in the 75-mile radius is tracked at the city level (`venues.city`), not broken into neighborhoods.
**Context:** Raised while reconciling the (pre-existing, Detroit-only) neighborhoods reference against the newly-regional 75-mile service area.
**Alternatives considered:** Building neighborhood-equivalent breakdowns for the ~20+ other municipalities now in scope (rejected as unnecessary scope).
**Reason:** Neighborhood-level detail is meant to make Detroit itself feel distinct within the wider region, by design — not a gap to backfill for every other city.
**Consequences:** No neighborhoods table entries should ever be created for non-Detroit municipalities.
**Related backlog items:** —

---

### DEC-005 — "Source" and "organizer" are different things; organizers are hand-curated only

**Date:** documented in `FOUNDATIONAL_ITEMS.md` (2026-08-24/25 timeframe)
**Decision:** `events.source` records where a listing was found (an aggregator, a venue's own page, Ticketmaster); an organizer is who is actually presenting the event. The `organizers` table is populated only by hand-curation of names clearly visible as real promoters/institutions in existing data — never auto-derived from `events.source`.
**Context:** Most listing sources (Resident Advisor, 19hz.info, Ticketmaster) are aggregators, not organizers; auto-populating organizers from `source` would fabricate organizer entities for what are really just data sources.
**Alternatives considered:** Auto-deriving organizers from the `source` field (rejected — would create fake organizer entities).
**Reason:** Consistent with the "never guess / never fabricate" project-wide convention.
**Consequences:** `organizers` remains sparsely populated (as of 2026-09-21, effectively only Paxahau) until a real population strategy is scoped and decided.
**Related backlog items:** `PRODUCT DECISION REQUIRED` in `PRODUCT.md` (organizer population strategy/timeline).

---

### DEC-006 — Keep the two-table `events`/`venues` core; add a `sources` registry as a new layer, not a replacement

**Date:** 2026-08-25 (`SOURCE_REGISTRY_ARCHITECTURE.md`)
**Decision:** The `events`/`venues` schema stays as the core publishing model. A proposed `sources` registry (with a 26-field taxonomy: source type, ticketing platform, API/RSS/ICS/JSON-LD availability, robots.txt findings, ingestion method, priority, etc.) was designed as an additive layer above it, not a replacement, and its Phase 1 (schema only) was implemented as `migration_004_source_registry.sql`.
**Context:** A request to evaluate a proposed "Cultural Event Source Registry" framework against the existing architecture.
**Alternatives considered:** Not documented beyond "modify vs. replace."
**Reason:** The two-table core is the right shape for what's actually published; the registry is about proactively finding/classifying sources, a separate concern.
**Consequences:** As of 2026-09-21, only Phase 1 (schema) was ever built — `sources` exists but is fully disconnected from the live pipeline; no code populates or queries it. Phases 2–4 (population, classification, ingestion-code integration) were never started, and the newer Ingestion Platform Scaling proposal (EPIC-001) proposes a different registry/ledger shape that has not been explicitly reconciled with this one.
**Related backlog items:** `PRODUCT DECISION REQUIRED` in `PRODUCT.md` (is `sources` still the intended registry, or superseded by EPIC-001's design).

---

### DEC-007 — Self-service feeds: ICS only in v1, RSS schema-ready but unimplemented

**Date:** 2026-08-26 (`FEED_SUBMISSIONS.md`)
**Decision:** `cron-feeds.js` only parses `feed_format='ics'`. `'rss'` is a valid schema value (so no future migration is needed) but is recorded every run as "not polled," never guessed at. The submission form doesn't even offer RSS as an option.
**Context:** Generic RSS/XML has no native event-date semantics (a `<pubDate>` is when an item was posted, not when the event is) — auto-parsing it into event dates risked silently wrong information.
**Alternatives considered:** Best-effort RSS date parsing (rejected as too risky given the project's "never guess" convention and a prior hard-won HTML-entity-leak bug).
**Reason:** Shipping ICS-only now and documenting RSS as real-but-unfinished beats half-supporting it.
**Consequences:** Any organizer whose only feed is RSS-based can't self-register yet.
**Related backlog items:** —

---

### DEC-008 — Self-service feed events auto-publish as approved; Metro Times-style unvetted calendars do not

**Date:** 2026-08-26 (`FEED_SUBMISSIONS.md`)
**Decision:** Once a feed source itself is human-approved, every event it produces lands directly as `status='approved'` (no per-event review). Contrast: Metro Times (an unvetted general community calendar, not one approved venue) lands events as `pending_review`.
**Context:** Establishing a trust-tier distinction between "we vetted this one venue's own feed" and "we're pulling from a general aggregator we don't control."
**Alternatives considered:** Reviewing every feed-sourced event individually (rejected as unnecessary given the source itself was vetted).
**Reason:** The source-level review is the actual trust gate; per-event review would be redundant for a single-venue feed the admin already approved.
**Consequences:** A bad-faith or compromised feed source could post directly to the public site with no per-event check — mitigated only by human review at approval time and the ability to pause/reject a feed after the fact.
**Related backlog items:** —

---

### DEC-009 — Facebook integration posts to the Page feed only, not native Facebook Events

**Date:** 2026-09-14 (`FACEBOOK_SETUP.md`)
**Decision:** `cron-post-to-facebook.js` posts each newly-approved event as a regular Page post (with a link back to the event's 313.events page), not as a native Facebook "Event" object.
**Context:** Native Facebook Event creation via the Graph API requires becoming an approved Official Events API partner — a heavier, business-level application process built for platforms like Eventbrite/Ticketmaster, and (as last checked) paused to new partners.
**Alternatives considered:** Pursuing the Official Events API partnership (rejected as not worth it for a first version).
**Reason:** Page-feed posting only needs the ordinary `pages_manage_posts` permission, available through Meta's standard App Review.
**Consequences:** Facebook users can't natively RSVP inside Facebook to an event posted this way. If real Facebook Events later matter enough, that's a separate future project — this setup doesn't block it.
**Related backlog items:** standalone item in `ROADMAP.md` ("Facebook auto-post distribution").

---

### DEC-010 — Certain sources are explicitly excluded from automation on ToS/robots.txt grounds

**Date:** ongoing, most recently reaffirmed in `README.md` and `NEW_SOURCES_RESEARCH.md`
**Decision:** Resident Advisor, Dice, and AXS (and its venue network) are manual/editorial-only — their Terms of Use explicitly prohibit automated scraping and they have no public events API. Eventbrite's public search API (deprecated 2020) leaves Comedy Bar Detroit, Garden Theater's Eventbrite listings, Planet Ant Theatre, and New Dodge Lounge programmatically unreachable there. Facebook has no public events API. Senate Theater and Detroit House of Comedy/The Congregation Detroit explicitly block AI/Claude crawlers in `robots.txt` and are never scraped. Model D Media's ToS explicitly bars scraping/aggregation/republishing. BridgeDetroit has no standing calendar and its content license bars bulk republishing regardless.
**Context:** Direct verification of each source's ToS/API availability/robots.txt, per the project's "visibility ≠ authorization" principle.
**Alternatives considered:** N/A — these are hard blocks, not judgment calls.
**Reason:** The project does not bypass blocks, CAPTCHAs, logins, or explicit ToS prohibitions, regardless of technical feasibility.
**Consequences:** These sources can only ever enter the calendar via manual/editorial entry or (where offered) the source's own self-service feed submission.
**Related backlog items:** `DISCOVERY-001` (Resident Advisor / Instagram capture policy — still genuinely open, see below).

---

### DEC-011 — Status-preserving upsert is mandatory for every cron

**Date:** 2026-09-02 (incident-driven)
**Decision:** Every cron must read the current `status` of any matching `external_id` rows before upserting, and preserve a moderator's prior approve/reject decision on re-run — a re-run must never silently reset a rejected event back to visible or an approved one back to pending.
**Context:** A live incident at Lager House where a cron re-run overwrote a moderator's prior decision.
**Alternatives considered:** None — this is a corrective rule following a real production issue.
**Reason:** Moderator decisions must be durable across re-runs; silent resets are a trust/correctness failure.
**Consequences:** Any new cron or ingestion path that upserts into `events` must implement this pattern; it is treated as load-bearing, not optional.
**Related backlog items:** should be an explicit checklist item for every new source added, including under EPIC-001.

---

### DEC-012 — `venue_id` resolution is going-forward-only, exact-match, no auto-creation

**Date:** 2026-09-13 (`api/_lib/venue-lookup.js`)
**Decision:** A shared helper resolves `events.venue_id` by case/whitespace-insensitive exact name match against existing `venues` rows. It never creates a new venue row and never fuzzy-matches — an unmatched `venue_name_raw` simply stays `venue_id: null`.
**Context:** `events.venue_id` had been permanently null in practice (confirmed live: 1 row out of 1492 at the time) despite the `venues` table itself having real, reviewed data — closing the "load-bearing gap" flagged in three separate prior documents (`FOUNDATIONAL_ITEMS.md`, `DISCOVERY_PHASE1_AUDIT.md`, `AUDIT_AND_ARCHITECTURE.md`).
**Alternatives considered:** Fuzzy matching or auto-creating new venue rows (rejected — new venues are a deliberate, separately-reviewed research task, not something a cron should invent unattended).
**Reason:** Consistent with the "never guess" convention — an honest gap (`venue_id: null`) is preferable to a wrong guess.
**Consequences:** `FOUNDATIONAL_ITEMS.md`, `DISCOVERY_PHASE1_AUDIT.md`, and `AUDIT_AND_ARCHITECTURE.md` are now stale on this specific point — flagged for consolidation, see the initial-state report.
**Related backlog items:** —

---

### DEC-013 — Ingestion Platform Architecture approved as technical direction, subject to Appendix A

**Date:** 2026-09-21
**Decision:** `INGESTION_PLATFORM_ARCHITECTURE.md` and its companion `INGESTION_BACKLOG.md` (143 work packages across 10 phases) are approved as the technical direction for the ingestion-platform expansion. This is a decision about the *design*, not authorization to implement it — no code, schema, or migration has changed, and nothing is `IN PROGRESS`.
**Context:** The architecture was produced in response to a request to audit the ingestion system and design a scaling strategy for the Detroit Orbit (see `epics/EPIC-001-ingestion-platform-scaling.md`). It was reviewed by the Product Owner following the initial `/project` setup.
**Alternatives considered:** Not documented — this decision approves the proposal as submitted.
**Reason:** Not documented beyond approval.
**Consequences:** The architecture's 12 explicitly flagged open questions (Appendix A, A1–A12) remain individually undecided and are tracked in `epics/EPIC-001-ingestion-platform-scaling/APPENDIX-A-DECISIONS.md` — approving the overall direction does not resolve any of them. `DISCOVERY-002` in `BACKLOG.md` (the general "adopt/modify/reject" tracking item) is closed by this decision; the sub-decisions it referenced are now tracked under their preserved A-numbers instead. Work proceeds phase by phase, starting with Phase 0 (no architecture decisions block it) once the Product Owner pulls specific `READY` work packages — nothing is pulled automatically.
**Related backlog items:** `EPIC-001` and its 143 work packages; `epics/EPIC-001-ingestion-platform-scaling/APPENDIX-A-DECISIONS.md` (A1–A12).

---

## Open, not yet decided

These have been *raised* and researched but are explicitly **not** settled — listed here only so they aren't rediscovered as if new. See `PRODUCT.md`'s "Product decisions required" section and `BACKLOG.md` for the tracked items.

- **DISCOVERY-001 — Resident Advisor / Instagram capture policy.** An earlier framing in this project understated the access-authorization issue here (RA's ToS prohibits automated access outright, not just robots.txt-governed crawling; real logged-in browser sessions have hit DataDome challenges). Needs Jody's explicit choice among: pursue a written RA partnership, restrict RA to human-read-and-typed-in-only manual capture, or knowingly accept the ToS risk. Not decided. **Equivalent to Appendix A decision A3** (see `epics/EPIC-001-ingestion-platform-scaling/APPENDIX-A-DECISIONS.md`) — the two are the same open question, tracked in both places for now.
- The 12 Appendix A decisions (A1–A12) — auto-venue-creation policy, Canadian geocoding provider, JS-rendering worker, auto-publish thresholds, and others. Preserved with their original identifiers in `epics/EPIC-001-ingestion-platform-scaling/APPENDIX-A-DECISIONS.md`, which tracks exactly what each one blocks. None decided.
- **DISCOVERY-009 — `organizations` (WP 4.13) vs. `DEC-005`'s "source ≠ organizer" rule.** The approved architecture's WP 4.13 populates one organization per *source*, which reads as different from — and possibly in tension with — `DEC-005`'s rule that organizers are hand-curated only and never auto-derived from `source`. Raised during the ingestion-program import (2026-09-21); not resolved. See `BACKLOG.md`.
- Whether to pursue the social/community layer at all (`EPIC-005`). Not decided.
