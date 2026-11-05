// The owner-released public collection pages: three fixed slugs, no review banner, indexable, canonical; anything else is 404.
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path");
const h = require("../api/seasonal-collection.js");
function call(c, method) { const r = { h: {}, setHeader(k, v) { this.h[k] = v; }, end(b) { this.b = b; } }; h({ method: method || "GET", query: { c } }, r); return r; }
["fall", "outside-the-ordinary", "off-the-beaten-orbit"].forEach((s) => {
  const r = call(s);
  assert.strictEqual(r.statusCode, 200, s);
  assert.ok(!/PREVIEW FOR OWNER REVIEW|noindex|\(Preview\)/.test(r.b), s + ": no review banner, noindex or (Preview)");
  assert.ok(r.b.includes('rel="canonical" href="https://313.events/' + s + '"'), s + ": canonical");
});
assert.strictEqual(call("nope").statusCode, 404);
assert.strictEqual(call(undefined).statusCode, 404);
assert.strictEqual(call("fall", "POST").statusCode, 404);
const v = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
const dest = (src) => (v.rewrites.find((x) => x.source === src) || {}).destination;
assert.strictEqual(dest("/fall"), "/api/seasonal-collection?c=fall");
assert.strictEqual(dest("/outside-the-ordinary"), "/api/seasonal-collection?c=outside-the-ordinary");
assert.strictEqual(dest("/off-the-beaten-orbit"), "/api/seasonal-collection?c=off-the-beaten-orbit");
assert.strictEqual(dest("/halloween"), "/halloween.html", "/halloween untouched");
assert.strictEqual(dest("/fall-color"), "/fall-color.html", "/fall-color untouched");
console.log("ok seasonal-collection-public");
