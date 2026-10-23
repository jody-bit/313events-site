// REL-5 G1/G2: GA4 covers event and venue pages, and sends only from production hostnames.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
const SNIPPET = /<!-- Google tag \(gtag\.js\)[^\n]*-->\n<script>\n([\s\S]*?)\n<\/script>\n/;

const tagged = [];
for (const f of pages) {
  const html = fs.readFileSync(path.join(root, f), "utf8");
  if (!/G-1078BKN0M3/.test(html)) continue;
  tagged.push(f);
  // No page may load gtag.js directly from markup: the loader must sit behind the hostname check.
  assert.ok(!/<script[^>]*src="https:\/\/www\.googletagmanager\.com/.test(html), `${f}: gtag.js must be loaded only by the guarded snippet`);
  assert.ok(SNIPPET.test(html), `${f}: guarded gtag snippet missing or altered`);
  assert.ok(!/gtag\(\s*['"]event['"]/.test(html), `${f}: no custom events in this change`);
}
assert.ok(!tagged.includes("admin.html"), "admin.html stays untagged");
for (const need of ["index.html", "calendar.html", "map.html", "submit.html", "event-template.html", "venue-template.html"]) {
  assert.ok(tagged.includes(need), `${need} must carry GA4`);
}

// Every copy is byte-identical so the guard cannot drift page to page.
const bodies = new Set(tagged.map((f) => fs.readFileSync(path.join(root, f), "utf8").match(SNIPPET)[1]));
assert.strictEqual(bodies.size, 1, "all pages share one identical guarded snippet");
const code = [...bodies][0];

function run(hostname) {
  const appended = [];
  const calls = [];
  const sandbox = {
    location: { hostname },
    document: { createElement: () => ({}), head: { appendChild: (el) => appended.push(el) } },
    Date,
  };
  sandbox.window = sandbox; // browsers: window is the global object
  vm.createContext(sandbox);
  vm.runInContext(code + "\n;this.__dl = window.dataLayer;", sandbox);
  for (const a of sandbox.__dl) calls.push(Array.from(a));
  return { loaded: appended.map((e) => e.src), calls: JSON.stringify(calls) };
}

for (const h of ["313.events", "www.313.events"]) {
  const r = run(h);
  assert.deepStrictEqual(r.loaded, ["https://www.googletagmanager.com/gtag/js?id=G-1078BKN0M3"], `${h} loads gtag.js`);
  assert.ok(r.calls.includes('"config","G-1078BKN0M3"'), `${h} configures the property`);
}
for (const h of ["localhost", "127.0.0.1", "313events-site-git-claude-exp-subm-732b90-jody-tyree-s-projects.vercel.app", "313events-site-jody-tyree-s-projects.vercel.app", "313.events.evil.example", "evil313.events", ""]) {
  const r = run(h);
  assert.deepStrictEqual(r.loaded, [], `${h || "(empty host)"} must not load gtag.js`);
  assert.strictEqual(r.calls, "[]", `${h || "(empty host)"} must not send any gtag call`);
}
console.log("ga4-production-guard: all assertions passed");
