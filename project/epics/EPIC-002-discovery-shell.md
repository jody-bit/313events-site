# EPIC-002 — Discovery Shell (homepage time & location navigation)

**Status:** Fully designed (`DISCOVERY_PHASE1_AUDIT.md`), not started.

## Objective

Give visitors a way to filter the calendar by time shortcuts (NOW/TODAY/TONIGHT/THIS WEEKEND) and by location/radius, with shareable URL state — replacing the current flat category-chip/search/free-toggle-only filter bar.

## Problem

313.events now covers a 75-mile, multi-city, cross-border region, but the homepage still only offers month/list calendar navigation, a flat category filter, free-only toggle, and a title/venue text search. There is no way to ask "what's on near me" or "what's on tonight," no URL state (every filter resets on reload), and no browser geolocation integration.

## Scope

- A time-shortcut button group (NOW/TODAY/TONIGHT/THIS WEEKEND/DATE) applied through the existing `matchesFilters()`/`byDate` machinery — no parallel data path.
- A location combobox (predictive search over a new static, hand-curated location-reference dataset: Detroit's 39 neighborhoods + the ~30 `SERVICE_AREA.md` cities + Windsor/Chatham/Sarnia) plus a "USE MY LOCATION" browser-geolocation control, gated on explicit click.
- A radius chip group (5/10/25/50/75/ALL) applying city-level haversine filtering against `events.venue_city_raw` — explicitly scoped in UI copy as city-level, not venue-level, precision.
- An active-filter tray summarizing all applied filters, each removable, plus a "clear all."
- Calendar cell density improvements (event-count line, explicit "TODAY" label).
- `URLSearchParams`-based state for date/view/category/search/location/radius, written via `history.replaceState`.
- Responsive collapse into a WHEN/WHERE/FILTER three-button mobile bar.

## Out of scope

- Neighborhood- or venue-precise radius filtering (needs real per-venue lat/lng coverage — a separate, larger data project, tracked under `PRODUCT.md`'s data-model gaps, not this epic).
- ZIP/postal-code-level filtering (no event or venue reliably carries one).
- A MAP view (no geographic precision to plot beyond city centroids yet) — though the view-toggle component should be built so a third MAP button can be added later without a rewrite.

## Success criteria

A visitor can select a time shortcut and a location/radius, see an honest (city-level, not falsely precise) filtered result set, get a shareable URL for that exact view, and the whole flow works on mobile via the WHEN/WHERE/FILTER pattern.

## Architecture implications

No schema migration is strictly required to start — the location-reference dataset can ship as a static asset (JSON file), not a new Supabase table. `venues.lat`/`lng`/`zip_code` stay unused for now, ready for the real venue-linking project later.

## Dependencies

None blocking for the "buildable now" tier (time shortcuts, active-filter tray, URL state, viewport density). The location/radius tier needs the static reference dataset built first (no external dependency, hand-curated once).

## Stories / tasks

Not yet broken into `BACKLOG.md` items — the design doc's own "Recommended build order" (§5) is a reasonable phasing: (1) viewport/calendar density, (2) time-shortcut bar + URL state, (3) location dataset + predictive search + radius, (4) responsive restructuring + accessibility pass. Should be broken into `STORY`/`TASK` items in `BACKLOG.md` before this epic starts, not implemented directly from this file.

## Risks

None significant — this is explicitly designed as additive, zero-schema-risk work for its first two build phases.

## Open questions

None outstanding in the design itself; the main open call is *when* to prioritize this relative to EPIC-001 (Product Owner sequencing decision, not a technical open question).

## Relevant decisions

`DEC-003` (border-based Orbit measurement — the location dataset must match `SERVICE_AREA.md` exactly, not redefine it).
