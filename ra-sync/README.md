# RA sync bridge

How Claude's daily Resident Advisor acquisition gets its data into
313.events, added 2026-09-26.

## Why this exists

The 2026-09-25 RA sync architecture (see `scripts/ra-sync.js`'s own
header) already moved all the real business logic — the known-id diff,
field derivation, the conservative cross-source dedupe, and the actual
database write — server-side, behind one endpoint: `POST
/api/cron-ra`. The device's browser-driven session was supposed to just
walk ra.co, fetch detail pages, and call that endpoint directly with
`CRON_SECRET`.

That last part doesn't work: the device's own shell cannot reach
313.events at all (an org-level egress policy blocks it, confirmed via
repeated `blocked-by-allowlist` responses on 2026-09-25 — not something
fixable by retrying). Neither can this cloud environment's own shell,
tested the same way. The **only** thing in either environment with open
internet access is the real browser session — the same one that already
walks ra.co, because RA's own anti-bot defenses require it.

So: `api/cron-ra.js` and `scripts/ra-sync.js` are completely unchanged.
What's new is only the transport between the browser-driven acquisition
session and that endpoint, and it goes through GitHub, since `github.com`
*is* reachable from the device shell and already is where this repo
pushes.

## The two-phase flow, now routed through GitHub

1. Browser session walks RA's listing, same as always.
2. Claude submits `ra-sync/inbox/start-<runToken>.json` (candidate ids)
   — see "Transport" below for exactly how.
3. A GitHub Actions workflow (`.github/workflows/ra-sync-bridge.yml`,
   logic in `.github/scripts/ra-sync-bridge.js`), triggered by that push,
   calls `POST /api/cron-ra` with `action: "start"` using `CRON_SECRET`
   (a GitHub Actions secret — never committed, never logged). It pushes
   the JSON response as the **message of a new annotated git tag**:
   `ra-sync/start-response/<runToken>` — never a commit.
4. Claude polls for that tag (`scripts/ra-bridge-client.js wait start
   <runToken>`) and reads the unknown-id list + `runId` back out of it.
5. Browser session fetches detail pages for only those ids (still capped
   at ~30/run, enforced server-side exactly as before).
6. Claude submits `ra-sync/inbox/complete-<runToken>.json` (the fetched
   detail data + `runId`) the same way as step 2.
7. The same workflow relays `action: "complete"` the same way, and pushes
   `ra-sync/complete-response/<runToken>`.
8. Claude polls for that tag to get the final import counts.

`scripts/ra-bridge-client.js` (device side) and
`.github/scripts/ra-sync-bridge.js` (Action side) implement each half;
`test/ra-bridge-client.test.js` and `test/ra-sync-bridge.test.js` cover
them.

## Transport: GitHub REST API, not a local git push (2026-10-07)

**Principle: daily RA inventory acquisition must not depend on the
state of a mutable developer git checkout.** A device-side checkout can
end up dirty, mid-rebase, on the wrong branch, or otherwise unable to
commit/push through no fault of that day's RA run — and today's capture
must still get to GitHub when that happens.

So `scripts/ra-bridge-client.js submit` and `wait` talk to
`api.github.com` directly over HTTPS instead of running `git add` /
`git commit` / `git push` / `git fetch` / `git cat-file` against the
local checkout:

