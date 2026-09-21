# EPIC-001 — Product Owner Decisions (Appendix A)

Imported verbatim from `INGESTION_PLATFORM_ARCHITECTURE.md` Appendix A, "Decisions needed from Jody." Identifiers (A1–A12) are preserved exactly as the architecture doc numbers them — they are referenced by these numbers throughout the phase files and must not be renumbered. **None of these is decided here.** This file tracks what's open and what it blocks; it does not resolve anything.

The architecture doc states explicitly: "None of them blocks Phase 0." Per the Product Owner's own routing instruction, a decision that blocks a later phase must not be treated as blocking unrelated earlier work — the "Blocks" column below is authoritative for each decision's actual scope of effect, and phase files elsewhere in this epic only cite a decision where it's genuinely relevant to that phase.

| # | Decision | Options | Architecture's recommendation | Blocks | Status |
|---|---|---|---|---|---|
| A1 | Job trigger | (a) Supabase `pg_cron` + `pg_net` calling the worker every 5 min; (b) Vercel Cron sub-daily (plan-dependent); (c) GitHub Actions schedule | (a): no plan dependency, lives with the queue | Phase 2 | **UNDECIDED** |
| A2 | Pipeline may **create unverified venues** | Keep "never create" / allow create-as-unverified with review | Allow, as unverified plus a `venue_new` issue. Needed for geography at scale (§5.5). | Phase 4 | **UNDECIDED** |
| A3 | Resident Advisor (and Instagram) capture practice | (a) pursue RA partnership, pause agent-driven pulls; (b) human-read-and-enter only; (c) continue knowingly | (a) + (b) in the interim. See §7.8 for the reasoning. | Phase 8 | **UNDECIDED** — equivalent to `DISCOVERY-001` in `BACKLOG.md`; see that entry for the fuller history (including that an earlier framing in this project understated the ToS issue). |
| A4 | Render worker for JS-only sources | None / GitHub Actions Playwright / small container host | Defer until probing shows ≥ 10 permitted JS-only P0–P1 sources. Then GitHub Actions. | Phase 8 | **UNDECIDED** (architecture's own recommendation is to defer, not to decide now) |
| A5 | Auto-publish thresholds | Per §2.7 table | Start conservative: T1/T2 only, completeness ≥ 60, street-precision geo. Loosen by measured overturn rate. | Phase 2 | **UNDECIDED** |
| A6 | Geocoding provider for Canada (and US fallback) | Nominatim (policy-limited, free) / commercial (check result-storage terms) | Census (US) + Nominatim (ON, low volume, cached). Revisit if Ontario volume grows. | Phase 4 | **UNDECIDED** |
| A7 | Raw snapshot retention | 7 / 14 / 30 days; errors-only after N days | 14 days for all, 90 days for failed or changed-parse runs (fixture material) | Phase 1 (though the retention-prune implementation itself is cited in WP 2.6, Phase 2 — noted as a cross-document nuance, not resolved) | **UNDECIDED** |
| A8 | Near-boundary places | Keep 75.0 strict (Saginaw 75.4, Clinton County 75.4, Hillsdale 75.5 out) / adopt a tolerance | Keep strict. Out-of-orbit records are retained (§4.3), so a later change is a recomputation. | — (blocks nothing; a standing policy choice) | **UNDECIDED** |
| A9 | Online-only events | Exclude / include when the organizer is in the Orbit | Include, flagged `online`, excluded from Orbit counts and the map | Phase 2 | **UNDECIDED** |
| A10 | Category mix targets | For the category-balance metric | Set after the Phase 1 baseline | Phase 7 | **UNDECIDED** — the architecture's own recommendation is to defer this decision until Phase 1 baseline data exists, not to decide it now. |
| A11 | Outreach ownership | Who sends partnership / feed requests (Scarab, Communico, GrowthZone, RA, CrowdWork) | Jody, with drafted asks generated from registry rows | Phase 5 (though explicit WP citations for this appear in Phase 6 — WP 6.7, 6.13 — a cross-document nuance, not resolved) | **UNDECIDED** |
| A12 | LLM-assisted extraction budget | For the recipe suggester and the capture tool | Admin-triggered only, never on the scheduled path | Phase 8 (though the explicit WP citation is WP 6.14, Phase 6 — a cross-document nuance, not resolved) | **UNDECIDED** |

## What this means for scheduling

- **Phase 0 is entirely unblocked by this list.** All 19 Phase 0 WPs can be groomed and scheduled without waiting on any decision here (two of them, 0.13 and 0.14, need a separate, smaller Phase-0-specific OK from Jody — see `phase-0-stabilize-instrument.md` — that is not an Appendix A item).
- **Phase 1, Phase 3, Phase 6 (aside from the specific WPs noted above), Phase 7 (aside from 7.9/7.10), and Phase 9 are not blocked by any Appendix A decision.** They are blocked by their own architecture gates and WP dependency chains (see each phase file), not by an unresolved product decision.
- **Phase 2 needs A1, A5, and A9 resolved** before its gated WPs (2.3/2.14 for A1; 2.8 for A5; 2.1 relates to A9) can be considered fully scoped, though the phase's Opus 5 architecture gate is the more immediate blocker regardless.
- **Phase 4 needs A2 and A6 resolved** before WP 4.4 and WP 4.2 respectively can proceed, in addition to that phase's own Opus 5 gate.
- **Phase 8 needs A3 and A4 resolved** — this is the most decision-dependent phase in the program.
- **A8 and A10 block nothing directly** and can be decided whenever convenient — A8 is a standing policy choice, and A10 the architecture itself recommends deferring until Phase 1 data exists.
