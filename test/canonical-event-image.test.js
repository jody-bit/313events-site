"use strict";
// Canonical event image: one definition (event-image.js), a collection card that links an event shows that event's image first,
// its own cover is the fallback, no credit/badge is drawn for the event image, and every event surface reads events.image_url.
const assert = require("assert"), fs = require("fs"), path = require("path");
const EI = require("../event-image.js");
const root = (f) => path.join(__dirname, "..", f);
const ID = "d37e3f8e-1111-4222-8333-444455556666";
let n = 0; const ok = (m) => { n++; console.log("ok - " + m); };

assert.strictEqual(EI.eventImageUrl({ image_url: " https://x.test/a.webp " }), "https://x.test/a.webp");
assert.strictEqual(EI.eventImageUrl({ imageUrl: "http://x.test/b.jpg" }), "http://x.test/b.jpg");
assert.strictEqual(EI.eventImageUrl({ image_url: "javascript:alert(1)" }), "");
assert.strictEqual(EI.eventImageUrl({ image_url: 'https://x.test/a"onerror=1' }), "");
assert.strictEqual(EI.eventImageUrl({}), ""); assert.strictEqual(EI.eventImageUrl(null), "");
ok("resolver accepts row or page shape, rejects unsafe values");

const entries = [{ id: "a", eventId: ID, image: { src: "/cover.webp" } }, { id: "b", image: { src: "/b.webp" } }, { id: "c", eventId: "not-an-id", image: { src: "/c.webp" } }];
assert.deepStrictEqual(EI.linkedIds(entries), [ID]);
assert.strictEqual(EI.apply(entries, [{ id: ID, image_url: "https://img.test/event.webp" }]), 1);
assert.strictEqual(entries[0].image.canonical, "https://img.test/event.webp");
assert.strictEqual(entries[1].image.canonical, undefined); assert.strictEqual(entries[2].image.canonical, undefined);
assert.strictEqual(EI.apply(entries, [{ id: ID, image_url: "https://img.test/event.webp" }]), 0);
const keep = [{ id: "a", eventId: ID, image: { src: "/cover.webp" } }];
assert.strictEqual(EI.apply(keep, [{ id: ID, image_url: null }]), 0);
assert.strictEqual(keep[0].image.canonical, undefined);
ok("apply sets canonical only for linked events with a usable image");

const R = require("../seasonal/render.js");
const C = require("../seasonal/collections.js").COLLECTIONS.fall;
const card = (img) => R.card(C, { id: "x", name: "X", city: "Detroit", region: "MI", categories: [], summary: "s", image: img }, { state: {} });
let html = card({ src: "/cover.webp", credit: "Photo: X, CC BY-SA 3.0, via Wikimedia Commons", canonical: "https://img.test/event.webp" });
assert(html.includes('src="https://img.test/event.webp"'), "event image first");
assert(html.includes("&quot;/cover.webp&quot;"), "cover kept as fallback");
assert(!/sc-illus|sc-hist/.test(html));
ok("collection card shows the event image first with the cover as fallback");
html = card({ src: "/cover.webp" });
assert(html.includes('src="/cover.webp"'));
ok("without a linked event the card is unchanged");

const ED = require("../api/_lib/seasonal-editorial/editorial.js");
assert(ED.publishedProjection && typeof ED.publishedProjection === "function");
const all = Object.values(ED.publishedProjection()).flat();
assert(all.every((e) => e.eventId === undefined), "no published entry links an event yet: dormant until Editorial adds eventId");
ok("projection passes eventId through only when valid (none linked today)");

// every event surface reads the one column
for (const [f, re] of [["index.html", /imageUrl: row\.image_url/], ["calendar.html", /image_url/], ["map.html", /image_url/], ["event-template.html", /image_url|imageUrl/], ["api/event-meta.js", /e\.image_url/]]) {
  assert(re.test(fs.readFileSync(root(f), "utf8")), f + " reads image_url");
}
ok("listing, calendar, map, event page and OG meta all read image_url");
console.log(n + " checks passed");
// hydrate: one read of events_public for the linked ids; applies; a failed read leaves the cover
(async () => {
  const urls = []; const ents = [{ id: "a", eventId: ID, image: { src: "/cover.webp" } }];
  globalThis.__313_CONFIG = { supabaseUrl: "https://p.test", supabaseAnonKey: "k" };
  const EI2 = (delete require.cache[require.resolve("../event-image.js")], require("../event-image.js"));
  let done = 0;
  EI2.hydrate(ents, (u) => { urls.push(u); return Promise.resolve({ ok: true, json: async () => [{ id: ID, image_url: "https://img.test/e.webp" }] }); }, () => done++);
  await new Promise((r) => setTimeout(r, 20));
  console.log("ok - hydrate reads events_public once and applies", urls.length === 1 && /events_public\?select=id,image_url&id=in\.\(d37e3f8e/.test(urls[0]) && ents[0].image.canonical && done === 1 ? "" : "FAIL");
  assert(urls.length === 1 && ents[0].image.canonical === "https://img.test/e.webp" && done === 1);
  const e2 = [{ id: "a", eventId: ID, image: { src: "/cover.webp" } }];
  EI2.hydrate(e2, () => Promise.reject(new Error("net")), () => assert.fail());
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(e2[0].image.canonical, undefined);
  console.log("ok - failed read leaves the cover");
})();
// Preview fixture: exactly one entry links an event, in the Preview data only (never the release overlay)
{
  const prev = require("../api/_lib/seasonal-editorial/refresh-preview.json"), rel = require("../api/_lib/seasonal-editorial/refresh-release.json");
  const linked = (d) => Object.values(d).flatMap((c) => (c.add || []).concat(Object.values(c.overrides || {}))).filter((e) => e && e.eventId).map((e) => e.id);
  assert.deepStrictEqual(linked(prev), ["pewabic-holiday-showcase"]);
  assert.deepStrictEqual(linked(rel), []);
  assert(EI.isEventId(prev["off-the-beaten-orbit"].add.find((e) => e.id === "pewabic-holiday-showcase").eventId));
  console.log("ok - Preview fixture links Pewabic only; release overlay links nothing");
}
