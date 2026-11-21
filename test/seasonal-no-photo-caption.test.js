"use strict";
// Owner decision 2026-11-21: no "Photo pending" caption on the seasonal pages either, Preview or not.
const assert = require("assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
for (const f of ["seasonal/render.js", "seasonal/seasonal.css"]) {
  const t = fs.readFileSync(path.join(root, f), "utf8");
  assert.ok(!/sc-pending/.test(t) && !/Photo pending/i.test(t), f + " carries no pending caption");
}
console.log("PASS: seasonal pages carry no Photo pending caption");
// The caption's CSS was removed line by line; the neighbouring rules must be intact.
const css = fs.readFileSync(path.join(root, "seasonal/seasonal.css"), "utf8");
for (const rule of [".sc-cover-credit{display:none}", ".sc-illus-hero{left:auto;right:10px;top:10px;bottom:auto;z-index:2}", '.sc-no-photo::after{position:static;display:block;padding:0;text-align:left}'])
  assert.ok(css.includes("\n" + rule), "seasonal.css keeps: " + rule);
assert.ok(!/\.sc-no-photo \.sc-no-photo|\.sc-no-photo:has\(\s*$/m.test(css), "no truncated selector");
assert.ok(css.split("{").length === css.split("}").length, "braces balance");
