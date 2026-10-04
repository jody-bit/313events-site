#!/usr/bin/env node
"use strict";

// scripts/ra-bridge-client.js
//
// Device-side half of the RA sync GitHub Actions bridge (see
// .github/scripts/ra-sync-bridge.js and ra-sync/README.md for the full
// design). Two subcommands, both run from the repo root:
//
//   node scripts/ra-bridge-client.js submit <start|complete> <jsonFile>
//     Generates a fresh runToken, writes
//     ra-sync/inbox/<action>-<runToken>.json, commits it, and pushes to
//     the current branch. Prints ONLY the runToken to stdout on success
//     -- everything else goes to stderr, so a caller can do
//       TOKEN=$(node scripts/ra-bridge-client.js submit start payload.json)
//     without stray log lines ending up in $TOKEN.
//
//   node scripts/ra-bridge-client.js wait <start|complete> <runToken> [timeoutSec] [pollSec]
//     Polls (git fetch -- no GitHub API, no token needed) for the
//     response tag .github/scripts/ra-sync-bridge.js pushes once the
//     Action has relayed that payload, then prints the response JSON to
//     stdout. Exit code is 0 only when the relay itself reported
//     ok:true; 1 if the relay reported a failure (the JSON is still
//     printed so the caller can see why); 2 on timeout (tag never
//     appeared -- check the repo's Actions tab).
//
// Nothing here ever touches CRON_SECRET -- it lives only in GitHub
// Actions Secrets and is used only inside the Action's own environment.
// This script never talks to 313.events, Supabase, or Vercel directly;
// every network call it makes is a git operation against the GitHub
// remote this repo already pushes to.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

function repoRoot() {
  return process.env.REPO_DIR || process.cwd();
}

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: repoRoot(), encoding: "utf8" });
}

// clearStaleRefLock(name, maxAgeMs) -- guards against exactly one known
// failure mode: a prior git process (this script, another automated
// session, or a human) locked a ref (e.g. created .git/HEAD.lock or
// .git/index.lock) and exited. Normally the OS would let git (or
// anyone) unlink that leftover lock without a second thought. In this
// sandboxed checkout, though, unlink() fails (EPERM) by default every
// session (see device_request_delete_permission), so the file survives
// and blocks every later commit with a fatal "Unable to create '.git/
// HEAD.lock': File exists" even though nothing is actually running
// anymore. Confirmed 2026-10-04: a plain `git commit` + `git push` in a
// session that already has delete permission leaves no such file
// behind -- the leftover only happens when that permission isn't there
// yet, which is this sandbox's default state every session.
//
// This never races a lock that might still be live: if it's younger
// than maxAgeMs it's left alone and this throws, on the assumption
// that a concurrent git operation could still be using it. Only a lock
// older than that -- long past how long this script's own git calls
// ever take -- gets reclaimed.
function clearStaleRefLock(name, maxAgeMs = 5 * 60 * 1000) {
  const lockPath = path.join(repoRoot(), ".git", name);
  let stat;
  try {
    stat = fs.statSync(lockPath);
  } catch {
    return; // no lock -- nothing to do, the common case
  }
  const ageMs = Date.now() - stat.mtimeMs;
  if (ageMs < maxAgeMs) {
    throw new Error(
      `.git/${name} exists and is only ${Math.round(ageMs / 1000)}s old ` +
        `(< ${Math.round(maxAgeMs / 1000)}s) -- leaving it alone in case a ` +
        `concurrent git operation is still using it.`
    );
  }
  try {
    fs.unlinkSync(lockPath);
    console.error(
      `Reclaimed stale .git/${name} (age ${Math.round(ageMs / 1000)}s, left behind by an earlier process).`
    );
  } catch (err) {
    throw new Error(
      `.git/${name} is stale (age ${Math.round(ageMs / 1000)}s) but could not be removed ` +
        `(${err.code || err.message}). This checkout's sandbox denies delete by default each ` +
        `session -- grant delete permission for this folder (device_request_delete_permission) ` +
        `and re-run.`
    );
  }
}

function makeRunToken(now = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const rand = crypto.randomBytes(3).toString("hex"); // 6 hex chars
  return `${stamp}-${rand}`;
}

function currentBranch() {
  return run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
}

// pushBranch(branch) — pushes using GH_PUSH_TOKEN when it's set (the
// unattended/daily path: device_bash has read-only GitHub access, no
// ambient push credential, confirmed 2026-09-27), falling back to
// whatever ambient git auth is already configured (e.g. a human running
// this by hand in their own Terminal) when it isn't.
//
// The token's literal value is never assembled into any argv this
// process constructs, and so never appears in argv, in a thrown error's
// message, or in a process listing. It's referenced only by name
// ($GH_PUSH_TOKEN) inside a credential-helper shell snippet; git spawns
// that snippet as its own subprocess at push time and THAT subprocess
// (inheriting this one's environment) is what expands the variable --
// exactly the same "shell substitutes it, this script never sees it"
// pattern CRON_SECRET already uses for the /api/cron-ra calls.
function pushBranch(branch) {
  if (process.env.GH_PUSH_TOKEN) {
    const helper = '!f() { echo "username=x-access-token"; echo "password=$GH_PUSH_TOKEN"; }; f';
    run("git", ["-c", `credential.helper=${helper}`, "push", "origin", branch]);
    return;
  }
  run("git", ["push", "origin", branch]);
}

