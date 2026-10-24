// Home, calendar, map and event pages expose one <main id="main"> and a skip link that targets it.
const assert = require("assert");
const fs = require("fs");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const read = (f) => fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
for (const f of ["index.html", "calendar.html", "map.html", "event-template.html"]) {
  const html = read(f);
  assert.strictEqual((html.match(/<main\b/g) || []).length, 1, f + ": exactly one <main>");
  assert.ok(/<main id="main" tabindex="-1">/.test(html), f + ": main is #main and focusable");
  assert.ok(html.indexOf("</main>") < html.indexOf('<footer class="site">'), f + ": main closes before the footer");
  assert.ok(html.indexOf('<main id="main"') > html.indexOf("</header>"), f + ": header stays outside main");
  const body = html.slice(html.indexOf("<body"));
  assert.ok(/^<body[^>]*>\s*<a class="skip-link" href="#main">Skip to content<\/a>/.test(body), f + ": skip link is the first element");
  assert.ok(/\.skip-link:focus\{top:8px;/.test(html), f + ": skip link appears on focus");
}
console.log("page landmarks and skip link OK");
