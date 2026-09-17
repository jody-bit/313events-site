const fs = require("fs");
const path = require("path");

// Vercel serverless function — serves event.html's own markup unchanged, but
// with the <head> meta tags (title, description, og:*, twitter:*) filled in
// server-side from the real event row before the response ever leaves the
// server. Added 2026-09-13 (Jody: "when someone posts a link to an event on
// facebook or in a text, the link preview should say the event's name and
// show the flier in the preview if they have one").
//
// THE ACTUAL BUG: event.html's renderEvent() (client-side JS) already sets
// all of these tags correctly — pageTitle, ogImage, everything — but it can
// only do that AFTER the page's JS runs and its own Supabase fetch resolves.
// Facebook, iMessage/SMS, Twitter/X, Slack, etc. all generate link previews
// by fetching the raw HTML and reading whatever's already sitting in <head>
// — none of them execute JavaScript first. So every shared 313.events link
// preview showed the same static fallback ("Event details on 313.events...",
// the generic og-default.png) no matter which event it was. event.html's
// own header comment already flagged this exact gap ("this is a static SPA
// with no server-side per-page rendering, so a crawler that doesn't execute
// JS won't see these") — this file is that server-side rendering step.
//
// HOW: reads the static event.html file straight off disk (same file real
// browsers get — nothing about its body/script changes), fetches the one
// event row from Supabase, and does a handful of surgical string
// replacements targeting the exact id="..." tags event.html already has in
// its <head> (id="pageTitle", id="ogImage", etc. — the same ids
// renderEvent() itself targets client-side). Real visitors are unaffected:
// the page loads, its own JS runs, and renderEvent() overwrites these same
// tags with the same values anyway — this only changes what's present in
// the FIRST response a non-JS crawler ever sees.
//
// Wired up via vercel.json's rewrites (`/event.html` -> `/api/event-meta`,
// query string passed through automatically) so the public URL stays
// exactly event.html?id=... — no link anywhere on the site or shared
// externally needs to change. `functions["api/event-meta.js"].includeFiles`
// in vercel.json explicitly bundles event.html into this function's
// deployment (a plain runtime fs.readFileSync() isn't traced by Vercel's
// automatic dependency detection the way a require()/import would be).
//
// Falls back to serving the plain static template untouched (same content
// every visitor got before this file existed) whenever: no id is present,
// the event isn't found/approved, or the Supabase request fails for any
// reason — this must never be the thing that makes event.html stop loading.
//
// 2026-09-17 FOLLOW-UP -- THIS WAS NEVER ACTUALLY RUNNING: Jody shared an
// event link to Facebook and it showed the generic fallback card despite
// the event being approved. Investigation found the real bug: Vercel's
// routing checks static files BEFORE rewrites, and event.html existed as a
// literal static file at that exact path (it has to -- this function reads
// it straight off disk). So every single request to /event.html?id=... was
// served as the raw static file directly, and this function's rewrite
// (vercel.json: "/event.html" -> "/api/event-meta") never fired at all --
// confirmed live: even a cache-busted query string came back as an
// x-vercel-cache: HIT with the plain static Cache-Control header, which
// only makes sense for a literal static file being served by the CDN, not
// this function's own Cache-Control (see bottom of this file). This means
// every 313.events link shared anywhere since this file was first written
// (2026-09-13) showed the generic card, not just today's.
//
// FIX: the on-disk template was renamed from event.html to
// event-template.html (git mv, history preserved) so nothing occupies the
// literal /event.html static path anymore -- the rewrite now has nothing
// to lose to. The PUBLIC url is unchanged (still exactly
// event.html?id=... -- see canonicalUrl below), only the on-disk filename
// this function reads via fs.readFileSync moved. vercel.json's
// functions["api/event-meta.js"].includeFiles was updated to match.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://afvyfjfqukptnfmgshzn.supabase.co";
// Same public/publishable key every client-facing page already hardcodes
// (documented there as "safe for client code, read-only via RLS") — see
// api/sitemap.js's 2026-09-13 header for the identical env-var fallback
// reasoning; this function only ever reads status=approved rows, same as
// any browser tab.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_NQgem2pH8h_ynP8ikwdmFw_5aoN34Q5";
const SITE_URL = "https://313.events";
const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/social/og-default.png`;

function decodeEntities(str) {
  if (!str) return str;
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// HTML-attribute-safe escaping — distinct from event.html's own escapeHtml()
// (which leans on a live DOM element, not available in this Node runtime).
function escapeAttr(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

function truncateText(str, maxLen) {
  if (!str) return "";
  const flat = str.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  const cut = flat.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

// Identical to event.html's own dateRangeLabel(e, 'long') — kept as a
// faithful port so the server-rendered title matches what renderEvent()
// immediately re-renders client-side (no visible flash/mismatch).
function dateRangeLabel(dateISO, endDateISO) {
  const opts = { weekday: "long", month: "long", day: "numeric" };
  const start = new Date(dateISO + "T12:00:00").toLocaleDateString("en-US", opts);
  if (!endDateISO || endDateISO <= dateISO) return start;
  const end = new Date(endDateISO + "T12:00:00").toLocaleDateString("en-US", opts);
  return `${start} – ${end}`;
}

function replaceTag(html, pattern, value) {
  return html.replace(pattern, (_, pre, post) => `${pre}${value}${post}`);
}

module.exports = async (req, res) => {
  const templatePath = path.join(process.cwd(), "event-template.html");
  let html;
  try {
    html = fs.readFileSync(templatePath, "utf8");
  } catch (err) {
    // The one truly unrecoverable case — event.html itself is missing from
    // this deployment. Nothing to fall back to.
    res.status(500).send("Not found");
    return;
  }

  const id = req.query && req.query.id;
  if (id && typeof id === "string" && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const url =
        `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}&status=eq.approved` +
        `&select=title,description,image_url,start_date,end_date,venue_name_raw,venue_city_raw`;
      const resp = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (resp.ok) {
        const rows = await resp.json();
        const e = Array.isArray(rows) && rows[0];
        if (e && e.title) {
          const title = decodeEntities(e.title);
          const venue = decodeEntities(e.venue_name_raw) || "Venue TBA";
          const city = e.venue_city_raw && e.venue_city_raw.toLowerCase() !== "detroit"
            ? decodeEntities(e.venue_city_raw)
            : "";
          const dateLabel = dateRangeLabel(e.start_date, e.end_date);
          const pageTitle = `${title} — ${dateLabel} — 313.events`;
          const description = e.description ? decodeEntities(e.description) : undefined;
          const metaDesc = truncateText(
            description || `${title} at ${venue}${city ? ", " + city : ""} on ${dateLabel}.`,
            155
          );
          const canonicalUrl = `${SITE_URL}/event.html?id=${encodeURIComponent(id)}`;
          const ogImage = safeUrl(e.image_url) || DEFAULT_OG_IMAGE;

          html = replaceTag(html, /(<title id="pageTitle">)[^<]*(<\/title>)/, escapeAttr(pageTitle));
          html = replaceTag(html, /(<link rel="canonical" id="canonicalLink" href=")[^"]*(")/, escapeAttr(canonicalUrl));
          html = replaceTag(html, /(<meta name="description" id="metaDescription" content=")[^"]*(")/, escapeAttr(metaDesc));
          html = replaceTag(html, /(<meta property="og:title" id="ogTitle" content=")[^"]*(")/, escapeAttr(pageTitle));
          html = replaceTag(html, /(<meta property="og:description" id="ogDescription" content=")[^"]*(")/, escapeAttr(metaDesc));
          html = replaceTag(html, /(<meta property="og:url" id="ogUrl" content=")[^"]*(")/, escapeAttr(canonicalUrl));
          html = replaceTag(html, /(<meta property="og:image" id="ogImage" content=")[^"]*(")/, escapeAttr(ogImage));
          html = replaceTag(html, /(<meta name="twitter:title" id="twitterTitle" content=")[^"]*(")/, escapeAttr(pageTitle));
          html = replaceTag(html, /(<meta name="twitter:description" id="twitterDescription" content=")[^"]*(")/, escapeAttr(metaDesc));
          html = replaceTag(html, /(<meta name="twitter:image" id="twitterImage" content=")[^"]*(")/, escapeAttr(ogImage));
        }
      }
      // A non-OK response, a missing/unapproved row, or any thrown error all
      // fall through silently — html stays the plain static template, same
      // as every visitor got before this function existed.
    } catch (err) {
      // Same silent fallback — a broken preview tag is far better than a
      // broken page.
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Short edge cache so a burst of crawler hits on one popular link doesn't
  // mean a fresh Supabase round-trip per hit, but an admin edit to the
  // event (title, image, description) still shows up in previews within
  // minutes rather than being stuck behind a long cache.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(html);
};
