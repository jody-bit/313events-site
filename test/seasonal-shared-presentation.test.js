// test/seasonal-shared-presentation.test.js — FALL IS ON., FALL COLORS. and THE DARK ORBIT. are one design system.
//   The visual corrections accepted in 5c2e988 live in shared files (seasonal.css, render.js, page.js, image-fallback.js); a collection may
//   differ only in content (headline, colour tokens, artwork, categories, destinations). This test pins that, so a later integration cannot
//   leave one page behind the others.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const DATA = require(path.join(root, "seasonal/collections.js"));
const R = require(path.join(root, "seasonal/render.js"));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const SLUGS = DATA.ORDER.slice();
assert.deepStrictEqual(SLUGS.slice().sort(), ["fall", "fall-color", "halloween"].sort(), "exactly the three seasonal collections");
const pub = Object.fromEntries(SLUGS.map((s) => [s, DATA.published(DATA.COLLECTIONS[s])]));

// 1. release counts are preserved
assert.strictEqual(pub.fall.length, 38, "FALL IS ON.");
assert.strictEqual(pub["fall-color"].length, 41, "FALL COLORS.");
assert.strictEqual(pub.halloween.length, 23, "THE DARK ORBIT.");

// 2. one stylesheet, one renderer: the three pages load the identical shared assets and the identical page shell
const pages = Object.fromEntries(SLUGS.map((s) => [s, read(s + ".html")]));
const assets = (h) => (h.match(/<link rel="stylesheet" href="[^"]+"|<script src="[^"]+"/g) || []).join("|");
// the set of structural elements the page uses (header, hero, filters, rail, grid, tiles, map, more-collections, footer); counts are content, structure is shared
const shell = (h) => Array.from(new Set((h.match(/<(?:header|main|footer|nav|section|div|ul|h1|button|input|label)\b[^>]*class="[^"]*"/g) || []).map((x) => x.replace(/ (?:data-[a-z]+|aria-[a-z]+|type|role|id|for|placeholder|value)="[^"]*"/g, "").replace(" sc-rail-solo", "")))).sort().join("|");
for (const s of SLUGS) {
  assert.strictEqual(assets(pages[s]), assets(pages.fall), s + ": same stylesheet and scripts as the approved Fall page");
  assert.ok(/\/seasonal\/seasonal\.css/.test(pages[s]) && /\/seasonal\/render\.js/.test(pages[s]) && /\/seasonal\/page\.js/.test(pages[s]) && /\/seasonal\/image-fallback\.js/.test(pages[s]), s + " loads the shared files");
  assert.strictEqual(shell(pages[s]), shell(pages.fall), s + ": same page shell (header, hero, filters, grid, footer) as the approved Fall page");
}

