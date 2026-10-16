#!/usr/bin/env node
"use strict";

// Read-only BGSU geographic evidence audit (Admin Queue Modernization, Stage 4).
//   node scripts/bgsu-geo-audit.js rows.json [YYYY-MM-DD]
// rows.json: an array of event rows (id, venue_name_raw, venue_city_raw,
// venue_address_raw, start_date, end_date, venues{lat,lng}). Reads a file,
// prints a summary, touches no database and changes nothing.

const fs = require("fs");
const { auditRows } = require("../api/_lib/bgsu-geo-audit");

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/bgsu-geo-audit.js rows.json [YYYY-MM-DD]");
  process.exit(2);
}
const today = process.argv[3] || new Date().toLocaleDateString("en-CA", { timeZone: "America/Detroit" });
const result = auditRows(JSON.parse(fs.readFileSync(file, "utf8")), today);
console.log(JSON.stringify({
  total: result.total,
  upcoming: result.upcoming,
  counts: result.counts,
  upcoming_counts: result.upcoming_counts,
  shared_streets: result.shared_streets,
  review: result.review.map((r) => ({ id: r.id, class: r.evidence_class, reason: r.review_reason, distance_miles: r.distance_miles })),
}, null, 2));
