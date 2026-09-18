-- 2026-09-04 — Jody asked us to post her friend's event on his behalf after
-- he hit the (now-fixed) "No image data received." upload bug earlier
-- tonight. Submitted through the real public /api/submit endpoint (so it
-- went through the same validation + moderation queue as any other
-- submission, flyer image included), landing as status = 'pending_review'
-- like every other submission does.
--
-- This is the one-time follow-up patch: approve it, and set two things the
-- public submit form can't collect at all —
--   1. venue_city_raw: /api/submit has no city field (unlike
--      admin-editorial.js's create_event action), so it was left blank.
--      The flyer gives the address as "16940 Hamilton Ave, Highland Park".
--   2. time_display: /api/submit's startTime is a single <input type=time>
--      value ("11:00 PM" — not a range), so it can't express "till late"
--      the way the flyer says it. This corrects the display string to match
--      the flyer exactly, without inventing a specific end hour we weren't
--      given.
--
-- Also worth knowing: contactEmail was submitted as Jody's own email
-- (hellojody@gmail.com) as a placeholder, since we don't have the friend's
-- real contact info — Jody may want to update that field once she has it,
-- so it's not permanently misattributed to her. Admission was left as the
-- form's default ("Free") since neither the flyer nor the caption specified
-- a price — worth double-checking with the friend and updating price/
-- admission here too if there's a cover charge.
--
-- 2026-09-05 — resent: the event got approved in the meantime (through the
-- admin queue's Approve button, not this script), so it was already
-- status = 'approved' by the time this ran — the original `and status =
-- 'pending_review'` guard would have matched zero rows. Dropped that guard
-- (matching on the title alone is safe — it's specific enough not to hit
-- anything else) so this still applies the two fields the manual approval
-- never touched: time_display and venue_city_raw.

update events
set
  status = 'approved',
  time_display = '11:00 PM till late',
  venue_city_raw = 'Highland Park'
where title = 'STD x 313.electronics: Warehouse Party at The Vault';
