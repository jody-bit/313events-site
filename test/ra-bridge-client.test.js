// test/ra-bridge-client.test.js — scripts/ra-bridge-client.js's stale
// ref-lock recovery (clearStaleRefLock) and the cleanup it enables in
// cmdSubmit when a commit doesn't happen. Added 2026-10-04 alongside
// the fix itself -- see that function's own header comment for the
// failure mode this closes. Plain Node assert, no dependencies,
// matching this repo's existing style (see test/ra-sync.test.js).
// Run: node test/ra-bridge-client.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const client = require("../scripts/ra-bridge-client.js");

function mkTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ra-bridge-client-test-"));
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "Test"]);
  // Need at least one commit so "git add"/"git commit" behave normally.
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
  execFileSync("git", ["-C", dir, "add", "README.md"]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "seed"]);
  return dir;
}

async function run() {
  // ============================================================
  // Part 1: clearStaleRefLock — no lock file at all.
  // ============================================================
  {
    const dir = mkTmpRepo();
    const prevRepoDir = process.env.REPO_DIR;
    process.env.REPO_DIR = dir;
    try {
      assert.doesNotThrow(() => client.clearStaleRefLock("HEAD.lock"));
    } finally {
      process.env.REPO_DIR = prevRepoDir;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // ============================================================
  // Part 2: clearStaleRefLock — a lock younger than the threshold is
  // left alone (never raced) and a clear, specific error is thrown.
  // ============================================================
  {
    const dir = mkTmpRepo();
    const lockPath = path.join(dir, ".git", "HEAD.lock");
    fs.writeFileSync(lockPath, "");
    const prevRepoDir = process.env.REPO_DIR;
    process.env.REPO_DIR = dir;
    try {
      assert.throws(
        () => client.clearStaleRefLock("HEAD.lock", 5 * 60 * 1000),
        /exists and is only .*old.*leaving it alone/
      );
      // Still there -- a young lock is never touched.
      assert.ok(fs.existsSync(lockPath));
    } finally {
      process.env.REPO_DIR = prevRepoDir;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // ============================================================
  // Part 3: clearStaleRefLock — a lock older than the threshold is
  // reclaimed silently (from the caller's point of view: no throw,
  // and it's gone).
  // ============================================================
  {
    const dir = mkTmpRepo();
    const lockPath = path.join(dir, ".git", "HEAD.lock");
    fs.writeFileSync(lockPath, "");
    const oldMs = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    const oldSec = oldMs / 1000;
    fs.utimesSync(lockPath, oldSec, oldSec);
    const prevRepoDir = process.env.REPO_DIR;
    process.env.REPO_DIR = dir;
    try {
      assert.doesNotThrow(() => client.clearStaleRefLock("HEAD.lock", 5 * 60 * 1000));
      assert.ok(!fs.existsSync(lockPath));
    } finally {
      process.env.REPO_DIR = prevRepoDir;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // ============================================================
  // Part 4: cmdSubmit — when the commit step fails (a young, so
  // untouched, stale-looking lock blocks it, standing in here for any
  // commit-time failure), the inbox JSON it already wrote to disk does
  // NOT survive as an untracked file. This is the actual bug this
  // change closes: a failed submit used to leave litter behind for
  // the next run (or `git status`) to trip over.
  // ============================================================
  {
    const dir = mkTmpRepo();
    const lockPath = path.join(dir, ".git", "HEAD.lock");
    fs.writeFileSync(lockPath, ""); // fresh -- cmdSubmit must not race it
    const payloadPath = path.join(os.tmpdir(), `ra-bridge-client-test-payload-${Date.now()}.json`);
    fs.writeFileSync(payloadPath, JSON.stringify({ candidateIds: ["ra-1"] }));

    const prevRepoDir = process.env.REPO_DIR;
    process.env.REPO_DIR = dir;
    try {
      assert.throws(
        () => client.cmdSubmit("start", payloadPath),
        /HEAD\.lock exists and is only/
      );
      const inboxDir = path.join(dir, "ra-sync", "inbox");
      const leftover = fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir) : [];
      assert.deepStrictEqual(leftover, [], `expected no leftover inbox files, found: ${leftover}`);
      // And git itself agrees nothing untracked snuck in.
      const status = execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" });
      assert.strictEqual(status, "");
    } finally {
      process.env.REPO_DIR = prevRepoDir;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log("All ra-bridge-client tests passed.");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
