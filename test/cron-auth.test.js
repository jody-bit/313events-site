// test/cron-auth.test.js — Package 1: fail-closed cron auth (api/_lib/cron-auth.js)
// and its adoption by every scheduled handler.
// Plain Node assert, no dependencies. Run: node test/cron-auth.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const REPO = process.cwd();
const { cronAuthStatus, requireCronAuth } = require(path.join(REPO, "api/_lib/cron-auth.js"));

const req = (auth) => ({ headers: auth === undefined ? {} : { authorization: auth } });
function makeRes() {
  return { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

// valid secret
assert.strictEqual(cronAuthStatus(req("Bearer abc"), { CRON_SECRET: "abc", VERCEL_ENV: "production" }), "ok");
// wrong / missing / malformed secret
assert.strictEqual(cronAuthStatus(req("Bearer nope"), { CRON_SECRET: "abc", VERCEL_ENV: "production" }), "unauthorized");
assert.strictEqual(cronAuthStatus(req(undefined), { CRON_SECRET: "abc", VERCEL_ENV: "production" }), "unauthorized");
assert.strictEqual(cronAuthStatus(req("abc"), { CRON_SECRET: "abc", VERCEL_ENV: "production" }), "unauthorized");
assert.strictEqual(cronAuthStatus({}, { CRON_SECRET: "abc", VERCEL_ENV: "production" }), "unauthorized");
// missing secret: closed on every Vercel environment, whatever the caller sends
for (const env of ["production", "preview", "development"]) {
  assert.strictEqual(cronAuthStatus(req(undefined), { VERCEL_ENV: env }), "unconfigured");
  assert.strictEqual(cronAuthStatus(req("Bearer anything"), { VERCEL_ENV: env }), "unconfigured");
  assert.strictEqual(cronAuthStatus(req(undefined), { CRON_SECRET: "", VERCEL_ENV: env }), "unconfigured", "empty secret is unset");
}
// missing secret off Vercel (local run, test suite) stays usable
assert.strictEqual(cronAuthStatus(req(undefined), {}), "ok");

// requireCronAuth answers the caller
process.env.CRON_SECRET = "abc";
delete process.env.VERCEL_ENV;
let res = makeRes();
assert.strictEqual(requireCronAuth(req("Bearer abc"), res), true);
assert.strictEqual(res.code, null, "valid secret sends nothing");
res = makeRes();
assert.strictEqual(requireCronAuth(req("Bearer x"), res), false);
assert.deepStrictEqual([res.code, res.body.error], [401, "Unauthorized"]);
delete process.env.CRON_SECRET;
process.env.VERCEL_ENV = "production";
res = makeRes();
assert.strictEqual(requireCronAuth(req(undefined), res), false);
assert.strictEqual(res.code, 500);
assert.match(res.body.error, /CRON_SECRET not configured/);
delete process.env.VERCEL_ENV;

// A real handler, end to end: deployed with no secret => 500 and no work done;
// deployed with the secret => proceeds past auth.
(async () => {
  const handlerPath = path.join(REPO, "api/cron-enrichment.js");
  let fetched = 0;
  global.fetch = async () => { fetched++; return { ok: true, status: 200, json: async () => [], text: async () => "" }; };
  process.env.VERCEL_ENV = "production";
  delete process.env.CRON_SECRET;
  delete require.cache[require.resolve(handlerPath)];
  let handler = require(handlerPath);
  res = makeRes();
  await handler(req("Bearer anything"), res);
  assert.strictEqual(res.code, 500, "no secret on a deployed environment: refused");
  assert.strictEqual(fetched, 0, "refused before any work or network call");

  process.env.CRON_SECRET = "abc";
  delete require.cache[require.resolve(handlerPath)];
  handler = require(handlerPath);
  res = makeRes();
  await handler(req("Bearer wrong"), res);
  assert.strictEqual(res.code, 401);
  assert.strictEqual(fetched, 0);
  res = makeRes();
  await handler(req("Bearer abc"), res);
  assert.notStrictEqual(res.code, 401, "valid secret is not refused by auth");
  assert.ok(!(res.body && /CRON_SECRET not configured/.test(String(res.body.error))), "valid secret is not reported as unconfigured");
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_ENV;

  // Structural: no handler still carries the optional `if (CRON_SECRET)` check.
  const apiDir = path.join(REPO, "api");
  const EXEMPT = { "cron-ra.js": "already fail-closed with its own 500/401 (POST bridge)" };
  for (const f of fs.readdirSync(apiDir).filter((n) => /^cron-.*\.js$/.test(n))) {
    const src = fs.readFileSync(path.join(apiDir, f), "utf8");
    if (EXEMPT[f]) {
      assert.ok(/if \(!CRON_SECRET\)/.test(src), f + " exemption no longer holds");
      continue;
    }
    assert.ok(!/^\s*if \(CRON_SECRET\) \{/m.test(src), f + " still has the optional (fail-open) CRON_SECRET check");
    assert.ok(src.includes("requireCronAuth(req, res)"), f + " must call requireCronAuth");
  }
  console.log("cron-auth: ok");
})().catch((e) => { console.error(e); process.exit(1); });
