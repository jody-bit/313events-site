// test/calendar-categories-summary.test.js — owner direction Nov 4: "Categories" spelled out (never "Cats"), count of selected out of the
// total, every selected name removable, a clear-all, driven by the live selection. Source-level check of calendar.html; the behaviour was
// exercised in a real browser run (see the PR description).
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "calendar.html"), "utf8");
assert.ok(/<span class="mt-label">Categories<\/span>/.test(html), "the filter trigger is labelled Categories");
assert.ok(!/\$\{[^}]*\}\/\$\{[^}]*\} cats/.test(html) && !/>Category</.test(html.replace(/\/\*[\s\S]*?\*\//g, "")), "no '2/15 cats' or 'Category' trigger wording");
assert.ok(/`\$\{activeCats\.size\} of \$\{totalCats\} categories`/.test(html), "the trigger summary reads 'N of M categories'");
assert.ok(/function updateCatSummary\(\)/.test(html) && /selected/.test(html) && /Clear all categories/.test(html), "summary and clear-all exist");
assert.ok(/Remove category: \$\{CATS\[k\]\.label\}/.test(html), "each name has an accessible remove button");
assert.ok(/Object\.keys\(CATS\)\.filter\(k=>activeCats\.has\(k\)\)/.test(html), "names and count come from the live selection");
assert.ok(/ev\.stopPropagation\(\)/.test(html), "removing a name does not close the open filter sheet");
assert.ok(/allChip\.textContent = 'All categories'/.test(html), "the reset chip reads All categories");
assert.ok(/Event Type palette/.test(html), "Event Type comments and palette are untouched");
console.log("ok calendar-categories-summary");
