// test/cron-dossin-publication-gate.test.js — the first connector on the shared
// publication gate (api/_lib/event-contract.js).
//
// Runs the REAL cron-dossin.js handler against a mocked source page and a
// mocked PostgREST, and reads back exactly what it sent to the database:
//   SOURCE EVENT -> NORMALIZE -> VALIDATE -> STATUS DECISION -> WRITE
// The connector no longer chooses a new row's status. A valid listing is
// written at the connector's trust tier; a doubtful one is written
// non-public; an existing row keeps its stored status; nothing is deleted;
// no start time is ever invented; and the run log records what the gate did.
//
// Plain Node assert. Run: node test/cron-dossin-publication-gate.test.js
"use strict";
const assert = require("assert");
const { strictWriteResponse } = require("./fixtures/mock-postgrest.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";
const SOURCE_URL = "https://www.detroithistorical.org/events";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fresh() {
  for (const m of ["api/cron-dossin.js", "api/_lib/run-log.js", "api/_lib/venue-lookup.js", "api/_lib/source-slugs.js", "api/_lib/event-contract.js", "api/_lib/status-lookup.js", "api/_lib/event-upsert.js"])
    delete require.cache[require.resolve(`${REPO_DIR}/${m}`)];
  return require(`${REPO_DIR}/api/cron-dossin.js`);
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });

// "October 12, 2026, 2:00pm - 4:00pm" for today + n days (the gate judges dates against the real clock).
function when(n, time) {
  const d = new Date(Date.now() + n * 86400000);
  const date = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  return { date: time === null ? date : `${date}, ${time || "2:00pm - 4:00pm"}`, iso: d.toISOString().slice(0, 10) };
}
const block = (title, w) => `<div>${title}</div><div>Dossin Great Lakes Museum</div><div>${w.date}</div><div>Learn More</div>`;

