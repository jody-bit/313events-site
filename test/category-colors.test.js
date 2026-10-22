// test/category-colors.test.js — event-type colour has ONE definition (/categories.js) and every page uses it.
//
// WHY (owner direction 2026-10-22): the colours had drifted into about eight copies that disagreed (the
// accessible 2026-10-04 values existed on the homepage only; the calendar, map, radar, venue, event and submit
// pages still carried the older values, and two hand-typed hex maps stopped at 13 types). This pins the
// consolidation: one table, accessible contrast, no second definition anywhere, every page loads the table
// before it uses it.
//
// Run: node test/category-colors.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const Categories = require("../categories.js");
const { Discovery } = require("../discovery.js");

const PAGES = ["index.html", "calendar.html", "map.html", "radar.html", "venue-template.html", "event-template.html", "submit.html"];

// WCAG contrast ratio
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// 1. one table, same keys/labels/order as discovery.js
{
  const canonical = Discovery.categories.map((c) => [c.key, c.label]);
  assert.deepStrictEqual(Categories.list.map((c) => [c.key, c.label]), canonical, "categories.js keys, labels and order equal discovery.js");
  assert.strictEqual(Categories.list.length, 15);
  const tokens = new Set(Categories.list.map((c) => c.token));
  assert.strictEqual(tokens.size, 15, "every category has its own CSS token");
  for (const c of Categories.list) {
    assert.ok(/^#[0-9A-F]{6}$/.test(c.hex), `${c.key} has a six-digit hex`);
    assert.ok(/^--c-[a-z]+$/.test(c.token), `${c.key} token looks like --c-name`);
    assert.strictEqual(Categories.cssVar(c.key), `var(${c.token})`);
    assert.strictEqual(Categories.hex(c.key), c.hex);
  }
  assert.ok(Object.isFrozen(Categories) && Object.isFrozen(Categories.list) && Object.isFrozen(Categories.list[0]), "the table cannot be changed at run time");
  assert.strictEqual(Categories.cssVar("nope"), "");
  console.log("PASS: one table of 15 categories whose keys, labels and order equal discovery.js");
}

// 2. accessibility: every colour clears AA for small text on the tag background and on the page
{
  const worst = [];
  for (const c of Categories.list) {
    const onTag = ratio(c.hex, "#202020"), onPage = ratio(c.hex, "#0A0A0A");
    assert.ok(onTag >= 4.5, `${c.key} ${c.hex} on #202020 is ${onTag.toFixed(2)}:1, needs 4.5`);
    assert.ok(onPage >= 4.5, `${c.key} ${c.hex} on #0A0A0A is ${onPage.toFixed(2)}:1, needs 4.5`);
    worst.push(onTag);
  }
  console.log(`PASS: all 15 colours clear WCAG AA (4.5:1) on #202020 and #0A0A0A; lowest ${Math.min(...worst).toFixed(2)}:1`);
}

// 2b. filled badges and pills (calendar/map .tag, event-detail badge): dark text on the category fill clears AA for all 15
{
  for (const dark of ["#0A0A0A", "#06210F"]) {
    for (const c of Categories.list) assert.ok(ratio(c.hex, dark) >= 4.5, `${dark} text on the ${c.key} fill (${c.hex}) is ${ratio(c.hex, dark).toFixed(2)}:1, needs 4.5`);
  }
  // The event-detail badge must not force white text (white fails on the lightened music, food and gaming fills).
  assert.ok(!/\.evt-cat-badge\[data-cat=[^{]*\{[^}]*color:#fff/i.test(read("event-template.html")), "event-template.html forces no white badge text");
  console.log("PASS: dark text on every category fill clears AA (filled badges on calendar, map and event detail); no white-text override remains");
}

// 3. the token block defines every variable once
{
  const css = Categories.tokenCss();
  for (const c of Categories.list) assert.strictEqual(css.split(`${c.token}:${c.hex};`).length - 1, 1, `${c.token} defined once`);
  assert.ok(/^:root\{.*\}$/.test(css));
  console.log("PASS: the generated :root block defines each token exactly once");
}

// 4. no page defines a colour of its own; every page loads the table in <head> before using it
{
  const STALE = /#5B3EFF|#9D00FF|#2979FF|#E100FF|#B026FF|#FF2D55/i; // the superseded values for the six lightened types
  for (const f of PAGES) {
    const html = read(f);
    assert.ok(!/--c-[a-z]+\s*:\s*#?[0-9a-f]/i.test(html), `${f} declares no --c-* value (they come from categories.js)`);
    assert.ok(!STALE.test(html), `${f} carries none of the superseded category colours`);
    assert.ok(!/(?:const|var|let)\s+CAT_HEX\s*=\s*\{/.test(html), `${f} has no hand-typed hex map`);
    const head = html.indexOf("</head>");
    const tag = html.indexOf('<script src="/categories.js"></script>');
    assert.ok(tag > 0 && tag < head, `${f} loads /categories.js in <head>`);
    const firstUse = html.indexOf("Categories.");
    assert.ok(firstUse > tag, `${f} loads categories.js before it first uses Categories`);
    assert.strictEqual(html.split('src="/categories.js"').length - 1, 1, `${f} loads it once`);
  }
  console.log("PASS: 7 pages declare no category colour, load /categories.js in <head>, and use it only after it loads");
}

// 5. every var(--c-*) a page uses is a token the table defines
{
  const defined = new Set(Categories.list.map((c) => c.token));
  for (const f of [...PAGES, "fall.html", "fall-color.html", "halloween.html", "venues.html", "neighborhoods.html"]) {
    if (!fs.existsSync(path.join(root, f))) continue;
    for (const m of read(f).matchAll(/var\((--c-[a-z]+)\)/g)) assert.ok(defined.has(m[1]), `${f} uses ${m[1]}, which categories.js does not define`);
  }
  console.log("PASS: every var(--c-*) in the site resolves to a token categories.js defines");
}

// 6. map pins: derived from the table; training and gaming keep the old fallback until the owner decides
{
  const pins = Categories.pinHexMap();
  assert.strictEqual(pins.training, undefined);
  assert.strictEqual(pins.gaming, undefined);
  assert.strictEqual(Object.keys(pins).length, 13);
  for (const c of Categories.list) if (pins[c.key]) assert.strictEqual(pins[c.key], c.hex, `${c.key} pin equals its token colour`);
  for (const f of ["calendar.html", "map.html"]) assert.ok(/const CAT_HEX = Categories\.pinHexMap\(\)/.test(read(f)), `${f} derives its pin colours from the table`);
  console.log("PASS: pins derive from the same table; training and gaming pins are unchanged (owner decision pending)");
}

console.log("\nAll category-colour checks passed.");
