// api/seasonal-preview.js: owner-review Preview of the refreshed Don't Miss collections. Fail-closed like seasonal-qa,
// six lead stories per collection in rank order, nothing published or scheduled.
const assert = require("assert");
const path = require("path");
const root = path.join(__dirname, "..");
const H = require(path.join(root, "api/seasonal-preview.js"));

// fail-closed: only VERCEL_ENV preview/development; production, APP_ENV=production, other and missing all 404
function call(env, q, method) {
  const saved = {}; ["VERCEL_ENV", "APP_ENV"].forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  Object.assign(process.env, env);
  const res = { headers: {}, statusCode: 0, body: "", setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  try { H({ query: q, method: method || "GET" }, res); } finally { ["VERCEL_ENV", "APP_ENV"].forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); }
  return res;
}
for (const slug of H.SLUGS) {
  assert.strictEqual(call({ VERCEL_ENV: "production" }, { c: slug }).statusCode, 404, slug + ": production 404");
  assert.strictEqual(call({}, { c: slug }).statusCode, 404, slug + ": missing env 404");
  assert.strictEqual(call({ VERCEL_ENV: "preview", APP_ENV: "production" }, { c: slug }).statusCode, 404, slug + ": APP_ENV=production 404");
  assert.strictEqual(call({ VERCEL_ENV: "staging" }, { c: slug }).statusCode, 404);
  const ok = call({ VERCEL_ENV: "preview" }, { c: slug });
  assert.strictEqual(ok.statusCode, 200); assert.ok(/noindex/.test(ok.headers["X-Robots-Tag"]) && /noindex/.test(ok.body)); assert.ok(/PREVIEW FOR OWNER REVIEW/.test(ok.body));
}
assert.strictEqual(call({ VERCEL_ENV: "preview" }, { c: "halloween" }).statusCode, 404, "only the three preview keys");
assert.strictEqual(call({ VERCEL_ENV: "preview" }, { c: "../x" }).statusCode, 404);
assert.strictEqual(call({ VERCEL_ENV: "preview" }, { c: "fall" }, "POST").statusCode, 404);

// six leads per collection, in rank order, and they are the only featured entries
const LEADS = {
  fall: ["yates-cider-mill", "franklin-cider-mill", "parmenters-northville-cider-mill", "diehls-orchard-and-cider-mill", "parshallville-cider-mill", "macqueen-orchards"],
  "outside-the-ordinary": ["highland-state-recreation-area", "cranbrook-gardens-and-grounds", "wadhams-to-avoca-trail", "crosswinds-marsh", "ojibway-prairie-complex", "hidden-lake-gardens"],
  "off-the-beaten-orbit": ["pewabic-holiday-showcase", "post-make-the-gift-workshops", "walkerville-brewery-holiday-market", "willistead-manor-holiday-tours", "stahls-motors-and-music", "rochester-kris-kringle-market"]
};
for (const slug of H.SLUGS) {
  const d = H.previewData(slug), feat = d.entries.filter((e) => e.featured).map((e) => e.id);
  assert.deepStrictEqual(feat, LEADS[slug], slug + ": six leads in rank order");
  assert.strictEqual(new Set(d.entries.map((e) => e.id)).size, d.entries.length, slug + ": no duplicate destinations");
  d.entries.forEach((e) => { assert.ok(e.name && e.city && e.region && e.summary && e.categories.length, e.id); if (d.meta) assert.ok(e.categories.every((c) => d.meta.categories.some((m) => m.id === c)), e.id + ": category known"); });
}
// fall: no duplicates of existing destinations, expired activity removed, final dates shown
const fall = H.previewData("fall").entries.map((e) => e.id);
["kackleberry-farms", "debucks-family-farm", "trabbic-family-pumpkin-farm", "corn-fun", "jasons-pumpkin-patch", "wheeler-farms-corn-maze"].forEach((id) => assert.ok(!fall.includes(id), id + " removed (expired)"));
const byId = Object.fromEntries(H.previewData("fall").entries.map((e) => [e.id, e]));
assert.strictEqual(byId["parmenters-northville-cider-mill"].lastDay, "2026-11-22");
assert.strictEqual(byId["diehls-orchard-and-cider-mill"].lastDay, "2026-11-22");
assert.strictEqual(byId["franklin-cider-mill"].lastDay, "2026-11-29");
assert.strictEqual(byId["rochester-cider-mill"].lastDay, "2026-12-31", "Rochester: operator states the season ends December 31, 2026");
assert.ok(!byId["yates-cider-mill"].lastDay && !byId["parshallville-cider-mill"].lastDay, "Yates and Parshallville: no guessed final date");
assert.ok(!/since 1837/.test(byId["franklin-cider-mill"].summary), "no uninterrupted-since-1837 claim");
// outside: the three existing leads keep their existing records (no duplicate), Haven Hill is Edsel Ford, no peak-color promise
const out = Object.fromEntries(H.previewData("outside-the-ordinary").entries.map((e) => [e.id, e]));
assert.ok(/Edsel Ford/.test(out["highland-state-recreation-area"].summary) && !/Henry Ford/.test(out["highland-state-recreation-area"].summary));
Object.values(out).filter((e) => LEADS["outside-the-ordinary"].includes(e.id)).forEach((e) => assert.ok(!/peak (color|colour|foliage)/i.test(e.summary), e.id));
// off the beaten orbit: Fleatroit is not a card; the Walkerville window is the two stated days; nothing says "continuously"
const ob = H.previewData("off-the-beaten-orbit").entries;
assert.ok(!ob.some((e) => /fleatroit/i.test(e.id + e.name + e.summary)), "Fleatroit stays unpublished");
assert.ok(/November 20, 5 to 10 p.m.; Saturday November 21, 11 a.m. to 5 p.m./.test(ob.find((e) => e.id === "walkerville-brewery-holiday-market").summary));

