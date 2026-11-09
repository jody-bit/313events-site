# Definition of Done (project-wide)

Authority: owner decision, Jody, 2026-10-18 04:07Z (Mission Control: add automated smoke-test coverage as a mandatory component of the Definition of Done). Applies to every workstream and every implementation work package, including EPIC-001 (#97), ADMIN-001 (#164) and all future work. Release & Quality (R&Q, workstream:release-quality) owns enforcement. This is the single authoritative Definition of Done; other documents link here and do not restate it. Extended 2026-10-18 by owner decision, Jody 04:33Z (REL-001 directive, section 04).

This document adds to, and does not replace, the owner-authorization rules in CLAUDE.md (no production SQL, merges to main, deploys, branch deletion or destructive cleanup without the owner's explicit word) and the release flow in ENVIRONMENTS.md.

## Executable software changes: completion requires all 13

Owner decision, Jody 2026-10-18 04:33Z (REL-001 directive, section 04), extending the 04:07Z decision above.

1. Acceptance criteria satisfied.
2. Appropriate automated tests added or updated.
3. Relevant regression coverage.
4. Required CI checks passing on the exact head being merged.
5. Preview/staging verification: smoke tests pass against the actually deployed Preview or staging environment, not only local unit tests.
6. Safe post-deployment smoke testing: read-only checks against production after deployment.
7. Required security checks (authorization, input validation, secrets handling, and public-boundary checks proportionate to the change).
8. Appropriate telemetry and error visibility.
9. Data-quality safeguards where applicable.
10. Rollback or recovery procedure written down, with the rollback target named.
11. Documentation updated.
12. Evidence recorded (template below).
13. Independent R&Q acceptance where required.

Every new production capability must also have an appropriate way to detect when it stops working (a monitor, a run-log or telemetry signal, a scheduled check, or an alert), recorded in the evidence. A capability that can fail silently is not DONE.

Do not mark a feature DONE merely because code was merged.

## Status ladder and authority

Status is a claim about evidence. Each step has an exact workflow and an authority. A step is entered only when its evidence exists. Merge does not skip steps.

| Status | Meaning | Workflow to enter | Who may set it | Evidence required |
|---|---|---|---|---|
| IMPLEMENTED | The change exists in a branch or PR and its author's own tests pass locally. | Author pushes a branch/PR with tests. | The implementing workstream. | PR link, commit SHA, local test output. |
| VALIDATED | Independently checked before release. | Required CI passes on the exact head; Preview/staging deployed for that head and smoke-tested; security, data-quality and rollback items (7, 9, 10) reviewed; for AI-generated tests, the independent validation described under Rules. | R&Q, never the author of the change or its tests. | CI run link; Preview/staging deployment ID and URL; smoke results; R&Q PASS verdict naming the head SHA. A moved head voids VALIDATED. |
| DEPLOYED | The validated head is running in production. | Owner's explicit word to merge (merges to main auto-deploy); R&Q executes the merge with the expected head SHA. | Merge by R&Q on the owner's word only. Status recorded by R&Q. | Owner's quoted merge word, merge SHA, production deployment ID READY and aliased. |
| VERIFIED IN PRODUCTION | The deployed change works in production and is observable. | Read-only production smoke passes; telemetry/error visibility and the "detects when it stops working" signal are confirmed present; for data changes, a read-only data check. | R&Q (public checks may be run by the Mac session on the owner's words). | Production smoke results with UTC timestamp and deployment ID; evidence of the detection signal. |
| DONE | Acceptance criteria met, all 13 items satisfied, evidence recorded. | R&Q confirms the evidence template is complete and no exception is open. | R&Q recommends; DONE is final when the owner accepts, or when the work package's recorded rule delegates acceptance to R&Q. | Completed release-evidence template, link in the PR or issue. |

Rules for the ladder:
- A status may go down. A failed production smoke returns the item to DEPLOYED with an incident opened; a moved head returns it to IMPLEMENTED.
- Reports distinguish reported from verified: a thread's claim that a step happened is "reported" until the evidence above is checked.
- Statuses never merge into a single "done" in reports (CLAUDE.md: keep investigation, implementation, review and deployment states distinct).
- Production data corrections follow the same ladder, with the owner's SQL authorization taking the place of the merge word at DEPLOYED, and a read-back plus public check at VERIFIED IN PRODUCTION.

## Design, research and planning work (non-runtime)

Work packages without executable behavior (research, design specs, requirements, backlog and roadmap documents, policies) are exempt from items 4-8 and 10. The work package states in one line why runtime smoke testing is not applicable. They still need:

1. Stated acceptance criteria, agreed before the work starts.
2. Sources and evidence cited (files, queries, issues), with reported versus verified distinguished.
3. Independent review by a workstream other than the author; for anything R&Q will later verify, R&Q reviews testability.
4. Open questions and owner decisions listed explicitly, never decided silently.
5. Updated documentation in the single authoritative location (no competing copies).
6. Follow-up work packages created or linked, each with an owner and a release gate.
7. Owner acceptance recorded where the document sets policy.

Non-runtime statuses: DRAFT, REVIEWED, ACCEPTED (by the owner). They are never reported as DEPLOYED or VERIFIED.

## Rules

- Tests are deterministic and reproducible. AI-assisted test generation is encouraged, but generated tests are independently validated (a second reviewer or a deliberate failing run) before they count.
- Browser-based smoke tests cover the affected critical journeys: event discovery and search; event detail pages; calendar and map; event submission; admin authentication; the review queue; event editing and approval; image upload and rendering.
- API and data tests cover the affected contract, authorization, persistence, publication status and data integrity.
- Required automated tests run in CI. A failure blocks merge unless the owner approves a documented exception in the PR.
- Update existing tests when behavior intentionally changes. Never remove, skip or weaken a test only to obtain a PASS.
- Production smoke tests are read-only and non-destructive: they never create, approve, reject, modify or delete real event records, and they use no admin secret unless the owner runs them. Mutating checks (approve/reject, submit, upload) run only on Preview/staging or on a designated test row the owner names.
- A failed required smoke test blocks release approval. A post-deployment failure triggers incident triage and a rollback assessment by severity.
- R&Q does not author the tests or rules it verifies for the same change (separation of duties).

## Release evidence template (paste into the PR or the R&Q log)

```
Work package / PR:
Status reached (IMPLEMENTED / VALIDATED / DEPLOYED / VERIFIED IN PRODUCTION / DONE):
Commit SHA (head and merge):
Deployment ID and URL (Preview or staging; production):
Test suite name and version (e.g. node test/run-all.js at <sha>; browser smoke suite and version):
Environment tested (local / CI / Preview / staging / production):
Execution timestamp (UTC):
Results (pass/fail counts; link to run or log):
Failures and disposition (fixed / excepted by owner with link / blocks release):
Exceptions (owner words quoted, or none):
Detection signal (how we learn this capability stopped working):
Rollback target and procedure:
Release approval (owner words quoted, with message reference):
Production smoke (read-only) result:
R&Q verdict (PASS / CHANGES REQUIRED) and verifier:
```

## Enforcement (R&Q)

- R&Q will not give a PASS without the evidence above for the exact head.
- Required checks: the CI `test` job (scope guard, full suite, and the suite again with the clock shifted +120 days) must pass on every PR. The exact branch-ruleset configuration is recorded in the REL-1 W4 work package once read. A browser smoke job should be added to CI as a further required check once it exists (see gaps in the R&Q inventory); until then browser smoke is recorded as manual release evidence.
- R&Q checks that a PR changing behavior contains new or changed tests, and rejects a diff that deletes or loosens assertions without an explained reason.
- Owner exceptions are recorded in the PR with the owner's quoted words.
