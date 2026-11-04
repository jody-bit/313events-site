// social-links.test.js: the footer social row. Guards: every page with a .footer-social loads the include; only valid https links on
// the network's own domain render; Facebook/TikTok stay hidden until the owner supplies verified URLs (never invented).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const SL = require("../social-links.js");
const root = path.join(__dirname, "..");

// 1. every page with a footer-social row loads the include
const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
let withRow = 0;
for (const f of pages) {
  const h = fs.readFileSync(path.join(root, f), "utf8");
  if (!/footer-social/.test(h)) continue;
  withRow++;
  assert(/<script src="\/social-links\.js" defer><\/script>/.test(h), f + " has footer-social but does not load /social-links.js");
}
assert(withRow >= 16, "expected at least 16 pages with a footer-social row, found " + withRow);

// 2. shipped list: Instagram only until owner-verified URLs exist
const shown = SL.LINKS.filter(SL.valid).map((l) => l.key);
assert.deepStrictEqual(shown, ["instagram"], "only Instagram may render until Facebook/TikTok URLs are supplied; got " + shown);
assert(SL.html().includes("Follow 313.events"));

// 3. a full list renders all three with safe link attributes
const full = [
  { key: "instagram", label: "Instagram", url: "https://www.instagram.com/x/", host: /(^|\.)instagram\.com$/ },
  { key: "facebook", label: "Facebook", url: "https://www.facebook.com/x", host: /(^|\.)facebook\.com$/ },
  { key: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@x", host: /(^|\.)tiktok\.com$/ }
];
const out = SL.html(full);
assert.strictEqual((out.match(/<a /g) || []).length, 3);
assert.strictEqual((out.match(/rel="noopener noreferrer"/g) || []).length, 3);
assert.strictEqual((out.match(/target="_blank"/g) || []).length, 3);
assert(/aria-label="313\.events on TikTok \(opens in a new tab\)"/.test(out));

// 4. bad entries are skipped: http, wrong host, lookalike host, junk, null
const bad = [
  { key: "a", label: "A", url: "http://www.facebook.com/x", host: /(^|\.)facebook\.com$/ },
  { key: "b", label: "B", url: "https://example.com/x", host: /(^|\.)facebook\.com$/ },
  { key: "c", label: "C", url: "https://facebook.com.evil.test/x", host: /(^|\.)facebook\.com$/ },
  { key: "d", label: "D", url: "not a url", host: /(^|\.)tiktok\.com$/ },
  { key: "e", label: "E", url: null, host: /(^|\.)tiktok\.com$/ }
];
assert.strictEqual(SL.html(bad), "");
console.log("social-links ok (" + withRow + " pages)");