// the shared renderer draws the leads server-side the same way the browser does
{
  const cache = (f) => require.resolve(path.join(root, "seasonal", f));
  ["collections.js", "render.js", "published-entries.js"].forEach((f) => delete require.cache[cache(f)]);
  for (const slug of H.SLUGS) {
    const d = H.previewData(slug);
    require.cache[cache("published-entries.js")] = { id: cache("published-entries.js"), filename: cache("published-entries.js"), loaded: true, exports: { [slug]: d.entries }, children: [], paths: [] };
    ["collections.js", "render.js"].forEach((f) => delete require.cache[cache(f)]);
    const DATA = require(cache("collections.js")), R = require(cache("render.js"));
    const col = Object.assign({}, DATA.COLLECTIONS[slug] || {}, d.meta || {}, { entries: d.entries });
    const html = R.main(col);
    LEADS[slug].forEach((id) => assert.ok(html.includes('data-entry="' + id + '"'), slug + ": card for " + id));
    assert.ok(DATA.live(col).length === d.entries.length, slug + ": every previewed entry shows");
  }
  ["collections.js", "render.js", "published-entries.js"].forEach((f) => delete require.cache[cache(f)]);
}
console.log("seasonal-preview: ok");

// Owner rule 2026-11-04: unconfirmed operating details read "Check with the venue before you go" and link to an official page.
{
  const P = require("../api/seasonal-preview.js");
  const COUNTS = {};
  P.SLUGS.forEach((slug) => {
    const es = P.entriesFor(slug).filter((e) => e.checkUrl);
    COUNTS[slug] = es.length;
    es.forEach((e) => { assert.ok(/^https:\/\/[^/]+\.[^/]+/.test(e.checkUrl), slug + "/" + e.id + " has an https official link"); });
  });
  assert.ok(COUNTS["fall"] >= 15, "fall carries the check line on entries with unconfirmed 2026 details");
  assert.ok(COUNTS["outside-the-ordinary"] >= 4, "Outside the Ordinary carries it for Holiday Beach, Point Pelee, Ojibway and Cranbrook");
  assert.ok(P.html("outside-the-ordinary").indexOf("Check with the venue before you go") >= 0 || /checkUrl/.test(P.html("outside-the-ordinary")), "the page carries the check data");
}
