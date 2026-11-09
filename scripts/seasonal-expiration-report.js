// scripts/seasonal-expiration-report.js — REPORT-ONLY. Prints which published seasonal entries are SEASON_ENDED, REVIEW_DUE or
// have INSUFFICIENT_EVIDENCE. Never edits or hides anything. Exit 1 only when a verified-ended entry is still PUBLISHED with no
// editorial disposition. See api/_lib/seasonal-editorial/expiration.js and EDITORIAL_EXPIRATION_PROCESS.md.
//   node scripts/seasonal-expiration-report.js [--verbose] [--today YYYY-MM-DD]
"use strict";
const path = require("path");
const ED = require(path.join(__dirname, "..", "api/_lib/seasonal-editorial/editorial.js"));
const X = require(path.join(__dirname, "..", "api/_lib/seasonal-editorial/expiration.js"));
const i = process.argv.indexOf("--today");
const today = i > -1 ? process.argv[i + 1] : X.detroitToday();
const r = X.expirationReport(ED.entries(), today);
console.log(X.formatReport(r, { verbose: process.argv.includes("--verbose") }));
process.exit(r.failures.length ? 1 : 0);
