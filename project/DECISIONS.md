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

### DEC-014 — Three-layer discovery model: comprehensive calendar, algorithmic lenses, human editorial curation

**Date:** 2026-10-01
**Decision:** 313.events adopts three distinct, coexisting layers rather than choosing comprehensiveness *or* curation: (1) the comprehensive calendar/database — search, filters, map, neighborhoods, categories, dates, free events, and every other browsing tool continue to operate across the full database, and a routine or editorially-unremarkable event is never culled or hidden from these; (2) discovery lenses — algorithmic/contextual navigation (Tonight, This Weekend, Free, Just Added, One Night Only, and others), generally derived from structured facts rather than subjective AI judgment, implying no editorial endorsement; (3) On the Radar — a human editorial curation layer for events that deserve additional attention, explicitly **not** synonymous with biggest/most popular/highest-selling/highest-attendance/advertiser/paid placement. The operating principle across all three: **the machine nominates, a human curates** — automation (`EPIC-007`) should dramatically reduce the number of events an editor must inspect, but must never autonomously decide cultural importance or publish a subjective editorial endorsement.
**Context:** Raised as 313.events' coverage grows toward `EPIC-001`'s hundreds-to-thousands-of-sources goal — comprehensiveness is working as intended, but it creates a second, un-addressed discovery problem (nobody can evaluate that much undifferentiated volume).
**Alternatives considered:** Not documented beyond the three-layer shape as given.
**Reason:** Preserves the "comprehensive by default" product promise (`DEC-012`'s "never guess"/honest-gap conventions extend naturally to "never hide," too) while adding a way to surface what's unusually interesting — without either culling the database or letting an automated system silently decide what matters.
**Consequences:** `EPIC-007`–`EPIC-010` exist to build out layers 2 and 3. **Real naming conflict already exists**: `radar.html` and `index.html`'s "radar" filter chip are live today and mean "has press coverage" — a different concept from this decision's "On the Radar" (human-curated noteworthy, independent of press coverage). This is **not resolved by this decision** — see `DISCOVERY-010`.
**Related backlog items:** `EPIC-007`, `EPIC-008`, `EPIC-009`, `EPIC-010`; `DISCOVERY-010` (naming collision, open).

---

### DEC-015 — Editorial selection and commercial placement are structurally separate; paid placement can never influence or imply editorial selection

**Date:** 2026-10-01
**Decision:** On the Radar (`DEC-014`'s layer 3) is editorial, human-selected, and cannot be purchased — selection is independent of any advertiser/sponsor relationship. Any future commercial placement feature (tentatively "Featured"/"Promoted"/"Sponsored" — public naming not yet decided) is a separate concept: potentially purchasable, must be visibly identified as promotional/sponsored wherever shown, and must never imply On the Radar editorial selection. Paid placement must never influence `EPIC-007`'s Radar Candidate Score or `EPIC-008`'s editorial selection, as an input of any weight.
**Context:** 313.events has no monetization/paid-placement feature today. This decision is made now, ahead of any such feature being proposed, specifically so the firewall is a constraint a future proposal is checked against rather than a line that has to be drawn after a commercial relationship already exists.
**Alternatives considered:** Not documented — stated as a firm principle, not a weighed tradeoff.
**Reason:** Editorial trust is one of this product's foundational conventions (the "never guess"/"honest-gap" culture already established in `PRODUCT.md`) — letting commercial pressure quietly shape editorial selection would undermine that trust in a way that would be far harder to detect or undo after the fact than to prevent structurally now.
**Consequences:** `EPIC-010` tracks the implementation and naming questions this decision raises but doesn't resolve by itself (public label for commercial placement; whether commercial placement lives in a fully separate table from the start). No monetization feature may be scheduled without being checked against this decision first.
**Related backlog items:** `EPIC-010`; `DISCOVERY-012` (public naming, open); `DISCOVERY-013` (schema separation, open).

---

### DEC-016 — Discovery-only "lead" sources are pointers, never provenance

**Date:** 2026-10-01
**Decision:** A **lead source** (e.g. Events in the D, press coverage, Resident Advisor discovery, community tips, a Facebook-discovery experiment) may reveal that an event, venue, organizer, series, or calendar exists, but is never treated as authoritative provenance for a published event's facts, and its descriptions/images/editorial content are never ingested or reproduced as 313.events' own. The operating shape: `LEAD → dedupe → authoritative-source discovery → verify → normal ingestion → source-network expansion`. If a lead reveals a previously-unknown venue/organizer/calendar/feed, that upstream source is evaluated for **permanent** ingestion through the normal access-ladder/trust-tier rules (`INGESTION_PLATFORM_ARCHITECTURE.md` §6–§7), so the outcome is a closed coverage gap, not just one recovered event.
**Context:** First applied to Events in the D (`eventsinthed.com`), whose data is technically easy to reach but whose Terms of Service prohibit scraping/copying without permission, and whose descriptions/photos are its own in-house editorial copy, not organizer-supplied fact. Four venues it surfaced (POST Detroit, Coriander Kitchen and Farm, Senate Theater, Florian East Lagers & Ales) were independently re-sourced under this rule the same day — see `INGESTION_BACKLOG.md`'s outreach table for the resulting onboarding verdicts.
**Alternatives considered:** Treating Events in the D (and sources like it) as an ordinary discovery/acquisition channel subject only to the normal robots.txt/ToS gate (rejected — its ToS explicitly prohibits automated scraping regardless of robots.txt, and its editorial copy is not safe to republish even where technically reachable).
**Reason:** Separates "this pointed me somewhere real" from "this is a source I can trust and automate against" — the same distinction the project already draws between a venue's own feed (T1) and an unmoderated aggregator (T4), extended to sources that shouldn't be automated against at all.
**Consequences:** No lead-management system, registry column, or admin queue exists yet — a lead write-up is a markdown research note, and resulting candidates are added by hand to `INGESTION_PLATFORM_ARCHITECTURE.md` §7.9/`INGESTION_BACKLOG.md`'s outreach table, the same way Scarab Club and the WebTrac candidates already are. **Lead presence is explicitly not itself evidence that an event is noteworthy** — `EPIC-007`'s Radar Candidate scoring must not give a lead-sourced event any bonus for having come from a lead; it is scored on its own independently-verified merits like any other event, once (and only if) it clears normal ingestion.
**Related backlog items:** `INGESTION_PLATFORM_ARCHITECTURE.md` §7.9 (full mechanics); `INGESTION_BACKLOG.md`'s outreach table (POST Detroit/Coriander/Senate Theater/Florian East entries); `EPIC-007` (the "lead presence is not evidence" constraint on Radar scoring).

---

### DEC-017 — Monetization adopted as four distinct, diversified revenue streams

**Date:** 2026-10-01
**Decision:** 313.events will pursue monetization as four structurally different revenue streams rather than betting on one: **passive transactional** (affiliate/referral revenue, `EPIC-014`), **automated transactional** (self-service event promotion, `EPIC-015`), **recurring** (Organizer Pro, `EPIC-017`), and **media** (display advertising, newsletter, and sponsorship, `EPIC-016`) — underpinned by a shared measurement layer (`EPIC-011`) and run alongside, not blocked by, audience-growth and retention work (`EPIC-012`/`EPIC-013`).
**Context:** An earlier framing in this project treated display advertising dismissively ("programmatic pennies"). The Product Owner revisited that: 313.events' visual brand is strong enough that advertising can be designed inventory rather than ad-tech clutter, and a diversified four-stream model avoids betting the whole business on any single mechanism.
**Alternatives considered:** A single-revenue-stream approach (e.g., display ads only, or Organizer Pro only) — rejected in favor of diversification.
**Reason:** Each stream has a different risk/effort profile and a different time horizon (affiliate is near-passive and fast; Organizer Pro is slower but recurring); diversification is explicitly preferred over concentration.
**Consequences:** `EPIC-011`–`EPIC-017` are the seven epics implementing this decision. Aggregated commercial insights may become a future opportunity, but selling individual user data is explicitly not part of the model (`DEC-021`).
**Related backlog items:** `EPIC-011` through `EPIC-017`.

---

### DEC-018 — Display advertising is designed inventory, with locked hard requirements and a density ceiling

**Date:** 2026-10-01
**Decision:** Any display advertising/sponsorship on 313.events is built as a small, deliberate "313 advertising design system" — contextual, Detroit-relevant, visually consistent with the product's own brand — never generic programmatic ad-tech. The following requirements are locked now, not left to later implementation discretion: no popups, no interstitials, no autoplay video/audio, no ads styled or positioned to be mistaken for real events, no giant sticky units obscuring content, no layout shift while ads load, no invasive third-party retargeting by default, and no stacking multiple ad networks to fill every available rectangle. A **density ceiling** applies: advertising may occupy no more than approximately 10% of the primary discovery experience — the exact figure needs real testing, but the principle itself (a hard ceiling exists) is locked now.
**Context:** Raised alongside `DEC-017`'s adoption of display advertising as a real revenue stream — the Product Owner was explicit that the failure mode to avoid is exactly what makes most ad-supported sites unpleasant (interruption + irrelevance + visual ugliness + tracking + repetition), and that every one of those factors is controllable.
**Alternatives considered:** Standard programmatic ad-network integration (rejected outright — "I'd rather sell one beautiful $1,500 sponsorship than serve 400,000 garbage impressions to make $300").
**Reason:** Protects the product's usability and trust (the same "never guess"/"honest-gap" culture this project already applies to data) from being eroded by advertising load, while still allowing real revenue.
**Consequences:** `EPIC-016`'s entire scope is built against this constraint; any future ad-related proposal must be checked against it before implementation, the same way `EPIC-010` checks future monetization proposals against the editorial firewall.
**Related backlog items:** `EPIC-016`; `DISCOVERY-018` (exact density-ceiling percentage, open).

---

### DEC-019 — Monetization build order: Measurement → Affiliate → Display/Sponsorship → Self-Service Promotion → Organizer Pro

**Date:** 2026-10-01
**Decision:** The five revenue-building epics are sequenced `EPIC-011` (Measurement) → `EPIC-014` (Affiliate) → `EPIC-016` (Display/Sponsorship) → `EPIC-015` (Self-Service Promotion) → `EPIC-017` (Organizer Pro), with `EPIC-012` (Audience Growth) and `EPIC-013` (Retention) running alongside the whole sequence rather than waiting behind it. The underlying principle, stated directly: **don't automate a business model before proving somebody will pay for it** — display/sponsorship inventory can be defined and sold manually (a human directly selling and inserting a sponsorship) before any purchase/fulfillment automation exists; automation is built once demand is proven, not before.
**Context:** The Product Owner explicitly moved display/sponsorship ahead of self-service promotion in this sequencing, reasoning that display doesn't require organizer accounts or self-service tooling to be finished before making a dollar — inventory can exist and be sold before the automation around it does.
**Alternatives considered:** Building Organizer Pro or self-service promotion automation first (rejected — both require more infrastructure to be built before any revenue is proven, inverting the "prove demand, then automate" principle).
**Reason:** Minimizes wasted engineering effort on automating a business model that hasn't yet been shown to have real paying demand.
**Consequences:** `EPIC-015` and `EPIC-017` are both explicitly *not* broken into implementation-ready stories yet, by design — scoping them further now would front-run the evidence this build order is meant to gather first.
**Related backlog items:** `EPIC-011`, `EPIC-012`, `EPIC-013`, `EPIC-014`, `EPIC-015`, `EPIC-016`, `EPIC-017`.

---

### DEC-020 — Sponsorship may support a section; it may never determine editorial selection (Radar firewall, extended)

**Date:** 2026-10-01
**Decision:** A sponsor may be named as supporting the "On the Radar" section (e.g. "Presented by [brand]"), and may similarly support other curated/geographic sections (Neighborhood Partner, Orbit Partner). A sponsor may never determine, or appear to determine, which events are selected into any of those sections. For On the Radar specifically, the public-facing copy must say so explicitly: "Sponsors support On the Radar. Sponsors do not determine On the Radar selections."
**Context:** This extends `DEC-015`'s editorial/commercial firewall (established for the Discovery + Editorial Intelligence initiative, before any sponsorship inventory existed) to the specific case of a named, paying sponsor attached to a curated section — the highest-trust-risk placement in the entire display-advertising program (`EPIC-016`). It also formalizes a promise `editorial-policy.html` already makes publicly: paid placement "will never secretly determine what we choose to cover editorially... Our editorial judgment on 'On the Radar'... remains independent of any advertising or sponsorship relationship."
**Alternatives considered:** Allowing a sponsor to influence selection in exchange for a larger placement fee (not proposed by the Product Owner; rejected implicitly by the firewall's own framing as a line that must not blur).
**Reason:** Editorial trust, once visibly compromised, is far more expensive to rebuild than any single sponsorship is worth.
**Consequences:** `EPIC-007`'s Radar Candidate Score and `EPIC-008`'s editorial decision workflow must have no input, join, or parameter sourced from sponsorship/placement data, by construction — the same structural guarantee `DEC-015`/`EPIC-010` already require, now explicitly extended to cover Neighborhood Partner and Orbit Partner placements too.
**Related backlog items:** `EPIC-010`, `EPIC-016`, `EPIC-007`, `EPIC-008`.

---

### DEC-021 — No individual user data is sold; commercial data products are aggregate-only

**Date:** 2026-10-01
**Decision:** 313.events will not sell individual-level user data as part of its business model. Aggregated commercial insights (e.g., "your sponsorship reached 34,218 Detroit-area event seekers") may become a future opportunity, but any such product must be built from aggregate rollups, never from exported or sold per-visitor profiles, and must be handled with explicit privacy care.
**Context:** Reaffirms, for the new monetization program specifically, a commitment `privacy.html` already makes today: "We don't sell your information. We share information only with the service providers described above... or if required by law." This decision makes clear that commitment is not superseded by any of `EPIC-011`'s analytics, `EPIC-013`'s email capture, `EPIC-016`'s sponsor reporting, or `EPIC-017`'s organizer analytics — all of which must be designed to keep it true, not treated as edge cases that might need revisiting later.
**Alternatives considered:** Treating aggregated behavioral data as a sellable product on its own (explicitly flagged by the Product Owner as something to be "extremely careful" with and not to pursue as part of the business model).
**Reason:** Consistent with the product's existing privacy posture and with the general principle that commercial pressure should never be allowed to erode a trust commitment already made publicly.
**Consequences:** `EPIC-011`'s rollups are aggregate-only by design (see that epic's own scope). Any future proposal to monetize user-level data directly must be checked against this decision and would require it to be explicitly revisited, not quietly reinterpreted.
**Related backlog items:** `EPIC-011`, `EPIC-013`, `EPIC-016`, `EPIC-017`.

---

### DEC-022 — One shared discovery layer: presentation varies by surface, filter semantics do not

**Date:** 2026-10-03
**Decision:** WHEN + WHERE + WHAT + SEARCH is a universal discovery grammar, defined once in `discovery.js` (plain shared vanilla JS; definitions, canonical state and semantics only — no DOM, no network, no stored state, no framework, no build step) and consumed by every discovery surface. Category filtering is positive and additive: nothing selected means ALL EVENTS, a selection shows that category, selections are OR'd within WHAT, and WHEN/WHERE/WHAT/SEARCH are AND'd with each other. Discovery state has one canonical shape and one URL codec, so a state can travel between pages; parameter names already live (`when`, `cats`, `free`, `features`, `q`, `loc`, `radius`, `neighborhood`) are kept and legacy forms are still read. A bare `cats=` means all events (it used to mean none). Category selections are paths, so `category → genre → subgenre` can be added later without changing state, URL or matching; no genre is exposed or inferred until the data supports it. A surface may differ only in its presentation and in its own default view.
**Context:** The homepage UX evolution was about to add a fourth private copy of the filter rules. `index.html`, `calendar.html` and `map.html` each carried their own category list, places table, date rules, predicate and URL handling, and the copies had already drifted: search matched seven fields on the homepage and two elsewhere; the Detroit Orbit was measured from Detroit's border on the homepage and from its centre on Calendar and Map (contrary to `DEC-003`); `?when=tomorrow` was honoured by one page and silently ignored by the others.
**Alternatives considered:** Rewriting filtering inside `index.html` only (the first plan; rejected by the Product Owner: "I do NOT want the new discovery/filter behavior to become another homepage-specific implementation"). A framework or component layer (rejected: keep it lightweight vanilla JS, no broad refactor).
**Reason:** One definition cannot drift, and makes the planned Calendar and Map work an adoption rather than a rewrite.
**Consequences:** Sequence approved: (1) `discovery.js` and tests, no page changed; (2) homepage adopts it with no visual redesign; (3) homepage UX evolution; (4) Product Owner review; (5) Calendar and Map adopt it, with Calendar receiving the new exhaustive-discovery UX rather than keeping its old interface. Until a page adopts it, its own copies remain and `test/discovery-compat.test.js` fails if any copy of the category list, places table, boundary, feature list or blocked names diverges from the canonical one. Until Calendar and Map adopt it, links from the homepage carry categories, free, search, place + radius, tonight/weekend/today and a single picked day; tomorrow, next 7 days, week, date ranges and neighborhood are not honoured there yet.
**Related backlog items:** `STORY-024`; supersedes the per-page approach in `EPIC-002`/`STORY-003`/`STORY-005`/`STORY-006`; `DISCOVERY-007` (genre drill-down — the structure is ready, the data decision is unchanged).

---

### DEC-023 — "Current + upcoming" includes events in progress

**Date:** 2026-10-03
**Decision:** "Current + Upcoming" means approved events that are still happening or occur in the future. An event that began before today but has not ended is current and belongs both in the count and in appropriate homepage discovery. An event with no end date (or an end date before its start) is a single-day event: it is current on its start date only. The number is always computed, never hardcoded.
**Context:** The homepage's existing exact count covered only events starting today or later (1,901 on 2026-10-03) and its list hid every event already in progress (19 that day, including a festival's final weekend); 33 in-progress events made the inclusive figure 1,934.
**Alternatives considered:** Counting only events that start today or later.
**Reason:** A festival on its second day, or an exhibition mid-run, is exactly what a visitor can still go to.
**Consequences:** Defined once in `discovery.js`: `inventoryFilter()` for the database total (`start_date >= today OR end_date >= today`) and `matches()` for lists, which agree on which events are current. In lists an event additionally stops being current on its last day once its known end time has passed. The total trusts `end_date`; a wrong end date in the data will be counted until corrected.
**Related backlog items:** `STORY-024`; `DEBT-003` (Calendar load window must also keep long-running events).

---

### DEC-024 — Declared features and derived features are distinct; clothing-optional is a declared feature

**Date:** 2026-10-03
**Decision:** DECLARED FEATURES are explicitly supplied by an organizer, promoter or authoritative source. DERIVED FEATURES are properties 313.events determines structurally (has tickets, has photo, community-submitted, press coverage). `is_clothing_optional = true` is a declared feature and may produce both a visible CLOTHING OPTIONAL label and a Clothing Optional discovery filter. False or unset produces no public assertion; "clothing required" is never inferred from false/unset. Promoter-declared event features will be designed coherently as part of the Discovery system, not added piecemeal.
**Context:** A promoter reported the clothing-optional question felt out of place after submitting (it was the confirmation panel echoing `"clothingOptional": false`; fixed and deployed 2026-10-03). The follow-up question was whether the attribute should be a label, a filter, or both.
**Alternatives considered:** Label only; filter only.
**Reason:** Promoter-supplied structured metadata can become a trustworthy filter; a fact inferred from a description cannot. Absence of a declaration is not a declaration of the opposite.
**Consequences:** `discovery.js` carries a `kind` on every feature and defines `clothing_optional` as strictly `=== true`; there is no negative feature, label or filter, and tests assert none exists. `STORY-023` (an Event Features group in the submission form) stays in the backlog, unbuilt.
**Related backlog items:** `STORY-023`, `STORY-024`.

---

### DEC-025 — "Don't Miss" is a temporary editorial placement, not a property of the event

**Date:** 2026-10-03
**Decision:** The homepage "Don't Miss" module is modelled as a temporary editorial placement (a record pointing at an event for a period, with a reason, that expires on its own), not as a boolean on the event. It is human-curated and scarce (typically 1–3 events, sometimes 0). No candidate is published until its exceptional factual claim has been verified against an authoritative source; an ingested or machine-written event description is not sufficient evidence.
**Context:** Raised during the homepage UX evolution. A column on `events` would have no start or end, keep no record of what was chosen and why, sit on a row ingestion rewrites daily, and place editorial selection beside any future commercial placement, which `DEC-015` keeps structurally separate. `EPIC-008` had already concluded a decision is about the nomination, not permanently about the event.
**Alternatives considered:** `events.is_dont_miss` plus reason/sort columns (the first proposal; rejected).
**Reason:** Being featured is a dated editorial decision, not a fact about the event.
**Consequences:** Not built yet. Initial shortlist for factual verification, chosen by the Product Owner: Masonic Temple Centennial Gala, The World of Anna Sui, Shortbus 20th Anniversary with John Cameron Mitchell; Andrew Bird with the DSO stays a candidate for later. Shipping "Don't Miss" under its own name leaves the press-coverage "On the Radar" page as it is; `DISCOVERY-010` is not otherwise resolved here.
**Related backlog items:** `EPIC-008`, `EPIC-009`, `DISCOVERY-010`, `DISCOVERY-011`. Added 2026-10-03: `EPIC-007` (candidate criteria, including Detroit routing significance — an added criterion; the decision above is unchanged) and `DISCOVERY-021`.

---

### DEC-026 — Homepage hero: one primary total, three supporting stats; venue and city totals held

**Date:** 2026-10-03
**Decision:** The hero's primary figure is `[N] CURRENT + UPCOMING EVENTS` (per `DEC-023`). Supporting figures are TODAY, THIS WEEK and ACTIVE NEIGHBORHOODS. Venue and city totals are held until normalization and coverage make those numbers trustworthy.
**Context:** Measured 2026-10-03: 130 venue rows vs 309 distinct venue names among upcoming events (84 linked, none with coordinates); 55 distinct city strings including wrong and unnormalised values.
**Alternatives considered:** Showing venue and city counts now, as an early design mockup did.
**Reason:** A headline number the site cannot defend undermines the ones it can.
**Consequences:** Not built yet (homepage UX evolution). See `DEBT-004`, `DEBT-005`, `DEBT-006` for the coverage work that would unlock the held figures.
**Related backlog items:** `DEBT-004`, `DEBT-005`, `DEBT-006`.

---

### DEC-027 — Forward-looking views leave out what is over; an explicitly chosen date or range does not

**Date:** 2026-10-03
**Decision:** "Already over" is not a universal exclusion from discovery. FORWARD-LOOKING modes — a surface's default forward-looking inventory, Today, Tonight, Tomorrow, This Weekend, This Week, Next 7 Days and All Upcoming — start at today and exclude events whose known end has passed. An EXPLICIT date or date-range selection is taken exactly as chosen, past or future, and returns the events of that period, completed or not. A valid explicit past date or range is represented normally: it does not canonicalize to an empty result, and is not moved to today, merely because it is in the past.
**Context:** The first build of `discovery.js` treated "is it over?" as a rule applied to every mode, and emptied any window that lay wholly in the past. The Product Owner approved the foundation with this one semantic correction before the homepage adopted it.
**Alternatives considered:** Excluding over events everywhere (the first build; rejected — being over now does not erase an event from the period it belonged to, and Calendar history and any future "what happened that weekend" view depend on it).
**Reason:** The two kinds of question are different: "what can I still go to" versus "what was on then".
**Consequences:** Implemented in `discovery.js` (`windowOf()` marks a window forward-looking unless the mode is an explicit `dates` pick or `ctx.includePast` is set; only forward-looking windows are floored at today and filtered for "over"). On the homepage an old link to a picked date that has since passed now opens that date instead of being discarded — but the homepage loads only its eight-day back-buffer plus events still running, so a date older than that shows an empty list there; deep historical discovery remains a Calendar concern (Product Owner, 2026-10-03; `DEBT-008`). Tomorrow, This Weekend, This Week and Next 7 Days are forward-looking alongside the modes first named (confirmed by the Product Owner, 2026-10-03). The homepage's own Today shortcuts (header Today, Free Today) use the canonical Today mode rather than a picked date, so their links mean "today, whenever opened"; a literal picked date remains a stable, dated selection.
**Related backlog items:** `STORY-024`, `STORY-025`, `DEBT-008`.

---

## Open, not yet decided

These have been *raised* and researched but are explicitly **not** settled — listed here only so they aren't rediscovered as if new. See `PRODUCT.md`'s "Product decisions required" section and `BACKLOG.md` for the tracked items.

- **DISCOVERY-001 — Resident Advisor / Instagram capture policy.** An earlier framing in this project understated the access-authorization issue here (RA's ToS prohibits automated access outright, not just robots.txt-governed crawling; real logged-in browser sessions have hit DataDome challenges). Needs Jody's explicit choice among: pursue a written RA partnership, restrict RA to human-read-and-typed-in-only manual capture, or knowingly accept the ToS risk. Not decided. **Equivalent to Appendix A decision A3** (see `epics/EPIC-001-ingestion-platform-scaling/APPENDIX-A-DECISIONS.md`) — the two are the same open question, tracked in both places for now.
- The 12 Appendix A decisions (A1–A12) — auto-venue-creation policy, Canadian geocoding provider, JS-rendering worker, auto-publish thresholds, and others. Preserved with their original identifiers in `epics/EPIC-001-ingestion-platform-scaling/APPENDIX-A-DECISIONS.md`, which tracks exactly what each one blocks. None decided.
- **DISCOVERY-009 — `organizations` (WP 4.13) vs. `DEC-005`'s "source ≠ organizer" rule.** The approved architecture's WP 4.13 populates one organization per *source*, which reads as different from — and possibly in tension with — `DEC-005`'s rule that organizers are hand-curated only and never auto-derived from `source`. Raised during the ingestion-program import (2026-09-21); not resolved. See `BACKLOG.md`.
- Whether to pursue the social/community layer at all (`EPIC-005`). Not decided.
- **DISCOVERY-010 — "On the Radar" naming collision.** `radar.html`/`index.html`'s existing "radar" filter chip (press-coverage match, live today) vs. `DEC-014`'s new human-curated "On the Radar" concept — same name, different meaning, not reconciled. See `BACKLOG.md` and `EPIC-009`.
- **DISCOVERY-011 — Radar candidate persistence/decision-log schema** (`EPIC-007` V1 persistence and `EPIC-008`'s decision log are the same schema conversation, not decided independently). Not decided.
- **DISCOVERY-012 — Public naming for commercial placement** ("Featured" vs. an alternative — "Featured" risks reading as editorial). Not decided. See `EPIC-010`.
- **DISCOVERY-013 — Commercial-placement schema separation** (a fully separate table vs. tightly-reviewed columns on `events`). Not decided. See `EPIC-010`.
- **DISCOVERY-014 — Event Connections funnel/metric definition.** Which actions count, and how they're weighted, is a product definition call, not yet made. See `EPIC-011`.
- **DISCOVERY-015 — Email-capture consent/compliance specifics** (first real marketing-email collection this product will have had — `privacy.html`/CAN-SPAM-style preference/unsubscribe handling needs a real design pass). Not decided. See `EPIC-013`.
- **DISCOVERY-016 — Which ticketing platforms beyond Ticketmaster offer a usable affiliate program.** Genuinely unresearched. See `EPIC-014`.
- **DISCOVERY-017 — Self-service promotion package pricing and payment processor.** No evidence yet; explicitly deferred until `EPIC-016` demonstrates paid demand. See `EPIC-015`.
- **DISCOVERY-018 — Exact advertising density-ceiling percentage.** Principle locked at "~10% of the primary discovery experience" (`DEC-018`); the number itself needs real testing. See `EPIC-016`.
- **DISCOVERY-019 — Venue/organizer claim-verification mechanism, and whether it's a new trust category or governed by `DEC-005`'s existing hand-curation rule.** Not decided. See `EPIC-017`.
- **DISCOVERY-021 — Evidence sources for Detroit routing significance** (a "Don't Miss" candidate criterion, `EPIC-007`). No act/artist entity, appearance history, tour-routing or momentum data exists today; no source chosen. Not decided. See `EPIC-007`.
- **DISCOVERY-022 — Organizer Event Lifecycle open decisions** (permanent URL/redirect, QR indirection, organizer edit tiers, token properties, go-live email classification, retention rule, media/audience-content design). Not decided; nothing is built. See `EPIC-018`.
- **DISCOVERY-023 — Cultural archive, tours and data products: whether and when** (entity types, data-licensing position, supporter membership). Not evaluated. See `EPIC-019`.
