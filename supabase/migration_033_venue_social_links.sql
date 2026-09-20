-- Adds venue social media links, 2026-09-20 (Jody: "for venue pages, we need
-- to add their website and any social media links we can find to their
-- profile page" -- prompted by rent free haus, a new venue with no page yet).
--
-- venues previously had only `website` (a single link). This adds one
-- column per platform rather than a jsonb blob, matching this table's
-- existing flat-column style (and `events`' style throughout the project) --
-- easy to query/filter later (e.g. "venues missing an instagram_url") without
-- needing to reach into a nested structure. All nullable: most venues will
-- only have some of these, some none at all -- never guess/fabricate a
-- link that isn't actually confirmed on the venue's own site or socials.
alter table venues add column if not exists instagram_url text;
alter table venues add column if not exists facebook_url text;
alter table venues add column if not exists tiktok_url text;
alter table venues add column if not exists twitter_url text;

insert into schema_migrations (filename) values ('migration_033_venue_social_links.sql')
on conflict (filename) do nothing;
