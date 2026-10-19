// test/ra-sync-inbox-branch.test.js — the ra-sync-inbox transport (owner-approved 2026-10-19):
// payloads go to a dedicated branch, never to main, and a dispatch (not a push to main) triggers the relay.
// Everything is local: injected fetch, throwaway git repositories under the OS temp dir, no network, no secret.
// Run: node test/ra-sync-inbox-branch.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const bridge = require(path.join(root, ".github/scripts/ra-sync-bridge.js"));
const client = require(path.join(root, "scripts/ra-bridge-client.js"));
const SHA = "a".repeat(40);

function fakeRes(status, bodyObj) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(bodyObj) };
}
function tmpJson(obj) {
  const p = path.join(os.tmpdir(), `ra-inbox-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
}
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

async function run() {
  // ---- entryFromDispatch: strict allow-list ----
  {
    const e = bridge.entryFromDispatch({ action: "start", runToken: "20261019-131815-f9f5f5", sha: SHA });
    assert.strictEqual(e.filePath, "ra-sync/inbox/start-20261019-131815-f9f5f5.json");
    for (const bad of [
      { action: "delete", runToken: "t1", sha: SHA },
      { action: "start", runToken: "../../etc/passwd", sha: SHA },
      { action: "start", runToken: "a/b", sha: SHA },
      { action: "start", runToken: "t1; rm -rf /", sha: SHA },
      { action: "start", runToken: "..", sha: SHA },
      { action: "start", runToken: "t1", sha: "main" },
      { action: "start", runToken: "t1", sha: "--upload-pack=x" },
      { action: "start", runToken: "t1", sha: SHA.toUpperCase() },
      { action: "start", runToken: "", sha: SHA },
      null,
    ]) assert.throws(() => bridge.entryFromDispatch(bad), undefined, "rejects " + JSON.stringify(bad));
  }

  // ---- findUnrelayed (reconcile) ----
  {
    const inboxPaths = ["ra-sync/inbox/start-t1.json", "ra-sync/inbox/complete-t1.json", "ra-sync/inbox/start-t2.json", "README.md"];
    const tagNames = ["ra-sync/start-response/t1", "ra-sync/complete-response/t1"];
    const hour = 3600 * 1000;
    // a fresh unrelayed payload is inside the grace window; an old one is reported
    assert.deepStrictEqual(bridge.findUnrelayed({ inboxPaths, tagNames, ageMsByPath: { "ra-sync/inbox/start-t2.json": 5 * 60 * 1000 } }), []);
    assert.deepStrictEqual(
      bridge.findUnrelayed({ inboxPaths, tagNames, ageMsByPath: { "ra-sync/inbox/start-t2.json": 2 * hour } }).map((e) => e.runToken),
      ["t2"]
    );
    assert.deepStrictEqual(bridge.findUnrelayed({ inboxPaths: inboxPaths.slice(0, 2), tagNames }), []);
  }

  // ---- client: legacy main transport is unchanged and sends NO dispatch ----
  {
    const calls = [];
    const fetchFn = async (url, init) => { calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) }); return fakeRes(201, { commit: { sha: SHA } }); };
    const f = tmpJson({ candidateIds: ["ra-1"] });
    await client.cmdSubmit("start", f, { env: { GH_PUSH_TOKEN: "tok", GITHUB_REPOSITORY: "o/r" }, fetchFn, log: () => {} });
    assert.strictEqual(calls.length, 1, "main transport makes exactly one call");
    assert.strictEqual(calls[0].body.branch, "main");
    assert.ok(!calls.some((c) => c.url.endsWith("/dispatches")));
  }

  // ---- client: inbox branch writes there (never main) then dispatches the returned sha ----
  {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body), auth: init.headers.Authorization });
      return url.endsWith("/dispatches") ? fakeRes(204, {}) : fakeRes(201, { commit: { sha: SHA } });
    };
    const f = tmpJson({ runId: "r1", events: [] });
    const token = await client.cmdSubmit("complete", f, { env: { GH_PUSH_TOKEN: "tok", GITHUB_REPOSITORY: "o/r", RA_BRIDGE_BRANCH: "ra-sync-inbox" }, fetchFn, log: () => {} });
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].method, "PUT");
    assert.strictEqual(calls[0].body.branch, "ra-sync-inbox");
    assert.notStrictEqual(calls[0].body.branch, "main");
    assert.ok(calls[0].url.endsWith(`/contents/ra-sync/inbox/complete-${token}.json`));
    assert.ok(calls[1].url.endsWith("/repos/o/r/dispatches"));
    assert.deepStrictEqual(calls[1].body, {
      event_type: client.DISPATCH_EVENT_TYPE,
      client_payload: { action: "complete", runToken: token, sha: SHA, path: `ra-sync/inbox/complete-${token}.json` },
    });
    // the dispatch the client sends is exactly what the workflow accepts
    assert.ok(bridge.entryFromDispatch(calls[1].body.client_payload));
    assert.ok(calls.every((c) => c.auth === "Bearer tok"));
  }

  // ---- client: a failed dispatch is loud and names the recovery command; the payload write is not repeated ----
  {
    const fetchFn = async (url) => (url.endsWith("/dispatches") ? fakeRes(403, { message: "Resource not accessible" }) : fakeRes(201, { commit: { sha: SHA } }));
    const f = tmpJson({ candidateIds: ["ra-1"] });
    await assert.rejects(
      client.cmdSubmit("start", f, { env: { GH_PUSH_TOKEN: "tok", GITHUB_REPOSITORY: "o/r", RA_BRIDGE_BRANCH: "ra-sync-inbox" }, fetchFn, log: () => {} }),
      (e) => /stored on the inbox branch/.test(e.message) && /ra-bridge-client\.js dispatch start /.test(e.message)
    );
  }

  // ---- client: a missing inbox branch fails at the write, with no dispatch ----
  {
    const calls = [];
    const fetchFn = async (url) => { calls.push(url); return fakeRes(404, { message: "Branch ra-sync-inbox not found" }); };
    const f = tmpJson({ candidateIds: ["ra-1"] });
    await assert.rejects(client.cmdSubmit("start", f, { env: { GH_PUSH_TOKEN: "tok", GITHUB_REPOSITORY: "o/r", RA_BRIDGE_BRANCH: "ra-sync-inbox" }, fetchFn, log: () => {} }), /Contents API create failed/);
    assert.strictEqual(calls.length, 1);
  }

  // ---- client: recovery dispatch finds the payload commit on the branch ----
  {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
      return init.method === "GET" ? fakeRes(200, [{ sha: SHA }]) : fakeRes(204, {});
    };
    const sha = await client.cmdDispatch("start", "t9", { env: { GH_PUSH_TOKEN: "tok", GITHUB_REPOSITORY: "o/r", RA_BRIDGE_BRANCH: "ra-sync-inbox" }, fetchFn, log: () => {} });
    assert.strictEqual(sha, SHA);
    assert.ok(calls[0].url.includes("sha=ra-sync-inbox") && calls[0].url.includes("start-t9.json"));
    assert.strictEqual(calls[1].body.client_payload.runToken, "t9");
    await assert.rejects(client.cmdDispatch("start", "t9", { env: { GH_PUSH_TOKEN: "t", GITHUB_REPOSITORY: "o/r" }, fetchFn, log: () => {} }), /not set to an inbox branch/);
  }

  // ---- end to end on a throwaway git repository: payload only on the inbox branch, main untouched ----
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ra-inbox-e2e-"));
    const origin = path.join(dir, "origin.git"), work = path.join(dir, "work"), runner = path.join(dir, "runner");
    git(dir, "init", "-q", "--bare", "-b", "main", origin);
    git(dir, "clone", "-q", origin, work);
    git(work, "config", "user.email", "t@t"); git(work, "config", "user.name", "t");
    fs.writeFileSync(path.join(work, "README.md"), "main\n");
    git(work, "add", "-A"); git(work, "commit", "-q", "-m", "main"); git(work, "push", "-q", "origin", "main");
    const mainTip = git(work, "rev-parse", "HEAD").trim();
    // the inbox branch is an orphan holding only payloads
    git(work, "checkout", "-q", "--orphan", "ra-sync-inbox"); git(work, "rm", "-rqf", ".");
    fs.mkdirSync(path.join(work, "ra-sync/inbox"), { recursive: true });
    const tokenA = "20261019-140000-aaaaaa";
    fs.writeFileSync(path.join(work, `ra-sync/inbox/start-${tokenA}.json`), JSON.stringify({ runToken: tokenA, action: "start", candidateIds: ["ra-1", "ra-2"] }));
    git(work, "add", "-A"); git(work, "commit", "-q", "-m", "payload"); git(work, "push", "-q", "origin", "ra-sync-inbox");
    const payloadSha = git(work, "rev-parse", "HEAD").trim();
    // a commit that exists only on some other branch must be refused
    git(work, "checkout", "-q", "-b", "other"); fs.writeFileSync(path.join(work, "x"), "x"); git(work, "add", "-A"); git(work, "commit", "-q", "-m", "other");
    git(work, "push", "-q", "origin", "other"); const otherSha = git(work, "rev-parse", "HEAD").trim();

    git(dir, "clone", "-q", origin, runner); git(runner, "config", "user.email", "bot@t"); git(runner, "config", "user.name", "bot");
    const execFn = (cmd, args) => execFileSync(cmd, args, { cwd: runner, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const entry = bridge.entryFromDispatch({ action: "start", runToken: tokenA, sha: payloadSha });
    assert.ok(JSON.parse(bridge.readInboxPayload({ execFn, entry })).candidateIds.length === 2);
    assert.throws(() => bridge.readInboxPayload({ execFn, entry: Object.assign({}, entry, { sha: otherSha }) }), /not on the ra-sync-inbox branch/);

    const posts = [];
    const fetchFn = async (url, init) => { posts.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ ok: true, runId: "run-1", unknownIds: ["ra-1"] }) }; };
    const deps = { apiUrl: "http://stub/api/cron-ra", cronSecret: "s", fetchFn, execFn, readFileFn: () => bridge.readInboxPayload({ execFn, entry }), log: () => {} };
    const r1 = await bridge.processEntry(entry, deps);
    assert.ok(r1.ok && !r1.skipped);
    assert.deepStrictEqual(posts, [{ action: "start", candidateIds: ["ra-1", "ra-2"] }], "the existing ingestion request is unchanged");
    assert.ok(git(origin, "tag", "-l", `ra-sync/start-response/${tokenA}`).trim(), "response tag pushed");
    const r2 = await bridge.processEntry(entry, deps);
    assert.ok(r2.skipped && posts.length === 1, "replay is a no-op (no second API call)");
    // main is untouched: same tip, no payload file, no new commits, only the tag ref was added
    assert.strictEqual(git(origin, "rev-parse", "main").trim(), mainTip);
    assert.strictEqual(git(origin, "ls-tree", "-r", "--name-only", "main").trim(), "README.md");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ---- scheduled reconcile on a throwaway repository: absent branch is a clean no-op; a missing tag is reported ----
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ra-inbox-rec-"));
    const origin = path.join(dir, "origin.git"), work = path.join(dir, "work"), runner = path.join(dir, "runner");
    git(dir, "init", "-q", "--bare", "-b", "main", origin);
    git(dir, "clone", "-q", origin, work);
    git(work, "config", "user.email", "t@t"); git(work, "config", "user.name", "t");
    fs.writeFileSync(path.join(work, "README.md"), "main\n");
    git(work, "add", "-A"); git(work, "commit", "-q", "-m", "main"); git(work, "push", "-q", "origin", "main");
    git(dir, "clone", "-q", origin, runner); git(runner, "config", "user.email", "bot@t"); git(runner, "config", "user.name", "bot");
    const execFn = (cmd, args) => execFileSync(cmd, args, { cwd: runner, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const logs = [], errs = [];
    const opts = { execFn, log: (m) => logs.push(m), error: (m) => errs.push(m) };
    // before the cutover the branch does not exist: exit 0, no crash
    assert.strictEqual(bridge.runReconcile(opts), 0);
    assert.ok(logs.some((m) => /does not exist yet/.test(m)));
    // a payload with no response tag, past the grace period, is reported
    git(work, "checkout", "-q", "--orphan", "ra-sync-inbox"); git(work, "rm", "-rqf", ".");
    fs.mkdirSync(path.join(work, "ra-sync/inbox"), { recursive: true });
    const tok = "20261019-150000-bbbbbb";
    fs.writeFileSync(path.join(work, `ra-sync/inbox/complete-${tok}.json`), JSON.stringify({ runToken: tok, action: "complete", runId: "r", events: [] }));
    git(work, "add", "-A"); git(work, "commit", "-q", "-m", "payload"); git(work, "push", "-q", "origin", "ra-sync-inbox");
    assert.strictEqual(bridge.runReconcile(Object.assign({ now: () => Date.now() + 2 * 3600 * 1000 }, opts)), 1);
    assert.ok(errs.some((m) => m.includes(`complete-${tok}`)));
    assert.strictEqual(bridge.runReconcile(opts), 0, "inside the grace period it is not reported");
    // once the response tag exists it is clean
    git(work, "tag", "-a", `ra-sync/complete-response/${tok}`, "-m", "{}"); git(work, "push", "-q", "origin", `refs/tags/ra-sync/complete-response/${tok}`);
    assert.strictEqual(bridge.runReconcile(Object.assign({ now: () => Date.now() + 2 * 3600 * 1000 }, opts)), 0);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ---- workflow + vercel.json contracts ----
  {
    const wf = fs.readFileSync(path.join(root, ".github/workflows/ra-sync-bridge.yml"), "utf8");
    assert.ok(/repository_dispatch:\s*\n\s*types: \[ra-sync-payload\]/.test(wf), "dispatch trigger");
    assert.ok(wf.includes("workflow_dispatch:") && wf.includes("schedule:"), "manual replay and reconcile triggers");
    assert.ok(!/^\s+ref:/m.test(wf), "checkout stays on the default branch (reviewed code only holds CRON_SECRET)");
    assert.ok(wf.includes(client.DISPATCH_EVENT_TYPE));
    assert.ok(/group: ra-sync-bridge-\$\{\{ github\.event_name == 'schedule' && 'reconcile' \|\| 'relay' \}\}/.test(wf), "the reconcile has its own concurrency group");
    const vj = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
    const de = vj.git && vj.git.deploymentEnabled;
    assert.deepStrictEqual(de, { "ra-sync-inbox": false }, "only the inbox branch is excluded from deployments; every other branch keeps its Preview");
  }

  console.log("ra-sync inbox branch: ok");
}
run().catch((e) => { console.error(e); process.exit(1); });
