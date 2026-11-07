// scripts/event-page-image-repair.js
//
// CivicPlus blank-image recovery (draft, 2026-11-07). DRY RUN BY DEFAULT: nothing is written unless a caller
// passes dryRun:false (CLI: --write). Not wired into Auto-Repair, any cron, or any scheduler.
//
// WHAT IT DOES: for approved, upcoming events whose image_url is blank and whose event_url is a CivicPlus event page
// (/calendar.aspx?EID=n), read that page and take its own poster ONLY when every check below passes. Pattern reused
// from scripts/redford-metadata-repair.js: injectable fetchers, dry-run report, blank-only race-safe conditional PATCH.
//
// WHY og:image ALONE IS NOT ENOUGH (sample 2026-11-07): CivicPlus emits a generic /Images/SocialMedia/IconModuleCalendar.png
// when an event has no poster. A real poster is the SAME URL in og:image and in an image inside the event body.
//
// ACCEPT RULES (all required): page fetched over https and not redirected to another host; og:image resolves to https on
// the SAME HOST as the page (an official-CDN allowlist is a later proposal, not in this draft); path under
// /ImageRepository/; not a known generic icon/logo; equals an image element in the page body; HEAD shows image/jpeg|png|webp|gif
// and a declared size within [MIN_BYTES, MAX_BYTES]. Shared-image review: the same image proposed for several events is
// accepted only when those events share a normalized title (a series poster); otherwise it is reported for review, not written.
// SAFETY: owner-locked image_url is skipped at selection; the PATCH re-asserts image_url blank AND updated_at unchanged, so a
// person's edit between read and write wins (zero rows = skippedConcurrentChange). Provenance is appended to internal_note.
//
// Usage: node scripts/event-page-image-repair.js            (dry run, report only)
//        node scripts/event-page-image-repair.js --write    (explicit write; not authorized to run without owner GO)
"use strict";

const path = require("path");
const { ownerCorrectedFields } = require(path.join(__dirname, "..", "api", "_lib", "event-contract"));

const MIN_BYTES = 5 * 1024;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const GENERIC_IMAGE = /\/Images\/SocialMedia\/|\/Assets\/|\/Images\/|logo|favicon|sprite|spacer|pixel|placeholder|default[-_]?image|IconModule|\/icons?\//i;
const POSTER_PATH = /^\/ImageRepository\//i;
const CANDIDATE_URL = /\/calendar\.aspx\?EID=\d+/i;
const FETCH_TIMEOUT_MS = 10000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

// event_url is ingested data, so it is validated BEFORE any request: https only, no credentials/port, a real public-looking
// hostname (no IP literal, localhost, single-label or internal suffix), and exactly /calendar.aspx?EID=<digits>.
// `allowedHosts` (optional Set of exact hostnames) narrows further when a caller supplies one.
function validateFetchUrl(raw, allowedHosts) {
  let u;
  try { u = new URL(raw); } catch { return { ok: false, reason: "url_unparseable" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "url_not_https" };
  if (u.username || u.password) return { ok: false, reason: "url_has_credentials" };
  if (u.port) return { ok: false, reason: "url_has_port" };
  const h = u.hostname.toLowerCase();
  if (h.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || /^[\d.]+$/.test(h)) return { ok: false, reason: "url_ip_literal" };
  if (!h.includes(".") || /(^|\.)(localhost|local|internal|localdomain|lan|corp|home)$/.test(h)) return { ok: false, reason: "url_non_public_host" };
  if (!/^[a-z0-9.-]+$/.test(h)) return { ok: false, reason: "url_odd_hostname" };
  if (u.pathname.toLowerCase() !== "/calendar.aspx" || !/^\?EID=\d+$/i.test(u.search)) return { ok: false, reason: "url_not_civicplus_event" };
  if (allowedHosts && !allowedHosts.has(h)) return { ok: false, reason: "url_host_not_allowed" };
  return { ok: true, url: u };
}

async function timedFetch(url, opts, fetchImpl) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try { return await fetchImpl(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
}

async function readCapped(resp, maxBytes) {
  if (resp.body && typeof resp.body.getReader === "function") {
    const reader = resp.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { try { await reader.cancel(); } catch {} return null; }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  const text = await resp.text();
  return Buffer.byteLength(text) > maxBytes ? null : text;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function resolveUrl(raw, base) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return new URL(raw.trim().replace(/&amp;/g, "&"), base);
  } catch {
    return null;
  }
}

function metaContent(html, prop) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!key || key[1].toLowerCase() !== prop) continue;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (content) return content[1];
  }
  return null;
}

// Image elements in the page body only (everything before <head> closes is ignored; scripts/styles stripped).
function bodyImages(html, base) {
  const body = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<head\b[\s\S]*?<\/head>/i, " ").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const out = [];
  for (const tag of body.match(/<img\b[^>]*>/gi) || []) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
    const u = src && resolveUrl(src[1], base);
    if (u) out.push(u.href);
  }
  return out;
}

