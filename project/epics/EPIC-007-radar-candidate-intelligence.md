# EPIC-007 — Radar Candidate Intelligence

**Status:** BACKLOG — not started. Documentation/scoping only, captured 2026-10-01 per Product Owner request ("DISCOVERY + EDITORIAL INTELLIGENCE"). Part of a four-epic initiative with EPIC-008, EPIC-009, EPIC-010 — see `ROADMAP.md`'s initiative summary for how the four relate.

## Objective

Build an internal, evidence-based candidate-nomination system that surfaces potentially noteworthy events from the comprehensive database, so a human editor can review a short, high-signal list instead of the full upcoming-events table. This is an **editorial-attention prioritization system**, not a public rating system, and not a cultural-importance judgment engine — it narrows what a human looks at; it never decides what matters.

## Problem

313.events' comprehensive-coverage goal (`PRODUCT.md`, `EPIC-001`) is working as intended, but comprehensiveness creates a second problem it doesn't solve by itself: nobody — not a visitor, not Jody — can look at hundreds or (per `EPIC-001`'s own coverage goal) eventually thousands of events and tell which ones are unusually interesting, timely, rare, or culturally significant. Today there is no internal mechanism that prioritizes editorial attention at all; `radar.html`'s existing "On the Radar" page and sidebar widget are driven entirely by `editorial_article_events` — i.e., by whether the press happened to cover something, not by any evaluation of the event itself. An event with zero press coverage that is nonetheless rare, a milestone, or a Detroit-specific one-off is invisible to every existing mechanism in the product.

## Scope — V0 (buildable now, existing data only, no schema change, no AI dependency)

A **Radar Candidate Score** computed at query time (a SQL view or an admin-side query, not a stored column) from fields that already exist and are already populated going-forward:

| Signal category (from the product brief) | V0 computation from existing data |
|---|---|
| Rarity (one-time vs. repetitive) | `events.is_recurring` (real, live column — set by `cron-gottagacha.js`, `cron-visitdetroit.js`, `bigtimebingo-occurrences.js`, `submit.js`, and others) is a direct, already-populated signal: `is_recurring = false` plus no sibling rows sharing the same venue+title pattern is a legitimate "one-time" signal today. |
| Place (unusual / rarely-activated venue) | `count(*) over (partition by venue_id)` across upcoming + recent `events` gives an observed activation frequency per venue with zero new storage — a venue with 1 event in the lookback window scores differently than one with 50. |
| Scale (festival / large lineup) | `category = 'fest'` plus multi-day span (`end_date - start_date`) are both already-populated fields. |
| Press/editorial signal | `editorial_article_events` (migration_021, live, already powers `radar.html`) already supports counting **distinct** `editorial_articles.source` values matched to one event — "multiple independent outlets covered this" is a query against data the editorial cron already collects, not a new capability. |
| Negative/downranking signals | `category` (routine `nightlife`/recurring-promo-shaped titles), `is_recurring = true` with a long observed run, and `followup_dismissed`/incomplete-field state (reusing the existing Needs Follow-up field-completeness logic from `EPIC-006`) are all already-populated. |
| "Just added" / freshness (feeds EPIC-009's lens, shares the same source data) | `events.created_at` (live, trigger-maintained) needs nothing new. |

**Explainability (V0, mandatory per the product brief — "every nomination should be able to explain WHY IT SURFACED"):** the V0 score computation returns the *list of matched signal names* alongside the number, e.g. `["one_time", "rarely_activated_venue", "multi_source_press"]` — not just a number. This is a query-shape requirement, not a storage requirement, and must be true from the very first version; a score with no attached reasons is explicitly out of scope at every stage, never a "V1 nice-to-have."

**The score and its reasons are never displayed publicly anywhere** — not in `events_public`, not via the anon key, not in any response the public site reads. This needs to be a design constraint from the first line of code, not a later lockdown.

## Scope — V1+ (needs new schema, persistence, or AI, and is explicitly deferred until V0 is proven)

- **Persisting scores.** V0 computes the score live, on demand (e.g., when an editor opens the Radar workbench, `EPIC-008`). Persisting it (a `radar_candidate_score`/`radar_candidate_reasons` column on `events`, or a separate `radar_candidates` table keyed by `event_id`) is only worth the schema change once there's a real workbench reading it and a real need to avoid recomputing on every page load — do not build the storage layer speculatively ahead of `EPIC-008` needing it.
- **Milestone/anniversary detection** ("10th/25th/50th anniversary," "annual event with significant history"). Nothing in the schema today tracks an event series' history length or a founding date — `is_recurring` says "this repeats," not "this is in its Nth year." Needs either a new field an editor fills in by hand (cheapest, most honest given "never guess") or a derived count from `external_id`-linked historical rows once enough ingestion history has accumulated. Do not infer an anniversary number from a description string via AI — that is exactly the "manufactured significance" the product brief prohibits.
- **Debut/premiere detection** ("Detroit premiere," "first Detroit appearance"). No field exists for this and it cannot be safely inferred from structured data alone — this is evidence that would have to come from a description/press mention, which means either hand-entry at editorial time or AI-assisted *extraction* (not invention) from already-ingested text, gated the same way `EPIC-001`'s architecture gates LLM-assisted recipe suggestion (§7.5 of `INGESTION_PLATFORM_ARCHITECTURE.md`): a human approves what the extraction found, the extraction never writes directly.
- **Crossover/unusual-combination detection** ("electronic music + orchestra"). Requires either a sub-genre/tag model finer than the current 14-category enum (see `DISCOVERY-007`, already open and already flagged as thin-coverage-risk) or AI-assisted text classification against the description — both are explicitly V1+, and per the product brief's own instruction ("do not infer these merely because combinations sound interesting — require evidence"), any AI-assisted version of this signal must cite the specific text it drew from, not just assert the combination.
- **Detroit/regional-significance detection.** Same shape as debut/premiere above — real evidence (a named local institution, a venue/organizer history) can partly be derived from existing data (`organizers`, once `DISCOVERY-006`'s population strategy exists), but "materially connected to local culture/history" as a general claim needs either editorial hand-tagging or gated AI extraction with cited evidence, never an unverified AI assertion.
- **Detroit routing significance** (added 2026-10-03, Product Owner amendment). A broader signal family than the debut/premiere and Detroit/regional-significance items above: whether an appearance in Detroit / the Detroit Orbit is unusually significant given the act's trajectory and touring behavior. It is a candidate criterion for "Don't Miss" (`DEC-025`). Specified in full in its own section below — "Amendment (2026-10-03) — Detroit routing significance" — and not duplicated here. Neither item above is removed or changed by it.
- **Source-signal weighting** ("cultural institutions, museums, universities... warrant editorial inspection"). The `sources` registry (migration_004) has a `source_type` field already, but it's disconnected from the live pipeline (`DEC-006`, `DISCOVERY-005`) — this V1+ item is a direct, obvious consumer of `EPIC-001` Phase 1's `sources` extension once that work actually lands, not something to build against the dead copy of `sources` that exists today.
- **The feedback loop** (editorial decisions improving future prioritization). Needs `EPIC-008`'s decision log to exist first (chicken-and-egg: there is no feedback without decisions to learn from) — tracked as a dependency, not scoped further here. Must remain explainable, bounded weight adjustment on existing deterministic signals, never an opaque learned model — re-stated from the product brief's own "Learn from editorial behavior carefully" cross-epic requirement.

## Amendment (2026-10-03) — Detroit routing significance (a "Don't Miss" candidate criterion)

**Status:** BACKLOG — requirement captured 2026-10-03 per Product Owner request. Not designed, not built, not scheduled. This section **adds one criterion** to the existing candidate requirements. It does not re-specify "Don't Miss", this epic, or `EPIC-008`.

### Existing approved requirements — retrieved, unchanged

"Don't Miss" has no separate candidate engine: its candidates are nominated by this epic, decided by a human in `EPIC-008`, and published as placements under `DEC-025`. Everything below was already approved and stands exactly as written; it is listed here only so the new criterion can be read against it.

- **`DEC-025` (2026-10-03).** "Don't Miss" is a temporary editorial placement — a record pointing at an event for a period, with a reason, that expires on its own — not a property of the event. It is human-curated and scarce (typically 1–3 events, sometimes 0). No candidate is published until its exceptional factual claim has been verified against an authoritative source; an ingested or machine-written event description is not sufficient evidence.
- **The placement record** (approved with `DEC-025`): the event; a reason label written by the editor; a reason note of one factual sentence plus where the fact came from; an optional image override; a position from 1 to 3; a start date; an end date that defaults to the event's last day. The module shows placements active today whose event is still approved, at most three, and shows nothing when there are none.
- **This epic.** Nomination is evidence-based; every nomination can explain why it surfaced; the score and its reasons are never public; nothing here removes, hides or demotes an event from the comprehensive calendar; nothing here manufactures significance, rarity, popularity, premiere/debut status or cultural importance.
- **`EPIC-008`.** A human decides. Three actions only (On the Radar / Feature, Pass, Not noteworthy / Routine). Nothing is published autonomously.
- **`DEC-015` / `DEC-020`.** Editorial selection cannot be purchased; no commercial data is an input to candidate scoring.

### The criterion

Identify events where an artist, act, production or experience's appearance in Detroit / the Detroit Orbit is **unusually significant in the context of its trajectory and touring behavior**. This is broader than "rare Detroit appearance."

Signals may eventually include:

- infrequent or first Detroit appearances;
- a long time since the last Detroit/Orbit appearance;
- rapidly rising/trending acts including Detroit during a limited tour;
- Detroit being added to routing that otherwise favors larger/primary markets;
- Detroit receiving an unusual prime Friday/Saturday date;
- Detroit receiving a Monday/Tuesday routing date where the meaningful fact is that the tour included Detroit rather than bypassing it;
- an act returning after substantial audience/career growth;
- an unusually small/local venue opportunity relative to the act's current or emerging draw;
- Detroit frequency compared with relevant nearby/primary touring markets such as Chicago and Toronto.

**Do not reduce this to popularity.** The signal is the relationship between artist momentum/significance, scarcity, routing behavior and the opportunity presented to Detroit audiences. Popularity alone, however large, is not a signal.

**The engine surfaces evidence for editorial review. It does not automatically declare an event Don't Miss.**

**Reason labels.** Possible editorial reason labels can vary with the evidence, such as RARE DETROIT APPEARANCE, BREAKOUT ACT, EARLY CATCH, or UNUSUAL DETROIT STOP. These are examples of what an editor may write in a placement's reason label (see the placement record above) — not a fixed vocabulary, and not something the engine assigns.

### How it sits inside the existing requirements

- **It is a signal family, not a new system.** Each signal that fires is one more named reason on a candidate, alongside the V0 reasons, under the same mandatory explainability rule.
- **Evidence travels with the signal.** A routing signal is only reportable together with what it rests on — the dates, cities, venues and the source they came from. This is how the criterion stays inside this epic's "never manufacture" rule: momentum, scarcity and routing are read from cited evidence, never asserted.
- **Verification before publication is unchanged.** A label such as RARE DETROIT APPEARANCE states an exceptional fact. Under `DEC-025` the fact is checked against an authoritative source before any placement is published; the engine's evidence is where that check starts, not a substitute for it.
- **Never public.** Routing evidence is shown to the editor only. The public sees the editor's reason label and note, nothing computed.
- **Comprehensive coverage is untouched.** An event with no routing signal is listed exactly as before.
- **It does not replace** the debut/premiere or Detroit/regional-significance items in the V1+ list above. "First Detroit appearance" is one signal within this family; those items keep their own wording and their own gating.

### What it needs that does not exist today

Recorded so the gap is not rediscovered at build time. None of this is designed.

- **No act/artist/production entity.** An event has a title and a venue; nothing records who is appearing. Every signal above needs that first.
- **No appearance history.** The database holds a few weeks of events (this epic's own "~weeks-old live dataset"), so "time since the last Detroit appearance" cannot be derived from our own data.
- **No tour-routing or other-market data** (the rest of a tour's dates; Chicago, Toronto or other comparison markets), and **no momentum data**. No source has been chosen or evaluated for either.
- Consequently this is **V1+ only**; there is no V0 version computable from existing fields. The weekday of the Detroit date is already known, but it means nothing without the rest of the tour to compare it with.

Open decisions are tracked as `DISCOVERY-021` in `BACKLOG.md`. Not broken into stories, consistent with the rest of this epic's V1+ scope.

## Out of scope (this epic, permanently)

- Anything that would make the score, or any of its reasons, visible to the public (`EPIC-010` draws this line explicitly and this epic must not cross it unilaterally).
- Any mechanism that removes, hides, or demotes an event from the comprehensive calendar/search/filters. A low or zero Radar Candidate Score has no effect on `events_public` visibility — this is the "comprehensive coverage remains sacred" cross-epic requirement, and it must be true structurally (the score lives in admin-only tooling, not in any public query path), not just true by policy.
- Manufacturing any of: significance, rarity, popularity, historical importance, premiere/debut status, cultural significance, attendance, sellout status. Every signal above is either a direct read of existing structured data or (for V1+ text-derived signals) a cited extraction a human reviews before it counts for anything.

## Success criteria

Given the current ~weeks-old live dataset, an admin query (not yet a UI — that's `EPIC-008`) can produce a ranked list of upcoming events with an attached, legible list of matched signals per event, computable entirely from columns that exist today, with zero events removed or hidden from any public-facing query as a side effect.

## Architecture implications

V0 needs no migration — it is a read-only query/view over existing tables. The query should live in `api/_lib/` (following the project's existing shared-helper convention — e.g. alongside `venue-lookup.js`) so `EPIC-008`'s admin tab and any future batch job call the same scoring logic rather than two slightly-different copies of it (the same "build it once, reuse everywhere" principle the ingestion architecture already applies to adapters). V1's persistence layer, if and when it's built, should follow `EPIC-001`'s own migration conventions (`supabase/migration_0NN_*.sql`, idempotent, self-logging to `schema_migrations`) — this epic does not propose a competing migration convention.

## Dependencies

- **`editorial_article_events`** (live) for the press-signal category.
- **`EPIC-006`'s Needs Follow-up / field-completeness logic** (live, `admin.html`'s `getMissingFields()`) for the "insufficient event information" negative signal — reuse it, don't re-derive it.
- **`EPIC-001` Phase 1's `sources` extension** (not yet built) for source-type weighting — until then, source-signal weighting is out of reach beyond whatever `events.source`'s free-text value can crudely indicate.
- **The LEAD concept** (`DEC-016`, `INGESTION_PLATFORM_ARCHITECTURE.md` §7.9): lead presence is explicitly **not** itself evidence of noteworthiness, per the Product Owner's own instruction — a lead source pointing at a venue is a discovery mechanism, not a Radar signal. If a lead-sourced event later clears independent verification and enters normal ingestion, it's scored exactly like any other event, on its own merits, with no "came from a lead" bonus.

## Stories / tasks

See `BACKLOG.md`: `STORY-008` (V0 scoring query + explainability), `STORY-009` (negative-signal / routine-event detection, reusing `EPIC-006` field-completeness logic). V1+ items above are intentionally **not** broken into stories yet — per the product brief's own instruction to investigate existing-data opportunities first, scoping V1 stories before V0 is proven would be premature.

## Risks

The main risk is scope creep into AI-assisted "evidence extraction" before the deterministic V0 layer is proven useful to an actual editor — the product brief is explicit that deterministic signals are preferred before AI, and this epic's own sequencing (V0 fully before any V1 AI-assisted signal) is the guardrail against building the more expensive, harder-to-trust layer first just because it sounds more capable.

## Open questions

- Should "rarely-activated venue" and "distinct press source count" use a rolling lookback window (e.g. trailing 12 months), and if so, how long — no existing convention in this project sets that kind of window today.
- Whether `is_recurring` is reliably set across **all** connectors or only the newer ones listed above — worth a quick live-data audit before V0 scoring treats it as universally trustworthy (flagged here, not resolved).
- See also `DISCOVERY-010`–`DISCOVERY-013` in `BACKLOG.md` for the cross-epic open decisions this epic shares with `EPIC-008`/`EPIC-009`/`EPIC-010`.
- `DISCOVERY-021` — evidence sources and the missing act/artist entity for Detroit routing significance (added 2026-10-03).

## Relevant decisions

`DEC-014` (three-layer discovery model / editorial-independence principle). `DEC-016` (lead sources are pointers, never provenance, and never a Radar-scoring bonus). `DEC-005` ("source ≠ organizer," relevant to any future organizer-based significance signal). `DEC-006`/`DISCOVERY-005` (the `sources` registry's disconnected status, which is why source-type weighting is V1+, not V0). `DEC-025` ("Don't Miss" is a temporary, human-curated, verified editorial placement — the public destination for candidates this epic nominates, including under the Detroit routing significance criterion).
