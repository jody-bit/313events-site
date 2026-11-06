"use strict";
// Guards the committed core fingerprint baseline and the diff helper. Offline: reads files only.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { diff } = require("../scripts/fingerprint-diff.js");

const base = JSON.parse(fs.readFileSync(path.join(__dirname, "../supabase/verify/core-fingerprint-baseline.json"), "utf8"));
const groups = ["column_grants", "columns", "constraints", "enums", "functions", "indexes", "policies", "rls", "table_grants", "triggers", "view_options", "views"];

for (const env of ["production", "staging"]) {
  assert.deepStrictEqual(Object.keys(base[env]).sort(), groups, env + " has every fingerprint group");
  for (const g of groups) assert.ok(/^[0-9a-f]{32}$/.test(base[env][g]), env + "." + g + " is an md5 hash");
}

// Production and staging may differ only in the documented groups.
const r = diff(base.production, base.staging, base.known_differences);
assert.ok(r.ok, "unexpected production/staging drift: " + r.differing.join(","));
assert.deepStrictEqual(diff(base.production, base.staging).differing, base.known_differences, "known_differences is exactly the drift");

// The helper accepts the {k,h,n} row format and detects a change.
const rows = groups.map((k) => ({ k, h: base.production[k], n: 1 }));
assert.ok(diff(rows, base.production).ok);
const changed = rows.map((x) => (x.k === "policies" ? Object.assign({}, x, { h: "0".repeat(32) }) : x));
assert.deepStrictEqual(diff(changed, base.production).differing, ["policies"]);

// The SQL file defines the same groups the baseline records.
const sql = fs.readFileSync(path.join(__dirname, "../supabase/verify/core_fingerprint.sql"), "utf8");
for (const g of groups) assert.ok(sql.includes("'" + g + "'"), "core_fingerprint.sql emits " + g);

console.log("fingerprint-baseline tests passed");
