// api/_lib/run-budget.js — bounded fetching for single-source cron handlers.
//
// WHY
// A handler that fetches pages one after another with a bare fetch() has no
// upper bound: one hung connection holds the function until the platform kills
// it (maxDuration), the run row stays "started", and nothing says which page
// stalled or what was left undone (#256 / PR #261 for the Auto-Repair path).
// This is the small, self-contained version of that fix for crons that fetch
// a handful of pages: a per-request timeout, an overall run budget, and a
// vocabulary for reporting what finished, what timed out and what was
// deferred. It does not retry anything.
//
// WHAT IT GUARANTEES
//   - fetchText() settles within min(timeoutMs, remaining budget). The
//     timeout covers reading the body, and is enforced by a race as well as
//     by an AbortSignal, so a fetch that ignores the signal is still bounded.
//   - Nothing here writes anything.
"use strict";

const REQUEST_TIMED_OUT = "REQUEST_TIMED_OUT";

function createBudget({ budgetMs, now = Date.now }) {
  const startedAt = now();
  return {
    budgetMs,
    elapsed: () => now() - startedAt,
    remaining: () => Math.max(0, budgetMs - (now() - startedAt)),
  };
}

// fetchText(url, fetchOptions, { timeoutMs, budget }) -> { ok, status, text }
// Rejects with an Error whose code is REQUEST_TIMED_OUT on timeout; any other
// rejection is the underlying network error, unchanged.
async function fetchText(url, fetchOptions, { timeoutMs, budget }) {
  const limit = Math.max(1, Math.min(timeoutMs, budget ? budget.remaining() : timeoutMs));
  const controller = new AbortController();
  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Timed out after ${limit} ms`);
      err.code = REQUEST_TIMED_OUT;
      reject(err);
      controller.abort();
    }, limit);
  });
  const work = (async () => {
    const r = await fetch(url, { ...(fetchOptions || {}), signal: controller.signal });
    const text = r.ok ? await r.text() : "";
    return { ok: r.ok, status: r.status, text };
  })();
  work.catch(() => {}); // the loser of the race must never become an unhandled rejection
  try {
    return await Promise.race([work, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

const isTimeout = (err) => !!err && err.code === REQUEST_TIMED_OUT;

// The same list on every run would let a persistently slow head item starve
// the tail. Rotating the start by a seed (the UTC day) means a tail item that
// was deferred today is reached early on another day. Writes are idempotent
// upserts, so order never matters for correctness.
function rotate(list, seed) {
  if (!list.length) return list.slice();
  const k = ((Math.floor(seed) % list.length) + list.length) % list.length;
  return list.slice(k).concat(list.slice(0, k));
}

module.exports = { createBudget, fetchText, isTimeout, rotate, REQUEST_TIMED_OUT };
