-- 2026-10-05 — move RA provenance / enrichment bookkeeping out of the public note.
--
-- Found on the redesigned homepage (2026-10-04): approved rows were printing
-- "RA_PROVENANCE | v1 | ra_id=... | status=unresolved" and "RA_ENRICHMENT |
-- v1 | field=description | tier=... | source_url=..." as their visitor-facing
-- note. scripts/ra-candidate-promotion.js and
-- scripts/generic-metadata-enrichment.js wrote the trail into `note` (the
-- 2026-10-01 decision said "the existing internal note field"); approval only
-- flips status, so the lines went public unchanged. Both scripts now write
-- `internal_note` (admin-only, never selected by events_public).
--
-- This moves the existing trail: every RA_PROVENANCE / RA_ENRICHMENT line of
-- `note` is appended to `internal_note`, and whatever free text the note also
-- carried (one row: "Venue location not yet announced by the event.") stays
-- in `note`. 22 rows at the time of writing. Idempotent: a second run finds
-- no matching note lines.

with lines as (
  select e.id, l.line, l.ord
  from events e,
       unnest(string_to_array(e.note, E'\n')) with ordinality as l(line, ord)
  where e.note ~ '(^|\n)RA_(PROVENANCE|ENRICHMENT) \|'
), split as (
  select id,
    string_agg(line, E'\n' order by ord)
      filter (where line ~ '^RA_(PROVENANCE|ENRICHMENT) \|') as provenance,
    nullif(trim(string_agg(line, E'\n' order by ord)
      filter (where line !~ '^RA_(PROVENANCE|ENRICHMENT) \|')), '') as free_text
  from lines
  group by id
)
update events e
set note = s.free_text,
    internal_note = concat_ws(E'\n', nullif(e.internal_note, ''), s.provenance),
    updated_at = now()
from split s
where s.id = e.id;

-- verify: expect 0
-- select count(*) from events where note ~ '(^|\n)RA_(PROVENANCE|ENRICHMENT) \|';
