// Editorial Gateway (owner P1 "Express Lane", 2026-10-26): find_event, upload_event_image, verify_event, the MCP and REST
// transports, auth, and the safeguards. No network: a small in-memory Supabase stands in for the REST and Storage APIs.
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
    if (u.origin === SB && u.pathname === "/rest/v1/events" && method === "POST") {
      const body = JSON.parse(opts.body);
      const id = "aaaaaaaa-0000-0000-0000-" + String(world.events.size).padStart(12, "0");
      const r = Object.assign({ id, updated_at: "2026-10-31T21:00:00+00:00", image_url: null }, body);
      world.events.set(id, r); world.writes.push({ created: id });
      return res(201, [Object.assign({}, r)]);
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

(async () => {
  // --- auth
  assert.strictEqual(gw.authorized({ authorization: `Bearer ${"t".repeat(40)}` }, "t".repeat(40)), true);
  assert.strictEqual(gw.authorized({ "x-editorial-token": "t".repeat(40) }, "t".repeat(40)), true);
  assert.strictEqual(gw.authorized({ authorization: "Bearer wrong" }, "t".repeat(40)), false);
  assert.strictEqual(gw.authorized({}, "t".repeat(40)), false);
  assert.strictEqual(gw.authorized({ authorization: "Bearer short" }, "short"), false, "a short configured token is refused outright");
  assert.strictEqual(gw.authorized({ authorization: "Bearer x" }, undefined), false, "no configured token fails closed");
  // Stray whitespace or quotes from a dashboard paste are not part of the secret.
  const T40 = "t".repeat(40);
  assert.strictEqual(gw.authorized({ authorization: `Bearer ${T40}` }, `${T40}\n`), true, "configured token with a trailing newline");
  assert.strictEqual(gw.authorized({ authorization: `Bearer ${T40}` }, ` "${T40}" `), true, "configured token wrapped in quotes");
  assert.strictEqual(gw.authorized({ authorization: `Bearer  ${T40}  ` }, T40), true, "caller token with spaces");
  assert.strictEqual(gw.authorized({ authorization: `Bearer ${T40}x` }, T40), false);
  assert.strictEqual(gw.authorized({ authorization: "Bearer " }, T40), false);
  assert.deepStrictEqual(gw.tokenStatus(undefined), { state: "unset" });
  assert.strictEqual(gw.tokenStatus("abc").state, "too_short");
  assert.strictEqual(gw.tokenStatus("abc").length_class, "under_16");
  assert.strictEqual(gw.tokenStatus("x".repeat(20)).length_class, "16_to_23");
  assert.strictEqual(gw.tokenStatus("x".repeat(20)).state, "ok", "a 16-23 character token (the owner's Preview token) is accepted");
  assert.strictEqual(gw.tokenStatus("x".repeat(15)).state, "too_short");
  assert.strictEqual(gw.authorized({ authorization: `Bearer ${"k".repeat(20)}` }, "k".repeat(20)), true);
  assert.deepStrictEqual(gw.tokenStatus(`${T40}\n`), { state: "ok", had_outer_whitespace_or_quotes: true, has_inner_whitespace: false, length_class: "24_or_more" });
  assert.ok(!JSON.stringify(gw.tokenStatus(T40)).includes("tttt"), "the status never carries the value");
  assert.strictEqual(gw.authFailureReason({}, T40), "no_credential_sent");
  assert.strictEqual(gw.authFailureReason({ authorization: "Basic abc" }, T40), "authorization_header_not_bearer");
  assert.strictEqual(gw.authFailureReason({ authorization: "Bearer nope" }, T40), "mismatch");
  assert.strictEqual(gw.authFailureReason({ authorization: "Bearer nope" }, "short"), "configured_too_short");
  assert.strictEqual(gw.authFailureReason({ authorization: "Bearer nope" }, undefined), "configured_unset");
  console.log("PASS: auth fails closed; bearer and x-editorial-token accepted"); console.log("PASS: pasted whitespace/quotes tolerated; refusal reasons and token status never carry the value");

  // --- find_event
  let w = makeWorld();
  let r = await gw.run(ctxFor(w), "find_event", { query: "pop tronics" });
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.events[0].id, EVENT);
  assert.strictEqual(r.events[0].has_image, false);
  r = await gw.run(ctxFor(w), "find_event", { date: "2026-11-02" });
  assert.strictEqual(r.events[0].id, OTHER);
  r = await gw.run(ctxFor(w), "find_event", { query: "no such thing" });
  assert.strictEqual(r.count, 0);
  assert.ok(/duplicate/i.test(r.note));
  r = await gw.run(ctxFor(w), "find_event", { query: "x),status.eq.rejected,(title.ilike.%" });
  assert.ok(Array.isArray(r.events), "filter characters in a query cannot break out of the filter");
  await rejects(gw.run(ctxFor(w), "find_event", {}), "bad_request");
  await rejects(gw.run(ctxFor(w), "find_event", { event_id: "not-a-uuid" }), "bad_event_id");
  await rejects(gw.run(ctxFor(w), "nope", {}), "unknown_operation");
  await rejects(gw.run(ctxFor(w), "constructor", {}), "unknown_operation");
  console.log("PASS: find_event by query, date and id; empty result warns about duplicates; filter characters neutralised");

  // --- upload: dry run is the default and writes nothing
  w = makeWorld();
  r = await gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER) });
  assert.strictEqual(r.outcome, "dry_run");
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.image.sha256, FLYER_SHA);
  assert.strictEqual(r.image.width, 960);
  assert.strictEqual(r.image.height, 830);
  assert.strictEqual(w.writes.length, 0, "dry run writes nothing");
  assert.strictEqual(w.events.get(EVENT).image_url, null);
  console.log("PASS: upload defaults to a dry run that validates and writes nothing");

  // --- upload: apply
  r = await gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), dry_run: false, expected_sha256: FLYER_SHA, client: "claude", source_note: "supplied by the owner" });
  assert.strictEqual(r.outcome, "applied");
  const expectedPath = `editorial/${EVENT}/${FLYER_SHA.slice(0, 16)}.jpg`;
  assert.strictEqual(r.image.url, `${SB}/storage/v1/object/public/event-flyers/${expectedPath}`);
  const stored = w.events.get(EVENT);
  assert.strictEqual(stored.image_url, r.image.url);
  assert.ok(stored.internal_note.startsWith("EI intake note.\n[editorial-gateway 2026-10-27T12:00:00.000Z]"), "audit appended, prior note kept");
  assert.ok(stored.internal_note.includes(FLYER_SHA.slice(0, 16)) && stored.internal_note.includes("by claude") && stored.internal_note.includes("supplied by the owner"));
  assert.strictEqual(stored.title, "Pop Tronics");
  assert.strictEqual(stored.start_date, "2026-10-29");
  assert.strictEqual(w.events.size, 3, "no event created");
  assert.ok(w.objects.get(expectedPath).equals(FLYER), "stored bytes are the original bytes");
  console.log("PASS: apply stores the original bytes under a content-hash name, sets image_url, appends the audit note, touches nothing else");

  // --- upload: retry is idempotent
  const writesBefore = w.writes.length;
  r = await gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), dry_run: false });
  assert.strictEqual(r.outcome, "already_applied");
  assert.strictEqual(w.writes.length, writesBefore, "a retry writes nothing");
  console.log("PASS: retry of the same bytes reports already_applied and writes nothing");

  // --- upload: existing different image is protected
  const err = await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(jpeg(800, 600, 900)), dry_run: false }), "image_already_set");
  assert.strictEqual(err.extra.current_image_url, stored.image_url);
  r = await gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(jpeg(800, 600, 900)), dry_run: false, replace: true });
  assert.strictEqual(r.outcome, "applied");
  assert.ok(w.events.get(EVENT).internal_note.includes("replaced "), "replacement records the previous url");
  console.log("PASS: an existing image is never overwritten without replace:true, and a replacement is audited");

  // --- upload: refusals
  w = makeWorld();
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: REJECTED, image_base64: b64(FLYER), dry_run: false }), "event_not_writable");
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: "00000000-0000-0000-0000-000000000000", image_base64: b64(FLYER) }), "event_not_found");
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(Buffer.from("<html><script>alert(1)</script></html>")) }), "not_an_image");
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: "not base64 !!" }), "bad_request");
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT }), "bad_request");
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), image_url: "https://files.example.com/a.jpg" }), "bad_request");
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), expected_sha256: "0".repeat(64) }), "hash_mismatch");
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(jpeg(20000, 20000, 100)) }), "invalid_image");
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(Buffer.alloc(gw.MAX_BYTES + 1, 1)) }), "too_large");
  assert.strictEqual(w.writes.length, 0, "no refusal wrote anything");
  console.log("PASS: rejected events, unknown ids, non-images, bad base64, ambiguous input, hash mismatch, huge pixels and oversize are all refused before any write");

  // --- upload: declared type must agree with the bytes
  w = makeWorld();
  w.remote.set("https://files.example.com/liar.png", { body: FLYER, type: "image/png" });
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_url: "https://files.example.com/liar.png" }), "type_mismatch");

  // --- upload: by URL and by ChatGPT file object
  w.remote.set("https://files.example.com/flyer.jpg", { body: FLYER });
  r = await gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_url: "https://files.example.com/flyer.jpg", dry_run: false });
  assert.strictEqual(r.outcome, "applied");
  assert.strictEqual(r.image.via, "url");
  w = makeWorld();
  w.remote.set("https://cdn.openai-files.example/file_abc?sig=1", { body: FLYER, type: "application/octet-stream" });
  r = await gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, file: { download_url: "https://cdn.openai-files.example/file_abc?sig=1", file_id: "file_abc", mime_type: "image/jpeg", file_name: "IMG_2352.jpeg" }, dry_run: false });
  assert.strictEqual(r.outcome, "applied");
  assert.strictEqual(r.image.via, "attachment");
  assert.strictEqual(r.image.sha256, FLYER_SHA);
  console.log("PASS: image_url and a ChatGPT file object both reach the same validated path");

  // --- SSRF guard
  w = makeWorld();
  for (const bad of ["http://files.example.com/a.jpg", "https://user:pw@files.example.com/a.jpg", "https://files.example.com:8443/a.jpg", "https://internal.example/a.jpg", "https://127.0.0.1/a.jpg", "https://[::1]/a.jpg", "https://169.254.169.254/latest/meta-data", "ftp://files.example.com/a", "not a url"]) {
    await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_url: bad }), bad.startsWith("http://") || bad.startsWith("ftp") || bad.startsWith("https://user") || bad.includes(":8443") || bad === "not a url" ? "bad_url" : "blocked_host");
  }
  w.remote.set("https://files.example.com/hop", { status: 302, body: "", headers: { location: "https://internal.example/secret.jpg" } });
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_url: "https://files.example.com/hop" }), "blocked_host");
  w.remote.set("https://files.example.com/missing.jpg", { status: 404, body: "" });
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_url: "https://files.example.com/missing.jpg" }), "fetch_failed");
  w.remote.set("https://files.example.com/huge.jpg", { body: FLYER, headers: { "content-length": String(gw.MAX_BYTES + 5) } });
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_url: "https://files.example.com/huge.jpg" }), "too_large");
  assert.ok(gw.isPrivateAddress("10.1.2.3") && gw.isPrivateAddress("192.168.0.1") && gw.isPrivateAddress("172.20.0.1") && gw.isPrivateAddress("::ffff:127.0.0.1") && gw.isPrivateAddress("fd00::1"));
  for (const bad of ["::ffff:7f00:1", "::ffff:a9fe:a9fe", "::ffff:a00:1", "::7f00:1", "64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "::ffff:127.0.0.1", "0:0:0:0:0:ffff:c0a8:1", "2002:7f00:1::1", "2002:0a00:0001::", "::", "::1", "fe80::1", "fc00::1", "ff02::1", "64:ff9b:1::1", "fd12::9", "not-an-ip"]) assert.ok(gw.isPrivateAddress(bad), `${bad} must be refused`);
  for (const host of ["https://[::ffff:127.0.0.1]/a.jpg", "https://[::ffff:7f00:1]/a.jpg", "https://[::ffff:a9fe:a9fe]/a.jpg", "https://[64:ff9b::7f00:1]/a.jpg"]) {
    await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_url: host }), "blocked_host");
  }
  assert.ok(!gw.isPrivateAddress("93.184.216.34") && !gw.isPrivateAddress("2606:2800:220:1:248:1893:25c8:1946"));
  assert.strictEqual(w.writes.length, 0);
  console.log("PASS: remote fetch refuses http, credentials, odd ports, private/loopback/link-local hosts, redirects into them and oversize bodies");

  // --- race and read-back protection
  w = makeWorld();
  const ctxRace = ctxFor(w);
  const realFetch = w.fetch;
  ctxRace.fetchFn = async (url, opts) => {
    if ((opts || {}).method === "PATCH") w.events.get(EVENT).updated_at = "2026-10-27T11:59:59+00:00"; // someone edits the row mid-flight
    return realFetch(url, opts);
  };
  await rejects(gw.run(ctxRace, "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), dry_run: false }), "conflict");
  assert.strictEqual(w.events.get(EVENT).image_url, null, "a conflicting edit is never overwritten");
  assert.strictEqual(w.objects.size, 0, "the object created by the conflicted request is removed (no orphan)");
  w = makeWorld();
  w.brokenReadback = true;
  await rejects(gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), dry_run: false }), "storage_verify_failed");
  assert.strictEqual(w.events.get(EVENT).image_url, null, "the event is not changed when the stored bytes do not read back identically");
  assert.strictEqual(w.objects.size, 0, "a bad read-back leaves no orphan object");
  // A database failure also removes the object this request created.
  w = makeWorld();
  const ctxDb = ctxFor(w); const realDb = w.fetch;
  ctxDb.fetchFn = async (url, opts) => ((opts || {}).method === "PATCH" ? { ok: false, status: 500, json: async () => ({}), text: async () => "" } : realDb(url, opts));
  await rejects(gw.run(ctxDb, "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), dry_run: false }), "database_error");
  assert.strictEqual(w.objects.size, 0, "a failed database update leaves no orphan object");
  // An object that already existed (same bytes uploaded earlier) is never deleted by a later failure.
  w = makeWorld();
  await gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), dry_run: false });
  w.events.get(EVENT).image_url = null;
  const ctxKeep = ctxFor(w); const realKeep = w.fetch;
  ctxKeep.fetchFn = async (url, opts) => ((opts || {}).method === "PATCH" ? { ok: false, status: 500, json: async () => ({}), text: async () => "" } : realKeep(url, opts));
  await rejects(gw.run(ctxKeep, "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), dry_run: false }), "database_error");
  assert.strictEqual(w.objects.size, 1, "a pre-existing object is not deleted");
  console.log("PASS: a row edited mid-flight is not overwritten; a bad read-back leaves the event untouched");

  // --- owner-approved image is locked against feed refreshes; credit is recorded internally
  w = makeWorld();
  const lockedRes = await gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), dry_run: false, credit: "Photo: Jane Doe", client: "claude" });
  assert.strictEqual(lockedRes.locked_against_feed_refresh, true);
  const lockNote = w.events.get(EVENT).internal_note;
  const contractMod = require("../api/_lib/event-contract");
  assert.ok(contractMod.ownerCorrectedFields(lockNote).has("image_url"), "the marker locks image_url");
  assert.ok(/credit: Photo: Jane Doe/.test(lockNote), "credit is kept in the internal note");
  const prot = contractMod.protectOwnerCorrections([{ external_id: "x1", image_url: "https://feed.example/new.jpg", title: "T" }], new Map([["x1", { internal_note: lockNote, image_url: w.events.get(EVENT).image_url }]]));
  assert.strictEqual(prot.rows[0].image_url, w.events.get(EVENT).image_url, "a feed refresh cannot replace the approved image");
  assert.deepStrictEqual(contractMod.ownerCorrectionView({ internal_note: lockNote }).owner_corrected, [], "the admin correction view is unchanged by the image lock");
  console.log("PASS: applied images are locked against feed refreshes, credit recorded internally, no orphan objects after failures");

  // --- verify_event
  w = makeWorld();
  await gw.run(ctxFor(w), "upload_event_image", { event_id: EVENT, image_base64: b64(FLYER), dry_run: false });
  const url = w.events.get(EVENT).image_url;
  w.pageHtml = `<html><head><meta property="og:image" id="ogImage" content="${url}"></head></html>`;
  r = await gw.run(ctxFor(w), "verify_event", { event_id: EVENT, expected_sha256: FLYER_SHA });
  assert.strictEqual(r.ok, true, JSON.stringify(r.checks));
  assert.ok(r.checks.some((c) => c.name === "event_page_serves_image" && c.ok));
  w.pageHtml = "<html><head><meta property=\"og:image\" id=\"ogImage\" content=\"https://313.events/default.png\"></head></html>";
  r = await gw.run(ctxFor(w), "verify_event", { event_id: EVENT });
  assert.strictEqual(r.ok, false);
  r = await gw.run(ctxFor(makeWorld()), "verify_event", { event_id: EVENT });
  assert.strictEqual(r.ok, false);
  assert.ok(r.checks.some((c) => c.name === "has_image" && !c.ok));
  r = await gw.run(ctxFor(makeWorld()), "verify_event", { event_id: REJECTED });
  assert.ok(r.checks.some((c) => c.name === "visible_in_public_view" && !c.ok));
  console.log("PASS: verify_event checks the row, public view, image bytes and event page, and fails loudly when any is off");

  // --- transports
  const realGlobalFetch = global.fetch;
  w = makeWorld();
  global.fetch = w.fetch;
  const call = async (headers, body) => {
    let status = 200, payload;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(p) { payload = p; return this; }, end() { return this; } };
    await handler({ method: "POST", headers: Object.assign({ host: "preview.example" }, headers), body }, res);
    return { status, payload };
  };
  const auth = { authorization: `Bearer ${"t".repeat(40)}` };
  assert.strictEqual((await call({}, { op: "find_event", query: "pop" })).status, 401);
  {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    assert.strictEqual((await call({}, { op: "find_event", query: "pop" })).status, 401, "unauthenticated callers learn nothing about configuration");
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  }
  assert.strictEqual((await call({ authorization: "Bearer wrong" }, { op: "find_event", query: "pop" })).status, 401);
  let out = await call(auth, { op: "find_event", query: "pop" });
  assert.strictEqual(out.status, 200);
  assert.strictEqual(out.payload.result.events[0].id, EVENT);
  out = await call(auth, { op: "upload_event_image", event_id: REJECTED, image_base64: b64(FLYER), dry_run: false });
  assert.strictEqual(out.status, 409);
  assert.strictEqual(out.payload.error.code, "event_not_writable");
  assert.strictEqual((await call(auth, [1, 2])).status, 400);

  out = await call(auth, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.strictEqual(out.payload.result.serverInfo.name, "313events-editorial-gateway");
  out = await call(auth, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = out.payload.result.tools.map((t) => t.name);
  assert.deepStrictEqual(names, ["find_event", "create_event", "upload_event_image", "verify_event"]);
  const up = out.payload.result.tools.find((t) => t.name === "upload_event_image");
  assert.deepStrictEqual(up._meta["openai/fileParams"], ["file"]);
  assert.deepStrictEqual(up.inputSchema.properties.file.required, ["download_url", "file_id"]);
  assert.strictEqual(up.annotations.readOnlyHint, false);
  assert.ok(out.payload.result.tools.filter((t) => t.name !== "upload_event_image" && t.name !== "create_event").every((t) => t.annotations.readOnlyHint === true));
  out = await call(auth, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "find_event", arguments: { query: "pop" } } });
  assert.strictEqual(out.payload.result.isError, false);
  assert.strictEqual(out.payload.result.structuredContent.events[0].id, EVENT);
  out = await call(auth, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "upload_event_image", arguments: { event_id: REJECTED, image_base64: b64(FLYER) } } });
  assert.strictEqual(out.payload.result.isError, true);
  assert.strictEqual(out.payload.result.structuredContent.error.code, "event_not_writable");
  out = await call(auth, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "drop_table", arguments: {} } });
  assert.ok(out.payload.error);
  out = await call(auth, { jsonrpc: "2.0", method: "notifications/initialized" });
  assert.strictEqual(out.status, 202);
  assert.ok(!JSON.stringify(out.payload || {}).includes("service-role-test-key"), "the service key never appears in a response");
  // --- create_event
  const wc = makeWorld();
  const cctx = ctxFor(wc); cctx.now = () => new Date("2026-10-31T21:00:00Z");
  const evInput = { title: "Beni for Leni", start_date: "2026-11-02", category: "music", venue_name: "The Shop", venue_city: "Hazel Park", source_note: "Owner-supplied flyer 2026-10-31", client: "claude" };
  let c = await gw.run(cctx, "create_event", evInput);
  assert.strictEqual(c.outcome, "dry_run"); assert.strictEqual(c.status, "pending_review"); assert.strictEqual(wc.events.size, 3, "dry run writes nothing");
  assert.strictEqual(c.event_preview.time_display, null, "no start time is invented");
  c = await gw.run(cctx, "create_event", Object.assign({}, evInput, { dry_run: false }));
  assert.strictEqual(c.outcome, "created"); assert.strictEqual(c.event.status, "pending_review", "held for an editor by default");
  c = await gw.run(cctx, "create_event", Object.assign({}, evInput, { dry_run: false }));
  assert.strictEqual(c.outcome, "already_exists", "retry creates nothing new"); assert.strictEqual(wc.events.size, 4);
  await rejects(gw.run(cctx, "create_event", Object.assign({}, evInput, { title: "Another Show", venue_name: "Other Hall", start_date: "2026-11-02", dry_run: false })), "possible_duplicate");
  await rejects(gw.run(cctx, "create_event", Object.assign({}, evInput, { source_note: "" })), "bad_request");
  await rejects(gw.run(cctx, "create_event", Object.assign({}, evInput, { category: "bogus" })), "bad_request");
  await rejects(gw.run(cctx, "create_event", Object.assign({}, evInput, { start_date: "soon" })), "bad_request");
  await rejects(gw.run(cctx, "create_event", Object.assign({}, evInput, { ticket_url: "javascript:alert(1)" })), "bad_request");
  c = await gw.run(cctx, "create_event", Object.assign({}, evInput, { title: "Nico Bones + Glow Highway Stallions", start_date: "2026-11-07", venue_name: "Paris Bar", venue_city: "Hamtramck", time_display: "9 PM", publish: true, dry_run: false }));
  assert.ok(["approved", "pending_review"].includes(c.event.status));
  console.log("PASS: create_event dry-runs by default, never invents a time, holds for review unless publish is requested and eligible, refuses duplicates and bad input, and is idempotent");

  // --- device sessions
  const T = "t".repeat(40);
  out = await call(auth, { op: "create_session", label: "owner iPhone", ttl_days: 3 });
  assert.strictEqual(out.status, 200);
  const sess = out.payload.result.session;
  assert.ok(sess.startsWith("egs1.") && !sess.includes(T), "the session never contains the token");
  const sauth = { authorization: `Bearer ${sess}` };
  assert.strictEqual((await call(sauth, { op: "find_event", query: "pop" })).status, 200, "a session can use the operations");
  assert.strictEqual((await call(sauth, { op: "create_session" })).status, 403, "a session cannot mint another session");
  assert.strictEqual((await call({ authorization: `Bearer ${sess.slice(0, -2)}xx` }, { op: "find_event", query: "pop" })).status, 401, "a tampered signature is refused");
  assert.strictEqual(gw.checkSession(sess, T, new Date(Date.now() + 4 * 86400 * 1000)).reason, "session_expired");
  assert.strictEqual(gw.checkSession(sess, "u".repeat(40)).ok, false, "rotating the gateway token revokes every session");
  const made30 = gw.createSession(T, { ttl_seconds: 10 * 365 * 86400 }, new Date());
  assert.ok(Date.parse(made30.expires_at) - Date.now() <= gw.SESSION_MAX_SECONDS * 1000 + 5000, "lifetime is capped at 30 days");

  // --- raw image route (phone page / Shortcut)
  const { Readable } = require("stream");
  const rawCall = async (headers, bytes, qs) => {
    let status = 200, payload;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(p) { payload = p; return this; }, end() { return this; } };
    const req = Readable.from([bytes]); req.method = "POST"; req.url = "/api/editorial-gateway?" + qs; req.headers = Object.assign({ host: "preview.example" }, headers);
    await handler(req, res);
    return { status, payload };
  };
  w.events.get(EVENT).image_url = null;
  out = await rawCall(Object.assign({ "content-type": "image/jpeg" }, sauth), FLYER, `event_id=${EVENT}`);
  assert.strictEqual(out.payload.result.outcome, "dry_run", "raw uploads default to a dry run");
  out = await rawCall(Object.assign({ "content-type": "image/jpeg" }, sauth), FLYER, `event_id=${EVENT}&dry_run=false&credit=Organizer`);
  assert.strictEqual(out.payload.result.outcome, "applied");
  assert.strictEqual(out.payload.result.image.via, "upload");
  assert.ok(w.objects.size >= 1 && Buffer.compare([...w.objects.values()].pop(), FLYER) === 0, "original bytes are stored untouched");
  out = await rawCall(Object.assign({ "content-type": "image/jpeg" }, sauth), Buffer.from("not an image at all"), `event_id=${EVENT}&dry_run=false`);
  assert.strictEqual(out.payload.error.code, "not_an_image");
  out = await rawCall({ "content-type": "image/jpeg" }, FLYER, `event_id=${EVENT}&dry_run=false`);
  assert.strictEqual(out.status, 401, "raw uploads need the credential too");
  global.fetch = realGlobalFetch;
  console.log("PASS: device sessions are signed, scoped, expiring, revoked by rotation and cannot mint sessions; raw image uploads reach the validated path");
  console.log("PASS: REST and MCP transports require the token, list exactly four tools, mark only upload and create as writes, and declare the ChatGPT file param");

  console.log("\nAll editorial-gateway.test.js checks passed.");
})().catch((e) => { console.error(e); process.exit(1); });
