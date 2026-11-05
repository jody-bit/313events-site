// Client compatibility fixtures (Claude and ChatGPT connector shapes) with SYNTHETIC bytes only. No network, no real token, no secrets.
// Run: node test/editorial-gateway-clients.test.js
"use strict";
const assert = require("assert");
const crypto = require("crypto");

process.env.SUPABASE_URL = "https://stagingtest.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key-not-real";
process.env.EDITORIAL_GATEWAY_TOKEN = "t".repeat(40);
delete process.env.VERCEL_ENV;

const gw = require("../api/_lib/editorial-gateway");
const handler = require("../api/editorial-gateway");

const SB = process.env.SUPABASE_URL;
const EVENT = "554593cf-503a-495a-80f1-3c2445c5d77e";
const OTHER = "11111111-2222-3333-4444-555555555555";
const REJECTED = "99999999-2222-3333-4444-555555555555";

// A valid 960x830 JPEG header followed by filler (the sniffer reads dimensions from the SOF marker).
function jpeg(w, h, fill) {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]), sof, Buffer.alloc(fill || 2000, 7), Buffer.from([0xff, 0xd9])]);
}
const FLYER = jpeg(960, 830, 5000);
const FLYER_SHA = crypto.createHash("sha256").update(FLYER).digest("hex");

