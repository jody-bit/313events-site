// test/nightlife-connectors.test.js — #177 Nightlife rule as wired into the GottaGacha, Eventbrite and Localist connectors.
// Owner decision 2026-10-19 22:30Z: prospective only (new rows and pending_review rows), never approves or publishes,
// never reclassifies an approved or rejected row, never changes a status, confident source categories untouched.
// Plain Node assert. Run: node test/nightlife-connectors.test.js
"use strict";
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");
const REPO_DIR = process.env.REPO_DIR || process.cwd();

// Same frozen clock as test/cron-gottagacha-runlog.test.js (the handler drops past events).
const RealDate = Date;
const FROZEN_NOW = RealDate.parse("2026-10-05T15:00:00Z");
global.Date = class extends RealDate {
  constructor(...args) { if (args.length === 0) super(FROZEN_NOW); else super(...args); }
  static now() { return FROZEN_NOW; }
};

function makeRes() {
  return { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
}
function fresh(rel) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(`${REPO_DIR}/api/`)) delete require.cache[k];
  return require(`${REPO_DIR}/${rel}`);
}
const gg = (id, title, description, eventDate, startTime, endTime) => ({ id, title, description, eventDate, startTime, endTime, recurrenceType: null, location: "Gotta Gacha" });

async function gottagacha() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const handler = fresh("api/cron-gottagacha.js");

  const events = [
    gg("corridor", "Corridor Cyberpunk Rave", "Corridor Cyberpunk Rave takes place at GottaGacha on December 5 at 9:00 PM – 11:00 PM.", "2026-12-05", "21:00:00", "23:00:00"),
    gg("glotaku", "Glotaku New Year Rave", "Glotaku New Year Rave takes place at GottaGacha on December 31.", "2026-12-31", "22:00:00", "02:00:00"),
    gg("newrave", "Neon Warehouse Rave", "", "2026-11-14", "22:00:00", "02:00:00"),
    gg("youmacon", "Youmacon After Party", "Youmacon After Party takes place at GottaGacha on October 29 at 7:00 PM – 2:00 AM.", "2026-10-29", "19:00:00", "02:00:00"),
    gg("karaoke", "Karaoke Night [OPEN]", "Karaoke Night [OPEN] takes place at GottaGacha.", "2026-10-21", "18:00:00", "23:59:00"),
    gg("fnm", "Friday Night Magic", "", "2026-10-23", "21:00:00", "02:00:00"),
    gg("movie", "Spooky Movie Night", "", "2026-10-23", "22:00:00", "02:00:00"),
    gg("djshadow", "DJ Shadow", "", "2026-11-20", "20:00:00", null),
  ];
  const existing = [
    { external_id: "gottagacha-corridor-2026-12-05", status: "pending_review" },
    { external_id: "gottagacha-glotaku-2026-12-31", status: "approved" },
  ];
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return null; } })() : null });
    if (url.includes("www.gottagacha.com/api/events")) return { ok: true, status: 200, json: async () => ({ events }) };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs")) return { ok: true, status: 204, json: async () => ({}) };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => existing };
    if (url.includes("/rest/v1/events") && opts.method === "POST") return strictWriteResponse(url, opts);
    throw new Error("unmocked URL in test: " + url);
  };
  const res = makeRes();
  await handler({ headers: {} }, res);
  const rows = calls.filter((c) => c.url.includes("/rest/v1/events") && c.opts.method === "POST").flatMap((c) => c.body || []);
  const by = (needle) => rows.find((r) => r.external_id.includes(needle));
  assert.ok(rows.length >= 8, "all eight events were written, got " + rows.length);

  const corridor = by("corridor");
  assert.strictEqual(corridor.category, "nightlife", "Corridor is classified Nightlife");
  assert.strictEqual(corridor.status, "pending_review", "Corridor keeps its pending_review status (owner hold preserved, never approved)");

  const glotaku = by("glotaku");
  assert.strictEqual(glotaku.category, "community", "an APPROVED row keeps the catch-all category: no silent reclassification");
  assert.strictEqual(glotaku.status, "approved", "its status is untouched");

  const newrave = by("newrave");
  assert.strictEqual(newrave.category, "nightlife", "a NEW advertised rave is classified Nightlife");
  assert.strictEqual(newrave.status, "pending_review", "a new row stays pending_review: the rule never approves or publishes");
  assert.ok(/Not approved/.test(newrave.internal_note || ""), "its breadcrumb says it was not approved");

  for (const k of ["youmacon", "karaoke"]) {
    assert.strictEqual(by(k).category, "community", k + " is unchanged by the rule");
    assert.strictEqual(by(k).status, "pending_review");
  }
  assert.strictEqual(by("fnm").category, "gaming", "Friday Night Magic is mapped by the gaming rule before the Nightlife rule is consulted");
  assert.strictEqual(by("movie").category, "film", "Spooky Movie Night stays film");
  const dj = by("djshadow");
  assert.strictEqual(dj.category, "community", "DJ Shadow is not classified");
  assert.strictEqual(dj.status, "pending_review", "DJ Shadow stays routed to a person");
  assert.ok(/Nightlife vs music/.test(dj.internal_note || ""), "with the nightlife-vs-music reason");
  for (const r of rows) assert.ok(!Object.keys(r).some((k) => k.startsWith("_")), "no internal flag leaks into the upsert body");
  console.log("PASS: GottaGacha — Corridor Nightlife and still pending; approved Glotaku untouched; new rave Nightlife but pending; Youmacon, Karaoke, FNM, movie night unchanged; DJ Shadow held");
}

