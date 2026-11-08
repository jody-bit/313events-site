// test/seasonal-launch-ended-derived.test.js
//
// #244 draft (P1 nit): build-seasonal-launch must accept an approved, released-then-ENDED record on its DERIVED state
// (ED.review(e).state), not on the declared `status`. A record that merely DECLARES ENDED, with no verified season.end and
// no unpublish decision, derives HOLD_UNVERIFIED and must still fail the launch build; a genuine ENDED record passes.
// Runs the real script against a temporary copy of the data. Run: node test/seasonal-launch-ended-derived.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const REPO = process.env.REPO_DIR || process.cwd();
const ID = "holiday-beach-conservation-area";

function run(mutate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "launch-ended-"));
  for (const d of ["scripts", "api/_lib", "seasonal", "data"]) {
    if (fs.existsSync(path.join(REPO, d))) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true });
  }
  fs.symlinkSync(path.join(REPO, "assets"), path.join(tmp, "assets"));
  const f = path.join(tmp, "api/_lib/seasonal-editorial/entries.json");
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  mutate(d["fall-color"].find((x) => x.id === ID));
  fs.writeFileSync(f, JSON.stringify(d, null, 1) + "\n");
  const r = spawnSync(process.execPath, [path.join(tmp, "scripts/build-seasonal-launch.js")], { cwd: tmp, encoding: "utf8" });
  fs.rmSync(tmp, { recursive: true, force: true });
  return r;
}

const real = JSON.parse(fs.readFileSync(path.join(REPO, "api/_lib/seasonal-editorial/entries.json"), "utf8"))["fall-color"].find((x) => x.id === ID);
assert.strictEqual(real.status, "ENDED", "the committed Holiday Beach record is ENDED");

// genuine ENDED (verified season.end + unpublish decision): the launch build accepts it
const ok = run(() => {});
assert.strictEqual(ok.status, 0, "a derived-ENDED approved record builds: " + (ok.stderr || "").slice(0, 300));

// declared ENDED only: no season, no decision -> derived HOLD_UNVERIFIED -> the launch build rejects it
const bad = run((e) => { delete e.season; delete e.expiryDisposition; });
assert.notStrictEqual(bad.status, 0, "a record that only declares ENDED must fail the launch build");
assert.ok(/a launch record must be/.test(bad.stderr), "fails with the launch-record error: " + (bad.stderr || "").slice(0, 300));
console.log("seasonal-launch-ended-derived: ok");
