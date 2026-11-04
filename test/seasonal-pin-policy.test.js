// test/seasonal-pin-policy.test.js — owner direction Nov 4: unverified places stay in Grid/List; only a verified entrance or official
// coordinates earns a map pin. A Census address-point is a candidate, not proof of the visitor entrance. Coverage text stays accurate.
"use strict";
const assert = require("assert");
const path = require("path");
const mk = (id, loc) => ({ id, name: id, city: "Detroit", region: "MI", categories: [], status: "PUBLISHED", summary: "s", website: "https://example.org", image: { src: "/a.jpg", illustrative: false, credit: "c" }, loc });
const v = mk("v", { status: "verified", lat: 42.3, lng: -83.0 });
const a = mk("a", { status: "address-point", lat: 42.4, lng: -83.1, entrance: null });
const u = mk("u", { status: "unresolved" });
// The collections module treats exactly the objects in published-entries.js as projected; register ours before it loads.
const PE = require(path.join(__dirname, "..", "seasonal/published-entries.js"));
PE.t = [v, a, u]; PE.t2 = [a, u];
const R = require(path.join(__dirname, "..", "seasonal/render.js"));
assert.strictEqual(R.hasPin(v), true, "verified coordinates earn a pin");
assert.strictEqual(R.hasPin(a), false, "an address-point does not");
assert.strictEqual(R.hasPin(u), false, "unresolved does not");
const col = { slug: "t", title: "T", titleLines: ["T"], subtitle: "s", categories: [], entries: [v, a, u] };
assert.deepStrictEqual(R.coverage(col, {}), { shown: 3, pinned: 1, unresolved: 2 }, "coverage counts only verified pins");
const none = Object.assign({}, col, { slug: "t2", entries: [a, u] });
const html = R.results(none, { view: "map" });
assert.ok(/No destinations are on the map yet; 2 locations still being verified/.test(html), "zero pins is stated plainly");
assert.ok(!/Showing 0 of/.test(html), "no 'Showing 0 of' wording");
console.log("ok seasonal-pin-policy");
