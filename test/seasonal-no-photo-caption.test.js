"use strict";
// Owner decision 2026-11-21: no "Photo pending" caption on the seasonal pages either, Preview or not.
const assert = require("assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
for (const f of ["seasonal/render.js", "seasonal/seasonal.css"]) {
  const t = fs.readFileSync(path.join(root, f), "utf8");
  assert.ok(!/sc-pending/.test(t) && !/Photo pending/i.test(t), f + " carries no pending caption");
}
console.log("PASS: seasonal pages carry no Photo pending caption");
