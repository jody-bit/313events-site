-- 2026-09-05 — Suspected duplicate/bad-venue Ticketmaster listing, flagged
-- during last week's description-writing pass and investigated further
-- overnight while Jody was away.
--
-- Two DB rows exist for "YSL Records & Young Thug Present: The New
-- Generation Tour", same date (2026-09-08), different venues:
--   - 6938bd7a-f47f-42b2-8fa2-82517d642733 — Michigan Lottery Amphitheatre
--     at Freedom Hill, Sterling Heights, 8:00 PM. Matches the official tour
--     announcement: https://www.313presents.com/news/detail/young-stoner-
--     life-records-young-thug-present-the-new-generation-tour-across-the-us-
--     and-europe-with-special-guest-nav-including-michigan-lottery-
--     amphitheatre-september-8
--   - 46136ff0-8f2a-4c54-9363-c89a4a8bfef3 — The Fillmore Detroit, Detroit,
--     7:00 PM. NOT mentioned in that (or any other found) official
--     announcement.
--
-- Re-checked tonight rather than just assumed: the Fillmore Detroit row's
-- own ticket_url is a real, live, distinct Ticketmaster listing (event id
-- 08006522E44B7CC7, its own og:title/og:image, confirmed still up as of
-- 2026-09-05) — so this isn't an obviously-broken link or a copy-paste
-- artifact on this project's crawler side. It could be Ticketmaster's own
-- data error (e.g. a stale/incorrectly-routed venue on their end — the
-- official press release only ever named one Detroit-area stop), or, less
-- likely, a second small/surprise show. Genuinely uncertain either way from
-- what's checkable here, so this is a REVIEW SQL FILE, not an auto-applied
-- fix — same pattern as the Mojo Brookzz dedupe.
--
-- This sets the Fillmore Detroit row's status to 'rejected' (hides it from
-- the public site) rather than deleting it, so it's fully reversible if it
-- turns out to be a real second show — just flip status back to 'approved'.
-- Only run this if you agree the Freedom Hill show is the real one.

update events
set status = 'rejected'
where id = '46136ff0-8f2a-4c54-9363-c89a4a8bfef3'
  and status = 'approved'; -- guard: no-ops if someone already touched this row
