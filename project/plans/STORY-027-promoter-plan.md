# STORY-027 — Promoter profiles: implementation and retroactive-linking plan

Status: PLAN ONLY (Platform, 2026-11-09). Owner approved the full scope and authorized planning; **no migration, backfill or contact publication is approved**. Each of those needs Jody's explicit GO on the exact artifact named in "Gates" below.
Routing: primary `workstream:platform`, supporting `experience` and `event-intelligence`; release gate `workstream:release-quality`. Scope source: STORY-027 (`project/BACKLOG.md`); population strategy: DISCOVERY-006. Rules: `DEC-005` (source is not organizer; organizers are hand-curated, never created from `source`).

## 1. Starting point (read from the repo at main `7cece698`)

- `organizers(id, name, description, website, instagram, type, image_url, created_at)` and `events.organizer_id` (nullable, `on delete set null`) already exist. `organizers_name_key` is a unique index on `lower(name)`.
- `organizers` has RLS "public read organizers" `using (true)`, so **every column added to it is anonymously readable**. Private contacts therefore must not go on this table.
- `events_public` does not expose `organizer_id` (the SZ-01 allow-list keeps it internal); a new public field joins that list deliberately, never by default.
- Nothing in ingestion writes `organizer_id` today. `api/_lib/organizer-links.js` only fills a blank `event_url` for a named organizer and is unrelated to linking.
- Owner corrections are protected by `OWNER-CORRECTION` lines in `internal_note` (`api/_lib/event-contract.js`); `event-upsert.js` reads them and keeps the named fields.
- Public pages follow the venue pattern: `venue-template.html`, `api/venue-meta.js` rewrite for crawler meta, `api/sitemap.js`.

## 2. Phases (each independently shippable and reversible)

**Phase 0 — Evidence and rules (no schema).** Freeze the evidence rules (section 5), the stable-URL rule and the promoter-type vocabulary. Produce a read-only candidate report (counts only, no writes). Output: owner sign-off on the exact vocabulary and slug rule.

**Phase 1 — Schema (staging first, then one production migration under GO).** One additive migration, applied to staging with read-back and rollback script, then production only on Jody's GO:
- `organizers`: add `slug` (unique, lower-case, immutable once public), `status` (`draft|active|inactive`, default `draft`), `hero_image_url`, `bio`, `social_links jsonb`, `updated_at`. No contact columns here.
- `organizer_aliases(id, organizer_id, alias, kind: former_name|alias|rename, created_at)` with a unique index on `lower(alias)`; the old slug is kept in `organizer_slug_history` so renames redirect (stable URLs).
- `event_organizers(event_id, organizer_id, role, provenance, confidence, evidence jsonb, locked boolean default false, created_at)`; primary key `(event_id, organizer_id)`. Roles: `presenter|co_promoter|host|sponsor` (source, venue and series are separate and never roles: `DEC-005`).
- `organizer_contacts` (private): `organizer_id, kind, value, visibility (public|private), verified_by, verified_at, source_note`. RLS on, no anon policy; a public view `organizer_contacts_public` returns only `visibility='public'` rows with `verified_at` set.
- `organizer_media` (private): `id, organizer_id, image_url, credit, alt_text, provenance, sort_order, status, created_at`; public view `organizer_media_public` (contract below) only for approved rows with credit and alt filled.
- `organizer_corrections`: moderated public correction requests (queue; nothing publishes without admin approval).
- Views: `organizers_public` (status `active`, safe columns, plus `upcoming_count` and `next_event_date` derived from `events_public`) and `event_organizers_public` (approved events only). RLS: new tables enabled, no anon policy; anon reads only through the views (SZ-01 pattern).

**Phase 2 — Compatibility and writers.** `events.organizer_id` stays the single "primary promoter" and is kept in sync by a rule, not by dual hand-edits: it equals the `presenter` row of `event_organizers` when exactly one exists, otherwise null. Public reads use `event_organizers`; `organizer_id` remains for existing admin/export code. Admin: organizer CRUD, alias/rename, link/unlink an event (sets `locked=true`), contact visibility, gallery with credit/alt, correction queue. Admin writes follow the existing `api/admin-*.js` auth.

**Phase 3 — Public read.** `/promoters/<slug>` (route name to confirm in section 8) on the venue-template pattern, with `api/promoter-meta.js`: hero/logo, gallery credits and alt, description, public contacts only, social links, List / Calendar / Map views sharing the existing filters, Upcoming and Past, co-promoter roles, `Organization` JSON-LD, sitemap entries (active profiles with at least one linked approved event). Empty or unverified profiles are not indexed (`noindex`, absent from sitemap). Cancelled, rescheduled, ongoing, timezone (America/Detroit), TBA, online and unmapped-venue events are shown with the counts the shared event model already carries.

**Phase 4 — Directory.** A-Z index with category, geography, type, activity and free filters, next date and upcoming count, inactive archive. Upcoming/past categories are derived from linked published events; promoter type is editorial.

**Phase 5 — Retroactive linking (section 5) then future-import hook (section 6).** Held until its own GO.

### Public view contracts (PROPOSED column lists; no migration is approved)

