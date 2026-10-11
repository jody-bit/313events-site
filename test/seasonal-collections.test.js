// test/seasonal-collections.test.js — seasonal collection pages: five-state
// publication gate (including the owner-photo route), renderer, image fallback chain, private editorial data,
// candidate registry, built files, routes, and the scope guard.
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
const BUILD = require(path.join(root, "scripts/build-seasonal.js"));
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const FB = require(path.join(root, "seasonal/image-fallback.js"));
const GUARD = require(path.join(root, "scripts/scope-guard.js"));
const PRIVATE = ED.allCollections(); // every record, published or not (private data)
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
// ---- 1b. owner-photo route (B2): satisfies items 3 and 4 only; never item 5; never a Creative Commons license
{
  const OWN_FILE = "/assets/seasonal/photos/halloween/halloween__eloise-asylum__westland-mi__mine-01__card.webp";
  const own = (mut) => {
    const e = complete();
    const built = ED.ownerPhotoImage("313p-73cbabcb", { acquiredAt: "2026-10-11", verifiedAt: "2026-10-11", verifiedBy: "test", recordedBy: "test", recordedAt: "2026-10-11" });
    e.image = built;
    if (mut) mut(e);
    return e;
  };
  const e0 = own();
  assert.strictEqual(e0.image.acquired.file, OWN_FILE);
  assert.ok(!("license" in e0.image) && !("licenseUrl" in e0.image), "owner authorization is not a license and carries no license URL");
  assert.strictEqual(DATA.gate(e0).imageRoute, "owner-photo");
  assert.strictEqual(DATA.gate(e0).rightsRoute, "owner-authorization");
  assert.strictEqual(DATA.readiness(e0).state, "PUBLISHED", "owner photo + official + relevance + approval is complete");
  const noApproval = own((e) => { delete e.approval; });
  assert.strictEqual(DATA.readiness(noApproval).state, "READY_FOR_REVIEW", "the owner route fills items 3 and 4 only; approval stays separate");
  assert.ok(!DATA.isPublic(noApproval));
  const noOfficial = own((e) => { e.evidence = []; });
  assert.strictEqual(DATA.readiness(noOfficial).state, "HOLD_UNVERIFIED", "an owner photo never replaces official verification or relevance");
  for (const [label, mut] of [
    ["no photo id", (e) => { delete e.image.ownerPhoto.photoId; }],
    ["malformed photo id", (e) => { e.image.ownerPhoto.photoId = "IMG_5509"; }],
    ["no review ref", (e) => { delete e.image.ownerPhoto.reviewRef; }],
    ["no authorization statement", (e) => { delete e.image.ownerPhoto.authorization.statement; }],
    ["no grantee", (e) => { delete e.image.ownerPhoto.authorization.grantee; }],
    ["no recorded-by", (e) => { delete e.image.ownerPhoto.authorization.recordedBy; }],
    ["no recorded-at", (e) => { delete e.image.ownerPhoto.authorization.recordedAt; }],
    ["no verification timestamp", (e) => { delete e.image.ownerPhoto.verifiedAt; }],
    ["no verifier", (e) => { delete e.image.ownerPhoto.verifiedBy; }],
    ["no credit", (e) => { delete e.image.credit; }]
  ]) assert.notStrictEqual(DATA.readiness(own(mut)).state, "PUBLISHED", "owner route incomplete: " + label);
  // the hash is part of the route: without the acquired record the photo does not count
  assert.notStrictEqual(DATA.readiness(own((e) => { delete e.image.acquired; })).state, "PUBLISHED");
  assert.notStrictEqual(DATA.readiness(own((e) => { e.image.acquired.sha256 = "bad"; })).state, "PUBLISHED");
  // sha256, size and pixels are computed from the real file, not typed in
  const f = ED.fileFacts(OWN_FILE);
  assert.deepStrictEqual({ b: e0.image.acquired.bytes, s: e0.image.acquired.sha256, w: e0.image.acquired.width, h: e0.image.acquired.height }, { b: f.bytes, s: f.sha256, w: f.width, h: f.height });
  assert.strictEqual(f.sha256, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, OWN_FILE))).digest("hex"));
  assert.strictEqual(f.width, 1280); assert.strictEqual(f.height, 853);
  // original photo identifiers are preserved in the private library and tied to the photo id
  const lp = ED.libraryPhoto("313p-73cbabcb");
  assert.strictEqual(lp.original.filename, "IMG_5509.HEIC");
  assert.ok(lp.original.apple_photos_uuid.toUpperCase().startsWith("73CBABCB"));
  assert.strictEqual(e0.image.ownerPhoto.authorization.statement, lp.license, "authorization wording is the library's, verbatim");
  assert.deepStrictEqual(BUILD.validateAssets({ fall: [own()] }), [], "a correct owner-photo record validates");
  const wrong = own((e) => { e.image.ownerPhoto.photoId = "313p-ffffffff"; });
  assert.ok(BUILD.validateAssets({ fall: [wrong] }).some((p) => /not in photo-library/.test(p)));
  const withUrl = own((e) => { e.image.licenseUrl = "https://creativecommons.org/licenses/by/4.0/"; });
  assert.ok(BUILD.validateAssets({ fall: [withUrl] }).some((p) => /must not carry a licenseUrl/.test(p)), "no invented license URL on an owner photo");
  // a third-party license still needs its URL (no Creative Commons without one)
  assert.strictEqual(derive((e) => { delete e.image.licenseUrl; }), "IMAGE_PENDING");
}

