"use strict";
// api/seasonal-preview.js — owner-review Preview of the refreshed Don't Miss collections.
//
// FAIL-CLOSED, same rule as api/seasonal-qa.js: it answers only when VERCEL_ENV is exactly "preview" or
// "development" (APP_ENV=production forces 404). Production, any other value and a missing variable return 404, so none of
// this content can be reached on 313.events. Nothing here is published, approved or scheduled.
//   GET /api/seasonal-preview?c=fall                 -> /fall with the six lead stories promoted and expired activity removed
//   GET /api/seasonal-preview?c=outside-the-ordinary -> proposed evergreen successor to Fall Colors (/fall-color is untouched)
//   GET /api/seasonal-preview?c=off-the-beaten-orbit -> proposed November/December collection (/halloween is untouched)
// The page uses the approved seasonal components (render.js, seasonal.css, page.js); entries come from the private
// editorial data plus api/_lib/seasonal-editorial/refresh-preview.json. The query value only selects a fixed key.
const path = require("path");
const qa = require("./seasonal-qa.js");
const ED = require("./_lib/seasonal-editorial/editorial.js");
const RENDER = require("../seasonal/render.js");
const PREVIEW = require("./_lib/seasonal-editorial/refresh-preview.json");
const LOCS = require("./_lib/seasonal-editorial/locations.json");

const SLUGS = ["fall", "outside-the-ordinary", "off-the-beaten-orbit"];

function clone(v) { return JSON.parse(JSON.stringify(v)); }

// The entries of one preview collection, in public display form.
function entriesFor(slug) {
  const cfg = PREVIEW[slug], proj = ED.publishedProjection();
  const base = slug === "fall" ? proj.fall : cfg.base ? proj[cfg.base] : [];
  const drop = new Set(cfg.remove || []);
  const all = clone(base).filter((e) => !drop.has(e.id)).map((e) => Object.assign(e, { featured: false }, (cfg.overrides || {})[e.id] || {})).concat(clone(cfg.add || []));
  // The six lead stories, in rank order, first: the "Don't miss" rail shows the featured entries in list order.
  const lead = cfg.lead || [];
  const byId = (id) => all.find((e) => e.id === id);
  // Public location fields only (status, lat, lng, address, entrance); source, method and notes stay in the private file.
  all.forEach((e) => { const l = LOCS[e.id]; if (l && l.status !== "unresolved") e.loc = { status: l.status, lat: l.lat, lng: l.lng, address: l.address || null, entrance: l.entrance || null, accessUrl: l.accessUrl || null }; else if (l) e.loc = { status: "unresolved" }; });
  return lead.map(byId).filter(Boolean).concat(all.filter((e) => lead.indexOf(e.id) < 0));
}

function previewData(slug) {
  const cfg = PREVIEW[slug];
  return { slug, meta: cfg.meta || null, entries: entriesFor(slug) };
}

function json(v) { return JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }

function html(slug, qaPins) {
  const d = previewData(slug), R = RENDER;
  const title = (d.meta ? d.meta.title : "Fall Is On.") + " (Preview) — 313.events";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${R.esc(title)}</title>
<link rel="icon" type="image/svg+xml" href="/assets/icons/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62,700;62,900&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<meta name="theme-color" content="#0A0A0A">
<link rel="stylesheet" href="/seasonal/seasonal.css">
</head>
<body data-collection="${R.esc(slug)}">
<p role="status" style="margin:0;padding:10px 16px;background:#F5C400;color:#0A0A0A;font:600 14px Inter,sans-serif;text-align:center">PREVIEW FOR OWNER REVIEW. Not published and not approved. Dates and map locations shown here are for review; nothing is scheduled.</p>
<div class="sc-page">
${R.header()}
<main id="scMain"></main>
${R.footer()}
</div>
<script>window.SeasonalPublishedEntries = {${JSON.stringify(slug)}: ${json(d.entries)}};</script>
<script src="/seasonal/collections.js"></script>
<script src="/seasonal/render.js"></script>
<script src="/seasonal/orbit-cities.js"></script>
<script>(function () {
  var C = window.SeasonalCollections, slug = ${JSON.stringify(slug)}, META = ${json(d.meta)};
  var col = C.COLLECTIONS[slug] = Object.assign({}, C.COLLECTIONS[slug] || {}, META || {}, { entries: window.SeasonalPublishedEntries[slug], previewPendingPhotos: true });
  ${qaPins ? "window.SeasonalRender.setQaPins(true);   // Preview-only QA view (?qa=pins): candidate pins drawn and labelled; never the default view" : ""}
  document.getElementById("scMain").innerHTML = window.SeasonalRender.main(col);
})();</script>
<script src="/seasonal/image-fallback.js"></script>
<script src="/seasonal/page.js"></script>
</body>
</html>
`;
}

function handler(req, res) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  if (!qa.qaAllowed(process.env) || req.method !== "GET" || typeof q.c !== "string" || SLUGS.indexOf(q.c) < 0) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "not found" }));
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html(q.c, q.qa === "pins"));
}

module.exports = handler;
module.exports.entriesFor = entriesFor;
module.exports.previewData = previewData;
module.exports.html = html;
module.exports.SLUGS = SLUGS;
