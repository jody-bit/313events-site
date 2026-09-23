-- Migration 038: description_source -- minimum provenance for auto-generated
-- descriptions (2026-09-23, Automated enrichment / "AI factual descriptions").
--
-- Context: the Product Owner approved automatic factual-description
-- generation for events whose source structurally never provides one
-- (Outer Limits Lounge sometimes, Trinosophes always, Dossin always -- see
-- NEEDS_FOLLOWUP_CLOSURE.md). A generated description must never be
-- indistinguishable from a real one, and must always defer to a real one:
-- "Generated descriptions must have lower precedence than moderator/manual
-- copy or authoritative source copy... implement the MINIMUM provenance
-- needed... do not introduce a large schema redesign." This is that
-- minimum: one nullable, checked column, no new table.
--
-- Values:
--   null            -- default. Every description written before this
--                      migration, and every description written by a
--                      moderator or an authoritative per-source recovery
--                      script (Outer Limits/Dossin/Redford Auto-Repair
--                      steps), is left null. Treated as "protected" --
--                      automation never overwrites a description that has
--                      one, same as this project's existing blank-only
--                      convention for every other field.
--   'authoritative' -- reserved for a future authoritative-source writer
--                      that wants to record its provenance explicitly; not
--                      written by any existing script today (they all
--                      already only ever fill a blank field, so the
--                      precedence is already correct by write-order alone --
--                      see api/_lib/auto-repair-runner.js).
--   'generated'      -- written only by api/_lib/description-enrichment.js's
--                      writer, when no authoritative description could be
--                      recovered and a factual template was used instead.
--                      A description with this value is the ONLY kind
--                      automation is allowed to later overwrite (e.g. if a
--                      real authoritative description later becomes
--                      available) -- not implemented as an overwrite path
--                      yet (no existing repair step re-checks a populated
--                      field), but this is what the column exists to make
--                      possible without a further migration.
alter table events add column if not exists description_source text
  constraint events_description_source_check
  check (description_source is null or description_source in ('manual', 'authoritative', 'generated'));

insert into schema_migrations (filename) values ('migration_038_description_source.sql')
on conflict (filename) do nothing;
