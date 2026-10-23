// Follow-up to the P0 upload hardening: submitter-supplied imageUrl validation (api/submit.js).
"use strict";
const assert = require("assert");
const { checkImageUrl, imageSourceNote } = require("../api/_lib/image-url-guard");

const ok = (u) => assert.strictEqual(checkImageUrl(u).ok, true, "should accept " + u);
const bad = (u, reason) => { const r = checkImageUrl(u); assert.strictEqual(r.ok, false, "should reject " + u); if (reason) assert.strictEqual(r.reason, reason, u); };

ok(undefined); ok(null); ok("");
ok("https://cdn.example.com/flyers/a.jpg?w=800&h=600");
ok("https://stub.supabase.co/storage/v1/object/public/event-flyers/u/abcd/1.jpg");
bad("http://example.com/a.jpg", "not-https");
bad("javascript:alert(1)", "not-https");
bad("data:image/png;base64,AAAA", "not-https");
bad("ftp://example.com/a.jpg", "not-https");
bad("https://user:pw@example.com/a.jpg", "credentials");
bad("https://example.com:8443/a.jpg", "port");
bad("https://localhost/a.jpg", "no-public-host");
bad("https://intranet/a.jpg", "no-public-host");
bad("https://127.0.0.1/a.jpg", "ip-literal");
bad("https://169.254.169.254/latest/meta-data", "ip-literal");
bad("https://[::1]/a.jpg", "ip-literal");
bad("https://2130706433/a.jpg", "ip-literal");
bad("https://printer.local/a.jpg", "private-host");
bad("https://db.internal/a.jpg", "private-host");
bad("https://example.com/" + "a".repeat(2100), "too-long");
bad("not a url", "unparseable");
bad(12345, "not-a-string");

assert.strictEqual(imageSourceNote("https://stub.supabase.co/storage/v1/object/public/event-flyers/u/x/1.jpg", "https://stub.supabase.co"), null, "own bucket needs no note");
assert.strictEqual(imageSourceNote("https://CDN.Example.com/a.jpg", "https://stub.supabase.co"), "IMAGE_SOURCE | submitter-link | host=cdn.example.com | not self-hosted");
assert.strictEqual(imageSourceNote("", "https://stub.supabase.co"), null);
console.log("PASS: image url guard");
