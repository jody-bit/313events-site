"use strict";
// api/seasonal-qa.js — QA-only dataset for /halloween?qa=1.
// 404 in production (VERCEL_ENV === "production"); everywhere else it serves
// the full 52-record Halloween dataset, including records that are NOT cleared
// for public display. The dataset lives in api/_lib (not a static path).
const { isProduction } = require("./_lib/environment.js");

module.exports = function handler(req, res) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");
  if (isProduction(process.env) || req.method !== "GET" || (req.query && req.query.c && req.query.c !== "halloween")) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "not found" }));
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(require("./_lib/seasonal-halloween-qa.json")));
};
