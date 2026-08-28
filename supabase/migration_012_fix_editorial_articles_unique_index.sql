-- Migration 012: Fix editorial_articles' upsert-breaking unique index
--
-- Context: cron-editorial.js's upsert uses ?on_conflict=url (matching every
-- other cron's ?on_conflict=external_id convention), but migration_011's
-- unique index was built on lower(url) — a functional/expression index —
-- not on the plain url column itself. PostgREST's on_conflict=url always
-- generates a literal `ON CONFLICT (url)`, which Postgres will only accept
-- if there's a unique index/constraint on the exact column list (url) —
-- never an expression index on lower(url), even though that index still
-- enforces uniqueness. Postgres raises "no unique or exclusion constraint
-- matching the ON CONFLICT specification" in that case, which PostgREST
-- surfaces as a plain 400 — confirmed on cron-editorial's first live run:
-- every RSS feed fetched fine (200) but every following upsert POST failed
-- with exactly this 400.
--
-- This is the SAME bug already hit and fixed once before on
-- events.external_id (see migration_003_fix_external_id_index.sql, and the
-- comment on events_external_id_key in schema.sql) — a partial or
-- expression index can never satisfy a PostgREST on_conflict target, only
-- a plain index on the literal column(s) can. Same fix here: drop the
-- lower(url) index, replace it with a plain unique index on url itself.
--
-- Tradeoff: this gives up case-insensitive dedup (the same article URL
-- republished in a different case would now insert as a second row).
-- Acceptable — an outlet's own RSS feed emits the same canonical-case URL
-- on every poll in practice, and a working upsert matters more than that
-- edge case. Run once in Supabase's SQL Editor; safe to re-run.

drop index if exists editorial_articles_url_key;
create unique index if not exists editorial_articles_url_key on editorial_articles (url);
