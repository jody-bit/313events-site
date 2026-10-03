-- Midwest Buddhist Meditation Center (MBMC), Warren MI -- first manual pull,
-- 2026-10-03. Jody asked whether events could be pulled from
-- mbmcmichigan.org; this is the one-time manual batch (see
-- INGESTION_BACKLOG.md's new "Outreach-based onboarding candidates" row,
-- added the same day, for the automated-cron candidate this was logged
-- against instead of building right away).
--
-- Source shape: plain WordPress, no events-calendar plugin, no JSON-LD, no
-- RSS/ICS feed. Every event is an ordinary blog post under
-- /uncategorized/<slug>/ with a plain-text date/time line and address in
-- the body -- no structured data to query, confirmed via WebFetch against
-- the homepage, two archive pages (/page/2/, /page/3/), and each
-- individual post.
--
-- Of ~20 posts found across the homepage and both archive pages, only
-- these two have both a stated date that is still in the future (today is
-- 2026-10-03) and enough detail to insert honestly. Everything else was
-- either already past (the venue's Sunday Market/Songkran/retreat/ceremony
-- posts go back to Feb 2025) or a bare announcement with no date stated at
-- all ("Meditation Class in English 2026", "Weekend Intensive 2026") --
-- never guessed at, left out entirely rather than inserted with an
-- invented date.
--
-- Neither event's page states a ticket price. Two of this venue's OTHER
-- (already-past) Sunday Market posts explicitly said "Members only event"
-- -- but this specific Oct 11 instance's page does not say that, so it is
-- NOT carried over here as an assumption; is_free is left false and
-- price_from null, per this project's standing rule (no price/offer shown
-- -> unknown, never assumed free or members-only).
--
-- Duplicate check: this project's usual pre-insert duplicate check queries
-- production directly, but this sandbox's network egress to Supabase is
-- blocked (same restriction documented elsewhere in this repo for
-- 313.events/supabase.co/vercel.com), and a direct REST probe attempted
-- here was refused by the fetch tool's own URL-provenance guard. Risk is
-- low regardless -- this is a brand-new source/venue never previously
-- tracked by any other connector -- but Jody should eyeball venue_name
-- for an existing near-duplicate before running this, same as any manual
-- batch.
--
-- status is 'approved', matching this project's existing manual-pull
-- convention (e.g. update_2026-09-20_ra-manual-pull-9.sql) -- change both
-- rows to 'pending_review' before running if you'd rather vet a brand-new
-- source's first entries before they go live.
insert into events (
  external_id, title, description, category, venue_name_raw,
  venue_address_raw, venue_city_raw, start_date, end_date, time_display,
  is_free, price_from, ticket_url, image_url, source, note, status
) values

('mbmc-sunday-market-2026-10-11', 'Sunday Market',
 'Community food market at the Midwest Buddhist Meditation Center featuring authentic Southeast Asian cuisine -- Thai, Lao, Cambodian, Hmong, and Vietnamese dishes including Pad Thai, papaya salad, grilled meats, mango sticky rice, and iced coffee. Family-friendly.',
 'community', 'Midwest Buddhist Meditation Center', '29750 Ryan Rd', 'Warren',
 '2026-10-11', '2026-10-11', '9:30 AM–2:00 PM', false, null,
 'https://mbmcmichigan.org/uncategorized/sunday-market-11-oct/',
 'https://mbmcmichigan.org/wp-content/uploads/2026/09/Gemini_Generated_Image_atu9pcatu9pcatu9-1024x1024.jpg',
 'Midwest Buddhist Meditation Center', null, 'approved'),

('mbmc-kathina-ceremony-2026-11-01', 'United Kathina Ceremony 2026',
 'Buddhist community ceremony honoring monks completing their three-month Rains Retreat, with the offering of Kathina robes and requisites.',
 'community', 'Midwest Buddhist Meditation Center', '29750 Ryan Rd', 'Warren',
 '2026-11-01', '2026-11-01', '10:00 AM', false, null,
 'https://mbmcmichigan.org/uncategorized/kathina-ceremony/',
 'https://mbmcmichigan.org/wp-content/uploads/2026/09/Gemini_Generated_Image_lthyrzlthyrzlthy-1024x1024.jpg',
 'Midwest Buddhist Meditation Center', null, 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  venue_address_raw = excluded.venue_address_raw,
  venue_city_raw = excluded.venue_city_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  is_free = excluded.is_free,
  price_from = excluded.price_from,
  ticket_url = excluded.ticket_url,
  image_url = excluded.image_url,
  note = excluded.note;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-10-03_mbmc-manual-pull-1.sql')
on conflict (filename) do nothing;
