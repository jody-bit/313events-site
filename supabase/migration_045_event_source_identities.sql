-- migration_045_event_source_identities.sql
--
-- General-purpose cross-source identity crosswalk. One canonical `events`
-- row may be discovered independently by more than one connector (RA,
-- Ticketmaster, Eventbrite, a promoter/venue submission, another future
-- connector) -- this table records those relationships without touching
-- `events.external_id`, which stays exactly as it is today: one slot,
-- owned by whichever connector's own upsert path (?on_conflict=external_id)
-- created the row.
--
-- WHY A NEW TABLE INSTEAD OF WIDENING external_id: external_id's unique
-- index and PostgREST on_conflict upsert semantics are already load-
-- bearing for every existing connector's own re-run idempotency (see
-- schema.sql's own comment on events_external_id_key). A conservative
-- cross-source dedupe match (findConservativeDuplicate, used by both
-- scripts/ra-sync.js and scripts/ra-candidate-promotion.js) finds a
-- DIFFERENT fact -- "this external record is the same real-world event as
-- an existing row, which may belong to a different source" -- and persisting
-- that by overwriting or repurposing external_id would mean fighting over a
-- slot that source doesn't own. This table is purely additive.
--
-- PRIMARY KEY (source, source_id): the one integrity rule that actually
-- matters -- one external record can never identify two different
-- canonical events. Deliberately NOT unique on (event_id, source): a
-- source can legitimately list the same real-world event more than once
-- (a mistitled repost, a corrected re-listing under a new id) and an
-- event can accumulate more than one identity from the same source
-- without that being a data-integrity problem. See the 2026-10-03 RA
-- coverage/observability review (ra-2547930 / ra-2512641 / ra-2524562 /
-- ra-2513540) for the real-world cases that motivated this.
create table if not exists event_source_identities (
  event_id    uuid not null references events(id) on delete cascade,
  source      text not null,          -- 'ra', 'ticketmaster', 'eventbrite', 'venue', ...
  source_id   text not null,          -- bare id within that source, e.g. '2547930' (no 'ra-' prefix -- source already disambiguates)
  created_at  timestamptz not null default now(),
  primary key (source, source_id)
);

-- Non-unique -- lookups by event_id ("what identities does this event
-- already have") are the common query shape; nothing requires at-most-one
-- row per event per source (see header comment above).
create index if not exists event_source_identities_event_id_idx on event_source_identities (event_id);

alter table event_source_identities enable row level security;

-- No public read/write policies -- this table is operational/internal
-- bookkeeping for the ingestion pipeline, never consumed by the public
-- site. Only the service_role key (server-side only) can read or write
-- it, same posture as every other admin/ingestion-only table in this
-- schema.
