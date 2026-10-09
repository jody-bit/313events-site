// test/ntbm-cards.test.js
// NOT TO BE MISSED seasonal cards: the supplied images are shipped at web
// sizes, every card names its image and alt text, and no card is marked live
// unless its route can actually be served (a rewrite in vercel.json or a file).
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

const block = html.match(/const NTBM_CARDS = \[([\s\S]*?)\n\];/);
assert(block, "NTBM_CARDS is defined in index.html");
const cards = new Function(`return [${block[1]}\n]`)();
assert.strictEqual(cards.length, 3);

const expected = [
  ["/fall", "DETROIT ORBIT FALL GUIDE", "Cider mills. Pumpkin patches. Orchards. Donuts. Hayrides. Find your fall.", "EXPLORE FALL →"],
  ["/halloween", "HALLOWEEN IN THE ORBIT", "Haunts. Horror. Ghosts. Oddities. Family fun. Halloween across the Detroit Orbit.", "GET SPOOKY →"],
  ["/fall-color", "FALL COLORS", "Trails. Parks. Scenic drives. Waterfronts. Find the Detroit Orbit at peak color.", "CHASE COLOR →"],
];
cards.forEach((c, i) => {
  assert.deepStrictEqual([c.route, c.title, c.copy, c.cta], expected[i], `card ${i + 1} uses the approved copy`);
  assert(c.alt && c.alt.length > 20, `card ${i + 1} has real alt text`);
  for (const [w, maxKB] of [[1600, 400], [800, 150]]) {
    const f = path.join(root, `${c.image.replace(/^\//, "")}-${w}.webp`);
    assert(fs.existsSync(f), `${c.image}-${w}.webp exists`);
    assert(fs.statSync(f).size <= maxKB * 1024, `${c.image}-${w}.webp is within ${maxKB} KB`);
  }
  if (c.routeLive) {
    const served = vercel.rewrites.some((r) => r.source === c.route) || fs.existsSync(path.join(root, c.route.slice(1) + ".html"));
    assert(served, `${c.route} is marked live, so it must be served`);
  }
});
console.log("PASS: NOT TO BE MISSED cards — approved copy, optimized images, no dead links");
