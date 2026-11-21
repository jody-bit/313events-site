"use strict";

// Vercel: exit 0 skips a build; exit 1 builds. Compare against the last
// successful deployment, not HEAD^: earlier skipped/failed commits may
// contain runtime changes. Any uncertainty must keep the build enabled.
const { spawnSync } = require("node:child_process");

function excludedFromDeployment(file) {
  // Match only established .vercelignore exclusions. scripts/, data/,
  // assets/ and api/ contain runtime dependencies and are NOT excluded.
  return /^[^/]+\.md$/.test(file) ||
    /^assets\/(?:.*\/)?[^/]+\.md$/.test(file) ||
    /^(?:project|test|ra-sync|supabase|_to_delete|smoke)\//.test(file);
}

function decide(env = process.env, git = spawnSync) {
  const previous = env.VERCEL_GIT_PREVIOUS_SHA;
  const current = env.VERCEL_GIT_COMMIT_SHA;
  const valid = (sha) => typeof sha === "string" && /^[a-f0-9]{40,64}$/i.test(sha);
  if (!valid(previous) || !valid(current) || previous === current) {
    return { skip: false, reason: "First deployment, redeploy, or missing commit information" };
  }
  const result = git("git", ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", previous, current, "--"], {
    encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") {
    return { skip: false, reason: "Comparison unavailable; build to preserve delivery" };
  }
  const files = result.stdout.split("\0").filter(Boolean);
  const runtime = files.find((file) => !excludedFromDeployment(file));
  return runtime
    ? { skip: false, reason: "Deployable change: " + runtime }
    : { skip: true, reason: "Only excluded files changed (" + files.length + ")" };
}

if (require.main === module) {
  const result = decide();
  console.log("[deployment] " + result.reason);
  process.exitCode = result.skip ? 0 : 1;
}

module.exports = { decide, excludedFromDeployment };
