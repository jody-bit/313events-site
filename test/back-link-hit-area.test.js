// "All events" back-link: painted ~19.5px tall (13px font) + ::after inset must reach a 44px hit height.
"use strict";
const assert = require("assert"), fs = require("fs");
const dir = process.env.REPO_DIR || process.cwd();
let n = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
  const m = fs.readFileSync(`${dir}/${f}`, "utf8").match(/\.back-link::after\{[^}]*inset:-(\d+)px -\d+px/);
  if (!m) continue; n++;
  assert.ok(19.5 + 2 * Number(m[1]) >= 44, f + ": back-link hit height " + (19.5 + 2 * m[1]) + "px < 44");
}
assert.ok(n >= 10, "expected the back-link rule on 10+ pages, found " + n);
console.log("back-link-hit-area ok (" + n + " pages)");
