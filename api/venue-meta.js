const fs = require("fs");
const path = require("path");

// Vercel serverless function — same fix as api/event-meta.js, applied to
// venue.html. Added 2026-09-17 after Jody asked "does that solve sharing
// previews everywhere?" about the event.html fix: it didn't — venue.html
// had the exact same bug (client-side-only renderVenue() sets pageTitle/
// ogTitle/etc. after its own Supabase fetch resolves, which a non-JS
// crawler never sees) and had never had ANY fix attempted, server-side or
// otherwise, unlike event.html. See api/event-meta.js's own header comment
// for the full explanation of why this has to be a server-side rewrite
// rather than a client-side fix, and its 2026-09-17 follow-up note for the
// Vercel static-file-vs-rewrite precedence gotcha this same fix has to
// avoid: the on-disk template is venue-template.html (git mv from
// venue.html, history preserved), NOT venue.html, so nothing occupies the
// literal /venue.html static path and the rewrite below can actually fire.
// Public URLs are unchanged — still exactly venue.html?id=....
//
// No image_url injection here (unlike event-meta.js) — venue.html itself
// has never set a per-venue image client-side either (venues don't have a
// single canonical "venue photo" field the way events have a flyer), so
// previews keep using the same generic og-default.png a real visitor's own
// renderVenue() also leaves in place. Nothing to regress here.
//
// Falls back to serving the plain static template untouched whenever: no
// id is present, the venue isn't found, or the Supabase request fails for
// any reason — same non-negotiable safety property as event-meta.js.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://afvyfjfqukptnfmgshzn.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_NQgem2pH8h_ynP8ikwdmFw_5aoN34Q5";
const SITE_URL = "https://313.events";

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

function escapeAttr(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateText(str, maxLen) {
  if (!str) return "";
  const flat = str.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  const cut = flat.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

function replaceTag(html, pattern, value) {
  return html.replace(pattern, (_, pre, post) => `${pre}${value}${post}`);
}

module.exports = async (req, res) => {
  const templatePath = path.join(process.cwd(), "venue-template.html");
  let html;
  try {
    html = fs.readFileSync(templatePath, "utf8");
  } catch (err) {
    res.status(500).send("Not found");
    return;
  }

  const id = req.query && req.query.id;
  if (id && typeof id === "string" && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const url =
        `${SUPABASE_URL}/rest/v1/venues?id=eq.${encodeURIComponent(id)}` +
        `&select=id,name,address,city`;
      const resp = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (resp.ok) {
        const rows = await resp.json();
        const v = Array.isArray(rows) && rows[0];
        if (v && v.name) {
          const name = decodeEntities(v.name);
          const address = decodeEntities(v.address) || "";
          const city = decodeEntities(v.city) || "";
          const pageTitle = `${name}${city ? ` — ${city}` : ""} — 313.events`;
          const metaDesc = truncateText(
            `${name}${address ? `, ${address}` : ""}${city ? `, ${city}` : ""} — upcoming events on 313.events, Detroit's arts, culture, and nightlife calendar.`,
            155
          );
          const canonicalUrl = `${SITE_URL}/venue.html?id=${encodeURIComponent(id)}`;

          html = replaceTag(html, /(<title id="pageTitle">)[^<]*(<\/title>)/, escapeAttr(pageTitle));
          html = replaceTag(html, /(<link rel="canonical" id="canonicalLink" href=")[^"]*(")/, escapeAttr(canonicalUrl));
          html = replaceTag(html, /(<meta name="description" id="metaDescription" content=")[^"]*(")/, escapeAttr(metaDesc));
          html = replaceTag(html, /(<meta property="og:title" id="ogTitle" content=")[^"]*(")/, escapeAttr(pageTitle));
          html = replaceTag(html, /(<meta property="og:description" id="ogDescription" content=")[^"]*(")/, escapeAttr(metaDesc));
          html = replaceTag(html, /(<meta property="og:url" id="ogUrl" content=")[^"]*(")/, escapeAttr(canonicalUrl));
          html = replaceTag(html, /(<meta name="twitter:title" id="twitterTitle" content=")[^"]*(")/, escapeAttr(pageTitle));
          html = replaceTag(html, /(<meta name="twitter:description" id="twitterDescription" content=")[^"]*(")/, escapeAttr(metaDesc));
        }
      }
    } catch (err) {
      // Silent fallback — same non-negotiable rule as event-meta.js.
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(html);
};
