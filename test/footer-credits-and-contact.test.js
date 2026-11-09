// test/footer-credits-and-contact.test.js — Homepage V2 release corrections.
//
// 1. Every public page's footer navigation carries a "Photo Credits" link to
//    /photo-credits, and keeps every link it had.
// 2. That anchor exists and lists all seven neighbourhood photographs with
//    creator, source link, license and the modification disclosure.
// 3. The public business contact is jody@sentientproductions.com, and no
//    personal Gmail address is in any public-facing file.
//
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const BUSINESS = "jody@sentientproductions.com";

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && f !== "admin.html");
const footerPages = pages.filter((f) => /class="footer-links"/.test(read(f)));
assert.ok(footerPages.length >= 17, `footer navigation found on the public pages (${footerPages.length})`);

// --- 1. Footer navigation ---
const NAV = [
  ["about.html", "About"],
  ["submit.html", "Submit an Event"],
  ["editorial-policy.html", "Editorial Policy"],
  ["terms.html", "Terms"],
  ["privacy.html", "Privacy"],
  ["copyright.html", "Copyright / DMCA"],
  ["accessibility.html", "Accessibility"],
  ["mailto:" + BUSINESS, "Contact"],
];
for (const f of footerPages) {
  const html = read(f);
  const nav = html.match(/<p class="footer-links">([\s\S]*?)<\/p>/)[1];
  NAV.forEach(([href, label]) => assert.ok(nav.includes(`<a href="${href}">${label}</a>`), `${f}: footer keeps "${label}" -> ${href}`));
  assert.strictEqual((nav.match(/<a href="\/photo-credits">Photo Credits<\/a>/g) || []).length, 1, `${f}: footer shows one visible "Photo Credits" link to /photo-credits`);
  // order: Copyright / DMCA, then Photo Credits, then Accessibility
  assert.ok(nav.indexOf("Copyright / DMCA") < nav.indexOf("Photo Credits") && nav.indexOf("Photo Credits") < nav.indexOf("Accessibility"), `${f}: Photo Credits sits beside Copyright / DMCA`);
}
console.log(`PASS: Photo Credits link in the footer of ${footerPages.length} pages, existing footer links intact`);

// --- 2. The credits anchor ---
{
  const rewrites = JSON.parse(read("vercel.json")).rewrites;
  assert.ok(rewrites.some((r) => r.source === "/copyright" && r.destination === "/copyright.html"), "/copyright resolves to copyright.html");
  const html = read("copyright.html");
  assert.strictEqual((html.match(/id="photo-credits"/g) || []).length, 1, "exactly one #photo-credits anchor");
  const section = html.slice(html.indexOf('id="photo-credits"'), html.indexOf('<footer class="site">'));
  assert.ok(/resized[^.]*converted to WebP/i.test(section) && /no other changes/i.test(section), "the modification disclosure is stated");
  assert.ok(/same license/i.test(section), "the CC BY-SA share-alike note is stated");
  const items = [...section.matchAll(/<li class="legal-li">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  // The first seven are the homepage neighborhood photographs. Seasonal-collection destination photographs follow them
  // (listed in #seasonal-photo-credits); each needs its creator, Commons file page and license.
  assert.ok(items.length >= 7, "at least the seven homepage photo credits");
  items.slice(7).forEach((li, i) => {
    assert.ok(/<strong>[^<]+<\/strong> &mdash; photo by [^,]+, <a href="https:\/\/commons\.wikimedia\.org\/wiki\/File:[^"]+"/.test(li), `seasonal credit ${i + 1}: creator and Commons file page`);
    assert.ok(/href="https:\/\/creativecommons\.org\/(licenses|publicdomain)\/[^"]+"/.test(li), `seasonal credit ${i + 1}: links its license`);
  });
  const expected = [
    ["Downtown", "Mikerussell", "CC BY-SA 3.0"],
    ["Eastern Market", "Michael Barera", "CC BY-SA 4.0"],
    ["Midtown", "Sailko", "CC BY 3.0"],
    ["North Corktown", "Polishdill86", "Public domain"],
    ["Mexicantown / Southwest Detroit", "Lian Chang", "CC BY 2.0"],
    ["Old Redford", "Dave Parker", "CC BY 3.0"],
    ["Fitzgerald-Marygrove", "Dwight Burdette", "CC BY 3.0"],
  ];
  expected.forEach(([place, creator, license], i) => {
    const li = items[i];
    assert.ok(li.includes(`<strong>${place}</strong>`), `${place}: listed`);
    assert.ok(li.includes(`photo by ${creator}`), `${place}: creator ${creator}`);
    assert.ok(/href="https:\/\/commons\.wikimedia\.org\/wiki\/File:[^"]+"/.test(li), `${place}: links its Commons file page`);
    assert.ok(li.includes(license), `${place}: license ${license}`);
    if (license !== "Public domain") assert.ok(/href="https:\/\/creativecommons\.org\/licenses\/[^"]+"/.test(li), `${place}: links its license`);
  });
  // every credit matches the attribution the homepage map carries
  const map = read("index.html").match(/const NEIGHBORHOOD_PHOTOS = \{[\s\S]*?\n\};/)[0];
  [...map.matchAll(/sourceUrl: '([^']+)'/g)].forEach((m) => assert.ok(html.includes(m[1]), `credits page links ${m[1]}`));
}
console.log("PASS: #photo-credits lists all seven photographs with creator, source, license and modification disclosure");

// --- 3. Public contact email ---
const PUBLIC = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", ".git", "test", "supabase", "scripts"].includes(e.name) && !e.name.startsWith(".")) walk(rel); continue; }
    if (/\.(html|js|json|xml|txt|webmanifest|svg|css)$/.test(e.name)) PUBLIC.push(rel);
  }
})("");
const PERSONAL = /[A-Za-z0-9._%+-]+@(gmail|googlemail)\.com/i;
PUBLIC.forEach((f) => assert.ok(!PERSONAL.test(read(f)), `${f}: no personal Gmail address in a public-facing file`));
// generated pages: event and venue pages are built from their templates
["event-template.html", "venue-template.html"].forEach((f) => assert.ok(read(f).includes("mailto:" + BUSINESS), `${f}: Contact is the business address`));
// every mailto: on a public page is the business address (event-submission
// forms and legal pages included); example placeholders are the only others
pages.forEach((f) => [...read(f).matchAll(/mailto:([^"'?\s>]+)/g)].forEach((m) => assert.ok(m[1] === BUSINESS || m[1] === "dmca@sentientproductions.com", `${f}: mailto ${m[1]} is a business address`)));
console.log(`PASS: public contact is ${BUSINESS}; no personal Gmail in ${PUBLIC.length} public-facing files`);
