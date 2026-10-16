// test/admin-pending-queue-date-filter.test.js
//
// Admin submissions queue date filter (owner decision 2026-10-14, after 734 already-ended City of Dearborn rows
// filled the pending queue). GET /api/admin-events (default) lists pending_review rows whose effective end has not
// passed; GET /api/admin-events?expired=1 is the historical view of the ended ones. READ-SIDE ONLY: no status is
// written, and a row's membership in a view depends only on its dates.
//
// Covers: ended row excluded from the default queue; ended row listed in the historical view; upcoming row visible;
// today's row visible; multi-day row uses its end date; recurring row kept; unknown/unreadable dates never hidden;
// non-pending rows never listed; no write of any kind; the queue is read in full when it exceeds the 1,000-row cap
// even when every row shares one created_at.
//
// Run: node test/admin-pending-queue-date-filter.test.js
"use strict";
require("./fixtures/freeze-clock.js").freezeClock("2026-10-14T16:00:00Z"); // noon in Detroit
const assert = require("assert");
const { makeMockPostgrest } = require("./fixtures/mock-postgrest.js");
const { isExpiredPending } = require("../api/_lib/pending-queue.js");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshHandler() {
  for (const m of ["admin-events.js", "_lib/pending-queue.js"]) delete require.cache[require.resolve(`${REPO_DIR}/api/${m}`)];
  return require(`${REPO_DIR}/api/admin-events.js`);
}
const makeRes = () => ({ _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } });

async function get(events, query) {
  const db = makeMockPostgrest({ events }, { cap: 1000 });
  const calls = [];
  global.fetch = async (url, init) => { calls.push({ url: String(url), method: (init && init.method) || "GET" }); return db.fetch(String(url), init); };
  const res = makeRes();
  await freshHandler()({ method: "GET", query, headers: { "x-admin-secret": process.env.ADMIN_SECRET } }, res);
  assert.strictEqual(res._status, 200, JSON.stringify(res._body));
  return { ids: res._body.events.map((e) => e.id).sort(), calls };
}

const P = (id, start_date, extra) => ({ id, title: id, status: "pending_review", start_date, end_date: null, is_recurring: false, created_at: "2026-10-13T22:01:18Z", ...extra });

async function run() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.ADMIN_SECRET = "fixture-admin-secret"; // a test value for this fixture only

  const events = [
    P("ended", "2026-03-01"),
    P("yesterday", "2026-10-13"),
    P("today", "2026-10-14"),
    P("upcoming", "2026-11-20"),
    P("span-running", "2026-09-01", { end_date: "2026-10-31" }),
    P("span-over", "2026-08-01", { end_date: "2026-08-09" }),
    P("recurring-master", "2026-01-05", { is_recurring: true }),
    P("no-date", null),
    P("bad-date", "TBD"),
    P("bad-end", "2026-03-01", { end_date: "soon" }),
    { ...P("approved-old", "2026-03-01"), status: "approved" },
    { ...P("rejected-old", "2026-03-01"), status: "rejected" },
  ];

  const def = await get(events, {});
  assert.deepStrictEqual(def.ids, ["bad-date", "bad-end", "no-date", "recurring-master", "span-running", "today", "upcoming"]);
  console.log("PASS: default queue: upcoming, today, running multi-day, recurring and unknown dates visible; ended rows excluded");

  const hist = await get(events, { expired: "1" });
  assert.deepStrictEqual(hist.ids, ["ended", "span-over", "yesterday"]);
  console.log("PASS: historical view lists exactly the ended pending rows");

  assert.ok(![...def.ids, ...hist.ids].some((id) => /approved-old|rejected-old/.test(id)), "only pending rows are ever listed");
  const allCalls = [...def.calls, ...hist.calls];
  assert.ok(allCalls.every((c) => c.method === "GET"), "the queue read performs no write");
  console.log("PASS: reviewer decisions untouched: only pending rows listed, no writes");

  // Same two views partition the pending set: nothing falls between them.
  assert.strictEqual(def.ids.length + hist.ids.length, events.filter((e) => e.status === "pending_review").length);
  assert.strictEqual(isExpiredPending({ start_date: "2026-10-14" }, "2026-10-14"), false);
  assert.strictEqual(isExpiredPending({ start_date: "2026-10-13" }, "2026-10-14"), true);

  // The admin page offers the historical view (a visible button) and keeps it out of the tab badge.
  const page = require("fs").readFileSync(`${REPO_DIR}/admin.html`, "utf8");
  assert.ok(/id="queueViewBtn"[^>]*onclick="toggleQueueView\(\)"/.test(page), "a button switches to the historical view");
  assert.ok(page.includes("'/api/admin-events' + (QUEUE_EXPIRED_VIEW ? '?expired=1' : '')"), "the button loads ?expired=1");
  // Stage 2 (owner decision 2026-10-16): the badge counts only actionable records, still never in the historical view.
  assert.ok(page.includes("if (!QUEUE_EXPIRED_VIEW) setTabBadge('submissions', badgeCount);"), "the badge counts the current queue only");
  console.log("PASS: admin page links to the historical view");

  // Paging: 2,300 pending rows with one shared created_at, ended rows scattered through them.
  const many = [];
  for (let i = 0; i < 2300; i++) many.push(P(`m-${String(i).padStart(5, "0")}`, i % 3 === 0 ? "2026-02-01" : "2026-12-01"));
  const big = await get(many, {});
  const bigHist = await get(many, { expired: "1" });
  const expectEnded = many.filter((e) => e.start_date === "2026-02-01").length;
  assert.strictEqual(bigHist.ids.length, expectEnded);
  assert.strictEqual(big.ids.length, many.length - expectEnded);
  assert.strictEqual(new Set([...big.ids, ...bigHist.ids]).size, many.length, "every pending row is in exactly one view");
  console.log("PASS: a queue larger than the 1,000-row cap is read in full (shared created_at)");
}

run().then(() => console.log("\nall admin-pending-queue-date-filter tests passed")).catch((e) => { console.error(e); process.exit(1); });
