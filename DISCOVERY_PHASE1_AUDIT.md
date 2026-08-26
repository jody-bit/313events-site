# Discovery Shell Phase 1 — Audit & Architecture

Written in response to the "313.events UI Transformation — Phase 1" brief. Per that brief's own requested process (audit → report → data-model gaps → proposed architecture → immediate-vs-blocked → then implement), this document covers steps 1–5. Nothing described here has been built yet — this is the audit and plan, for review before implementation starts.

## 1. What exists today

**Homepage structure.** `index.html` is a single page: a header (wordmark + tagline + "Submit an Event" CTA + link to `sources.html`), a static "what this is" notice box, a controls bar (prev/next month, a text search box, a Month/List view toggle), a category filter-chip row built dynamically from the `CATS` object, then either the month grid or the list view, then a day-detail panel that opens below the calendar when a date is clicked, then a footer. There is no hero section beyond the header — the "empty space" problem the brief describes is really the header's generous padding/margins plus the calendar's `min-height:112px` cells combined with the notice box, not a distinct hero block that can just be deleted.

**Calendar implementation.** Vanilla JS, no framework. `renderMonth()` builds a 7-column CSS grid; each `.day-cell` shows a day number and up to 3 "pill" rows (colored dot + truncated title) with a "+N more" overflow link, plus a `hasEvents` class that adds a small chartreuse dot on mobile (≤720px) where pills are hidden entirely. Clicking a day opens `#dayPanel` with the full event list for that date. A separate `renderList()` builds a month-at-a-glance list view. Both pull from the same `byDate` index built off a single `EVENTS` array.

**Month navigation range.** `MIN_MONTH`/`MAX_MONTH` currently cap navigation to 12 months before and 12 months after the current month (`prevBtn`/`nextBtn` disable at those bounds) — not literally unlimited, but a full year of history is already reachable today. No dates are hidden, faded-as-disabled, or stripped from history; this already roughly satisfies "historical navigation is intentional," though the exact ±12-month bound is a design choice worth revisiting if you want deeper history.

**Event data model (`schema.sql`).** Two tables: `venues` (name, address, city — free text defaulting to `'Detroit'`, website, lat, lng) and `events` (title, description, category, `venue_id` FK, `venue_name_raw` free-text fallback, dates, price, ticket/image URLs, `source`, `status`, submitter fields, `external_id` for upsert dedup). Migration 002 added a 39-row Detroit-only `neighborhoods` table plus `venues.neighborhood_id`. Migration 005 added `venues.zip_code`, a `neighborhood_confidence` enum, and an `events.neighborhood_id` *exception path* for events with no venue row to inherit from. Migration 006 added `events.venue_city_raw` (this past week, for the Ticketmaster radius expansion).

**The load-bearing gap: `events.venue_id` is never populated.** Every single cron (`cron-ticketmaster.js`, `cron-wdet.js`, `cron-metrotimes.js`, all the venue-specific crons) writes `venue_name_raw` as a free-text string directly onto the event row — none of them look up or create a `venues` row and attach `venue_id`. Migration 005's own header comment calls this out explicitly as the prerequisite neighborhood filtering needs and hasn't gotten. Practically: the `venues` table exists, has 20-some rows seeded once by hand (`seed.sql`, name + city only, no lat/lng, no zip), and is disconnected from the live event pipeline entirely. `venues.lat`/`venues.lng`/`venues.zip_code` are schema columns with essentially no populated data behind them anywhere in the project right now.

**Location/city data that *does* exist at the event level:** `events.venue_city_raw`, free text, populated only by the Ticketmaster cron (the one source that spans multiple cities today), NULL everywhere else (meaning "assume Detroit"). No ZIP, no lat/lng, no province/state field, no country field at the event level.

**Detroit neighborhoods.** Real data (39 neighborhoods, `migration_002`), but only reachable via `venues.neighborhood_id`, which requires the broken `venue_id` join above. In practice, neighborhood is not currently derivable for any automated event, only for the handful of hand-seeded/manual rows where someone set it directly.

**Canadian geography.** Not represented anywhere in the schema or code. `SERVICE_AREA.md` documents that Windsor, Chatham, and Sarnia (Ontario) fall inside the 75-mile radius, but there's no country/province field, no postal-code format handling, nothing Ticketmaster-specific either (its `city.name` field would just come back as "Windsor" with no country marker).

