#!/usr/bin/env node
"use strict";

// scripts/ra-bridge-client.js
//
// Device-side half of the RA sync GitHub Actions bridge (see
// .github/scripts/ra-sync-bridge.js and ra-sync/README.md for the full
// design). Two subcommands, both run from the repo root:
//
//   node scripts/ra-bridge-client.js submit <start|complete|promote> <jsonFile>
//     Generates a fresh runToken and creates
//     ra-sync/inbox/<action>-<runToken>.json directly on the remote's
//     main branch via the GitHub REST Contents API (one HTTPS call).
//     Prints ONLY the runToken to stdout on success -- everything else
//     goes to stderr, so a caller can do
//       TOKEN=$(node scripts/ra-bridge-client.js submit start payload.json)
//     without stray log lines ending up in $TOKEN.
//
//   node scripts/ra-bridge-client.js wait <start|complete|promote> <runToken> [timeoutSec] [pollSec]
//     Polls the GitHub REST Git Data API (no git fetch, no local
//     checkout involved) for the response tag
//     .github/scripts/ra-sync-bridge.js pushes once the Action has
//     relayed that payload, then prints the response JSON to stdout.
//     Exit code is 0 only when the relay itself reported ok:true; 1 if
//     the relay reported a failure (the JSON is still printed so the
//     caller can see why); 2 on timeout (tag never appeared -- check the
//     repo's Actions tab).
//
// 2026-10-07: rewritten to drop the local git checkout as a dependency
// for BOTH commands. The previous version wrote the inbox file to disk
// and ran `git add` / `git commit` / `git push`, and polled with `git
// fetch` + `git cat-file` -- all of which require a clean, push-able
// local working tree. A stuck/dirty/mid-rebase checkout (see this
// file's git history, 2026-10-04 and 2026-10-07) could then block the
// one thing -- getting today's RA payload to GitHub -- that must never
// depend on local developer git state. Every network operation here is
// now a plain HTTPS call to api.github.com using the exact same
// GH_PUSH_TOKEN the old git-push path already used; nothing else
// changed about what gets sent or what comes back. The one remaining
// local call is a READ-ONLY `git remote get-url origin` (to learn
// owner/repo when GITHUB_REPOSITORY isn't set) -- that only opens
// .git/config and cannot be blocked by a stuck rebase, a dirty index,
// or this sandbox's delete restriction.
//
// Nothing here ever touches CRON_SECRET -- it lives only in GitHub
// Actions Secrets and is used only inside the Action's own environment.
// This script never talks to 313.events, Supabase, or Vercel directly;
// every network call it makes is a GitHub REST API call authenticated
// with GH_PUSH_TOKEN, which is never written into argv, logs, or
// payloads -- only ever read from the environment and placed into an
// HTTP Authorization header.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

function repoRoot() {
  return process.env.REPO_DIR || process.cwd();
}

// run(cmd, args) -- the one local git call this script still makes
// (inside repoSlug's fallback path): a read-only `git remote get-url
// origin`. Kept as its own tiny wrapper, injectable as `runFn`, so
// tests never need a real git repo on disk.
function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: repoRoot(), encoding: "utf8" });
}

function makeRunToken(now = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const rand = crypto.randomBytes(3).toString("hex"); // 6 hex chars
  return `${stamp}-${rand}`;
}

// repoSlug() -- "owner/repo", preferring (in order): GITHUB_REPOSITORY
// (set automatically inside GitHub Actions; harmless to also allow it
// device-side), then RA_BRIDGE_REPO (explicit override, e.g. for
// tests), then parsing the local origin remote -- the one read-only
// git call described above.
function repoSlug({ env = process.env, runFn = run } = {}) {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  if (env.RA_BRIDGE_REPO) return env.RA_BRIDGE_REPO;
  const url = runFn("git", ["remote", "get-url", "origin"]).trim();
  const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/);
  if (!m) {
    throw new Error(`Could not parse "owner/repo" out of git remote origin URL: ${url}`);
  }
  return `${m[1]}/${m[2]}`;
}

