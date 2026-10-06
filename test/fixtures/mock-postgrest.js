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
//   - `or=(a.op.v,b.op.v)` is supported (the "current + upcoming" filter).
// An unsupported filter throws rather than being ignored, so a test can
// never pass by accident because a filter silently did nothing.
//
// WRITES (added 2026-10-03, WP 0.7). The fake also accepts POST (insert /
// upsert) and PATCH, and reproduces the production rule that hid a month
// of lost ingestion from every test in this repo:
//
//   A bulk POST whose row objects do not all have the same set of keys is
//   rejected in full — HTTP 400, body exactly
//   {"code":"PGRST102","details":null,"hint":null,"message":"All object keys must match"}
//   (85 bytes; measured against production 2026-10-03 for five connectors,
//   see test/notes/postgrest-mixed-keys.md). Nothing is written.
//
// Until this existed, every connector test stubbed its own "the write
// succeeded" response, so a connector could emit a batch production would
// refuse and still pass. Other write behavior modelled here, each because
// production has already failed that way at least once:
//   - on_conflict + `Prefer: resolution=merge-duplicates`: an existing row
//     is UPDATED with exactly the keys in the payload. A key that is absent
//     leaves the stored value alone; a key that is present and null writes
//     NULL. A new row takes the column default for an absent key.
//   - the same conflict key twice in one request -> 500, SQLSTATE 21000
//     ("ON CONFLICT DO UPDATE command cannot affect row a second time";
//     Ticketmaster, 2026-09-20).
//   - with a table schema supplied (see eventsSchema below): a required
//     column absent or null -> 400, SQLSTATE 23502, even when the row
//     already exists (Popps Packing / BUG-004); an explicit null in a NOT
//     NULL column that has a default -> the same 23502 (the default only
//     applies to an ABSENT key); a value outside an enum ->
//     400, SQLSTATE 22P02 (GottaGacha's "gaming", every run since
//     2026-09-24); an unknown column -> 400, PGRST204.
//   - `columns=` on the URL switches the key check off and fills absent
//     keys with NULL, as PostgREST does. Supported so a test can show why
//     that is not a safe way to make a batch uniform.
// A request is all-or-nothing: it is validated in full before any row is
// stored.
"use strict";

// What PostgREST answers to a bulk POST with non-uniform keys.
const MIXED_KEYS_ERROR = { code: "PGRST102", details: null, hint: null, message: "All object keys must match" };

// public.events as it was in production on 2026-10-03 (information_schema),
// reduced to what a write can violate: the column list, the columns that
// are NOT NULL with no default, the defaults a new row receives, and the
// event_category enum. `categories` defaults to the enum WITH 'gaming'
// (i.e. after migration 036); pass EVENT_CATEGORIES_PRODUCTION_2026_10_03
// to reproduce production as it actually was that day.
const EVENT_CATEGORIES_PRODUCTION_2026_10_03 = ["music", "theatre", "dance", "visual", "museum", "family", "fest", "food", "film", "nightlife", "sports", "community", "vendor", "training"];
const EVENT_CATEGORIES_WITH_GAMING = [...EVENT_CATEGORIES_PRODUCTION_2026_10_03, "gaming"];
const EVENT_STATUSES = ["pending_review", "approved", "rejected"];
function eventsSchema(options) {
  return {
    columns: [
      "id", "title", "description", "category", "venue_id", "venue_name_raw", "start_date", "end_date", "time_display",
      "is_recurring", "is_free", "price_from", "ticket_url", "image_url", "source", "note", "status", "submitter_org_name",
      "submitter_email", "external_id", "created_at", "updated_at", "organizer_id", "neighborhood_id",
      "neighborhood_confidence", "neighborhood_source", "venue_city_raw", "feed_source_id", "venue_address_raw", "event_url",
      "category_id", "followup_dismissed", "followup_dismissed_note", "followup_dismissed_at", "internal_note", "is_all_day",
      "ticket_status", "is_clothing_optional", "description_source", "no_fixed_venue", "link_check_status", "link_checked_at",
    ],
    required: ["title", "category", "start_date"],
    // NOT NULL columns that DO have a default: an absent key takes the
    // default, but an explicit null is still a violation.
    notNull: ["is_recurring", "is_free", "source", "status", "neighborhood_confidence", "followup_dismissed", "is_all_day", "is_clothing_optional", "no_fixed_venue"],
    defaults: {
      is_recurring: false, is_free: false, source: "Manual", status: "approved", neighborhood_confidence: "unconfirmed",
      followup_dismissed: false, is_all_day: false, is_clothing_optional: false, no_fixed_venue: false,
    },
    enums: {
      category: { name: "event_category", values: (options && options.categories) || EVENT_CATEGORIES_WITH_GAMING },
      status: { name: "event_status", values: EVENT_STATUSES },
    },
  };
}