**Geographic filtering:** does not exist today, in any form. The only "geographic" behavior in the whole product is the Ticketmaster cron's `latlong`+`radius` server-side search params (radius search at ingestion time, not a user-facing filter) and the front-end's cosmetic suppression of "Detroit" as a city label. There is no user control that narrows results by place.

**Search implementation.** One text input (`#search`), filtering client-side against `title` and `venue` substrings only (`matchesFilters()`), re-run on every keystroke via a plain `input` event listener. No location awareness, no debounce (fine at current data volumes), no separate "search vs. location" distinction to worry about yet since only one exists.

**URL/query parameters:** none. No `URLSearchParams`, no `history.pushState`, no read of `location.search` anywhere in `index.html`. Every piece of state (current month, active categories, free-only, search text, month/list toggle) lives in in-memory JS variables and resets on reload.

**Responsive behavior:** exactly one breakpoint, `@media (max-width:720px)`, which shrinks day-cell height, hides pills entirely (leaving just the dot), and lets the month label shrink. There is no distinct tablet treatment and no mobile-specific interaction pattern beyond that.

**Filtering architecture:** category chips (multi-select, all active by default) + a free-only toggle + the text search, combined by a single `matchesFilters()` predicate, applied uniformly across month grid, list view, and day panel. This is a clean, small surface to extend — new filter dimensions (time-of-day shortcuts, location, radius) can plug into the same predicate function without restructuring it.

**Browser geolocation:** not implemented anywhere.

## 2. Data-model changes required for predictive location search + radius

Two different problems are tangled together in the brief, worth separating clearly:

**(A) Building a location *reference* dataset (for autocomplete: "type CORK → suggest Corktown").** This does *not* require geocoding every venue or every event. The 75-mile service area is a fixed, already-enumerated, small universe — `SERVICE_AREA.md` already lists ~30 named cities/townships plus Windsor/Chatham/Sarnia, and `neighborhoods` already has Detroit's 39 named areas. A static reference table (city/neighborhood name, type, state-or-province, country, and a hand-sourced lat/lng centroid) covers autocomplete entirely on its own, with no external geocoding API, no per-venue backfill, and no ongoing cost. This is buildable now.

**(B) Actually filtering *events* by radius from a chosen location.** This needs every event to carry (or be joinable to) real coordinates or at least a real city, which is where the `venue_id` gap bites. Two tiers of precision are honestly available today:

