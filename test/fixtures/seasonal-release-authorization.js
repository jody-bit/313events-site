// The owner's authorization of 2026-10-12 (message "AUTHORIZE PUBLICATION APPROVAL: batch seasonal-release-1, all 76 records,
// approved by Jody Tyree on 2026-10-12"). Tests use this to say exactly which records may carry an approval: the 76 records
// of RELEASE_BATCH_1.json, with exactly this approval, and no other record anywhere.
"use strict";
const AUTH = { by: "Jody Tyree", at: "2026-10-12" };
function authorized(ED) { return new Set(ED.read("RELEASE_BATCH_1.json").records.map((r) => r.collection + "/" + r.id)); }
// Assert one record: approved with exactly AUTH iff it is in the authorized set.
function checkApproval(assert, slug, e, set) {
  const key = slug + "/" + e.id;
  if (set.has(key)) assert.deepStrictEqual(e.approval, AUTH, key + ": carries exactly the authorized approval");
  else assert.ok(!e.approval, key + ": no approval outside the authorized batch");
}
module.exports = { AUTH, authorized, checkApproval };
