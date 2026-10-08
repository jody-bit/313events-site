// test/site-css-shared.test.js — /site.css is the live homepage's own rules,
// verbatim (Calendar UI slice 1, 2026-10-08).
//
// site.css carries the Detroit Signal primitives the Calendar reuses from the
// homepage: tokens, type voices, header/nav/Submit, the WHEN / WHERE / WHAT /
// SEARCH board, the departure-board stream, the footer and the sheets. The
// homepage does not link the file yet — it still renders from its own
// inline <style>, untouched — so the two copies must not drift. Every
// section of site.css (between its @shared-from / @end-shared markers) must
// appear in index.html's <style> character for character.
//
// Run: node test/site-css-shared.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const read = (f) => fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");

const css = read("site.css");
const home = read("index.html");
const homeStyle = home.slice(home.indexOf("<style>"), home.indexOf("</style>"));

const sections = [...css.matchAll(/\/\* @shared-from index\.html — ([^*]+?) \*\/\n([\s\S]*?)\n\/\* @end-shared \*\//g)];
assert.strictEqual(sections.length, 5, "five shared sections: tokens/header, board, stream, footer, sheets");
for (const [, name, body] of sections) {
  assert.ok(body.trim().length > 200, `${name}: not empty`);
  assert.ok(homeStyle.includes(body), `site.css "${name}" no longer matches index.html's inline rules verbatim — change both together`);
}
// Nothing outside the markers but the header comment.
const outside = css.replace(/\/\* @shared-from[\s\S]*?\/\* @end-shared \*\//g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
assert.strictEqual(outside, "", "site.css holds only verbatim homepage sections");

// The tokens the PO locked are the live ones.
assert.ok(/--c-music:#8C78FF;/.test(css) && /--c-fest:#FF4266;/.test(css), "the corrected category colours (2026-10-04)");
assert.ok(/--font-display:'Archivo'/.test(css), "Archivo 62/900 as the display voice");

// Who links it.
assert.ok(/<link rel="stylesheet" href="\/site\.css">\s*<style>/.test(read("calendar.html")), "calendar.html links /site.css just before its own <style>");
assert.ok(!/href="\/site\.css"/.test(home), "index.html does not link /site.css in this slice (the live homepage is unchanged)");
// Calendar does not re-declare the tokens (one source of truth on that page).
const calStyle = (() => { const h = read("calendar.html"); return h.slice(h.indexOf("<style>"), h.indexOf("</style>")); })();
assert.ok(!/:root\s*\{/.test(calStyle), "calendar.html declares no :root tokens of its own");
const vercel = JSON.parse(read("vercel.json"));
assert.ok(!(vercel.rewrites || []).some((r) => r.source === "/site.css"), "no rewrite shadows /site.css");

console.log(`site-css-shared: ok (${sections.length} sections match index.html verbatim; Calendar links it, the homepage does not yet)`);