function keySetOf(row) {
  return Object.keys(row).sort().join("\u0000");
}

// True when a parsed bulk body would be refused for non-uniform keys.
function hasMixedKeys(body) {
  if (!Array.isArray(body)) return false;
  // An element that is not an object at all cannot share the others' keys;
  // PostgREST refuses that body too.
  if (body.some((row) => row === null || typeof row !== "object" || Array.isArray(row))) return true;
  if (body.length < 2) return false;
  const first = keySetOf(body[0]);
  return body.some((row) => keySetOf(row) !== first);
}

function errorResponse(status, body) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// For a test that keeps its own inline fetch stub: the response a write
// would get as far as the key rule is concerned — the PGRST102 rejection
// for a non-uniform bulk body, otherwise a plain "201, written". Use it as
// the stub's default answer to a POST so the stub cannot accept a batch
// production refuses.
function strictWriteResponse(url, init) {
  let body;
  try { body = JSON.parse((init && init.body) || ""); } catch { body = undefined; }
  const hasColumnsParam = new URL(url).searchParams.has("columns");
  if (!hasColumnsParam && hasMixedKeys(body)) return errorResponse(400, MIXED_KEYS_ERROR);
  return { ok: true, status: 201, headers: { get: () => null }, json: async () => [], text: async () => "" };
}

