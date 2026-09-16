-- Migration 030: ticket_status column, 2026-09-16 (Jody: "figure out a way
-- to see if the event is sold out or not to be able to get tickets cheaper
-- on the resale apps").
--
-- Ticketmaster's Discovery API (the one this project already has a key
-- for, via cron-ticketmaster.js) exposes dates.status.code on every event
-- it returns, with documented values: onsale, offsale, cancelled,
-- postponed, rescheduled. That's the only source on the whole site with
-- any real availability signal at all -- checked live, no other cron source
-- (VisitDetroit, RA manual pulls, the venue-specific Squarespace/HTML
-- scrapers) exposes anything like it.
--
-- IMPORTANT HONESTY NOTE, read before changing how this is displayed:
-- Ticketmaster's own docs do NOT say "offsale" specifically means sold
-- out -- it's the same code for "the sale window hasn't opened yet" and
-- "this sold out." There's a real Inventory Status API
-- (TICKETS_NOT_AVAILABLE / resale price ranges) that WOULD give a precise
-- answer, but it needs a separate partner API key
-- (devportalinquiry@ticketmaster.com), not the standard Discovery key this
-- project already has -- flagged to Jody as a follow-up, not blocking this.
-- Until/unless that's provisioned, event.html must phrase this as "may be
-- sold out, or not yet on sale" -- never a flat "SOLD OUT" claim from this
-- field alone.
alter table events add column if not exists ticket_status text;

comment on column events.ticket_status is
  'Only populated for source=Ticketmaster, from Discovery API''s dates.status.code (onsale | offsale | cancelled | postponed | rescheduled). "offsale" is ambiguous (sold out vs. not yet on sale) per Ticketmaster''s own docs -- see cron-ticketmaster.js header and event.html''s resale-link section for how this is used responsibly. Null for every other source.';

insert into schema_migrations (filename) values ('migration_030_ticket_status.sql')
on conflict (filename) do nothing;
