# EPIC-014 — Commerce + Affiliate Revenue

**Status:** BACKLOG — not started as a program, but **partially live already**. Part of the monetization/growth program (`ROADMAP.md`), Product Owner's **EPIC 3**, and — per `DEC-019`'s build order — the **second** priority after Measurement (`EPIC-011`), ahead of display/sponsorship, self-service promotion, and Organizer Pro.

## Objective

Monetize existing event intent (a visitor clicking through to buy a ticket or register) with minimal ongoing operational involvement. The funnel, as the Product Owner states it: `313 event → ticket/registration/official site → attributable outbound intent`.

## Problem — and what's already true today

**This is not a greenfield epic.** `terms.html` already discloses, and the product already operates, exactly one affiliate relationship: *"313.events participates in Ticketmaster's affiliate program: when a listing's ticket link goes to Ticketmaster, that link is routed through an affiliate tracking redirect, and 313.events may earn a commission if you complete a purchase through it... Listings sourced from any other connector on the site do not currently carry affiliate tracking of this kind."* So the pattern, the legal disclosure template, and one live revenue source all already exist — this epic's job is to (a) find out whether other ticketing platforms already in the connector roster (Eventbrite organizer-authorized, Fever, Humanitix, DICE, AXS, Etix, See Tickets, Tixr — per `INGESTION_PLATFORM_ARCHITECTURE.md` §6.1/§7.1's trust-tier and access-ladder tables) offer comparable affiliate/referral programs, and (b) build the attribution/reporting layer that today's single Ticketmaster link has none of.

## Scope

- **Identify which ticketing platforms already in or planned for the connector roster offer an affiliate/referral program** — this is research, not engineering, and should happen before any new link-rewriting code is written. Ticketmaster is confirmed; the others are unconfirmed.
- **Affiliate-aware outbound links where permitted** — extend the existing Ticketmaster pattern (an affiliate tracking redirect on the outbound link) to any other platform confirmed above, and make it a per-source, per-platform config flag rather than hardcoded per-connector the way Ticketmaster's is today — so a newly-confirmed affiliate program doesn't need a bespoke code change per source.
- **Click attribution and revenue attribution**, built on `EPIC-011`'s shared instrumentation layer, not a separate tracking system.
- **Partner reporting** — "313.events generated $X in attributable clicks this month," broken down by source/platform.
- **Automatic handling of affiliate vs. ordinary links** — a visitor-facing ticket link either is or isn't affiliate-tracked, and that must be consistent and automatic per source/platform, never a manual per-event decision an editor has to remember to apply.
- **Legal/disclosure update**: `terms.html`'s existing affiliate-disclosure paragraph needs to be generalized from "Ticketmaster only" to "any confirmed affiliate platform," the moment a second one goes live — treat this the same way `EPIC-011` treats its own privacy-policy dependency: a hard acceptance criterion, not a follow-up task.

## Out of scope (for now, per the Product Owner's own framing)

Non-ticket commerce (hotels for destination events, parking/transit, restaurant reservations) — explicitly flagged as "consider later," and explicitly **not** to be built into "an affiliate swamp." No non-ticket commerce story is scoped in this epic.

## Success criteria

Revenue is generated as a byproduct of ordinary ticket-click behavior, with no advertiser sales process required — the Product Owner's own framing, "probably your most passive revenue epic," is the bar this epic is measured against.

## Dependencies

`EPIC-011` (click/revenue attribution reuses the shared funnel instrumentation, not a parallel one). `EPIC-001`'s connector roster and its access-ladder/trust-tier model (§6–§7 of `INGESTION_PLATFORM_ARCHITECTURE.md`) — affiliate-link rewriting is a property of a *source*, and should be configured in whatever registry layer ends up tracking sources (today's disconnected `sources` table, or `EPIC-001`'s extension of it — see `DISCOVERY-005`), not bolted onto individual connector files one at a time the way Ticketmaster's is today.

## Stories / tasks

See `BACKLOG.md`: `STORY-021` (research pass — which already-integrated or planned ticketing platforms offer an affiliate program, output is a findings doc, not code, matching this project's existing research-before-build convention). Link-rewriting/attribution engineering is **not** broken into stories yet — it depends on STORY-021's findings to know which platforms are even in scope.

## Risks

Low, technically — this extends a pattern that's already live and already legally disclosed. The real risk is treating "add affiliate tracking" as a reason to relax the "visibility ≠ authorization" convention (`PRODUCT.md`) — an affiliate program must be confirmed as real and permitted per platform, the same evidentiary bar every other source decision in this project already uses, not assumed because Ticketmaster has one.

## Open questions

Which platforms beyond Ticketmaster actually offer a usable affiliate program — genuinely unresearched as of this capture. See `DISCOVERY-016` in `BACKLOG.md`.

## Relevant decisions

`DEC-017` (four-revenue-stream model — this is the "passive transactional" stream). `DEC-019` (build order — affiliate is priority 2, right after measurement).
