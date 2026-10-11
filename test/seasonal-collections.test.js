// test/seasonal-collections.test.js — seasonal collection pages: five-state
// publication gate, renderer, isolated test fixtures, candidate registry,
// built files, routes, and files left untouched.
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const DATA = require(path.join(root, "seasonal/collections.js"));
const R = require(path.join(root, "seasonal/render.js"));
const FX = require(path.join(root, "seasonal/fixtures.js"));
const BUILD = require(path.join(root, "scripts/build-seasonal.js"));
const clone = (o) => JSON.parse(JSON.stringify(o));

assert.deepStrictEqual(DATA.ORDER, ["fall", "halloween", "fall-color"]);
assert.deepStrictEqual(DATA.STATES, ["HOLD_UNVERIFIED", "CONTENT_VERIFIED", "IMAGE_PENDING", "READY_FOR_REVIEW", "PUBLISHED"]);
const routes = { fall: "/fall", halloween: "/halloween", "fall-color": "/fall-color" };

// A complete record, built from a real file on disk, for gate tests only.
const ASSET = "/assets/seasonal/fall-card-1.webp";
const assetBuf = fs.readFileSync(path.join(root, ASSET));
function complete(over) {
  return Object.assign({
    id: "t1", name: "Test Cider Mill", city: "Testville", region: "MI", categories: ["cider-donuts"], featured: true,
    status: "PUBLISHED", summary: "A test record.", website: "https://example.org/",
    relevance: { confirmed: true, note: "Sells cider on site.", checkedAt: "2026-10-12", checkedBy: "editor" },
    evidence: [{ level: "official", note: "Read the official site.", url: "https://example.org/", websiteChecked: true, checkedAt: "2026-10-12", checkedBy: "editor" }],
    image: { src: ASSET, source: "Official photo", sourcePage: "https://example.org/photo", credit: "Photographer", license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/", rightsVerifiedAt: "2026-10-12", illustrative: false,
      acquired: { file: ASSET, bytes: assetBuf.length, sha256: crypto.createHash("sha256").update(assetBuf).digest("hex"), width: 640, height: 427, acquiredAt: "2026-10-12" } },
    approval: { by: "Product Owner", at: "2026-10-13" }
  }, over || {});
}
function derive(mut) { const e = complete(); mut(e); return DATA.readiness(e).state; }

