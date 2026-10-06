# Environments and release flow

313.events keeps the existing Vercel + Supabase + vanilla-JS stack. This adds
one non-production database and a release discipline. It is deliberately small.

## Topology

| | Local / dev | Staging (Preview) | Production |
|---|---|---|---|
| App | `node test/run-all.js`; optional `vercel dev` | Every Vercel **Preview** deployment (branch/PR) | Vercel **Production** (`main`) |
| Database | In-memory PostgREST fake (tests); optional local Supabase | **Second Supabase project** ("313events-staging") | Existing production project |
| Crons | Never | **Do not run** (Vercel schedules crons for Production deployments only); manual invocation allowed against staging | Scheduled (`vercel.json`) |
| Data | Fixtures | `supabase/staging/seed_staging.sql` (synthetic) + sanitized venue reference (SZ-15) | Real |

## Code-level safety (already in the repo)

- `api/_lib/environment.js`: "production" means `VERCEL_ENV=production`, nothing else.
- Every API function that holds the service-role key calls `assertDatabaseAllowed(SUPABASE_URL)` at load. A non-production deployment configured with the production database **refuses to start**. Override exists only with the exact phrase in `OVERRIDE_PHRASE` in `ALLOW_PRODUCTION_DATABASE` (never set it).
- Pages load `/config.js` (`api/config.js`), which serves `SUPABASE_URL` and the publishable key from the deployment's env. Production falls back to its own values; non-production has **no fallback** and serves a loud error if misconfigured.
- Facebook posting runs only in production. Emails/sitemaps/canonical URLs use the deployment's own URL outside production.
- `test/no-hardcoded-production.test.js` fails CI if the production Supabase host or key reappears in source.

## Environment variables

Set these per Vercel environment (Settings → Environment Variables). Never commit values.

| Variable | Production | Preview (staging) | Notes |
|---|---|---|---|
| `SUPABASE_URL` | production project URL | **staging** project URL | Preview must NOT equal production (guard enforces) |
| `SUPABASE_ANON_KEY` | publishable key (optional; has fallback) | staging publishable key | Public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | production | **staging** | Secret. Different value per environment |
| `CRON_SECRET` | production | any value, different from production | |
| `ADMIN_SECRET` | production | different value | |
| `TICKETMASTER_API_KEY`, `TAVILY_API_KEY` | production | leave **unset** (or a low-quota key) | Unset = connector does nothing |
| `RESEND_API_KEY`, `SUBMISSION_NOTIFY_EMAIL` | production | leave **unset** | Staging sends no email |
| `FACEBOOK_*` | production | leave **unset** | Also blocked in code |
| `APP_ENV` | `production` **only if** Vercel's system env vars are off | unset | See merge gate below |
| `WEB_SEARCH_ENRICHMENT_ENABLED` | unset (closed) | unset | Stays closed (BUG-010) |

## MERGE GATE for this change (Product Owner check, before merging to `main`)

The production-vs-non-production decision reads `VERCEL_ENV`. In Vercel → Project → Settings → Environment Variables, confirm **"Automatically expose System Environment Variables"** is checked. If it is NOT, add `APP_ENV=production` to the **Production** environment first. Without one of these, production would be treated as non-production and the database guard and `/config.js` would fail. Rollback is Vercel Instant Rollback.

## Release flow

1. Branch from `main`; push. CI (`.github/workflows/ci.yml`) runs all tests.
2. Vercel builds a Preview deployment on the staging database. Verify there (see checklist).
3. Open a pull request; require CI green. Merge to `main` deploys production.
4. Production smoke check (below). Roll back with Vercel "Instant Rollback" (promote the previous production deployment) if it fails.

Schema changes: apply to **staging first**, verify, then production, before the code that depends on them. One migration per change; enum additions standalone.

### Preview verification checklist
- `/config.js` returns the staging project URL (not the production host).
- Home, Calendar, Map, a venue page and an event page render seeded data.
- Submitting the form lands a row in **staging** only.
- `GET /api/cron-<x>` without the secret is rejected (or returns "not configured").

### Production smoke check
- Home count > 0; an event page and the sitemap load; `/config.js` shows the production host; the next daily health check is green.

## Staging bootstrap procedure

Project: `313events-staging` (Supabase ref `efxjdlogohcggpuftivm`). Schema comes only from `supabase/migrations/` (see its README).

1. **Schema:** apply `20261006000000_baseline_schema.sql`, `20261006000001_reference_data.sql`, then `20261006000002_baseline_grants.sql` (legacy production grants, to be tightened by SZ-01), to staging. (Either Claude through the Supabase connector once approved, or `supabase db push` linked to the staging project. Never link the CLI to production for this.)
2. **Verify:** run `supabase/verify/catalog_fingerprint.sql` and `supabase/verify/grants_check.sql` (expect 13/13) on staging; every hash must equal the production run recorded in the Sprint Zero report.
3. **Seed:** run `supabase/staging/seed_staging.sql` (synthetic, idempotent). Optionally load the sanitized venue snapshot from SZ-15.
4. **Wire up:** set the Preview-scoped Vercel variables (matrix above) to the staging URL/keys; redeploy a Preview; check `/config.js` names the staging project.
5. **First forward migration through the flow:** apply `supabase/proposed/` (gaming category) to staging, verify, and only then ask for production approval.

Account-level steps (Vercel variables, GitHub branch protection) stay with the Product Owner.