function harness(html, { existing = [] } = {}) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || "GET", body: opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : null });
    if (url === SOURCE_URL) return { ok: true, status: 200, text: async () => html };
    if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "POST") return { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    if (url.includes("/rest/v1/source_runs") && opts.method === "PATCH") return { ok: true, status: 204, json: async () => ({}) };
    if (url.includes("/rest/v1/events") && (!opts.method || opts.method === "GET")) return { ok: true, status: 200, json: async () => existing };
    if (url.includes("/rest/v1/events") && opts.method === "POST") return strictWriteResponse(url, opts);
    throw new Error("unmocked URL in test: " + url);
  };
  return calls;
}
const writes = (calls) => calls.filter((c) => c.url.includes("/rest/v1/events") && c.method === "POST").flatMap((c) => c.body);
const patch = (calls) => calls.find((c) => c.url.includes("/rest/v1/source_runs") && c.method === "PATCH").body;

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;
  const handler0 = fresh();
  const { dossinExternalId } = handler0;

  // ---- 1. valid event: written at the connector's trust tier (approved) -------
  {
    const handler = fresh();
    const w = when(6);
    const calls = harness(block("Guided Tour", w));
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200);
    const rows = writes(calls);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].status, "approved");
    assert.strictEqual(rows[0].internal_note, undefined);
    assert.strictEqual(rows[0].external_id, dossinExternalId(w.iso, "Guided Tour"), "identity key unchanged");
    const gate = patch(calls).session_data.publication_gate;
    assert.deepStrictEqual([gate.gate_version, gate.new_published, gate.new_held, gate.skipped], [1, 1, 0, 0]);
    assert.strictEqual(res._body.gate.new_published, 1, "the response reports the gate's decision");
  }
  console.log("PASS: a valid Dossin listing is written approved, identity unchanged, and the run log records the gate summary");

  // ---- 2. doubtful listings are written NON-public --------------------------
  {
    const handler = fresh();
    const calls = harness([
      block("Private tour by appointment", when(7)),   // eligibility uncertain
      block("TBA", when(8)),                            // placeholder title
      block("Time Capsule Exhibit", when(2000)),        // implausible date (typo year)
      block("Open House", when(9)),                     // fine
    ].join(""));
    const res = makeRes();
    await handler({ headers: {} }, res);
    const rows = Object.fromEntries(writes(calls).map((r) => [r.title, r]));
    assert.strictEqual(rows["Private tour by appointment"].status, "pending_review");
    assert.match(rows["Private tour by appointment"].internal_note, /^GATE v1 HOLD: ELIGIBILITY_UNCERTAIN/);
    assert.strictEqual(rows["TBA"].status, "pending_review");
    assert.match(rows["TBA"].internal_note, /TITLE_PLACEHOLDER/);
    assert.strictEqual(rows["Time Capsule Exhibit"].status, "pending_review");
    assert.match(rows["Time Capsule Exhibit"].internal_note, /START_DATE_IMPLAUSIBLE/);
    assert.strictEqual(rows["Open House"].status, "approved", "a valid sibling in the same batch is unaffected");
    assert.ok(!writes(calls).some((r) => r.status === "approved" && /GATE/.test(r.internal_note || "")), "nothing held is approved");
    const gate = patch(calls).session_data.publication_gate;
    assert.deepStrictEqual([gate.new_published, gate.new_held], [1, 3]);
    assert.ok(gate.by_issue.TITLE_PLACEHOLDER === 1 && gate.by_issue.ELIGIBILITY_UNCERTAIN === 1);
  }
  console.log("PASS: uncertain eligibility, a placeholder title and an implausible date are written pending_review with a private breadcrumb; the valid sibling publishes");

  // ---- 3. an existing row keeps its stored status; history is never deleted ---
  {
    const handler = fresh();
    const w = when(10);
    const id = dossinExternalId(w.iso, "TBA");
    const calls = harness(block("TBA", w), { existing: [{ external_id: id, status: "rejected" }] });
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(writes(calls).length, 0, "title is a required column: the row is not written, the stored row (and its rejection) stands");
    assert.ok(!calls.some((c) => c.method === "DELETE"), "no delete of any kind");
    const g = patch(calls).session_data.publication_gate;
    assert.deepStrictEqual([g.existing_skipped, g.existing_with_issues], [1, 1], "the problem is recorded for review");
  }
  console.log("PASS: an existing row with a bad required value is not rewritten (stored status stands), nothing is deleted, the issue is recorded");

  // ---- 3b. an existing row with only a bad NULLABLE value is updated without it ----
  {
    const handler = fresh();
    const w = when(11);
    const id = dossinExternalId(w.iso, "Guided Tour");
    const calls = harness(block("Guided Tour", w), { existing: [{ external_id: id, status: "approved" }] });
    await handler({ headers: {} }, makeRes());
    const rows = writes(calls);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].status, "approved");
    assert.strictEqual(rows[0].internal_note, undefined);
  }
  console.log("PASS: an existing clean row is updated at its stored status with no breadcrumb");

  // ---- 4. no start time is invented -----------------------------------------
  {
    const handler = fresh();
    const calls = harness(block("Open Deck Day", when(5, null)));   // date-only listing
    const res = makeRes();
    await handler({ headers: {} }, res);
    const row = writes(calls)[0];
    assert.strictEqual(row.status, "approved", "a date-only listing is legitimate for this source");
    assert.ok(!("time_display" in row), "no time in the source, none sent (and a stored time would be kept)");
  }
  console.log("PASS: a date-only listing is written without any time_display; none is invented");

  // ---- 5. the gate cannot be bypassed from the connector --------------------
  {
    const fs = require("fs");
    const src = fs.readFileSync(`${REPO_DIR}/api/cron-dossin.js`, "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(/applyPublicationGate\(/.test(src));
    assert.ok(!/status:\s*existingStatusByExternalId\.get\(/.test(src), "the connector no longer maps status itself");
    assert.ok(/upsertEventRows\([^)]*rowsWithStatus\)/.test(src) && /const rowsWithStatus = gate\.rows/.test(src), "only the gate's rows reach the write");
  }
  console.log("PASS: the connector writes only the gate's rows");

  console.log("\nAll cron-dossin.js publication-gate integration tests passed.");
}
run().catch((e) => { console.error("FAIL:", e); process.exit(1); });