// file half of item 3: size + sha256 of the acquired file are validated at build time
{
  const good = complete({ id: "tmp-good" }), bad = complete({ id: "tmp-bad" });
  bad.image.acquired.sha256 = "0".repeat(64);
  const missing = complete({ id: "tmp-missing" }); missing.image.acquired.file = "/assets/seasonal/nope.webp"; missing.image.src = missing.image.acquired.file;
  assert.deepStrictEqual(BUILD.validateAssets(), [], "no problems with the shipped data");
  assert.deepStrictEqual(BUILD.validateAssets({ fall: [good] }).filter((p) => /tmp-good.*(sha256|size)/.test(p)), []);
  const problems = BUILD.validateAssets({ fall: [bad, missing] });
  assert.ok(problems.some((p) => /tmp-bad.*sha256 mismatch/.test(p)) && problems.some((p) => /tmp-missing.*missing/.test(p)), problems.join("\n"));
}

// ---- 2. shipped data (private entries): every declared status equals the derived state; nothing is public
const FORBIDDEN = /\b(hours?|admission|\$\d|tickets?|open now|open today|peak|wheelchair|accessible|\d{1,2}(am|pm|:\d\d)|oct(ober)?\.? \d)/i;
let allEntries = 0;
for (const slug of DATA.ORDER) {
  const col = PRIVATE[slug];
  assert.strictEqual(col.route, routes[slug]);
  assert.deepStrictEqual(DATA.COLLECTIONS[slug].entries, [], slug + ": the PUBLIC collections hold no unpublished records");
  const ids = new Set(), catIds = col.categories.map((c) => c.id);
  for (const e of col.entries) {
    allEntries++;
    assert.ok(!ids.has(e.id), "duplicate id " + e.id); ids.add(e.id);
    assert.ok(!e.fixture, e.id + ": fixtures are not records");
    assert.ok(DATA.STATES.includes(e.status), e.id + " has an unknown status " + e.status);
    assert.strictEqual(DATA.readiness(e).state, e.status, e.id + ": declared status must equal the derived state");
    for (const k of ["name", "city", "region", "summary"]) assert.ok(e[k], e.id + " missing " + k);
    assert.ok(e.categories.length && e.categories.every((c) => catIds.includes(c)), e.id + " bad category");
    assert.ok(!FORBIDDEN.test(e.summary), e.id + " summary states an unverified operating fact: " + e.summary);
    assert.ok(!("hours" in e) && !("admission" in e) && !("dates" in e), e.id + " carries unverified fields");
    assert.ok(!e.approval, e.id + ": no approval is recorded by this repository; only the approving person adds one");
    assert.ok(/^\//.test(e.image.src) && fs.existsSync(path.join(root, e.image.src)), e.id + " image file missing");
  }
  assert.deepStrictEqual(DATA.published(col).map((e) => e.id), col.entries.filter((e) => e.status === "PUBLISHED").map((e) => e.id));
}
assert.strictEqual(allEntries, 60, "4 fall + 52 halloween + 4 fall-color records");
// Release-candidate state: no destination has the explicit approval, so none is public.
for (const slug of DATA.ORDER) assert.strictEqual(DATA.published(PRIVATE[slug]).length, 0, slug + " has no public destinations yet");

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
  const linked = (over) => complete(Object.assign({ status: "PUBLISHED" }, over || {}, { image: Object.assign({ src: ASSET, alternates: ["/assets/seasonal/fall-card-2.webp"], illustrative: true, source: "313.events supplied collection graphic (AI-generated), cropped", credit: "313.events", license: "Supplied by 313.events" }, {
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
  assert.ok(html.includes('src="https://example.org/photo.jpg"') && html.includes('referrerpolicy="no-referrer"'), "the linked image is shown first, without a referrer");
  const chain = JSON.parse(/data-fb="([^"]*)"/.exec(html)[1].replace(/&quot;/g, '"'));
  assert.strictEqual(/data-src0="([^"]*)"/.exec(html)[1], "https://example.org/photo.jpg");
  assert.deepStrictEqual(chain, [ASSET, "/assets/seasonal/fall-card-2.webp", "/assets/placeholders/event-800.webp"], "chain after the link: card, alternate card, placeholder");
  assert.ok(html.includes('href="https://example.org/page"') && html.includes("Photo: Example Org"), "credit links to the source page");
  const css = fs.readFileSync(path.join(root, "seasonal/seasonal.css"), "utf8");
  assert.ok(html.includes("sc-illus-fb") && /\.sc-fell-back \.sc-illus-fb\{display:block\}/.test(css) && /\.sc-fell-back \.sc-credit\{display:none\}/.test(css), "the illustrative badge replaces the credit after a fallback");
  // run the shared handler (seasonal/image-fallback.js) against a stand-in image element
  for (const k of Object.keys(FB._failed)) delete FB._failed[k];
  const classes = new Set(), at = { src: "https://example.org/photo.jpg", "data-src0": "https://example.org/photo.jpg", "data-fb": JSON.stringify(chain) };
  let replaced = 0;
  const img = { parentNode: { classList: { add: (c) => classes.add(c) } }, ownerDocument: {}, getAttribute: (n) => (n in at ? at[n] : null), setAttribute: (n, v) => { at[n] = String(v); } };
  for (const want of chain) { assert.strictEqual(FB.handleFailure(img, () => replaced++), "next"); assert.strictEqual(at.src, want, "a failed source moves down the chain"); }
  assert.ok(classes.has("sc-fell-back"), "the first failure marks the card as fallen back (credit hidden)");
  assert.strictEqual(FB.handleFailure(img, () => replaced++), "placeholder");
  assert.strictEqual(replaced, 1, "after the last source the CSS placeholder replaces the image, never a broken icon");
  for (const k of Object.keys(FB._failed)) delete FB._failed[k];
}

// ---- 4. the pages as built: empty states, no unpublished content
for (const slug of DATA.ORDER) {
  const col = DATA.COLLECTIONS[slug], html = R.main(col);
  assert.strictEqual((html.match(/<h1/g) || []).length, 1);
  assert.ok(html.includes("0 of 0 destinations") && html.includes("sc-empty"), slug + " shows the existing empty state");
  assert.ok(!html.includes('class="sc-card') && !html.includes("sc-tile\""), slug + " renders no destination card");
  assert.ok(!html.includes('id="scDontMiss"') && !html.includes('id="scDiscover"'), slug + " hides Don't Miss and Discover with nothing to show");
  assert.ok(html.includes('data-cat="all" aria-pressed') && !/data-cat="(?!all)/.test(html), slug + " has only the All chip");
  for (const e of PRIVATE[slug].entries) assert.ok(!html.includes(e.name), slug + ": unpublished record leaked into the page: " + e.name);
  assert.ok(html.includes("Illustrative image") && html.includes('class="sc-hero"'), "the approved hero (labelled illustrative) is unchanged");
  assert.ok(html.includes("not only this collection") && html.includes("Open events map") && !/View on map/.test(html));
  for (const other of DATA.ORDER.filter((s) => s !== slug)) assert.ok(html.includes('href="' + routes[other] + '"'));
  const built = fs.readFileSync(path.join(root, slug + ".html"), "utf8");
  assert.ok(!/fixture/i.test(built), slug + ".html must never contain test fixtures");
}

// ---- 5. no preview-only record modes (B3): ?review=1 and ?fixtures=1 are gone; ?qa=1 is the only reviewer route
{
  const pageJs = fs.readFileSync(path.join(root, "seasonal/page.js"), "utf8");
  assert.ok(!/review|fixture|__313_CONFIG|config\.js/i.test(pageJs.replace(/\/\*[\s\S]*?\*\//, "")), "page.js has no review/fixtures/config gating");
  assert.ok(pageJs.includes("/api/seasonal-qa?asset=client") && pageJs.includes('"qa"'), "?qa=1 loads the QA client from the fail-closed API");
  assert.ok(!fs.existsSync(path.join(root, "seasonal/fixtures.js")) && !fs.existsSync(path.join(root, "test/fixtures/seasonal-fixtures.js")), "no fixtures module is shipped");
  for (const f of ["collections.js", "render.js", "image-fallback.js"]) {
    const t = fs.readFileSync(path.join(root, "seasonal", f), "utf8");
    assert.ok(!/withReview|withFixtures|includeReview|includeFixtures/.test(t), f + " carries no review/fixture mode");
  }
  assert.strictEqual(DATA.withReview, undefined); assert.strictEqual(DATA.withFixtures, undefined);
  for (const slug of DATA.ORDER) assert.ok(!/Review only|REVIEW PREVIEW|TEST FIXTURES/.test(R.main(DATA.COLLECTIONS[slug])));
}

// ---- 5b. mobile: the narrow-phone rules that removed the 320px overflow stay in the stylesheet
{
  const css = fs.readFileSync(path.join(root, "seasonal/seasonal.css"), "utf8");
  assert.ok(/@media \(max-width:359px\)\{\.sc-section-head\{flex-wrap:wrap\}\.sc-views\{flex-wrap:wrap;max-width:100%\}\}/.test(css), "320px: the Explore header wraps");
  assert.ok(/\.sc-card-title\{[^}]*overflow-wrap:anywhere/.test(css) && /\.sc-grid\.sc-list\{grid-template-columns:1fr\}/.test(css), "long titles wrap; list view is one column");
  assert.ok(/\.sc-qa-line[^{]*\{[^}]*overflow-wrap:anywhere/.test(css), "QA lines wrap long URLs");
}

// ---- 6. candidate registry (private): all 252 rows preserved, ledger = five-state vocabulary, none public
const reg = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/candidates.json"), "utf8")).candidates;
const counts = { fall: 71, halloween: 52, "fall-color": 129 };
assert.strictEqual(reg.length, 252);
for (const slug of DATA.ORDER) {
  const rows = reg.filter((c) => c.collection === slug), col = PRIVATE[slug];
  assert.strictEqual(rows.length, counts[slug], slug + " inventory rows tracked");
  assert.ok(rows.every((c) => DATA.STATES.includes(c.status) && c.reason), "every candidate has a ledger status and a reason");
  const withEntry = rows.filter((c) => c.entry_id);
  assert.deepStrictEqual(withEntry.map((c) => c.entry_id).sort(), col.entries.map((e) => e.id).sort(), slug + ": every private entry is linked from the registry");
  for (const c of withEntry) assert.strictEqual(c.status, DATA.readiness(col.entries.find((e) => e.id === c.entry_id)).state, c.entry_id + " registry status equals derived state");
  assert.deepStrictEqual(rows.filter((c) => c.status === "PUBLISHED").map((c) => c.entry_id).sort(), DATA.published(col).map((e) => e.id).sort());
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

// ---- 8. scope guard (B4): deterministic base (origin/main), explicit allow-list, loud on missing evidence
// Unit tests for the guard itself are in test/scope-guard.test.js. Here the real branch is checked.
{
  const r = GUARD.check({ cwd: root }); // throws (fails this test) if origin/main is unavailable or the diff is empty
  assert.deepStrictEqual(r.violations, [], "protected files changed outside the allow-list: " + r.violations.join(", "));
  assert.ok(r.changed.length > 0);
}
console.log("seasonal-collections: ok");