- *City-level radius* (e.g., "within 25 mi of Ann Arbor") is achievable now, without new backfill work, by matching `events.venue_city_raw` (falling back to `'Detroit'` when null) against the reference table from (A) and computing haversine distance from each city's centroid. This covers the Ticketmaster-sourced events (the ones that actually span multiple cities) reasonably honestly.
- *Neighborhood-level or venue-level radius* (e.g., "within 2 mi of Corktown," or genuinely precise distances for anything that isn't Ticketmaster) is **not** reliably possible without finally closing the `venue_id` gap — looking up or creating a `venues` row per unique venue name and attaching real lat/lng, then having every cron populate `venue_id` going forward. That's a real, separate project (flagged already in `FOUNDATIONAL_ITEMS.md`), not a Phase 1 task.

Recommended Phase 1 data-model additions (small, additive, no destructive changes):

1. A new static reference table (or a versioned JSON file shipped with the site, simplest option — no new Supabase table required to start) of ~35–45 locations: Detroit's 39 neighborhoods + the ~30 cities from `SERVICE_AREA.md` + Windsor/Chatham/Sarnia, each with `{name, type: 'neighborhood'|'city', state_or_province, country, lat, lng}`. This is hand-curated once, not scraped or geocoded live.
2. No schema migration strictly required for Phase 1 if (1) ships as a static asset — `venues.lat`/`lng`/`zip_code` stay as-is, unused for now, ready for the real venue-linking project later.
3. Document (not yet implement) that ZIP-code-level and true venue-level radius are explicitly Phase 2, gated on the `venue_id` backfill.

## 3. Proposed Phase 1 architecture

**Discovery bar** (new, sits above the existing `.controls` bar, doesn't replace month/list navigation):
`[ NOW ] [ TODAY ] [ TONIGHT ] [ THIS WEEKEND ] [ DATE ▾ ]` as one button group, each mapping to a date range applied through the existing `matchesFilters()`/`byDate` machinery — no parallel data path. `DATE` opens the existing month calendar rather than duplicating a picker.

**Location control** (new): a combobox next to the discovery bar — `[ LOCATION: Search city, ZIP, neighborhood... ] [ USE MY LOCATION ]`, backed by the static reference table from §2(A) for suggestions, each result labeled with its type (`NEIGHBORHOOD · DETROIT`, `CITY · ONTARIO`, etc.) per the brief's example. Selecting a result sets an origin point; "USE MY LOCATION" requests `navigator.geolocation` only on click (never on load), with a plain-language explanation and a graceful denied-permission fallback (silently keep the text box available).

**Radius control** (new): a `5 / 10 / 25 / 50 / 75 / ALL` chip group, disabled/hidden until a location is chosen, applying the city-level haversine filter from §2(B) against `venue_city_raw`. Clearly scoped in the UI copy as city-level (not "within 2 miles of this exact venue") so it doesn't overstate precision it doesn't have.

**Active-filter tray**: a single visible row summarizing everything currently applied (e.g. `TONIGHT · CORKTOWN · 10 MI · MUSIC`), each chip removable individually, plus a `CLEAR ALL`. Replaces/extends the existing lone "Reset filters" chip.

**Calendar cell density**: add an event-count line to `.day-cell` (`● 18 EVENTS`) above the existing pills, keep the pill list and "+N more" as-is, keep `.hasEvents` dot for the mobile collapsed view. `.day-cell.today` already has a distinct background + chartreuse ring — add an explicit `● TODAY` text label so it reads clearly even in list/print contexts, not just the grid.

**Initial-viewport density**: tighten `header.site` bottom padding/margin, fold the static "what this is" notice into a smaller, collapsible or less vertically-heavy treatment (it's currently a full-width paragraph block pushing the calendar down), and pull the new discovery bar into that reclaimed space rather than adding it as pure extra height.

**URL state**: adopt `URLSearchParams` for `date`, `view` (month/list), `cats`, `q`, and — once §2 ships — `loc`/`radius`. Read on load, write via `history.replaceState` on change (not `pushState` for every keystroke) so back/forward stays sane and links stay shareable, per the brief's own "don't create unreadable/unstable URLs" caution.

**Responsive**: collapse the desktop discovery bar into a `WHEN / WHERE / FILTER` three-button mobile bar (each opens a full-width sheet/panel showing current selection), rather than shrinking the same row — matches the brief's explicit instruction not to just squeeze it.

**View-mode architecture**: keep Month/List, structure the view-toggle component so a third `MAP` button can be added later without a rewrite (i.e., don't hard-code "two views" anywhere) — no map is being built now.

## 4. Immediate vs. blocked

**Buildable now, no data dependencies:**
- Initial-viewport density fix (header/notice/spacing)
- Calendar cell info density (event count, `● TODAY` label)
- Time-shortcut bar (NOW/TODAY/TONIGHT/THIS WEEKEND/DATE) — pure date-range logic over existing data
- Active-filter tray + CLEAR ALL
- URL state for date/view/category/search
- Responsive discovery-bar shell (WHEN/WHERE/FILTER on mobile)
- Empty-results messaging with expand-radius/change-date/clear actions
- Accessibility pass on the new controls (keyboard nav, ARIA combobox semantics)

**Buildable now, with the static reference dataset from §2(A) (no backend/schema changes):**
- Predictive location search + typed result labeling
- "USE MY LOCATION" browser geolocation, gated on explicit click
- City-level radius filtering (honest about its precision limits, applied via `venue_city_raw`)

**Blocked on a separate, larger data project (not Phase 1):**
- Venue- or neighborhood-precise radius filtering (needs the `venue_id` backfill + real per-venue lat/lng — flagged in `FOUNDATIONAL_ITEMS.md` already)
- ZIP/postal-code-level filtering (no event or venue currently carries one reliably)
- MAP view (no geographic precision to plot yet beyond city centroids)

## 5. Recommended build order

1. Viewport density + calendar info density + TODAY/past treatment (fast, visible, zero risk to existing data).
2. Time-shortcut bar + active-filter tray + CLEAR ALL + URL state (still zero geo-data dependency).
3. Static location reference dataset + predictive search + city-level radius + "use my location" (the one chunk that needs new (but static, hand-curated) data).
4. Responsive discovery-bar restructuring + accessibility pass across everything above.

Steps 1–2 alone would already visibly transform the homepage and satisfy most of the brief's "success test" questions except the location ones. Step 3 is the one piece worth a deliberate go/no-go before starting, since it's the newest kind of data this project would be introducing.
