-- ELOISE ASYLUM venue + source registration (issue #97). PROPOSED, NOT EXECUTED. Needs owner SQL approval.
-- Separate from, and independent of, 2026-10-13_eloise_oct30_correction.sql.
-- READ-ONLY CHECKS (2026-10-14): no venues row named Eloise (Westland has only The Token Lounge); no feed_sources row for eloiseasylum.com;
--   16 events carry venue_name_raw 'Eloise Asylum', all venue_id NULL, all source 'Manual'.
-- EVIDENCE: eloiseasylum.com concert page: "Eloise Asylum, 30712 Michigan Ave, Westland, MI 48186"; contact mike@hauntedeloise.com (public contact on the page).
-- NOT INVENTED: lat/lng and neighborhood are left NULL (unconfirmed). Source is registered pending_review with no feed (the site publishes no ICS/RSS); it does NOT auto-poll.
begin;

insert into public.venues (name, address, city, website)
select 'Eloise Asylum', '30712 Michigan Ave', 'Westland', 'https://eloiseasylum.com/'
where not exists (select 1 from public.venues where name ilike 'eloise asylum%');

insert into public.feed_sources (venue_name, contact_email, website, feed_url, feed_format, default_category, status, location_per_event, notes)
select 'Eloise Asylum', 'mike@hauntedeloise.com', 'https://eloiseasylum.com/', 'https://eloiseasylum.com/haunted-attraction/', 'manual', 'family', 'pending_review', false,
       'Seasonal haunt + special nights (e.g. Rockin'' Haunt Night Concert Oct 30). No ICS/RSS found; discovery by page review under #97. Ticketing: eloiseasylumhauntedhouse.fearticket.com; concert-only: maingatetickets.com.'
where not exists (select 1 from public.feed_sources where lower(feed_url) = 'https://eloiseasylum.com/haunted-attraction/');

-- Link the 16 existing Eloise rows to the venue (venue_id only; nothing else changes):
update public.events e set venue_id = v.id
from public.venues v
where v.name = 'Eloise Asylum' and e.venue_name_raw = 'Eloise Asylum' and e.venue_id is null and e.source = 'Manual';

do $$ declare nv int; nf int; nl int; begin
  select count(*) into nv from public.venues where name = 'Eloise Asylum';
  select count(*) into nf from public.feed_sources where lower(feed_url) = 'https://eloiseasylum.com/haunted-attraction/';
  select count(*) into nl from public.events where venue_name_raw = 'Eloise Asylum' and venue_id is not null;
  if nv <> 1 or nf <> 1 or nl <> 16 then raise exception 'unexpected counts venue=% feed=% linked=% (expected 1,1,16); rolling back', nv, nf, nl; end if;
end $$;
commit;
-- ROLLBACK: update public.events set venue_id = null where venue_name_raw='Eloise Asylum' and venue_id = (select id from public.venues where name='Eloise Asylum');
--           delete from public.feed_sources where lower(feed_url)='https://eloiseasylum.com/haunted-attraction/' and status='pending_review';
--           delete from public.venues where name='Eloise Asylum';
-- NOTE: linking venue_id changes how public pages resolve venue name/city (events_public coalesces venues.name/city); both resolve to Eloise Asylum / Westland, so no visible change expected.
