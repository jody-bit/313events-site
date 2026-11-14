// test/cron-healthcheck-read-only.test.js — read-only mode of the daily healthcheck (?read_only=1).
// Proves: no upload and no DELETE in read-only mode (regular mode still does both), the skipped upload check is
// recorded as NOT RUN and kept in the stored row, and the admin banner leaves it out of the executed/passing
// counts and lists it separately. Auth is unchanged. Run: node test/cron-healthcheck-read-only.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.CRON_SECRET = "cron-test-secret";
const hc = require(`${REPO_DIR}/api/cron-healthcheck.js`);

function run(query, auth) {
  const calls = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    const method = (opts && opts.method) || "GET";
    calls.push({ method, url: u, body: opts && opts.body, headers: (opts && opts.headers) || {} });
    const json = u.endsWith("/api/upload-image") && method === "GET" ? { token: "t" }
      : u.endsWith("/api/upload-image") && method === "POST" && opts.headers["X-Upload-Token"] && opts.headers["Content-Type"] === "image/jpeg"
        ? { url: "https://example.supabase.co/storage/v1/object/public/event-flyers/test.jpg" } : [];
    return { ok: true, status: 200, headers: { get: () => "text/xml" }, json: async () => json, text: async () => "x".repeat(600) };
  };
  const res = { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { headers: { authorization: auth === undefined ? "Bearer cron-test-secret" : auth }, query };
  return hc(req, res).then(() => ({ calls, res }));
}
let query;

(async () => {
  const realFetch = global.fetch;
  try {
    // regular mode: unchanged -- the real upload check runs, deletes its test file, and the history prune runs
    query = {};
    const reg = await run(query);
    assert.ok(reg.calls.some((c) => c.method === "DELETE" && c.url.includes("/storage/v1/object/event-flyers/")), "regular mode should clean up its test upload");
    assert.ok(reg.calls.some((c) => c.method === "DELETE" && c.url.includes("/rest/v1/healthchecks?")), "regular mode should prune old rows");
    assert.strictEqual(reg.res.body.read_only, false);
    assert.deepStrictEqual(reg.res.body.not_run, []);

    // read-only mode: no successful upload and no DELETE of any kind
    query = { read_only: "1" };
    const ro = await run(query);
    assert.ok(!ro.calls.some((c) => c.method === "DELETE"), "read-only mode issued a DELETE");
    const isRealUpload = (c) => c.method === "POST" && c.url.endsWith("/api/upload-image") && c.headers["X-Upload-Token"] && c.headers["Content-Type"] === "image/jpeg";
    assert.ok(reg.calls.some(isRealUpload), "regular mode should perform the real upload");
    assert.ok(!ro.calls.some(isRealUpload), "read-only mode performed a real upload");
    assert.strictEqual(ro.res.body.read_only, true);
    assert.deepStrictEqual(ro.res.body.not_run, ["upload-image: real upload succeeds"]);
    // the stored row keeps the skip, labelled NOT RUN, never an ok/passing detail
    const row = JSON.parse(ro.calls.find((c) => c.method === "POST" && c.url.endsWith("/rest/v1/healthchecks")).body)[0];
    const skipped = row.checks.find((c) => c.name === "upload-image: real upload succeeds");
    assert.strictEqual(skipped.level, "not_run");
    assert.ok(/^NOT RUN/.test(skipped.detail));
    assert.ok(!/201|succeeded|cleaned up/.test(skipped.detail));
    assert.strictEqual(row.checks.length, JSON.parse(reg.calls.find((c) => c.method === "POST" && c.url.endsWith("/rest/v1/healthchecks")).body)[0].checks.length, "same checks listed in both modes");

    // auth unchanged in read-only mode
    query = { read_only: "1" };
    const denied = await run(query, "Bearer wrong");
    assert.strictEqual(denied.res.code, 401);
    assert.strictEqual(denied.calls.length, 0);
  } finally { global.fetch = realFetch; }

  // admin banner: skipped checks are not executed/passing/failing and are listed separately
  const html = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");
  const fn = html.slice(html.indexOf("function renderHealthcheck"), html.indexOf("// Resident Advisor sync status"));
  const banner = { style: {}, className: "", innerHTML: "" };
  const render = new Function("document", "setTabBadge", "escapeHtml", `${fn}; return renderHealthcheck;`)(
    { getElementById: () => banner }, () => {}, (s) => String(s));
  const mk = (n, extra) => Array.from({ length: n }, (_, i) => Object.assign({ name: `c${i}`, ok: true }, extra));
  render({ latest: { run_at: "2026-11-14T12:00:00Z", overall: "ok", checks: mk(81).concat([{ name: "upload", ok: true, level: "not_run", detail: "NOT RUN" }]) }, streakOk: true });
  assert.ok(/All 81 executed smoke checks passing/.test(banner.innerHTML), banner.innerHTML);
  assert.ok(/1 NOT RUN: upload/.test(banner.innerHTML));
  assert.ok(!/All 82/.test(banner.innerHTML));
  // regular results read exactly as before
  render({ latest: { run_at: "2026-11-14T12:00:00Z", overall: "ok", checks: mk(82) }, streakOk: true });
  assert.ok(/All 82 smoke checks passing/.test(banner.innerHTML) && !/NOT RUN/.test(banner.innerHTML));
  console.log("ok: cron-healthcheck read-only mode and truthful skip reporting");
})().catch((e) => { console.error(e); process.exit(1); });
