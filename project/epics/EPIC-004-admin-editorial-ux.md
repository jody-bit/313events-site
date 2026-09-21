# EPIC-004 — Admin & Editorial Workflow Improvements

**Status:** In progress — 1 of 4 originally-requested items shipped.

## Objective

Keep `admin.html` and the submission/editorial flow usable as more review queues get added, and close real editorial gaps that have no path in the current UI.

## Problem

`FEATURE_BACKLOG.md` (2026-09-12/13) recorded four concrete requests: `admin.html` getting cluttered as queues stack on one page with no per-queue counts; no way to split one editorial article into multiple event records (e.g. a two-night show covered by one article); no way to enter a multi-day event with a different time range per day; a request for category sub-genre drill-down (this last one is really a taxonomy/product question more than a UX one — see `PRODUCT.md`).

## Current status

- **Shipped:** Tabbed `admin.html` layout with per-tab pending-count badges (`FEATURE_BACKLOG.md` #2), per git history (`9e46caa`). `FEATURE_BACKLOG.md` itself was never updated to reflect this — a real drift between that file and reality, flagged as a consolidation item.
- **Open:** Splitting one editorial article into multiple events (`FEATURE_BACKLOG.md` #1).
- **Open:** Multi-day/per-day-schedule event entry (`FEATURE_BACKLOG.md` #3).
- **Open, product question not just UX:** category sub-genre drill-down (`FEATURE_BACKLOG.md` #4) — see `PRODUCT DECISION REQUIRED` in `PRODUCT.md`; most sources don't supply genre-level detail today, so real coverage would likely be thin even if built.

## Scope

The two remaining, purely-additive UX items: editorial-article multi-event splitting, and multi-day per-day-schedule event entry.

## Out of scope

Category drill-down — blocked on a product decision, tracked separately, not implemented as part of this epic until that decision is made.

## Success criteria

An editorial reviewer can produce N event records from one article when the article genuinely covers N distinct dates; a multi-day event with varying daily hours can be entered accurately in one record instead of being forced into a single date/time field.

## Architecture implications

Multi-day entry needs a data-model decision: a list of day/time-range pairs on a single event, vs. keeping the current one-date-one-time-range model and instead supporting linked "event series" for multi-day runs. Not yet decided — worth resolving before implementation starts, since it affects the schema either way.

## Dependencies

None blocking.

## Stories / tasks

Not yet broken into `BACKLOG.md` items with full acceptance criteria — should be done as part of grooming, including the multi-day data-model question above.

## Risks

Low. Main risk is under-specifying the multi-day schedule data model and having to migrate again later — worth getting Product Owner sign-off on the shape before building.

## Open questions

Multi-day event data model (per-day list on one row, vs. linked series of single-day events).

## Relevant decisions

None yet recorded specific to this epic.
