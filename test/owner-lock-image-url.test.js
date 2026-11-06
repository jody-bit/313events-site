// test/owner-lock-image-url.test.js: an OWNER-CORRECTION line with fields=image_url (written by the Editorial Gateway when
// the owner picks an image) locks image_url against ingestion, so a source's feed image cannot revert it on the next run.
// image_url is lockable but NOT correctable through save_correction (no validated text edit exists for it).
//
// Run: node test/owner-lock-image-url.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const contract = require(`${REPO_DIR}/api/_lib/event-contract.js`);

const OWNER_IMG = "https://example-staging.supabase.co/storage/v1/object/public/event-flyers/editorial/e1/abc.webp";
const FEED_IMG = "https://files.idss.com/C412/feed.jpg";
const line = contract.buildOwnerCorrectionLine({ at: "2026-11-06T02:00:00.000Z", editId: "editorial-gateway", actor: "owner", changes: [{ field: "image_url", before: FEED_IMG, after: OWNER_IMG }] });

// 1. the lock line is honoured
assert.deepStrictEqual(Array.from(contract.ownerCorrectedFields(line)), ["image_url"]);
assert.ok(contract.OWNER_LOCKABLE_FIELDS.includes("image_url"));
console.log("PASS: 1. fields=image_url is read as a lock");

// 2. ingestion cannot overwrite it; other fields of the same row still refresh
{
  const rows = [
    { external_id: "vd-1", title: "Showcase", image_url: FEED_IMG, end_date: "2026-12-28" },
    { external_id: "vd-2", title: "Other", image_url: FEED_IMG },
  ];
  const stored = new Map([["vd-1", { external_id: "vd-1", internal_note: line, image_url: OWNER_IMG }]]);
  const out = contract.protectOwnerCorrections(rows, stored);
  assert.strictEqual(out.rows[0].image_url, OWNER_IMG, "stored owner image kept");
  assert.strictEqual(out.rows[0].end_date, "2026-12-28", "unlocked fields still refresh");
  assert.strictEqual(out.rows[1].image_url, FEED_IMG, "unmarked rows untouched");
  assert.strictEqual(out.protectedRows, 1);
}
console.log("PASS: 2. a refresh keeps the owner-chosen image_url");

// 3. a lock line that names an unknown field is still ignored for that field
assert.strictEqual(contract.ownerCorrectedFields("OWNER-CORRECTION 2026-11-06T02:00:00.000Z e1 fields=status,end_date | {}").size, 0);
console.log("PASS: 3. other fields are not locked by accident");

// 4. image_url is not a correctable field through save_correction, and does not widen the editable list
assert.ok(!contract.OWNER_EDITABLE_FIELDS.includes("image_url"));
const r = contract.validateCorrection({ image_url: "https://x.test/a.jpg" }, { image_url: null });
assert.strictEqual(r.errors.length, 1);
assert.strictEqual(r.changes.length, 0);
console.log("PASS: 4. save_correction still refuses image_url");

// 5. the lookup the shared writer makes selects image_url, so the stored value exists to be sent back
{
  let url = "";
  global.fetch = async (u) => { if (String(u).includes("internal_note=like.")) url = String(u); return { ok: true, status: 200, json: async () => [] }; };
  const { upsertEventRows } = require(`${REPO_DIR}/api/_lib/event-upsert.js`);
  (async () => {
    await upsertEventRows("https://example-staging.supabase.co", "k", [{ external_id: "vd-1", title: "t" }]).catch(() => {});
    assert.ok(url, "lookup ran");
    assert.ok(/select=[^&]*\bimage_url\b/.test(url), `owner-correction lookup selects image_url: ${url}`);
    console.log("PASS: 5. the owner-correction lookup selects image_url");
  })();
}

// 6. end_date is lockable the same way (a feed end date an owner has fixed must not revert), and still not a save_correction field
{
  const l = contract.buildOwnerCorrectionLine({ at: "2026-11-06T02:00:00.000Z", editId: "e2", actor: "owner", changes: [{ field: "end_date", before: "2026-12-28", after: "2026-12-27" }] });
  assert.deepStrictEqual(Array.from(contract.ownerCorrectedFields(l)), ["end_date"]);
  const out = contract.protectOwnerCorrections([{ external_id: "vd-1", end_date: "2026-12-28", start_date: "2026-11-05" }], new Map([["vd-1", { external_id: "vd-1", internal_note: l, end_date: "2026-12-27" }]]));
  assert.strictEqual(out.rows[0].end_date, "2026-12-27");
  assert.ok(!contract.OWNER_EDITABLE_FIELDS.includes("end_date"));
  assert.strictEqual(contract.validateCorrection({ end_date: "2026-12-27" }, { end_date: "2026-12-28" }).errors.length, 1);
  console.log("PASS: 6. end_date is lockable, not correctable");
}
