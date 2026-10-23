# 313.events — development operating model

This file is read automatically by Claude Code sessions working in this
repository. It exists so that any session — regardless of which Claude
conversation or thread it was started from — applies the same ownership,
routing, and safety rules without the owner having to repeat them.

GitHub (issues, PRs, labels) is the authoritative record of development
status. This file documents durable structure and procedure; it is not a
backlog and should not accumulate task-specific state.

## Mission Control master prompt

Cross-workstream coordination (authoritative records, owner-authorization
gates, GO lifecycle, evidence tags, status ladder) is consolidated in
`mission-control/MASTER-PROMPT.md` v1.0 in the Project shared folder (not
in this repository). This file remains the repository engineering
authority; the master prompt does not replace or relax anything here.

## The five workstreams

Every PR and issue should carry one `workstream:*` label for its primary
owner. A second `workstream:*` label marks a supporting workstream when
work spans domains — assign exactly one primary, never split ownership.

| Label | Owns |
|---|---|
| `workstream:release-quality` | Production readiness, PR release review, CI/regression testing, deployment verification, migration safety, rollback planning, release acceptance, cross-workstream release coordination |
| `workstream:experience` | Visual design, brand consistency, UX, responsive layouts, photography and image provenance, accessibility presentation, visual regression testing |
| `workstream:event-intelligence` | Event discovery, source research and qualification, event/venue verification, coverage gaps, source-specific editorial rules, event data accuracy, discovery-to-review workflows |
| `workstream:platform` | Software architecture, ingestion infrastructure, cron jobs and automation, database engineering, Supabase, source connector implementation, self-healing, reliability/observability, performance and scaling |
| `workstream:editorial-products` | On the Radar, seasonal editorial collections, neighborhood editorial content, editorial programming, special features and guides, publication standards and content strategy |

`coordinator:main-dev` marks work that is itself coordination rather than
implementation: work intake, workstream routing, backlog triage,
cross-workstream dependencies, repository/worktree coordination, progress
consolidation, duplicate-work prevention, escalation to the owner. A
session wearing this label should not silently take over another
workstream's implementation work.

## Routing a new task

1. Identify its primary workstream from the table above.
2. Check for an existing GitHub issue before opening a new one.
3. Check open PRs and branches for related or duplicate work in flight.
4. Label primary (and supporting, if any).
5. Note dependencies and a release gate (normally `workstream:release-quality`)
   in the issue/PR description.
6. State the routing decision in the PR/issue, not only in chat.

### Worked examples (from the owner's original brief)

- New event source (e.g. a city/venue feed): primary `event-intelligence`,
  supporting `platform`, release gate `release-quality`.
- Seasonal photography: primary `experience`, supporting
  `editorial-products`, release gate `release-quality`.
- Description/metadata self-healing: primary `platform`, supporting
  `event-intelligence`, release gate `release-quality`.

## Permanent operating rules

- Never create a new workstream when an existing one can own the task.
- Never implement the same task in multiple threads/branches independently
  — check GitHub and any available handoff notes first.
- Never assume another thread's work is complete without checking GitHub
  or its handoff; a prior session's own summary is not authoritative where
  it disagrees with `git fetch`, the PR list, or the Project.
- Every implementation needs an identifiable owning workstream and a
  release gate.
- Keep investigation, implementation, review, and deployment states
  distinct — don't collapse them into a single "done."
- Do not silently close unfinished work; if blocked, say what's blocking
  it and who needs to decide.
- Preserve the data contract: comprehensive, reliable, current,
  professionally organized.
- Preserve approved brand and layout decisions (`workstream:experience`
  is the home for brand/visual precedent).
- No production SQL, merges to `main`, deploys, branch deletion, or other
  destructive cleanup (`git reset --hard`, `git clean`, worktree pruning)
  without the owner's explicit authorization in that conversation. Default
  to preserving local/unpushed work over discarding it.

## Session handoffs

A session ending mid-work should leave a handoff rather than assume the
next session will reconstruct context: what's done, what's uncommitted,
what's blocked, and what needs the owner's decision. Verify claims against
a fresh `git fetch` and the GitHub PR/issue list before trusting them —
handoffs can go stale between being written and being read.

## Definition of Done

Every work package must meet `project/DEFINITION_OF_DONE.md` (automated tests, CI, deployed-environment smoke tests, read-only production smoke, release evidence, R&Q acceptance). R&Q enforces it.
