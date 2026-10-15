// api/_lib/cron-run.js — Package 1 (Platform): truthful source_runs rows for
// the ingestion handlers that did not log their own runs.
//
// WHY A WRAPPER
// The 22 handlers that already log call startRun()/finishRun() by hand at
// every exit path. The remaining ingestion handlers have 7-10 exit paths each
// and a pinned-text test suite around them (test/wp07-connector-coverage.test.js),
// so threading the calls through each body would be a large, risky diff. They
// all answer the same way, though: `res.status(code).json({ upserted, error?,
// note?, ... })`. withRunLog() observes that one answer and writes the run row
// from it, so the handler bodies are untouched.
//
// WHAT IT GUARANTEES
//   - An unauthorised request is never a run (no row), same rule as run-log.js.
//   - The row is started before the handler runs and finished BEFORE the
//     response is sent (a serverless function may be frozen once it answers).
//   - Outcome is read from what the handler reported, never assumed:
//       status >= 500, or an `error` in the body ........ failed
//       ... and the error names an upstream HTTP 401/403 .. blocked
//       ... and rows were still written .................. partial
//       `upsertErrors` present or a per-source failure ..... partial
//       otherwise ......................................... success
//     A 200 that carries `error` (e.g. "Fetch failed: HTTP 403") is NOT
//     success: that is exactly the case that made these sources look healthy.
//   - records_fetched / records_parsed stay null: these handlers do not report
//     them, and this wrapper does not invent them.
//   - Logging can never change the handler's response or throw (run-log.js is
//     fail-safe; everything here is wrapped as well).

"use strict";

const { startRun, finishRun } = require("./run-log");
const { cronAuthStatus } = require("./cron-auth");

// A request is a run only if the shared cron auth would let it through; an
// unauthorised (or unconfigured-and-refused) hit is not a run.
function requestAuthorized(req) {
  return cronAuthStatus(req) === "ok";
}

const SESSION_KEYS = ["note", "skipped", "skippedPast", "checked", "checkedUrls", "checkedCount", "feedsChecked", "excludedByCategory", "excludedByDate"];

function upstreamStatus(error) {
  const m = /\bHTTP (\d{3})\b/.exec(String(error || ""));
  return m ? Number(m[1]) : null;
}

// classifyResponse(statusCode, body, options) -> fields for finishRun().
// options.sourceFailures(body) may return how many individual sources failed
// and how many were attempted (used by the multi-source feeds handler).
function classifyResponse(statusCode, body, options = {}) {
  const b = body && typeof body === "object" ? body : {};
  const written = typeof b.upserted === "number" ? b.upserted : null;
  const error = typeof b.error === "string" && b.error ? b.error : null;
  const upstream = upstreamStatus(error);
  const fields = { http_status: upstream, records_written: written };

  let outcome = "success";
  if (statusCode >= 500 || error) {
    if (upstream === 401 || upstream === 403) outcome = "blocked";
    else if (written && written > 0) outcome = "partial";
    else outcome = "failed";
  } else if (Array.isArray(b.upsertErrors) && b.upsertErrors.length) {
    outcome = written && written > 0 ? "partial" : "failed";
  } else if (options.sourceFailures) {
    const f = options.sourceFailures(b);
    if (f && f.failed > 0) outcome = f.failed >= f.attempted && !(written > 0) ? "failed" : "partial";
  }
  fields.outcome = outcome;
  if (error) fields.error_sample = error;
  else if (Array.isArray(b.upsertErrors) && b.upsertErrors.length) fields.error_sample = JSON.stringify(b.upsertErrors).slice(0, 400);

  const detail = {};
  for (const k of SESSION_KEYS) if (b[k] !== undefined && b[k] !== null) detail[k] = b[k];
  if (options.sourceFailures) {
    const f = options.sourceFailures(b);
    if (f) detail.sources_failed = f.failed;
  }
  if (Object.keys(detail).length) fields.session_data = detail;
  return fields;
}

// withRunLog(slug, handler, options) -> (req, res) => Promise
function withRunLog(slug, handler, options = {}) {
  return async function runLoggedHandler(req, res) {
    if (!requestAuthorized(req)) return handler(req, res);

    let handle = null;
    try {
      handle = await startRun(slug);
    } catch (_) {
      handle = null;
    }

    // Hold the response until the run row is finished.
    let code = 200;
    let sent = false;
    let body;
    const realStatus = res.status.bind(res);
    const realJson = res.json.bind(res);
    res.status = (c) => {
      code = c;
      realStatus(c);
      return res;
    };
    res.json = (b) => {
      sent = true;
      body = b;
      return res;
    };

    let thrown = null;
    try {
      await handler(req, res);
    } catch (err) {
      thrown = err;
    }

    try {
      if (thrown) {
        await finishRun(handle, { outcome: "failed", error_sample: thrown && thrown.message ? thrown.message : String(thrown) });
      } else if (!sent) {
        await finishRun(handle, { outcome: "failed", error_sample: "handler returned without sending a response" });
      } else {
        await finishRun(handle, classifyResponse(code, body, options));
      }
    } catch (_) {
      // Logging must never change the response.
    }

    if (thrown) throw thrown;
    if (sent) return realJson(body);
    return undefined;
  };
}

module.exports = { withRunLog, classifyResponse, requestAuthorized };
