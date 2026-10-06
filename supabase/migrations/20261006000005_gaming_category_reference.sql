-- 20261006000005_gaming_category_reference.sql
--
-- BUG-008, part 2: the `categories` reference row for `gaming`, matching the
-- label/colour the application already uses (submit.html CATS, --c-gaming).
-- Run after 20261006000004_gaming_category.sql has committed. Idempotent.
insert into categories (slug, label, color_var, sort_order) values
  ('gaming', 'Gaming & Esports', 'var(--c-gaming)', 15)
on conflict (slug) do update set
  label = excluded.label, color_var = excluded.color_var, sort_order = excluded.sort_order;