// -> { accept: boolean, imageUrl?: string, reason: string }. Pure; no network.
function classifyPage({ html, pageUrl }) {
  const page = resolveUrl(pageUrl, undefined);
  if (!page || page.protocol !== "https:") return { accept: false, reason: "page_not_https" };
  if (typeof html !== "string" || !html) return { accept: false, reason: "empty_page" };
  const og = resolveUrl(metaContent(html, "og:image"), page);
  if (!og) return { accept: false, reason: "no_og_image" };
  if (og.protocol !== "https:") return { accept: false, reason: "image_not_https" };
  if (og.host !== page.host) return { accept: false, reason: "image_other_host" };
  if (!POSTER_PATH.test(og.pathname)) return { accept: false, reason: "not_image_repository_path" };
  if (GENERIC_IMAGE.test(og.pathname + og.search)) return { accept: false, reason: "generic_image" };
  if (!bodyImages(html, page).includes(og.href)) return { accept: false, reason: "no_body_image_agreement" };
  return { accept: true, imageUrl: og.href, reason: "poster_in_body_matches_og_image" };
}

function normalizeTitle(t) {
  return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// HEAD (no body download). -> { ok, type, bytes, reason }
async function checkImage(url, fetchImpl = fetch) {
  let resp;
  try {
    resp = await timedFetch(url, { method: "HEAD", redirect: "manual" }, fetchImpl);
  } catch {
    return { ok: false, reason: "image_head_failed" };
  }
  if (!resp || !resp.ok) return { ok: false, reason: "image_head_status" };
  const type = String(resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const bytes = Number(resp.headers.get("content-length"));
  if (!ALLOWED_TYPES.has(type)) return { ok: false, reason: "image_type_rejected", type };
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, reason: "image_size_unchecked", type };
  if (bytes < MIN_BYTES || bytes > MAX_BYTES) return { ok: false, reason: "image_size_out_of_range", type, bytes };
  return { ok: true, type, bytes };
}

// Manual redirects: every hop is validated BEFORE it is requested and must stay on the original host (https only).
async function fetchPage(url, fetchImpl = fetch, allowedHosts = null) {
  const first = validateFetchUrl(url, allowedHosts);
  if (!first.ok) return { ok: false, reason: first.reason };
  const host = first.url.hostname.toLowerCase();
  let current = first.url.href;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let resp;
    try {
      resp = await timedFetch(current, { headers: { "User-Agent": "313events-image-check" }, redirect: "manual" }, fetchImpl);
    } catch { return { ok: false, reason: "page_fetch_failed" }; }
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers && resp.headers.get && resp.headers.get("location");
      let next;
      try { next = new URL(loc, current); } catch { return { ok: false, reason: "page_bad_redirect" }; }
      if (next.protocol !== "https:" || next.hostname.toLowerCase() !== host || next.port || next.username || next.password) {
        return { ok: false, reason: "page_redirected_other_host" }; // never requested
      }
      current = next.href;
      continue;
    }
    if (!resp.ok) return { ok: false, reason: `page_http_${resp.status}` };
    const html = await readCapped(resp, MAX_PAGE_BYTES);
    if (html === null) return { ok: false, reason: "page_too_large" };
    return { ok: true, html, finalUrl: current };
  }
  return { ok: false, reason: "page_too_many_redirects" };
}

async function fetchRepairCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders, limit = 200) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=eq.approved` +
    `&or=(image_url.is.null,image_url.eq.)` +
    `&event_url=ilike.*calendar.aspx?EID=*` +
    `&select=id,title,source,event_url,start_date,internal_note,updated_at,image_url` +
    `&order=start_date.asc,id.asc&limit=${limit}`;
  const resp = await fetch(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch image repair candidates: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching image repair candidates");
  return rows;
}

// True when the same image is already stored on an event with a DIFFERENT normalized title (a series reuse is fine).
async function imageInUseByOtherTitles(SUPABASE_URL, sbHeaders, imageUrl, title, fetchImpl = fetch) {
  const resp = await fetchImpl(`${SUPABASE_URL}/rest/v1/events?image_url=eq.${encodeURIComponent(imageUrl)}&select=id,title&limit=20`, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`image-in-use lookup failed: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("image-in-use lookup: unexpected shape");
  return rows.some((r) => normalizeTitle(r.title) !== normalizeTitle(title));
}

