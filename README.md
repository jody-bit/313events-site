# 313 Events — Detroit Arts & Events Calendar

A comprehensive, filterable calendar of arts, culture, and nightlife events
in the City of Detroit (plus the Hamtramck and Highland Park enclaves),
modeled on ClevelandArtsEvents.com.

- `index.html` — the calendar (month view, list view, category filters, search). Reads live approved events from Supabase, falls back to a static dataset if the database is unreachable.
- `submit.html` — venue/organizer event submission form. Posts to `/api/submit`, lands in the database as `pending_review`.
- `admin.html` — moderation queue. Approve/reject pending submissions. Gated by `ADMIN_SECRET`.
- `api/submit.js` — serverless function, inserts submissions into Supabase.
- `api/admin-events.js` — serverless function powering admin.html (list pending / approve / reject).
- `api/cron-ticketmaster.js` — Vercel Cron job (see `vercel.json`), pulls live ticketed events from the Ticketmaster Discovery API (this also covers TicketWeb, Front Gate, MoshTix, and Universe — sub-brands the Discovery API includes, e.g. Garden Theater) and upserts them into Supabase as approved events.
- `api/cron-trinosophes.js` — Vercel Cron job, scrapes trinosophes.com's own events page (no API/structured data available) and upserts parsed shows. Best-effort text parsing — verify its first real run against the live site before trusting it long-term.
- `api/cron-wdet.js` — Vercel Cron job, pulls from WDET's real public JSON REST API (`wdet.org/wp-json/tribe/events/v1/events`, the standard WordPress "The Events Calendar" plugin endpoint). Includes WDET's own programming plus community/partner events at other Detroit venues; filters out WDET Travel's international trip listings. Verified live before building, high confidence.
- `api/cron-halo.js` — Vercel Cron job, scrapes HALO Detroit's own events page (thehalodetroit.com/currentevents — robots.txt places no restriction on it). Text parser built from a confirmed literal line-by-line dump of a real event block, not guessed — moderate-high confidence, but spot check the first real run since it's still HTML scraping of a Wix site.
- `supabase/schema.sql` — the Postgres schema (venues, events, RLS policies). Run once in the Supabase SQL editor on a fresh project.
- `supabase/seed.sql` — generated from the original hand-curated dataset; loads it into the database.

## Status

**Live product**, not a static prototype. Real database (Supabase/Postgres),
real submission pipeline with moderation, and automated feeds (Ticketmaster
Discovery API, WDET's public events API, Trinosophes' own site, HALO
Detroit's own site) running on daily crons. Hand-curated seed data came from
venue sites and event platforms (19hz.info, Paxahau, Resident Advisor, Dice,
Eventbrite venue pages, dia.org, mocadetroit.org, easternmarket.org, etc.) —
see the notice banner in index.html for full source list and known gaps.

**Sources ruled out for automation** (checked their Terms of Service or API
availability directly — see chat history for the research): Resident Advisor,
Dice, and AXS (Masonic Temple, The Fillmore Detroit, Majestic Theatre, Magic
Stick, Cliff Bell's, El Club, Music Hall Detroit, PJ's Lager House) all
explicitly prohibit automated scraping in their Terms of Use and have no
public events API — manual/editorial-only. Eventbrite's public search API
was deprecated in 2020; its current API only lets an organizer read their
own events with their own login, so Comedy Bar Detroit, Garden Theater's
Eventbrite listings, Planet Ant Theatre, and New Dodge Lounge aren't
programmatically reachable through Eventbrite either. Facebook has no public
events API. Two venue sites (Detroit House of Comedy, The Congregation
Detroit) explicitly block AI/Claude crawlers in robots.txt — not scraped, by
design.

## One-time setup (Supabase + Vercel)

1. Create a free Supabase project at supabase.com.
2. In the Supabase SQL Editor, run `supabase/schema.sql`, then `supabase/seed.sql`.
3. In Supabase → Project Settings → API, copy the Project URL and the `anon` `public` key. Paste them into the `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants near the bottom of `index.html`.
4. In Supabase → Project Settings → API, copy the `service_role` key (secret — never put this in a front-end file). In Vercel → Project → Settings → Environment Variables, add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_SECRET` — any password you choose, used to log into `/admin.html`
   - `TICKETMASTER_API_KEY` — from developer.ticketmaster.com
   - `CRON_SECRET` — any random string; Vercel automatically authenticates its own cron calls with it once set
5. Redeploy on Vercel so the new environment variables take effect.

## Deploying

Static HTML + Vercel serverless functions, no build step. Deploys as-is to
Vercel (required for `/api/*` functions and Cron Jobs to work — Netlify/GitHub
Pages/Cloudflare Pages would need their own equivalents reimplemented).
