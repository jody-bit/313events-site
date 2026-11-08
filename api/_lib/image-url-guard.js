// api/_lib/image-url-guard.js
//
// Validation for a submitter-supplied image link (api/submit.js `imageUrl`). Follow-up to the P0 upload-endpoint hardening
// (owner decision I1, 2026-10-17): the upload endpoint is no longer an open door, so a pasted link must not be one either.
// Nothing here fetches the URL. It decides whether the link is acceptable to store, and the later image worker (I3) applies its own
// SSRF controls on top when it fetches.
//
// Accepted: https only, 2048 characters or fewer, no embedded credentials, default port, and a public-looking DNS host name
// (at least one dot, no IP literal, no localhost / .local / .internal / .localhost suffix).
"use strict";

const MAX_LENGTH = 2048;
const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet"];

function checkImageUrl(url) {
  if (url === undefined || url === null || url === "") return { ok: true, empty: true };
  if (typeof url !== "string") return { ok: false, reason: "not-a-string" };
  if (url.length > MAX_LENGTH) return { ok: false, reason: "too-long" };
  let u;
  try { u = new URL(url); } catch (_) { return { ok: false, reason: "unparseable" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "not-https" };
  if (u.username || u.password) return { ok: false, reason: "credentials" };
  if (u.port && u.port !== "443") return { ok: false, reason: "port" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || /^\d+(\.\d+){0,3}$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: "ip-literal" };
  if (!host.includes(".")) return { ok: false, reason: "no-public-host" };
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: "private-host" };
  return { ok: true, empty: false };
}

// Provenance line for a row whose image is a submitter's link, not a file this site hosts. "Hosted" means our own storage bucket.
function imageSourceNote(url, supabaseUrl) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const own = supabaseUrl ? new URL(supabaseUrl).host : null;
    if (own && u.host === own && u.pathname.startsWith("/storage/v1/object/public/")) return null;
    return `IMAGE_SOURCE | submitter-link | host=${u.hostname.toLowerCase()} | not self-hosted`;
  } catch (_) {
    return null;
  }
}

module.exports = { MAX_LENGTH, checkImageUrl, imageSourceNote };
