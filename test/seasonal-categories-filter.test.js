// test/seasonal-categories-filter.test.js — owner direction Nov 4 (final category-filter change): "Categories" everywhere (never "Cats"),
// a count of selected out of available followed by every selected name, individually removable, clear all, shared by Grid/List/Map.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const PE = require(path.join(root, "seasonal/published-entries.js"));
const mk = (id, cats) => ({ id, name: id, city: "Detroit", region: "MI", categories: cats, status: "PUBLISHED", summary: "s", website: "https://example.org", image: { src: "/a.jpg", illustrative: false, credit: "c" } });
PE.cf = [mk("a", ["cider-donuts"]), mk("b", ["farm-experiences"]), mk("c", ["cider-donuts", "farm-experiences"]), mk("d", ["fall-festivals"])];
const R = require(path.join(root, "seasonal/render.js"));
const C = require(path.join(root, "seasonal/collections.js"));
const col = Object.assign({}, C.COLLECTIONS.fall, { slug: "cf", entries: PE.cf, filterLabel: "What do you want to do?" });
const ids = (st) => R.visible(col, st).map((e) => e.id);

assert.deepStrictEqual(ids({ categories: [] }), ["a", "b", "c", "d"], "no selection shows everything");
assert.deepStrictEqual(ids({ categories: ["cider-donuts"] }), ["a", "c"]);
assert.deepStrictEqual(ids({ categories: ["cider-donuts", "fall-festivals"] }), ["a", "c", "d"], "several categories: any match");
assert.deepStrictEqual(ids({ category: "farm-experiences" }), ["b", "c"], "the older single category still works");

const total = R.usedCategories(col).length;
assert.strictEqual(total, 3);
const none = R.catSummary(col, { categories: [] });
assert.ok(/Categories:<\/strong> 0 of 3 selected/.test(none) && !/Clear all/.test(none), "nothing selected: 0 of total, no clear button");
const two = R.catSummary(col, { categories: ["fall-festivals", "cider-donuts"] });
assert.ok(/Categories:<\/strong> 2 of 3 selected — /.test(two), "count of selected out of available, then a dash");
const labels = [...two.matchAll(/data-cat-remove="([^"]+)"[^>]*>([^<]+) <span/g)].map((m) => m[2]);
assert.deepStrictEqual(labels, [R.catLabel(col, "fall-festivals"), R.catLabel(col, "cider-donuts")], "every selected name, in selection order");
assert.strictEqual((two.match(/data-cat-remove=/g) || []).length, 2, "each name is its own remove button");
assert.ok(/aria-label="Remove category: /.test(two) && /data-cat-clear>Clear all categories</.test(two), "accessible remove labels and a clear-all");
const one = R.catSummary(col, { categories: ["cider-donuts"] });
assert.ok(/1 of 3 selected/.test(one), "the count follows the selection immediately");

// the same selection renders in every view (the filter bar lives outside the results)
["grid", "list", "map"].forEach((v) => {
  const st = { categories: ["cider-donuts"], view: v, query: "" };
  const page = R.main(Object.assign({}, col, { entries: PE.cf }), st);
  assert.ok(/id="scCatSummary"/.test(page) && /1 of 3 selected/.test(page), v + " view keeps the count and names");
  assert.ok(/data-cat="cider-donuts" aria-pressed="true"/.test(page) && /data-cat="all" aria-pressed="false"/.test(page), v + " view keeps the pressed chips");
});

// wording: no shortened "Cats" anywhere a visitor or screen reader meets it
const src = ["seasonal/render.js", "seasonal/page.js", "seasonal/map-view.js"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
const visible = src.replace(/\/\/.*$/gm, "").replace(/sc-filter-cats|data-cat\w*|\.cats?\b|\b(get|set|delete)\("cat"/g, "");
assert.ok(!/(["'>])\s*cats?\b[^"'<]*["'<]/i.test(visible) && !/\bcats\b/i.test(visible.replace(/\bstate\.cat\b|\bvar cat\b|\bcat\b/g, "")), "no 'Cats' label in the collection interface");
assert.ok(/aria-label="Categories \(choose any number\)"/.test(R.main(col, {})), "the chip group is labelled Categories");
assert.ok(!/ mi<\/strong>/.test(src), "distance reads 'miles', not 'mi'");
console.log("ok seasonal-categories-filter");
