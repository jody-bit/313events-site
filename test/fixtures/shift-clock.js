// test/fixtures/shift-clock.js — a Node preload that moves the process clock
// forward by SHIFT_DAYS. CI runs the whole suite once with it
// (`SHIFT_DAYS=120 NODE_OPTIONS="--require ./test/fixtures/shift-clock.js"
// node test/run-all.js`) so a test that quietly depends on today's date fails
// in review, not months later. Tests that pin their own clock with
// freeze-clock.js are unaffected, by design.
// Preload: shifts the process clock forward by SHIFT_DAYS so date-dependent tests reveal themselves.
const days = Number(process.env.SHIFT_DAYS || 0);
const RealDate = Date, off = days * 86400000;
global.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + off); else super(...a); }
  static now() { return RealDate.now() + off; }
};
