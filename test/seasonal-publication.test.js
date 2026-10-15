// test/seasonal-publication.test.js — the publication model after the Halloween consolidation:
//   * the six Halloween entries that were public on feature/halloween-completion are PRESERVED, not grandfathered
//   * all 52 Halloween destinations and every saved image selection survive
//   * the public projection contains only gate-complete, approved entries (none today)
//   * the migration review and the generated files cannot drift
"use strict";
const AUTHZ = require("./fixtures/seasonal-release-authorization.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const ED = require(path.join(root, "api/_lib/seasonal-editorial/editorial.js"));
const DATA = ED.COLLECTIONS;
const QA = require(path.join(root, "api/_lib/seasonal-editorial/qa-client.js"));
const qa = JSON.parse(fs.readFileSync(path.join(root, "api/_lib/seasonal-editorial/halloween-qa.json"), "utf8"));
const frozen = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/halloween-qa-7e094df.json"), "utf8"));
const entries = ED.entries();
const byId = Object.fromEntries(entries.halloween.map((e) => [e.id, e]));
const run = (script, ...a) => execFileSync(process.execPath, [path.join(root, "scripts", script), ...a], { cwd: root, stdio: "pipe" });

// ---- generated files are in sync (public projection, pages, QA data, migration review, asset hashes)
run("build-seasonal.js", "--check"); run("build-halloween-qa.js", "--check"); run("build-seasonal-launch.js", "--check"); run("build-approval-batch.js", "--check"); run("build-launch-proposal.js", "--check"); run("build-publication-review.js", "--check");
assert.deepStrictEqual(require(path.join(root, "scripts/build-seasonal.js")).validateAssets(), []);

// ---- the six existing public entries are preserved (B1)
// After the owner's Halloween approval (2026-10-11), the verified evidence recorded on 2026-10-12 and the owner's established illustration route
// (Erebus and Crossroads take the labelled "Illustrative image"), all six are public.
const SIX = { "erebus": "PUBLISHED", "eloise-asylum": "PUBLISHED", "halloween-greenfield-village": "PUBLISHED", "zoo-boo": "PUBLISHED", "glenlore-carnevil-2": "PUBLISHED", "crossroads-ghosts-goodies": "PUBLISHED" };
for (const [id, state] of Object.entries(SIX)) {
  const e = byId[id];
  assert.ok(e, id + " preserved as a record");
  assert.strictEqual(e.migration.legacyStatus, "published");
  assert.strictEqual(e.migration.legacyCommit, "7e094df");
  assert.strictEqual(e.status, state, id + " status is the derived one (not hand-set, not grandfathered)");
  assert.deepStrictEqual(e.approval, AUTHZ.AUTH_HALLOWEEN, id + ": carries exactly the owner's Halloween approval");
  assert.strictEqual(DATA.isPublic(e), state === "PUBLISHED", id + " is public only when every gate item passes");
  assert.ok(e.evidence.length >= 2 && e.evidence[0].level === "inventory+search", id + " keeps its original evidence");
  const rv = ED.review(e);
  assert.ok(!rv.outstanding.some((o) => /^Gate 5/.test(o)), id + ": the approval is recorded");
  assert.strictEqual(rv.outstanding.length === 0, state === "PUBLISHED", id + ": nothing outstanding only when published");
}
// the three that had only inventory + web coverage now carry an official-page read (recorded 2026-10-12); nothing is grandfathered
for (const id of ["erebus", "eloise-asylum", "glenlore-carnevil-2"]) {
  assert.strictEqual(DATA.gate(byId[id]).official, true); assert.strictEqual(DATA.gate(byId[id]).relevance, true);
  assert.ok(byId[id].evidence.some((x) => x.level === "official" && x.checkedAt === "2026-10-12"), id + ": official read recorded");
}
// all 14 previously published entries (4 fall + 6 halloween + 4 fall-color) carry the migration record
const migrated = [].concat(...DATA.ORDER.map((s) => entries[s].filter((e) => e.migration).map((e) => s + "/" + e.id)));
assert.strictEqual(migrated.length, 14);
const review = fs.readFileSync(path.join(ED.DIR, "MIGRATION_REVIEW.md"), "utf8");
for (const k of migrated) assert.ok(review.includes("`" + k.split("/")[1] + "`"), k + " is in the migration review");
{
  // Not grandfathered: a migrated record is public only through an explicit owner approval (Fall: 2026-10-12; Halloween: 2026-10-11) AND a passing gate.
  const nPublic = [].concat(...DATA.ORDER.map((s) => entries[s].filter((e) => e.migration && DATA.isPublic(e)))).length;
  assert.ok(review.includes("public destinations after migration = " + nPublic + " of 14") && /not grandfathered/i.test(review), "the review states the current public count of the 14");
  for (const s of DATA.ORDER) for (const e of entries[s].filter((x) => x.migration && DATA.isPublic(x))) AUTHZ.checkApproval(assert, s, e, AUTHZ.authorized(ED));
}
for (const id of Object.keys(SIX)) assert.ok(review.includes(SIX[id]), "the review states the current state of " + id);
// The other 46 Halloween records are new and carry no legacy status. 23 of them pass every gate item (verified 2026 operation plus a recorded image route:
// Hush, Azra and HallowGlow with linked images, and 20 on the labelled-illustration route). The other 23 are held or excluded.
assert.strictEqual(entries.halloween.filter((e) => !e.migration).length, 46);
assert.deepStrictEqual(entries.halloween.filter((e) => !e.migration && DATA.isPublic(e)).map((e) => e.id).sort(), AUTHZ.HALLOWEEN_PUBLISHED.filter((id) => !SIX[id]));
assert.strictEqual(entries.halloween.filter((e) => !e.migration && !DATA.isPublic(e)).length, 23);

// ---- the public projection (B1/B6)
{
  const pe = require(path.join(root, "seasonal/published-entries.js"));
  assert.deepStrictEqual(Object.keys(pe), DATA.ORDER);
  for (const slug of DATA.ORDER) for (const e of pe[slug]) assert.ok((() => { const priv = ED.entries()[slug].find((x) => x.id === e.id); return DATA.isPublic(priv) && JSON.stringify(e) === JSON.stringify(ED.publicEntry(priv)); })(), "published-entries.js holds an entry that is not PUBLISHED, or not in public form: " + e.id);
  assert.strictEqual(DATA.ORDER.reduce((n, s) => n + pe[s].length, 0), 105, "only the 76 authorized Fall records and the 29 gate-passing Halloween records are public");
  assert.deepStrictEqual([].concat(...DATA.ORDER.map((s) => pe[s].map((e) => s + "/" + e.id))).sort(), [...AUTHZ.authorized(ED)].sort(), "the public entries are exactly the authorized set");
  assert.deepStrictEqual(ED.publishedProjection(), pe, "published-entries.js equals the projection of the private data");
  // a hypothetical approval moves an entry into the projection, and ONLY that entry (checked on a copy; nothing is written)
  const e = JSON.parse(JSON.stringify(byId["halloween-greenfield-village"]));
  assert.ok(DATA.isPublic(e)); delete e.approval; e.status = DATA.readiness(e).state;
  assert.strictEqual(e.status, "READY_FOR_REVIEW"); assert.ok(!DATA.isPublic(e), "without the approval Greenfield is not public");
  e.approval = { by: "Test Approver", at: "2026-10-12" }; e.status = DATA.readiness(e).state;
  assert.strictEqual(e.status, "PUBLISHED"); assert.ok(DATA.isPublic(e), "Greenfield needs exactly one thing: the approval");
  // the exclusion guard: a disposition forces a record out of every public state, whatever else it carries
  e.disposition = { type: "duplicate", of: "x" }; assert.strictEqual(DATA.readiness(e).state, "HOLD_UNVERIFIED"); assert.ok(!DATA.isPublic(e), "an excluded record is never public");
}

// ---- all 52 Halloween destinations (inventory) are present everywhere they must be
{
  const ids = Object.keys(frozen.destinations);
  assert.strictEqual(ids.length, 52);
  assert.deepStrictEqual(entries.halloween.map((e) => e.id).sort(), ids.slice().sort(), "private entries == the 52 branch destination ids");
  assert.deepStrictEqual(qa.records.map((r) => r.id).sort(), ids.slice().sort(), "QA records == the 52 branch destination ids");
  const reg = JSON.parse(fs.readFileSync(path.join(ED.DIR, "candidates.json"), "utf8")).candidates.filter((c) => c.collection === "halloween");
  assert.strictEqual(reg.length, 52);
  assert.deepStrictEqual(reg.map((c) => c.destination_id).sort(), ids.slice().sort(), "registry rows carry the same ids");
  assert.deepStrictEqual(reg.map((c) => c.entry_id).sort(), ids.slice().sort());
  for (const f of frozen.destinations && ids) {
    const d = frozen.destinations[f], r = qa.records.find((x) => x.id === f);
    // The branch's conservative categories and summary stand, except where the owner-approved verified correction (halloween-release-1.json) replaces them.
    const corr = ED.read("halloween-release-1.json").records[f];
    assert.deepStrictEqual(r.categories, corr.categories || d.categories, f + " keeps the branch's conservative categories unless corrected");
    assert.strictEqual(r.summary, corr.summary || d.summary, f + " keeps the branch's summary unless corrected");
  }
}

// ---- saved image selections keep working (B7): every option id a reviewer could have saved still exists
{
  for (const [id, d] of Object.entries(frozen.destinations)) {
    const r = qa.records.find((x) => x.id === id), have = r.image_options.map((o) => o.id);
    // Parity repair: records with a release-data illustrationCard moved to a neighbour-safe card (same eight approved cards, same label).
    const relCard = (ED.read("halloween-release-1.json").records[id] || {}).illustrationCard;
    assert.strictEqual(r.image_options[0].id, relCard ? "gen-halloween-" + /card-(\d+)/.exec(relCard.src)[1] : d.default, id + ": the default did not move (except the neighbour-safe re-assignment)");
    assert.strictEqual(r.manifest.primary_image, relCard ? relCard.src : d.primary_image, id);
    for (const oid of d.options) assert.ok(have.includes(oid), id + ": saved option id " + oid + " must still exist");
    // a saved choice resolves to the SAME option (type unchanged), not to the first option by accident
    for (const oid of d.options) { const o = QA.option(r, oid); assert.strictEqual(o.id, oid); assert.strictEqual(o.type, d.types[oid], id + "/" + oid + " type unchanged"); }
    // an unknown saved id degrades to the default instead of failing
    assert.strictEqual(QA.option(r, "no-such-option").id, r.image_options[0].id);
    assert.ok(QA.toEntry(r, d.options[d.options.length - 1]).image.src);
  }
  // the whole saved-choice map from a reviewer's browser, for every destination, round-trips through the export
  const saved = Object.fromEntries(Object.entries(frozen.destinations).map(([id, d]) => [id, d.options[d.options.length - 1]]));
  const exp = JSON.parse(QA.exportJson(qa.records, saved));
  assert.strictEqual(exp.selections.length, 52);
  for (const s of exp.selections) assert.strictEqual(s.selected_image_id, saved[s.destination_id]);
  assert.strictEqual(QA.KEY, "313-halloween-qa-image-choices-v1", "the storage key is unchanged");
  // exactly the nine new options and the two Crossroads proposals (owner decision pending) were added, and none is a default
  const added = [];
  for (const r of qa.records) for (const o of r.image_options) { const ic = (ED.read("halloween-release-1.json").records[r.id] || {}).illustrationCard; if (ic && o.id === "gen-halloween-" + /card-(\d)/.exec(ic.src)[1]) continue; /* neighbour-safe card: one of the eight approved cards, already an option elsewhere */ if (!frozen.destinations[r.id].options.includes(o.id)) added.push(o.id); }
  assert.deepStrictEqual(added.sort(), ["slay-nights", "blakes-haunted-attractions", "deranged-haunt", "scarehouse-windsor", "scarehouse-windsor-immersive-dinner", "field-of-fear", "fort-meigs-garrison-ghost-walk", "halloween-stroll-at-canterbury-village", "brick-or-treat-at-legoland-discovery-center"].map((i) => "link-" + i).concat(["link-crossroads-ghosts-goodies-p1", "link-crossroads-ghosts-goodies-p2", "313p-f9dfb30c", "313p-50d6d4a5", "313p-2073df4d", "313p-79a7ddc3", "313p-b3004032", "313p-33303347", "313p-9c99ee31"]).sort()); // 313p-f9dfb30c: the venue-supplied Greenfield Village photo (owner decision 2026-10-13); 313p-50d6d4a5: the Hush-approved venue image (owner decision 2026-10-14)
  const pinned = JSON.parse(fs.readFileSync(path.join(ED.DIR, "defaults.json"), "utf8")).defaults;
  for (const [id, d] of Object.entries(frozen.destinations)) assert.strictEqual(pinned[id], (ED.read("halloween-release-1.json").records[id] || {}).illustrationCard ? "gen-halloween-" + /card-(\d+)/.exec(ED.read("halloween-release-1.json").records[id].illustrationCard.src)[1] : d.default, id + " pinned default == branch default (or the neighbour-safe card)");
  // default type distribution is exactly the branch's: 44 generated, 5 linked official, 3 owner photos
  const dist = {}; qa.records.forEach((r) => { dist[r.manifest.primary_image_type] = (dist[r.manifest.primary_image_type] || 0) + 1; });
  assert.deepStrictEqual(dist, { generated_illustrative: 44, linked_official: 5, owner_photo_destination: 3 });
}

// ---- image rights are never overstated
for (const slug of DATA.ORDER) for (const e of entries[slug]) {
  const im = e.image;
  if (im.remote) {
    assert.ok(/not confirmed usage rights|no permission from the rights holder/i.test(im.remote.riskNote) || /no permission/i.test(im.remote.riskNote), e.id + ": risk acceptance is described as such");
    assert.ok(!im.licenseUrl && !im.license || im.illustrative, e.id + ": a linked image carries no invented license");
  }
  if (im.ownerPhoto) assert.ok(!im.licenseUrl && !("license" in im), e.id + ": an owner photo carries no license URL");
  assert.ok(!(im.licenseUrl && !/^https:\/\//.test(im.licenseUrl)));
}
const links = JSON.parse(fs.readFileSync(path.join(ED.DIR, "linked-images.json"), "utf8")).images;
assert.ok(links.every((l) => l.permission_on_file === false), "no linked image claims rights-holder permission");
console.log("seasonal-publication: ok");