// ---- 1. the five-state gate: every requirement is individually necessary
assert.strictEqual(DATA.readiness(complete()).state, "PUBLISHED");
assert.ok(DATA.isPublic(complete()));
const cases = [
  ["no official evidence", (e) => { e.evidence = []; }, "HOLD_UNVERIFIED"],
  ["inventory+search evidence only", (e) => { e.evidence = [{ level: "inventory+search", note: "n", url: null, websiteChecked: false }]; }, "HOLD_UNVERIFIED"],
  ["official evidence not actually checked", (e) => { e.evidence[0].websiteChecked = false; }, "HOLD_UNVERIFIED"],
  ["official evidence without a date", (e) => { delete e.evidence[0].checkedAt; }, "HOLD_UNVERIFIED"],
  ["official evidence without a reviewer", (e) => { delete e.evidence[0].checkedBy; }, "HOLD_UNVERIFIED"],
  ["official evidence url not https", (e) => { e.evidence[0].url = "http://example.org"; }, "HOLD_UNVERIFIED"],
  ["relevance not confirmed", (e) => { e.relevance.confirmed = false; }, "HOLD_UNVERIFIED"],
  ["relevance absent", (e) => { delete e.relevance; }, "HOLD_UNVERIFIED"],
  ["image never started", (e) => { e.image = { src: "/x.webp", illustrative: false }; }, "CONTENT_VERIFIED"],
  ["only a photo URL (not acquired)", (e) => { delete e.image.acquired; delete e.image.license; delete e.image.licenseUrl; }, "IMAGE_PENDING"],
  ["license recorded but no downloaded asset", (e) => { delete e.image.acquired; }, "IMAGE_PENDING"],
  ["asset acquired but src differs from acquired file", (e) => { e.image.src = "/assets/seasonal/fall-card-2.webp"; }, "IMAGE_PENDING"],
  ["asset acquired but sha256 malformed", (e) => { e.image.acquired.sha256 = "abc"; }, "IMAGE_PENDING"],
  ["asset marked illustrative", (e) => { e.image.illustrative = true; }, "CONTENT_VERIFIED"],
  ["rights: no license", (e) => { delete e.image.license; }, "IMAGE_PENDING"],
  ["rights: no attribution", (e) => { delete e.image.credit; }, "IMAGE_PENDING"],
  ["rights: no license url", (e) => { delete e.image.licenseUrl; }, "IMAGE_PENDING"],
  ["rights: not verified", (e) => { delete e.image.rightsVerifiedAt; }, "IMAGE_PENDING"],
  ["no explicit approval", (e) => { delete e.approval; }, "READY_FOR_REVIEW"],
  ["approval without a name", (e) => { e.approval = { at: "2026-10-13" }; }, "READY_FOR_REVIEW"]
];
for (const [label, mut, expected] of cases) assert.strictEqual(derive(mut), expected, label);
// A declared PUBLISHED status cannot bypass the gate, and a fixture is never public.
for (const [label, mut] of cases) {
  const e = complete(); mut(e);
  assert.ok(!DATA.isPublic(e), "declared PUBLISHED but incomplete is not public: " + label);
  const col = clone(DATA.COLLECTIONS.fall); col.entries = [e];
  assert.ok(!R.main(col).includes("Test Cider Mill"), "does not render: " + label);
}
assert.ok(!DATA.isPublic(complete({ fixture: true })), "a complete fixture is still not public");
assert.ok(!DATA.isPublic(complete({ status: "READY_FOR_REVIEW" })), "only declared PUBLISHED is public");
// file half of item 3: size + sha256 of the acquired file are validated at build time
{
  const fall = DATA.COLLECTIONS.fall, good = complete({ id: "tmp-good" }), bad = complete({ id: "tmp-bad" });
  bad.image.acquired.sha256 = "0".repeat(64);
  const missing = complete({ id: "tmp-missing" }); missing.image.acquired.file = "/assets/seasonal/nope.webp"; missing.image.src = missing.image.acquired.file;
  assert.deepStrictEqual(BUILD.validateAssets(), [], "no problems with the shipped data");
  fall.entries.push(good); assert.deepStrictEqual(BUILD.validateAssets(), []); fall.entries.pop();
  fall.entries.push(bad, missing);
  const problems = BUILD.validateAssets(); fall.entries.length -= 2;
  assert.ok(problems.some((p) => /tmp-bad.*sha256 mismatch/.test(p)) && problems.some((p) => /tmp-missing.*missing/.test(p)), problems.join("\n"));
}

// ---- 2. shipped data: every declared status equals the derived state; nothing is public
const FORBIDDEN = /\b(hours?|admission|\$\d|tickets?|open now|open today|peak|wheelchair|accessible|\d{1,2}(am|pm|:\d\d)|oct(ober)?\.? \d)/i;
for (const slug of DATA.ORDER) {
  const col = DATA.COLLECTIONS[slug];
  assert.strictEqual(col.route, routes[slug]);
  const ids = new Set(), catIds = col.categories.map((c) => c.id);
  for (const e of col.entries) {
    assert.ok(!ids.has(e.id), "duplicate id " + e.id); ids.add(e.id);
    assert.ok(!e.fixture, e.id + ": fixtures never live in collections.js");
    assert.ok(DATA.STATES.includes(e.status), e.id + " has an unknown status " + e.status);
    assert.strictEqual(DATA.readiness(e).state, e.status, e.id + ": declared status must equal the derived state");
    for (const k of ["name", "city", "region", "summary"]) assert.ok(e[k], e.id + " missing " + k);
    assert.ok(e.categories.length && e.categories.every((c) => catIds.includes(c)), e.id + " bad category");
    assert.ok(!FORBIDDEN.test(e.summary), e.id + " summary states an unverified operating fact: " + e.summary);
    assert.ok(!("hours" in e) && !("admission" in e) && !("dates" in e), e.id + " carries unverified fields");
    if (e.status === "PUBLISHED") {
      assert.ok(((e.image.acquired && !e.image.illustrative) || e.image.remote) && e.approval, e.id + " published without an acquired or linked image, or approval");
      assert.ok(fs.existsSync(path.join(root, e.image.src)), e.id + " image file missing");
    }
  }
  assert.deepStrictEqual(DATA.published(col).map((e) => e.id), col.entries.filter((e) => e.status === "PUBLISHED").map((e) => e.id));
  const srcs = DATA.published(col).map((e) => e.image.src);
  assert.strictEqual(new Set(srcs).size, srcs.length, slug + " reuses a card image");
}
// Release-candidate state: no destination has completed editorial review, so none is public.
for (const slug of DATA.ORDER) assert.strictEqual(DATA.published(DATA.COLLECTIONS[slug]).length, 0, slug + " has no public destinations yet");

