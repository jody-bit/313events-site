// test/homepage-header-layout.test.js — the homepage header stays one row
// on desktop, and search + Submit Event never drop onto a row of their own.
//
// WHAT HAPPENED. On 2026-10-01 a ninth link, Neighborhoods, was added to the
// homepage's nav (commit 07580f3). The header is a flex row of
// [logo] [nav] [search + Submit Event] inside a 1,140px container; with nine
// links 22px apart it needed about 1,164px, so at EVERY desktop width the
// last item — search + Submit Event — wrapped onto a second row, where
// justify-content:space-between put it at the far left under the logo. A
// first fix on 2026-10-03 (min-width:0 on the nav, flex-shrink:0 on the
// search + submit group) could not work: with flex-wrap:wrap a flex row
// breaks into lines BEFORE any item is allowed to shrink, and it decides
// where to break from the nav's full one-line width.
//
// THE FIX (2026-10-03, same day, later):
//   1. above the 900px breakpoint the header row does not wrap, so the
//      shrinking the first fix set up can actually happen — if the row is
//      ever too narrow, the nav wraps its own links and search + Submit
//      Event stay put;
//   2. the gap between nav links is 16px instead of 22px, so nine links fit
//      on one line again (about 1,116px of the 1,140px available), with the
//      logo and Submit Event exactly where they were when the header last
//      fitted on one row.
// At 900px and below nothing changed.
//
// This repo's tests run in Node with no browser, so layout itself cannot be
// measured here (it was, in Chromium, at 23 widths — see the commit). What
// this file does is pin every CSS rule and piece of markup the layout
// depends on, and the list of nav links the width budget was measured for,
// so none of it can be undone or outgrown quietly.
//
// Run: node test/homepage-header-layout.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, ""); // comments stripped
const squash = (s) => s.replace(/\s+/g, "");

// A top-level rule's declarations, e.g. rule("header.site").
function rule(selector, source) {
  const re = new RegExp("(?:^|[}\\s])" + selector.replace(/[.#]/g, "\\$&") + "\\s*\\{([^}]*)\\}");
  const m = (source || css).match(re);
  assert.ok(m, `no CSS rule for ${selector}`);
  return squash(m[1]);
}
// The body of an @media block.
function media(query) {
  const at = css.indexOf(`@media ${query}`);
  assert.ok(at !== -1, `no @media ${query} block`);
  let depth = 0, start = css.indexOf("{", at), i = start;
  for (; i < css.length; i++) { if (css[i] === "{") depth++; else if (css[i] === "}" && --depth === 0) break; }
  return css.slice(start + 1, i);
}

// --- 1. The header row: wraps by default (mobile/tablet), never on desktop ---
{
  const base = rule("header.site");
  assert.ok(base.includes("display:flex") && base.includes("justify-content:space-between") && base.includes("align-items:center"), "header.site is a centred, space-between flex row");
  assert.ok(base.includes("gap:16px"), "16px between logo, nav and search + submit");
  assert.ok(base.includes("flex-wrap:wrap"), "the base rule still wraps — that is what gives the nav its own row at 900px and below");

  const desktop = media("(min-width:901px)");
  assert.strictEqual(rule("header.site", desktop), "flex-wrap:nowrap;", "above 900px the header row must not wrap: this is what keeps search + Submit Event on the first row");
}
console.log("PASS: the header row wraps at 900px and below, and never above it");

// --- 2. The nav: free to shrink and wrap its own links; 16px between links ---
{
  const nav = rule(".site-nav");
  assert.ok(nav.includes("display:flex") && nav.includes("flex-wrap:wrap"), "the nav wraps its own links when it has to");
  assert.ok(nav.includes("min-width:0"), "the nav may shrink below its one-line width (otherwise nowrap would overflow instead)");
  assert.ok(/(^|;)gap:16px/.test(nav), "16px between nav links — at 22px the nine links are 24px too wide for the 1,140px header");
  assert.ok(nav.includes("row-gap:8px"), "8px between the nav's own rows when it does wrap");
}
console.log("PASS: the nav can shrink and wrap its own links; links are 16px apart");

// --- 3. 900px and below: unchanged ---
{
  const small = media("(max-width:900px)");
  assert.strictEqual(rule(".site-nav", small), "gap:14px;order:3;flex-basis:100%;", "at 900px and below the nav takes a full row of its own, under the logo and search + submit — exactly as before");
  assert.ok(!/header\.site\s*\{/.test(small), "and nothing else about the header changes there");
  // The two breakpoints meet with no gap and no overlap.
  assert.ok(css.includes("@media (min-width:901px)") && css.includes("@media (max-width:900px)"));
}
console.log("PASS: at 900px and below the header rules are exactly what they were");

// --- 4. The markup the layout depends on ---
{
  const header = html.match(/<header class="site">([\s\S]*?)<\/header>/)[1].replace(/<!--[\s\S]*?-->/g, "");
  const order = [...header.matchAll(/<(div|nav)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(/^<div>$/.test(order[0]), "first: the logo");
  assert.ok(/^<nav class="site-nav"/.test(order[1]), "second: the nav");
  assert.ok(/^<div style="[^"]*flex-shrink:0;[^"]*">$/.test(order[2]) && /display:flex/.test(order[2]), "third: the search + submit group, which never shrinks");
  const group = header.slice(header.indexOf(order[2]));
  assert.ok(group.indexOf('id="navSearchBtn"') !== -1 && group.indexOf('id="navSearchBtn"') < group.indexOf(">Submit Event</a>"), "search, then Submit Event, inside that group");
  assert.ok(/white-space:nowrap;[^"]*">Submit Event<\/a>/.test(group), "the Submit Event label never breaks in two");
  assert.ok(/<img src="\/assets\/wordmark\.svg" alt="313\.events" height="26"/.test(header), "the logo is the 26px wordmark");

  // The width budget was measured for exactly these nine links, in this
  // order (real fonts: about 1,116px of the 1,140px available on macOS,
  // about 1,126px with Linux font rendering). Adding or renaming a link
  // changes that arithmetic — re-measure before changing this list.
  const nav = header.match(/<nav class="site-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  const links = [...nav.matchAll(/<(?:a|button)\b[^>]*>([^<]+)<\/(?:a|button)>/g)].map((m) => m[1]);
  assert.deepStrictEqual(links, ["Today", "Tonight", "Tomorrow", "This Weekend", "Calendar", "Map", "Venues", "Neighborhoods", "Browse"],
    "the nav's links changed: the one-row header was measured for these nine — re-measure the header at desktop widths before changing them");
}
console.log("PASS: header markup — logo, nav, then a non-shrinking search + Submit Event group; the nine links the width was measured for");

// --- 5. The page's layout width is what the budget assumes ---
{
  assert.strictEqual(rule(".wrap"), "max-width:1180px;margin:0auto;padding:14px20px48px;", "the page column is 1,180px with 20px padding: a 1,140px header");
}
console.log("PASS: the header's container is still 1,140px wide at desktop widths");

console.log("\nAll homepage header layout tests passed.");
