"use strict";
// Admin upload_image action: same x-admin-secret as every other action, exact event, dry run by default, never replaces.
process.env.ADMIN_SECRET = "s3cret-test"; process.env.SUPABASE_URL = "https://stub.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
const assert = require("assert");
const handler = require("../api/admin-events");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const ID = "28f6cbaa-44c4-4068-b13d-8d82ea083d99";
const calls = [];
let eventRow = { id: ID, title: "T", start_date: "2026-12-01", status: "approved", image_url: null, updated_at: "2026-11-01T00:00:00Z" };
global.fetch = async (url, opts) => {
  calls.push({ url: String(url), method: (opts && opts.method) || "GET" });
  if (/\/rest\/v1\/events\?id=eq\./.test(url) && (!opts || !opts.method)) return { ok: true, status: 200, json: async () => [eventRow] };
  throw new Error("unexpected write: " + url);
};
function call(headers, body) {
  return new Promise((resolve) => {
    const res = { status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); }, setHeader() {} };
    handler({ method: "POST", headers, body, query: {} }, res);
  });
}
(async () => {
  const b64 = PNG.toString("base64");
  // unauthorized is rejected before anything is read or written
  let r = await call({}, { id: ID, action: "upload_image", image_base64: b64, apply: true });
  assert.strictEqual(r.code, 401); assert.ok(calls.every((c) => c.method === "GET") && calls.length === 0);
  r = await call({ "x-admin-secret": "wrong" }, { id: ID, action: "upload_image", image_base64: b64, apply: true });
  assert.strictEqual(r.code, 401); assert.strictEqual(calls.length, 0);
  // authorized default is a dry run: nothing written
  r = await call({ "x-admin-secret": "s3cret-test" }, { id: ID, action: "upload_image", image_base64: b64 });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.outcome, "dry_run"); assert.strictEqual(r.body.changed, false);
  assert.ok(calls.every((c) => c.method === "GET"));
  // an existing image is never replaced, even with apply:true or a replace flag in the body
  eventRow = Object.assign({}, eventRow, { image_url: "https://example.com/old.png" });
  r = await call({ "x-admin-secret": "s3cret-test" }, { id: ID, action: "upload_image", image_base64: b64, apply: true, replace: true });
  assert.strictEqual(r.code, 409); assert.strictEqual(r.body.code, "image_already_set"); assert.ok(calls.every((c) => c.method === "GET"));
  // bad id and non-image bytes are rejected
  r = await call({ "x-admin-secret": "s3cret-test" }, { id: "nope", action: "upload_image", image_base64: b64 });
  assert.strictEqual(r.code, 400);
  eventRow = Object.assign({}, eventRow, { image_url: null });
  r = await call({ "x-admin-secret": "s3cret-test" }, { id: ID, action: "upload_image", image_base64: Buffer.from("not an image").toString("base64") });
  assert.strictEqual(r.code, 400); assert.strictEqual(r.body.code, "not_an_image");
  console.log("All admin-events-upload-image.test.js checks passed.");
})().catch((e) => { console.error(e); process.exit(1); });