function makeWorld(overrides) {
  const world = {
    events: new Map(),
    objects: new Map(),
    writes: [],
    remote: new Map(),
    brokenReadback: false,
    pageHtml: null,
  };
  const row = (id, extra) => Object.assign({
    id, title: "Pop Tronics", start_date: "2026-10-29", end_date: null, time_display: "10:00 PM", status: "approved", source: "Manual",
    category: "music", venue_name_raw: "Cabbage Patch Saloon", venue_city_raw: "Grosse Pointe Park", image_url: null,
    external_id: "manual-cabbage-patch-live-electronic-2026-10-29", updated_at: "2026-10-26T17:53:30.002526+00:00", internal_note: "EI intake note.",
  }, extra || {});
  world.events.set(EVENT, row(EVENT, overrides && overrides.event));
  world.events.set(OTHER, row(OTHER, { title: "Another Show", external_id: "x-2", venue_name_raw: "Other Hall", start_date: "2026-11-02" }));
  world.events.set(REJECTED, row(REJECTED, { status: "rejected", title: "Hidden Show", external_id: "x-3" }));

  world.fetch = async (url, opts) => {
    opts = opts || {};
    const u = new URL(url);
    const method = opts.method || "GET";
    const res = (status, body, headers) => ({
      ok: status >= 200 && status < 300, status,
      headers: { get: (k) => (headers || {})[k.toLowerCase()] || null },
      json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
      arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(String(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); },
    });
    if (u.origin === SB && u.pathname === "/rest/v1/events" && method === "GET") {
      let rows = [...world.events.values()];
      const id = u.searchParams.get("id");
      if (id) rows = rows.filter((r) => `eq.${r.id}` === id);
      const or = u.searchParams.get("or");
      if (or) {
        const m = /title\.ilike\.\*(.*?)\*,/.exec(or);
        const term = m ? m[1].toLowerCase() : "";
        rows = rows.filter((r) => [r.title, r.venue_name_raw, r.external_id].some((v) => String(v).toLowerCase().includes(term)));
      }
      const gte = u.searchParams.getAll("start_date").find((v) => v.startsWith("gte."));
      if (gte) rows = rows.filter((r) => r.start_date === gte.slice(4));
      return res(200, rows.map((r) => Object.assign({}, r)));
    }
    if (u.origin === SB && u.pathname === "/rest/v1/events_public" && method === "GET") {
      const id = (u.searchParams.get("id") || "").replace("eq.", "");
      const r = world.events.get(id);
      return res(200, r && r.status === "approved" ? [{ id: r.id, title: r.title, image_url: r.image_url, start_date: r.start_date }] : []);
    }
    if (u.origin === SB && u.pathname === "/rest/v1/events" && method === "PATCH") {
      const id = u.searchParams.get("id").replace("eq.", "");
      const r = world.events.get(id);
      const imgFilter = u.searchParams.get("image_url");
      const upd = u.searchParams.get("updated_at").replace("eq.", "");
      const imageOk = imgFilter === "is.null" ? r.image_url === null : r.image_url === decodeURIComponent(imgFilter.replace("eq.", ""));
      if (!r || !imageOk || r.updated_at !== upd) return res(200, []);
      const patch = JSON.parse(opts.body);
      assert.deepStrictEqual(Object.keys(patch).sort(), ["image_url", "internal_note"], "gateway writes only image_url and internal_note");
      Object.assign(r, patch);
      world.writes.push({ id, patch });
      return res(200, [Object.assign({}, r)]);
    }
    if (u.origin === SB && u.pathname.startsWith("/storage/v1/object/event-flyers/") && method === "POST") {
      const path = u.pathname.replace("/storage/v1/object/event-flyers/", "");
      assert.ok(path.startsWith("editorial/"), "uploads only under editorial/");
      assert.strictEqual(opts.headers["x-upsert"], "false");
      if (world.objects.has(path)) return res(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
      world.objects.set(path, Buffer.from(opts.body));
      world.writes.push({ object: path });
      return res(200, { Key: path });
    }
    if (u.origin === SB && u.pathname.startsWith("/storage/v1/object/event-flyers/") && method === "DELETE") {
      const path = u.pathname.replace("/storage/v1/object/event-flyers/", "");
      world.objects.delete(path);
      world.writes.push({ deleted: path });
      return res(200, {});
    }
    if (u.origin === SB && u.pathname.startsWith("/storage/v1/object/public/event-flyers/") && method === "GET") {
      const path = u.pathname.replace("/storage/v1/object/public/event-flyers/", "");
      const b = world.objects.get(path);
      if (!b) return res(404, "not found");
      return res(200, world.brokenReadback ? Buffer.concat([b, Buffer.from([1])]) : b, { "content-type": "image/jpeg", "content-length": String(b.length) });
    }
    if (u.pathname === "/event.html") return res(world.pageHtml ? 200 : 500, world.pageHtml || "");
    if (world.remote.has(url)) {
      const r = world.remote.get(url);
      return res(r.status || 200, r.body, Object.assign({ "content-type": r.type || "image/jpeg" }, r.headers || {}));
    }
    return res(404, "unknown");
  };
  return world;
}

const PUBLIC_LOOKUP = async (host) => (host === "files.example.com" || host === "cdn.openai-files.example" ? [{ address: "93.184.216.34" }] : host === "internal.example" ? [{ address: "10.0.0.5" }] : [{ address: "93.184.216.34" }]);
const ctxFor = (world) => ({ supabaseUrl: SB, serviceKey: "service-role-test-key-not-real", fetchFn: world.fetch, lookup: PUBLIC_LOOKUP, siteUrl: "https://preview.example", now: () => new Date("2026-10-27T12:00:00Z") });
const b64 = (b) => b.toString("base64");
async function rejects(promise, code) {
  try { await promise; } catch (e) { assert.ok(e instanceof gw.GatewayError, String(e && e.stack)); assert.strictEqual(e.code, code); return e; }
  assert.fail(`expected ${code}`);
}

const { Readable } = require("stream");
const TOKEN = process.env.EDITORIAL_GATEWAY_TOKEN;
async function call(headers, body, url) {
  let status = 200, payload;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(p) { payload = p; return this; }, end() { return this; } };
  const req = Buffer.isBuffer(body) ? Readable.from([body]) : { body };
  req.method = "POST"; req.url = url || "/api/editorial-gateway"; req.headers = Object.assign({ host: "preview.example" }, headers);
  await handler(req, res);
  return { status, payload };
}
const mcp = (name, args, id) => ({ jsonrpc: "2.0", id: id || 1, method: "tools/call", params: { name, arguments: args } });
const J = { "content-type": "application/json" };
const ok = (m) => console.log("PASS: " + m);

