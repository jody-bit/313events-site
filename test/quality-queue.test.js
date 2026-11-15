"use strict";
const assert = require("assert");
const q = require("../api/_lib/control-tower").qualityQueue;
const f = (o) => Object.assign({ schema_version: 1, key: "k", code: "same_venue_same_start_review", class: "actionable", stage: "published", subject: { ids: ["a", "b"], external_ids: [] }, events: [], evidence: {}, decision: "pick", owner: "EI", status: "open" }, o);

// import and published findings for the same record are ONE item with both stages
let r = q.build([f({ key: "c:a:b", stage: "import" }), f({ key: "c:a:b", stage: "published", decision: "published text" })]);
assert.strictEqual(r.queue.length, 1); assert.deepStrictEqual(r.queue[0].stages, ["import", "published"]); assert.strictEqual(r.queue[0].decision, "published text");
// the import finding never overwrites the published evidence
r = q.build([f({ key: "x", stage: "published", decision: "p" }), f({ key: "x", stage: "import", decision: "i" })]);
assert.strictEqual(r.queue[0].decision, "p");
// informative is counted, never queued; malformed findings are rejected, not guessed
r = q.build([f({ key: "i1", class: "informative", code: "missing_image" }), f({ key: "i2", class: "informative", code: "missing_image" }), { code: "junk" }, null]);
assert.strictEqual(r.queue.length, 0); assert.strictEqual(r.informative.missing_image, 2); assert.strictEqual(r.rejected, 2);
// queue status is Platform's; resolved sorts last and is not counted open
r = q.build([f({ key: "a" }), f({ key: "b", code: "venue_placeholder" })], { statusByKey: { a: "resolved", b: "acknowledged" } });
assert.strictEqual(r.queue[0].key, "b"); assert.strictEqual(r.open, 1);
// without EI's contract on the branch the detector reports NOT RUN, never a made-up finding
const d = q.detect([{ id: 1 }], {}); assert.ok(["not_run", "ok"].includes(d.state)); if (d.state === "not_run") assert.deepStrictEqual(d.findings, []);
console.log("All quality-queue.test.js checks passed.");
