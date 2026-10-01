# EPIC-010 — Editorial vs. Paid Promotion / Trust Architecture

**Status:** BACKLOG — not started, but conceptually the most "decided" of the four epics in this initiative: the Product Owner has stated a firm principle (`DEC-015`), even though the implementation and the public-facing naming are both still open. Part of the four-epic "Discovery + Editorial Intelligence" initiative (`ROADMAP.md`).

## Objective

Establish a hard, structural distinction between editorial selection (`EPIC-007`/`EPIC-008`'s "On the Radar") and commercial placement (a potential future "Featured"/"Promoted"/"Sponsored" surface) **before monetization creates any ambiguity** — not as a cleanup after the fact.

## Problem

313.events has no monetization or paid-placement feature of any kind today (confirmed: no sponsor/featured/promoted/advertiser code path exists anywhere in the current codebase or schema). That absence is exactly why this epic exists now rather than later: the firewall is far cheaper to build into the data model and editorial workflow from the start than to retrofit once a commercial relationship already exists and someone is asking "why isn't our event on the radar."

## The principle (decided — `DEC-015`)

- **On the Radar** is editorial, human-selected, and **cannot be purchased**. Selection is independent of advertiser/sponsor status, full stop.
- **Featured / Promoted / Sponsored** (naming not final — see below) is commercial placement, potentially purchasable in the future, must be visibly identified as promotional/sponsored wherever it appears, and **does not imply** editorial ("On the Radar") selection.
- Paid placement must never silently influence `EPIC-007`'s Radar Candidate Score or `EPIC-008`'s editorial selection — not as a thumb on the scale, not as a tiebreaker, not as an input of any weight.

## Scope

- Document this as an enduring trust principle in `PRODUCT.md` (done as part of this same documentation pass — see "Editorial independence" below) and `DECISIONS.md` (`DEC-015`).
- A structural guarantee, once any commercial feature is actually built, that the code paths are genuinely separate: `EPIC-007`'s scoring query must have no input column, join, or parameter sourced from a future "paid"/"sponsor" table, by construction — not merely by convention. This epic's job is to make sure that constraint is written down and reviewed *before* a commercial feature's first migration lands, so the schema itself can't blur the line later (e.g. a future `is_featured` or `sponsor_id` column on `events` would sit directly next to a future `is_radar` flag if both exist on the same table — this epic should decide, ahead of time, whether that's even an acceptable schema shape, or whether commercial placement belongs in a fully separate table precisely so no query can accidentally join the two).
- Determine the public-facing label for commercial placement. The Product Owner has explicitly flagged this as open: "Featured" is a tempting word for commercial placement, but it's also a word product copy tends to reach for to mean "editorially picked" — using it for the commercial lane risks exactly the ambiguity this epic exists to prevent. No decision is made here; options and their tradeoffs are listed under "Open questions."

## Out of scope

- Building any actual monetization/paid-placement feature. **Nothing in this epic creates a sellable product** — no pricing, no payment flow, no advertiser-facing tooling. This is the trust architecture and the naming decision only, so that *if and when* monetization is pursued, it has a firewall to build inside rather than a decision to make under commercial pressure.

## Success criteria

A written, Product-Owner-approved rule exists (`DEC-015`) that any future monetization proposal must be checked against before implementation; the public naming question is either resolved or explicitly still open and tracked (not silently defaulted to "Featured" by an implementer who didn't know this epic existed); `EPIC-007`'s scoring design (once built) can be reviewed against this epic's rule and shown to have no commercial input.

## Architecture implications

None yet, since no commercial feature exists to architect against. The implication is forward-looking: whenever a monetization proposal is scoped, it must be checked against this epic's rule before its own schema is designed, not after.

## Dependencies

`EPIC-007` (the scoring system this epic's firewall rule constrains). `EPIC-008` (the editorial selection action this epic's firewall rule constrains). `EPIC-009` (the public surfaces where the visual distinction between editorial and commercial must actually be legible to a visitor).

## Stories / tasks

See `BACKLOG.md`: `STORY-014` (documentation-only: write the firewall principle into `PRODUCT.md`/`DECISIONS.md` — effectively satisfied by this same documentation pass, see below). No implementation stories are scoped yet, since there is nothing to implement until a monetization feature is actually proposed — this epic is deliberately "ready to constrain," not "ready to build."

## Risks

The main risk isn't technical — it's organizational: a future monetization push, scoped under time pressure, quietly reusing `EPIC-007`'s scoring table or `EPIC-008`'s selection action for commercial purposes because it's the path of least resistance. This epic's entire value is being on record *before* that pressure exists, so that proposal gets checked against a written rule instead of relitigated from scratch.

## Open questions

- **Public naming for commercial placement** ("Featured" vs. an alternative like "Promoted"/"Sponsored"/"Partner Pick" — or reserving "Featured" for something else entirely and inventing a distinct word for commercial placement). Not decided — see `DISCOVERY-012` in `BACKLOG.md`.
- **Schema shape** for any future commercial-placement feature: a wholly separate table (recommended by this epic's own reasoning above, but not mandated) vs. columns on `events` guarded by very explicit review. See `DISCOVERY-013` in `BACKLOG.md`.
- Whether commercial placement, once built, should be visible to `EPIC-007`'s scoring query *at all* (even as a value it's explicitly forbidden from using) or should live in a table the scoring query has no credentials/joins to reach — the stronger, "can't-leak-by-accident" version of the firewall. Flagged, not decided.

## Relevant decisions

`DEC-015` (this epic's own founding principle). `DEC-014` (the three-layer model this firewall protects).
