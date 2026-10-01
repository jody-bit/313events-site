# 313.events — Roadmap

Initiative-level view. No dates are given anywhere in this file — none of the source material this was built from commits to real dates, and none should be invented. "Current status" reflects what's actually true in the repo as of 2026-09-21, not aspiration.

---

## EPIC-001 — Ingestion Platform Scaling

**Objective.** Grow event coverage across the full Detroit Orbit (75 miles from Detroit's border, MI/OH/ON) from the current ~23 hardcoded sources toward hundreds or thousands, via a platform that gets more resilient as it scales rather than more fragile.

**Why it matters.** The product's core value is comprehensive, trustworthy event discovery. The current one-cron-per-source model works but doesn't scale past a few dozen sources without linear growth in bespoke code and operational fragility (documented in the 67-item gap analysis).

**Current status.** Design phase complete, not yet reviewed or approved. A full audit, gap analysis, architecture proposal, and phased backlog (143 work packages across 10 phases) were produced and delivered but have not been adopted — this is a proposal awaiting Product Owner review, including 12 explicit open decisions in the architecture doc's Appendix A.

**Known dependencies.** Several of Appendix A's decisions block specific phases of the work (e.g. the auto-venue-creation policy blocks the dedup/entity-resolution phase; the Canadian geocoding provider choice blocks the geographic-tiling phase for Ontario sources).

**Related epic file.** `epics/EPIC-001-ingestion-platform-scaling.md`

**Definition of success.** Coverage expands measurably across the Orbit (tracked via the metrics the architecture doc proposes — benchmark recall, capture-recapture estimation) without an increase in operational fragility (measured via the monitoring/health-state model the same doc proposes), and the existing "never guess" / status-preserving-upsert / honest-gap conventions carry forward unbroken into every new source.

---

## EPIC-002 — Discovery Shell (homepage time & location navigation)

**Objective.** Replace the current flat category/search/free-toggle filter bar with time-shortcut navigation (NOW/TODAY/TONIGHT/THIS WEEKEND), predictive location search, and city-level radius filtering, plus URL state so results are shareable/linkable.

**Why it matters.** Today there's no way to ask "what's happening near me" or "what's on tonight" without manually paging the calendar — a real gap given the product now covers a 75-mile, multi-city, cross-border region rather than one city.

**Current status.** Fully designed (`DISCOVERY_PHASE1_AUDIT.md`), not started. The design explicitly separates what's buildable now with zero data dependencies from what needs a new static location-reference dataset, from what's genuinely blocked on a larger data project.

**Known dependencies.** City-level radius filtering needs a hand-curated static location-reference table (buildable now, no schema change). Neighborhood- or venue-precise radius filtering is blocked on real per-venue lat/lng coverage, which is a larger, separate data project.

**Related epic file.** `epics/EPIC-002-discovery-shell.md`

**Definition of success.** A visitor can filter by a time shortcut and a location/radius, get a shareable URL for that view, and the UI is honest about the precision it actually has (city-level, not false venue-level precision) per the design's own stated caution.

---

## EPIC-003 — Entity & Identity Data Buildout

**Objective.** Real per-entity pages (events, venues, organizers, neighborhoods) with accurate underlying identity data — not fabricated activity or invented organizations.

**Why it matters.** The original redesign brief called for venue/organizer/neighborhood profile pages and permalinks; some of this has since been built, some data prerequisites remain unmet.

**Current status.** Partially built. `event-template.html` and `venue-template.html` (server-rendered, dynamic OG cards via `api/event-meta.js`/`api/venue-meta.js`) and `venues.html` now exist — the "no per-entity routing" gap `AUDIT_AND_ARCHITECTURE.md` originally flagged is largely closed for events and venues. The `events.venue_id` backfill gap that same document and `FOUNDATIONAL_ITEMS.md`/`DISCOVERY_PHASE1_AUDIT.md` flagged as load-bearing was closed 2026-09-13 (`api/_lib/venue-lookup.js`, going-forward exact-name matching + a one-time historical backfill). No organizer-facing pages exist yet, and `organizers` remains deliberately near-empty (only Paxahau populated) pending a real population strategy.

**Known dependencies.** Organizer pages need the organizer population strategy decided first (`PRODUCT DECISION REQUIRED` in `PRODUCT.md`) — hand-curation only, per the existing "source ≠ organizer" principle.

**Related epic file.** `epics/EPIC-003-entity-identity-buildout.md`

**Definition of success.** Every venue and event has a real, indexable permalink (largely met already); organizer pages exist and are populated only with hand-verified real promoters/institutions, never invented ones.

---

## EPIC-004 — Admin & Editorial Workflow Improvements

**Objective.** Small, discrete improvements to the moderation/editorial tooling in `admin.html` and the submission flow.

**Why it matters.** As more review queues (editorial matching, feed sources, follow-up gaps) have been added, `admin.html` has gotten more cluttered and some real editorial gaps (multi-day scheduling, splitting one article into multiple events) have no path in the current UI.

**Current status.** One of four originally-requested items is done (tabbed layout with per-tab badge counts — `FEATURE_BACKLOG.md` #2, shipped per git history but not yet marked done in that file, a consolidation item — see `DECISIONS.md`/backlog). The remaining three (editorial-article-to-multiple-events splitting, multi-day/per-day-schedule event entry, category drill-down) are still open requests.

**Known dependencies.** None structural — these are additive UI/data-entry improvements on the existing schema, except the category drill-down which needs a product decision first (see `PRODUCT.md`).

**Related epic file.** `epics/EPIC-004-admin-editorial-ux.md`

**Definition of success.** `FEATURE_BACKLOG.md`'s remaining open items are either implemented or explicitly deferred with a recorded reason, and `FEATURE_BACKLOG.md` itself is reconciled into this project structure rather than left as a second, drifting backlog.

---

## EPIC-005 — Social / Community Layer

**Objective.** Undefined pending a product decision. The original ask was visitor accounts + profiles + some form of chat/engagement between visitors ("MySpace vibe").

**Why it matters.** Requested by a friend of Jody's as a way to make the site more of a social destination, not just a listings calendar — but this is a genuinely large architectural departure (no auth, no accounts, no real-time infrastructure exist anywhere in this project today).

**Current status.** `IDEA` only. Explicitly flagged in `FEATURE_BACKLOG.md` as needing "its own design pass (auth provider, moderation model, data model for profiles/messages, abuse/spam handling) before it could even be scoped, not just built on top of the current architecture."

**Known dependencies.** Everything — this has no existing foundation to build on. Blocked entirely on a Product Owner decision about whether to pursue it at all before any scoping work is worth doing.

**Related epic file.** `epics/EPIC-005-social-community-layer.md`

**Definition of success.** Not yet definable — the first deliverable here is a scoping decision, not a feature.

---

## Initiative — Discovery + Editorial Intelligence (EPIC-007–EPIC-010)

**Captured 2026-10-01, Product Owner request.** As the comprehensive database grows (`EPIC-001`'s coverage goal), comprehensiveness itself creates a second problem: nobody can evaluate hundreds or thousands of events as though each deserves equal attention. This initiative adds two new layers on top of the existing comprehensive calendar — algorithmic discovery lenses, and human editorial curation — without changing what the comprehensive calendar itself shows. Core principle: **comprehensive by default, curated by choice.** The four epics below are sequential by dependency (EPIC-008 needs EPIC-007; EPIC-009's public "On the Radar" surface needs EPIC-008), except EPIC-010, which is a standing constraint on the other three rather than a build in sequence with them. **Documentation/scoping only as of this capture — nothing here is started, scheduled, or authorized for implementation.** See `PRODUCT.md`'s new "Discovery & editorial intelligence" section and `DEC-014`/`DEC-015` for the underlying product decisions, and each epic file for V0 (buildable now, existing data) vs. V1+ (needs schema/AI/learning) scoping.

---

## EPIC-007 — Radar Candidate Intelligence

**Objective.** An internal, evidence-based candidate-nomination system that identifies potentially noteworthy events from the comprehensive database — an editorial-attention prioritization system, not a public rating system and not a cultural-importance judgment engine.

**Why it matters.** Today the only "is this noteworthy" signal anywhere in the product is `radar.html`'s press-coverage match, which depends entirely on whether a journalist happened to cover something — not on any property of the event itself. A rare, milestone, or distinctly-Detroit event with no press coverage is invisible to every existing mechanism.

**Current status.** Scoped, not started. A V0 slice (deterministic scoring from `is_recurring`, venue activation frequency, distinct-press-source count, and other already-populated fields, with mandatory "why it surfaced" explainability, computed live rather than stored) is buildable today with zero schema change. V1+ signals (milestone/anniversary, debut/premiere, crossover detection, Detroit-significance, source-type weighting, the editorial feedback loop) need new schema, hand-entry, or gated AI-assisted extraction and are explicitly deferred.

**Known dependencies.** `editorial_article_events` (live) for the press-signal category. `EPIC-006`'s Needs Follow-up field-completeness logic, reused rather than re-derived. `EPIC-001` Phase 1's `sources` extension (not yet built) for source-type weighting.

**Related epic file.** `epics/EPIC-007-radar-candidate-intelligence.md`

**Definition of success.** A ranked candidate query exists over live data, every candidate carries a legible list of matched signals, and zero events are removed, hidden, or demoted from any public-facing query as a side effect of scoring.

---

## EPIC-008 — Editorial Radar Workbench

**Objective.** An `admin.html` workflow that turns EPIC-007's candidate intelligence into fast human decisions — reviewing 20–40 high-signal candidates instead of the full upcoming-events table.

**Why it matters.** Automation should reduce the number of events an editor must inspect; it must never autonomously decide cultural importance. Without a workbench, EPIC-007's scoring has nowhere to surface and no way to produce the decision history EPIC-007's own feedback loop needs.

**Current status.** Scoped, not started. Hard dependency on EPIC-007 existing in at least V0 form before there's anything to show. Three editorial actions only (On the Radar/Feature, Pass, Not noteworthy/Routine) — additional workflow states (HOLD/REVISIT) explicitly deferred until a demonstrated need appears.

**Known dependencies.** EPIC-007 (candidate scoring). `admin.html`'s existing tabbed layout/badge-count convention (`EPIC-004`).

**Related epic file.** `epics/EPIC-008-editorial-radar-workbench.md`

**Definition of success.** An editor can review a short ranked list with on-card evidence and record a decision in seconds per candidate; every decision is logged for EPIC-007's feedback loop.

---

## EPIC-009 — Consumer Discovery Surfaces

**Objective.** Public-facing discovery lenses (Tonight, This Weekend, Free, Just Added, One Night Only, and others) plus a human-curated public "On the Radar" surface — additive to the comprehensive calendar, never a replacement for it.

**Why it matters.** The current homepage offers only flat month/list navigation, category chips, a free-only toggle, and text search — no way to ask "what's on tonight" or "what's rare right now," and that gap only widens as EPIC-001 grows coverage.

**Current status.** Scoped, not started. **Blocked on a real naming decision before any "On the Radar" public UI work starts**: `radar.html` and the `index.html` "radar" filter chip already exist, are live, and already mean "has press coverage" — a different concept from this initiative's human-curated "On the Radar." Several V0 lenses materially overlap already-designed work: Tonight/This Weekend duplicates `EPIC-002`/`STORY-003` almost exactly, and Neighborhood activity should extend the live `neighborhoods.html` directory rather than fork it.

**Known dependencies.** `EPIC-002`/`STORY-003` (do not duplicate). `neighborhoods.html` (extend, don't fork). `EPIC-007` (every data-driven lens). `EPIC-008` (the public "On the Radar" surface has nothing to show without real editorial selections).

**Related epic file.** `epics/EPIC-009-consumer-discovery-surfaces.md`

**Definition of success.** A visitor can reach the V0 lenses without the homepage becoming another giant list; editorial picks are visually distinguishable from algorithmic lenses; comprehensive search/filter/map/neighborhood browsing are unchanged.

---

## EPIC-010 — Editorial vs. Paid Promotion / Trust Architecture

**Objective.** A hard, structural firewall between editorial selection (On the Radar) and commercial placement (a potential future Featured/Promoted/Sponsored surface) — established before any monetization feature exists, not retrofitted after.

**Why it matters.** No monetization feature exists in 313.events today — which is exactly why this is cheap now and would be expensive (and commercially fraught) to retrofit later. The Product Owner has stated the underlying principle firmly (`DEC-015`): paid placement must never influence editorial selection or Radar scoring, and must never be representable as editorial selection.

**Current status.** Principle decided (`DEC-015`); implementation and public naming both open. No monetization feature is being built as part of this epic — this is the constraint the other three epics (and any future commercial feature) must be checked against.

**Known dependencies.** EPIC-007 (the scoring this firewall constrains). EPIC-008 (the editorial action this firewall constrains). EPIC-009 (where the visual editorial/commercial distinction must be legible).

**Related epic file.** `epics/EPIC-010-editorial-trust-architecture.md`

**Definition of success.** A written, approved rule exists that any future monetization proposal is checked against before implementation; the public naming question is tracked, not silently defaulted.

---

## Initiative — Monetization & Growth Program (EPIC-011–EPIC-017)

**Captured 2026-10-01, Product Owner request.** Seven epics implementing a diversified, four-revenue-stream monetization model (`DEC-017`): passive transactional (affiliate), automated transactional (self-service promotion), recurring (Organizer Pro), and media (display/sponsorship) — underpinned by a shared measurement layer and run alongside audience-growth and retention work. **Build order is decided (`DEC-019`) and matters as much as the epics themselves:** Measurement (`EPIC-011`) → Affiliate (`EPIC-014`) → Display/Sponsorship (`EPIC-016`) → Self-Service Promotion (`EPIC-015`) → Organizer Pro (`EPIC-017`), with Audience Growth (`EPIC-012`) and Retention (`EPIC-013`) running the whole time rather than waiting in the sequence. The guiding principle: **don't automate a business model before proving somebody will pay for it** — display/sponsorship inventory is sold manually first; automation comes only once demand is real. **Documentation/scoping only as of this capture** — no payment processing, tracking, or advertising code exists yet. Two existing live facts this program builds on rather than starting from zero: the Ticketmaster affiliate-link relationship already disclosed in `terms.html`, and the "Sponsored content will never secretly determine editorial coverage" promise already made in `editorial-policy.html`. See `PRODUCT.md`'s new "Monetization & growth" section and `DEC-017`–`DEC-021`.

---

## EPIC-011 — Event Connections + Commercial Analytics

**Objective.** Define and instrument the real funnel (impression → open → ticket click → official-site click → save → share → directions → follow → promotion interaction) behind a single, agreed "Event Connections" metric — foundational to every other epic in this program.

**Why it matters.** 313.events has only page-level analytics today (GA4 + Metricool, per `privacy.html`) and zero outbound-click instrumentation. Every later epic needs to report a real number to a promoter or sponsor; none of that exists yet.

**Current status.** Scoped, not started. Must ship with a `privacy.html` update the moment outbound-click tracking goes live — tracked as a hard dependency, not a follow-up.

**Related epic file.** `epics/EPIC-011-event-connections-commercial-analytics.md`

**Definition of success.** A promoter or sponsor can be given one real, defensible, consistently-defined number for their event or placement.

---

## EPIC-012 — Audience Growth Engine

**Objective.** Programmatic (not hand-authored) landing pages, structured data, and shareable/organizer-facing assets, so database growth automatically creates more discovery surfaces.

**Why it matters.** The only indexable layer beyond individual pages today is the sitemap and a handful of static directory pages — no date/category/city/seasonal landing-page layer exists.

**Current status.** Scoped, not started. Runs alongside the revenue epics rather than waiting behind them (`DEC-019`).

**Related epic file.** `epics/EPIC-012-audience-growth-engine.md`

**Definition of success.** Organic acquisition and organizer-driven distribution grow faster than manual promotion effort, and every new onboarded source gets real landing-page coverage automatically.

---

## EPIC-013 — Retention + Personal Discovery

**Objective.** Saves, lightweight email capture (no mandatory accounts), follows, and a "Weekend Signal" digest — turning occasional visitors into habitual ones while keeping browsing fully open.

**Why it matters.** No returning-visitor mechanism of any kind exists today. This is narrower than `EPIC-005`'s much larger, still-undecided social/community ask — scoped specifically to retention mechanics, not accounts/profiles/messaging.

**Current status.** Scoped, not started. Reuses the already-live Resend transactional-email infrastructure rather than standing up new email delivery.

**Related epic file.** `epics/EPIC-013-retention-personal-discovery.md`

**Definition of success.** Returning-visitor rate, subscriber count, and saves/follows all trend upward and are measurable via `EPIC-011`.

---

## EPIC-014 — Commerce + Affiliate Revenue

**Objective.** Extend the already-live Ticketmaster affiliate-link pattern to other permitted ticketing platforms, with real click/revenue attribution and partner reporting.

**Why it matters.** This is not greenfield — one affiliate relationship already exists and is already publicly disclosed (`terms.html`). The gap is attribution/reporting and confirming which other platforms actually offer a program.

**Current status.** Scoped, not started. Second in the build order (`DEC-019`) — right after Measurement.

**Related epic file.** `epics/EPIC-014-commerce-affiliate-revenue.md`

**Definition of success.** Revenue occurs as a byproduct of ordinary ticket-click behavior, with no advertiser sales process required.

---

## EPIC-015 — Self-Service Event Promotion

**Objective.** A `BUY → PAY → START → DISPLAY → EXPIRE → REPORT` lifecycle letting a promoter purchase fixed-price distribution packages (Boost, Weekend Boost, Category Boost, Orbit Boost) with zero manual involvement from Jody.

**Why it matters.** No commerce/payment infrastructure exists today — this is a genuinely new capability, which is exactly why it's sequenced after the simpler streams.

**Current status.** Scoped at the concept/package level only. **Deliberately not broken into implementation stories yet** — per `DEC-019`, this should wait until `EPIC-016`'s manually-sold sponsorships prove real paid demand exists.

**Related epic file.** `epics/EPIC-015-self-service-event-promotion.md`

**Definition of success.** A promoter completes the full lifecycle with zero manual intervention, and every promoted placement is clearly labeled.

---

## EPIC-016 — Native Display Advertising + Sponsorship

**Objective.** A small, designed "313 advertising" inventory system (Signal Sponsor, Orbit Partner, Neighborhood Partner, Calendar placement, Radar sponsorship, Newsletter sponsorship, Venue/category sponsorship) — explicitly rejecting the programmatic-banner-ad model.

**Why it matters.** 313.events already promised, in `editorial-policy.html`, that any future sponsored content would be clearly labeled and would never secretly influence editorial coverage — this epic is where that promise gets tested for real. Third in the build order, and deliberately ahead of Self-Service Promotion: inventory can be sold manually before any automation exists.

**Current status.** Scoped, not started. Hard requirements and a density ceiling (~10% of the primary discovery experience) are locked now (`DEC-018`); the exact ceiling number needs testing. The Radar-sponsorship placement needs the explicit "sponsors support the section, not the selection" firewall copy (`DEC-020`) live before it ships.

**Related epic file.** `epics/EPIC-016-native-display-advertising-sponsorship.md`

**Definition of success.** At least one real, manually-sold, clearly-labeled sponsorship is live within the density ceiling, with none of the locked hard requirements violated.

---

## EPIC-017 — Organizer Pro + Commercial Intelligence

**Objective.** A free tier (claim venue, correct details, manage/submit events) and a paid Pro tier (analytics, follower signals, automatic feed integration, enhanced profile, promotional credits, campaign reporting) for venues/organizers — the recurring-revenue layer.

**Why it matters.** No organizer-account concept exists today; `organizers` remains deliberately near-empty pending a population strategy (`DISCOVERY-006`). This epic is a plausible concrete path to finally resolving that, without overriding the existing hand-curation principle (`DEC-005`).

**Current status.** Scoped at the concept level only, not broken into stories — last in the build order (`DEC-019`), and explicitly waiting on real usage evidence before pricing is even designed.

**Related epic file.** `epics/EPIC-017-organizer-pro-commercial-intelligence.md`

**Definition of success.** A meaningful share of claimed venues/organizers convert to paid Pro, generating real, growing MRR distinct from the program's other three revenue streams.

---

## Standalone item — Facebook auto-post distribution

Not treated as a full epic; it's small, self-contained, and already code-complete. `api/cron-post-to-facebook.js` posts newly-approved events to 313.events' own Facebook Page feed (not native Facebook Events — that needs Meta's separate, heavier Official Events API partner program, not pursued). The code no-ops safely until Jody completes several external, non-engineering setup steps on Facebook/Meta's side (Business verification, Meta App creation, App Review for `pages_manage_posts`). See `BACKLOG.md` for the tracked item; no epic file needed unless native Facebook Events becomes a real ask later.
