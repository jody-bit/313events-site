-- Migration 041: broaden ticket_status semantics, 2026-09-28 (Needs
-- Follow-up self-healing pass 2, no-advance-ticket-link false positive).
--
-- ticket_status (migration_030) was written as, and its column comment
-- still says, "Only populated for source=Ticketmaster" with a fixed
-- Ticketmaster-shaped value set (onsale | offsale | cancelled | postponed
-- | rescheduled). This migration does NOT add a CHECK constraint (the
-- column has never had one, and several of the values below are only
-- inferred with structural-not-explicit confidence -- a hard enum would
-- force guessing at the boundary); it only widens the documented,
-- cross-source value set and corrects the now-inaccurate "only
-- Ticketmaster" comment. No ALTER is needed for the new values themselves
-- since the column was already a plain `text`.
--
-- New values, all describing "why there is no advance ticket_url", added
-- because HALO Detroit's HOT ASH CIGAR & PIPE SOCIAL was flagged as
-- missing its "ticket/event link" when the true fact is simply that no
-- advance-purchase ticket exists for it at all -- the event is genuinely
-- pay-at-the-door / RSVP-only, and a null ticket_url is the CORRECT state
-- for that, not a gap to fill:
--   'door'                 -- source text explicitly says pay-at-door / door
--                             admission / tickets at door. Highest-confidence
--                             value; only ever set from an explicit phrase
--                             match, never inferred from a link's absence.
--   'rsvp_no_advance_sale' -- source's own booking widget/button shows no
--                             advance-ticket-purchase mechanism (e.g. a Wix
--                             Events "RSVP"/"Details" button vs. "Buy
--                             Tickets"/"Get Tickets") -- weaker than 'door'
--                             (structural, not an explicit textual claim)
--                             but still real, non-invented evidence. See
--                             api/cron-halo.js.
--   'free'                 -- explicitly free, no ticket or registration
--                             required.
--   'registration_required'-- registration required but not a paid ticket
--                             (an RSVP/signup, distinct from 'door' and from
--                             true advance ticketing).
-- Existing Ticketmaster values (onsale | offsale | cancelled | postponed |
-- rescheduled) are unchanged and still mean what migration_030 documented.
comment on column events.ticket_status is
  'Cross-source ticket/availability status. Ticketmaster values (source=Ticketmaster only), from Discovery API''s dates.status.code: onsale | offsale | cancelled | postponed | rescheduled ("offsale" is ambiguous -- see migration_030 and cron-ticketmaster.js). Cross-source no-advance-ticket values (any source), added migration_041: door (source explicitly states pay-at-door/door admission -- never inferred), rsvp_no_advance_sale (source''s own booking UI shows no advance-purchase mechanism, e.g. an RSVP/Details button rather than Buy/Get Tickets -- see api/cron-halo.js), free (explicitly free, no ticket/registration required), registration_required (signup required, not a paid ticket). Null means genuinely unknown/not evaluated for that source -- never defaulted or guessed. admin.html''s Needs Follow-up queue treats ticket_status in {door, rsvp_no_advance_sale, free, registration_required} as sufficient explanation for a null ticket_url/event_url -- see classifyMissingFields().';

insert into schema_migrations (filename) values ('migration_041_ticket_status_generalize.sql')
on conflict (filename) do nothing;
