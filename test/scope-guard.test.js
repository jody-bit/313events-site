// test/scope-guard.test.js — the CI scope guard (scripts/scope-guard.js): deterministic base, explicit allow-list,
// and it FAILS LOUDLY when it cannot establish the diff. Each case builds a throwaway git repository.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const G = require(path.join(__dirname, "..", "scripts", "scope-guard.js"));

const git = (cwd, ...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.org", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "scope-guard-"));
  git(d, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(d, "README.md"), "base\n");
  git(d, "add", "-A"); git(d, "commit", "-qm", "base");
  git(d, "update-ref", "refs/remotes/origin/main", "HEAD"); // stands in for the fetched origin/main
  git(d, "checkout", "-q", "-b", "work");
  return d;
}
function commit(d, files) {
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); }
  git(d, "add", "-A"); git(d, "commit", "-qm", "change");
}
const throwsGuard = (fn, re) => assert.throws(fn, (e) => e instanceof G.ScopeGuardError && re.test(e.message));

// the default base is the deterministic origin/main
assert.strictEqual(G.DEFAULT_BASE, "origin/main");

// 1. in-scope change passes
{
  const d = repo(); commit(d, { "seasonal/x.js": "1" });
  const r = G.check({ cwd: d });
  assert.deepStrictEqual(r.violations, []); assert.deepStrictEqual(r.changed, ["seasonal/x.js"]);
}
// 2. protected files fail, each family
for (const f of ["index.html", "admin.html", "api/cron-feeds.js", "api/_lib/environment.js", "assets/guides/other.webp", "supabase/migrations/001.sql"]) {
  const d = repo(); commit(d, { [f]: "x" });
  assert.deepStrictEqual(G.check({ cwd: d, allowed: [] }).violations, [f], f + " is out of scope");
}
// 3. allow-list is by exact path: an allowed file passes, a sibling does not, a prefix does not
{
  const d = repo(); commit(d, { "index.html": "x", "api/seasonal-qa.js": "x", "api/_lib/seasonal-editorial/entries.json": "{}" });
  assert.deepStrictEqual(G.check({ cwd: d }).violations, []);
  const e = repo(); commit(e, { "api/seasonal-qa.js": "x", "api/seasonal-qa-extra.js": "x", "api/_lib/seasonal-editorial/new-private-file.json": "{}", "api/_lib/seasonal-editorial/sub/entries.json": "{}", "index.html.bak": "x" });
  assert.deepStrictEqual(G.check({ cwd: e }).violations.sort(), ["api/_lib/seasonal-editorial/new-private-file.json", "api/_lib/seasonal-editorial/sub/entries.json", "api/seasonal-qa-extra.js", "index.html.bak"]);
}
// 4. FAIL LOUDLY when the base is unavailable (this is what used to pass silently)
{
  const d = repo(); commit(d, { "index.html": "x" });
  git(d, "update-ref", "-d", "refs/remotes/origin/main");
  throwsGuard(() => G.check({ cwd: d }), /not available/);
  throwsGuard(() => G.check({ cwd: d, base: "origin/does-not-exist" }), /not available/);
  throwsGuard(() => G.check({ cwd: d, base: "deadbeef" }), /not available/);
  throwsGuard(() => G.check({ cwd: path.join(os.tmpdir(), "not-a-repo-" + process.pid) }), /not available/);
}
// 5. FAIL LOUDLY with no common history, and on an empty diff
{
  const d = repo(); commit(d, { "a.txt": "1" });
  git(d, "checkout", "-q", "--orphan", "other"); fs.writeFileSync(path.join(d, "b.txt"), "2"); git(d, "add", "-A"); git(d, "commit", "-qm", "unrelated");
  throwsGuard(() => G.check({ cwd: d }), /share no history/);
  const e = repo();
  throwsGuard(() => G.check({ cwd: e }), /empty diff/);
}
// 6. the base can be pinned to a sha (deterministic), and the pin is honoured over the default
{
  const d = repo(); commit(d, { "index.html": "1" });
  const sha = git(d, "rev-parse", "HEAD").trim();
  commit(d, { "seasonal/y.js": "2" });
  assert.deepStrictEqual(G.check({ cwd: d, base: sha }).changed, ["seasonal/y.js"]);
  assert.deepStrictEqual(G.check({ cwd: d, allowed: [] }).violations, ["index.html"], "against origin/main the index.html change is protected unless it is allow-listed");
}
// 7. the CLI exits non-zero with a clear message (never silently)
{
  // the CLI always checks its own repository, so exercise it through SCOPE_GUARD_BASE on this checkout
  const bad = (() => { try { execFileSync(process.execPath, [path.join(__dirname, "..", "scripts", "scope-guard.js")], { env: Object.assign({}, process.env, { SCOPE_GUARD_BASE: "no-such-ref" }), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); return { code: 0 }; } catch (e) { return { code: e.status, err: String(e.stderr) }; } })();
  assert.strictEqual(bad.code, 1); assert.ok(/scope guard FAILED/.test(bad.err) && /no-such-ref/.test(bad.err));
}
// 8. the allow-list contains only exact, existing, non-wildcard paths
for (const f of G.ALLOWED) {
  assert.ok(!/[*?[\]]/.test(f) && !f.endsWith("/"), f + " must be an exact path");
  assert.ok(G.PROTECTED.test(f), f + " is on the allow-list but is not a protected path (stale entry)");
  assert.ok(fs.existsSync(path.join(__dirname, "..", f)), f + " is on the allow-list but does not exist");
}
console.log("scope-guard: ok");