function eventbrite() {
  const mod = fresh("api/cron-eventbrite.js");
  const eb = (name, desc, start, end, venue) => ({ id: "e" + name.length, name: { text: name }, description: { text: desc }, start: { local: start }, end: { local: end }, online_event: false, venue: venue ? { name: venue } : null, url: "https://eventbrite.example/e", is_free: false });
  const rave = mod.parseEvent(eb("Techno Rave at the Warehouse", "", "2026-11-14T22:00:00", "2026-11-15T03:00:00", "Eastern Warehouse"));
  assert.strictEqual(rave.category, "nightlife");
  assert.strictEqual(rave._defaultStatusForRow, "pending_review", "never approves");
  assert.strictEqual(rave._nightlifeClassified, true);
  const kids = mod.parseEvent(eb("Kids Rave Party", "", "2026-11-14T22:00:00", "2026-11-15T03:00:00", "Library Hall"));
  assert.strictEqual(kids.category, "community", "family/institutional context is left alone");
  const plain = mod.parseEvent(eb("Pottery Class", "", "2026-11-14T18:00:00", "2026-11-14T20:00:00", "Studio"));
  assert.strictEqual(plain.category, "community");
  assert.ok(!/Nightlife/.test(plain.internal_note), "no nightlife note when there is no signal");
  console.log("PASS: Eventbrite — advertised rave classified Nightlife and pending; family context and ordinary events unchanged");
}

function localist() {
  const L = fresh("api/_lib/localist-rows.js");
  const { event, instance, PLACES } = require("./fixtures/localist-api.js");
  const TENANT = { tenantSlug: "macomb", apiBase: "https://events.macomb.edu", source: "Macomb Community College", publicAudiences: ["General Public"], defaultStatus: "pending_review" };
  const wrap = (is) => is.map((i) => ({ event_instance: i }));
  const rowsOf = (title, cat) => {
    const e = event(title, { instances: [instance("2026-11-07", "22:00", "23:59")], ...PLACES.MACOMB_CENTER });
    const v = L.eventEligibility(e, TENANT);
    assert.ok(v.eligible, v.reason);
    return L.rowsForEvent({ event: e, instanceWrappers: wrap(e._schedule || [instance("2026-11-07", "22:00", "23:59")]), place: v.place, tenant: TENANT, windowStart: "2026-10-05", windowEnd: "2027-01-03", categoryFromText: () => cat });
  };
  const [rave] = rowsOf("Campus Neon Rave", null);
  assert.strictEqual(rave.category, "nightlife", "a new catch-all row with an advertised rave is Nightlife");
  assert.strictEqual(rave._categoryConfident, false, "still not 'confident': an existing stored category is sent back, never overwritten");
  assert.strictEqual(rave._defaultStatusForRow, "pending_review", "status untouched");
  const [conf] = rowsOf("Campus Neon Rave", "music");
  assert.strictEqual(conf.category, "music", "a source-confident category is never overridden");
  const [plain] = rowsOf("Student Recital", null);
  assert.strictEqual(plain.category, "community");
  console.log("PASS: Localist — new advertised rave is Nightlife; confident category and plain events unchanged");
}

(async () => {
  await gottagacha();
  eventbrite();
  localist();
})().catch((e) => { console.error(e); process.exit(1); });
