// test/public-delivery.test.js — what the site delivers to the public (MKT-005).
// 1) Internal documents are not deployed: .vercelignore keeps root Markdown, project records, tests, the RA inbox
//    and SQL notes out of the static output, and never lists anything the functions need at runtime.
// 2) Delivered pages and scripts carry no development-tool branding.
// Names of AI crawlers in robots.txt notes are deliberately avoided on public pages; internal code comments,
// environment variable names and the private repository records are out of scope here.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const lines = fs.readFileSync(path.join(root, ".vercelignore"), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
for (const need of ["/*.md", "/assets/**/*.md", "/project/", "/test/", "/ra-sync/", "/supabase/", "/smoke/"]) {
  assert(lines.includes(need), `.vercelignore must list ${need}`);
}
// Runtime dependencies of the functions stay deployed (vercel.json includeFiles and api/_lib requires).
for (const keep of ["scripts", "data", "seasonal", "assets", "api", "event-template.html", "venue-template.html"]) {
  assert(!lines.some((l) => l.replace(/^\/|\/$/g, "") === keep), `.vercelignore must not list ${keep}`);
}

// Delivered text: every root page and script, the manifest, and the page assets.
const BRAND = /claude|chatgpt|gemini|openai|anthropic|gptbot|google-extended|codex\b/i;
const files = fs.readdirSync(root).filter((f) => /\.(html|js|json|webmanifest|txt|xml)$/.test(f) && !/^(package(-lock)?)\.json$/.test(f));
const bad = [];
for (const f of files) {
  const m = fs.readFileSync(path.join(root, f), "utf8").match(BRAND);
  if (m) bad.push(`${f}: ${m[0]}`);
}
// Text files under assets/ are deployed too (images are skipped); Markdown there is ignored by .vercelignore.
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir + "/" + e.name;
    if (e.isDirectory()) walk(rel);
    else if (/\.(html|js|css|json|svg|txt|xml|webmanifest)$/.test(e.name)) {
      const m = fs.readFileSync(path.join(root, rel), "utf8").match(BRAND);
      if (m) bad.push(`${rel}: ${m[0]}`);
    }
  }
})("assets");
assert.deepStrictEqual(bad, [], "development-tool branding on delivered files: " + bad.join("; "));
console.log("ok (public delivery: " + files.length + " delivered files checked)");
