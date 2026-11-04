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
const park = mk("p", { status: "park-location", lat: 42.1, lng: -83.2, accessUrl: "https://example.org/access" });
PE.t = [v, a, u]; PE.t2 = [a, u]; PE.t3 = [v, park, a];
const R = require(path.join(__dirname, "..", "seasonal/render.js"));
assert.strictEqual(R.hasPin(v), true, "verified coordinates earn a pin");
assert.strictEqual(R.hasPin(a), false, "an address-point does not");
assert.strictEqual(R.hasPin(u), false, "unresolved does not");
const col = { slug: "t", title: "T", titleLines: ["T"], subtitle: "s", categories: [], entries: [v, a, u] };
assert.deepStrictEqual(R.coverage(col, {}), { shown: 3, pinned: 1, parks: 0, verified: 1, unresolved: 2 }, "coverage counts only verified pins");
const none = Object.assign({}, col, { slug: "t2", entries: [a, u] });
const html = R.results(none, { view: "map" });
assert.ok(/0 of 2 places shown on the map; the rest are in the list\./.test(html), "coverage text is computed from the data");
assert.ok(!/candidate pins are included/i.test(html), "the default view has no QA wording");
const withEntrance = mk("e", { status: "address-point", lat: 42.5, lng: -83.2, entrance: "North lot, Main St" });
assert.strictEqual(R.hasPin(withEntrance), true, "a set entrance earns a pin");
const c1 = R.coverage(Object.assign({}, col, { entries: [v, a, u] }), {});
assert.strictEqual(c1.pinned, 1, "default view: candidates never pin");
R.setQaPins(true);
assert.strictEqual(R.hasPin(a), true, "QA view draws the candidate");
assert.strictEqual(R.isCandidate(a), true, "...and marks it as a candidate");
assert.strictEqual(R.isCandidate(v), false, "verified places are not candidates");
assert.strictEqual(R.hasPin(u), false, "unresolved never pins, even in QA");
assert.ok(/2 of 3 places shown on the map.*QA view: candidate pins/.test(R.results(col, { view: "map" })), "QA view says so");
R.setQaPins(false);
assert.strictEqual(R.hasPin(a), false, "QA flag off again");
// the QA flag exists only in the Preview route and only when asked
const H = require(path.join(__dirname, "..", "api/seasonal-preview.js"));
function page(q) { process.env.VERCEL_ENV = "preview"; const res = { headers: {}, setHeader() {}, end(b) { this.body = b; } }; H({ query: q, method: "GET" }, res); return res.body || ""; }
assert.ok(!/setQaPins/.test(page({ c: "fall" })), "default Preview page has no QA call");
assert.ok(/setQaPins\(true\)/.test(page({ c: "fall", qa: "pins" })), "?qa=pins turns it on in the Preview route");
const fs = require("fs");
assert.ok(!/get\(["']qa["']\)|query\.qa/.test(fs.readFileSync(path.join(__dirname, "..", "seasonal/render.js"), "utf8")), "render.js never reads the qa parameter itself");
console.log("ok seasonal-pin-policy");

// Park location: official park coordinates as an approximate location; entrance not verified; never a directions destination.
const col3 = Object.assign({}, col, { slug: "t3", entries: [v, park, a] });
assert.strictEqual(R.hasPin(park), true, "an official park location pins");
assert.strictEqual(R.isParkLocation(park), true);
assert.strictEqual(R.isParkLocation(v), false, "a verified entrance is not a park location");
assert.strictEqual(R.isCandidate(park), false, "a park location is not a QA candidate");
assert.deepStrictEqual(R.coverage(col3, {}), { shown: 3, pinned: 2, parks: 1, verified: 1, unresolved: 1 }, "coverage distinguishes entrance pins from park locations");
const note = R.results(col3, { view: "map" });
assert.ok(/2 of 3 places shown on the map/.test(note) && /1 is an official park location \(visitor entrance not yet verified\)/.test(note) && /does not mean the park is open/.test(note), "the notice distinguishes the two");
const mv = fs.readFileSync(path.join(__dirname, "..", "seasonal/map-view.js"), "utf8");
assert.ok(/Park location \\u2014 visitor entrance not yet verified\./.test(mv), "popup carries the exact label");
assert.ok(/park \? \(access/.test(mv) && /Official access and directions/.test(mv), "a park location links to the official access page");
assert.ok(!/park[^;]*destination=/.test(mv.split("var access")[1].split("return")[0] || ""), "no directions destination for park locations");
console.log("ok park-location");
