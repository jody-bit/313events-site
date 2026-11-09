// STORY-028: the /media page is accurate to the approved kit, its downloads exist and are valid,
// and it is linked from About and every footer.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const html = read("media.html");

// 1. Public contact, labelled, and nothing unsupported.
assert.ok(/<strong>Media contact:<\/strong> <a href="mailto:jody@sentientproductions\.com">/.test(html), "labelled media contact");
const emails = new Set(html.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []);
assert.deepStrictEqual([...emails], ["jody@sentientproductions.com"], "only the public contact email appears");
assert.ok(!/founded|launched|monthly visitors|partner(ship)?s? with/i.test(html.replace(/public event sources/gi, "")), "no launch date, traffic or partnership claims");
const bios = read("assets/media/313-events-bios.txt");
const shortBio = bios.split("SHORT BIO\n")[1].split("\n\nLONG BIO")[0].trim();
assert.ok(html.includes(shortBio), "short bio matches the approved text");

// 2. Every local download/image exists and is non-empty; ZIP and PDF are the real formats.
const refs = [...html.matchAll(/(?:href|src)="(\/assets\/media\/[^"]+)"/g)].map((m) => m[1]);
assert.ok(refs.length >= 10, "download and preview references present");
refs.forEach((r) => assert.ok(fs.statSync(path.join(ROOT, r)).size > 0, r + " exists"));
assert.strictEqual(fs.readFileSync(path.join(ROOT, "assets/media/313-events-media-kit.zip")).slice(0, 2).toString(), "PK", "ZIP signature");
assert.strictEqual(fs.readFileSync(path.join(ROOT, "assets/media/313-events-press-kit.pdf")).slice(0, 5).toString(), "%PDF-", "PDF signature");
[...html.matchAll(/<img\b[^>]*>/g)].forEach((m) => assert.ok(/ alt="[^"]+"/.test(m[0]), "image has alt text: " + m[0].slice(0, 60)));
[...html.matchAll(/<a href="\/assets\/media\/[^"]+" download>([^<]*)<\/a>/g)].forEach((m) => assert.ok(m[1].trim().length > 5, "download link has descriptive text"));

// 3. Responsive, routed, and linked from About and every footer.
assert.ok(/name="viewport"/.test(html) && /<main id="main">/.test(html), "viewport and main landmark");
assert.ok(/"source": "\/media",\s*"destination": "\/media.html"/.test(read("vercel.json")), "/media rewrite");
const footerPages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && /class="footer-links"/.test(read(f)) && f !== "media.html");
assert.ok(footerPages.includes("about.html"));
footerPages.forEach((f) => assert.ok(/<a href="\/media">Media<\/a>/.test(read(f)), f + ": footer links to /media"));
assert.ok(/class="footer-links"/.test(html) && /<a href="\/media">Media<\/a>/.test(html), "media page footer");
console.log("PASS: media page copy, downloads and links (" + footerPages.length + " footers)");
