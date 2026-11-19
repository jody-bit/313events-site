// test/event-url-absolute-guard.test.js -- a relative event_url ("/events/edmund-fitzgerald-special-event-station-4", the stored
// value on Dossin row 33968c3d) can reach events.event_url through none of the application write paths. Pins each path so a
// later change cannot reopen it. No network, no database.
// Run: node test/event-url-absolute-guard.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { normalizeRowLinks, resolveLinkField } = require(`${REPO_DIR}/api/_lib/link-field.js`);
const { validateCorrection } = require(`${REPO_DIR}/api/_lib/event-contract.js`);

const REL = "/events/edmund-fitzgerald-special-event-station-4";
const ABS = "https://www.dossinmuseum.org" + REL; // illustrative; the real base is the repair script's SOURCE_URL

// 1. Connector/upsert path: a relative value is omitted from the write (never overwrites a stored absolute one); other fields
//    and the row's identity are untouched; the input row is not mutated.
{
  const row = { external_id: "x1", title: "T", event_url: REL, ticket_url: "https://example.com/t" };
  const out = normalizeRowLinks(row);
  assert.ok(!("event_url" in out), "relative event_url is not written");
  assert.strictEqual(out.ticket_url, "https://example.com/t");
  assert.strictEqual(out.title, "T");
  assert.strictEqual(row.event_url, REL, "input not mutated");
  assert.strictEqual(normalizeRowLinks({ event_url: ABS }).event_url, ABS, "an absolute value passes unchanged");
  assert.ok(!("event_url" in normalizeRowLinks({ event_url: "Pay at the door" })));
}
// 2. Connector-side resolution needs a real http(s) source base; without one nothing is guessed.
{
  assert.strictEqual(resolveLinkField(REL, "https://www.dossinmuseum.org/events").url, ABS);
  assert.strictEqual(resolveLinkField(REL, undefined).url, null);
  assert.strictEqual(resolveLinkField(REL, "not a url").reason, "unresolvable");
}
// 3. Owner/admin correction path rejects a relative event_url and a blank one; accepts an absolute one.
{
  const cur = { event_url: null };
  assert.strictEqual(validateCorrection({ event_url: REL }, cur).errors.length, 1);
  assert.strictEqual(validateCorrection({ event_url: "" }, cur).errors.length, 1);
  const ok = validateCorrection({ event_url: ABS }, cur);
  assert.strictEqual(ok.errors.length, 0);
  assert.deepStrictEqual(ok.changes, [{ field: "event_url", before: null, after: ABS }]);
}
console.log("event-url-absolute-guard.test.js: all assertions passed");
