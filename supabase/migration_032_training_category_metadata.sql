-- Migration 032: categories-table metadata for 'training' + schema_migrations
-- entries for both this file and migration_031_training_category.sql.
--
-- RUN THIS ONLY AFTER migration_031_training_category.sql has been run BY
-- ITSELF and committed (a brand new enum value from ALTER TYPE isn't usable
-- until its own transaction has committed — see that file's header). This
-- one is safe to run as a normal multi-statement paste.
--
-- Mirrors migration_026_categories_table.sql's seed row shape exactly:
-- slug matches the event_category enum value, label/color_var match the
-- CATS object entry added to index.html/calendar.html/event-template.html/
-- venue-template.html/radar.html/map.html/submit.html, sort_order continues
-- the existing 1-13 sequence as 14.

insert into categories (slug, label, color_var, sort_order) values
  ('training', 'Classes & Training', 'var(--c-training)', 14)
on conflict (slug) do update set
  label = excluded.label,
  color_var = excluded.color_var,
  sort_order = excluded.sort_order;

insert into schema_migrations (filename) values
  ('migration_031_training_category.sql'),
  ('migration_032_training_category_metadata.sql')
on conflict (filename) do nothing;
