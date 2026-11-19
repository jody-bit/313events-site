"use strict";
// price_from is the cheapest PAID tier; a $0 tier beside paid tiers must not make a show read as free
// (2026-10-22: "My Daddy is Haunted!" stored 0.00 / is_free while CrowdWork lists $32.85 online, $38.10 at the door).
const test = require("node:test");
const assert = require("node:assert");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
const { shapeRowsForShow } = require("../api/cron-planetanttheatre");

const show = (cost_tiers) => ({ id: 17881, name: "THEATRE l Fixture Show", dates: ["2026-10-23T20:00:00.000-04:00"], venue: "Planet Ant Theatre", cost_tiers });
const row = (tiers) => shapeRowsForShow(show(tiers))[0];

test("a $0 tier next to paid tiers is ignored: price is the cheapest paid tier and the show is not free", () => {
  const r = row([{ cost_after_fees: 0 }, { cost_after_fees: 3285 }, { cost_after_fees: 3810 }]);
  assert.strictEqual(r.price_from, 32.85);
  assert.strictEqual(r.is_free, false);
});

test("paid tiers only: unchanged (cheapest tier, not free)", () => {
  const r = row([{ cost_after_fees: 3810 }, { cost_after_fees: 3285 }]);
  assert.strictEqual(r.price_from, 32.85);
  assert.strictEqual(r.is_free, false);
});

test("every priced tier is $0: the show is free", () => {
  const r = row([{ cost_after_fees: 0 }, { cost_after_fees: 0 }]);
  assert.strictEqual(r.price_from, 0);
  assert.strictEqual(r.is_free, true);
});

test("no usable tier: no price claim at all (field omitted, not 0)", () => {
  for (const tiers of [undefined, [], [{}], [{ cost_after_fees: null }], [{ cost_after_fees: "x" }]]) {
    const r = row(tiers);
    assert.strictEqual(r.price_from, undefined);
    assert.strictEqual(r.is_free, false);
  }
});

test("a negative or non-finite amount is not a price", () => {
  const r = row([{ cost_after_fees: -100 }, { cost_after_fees: 2000 }]);
  assert.strictEqual(r.price_from, 20);
});
