# EPIC-009 — Consumer Discovery Surfaces

**Status:** BACKLOG — not started. Part of the four-epic "Discovery + Editorial Intelligence" initiative (`ROADMAP.md`). Overlaps materially with already-designed work in `EPIC-002` — see "Known overlap" below before this is scoped further.

## Objective

Translate the comprehensive database, plus `EPIC-007`/`EPIC-008`'s editorial layer, into public-facing discovery surfaces (contextual lenses and a human-curated "On the Radar" layer) that help visitors navigate abundance — **additive to**, never a replacement for, the comprehensive calendar/search/filter/map experience. Core product principle, verbatim from the Product Owner: **comprehensive by default, curated by choice.**

## Problem

313.events' only navigation today is the flat month/list calendar, category chips, a free-only toggle, and text search (`index.html`, per `PRODUCT.md`). There is no "what's on tonight," no "what's rare or unusual right now," and no public surface for editorially-curated picks distinct from the press-coverage-driven `radar.html` that already exists under the same name (see "Known naming collision" below). As event volume grows toward `EPIC-001`'s hundreds-to-thousands goal, a flat list stops being a usable front door.

## Known naming collision — must be resolved before any "On the Radar" public UI work starts

**`radar.html` and the `index.html` "radar" filter chip already exist, are live, and already mean something specific and different from what this initiative calls "On the Radar."** Today, "On the Radar" = **has press/editorial coverage** (`editorial_article_events` match), computed automatically by `cron-editorial.js`, with zero human curation step. This initiative's "On the Radar" = **human-selected as noteworthy**, explicitly *not* a function of press coverage (an event can be Radar-worthy with zero press, and heavily-covered events are not automatically Radar-worthy). These are genuinely different concepts that currently share one name and one page.

This is a real product decision, not a naming nitpick, and it is **not decided here**:

