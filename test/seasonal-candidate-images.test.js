"use strict";
// api/_lib/seasonal-editorial/candidate-images.json (private): every row points at a real candidate, uses https links, carries a
// credit and source page, and nothing here is marked as published.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "api", "_lib", "seasonal-editorial");
const imgs = JSON.parse(fs.readFileSync(path.join(dir, "candidate-images.json"), "utf8")).images;
const cands = JSON.parse(fs.readFileSync(path.join(dir, "candidates.json"), "utf8")).candidates;

test("each catalogued image belongs to an existing candidate", () => {
  for (const i of imgs) {
    const c = cands.find((x) => x.collection === i.collection && x.name === i.candidate);
    assert.ok(c, `no candidate "${i.candidate}" in ${i.collection}`);
    assert.ok(["HOLD_UNVERIFIED", "CONTENT_VERIFIED", "IMAGE_PENDING", "READY_FOR_REVIEW"].includes(c.status), `${i.candidate} must not be recorded as published by an image catalogue`);
  }
});

test("each row has an https image, an https source page, a credit and a label", () => {
  for (const i of imgs) {
    assert.match(i.image, /^https:\/\//, i.candidate);
    assert.match(i.sourcePage, /^https:\/\//, i.candidate);
    assert.ok(i.credit && i.label, i.candidate);
    assert.strictEqual(i.status, "LINKED_CANDIDATE", i.candidate);
  }
});

test("one image per candidate", () => {
  const keys = imgs.map((i) => i.collection + "|" + i.candidate);
  assert.strictEqual(new Set(keys).size, keys.length);
});
