"use strict";
// api/seasonal-qa.js — QA-only dataset and client script for /halloween?qa=1.
//
// FAIL-CLOSED: it answers only when VERCEL_ENV is exactly "preview" or
// "development". Production, any other value (staging, custom, empty) and a
// missing variable all return 404. APP_ENV=production also forces 404.
// The data and the QA client live in api/_lib/seasonal-editorial (not routable,
// not a static path); this handler is the only way to read them.
//   GET /api/seasonal-qa?c=halloween           -> 52-record QA dataset (JSON)
//   GET /api/seasonal-qa?c=fall                -> /fall QA dataset (JSON)
//   GET /api/seasonal-qa?c=fall-color          -> /fall-color QA dataset (JSON)
//   GET /api/seasonal-qa?asset=client          -> QA client script (JS)
const fs = require("fs");
const path = require("path");

const ALLOWED = ["preview", "development"];
// Collection -> dataset file. A fixed lookup: the query value is never used to build a path.
const DATASETS = { halloween: "halloween-qa.json", fall: "fall-qa.json", "fall-color": "fall-color-qa.json" };

function qaAllowed(env) {
  env = env || process.env;
  if (String(env.APP_ENV || "").trim().toLowerCase() === "production") return false;
  return ALLOWED.indexOf(env.VERCEL_ENV) >= 0;
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify({ error: "not found" }));
}

function handler(req, res) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  if (!qaAllowed(process.env) || req.method !== "GET") return notFound(res);
  if (q.asset === "client") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    return res.end(fs.readFileSync(path.join(__dirname, "_lib", "seasonal-editorial", "qa-client.js"), "utf8"));
  }
  const slug = q.c || "halloween";
  if (q.asset || typeof slug !== "string" || !Object.prototype.hasOwnProperty.call(DATASETS, slug)) return notFound(res);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(fs.readFileSync(path.join(__dirname, "_lib", "seasonal-editorial", DATASETS[slug]), "utf8"));
}

module.exports = handler;
module.exports.qaAllowed = qaAllowed;
