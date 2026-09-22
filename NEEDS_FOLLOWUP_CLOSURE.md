# Needs Follow-up / Auto-Repair — closure record (2026-09-23)

This closes the Needs Follow-up burn-down initiative. Status: **done**, not
an open epic. Any further connector work belongs in `INGESTION_BACKLOG.md`
(future platform work) or `FEATURE_BACKLOG.md` (product asks) — not here,
and not as a reopening of this initiative.

## Product decision

> Needs Follow-up represents actionable human intervention, not generic
> metadata incompleteness.

A missing field is no longer automatically "Jody needs to follow up." Every
event's missing fields are still detected exactly as before
(`getMissingFields()` in `admin.html` is unchanged and still 100% truthful
about what's actually blank) — a new classification layer
(`classifyMissingFields()`, `SOURCE_FIELD_LIMITATIONS`,
`isVenueTbaByDesign()`, all in `admin.html`) splits that truthful list into:

- **Actionable** — Jody can reasonably do something about it. Stays in the
  Needs Follow-up queue.
- **Source-limited** — the authoritative source structurally doesn't
  provide this field (confirmed by direct investigation, not guessed).
  Never invented, never overwritten to hide it — just no longer asked of a
  human. Excluded from the queue; the excluded count is shown in a small
  note under the list (`#sourceLimitedNote`) so the exclusion stays
  auditable, not silent.

An event with a mix of actionable and source-limited gaps stays in the
queue, showing only its actionable gap(s).

## What no longer pollutes the queue

- Trinosophes: description + ticket/event link (source has neither, ever).
- Detroit Historical Society / Dossin: description only (its link stays
  actionable — Auto-Repair already recovers it when the source has real
  per-event data).
- Outer Limits Lounge: description only (most listings have one, recovered
  automatically by Auto-Repair when present; a description still blank
  after that has genuinely none to recover).
- Any event with `venue_name_raw` exactly `"Venue TBA"` (case-insensitive):
  venue address/city. Exact match only — deliberately does **not** match
  Resident Advisor's own differently-worded TBA/secret-venue rows
  (`"Venue TBA (secret loft, revealed to ticket holders)"`,
  `"TBA - <street>"`, `"Location TBA"`, plain `"TBA"`), so RA's existing
  per-event "Not fixable — dismiss" workflow is completely unaffected.

Start time is never source-limited for any source — a genuine gap stays
actionable until a real `time_display` (or a genuine `is_all_day` listing)
resolves it.

## Current exceptions (still genuinely need Jody)

Whatever remains in the queue after this change is, by definition, a real
gap with no confirmed source limitation and no existing repair mechanism —
check the live admin panel for the current list. Nothing here is
pre-enumerated by event ID; that's the point of the general rule above.

## Auto-Repair — final capabilities in place

One button, four sequential, independently-isolated steps (a later step's
failure never discards an earlier step's real results):

1. SH.1 — deterministic canonical/learned venue address/city repair.
2. Outer Limits Lounge — authoritative description recovery from the
   venue's own live event page.
3. Detroit Historical Society / Dossin — authoritative event/ticket link
   recovery from the venue's own "Learn More" link (generic/shared links
   never written).
4. Redford Theatre — authoritative description/event link/ticket link
   recovery from each event's own detail page (ticket link only when that
   page has exactly one "Buy Tickets" link).

All four: blank-fields-only, race-safe conditional writes (never overwrite
a moderator-entered value), status and unrelated fields always preserved,
zero fabricated metadata. The actionable/source-limited classification
above is a read-only UI layer on top — it adds no new write path and
doesn't change what Auto-Repair fetches or writes; a source-limited field
is still recovered and written when the source genuinely has real data for
it (e.g. an Outer Limits description that does exist gets written even
though the UI never flagged it as needing follow-up).

## Source limitations recorded (so they aren't rediscovered)

| Source | Structurally unavailable | Evidence |
|---|---|---|
| Trinosophes | description, ticket/event link | flat text listing page, no description or per-event link anywhere — confirmed by direct investigation of the source's own markup |
| Detroit Historical Society (Dossin) | description | each listing has title/venue/date/time + a "LEARN MORE" link, never a description/excerpt — see `api/cron-dossin.js`'s own header comment |
| Outer Limits Lounge | description (sometimes) | most listings have a real Squarespace Post Body description (Auto-Repair recovers it); a real minority genuinely don't |
| Any source | venue address/city, when `venue_name_raw` is exactly `"Venue TBA"` | no address exists yet for a not-yet-announced venue |

## Other fixes in this closure

- `supabase/update_2026-09-23_the-white-shag-reunion-time-title-fix.sql` —
  re-issues the already-confirmed "Doors 7:00 PM" / 2026-10-10 fix against
  the corrected title `"The White Shag Reunion"` (the PO confirmed
  production stores the "The" prefix; the original
  `update_2026-09-22_white-shag-reunion-time.sql` targeted the title
  without it and — per that file's own flagged assumption — most likely
  matched 0 rows). Both files are idempotent and blank-only guarded; the
  original is left in place as a historical record, not edited.

## Explicitly out of scope for this closure

Per the closing instruction: no new source-specific repair module, no
per-event investigation of the remaining queue, no generated/AI metadata,
no Resident Advisor work, no ingestion coverage expansion, no editorial
review automation, no Admin redesign, no new architecture or epic. Future
connector-level improvements (e.g. a persisted "we checked, source
confirmed blank" per-event flag instead of a source-wide table, if the
occasional false-negative on Outer Limits Lounge ever becomes a real
problem) belong in `INGESTION_BACKLOG.md`, not this initiative.
