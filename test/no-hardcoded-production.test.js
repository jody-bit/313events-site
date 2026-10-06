// test/no-hardcoded-production.test.js
// Guard: the production Supabase project may be named in exactly one place
// (api/_lib/environment.js, plus docs and tests). Anywhere else it would let a
// Preview/staging deployment silently use production data again.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const { PRODUCTION_SUPABASE_HOST, PRODUCTION_PUBLISHABLE_KEY } = require(path.join(root, "api/_lib/environment.js"));

const ALLOWED = new Set(["api/_lib/environment.js"]);
const SCAN_DIRS = ["", "api", "api/_lib", "scripts", ".github/scripts", ".github/workflows"];
const EXT = /\.(js|html|json|yml|yaml)$/;
const offenders = [];
for (const d of SCAN_DIRS) {
  const abs = path.join(root, d);
  for (const name of fs.readdirSync(abs)) {
    const rel = path.join(d, name);
    if (!EXT.test(name) || ALLOWED.has(rel) || !fs.statSync(path.join(root, rel)).isFile()) continue;
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    if (text.includes(PRODUCTION_SUPABASE_HOST) || text.includes(PRODUCTION_PUBLISHABLE_KEY)) offenders.push(rel);
  }
}
assert.deepStrictEqual(offenders, [], "production Supabase host/key found outside api/_lib/environment.js: " + offenders.join(", "));

// Every page that talks to Supabase loads /config.js first.
for (const page of ["index", "calendar", "map", "radar", "venues", "neighborhoods", "event-template", "venue-template"]) {
  const html = fs.readFileSync(path.join(root, page + ".html"), "utf8");
  const cfg = html.indexOf('<script src="/config.js"></script>');
  const use = html.indexOf("window.__313_CONFIG");
  assert.ok(cfg > -1 && use > -1 && cfg < use, `${page}.html must load /config.js before using window.__313_CONFIG`);
}
// Every API file that holds the service-role key guards against production-from-non-production.
for (const f of fs.readdirSync(path.join(root, "api")).filter((n) => n.endsWith(".js"))) {
  const text = fs.readFileSync(path.join(root, "api", f), "utf8");
  if (/^const SUPABASE_URL = process\.env\.SUPABASE_URL;$/m.test(text)) {
    assert.ok(text.includes("assertDatabaseAllowed(SUPABASE_URL)"), `api/${f} must call assertDatabaseAllowed(SUPABASE_URL)`);
  }
}
// Facebook posting is production-only.
assert.ok(/isProduction\(\)/.test(fs.readFileSync(path.join(root, "api/cron-post-to-facebook.js"), "utf8")));
console.log("no-hardcoded-production.test.js: all assertions passed");