function makeMockPostgrest(tables, options) {
  const cap = (options && options.cap) || 1000;
  const exposeCount = !options || options.exposeCount !== false;
  // failure(request) -> an HTTP status to fail with, or null to succeed.
  const failure = (options && options.failure) || (() => null);
  // schema[table] -> a table schema (see eventsSchema) that writes to that
  // table are validated against. A table without one accepts any columns.
  const schema = (options && options.schema) || {};
  const now = (options && options.now) || (() => new Date().toISOString());
  const log = [];
  let generatedIds = 0;

  const OPS = {
    eq: (a, b) => String(a) === b,
    neq: (a, b) => a != null && String(a) !== b,
    gte: (a, b) => a != null && String(a) >= b,
    gt: (a, b) => a != null && String(a) > b,
    lte: (a, b) => a != null && String(a) <= b,
    lt: (a, b) => a != null && String(a) < b,
    // like.prefix-* -- PostgREST's `*` is SQL's `%`. Case-sensitive, as LIKE is.
    like: (a, b) => a != null && new RegExp("^" + b.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(String(a)),
  };

  // in.(a,b,"c,d") -> ["a","b","c,d"]
  function parseInList(expr) {
    const m = /^in\.\((.*)\)$/.exec(expr);
    if (!m) return null;
    const values = [];
    const re = /"((?:[^"\\]|\\.)*)"|([^,]+)/g;
    let part;
    while ((part = re.exec(m[1])) !== null) values.push(part[1] !== undefined ? part[1].replace(/\\(.)/g, "$1") : part[2]);
    return values;
  }

  function applyFilter(rows, column, expr) {
    if (expr === "not.is.null") return rows.filter((r) => r[column] != null);
    if (expr === "is.null") return rows.filter((r) => r[column] == null);
    const inList = parseInList(expr);
    if (inList) return rows.filter((r) => r[column] != null && inList.includes(String(r[column])));
    const dot = expr.indexOf(".");
    const op = expr.slice(0, dot);
    const value = expr.slice(dot + 1);
    if (!OPS[op]) throw new Error(`mock-postgrest: unsupported filter ${column}=${expr}`);
    return rows.filter((r) => OPS[op](r[column], value));
  }

  // or=(start_date.gte.2026-10-03,end_date.gte.2026-10-03) — a row passes
  // if ANY of the comma-separated `column.op.value` conditions holds.
  function applyOr(rows, expr) {
    const m = /^\((.*)\)$/.exec(expr);
    if (!m) throw new Error(`mock-postgrest: unsupported or= expression ${expr}`);
    const conditions = m[1].split(",").map((part) => {
      const dot = part.indexOf(".");
      return { column: part.slice(0, dot), expr: part.slice(dot + 1) };
    });
    const passing = new Set();
    conditions.forEach((c) => applyFilter(rows, c.column, c.expr).forEach((r) => passing.add(r)));
    return rows.filter((r) => passing.has(r));
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
      text: async () => (body === undefined || body === "" ? "" : JSON.stringify(body)),
    };
  }

  function project(row, select) {
    if (!select || select === "*") return row;
    const out = {};
    select.split(",").forEach((col) => { out[col.trim()] = row[col.trim()] === undefined ? null : row[col.trim()]; });
    return out;
  }

  // The stored rows a request's filters select (PATCH uses this too).
  function filterRows(rows, searchParams) {
    for (const [key, value] of searchParams.entries()) {
      if (["select", "limit", "offset", "order", "on_conflict", "columns"].includes(key)) continue;
      rows = key === "or" ? applyOr(rows, value) : applyFilter(rows, key, value);
    }
    return rows;
  }

  // Postgres-side checks a row must pass, for a table with a schema.
  // Returns an error response or null.
  function validateAgainstSchema(table, row) {
    const tableSchema = schema[table];
    if (!tableSchema) return null;
    for (const key of Object.keys(row)) {
      if (!tableSchema.columns.includes(key)) {
        return errorResponse(400, { code: "PGRST204", details: null, hint: null, message: `Could not find the '${key}' column of '${table}' in the schema cache` });
      }
    }
    // NOT NULL with no default is checked on the row as proposed for
    // INSERT, before ON CONFLICT is considered — so it fails for a row
    // that already exists too (BUG-004).
    for (const column of tableSchema.required || []) {
      if (row[column] === undefined || row[column] === null) {
        return errorResponse(400, { code: "23502", details: null, hint: null, message: `null value in column "${column}" of relation "${table}" violates not-null constraint` });
      }
    }
    for (const column of tableSchema.notNull || []) {
      if (row[column] === null) {
        return errorResponse(400, { code: "23502", details: null, hint: null, message: `null value in column "${column}" of relation "${table}" violates not-null constraint` });
      }
    }
    for (const [column, type] of Object.entries(tableSchema.enums || {})) {
      if (row[column] !== undefined && row[column] !== null && !type.values.includes(row[column])) {
        return errorResponse(400, { code: "22P02", details: null, hint: null, message: `invalid input value for enum ${type.name}: "${row[column]}"` });
      }
    }
    return null;
  }

  function handlePost(table, parsed, init, headers) {
    let body;
    try { body = JSON.parse((init && init.body) || ""); } catch { body = undefined; }
    if (body === undefined || body === null || typeof body !== "object") {
      return errorResponse(400, { code: "PGRST102", details: null, hint: null, message: "Empty or invalid json" });
    }
    const columnsParam = parsed.searchParams.get("columns");
    // THE BEHAVIOR UNDER TEST: non-uniform keys reject the whole request.
    if (!columnsParam && hasMixedKeys(body)) return errorResponse(400, MIXED_KEYS_ERROR);

    let incoming = Array.isArray(body) ? body : [body];
    if (columnsParam) {
      // PostgREST reads exactly these columns from every object; an absent
      // key becomes NULL.
      const columns = columnsParam.split(",");
      incoming = incoming.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] === undefined ? null : row[c]])));
    }
    for (const row of incoming) {
      const invalid = validateAgainstSchema(table, row);
      if (invalid) return invalid;
    }

    const prefer = headers.Prefer || headers.prefer || "";
    const conflictColumns = (parsed.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
    const conflictKey = (row) => conflictColumns.map((c) => String(row[c])).join("\u0000");
    const merging = /resolution=merge-duplicates/.test(prefer);
    const ignoring = /resolution=ignore-duplicates/.test(prefer);
    if (conflictColumns.length && merging) {
      const seen = new Set();
      for (const row of incoming) {
        const key = conflictKey(row);
        if (seen.has(key)) {
          return errorResponse(500, { code: "21000", details: null, hint: "Ensure that no rows proposed for insertion within the same command have duplicate constrained values.", message: "ON CONFLICT DO UPDATE command cannot affect row a second time" });
        }
        seen.add(key);
      }
    }

    // Validated in full — now store.
    const stored = tables[table];
    const tableSchema = schema[table];
    const hasColumn = (c) => !tableSchema || tableSchema.columns.includes(c);
    const timestamp = now();
    const result = [];
    let inserted = 0;
    for (const row of incoming) {
      const existing = conflictColumns.length
        ? stored.find((r) => conflictColumns.every((c) => r[c] != null && String(r[c]) === String(row[c])))
        : null;
      if (existing) {
        if (ignoring) continue;
        // Only the keys in the payload are written. An absent key is not.
        Object.assign(existing, row);
        if (tableSchema && hasColumn("updated_at")) existing.updated_at = timestamp;
        result.push(existing);
      } else {
        const fresh = { ...((tableSchema && tableSchema.defaults) || {}), ...row };
        if (fresh.id === undefined) fresh.id = `mock-id-${++generatedIds}`;
        if (tableSchema) {
          tableSchema.columns.forEach((c) => { if (fresh[c] === undefined) fresh[c] = null; });
          fresh.created_at = fresh.created_at || timestamp;
          fresh.updated_at = fresh.updated_at || timestamp;
        }
        stored.push(fresh);
        result.push(fresh);
        inserted++;
      }
    }
    const representation = /return=representation/.test(prefer);
    const select = parsed.searchParams.get("select");
    // 201 when anything was inserted, 200 for a pure update — as observed
    // in production's own API log.
    return respond(inserted ? 201 : 200, representation ? result.map((r) => project(r, select)) : "", null);
  }

  function handlePatch(table, parsed, init, headers) {
    let patch;
    try { patch = JSON.parse((init && init.body) || ""); } catch { patch = undefined; }
    if (patch === undefined || patch === null || typeof patch !== "object" || Array.isArray(patch)) {
      return errorResponse(400, { code: "PGRST102", details: null, hint: null, message: "Empty or invalid json" });
    }
    const tableSchema = schema[table];
    const targets = filterRows(tables[table], parsed.searchParams);
    targets.forEach((row) => {
      Object.assign(row, patch);
      if (tableSchema && tableSchema.columns.includes("updated_at")) row.updated_at = now();
    });
    const representation = /return=representation/.test(headers.Prefer || headers.prefer || "");
    return respond(representation ? 200 : 204, representation ? targets : "", null);
  }

  async function mockFetch(url, init) {
    const headers = (init && init.headers) || {};
    const parsed = new URL(url);
    const table = parsed.pathname.split("/").pop();
    const method = ((init && init.method) || "GET").toUpperCase();
    const request = { url, table, method, headers: { ...headers }, body: init && init.body, index: log.length };
    log.push(request);

    const failStatus = failure(request);
    if (failStatus) return respond(failStatus, { message: "mock failure" }, null);

    if (!tables[table]) throw new Error(`mock-postgrest: unknown table ${table}`);
    if (method === "POST") return handlePost(table, parsed, init, headers);
    if (method === "PATCH") return handlePatch(table, parsed, init, headers);
    if (method !== "GET") throw new Error(`mock-postgrest: unsupported method ${method}`);
    let rows = tables[table];
    let limit = null, offset = 0, order = null;
    for (const [key, value] of parsed.searchParams.entries()) {
      if (key === "select") continue;
      if (key === "limit") { limit = parseInt(value, 10); continue; }
      if (key === "offset") { offset = parseInt(value, 10); continue; }
      if (key === "order") { order = value; continue; }
      if (key === "or") { rows = applyOr(rows, value); continue; }
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
  strictWriteResponse,
  hasMixedKeys,
  eventsSchema,
  MIXED_KEYS_ERROR,
  EVENT_CATEGORIES_PRODUCTION_2026_10_03,
  EVENT_CATEGORIES_WITH_GAMING,
  productionShapedEvents,
  OCTOBER_2026_STARTS,
  ROWS_BEFORE_OCTOBER,
  ROWS_AFTER_OCTOBER,
  isoPlusDays,
};
