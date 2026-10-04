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
// if every group was accepted. A network failure (fetch throws) is not
// caught here and propagates to the connector's own catch, as it always
// did.
"use strict";

const DEFAULT_TABLE = "events";
const DEFAULT_ON_CONFLICT = "external_id";
const DEFAULT_PREFER = "resolution=merge-duplicates,return=minimal";

// The keys a row will actually put on the wire, sorted. JSON.stringify is
// the authority on that (it drops undefined-, function- and symbol-valued
// keys and keeps null), so the row is round-tripped through it rather than
// re-implementing its rules.
function keyShapeOf(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new TypeError("event-upsert: every row must be a plain object");
  }
  return Object.keys(JSON.parse(JSON.stringify(row))).sort();
}

// -> [{ keys: [...sorted], rows: [...] }], groups in order of first
// appearance, rows in their original order within a group.
function groupRowsByKeyShape(rows) {
  const groups = new Map();
  for (const row of rows) {
    const keys = keyShapeOf(row);
    const signature = JSON.stringify(keys);
    if (!groups.has(signature)) groups.set(signature, { keys, rows: [] });
    groups.get(signature).rows.push(row);
  }
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
//   failedRows  the rows of every rejected group
// `status` is the first group's HTTP status when everything was accepted
// (so a uniform batch reports exactly what its one request returned), and
// the first rejected group's status otherwise. `text()` is the first
// rejected group's response body, unchanged when the batch was a single
// group, and followed by a one-line account of the other groups when it
// was not.
//
// options: { table, onConflict, prefer } — defaults are the events upsert
// every connector performs.
async function upsertEventRows(supabaseUrl, serviceRoleKey, rows, options) {
  if (!Array.isArray(rows)) throw new TypeError("event-upsert: rows must be an array");
  const table = (options && options.table) || DEFAULT_TABLE;
  const onConflict = (options && options.onConflict) || DEFAULT_ON_CONFLICT;
  const prefer = (options && options.prefer) || DEFAULT_PREFER;

  const shapeGroups = groupRowsByKeyShape(rows);
  const groups = [];
  const failedRows = [];
  let written = 0;

  for (const group of shapeGroups) {
    const resp = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: prefer,
      },
      body: JSON.stringify(group.rows),
    });
    if (resp.ok) {
      written += group.rows.length;
      groups.push({ keys: group.keys, rowCount: group.rows.length, ok: true, status: resp.status, error: null });
    } else {
      const error = await resp.text();
      failedRows.push(...group.rows);
      groups.push({ keys: group.keys, rowCount: group.rows.length, ok: false, status: resp.status, error });
    }
  }

  const failed = groups.filter((g) => !g.ok);
  const ok = failed.length === 0;
  // No rows means no request: nothing was rejected, nothing was written.
  const status = ok ? (groups.length ? groups[0].status : 200) : failed[0].status;
  let errorText = "";
  if (!ok) {
    errorText = failed[0].error;
    if (groups.length > 1) {
      errorText += ` [${failed.length} of ${groups.length} key-shape groups rejected; ${written} of ${rows.length} rows written]`;
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