// Conditional PATCH: image still blank AND the row untouched since it was read. Zero rows => false (a person got there first).
async function applyPatch(SUPABASE_URL, sbHeaders, event, patch, fetchImpl = fetch) {
  const url =
    `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(event.id)}` +
    `&or=(image_url.is.null,image_url.eq.)` +
    `&updated_at=eq.${encodeURIComponent(event.updated_at)}`;
  const resp = await fetchImpl(url, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) throw new Error(`PATCH failed for event ${event.id}: HTTP ${resp.status}`);
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

function provenanceLine({ pageUrl, imageUrl, type, bytes, at }) {
  return `IMAGE_RECOVERY ${at} source=event-page page=${pageUrl} image=${imageUrl} type=${type} bytes=${bytes} rule=poster_in_body_matches_og_image`;
}

async function repairEventPageImages({
  dryRun = true,
  logger = console,
  now = () => new Date().toISOString(),
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchRepairCandidates,
  fetchPageFn = fetchPage,
  checkImageFn = checkImage,
  applyPatchFn = applyPatch,
  imageInUseFn = imageInUseByOtherTitles,
  allowedHosts = null,
} = {}) {
  const counts = {
    dryRun: !!dryRun, considered: 0, skippedOwnerLocked: 0, skippedNotCandidateUrl: 0, rejected: 0, accepted: 0,
    sharedForReview: 0, written: 0, skippedConcurrentChange: 0, rejectedReasons: {}, report: [], reviewIds: [], writtenIds: [],
  };
  const sbHeaders = SUPABASE_SERVICE_ROLE_KEY ? { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } : {};
  const rows = await fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders);

  const proposals = [];
  for (const event of rows) {
    counts.considered++;
    if (!validateFetchUrl(String(event.event_url || ""), allowedHosts).ok) { counts.skippedNotCandidateUrl++; continue; }
    if (event.image_url) continue; // blank only
    if (ownerCorrectedFields(event.internal_note).has("image_url")) { counts.skippedOwnerLocked++; continue; }
    const reject = (reason) => { counts.rejected++; counts.rejectedReasons[reason] = (counts.rejectedReasons[reason] || 0) + 1; counts.report.push({ id: event.id, verdict: "rejected", reason }); };
    let page;
    try { page = await fetchPageFn(event.event_url, undefined, allowedHosts); } catch { reject("page_fetch_failed"); continue; }
    if (!page.ok) { reject(page.reason); continue; }
    const verdict = classifyPage({ html: page.html, pageUrl: page.finalUrl });
    if (!verdict.accept) { reject(verdict.reason); continue; }
    let img;
    try { img = await checkImageFn(verdict.imageUrl); } catch { img = { ok: false, reason: "image_head_failed" }; }
    if (!img.ok) { reject(img.reason); continue; }
    let inUse = false;
    try { inUse = await imageInUseFn(SUPABASE_URL, sbHeaders, verdict.imageUrl, event.title); } catch { inUse = true; } // unknown => review, never write
    if (inUse) { counts.sharedForReview++; counts.reviewIds.push(event.id); counts.report.push({ id: event.id, verdict: "review_shared_image", image: verdict.imageUrl, reason: "already_on_other_event" }); continue; }
    proposals.push({ event, pageUrl: page.finalUrl, imageUrl: verdict.imageUrl, type: img.type, bytes: img.bytes });
  }

  // Shared-image review: same image on several events is a series poster only when the titles agree.
  const byImage = new Map();
  for (const p of proposals) {
    if (!byImage.has(p.imageUrl)) byImage.set(p.imageUrl, []);
    byImage.get(p.imageUrl).push(p);
  }
  for (const group of byImage.values()) {
    const titles = new Set(group.map((p) => normalizeTitle(p.event.title)));
    if (group.length > 1 && titles.size > 1) {
      for (const p of group) {
        counts.sharedForReview++;
        counts.reviewIds.push(p.event.id);
        counts.report.push({ id: p.event.id, verdict: "review_shared_image", image: p.imageUrl });
      }
      continue;
    }
    for (const p of group) {
      counts.accepted++;
      counts.report.push({ id: p.event.id, verdict: "accepted", image: p.imageUrl, page: p.pageUrl, type: p.type, bytes: p.bytes });
      if (dryRun) { logger.log(`[dry-run] would set image_url on ${p.event.id}: ${p.imageUrl}`); continue; }
      const note = [p.event.internal_note, provenanceLine({ pageUrl: p.pageUrl, imageUrl: p.imageUrl, type: p.type, bytes: p.bytes, at: now() })]
        .filter(Boolean).join("\n");
      const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, p.event, { image_url: p.imageUrl, internal_note: note });
      if (applied) { counts.written++; counts.writtenIds.push(p.event.id); }
      else { counts.skippedConcurrentChange++; logger.warn(`Skipped event ${p.event.id}: changed since read or image no longer blank.`); }
    }
  }
  return counts;
}

module.exports = {
  repairEventPageImages, classifyPage, validateFetchUrl, imageInUseByOtherTitles, metaContent, bodyImages, checkImage, fetchPage, fetchRepairCandidates, applyPatch, provenanceLine,
  MIN_BYTES, MAX_BYTES,
};

if (require.main === module) {
  const dryRun = !process.argv.includes("--write");
  repairEventPageImages({ dryRun })
    .then((c) => { console.log(`\nEvent-page image repair ${dryRun ? "(dry run) " : ""}summary:`); console.log(c); })
    .catch((err) => { console.error("Event-page image repair failed:", err); process.exitCode = 1; });
}
