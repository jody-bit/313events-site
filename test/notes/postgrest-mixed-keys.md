# PostgREST and bulk POSTs whose rows have different keys

**Answer (WP 0.11): outright rejection of the whole request.** Not "columns from
the first object", not "missing keys filled with NULL" — the two behaviors
`INGESTION_PLATFORM_ARCHITECTURE.md` (D4) had guessed.

```
HTTP 400
{"code":"PGRST102","details":null,"hint":null,"message":"All object keys must match"}
```

Nothing in the request is written. PostgREST raises this itself, before Postgres
is involved, so nothing appears in the Postgres log.

## How it was established

Not by the scratch-table test WP 0.11 proposed. Production had been running the
experiment for a month.

**Measured, 2026-10-03, production API log (Supabase edge log, last 24 hours).**
Every ingestion cron's requests are in it. Five connectors each made a status
lookup (200) followed by one bulk `POST /rest/v1/events?on_conflict=external_id`
that returned 400 with an 85-byte response body:

| Time (UTC) | Connector | Rows sent | Request size | Response |
|---|---|---|---|---|
| 01:01 | Detroit Month of Design | 65 | 45,309 bytes | 400, 85 bytes |
| 05:00 | Popps Packing | 20 | 20,996 bytes | 400, 85 bytes |
| 09:00 | MotorCity Wine | 68 | 39,925 bytes | 400, 85 bytes |
| 10:00 | Detroit Training Center | 15 | 9,810 bytes | 400, 85 bytes |
| 13:00 | Ticketmaster | 909 | 1,225,573 bytes | 400, 85 bytes |

The row counts come from the id lists in each connector's own status-lookup
request, which the log records in full. The response **body** is not logged, only
its length. `{"code":"PGRST102","details":null,"hint":null,"message":"All object keys must match"}`
is exactly 85 bytes, in the same field order as the one error body production
did record verbatim that day (GottaGacha's `22P02`, in `source_runs.error_sample`).
The message text itself is therefore inferred from the length, the status and
the documentation below — it was not read off the wire.

**Corroborated by the events table, same day.**

- Popps Packing, MotorCity Wine, Detroit Month of Design, Detroit Training
  Center: zero rows of any status, ever. All four build rows with
  `field: value || undefined`.
- Ticketmaster: rows were created every day from 2026-08-25 to 2026-09-04 and,
  apart from a single row on 2026-09-20, never again. On 2026-09-05 the
  connector gained `description: e.info || undefined` — the first field that
  could be absent. The eleven days of working writes before it had uniform rows.
- Every connector whose batch was uniform that day returned 200 or 201.

**Documented.** PostgREST's error reference lists `PGRST102` as HTTP 400,
"an invalid request body". Its maintainers describe the bulk-insert rule in
[PostgREST issue #1118](https://github.com/PostgREST/postgrest/issues/1118): the
array is turned into rows with one column list, so every object must have the
same keys, and "you can specify `columns` to bypass the 'All object keys must
match' validation".

## What `columns=` does, and why it is not the fix

With `?columns=a,b,c` PostgREST reads exactly those columns from every object
and treats an absent key as NULL. The batch is accepted. This was **not measured
here** — it is the documented behavior — and it is the wrong tool for these
writes: under `Prefer: resolution=merge-duplicates` every listed column becomes
`SET col = EXCLUDED.col` on an existing row, so the NULL that stood in for "this
source has no description" erases a description a reviewer or the enrichment job
had already written.

## What the code does about it

`api/_lib/event-upsert.js` groups rows by the exact set of keys each will send
and posts one request per group. No key is added to any row and none is removed,
so "omitted" (leave the stored value alone) and "null" (clear it) keep their
separate meanings. All 25 event-ingestion connectors write through it.

`test/fixtures/mock-postgrest.js` now rejects a non-uniform bulk POST with the
same status and body, so a test can no longer pass with a batch production would
refuse.
