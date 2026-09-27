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
2. Claude commits `ra-sync/inbox/start-<runToken>.json` (candidate ids)
   and pushes.
3. A GitHub Actions workflow (`.github/workflows/ra-sync-bridge.yml`,
   logic in `.github/scripts/ra-sync-bridge.js`), triggered by that push,
   calls `POST /api/cron-ra` with `action: "start"` using `CRON_SECRET`
   (a GitHub Actions secret — never committed, never logged). It pushes
   the JSON response as the **message of a new annotated git tag**:
   `ra-sync/start-response/<runToken>` — never a commit.
4. Claude polls for that tag (`scripts/ra-bridge-client.js wait start
   <runToken>` — plain `git fetch`, no GitHub API token needed) and reads
   the unknown-id list + `runId` back out of it.
5. Browser session fetches detail pages for only those ids (still capped
   at ~30/run, enforced server-side exactly as before).
6. Claude commits `ra-sync/inbox/complete-<runToken>.json` (the fetched
   detail data + `runId`) and pushes.
7. The same workflow relays `action: "complete"` the same way, and pushes
   `ra-sync/complete-response/<runToken>`.
8. Claude polls for that tag to get the final import counts.

`scripts/ra-bridge-client.js` (device side) and
`.github/scripts/ra-sync-bridge.js` (Action side) implement each half;
`test/ra-sync-bridge.test.js` covers both.

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
no new tokens, no new services. Everything else here only uses git
operations against this repo's own GitHub remote, which the device
already authenticates for pushes today.
