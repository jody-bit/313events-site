-- 2026-09-05 — Jody's idea: for events missing a description (almost all
-- Ticketmaster events — see cron-ticketmaster.js's 2026-09-05 fix comment),
-- write one based on real research rather than an AI guessing from its own
-- training knowledge with no lookup (which risks inventing specifics it
-- doesn't actually know). Per Jody's own call on approach: I did live web
-- research for each of these individually (sources noted below), drafted
-- original text from what I found, and held everything here for her review
-- before writing anything — none of this was auto-published.
--
-- Deliberately a SMALL TRIAL BATCH (Jody's own choice) — 6 real shows / 8
-- rows, not the full ~900-event backlog — to see how this approach holds up
-- before deciding whether to scale it. Every event date, venue, and time
-- was cross-checked against this project's own events table before writing
-- (see the venue/date in each comment) so a description never gets
-- attached to the wrong show.
--
-- NOT included: the second "YSL Records & Young Thug..." row at The
-- Fillmore Detroit (same date, different venue than the officially
-- announced Michigan Lottery Amphitheatre stop) — that looks like a
-- Ticketmaster duplicate/bad-venue row, not a second real show, and is left
-- alone here pending a separate dedupe check (same kind of issue as the
-- Mojo Brookzz duplicate from earlier this week).
--
-- Matched on id (exact, from a live query against this same table) rather
-- than title, since two of these titles repeat across multiple nights.

-- Eric Clapton — Sun 9/6, Little Caesars Arena, Detroit.
-- Source: https://www.313presents.com/news/detail/eric-clapton-announces-new-us-tour-dates-including-visit-to-little-caesars-arena-september-6
update events set description =
  'Rock and blues legend Eric Clapton brings his six-city fall U.S. tour to Little Caesars Arena, with Jimmie Vaughan opening. His touring band features longtime collaborators Doyle Bramhall II, Nathan East, and Chris Stainton, and the show follows Clapton''s recent remastered reissue of his 1989 album Journeyman.'
where id = 'a342dff4-7086-4ec9-acc2-6ba14c1596da';

-- Jill Scott - To Whom This May Concern Tour — Sun 9/6 & Mon 9/7, Fox Theatre Detroit.
-- Source: https://www.313presents.com/events/detail/jill-scott
update events set description =
  'Three-time Grammy winner Jill Scott brings her To Whom This May Concern World Tour to the Fox Theatre. Originally set for August 26-27, both nights were postponed to September 6-7 due to illness; tickets from the original dates remain valid.'
where id in ('afcf65f1-ffca-470d-97bc-d6bf1a6ca439', 'b3c27ddb-51b2-462d-b618-a0efb7f90ab5');

-- Jill Scott - Suite Rental — same two nights/venue as above, a private
-- suite booking listing, not a separate performance.
-- Source: https://suitehop.com/venues/fox-theatre-detroit
update events set description =
  'A private suite booking for Jill Scott''s To Whom This May Concern World Tour show at the Fox Theatre, rather than a separate performance -- same artist, same night.'
where id in ('5071e5c8-d9d1-40bc-86ec-048e737a30cb', 'f8609220-b57f-4d1c-8e5a-71acb9936eca');

-- The Return Of The Legends — Sun 9/6, The Aretha Franklin Amphitheatre, Detroit.
-- Source: https://hoodline.com/2026/09/scarface-too-hort-e-40-headline-return-of-the-legends-at-the-aretha/
update events set description =
  'The second night of an annual Labor Day weekend hip-hop tradition at the riverfront amphitheatre, headlined by West Coast and Southern rap veterans Too $hort, E-40, 8Ball & MJG, The Lady of Rage, and MC Eiht.'
where id = 'ec8a4803-c441-4292-ae1a-da399dc5677c';

-- Wu-Tang Forever: The Final Chamber — Sun 9/6, Pine Knob Music Theatre, Clarkston.
-- Source: https://www.313presents.com/news/detail/wu-tang-clan-return-to-north-america-for-wu-tang-forever-the-final-chamber-tour-due-to-popular-demand-and-set-to-appear-at-pine-knob-music-theatre-september-6
update events set description =
  'Wu-Tang Clan''s farewell-run "Final Chamber" tour stops at Pine Knob, with Bone Thugs-N-Harmony as special guests -- part of a 26-city North American run billed as the group''s last major tour.'
where id = '9fd13b12-db17-4c69-af8e-53afb9d57d4c';

-- YSL Records & Young Thug Present: The New Generation Tour — Tue 9/8,
-- Michigan Lottery Amphitheatre at Freedom Hill, Sterling Heights.
-- (NOT the Fillmore Detroit row with the same title/date -- see note above.)
-- Source: https://www.313presents.com/news/detail/young-stoner-life-records-young-thug-present-the-new-generation-tour-across-the-us-and-europe-with-special-guest-nav-including-michigan-lottery-amphitheatre-september-8
update events set description =
  'Young Thug''s first headlining tour since 2019, with special guest NAV and a roster of YSL Records'' newest signees, arrives at Michigan Lottery Amphitheatre following his Coachella performance earlier this year.'
where id = '6938bd7a-f47f-42b2-8fa2-82517d642733';
