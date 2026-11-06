#!/usr/bin/env node
// Compare two core_fingerprint.sql outputs (JSON arrays of {k,h,n}, or an object {group: hash}) and report differing groups.
//   node scripts/fingerprint-diff.js a.json b.json [--allow view_options,...]
// Exit 0 when every group matches (except allowed ones); exit 1 and list the differences otherwise.
"use strict";
const fs = require("fs");

function normalize(x) {
  if (Array.isArray(x)) { const o = {}; for (const r of x) o[r.k] = r.h; return o; }
  return x;
}

function diff(a, b, allow) {
  a = normalize(a); b = normalize(b); allow = allow || [];
  const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
  const differing = keys.filter((k) => a[k] !== b[k] && !allow.includes(k));
  return { keys, differing, ok: differing.length === 0 };
}

module.exports = { diff, normalize };

if (require.main === module) {
  const args = process.argv.slice(2);
  const ai = args.indexOf("--allow");
  const allow = ai >= 0 ? (args.splice(ai, 2)[1] || "").split(",").filter(Boolean) : [];
  if (args.length !== 2) { console.error("usage: fingerprint-diff.js a.json b.json [--allow g1,g2]"); process.exit(2); }
  const r = diff(JSON.parse(fs.readFileSync(args[0], "utf8")), JSON.parse(fs.readFileSync(args[1], "utf8")), allow);
  if (r.ok) { console.log("fingerprints match (" + r.keys.length + " groups" + (allow.length ? ", allowed: " + allow.join(",") : "") + ")"); process.exit(0); }
  console.error("fingerprint groups differ: " + r.differing.join(", ")); process.exit(1);
}
