"use strict";
// THE DARK ORBIT image strategy: all 52 destinations are present, each has a working image strategy, the runtime
// fallback chain always ends in a local file (no broken-image icon), the manifest matches the data, and the
// Preview-only review mode lists every entry without making any of them public.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const DATA = require(path.join(root, "seasonal/collections.js"));
const R = require(path.join(root, "seasonal/render.js"));
const MAN = require(path.join(root, "scripts/halloween-image-manifest.js"));
const col = DATA.COLLECTIONS.halloween;
const reg = JSON.parse(fs.readFileSync(path.join(root, "seasonal/candidates.json"), "utf8")).candidates.filter((c) => c.collection === "halloween");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "seasonal/halloween-image-manifest.json"), "utf8"));

test("all 52 Halloween destinations have one entry each, no duplicates", () => {
  assert.strictEqual(col.entries.length, 52);
  assert.strictEqual(new Set(col.entries.map((e) => e.id)).size, 52);
  assert.strictEqual(new Set(col.entries.map((e) => e.name)).size, 52);
  assert.strictEqual(reg.length, 52);
  assert.deepStrictEqual(reg.map((c) => c.published_id).sort(), col.entries.map((e) => e.id).sort(), "every inventory row maps to exactly one entry");
  // the six entries that existed before keep their own display names (e.g. "Zoo Boo at the Detroit Zoo"); the 46 added ones use the inventory name
  const before = new Set(["erebus", "eloise-asylum", "halloween-greenfield-village", "zoo-boo", "glenlore-carnevil-2", "crossroads-ghosts-goodies"]);
  for (const c of reg.filter((x) => !before.has(x.published_id))) assert.strictEqual(col.entries.find((e) => e.id === c.published_id).name, c.name);
});

test("every entry has a local generated card, an alternate card and the branded placeholder", () => {
  for (const e of col.entries) {
    for (const f of [e.image.src].concat(e.image.alternates || [], [e.image.placeholder])) {
      assert.ok(f && /^\/assets\//.test(f) && fs.existsSync(path.join(root, f)), e.id + " missing local fallback " + f);
    }
    assert.strictEqual((e.image.alternates || []).length, 1, e.id + " has one alternate card");
    assert.notStrictEqual(e.image.alternates[0], e.image.src, e.id + " alternate differs from the card");
    assert.strictEqual(e.image.placeholder, "/assets/placeholders/event-800.webp");
  }
});

test("linked images are https, credited, owner-accepted, and never marked as permitted", () => {
  for (const e of col.entries.filter((x) => x.image.remote)) {
    const r = e.image.remote;
    assert.match(r.src, /^https:\/\//, e.id); assert.match(r.sourcePage, /^https:\/\//, e.id);
    assert.ok(r.credit && r.acceptedBy && r.riskNote, e.id);
    assert.ok(!/permission (granted|received)|licensed|cc by/i.test(JSON.stringify(r)), e.id + " must not claim rights that are not on file");
  }
});

test("no entry is public and none was approved by the assistant", () => {
  assert.strictEqual(DATA.published(col).length, 0);
  assert.ok(col.entries.every((e) => !e.approval && !e.fixture));
  assert.ok(col.entries.every((e) => DATA.readiness(e).state === e.status));
});

test("the manifest covers all 52 and matches the data (regenerate with scripts/halloween-image-manifest.js)", () => {
  assert.deepStrictEqual(MAN.build(), manifest, "manifest is stale");
  assert.deepStrictEqual(manifest.entries.map((m) => m.id), col.entries.map((e) => e.id));
  const s = manifest.summary;
  assert.strictEqual(s.destinations, 52);
  assert.strictEqual(s.withoutAnyWorkingStrategy, 0);
  assert.strictEqual(s.brokenImages, 0);
  assert.strictEqual(s.authorizedLinkedPhotography, 0, "no explicit reuse permission is on file");
  assert.strictEqual(s.linkedImages + s.generatedArtworkOnly, 52);
  assert.strictEqual(s.otherAuthenticPhotography + s.linkedPromoArtwork, s.linkedImages);
  assert.strictEqual(s.linkedOfficial + s.linkedThirdParty, s.linkedImages);
  for (const m of manifest.entries) {
    assert.ok(["linked-official", "linked-third-party", "generated-artwork"].includes(m.strategy), m.id);
    assert.ok(/event-800\.webp$/.test(m.fallbackChain[m.fallbackChain.length - 1]), m.id + " chain ends at the placeholder");
    if (m.primary) {
      assert.strictEqual(m.primary.rights.permissionOnFile, false, m.id);
      assert.match(m.primary.loadCheck.result, /^loaded \d+x\d+$/, m.id + " must have been load-checked");
    }
  }
});

test("rendered cards: the chain is in the markup, the handler walks it and then hides the image", () => {
  const review = DATA.withReview(col);
  const grid = R.results(review, { category: "all", query: "", view: "grid" });
  const cards = grid.split('<li class="sc-card"').slice(1);
  assert.strictEqual(cards.length, 52, "review mode lists all 52");
  const stats = { linkedFirst: 0, cardFirst: 0 };
  for (const html of cards) {
    const id = /data-entry="([^"]+)"/.exec(html)[1], e = col.entries.find((x) => x.id === id);
    const src = /<img src="([^"]*)"/.exec(html)[1].replace(/&amp;/g, "&");
    const fb = /data-fb="([^"]*)"/.exec(html)[1].split("|");
    const attr = /onerror="([^"]*)"/.exec(html)[1].replace(/&#39;/g, "'");
    if (e.image.remote) { assert.strictEqual(src, e.image.remote.src, id); assert.strictEqual(fb[0], e.image.src, id + " first fallback is the generated card"); stats.linkedFirst++; }
    else { assert.strictEqual(src, e.image.src, id); stats.cardFirst++; }
    assert.strictEqual(fb[fb.length - 1], "/assets/placeholders/event-800.webp", id + " last fallback is the placeholder");
    assert.ok(fb.every((f) => /^\/assets\//.test(f) && fs.existsSync(path.join(root, f))), id + " fallbacks are local files");
    assert.ok(/alt=""/.test(html) && /Review only/.test(html), id + " review label");
    // run the real handler: every failure advances one step, the last hides the image
    const attrs = { "data-fb": fb.join("|") }, st = { visibility: undefined };
    const img = { onerror: () => {}, src, style: st, parentNode: { classList: { add() {} } }, getAttribute: (n) => (n in attrs ? attrs[n] : null), setAttribute: (n, v) => { attrs[n] = String(v); } };
    const fire = () => new Function("this_", "with (this_) {" + attr.replace(/this/g, "this_") + "}")(img);
    for (const want of fb) { fire(); assert.strictEqual(img.src, want, id); }
    assert.strictEqual(st.visibility, undefined); fire();
    assert.strictEqual(st.visibility, "hidden", id + " is hidden after the last failure");
    assert.strictEqual(img.onerror, null);
  }
  assert.strictEqual(stats.linkedFirst, 21); assert.strictEqual(stats.cardFirst, 31);
  const page = R.main(review);
  assert.ok(page.includes("REVIEW PREVIEW") && page.includes("Only 0 of them have passed the publication gate"));
  assert.ok(!R.main(col).includes("REVIEW PREVIEW") && !R.main(col).includes("Review only"), "the real page has no review banner or labels");
  for (const e of col.entries) assert.ok(!R.main(col).includes(e.name), "the real page does not list " + e.name);
  assert.strictEqual(col.includeReview, undefined, "withReview returns a copy");
});