1. Rename the existing press-coverage page/filter (e.g. "Press Coverage" or "As Seen In," reusing language already in `editorial_articles.source`'s own "As seen in" convention) and free up "On the Radar" for the new human-curated layer.
2. Keep the existing page's name, and give the new human-curated layer a different public label.
3. Merge the two: press coverage becomes one visible *signal* on an event's Radar card (consistent with `EPIC-007` already treating press/editorial signal as one input among several), and the public "On the Radar" surface becomes the human-curated layer, with the old press-only page either folded in or retired.

See `DISCOVERY-010` in `BACKLOG.md`. No public UI story in this epic that uses the words "On the Radar" should be implemented before this is decided.

## Scope — V0 lenses (derivable from existing fields + existing filter machinery; several already designed, not yet built, under EPIC-002)

| Lens | Data it needs | Status |
|---|---|---|
| Tonight / This Weekend | `start_date`, existing `matchesFilters()`/`byDate` logic | **Already fully designed under `EPIC-002`/`STORY-003`** ("NOW/TODAY/TONIGHT/THIS WEEKEND" time-shortcut bar). This epic should consume that work, not redesign it — see "Known overlap" below. |
| Free | `is_free` | Already a live filter (`index.html`'s free-only toggle) — this lens may just need surfacing as a discoverable entry point (e.g. a homepage card), not new filter logic. |
| Just Added | `created_at` | New, small: "added in the last N days," sorted newest-first. No schema change. |
| One Night Only | `is_recurring = false`, `end_date` null or equal to `start_date` | New, small: a direct, already-populated-field filter. |
| Neighborhood activity | `neighborhood_id`, existing 39-row `neighborhoods` table, existing `neighborhoods.html` directory (per `sitemap.js`'s 2026-10-01 neighborhood-directory addition) | Should extend the **existing** neighborhood-directory page, not create a parallel one — see "Known overlap" below. |

## Scope — V1+ (thin or no existing data; needs EPIC-007's richer signals, new fields, or editorial hand-entry)

- **Opening / Closing.** Needs a concept of "this is the first/last date of a run" that the schema doesn't track explicitly today (`end_date` exists, but nothing flags "this specific date is the closing performance" when a show has nightly individual event rows rather than one row with a date range) — depends on how `EPIC-007`'s milestone/finale signal work (V1, that epic) resolves.
- **Anniversary / Festival-as-milestone.** Same dependency as `EPIC-007`'s anniversary signal — this is a consumer-facing display of that backend signal, not separable work.
- **Worth the Drive.** Needs a distance-from-user computation (not built anywhere today — `EPIC-002`'s location/radius work is the closest existing foundation, but "worth the drive" additionally needs a rarity/significance signal combined with distance, i.e. it's a genuine intersection of `EPIC-002` and `EPIC-007`, not purely either one).
- **Only in Detroit / distinctly Detroit.** Depends entirely on `EPIC-007`'s V1 "Detroit/regional significance" signal — nothing to build here until that exists.
- **First time / debut / premiere.** Same dependency as `EPIC-007`'s debut/premiere signal (V1, AI-assisted-extraction-gated).
- **On the Radar (public surface).** Blocked on the naming decision above, and on `EPIC-008` producing real editorial selections to display — there is nothing to show until an editor has actually used the workbench.

## Out of scope

- Making the homepage itself one long combined list of lenses ("avoid making the homepage another giant event list," per the product brief) — exact homepage layout/IA is an implementation-design question for whoever builds this, not specified here.
- Any lens whose underlying signal doesn't exist yet in `EPIC-007` — this epic displays signals, it does not invent them.

## Success criteria

A visitor can reach at least the V0 lenses above from the homepage without it becoming a second giant list; editorial selections (once `EPIC-008` produces them) are visually and textually distinguishable from algorithmic/contextual lenses, per the product brief's explicit requirement; the comprehensive calendar, search, map, and neighborhood browsing all continue to work completely unchanged for a visitor who wants specific-intent browsing instead of discovery lenses.

## Known overlap with EPIC-002 and the existing neighborhood system — resolve sequencing before scoping stories

- **Tonight/This Weekend duplicates `EPIC-002`/`STORY-003`'s time-shortcut bar almost exactly.** Building both independently would be wasted, conflicting work. Recommendation (not a final decision — Jody's call): treat `STORY-003` as the one implementation of this lens and have this epic's "Tonight/This Weekend" scope point to it rather than duplicate it.
- **Neighborhood activity should extend `neighborhoods.html`** (the existing 39-neighborhood directory, confirmed live via `sitemap.js`'s 2026-10-01 addition), not create a second, competing neighborhood-browsing surface. The product brief itself asks this explicitly ("consider how this integrates with the existing Explore Neighborhoods system... rather than creating redundant parallel interfaces").

## Architecture implications

No schema migration needed for the V0 lens set — all five read fields that already exist. The "editorial vs. algorithmic" visual distinction (a cross-epic requirement) is a front-end/design convention (e.g. a consistent badge or section styling), not a data-model concern, but it needs to be decided once, centrally, and reused everywhere a lens or a Radar pick is shown — not redesigned per-surface.

## Dependencies

`EPIC-002`/`STORY-003` (Tonight/This Weekend — do not duplicate). `neighborhoods.html` (Neighborhood activity — extend, don't fork). `EPIC-007` (every V1+ lens; the public-facing display layer for Radar signals generally). `EPIC-008` (the public "On the Radar" surface has nothing to show without it).

## Stories / tasks

See `BACKLOG.md`: `STORY-012` (Just Added + One Night Only lenses, V0, no dependency), `STORY-013` (Free lens surfacing as a discoverable homepage entry point, V0). The public "On the Radar" surface and every V1+ lens are intentionally **not** broken into stories yet — blocked on the naming decision and on `EPIC-007`/`EPIC-008` producing real signals/selections respectively.

## Risks

The main risk is building a parallel homepage IA that fights with `EPIC-002`'s already-designed time-shortcut/location work, or a parallel neighborhood browsing surface that fights with the live `neighborhoods.html` — both are flagged explicitly above specifically so implementation doesn't rediscover this collision mid-build.

## Open questions

The naming collision above (`DISCOVERY-010`). Sequencing relative to `EPIC-002` (should `STORY-003` be pulled first, with this epic's lens work treated as "more lenses added to that same bar" rather than a separate build?) — a Product Owner sequencing call, not a technical question. See also `DISCOVERY-012` (public "Featured"/commercial-placement labeling, shared with `EPIC-010`) in `BACKLOG.md`.

## Relevant decisions

`DEC-003` (border-based Orbit measurement — "Worth the Drive," if built, must use the same geography, not a new informal radius). `DEC-014` (three-layer model). `DEC-015` (editorial/commercial firewall — public lens and Radar surfaces must visually honor the distinction `EPIC-010` establishes).
