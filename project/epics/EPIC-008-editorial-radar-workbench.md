# EPIC-008 — Editorial Radar Workbench

**Status:** BACKLOG — not started. Part of the four-epic "Discovery + Editorial Intelligence" initiative (`ROADMAP.md`). **Hard dependency on `EPIC-007`** — this epic has nothing to show an editor until Radar Candidate scoring exists in at least its V0 form.

## Objective

Give Jody (the product's sole moderation authority, per `PRODUCT.md`) an admin workflow that turns `EPIC-007`'s candidate intelligence into fast, confident human decisions — reviewing 20–40 high-signal candidates instead of the full upcoming-events table, the same "automation narrows what a human looks at, a human decides" pattern `EPIC-006` already established for metadata repair.

## Problem

`admin.html` today has tabs for smoke tests, editorial review (press-to-event matching), user submissions, feed sources, and Needs Follow-up — but nothing that says "here are the events most worth your editorial attention, and here's why." An editor's only way to find a Radar-worthy event today is to notice it themselves while reviewing routine ingestion, or to wait for `cron-editorial.js` to happen to match a press article to it. Neither scales with `EPIC-001`'s coverage-growth goal.

## Scope

- A new `admin.html` tab ("Radar Candidates" or similar — exact label TBD at implementation), following the existing tabbed-layout-with-pending-count-badge convention (`EPIC-004`, shipped `9e46caa`).
- **Candidate cards** showing, per the product brief: title, date/time, venue, city/neighborhood, category, image where present, source/provenance, the matched Radar signal reasons from `EPIC-007`'s scoring, recurrence information (`is_recurring`), and any existing editorial/press coverage (`editorial_article_events`). All of this is already-rendered data elsewhere in `admin.html` (the editorial-review tab already shows a comparable event+article card) — this is substantially a new filtered view over existing admin rendering patterns, not a new rendering system.
- **Editorial actions**, exactly the three named in the product brief, no more: **On the Radar / Feature** (human editorial selection), **Pass** (not selected at this time — a candidate can resurface later if new evidence changes its score), **Not noteworthy / Routine** (stronger signal: this nomination pattern was low-quality, feeds back into future prioritization per `EPIC-007`'s feedback-loop item).
- A decision record per action (who/when/which action — reusing the admin-action audit pattern `internal_note`/moderator fields already establish elsewhere) so the feedback loop in `EPIC-007` has something to learn from, and so "why was this marked On the Radar" is answerable later without relying on memory.

## Out of scope

- **HOLD/REVISIT or any additional workflow state.** The product brief explicitly says to consider this only if a demonstrated need appears — none has yet, since the workbench doesn't exist to generate that evidence. Ship the three-state version first.
- **Any autonomous "On the Radar" publication.** Every Radar/Feature selection in this epic is a human clicking the action in `admin.html` — nothing in this epic auto-selects an event onto any public surface. That line belongs to `EPIC-010` and must not be blurred here.
- Building `EPIC-007`'s V1 persistence layer as part of this epic's own scope — if `EPIC-008` is scheduled before `EPIC-007`'s persistence work, this epic should read `EPIC-007`'s V0 live query directly rather than inventing its own storage, to avoid two competing half-built persistence layers.

## Success criteria

An editor opens one admin tab and sees a short, ranked list (not the full upcoming-events table) of candidates with enough on-card evidence to decide in seconds, not minutes; every decision is recorded; the three-action model closes the loop the product brief asks for ("instead of reviewing 1,500 upcoming events, an editor might review 20–40 high-signal candidates").

## Architecture implications

A new table is the honest shape for the decision log — not a bolt-on column on `events`, since a decision is about the *nomination*, not permanently about the event itself (an event could be nominated, passed on, and later re-nominated on stronger evidence). Exact schema (whether it's keyed to a persisted `radar_candidates` row from `EPIC-007` V1, or stands alone referencing `events.id` directly) should be decided together with `EPIC-007`'s V1 persistence design, not independently — these two schemas are the same conversation, not two separate ones.

## Dependencies

- **`EPIC-007`** (hard dependency, scoring must exist first, at least in V0 form).
- **`admin.html`'s existing tabbed layout and badge-count convention** (`EPIC-004`).
- **`editorial_article_events`** for the "existing editorial/press coverage" card field (already live, already rendered elsewhere in `admin.html`'s editorial-review tab — reuse, don't re-query independently).

## Stories / tasks

See `BACKLOG.md`: `STORY-010` (Radar Candidates admin tab + candidate cards, reading `EPIC-007`'s V0 query), `STORY-011` (three-action decision recording + audit trail). The feedback-loop consumption of this decision log belongs to `EPIC-007`'s own backlog, not duplicated here.

## Risks

Low-to-medium. The main risk is building more workflow states or automation than the product brief actually asked for ("do not create workflow complexity without demonstrated need") — this epic's own scope section exists specifically to guard against that temptation once implementation starts finding "just one more state would be convenient" cases.

## Open questions

Exact tab label and card layout (implementation-level, not a product decision). See `DISCOVERY-011` (decision-log schema shared with `EPIC-007`'s V1 persistence) in `BACKLOG.md`.

## Amendment note (2026-10-03) — Detroit routing significance

`EPIC-007` now carries one additional candidate criterion, Detroit routing significance (see that epic's "Amendment (2026-10-03)" section; it is also a candidate criterion for "Don't Miss", `DEC-025`). Nothing in this epic changes: when that evidence exists it appears on a candidate card as one more matched reason, with the evidence it rests on, and the editor still decides. The three actions, the decision record and the "no autonomous publication" rule above are unchanged. The engine surfaces evidence for editorial review; it does not declare an event "Don't Miss".

## Relevant decisions

`DEC-014` (three-layer discovery model; "the machine nominates, a human curates" is this epic's entire reason for existing). `DEC-015` (editorial/commercial firewall — a Radar/Feature action in this workbench must never be influenced by, or imply, any commercial relationship — see `EPIC-010`).
