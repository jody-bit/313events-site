-- Root-cause fix for a mistake this project has now made twice: writing
-- internal admin bookkeeping ("still need to upload the flyer", "confirm
-- this venue address") into the `note` column, not realizing event.html
-- renders `note` directly on the live public event page (`.evt-detail-note`
-- div) — first caught on Paris Bar's Industry Mondays listing, then again
-- on Julez and The Rollerz (twice: once directly, and a second time when
-- an old insert file got re-run and silently overwrote the cleared note
-- back to the bad text via its own `on conflict ... do update set
-- note = excluded.note`).
--
-- `note` was never meant to be internal-only — it has genuine public uses
-- (e.g. "Ticket sales had already ended for this date" on the Elmwood
-- trolley tour, or the long-span caveats on Solstice Pool Party / BandaTon
-- day party) — so this doesn't touch it or its behavior. It adds a
-- separate, genuinely admin-only column for exactly the internal-bookkeeping
-- case that kept landing in the wrong place: nothing public-facing reads
-- this column (not events_public, not event.html), so there's now a safe
-- place for "still need to do X" notes that can never leak onto a live
-- page no matter how many times a file gets re-run.
alter table events add column if not exists internal_note text;

comment on column events.note is
  'PUBLIC-FACING. Rendered directly on the live event page (event.html''s .evt-detail-note). Only ever a genuine visitor-facing caveat (e.g. "tickets already sold out for this date") — never internal bookkeeping. See internal_note for that.';

comment on column events.internal_note is
  'Admin-only. Never selected by events_public or rendered anywhere public — the correct place for bookkeeping like "flyer not yet uploaded" or "confirm this address" that must never appear on a live event page.';

insert into schema_migrations (filename) values ('migration_029_internal_note.sql')
on conflict (filename) do nothing;
