#!/usr/bin/env node
"use strict";

// .github/scripts/ra-sync-bridge.js
//
// Runs inside the "RA Sync Bridge" GitHub Actions workflow
// (.github/workflows/ra-sync-bridge.yml). Transport only -- see that
// file's header and ra-sync/README.md for the full design. Short version:
// the device's own shell cannot reach 313.events (org egress policy), a
// GitHub Actions runner can, so this relays payloads Claude's browser
// session already committed under ra-sync/inbox/ to the unchanged
// CRON_SECRET-gated /api/cron-ra endpoint, and hands the response back as
// the MESSAGE of a pushed git tag (never a commit -- see pushResponseTag).
//
// Idempotency: before calling the API at all, this checks whether the
// response tag for a given runToken already exists on the remote. If it
// does, that runToken was already relayed and the file is skipped
// untouched -- the CRON_SECRET-gated API is never called twice for the
// same runToken via this path, which is what makes replaying/re-running
// the same payload harmless (see remoteTagExists / processEntry).
//
// Every function below except main() is pure or takes its I/O
// (fetch/exec/fs) as an argument, so test/ra-sync-bridge.test.js can
// exercise the real logic without a real network call or a real git
// push -- same "injected I/O" convention scripts/ra-sync.js's own tests
// already use.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const INBOX_FILE_RE = /^ra-sync\/inbox\/(start|complete)-([A-Za-z0-9._-]+)\.json$/;

// ---------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------

// extractInboxFiles(filePaths) -> [{ filePath, action, runToken }, ...]
// filePaths is a flat, deduped list of files added in this push (see
// changedFilesFromGitDiff below for how main() gets that list). Only
// files matching the start-/complete- inbox pattern count; everything
// else in the same push is ignored.
function extractInboxFiles(filePaths) {
  const seen = new Map(); // filePath -> {filePath, action, runToken}
  for (const filePath of Array.isArray(filePaths) ? filePaths : []) {
    const m = INBOX_FILE_RE.exec(filePath);
    if (!m) continue;
    seen.set(filePath, { filePath, action: m[1], runToken: m[2] });
  }
  return Array.from(seen.values()).sort((a, b) => a.filePath.localeCompare(b.filePath));
}

// The push event's "before" SHA when the push created a new branch (no
// prior commit to diff against).
const ZERO_SHA = "0000000000000000000000000000000000000000";

// changedFilesFromGitDiff({ execFn, cwd, before, after }) -> string[]
//
// Returns every file ADDED between `before` and `after`, via `git diff`
// against the repo actually checked out in this job -- not via the push
// event's own commits[].added lists. That field turns out not to be
// reliably populated for every push on this repo (confirmed 2026-09-28:
// a real single-commit push that genuinely added a matching file still
// produced an empty commits[].added, and the job "succeeded" having
// silently relayed nothing at all). A direct git diff has no such
// ambiguity: whatever the tree actually gained between the two commits
// is exactly what this returns.
//
// `before` may be unreachable in a shallow clone, so this fetches it
// (depth 1 is enough -- only the blob/tree at that one commit is
// needed for the diff, not its own history) before diffing. Returns []
// for the "pushed a brand-new branch" case (before === ZERO_SHA), since
// there's nothing to diff against; main() falls back to the event's own
// commits[].added for that one edge case only.
function changedFilesFromGitDiff({ execFn, before, after }) {
  if (!before || !after || before === ZERO_SHA) return [];
  execFn("git", ["fetch", "--depth=1", "origin", before]);
  const out = execFn("git", ["diff", "--name-status", "--diff-filter=A", before, after]);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      return tab === -1 ? null : line.slice(tab + 1).trim();
    })
    .filter(Boolean);
}

