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
  // A generic page that only MENTIONS the title in body text (featured events, embedded data) is not the event page
  const generic = '<html><head><title>Visit Detroit | Visit Detroit</title><meta property="og:title" content="Visit Detroit"></head><body><h1>Page not found</h1><section>Featured: Cider in the City</section><script>{"title":"Cider in the City"}</script></body></html>';
  r = await healEventUrl({ url: U, title: "Cider in the City", fetchFn: mk(200, generic, U), requireIdentity: true });
  assert.strictEqual(r.classification, "inconclusive"); assert.strictEqual(r.identityConfirmed, false);
  // the real page title form, and og:title / h1, confirm
  const real = (h) => '<html><head>' + h + '</head><body>x</body></html>';
  for (const head of ["<title>Cider in the City | Visit Detroit</title>", '<meta property="og:title" content="Cider in the City | Visit Detroit">']) {
    r = await healEventUrl({ url: U, title: "Cider in the City", fetchFn: mk(200, real(head), U), requireIdentity: true });
    assert.strictEqual(r.classification, "ok", head);
  }
  r = await healEventUrl({ url: U, title: "Cider in the City", fetchFn: mk(200, "<body><h1>Cider in the City</h1></body>", U), requireIdentity: true });
  assert.strictEqual(r.classification, "ok");
  // default behaviour (requireIdentity off) is unchanged for other callers
  r = await healEventUrl({ url: U, title: "Cider in the City", fetchFn: mk(200, "generic", U) });
  assert.strictEqual(r.classification, "ok");
  console.log("PASS: link check identity");
})().catch((e) => { console.error(e); process.exit(1); });
