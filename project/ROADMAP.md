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

## Standalone item — Facebook auto-post distribution

Not treated as a full epic; it's small, self-contained, and already code-complete. `api/cron-post-to-facebook.js` posts newly-approved events to 313.events' own Facebook Page feed (not native Facebook Events — that needs Meta's separate, heavier Official Events API partner program, not pursued). The code no-ops safely until Jody completes several external, non-engineering setup steps on Facebook/Meta's side (Business verification, Meta App creation, App Review for `pages_manage_posts`). See `BACKLOG.md` for the tracked item; no epic file needed unless native Facebook Events becomes a real ask later.