// parsePayloadFile(entry, rawContent) -> { action, runToken, requestBody }
// Throws a plain Error with a clear message on anything malformed --
// processEntry turns that into an {ok:false} response tag rather than
// crashing the whole job, so one bad file in a push never hides a good
// one alongside it.
function parsePayloadFile(entry, rawContent) {
  let data;
  try {
    data = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(`Could not parse ${entry.filePath} as JSON: ${err.message}`);
  }
  if (!data || typeof data !== "object") {
    throw new Error(`${entry.filePath}: payload must be a JSON object`);
  }
  if (data.runToken !== entry.runToken) {
    throw new Error(
      `${entry.filePath}: payload runToken (${JSON.stringify(data.runToken)}) does not match the one in its filename (${entry.runToken})`
    );
  }

  if (entry.action === "start") {
    if (!Array.isArray(data.candidateIds) || data.candidateIds.length === 0) {
      throw new Error(`${entry.filePath}: "start" payload needs a non-empty candidateIds array`);
    }
    // listingMetadata is optional (older payloads and any caller that
    // hasn't adopted it yet still work unchanged) but must be a plain
    // object when present -- same fail-closed-on-malformed posture this
    // function already uses for candidateIds/runId/events, rather than
    // silently dropping a bad value through to the API. The API itself
    // (scripts/ra-sync.js's sanitizeListingMetadata) does its own
    // per-field whitelist/type validation; this is just the shape check.
    if (
      data.listingMetadata !== undefined &&
      (typeof data.listingMetadata !== "object" || data.listingMetadata === null || Array.isArray(data.listingMetadata))
    ) {
      throw new Error(`${entry.filePath}: "listingMetadata", when present, must be a plain object keyed by id`);
    }
    const requestBody = { action: "start", candidateIds: data.candidateIds };
    if (data.listingMetadata !== undefined) requestBody.listingMetadata = data.listingMetadata;
    return {
      action: "start",
      runToken: entry.runToken,
      requestBody,
    };
  }

  if (entry.action === "complete") {
    if (typeof data.runId !== "string" || !data.runId) {
      throw new Error(`${entry.filePath}: "complete" payload needs a runId string`);
    }
    if (!Array.isArray(data.events)) {
      throw new Error(`${entry.filePath}: "complete" payload needs an events array (may be empty)`);
    }
    return {
      action: "complete",
      runToken: entry.runToken,
      requestBody: { action: "complete", runId: data.runId, events: data.events },
    };
  }

  throw new Error(`${entry.filePath}: unrecognized action ${entry.action}`);
}

function responseTagName(action, runToken) {
  return `ra-sync/${action}-response/${runToken}`;
}

// ---------------------------------------------------------------------
// I/O, all injectable
// ---------------------------------------------------------------------

// remoteTagExists(tagName, { execFn }) -> boolean
function remoteTagExists(tagName, { execFn }) {
  const out = execFn("git", ["ls-remote", "--tags", "origin", `refs/tags/${tagName}`]);
  return out.trim().length > 0;
}

