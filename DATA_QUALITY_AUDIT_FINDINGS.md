# Production Data Quality Audit — findings intake

Findings recorded here are INPUTS to the Production Data Quality Audit (the
next major priority after the Calendar/Map reconciliation). Each entry says
what was observed, where, and why it matters; none is fixed by being listed.

## DQA-001 — Map's start_date floor can omit long-running events

- **Observed:** 2026-10-05, while reviewing the Calendar/Map Discovery migration (branch `claude/calendar-map-shared-layer-repcmh`); first seen by the cloud session that built it.
- **Where:** `map.html`, `loadSupabaseEvents()` / `loadFloorISO()`. The events request is `events?status=eq.approved&start_date=gte.<today − 8 days>&…`.
- **Defect:** the floor filters on `start_date` only. An event that began before the floor but is still running (a season-long exhibition, a multi-week run, a market that started in August) has `start_date < floor` and is never loaded, so it is absent from the map even though Discovery's own definition of "current + upcoming" includes it (`Discovery.inventoryFilter()`: `start_date >= today OR end_date >= today`).
- **Not a Discovery problem:** `Discovery.matches()` handles these events correctly; they simply never reach the page.
- **Contrast:** the homepage already uses the right filter (`or=(start_date.gte.<floor>,end_date.gte.<today>)` against `events_public`). Calendar has no floor at all (it loads all history, paged).
- **Why it matters:** the map under-counts the live inventory relative to the homepage and Calendar for exactly the long-running events most likely to be listed once and forgotten.
- **For the audit to quantify:** how many approved events today have `start_date < today − 8` and `end_date >= today`, by source and category; and whether Map's totals differ from the homepage's for the same filters.
- **Likely remedy (NOT applied):** `Discovery.inventoryFilter()` in the request, or the homepage's `or=` form. Deferred to the audit so the fix lands once, with the data it affects counted first.

## Related observations from the same review (for the audit's scope, not defects in themselves)

- **Calendar/Map cannot filter by neighborhood or "On the Radar"** — they read the `events` table, which has no neighborhood field. Moving them to `events_public` also needs venue `lat`/`lng` exposed there (see the reconciliation report): the view currently carries neither, and both pages' precise-pin path depends on them.
