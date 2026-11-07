// Registration log line: facts only, never a client_id, token or full redirect URL.
"use strict";
const assert = require("assert");
process.env.EDITORIAL_GATEWAY_TOKEN = "s".repeat(40);
const handler = require("../api/editorial-oauth");
const lines = []; const orig = console.log; console.log = (...a) => lines.push(a.join(" "));
const call = (body, ctype) => new Promise((resolve) => { const res = { h: {}, setHeader() {}, status(c) { this.c = c; return this; }, json(b) { resolve({ c: this.c, b }); }, end() { resolve({ c: this.c }); } }; handler({ method: "POST", headers: { host: "313.events", "content-type": ctype }, query: { route: "register" }, body }, res); });
(async () => {
  const ok = await call({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback?secret=abc"], client_name: "Claude", grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "none" }, "application/json; charset=utf-8");
  const bad = await call({ redirect_uris: ["http://localhost:3118/cb"] }, "application/json");
  const garbage = await call("not json", "text/plain");
  const disc = await new Promise((resolve) => { const res = { setHeader() {}, status(c) { this.c = c; return this; }, json(b) { resolve({ c: this.c, b }); } }; handler({ method: "GET", headers: { host: "313.events", "user-agent": "ChatGPT-Test/1.0 " + "x".repeat(200), origin: "https://chatgpt.com", accept: "application/json", authorization: "Bearer " + "s".repeat(40) }, query: { route: "authorization-server" } }, res); });
  console.log = orig;
  assert.strictEqual(disc.c, 200);
  const dl = lines.filter((l) => l.includes('"editorial_oauth":"discovery"')).map((l) => JSON.parse(l));
  assert.strictEqual(dl.length, 1); assert.strictEqual(dl[0].route, "authorization-server"); assert.strictEqual(dl[0].origin_header, true); assert.ok(dl[0].ua.length <= 60);
  assert.strictEqual(ok.c, 201); assert.strictEqual(bad.c, 400); assert.strictEqual(garbage.c, 400);
  const logged = lines.filter((l) => l.includes('"editorial_oauth":"register"')).map((l) => JSON.parse(l));
  assert.strictEqual(logged.length, 3, "three register lines");
  assert.deepStrictEqual(logged.map((l) => l.status), [201, 400, 400]);
  assert.strictEqual(logged[0].content_type, "application/json"); assert.deepStrictEqual(logged[0].redirect_hosts, ["https://claude.ai"]);
  assert.strictEqual(logged[1].error, "invalid_redirect_uri"); assert.strictEqual(logged[2].body_parsed, false);
  const all = lines.join("\n");
  for (const forbidden of [ok.b.client_id, "s".repeat(40), "secret=abc", "/api/mcp/auth_callback"]) assert.ok(!all.includes(forbidden), `log must not contain: ${forbidden.slice(0, 12)}`);
  orig("PASS: oauth register log line: facts only, no client_id, token or URL path/query");
})();