// callCronRa({ apiUrl, cronSecret, requestBody, fetchFn }) -> { ok, status, json, error }
// Never throws -- a network-level failure and an HTTP-level failure both
// come back as a normal return value, so callers handle both the same
// way. CRON_SECRET is used here and only here; it's never included in
// what's returned.
async function callCronRa({ apiUrl, cronSecret, requestBody, fetchFn }) {
  let resp;
  try {
    resp = await fetchFn(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    return { ok: false, status: null, json: null, error: `network error calling ${apiUrl}: ${err.message}` };
  }
  let json = null;
  try {
    json = await resp.json();
  } catch {
    // non-JSON body -- leave json null, fall through to the ok/status check
  }
  if (!resp.ok) {
    return { ok: false, status: resp.status, json, error: (json && json.error) || `HTTP ${resp.status}` };
  }
  return { ok: true, status: resp.status, json, error: null };
}

// pushResponseTag({ tagName, message, execFn }) — creates an annotated tag
// at the current HEAD and pushes ONLY that tag ref. No commit is created
// or touched, and a branch-push-triggered workflow (this one included)
// never fires again from a tag push.
function pushResponseTag({ tagName, message, execFn }) {
  execFn("git", ["tag", "-a", tagName, "-m", message]);
  execFn("git", ["push", "origin", `refs/tags/${tagName}`]);
}

// ---------------------------------------------------------------------
// Orchestration for one file
// ---------------------------------------------------------------------

async function processEntry(entry, { apiUrl, cronSecret, fetchFn, execFn, readFileFn, log }) {
  const tagName = responseTagName(entry.action, entry.runToken);

  if (remoteTagExists(tagName, { execFn })) {
    log(`SKIP  ${entry.filePath} -- ${tagName} already exists on origin (already relayed; harmless replay)`);
    return { filePath: entry.filePath, runToken: entry.runToken, action: entry.action, ok: true, skipped: true };
  }

  let responsePayload;
  try {
    const raw = readFileFn(entry.filePath, "utf8");
    const parsed = parsePayloadFile(entry, raw);
    const result = await callCronRa({ apiUrl, cronSecret, requestBody: parsed.requestBody, fetchFn });
    responsePayload = {
      ok: result.ok,
      runToken: entry.runToken,
      action: entry.action,
      httpStatus: result.status,
      response: result.json,
      error: result.error,
    };
  } catch (err) {
    responsePayload = {
      ok: false,
      runToken: entry.runToken,
      action: entry.action,
      httpStatus: null,
      response: null,
      error: err.message,
    };
  }

  const message = JSON.stringify(responsePayload, null, 2);
  pushResponseTag({ tagName, message, execFn });
  log(`${responsePayload.ok ? "OK  " : "FAIL"}  ${entry.filePath} -- pushed ${tagName}`);
  return { filePath: entry.filePath, runToken: entry.runToken, action: entry.action, ok: responsePayload.ok, skipped: false };
}

// ---------------------------------------------------------------------
// main() — real I/O only from here down
// ---------------------------------------------------------------------

async function main() {
  const cronSecret = process.env.CRON_SECRET;
  const apiUrl = process.env.RA_SYNC_API_URL || "https://313.events/api/cron-ra";
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const cwd = process.env.GITHUB_WORKSPACE || process.cwd();

  if (!cronSecret) {
    console.error("CRON_SECRET is not set (expected a GitHub Actions secret) -- refusing to run.");
    process.exitCode = 1;
    return;
  }
  if (!eventPath || !fs.existsSync(eventPath)) {
    console.error(`GITHUB_EVENT_PATH (${eventPath}) not found -- this script only runs inside the push-triggered workflow.`);
    process.exitCode = 1;
    return;
  }

  execFileSync("git", ["config", "user.name", "ra-sync-bridge[bot]"], { cwd });
  execFileSync("git", ["config", "user.email", "ra-sync-bridge@users.noreply.github.com"], { cwd });

  const execFn = (cmd, args) => execFileSync(cmd, args, { cwd, encoding: "utf8" });

  const eventPayload = JSON.parse(fs.readFileSync(eventPath, "utf8"));

  // Primary: a direct git diff between the push's before/after SHAs --
  // see changedFilesFromGitDiff's own header for why this replaced
  // trusting the event's commits[].added lists.
  let changedFiles = changedFilesFromGitDiff({ execFn, before: eventPayload.before, after: eventPayload.after });

  // Fallback, new-branch case only (before === ZERO_SHA, nothing to
  // diff against): fall back to whatever commits[].added the event
  // itself reports, better-than-nothing for a case this repo's own
  // ra-bridge-client.js never actually triggers (it only ever pushes to
  // the existing main branch).
  if (changedFiles.length === 0 && eventPayload.before === ZERO_SHA) {
    const commits = Array.isArray(eventPayload.commits) ? eventPayload.commits : [];
    changedFiles = commits.flatMap((c) => (Array.isArray(c && c.added) ? c.added : []));
  }

  const entries = extractInboxFiles(changedFiles);

  if (entries.length === 0) {
    console.log("No new ra-sync/inbox/{start,complete}-*.json files in this push -- nothing to relay.");
    return;
  }

  console.log(`Relaying ${entries.length} new payload file(s): ${entries.map((e) => e.filePath).join(", ")}`);

  const deps = {
    apiUrl,
    cronSecret,
    fetchFn: fetch,
    execFn,
    readFileFn: (p, enc) => fs.readFileSync(path.join(cwd, p), enc),
    log: (msg) => console.log(msg),
  };

  const results = [];
  for (const entry of entries) {
    results.push(await processEntry(entry, deps));
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`${failed.length} of ${results.length} payload(s) failed -- see the pushed response tag(s) for detail.`);
    process.exitCode = 1;
  }
}

module.exports = {
  extractInboxFiles,
  changedFilesFromGitDiff,
  ZERO_SHA,
  parsePayloadFile,
  responseTagName,
  remoteTagExists,
  callCronRa,
  pushResponseTag,
  processEntry,
};

if (require.main === module) {
  main();
}
