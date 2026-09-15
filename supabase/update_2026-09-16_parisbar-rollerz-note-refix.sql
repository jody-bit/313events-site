-- Second occurrence of the same leak (see migration_029's header comment
-- for the full story) — the Julez and The Rollerz row's public `note` was
-- back to the internal bookkeeping text as of this fix, almost certainly
-- because update_2026-09-15_parisbar-julez-and-the-rollerz.sql got run
-- again at some point (its own on_conflict clause always resets
-- note = excluded.note, silently undoing the first note-fix). Clearing it
-- again — there's no genuine visitor-facing caveat needed for this event,
-- so null is correct. image_url is untouched; that part is fine and stays.
update events
set note = null
where id = '719165da-70b0-44c0-bb2f-86c8c7eaa6f9'
  and note = 'Image not yet attached — see cropped flyer sent in chat; upload it through the usual flyer path and set image_url once hosted.';

insert into schema_migrations (filename) values ('update_2026-09-16_parisbar-rollerz-note-refix.sql')
on conflict (filename) do nothing;
