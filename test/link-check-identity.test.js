"use strict";
const assert = require("assert");
const { healEventUrl } = require("../api/_lib/link-health");
const mk = (status, body, url) => async () => ({ status, url, ok: status < 400, text: async () => body });
(async () => {
  const U = "https://visitdetroit.com/events/cider-in-the-city/";
  // 200 with the right event: ok, identity confirmed
  let r = await healEventUrl({ url: U, title: "Cider in the City", fetchFn: mk(200, "<h1>Cider in the City</h1>", U), requireIdentity: true });
  assert.strictEqual(r.classification, "ok"); assert.strictEqual(r.identityConfirmed, true); assert.strictEqual(r.status, 200);
  // 200 soft page without the title: NOT ok (inconclusive, writes nothing)
  r = await healEventUrl({ url: U, title: "Cider in the City", fetchFn: mk(200, "<h1>Visit Detroit</h1> generic page", U), requireIdentity: true });
  assert.strictEqual(r.classification, "inconclusive"); assert.strictEqual(r.identityConfirmed, false);
  // no title to verify against: never guess ok
  r = await healEventUrl({ url: U, title: "", fetchFn: mk(200, "anything", U), requireIdentity: true });
  assert.strictEqual(r.classification, "inconclusive");
  // a plain 404 stays dead (status and final url reported)
  r = await healEventUrl({ url: "https://example.com/x/", title: "X", fetchFn: mk(404, "generic", "https://example.com/x/"), requireIdentity: true });
  assert.strictEqual(r.classification, "dead"); assert.strictEqual(r.repaired, false);
  // default behaviour (requireIdentity off) is unchanged for other callers
  r = await healEventUrl({ url: U, title: "Cider in the City", fetchFn: mk(200, "generic", U) });
  assert.strictEqual(r.classification, "ok");
  console.log("PASS: link check identity");
})().catch((e) => { console.error(e); process.exit(1); });
