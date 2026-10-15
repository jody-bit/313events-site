// test/cron-run.test.js — Package 1: api/_lib/cron-run.js (withRunLog) and
// the eight ingestion handlers that now use it.
// Plain Node assert, no dependencies. Run: node test/cron-run.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO = process.cwd();
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
const { withRunLog, classifyResponse, requestAuthorized } = require(path.join(REPO, "api/_lib/cron-run.js"));
const { isKnownSourceSlug } = require(path.join(REPO, "api/_lib/source-slugs.js"));

function makeFetch() {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
    if (opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    return { ok: true, status: 204, json: async () => ({}) };
  };
  return calls;
}
function makeRes(order) {
  return {
    code: null, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; order && order.push("response"); return this; },
  };
}
const patch = (calls) => calls.filter((c) => c.method === "PATCH").map((c) => c.body);

(async () => {
  // --- classification: what the handler reported is what gets logged ----
  assert.strictEqual(classifyResponse(200, { upserted: 12 }).outcome, "success");
  assert.strictEqual(classifyResponse(200, { upserted: 0, note: "No events" }).outcome, "success");
  assert.strictEqual(classifyResponse(200, { upserted: 0, error: "Fetch failed: HTTP 500" }).outcome, "failed", "a 200 that carries an error is not success");
  assert.strictEqual(classifyResponse(200, { upserted: 0, error: "Fetch failed: HTTP 403" }).outcome, "blocked");
  assert.strictEqual(classifyResponse(200, { upserted: 0, error: "Fetch failed: HTTP 403" }).http_status, 403);
  assert.strictEqual(classifyResponse(502, { upserted: 0, error: "Status lookup failed" }).outcome, "failed");
  assert.strictEqual(classifyResponse(502, { upserted: 5, error: "Supabase upsert failed" }).outcome, "partial");
  assert.strictEqual(classifyResponse(502, { upserted: 3, upsertErrors: [{}] }).outcome, "partial");
  assert.strictEqual(classifyResponse(500, { upserted: 0, error: "boom" }).outcome, "failed");
  const ok = classifyResponse(200, { upserted: 4, skippedPast: 2, feedsChecked: 1 });
  assert.strictEqual(ok.records_written, 4);
  assert.strictEqual(ok.records_fetched, undefined, "fetched/parsed are never invented");
  assert.deepStrictEqual(ok.session_data, { skippedPast: 2, feedsChecked: 1 });
  const feedFail = (n, total) => ({ sourceFailures: () => ({ attempted: total, failed: n }) });
  assert.strictEqual(classifyResponse(200, { upserted: 0 }, feedFail(1, 3)).outcome, "partial");
  assert.strictEqual(classifyResponse(200, { upserted: 0 }, feedFail(3, 3)).outcome, "failed");
  assert.strictEqual(classifyResponse(200, { upserted: 9 }, feedFail(3, 3)).outcome, "partial");
  assert.strictEqual(classifyResponse(200, { upserted: 0 }, feedFail(0, 3)).outcome, "success");

  // --- auth: an unauthorised request is never a run ----------------------
  process.env.CRON_SECRET = "s3cret";
  assert.strictEqual(requestAuthorized({ headers: {} }), false);
  assert.strictEqual(requestAuthorized({ headers: { authorization: "Bearer wrong" } }), false);
  assert.strictEqual(requestAuthorized({ headers: { authorization: "Bearer s3cret" } }), true);
  let calls = makeFetch();
  let inner = 0;
  const guarded = withRunLog("halo", async (req, res) => { inner++; res.status(401).json({ error: "Unauthorized" }); });
  let res = makeRes();
  await guarded({ headers: {} }, res);
  assert.strictEqual(calls.length, 0, "no source_runs row for an unauthorised hit");
  assert.strictEqual(inner, 1, "handler still runs and answers itself");
  assert.strictEqual(res.code, 401);
  delete process.env.CRON_SECRET;

  // --- lifecycle: start before, finish BEFORE the response is sent -------
  calls = makeFetch();
  const order = [];
  const h = withRunLog("halo", async (req, res) => { order.push("handler"); res.status(200).json({ upserted: 7 }); });
  res = makeRes(order);
  await h({ headers: {} }, res);
  assert.deepStrictEqual(calls.map((c) => c.method), ["POST", "PATCH"]);
  assert.strictEqual(calls[0].body[0].source_slug, "halo");
  assert.strictEqual(patch(calls)[0].outcome, "success");
  assert.strictEqual(patch(calls)[0].records_written, 7);
  assert.strictEqual(res.code, 200);
  assert.deepStrictEqual(res.body, { upserted: 7 }, "response is unchanged");

  // --- failures are logged, response preserved ---------------------------
  calls = makeFetch();
  res = makeRes();
  await withRunLog("halo", async (req, r) => { r.status(502).json({ upserted: 0, error: "Status lookup failed" }); })({ headers: {} }, res);
  assert.strictEqual(patch(calls)[0].outcome, "failed");
  assert.strictEqual(res.code, 502);

  calls = makeFetch();
  res = makeRes();
  await assert.rejects(withRunLog("halo", async () => { throw new Error("kaboom"); })({ headers: {} }, res), /kaboom/);
  assert.strictEqual(patch(calls)[0].outcome, "failed");
  assert.match(patch(calls)[0].error_sample, /kaboom/);

  calls = makeFetch();
  await withRunLog("halo", async () => {})({ headers: {} }, makeRes());
  assert.strictEqual(patch(calls)[0].outcome, "failed", "no response is not success");

  // --- logging never breaks ingestion ------------------------------------
  global.fetch = async () => { throw new Error("db down"); };
  res = makeRes();
  await withRunLog("halo", async (req, r) => { r.status(200).json({ upserted: 3 }); })({ headers: {} }, res);
  assert.strictEqual(res.code, 200);
  assert.deepStrictEqual(res.body, { upserted: 3 });

  // --- structural: the eight handlers are wrapped, with registered slugs --
  const WRAPPED = {
    "cron-detroitmonthofdesign.js": "detroitmonthofdesign", "cron-detroittraining.js": "detroittraining", "cron-feeds.js": "feeds",
    "cron-metrotimes.js": "metrotimes", "cron-oldmiami.js": "oldmiami", "cron-playgrounddetroit.js": "playgrounddetroit",
    "cron-poppspacking.js": "poppspacking", "cron-visitdetroit.js": "visitdetroit",
  };
  for (const [file, slug] of Object.entries(WRAPPED)) {
    assert.ok(isKnownSourceSlug(slug), slug + " must be in source-slugs.js");
    const src = fs.readFileSync(path.join(REPO, "api", file), "utf8");
    assert.ok(src.includes(`withRunLog("${slug}"`), file + " must export withRunLog(\"" + slug + "\", ...)");
  }
  // Deliberate exclusions (source-slugs.js header, Product Owner 2026-09-21):
  // editorial and post-to-facebook are not event-ingestion sources; cron-ra is
  // a bridge logged as 'resident-advisor' by the RA sync, not a Vercel cron.
  // Any OTHER cron without run logging must be added above or here, or this fails.
  const EXCLUDED = ["cron-editorial.js", "cron-post-to-facebook.js", "cron-ra.js", "cron-healthcheck.js"]; // healthcheck reads source_runs, it is not a source
  for (const file of fs.readdirSync(path.join(REPO, "api")).filter((f) => /^cron-.*\.js$/.test(f))) {
    const src = fs.readFileSync(path.join(REPO, "api", file), "utf8");
    const logged = /require\(["']\.\/_lib\/(run-log|cron-run)["']\)/.test(src);
    assert.ok(logged || EXCLUDED.includes(file), file + " has no source_runs logging and is not a documented exclusion");
  }
  console.log("cron-run: ok");
})().catch((e) => { console.error(e); process.exit(1); });
