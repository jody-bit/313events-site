// api/_lib/editorial-gateway.js
//
// Editorial Gateway core (owner P1 interruption "Editorial Publishing Express Lane", 2026-10-26). Three operations an AI
// client (Claude or ChatGPT) can call so the owner never moves files or runs SQL for routine editorial work:
//
//   find_event          read-only search of events (never creates)
//   upload_event_image  validate an image, store it in the public event-flyers bucket, set events.image_url
//   verify_event        read-only: the row, the public view, the image bytes and the event page as a visitor sees them
//
// Pure of HTTP: api/editorial-gateway.js does auth and transport, this file does the work against an injected fetch so the
// tests run with no network. The service-role key lives only in ctx (server side) and is never returned.
//
// Rules this file holds (see project/editorial-gateway/README.md):
//   - writes touch exactly two things: one object under editorial/<event id>/ in event-flyers, and image_url + internal_note
//     of one existing event. No inserts, no deletes, no status changes, no other columns.
//   - an event that already has an image is never overwritten unless the caller says replace:true.
//   - the bytes are sniffed (upload-guard), must agree with any declared type, and are capped at 4 MB.
//   - retries are idempotent: the object name is the content hash, so the same bytes land on the same URL and a repeat
//     reports already_applied instead of writing again.
//   - the audit line goes to events.internal_note (not exposed by events_public) with the content hash, who/what supplied it,
//     and the previous image_url.
"use strict";

const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const guard = require("./upload-guard");

const BUCKET = "event-flyers";
const MAX_BYTES = 4 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WRITABLE_STATUSES = new Set(["approved", "pending_review"]);
const FETCH_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;

class GatewayError extends Error {
  constructor(code, message, status, extra) {
    super(message);
    this.code = code;
    this.status = status || 400;
    this.extra = extra || {};
  }
}

// ----------------------------------------------------------------------------- auth

function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) { crypto.timingSafeEqual(x, x); return false; }
  return crypto.timingSafeEqual(x, y);
}

const MIN_TOKEN_CHARS = 24;

// A token pasted into a hosting dashboard often arrives with a trailing newline, spaces or wrapping quotes. Those are never
// part of the secret, so both sides are compared after the same normalisation.
function normalizeToken(value) {
  if (typeof value !== "string") return "";
  let s = value.trim();
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) s = s.slice(1, -1).trim();
  return s;
}

// What can be said about the configured token without revealing it: a state and a few yes/no facts, never the value or its
// exact length. Used for logs and the 503 decision.
function tokenStatus(configured) {
  const raw = typeof configured === "string" ? configured : "";
  if (!raw) return { state: "unset" };
  const norm = normalizeToken(raw);
  const facts = {
    had_outer_whitespace_or_quotes: norm !== raw,
    has_inner_whitespace: /\s/.test(norm),
    length_class: norm.length === 0 ? "empty" : norm.length < 16 ? "under_16" : norm.length < MIN_TOKEN_CHARS ? "16_to_23" : "24_or_more",
  };
  if (norm.length < MIN_TOKEN_CHARS) return Object.assign({ state: "too_short" }, facts);
  return Object.assign({ state: "ok" }, facts);
}

// The credential the caller sent: "Authorization: Bearer <token>" or "X-Editorial-Token: <token>".
function givenToken(headers) {
  const h = headers || {};
  const auth = typeof h.authorization === "string" ? h.authorization : "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth);
  if (bearer) return { source: "authorization_bearer", value: normalizeToken(bearer[1]) };
  if (typeof h["x-editorial-token"] === "string" && h["x-editorial-token"].trim()) return { source: "x_editorial_token", value: normalizeToken(h["x-editorial-token"]) };
  if (auth) return { source: "authorization_not_bearer", value: "" };
  return { source: "none", value: "" };
}

// Fails closed when no usable token is configured.
function authorized(headers, configuredToken) {
  if (tokenStatus(configuredToken).state !== "ok") return false;
  const given = givenToken(headers).value;
  return given !== "" && timingSafeEqualStr(given, normalizeToken(configuredToken));
}

// Why a call was refused, as one safe word for the runtime log (no values). "configured_*" means the server's own token is the
// problem; "mismatch" means a well-formed token that is not the configured one.
function authFailureReason(headers, configuredToken) {
  const st = tokenStatus(configuredToken);
  if (st.state !== "ok") return `configured_${st.state}`;
  const g = givenToken(headers);
  if (g.source === "none") return "no_credential_sent";
  if (g.source === "authorization_not_bearer") return "authorization_header_not_bearer";
  if (!g.value) return "empty_credential";
  return "mismatch";
}

