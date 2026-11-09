// P0 security remediation for api/upload-image.js (owner decision I1, 2026-10-17).
"use strict";
const assert = require("assert");
const crypto = require("crypto");
const guard = require("../api/_lib/upload-guard");

const KEY = "test-service-key";
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
function png(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
function gif(w, h) { const b = Buffer.alloc(20); b.write("GIF89a", 0, "latin1"); b.writeUInt16LE(w, 6); b.writeUInt16LE(h, 8); return b; }
function webpVp8x(w, h) {
  const b = Buffer.alloc(30); b.write("RIFF", 0, "latin1"); b.write("WEBP", 8, "latin1"); b.write("VP8X", 12, "latin1");
  const wm = w - 1; const hm = h - 1;
  b[24] = wm & 255; b[25] = (wm >> 8) & 255; b[26] = (wm >> 16) & 255; b[27] = hm & 255; b[28] = (hm >> 8) & 255; b[29] = (hm >> 16) & 255;
  return b;
}

// --- token
const t = guard.issueToken(KEY, 1_000_000_000_000);
assert.ok(guard.verifyToken(KEY, t, 1_000_000_000_000 + 1000).ok, "fresh token verifies");
assert.strictEqual(guard.verifyToken(KEY, t, 1_000_000_000_000 + guard.TOKEN_TTL_MS + 1).reason, "expired");
assert.strictEqual(guard.verifyToken("other-key", t, 1_000_000_000_000 + 1000).reason, "bad_signature");
assert.strictEqual(guard.verifyToken(KEY, undefined).ok, false);
assert.strictEqual(guard.verifyToken(KEY, "a.b.c").ok, false);
const [ts, nonce, mac] = t.split(".");
assert.strictEqual(guard.verifyToken(KEY, `${Number(ts) + 1}.${nonce}.${mac}`, 1_000_000_000_000 + 1000).reason, "bad_signature", "tampered timestamp");
assert.strictEqual(guard.verifyToken(KEY, guard.issueToken(KEY, 1_000_000_000_000 + 10 * 60000), 1_000_000_000_000).ok, false, "future-dated token refused");

// --- sniffing
assert.deepStrictEqual(guard.validateUpload(JPEG, "image/jpeg").ok, true);
assert.strictEqual(guard.validateUpload(png(800, 600), "image/png").ok, true);
assert.strictEqual(guard.validateUpload(gif(10, 10), "image/gif").ok, true);
assert.strictEqual(guard.validateUpload(webpVp8x(640, 480), "image/webp").ok, true);
assert.strictEqual(guard.validateUpload(JPEG, "image/png").ok, false, "type mismatch refused");
assert.strictEqual(guard.validateUpload(Buffer.from("<html><script>alert(1)</script></html>"), "image/png").ok, false, "html labelled png refused");
assert.strictEqual(guard.validateUpload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "image/jpeg").ok, false);
assert.strictEqual(guard.validateUpload(Buffer.alloc(256, 1), "image/jpeg").ok, false, "the old healthcheck filler bytes are refused");
assert.strictEqual(guard.validateUpload(png(20000, 20000), "image/png").status, 413, "pixel bomb refused");
assert.strictEqual(guard.validateUpload(png(0, 5), "image/png").ok, false);
assert.strictEqual(guard.validateUpload(Buffer.concat([JPEG.slice(0, 3)]), "image/jpeg").ok, false, "truncated");

// --- rate limit
const now = Date.parse("2026-10-17T12:00:00Z");
const ago = (m) => new Date(now - m * 60000).toISOString();
assert.strictEqual(guard.overClientLimit([ago(1), ago(2), ago(3), ago(4), ago(5)], now), false);
assert.strictEqual(guard.overClientLimit([ago(1), ago(2), ago(3), ago(4), ago(5), ago(6)], now), true);
assert.strictEqual(guard.overClientLimit([ago(70), ago(80), ago(90), ago(100), ago(110), ago(120), ago(130)], now), false, "old uploads do not count");

// --- client key / ip
assert.strictEqual(guard.clientIp({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), "1.2.3.4");
assert.strictEqual(guard.clientKey(KEY, "1.2.3.4"), guard.clientKey(KEY, "1.2.3.4"));
assert.notStrictEqual(guard.clientKey(KEY, "1.2.3.4"), guard.clientKey(KEY, "1.2.3.5"));
assert.ok(/^[0-9a-f]{16}$/.test(guard.clientKey(KEY, "x")), "client key is a safe path segment");

// --- handler on mocked network
async function run({ method = "POST", headers = {}, body, storage = {} }) {
  process.env.SUPABASE_URL = "https://stub.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
  delete require.cache[require.resolve("../api/upload-image")];
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes("/object/list/")) {
      if (storage.listFails) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => (storage.existing || []) };
    }
    return { ok: storage.uploadOk !== false, status: 200, text: async () => "" };
  };
  try {
    const handler = require("../api/upload-image");
    const res = { code: null, json: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json_(b) { this.json = b; } };
    res.json = function (b) { this.body = b; return this; };
    const req = Object.assign(require("stream").Readable.from(body ? [body] : []), { method, headers: Object.assign({ "x-forwarded-for": "9.9.9.9" }, headers) });
    await handler(req, res);
    return { res, calls };
  } finally { global.fetch = realFetch; }
}

(async () => {
  let r = await run({ method: "GET" });
  assert.strictEqual(r.res.code, 200); assert.ok(guard.verifyToken(KEY, r.res.body.token).ok);

  r = await run({ headers: { "content-type": "image/jpeg" }, body: JPEG });
  assert.strictEqual(r.res.code, 401, "no token -> 401"); assert.strictEqual(r.calls.length, 0, "nothing reaches storage");

  const token = guard.issueToken(KEY);
  r = await run({ headers: { "content-type": "image/jpeg", "x-upload-token": token }, body: JPEG });
  assert.strictEqual(r.res.code, 201);
  const up = r.calls.find((c) => c.opts.method === "POST" && !c.url.includes("/list/"));
  assert.ok(/\/event-flyers\/u\/[0-9a-f]{16}\/[0-9a-f-]{36}\.jpg$/.test(up.url), "per-client prefix, uuid name, ext from sniffed type");
  assert.strictEqual(up.opts.headers["x-upsert"], "false", "never overwrite");

  r = await run({ headers: { "content-type": "image/png", "x-upload-token": token }, body: Buffer.from("<html>") });
  assert.strictEqual(r.res.code, 400); assert.ok(!r.calls.some((c) => !c.url.includes("/list/")), "spoofed bytes never stored");

  r = await run({ headers: { "content-type": "image/jpeg", "x-upload-token": token, "content-length": String(5 * 1024 * 1024) }, body: JPEG });
  assert.strictEqual(r.res.code, 413);

  const recent = Array.from({ length: 6 }, () => ({ created_at: new Date().toISOString() }));
  r = await run({ headers: { "content-type": "image/jpeg", "x-upload-token": token }, body: JPEG, storage: { existing: recent } });
  assert.strictEqual(r.res.code, 429); assert.ok(!r.calls.some((c) => c.opts.method === "POST" && !c.url.includes("/list/")), "limited upload not stored");

  r = await run({ headers: { "content-type": "image/jpeg", "x-upload-token": token }, body: JPEG, storage: { listFails: true } });
  assert.strictEqual(r.res.code, 503, "rate-limit lookup failure fails closed");

  r = await run({ method: "PUT" });
  assert.strictEqual(r.res.code, 405);
  console.log("PASS: upload-image security");
})().catch((e) => { console.error(e); process.exit(1); });
