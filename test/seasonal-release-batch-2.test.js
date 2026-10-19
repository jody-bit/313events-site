// test/seasonal-release-batch-2.test.js — release batch 2 (owner gate 5, 2026-10-19): Goodison, Damouni (Fall), Kensington (Fall Colors).
// Three records publish on the recorded DEC-029 owner risk acceptance. Batch 1 stays closed at 76; the total is 79.
"use strict";
const AUTHZ = require("./fixtures/seasonal-release-authorization.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
execFileSync(process.execPath, [path.join(root, "scripts/build-release-batch.js"), "--batch=2", "--check"]);

const B2 = ED.read("RELEASE_BATCH_2.json"), B1 = ED.read("RELEASE_BATCH_1.json"), E = ED.entries();
assert.deepStrictEqual([B2.counts.total, B2.counts.fall, B2.counts["fall-color"]], [3, 2, 1]);
assert.deepStrictEqual(B2.reconciles, { batch1: 76, batch2: 3, total: 79 });
assert.strictEqual(B1.records.length, 76, "batch 1 stays closed");
assert.deepStrictEqual(B2.records.map((r) => r.collection + "/" + r.id).sort(), AUTHZ.BATCH2.slice().sort(), "batch 2 is exactly the pinned ids");

for (const r of B2.records) {
  const e = E[r.collection].find((x) => x.id === r.id), g = ED.COLLECTIONS.readiness(e).gate;
  assert.deepStrictEqual(e.approval, AUTHZ.AUTH_BATCH2, r.id + ": the batch-2 approval");
  assert.ok(ED.COLLECTIONS.isPublic(e), r.id + ": public");
  assert.strictEqual(g.rightsRoute, "linked-risk-acceptance", r.id + ": rights route");
  assert.ok(!e.image.licenseUrl && !e.image.ownerPhoto, r.id + ": no license claim");
  assert.strictEqual(e.featured, false, r.id + ": the approved Don't Miss selection is unchanged");
}
// Damouni: the repo asset is the card image, the linked source is the recorded provenance.
const d = E.fall.find((e) => e.id === "damouni-orchards"), a = d.image.acquired;
assert.strictEqual(d.image.src, a.file);
assert.strictEqual(a.sha256, "fbb93e6283566f565f2a9cf7dfebac41fe93fdc9a0dcabcc1e1f101c66c75f2c");
assert.strictEqual(d.image.illustrative, false);
const f = path.join(root, a.file.replace(/^\//, ""));
assert.ok(fs.existsSync(f) && fs.statSync(f).size === a.bytes, "Damouni file exists with the recorded size");
assert.strictEqual(require("crypto").createHash("sha256").update(fs.readFileSync(f)).digest("hex"), a.sha256, "sha matches the file");
// Public pages.
assert.ok(fs.readFileSync(path.join(root, "fall.html"), "utf8").includes("damouni-orchards"));
assert.ok(fs.readFileSync(path.join(root, "fall-color.html"), "utf8").includes("kensington-metropark"));
console.log("seasonal release batch 2: ok");
