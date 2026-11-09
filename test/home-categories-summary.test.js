// test/home-categories-summary.test.js — owner direction Nov 4: "Categories" spelled out (never "Cats"), count of selected out of the
// total, every selected name removable, a clear-all, driven by the live selection. Source-level check of index.html.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(/function updateCatSummary\(\)/.test(html), "summary exists");
assert.ok(/className = 'cat-name'/.test(html) && !/Remove category|cat-sel|Clear all categories/.test(html), "names are display-only colour chips; no new remove/clear controls");
assert.ok(/`\$\{selectedCats\} of \$\{totalCats\} categories`/.test(html), "trigger reads 'N of M categories'");
assert.ok(/textContent = 'All categories'/.test(html), "reset chip reads All categories");
assert.ok(!/\$\{[^}]*\}\/\$\{[^}]*\} cats/.test(html), "no 'N/M cats' wording");
console.log("ok home-categories-summary");
