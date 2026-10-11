// test/seasonal-qa-route.test.js — the QA route is FAIL-CLOSED, and no unpublished
// seasonal editorial data is reachable from a public (static) path.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const handler = require(path.join(root, "api/seasonal-qa.js"));

function call(env, query, method, appEnv) {
  const saved = { v: process.env.VERCEL_ENV, a: process.env.APP_ENV };
  for (const k of ["VERCEL_ENV", "APP_ENV"]) delete process.env[k];
  if (env !== undefined) process.env.VERCEL_ENV = env;
  if (appEnv !== undefined) process.env.APP_ENV = appEnv;
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  try { handler({ method: method || "GET", query: query || {} }, res); }
  finally { for (const [k, v] of [["VERCEL_ENV", saved.v], ["APP_ENV", saved.a]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  return res;
}
const data = (env, q) => call(env, Object.assign({ c: "halloween" }, q));

// 1. fail-closed matrix
for (const [label, env] of [["production", "production"], ["staging", "staging"], ["missing", undefined], ["empty", ""], ["custom", "qa"], ["wrong case", "Preview"], ["whitespace", " preview"]]) {
  for (const asset of [undefined, "client"]) {
    const r = data(env, asset ? { asset } : {});
    assert.strictEqual(r.statusCode, 404, label + (asset ? " (client)" : "") + " must 404");
    assert.ok(!/Hush|Slay Nights|records|SeasonalQA/.test(r.body), label + " body leaks nothing");
  }
}
// APP_ENV=production wins even when VERCEL_ENV says preview
assert.strictEqual(call("preview", { c: "halloween" }, "GET", "production").statusCode, 404);
// 2. explicit allow-list
for (const env of ["preview", "development"]) {
  const r = data(env);
  assert.strictEqual(r.statusCode, 200, env);
  assert.strictEqual(JSON.parse(r.body).records.length, 52, env);
  const js = data(env, { asset: "client" });
  assert.strictEqual(js.statusCode, 200);
  assert.ok(/application\/javascript/.test(js.headers["Content-Type"]) && js.body.includes("SeasonalQA"));
}
// 3. non-GET and unknown collection/asset stay 404 even when allowed
assert.strictEqual(call("preview", { c: "halloween" }, "POST").statusCode, 404);
assert.strictEqual(data("preview", { c: "fall" }).statusCode, 404);
assert.strictEqual(data("preview", { asset: "../../package.json" }).statusCode, 404);
// 4. every response (404 included) is no-store + noindex
for (const env of ["production", "preview", undefined, "development"]) {
  const r = data(env);
  assert.strictEqual(r.headers["Cache-Control"], "no-store");
  assert.strictEqual(r.headers["X-Robots-Tag"], "noindex, nofollow");
}

// 5. static exposure: Vercel serves every tracked file outside api/ as-is.
// Unpublished editorial data must live only under api/_lib (not routable).
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const served = tracked.filter((f) => !f.startsWith("api/") && fs.existsSync(path.join(root, f)));
const PRIVATE = ["candidates.json", "photo-library.json", "linked-images.json", "halloween-qa.json", "qa-client.js", "COVERAGE.md"];
for (const f of served) assert.ok(!PRIVATE.includes(path.basename(f)) || !/seasonal/.test(f), "private seasonal file is statically served: " + f);
for (const f of PRIVATE) assert.ok(tracked.includes("api/_lib/seasonal-editorial/" + f), f + " lives in api/_lib/seasonal-editorial");
assert.ok(!served.some((f) => /^seasonal\/.*(qa|candidate|linked|library|coverage)/i.test(f)), "no registry-like file left in seasonal/");
// no unpublished destination name appears in any statically served seasonal file or page
const DATA = require(path.join(root, "seasonal/collections.js"));
const cands = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/candidates.json"), "utf8")).candidates;
const publishedNames = new Set(["halloween", "fall", "fall-color"].flatMap((k) => DATA.published(DATA.COLLECTIONS[k]).map((e) => e.name)));
const unpublished = cands.filter((c) => c.status !== "published" && !publishedNames.has(c.name)).map((c) => c.name).filter((n) => n.length > 8);
const text = served.filter((f) => /^seasonal\/|^(fall|halloween|fall-color)\.html$/.test(f)).map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]);
assert.ok(unpublished.length > 150 && text.length >= 8);
for (const [f, t] of text) for (const n of unpublished) assert.ok(!t.includes(n), f + " exposes unpublished record: " + n);
// the route's data is reachable only through the handler, and the function bundle includes it
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
assert.ok(/seasonal-editorial/.test(vercel.functions["api/seasonal-qa.js"].includeFiles));
console.log("seasonal-qa-route: ok (" + unpublished.length + " unpublished names checked across " + text.length + " served files)");