// ---- 3. renderer behaviour, exercised on complete synthetic records
const fall = clone(DATA.COLLECTIONS.fall);
const mk = (id, name, city, cats, over) => complete(Object.assign({ id, name, city, categories: cats }, over || {}));
fall.entries = [
  mk("a", "Alpha Mill", "Northville", ["cider-donuts"]),
  mk("b", "Beta Farm", "Armada", ["farm-experiences"], { featured: false, website: undefined }),
  mk("c", "Gamma Fair", "Dexter", ["fall-festivals"], { featured: false }),
  mk("d", "Delta <script>", "Milford", ["cider-donuts", "farm-experiences"], { featured: false, summary: "A & B \"quoted\"" })
];
assert.strictEqual(R.visible(fall, { category: "all", query: "" }).length, 4);
assert.deepStrictEqual(R.visible(fall, { category: "fall-festivals" }).map((e) => e.id), ["c"]);
assert.deepStrictEqual(R.visible(fall, { category: "all", query: "northville" }).map((e) => e.id), ["a"]);
assert.ok(R.results(fall, { category: "all", query: "zzzz" }).includes("sc-empty"));
assert.strictEqual(R.esc('<a href="x">&\'</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
{
  const html = R.main(fall);
  assert.ok(!html.includes("<script>") && html.includes("Delta &lt;script&gt;"), "names are escaped");
  assert.strictEqual((html.match(/class="sc-card"/g) || []).length, 4 + 1, "four explore cards plus one featured in Don't Miss");
  assert.ok(/class="sc-card sc-card-row"/.test(R.results(fall, { view: "list" })), "list view");
  for (const c of fall.categories) assert.strictEqual(html.includes('data-cat="' + c.id + '" aria-pressed'), fall.entries.some((e) => e.categories.includes(c.id)));
  assert.ok(!/<img(?![^>]*\balt=)/.test(html), "every img has alt");
  for (const m of html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) assert.ok(/rel="noopener noreferrer"/.test(m[0]));
  assert.ok(!/Illustrative image<\/span><\/div>/.test(html), "acquired images are not labelled illustrative");
}

// ---- 3b. linked images (owner decision 2026-10-11): the link is shown, the generated card is the fallback
{
  const linked = (over) => complete(Object.assign({ status: "PUBLISHED" }, over || {}, { image: Object.assign({ src: ASSET, illustrative: true, source: "313.events supplied collection graphic (AI-generated), cropped", credit: "313.events", license: "Supplied by 313.events" }, {
    remote: Object.assign({ src: "https://example.org/photo.jpg", sourcePage: "https://example.org/page", credit: "Example Org", acceptedBy: "Owner", acceptedAt: "2026-10-11", riskNote: "Owner accepted the risk." }, (over && over.remote) || {}) }) }));
  const state = (e) => DATA.readiness(e).state;
  const noApproval = (e) => { delete e.approval; return e; };
  assert.strictEqual(state(noApproval(linked())), "READY_FOR_REVIEW", "a linked image satisfies the image items, not approval");
  assert.strictEqual(state(linked()), "PUBLISHED");
  for (const [what, fix] of [["no link", (r) => { delete r.src; }], ["link not https", (r) => { r.src = "http://example.org/p.jpg"; }], ["no source page", (r) => { delete r.sourcePage; }],
    ["no credit", (r) => { delete r.credit; }], ["no recorded acceptance", (r) => { delete r.acceptedBy; }], ["no acceptance date", (r) => { delete r.acceptedAt; }], ["no risk note", (r) => { delete r.riskNote; }]]) {
    const e = linked(); fix(e.image.remote);
    assert.strictEqual(state(e), "IMAGE_PENDING", "linked image incomplete: " + what);
  }
  const noFallback = linked(); noFallback.image.src = "https://example.org/x.webp";
  assert.notStrictEqual(state(noFallback), "PUBLISHED", "the fallback must be a local generated card");
  const noOfficial = linked(); noOfficial.evidence = [];
  assert.strictEqual(state(noOfficial), "HOLD_UNVERIFIED", "a linked image never replaces official verification");
  // rendering: link first, fallback in the handler, credit linked, badge only after a failure
  const col = clone(DATA.COLLECTIONS.fall); col.entries = [linked({ id: "l1", name: "Linked Mill", categories: ["cider-donuts"] })];
  const html = R.main(col);
  assert.ok(html.includes('src="https://example.org/photo.jpg"') && html.includes('referrerpolicy="no-referrer"'));
  assert.ok(html.includes('data-fallback="' + ASSET + '"') && html.includes("onerror="), "the generated card is the fallback");
  assert.ok(html.includes('href="https://example.org/page"') && html.includes("Photo: Example Org"), "credit links to the source page");
  assert.ok(html.includes("sc-illus-fb") && /\.sc-fell-back \.sc-illus-fb\{display:block\}/.test(fs.readFileSync(path.join(root, "seasonal/seasonal.css"), "utf8")), "the illustrative badge appears only after a fallback");
  // the handler itself, run against a stand-in image element
  const attr = /onerror="([^"]*)"/.exec(html)[1].replace(/&#39;/g, "'");
  const classes = new Set();
  const img = { onerror: () => {}, src: "https://example.org/photo.jpg", parentNode: { classList: { add: (c) => classes.add(c) } }, getAttribute: (n) => (n === "data-fallback" ? ASSET : null) };
  new Function("this_", "with (this_) {" + attr.replace(/this/g, "this_") + "}")(img);
  assert.strictEqual(img.src, ASSET, "a broken link swaps in the generated card");
  assert.ok(classes.has("sc-fell-back") && img.onerror === null, "and marks the card, once");
  assert.ok(BUILD.validateAssets, "build validates fallbacks");
}

