// test/homepage-header-layout.test.js — the homepage header (Homepage V2).
//
// HISTORY. On 2026-10-01 a ninth nav link wrapped search + Submit Event onto
// a second row at every desktop width (fixed 2026-10-03: no wrap above 900px,
// the nav free to shrink, the actions group never shrinks). Homepage V2
// (2026-10-10) replaced the nine links with the seven of the approved layout
// — Events, Calendar, Map, Venues, Neighborhoods, On the Radar, About — and
// folds them behind a menu button at 900px and below, so the wordmark,
// search and Submit stay on one row at every width.
//
// This repo's tests run in Node with no browser, so layout itself is
// measured elsewhere (Chromium screenshots at 1280, 768, 390 and 320). What
// this file pins is every rule and piece of markup the layout depends on,
// the list of nav links, and that every link goes somewhere that exists.
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

// --- 1. The header row: one row at every width ---
{
  const base = rule("header.site");
  assert.ok(base.includes("display:flex") && base.includes("justify-content:space-between") && base.includes("align-items:center"), "header.site is a centred, space-between flex row");
  const small = media("(max-width:900px)");
  assert.ok(/header\.site\{[^}]*flex-wrap:nowrap/.test(small), "at 900px and below the header row does not wrap: wordmark, search and Submit stay on one row");
}
console.log("PASS: the header is one row at 900px and below (the nav folds behind the menu button)");

// --- 2. The nav: free to shrink, wraps its own links, never pushes the actions off ---
{
  const nav = rule(".site-nav");
  assert.ok(nav.includes("display:flex") && nav.includes("flex-wrap:wrap"), "the nav wraps its own links when it has to");
  assert.ok(nav.includes("min-width:0"), "the nav may shrink below its one-line width");
  const actions = rule(".site-actions");
  assert.ok(actions.includes("flex-shrink:0"), "search + Submit never shrink");
}
console.log("PASS: the nav can shrink; search + Submit Event never do");

// --- 3. The menu: hidden above 900px, a button at 900px and below ---
{
  assert.ok(/(^|\})\s*\.nav-toggle\s*\{\s*display:\s*none;\s*\}/.test(css), "no menu button on desktop");
  const small = media("(max-width:900px)");
  assert.ok(/\.nav-toggle\{display:flex;\}/.test(squash(small)), "the menu button shows at 900px and below");
  assert.ok(/\.site-nav\{[^}]*display:none/.test(squash(small)) && /\.site-nav\.open\{display:flex;\}/.test(squash(small)), "the nav is a dropdown there, opened by the button");
  assert.ok(css.includes("@media (max-width:560px)") && /\.submit-btn \.sb-label\{display:none;\}/.test(css.replace(/\s+/g, " ")), "on a phone Submit collapses to its + mark; the accessible name stays");
}
console.log("PASS: the menu button exists exactly where the nav folds");

// --- 4. The markup the layout depends on ---
{
  const header = html.match(/<header class="site">([\s\S]*?)<\/header>/)[1].replace(/<!--[\s\S]*?-->/g, "");
  const order = [...header.matchAll(/<(h1|nav|div)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(/^<h1>$/.test(order[0]), "first: the logo");
  assert.ok(/^<nav class="site-nav" id="siteNav"/.test(order[1]), "second: the nav");
  assert.ok(/^<div class="site-actions">$/.test(order[2]), "third: the search + Submit group");
  const group = header.slice(header.indexOf(order[2]));
  assert.ok(group.indexOf('id="navSearchBtn"') !== -1 && group.indexOf('id="navSearchBtn"') < group.indexOf('class="submit-btn"') && group.indexOf('class="submit-btn"') < group.indexOf('id="navToggle"'), "search, then Submit Event, then the menu button");
  assert.ok(/aria-label="Submit an event"/.test(group) && /<span class="sb-label">Submit Event<\/span>/.test(group), "Submit keeps an accessible name and its label");
  assert.ok(/id="navToggle" aria-expanded="false" aria-controls="siteNav"/.test(group), "the menu button says what it controls and whether it is open");
  assert.ok(/<img src="\/assets\/wordmark\.svg" alt="313\.events" height="26"/.test(header), "the logo is the approved 26px wordmark asset, unchanged");

  const nav = header.match(/<nav class="site-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  const links = [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[2], m[1]]);
  assert.deepStrictEqual(links, [["Events", "/"], ["Calendar", "calendar.html"], ["Map", "map.html"], ["Venues", "venues.html"], ["Neighborhoods", "neighborhoods.html"], ["On the Radar", "radar.html"], ["About", "about.html"]]);
  for (const [, href] of links) if (href !== "/") assert.ok(fs.existsSync(`${REPO_DIR}/${href}`), `${href} exists — no dead navigation links`);
  assert.ok(/<a class="submit-btn" href="submit\.html"/.test(group) && fs.existsSync(`${REPO_DIR}/submit.html`), "Submit Event goes to the submit page");
}
console.log("PASS: header markup — wordmark, nav of seven real destinations, then search, Submit Event and the menu button");

// --- 5. The page's layout width ---
{
  assert.ok(/max-width:1\d{3}px/.test(rule(".wrap")), ".wrap still sets the page column width");
}
console.log("PASS: the page column keeps its max width");

console.log("\nAll homepage header layout tests passed.");
