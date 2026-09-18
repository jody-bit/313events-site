-- Eastern Market After Dark, 2026-09-17 (Jody: "Why when I shared this to
-- Facebook this morning wasn't the event name and details published along
-- with it"). Investigating that led to a real routing bug fix (see
-- api/event-meta.js's own 2026-09-17 follow-up note and this same day's
-- commit renaming event.html -> event-template.html) -- but even once
-- previews work correctly, this event had no image_url at all, so a share
-- would still fall back to the generic 313.events card for the photo.
--
-- Pulled the event's own official photo from its real site
-- (easternmarketafterdark.com's og:image, a past-year crowd/stage shot
-- credited to the event itself, not a stock photo) and uploaded it via
-- api/upload-image.js.
update events
set image_url = 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/35cf409f-939d-44c3-8198-ad3e8749329e.jpg'
where id = '023ba8a6-27c6-48de-b528-f47961c09b27'; -- Eastern Market After Dark

insert into schema_migrations (filename) values ('update_2026-09-17_eastern-market-after-dark-image.sql')
on conflict (filename) do nothing;
