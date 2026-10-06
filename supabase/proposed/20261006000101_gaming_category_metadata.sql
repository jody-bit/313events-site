-- PROPOSED — NOT APPLIED TO PRODUCTION (BUG-008). Run after
-- 20261006000100_gaming_category.sql has committed. Same content as migration_037.
insert into categories (slug, label, color_var, sort_order) values
  ('gaming', 'Gaming & Esports', 'var(--c-gaming)', 15)
on conflict (slug) do update set
  label = excluded.label, color_var = excluded.color_var, sort_order = excluded.sort_order;
