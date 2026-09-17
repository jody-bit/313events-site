-- Bikini Kill @ Royal Oak Music Theatre, 2026-09-17 (Jody: "let's post this
-- picture from the Royal Oak Music Theater last night of Bikini Kill").
-- Uploaded via api/upload-image.js (curl'd directly from Jody's own machine,
-- since 313.events isn't reachable from either sandbox's network allowlist --
-- see that day's notes). Image had no source attribution to preserve; it's
-- Jody's own photo from the show.
update events
set image_url = 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/ef529bec-fb09-4004-90ac-256951fbda29.jpg'
where id = '956a8c8b-d4c9-42d2-a351-6dd345ae21cb'; -- Bikini Kill @ Royal Oak Music Theatre

insert into schema_migrations (filename) values ('update_2026-09-17_bikini-kill-image.sql')
on conflict (filename) do nothing;
