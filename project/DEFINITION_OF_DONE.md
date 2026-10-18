# Definition of Done (project-wide)

Authority: owner decision, Jody, 2026-10-18 04:07Z (Mission Control: add automated smoke-test coverage as a mandatory component of the Definition of Done). Applies to every workstream and every implementation work package, including EPIC-001 (#97), ADMIN-001 (#164) and all future work. Release & Quality (R&Q, workstream:release-quality) owns enforcement.

This document adds to, and does not replace, the owner-authorization rules in CLAUDE.md (no production SQL, merges to main, deploys, branch deletion or destructive cleanup without the owner's explicit word) and the release flow in ENVIRONMENTS.md.

## A work package is DONE only when all of these hold

1. Acceptance criteria are satisfied.
2. Appropriate automated tests exist (new or updated) for the feature, fix or behavior change, scaled to its scope.
3. Required CI checks pass on the exact head being merged.
4. Smoke tests pass against the actually deployed Preview or staging environment, not only local unit tests.
5. After deployment, safe read-only smoke tests pass against production.
6. Release evidence is recorded (template below).
7. R&Q accepts the verification evidence.

Work packages without executable behavior (research, design specs, planning documents) are exempt from runtime smoke testing, but the work package must state in one line why runtime smoke testing is not applicable.

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
Commit SHA (head and merge):
Deployment ID and URL (Preview or staging; production):
Test suite name and version (e.g. node test/run-all.js at <sha>; browser smoke suite and version):
Environment tested (local / CI / Preview / staging / production):
Execution timestamp (UTC):
Results (pass/fail counts; link to run or log):
Failures and disposition (fixed / excepted by owner with link / blocks release):
Production smoke (read-only) result:
R&Q verdict (PASS / CHANGES REQUIRED) and verifier:
```

## Enforcement (R&Q)

- R&Q will not give a PASS without the evidence above for the exact head.
- Required GitHub checks on main: the CI `test` job (scope guard, full suite, and the suite again with the clock shifted +120 days). A browser smoke job should be added to CI as a further required check once it exists (see gaps in the R&Q inventory); until then browser smoke is recorded as manual release evidence.
- R&Q checks that a PR changing behavior contains new or changed tests, and rejects a diff that deletes or loosens assertions without an explained reason.
- Owner exceptions are recorded in the PR with the owner's quoted words.
