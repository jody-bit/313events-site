# 313.events — Redesign Audit & Architecture

Per the brief's own process (§55–58): audit first, then design architecture, then homepage, then core entity pages. This document is that audit + the proposed architecture. No homepage code has been written yet — this is the checkpoint before that starts.

> **Scope-change note (2026-08-24):** everything below was written when the site's coverage area was the City of Detroit plus the Hamtramck and Highland Park enclaves. As of this date the service area is a 75-mile radius from Detroit, matching the Census-defined regional radius (see `SERVICE_AREA.md`). That doesn't change the architecture below, but it does mean any future "neighborhood" or geography-scoped module needs to account for a much larger, multi-county, cross-state, and cross-border footprint rather than Detroit's ~39 neighborhoods alone — see the matching note in `FOUNDATIONAL_ITEMS.md`.

---

## A. Current technology stack

- Static HTML / CSS / vanilla JS. No framework, no bundler, no build step, no npm dependencies.
- Four pages: `index.html` (calendar, currently the homepage), `submit.html`, `admin.html`, `sources.html`.
- Hosting: Vercel, with Vercel Serverless Functions (`/api/*.js`, Node/CommonJS) and Vercel Cron.
- Data: Supabase Postgres via PostgREST. Public reads use the new-style `sb_publishable_...` key client-side; writes from cron/admin use the `service_role` key server-side only, never shipped to the browser.
- Google Analytics (`gtag.js`).
- Detroit Signal V2 design tokens (CSS custom properties: asphalt/warm-white/chartreuse, Archivo Narrow + Inter + Space Mono) are already applied across all four pages as of the last session.

## B. Existing routes

Only the four static pages above. **No per-entity URLs exist** — no `/events/:id`, `/venues/:id`, `/organizers/:id`, `/neighborhoods/:slug`. Clicking a calendar day expands an inline panel on the same page; it is not a shareable, indexable page.

## C. Existing product functionality

