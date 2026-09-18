-- Adds the two columns api/cron-post-to-facebook.js needs to track which
-- events it has already posted to 313.events' Facebook Page, and to avoid
-- ever double-posting the same event on a later run (mirrors the
-- external_id upsert-dedupe pattern used everywhere else in this project,
-- just keyed on the events row itself rather than a source's own id).
--
-- facebook_post_id:   the id Facebook's Graph API returns for the created
--                      Page post (format "<page-id>_<post-id>") — kept for
--                      reference/debugging, not currently read by the site.
-- facebook_posted_at: null until posted; the cron's WHERE clause is
--                      `facebook_posted_at is null`, so setting this is
--                      what marks an event as "already handled."
--
-- Safe to run before Facebook is actually configured (FACEBOOK_PAGE_ID /
-- FACEBOOK_PAGE_ACCESS_TOKEN) — the cron no-ops without those env vars
-- regardless of whether these columns exist yet, but the columns need to
-- exist before the cron can be turned on, so run this now.

alter table events add column if not exists facebook_post_id text;
alter table events add column if not exists facebook_posted_at timestamptz;

-- Speeds up the cron's own query (status='approved' AND facebook_posted_at
-- IS NULL AND start_date >= today) — small table today, but cheap insurance
-- as it grows, and consistent with this project's existing indexing habits.
create index if not exists events_facebook_posted_at_idx on events (facebook_posted_at);

insert into schema_migrations (filename) values ('update_2026-09-14_facebook-auto-post.sql')
on conflict (filename) do nothing;
