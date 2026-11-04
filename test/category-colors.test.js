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

// 7. ONE event-type label, visible and the same everywhere (owner review 2026-10-22: the homepage showed no coloured label)
{
  const tag = Categories.tagHtml("music");
  assert.ok(/^<span class="cat-tag" data-cat="music">Music<\/span>$/.test(tag), "the label is the category name in one element: " + tag);
  assert.strictEqual(Categories.tagHtml("music", { size: "detail" }), '<span class="cat-tag cat-tag--detail" data-cat="music">Music</span>');
  assert.strictEqual(Categories.tagHtml("music", { size: "compact" }), '<span class="cat-tag cat-tag--compact" data-cat="music">Music</span>');
  assert.strictEqual(Categories.tagHtml("not-a-category"), "", "an unknown type renders nothing");
  assert.ok(!/style=|color/i.test(tag), "the label carries no colour of its own; the rule keyed on data-cat supplies it");
  for (const c of Categories.list) {
    const html = Categories.tagHtml(c.key);
    assert.ok(html.includes(`>${c.label.replace(/&/g, "&amp;")}</span>`), `${c.key}: the label prints the type name (colour is never the only signal)`);
  }

  // the label rules: one colour rule per category, from its own token; visible; no hiding
  const css = Categories.tagCss();
  for (const c of Categories.list) assert.ok(css.includes(`.cat-tag[data-cat="${c.key}"]{color:var(${c.token});}`), `${c.key} has its colour rule`);
  assert.ok(!/display:\s*none|visibility:\s*hidden|opacity:\s*0\b/.test(css), "the label is never hidden");
  const size = (re) => Number((css.match(re) || [])[1]);
  assert.ok(size(/\.cat-tag\{[^}]*font-size:([\d.]+)px/) >= 11, "the default label is at least 11px");
  assert.ok(size(/\.cat-tag--compact\{font-size:([\d.]+)px/) >= 10.5 && size(/\.cat-tag--detail\{font-size:([\d.]+)px/) >= 12, "compact and detail sizes stay readable");
  // the default colour is the site's ink, not a grey: a label that failed to match a category would still be readable
  assert.ok(/color:var\(--ink,#F2F0E8\)/.test(css));
  // the default label is coloured text (not a dot); the filled pill is an explicit variant of the same component
  assert.ok(!/\.cat-tag\[data-cat=[^{]*\{[^}]*background:/.test(css), "the default label has no category fill");
  for (const c of Categories.list) assert.ok(css.includes(`.cat-tag--pill[data-cat="${c.key}"]{background:var(${c.token});color:#0A0A0A;}`), `${c.key} has its pill rule from the same token`);
  assert.strictEqual(Categories.tagHtml("music", { size: "detail", fill: "pill" }), '<span class="cat-tag cat-tag--detail cat-tag--pill" data-cat="music">Music</span>');
  // Owner design decision (Oct 22): calendar, map and event detail keep their filled pills (same mapping); the pill is at
  // least as readable as the coloured text for every category.
  for (const c of Categories.list) assert.ok(ratio(c.hex, "#0A0A0A") >= ratio(c.hex, "#202020"), `${c.key}: pill contrast ${ratio(c.hex, "#0A0A0A").toFixed(2)} is below the text label ${ratio(c.hex, "#202020").toFixed(2)}`);
  for (const f of ["calendar.html", "map.html"]) {
    const h = read(f);
    assert.ok((h.match(/Categories\.tagHtml\(e\.cat, \{fill:'pill'\}\)/g) || []).length === (f === "calendar.html" ? 4 : 1), `${f}: every type label is the shared pill`);
  }
  assert.ok(/Categories\.tagHtml\(e\.cat, \{size:'detail', fill:'pill'\}\)/.test(read("event-template.html")), "event detail uses the shared pill");
  for (const f of ["index.html", "venue-template.html", "radar.html"]) assert.ok(!/fill:\s*'pill'/.test(read(f)), `${f} keeps the coloured-text label`);
  // Radar: the outlet name is neutral; colour is used only by the type label beneath it.
  const radar = read("radar.html");
  assert.ok(!/rc-outlet[^\n]*(cat\.color|var\(--c-|--accent)/.test(radar), "radar outlet name carries no category colour");
  assert.ok(/\.rc-outlet\{[^}]*color:var\(--ink-soft\)/.test(radar), "radar outlet name is neutral");

  // every surface that shows an event's type renders it through the one component, and no page styles a label itself
  const SURFACES = { "index.html": 1, "calendar.html": 4, "map.html": 1, "event-template.html": 1, "venue-template.html": 1, "radar.html": 1 };
  for (const [f, n] of Object.entries(SURFACES)) {
    const html = read(f);
    assert.strictEqual((html.match(/Categories\.tagHtml\(/g) || []).length, n, `${f} renders the type label through Categories.tagHtml ${n} time(s)`);
    assert.ok(!/class="evt-cat"|\.evt-cat\{|\.evt-cat-badge|venue-event-dot|class="tag" style="background:\$\{CATS/.test(html), `${f} has no private label markup or style left`);
    assert.ok(!/\.cat-tag[^{}\n]*\{/.test(html), `${f} does not restyle the shared label`);
  }
  // submit.html is a picker (swatch + name per option), not an event surface; it still uses the shared tokens only.
  console.log("PASS: one shared event-type label (Option A, coloured text with the type name); never hidden; readable sizes; used by homepage, calendar (4 views), map, event detail, venue and radar; no page styles it");
}

console.log("\nAll category-colour checks passed.");