- Month/List calendar of events, rendered client-side from live Supabase `approved` rows (falls back to a static `FALLBACK_EVENTS` array if the fetch fails).
- Category filter chips (multi-select, all-on by default), Free-only toggle, text search, month navigation.
- Inline day panel (not a dedicated page).
- Event submission (`submit.html` → `POST /api/submit` → Supabase row at `status='pending_review'`).
- Admin moderation queue (`admin.html`, gated by `ADMIN_SECRET` header) → approve/reject.
- Four automated ingestion crons (Ticketmaster Discovery API, WDET's public REST API, HALO Detroit scrape, Trinosophes scrape) upserting into Supabase daily.
- `sources.html` — a public transparency page listing every data source and its real connection status. This is a genuine differentiator worth keeping.

## D. Current data model (Supabase)

```
venues(id, name, address, city, website, lat, lng, created_at)
events(id, title, description, category[enum], venue_id, venue_name_raw,
       start_date, end_date, time_display, is_recurring, is_free, price_from,
       ticket_url, image_url, source, note, status[enum], submitter_org_name,
       submitter_email, external_id, created_at, updated_at)
```

Notable gaps against the brief:
- **No `organizers` table at all.** Organizer profile pages (§21–22) have nothing to read from yet.
- **No neighborhood field anywhere** (not on venues, not on events). Neighborhood discovery (§23) is currently unbuildable from real data.
- `venues.lat/lng` already exist — genuinely map-ready (§24) once neighborhoods are figured out.
- `time_display` is a loose human string (`"7:00–9:00 PM"`), not a structured time column — reliable "happening in the next 3 hours" logic (§14) would need a real `start_time` column; today it can only be approximated by parsing that string.
- `events.image_url` exists (single field) — real artwork works today; falls back to placeholder when empty.

## E–F. What must be preserved

Everything in C is real, working, production functionality feeding a live site — none of it gets casually replaced:
- Live Supabase read with the fallback-data safety net
- The full submission → moderation → approval pipeline
- All four cron jobs and their upsert/dedupe logic
- SEO/OG tags, favicons, manifest (already wired to the new brand assets)
- Google Analytics
- `sources.html`

## G. Technical risks

1. **No entity routing today.** Real venue/organizer/event permalinks are the single largest net-new engineering lift here — not a visual reskin. Given the zero-build-step architecture, the lowest-risk path is new Vercel serverless functions that server-render simple HTML per entity (same CommonJS pattern already used for `/api/*.js`), rather than introducing a frontend framework.
2. **No organizers table.** Needs a schema migration, and — more importantly — a real population strategy. None of the four existing cron sources currently extract an organizer as a distinct entity (Ticketmaster/WDET/HALO/Trinosophes give you a venue and a title, not "who's presenting it"). Initial data would likely need to be hand-curated, the same way the original 187-event seed set was.
3. **No neighborhood field.** Needs a schema addition + backfill for existing venues, and none of the cron sources emit a Detroit neighborhood directly — this would need a hand-maintained venue → neighborhood lookup, at least at first.
4. **Photography licensing is real and must be respected.** Of the 7 "free Detroit selects," 4 require visible attribution (CC BY / CC BY‑SA) and 2 of those are ShareAlike. Any page that uses them needs a visible credit line — this can't be silently dropped for a cleaner layout. The 3 hero candidates are the user's own photography (copyright Jody Tyree) — no rights issue there.

## H. Redesign opportunities

- Real hero photography now exists — three candidates (A "Scale," B "Presence," C "Balance"), all Movement-Festival-at-Hart-Plaza crowd shots with the RenCen skyline, desktop + mobile crops, zero rights issues. Finally unblocks §11–12.
- The full atmospheric/brand kit is complete and ready: Signal, wordmark (both light-surface and dark-surface orientations), Signal Dot Field, noise texture, scan lines — nothing left to fabricate.
- The existing category-chip filter bar can evolve into the brief's NOW/TODAY/TONIGHT/WEEKEND time navigation (§14) with moderate JS changes and **no schema change**, by best-effort parsing `start_date` + `time_display`.
- `sources.html` already *is* the kind of transparent, editorial "city-signal module" the brief gestures at in §9(K) — worth surfacing more prominently rather than rebuilding.

## I. Missing data required by the full brief

- `organizers` table + relation from `events` (net-new, needs a population plan)
- `neighborhood` field on `venues` (net-new, needs backfill)
- Structured `start_time` (nice-to-have; NOW/TONIGHT can ship without it, just less precisely)
- Venue photography field (venues currently have no image at all)

## J. Proposed implementation sequence

1. **Audit + architecture** — this document. ✅
2. **Design tokens + asset sync** — mostly done. All net-new assets (Signal, wordmark-reversed, noise texture, scan lines, hero photography, free-selects library + rights ledger) are now copied into `/assets`. Nothing fabricated, nothing recreated.
3. **Homepage v1**, scoped to what the *current* data model actually supports:
   - Header/nav using the real wordmark; Events / Venues / Organizers / Neighborhoods as nav items, with Venues/Organizers/Neighborhoods routed into filtered calendar views for now rather than dead links, since their dedicated pages need data that doesn't exist yet
   - Hero: real photography + a live "N things happening today" count computed from Supabase (never fabricated, per §11)
   - NOW / TODAY / TONIGHT / TOMORROW / THIS WEEKEND time navigation, best-effort from existing fields
   - Category discovery, a featured/high-signal module, an upcoming/weekend rail
   - The existing month/list calendar becomes a secondary "full calendar" view, not the homepage root
   - Footer
   - **Not included yet:** neighborhood, venue, and organizer homepage modules — there's no real data to populate them with, and the brief explicitly says not to fabricate activity data (§42) or invent geography (§24)
4. **Phase 2 (needs your decision first):** the `organizers` + `neighborhood` schema migration and a real population plan, then venue/organizer/neighborhood profile pages and their homepage modules
5. **Phase 3:** event detail pages with dynamic per-event OG cards (server-rendered)
6. **Phase 4:** search as its own experience, filter expansion, map (once neighborhood/geo data exists)

---

### Open question before Homepage v1 starts

Building the full homepage hierarchy in §9 well means having organizers and neighborhoods to point to. Right now those don't exist as real data. I'd rather flag that than quietly invent placeholder organizations or neighborhoods to make the homepage look more populated than the product actually is — that's exactly what §42 and §59 say not to do.
