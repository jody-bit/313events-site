-- One-time cleanup, 2026-09-16, alongside the cron-redford-theatre.js
-- parser rewrite (see that commit's message for the full story).
--
-- Three specific rows are stale leftovers from the OLD parser and will
-- never be touched by the new one, because the new parser generates a
-- different external_id for the same real event:
--
-- 1 & 2) Two titles still carry an undecoded "&#038;" (WordPress's numeric
--    entity for "&") even though decodeEntities() has handled that entity
--    for a while now -- these two rows predate that fix and were never
--    re-upserted since, because their external_id is derived from the
--    (broken) title text itself, so the properly-decoded version the cron
--    produces now lands as a DIFFERENT row rather than overwriting this one.
-- 3) One row's title is literally "Sat., Dec. 12 at 8:00PM & Sun., Dec. 13
--    at 2:00 PM. Tickets: $7" -- a date/price line, not a real title. The
--    old parser didn't recognize an abbreviated weekday ("Sat.,") as a date
--    line, so it fell through and got treated as page text, overwriting
--    the pendingTitle variable that should have carried "White Christmas
--    (1954)" into the next real event. The new parser handles abbreviated
--    weekdays correctly, so a fresh, correctly-titled row already exists
--    once the cron next runs.
--
-- Deleting by exact id (not by title/date match) so this can't accidentally
-- catch anything else -- verified each of these three against a live query
-- immediately before writing this file.
delete from events where id in (
  '4d2a862a-a101-44d4-ba56-b4e142f6247f', -- "Wicked Sing-a-Long (2024) A Night of Magic, Music &#038; Giving"
  'f3471523-0363-4a5a-a030-583b8c559b84', -- "Willy Wonka &#038; The Chocolate Factory (1971)"
  '2d6b9019-60a6-4283-89c9-6be6d806d9dd'  -- "Sat., Dec. 12 at 8:00PM & Sun., Dec. 13 at 2:00 PM. Tickets: $7"
);
