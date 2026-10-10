// test/seasonal-collections.test.js — seasonal collection pages: publication
// gate, renderer, filters, built files, routes, and files left untouched.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const DATA = require(path.join(root, "seasonal/collections.js"));
const R = require(path.join(root, "seasonal/render.js"));

assert.deepStrictEqual(DATA.ORDER, ["fall", "halloween", "fall-color"]);
const routes = { fall: "/fall", halloween: "/halloween", "fall-color": "/fall-color" };

// publication gate
const FORBIDDEN = /\b(hours?|admission|\$\d|tickets?|open now|open today|peak|wheelchair|accessible|\d{1,2}(am|pm|:\d\d)|oct(ober)?\.? \d)/i;
for (const slug of DATA.ORDER) {
  const col = DATA.COLLECTIONS[slug];
  assert.strictEqual(col.route, routes[slug]);
  const ids = new Set(), catIds = col.categories.map((c) => c.id);
  assert.ok(DATA.published(col).length >= 1, slug + " has published content");
  for (const e of col.entries) {
    assert.ok(!ids.has(e.id), "duplicate id " + e.id); ids.add(e.id);
    if (e.status !== "published") continue;
    for (const k of ["name", "city", "region", "summary"]) assert.ok(e[k], e.id + " missing " + k);
    assert.ok(e.categories.length && e.categories.every((c) => catIds.includes(c)), e.id + " bad category");
    assert.ok(e.evidence && e.evidence.length && e.evidence.every((v) => v.level && v.note), e.id + " needs evidence");
    // image record: source, credit, license, illustrative flag; file exists
    for (const k of ["src", "source", "credit", "license"]) assert.ok(e.image[k], e.id + " image." + k);
    assert.strictEqual(typeof e.image.illustrative, "boolean");
    assert.ok(fs.existsSync(path.join(root, e.image.src)), e.id + " image file missing");
    // no unverified operating facts rendered
    assert.ok(!FORBIDDEN.test(e.summary), e.id + " summary states an unverified operating fact: " + e.summary);
    if (e.website) assert.ok(/^https:\/\//.test(e.website));
    assert.ok(!("hours" in e) && !("admission" in e) && !("dates" in e), e.id + " carries unverified fields");
  }
}

// unpublished entries never render
const fake = JSON.parse(JSON.stringify(DATA.COLLECTIONS.fall));
fake.entries.push({ id: "x", name: "SECRET CANDIDATE", city: "A", region: "MI", categories: ["cider-donuts"], status: "candidate", summary: "s", image: fake.entries[0].image, evidence: [] });
assert.ok(!R.main(fake).includes("SECRET CANDIDATE"));

// renderer: filters, search, empty state, escaping, illustrative label
const fall = DATA.COLLECTIONS.fall;
assert.strictEqual(R.visible(fall, { category: "all", query: "" }).length, 4);
assert.deepStrictEqual(R.visible(fall, { category: "fall-festivals" }).map((e) => e.id), ["wiards-orchards"]);
assert.deepStrictEqual(R.visible(fall, { category: "all", query: "northville" }).map((e) => e.id), ["parmenters-northville-cider-mill"]);
assert.ok(R.results(fall, { category: "all", query: "zzzz" }).includes("sc-empty"));
assert.strictEqual(R.esc('<a href="x">&\'</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
for (const slug of DATA.ORDER) {
  const col = DATA.COLLECTIONS[slug], html = R.main(col);
  assert.ok(html.includes("Illustrative image"), slug + " labels illustrative imagery");
  assert.strictEqual((html.match(/<h1/g) || []).length, 1);
  // only categories that have entries get a chip
  for (const c of col.categories) {
    const has = DATA.published(col).some((e) => e.categories.includes(c.id));
    assert.strictEqual(html.includes('data-cat="' + c.id + '" aria-pressed'), has, slug + " chip " + c.id);
  }
  assert.ok(!/<img(?![^>]*\balt=)/.test(html), "every img has alt");
  // external links are safe
  for (const m of html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) assert.ok(/rel="noopener noreferrer"/.test(m[0]));
  // cross links point at the other two routes
  for (const other of DATA.ORDER.filter((s) => s !== slug)) assert.ok(html.includes('href="' + routes[other] + '"'));
}

// candidate registry: every inventory row is tracked; published ones exist
const cand = JSON.parse(fs.readFileSync(path.join(root, "seasonal/candidates.json"), "utf8")).candidates;
const counts = { fall: 71, halloween: 52, "fall-color": 129 };
for (const slug of DATA.ORDER) {
  const rows = cand.filter((c) => c.collection === slug);
  assert.strictEqual(rows.length, counts[slug], slug + " inventory rows tracked");
  assert.ok(rows.every((c) => c.status === "published" || (c.status === "unresolved" && c.reason)), "every candidate has a status and reason");
  const pubIds = rows.filter((c) => c.status === "published").map((c) => c.published_id).sort();
  assert.deepStrictEqual(pubIds, DATA.published(DATA.COLLECTIONS[slug]).map((e) => e.id).sort(), slug + " registry matches published");
  // image diversity: no image reused across published destinations
  const srcs = DATA.published(DATA.COLLECTIONS[slug]).map((e) => e.image.src);
  assert.strictEqual(new Set(srcs).size, srcs.length, slug + " reuses a card image");
}
// the general events map is never presented as a seasonal map
for (const slug of DATA.ORDER) {
  const html = R.main(DATA.COLLECTIONS[slug]);
  assert.ok(html.includes("not only this collection") && html.includes("Open events map"));
  assert.ok(!/View on map/.test(html));
}

// built pages are in sync and routed
execFileSync(process.execPath, [path.join(root, "scripts/build-seasonal.js"), "--check"]);
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
for (const [slug, route] of Object.entries(routes)) {
  const rule = vercel.rewrites.find((r) => r.source === route);
  assert.ok(rule && rule.destination === "/" + slug + ".html", "rewrite for " + route);
  const page = fs.readFileSync(path.join(root, slug + ".html"), "utf8");
  assert.ok(page.includes('rel="canonical" href="https://313.events' + route + '"'));
  assert.ok(page.includes('data-collection="' + slug + '"'));
}

// scope guard: Homepage V2 / ingestion / admin untouched by this change
let changed = "";
try { changed = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { cwd: root, encoding: "utf8" }); } catch (e) { changed = ""; }
for (const f of changed.split("\n").filter(Boolean)) {
  assert.ok(!/^(index\.html|admin\.html|api\/|assets\/guides\/)/.test(f), "out-of-scope file changed: " + f);
}
console.log("seasonal-collections: ok");