// ghRequest(method, urlPath, opts) -- thin wrapper around fetch for the
// GitHub REST API. `token`, if given, is placed only in the
// Authorization header -- never in urlPath, body, or any log/error
// message this module produces. Returns { status, ok, body } where
// `body` is the parsed JSON response (or { raw: <text> } if the
// response wasn't valid JSON, e.g. an empty 204).
async function ghRequest(method, urlPath, { token, body, fetchFn = fetch } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "313events-site-ra-bridge-client",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetchFn(`https://api.github.com${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

async function cmdSubmit(
  action,
  jsonFilePath,
  { env = process.env, fetchFn = fetch, runFn = run, readFileFn = fs.readFileSync, log = console.error } = {}
) {
  if (action !== "start" && action !== "complete" && action !== "promote") {
    throw new Error(`submit: action must be "start", "complete", or "promote", got ${JSON.stringify(action)}`);
  }
  if (!jsonFilePath) {
    throw new Error("submit: missing <jsonFile> argument");
  }
  const raw = readFileFn(jsonFilePath, "utf8");
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
  const payload = Object.assign({ runToken, action }, data);
  const content = JSON.stringify(payload, null, 2) + "\n";
  const outRel = ["ra-sync", "inbox", `${action}-${runToken}.json`].join("/");
  const branch = env.RA_BRIDGE_BRANCH || "main";
  const slug = repoSlug({ env, runFn });

  // Single atomic call: creates the file and the commit together. No
  // local file is ever written, so there is nothing to clean up if this
  // fails -- the previous git-based version's "leftover untracked file"
  // failure mode doesn't exist anymore.
  const res = await ghRequest("PUT", `/repos/${slug}/contents/${outRel}`, {
    token: env.GH_PUSH_TOKEN,
    fetchFn,
    body: {
      message: `ra-sync: submit ${action} payload ${runToken}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
    },
  });
  if (!res.ok) {
    const reason = (res.body && res.body.message) || `HTTP ${res.status}`;
    throw new Error(`submit ${action}: GitHub Contents API create failed for ${outRel}: ${reason}`);
  }

  log(`Submitted ${outRel} via GitHub API (runToken ${runToken}, branch ${branch}).`);
  process.stdout.write(runToken + "\n");
  return runToken;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cmdWait(
  action,
  runToken,
  timeoutSec,
  pollSec,
  { env = process.env, fetchFn = fetch, runFn = run, log = console.error, sleepFn = sleep, now = Date.now } = {}
) {
  if (action !== "start" && action !== "complete" && action !== "promote") {
    throw new Error(`wait: action must be "start", "complete", or "promote", got ${JSON.stringify(action)}`);
  }
  if (!runToken) {
    throw new Error("wait: missing <runToken> argument");
  }
  const tagName = `ra-sync/${action}-response/${runToken}`;
  const slug = repoSlug({ env, runFn });
  const token = env.GH_PUSH_TOKEN;
  const deadline = now() + timeoutSec * 1000;

  for (;;) {
    const refRes = await ghRequest("GET", `/repos/${slug}/git/ref/tags/${tagName}`, { token, fetchFn });
    if (refRes.ok && refRes.body && refRes.body.object && refRes.body.object.sha) {
      const tagRes = await ghRequest("GET", `/repos/${slug}/git/tags/${refRes.body.object.sha}`, { token, fetchFn });
      if (tagRes.ok && typeof tagRes.body.message === "string") {
        const payload = JSON.parse(tagRes.body.message);
        process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
        process.exitCode = payload.ok ? 0 : 1;
        return payload;
      }
    }
    // Tag doesn't exist yet (404) or wasn't readable yet -- keep polling
    // until the deadline, same as the old git-fetch-based version did
    // for "tag not found".
    if (now() >= deadline) {
      log(
        `Timed out after ${timeoutSec}s waiting for ${tagName}. The GitHub Action may still be running, ` +
          `or may have failed before pushing a response tag -- check the repo's Actions tab.`
      );
      process.exitCode = 2;
      return undefined;
    }
    await sleepFn(pollSec * 1000);
  }
}

async function main() {
  const [, , sub, ...rest] = process.argv;
  if (sub === "submit") {
    const [action, jsonFilePath] = rest;
    await cmdSubmit(action, jsonFilePath);
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

module.exports = { makeRunToken, repoSlug, ghRequest, cmdSubmit, cmdWait };

// Node's global `fetch` does NOT read HTTP_PROXY/HTTPS_PROXY on its own --
// confirmed 2026-10-07 on the device: `curl` and `git` (both proxy-aware)
// reach api.github.com fine through this environment's allowlist proxy,
// while a plain `fetch()` call fails DNS resolution outright (EAI_AGAIN),
// because it never goes through the proxy at all. Node 22 ships a real fix
// for exactly this, gated behind a flag: `--use-env-proxy` (confirmed
// working on this device's Node v22.23.2). Rather than require every
// caller to remember to pass that flag, the CLI entrypoint re-execs itself
// with it added whenever a proxy is configured and it isn't already
// active -- one extra short-lived child process, invisible to anything
// that just runs `node scripts/ra-bridge-client.js ...` the way the header
// comment documents. This never affects `require("./ra-bridge-client.js")`
// (tests, or any other caller importing the functions directly) -- only
// the `require.main === module` CLI path re-execs.
if (require.main === module) {
  const hasProxyEnv =
    process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (hasProxyEnv && !process.env.NODE_USE_ENV_PROXY) {
    // NODE_USE_ENV_PROXY=1 is Node's own env-var equivalent of the
    // --use-env-proxy flag -- setting it (not just the flag) for the
    // child is what lets this guard see "already handled" on the child's
    // own startup and not re-spawn forever.
    const { spawnSync } = require("child_process");
    const result = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      stdio: "inherit",
      env: Object.assign({}, process.env, { NODE_USE_ENV_PROXY: "1" }),
    });
    process.exit(result.status == null ? 1 : result.status);
  } else {
    main();
  }
}
