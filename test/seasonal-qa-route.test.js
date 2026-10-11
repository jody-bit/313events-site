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
// APP_ENV=production wins even when VERCEL_ENV says preview (case and whitespace do not defeat it)
for (const a of ["production", "Production", " production ", "PRODUCTION"]) assert.strictEqual(call("preview", { c: "halloween" }, "GET", a).statusCode, 404, "APP_ENV=" + JSON.stringify(a));
// NODE_ENV, the local-environment fallback and a bare environment never open the route
{
  const saved = process.env.NODE_ENV; process.env.NODE_ENV = "development";
  try { assert.strictEqual(call(undefined, { c: "halloween" }).statusCode, 404, "NODE_ENV=development alone must not open QA"); } finally { if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved; }
  assert.strictEqual(call("local", { c: "halloween" }).statusCode, 404, "the environment helper's 'local' fallback is not an allowed value");
}
// 2. explicit allow-list
for (const env of ["preview", "development"]) {
  const r = data(env);
  assert.strictEqual(r.statusCode, 200, env);
  assert.strictEqual(JSON.parse(r.body).records.length, 52, env);
  const js = data(env, { asset: "client" });
  assert.strictEqual(js.statusCode, 200);
  assert.ok(/application\/javascript/.test(js.headers["Content-Type"]) && js.body.includes("SeasonalQA"));
}
// 2b. fall and fall-color: same fail-closed matrix, correct dataset, no halloween data
for (const slug of ["fall", "fall-color"]) {
  for (const [label, env] of [["production", "production"], ["staging", "staging"], ["missing", undefined], ["empty", ""], ["wrong case", "Preview"]]) {
    const r = call(env, { c: slug });
    assert.strictEqual(r.statusCode, 404, slug + " " + label);
    assert.ok(!/records|Yates|Kensington|Nichols/.test(r.body), slug + " " + label + " leaks nothing");
  }
  assert.strictEqual(call("preview", { c: slug }, "GET", "production").statusCode, 404, slug + " APP_ENV=production wins");
  for (const env of ["preview", "development"]) {
    const r = call(env, { c: slug });
    assert.strictEqual(r.statusCode, 200, slug + " " + env);
    const d = JSON.parse(r.body);
    assert.strictEqual(d.collection, slug);
    assert.strictEqual(d.records.length, 4, slug + " has four records");
    assert.ok(d.records.every((x) => x.public === false), slug + ": nothing is public");
    assert.ok(!/Hush|Slay Nights/.test(r.body));
  }
}
// 3. non-GET and unknown collection/asset stay 404 even when allowed
assert.strictEqual(call("preview", { c: "halloween" }, "POST").statusCode, 404);
for (const bad of ["Fall", "fall ", "fall-colour", "__proto__", "constructor", "../halloween-qa", "toString", "hasOwnProperty", ""]) {
  const r = call("preview", { c: bad });
  assert.ok(r.statusCode === 404 || (bad === "" && r.statusCode === 200), "unknown collection " + JSON.stringify(bad) + " must 404 (empty means the default)");
}
assert.strictEqual(call("preview", { c: ["fall", "halloween"] }).statusCode, 404, "array query value");
assert.strictEqual(call("preview", { c: "fall", asset: "client" }).statusCode, 200, "the client script is the same for every collection");
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
const PRIVATE = ["candidates.json", "candidate-images.json", "photo-library.json", "linked-images.json", "halloween-qa.json", "fall-qa.json", "fall-color-qa.json", "entries.json", "defaults.json", "qa-client.js", "editorial.js",
  "COVERAGE.md", "EDITORIAL_HANDOFF.md", "MIGRATION_REVIEW.md"];
for (const f of served) assert.ok(!PRIVATE.includes(path.basename(f)), "private seasonal file is statically served: " + f);
for (const f of PRIVATE) assert.ok(tracked.includes("api/_lib/seasonal-editorial/" + f), f + " lives in api/_lib/seasonal-editorial");
assert.ok(!served.some((f) => /^seasonal\/.*(qa|candidate|linked|library|coverage|manifest|fixture|handoff|review)/i.test(f)), "no registry-like, manifest, fixture or review file left in seasonal/");
assert.deepStrictEqual(served.filter((f) => /^seasonal\//.test(f)).sort(), ["seasonal/collections.js", "seasonal/image-fallback.js", "seasonal/page.js", "seasonal/published-entries.js", "seasonal/render.js", "seasonal/seasonal.css"],
  "the public seasonal folder holds only the renderer, the gate, the published projection and styles");
// no unpublished destination name appears in any statically served seasonal file or page
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const DATA = ED.COLLECTIONS;
const cands = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/candidates.json"), "utf8")).candidates;
const publishedNames = new Set(["halloween", "fall", "fall-color"].flatMap((k) => DATA.published({ entries: ED.entries()[k] }).map((e) => e.name)));
const names = new Set(cands.map((c) => c.name).concat(["halloween", "fall", "fall-color"].flatMap((k) => ED.entries()[k].map((e) => e.name))));
const unpublished = [...names].filter((n) => !publishedNames.has(n) && n.length > 8);
const text = served.filter((f) => /^seasonal\/|^(fall|halloween|fall-color)\.html$/.test(f)).map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]);
assert.ok(unpublished.length > 150 && text.length >= 9);
for (const [f, t] of text) for (const n of unpublished) assert.ok(!t.includes(n), f + " exposes unpublished record: " + n);
// image candidates, rights metadata and review evidence do not leak either (URLs, risk notes, evidence wording)
const linkedFile = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/linked-images.json"), "utf8"));
const secrets = linkedFile.images.map((l) => l.image_link).concat(linkedFile.unchosen_alternatives.map((u) => u.image_link), ["Owner accepted the copyright risk", "apple_photos_uuid", "IMG_5509", "Official site read 2026-10-11"]);
for (const [f, t] of text) for (const x of secrets) assert.ok(!t.includes(x), f + " exposes private image/rights/evidence data: " + x);
// the public pages do not reference any review/fixture/config switch (B3)
for (const [f, t] of text) assert.ok(!/review=1|fixtures=1|__313_CONFIG|\/config\.js/.test(t), f + " still references a removed preview mode");
// the route's data is reachable only through the handler, and the function bundle includes it
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
assert.ok(/seasonal-editorial/.test(vercel.functions["api/seasonal-qa.js"].includeFiles));
console.log("seasonal-qa-route: ok (" + unpublished.length + " unpublished names and " + secrets.length + " private strings checked across " + text.length + " served files)");
