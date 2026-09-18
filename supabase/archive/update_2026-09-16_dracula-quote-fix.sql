-- Bram Stoker's Dracula (1992) — 2026-09-16. This is the one Redford Theatre
-- row that update_2026-09-14_admin-followup-cleanup.sql's UPDATE silently
-- missed, even though the other 3 Redford Theatre rows in that same file
-- (Noir City, Fright Night Part 2, Little Mermaid Live) all took correctly.
--
-- ROOT CAUSE: an apostrophe encoding mismatch. That file matched on
-- title = 'Bram Stoker''s Dracula (1992)' using a straight apostrophe ('),
-- but the actual row in the database has a curly/typographic apostrophe (’)
-- in the title — same character Jody's admin PDF renders it with. Postgres
-- string equality is byte-exact, so the WHERE clause matched zero rows and
-- failed silently (no error, just 0 rows updated) — exactly the kind of
-- gap that's easy to miss. This file matches on start_date + venue instead
-- of the title text, so it isn't sensitive to which apostrophe character is
-- actually stored.
--
-- Safe to re-run: guarded, matched by date/venue/source rather than title.
update events
set time_display = 'Doors 6:00 PM, movie at 8:00 PM'
where start_date = '2026-10-03'
  and venue_name_raw = 'Redford Theatre'
  and source = 'Redford Theatre'
  and title ilike '%Dracula%'
  and (time_display is null or time_display = '');

insert into schema_migrations (filename) values ('update_2026-09-16_dracula-quote-fix.sql')
on conflict (filename) do nothing;
