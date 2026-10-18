# Browser smoke tests (REL-1 W1, #197)

Playwright tests that load the real pages in Chromium and check what is **rendered**, cross-checked against the same
public read-only API the pages use. They are not a unit-test substitute and they never write anything.

What is covered: `/config.js` target guard, API oracle (the database has upcoming events), homepage inventory, search hit
and no-hit, calendar entries, map ready/complete/plotted, event detail page, submit form validation (no POST sent). Desktop
(1280) and phone (375) projects.

## Safety
- The suite reads `/config.js` first and **refuses to run** unless it names the staging database
  (`SMOKE_EXPECT_SUPABASE_REF`, default `efxjdlogohcggpuftivm`). A production URL is rejected.
- No credentials are needed. If a Preview has Vercel deployment protection, put the bypass secret in the encrypted
  CI secret `SMOKE_BYPASS_SECRET` (never in code or issues).

## Run
- **Prove the suite has teeth (offline, no secrets):** `cd smoke && npm ci && npx playwright install chromium && node selftest.js`.
  Passes on a good mock site, must fail when the mock inventory is empty or the API returns 500.
- **Against a deployed Preview/staging:** `SMOKE_BASE_URL=https://<preview> npx playwright test`, or the manual workflow
  "Browser smoke" (Actions tab) with `base_url`.
- Reports: `smoke-report.json`, traces and screenshots on failure.

## Not covered yet (tracked)
Admin workflows (W3 #199), scripted production smoke (W2 #198), required-check wiring (W4 #200), image rendering checks,
mobile map interaction. The mock site is a test aid only and is not a model of the real database.
