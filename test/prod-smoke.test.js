// test/prod-smoke.test.js — scripts/prod-smoke.js against a fake fetch. Proves: it passes on a healthy production
// shape, fails for each broken shape, issues GET requests only, and sends no credential beyond the public anon key.
"use strict";
const assert = require("assert");
const path = require("path");
const S = require(path.join(__dirname, "..", "scripts", "prod-smoke.js"));

const BASE = "https://313.events";
const REF = S.PRODUCTION_REF;
const big = "x".repeat(6000);

function makeFetch(over) {
  over = over || {};
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || "GET", headers: (init && init.headers) || {} });
    const u = new URL(url);
    const hdr = (h) => ({ get: (k) => (Object.assign({ "x-vercel-id": "iad1::abc-123" }, h || {}))[String(k).toLowerCase()] || null });
    const mk = (status, body, h) => ({ status, headers: hdr(h), text: async () => body, json: async () => JSON.parse(body) });
    if (over[u.pathname]) return over[u.pathname](u, mk);
    if (u.pathname === "/config.js") return mk(200, 'window.__313_CONFIG = ' + JSON.stringify({ environment: "production", supabaseUrl: "https://" + REF + ".supabase.co", supabaseAnonKey: "anon-key" }) + ";");
    if (u.pathname === "/rest/v1/events_public") return mk(206, JSON.stringify([{ id: "e1", title: "Jazz & Blues" }]), { "content-range": "0-0/2300" });
    if (u.pathname === "/") return mk(200, "<html>paged-fetch.js" + big + "</html>");
    if (u.pathname === "/calendar") return mk(200, '<html><div id="calGrid"></div>' + big + "</html>");
    if (u.pathname === "/map") return mk(200, "<html>leaflet" + big + "</html>");
    if (u.pathname === "/event.html") return mk(200, '<title id="pageTitle">Jazz &amp; Blues — Friday — 313.events</title>');
    if (u.pathname === "/sitemap.xml") return mk(200, "<urlset>" + "<loc>a</loc>".repeat(20) + "</urlset>");
    if (u.pathname === "/api/admin-events") return mk(401, "{}");
    return mk(404, "");
  };
  f.calls = calls;
  return f;
}

(async () => {
  // healthy
  let f = makeFetch();
  let r = await S.runSmoke({ base: BASE, fetchImpl: f, commit: "abc1234" });
  assert.strictEqual(r.ok, true, S.format(r));
  assert.strictEqual(r.evidence.vercel_request_id, "iad1::abc-123");
  assert.strictEqual(r.evidence.commit, "abc1234");
  assert.ok(r.checks.length >= 8);
  // read-only: every request is a GET, and the only credential is the public anon key on the REST call
  assert.ok(f.calls.every((c) => c.method === "GET"), "non-GET request issued");
  assert.ok(f.calls.filter((c) => !/\/rest\/v1\//.test(c.url)).every((c) => !c.headers.Authorization && !c.headers.apikey), "credential sent to a non-API URL");
  assert.ok(!f.calls.some((c) => /x-admin-secret/i.test(JSON.stringify(c.headers))), "admin secret header sent");

  // each broken shape fails exactly the right check
  const cases = [
    ["config points at staging", { "/config.js": (u, mk) => mk(200, 'window.__313_CONFIG = {"environment":"preview","supabaseUrl":"https://efxjdlogohcggpuftivm.supabase.co","supabaseAnonKey":"k"};') }, "config.js names the PRODUCTION database"],
    ["inventory below floor", { "/rest/v1/events_public": (u, mk) => mk(206, JSON.stringify([{ id: "e1", title: "T" }]), { "content-range": "0-0/12" }) }, "events_public returns upcoming events (count above floor)"],
    ["inventory empty", { "/rest/v1/events_public": (u, mk) => mk(200, "[]", { "content-range": "*/0" }) }, "events_public returns upcoming events (count above floor)"],
    ["homepage truncated", { "/": (u, mk) => mk(200, "<html></html>") }, "homepage loads with its data client"],
    ["event page shows another title", { "/event.html": (u, mk) => mk(200, '<title id="pageTitle">Event details — 313.events</title>') }, "event detail page serves the event's own title"],
    ["calendar page without its grid (nav text only)", { "/calendar": (u, mk) => mk(200, "<html><nav>calendar</nav>" + "x".repeat(5000) + "</html>") }, "calendar page loads"],
    ["sitemap empty", { "/sitemap.xml": (u, mk) => mk(200, "<urlset></urlset>") }, "sitemap lists events"],
    ["admin API open", { "/api/admin-events": (u, mk) => mk(200, "{}") }, "admin API refuses anonymous callers"],
  ];
  for (const [label, over, expectedFail] of cases) {
    r = await S.runSmoke({ base: BASE, fetchImpl: makeFetch(over) });
    assert.strictEqual(r.ok, false, label + " should fail");
    assert.ok(r.failed.includes(expectedFail), label + ": expected failure '" + expectedFail + "', got " + JSON.stringify(r.failed));
  }

  // a network error is a failed check, not a crash
  r = await S.runSmoke({ base: BASE, fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  assert.strictEqual(r.ok, false);
  assert.ok(r.checks.every((c) => !c.ok));

  console.log("prod-smoke: ok");
})().catch((e) => { console.error(e); process.exit(1); });