function cmdSubmit(action, jsonFilePath) {
  if (action !== "start" && action !== "complete" && action !== "promote") {
    throw new Error(`submit: action must be "start", "complete", or "promote", got ${JSON.stringify(action)}`);
  }
  if (!jsonFilePath) {
    throw new Error("submit: missing <jsonFile> argument");
  }
  const raw = fs.readFileSync(jsonFilePath, "utf8");
  const data = JSON.parse(raw);
  if (action === "start" && (!Array.isArray(data.candidateIds) || data.candidateIds.length === 0)) {
    throw new Error(`submit start: ${jsonFilePath} needs a non-empty "candidateIds" array`);
  }
  if (action === "complete" && (typeof data.runId !== "string" || !Array.isArray(data.events))) {
    throw new Error(`submit complete: ${jsonFilePath} needs "runId" (string) and "events" (array)`);
  }
  // "promote" needs nothing at all -- {} is a perfectly valid payload
  // (dryRun defaults false server-side); see .github/scripts/ra-sync-
  // bridge.js's own "promote" branch for the one optional field it does
  // accept.

  const runToken = makeRunToken();
  const outRel = ["ra-sync", "inbox", `${action}-${runToken}.json`].join("/");
  const outAbs = path.join(repoRoot(), outRel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  const payload = Object.assign({ runToken, action }, data);
  fs.writeFileSync(outAbs, JSON.stringify(payload, null, 2) + "\n");

  try {
    clearStaleRefLock("index.lock");
    clearStaleRefLock("HEAD.lock");
    run("git", ["add", outRel]);
    run("git", ["commit", "-m", `ra-sync: submit ${action} payload ${runToken}`]);
    pushBranch(currentBranch());
  } catch (err) {
    // Never leave outRel sitting around as an untracked file for the
    // next run (or a human's `git status`) to trip over just because
    // the commit itself didn't happen. Best-effort only -- a failure
    // here (e.g. the same delete restriction) never masks the real
    // error below.
    try {
      fs.unlinkSync(outAbs);
    } catch {
      // Can't clean up -- the caller already gets the real error.
    }
    throw err;
  }

  console.error(`Submitted ${outRel} and pushed (runToken ${runToken}).`);
  process.stdout.write(runToken + "\n");
}

function parseTagMessage(catFileOutput) {
  // Annotated tag object format: a few header lines (object/type/tag/
  // tagger), a blank line, then the message verbatim -- same shape as a
  // commit object. We only want what's after that first blank line.
  const idx = catFileOutput.indexOf("\n\n");
  if (idx === -1) throw new Error("Could not find the tag message (no blank line after tag headers)");
  return JSON.parse(catFileOutput.slice(idx + 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cmdWait(action, runToken, timeoutSec, pollSec) {
  if (action !== "start" && action !== "complete" && action !== "promote") {
    throw new Error(`wait: action must be "start", "complete", or "promote", got ${JSON.stringify(action)}`);
  }
  if (!runToken) {
    throw new Error("wait: missing <runToken> argument");
  }
  const tagName = `ra-sync/${action}-response/${runToken}`;
  const refspec = `refs/tags/${tagName}:refs/tags/${tagName}`;
  const deadline = Date.now() + timeoutSec * 1000;

  for (;;) {
    try {
      run("git", ["fetch", "origin", refspec]);
      const raw = run("git", ["cat-file", "-p", `refs/tags/${tagName}`]);
      const payload = parseTagMessage(raw);
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
      process.exitCode = payload.ok ? 0 : 1;
      return;
    } catch {
      // Tag doesn't exist yet -- keep polling until the deadline.
    }
    if (Date.now() >= deadline) {
      console.error(
        `Timed out after ${timeoutSec}s waiting for ${tagName}. The GitHub Action may still be running, ` +
          `or may have failed before pushing a response tag -- check the repo's Actions tab.`
      );
      process.exitCode = 2;
      return;
    }
    await sleep(pollSec * 1000);
  }
}

async function main() {
  const [, , sub, ...rest] = process.argv;
  if (sub === "submit") {
    const [action, jsonFilePath] = rest;
    cmdSubmit(action, jsonFilePath);
    return;
  }
  if (sub === "wait") {
    const [action, runToken, timeoutSec, pollSec] = rest;
    await cmdWait(action, runToken, Number(timeoutSec) || 600, Number(pollSec) || 15);
    return;
  }
  console.error(
    "Usage:\n" +
      "  ra-bridge-client.js submit <start|complete|promote> <jsonFile>\n" +
      "  ra-bridge-client.js wait <start|complete|promote> <runToken> [timeoutSec] [pollSec]"
  );
  process.exitCode = 1;
}

module.exports = { makeRunToken, parseTagMessage, clearStaleRefLock, cmdSubmit };

if (require.main === module) {
  main();
}
