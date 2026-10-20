#!/usr/bin/env node
// test/card-row-hit-areas.test.js -- card-row Share / Calendar / link controls get ~44px invisible
// tap areas (the #259 ::after technique): the pseudo-element is empty, absolutely positioned, and
// extends at least 16px above and below the control; the controls keep position:relative.
"use strict";
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const read = (f) => fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
const vInset = (css, sel) => {
  const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{content:\"\";position:absolute;inset:(-?[0-9.]+)px").exec(css);
  assert.ok(m, "missing hit-area rule for " + sel);
  return parseFloat(m[1]);
};
const home = read("index.html");
assert.ok(vInset(home, ".evt-link::before, .evt-share::after") <= -16, "index link/share inset");
assert.ok(vInset(home, ".evt-cal a::after") <= -16, "index calendar-anchor inset");
assert.ok(/\.evt-link, \.evt-cal a, \.evt-share\{position:relative;\}/.test(home), "controls positioned");
for (const f of ["calendar.html", "map.html"]) {
  const css = read(f);
  assert.ok(vInset(css, ".evt-link::before") <= -16, f + " link inset");
  assert.ok(/\.evt-link\{position:relative;\}/.test(css), f + " link positioned");
}
console.log("card-row hit areas OK");
