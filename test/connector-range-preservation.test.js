// test/connector-range-preservation.test.js — MC-RANGE (#141): a VisitDetroit refresh rolls start/end with the
// source and must not narrow a stored range below evidenced occurrence dates (Zoo Boo, Cider in the City) or a
// classified continuous range. Unit tests for api/_lib/range-preservation.js, then the real handler end to end
// against a mocked network: the upsert payload keeps the evidenced range, and carries no date_semantics /
// occurrence_dates / recurrence_evidence key (those are never overwritten by a connector).
//
// Run: node test/connector-range-preservation.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { preserveRange } = require(`${REPO_DIR}/api/_lib/range-preservation.js`);
const ED = require(`${REPO_DIR}/event-dates.js`);

const rec = (start, end, occ) => ({ start_date: start, end_date: end, date_semantics: "recurring", occurrence_dates: occ });
const TODAY = "2026-10-17";

// --- 1. Zoo Boo: organizer evidence Oct 16-18 and 23-25; source window rolled to Oct 23-24 ---
{
  const existing = rec("2026-10-16", "2026-10-25", ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-23", "2026-10-24", "2026-10-25"]);
  const r = preserveRange({ start_date: "2026-10-23", end_date: "2026-10-24" }, existing, TODAY);
  assert.deepStrictEqual([r.start_date, r.end_date, r.action], ["2026-10-16", "2026-10-25", "widened-to-evidence"]);
  assert.strictEqual(r.conflict.kind, "incoming-range-excludes-evidenced-occurrences");
  assert.deepStrictEqual(r.conflict.incoming, ["2026-10-23", "2026-10-24"]);
  // the evidenced dates are inside the stored range again, so the shared rule raises no review reason
  assert.strictEqual(ED.reviewReason({ ...existing, start_date: r.start_date, end_date: r.end_date }), null);
  assert.notStrictEqual(ED.reviewReason({ ...existing, start_date: "2026-10-23", end_date: "2026-10-24" }), null, "before: occurrence-outside-range");
  // inside-range days that are NOT evidenced stay unattendable: the range never implies daily availability
  const after = { ...existing, start_date: r.start_date, end_date: r.end_date };
  assert.strictEqual(ED.isActiveOn(after, "2026-10-20"), false);
  assert.strictEqual(ED.isActiveOn(after, "2026-10-25"), true);
}
console.log("PASS: 1. Zoo Boo keeps Oct 16-25 evidenced range; Oct 19-22 stay unattendable");

// --- 2. the CS001 v3 shape: Zoo Boo evidenced Oct 23, 24 only; later narrowing to one day ---
{
  const existing = rec("2026-10-23", "2026-10-24", ["2026-10-23", "2026-10-24"]);
  const r = preserveRange({ start_date: "2026-10-24", end_date: null }, existing, TODAY);
  assert.deepStrictEqual([r.start_date, r.end_date], ["2026-10-23", "2026-10-24"]);
  // incoming already covers the evidence: untouched, no conflict
  const same = preserveRange({ start_date: "2026-10-23", end_date: "2026-10-24" }, existing, TODAY);
  assert.deepStrictEqual([same.start_date, same.end_date, same.action, same.conflict], ["2026-10-23", "2026-10-24", "incoming", null]);
  // a source that reaches beyond the evidence is NOT trimmed to it, and nothing past the source or the evidence is added
  const wider = preserveRange({ start_date: "2026-10-22", end_date: "2026-10-26" }, existing, TODAY);
  assert.deepStrictEqual([wider.start_date, wider.end_date, wider.action], ["2026-10-22", "2026-10-26", "incoming"]);
}
console.log("PASS: 2. covering incoming ranges pass through; no date outside source or evidence is invented");

// --- 3. Cider in the City: stored Oct 11-18, evidenced Oct 17, 18; source rolls to Oct 18 alone ---
{
  const existing = rec("2026-10-11", "2026-10-18", ["2026-10-17", "2026-10-18"]);
  const r = preserveRange({ start_date: "2026-10-18", end_date: null }, existing, TODAY);
  assert.deepStrictEqual([r.start_date, r.end_date, r.action], ["2026-10-17", "2026-10-18", "widened-to-evidence"]);
  assert.strictEqual(ED.reviewReason({ ...existing, start_date: r.start_date, end_date: r.end_date }), null);
  assert.deepStrictEqual(ED.expand({ ...existing, start_date: r.start_date, end_date: r.end_date }), ["2026-10-17", "2026-10-18"]);
  // a single evidenced day collapses end_date to NULL, the connector's own convention
  const one = preserveRange({ start_date: "2026-10-19", end_date: null }, rec("2026-10-18", "2026-10-19", ["2026-10-19"]), TODAY);
  assert.deepStrictEqual([one.start_date, one.end_date, one.action], ["2026-10-19", null, "incoming"]);
}
console.log("PASS: 3. Cider keeps Oct 17 and 18 as the source rolls to Oct 18");

// --- 4. unclassified, new, or non-evidenced rows keep today's behaviour (no unrelated change) ---
{
  const inc = { start_date: "2026-10-23", end_date: "2026-10-24" };
  assert.strictEqual(preserveRange(inc, undefined, TODAY).action, "incoming");
  assert.strictEqual(preserveRange(inc, { start_date: "2026-10-16", end_date: "2026-10-25", date_semantics: null, occurrence_dates: null }, TODAY).action, "incoming");
  assert.strictEqual(preserveRange(inc, { start_date: "2026-10-16", end_date: "2026-10-25", date_semantics: "single", occurrence_dates: null }, TODAY).action, "incoming");
  assert.strictEqual(preserveRange(inc, rec("2026-10-16", "2026-10-25", null), TODAY).action, "incoming", "recurring with no usable occurrence dates has no evidence to protect");
  assert.strictEqual(preserveRange(inc, rec("2026-10-16", "2026-10-25", ["bad", "2026-13"]), TODAY).action, "incoming", "malformed dates are not evidence");
  assert.deepStrictEqual(preserveRange({ start_date: "2026-10-18", end_date: "2026-10-18" }, undefined, TODAY).end_date, null);
}
console.log("PASS: 4. unclassified / new / single rows are unchanged");

// --- 5. classified continuous range: a narrower source is held and reported, a wider one extends ---
{
  const existing = { start_date: "2026-10-17", end_date: "2026-11-10", date_semantics: "continuous", occurrence_dates: null };
  const narrowEnd = preserveRange({ start_date: "2026-10-17", end_date: "2026-10-25" }, existing, TODAY);
  assert.deepStrictEqual([narrowEnd.start_date, narrowEnd.end_date, narrowEnd.action], ["2026-10-17", "2026-11-10", "held-existing"]);
  assert.strictEqual(narrowEnd.conflict.kind, "incoming-range-narrower-than-classified-continuous-range");
  const extended = preserveRange({ start_date: "2026-10-17", end_date: "2026-11-15" }, existing, TODAY);
  assert.deepStrictEqual([extended.end_date, extended.action], ["2026-11-15", "incoming"], "source evidence of a longer run still extends the row");
  // start rolling past a finished day is roll-off, not a conflict, and nothing is reported
  const rolled = preserveRange({ start_date: "2026-10-18", end_date: "2026-11-10" }, { ...existing, start_date: "2026-10-03" }, TODAY);
  assert.deepStrictEqual([rolled.start_date, rolled.action, rolled.conflict], ["2026-10-03", "held-existing", null]);
}
console.log("PASS: 5. continuous ranges are held against narrower sources, extended by wider ones");

// --- 6. the real handler, mocked network: payload keeps the range and never carries the evidence columns ---
process.env.SUPABASE_URL = "https://example-staging.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
delete process.env.CRON_SECRET; delete process.env.VERCEL_ENV;
const sec = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
const hit = (id, title, start, end) => ({
  id, title, content: "d", eventCategories: ["Kids & Family"], uri: `/events/${id}`,
  address: ["Detroit Zoo", "8450 W 10 Mile Rd", "Royal Oak, Michigan 48067"], startDate: start, endDate: end, isAllDay: false,
  readableRepeatRule: "Weekly", _geoloc: { lat: 42.4895, lng: -83.1446 },
});
const HITS = [
  hit(49564645, "Zoo Boo", sec(2026, 10, 23, 15, 0), sec(2026, 10, 24, 20, 30)),
  hit(50116751, "Cider in the City", sec(2026, 10, 18, 11, 0), sec(2026, 10, 18, 23, 30)),
  hit(77700001, "Brand New Thing", sec(2026, 10, 30, 18, 0), sec(2026, 10, 31, 22, 0)),
];
const EXISTING = [
  { external_id: "vd-49564645", status: "approved", venue_city_raw: "Royal Oak", ...rec("2026-10-16", "2026-10-25", ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-23", "2026-10-24", "2026-10-25"]) },
  { external_id: "vd-50116751", status: "approved", venue_city_raw: "Detroit", ...rec("2026-10-11", "2026-10-18", ["2026-10-17", "2026-10-18"]) },
];
const upserts = [];
const json = (b, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => b, text: async () => JSON.stringify(b) });
global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes("algolia")) return json({ hits: HITS });
  if (url.includes("/rest/v1/venues")) return json([]);
  if (url.includes("source=neq.")) return json([]);
  if (url.includes("external_id=in.(")) {
    assert.ok(/select=[^&]*date_semantics/.test(url) && /select=[^&]*occurrence_dates/.test(url), "lookup must read the evidence columns");
    return json(EXISTING);
  }
  if (opts.method === "POST" && url.includes("/rest/v1/events")) { upserts.push(JSON.parse(opts.body)); return json([]); }
  return json([]);
};
const quiet = console.warn; console.warn = () => {};
const handler = require(`${REPO_DIR}/api/cron-visitdetroit.js`);
(async () => {
  let out;
  const res = { status(c) { this.code = c; return this; }, json(b) { out = b; return this; }, setHeader() {} };
  await handler({ headers: {}, query: {}, method: "GET" }, res);
  console.warn = quiet;
  assert.strictEqual(res.code, 200, JSON.stringify(out));
  const rows = upserts.flat();
  const by = Object.fromEntries(rows.map((r) => [r.external_id, r]));
  assert.deepStrictEqual([by["vd-49564645"].start_date, by["vd-49564645"].end_date], ["2026-10-16", "2026-10-25"]);
  assert.deepStrictEqual([by["vd-50116751"].start_date, by["vd-50116751"].end_date], ["2026-10-17", "2026-10-18"]);
  assert.deepStrictEqual([by["vd-77700001"].start_date, by["vd-77700001"].end_date], ["2026-10-30", "2026-10-31"], "new row: incoming range as-is");
  for (const r of rows) for (const k of ["date_semantics", "occurrence_dates", "recurrence_evidence"]) assert.ok(!(k in r), `${r.external_id} must not carry ${k}`);
  assert.strictEqual(out.rangesPreserved, 2);
  console.log("PASS: 6. handler keeps Zoo Boo / Cider ranges, leaves new rows alone, never writes evidence columns");
  console.log("OK connector-range-preservation");
})().catch((e) => { console.warn = quiet; console.error(e); process.exit(1); });