// ---- 4. the pages as built: empty states, no unpublished content
for (const slug of DATA.ORDER) {
  const col = DATA.COLLECTIONS[slug], html = R.main(col);
  assert.strictEqual((html.match(/<h1/g) || []).length, 1);
  assert.ok(html.includes("0 of 0 destinations") && html.includes("sc-empty"), slug + " shows the existing empty state");
  assert.ok(!html.includes('class="sc-card') && !html.includes("sc-tile\""), slug + " renders no destination card");
  assert.ok(!html.includes('id="scDontMiss"') && !html.includes('id="scDiscover"'), slug + " hides Don't Miss and Discover with nothing to show");
  assert.ok(html.includes('data-cat="all" aria-pressed') && !/data-cat="(?!all)/.test(html), slug + " has only the All chip");
  for (const e of col.entries) assert.ok(!html.includes(e.name), slug + ": HOLD record leaked into the page: " + e.name);
  assert.ok(html.includes("Illustrative image") && html.includes('class="sc-hero"'), "the approved hero (labelled illustrative) is unchanged");
  assert.ok(html.includes("not only this collection") && html.includes("Open events map") && !/View on map/.test(html));
  for (const other of DATA.ORDER.filter((s) => s !== slug)) assert.ok(html.includes('href="' + routes[other] + '"'));
  const built = fs.readFileSync(path.join(root, slug + ".html"), "utf8");
  assert.ok(!/fixture/i.test(built), slug + ".html must never contain test fixtures");
}

// ---- 5. test fixtures: invented, labelled, isolated
for (const slug of DATA.ORDER) {
  const fx = FX.forCollection(slug), col = DATA.COLLECTIONS[slug], catIds = col.categories.map((c) => c.id);
  assert.ok(fx.length >= 3);
  assert.ok(fx.every((f) => f.fixture === true && f.id.startsWith("fixture-") && f.name.startsWith("FIXTURE:") && f.city === "Fixtureville"));
  assert.ok(fx.every((f) => f.categories.every((c) => catIds.includes(c)) && fs.existsSync(path.join(root, f.image.src))));
  assert.ok(fx.every((f) => !f.approval && !f.evidence.length && f.status === "FIXTURE"), "fixtures carry no verification, rights or approval");
  assert.ok(fx.some((f) => f.featured) && fx.some((f) => !f.featured), "fixtures exercise the rail and the grid");
  if (slug === "fall") assert.ok(fx.some((f) => f.name.length > 60), "a long name exercises wrapping");
  assert.ok(fx.every((f) => !DATA.isPublic(f)), "a fixture is never public");
  assert.strictEqual(DATA.published(col).length, 0, "production collection unaffected by fixtures module");
  const withFx = DATA.withFixtures(col, fx), html = R.main(withFx);
  assert.strictEqual(DATA.published(withFx).length, fx.length);
  assert.ok(html.includes("TEST FIXTURES") && html.includes("Test fixture"), "fixtures are visibly labelled");
  assert.ok(R.main(col).indexOf("TEST FIXTURES") < 0, "the real page has no banner");
  assert.strictEqual(col.includeFixtures, undefined, "withFixtures returns a copy");
  assert.strictEqual(DATA.withFixtures(col, [{ id: "x", name: "not a fixture" }]).entries.length, col.entries.length, "non-fixture records are never merged in");
  assert.strictEqual(R.visible(withFx, { category: fx[0].categories[0] }).length >= 1, true);
}
// page.js merges fixtures only in a non-production environment, and fails closed.
{
  const src = fs.readFileSync(path.join(root, "seasonal/page.js"), "utf8");
  function runPage(search, configEnv) {
    const scripts = [], els = {};
    const el = (id) => (els[id] = els[id] || { id, innerHTML: "", textContent: "", value: "", setAttribute() {}, getAttribute: () => null });
    const sandbox = {
      URLSearchParams, history: { replaceState() {} },
      location: { search, pathname: "/fall" },
      document: {
        body: { getAttribute: () => "fall" },
        getElementById: el, querySelectorAll: () => [], addEventListener() {},
        createElement: () => ({}), head: { appendChild(s) { scripts.push(s); } }
      }
    };
    sandbox.window = sandbox; sandbox.SeasonalCollections = DATA; sandbox.SeasonalRender = R;
    vm.createContext(sandbox); vm.runInContext(src, sandbox);
    const requested = [];
    // answer each script request in order, like a browser would
    while (scripts.length) {
      const s = scripts.shift(); requested.push(s.src);
      if (s.src === "/config.js") { if (configEnv !== "error") sandbox.__313_CONFIG = configEnv === "missing" ? undefined : { environment: configEnv }; s.onload(); }
      else if (s.src === "/seasonal/fixtures.js") { sandbox.SeasonalFixtures = FX; s.onload(); }
    }
    return { requested, results: els.scResults ? els.scResults.innerHTML : "", main: els.scMain ? els.scMain.innerHTML : "" };
  }
  const plain = runPage("", "preview");
  assert.deepStrictEqual(plain.requested, [], "no fixtures flag: nothing is requested");
  assert.ok(plain.results.includes("sc-empty") && !plain.main.includes("FIXTURE"));
  const prod = runPage("?fixtures=1", "production");
  assert.deepStrictEqual(prod.requested, ["/config.js"], "production: config is read and fixtures are never requested");
  assert.ok(!prod.main.includes("FIXTURE") && !prod.results.includes("FIXTURE") && prod.results.includes("sc-empty"));
  for (const bad of ["missing", "error", "weird"]) {
    const r = runPage("?fixtures=1", bad);
    assert.ok(!r.requested.includes("/seasonal/fixtures.js") && !r.main.includes("FIXTURE"), "fails closed when config is " + bad);
  }
  const preview = runPage("?fixtures=1", "preview");
  assert.deepStrictEqual(preview.requested, ["/config.js", "/seasonal/fixtures.js"]);
  assert.ok(preview.main.includes("TEST FIXTURES") && preview.results.includes("FIXTURE: Example Cider Mill"), "preview with the flag merges the labelled fixtures");
}

// ---- 6. candidate registry: all 252 rows preserved, none public
const reg = JSON.parse(fs.readFileSync(path.join(root, "seasonal/candidates.json"), "utf8")).candidates;
const counts = { fall: 71, halloween: 52, "fall-color": 129 };
assert.strictEqual(reg.length, 252);
for (const slug of DATA.ORDER) {
  const rows = reg.filter((c) => c.collection === slug), col = DATA.COLLECTIONS[slug];
  assert.strictEqual(rows.length, counts[slug], slug + " inventory rows tracked");
  assert.ok(rows.every((c) => DATA.STATES.includes(c.status) && c.reason), "every candidate has a ledger status and a reason");
  const withEntry = rows.filter((c) => c.published_id);
  assert.deepStrictEqual(withEntry.map((c) => c.published_id).sort(), col.entries.map((e) => e.id).sort(), slug + ": every entry is linked from the registry");
  for (const c of withEntry) assert.strictEqual(c.status, DATA.readiness(col.entries.find((e) => e.id === c.published_id)).state, c.published_id + " registry status equals derived state");
  assert.deepStrictEqual(rows.filter((c) => c.status === "PUBLISHED").map((c) => c.published_id).sort(), DATA.published(col).map((e) => e.id).sort());
}
assert.strictEqual(reg.filter((c) => c.status === "PUBLISHED").length, 0);

// ---- 7. built pages in sync, routed, homepage cards link to them
execFileSync(process.execPath, [path.join(root, "scripts/build-seasonal.js"), "--check"]);
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const dm = JSON.parse(fs.readFileSync(path.join(root, "data/dont-miss.json"), "utf8")).placements;
assert.deepStrictEqual(dm.map((p) => p.href), ["/fall", "/halloween", "/fall-color"]);
for (const [slug, route] of Object.entries(routes)) {
  const rule = vercel.rewrites.find((r) => r.source === route);
  assert.ok(rule && rule.destination === "/" + slug + ".html", "rewrite for " + route);
  const page = fs.readFileSync(path.join(root, slug + ".html"), "utf8");
  assert.ok(page.includes('rel="canonical" href="https://313.events' + route + '"'));
  assert.ok(page.includes('data-collection="' + slug + '"'));
}

// ---- 8. scope guard: ingestion / admin / the guide artwork untouched by the release candidate
// Measured against the approved Homepage V2 branch (the RC's base); skipped when that ref is not available.
// index.html and data/dont-miss.json are intentionally changed by the RC (the three Don't Miss card links).
let changed = "";
try { changed = execFileSync("git", ["diff", "--name-only", "origin/claude/homepage-v2...HEAD"], { cwd: root, encoding: "utf8" }); } catch (e) { changed = ""; }
for (const f of changed.split("\n").filter(Boolean)) {
  assert.ok(!/^(admin\.html|api\/|assets\/guides\/[^/]*\.webp|supabase\/migrations\/)/.test(f), "out-of-scope file changed: " + f);
}
console.log("seasonal-collections: ok");
