#!/usr/bin/env node
// scripts/build-seasonal.js — writes fall.html, halloween.html, fall-color.html
// from seasonal/collections.js via seasonal/render.js. Output is committed so
// the pages are static and crawlable; seasonal/page.js only enhances them.
//   node scripts/build-seasonal.js          write files
//   node scripts/build-seasonal.js --check  exit 1 if committed files are stale
"use strict";
const fs = require("fs");
const path = require("path");
const DATA = require("../seasonal/collections.js");
const R = require("../seasonal/render.js");
const root = path.join(__dirname, "..");
const FILES = { fall: "fall.html", halloween: "halloween.html", "fall-color": "fall-color.html" };

function page(col) {
  const url = "https://313.events" + col.route;
  const t = col.title + " — 313.events";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${R.esc(t)}</title>
<link rel="canonical" href="${url}">
<meta name="description" content="${R.esc(col.metaDescription)}">
<link rel="icon" type="image/svg+xml" href="/assets/icons/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32x32.png">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62,700;62,900&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<meta name="theme-color" content="#0A0A0A">
<meta property="og:type" content="website">
<meta property="og:title" content="${R.esc(t)}">
<meta property="og:description" content="${R.esc(col.metaDescription)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="313.events">
<meta property="og:image" content="https://313.events${col.hero.desktop}">
<link rel="stylesheet" href="/seasonal/seasonal.css">
</head>
<body data-collection="${col.slug}">
<div class="sc-page">
${R.header()}
<main id="scMain">
${R.main(col)}
</main>
${R.footer()}
</div>
<script src="/seasonal/collections.js"></script>
<script src="/seasonal/render.js"></script>
<script src="/seasonal/page.js"></script>
</body>
</html>
`;
}

// Gate item 3, file half: a PUBLISHED entry's image must exist on disk and match
// the size and sha256 recorded in image.acquired. A URL or a recorded license
// without a downloaded, validated file does not pass.
function validateAssets() {
  const crypto = require("crypto");
  const problems = [];
  for (const slug of DATA.ORDER) {
    for (const e of DATA.COLLECTIONS[slug].entries) {
      if (e.status !== "PUBLISHED") continue;
      const a = e.image && e.image.acquired;
      if (!a) { problems.push(slug + "/" + e.id + ": PUBLISHED without image.acquired"); continue; }
      const f = path.join(root, a.file);
      if (!fs.existsSync(f)) { problems.push(slug + "/" + e.id + ": image file missing " + a.file); continue; }
      const buf = fs.readFileSync(f);
      if (buf.length !== a.bytes) problems.push(slug + "/" + e.id + ": size " + buf.length + " != recorded " + a.bytes);
      if (crypto.createHash("sha256").update(buf).digest("hex") !== a.sha256) problems.push(slug + "/" + e.id + ": sha256 mismatch");
    }
  }
  return problems;
}

const check = process.argv.includes("--check");
if (require.main === module) {
  const problems = validateAssets();
  if (problems.length) { console.error("asset validation failed:\n" + problems.join("\n")); process.exit(1); }
}
let stale = [];
for (const slug of require.main === module ? DATA.ORDER : []) {
  const out = path.join(root, FILES[slug]);
  const html = page(DATA.COLLECTIONS[slug]);
  if (check) { if (!fs.existsSync(out) || fs.readFileSync(out, "utf8") !== html) stale.push(FILES[slug]); }
  else fs.writeFileSync(out, html);
}
if (require.main === module && check && stale.length) { console.error("stale: " + stale.join(", ")); process.exit(1); }
module.exports = { page, FILES, validateAssets };
