-- Migration 027: dismissible follow-up items (additive, non-breaking)
--
-- Context: Jody, 2026-09-16 — "I have run all of the sql's and I am still
-- getting empty fields in the admin panel - how can we make this more
-- seamless and auto-healing?"
--
-- A real chunk of the "Needs follow-up" queue isn't actually fixable, ever,
-- by anyone: Resident Advisor lists several nightlife events with a
-- genuinely secret/TBA venue by design (Sleep Olympics, Texture, Texture —
-- TBA, Lucky Rabbit, Grave Rave), and Wazzup Detroit! is a bus tour with no
-- single fixed address. These rows have sat in the follow-up queue,
-- unchanged, through every single PDF export Jody has sent this week —
-- because there's genuinely nothing to fill in, but the UI has no way to
-- say "reviewed, this is expected, stop asking." That's pure noise on top
-- of the real, fixable gaps, and it's the single biggest thing standing
-- between this feature and "seamless."
--
-- FIX: one boolean per event. Once a moderator has actually looked at a
-- flagged row and confirmed the gap can't be filled, they dismiss it and it
-- stops showing up — same spirit as reject/hide elsewhere in this admin
-- tool, just for "acknowledged, not fixable" instead of "shouldn't be
-- live." If the event is ever re-upserted by its source cron with a real
-- value for the field that was missing (e.g. RA eventually reveals the
-- venue), that's a normal UPDATE from the cron and doesn't touch this flag
-- either way — dismissing never blocks a future real fix from landing, it
-- only silences the *nagging* about a gap that's already been reviewed.
alter table events add column if not exists followup_dismissed boolean not null default false;
alter table events add column if not exists followup_dismissed_note text;
alter table events add column if not exists followup_dismissed_at timestamptz;

comment on column events.followup_dismissed is 'true once a moderator has reviewed a "Needs follow-up" gap and confirmed it cannot be filled (e.g. source genuinely never discloses the venue). Hides the row from admin.html''s follow-up queue without touching status/approval. A later cron upsert that fills the real gap is unaffected either way.';
comment on column events.followup_dismissed_note is 'optional free-text reason the moderator gave when dismissing, shown back in admin.html for anyone auditing later.';

insert into schema_migrations (filename) values ('migration_027_followup_dismissed.sql')
on conflict (filename) do nothing;