// page.js lists everything only on ?review=1 in a non-production environment, and fails closed.
test("page.js review mode is Preview-only and fails closed", () => {
  const src = fs.readFileSync(path.join(root, "seasonal/page.js"), "utf8");
  function runPage(search, configEnv) {
    const scripts = [], els = {};
    const el = (id) => (els[id] = els[id] || { id, innerHTML: "", textContent: "", value: "", setAttribute() {}, getAttribute: () => null });
    const sandbox = { URLSearchParams, history: { replaceState() {} }, location: { search, pathname: "/halloween" },
      document: { body: { getAttribute: () => "halloween" }, getElementById: el, querySelectorAll: () => [], addEventListener() {},
        createElement: () => ({}), head: { appendChild(s) { scripts.push(s); } } } };
    sandbox.window = sandbox; sandbox.SeasonalCollections = DATA; sandbox.SeasonalRender = R;
    vm.createContext(sandbox); vm.runInContext(src, sandbox);
    const requested = [];
    while (scripts.length) {
      const sc = scripts.shift(); requested.push(sc.src);
      if (sc.src === "/config.js") { if (configEnv !== "error") sandbox.__313_CONFIG = configEnv === "missing" ? undefined : { environment: configEnv }; sc.onload(); }
      else sc.onerror();
    }
    return { requested, main: els.scMain ? els.scMain.innerHTML : "", results: els.scResults ? els.scResults.innerHTML : "" };
  }
  const plain = runPage("", "preview");
  assert.deepStrictEqual(plain.requested, []); assert.ok(plain.results.includes("sc-empty"), "no flag: the real, empty page");
  for (const bad of ["production", "missing", "error", "staging"]) {
    const r = runPage("?review=1", bad);
    assert.deepStrictEqual(r.requested, ["/config.js"], bad);
    assert.ok(!r.main.includes("REVIEW PREVIEW") && r.results.includes("sc-empty"), "fails closed when config is " + bad);
  }
  for (const ok of ["preview", "development", "local"]) {
    const r = runPage("?review=1", ok);
    assert.ok(r.main.includes("REVIEW PREVIEW") && (r.results.match(/class="sc-card"/g) || []).length === 52, "review mode in " + ok);
  }
});
