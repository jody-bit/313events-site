# EPIC-012 — Audience Growth Engine

**Status:** BACKLOG — not started. Part of the monetization/growth program (`ROADMAP.md`), Product Owner's **EPIC 1**. Runs alongside the revenue-building epics (`EPIC-011`/`014`/`015`/`016`/`017`) per `DEC-019`'s build order, rather than waiting behind them.

## Objective

Make 313.events discoverable at the scale its own coverage ambition (`EPIC-001`, hundreds to thousands of sources) implies, without requiring marketing labor to scale at the same rate. The key requirement, stated directly by the Product Owner: **database growth should automatically create more useful discovery surfaces** — no hand-authored SEO pages per city/date/category.

## Problem

313.events today has one indexable discovery layer beyond individual event/venue pages: `sitemap.js`'s event/venue URLs plus the static pages (`neighborhoods.html`, `venues.html`, `sources.html`, and so on — confirmed live, per `sitemap.js`'s own 2026-10-01 neighborhood-directory addition). There is no programmatic landing-page layer for date ranges, weekends, categories, cities, or seasonal themes, and no structured data beyond whatever's already in each page's own markup. As coverage grows under `EPIC-001`, the gap between "more events in the database" and "more ways search engines/visitors can actually find them" only widens.

## Scope

- **Programmatic landing pages**, generated from query parameters against the existing comprehensive database — not hand-authored — for: date ranges ("Events in Detroit this weekend"), categories ("Live Music in Detroit"), cities, neighborhoods (extending `neighborhoods.html`, not forking it — same caution as `EPIC-009`), venues, free events, and seasonal themes. Each page must be genuinely useful on its own (real, current event lists), not a thin SEO shell — the Product Owner's own framing ("genuinely useful landing pages," not just SEO filler) is a hard requirement, not a nice-to-have.
- **Structured data** (schema.org `Event`/`Place` JSON-LD) on event, venue, and the new landing pages — directly reusable from the same `jsonld` parsing conventions `EPIC-001`'s architecture already documents for *ingesting* JSON-LD (§7.4); this is the first place 313.events would *emit* it, not just consume it.
- **Automated social assets** generated from Radar/editorial selections (`EPIC-008`) — e.g. an auto-generated share card for each "On the Radar" pick. Depends on `EPIC-008` producing real selections first.
- **Shareable event cards** (OG-card-driven, extending the existing dynamic OG card work on `event-template.html`/`api/event-meta.js` rather than building a new image-generation path).
- **"Listed on 313.events" / "On the Radar" organizer badges** — embeddable assets an organizer can display on their own site. Needs `EPIC-010`'s firewall respected explicitly: a "Listed on 313.events" badge is available to any approved listing; an "On the Radar" badge is only ever available to an event a human has actually selected, never purchasable, and must not be confusable with any future `EPIC-016` sponsorship badge.
- **Referral/share attribution**, feeding `EPIC-011`'s Event Connections funnel rather than building a separate tracking layer.

## Out of scope

Paid acquisition (ads bought *for* 313.events, as opposed to sold *on* 313.events — the latter is `EPIC-016`) is not part of this epic's scope as described.

## Success criteria

Organic search traffic and organizer-driven distribution (via badges/shares) grow measurably faster than any manual promotion effort, and every new source onboarded under `EPIC-001` automatically gets new, real landing-page coverage with zero additional hand-authoring.

## Dependencies

`EPIC-001` (more sources = more landing-page content, the entire premise). `EPIC-007`/`EPIC-008` (Radar selections feed the social-asset and "On the Radar" badge scope). `EPIC-010` (badge-vs-sponsorship distinction must be respected from this epic's first badge). `EPIC-011` (referral/share attribution reports through the shared funnel, not a parallel one). `neighborhoods.html` (extend for neighborhood landing pages, per the same convention `EPIC-009` already established).

## Stories / tasks

See `BACKLOG.md`: `STORY-017` (programmatic date/category/city landing pages, V0 — no schema change, pure query-driven pages over existing data), `STORY-018` (schema.org JSON-LD emission on event/venue/landing pages). Social-asset generation and organizer badges are explicitly **not** broken into stories yet — both depend on `EPIC-008` producing real Radar selections first, which hasn't happened.

## Risks

The main risk is exactly the failure mode the Product Owner's own framing warns against: thin, auto-generated pages that read as SEO filler rather than genuinely useful pages. Each landing-page type should be reviewed for "would a real visitor want this page" before it ships at scale, not just "does it rank."

## Open questions

Which landing-page types to build first — likely ordered by `EPIC-001`'s own coverage-rings priority (§6.2's P0–P3 tiers) rather than independently re-prioritized here. Not resolved.

## Related (added 2026-10-06)

`EPIC-018` (Organizer Event Lifecycle) adds the physical-world arm of the distribution loop: a durable per-event QR code and promotion kit (`OL.5`, `OL.6`). The "Listed on 313.events" badge above remains owned here; `OL.6` links to it rather than duplicating it.

## Relevant decisions

`DEC-014` (three-layer model — a landing page is a discovery-lens surface, category 2, same rules as `EPIC-009`'s lenses re: no implied editorial endorsement). `DEC-015`/`DEC-020` (badge-vs-sponsorship separation).
