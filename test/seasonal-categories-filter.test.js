// Presentation only (owner correction Nov 4): "Categories" wording, a read-only "N of M selected" line, selection behaviour unchanged (one category or All).
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path");
const R = fs.readFileSync(path.join(__dirname, "..", "seasonal", "render.js"), "utf8");
const P = fs.readFileSync(path.join(__dirname, "..", "seasonal", "page.js"), "utf8");
assert.ok(/All categories<\/button>/.test(R), "reset chip reads All categories");
assert.ok(/of ' \+ all\.length \+ ' selected/.test(R), "summary shows the selection count out of the available categories");
assert.ok(!/data-cat-remove|data-cat-clear|state\.categories/.test(R + P), "no new removal/clear controls and no multi-select state");
assert.ok(/state\.category = b\.getAttribute\("data-cat"\)/.test(P), "chip selection is still one category at a time");
assert.ok(/R\.catSummary\(col, state\)/.test(P), "the summary follows every change (Grid, List and Map share state)");
console.log("ok seasonal-categories-filter");
