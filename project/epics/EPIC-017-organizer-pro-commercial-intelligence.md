# EPIC-017 — Organizer Pro + Commercial Intelligence

**Status:** BACKLOG — not started. Part of the monetization/growth program (`ROADMAP.md`), Product Owner's **EPIC 6**. Last in `DEC-019`'s build order — the recurring-revenue layer, built once the simpler streams (`EPIC-011`/`014`/`016`) have proven the product generates value worth paying a monthly fee for.

## Objective

Turn the supply side (venues, organizers, promoters) into recurring SaaS revenue, on top of a free tier that already improves the database for everyone.

## Problem

313.events has a self-service submission path (`submit.html` → `pending_review`, per `PRODUCT.md`) and a self-service feed-registration path, but no concept of an organizer *account* at all — no claim-a-venue flow, no organizer-facing dashboard, no tiered feature set. `organizers` (migration_002) is schema-only and deliberately near-empty (`DEC-005`, `DISCOVERY-006`) — this epic is a plausible, concrete reason to finally build out that population strategy, but does not resolve `DISCOVERY-006` by itself.

## Scope — free tier (improves the database for everyone, not gated)

- **Claim venue** — an organizer/venue operator asserts ownership of an existing venue row, subject to some verification step (not yet designed).
- **Correct details** — a claimed venue's operator can propose corrections (address, hours, social links) — likely routed through the existing admin-review pattern rather than direct unmoderated writes, consistent with "a submitter can never self-approve" (`PRODUCT.md`'s non-negotiable constraints).
- **Manage event** — edit/withdraw their own submitted events.
- **Submit events** — the existing `submit.html` path, now attached to a claimed identity rather than an anonymous submission.

## Scope — Pro tier (recurring revenue, pricing TBD)

- **Analytics / event performance** — built on `EPIC-011`'s Event Connections funnel, scoped to the organizer's own events only (never another organizer's data).
- **Follower/audience signals** — how many visitors follow this organizer/venue, via `EPIC-013`'s follow mechanism.
- **Automatic feed integration** — likely the existing self-service ICS feed path (`feed_sources`, `cron-feeds.js`), presented as a Pro perk rather than built as new ingestion mechanics.
- **Enhanced venue profile**, **historical performance**, **promotional credits** (a plausible bundling point with `EPIC-015`'s Boost packages — a Pro subscription could include promotion credits as a retention lever), **campaign reporting**, **multiple team members**, **advanced event management** (this is where `STORY-002`'s multi-day/per-day-schedule entry, currently `BACKLOG` under `EPIC-004`, would most naturally land if it's ever prioritized).

## Out of scope

Pricing. The Product Owner is explicit: *"No idea what X should be yet. We need evidence before pricing."* No pricing model is proposed or implied by this document.

## Success criteria

A meaningful share of claimed venues/organizers convert to paid Pro, and the resulting MRR becomes a real, growing revenue line distinct from the other three streams (affiliate, self-service promotion, display/sponsorship) — the Product Owner's own framing is that this is "where monthly recurring revenue starts building," i.e., it's expected to be a longer-horizon payoff than the others, not a quick win.

## Dependencies

`EPIC-011` (organizer-facing analytics is a scoped view over the same funnel). `EPIC-013` (follower/audience signals). `DISCOVERY-006` (organizer population strategy — claim-venue is a new, concrete path toward populating `organizers`, but the existing hand-curation-only principle, `DEC-005`, still applies: a claim must be verified as a real person/entity, not auto-trusted). `EPIC-015` (potential promotional-credit bundling). `EPIC-004`/`STORY-002` (advanced event management's natural destination if ever built).

## Stories / tasks

Not yet broken into stories. Per the build order (`DEC-019`), this is the last of the five revenue-building epics to be scoped into implementable tickets — it needs the free-tier claim/manage mechanics designed first (a real product-design pass, not specified here), and benefits from `EPIC-011`'s analytics already existing to build Pro-tier reporting on top of rather than alongside.

## Risks

Building a Pro tier before there's a clear free-tier claim/verification flow risks selling a subscription on top of a shaky foundation (unverified claims, no real organizer identity model). The free-tier mechanics should be solid and genuinely useful on their own before Pro pricing is even designed.

## Open questions

Venue/organizer claim verification mechanism (not designed). Pro pricing (explicitly "need evidence first," not decided). Whether claim-venue should be gated by the same `DEC-005` hand-curation principle that governs `organizers` today, or whether a verified self-claim is treated as a new, distinct trust category. See `DISCOVERY-019` in `BACKLOG.md`.

## Related (added 2026-10-06)

`EPIC-018` (Organizer Event Lifecycle) records the first-generation path into this epic's free tier — secure email management links before claim/accounts (`OL.7`, `OL.15`). It does not duplicate "manage event" scope; this epic remains the owner of claim, accounts and Pro.

## Relevant decisions

`DEC-005` ("source ≠ organizer," hand-curation-only — this epic's claim flow must be reconciled with it, not silently override it). `DEC-017` (four-revenue-stream model — this is the "recurring" stream). `DEC-019` (build order — Organizer Pro is last).
