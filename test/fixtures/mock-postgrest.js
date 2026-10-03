// test/fixtures/mock-postgrest.js — a small in-memory stand-in for the
// Supabase REST (PostgREST) API, used by the paged-loading tests.
//
// It exists to reproduce the ONE production behavior those tests are about
// (2026-10-03): the API returns at most `cap` rows per request no matter
// what `limit=` asks for, with a success status and no error. It also
// mirrors the details measured against production the same day:
//   - `Prefer: count=exact` puts the true total in Content-Range
//     ("0-999/2953"); without it the total is "*".
//   - An offset past the end returns 200 + [] without a count, and
//     416 (PGRST103) when a count was requested.
//   - `Range: 0-0` returns a single row.
// An unsupported filter throws rather than being ignored, so a test can
// never pass by accident because a filter silently did nothing.
"use strict";

function makeMockPostgrest(tables, options) {
  const cap = (options && options.cap) || 1000;
  const exposeCount = !options || options.exposeCount !== false;
  // failure(request) -> an HTTP status to fail with, or null to succeed.
  const failure = (options && options.failure) || (() => null);
  const log = [];

  const OPS = {
    eq: (a, b) => String(a) === b,
    gte: (a, b) => a != null && String(a) >= b,
    gt: (a, b) => a != null && String(a) > b,
    lte: (a, b) => a != null && String(a) <= b,
    lt: (a, b) => a != null && String(a) < b,
  };

  function applyFilter(rows, column, expr) {
    if (expr === "not.is.null") return rows.filter((r) => r[column] != null);
    if (expr === "is.null") return rows.filter((r) => r[column] == null);
    const dot = expr.indexOf(".");
    const op = expr.slice(0, dot);
    const value = expr.slice(dot + 1);
    if (!OPS[op]) throw new Error(`mock-postgrest: unsupported filter ${column}=${expr}`);
    return rows.filter((r) => OPS[op](r[column], value));
  }

  function applyOrder(rows, orderParam) {
    const keys = orderParam.split(",").map((part) => {
      const [col, dir] = part.split(".");
      return { col, desc: dir === "desc" };
    });
    return [...rows].sort((a, b) => {
      for (const { col, desc } of keys) {
        const av = a[col], bv = b[col];
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return desc ? -cmp : cmp;
      }
      return 0;
    });
  }

  function respond(status, body, contentRange) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => (name.toLowerCase() === "content-range" ? contentRange : null) },
      json: async () => body,
    };
  }

  async function mockFetch(url, init) {
    const headers = (init && init.headers) || {};
    const parsed = new URL(url);
    const table = parsed.pathname.split("/").pop();
    const request = { url, table, headers: { ...headers }, index: log.length };
    log.push(request);

    const failStatus = failure(request);
    if (failStatus) return respond(failStatus, { message: "mock failure" }, null);

    if (!tables[table]) throw new Error(`mock-postgrest: unknown table ${table}`);
    let rows = tables[table];
    let limit = null, offset = 0, order = null;
    for (const [key, value] of parsed.searchParams.entries()) {
      if (key === "select") continue;
      if (key === "limit") { limit = parseInt(value, 10); continue; }
      if (key === "offset") { offset = parseInt(value, 10); continue; }
      if (key === "order") { order = value; continue; }
      rows = applyFilter(rows, key, value);
    }
    if (order) rows = applyOrder(rows, order);

    const total = rows.length;
    const wantsCount = /count=exact/.test(headers.Prefer || headers.prefer || "") && exposeCount;
    const rangeHeader = headers.Range || headers.range;
    if (rangeHeader) {
      const [from, to] = rangeHeader.split("-").map((n) => parseInt(n, 10));
      offset = from;
      limit = to - from + 1;
    }
    const totalText = wantsCount ? String(total) : "*";

    if (offset >= total) {
      if (total === 0) return respond(200, [], `*/${totalText}`);
      if (wantsCount) return respond(416, { code: "PGRST103" }, `*/${totalText}`);
      return respond(200, [], "*/*");
    }
    // THE BEHAVIOR UNDER TEST: never more than `cap` rows, whatever was asked for.
    const take = Math.min(limit == null ? cap : limit, cap);
    const page = rows.slice(offset, offset + take);
    const contentRange = `${offset}-${offset + page.length - 1}/${totalText}`;
    const partial = wantsCount && page.length < total;
    return respond(partial ? 206 : 200, page, contentRange);
  }

  return { fetch: mockFetch, log };
}

// Production-shaped event set. The counts are the real ones measured on
// 2026-10-03: 929 approved events starting before October 2026, the real
// number starting on each October day, and 927 starting after October —
// 2,954 rows in all. With "today" = 2026-10-03 that puts 1,052 rows before
// today, which is why an oldest-first query capped at 1,000 rows ended on
// 2026-10-02 and held nothing from today forward.
const OCTOBER_2026_STARTS = [50, 73, 121, 30, 19, 27, 34, 36, 44, 74, 34, 20, 25, 29, 33, 43, 68, 32, 14, 18, 21, 21, 31, 49, 23, 10, 13, 21, 19, 31, 35];
const ROWS_BEFORE_OCTOBER = 929;
const ROWS_AFTER_OCTOBER = 927;

function isoPlusDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function productionShapedEvents() {
  const rows = [];
  let n = 0;
  // Deliberately NOT inserted in id order, so nothing passes by relying on
  // insertion order instead of the query's own `order=`.
  const add = (startDate, extra) => {
    n++;
    rows.push({
      id: `evt-${String((n * 7919) % 100000).padStart(5, "0")}-${n}`,
      title: `Event ${n}`,
      start_date: startDate,
      end_date: null,
      status: "approved",
      category: "music",
      venue_id: n % 5 < 2 ? `venue-${n % 90}` : null,
      venue_name_raw: `Venue ${n % 300}`,
      neighborhood: n % 5 === 0 ? "Downtown" : null,
      ...extra,
    });
  };
  // 929 before October, spread over the 30 days of September 2026.
  for (let i = 0; i < ROWS_BEFORE_OCTOBER; i++) add(isoPlusDays("2026-09-01", i % 30));
  OCTOBER_2026_STARTS.forEach((count, dayIndex) => {
    for (let i = 0; i < count; i++) add(isoPlusDays("2026-10-01", dayIndex));
  });
  // 927 after October, spread over the following 15 months.
  for (let i = 0; i < ROWS_AFTER_OCTOBER; i++) add(isoPlusDays("2026-11-01", (i * 37) % 450));
  // Rows that must never be returned to a public page.
  for (let i = 0; i < 40; i++) add(isoPlusDays("2026-10-01", i % 31), { status: "pending_review" });
  return rows;
}

module.exports = {
  makeMockPostgrest,
  productionShapedEvents,
  OCTOBER_2026_STARTS,
  ROWS_BEFORE_OCTOBER,
  ROWS_AFTER_OCTOBER,
  isoPlusDays,
};
