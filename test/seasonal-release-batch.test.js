// test/seasonal-release-batch.test.js — the prepared 76-record release batch and the access advisories.
// The batch is prepared for the owner's authorization and NOT applied: no record carries an approval, nothing is public, and
// every record would pass the gate and publish exactly the previewed card once approved in memory.
"use strict";
const AUTHZ = require("./fixtures/seasonal-release-authorization.js");
const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const R = require(path.join(root, "seasonal/render.js"));
execFileSync(process.execPath, [path.join(root, "scripts/build-release-batch.js"), "--check"]);

const B = ED.read("RELEASE_BATCH_1.json");
const E = ED.entries();
assert.deepStrictEqual([B.counts.total, B.counts.fall, B.counts["fall-color"], B.counts.original15], [76, 36, 40, 15]);
assert.deepStrictEqual([B.excluded.held, B.excluded.discoveredLeads], [124, 37]);
assert.ok(/^APPLIED/.test(B.status) && /Jody Tyree/.test(B.status), "the batch is marked applied by the owner's authorization");
assert.strictEqual(new Set(B.records.map((r) => r.collection + "/" + r.id)).size, 76, "no duplicates");

const all = E.fall.concat(E["fall-color"], E.halloween);
assert.strictEqual(all.filter((e) => e.approval).length, 76, "approvals only on the 76 batch records");
assert.strictEqual(all.filter((e) => e.status === "PUBLISHED").length, 76, "only the batch is declared PUBLISHED");
assert.strictEqual(all.filter((e) => ED.COLLECTIONS.isPublic(e)).length, 76, "only the batch is public");
for (const r of B.records) assert.deepStrictEqual(E[r.collection].find((x) => x.id === r.id).approval, AUTHZ.AUTH, r.id + ": the authorized approval, nothing else");

let advisories = 0;
for (const r of B.records) {
  const e = E[r.collection].find((x) => x.id === r.id);
  assert.strictEqual(ED.review(e).state, "PUBLISHED", r.id);
  assert.ok(e.editorialAccepted, r.id + ": editorially accepted");
  const sim = JSON.parse(JSON.stringify(e));
  assert.ok(ED.COLLECTIONS.isPublic(sim), r.id + ": passes the gate with its approval");
  const card = ED.publicEntry(sim);
  assert.deepStrictEqual(card, r.publicCard, r.id + ": the batch shows the exact card");
  const col = Object.assign({}, ED.COLLECTIONS.COLLECTIONS[r.collection], { entries: [card] });
  const html = R.card(col, card, {});
  const has = /Access advisory:/.test(html);
  if (card.advisory) advisories++;
  assert.strictEqual(has, !!card.advisory, r.id + ": the advisory line appears only where the record has one");
  assert.ok(!/editorial|approval|evidence|313p-|checkedBy|QA/.test(html.replace(/Illustrative image/g, "")), r.id + ": no internal data on the card");
}
assert.strictEqual(advisories, 2, "exactly two records show an advisory");
const hines = ED.publicEntry(Object.assign(JSON.parse(JSON.stringify(E["fall-color"].find((e) => e.id === "hines-drive-edward-n-hines-parkway"))), { status: "PUBLISHED", approval: { by: "t", at: "2026-10-12" } }));
const mac = ED.publicEntry(Object.assign(JSON.parse(JSON.stringify(E["fall-color"].find((e) => e.id === "macomb-orchard-trail"))), { status: "PUBLISHED", approval: { by: "t", at: "2026-10-12" } }));
assert.strictEqual(hines.advisory, "Hines Drive is closed between Newburgh Road and Wayne Road for bridge replacement. Other sections remain accessible.");
assert.strictEqual(mac.advisory, "A section of the trail is temporarily closed. Reopening is anticipated in fall 2026; no confirmed date.");
assert.ok(!/reopen.*20\d\d-\d\d-\d\d|reopens on/i.test(hines.advisory), "no invented reopening date");
// advisories carry their verification result and sources privately
for (const e of [E["fall-color"].find((x) => x.id === hines.id), E["fall-color"].find((x) => x.id === mac.id)]) {
  assert.ok(e.accessAdvisories.verification && e.accessAdvisories.verification.sources.length && e.accessAdvisories.verification.limits, e.id + ": advisory verification recorded");
  assert.ok(e.accessAdvisories.publicTextApproved && e.accessAdvisories.publicTextApproved.at === "2026-10-12", e.id + ": advisory wording owner-approved");
}
console.log("seasonal release batch: ok");
