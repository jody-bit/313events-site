-- Migration 022: events.event_url
--
-- Context: Jody got a request to add a field to the public submit form for
-- a link to the event's own listing page — a Facebook event, a Resident
-- Advisor page, an Eventbrite page, etc. The form already has a "Ticket /
-- RSVP link" (ticket_url) that renders as the "Tickets & info" button, and
-- for a lot of submitters that's the same link. But plenty of events have
-- both: a ticket vendor link where you actually buy in, and a separate
-- Facebook/RA/Eventbrite event page people use for the "who's going" /
-- more-info side of things (free shows especially — there's no ticket
-- link at all, only the event page). Asked Jody directly: she wants this
-- as a genuinely separate field, not folded into ticket_url.
--
-- Same free-text-link pattern as ticket_url itself: nullable, optional,
-- validated as http(s)-only server-side (isSafeHttpUrl in api/submit.js
-- and api/admin-editorial.js), rendered as its own secondary link
-- wherever ticket_url already renders — and specifically suppressed when
-- it's identical to ticket_url, so a submitter who only filled in one link
-- (or pasted the same URL in both boxes) doesn't get a duplicate button.
-- Safe to re-run.

alter table events add column if not exists event_url text;
comment on column events.event_url is
  'Optional link to the event''s own public listing page — a Facebook event, Resident Advisor page, Eventbrite page, or similar. Distinct from ticket_url (the "buy tickets" link): an event can have one, both, or neither. Populated by api/submit.js (public form''s "Event page link" field) and api/admin-editorial.js (create_event action). Rendered as a secondary "Event page" link alongside the ticket_url "Tickets & info" button on event.html/index.html/calendar.html/map.html, suppressed when it duplicates ticket_url. NULL/absent means no separate event page link was given.';
