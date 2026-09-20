-- Adds the curated venues row for rent free haus, 2026-09-20 (Jody: "rent
-- free haus doesn't have a venue page - a venue page should be created").
-- Its 5 events were already added in update_2026-09-20_rentfreehaus-new-venue.sql
-- with venue_id left null (no curated row existed yet for the backfill step
-- in that file to match against) -- this creates the row, then re-runs that
-- same backfill so those 5 events pick up the link and get a real venue page.
--
-- website + instagram_url are both real links confirmed on rentfreehaus.com
-- itself (homepage nav link to https://www.instagram.com/rentfreehaus). No
-- Facebook or TikTok link found anywhere on their site as of this check --
-- left null rather than guessed; add later if one turns up.
-- Requires migration_033_venue_social_links.sql (instagram_url/facebook_url/
-- tiktok_url/twitter_url columns) to already be run first.
insert into venues (name, address, city, website, instagram_url)
values ('rent free haus', '1347 Fisher Freeway East', 'Detroit', 'https://rentfreehaus.com', 'https://www.instagram.com/rentfreehaus')
on conflict (lower(name), lower(city)) do update set
  address = excluded.address,
  website = excluded.website,
  instagram_url = excluded.instagram_url;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-20_rentfreehaus-venue.sql')
on conflict (filename) do nothing;
