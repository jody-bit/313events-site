// test/ra-bridge-client.test.js — scripts/ra-bridge-client.js's
// GitHub-REST-API-based submit/wait transport (2026-10-07 rewrite:
// previously this drove `git add`/`git commit`/`git push` and `git
// fetch`/`git cat-file`, both of which require a clean, push-able
// local checkout -- exactly the dependency a stuck/dirty/mid-rebase
// device checkout must never block the daily RA handoff on). Every
// network call is mocked via an injected `fetchFn`; no real HTTP call
// and no real git repository is used anywhere in this file. Plain Node
// assert, no dependencies, matching this repo's existing style (see
// test/ra-sync.test.js).
// Run: node test/ra-bridge-client.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const client = require("../scripts/ra-bridge-client.js");
const CLIENT_PATH = require.resolve("../scripts/ra-bridge-client.js");

// INBOX_FILE_RE mirrors .github/scripts/ra-sync-bridge.js's own regex
// (not imported -- that file is untouched by this change, and this
// test exists precisely to prove the new transport still produces a
// file path/shape that regex matches, without modifying or depending
// on that script directly).
const INBOX_FILE_RE = /^ra-sync\/inbox\/(start|complete|promote)-([A-Za-z0-9._-]+)\.json$/;

function fakeRes(status, bodyObj) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(bodyObj),
  };
}

