// test/ra-sync-bridge.test.js — .github/scripts/ra-sync-bridge.js +
// scripts/ra-bridge-client.js (the GitHub Actions bridge added 2026-09-26
// because the device's own shell cannot reach 313.events; see
// ra-sync/README.md). Plain Node assert, no dependencies, matching this
// repo's existing style (see test/ra-sync.test.js).
// Run: node test/ra-sync-bridge.test.js
"use strict";
const assert = require("assert");

const bridge = require("../.github/scripts/ra-sync-bridge.js");
const client = require("../scripts/ra-bridge-client.js");

async function run() {
  // ============================================================
  // Part 1: extractInboxFiles — only genuinely-new inbox files count
  // ============================================================
  {
    const event = {
      commits: [
        {
          added: [
            "ra-sync/inbox/start-20260926-120000-abc123.json",
            "README.md", // unrelated file in the same commit
          ],
          modified: ["ra-sync/inbox/start-OLD-should-be-ignored.json"], // modified, not added
        },
        {
          added: [
            "ra-sync/inbox/complete-20260926-120500-def456.json",
            "ra-sync/inbox/start-20260926-120000-abc123.json", // duplicate across commits
            "ra-sync/inbox/not-a-real-shape.json", // doesn't match start-/complete- prefix
          ],
        },
      ],
    };
    const entries = bridge.extractInboxFiles(event);
    assert.strictEqual(entries.length, 2, "modified-only and non-matching files must be excluded, duplicates deduped");
    assert.deepStrictEqual(
      entries.map((e) => e.filePath),
      [
        "ra-sync/inbox/complete-20260926-120500-def456.json",
        "ra-sync/inbox/start-20260926-120000-abc123.json",
      ]
    );
    const start = entries.find((e) => e.action === "start");
    assert.strictEqual(start.runToken, "20260926-120000-abc123");
    const complete = entries.find((e) => e.action === "complete");
    assert.strictEqual(complete.runToken, "20260926-120500-def456");
  }

  // extractInboxFiles on an empty/malformed event never throws
  {
    assert.deepStrictEqual(bridge.extractInboxFiles({}), []);
    assert.deepStrictEqual(bridge.extractInboxFiles({ commits: null }), []);
    assert.deepStrictEqual(bridge.extractInboxFiles({ commits: [{}] }), []);
  }

  // ============================================================
  // Part 2: parsePayloadFile — validation for both actions
  // ============================================================
  {
    const entry = { filePath: "ra-sync/inbox/start-TOK1.json", action: "start", runToken: "TOK1" };
    const parsed = bridge.parsePayloadFile(entry, JSON.stringify({ runToken: "TOK1", action: "start", candidateIds: ["ra-1", "ra-2"] }));
    assert.deepStrictEqual(parsed.requestBody, { action: "start", candidateIds: ["ra-1", "ra-2"] });
  }
  {
    const entry = { filePath: "ra-sync/inbox/complete-TOK2.json", action: "complete", runToken: "TOK2" };
    const parsed = bridge.parsePayloadFile(
      entry,
      JSON.stringify({ runToken: "TOK2", action: "complete", runId: "run-abc", events: [{ id: "ra-1" }] })
    );
    assert.deepStrictEqual(parsed.requestBody, { action: "complete", runId: "run-abc", events: [{ id: "ra-1" }] });
  }
  // runToken mismatch between filename and payload body is rejected
  {
    const entry = { filePath: "ra-sync/inbox/start-TOK1.json", action: "start", runToken: "TOK1" };
    assert.throws(
      () => bridge.parsePayloadFile(entry, JSON.stringify({ runToken: "OTHER", candidateIds: ["ra-1"] })),
      /does not match/
    );
  }
  // malformed JSON, missing required fields
  {
    const entry = { filePath: "ra-sync/inbox/start-TOK1.json", action: "start", runToken: "TOK1" };
    assert.throws(() => bridge.parsePayloadFile(entry, "{not json"), /Could not parse/);
    assert.throws(
      () => bridge.parsePayloadFile(entry, JSON.stringify({ runToken: "TOK1", candidateIds: [] })),
      /non-empty candidateIds/
    );
  }
  {
    const entry = { filePath: "ra-sync/inbox/complete-TOK2.json", action: "complete", runToken: "TOK2" };
    assert.throws(
      () => bridge.parsePayloadFile(entry, JSON.stringify({ runToken: "TOK2", events: [] })),
      /needs a runId/
    );
    assert.throws(
      () => bridge.parsePayloadFile(entry, JSON.stringify({ runToken: "TOK2", runId: "run-abc" })),
      /needs an events array/
    );
  }

  // ============================================================
  // Part 3: responseTagName
  // ============================================================
  assert.strictEqual(bridge.responseTagName("start", "TOK1"), "ra-sync/start-response/TOK1");
  assert.strictEqual(bridge.responseTagName("complete", "TOK2"), "ra-sync/complete-response/TOK2");

  // ============================================================
  // Part 4: callCronRa — success, HTTP failure, network failure, all with
  // an injected fetchFn so no real network call is ever made
  // ============================================================
  {
    const fetchFn = async (url, opts) => {
      assert.strictEqual(url, "https://example.invalid/api/cron-ra");
      assert.strictEqual(opts.headers.Authorization, "Bearer test-secret");
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.action, "start");
      return { ok: true, status: 200, json: async () => ({ runId: "run-1", ids: ["ra-1"] }) };
    };
    const result = await bridge.callCronRa({
      apiUrl: "https://example.invalid/api/cron-ra",
      cronSecret: "test-secret",
      requestBody: { action: "start", candidateIds: ["ra-1"] },
      fetchFn,
    });
    assert.deepStrictEqual(result, { ok: true, status: 200, json: { runId: "run-1", ids: ["ra-1"] }, error: null });
  }
  {
    const fetchFn = async () => ({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) });
    const result = await bridge.callCronRa({ apiUrl: "u", cronSecret: "s", requestBody: {}, fetchFn });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.error, "Unauthorized");
  }
  {
    const fetchFn = async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    };
    const result = await bridge.callCronRa({ apiUrl: "u", cronSecret: "s", requestBody: {}, fetchFn });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, null);
    assert.match(result.error, /network error/);
  }

  // ============================================================
  // Part 5: processEntry — the skip-if-already-relayed path (this is what
  // makes replaying the same payload harmless), and the success path
  // ============================================================
  {
    const calls = [];
    const execFn = (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      if (cmd === "git" && args[0] === "ls-remote") return "abc123\trefs/tags/ra-sync/start-response/TOK1\n";
      return "";
    };
    const result = await bridge.processEntry(
      { filePath: "ra-sync/inbox/start-TOK1.json", action: "start", runToken: "TOK1" },
      { apiUrl: "u", cronSecret: "s", fetchFn: async () => { throw new Error("must not be called"); }, execFn, readFileFn: () => { throw new Error("must not be called"); }, log: () => {} }
    );
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.ok, true);
    assert.ok(!calls.some((c) => c.startsWith("git tag")), "must not create a tag when one already exists");
  }
  {
    const calls = [];
    const execFn = (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      if (cmd === "git" && args[0] === "ls-remote") return ""; // doesn't exist yet
      return "";
    };
    const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ runId: "run-1", ids: ["ra-1"] }) });
    const readFileFn = () => JSON.stringify({ runToken: "TOK1", candidateIds: ["ra-1"] });
    const result = await bridge.processEntry(
      { filePath: "ra-sync/inbox/start-TOK1.json", action: "start", runToken: "TOK1" },
      { apiUrl: "u", cronSecret: "s", fetchFn, execFn, readFileFn, log: () => {} }
    );
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.skipped, false);
    const tagCall = calls.find((c) => c.startsWith("git tag"));
    assert.ok(tagCall, "must push a response tag on success");
    assert.ok(tagCall.includes("ra-sync/start-response/TOK1"));
    const pushCall = calls.find((c) => c.startsWith("git push"));
    assert.ok(pushCall && pushCall.includes("refs/tags/ra-sync/start-response/TOK1"));
  }
  // a parse failure still produces an {ok:false} response tag, never a thrown exception
  {
    const calls = [];
    const execFn = (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      if (cmd === "git" && args[0] === "ls-remote") return "";
      return "";
    };
    const readFileFn = () => "{not valid json";
    const result = await bridge.processEntry(
      { filePath: "ra-sync/inbox/start-TOK1.json", action: "start", runToken: "TOK1" },
      { apiUrl: "u", cronSecret: "s", fetchFn: async () => { throw new Error("must not be called"); }, execFn, readFileFn, log: () => {} }
    );
    assert.strictEqual(result.ok, false);
    const tagCall = calls.find((c) => c.startsWith("git tag"));
    assert.ok(tagCall, "a bad payload must still be recorded via a response tag, not left silent");
    assert.match(tagCall, /Could not parse/);
  }

  // ============================================================
  // Part 6: ra-bridge-client.js — runToken shape and tag-message parsing
  // ============================================================
  {
    const token = client.makeRunToken(new Date(Date.UTC(2026, 8, 26, 12, 34, 56)));
    assert.match(token, /^20260926-123456-[0-9a-f]{6}$/);
  }
  {
    const catFileOutput =
      "object abc123\ntype commit\ntag ra-sync/start-response/TOK1\ntagger bot <bot@example.com> 0 +0000\n\n" +
      JSON.stringify({ ok: true, runToken: "TOK1", response: { runId: "run-1" } });
    const parsed = client.parseTagMessage(catFileOutput);
    assert.deepStrictEqual(parsed, { ok: true, runToken: "TOK1", response: { runId: "run-1" } });
  }
  assert.throws(() => client.parseTagMessage("no blank line here"), /Could not find the tag message/);

  console.log("ra-sync-bridge.test.js: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