// ----------------------------------------------------------------------------- remote fetch (SSRF-guarded)

// Expands an IPv6 literal (any textual form, including a dotted IPv4 tail) into eight 16-bit groups, or null.
function ipv6Groups(ip) {
  let s = ip.toLowerCase().split("%")[0];
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const o = tail[1].split(".").map(Number);
    if (o.length !== 4 || o.some((n) => !(n >= 0 && n <= 255))) return null;
    s = s.slice(0, -tail[1].length) + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = head.concat(Array(fill).fill("0"), rest);
  if (all.length !== 8 || all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

function isPrivateV4Octets(a, b) {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

// True for anything that is not a public unicast address: private/loopback/link-local IPv4, and IPv6 that is local, multicast,
// or wraps an IPv4 address (IPv4-mapped ::ffff:0:0/96, IPv4-compatible ::/96, NAT64 64:ff9b::/96, 6to4 2002::/16), judged on
// the wrapped IPv4. Anything unparseable is refused.
function isPrivateAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) { const [a, b] = ip.split(".").map(Number); return isPrivateV4Octets(a, b); }
  if (v !== 6) return true;
  const g = ipv6Groups(ip);
  if (!g) return true;
  const v4of = (hi, lo) => isPrivateV4Octets(hi >> 8, hi & 255);
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) { // ::, ::1, mapped, compatible
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return true;
    return v4of(g[6], g[7]);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4of(g[6], g[7]); // NAT64
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // local-use NAT64
  if (g[0] === 0x2002) return v4of(g[1], g[2]); // 6to4
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xff00) === 0xff00) return true; // link-local, unique-local, multicast
  if ((g[0] & 0xe000) !== 0x2000) return true; // outside global unicast 2000::/3
  return false;
}

async function assertPublicHttps(rawUrl, lookup) {
  let u;
  try { u = new URL(rawUrl); } catch (_) { throw new GatewayError("bad_url", "That is not a valid URL."); }
  if (u.protocol !== "https:") throw new GatewayError("bad_url", "Only https URLs are accepted.");
  if (u.username || u.password) throw new GatewayError("bad_url", "URLs with credentials are not accepted.");
  if (u.port && u.port !== "443") throw new GatewayError("bad_url", "Only the default https port is accepted.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new GatewayError("blocked_host", "That address is not a public internet host.");
  }
  return u;
}

