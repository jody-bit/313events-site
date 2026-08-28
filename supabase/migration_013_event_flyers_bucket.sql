-- Migration 013: Storage bucket for submitted event flyer/photo uploads
--
-- Context: submit.html's "Image URL" field was a plain text box — the only
-- way to attach a photo was to already have it hosted somewhere else and
-- paste a link. In practice, submitters (Jody: "there was no option to
-- upload an image when it was input into the system") pasted whatever link
-- they had on hand — a Google Drive/Photos share link, an Instagram or
-- Facebook post URL, a Dropbox preview page — all of which serve an HTML
-- page that *displays* an image, not the raw image bytes, so event.html's
-- <img src="..."> could never actually load them. This migration creates
-- the Storage bucket that submit.html's new file-upload field needs so
-- people can attach a real flyer/photo directly, instead of hoping they
-- already have a direct-image-link somewhere.
--
-- Uploads themselves go through api/upload-image.js using the SERVICE ROLE
-- key (server-side only) rather than granting the anon key its own storage
-- write policy — same reasoning as api/submit.js already uses the service
-- role for the events table insert: it keeps every upload going through
-- this project's own size/type checks (5MB, JPG/PNG/WEBP/GIF only) instead
-- of anyone who finds the public anon key being able to write arbitrary
-- files straight into the bucket. Because the service role bypasses RLS
-- entirely, no storage.objects RLS policy is needed for the upload side.
--
-- Setting public=true on the bucket is what makes the resulting
-- .../storage/v1/object/public/event-flyers/<file> URL loadable by anyone
-- (the site's visitors, search engine crawlers, social share unfurlers)
-- without a signed URL or auth token — the same anonymous-read model as
-- every other flyer/photo on the site. Run once in Supabase's SQL Editor;
-- safe to re-run (upserts by bucket id).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-flyers',
  'event-flyers',
  true,
  4194304, -- 4MB, matches MAX_BYTES in api/upload-image.js (kept under Vercel's
           -- own ~4.5MB request body ceiling — see that file's comment)
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
