-- Migration 037: categories-table metadata for 'gaming' + schema_migrations
-- entries for both this file and migration_036_gaming_category.sql.
--
-- RUN THIS ONLY AFTER migration_036_gaming_category.sql has been run BY
-- ITSELF and committed (a brand new enum value from ALTER TYPE isn't usable
-- until its own transaction has committed — see that file's header). This
-- one is safe to run as a normal multi-statement paste.
--
-- Mirrors migration_032_training_category_metadata.sql's seed row shape
-- exactly: slug matches the event_category enum value, label/color_var
-- match the CATS object entry added to index.html/calendar.html/
-- event-template.html/venue-template.html/radar.html/map.html/submit.html,
-- sort_order continues the existing 1-14 sequence as 15.
--
-- NOT YET RUN AGAINST PRODUCTION — see migration_036's own header note
-- (DEBT-002). Prepared for Jody to run by hand after migration_036.

insert into categories (slug, label, color_var, sort_order) values
  ('gaming', 'Gaming & Esports', 'var(--c-gaming)', 15)
on conflict (slug) do update set
  label = excluded.label,
  color_var = excluded.color_var,
  sort_order = excluded.sort_order;

insert into schema_migrations (filename) values
  ('migration_036_gaming_category.sql'),
  ('migration_037_gaming_category_metadata.sql')
on conflict (filename) do nothing;
