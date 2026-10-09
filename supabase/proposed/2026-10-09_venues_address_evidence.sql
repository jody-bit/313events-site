-- PROPOSED, NOT APPLIED. Issue #49 (Admin Hardening: venue knowledge).
-- Where a canonical venue's address came from.
--
-- Today a venues row's address and city carry no provenance: nobody can tell a
-- researched address from a copied one. Venue-level repairs proposed by #49
-- (fill a canonical address from trusted knowledge; a person confirming a
-- single-source address once) need to record what they relied on.
--
-- address_evidence jsonb, nullable, no default. Shape written by the repair:
--   { "status": "learned" | "learned_first_party" | "confirmed_by_person" | ...,
--     "decided_at": "2026-10-09T15:00:00Z",
--     "decided_by": "venue-knowledge" | "<admin>",
--     "sources": [ { "source": "Resident Advisor", "rows": 4, "dates": 4 },
--                  { "source": "Venue Submission", "rows": 1, "dates": 1 } ],
--     "sample_event_ids": [ "..." ] }
-- Source names and counts only: no submitter contact data.
--
-- GRANTS: check before applying. If anon/authenticated hold table-level SELECT
-- on venues, a new column is readable by them; this column must be internal
-- (add it to the SZ-01 boundary check's private list and move venues reads to
-- column-level grants, or keep it in a separate internal table instead).
--
-- Apply to staging first, then production, per supabase/migrations/README.md.

alter table public.venues add column if not exists address_evidence jsonb;
comment on column public.venues.address_evidence is
  'Issue #49: provenance of address/city (status, sources, sample event ids). Internal.';
