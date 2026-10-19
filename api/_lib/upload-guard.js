// api/_lib/upload-guard.js
//
// Guards for the public flyer-upload endpoint (api/upload-image.js). P0 security remediation (owner decision I1,
// 2026-10-17). Pure functions, no network: the endpoint does the I/O and calls these.
//
//   - Signed short-lived upload token (HMAC). The submit form is deliberately anonymous, so "authentication" here means a
//     token the site itself issued a moment ago, not a login. A client that posts straight to the endpoint with no token is
//     refused. The signing key is derived from the server-side service key, which never leaves the server.
//   - Content sniffing: the bytes must be a JPEG, PNG, GIF or WebP, and must agree with the declared Content-Type. The
//     declared type alone is not evidence.
//   - Pixel ceiling parsed from the header, so a tiny file that decodes to a huge canvas is refused before anything
//     downstream (a future sharp worker) decodes it.
//   - Per-client hourly cap decided from object listings the caller supplies.
"use strict";

const crypto = require("crypto");

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PIXELS = 40 * 1000 * 1000;
const MAX_DIMENSION = 12000;
const MAX_UPLOADS_PER_CLIENT_PER_HOUR = 6;

function signingKey(serviceKey) {
  return crypto.createHmac("sha256", String(serviceKey || "")).update("313events/upload-token/v1").digest();
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function issueToken(serviceKey, now = Date.now()) {
  const nonce = crypto.randomBytes(9).toString("base64url");
  const body = `${now}.${nonce}`;
  const mac = crypto.createHmac("sha256", signingKey(serviceKey)).update(body).digest();
  return `${body}.${b64url(mac)}`;
}

function verifyToken(serviceKey, token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 200 || !serviceKey) return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [ts, nonce, mac] = parts;
  if (!/^\d{10,15}$/.test(ts) || !/^[A-Za-z0-9_-]{6,24}$/.test(nonce)) return { ok: false, reason: "malformed" };
  const expected = crypto.createHmac("sha256", signingKey(serviceKey)).update(`${ts}.${nonce}`).digest();
  let given;
  try { given = Buffer.from(mac, "base64url"); } catch (_) { return { ok: false, reason: "malformed" }; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  const age = now - Number(ts);
  if (age < -60 * 1000) return { ok: false, reason: "bad_signature" };
  if (age > TOKEN_TTL_MS) return { ok: false, reason: "expired" };
  return { ok: true };
}

// Returns { type, ext, width, height } or null when the bytes are not a supported image.
function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return sniffJpeg(buf);
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (buf.length < 24 || buf.toString("latin1", 12, 16) !== "IHDR") return null;
    return { type: "image/png", ext: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  const head = buf.toString("latin1", 0, 6);
  if (head === "GIF87a" || head === "GIF89a") return { type: "image/gif", ext: "gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return sniffWebp(buf);
  return null;
}

function sniffJpeg(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { type: "image/jpeg", ext: "jpg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    if (len < 2) return null;
    i += 2 + len;
  }
  return null; // no frame header: not a decodable JPEG
}

function sniffWebp(buf) {
  const fmt = buf.toString("latin1", 12, 16);
  let width;
  let height;
  if (fmt === "VP8X" && buf.length >= 30) {
    width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
  } else if (fmt === "VP8L" && buf.length >= 25 && buf[20] === 0x2f) {
    const b = buf.readUInt32LE(21);
    width = 1 + (b & 0x3fff);
    height = 1 + ((b >> 14) & 0x3fff);
  } else if (fmt === "VP8 " && buf.length >= 30 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
    width = buf.readUInt16LE(26) & 0x3fff;
    height = buf.readUInt16LE(28) & 0x3fff;
  } else {
    return null;
  }
  return { type: "image/webp", ext: "webp", width, height };
}

// Full decision for one upload. Returns { ok:true, ext, type, width, height } or { ok:false, status, error }.
function validateUpload(buf, declaredType) {
  const sniffed = sniffImage(buf);
  if (!sniffed) return { ok: false, status: 400, error: "That file isn't a valid JPG, PNG, WEBP or GIF image." };
  if (sniffed.type !== declaredType) return { ok: false, status: 400, error: "The file contents don't match its declared type." };
  const { width, height } = sniffed;
  if (!(width > 0 && height > 0)) return { ok: false, status: 400, error: "That image has no usable dimensions." };
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    return { ok: false, status: 413, error: "That image is too large in pixels — please resize it and try again." };
  }
  return { ok: true, ext: sniffed.ext, type: sniffed.type, width, height };
}

// recentCreatedAt: ISO timestamps of this client's existing uploads (any age). Hourly cap.
function overClientLimit(recentCreatedAt, now = Date.now()) {
  const hourAgo = now - 60 * 60 * 1000;
  const n = (recentCreatedAt || []).filter((t) => { const ms = Date.parse(t); return Number.isFinite(ms) && ms > hourAgo; }).length;
  return n >= MAX_UPLOADS_PER_CLIENT_PER_HOUR;
}

function clientKey(serviceKey, ip) {
  return crypto.createHmac("sha256", signingKey(serviceKey)).update(`client:${String(ip || "unknown")}`).digest("hex").slice(0, 16);
}

function clientIp(headers) {
  const h = headers || {};
  const raw = h["x-vercel-forwarded-for"] || h["x-real-ip"] || h["x-forwarded-for"] || "";
  return String(raw).split(",")[0].trim() || "unknown";
}

module.exports = {
  TOKEN_TTL_MS, MAX_PIXELS, MAX_DIMENSION, MAX_UPLOADS_PER_CLIENT_PER_HOUR,
  issueToken, verifyToken, sniffImage, validateUpload, overClientLimit, clientKey, clientIp,
};
