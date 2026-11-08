// test/evidence-fetch-robots.test.js
//
// api/_lib/robots.js and api/_lib/evidence-fetch.js (schedule-evidence Stage 1 support). No network.
//
// Run: node test/evidence-fetch-robots.test.js
"use strict";
const assert = require("assert");
const R = require("../api/_lib/robots.js");
const { createEvidenceFetcher } = require("../api/_lib/evidence-fetch.js");

const UA = "313.events event calendar";

// robots.js
assert.strictEqual(R.isAllowed("User-agent: *\nDisallow: /private", UA, "/private/x"), false, "disallow prefix");
assert.strictEqual(R.isAllowed("User-agent: *\nDisallow: /private", UA, "/public"), true);
assert.strictEqual(R.isAllowed("User-agent: *\nDisallow: /a\nAllow: /a/ok", UA, "/a/ok/page"), true, "longer Allow overrides");
assert.strictEqual(R.isAllowed("User-agent: *\nDisallow: /a\nAllow: /a", UA, "/a"), true, "tie goes to Allow");
assert.strictEqual(R.isAllowed("User-agent: *\nDisallow:", UA, "/x"), true, "empty Disallow allows all");
assert.strictEqual(R.isAllowed("User-agent: *\nDisallow: /", UA, "/x"), false, "Disallow / blocks all");
assert.strictEqual(R.isAllowed("User-agent: *\nDisallow: /*.pdf$", UA, "/f/a.pdf"), false, "wildcard and end anchor");
assert.strictEqual(R.isAllowed("User-agent: *\nDisallow: /*.pdf$", UA, "/f/a.pdf?x=1"), true, "end anchor");
assert.strictEqual(R.isAllowed("User-agent: *\nDisallow: /\n\nUser-agent: 313.events\nAllow: /", UA, "/x"), true, "specific group beats *");
assert.strictEqual(R.isAllowed("User-agent: googlebot\nDisallow: /", UA, "/x"), true, "other agents do not apply");
assert.strictEqual(R.isAllowed("# only a comment", UA, "/x"), true);
assert.strictEqual(R.crawlDelaySeconds("User-agent: *\nCrawl-delay: 3", UA), 3);
assert.strictEqual(R.crawlDelaySeconds("User-agent: *\nDisallow: /x", UA), null);
assert.strictEqual(R.classifyRobotsStatus(200), "parse");
assert.strictEqual(R.classifyRobotsStatus(404), "allowed_none");
for (const s of [401, 403, 429, 500, 503, null]) assert.strictEqual(R.classifyRobotsStatus(s), "unavailable", String(s));

// evidence-fetch.js
function site(map, log) {
  return async (url, opts = {}) => {
    log.push({ url, ua: opts.headers && opts.headers["User-Agent"], method: opts.method });
    const hit = map[url];
    if (hit instanceof Error) throw hit;
    if (!hit) return { ok: false, status: 404, text: async () => "" };
    return { ok: hit.status >= 200 && hit.status < 300, status: hit.status, text: async () => hit.body || "" };
  };
}
const quick = { sleep: async () => {}, minDelayMs: 0, now: () => new Date("2026-10-18T15:00:00Z") };

(async () => {
  // allowed page: UA sent, GET only, retrieved_at stamped, robots fetched once per host
  let log = [];
  let f = createEvidenceFetcher({ ...quick, fetch: site({
    "https://a.test/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /private" },
    "https://a.test/open": { status: 200, body: "<p>hours</p>" },
    "https://a.test/open2": { status: 200, body: "<p>more</p>" },
    "https://a.test/private/x": { status: 200, body: "secret" },
  }, log) });
  let r = await f.fetchPage("https://a.test/open");
  assert.ok(r.ok && r.text === "<p>hours</p>" && r.retrieved_at === "2026-10-18T15:00:00.000Z");
  await f.fetchPage("https://a.test/open2");
  assert.strictEqual(log.filter((l) => l.url.endsWith("/robots.txt")).length, 1, "robots once per host");
  assert.ok(log.every((l) => l.ua === UA && l.method === "GET"));

  // blocked: recorded as blocked, the page itself is never requested
  r = await f.fetchPage("https://a.test/private/x");
  assert.deepStrictEqual([r.ok, r.outcome], [false, "blocked"]);
  assert.ok(!log.some((l) => l.url.includes("/private/x")), "blocked page never fetched");

  // no robots.txt (404) -> allowed
  log = [];
  f = createEvidenceFetcher({ ...quick, fetch: site({ "https://b.test/p": { status: 200, body: "ok" } }, log) });
  assert.ok((await f.fetchPage("https://b.test/p")).ok);

  // robots 5xx / 403 / network error -> fail closed, page not fetched
  for (const res of [{ status: 503 }, { status: 403 }, new Error("boom")]) {
    log = [];
    f = createEvidenceFetcher({ ...quick, fetch: site({ "https://c.test/robots.txt": res, "https://c.test/p": { status: 200, body: "x" } }, log) });
    r = await f.fetchPage("https://c.test/p");
    assert.strictEqual(r.outcome, "robots_unavailable");
    assert.ok(!log.some((l) => l.url === "https://c.test/p"), "page not fetched when robots unreadable");
  }

  // http error, network error, size cap, page cap, bad url: structured, never thrown
  f = createEvidenceFetcher({ ...quick, maxBytes: 5, maxPages: 3, fetch: site({
    "https://d.test/robots.txt": { status: 404 },
    "https://d.test/gone": { status: 500 },
    "https://d.test/err": new Error("reset"),
    "https://d.test/big": { status: 200, body: "123456789" },
  }, []) });
  assert.strictEqual((await f.fetchPage("https://d.test/gone")).outcome, "http_error");
  assert.strictEqual((await f.fetchPage("https://d.test/err")).outcome, "network_error");
  assert.strictEqual((await f.fetchPage("https://d.test/big")).outcome, "too_large");
  assert.strictEqual((await f.fetchPage("https://d.test/more")).outcome, "page_cap");
  assert.strictEqual((await f.fetchPage("not a url")).outcome, "bad_url");
  assert.strictEqual((await f.fetchPage("ftp://d.test/x")).outcome, "bad_url");

  // Crawl-delay honored (capped by maxDelayMs)
  const waits = [];
  f = createEvidenceFetcher({ fetch: site({
    "https://e.test/robots.txt": { status: 200, body: "User-agent: *\nCrawl-delay: 3" },
    "https://e.test/1": { status: 200, body: "a" }, "https://e.test/2": { status: 200, body: "b" },
  }, []), sleep: async (ms) => { waits.push(ms); } });
  await f.fetchPage("https://e.test/1"); await f.fetchPage("https://e.test/2");
  assert.ok(waits.length === 1 && waits[0] > 0 && waits[0] <= 3000, "delay between same-host fetches: " + waits);

  console.log("evidence-fetch-robots: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
