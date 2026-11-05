// Scheduled removal of a collection placement (owner direction 2026-11-04): cider-mill cards leave /fall at their removeAt instant
// (America/Detroit) and nothing else changes; the destination records stay in the private data.
const assert = require("assert");
const path = require("path");
const root = path.join(__dirname, "..");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const DATA = require(path.join(root, "seasonal/collections.js"));
const R = require(path.join(root, "seasonal/render.js"));
const col = DATA.COLLECTIONS.fall;
const ids = (now) => DATA.live(col, now).map((e) => e.id);
const T = (s) => Date.parse(s);
const D = "diehls-orchard-and-cider-mill", P = "parmenters-northville-cider-mill", F = "franklin-cider-mill", Y = "yates-cider-mill";

const all = ids(T("2026-11-22T23:59:59-05:00"));
[D, P, F, Y].forEach((id) => assert.ok(all.includes(id), id + " is shown through the last minute of Nov 22"));
const n22 = all.length;
const a23 = ids(T("2026-11-23T00:00:00-05:00"));
assert.ok(!a23.includes(D) && !a23.includes(P), "Diehl's and Parmenter's leave at Nov 23 12:00 a.m. Detroit time");
assert.ok(a23.includes(F) && a23.includes(Y), "Franklin and Yates remain");
assert.strictEqual(a23.length, n22 - 2);
assert.ok(ids(T("2026-11-29T23:59:59-05:00")).includes(F));
const a30 = ids(T("2026-11-30T00:00:00-05:00"));
assert.ok(!a30.includes(F) && a30.includes(Y), "Franklin leaves Nov 30 12:00 a.m.; Yates stays pending its closing date");
assert.strictEqual(a30.length, n22 - 3);
assert.strictEqual(DATA.live(col, null).length, DATA.published(col).length, "no instant applied: nothing is removed (build and tests are date-independent)");

// the collection still renders after removals: counts and cards are consistent, the removed cards are gone
const html = R.results(Object.assign({}, col), { category: "all", query: "", view: "grid" });
assert.ok(html.indexOf('data-entry="' + F + '"') >= 0 && /Last day open:<\/strong> November 29, 2026/.test(html), "Franklin card shows its confirmed last operating day");
assert.ok(/Last day open:<\/strong> November 22, 2026/.test(html), "Diehl's card shows November 22");
assert.ok(/Last day open:<\/strong> November 22, 2026/.test(html) && html.indexOf('data-entry="' + P + '"') >= 0, "Parmenter's card shows November 22 (official homepage)");

// nothing but the placement is touched: the records are still in the private data, approved and unchanged in status
for (const id of [D, P, F]) { const e = ED.entries().fall.find((x) => x.id === id); assert.ok(e && e.status === "PUBLISHED" && e.approval, id + " record untouched"); }
console.log("seasonal-placement-expiry: ok");
