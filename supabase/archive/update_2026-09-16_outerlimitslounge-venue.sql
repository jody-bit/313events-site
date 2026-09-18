-- Seeds the venues row for Outer Limits Lounge, alongside the new
-- cron-outerlimitslounge.js source (see that file's header comment).
-- Address/city come straight from the venue's own Squarespace feed
-- (location.addressLine1/addressLine2 on every sampled event).
--
-- Same pattern as every other single-venue cron here (Lager House,
-- Trinosophes both have their own venues row) -- once this exists,
-- resolveVenueId() in the cron links every upserted event to it
-- automatically on the very next run, no manual backfill needed.
insert into venues (name, address, city)
values ('Outer Limits Lounge', '5507 Caniff Street', 'Hamtramck')
on conflict (lower(name), lower(city)) do update set
  address = excluded.address;
