// test/preview-link-validate.test.js — Preview qualification: primary event links are really opened (owner direction 2026-10-23).
"use strict";
const assert = require("assert");
const { validateRows, isHomepageLanding, dataParity } = require("../scripts/preview-link-validate");

const answers = {
  "https://visitdetroit.com/events/gone/": { status: 404 },
  "https://visitdetroit.com/events/fine/": { status: 200 },
  "https://ra.co/events/1": { status: 403 },
  "https://venue.example/events/moved": { status: 200, url: "https://venue.example/" },
  "https://tix.example/e/410": { status: 410 },
};
const fetchFn = async (u) => {
  const a = answers[u];
  if (!a) throw new Error("unexpected fetch " + u);
  return { status: a.status, url: a.url || u };
};

(async () => {
  assert.strictEqual(isHomepageLanding("https://venue.example/"), true);
  assert.strictEqual(isHomepageLanding("https://venue.example/a"), false);
  const rows = [
    { title: "dead", source: "VisitDetroit", ticket_url: "https://visitdetroit.com/events/gone/" },
    { title: "fine", source: "VisitDetroit", ticket_url: "https://visitdetroit.com/events/fine/" },
    { title: "blocked", source: "RA", event_url: "https://ra.co/events/1" },
    { title: "redirects home", source: "Manual", event_url: "https://venue.example/events/moved" },
    { title: "gone for good", source: "Manual", ticket_url: "https://tix.example/e/410" },
    { title: "homepage only", source: "Manual", ticket_url: "https://tangentgallery.com" }, // never fetched: no event-specific link
    { title: "nothing", source: "Manual" },
  ];
  const { results, counts, blocking } = await validateRows(rows, { fetchFn, perSource: 10 });
  const v = Object.fromEntries(results.map((r) => [r.title, r.verdict]));
  assert.deepStrictEqual(v, { dead: "BLOCKING", fine: "PASS", blocked: "NEEDS-VERIFICATION", "redirects home": "NEEDS-VERIFICATION", "gone for good": "BLOCKING", "homepage only": "NO-PRIMARY", nothing: "NO-PRIMARY" });
  assert.deepStrictEqual(counts, { BLOCKING: 2, PASS: 1, "NEEDS-VERIFICATION": 2, "NO-PRIMARY": 2 });
  assert.strictEqual(blocking.length, 2);
  // per-source cap
  const many = Array.from({ length: 8 }, () => ({ title: "x", source: "VisitDetroit", ticket_url: "https://visitdetroit.com/events/fine/" }));
  assert.strictEqual((await validateRows(many, { fetchFn, perSource: 3 })).results.length, 3);
  // data parity: old-form VisitDetroit links and the data date
  const day = 86400000, now = Date.parse("2026-10-24T12:00:00Z");
  const stale = dataParity([
    { ticket_url: "https://visitdetroit.com/some-event/", updated_at: "2026-10-18T21:09:09Z" },
    { ticket_url: "https://visitdetroit.com/events/other/", updated_at: "2026-10-18T10:00:00Z" },
  ], { now });
  assert.strictEqual(stale.staleShapeCount, 1);
  assert.strictEqual(stale.newestUpdate, "2026-10-18T21:09:09.000Z");
  assert.strictEqual(stale.staleData, true);
  const fresh = dataParity([{ ticket_url: "https://visitdetroit.com/events/a/", updated_at: new Date(now - day).toISOString() }], { now });
  assert.deepStrictEqual([fresh.staleShapeCount, fresh.staleData], [0, false]);
  console.log("ok: preview link validation");
})().catch((e) => { console.error(e); process.exit(1); });
