#!/usr/bin/env node
// test/card-typography-floor.test.js -- owner-approved card typography (Option B, 2026-10-20):
// functional card text is at least 12px; category tags and the time sub-label may be 11px.
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const T12 = [".evt-time", ".evt-share", ".evt-cal", ".evt-link", ".evt-place", ".evt-place .src", ".evt-ticket-status",
  ".evt-disclosure", ".ds-dow", ".ds-date", ".src", ".more-link", ".day-count", ".sec-link", ".rc-date",];
// Follow-up: other small home-page text (index.html only; calendar/map have their own dense cells)
const HOME = [".hps-label", ".mobile-trigger .mt-label", ".search-field .mt-label", ".af-label", ".loc-label", ".radius-label",
  ".orbit-mile", ".orbit-foot", ".orbit-caption", ".orbit-lbl", ".today-label", ".evt-editorial-also"];
const T11 = [".evt-cat", ".evt-tag-clothing-optional", ".evt-time small"];
const floor = (s, f) => (T12.includes(s) || (f === "index.html" && HOME.includes(s)) ? 12 : T11.includes(s) ? 11 : 0);

let checked = 0;
for (const f of ["index.html", "calendar.html", "map.html"]) {
  const css = fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((s) => s.trim());
    const need = Math.max(...sels.map((x) => floor(x, f)));
    if (!need) continue;
    for (const fs_ of m[2].matchAll(/font-size:\s*([0-9.]+)px/g)) {
      checked++;
      assert.ok(parseFloat(fs_[1]) >= need, `${f}: ${sels.join(", ")} font-size ${fs_[1]}px < ${need}px`);
    }
  }
}
assert.ok(checked >= 30, "expected to check the card typography rules, checked " + checked);
console.log(`card typography floor: ${checked} declarations OK`);
