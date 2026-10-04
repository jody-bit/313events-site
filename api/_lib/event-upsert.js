// api/_lib/event-upsert.js — WP 0.7 (safe batching): the one place an
// ingestion connector writes a batch of event rows.
//
// WHY THIS EXISTS (production incident, measured 2026-10-03)
// PostgREST refuses a bulk POST whose row objects do not all have the same
// set of keys. The whole request fails, before Postgres is ever involved:
//
//   HTTP 400  {"code":"PGRST102","details":null,"hint":null,
//              "message":"All object keys must match"}
//
// Connectors build rows with `field: value || undefined`, and
// JSON.stringify drops an undefined-valued key, so two events from the same
// source routinely differ in shape (one has a description, the next does
// not). Every such batch was rejected in full. On 2026-10-03 that was the
// state of five connectors — Ticketmaster (909 rows, no new event since
// 2026-09-04), MotorCity Wine (68), Detroit Month of Design (65), Popps
// Packing (20) and Detroit Training Center (15) — four of which had never
// written a single row. See test/notes/postgrest-mixed-keys.md.
//
// WHAT IT DOES
// Groups the rows by the exact set of keys each one will send, and sends
// one request per group. Every request is therefore uniform, which is the
// only thing PostgREST requires.
//
// WHAT IT DELIBERATELY DOES NOT DO
// It never adds a key to a row. Filling the gaps with null (or sending one
// `columns=` list, which makes PostgREST do the same thing) would make the
// batch uniform too, and would be wrong: with
// `Prefer: resolution=merge-duplicates` every key in the payload becomes
// `SET col = EXCLUDED.col` on an existing row, so a null written only to
// square up the batch would erase a description, address or time that a
// reviewer or the enrichment job had already filled in. The two cases mean
// different things and both survive unchanged:
//   - key OMITTED       -> "this source has nothing to say": an existing
//                          row keeps its value; a new row gets the column
//                          default.
//   - key present, NULL -> "this source says it is blank": written as NULL,
//                          exactly as before.
// It does not drop keys either. WP 0.7 as originally written also proposed
// dropping null-valued keys before upsert; that changes what an explicit
// null does today and is NOT part of this helper.
//
// ONE REQUEST WHEN THE ROWS ARE ALREADY UNIFORM
// A batch whose rows all share one shape is sent as a single request with
// the same URL, headers and body the connectors used to build by hand, so
// a connector that was working is unaffected.
//
// PARTIAL SUCCESS
// Several requests cannot be one transaction. Groups are sent in order and
// a rejected group does not stop the ones after it: each row is an
// independent upsert keyed on external_id, so landing the rows that can
// land is strictly better than landing none. The result says exactly what
// happened (`written`, `failedRows`, per-group status); `ok` is true only
// if every row was accepted.
//
// TWO THINGS THAT WOULD OTHERWISE GO QUIET ONCE A BATCH IS SPLIT
//   - The same conflict key (external_id) in rows of DIFFERENT shape. In a
//     single request Postgres refuses that outright (SQLSTATE 21000). Split
//     across two requests both rows would be applied, the later group
//     silently winning. Such rows are not sent at all; they are reported as
//     failed, and every other row is still written. (The same key twice in
//     rows of the SAME shape still travels in one request and is refused by
//     the database, exactly as before.)
//   - A network failure (fetch throws). With ONE request it propagates to
//     the connector's own catch, as a bare fetch always did. With several,
//     an earlier group may already be committed, so the failure is recorded
//     against its group (status null), the remaining groups are still sent,
//     and the caller gets a result that says what was written rather than
//     an exception that says nothing.
"use strict";

const DEFAULT_TABLE = "events";
const DEFAULT_ON_CONFLICT = "external_id";
const DEFAULT_PREFER = "resolution=merge-duplicates,return=minimal";

// A row as it will go on the wire. JSON.stringify is the authority on which
// keys that is (it drops undefined-, function- and symbol-valued keys and
// keeps null), so every row is serialized exactly once and the request body
// is assembled from those same strings — the shape a row is grouped by can
// never differ from the shape that is sent.
function serializeRow(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new TypeError("event-upsert: every row must be a plain object");
  }
  const json = JSON.stringify(row);
  if (typeof json !== "string" || json[0] !== "{") {
    throw new TypeError("event-upsert: every row must serialize to a JSON object");
  }
  return json;
}

// The keys a row will actually send, sorted.
function keyShapeOf(row) {
  return Object.keys(JSON.parse(serializeRow(row))).sort();
}

// -> [{ keys: [...sorted], rows: [...] }], groups in order of first
// appearance, rows in their original order within a group. (Each group also
// carries `json` and `sent` — its rows' serialized and parsed wire forms —
// and `positions`, each row's index in the input.)
function groupRowsByKeyShape(rows) {
  const groups = new Map();
  rows.forEach((row, position) => {
    const json = serializeRow(row);
    const sent = JSON.parse(json);
    const keys = Object.keys(sent).sort();
    const signature = JSON.stringify(keys);
    if (!groups.has(signature)) groups.set(signature, { keys, rows: [], json: [], sent: [], positions: [] });
    const group = groups.get(signature);
    group.rows.push(row);
    group.json.push(json);
    group.sent.push(sent);
    group.positions.push(position);
  });
  return Array.from(groups.values());
}

