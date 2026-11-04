"use strict";
// api/seasonal-collection.js — the owner-released public pages for the refreshed Don't Miss collections (owner release 2026-11-04).
//   /fall                  -> ?c=fall                  (Fall Is On, refreshed; replaces the static fall.html rewrite)
//   /outside-the-ordinary  -> ?c=outside-the-ordinary  (new page; /fall-color is untouched)
//   /off-the-beaten-orbit  -> ?c=off-the-beaten-orbit  (new page; /halloween is untouched)
// Same data and components as the reviewed Preview (api/seasonal-preview.js), without the review banner or noindex. Photos that are not
// cleared stay honestly labelled "Photo pending"; unconfirmed operating details carry "Check with the venue before you go".
// Only the three fixed slugs answer; anything else is 404. To roll back, point the /fall rewrite in vercel.json back at /fall.html and drop the two new rewrites.
const preview = require("./seasonal-preview.js");

function handler(req, res) {
  const q = req.query || {};
  if (req.method !== "GET" && req.method !== "HEAD" || typeof q.c !== "string" || preview.SLUGS.indexOf(q.c) < 0) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "not found" }));
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.end(req.method === "HEAD" ? "" : preview.html(q.c, false, { published: true }));
}

module.exports = handler;
