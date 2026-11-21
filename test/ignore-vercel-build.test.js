"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { decide, excludedFromDeployment } = require("../scripts/ignore-vercel-build");

const env = { VERCEL_GIT_PREVIOUS_SHA: "a".repeat(40), VERCEL_GIT_COMMIT_SHA: "b".repeat(40) };
const changes = (...files) => () => ({ status: 0, stdout: files.join("\0") + "\0" });
const ignored = fs.readFileSync(path.join(__dirname, "../.vercelignore"), "utf8").split("\n").map((line) => line.trim());
for (const pattern of ["/*.md", "/assets/**/*.md", "/project/", "/test/", "/ra-sync/", "/supabase/", "/_to_delete/", "/smoke/"]) {
  assert(ignored.includes(pattern), "build-skip allowlist must stay aligned with .vercelignore: " + pattern);
}
assert.equal(decide(env, changes("README.md", "project/BACKLOG.md", "test/new.test.js")).skip, true);
for (const file of ["calendar.html", "api/sitemap.js", "scripts/venue-geography.js", "data/events.json", "assets/photo.webp", "seasonal/page.js", "vercel.json", ".vercelignore", "api/_lib/readme.md"]) {
  assert.equal(decide(env, changes("README.md", file)).skip, false, file);
}
for (const file of ["smoke/fixture.json", "assets/seasonal/credits.md", "assets/credits.md", "ra-sync/inbox/batch.json", "supabase/migrations/change.sql"]) {
  assert.equal(excludedFromDeployment(file), true, file);
}
assert.equal(decide({}).skip, false);
assert.equal(decide({ ...env, VERCEL_GIT_PREVIOUS_SHA: env.VERCEL_GIT_COMMIT_SHA }).skip, false);
assert.equal(decide({ ...env, VERCEL_GIT_PREVIOUS_SHA: "--unsafe" }).skip, false);
assert.equal(decide(env, () => ({ status: 128, stdout: "" })).skip, false);
assert.equal(decide(env, () => ({ status: null, error: new Error("timeout") })).skip, false);

// Exercise real Git: a runtime edit in an earlier commit must still build,
// even if the newest commit only changes documentation. Renames must also
// evaluate both the removed and added paths, including names with newlines.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-build-test-"));
// CI preloads this using a relative NODE_OPTIONS path. Keep the same clock
// in the child process even though its working directory is a temp repo.
fs.mkdirSync(path.join(temp, "test/fixtures"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "fixtures/shift-clock.js"), path.join(temp, "test/fixtures/shift-clock.js"));
function git(...args) {
  const r = spawnSync("git", args, { cwd: temp, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function commit(name) {
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", name);
  return git("rev-parse", "HEAD");
}
const runGit = (command, args, options) => spawnSync(command, args, { ...options, cwd: temp });
try {
  git("init", "-q");
  fs.writeFileSync(path.join(temp, "calendar.html"), "original");
  fs.writeFileSync(path.join(temp, "README.md"), "original");
  const base = commit("baseline");
  fs.writeFileSync(path.join(temp, "README.md"), "notes");
  const docs = commit("docs only");
  assert.equal(decide({ VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_GIT_COMMIT_SHA: docs }, runGit).skip, true);
  const cli = (previous, current) => spawnSync(process.execPath, [path.join(__dirname, "../scripts/ignore-vercel-build.js")], {
    cwd: temp, encoding: "utf8", env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous, VERCEL_GIT_COMMIT_SHA: current },
  });
  assert.equal(cli(base, docs).status, 0, "Vercel skips excluded-only changes");
  fs.writeFileSync(path.join(temp, "calendar.html"), "changed");
  commit("runtime change");
  fs.writeFileSync(path.join(temp, "README.md"), "more notes");
  const current = commit("later docs");
  assert.equal(decide({ VERCEL_GIT_PREVIOUS_SHA: docs, VERCEL_GIT_COMMIT_SHA: current }, runGit).skip, false);
  assert.equal(cli(docs, current).status, 1, "Vercel builds accumulated runtime changes");
  fs.renameSync(path.join(temp, "calendar.html"), path.join(temp, "calendar\nnotes.md"));
  const renamed = commit("rename runtime file to document");
  assert.equal(decide({ VERCEL_GIT_PREVIOUS_SHA: current, VERCEL_GIT_COMMIT_SHA: renamed }, runGit).skip, false);
  assert.equal(decide({ VERCEL_GIT_PREVIOUS_SHA: "0".repeat(40), VERCEL_GIT_COMMIT_SHA: renamed }, runGit).skip, false);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../vercel.json"), "utf8"));
assert.equal(config.ignoreCommand, "node scripts/ignore-vercel-build.js");
console.log("ok (build skipping preserves runtime changes, renames, redeploys and missing history)");
