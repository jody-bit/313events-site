// test/cron-feeds-publication-policy.test.js
//
// api/_lib/feed-publication.js: a feed with a publication policy (today only the City of
// Lathrup Village) creates NEW rows as pending_review unless they are verified; every
// other feed is untouched. The Lathrup feed has no LOCATION on 25 of 26 events, so its
// meetings are held "needs location" -- while an event that merely lacks an optional field
// (description, image, end time) is not held, and a reviewer's decision on an existing row
// is never undone.
//
// Run: node test/cron-feeds-publication-policy.test.js
"use strict";
// api/cron-feeds.js skips new rows that have already ended (api/_lib/ingest-eligibility.js), so pin "now" before the fixtures' dates.
require("./fixtures/freeze-clock.js").freezeClock("2025-01-01T00:00:00Z");
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const LV_URL = "https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/19909/cms/events/generate_ical?filter_ids=&section_ids=";

function freshHandler() {
  for (const m of ["cron-feeds.js", "_lib/venue-lookup.js", "_lib/ics-location.js", "_lib/feed-publication.js"]) delete require.cache[require.resolve(`${REPO_DIR}/api/${m}`)];
  return require(`${REPO_DIR}/api/cron-feeds.js`);
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });
const ics = (events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");

async function poll({ feed, events, stored = [], venues = [] }) {
  const written = [];
  global.fetch = async (url, opts = {}) => {
    const m = opts.method || "GET";
    if (url.includes("/rest/v1/feed_sources") && m === "GET") return { ok: true, status: 200, json: async () => [feed] };
    if (url.includes("/rest/v1/feed_sources")) return { ok: true, status: 204 };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => venues };
    if (url.includes("/rest/v1/events") && url.includes("external_id=in.")) return { ok: true, status: 200, json: async () => stored };
    if (url.includes("/rest/v1/events") && m === "GET") return { ok: true, status: 200, json: async () => [] };
    if (url === feed.feed_url) return { ok: true, status: 200, text: async () => ics(events) };
    if (url.includes("/rest/v1/events") && m === "POST") { written.push(...JSON.parse(opts.body)); return strictWriteResponse(url, opts); }
    throw new Error("unmocked URL: " + url);
  };
  const res = makeRes();
  await freshHandler()({ headers: {} }, res);
  assert.strictEqual(res._status, 200);
  return written;
}
const byUid = (rows, uid) => rows.find((r) => r.external_id.endsWith(`-${uid}`));

async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  const LV = { id: "fs-lv", venue_name: "City of Lathrup Village", default_category: "community", feed_url: LV_URL, feed_format: "ics", status: "approved", location_per_event: true };
  const OTHER = { ...LV, id: "fs-other", venue_name: "City of Test", feed_url: "https://feed.example/cal.ics" };

  const lvEvents = [
    ["UID:meet", "DTSTART:20261019T193000", "DTEND:20261019T210000", "DESCRIPTION:", "LOCATION:", "SUMMARY:City Council - Regular Meeting"],
    ["UID:closed", "DTSTART;VALUE=DATE:20261012", "DTEND;VALUE=DATE:20261013", "SUMMARY:City Hall - CLOSED"],
    ["UID:closed2", "DTSTART;VALUE=DATE:20261231", "DTEND;VALUE=DATE:20270102", "SUMMARY:City Hall - Closed"],
    ["UID:dinner", "DTSTART:20261112T173000", "DTEND:20261112T193000", "LOCATION:Community Room", "SUMMARY:LVPD - Thanksgiving Dinner"],
    ["UID:addr", "DTSTART:20261120T120000", "LOCATION:Lathrup Village City Hall - 27400 Southfield Rd  Lathrup Village MI 48076", "SUMMARY:DDA Meeting"],
    ["UID:untitled", "DTSTART:20261121T120000", "LOCATION:Lathrup Village City Hall - 27400 Southfield Rd  Lathrup Village MI 48076", "SUMMARY:"],
    ["UID:backwards", "DTSTART:20261122T120000", "DTEND:20261122T100000", "LOCATION:Lathrup Village City Hall - 27400 Southfield Rd  Lathrup Village MI 48076", "SUMMARY:Backwards"],
  ];

  // --- Lathrup: closures excluded, meetings held, UIDs preserved, no internal marker leaked
  let rows = await poll({ feed: LV, events: lvEvents });
  assert.strictEqual(byUid(rows, "closed"), undefined, "City Hall - CLOSED is not ingested");
  assert.strictEqual(byUid(rows, "closed2"), undefined, "the closure rule is case-insensitive");
  assert.ok(byUid(rows, "meet"), "a meeting is ingested with its authoritative UID");
  assert.strictEqual(byUid(rows, "meet").status, "pending_review");
  assert.match(byUid(rows, "meet").note, /no location stated/);
  assert.strictEqual(byUid(rows, "dinner").status, "pending_review");
  assert.match(byUid(rows, "dinner").note, /Community Room.*no address/);
  assert.strictEqual(byUid(rows, "untitled").status, "pending_review");
  assert.match(byUid(rows, "untitled").note, /no title/);
  assert.strictEqual(byUid(rows, "backwards").status, "pending_review");
  assert.match(byUid(rows, "backwards").note, /end before start/);
  for (const r of rows) assert.ok(!("_publication" in r), "internal marker never reaches the database");
  console.log("PASS: Lathrup closures excluded; meetings, unplaced and contradictory events are held with a reason");

  // --- An event with a stated address and only optional data missing is NOT held
  const addr = byUid(rows, "addr");
  assert.strictEqual(addr.status, "approved", "a verified event (address stated; no description, image or end time) publishes");
  assert.ok(!("note" in addr), "a published row gets no hold note");
  assert.strictEqual(addr.description, null, "nothing invented");
  console.log("PASS: missing optional data alone does not hold an event");

  // --- A reviewer's decision on an existing row is never changed, and its note is not rewritten
  rows = await poll({ feed: LV, events: lvEvents, stored: [{ external_id: "feed-fs-lv-meet", status: "approved" }, { external_id: "feed-fs-lv-dinner", status: "rejected" }] });
  assert.strictEqual(byUid(rows, "meet").status, "approved", "an approved row stays approved");
  assert.strictEqual(byUid(rows, "dinner").status, "rejected", "a rejected row stays rejected");
  assert.ok(!("note" in byUid(rows, "meet")), "an existing row's note is not rewritten");
  console.log("PASS: existing rows keep their status and note");

  // --- Every other feed behaves exactly as before
  rows = await poll({ feed: OTHER, events: lvEvents });
  assert.ok(byUid(rows, "closed"), "other feeds do not skip City Hall closures");
  assert.ok(rows.every((r) => r.status === "approved"), "other feeds still publish new rows as approved");
  assert.ok(rows.every((r) => !("note" in r) && !("_publication" in r)));
  console.log("PASS: a feed without a policy is unchanged");

  // --- Policy matching is exact
  const { policyFor } = require(`${REPO_DIR}/api/_lib/feed-publication.js`);
  assert.ok(policyFor(LV));
  assert.strictEqual(policyFor(OTHER), null);
  assert.strictEqual(policyFor({ feed_url: "https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/12345/cms/events/generate_ical" }), null, "another Thrillshare district is not Lathrup");
  console.log("PASS: policy applies to the Lathrup feed only");
}
run().catch((e) => { console.error(e); process.exit(1); });
