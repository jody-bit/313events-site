// test/brand-typography-wordmark.test.js -- Brand consistency Phase 1.
//
// Pins the Detroit Signal V2.1 DISPLAY voice (Archivo, width 62%, weight 900)
// and the approved SVG wordmark on every page that has the shared site chrome.
// Guards: no Archivo Narrow font request, exactly one Archivo request (no
// duplicates) that carries wdth 62 + wght 900, Inter and Space Mono kept, no
// CSS-text wordmark, display rules use the token, the token has a fallback
// stack, and the approved SVG assets are byte-for-byte untouched.
//
// Run: node test/brand-typography-wordmark.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const crypto = require("crypto");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const read = (f) => fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");

const PAGES = [
  "index.html", "fall.html", "fall-color.html", "halloween.html",
  "about.html", "accessibility.html", "calendar.html", "copyright.html",
  "editorial-policy.html", "event-template.html", "install.html", "map.html",
  "neighborhoods.html", "privacy.html", "radar.html", "sources.html", "submit.html",
  "terms.html", "venue-template.html", "venues.html",
];

for (const f of PAGES) {
  const html = read(f);
  const links = html.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/g) || [];
  assert.strictEqual(links.length, 1, `${f}: exactly one Google Fonts stylesheet request`);
  const href = links[0];
  assert.ok(!/Archivo\+Narrow/.test(href), `${f}: must not request Archivo Narrow`);
  assert.strictEqual((href.match(/family=Archivo[:&]/g) || []).length, 1, `${f}: one Archivo family`);
  assert.ok(/family=Archivo:wdth,wght@62,700;62,900/.test(href), `${f}: Archivo wdth 62 / wght 900 requested`);
  assert.ok(/family=Inter:wght@400;500;600;700/.test(href), `${f}: Inter preserved`);
  assert.ok(/family=Space\+Mono:wght@400;700/.test(href), `${f}: Space Mono preserved`);

  // No leftover Archivo Narrow *declarations* for display (the fallback in the token is allowed).
  const bad = html.split("\n").filter((l) => /font-family:[^;]*'Archivo Narrow'/.test(l) && !/--font-display/.test(l));
  assert.deepStrictEqual(bad, [], `${f}: display rules must use the Archivo token, not Archivo Narrow`);

  // CSS-text wordmark approximation is gone.
  assert.ok(!/wordmark-dot/.test(html), `${f}: no CSS-dot wordmark`);
  assert.ok(!/class="wordmark"[^>]*>\s*313\.events/.test(html), `${f}: no text wordmark`);

  if (f === "index.html" || /^(fall|fall-color|halloween)\.html$/.test(f)) continue;
  // Secondary pages: token defined with fallback stack and used with width 62% + weight 900.
  assert.ok(/--font-display:'Archivo','Archivo Narrow',-apple-system,sans-serif;/.test(html), `${f}: --font-display token + fallback`);
  assert.ok(/font-family:var\(--font-display\);font-stretch:62%;font-weight:900/.test(html), `${f}: display rule uses 62% / 900`);
  assert.ok(!/font-stretch:62%;font-weight:(?!900)/.test(html), `${f}: display weight must be 900`);
  // Wordmark pages that render a header brand use the approved asset at the approved height.
  if (/class="wordmark"/.test(html)) {
    assert.ok(/<a class="wordmark" href="\/"><img src="\/assets\/wordmark\.svg" alt="313\.events" height="26"><\/a>/.test(html), `${f}: approved SVG wordmark`);
  }
}

// Every page whose header links home with a brand mark must use an approved SVG.
for (const f of PAGES) {
  const html = read(f);
  for (const m of html.matchAll(/<img[^>]+src="\/assets\/(wordmark[^"]*)"/g)) {
    assert.ok(/^wordmark(-reversed)?\.svg$/.test(m[1]), `${f}: only approved wordmark assets (${m[1]})`);
  }
}
// All current secondary pages are dark (--bg:#0A0A0A): they must use wordmark.svg, never -reversed.
for (const f of PAGES) {
  assert.ok(!/assets\/wordmark-reversed\.svg/.test(read(f)), `${f}: dark page must not use the light-background variant`);
}

// Approved SVGs are locked.
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(`${REPO_DIR}/${f}`)).digest("hex");
assert.strictEqual(sha("assets/wordmark.svg"), "ac8b9c70f6d67fb4d72c88aac68ef908c94e808ff56ea049de5ab839736aa5c6", "assets/wordmark.svg must not change");
assert.strictEqual(sha("assets/wordmark-reversed.svg"), "ed689b3e04a8671721adc23a76ab86a3d20b99c59d32d118a939922a62f161ef", "assets/wordmark-reversed.svg must not change");

console.log("brand-typography-wordmark: all assertions passed");
