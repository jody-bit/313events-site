-- @detroitiscool "October in Detroit" batch: PROPOSED, NOT EXECUTED. Needs owner SQL approval.
-- Two NEW rows only. No existing row is changed. Inserted as 'approved' ONLY when the owner approves this file.
-- EVIDENCE LEVEL: both are SECONDARY sources (official sites blocked or silent), see receipt. No time, price or ticket invented.
--  1. Side Hustle Lounge "Haunted House of Film": Detroit Metro Times (read 2026-10-14): 1226 Library St, Oct 1-31, bar opens 4 PM weekdays / 2 PM weekends;
--     horror-film scenes, limited cocktail menu, classic horror films on a projector. Address/hours also on sidehustledetroit.com (event not mentioned there).
--  2. The Skip "Black Lagoon" Halloween pop-up: Hoodline Oct 2026 (read 2026-10-14): "run started September 30 and continues through November 1". No address/hours stated; theskipdetroit.com blocks the fetch.
begin;

insert into public.events (title, category, start_date, end_date, is_all_day, date_semantics, is_free, source, status, venue_name_raw, venue_city_raw, event_url, description)
select 'Haunted House of Film at Side Hustle Lounge', 'nightlife', date '2026-10-01', date '2026-10-31', true, 'continuous', false, 'Manual', 'approved',
       'Side Hustle Lounge', 'Detroit', 'https://sidehustledetroit.com/',
       'Side Hustle Lounge turns the bar into a Haunted House of Film for October, with scenes inspired by Psycho, The Shining, The Exorcist, Halloween and Friday the 13th, classic horror movies on a 12-foot projector, and a limited-time cocktail menu. The lounge is at 1226 Library St. in Detroit; see the bar for hours.'
where not exists (select 1 from public.events where title ilike '%haunted house of film%');

insert into public.events (title, category, start_date, end_date, is_all_day, date_semantics, is_free, source, status, venue_name_raw, venue_city_raw, description)
select 'Black Lagoon Halloween Pop-Up at The Skip', 'nightlife', date '2026-10-01', date '2026-11-01', true, 'continuous', false, 'Manual', 'approved',
       'The Skip', 'Detroit', 
       'The Black Lagoon Halloween-themed pop-up bar takes over The Skip in downtown Detroit''s Belt through November 1. See the venue for hours and reservations.'
where not exists (select 1 from public.events where title ilike '%black lagoon%pop%' );

do $$ declare n int; begin
  select count(*) into n from public.events where title in ('Haunted House of Film at Side Hustle Lounge','Black Lagoon Halloween Pop-Up at The Skip') and status='approved';
  if n <> 2 then raise exception 'expected 2 new rows, found %; rolling back', n; end if;
end $$;
commit;
-- VERIFY: both rows appear in events_public; approved count rises by exactly 2.
-- ROLLBACK: delete from public.events where title in ('Haunted House of Film at Side Hustle Lounge','Black Lagoon Halloween Pop-Up at The Skip') and source='Manual' and created_at > '2026-10-14';