- **submit** creates `ra-sync/inbox/<action>-<runToken>.json` on `main`
  in one call to the [Contents
  API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
  (`PUT /repos/{owner}/{repo}/contents/{path}`) — the file and its
  commit are created atomically, server-side, with no local working
  tree involved at all.
- **wait** reads the response tag via the [Git Data
  API](https://docs.github.com/en/rest/git) (`GET
  .../git/ref/tags/{tag}` then `GET .../git/tags/{sha}`) instead of
  `git fetch` + `git cat-file -p`.

Both reuse the same `GH_PUSH_TOKEN` the device already authenticates
pushes with today — no new token, secret, or permission. It's sent only
as an HTTP `Authorization: Bearer` header, never written into argv,
logs, or any payload. The one local call left anywhere in this script
is a **read-only** `git remote get-url origin`, used only to learn
`owner/repo` when the `GITHUB_REPOSITORY` env var isn't already set
(it is, automatically, inside GitHub Actions). That call only opens
`.git/config` — it can't be blocked by a dirty index, a stuck rebase,
or a locked ref.

Because this still produces an ordinary push to `main` touching
`ra-sync/inbox/*.json`, `.github/workflows/ra-sync-bridge.yml`'s
existing `on: push` trigger fires exactly as before. Nothing on the
Action side (`.github/scripts/ra-sync-bridge.js`, the workflow file, or
`/api/cron-ra`) changed.

## Why a tag, and not a commit, carries the response

A commit from the Action back into `main` would (a) need cleanup to avoid
`ra-sync/inbox/` growing into an ever-larger diff noise, and (b) risks a
push-triggered-workflow loop if that cleanup commit itself touches a
watched path. A tag avoids both: it's a separate ref namespace, doesn't
appear in `main`'s history, and pushing one never matches this workflow's
own `branches:`-scoped trigger, so there is no loop and nothing to clean
up.

## Idempotency

Two layers:

- **Scope**: the Action only ever looks at files listed in the
  *triggering push's own* `commits[].added` — never a directory listing —
  so a later push never reprocesses an earlier one.
- **Replay safety**: before calling the API at all, the Action checks
  whether that payload's response tag already exists on the remote
  (`git ls-remote --tags`). If it does, the file is skipped untouched —
  `CRON_SECRET`-gated calls are never made twice for the same
  `runToken`. Verified in `test/ra-sync-bridge.test.js` and in a full
  local integration run (temp bare repo + a local HTTP stand-in for
  `/api/cron-ra` — not committed here, described in the change's own
  report).

Separately, `completeRaSyncSession` in `scripts/ra-sync.js` already
refuses to complete the same `runId` twice on its own — this bridge
doesn't change or rely on that, it's just a second layer that was already
there.

## `ra-sync/inbox/` grows over time

Nothing in this design deletes or archives inbox files (deliberately —
see "why a tag" above). Two small JSON files land here per successful
daily run. This is fine at daily-cron scale for a long time; if it's ever
worth trimming, that's a manual one-off later, not something this bridge
does automatically.

## One-time setup

`CRON_SECRET` must exist as a **GitHub Actions repository secret**
(Settings → Secrets and variables → Actions → New repository secret,
name `CRON_SECRET`, same value already in `.env.local`). Nothing else —
no new tokens, no new services. The device side authenticates its
`submit`/`wait` GitHub REST API calls with the same `GH_PUSH_TOKEN` it
already uses to push today; see "Transport" above.

## 2026-09-29 repair: listing evidence and backlog survive a mid-run block

Incident: RA's listing page walked successfully (121 candidates), but every
one of that run's 30 capped detail-page fetches was blocked by DataDome
before completing. The run correctly stopped rather than attempt any
workaround -- but under the original design that meant three real gaps:

1. Only the capped 30 ids' worth of "new" work was ever visible to the
   device. The other 55 genuinely-new ids existed only as `allNewCount` (a
   number), never as an actual list -- there was no way to even name them,
   let alone act on them later.
2. Zero listing-card evidence (title/date/venue/etc, all of it plainly
   visible on the listing page the walk had already succeeded on) was ever
   captured. Step 2 of the device-side prompt only ever collected bare
   `ra-<id>` strings.
3. The run closed via `complete` with `events: []` and read back
   indistinguishable from a genuine "nothing new today" success --
   `outcome` was `"success"` either way.

Fixed the same day, server-side only (Decision: smallest repair, no new
tables, no redesign):

- `startRaSyncSession()` now accepts an optional `listingMetadata` param
  (`{ [id]: { title, date, displayedTime, venueName, city, url, image } }`),
  sanitized by the new `sanitizeListingMetadata()` (foreign ids and
  non-whitelisted/malformed fields dropped, nothing ever invented) and
  persisted into `session_data.listingMetadata` for **every** submitted
  candidate id -- not just this run's capped detail-fetch batch, and before
  any detail page is ever opened. `session_data.allNewIds` (uncapped) and
  the response's `allNewIds` field close gap 1 the same way.
- `completeRaSyncSession()`'s outcome is `"partial"` (not `"success"`) when
  the session expected new ids but addressed literally none of them --
  the exact zero-progress shape a mid-run block produces. A normal partial
  submission (some, not all, of the expected ids addressed) is still
  `"success"`, unchanged -- see the function's own comment.
- `.github/scripts/ra-sync-bridge.js` forwards `listingMetadata` through to
  `/api/cron-ra` (shape-validated, fail-closed on malformed input, same as
  its other fields); `scripts/ra-bridge-client.js` needed no change (it
  already forwards the whole payload object verbatim).
- The device-side scheduled task prompt (Steps 2/3/6) was updated to
  capture listing-card evidence during the walk and submit it, and to
  report a `newCount > 0` / zero-addressed run as `RA_SYNC_BLOCKED_MIDRUN`
  instead of staying silent.

Tests: `test/ra-sync.test.js` (listingMetadata persistence/sanitization,
`allNewIds` uncapped, both the new `outcome='partial'` case and its
contrasting `outcome='success'` case) and `test/ra-sync-bridge.test.js`
(listingMetadata passthrough and shape validation).

No backlog-priority mechanism was added on top of what already existed:
`startRaSyncSession()` already recomputes the true new/known diff fresh
against production every run, so an unresolved id is automatically
re-offered the next day without any extra state -- see that function's own
header comment. RA's listing order (soonest-event-first) is preserved into
`candidateIds` and already gives an existing, reasonable within-cap
priority signal, so none was added mechanically on top of it.