// Upserts `rows` into events, one uniform request per key shape.
//
// Returns an object a call site can use exactly like the fetch Response it
// replaces (`ok`, `status`, `await text()`), plus what a single Response
// could not say:
//   written     rows in the groups that were accepted
//   attempted   rows.length
//   groups      [{ keys, rowCount, ok, status, error }] in the order sent
//               (a set of rows withheld as cross-shape duplicates appears
//               last, with keys: null)
//   failedRows  every row that was not written
// `status`, when everything was accepted, is what one request would have
// reported: 201 if any group inserted a row, otherwise the first group's
// status (200 for a pure update, and 200 when there were no rows and so no
// request). Otherwise it is the first failed group's status — null if that
// failure was not an HTTP response.
// `text()` is the first failure's own message: unchanged when the batch was
// a single request, and otherwise PRECEDED by a one-line account of what
// was and was not written, so that a log line that truncates the message
// still carries it.
//
// options: { table, onConflict, prefer } — defaults are the events upsert
// every connector performs.
async function upsertEventRows(supabaseUrl, serviceRoleKey, rows, options) {
  if (!Array.isArray(rows)) throw new TypeError("event-upsert: rows must be an array");
  const table = (options && options.table) || DEFAULT_TABLE;
  const onConflict = (options && options.onConflict) || DEFAULT_ON_CONFLICT;
  const prefer = (options && options.prefer) || DEFAULT_PREFER;

  let shapeGroups = groupRowsByKeyShape(Array.from(rows));

  // Conflict keys that occur in more than one shape group: withheld, loudly.
  const conflictColumns = onConflict.split(",");
  const conflictKeyOf = (sent) =>
    conflictColumns.every((c) => sent[c] !== undefined && sent[c] !== null)
      ? JSON.stringify(conflictColumns.map((c) => sent[c]))
      : null; // no key, no conflict (NULLs never collide in a unique index)
  const groupOfKey = new Map();
  const crossShapeDuplicates = new Set();
  shapeGroups.forEach((group, index) => {
    for (const sent of group.sent) {
      const key = conflictKeyOf(sent);
      if (key === null) continue;
      if (groupOfKey.has(key) && groupOfKey.get(key) !== index) crossShapeDuplicates.add(key);
      else groupOfKey.set(key, index);
    }
  });
  let withheld = [];
  if (crossShapeDuplicates.size) {
    const held = [];
    shapeGroups = shapeGroups
      .map((group) => {
        const kept = { keys: group.keys, rows: [], json: [], sent: [], positions: [] };
        group.sent.forEach((sent, i) => {
          if (crossShapeDuplicates.has(conflictKeyOf(sent))) { held.push({ row: group.rows[i], position: group.positions[i] }); return; }
          kept.rows.push(group.rows[i]);
          kept.json.push(group.json[i]);
          kept.sent.push(sent);
          kept.positions.push(group.positions[i]);
        });
        return kept;
      })
      .filter((group) => group.rows.length);
    withheld = held.sort((a, b) => a.position - b.position).map((h) => h.row); // input order
  }

  const totalGroups = shapeGroups.length + (withheld.length ? 1 : 0);
  const groups = [];
  const failedRows = [];
  let written = 0;

  for (const group of shapeGroups) {
    let resp;
    try {
      resp = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${onConflict}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Prefer: prefer,
        },
        body: `[${group.json.join(",")}]`,
      });
    } catch (err) {
      if (totalGroups === 1) throw err; // a single request: exactly what a bare fetch did
      failedRows.push(...group.rows);
      groups.push({ keys: group.keys, rowCount: group.rows.length, ok: false, status: null, error: `request failed: ${err && err.message ? err.message : err}` });
      continue;
    }
    if (resp.ok) {
      written += group.rows.length;
      groups.push({ keys: group.keys, rowCount: group.rows.length, ok: true, status: resp.status, error: null });
    } else {
      const error = await resp.text();
      failedRows.push(...group.rows);
      groups.push({ keys: group.keys, rowCount: group.rows.length, ok: false, status: resp.status, error });
    }
  }

  if (withheld.length) {
    failedRows.push(...withheld);
    const ids = Array.from(crossShapeDuplicates).map((key) => JSON.parse(key).join(",")).join(", ");
    groups.push({
      keys: null,
      rowCount: withheld.length,
      ok: false,
      status: null,
      error: `not sent: ${onConflict} appears more than once in this batch, in rows of different shape (${ids})`,
    });
  }

  const failed = groups.filter((g) => !g.ok);
  const ok = failed.length === 0;
  let status;
  if (!ok) status = failed[0].status;
  else if (!groups.length) status = 200; // no rows, no request: nothing rejected, nothing written
  else status = groups.some((g) => g.status === 201) ? 201 : groups[0].status;

  let errorText = "";
  if (!ok) {
    errorText = failed[0].error;
    if (groups.length > 1) {
      errorText = `[${failed.length} of ${groups.length} key-shape groups rejected; ${written} of ${rows.length} rows written] ${errorText}`;
    }
  }

  return {
    ok,
    status,
    written,
    attempted: rows.length,
    groups,
    failedRows,
    text: async () => errorText,
  };
}

module.exports = {
  upsertEventRows,
  groupRowsByKeyShape,
  keyShapeOf,
  DEFAULT_PREFER,
};