async function readCapped(resp, maxBytes) {
  const declared = Number(resp.headers && resp.headers.get && resp.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new GatewayError("too_large", "That image is larger than 4 MB.", 413);
  if (!resp.body || typeof resp.body.getReader !== "function") {
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > maxBytes) throw new GatewayError("too_large", "That image is larger than 4 MB.", 413);
    return buf;
  }
  const reader = resp.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { try { await reader.cancel(); } catch (_) { /* ignore */ } throw new GatewayError("too_large", "That image is larger than 4 MB.", 413); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// Fetches an image from a public https URL (a flyer link, or the temporary download_url ChatGPT gives a tool for an attached
// file). Redirects are followed by hand so every hop is checked; private, loopback and link-local hosts are refused.
async function fetchRemoteImage(rawUrl, ctx) {
  const fetchFn = ctx.fetchFn || fetch;
  const lookup = ctx.lookup || ((host, opts) => dns.lookup(host, opts));
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await assertPublicHttps(current, lookup);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let resp;
    try {
      resp = await fetchFn(u.toString(), { redirect: "manual", signal: ctrl.signal, headers: { Accept: "image/*" } });
      if (resp.status >= 300 && resp.status < 400 && resp.headers.get("location")) {
        current = new URL(resp.headers.get("location"), u).toString();
        continue;
      }
      if (!resp.ok) throw new GatewayError("fetch_failed", `The image URL answered HTTP ${resp.status}.`, 422);
      const bytes = await readCapped(resp, MAX_BYTES);
      return { bytes, declaredType: (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() || null };
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      throw new GatewayError("fetch_failed", "Could not download the image from that URL.", 422);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new GatewayError("fetch_failed", "Too many redirects fetching the image.", 422);
}

// ----------------------------------------------------------------------------- Supabase helpers

function sbHeaders(ctx, extra) {
  return Object.assign({ apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}` }, extra || {});
}

async function sbGet(ctx, path) {
  const fetchFn = ctx.fetchFn || fetch;
  const resp = await fetchFn(`${ctx.supabaseUrl}/rest/v1/${path}`, { headers: sbHeaders(ctx) });
  if (!resp.ok) throw new GatewayError("database_error", `Database read failed (HTTP ${resp.status}).`, 502);
  return resp.json();
}

const EVENT_COLUMNS = "id,title,start_date,end_date,time_display,status,source,category,venue_name_raw,venue_city_raw,image_url,external_id,updated_at";

function summarize(row) {
  return {
    id: row.id, title: row.title, start_date: row.start_date, end_date: row.end_date || null, time_display: row.time_display || null,
    status: row.status, source: row.source, venue: row.venue_name_raw || null, city: row.venue_city_raw || null,
    has_image: !!row.image_url, image_url: row.image_url || null, external_id: row.external_id || null,
  };
}

async function loadEvent(ctx, id) {
  if (!UUID_RE.test(String(id || ""))) throw new GatewayError("bad_event_id", "event_id must be an event UUID. Use find_event first.");
  const rows = await sbGet(ctx, `events?id=eq.${id}&select=${EVENT_COLUMNS}`);
  if (!Array.isArray(rows) || rows.length !== 1) throw new GatewayError("event_not_found", "No event has that id.", 404);
  return rows[0];
}

function ilikeTerm(text) {
  // Strip characters that mean something in a PostgREST filter value, then wrap for contains-matching.
  const clean = String(text || "").replace(/[%*,()\\]/g, " ").replace(/\s+/g, " ").trim();
  return clean ? encodeURIComponent(`*${clean}*`) : "";
}

// ----------------------------------------------------------------------------- find_event

async function findEvent(ctx, input) {
  const args = input || {};
  if (args.event_id) {
    const row = await loadEvent(ctx, args.event_id);
    return { count: 1, events: [summarize(row)] };
  }
  const term = ilikeTerm(args.query);
  const date = typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : null;
  if (!term && !date) throw new GatewayError("bad_request", "Give event_id, or a query and/or a date (YYYY-MM-DD).");
  const filters = [];
  if (term) filters.push(`or=(title.ilike.${term},venue_name_raw.ilike.${term},external_id.ilike.${term})`);
  if (date) filters.push(`start_date=gte.${date}`, `start_date=lte.${date}`);
  const rows = await sbGet(ctx, `events?${filters.join("&")}&select=${EVENT_COLUMNS}&order=start_date.asc&limit=10`);
  const events = (Array.isArray(rows) ? rows : []).map(summarize);
  // Rejected rows are listed (so a duplicate is never missed) but flagged: they are not writable here.
  return { count: events.length, events, note: events.length === 0 ? "No match. Do not create a duplicate without checking spelling variants and the venue." : undefined };
}

// ----------------------------------------------------------------------------- upload_event_image

function objectPath(eventId, sha, ext) {
  return `editorial/${eventId}/${sha.slice(0, 16)}.${ext}`;
}

function publicUrl(ctx, path) {
  return `${ctx.supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function safeLabel(text, max) {
  return String(text || "").replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7e]/g, "?").trim().slice(0, max);
}

async function resolveBytes(ctx, args) {
  const given = [args.file, args.image_url, args.image_base64].filter((v) => v !== undefined && v !== null && v !== "");
  if (given.length !== 1) throw new GatewayError("bad_request", "Provide exactly one of: file (ChatGPT attachment), image_url, image_base64.");
  if (args.image_base64) {
    const text = String(args.image_base64).replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
    if (text.length > Math.ceil(MAX_BYTES / 3) * 4 + 8) throw new GatewayError("too_large", "That image is larger than 4 MB.", 413);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new GatewayError("bad_request", "image_base64 is not valid base64.");
    return { bytes: Buffer.from(text, "base64"), declaredType: null, via: "base64" };
  }
  if (args.file) {
    const f = args.file;
    if (!f || typeof f !== "object" || typeof f.download_url !== "string") throw new GatewayError("bad_request", "file must be an object with a download_url.");
    const r = await fetchRemoteImage(f.download_url, ctx);
    return { bytes: r.bytes, declaredType: (f.mime_type || r.declaredType || null), via: "attachment" };
  }
  const r = await fetchRemoteImage(String(args.image_url), ctx);
  return { bytes: r.bytes, declaredType: r.declaredType, via: "url" };
}

async function storeObject(ctx, path, bytes, type) {
  const fetchFn = ctx.fetchFn || fetch;
  const resp = await fetchFn(`${ctx.supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: sbHeaders(ctx, { "Content-Type": type, "x-upsert": "false", "Cache-Control": "max-age=31536000" }),
    body: bytes,
  });
  if (resp.ok) return { created: true };
  let text = "";
  try { text = await resp.text(); } catch (_) { /* ignore */ }
  if (resp.status === 409 || /duplicate|already exists/i.test(text)) return { created: false };
  throw new GatewayError("storage_error", `Storage rejected the upload (HTTP ${resp.status}).`, 502);
}

async function fetchPublicBytes(ctx, url) {
  const fetchFn = ctx.fetchFn || fetch;
  const resp = await fetchFn(url, { headers: { Accept: "image/*" } });
  if (!resp.ok) return { ok: false, status: resp.status };
  const bytes = await readCapped(resp, MAX_BYTES);
  return { ok: true, status: resp.status, bytes, contentType: (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() };
}

async function uploadEventImage(ctx, input) {
  const args = input || {};
  const event = await loadEvent(ctx, args.event_id);
  if (!WRITABLE_STATUSES.has(event.status)) {
    throw new GatewayError("event_not_writable", `This event is ${event.status}; images are only added to approved or pending events.`, 409);
  }

  const { bytes, declaredType, via } = await resolveBytes(ctx, args);
  if (!bytes.length) throw new GatewayError("bad_request", "No image data received.");
  if (bytes.length > MAX_BYTES) throw new GatewayError("too_large", "That image is larger than 4 MB.", 413);
  const sniffed = guard.sniffImage(bytes);
  if (!sniffed) throw new GatewayError("not_an_image", "Those bytes are not a valid JPG, PNG, WEBP or GIF image.");
  if (declaredType && declaredType !== "application/octet-stream" && declaredType !== sniffed.type) {
    throw new GatewayError("type_mismatch", "The file contents do not match its declared type.");
  }
  const verdict = guard.validateUpload(bytes, sniffed.type);
  if (!verdict.ok) throw new GatewayError("invalid_image", verdict.error, verdict.status);

  const hash = sha256(bytes);
  if (args.expected_sha256 && String(args.expected_sha256).toLowerCase() !== hash) {
    throw new GatewayError("hash_mismatch", "The received bytes do not match expected_sha256.", 409, { received_sha256: hash });
  }

  const path = objectPath(event.id, hash, verdict.ext);
  const url = publicUrl(ctx, path);
  const plan = { event: summarize(event), image: { sha256: hash, bytes: bytes.length, type: verdict.type, width: verdict.width, height: verdict.height, url, via } };

  if (event.image_url === url) return Object.assign({ outcome: "already_applied", changed: false }, plan);
  if (event.image_url && args.replace !== true) {
    throw new GatewayError("image_already_set", "This event already has an image. Pass replace:true only if the owner wants it replaced.", 409, { current_image_url: event.image_url });
  }
  if (args.dry_run !== false) {
    // Default is a dry run: everything above was checked, nothing was written.
    return Object.assign({ outcome: "dry_run", changed: false, note: "Nothing was written. Call again with dry_run:false to apply." }, plan);
  }

  const stored = await storeObject(ctx, path, bytes, verdict.type);
  const live = await fetchPublicBytes(ctx, url);
  if (!live.ok || sha256(live.bytes) !== hash) {
    throw new GatewayError("storage_verify_failed", "The stored image could not be read back identically from its public URL; the event was not changed.", 502, { public_status: live.status });
  }

  const stamp = (ctx.now ? ctx.now() : new Date()).toISOString();
  const who = safeLabel(args.client || "ai-client", 40);
  const evidence = safeLabel(args.source_note || "", 200);
  const audit = `[editorial-gateway ${stamp}] image_url set via ${via} by ${who}; sha256 ${hash.slice(0, 16)}; ${bytes.length} bytes ${verdict.width}x${verdict.height}${event.image_url ? `; replaced ${safeLabel(event.image_url, 160)}` : ""}${evidence ? `; source: ${evidence}` : ""}`;
  const prior = await sbGet(ctx, `events?id=eq.${event.id}&select=internal_note`);
  const note = [prior && prior[0] && prior[0].internal_note, audit].filter(Boolean).join("\n");

  // Race-safe: only lands if the row is exactly as it was read (updated_at) and still in the state we checked.
  const fetchFn = ctx.fetchFn || fetch;
  const imageGuard = event.image_url ? `image_url=eq.${encodeURIComponent(event.image_url)}` : "image_url=is.null";
  const resp = await fetchFn(`${ctx.supabaseUrl}/rest/v1/events?id=eq.${event.id}&${imageGuard}&updated_at=eq.${encodeURIComponent(event.updated_at)}&select=${EVENT_COLUMNS}`, {
    method: "PATCH",
    headers: sbHeaders(ctx, { "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify({ image_url: url, internal_note: note }),
  });
  if (!resp.ok) throw new GatewayError("database_error", `Database update failed (HTTP ${resp.status}).`, 502);
  const updated = await resp.json();
  if (!Array.isArray(updated) || updated.length !== 1) {
    throw new GatewayError("conflict", "The event changed while the image was being applied; nothing was overwritten. Re-run find_event and try again.", 409);
  }
  return Object.assign({ outcome: "applied", changed: true, object_created: stored.created, event_after: summarize(updated[0]) }, plan);
}

// ----------------------------------------------------------------------------- verify_event

async function verifyEvent(ctx, input) {
  const args = input || {};
  const event = await loadEvent(ctx, args.event_id);
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || null });

  add("event_exists", true, `${event.title} on ${event.start_date}`);
  const pub = event.status === "approved" ? await sbGet(ctx, `events_public?id=eq.${event.id}&select=id,title,image_url,start_date`) : [];
  add("visible_in_public_view", event.status === "approved" ? pub.length === 1 : false, event.status === "approved" ? null : `status is ${event.status}`);

  if (event.image_url) {
    let live = null;
    try { live = await fetchPublicBytes(ctx, event.image_url); } catch (err) { live = { ok: false, status: err.code || "error" }; }
    const sn = live && live.ok ? guard.sniffImage(live.bytes) : null;
    add("image_url_reachable", live && live.ok, live && live.ok ? `${live.bytes.length} bytes` : `HTTP ${live && live.status}`);
    add("image_is_valid_image", !!sn, sn ? `${sn.type} ${sn.width}x${sn.height}, sha256 ${sha256(live.bytes).slice(0, 16)}` : null);
    if (args.expected_sha256) add("image_matches_expected_sha256", live && live.ok && sha256(live.bytes) === String(args.expected_sha256).toLowerCase());
    if (pub.length === 1) add("public_view_has_same_image_url", pub[0].image_url === event.image_url);

    if (ctx.siteUrl) {
      try {
        const fetchFn = ctx.fetchFn || fetch;
        const page = await fetchFn(`${ctx.siteUrl}/event.html?id=${event.id}`, { headers: { Accept: "text/html" } });
        const html = page.ok ? await page.text() : "";
        const og = /<meta property="og:image"[^>]*content="([^"]*)"/.exec(html);
        const decoded = og ? og[1].replace(/&amp;/g, "&") : null;
        add("event_page_serves_image", page.ok && decoded === event.image_url, page.ok ? (decoded ? null : "og:image tag not found") : `page HTTP ${page.status}`);
      } catch (_) {
        add("event_page_serves_image", false, "event page could not be fetched");
      }
    }
  } else {
    add("has_image", false, "image_url is empty");
  }
  return { event: summarize(event), ok: checks.every((c) => c.ok), checks };
}

// ----------------------------------------------------------------------------- dispatch

const OPERATIONS = { find_event: findEvent, upload_event_image: uploadEventImage, verify_event: verifyEvent };

async function run(ctx, op, input) {
  const fn = Object.prototype.hasOwnProperty.call(OPERATIONS, op) ? OPERATIONS[op] : null;
  if (!fn) throw new GatewayError("unknown_operation", `Unknown operation. Available: ${Object.keys(OPERATIONS).join(", ")}.`, 404);
  return fn(ctx, input);
}

module.exports = { GatewayError, OPERATIONS, run, authorized, authFailureReason, tokenStatus, normalizeToken, findEvent, uploadEventImage, verifyEvent, fetchRemoteImage, isPrivateAddress, objectPath, MAX_BYTES, BUCKET };