(async () => {
  const realFetch = global.fetch;
  let w = makeWorld();
  global.fetch = w.fetch;
  const bearer = Object.assign({ authorization: "Bearer " + TOKEN }, J);

  // F1 Claude custom connector with a Request header (Authorization: Bearer <token>) -> MCP initialize / tools/list / find / dry run / apply
  let r = await call(bearer, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-ai", version: "1" } } });
  assert.strictEqual(r.payload.result.serverInfo.name, "313events-editorial-gateway");
  r = await call(bearer, { jsonrpc: "2.0", method: "notifications/initialized" });
  assert.strictEqual(r.status, 202, "initialized notification gets no body");
  r = await call(bearer, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  const up = r.payload.result.tools.find((t) => t.name === "upload_event_image");
  assert.deepStrictEqual(up._meta["openai/fileParams"], ["file"]);
  assert.strictEqual(up.annotations.readOnlyHint, false);
  r = await call(bearer, mcp("find_event", { query: "pop tronics" }));
  assert.strictEqual(r.payload.result.structuredContent.events[0].id, EVENT);
  ok("F1 Claude header-auth MCP handshake, tools/list and find_event");

  // F2 Claude image_base64 path (a chat attachment cannot be passed as a file; the model must supply bytes or a public URL)
  r = await call(bearer, mcp("upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), client: "claude" }));
  assert.strictEqual(r.payload.result.structuredContent.outcome, "dry_run");
  assert.strictEqual(w.writes.length, 0);
  r = await call(bearer, mcp("upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), dry_run: false, expected_sha256: FLYER_SHA, client: "claude" }));
  assert.strictEqual(r.payload.result.structuredContent.outcome, "applied");
  ok("F2 Claude image_base64: dry run writes nothing, apply stores the exact bytes");

  // F3 Claude image_url path (public https, synthetic host)
  w = makeWorld(); global.fetch = w.fetch;
  w.remote.set("https://93.184.216.34/flyer.jpg", { body: FLYER });
  r = await call(bearer, mcp("upload_event_image", { event_id: EVENT, image_url: "https://93.184.216.34/flyer.jpg", dry_run: false, client: "claude" }));
  assert.strictEqual(r.payload.result.structuredContent.outcome, "applied");
  ok("F3 Claude image_url path");

  // F4 ChatGPT file param: the host fills {download_url,file_id,mime_type,file_name}; public-IP literal avoids DNS
  w = makeWorld(); global.fetch = w.fetch;
  w.remote.set("https://93.184.216.34/files/file_synthetic_1", { body: FLYER });
  const file = { download_url: "https://93.184.216.34/files/file_synthetic_1", file_id: "file_synthetic_1", mime_type: "image/jpeg", file_name: "flyer.jpg" };
  r = await call(bearer, mcp("upload_event_image", { event_id: EVENT, file, dry_run: false, client: "chatgpt" }));
  assert.strictEqual(r.payload.result.structuredContent.outcome, "applied");
  assert.strictEqual(r.payload.result.structuredContent.image.sha256, FLYER_SHA);
  ok("F4 ChatGPT file object (download_url) fetched, validated and stored");

  // F5 hostile file objects are refused before any write
  w = makeWorld(); global.fetch = w.fetch;
  for (const u of ["http://93.184.216.34/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "https://user:pw@93.184.216.34/x", "https://93.184.216.34:8443/x", "https://[::ffff:7f00:1]/x"]) {
    r = await call(bearer, mcp("upload_event_image", { event_id: EVENT, file: { download_url: u, file_id: "f" }, dry_run: false }));
    assert.strictEqual(r.payload.result.isError, true, u);
  }
  assert.strictEqual(w.writes.length, 0);
  ok("F5 http, loopback, metadata, credentialed, non-443 and mapped-IPv6 download_urls refused with zero writes");

  // F6 AUTH MATRIX. Only a static bearer/X-Editorial-Token is accepted. OAuth tokens, query-string tokens and no-auth are refused.
  const body = mcp("find_event", { query: "pop" });
  assert.strictEqual((await call(Object.assign({ "x-editorial-token": TOKEN }, J), body)).status, 200, "X-Editorial-Token header");
  assert.strictEqual((await call(J, body)).status, 401, "no credential (ChatGPT 'No authentication' / Claude 'No sign-in' with no header)");
  assert.strictEqual((await call(Object.assign({ authorization: "Bearer oauth-access-token-synthetic-0123456789" }, J), body)).status, 401, "an OAuth access token minted by anyone else is not accepted: there is no OAuth front");
  assert.strictEqual((await call(J, body, "/api/editorial-gateway?token=" + TOKEN)).status, 401, "a token in the query string is NEVER accepted");
  assert.strictEqual((await call(J, body, "/api/editorial-gateway?access_token=" + TOKEN)).status, 401, "access_token query param refused too");
  ok("F6 auth matrix: bearer and X-Editorial-Token only; OAuth-minted, query-string and anonymous calls get 401");

  // F7 logs never carry the token
  const lines = [];
  const origLog = console.log; console.log = (...a) => lines.push(a.join(" "));
  await call(J, body, "/api/editorial-gateway?token=" + TOKEN);
  await call(Object.assign({ authorization: "Bearer " + "z".repeat(30) }, J), body);
  console.log = origLog;
  assert.ok(lines.length >= 2 && lines.every((l) => !l.includes(TOKEN) && !l.includes("z".repeat(30))), "refusal logs carry no secret");
  ok("F7 refusal logs contain no token value");

  // F8 file-adapter defenses (ChatGPT temporary download_url). Synthetic bytes only.
  w = makeWorld(); global.fetch = w.fetch;
  const SECRET_Q = "sig=TEMP-SIGNATURE-SYNTHETIC-123";
  const U = "https://93.184.216.34/dl/f1?" + SECRET_Q;
  const fileFor = (u, extra) => Object.assign({ download_url: u, file_id: "file_syn" }, extra || {});
  const upl = (f, extra) => call(bearer, mcp("upload_event_image", Object.assign({ event_id: EVENT, file: f, dry_run: false }, extra || {})));
  // redirect hop to a private address is refused
  w.remote.set(U, { status: 302, body: "", headers: { location: "https://10.0.0.5/x" } });
  r = await upl(fileFor(U)); assert.strictEqual(r.payload.result.isError, true); assert.strictEqual(w.writes.length, 0);
  // redirect to metadata IP literal and to http
  w.remote.set(U, { status: 302, body: "", headers: { location: "http://93.184.216.34/x" } });
  r = await upl(fileFor(U)); assert.strictEqual(r.payload.result.isError, true);
  // oversize (> 4 MB) refused
  w.remote.set(U, { body: Buffer.concat([FLYER, Buffer.alloc(4 * 1024 * 1024, 1)]) });
  r = await upl(fileFor(U)); assert.strictEqual(r.payload.result.isError, true); assert.strictEqual(w.writes.length, 0);
  // HTML / SVG disguised as an image, declared mime lying, empty body
  for (const bad of [Buffer.from("<html><script>1</script></html>"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.alloc(0)]) {
    w.remote.set(U, { body: bad, type: "image/jpeg" });
    r = await upl(fileFor(U, { mime_type: "image/jpeg" })); assert.strictEqual(r.payload.result.isError, true);
  }
  // pixel bomb header (65535 x 65535) refused
  w.remote.set(U, { body: jpeg(65535, 65535, 100) });
  r = await upl(fileFor(U)); assert.strictEqual(r.payload.result.isError, true);
  assert.strictEqual(w.writes.length, 0, "every refused file wrote nothing");
  // happy path, then the temporary URL must not leak into logs, audit line or response
  w.remote.set(U, { body: FLYER });
  const logs = []; const ol = console.log; const oe = console.error; console.log = (...a) => logs.push(a.join(" ")); console.error = (...a) => logs.push(a.join(" "));
  r = await upl(fileFor(U, { file_name: "flyer.jpg" }), { client: "chatgpt" });
  console.log = ol; console.error = oe;
  assert.strictEqual(r.payload.result.structuredContent.outcome, "applied");
  const blob = JSON.stringify(r.payload) + logs.join("\n") + w.events.get(EVENT).internal_note;
  assert.ok(!blob.includes("TEMP-SIGNATURE-SYNTHETIC-123") && !blob.includes(TOKEN), "temporary download signature and token absent from response, logs and audit note");
  ok("F8 file adapter: private/http redirect hops, >4 MB, HTML/SVG/empty, pixel bomb refused with zero writes; temp URL signature never logged or stored");

  global.fetch = realFetch;
  console.log("\nAll editorial-gateway-clients.test.js checks passed.");
})().catch((e) => { console.error(e); process.exit(1); });
