-- Attach the cropped flyer image to Julez and The Rollerz @ Paris Bar.
-- update_2026-09-15_parisbar-julez-and-the-rollerz.sql inserted this row
-- with image_url left null (no working upload path in that session — see
-- that file's own header comment). Jody uploaded the cropped flyer herself
-- via one curl to api/upload-image.js and got back a real Supabase Storage
-- URL; this just attaches it to the existing row.
update events
set image_url = 'https://afvyfjfqukptnfmgshzn.supabase.co/storage/v1/object/public/event-flyers/a22c9e96-f95e-425e-a380-fb58f0217360.png'
where external_id = 'ig-DcMvYQdDn16';

insert into schema_migrations (filename) values ('update_2026-09-16_parisbar-rollerz-image-url.sql')
on conflict (filename) do nothing;