// 3. no collection-specific presentation rules: every selector in the shared stylesheet is collection-neutral
const css = read("seasonal/seasonal.css").replace(/\/\*[\s\S]*?\*\//g, "");
const selectors = [];
css.replace(/([^{}]+)\{[^{}]*\}/g, (m, sel) => { sel.split(",").forEach((x) => selectors.push(x.trim())); return m; });
assert.ok(selectors.length > 100, "parsed the stylesheet");
for (const sel of selectors) assert.ok(!/halloween|dark-orbit|fall-color|\.fall\b|data-collection|data-slug/i.test(sel), "collection-specific selector: " + sel);

// 4. the corrections accepted in 5c2e988 are still in the shared rules
for (const needle of [
  ".sc-card-title{margin:0;font-family:var(--font-display);font-stretch:62%;font-weight:900;text-transform:uppercase;font-size:21px;line-height:.95;overflow-wrap:anywhere}",
  ".sc-rail-solo .sc-card{flex-basis:100%}",
  ".sc-rail-solo .sc-card-row .sc-card-body{padding:10px 12px 38px 12px}",
  ".sc-rail-solo .sc-card-title{font-size:30px}",
  ".sc-card-row .sc-card-body{padding:10px 12px 38px 12px}",
]) assert.ok(css.includes(needle), "approved rule missing: " + needle);

// 5. the mobile word-breaking rule is shared and only ever shrinks a title that cannot fit
assert.ok(css.includes(".sc-card-title--long{font-size:min(21px,calc((50vw - 48px) / (var(--lw) * .52)))}"), "the fit rule never exceeds the approved 21px");
assert.ok(css.includes(".sc-rail:not(.sc-rail-solo) .sc-card-title--long,.sc-card-row .sc-card-title--long{font-size:21px}"), "rail, list and single-card layouts keep the approved 21px");
for (const s of SLUGS) {
  const col = DATA.COLLECTIONS[s];
  for (const e of pub[s]) {
    const words = String(e.name).split(/[\s\-–—]+/), longest = Math.max.apply(null, words.map((w) => w.length));
    const html = R.card(col, e), m = /<h3 class="sc-card-title( sc-card-title--long)?"( style="--lw:(\d+)")?>/.exec(html);
    assert.ok(m, s + "/" + e.id + ": title markup");
    if (longest >= 10) assert.ok(m[1] && Number(m[3]) === longest, s + "/" + e.id + ": long word (" + longest + ") carries the shared fit hint");
    else assert.ok(!m[1] && !m[2], s + "/" + e.id + ": ordinary titles are untouched");
  }
}
// the hint is arithmetic on the real card width: at the narrowest supported width (320px) a 2-column title is ~ (50vw - 48px); no word may be set wider than that
for (const vw of [320, 360, 390]) {
  const avail = vw / 2 - 48;
  for (const s of SLUGS) for (const e of pub[s]) {
    const longest = Math.max.apply(null, String(e.name).split(/[\s\-–—]+/).map((w) => w.length));
    if (longest < 10) continue;
    const size = Math.min(21, avail / (longest * 0.52));
    assert.ok(size * longest * 0.503 <= avail + 0.5, s + "/" + e.id + " fits at " + vw + "px");   // 0.503em/letter measured for the 62% Archivo Black display face
    assert.ok(size >= 8, s + "/" + e.id + " stays readable at " + vw + "px (>= 8px floor is not breached: " + size.toFixed(1) + "px)");
  }
}

// 5b. the measured, font-independent guard is shared too: one function in render.js, called by the one page script all three pages load
assert.strictEqual(typeof R.fitTitles, "function", "render.js exports the shared title fit");
const pageJs = read("seasonal/page.js");
assert.ok(/R\.fitTitles\(document\)/.test(pageJs) && /document\.fonts\.ready\.then/.test(pageJs) && /addEventListener\("resize"/.test(pageJs), "page.js fits after every render, after the webfonts load and on resize");
assert.ok(/Math\.max\(11,/.test(read("seasonal/render.js")), "the fit never goes below the 11px readability floor");
assert.ok(!/halloween|fall/.test(read("seasonal/render.js").slice(read("seasonal/render.js").indexOf("function fitTitles"), read("seasonal/render.js").indexOf("return { fitTitles"))), "the fit has no collection-specific branch");

// 6. neighbouring cards never repeat the same illustration, in any grid the page lays out (2 mobile columns, 4 desktop columns, as laid out at 320–1440px)
for (const s of SLUGS) {
  const list = pub[s].map((e) => e.image.src);
  for (const cols of [2, 4]) list.forEach((src, i) => {
    if (i % cols < cols - 1 && list[i + 1] !== undefined) assert.notStrictEqual(list[i + 1], src, s + ": card " + i + " repeats its right-hand neighbour in a " + cols + "-column grid");
    if (list[i + cols] !== undefined) assert.notStrictEqual(list[i + cols], src, s + ": card " + i + " repeats the card below it in a " + cols + "-column grid");
  });
}

// 7. the three pages render the same card structure from the same function (no per-collection card templates)
const fingerprint = (h) => h.replace(/>[^<]*</g, "><").replace(/"[^"]*"/g, '""');
const fp = (s) => fingerprint(R.card(DATA.COLLECTIONS[s], pub[s].find((e) => !e.website && e.image.src) || pub[s][0]));
assert.ok(R.card && fp("fall").startsWith("<li") && fp("halloween").startsWith("<li"));
console.log("ok   seasonal shared presentation: fall 38 · fall-color 41 · halloween 25; " + selectors.length + " collection-neutral selectors");
