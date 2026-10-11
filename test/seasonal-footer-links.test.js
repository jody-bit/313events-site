// test/seasonal-footer-links.test.js — the generated seasonal pages (fall, halloween, fall-color) keep the
// sitewide legal/contact footer navigation, including the Photo Credits link and the business contact email.
// scripts/build-seasonal.js regenerates these pages from seasonal/render.js, so a build can otherwise drop links silently.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const BUSINESS = "jody@sentientproductions.com";
const EXPECTED = [
  ["/about", "About"],
  ["/accessibility", "Accessibility"],
  ["/editorial-policy", "Editorial Policy"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/copyright", "Copyright / DMCA"],
  ["/copyright#photo-credits", "Photo Credits"],
  ["mailto:" + BUSINESS, "Contact"],
];

for (const page of ["fall.html", "halloween.html", "fall-color.html"]) {
  const html = read(page);
  const nav = (html.match(/<p class="sc-footer-links">([\s\S]*?)<\/p>/) || [])[1];
  assert.ok(nav, page + ": has the footer navigation");
  const links = [...nav.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
  assert.deepStrictEqual(links, EXPECTED, page + ": footer links are exactly the approved set, in order");
  assert.ok(!/gmail\.com/i.test(html), page + ": no personal email address");
}

// The credits anchor the footer points at exists and lists exactly the seven neighbourhood photographs.
const copy = read("copyright.html");
const section = copy.slice(copy.indexOf('id="photo-credits"'));
const list = section.slice(section.indexOf("<ul"), section.indexOf("</ul>"));
const items = list.match(/<li class="legal-li">/g) || [];
assert.strictEqual(items.length, 7, "photo-credits list has seven attribution records");
for (const area of ["Downtown", "Eastern Market", "Midtown", "North Corktown", "Mexicantown", "Old Redford", "Fitzgerald-Marygrove"]) {
  assert.ok(list.includes("<strong>" + area), "credit for " + area);
}
console.log("seasonal footer links ok");