function writeTmpJson(obj) {
  const p = path.join(os.tmpdir(), `ra-bridge-client-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
}

function explodingRunFn() {
  throw new Error("git remote get-url origin: fatal: not a git repository (or any of the parent directories)");
}

async function run() {
  // ============================================================
  // Part 1 & 3: submit never requires a clean/fast-forwardable local
  // checkout, and a stale/broken local main cannot block it. Proven
  // together: `runFn` (the one place a local git call could happen,
  // inside repoSlug's fallback) throws exactly as a broken checkout
  // would, yet submission still succeeds because GITHUB_REPOSITORY is
  // set and repoSlug never needs to call runFn at all.
  // ============================================================
  {
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, opts });
      return fakeRes(201, { content: {}, commit: {} });
    };
    const payloadPath = writeTmpJson({ candidateIds: ["ra-1", "ra-2"] });
    const runToken = await client.cmdSubmit("start", payloadPath, {
      env: { GITHUB_REPOSITORY: "jody-bit/313events-site", GH_PUSH_TOKEN: "tok-abc" },
      fetchFn,
      runFn: explodingRunFn, // would throw if submit ever touched local git
      log: () => {},
    });
    assert.strictEqual(calls.length, 1, "submit should make exactly one HTTP call");
    assert.match(calls[0].url, /^https:\/\/api\.github\.com\/repos\/jody-bit\/313events-site\/contents\/ra-sync\/inbox\/start-/);
    assert.strictEqual(calls[0].opts.method, "PUT");
    assert.match(runToken, /^\d{8}-\d{6}-[0-9a-f]{6}$/);
  }

  // ============================================================
  // Part 2: submit does not run git add/commit/push. There is no
  // execFn/git-mutation parameter on cmdSubmit at all anymore -- the
  // only git-shaped thing it can call is the read-only `runFn` inside
  // repoSlug, and even that is proven unused above when
  // GITHUB_REPOSITORY is set. Here we additionally confirm the fallback
  // path (no GITHUB_REPOSITORY) calls runFn exactly once, read-only,
  // and still never performs add/commit/push.
  // ============================================================
  {
    const runFnCalls = [];
    const runFn = (cmd, args) => {
      runFnCalls.push([cmd, ...args]);
      return "https://github.com/jody-bit/313events-site.git\n";
    };
    const fetchFn = async () => fakeRes(201, { content: {}, commit: {} });
    const payloadPath = writeTmpJson({ candidateIds: ["ra-1"] });
    await client.cmdSubmit("start", payloadPath, { env: {}, fetchFn, runFn, log: () => {} });
    assert.deepStrictEqual(runFnCalls, [["git", "remote", "get-url", "origin"]]);
  }

  // ============================================================
  // Part 4: existing start payload validation remains intact.
  // ============================================================
  {
    const payloadPath = writeTmpJson({ candidateIds: [] });
    await assert.rejects(
      () => client.cmdSubmit("start", payloadPath, { env: { GITHUB_REPOSITORY: "a/b" }, fetchFn: async () => fakeRes(201, {}), log: () => {} }),
      /needs a non-empty "candidateIds" array/
    );
  }

  // ============================================================
  // Part 5: existing complete payload validation remains intact.
  // ============================================================
  {
    const payloadPath = writeTmpJson({ events: [] }); // missing runId
    await assert.rejects(
      () => client.cmdSubmit("complete", payloadPath, { env: { GITHUB_REPOSITORY: "a/b" }, fetchFn: async () => fakeRes(201, {}), log: () => {} }),
      /needs "runId" \(string\) and "events" \(array\)/
    );
  }

  // ============================================================
  // Part 6: promote remains intact -- {} is a valid payload, no
  // validation error, and still reaches the API.
  // ============================================================
  {
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, opts });
      return fakeRes(201, { content: {}, commit: {} });
    };
    const payloadPath = writeTmpJson({});
    const runToken = await client.cmdSubmit("promote", payloadPath, { env: { GITHUB_REPOSITORY: "a/b" }, fetchFn, log: () => {} });
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0].url, /\/contents\/ra-sync\/inbox\/promote-/);
    assert.ok(runToken);
  }

  // ============================================================
  // Part 7: runToken format and uniqueness are unchanged.
  // ============================================================
  {
    const a = client.makeRunToken(new Date("2026-10-07T13:45:14.000Z"));
    assert.strictEqual(a, "20261007-134514-" + a.slice(-6));
    assert.match(a, /^\d{8}-\d{6}-[0-9a-f]{6}$/);
    const b = client.makeRunToken(new Date("2026-10-07T13:45:14.000Z"));
    assert.notStrictEqual(a, b, "two tokens for the same instant must still differ (random suffix)");
  }

  // ============================================================
  // Part 8: wait success works through the new transport (GitHub Git
  // Data API: ref lookup, then tag object lookup -- no git fetch/
  // cat-file anywhere).
  // ============================================================
  {
    const calls = [];
    const fetchFn = async (url) => {
      calls.push(url);
      if (url.includes("/git/ref/tags/")) return fakeRes(200, { object: { sha: "deadbeef" } });
      if (url.includes("/git/tags/deadbeef")) {
        return fakeRes(200, { message: JSON.stringify({ ok: true, candidateCount: 129, knownCount: 71, newCount: 30 }) });
      }
      throw new Error(`unexpected URL in test: ${url}`);
    };
    const payload = await client.cmdWait("start", "20261007-134514-b0b400", 5, 1, {
      env: { GITHUB_REPOSITORY: "a/b" },
      fetchFn,
      log: () => {},
    });
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.candidateCount, 129);
    assert.strictEqual(process.exitCode, 0);
    assert.ok(calls.some((u) => u.includes("/git/ref/tags/ra-sync/start-response/20261007-134514-b0b400")));
    process.exitCode = undefined;
  }

  // ============================================================
  // Part 9: wait relay failure is surfaced (ok:false in the response
  // tag's message -> exit code 1, payload still returned/printed).
  // ============================================================
  {
    const fetchFn = async (url) => {
      if (url.includes("/git/ref/tags/")) return fakeRes(200, { object: { sha: "cafefeed" } });
      return fakeRes(200, { message: JSON.stringify({ ok: false, error: "cron-ra returned 500" }) });
    };
    const payload = await client.cmdWait("complete", "tok-1", 5, 1, { env: { GITHUB_REPOSITORY: "a/b" }, fetchFn, log: () => {} });
    assert.strictEqual(payload.ok, false);
    assert.strictEqual(process.exitCode, 1);
    process.exitCode = undefined;
  }

  // ============================================================
  // Part 10: wait timeout is surfaced (tag never appears -> exit code
  // 2), using a fake clock so the test doesn't actually sleep.
  // ============================================================
  {
    let fakeNow = 0;
    const fetchFn = async () => fakeRes(404, { message: "Not Found" });
    const sleepFn = async (ms) => {
      fakeNow += ms;
    };
    const result = await client.cmdWait("start", "tok-missing", 1, 1, {
      env: { GITHUB_REPOSITORY: "a/b" },
      fetchFn,
      sleepFn,
      now: () => fakeNow,
      log: () => {},
    });
    assert.strictEqual(result, undefined);
    assert.strictEqual(process.exitCode, 2);
    process.exitCode = undefined;
  }

  // ============================================================
  // Part 11: no secret/token ever lands in a payload, a URL, or a log
  // line -- only in the Authorization header.
  // ============================================================
  {
    const secret = "gh-super-secret-token-value";
    const logs = [];
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, opts });
      return fakeRes(201, { content: {}, commit: {} });
    };
    const payloadPath = writeTmpJson({ candidateIds: ["ra-9"] });
    await client.cmdSubmit("start", payloadPath, {
      env: { GITHUB_REPOSITORY: "a/b", GH_PUSH_TOKEN: secret },
      fetchFn,
      log: (...args) => logs.push(args.join(" ")),
    });
    for (const { url, opts } of calls) {
      assert.ok(!url.includes(secret), "token leaked into a URL");
      assert.ok(!(opts.body || "").includes(secret), "token leaked into a request body");
      assert.strictEqual(opts.headers.Authorization, `Bearer ${secret}`, "token must be sent as the Authorization header");
    }
    for (const line of logs) {
      assert.ok(!line.includes(secret), `token leaked into a log line: ${line}`);
    }
  }

  // ============================================================
  // Part 12: the existing RA ingestion contract is unchanged -- the
  // file this transport creates still lands at the exact path/shape
  // .github/scripts/ra-sync-bridge.js's INBOX_FILE_RE and
  // parsePayloadFile expect, with runToken/action embedded in the JSON
  // exactly as before.
  // ============================================================
  {
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, opts });
      return fakeRes(201, { content: {}, commit: {} });
    };
    const payloadPath = writeTmpJson({ runId: "run-xyz", events: [{ id: "ra-1" }] });
    const runToken = await client.cmdSubmit("complete", payloadPath, { env: { GITHUB_REPOSITORY: "a/b" }, fetchFn, log: () => {} });

    const { url, opts } = calls[0];
    const outRel = decodeURIComponent(url.replace("https://api.github.com/repos/a/b/contents/", ""));
    assert.match(outRel, INBOX_FILE_RE);

    const body = JSON.parse(opts.body);
    const decoded = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
    assert.strictEqual(decoded.runToken, runToken);
    assert.strictEqual(decoded.action, "complete");
    assert.strictEqual(decoded.runId, "run-xyz");
    assert.deepStrictEqual(decoded.events, [{ id: "ra-1" }]);
    assert.strictEqual(body.branch, "main");
  }

  // ============================================================
  // Part 13: the CLI entrypoint's proxy-aware re-exec guard terminates.
  // Node's global `fetch` does not read HTTP_PROXY/HTTPS_PROXY on its
  // own (confirmed on the device this bridge runs on: `curl`/`git` reach
  // api.github.com through the allowlist proxy, a bare `fetch()` does
  // not), so the CLI path re-execs itself once with Node's
  // NODE_USE_ENV_PROXY=1 set when a proxy is configured. The real bug
  // this guards against: forgetting to also set that env var for the
  // child (as opposed to just passing a CLI flag) makes the child
  // re-trigger the same "proxy present, not yet handled" check and
  // re-spawn itself forever. Proven here with a real child process and
  // a short wall-clock timeout, not a mock -- a mock of child_process
  // couldn't have caught the infinite-recursion version of this bug.
  // ============================================================
  {
    const result = spawnSync(process.execPath, [CLIENT_PATH], {
      env: Object.assign({}, process.env, { HTTPS_PROXY: "http://127.0.0.1:1" }),
      timeout: 10000,
      encoding: "utf8",
    });
    assert.strictEqual(result.signal, null, "must not be killed by the timeout (i.e. must not hang/recurse forever)");
    assert.strictEqual(result.status, 1); // no subcommand -> usage + exit 1, same as with no proxy at all
    assert.match(result.stderr, /Usage:/);
  }

  console.log("All ra-bridge-client tests passed.");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
