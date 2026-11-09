// An entry that falls back to its own 313.events event page (no official website) is excluded from every collection
// consumer until that exact event is readable in events_public; fail closed on absent / rejected / error. Mocked fetch only.
const assert = require("assert");
const path = require("path");
const root = path.join(__dirname, "..");
const ID = "c66d10e1-960b-4d8c-a4dd-d5650a346c8b", OTHER = "11111111-2222-3333-4444-555555555555";
const NOEL = "fleatroit-carousel-noel-night-satellite-popup";
const H = require(path.join(root, "api/seasonal-preview.js"));
const EI = require(path.join(root, "event-image.js"));
const cache = (f) => require.resolve(path.join(root, "seasonal", f));

function load(slug, published) {
  const d = H.previewData(slug, published);
  require.cache[cache("published-entries.js")] = { id: cache("published-entries.js"), filename: cache("published-entries.js"), loaded: true, exports: { [slug]: d.entries }, children: [], paths: [] };
  ["collections.js", "render.js"].forEach((f) => delete require.cache[cache(f)]);
  const DATA = require(cache("collections.js")), R = require(cache("render.js"));
  const col = Object.assign({}, DATA.COLLECTIONS[slug] || {}, d.meta || {}, { entries: d.entries });
  return { DATA, R, col };
}
const state = { category: "all", query: "", view: "grid", origin: null };
function consumers({ DATA, R, col }) {
  const main = R.main(col);
  return {
    live: DATA.live(col).some((e) => e.id === NOEL),
    pub: DATA.published(col).some((e) => e.id === NOEL),
    grid: main.includes('data-entry="' + NOEL + '"'),
    results: R.results(col, state).includes(NOEL),
    link: main.includes("/event.html?id=" + ID),
    count: DATA.live(col).length,
  };
}
const cfg = { supabaseUrl: "https://example.test", supabaseAnonKey: "anon" };
async function run(fetchFn, c) {
  global.__313_CONFIG = cfg;
  let called = 0;
  EI.checkPages(c.col, fetchFn, () => { called++; });
  await new Promise((r) => setTimeout(r, 20));
  delete global.__313_CONFIG;
  return called;
}

(async () => {
  for (const published of [false, true]) {
    const tag = published ? "release overlay" : "preview data";
    // before any check: excluded from every consumer, counts agree, no link anywhere
    let c = load("off-the-beaten-orbit", published), a = consumers(c);
    assert.deepStrictEqual([a.live, a.pub, a.grid, a.results, a.link], [false, false, false, false, false], tag + ": excluded from every consumer by default");
    assert.strictEqual(c.DATA.entriesPublic(c.col), c.DATA.live(c.col).length, tag + ": counts agree");
    const base = a.count;

    // present: one anonymous request, then the card appears everywhere and the count rises by one
    const calls = [];
    c = load("off-the-beaten-orbit", published);
    let done = await run((u, o) => { calls.push([u, o]); return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: ID }]) }); }, c);
    assert.strictEqual(calls.length, 1, tag + ": checked once");
    assert.ok(calls[0][0].startsWith("https://example.test/rest/v1/events_public?select=id&id=in.(" + ID + ")"), "existing public view, ids only");
    assert.deepStrictEqual(Object.keys(calls[0][1].headers), ["apikey"], "anon key only, no credentials");
    a = consumers(c);
    assert.deepStrictEqual([done, a.live, a.pub, a.grid, a.results, a.link, a.count], [1, true, true, true, true, true, base + 1], tag + ": present shows in every consumer");

    // absent / other id / wrong shape / rejected / non-OK / bad JSON / thrown: stays excluded
    const cases = {
      absent: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
      otherId: () => Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: OTHER }]) }),
      notArray: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ id: ID }) }),
      rejected: () => Promise.reject(new Error("net")),
      http500: () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve([{ id: ID }]) }),
      badJson: () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error("bad")) }),
      throws: () => { throw new Error("sync"); },
    };
    for (const [name, fn] of Object.entries(cases)) {
      c = load("off-the-beaten-orbit", published);
      done = await run(fn, c);
      a = consumers(c);
      assert.deepStrictEqual([done, a.live, a.grid, a.link, a.count], [0, false, false, false, base], tag + " " + name + ": fails closed");
    }
    // no config at all: no request is made and the entry stays excluded
    c = load("off-the-beaten-orbit", published);
    delete global.__313_CONFIG;
    EI.checkPages(c.col, () => { throw new Error("must not fetch"); }, () => {});
    assert.strictEqual(consumers(c).live, false, tag + ": no config stays excluded");
  }

  // entries with an official website are never gated and owner crops are untouched
  const { DATA, col } = load("off-the-beaten-orbit", true);
  const withSite = col.entries.filter((e) => e.website);
  assert.ok(withSite.length > 5, "fixture has ordinary website entries");
  const liveIds = new Set(DATA.live(col).map((e) => e.id));
  assert.ok(withSite.every((e) => liveIds.has(e.id)), "website entries stay public with no check");
  const twin = { id: "x", name: "x", website: "https://example.org/", eventPageId: ID };
  assert.strictEqual(DATA.pageFallbackId(twin), "", "an entry with a website is never gated");
  assert.deepStrictEqual(EI.pageIds([twin, { eventPageId: ID }, { eventPageId: ID }, { eventPageId: "bad" }]), [ID], "ids deduped; website and invalid ids skipped");
  assert.ok(col.entries.find((e) => e.id === NOEL).image.ownerClearance, "owner-supplied crop metadata unchanged");
  console.log("seasonal-event-page-gate: ok");
})().catch((e) => { console.error(e); process.exit(1); });
