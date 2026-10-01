# EPIC-011 — Event Connections + Commercial Analytics

**Status:** BACKLOG — not started. Documentation/scoping only, captured 2026-10-01 per Product Owner request ("monetization/growth program"). The Product Owner's own framing labels this **EPIC 0** of that program — foundational to every other epic in it (`EPIC-012`–`EPIC-017`), not sequenced after them. Kept as `EPIC-011` here only to stay consistent with this file's sequential ID scheme; its priority is not implied by its number.

## Objective

Define and instrument the economic heartbeat of 313.events: not just pageviews, but the actual funnel from an event being shown to someone acting on it — impression → open → ticket click → official-site click → save → share → directions → follow → promotion interaction — and define "Event Connections" as a real, meaningful metric built from that funnel, not a vanity number.

## Problem

313.events has exactly two measurement tools today, both third-party and both general-purpose: Google Analytics 4 (page views, traffic sources, general usage) and Metricool (social-attribution marketing measurement) — per `privacy.html`'s own disclosure, confirmed live. Neither instruments anything event-specific: there is no outbound-click tracking on `ticket_url`/`event_url` anywhere in the codebase today (confirmed: `index.html`'s only analytics calls are `gtag('config', ...)` at page load — no click-level event tracking exists). Every later epic in this program needs to tell a promoter or sponsor a real number ("313.events generated 846 connections with your event," "your sponsorship appeared to 34,218 event seekers") — none of that is possible without this epic first.

## Scope

- **Define "Event Connection"** as a Product Owner-approved, documented set of meaningful actions (not raw pageviews) — the funnel stages listed in the objective. This is a product-definition deliverable as much as an engineering one; get it reviewed and recorded (`DECISIONS.md`) before building reports on top of it, the same way `DEC-014` defined "On the Radar" before `EPIC-008` built a workbench for it.
- **Outbound-click instrumentation** on ticket/event/official-site links, additive to GA4 (custom events via `gtag`) rather than a parallel tracking system — consistent with `privacy.html`'s existing "we don't operate any separate, custom analytics or tracking system of our own beyond these two third-party tools" disclosure, which this epic will make **no longer true** and must update accordingly (see Dependencies).
- **Per-event and per-source rollups** (impressions/opens/clicks per event, aggregated per venue/organizer/source) feeding promoter-facing reporting (`EPIC-015`, `EPIC-017`) and sponsor-facing reporting (`EPIC-016`).
- **Attribution for affiliate and promotion interactions specifically** — this is the shared instrumentation layer `EPIC-014` (affiliate) and `EPIC-015` (self-service promotion) both need; build it once here, not twice.

## Out of scope

- Selling or aggregating individual-level user data as a product (`DEC-021`) — this epic's rollups are aggregate-only by construction (per-event, per-source, per-campaign counts), never a per-visitor profile exported or sold.
- Personalized recommendations (that's `EPIC-013`'s eventual, explicitly-deferred scope) — this epic produces the data those would eventually need, but does not build the recommendation logic itself.

## Success criteria

A promoter or sponsor can be given a real, defensible number for their event or placement, derived from instrumented actions rather than estimated from raw traffic; "Event Connections" has one agreed definition used consistently across every later epic's reporting, not a different ad hoc metric invented per feature.

## Dependencies

- **`privacy.html`/`terms.html` must be updated** the moment outbound-click instrumentation ships — the current privacy policy explicitly states no custom tracking exists beyond GA4/Metricool; shipping this epic without that update would make a public legal document inaccurate, which is exactly the kind of gap `LEGAL_TRUST_PHASE1_AUDIT.md` exists to catch. Treat this as a hard acceptance-criterion dependency, not an afterthought.
- Every other epic in this program (`EPIC-012`–`EPIC-017`) consumes this epic's rollups rather than building their own tracking — flagged explicitly in each of their own dependency sections.

## Stories / tasks

See `BACKLOG.md`: `STORY-015` (define and record the Event Connections funnel/metric), `STORY-016` (outbound-click instrumentation + privacy-policy update, treated as one acceptance unit per the dependency above).

## Risks

The main risk is scope drift into a full analytics-platform build (dashboards, real-time pipelines) before the simpler win — "can we tell a promoter one honest number" — is proven. Keep V0 to counting and rollups; defer anything resembling a BI product.

## Open questions

Exact event taxonomy for "meaningful action" (e.g., does a map "directions" click count the same as a ticket click, or is it weighted differently?) — a product definition call, not an engineering one. See `DISCOVERY-014` in `BACKLOG.md`.

## Relevant decisions

`DEC-017` (four-revenue-stream model, which this epic's reporting serves). `DEC-019` (build order — Measurement first). `DEC-021` (no individual data sale — this epic's aggregate-only design is how that promise is kept in practice, not just in policy).