Anon reads only these views; the base tables have RLS on and no anon policy except the existing `organizers` policy.
- `organizers_public`: `id uuid, name text, slug text, description text, bio text, website text, instagram text, social_links jsonb, type text, image_url text, hero_image_url text, upcoming_count integer, next_event_date date`. Active organizers only; `description` is the short bio, `bio` the long one, `image_url` the logo.
- `event_organizers_public`: `event_id uuid, organizer_id uuid, role text`. Approved events only. Provenance, confidence, evidence and lock state are never exposed.
- `organizer_contacts_public`: `organizer_id uuid, kind text, value text, verified_at timestamptz`. The view filters on `visibility = 'public'` and `verified_at is not null` internally, so every row it returns is public and verified. It does **not** expose `visibility`, `verified_by` or `source_note`: `visibility` would always be `'public'`, and the rest are moderation fields. `verified_at` is exposed so the page can show "verified" without a second query.
- `organizer_media_public`: `id uuid, organizer_id uuid, image_url text, credit text, alt_text text, sort_order integer`. The private `organizer_media` table also holds the provenance and license note, `created_at` and any review state, none of which are exposed. The view returns a row only when `credit` and `alt_text` are non-empty and the image is approved, so an uncredited or alt-less image never reaches the page.

## 3. Touchpoints

- Schema: one migration file under `supabase/migrations/` plus `supabase/verify/` checks and the SZ-01 allow-list update; `supabase/schema.sql` regenerated by the repo's tooling.
- API: new `api/promoter-meta.js`, `api/admin-organizers.js`; `api/sitemap.js` adds profile URLs; `scripts/scope-guard.js` allow-list entries for new `api/` paths (**each new entry is an owner decision**).
- Public read: `organizers_public`, `event_organizers_public`; `events_public` gains no `organizer_id`.
- Admin: `admin.html` section for organizers, link review and corrections.
- Import: `api/_lib/event-upsert.js` calls a new `api/_lib/organizer-attribution.js` after a row is written (section 6). No connector gets organizer logic of its own.

## 4. Contact and image rules

Contacts publish only when owner-supplied or verified and flagged public; nothing is scraped into a public field. Images need credit and alt text before they render; provenance follows the existing photo-register rules. Contact publication is its own GO.

## 5. Retroactive linking

Evidence tiers (a link is written only at tier A or B; the rest is review or nothing):
- **A, deterministic (confidence high):** the event's own source states the organizer in a structured field (RA promoter, Eventbrite organizer, ICS `ORGANIZER` with a name) and it matches an existing `organizers` name or alias exactly (case-folded). Venue-run promotion by an organizer's own feed (feed owner is the organizer) also counts.
- **B, corroborated (confidence medium):** two independent signals agree (for example an explicit "presented by X" in the title or description plus a matching organizer link, or the organizer's own verified page listing the event).
- **C, ambiguous:** one weak signal, a name that matches several organizers, or a collision such as Carousel versus Carouselle. Goes to the review queue; never auto-linked.
- **Never evidence:** `source`, venue, series name alone, or similarity scoring. No source-to-promoter guessing.

Each link row stores `provenance` (rule id and the evidence text/URL), `confidence` and `evidence`. Ambiguous and unattributed events stay `organizer_id` null and show no promoter.

Protections: skip any event whose `internal_note` carries an `OWNER-CORRECTION` line naming promoter fields and any `event_organizers` row with `locked=true`; an admin unlink writes a tombstone (`locked=true`, removed) so a later run cannot re-add it.

Idempotency: the linker is a pure function of (event, evidence); it upserts on `(event_id, organizer_id)` and never changes an existing locked or human row; a second run changes zero rows.

Dry run first, counts only, no writes: events scanned; would-link at tier A, B; routed to review at tier C; skipped for locks; skipped for no evidence; collisions listed. Counts are reviewed by Jody before the write GO, and the write runs in capped batches (100 per request) with each batch logged.

Rollback: every linking run gets a `run_id` in `event_organizers.evidence`; rollback deletes exactly that run's unlocked rows and resets `events.organizer_id` it set; the migration has its own down script and the nightly backup is confirmed before the first write.

## 6. Future imports

After each upsert, `organizer-attribution` applies the same tier A/B rules to the written row; unmatched or ambiguous rows are queued for review, never guessed. It never overwrites a locked or human link, never creates an organizer, and failure never fails the ingestion run (same posture as `organizer-links.js`). No connector change is needed; no new schedule.

## 7. Acceptance checks (at most 3)

1. **Schema and boundary on staging:** migration applies and rolls back cleanly; anon can read only the public views; private contacts and unverified media are not readable; `events_public` is unchanged.
2. **Linking dry run:** counts report matches the rules; re-running writes zero rows; a locked event and an owner-corrected event are untouched; Fleatroit shows its Aug 30 and Dec 5 events as separate rows; Carousel does not match Carouselle.
3. **Public page:** the pilot profile renders at 1440, 375 and 320 with List, Calendar and Map, Upcoming and Past, correct JSON-LD, and no unverified contact; an empty profile is not indexed.

## 8. Gates and open decisions

Held until Jody's explicit GO on each exact artifact: (a) the production migration SQL, (b) the retroactive write after the dry-run counts, (c) any contact publication, (d) every new `scope-guard.js` allow-list entry.
Phase 1 many-to-many co-promoters is owner-approved (Jody, 2026-11-09); it is not re-asked. The items below are **proposals** the plan proceeds on; Jody can change them without blocking preparation:
- **Route:** `/promoters/<slug>` (index at `/promoters/`). Old slugs 301 to the current one via `organizer_slug_history`.
- **Roles (`event_organizers.role`):** `presenter` (default, at most one primary), `co_promoter`, `host`, `sponsor`. Venue, source and series are never roles (`DEC-005`).
- **Promoter type (`organizers.type`, editorial, one value):** `promoter`, `collective`, `venue_operator`, `festival`, `nonprofit`, `label_or_station`, `other`. Type is never derived from event categories.
- **Tombstones:** an admin unlink is kept as a locked row, shown in admin under a "removed links" filter, hidden by default.
