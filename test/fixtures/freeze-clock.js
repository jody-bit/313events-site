// test/fixtures/freeze-clock.js — pin "now" for a test whose fixtures name
// specific calendar dates, so the test does not rot as the real date moves
// (a rotted test turns CI red on every branch with no code change).
//   const { freezeClock } = require("./fixtures/freeze-clock.js");
//   freezeClock("2026-10-08T15:00:00Z");   // before requiring the code under test
"use strict";
function freezeClock(iso) {
  const RealDate = Date;
  const NOW = RealDate.parse(iso);
  if (!Number.isFinite(NOW)) throw new Error("freezeClock: bad date " + iso);
  global.Date = class extends RealDate {
    constructor(...args) { if (args.length === 0) super(NOW); else super(...args); }
    static now() { return NOW; }
  };
  return NOW;
}
module.exports = { freezeClock };
