// api/_lib/run-log.js — WP 0.5: per-run ingestion telemetry (source_runs)
//
// Every ingestion cron calls startRun() the moment it begins (after the
// CRON_SECRET auth check passes — an unauthenticated hit is not a "run")
// and finishRun() at every exit path: normal completion, a fetch/upstream
// failure, an upstream block (401/403), or a caught exception.
//
// RUN LIFECYCLE — this is the whole point of this module, per the Product
// Owner's explicit instruction (2026-09-21 WP 0.5 review):
//   1. startRun() INSERTs a row immediately, outcome='started',
//      finished_at=null, and returns a handle.
//   2. finishRun() UPDATEs that same row in place.
//   3. If the serverless runtime hard-kills the function (e.g. a
//      maxDuration timeout), NO code runs — not even a catch/finally block
//      — so finishRun() never fires. That is by design, not a bug in this
//      module: the row from step 1 is the evidence. It stays
//      outcome='started', finished_at=null, forever. A monitoring/health
//      query classifies a 'started' row as "still running" (recent
//      started_at) or "abandoned / probable timeout" (started_at older
//      than that source's own execution budget). This module does not
//      define or apply that threshold — see source_runs_started_outcome_idx
//      in migration_035_source_runs.sql for the index that query needs.
//
// FAIL-SAFE, ALWAYS: nothing in this module may throw, and nothing here
// may block or slow down a connector's actual ingestion work beyond a
// short, bounded timeout on its own two REST calls. A logging failure is
// never a reason for a cron to fail. Every function here catches
// everything internally and returns null/undefined on any problem
// (missing env vars, network failure, non-OK response) rather than
// propagating an error to the caller.
//
// SECURITY: error_sample is truncated and redacted (sanitizeErrorSample
// below) before it is ever sent to Supabase — bounded length, and known
// credential/token shapes (Bearer tokens, apikey values, Supabase JWTs,
// anything naming SUPABASE_*KEY/SERVICE_ROLE_KEY) are stripped. Callers
// should still pass short, already-reasonable error text (e.g.
// `err.message`, or a response body already sliced to a few hundred
// chars) — this redaction is defense-in-depth, not a substitute for
// callers being careful about what they pass in the first place.

// Read lazily (not cached at module load) so tests can flip
// process.env between scenarios within a single process, and so a
// same-process env change (unlikely in prod, routine in tests) is honored.
function supabaseUrl() {
  return process.env.SUPABASE_URL;
}
function supabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const RUN_LOG_FETCH_TIMEOUT_MS = 5000;
const ERROR_SAMPLE_MAX_LEN = 500;

const REDACT_PATTERNS = [
  [/bearer\s+[a-z0-9\-_.=]+/gi, "Bearer [REDACTED]"],
  [/apikey["'=:\s]+[a-z0-9\-_.=]+/gi, "apikey=[REDACTED]"],
  [/authorization["'=:\s]+[a-z0-9\-_.=]+/gi, "authorization=[REDACTED]"],
  [/(supabase_[a-z_]*key|service_role_key)\S*/gi, "[REDACTED_KEY_NAME]"],
  // Supabase/JWT-shaped tokens: three dot-separated base64url segments.
  [/eyj[a-z0-9\-_]+\.[a-z0-9\-_]+\.[a-z0-9\-_]+/gi, "[REDACTED_JWT]"],
];

function sanitizeErrorSample(input) {
  if (input === null || input === undefined) return undefined;
  let s = typeof input === "string" ? input : String(input);
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    s = s.replace(pattern, replacement);
  }
  if (s.length > ERROR_SAMPLE_MAX_LEN) {
    s = s.slice(0, ERROR_SAMPLE_MAX_LEN) + "…[truncated]";
  }
  return s;
}

function configured() {
  return Boolean(supabaseUrl() && supabaseServiceRoleKey());
}

// startRun(sourceSlug) -> Promise<{ runId: string, startedAtMs: number } | null>
//
// Call this once, as the very first thing after auth succeeds. Returns
// null (never throws) if source_runs logging isn't available right now —
// callers should treat a null return the same as "logging skipped" and
// proceed with their normal work; do not gate ingestion on this.
async function startRun(sourceSlug) {
  const startedAtMs = Date.now();
  if (!configured()) return null;
  try {
    const resp = await fetch(`${supabaseUrl()}/rest/v1/source_runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceRoleKey(),
        Authorization: `Bearer ${supabaseServiceRoleKey()}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify([{ source_slug: sourceSlug, outcome: "started" }]),
      signal: AbortSignal.timeout(RUN_LOG_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const rows = await resp.json();
    const runId = Array.isArray(rows) && rows[0] && rows[0].id ? rows[0].id : null;
    if (!runId) return null;
    return { runId, startedAtMs };
  } catch (err) {
    // Never let a logging failure surface to the caller.
    console.warn(`[run-log] startRun failed for ${sourceSlug}: ${err.message}`);
    return null;
  }
}

// finishRun(runHandle, fields) -> Promise<void>
//
// runHandle is whatever startRun() returned (may be null — a no-op in that
// case). fields:
//   outcome          one of 'success' | 'partial' | 'failed' | 'blocked' (required)
//   http_status      number | undefined
//   records_fetched  number | undefined
//   records_parsed   number | undefined
//   records_written  number | undefined
//   error_sample     string | undefined — sanitized here, callers don't need to pre-sanitize
const VALID_FINISH_OUTCOMES = new Set(["success", "partial", "failed", "blocked"]);

async function finishRun(runHandle, fields = {}) {
  if (!runHandle || !runHandle.runId) return; // startRun no-opped or failed — nothing to finish
  if (!configured()) return;
  if (!VALID_FINISH_OUTCOMES.has(fields.outcome)) {
    console.warn(`[run-log] finishRun called with invalid outcome "${fields.outcome}" — not writing`);
    return;
  }
  const duration_ms = Date.now() - runHandle.startedAtMs;
  const body = {
    finished_at: new Date().toISOString(),
    outcome: fields.outcome,
    http_status: fields.http_status ?? null,
    records_fetched: fields.records_fetched ?? null,
    records_parsed: fields.records_parsed ?? null,
    records_written: fields.records_written ?? null,
    error_sample: sanitizeErrorSample(fields.error_sample) ?? null,
    duration_ms,
  };
  try {
    await fetch(`${supabaseUrl()}/rest/v1/source_runs?id=eq.${encodeURIComponent(runHandle.runId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceRoleKey(),
        Authorization: `Bearer ${supabaseServiceRoleKey()}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RUN_LOG_FETCH_TIMEOUT_MS),
    });
    // Deliberately not checking .ok here beyond letting a thrown network
    // error be caught below — a failed PATCH still must not affect the
    // cron's own response to its caller.
  } catch (err) {
    console.warn(`[run-log] finishRun failed for run ${runHandle.runId}: ${err.message}`);
  }
}

module.exports = { startRun, finishRun, sanitizeErrorSample };
