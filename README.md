# 313 Events — Detroit Arts & Events Calendar

A comprehensive, filterable calendar of arts, culture, and nightlife events
in the City of Detroit (plus the Hamtramck and Highland Park enclaves),
modeled on ClevelandArtsEvents.com.

- `index.html` — the calendar (month view, list view, category filters, search). Reads live approved events from Supabase, falls back to a static dataset if the database is unreachable.
- `submit.html` — venue/organizer event submission form. Posts to `/api/submit`, lands in the database as `pending_review`.
- `admin.html` — moderation queue. Approve/reject pending submissions. Gated by `ADMIN_SECRET`.
- `api/submit.js` — serverless function, inserts submissions into Supabase.
- `api/admin-events.js` — serverless function powering admin.html (list pending / approve / reject).
- `api/cron-ticketmaster.js` — Vercel Cron job (see `vercel.json`), pulls live ticketed events from the Ticketmaster Discovery API and upserts them into Supabase as approved events.
- `supabase/schema.sql` — the Postgres schema (venues, events, RLS policies). Run once in the Supabase SQL editor on a fresh project.
- `supabase/seed.sql` — generated from the original hand-curated dataset; loads it into the database.

## Status

**Live product**, not a static prototype. Real database (Supabase/Postgres),
real submission pipeline with moderation, and an automated Ticketmaster feed
running on a daily cron. Hand-curated seed data came from venue sites and
event platforms (19hz.info, Paxahau, Resident Advisor, Dice, Eventbrite venue
pages, dia.org, mocadetroit.org, easternmarket.org, etc.) — see the notice
banner in index.html for full source list and known gaps (Facebook, Partiful,
and RA/Dice do not offer a public API or permit scraping under their current
Terms of Service, so those remain manual/editorial-only sources).

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
