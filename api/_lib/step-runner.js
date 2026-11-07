// Bounded, isolated, observable step execution (#256).
//
// Auto-Repair (admin button) and the feeds poller run many network-bound
// steps sequentially inside one Vercel function (hard limit 300 s). One hung
// request used to stall everything behind it until the platform killed the
// function, leaving no per-step record. runSteps() gives every step:
//   - its own timeout, capped by what is left of an overall budget that sits
//     below the platform limit;
//   - an AbortSignal that is applied to every fetch the step makes (via an
//     AsyncLocalStorage-scoped guard on global fetch), so a timed-out step
//     stops issuing requests and can no longer write after it was reported
//     as timed out;
//   - a recorded outcome: completed | failed | timed_out | skipped_budget.
// Steps never retry here (no retry storms), and a timed-out step is never
// reported as completed.

const { AsyncLocalStorage } = require("node:async_hooks");

const als = new AsyncLocalStorage();
const GUARD = Symbol.for("313events.stepRunner.fetchGuard");

// AbortSignal.any needs Node 20.3+; no engines are pinned in this repo, so combine by hand.
function anySignal(signals) {
  const c = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) { c.abort(sig.reason); break; }
    sig.addEventListener("abort", () => c.abort(sig.reason), { once: true });
  }
  return c.signal;
}

function installFetchGuard() {
  if (typeof globalThis.fetch !== "function" || globalThis.fetch[GUARD]) return;
  const original = globalThis.fetch;
  const guarded = function guardedFetch(input, init) {
    const ctx = als.getStore();
    if (!ctx) return original(input, init);
    if (ctx.signal.aborted) return Promise.reject(ctx.signal.reason || new Error("step aborted"));
    const signals = [ctx.signal];
    if (ctx.requestTimeoutMs) signals.push(AbortSignal.timeout(ctx.requestTimeoutMs));
    if (init && init.signal) signals.push(init.signal);
    const p = original(input, { ...(init || {}), signal: anySignal(signals) });
    const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      // Track writes so a timeout can say how many were on the wire (they may still land).
      ctx.stats.writesSent++;
      ctx.stats.writesInFlight++;
      const done = () => { ctx.stats.writesInFlight--; };
      p.then(done, done);
    }
    return p;
  };
  guarded[GUARD] = true;
  globalThis.fetch = guarded;
}

function currentStepAborted() {
  const ctx = als.getStore();
  return !!(ctx && ctx.signal.aborted);
}

const STATUS = Object.freeze({
  COMPLETED: "completed",
  FAILED: "failed",
  TIMED_OUT: "timed_out",
  SKIPPED_BUDGET: "skipped_budget",
});

// steps: [{ key, label, run, timeoutMs, requestTimeoutMs?, minRemainingMs?, softStopGraceMs? }]
// run(ctx) receives { signal, remainingMs, shouldStop }. shouldStop() turns
// true softStopGraceMs before the hard timeout (or at once if aborted), so a
// looping step can stop cleanly, report what it finished and what it deferred,
// instead of being cut off mid-request with its counts lost.
async function runSteps(steps, { budgetMs, now = Date.now, minRemainingMs = 5000 } = {}) {
  installFetchGuard();
  const t0 = now();
  const results = [];
  for (const step of steps) {
    const remaining = budgetMs - (now() - t0);
    const base = { key: step.key, label: step.label || step.key, status: null, startedAt: null, ms: 0, error: null, value: null };
    if (remaining < (step.minRemainingMs ?? minRemainingMs)) {
      results.push({ ...base, status: STATUS.SKIPPED_BUDGET, error: `Skipped: run time budget reached (${Math.max(0, Math.round(remaining))} ms left)` });
      continue;
    }
    const limit = Math.min(step.timeoutMs || remaining, remaining);
    const controller = new AbortController();
    const started = now();
    const entry = { ...base, startedAt: new Date(started).toISOString() };
    const stats = { writesSent: 0, writesInFlight: 0, inFlightAtTimeout: 0 };
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        stats.inFlightAtTimeout = stats.writesInFlight; // snapshot before the abort settles them
        controller.abort(new Error(`step "${step.key}" timed out after ${Math.round(limit)} ms`));
        resolve({ timedOut: true });
      }, limit);
    });
    const ctx = { signal: controller.signal, requestTimeoutMs: step.requestTimeoutMs || null, stats };
    const work = als
      .run(ctx, () =>
        step.run({
          signal: controller.signal,
          remainingMs: limit,
          shouldStop: () => controller.signal.aborted || now() - started >= limit - (step.softStopGraceMs || 0),
        }),
      )
      .then((value) => ({ value }), (error) => ({ error }));
    const outcome = await Promise.race([work, timeout]);
    clearTimeout(timer);
    entry.ms = now() - started;
    entry.writesSent = stats.writesSent;
    entry.writesInFlight = outcome.timedOut ? stats.inFlightAtTimeout || 0 : 0;
    if (outcome.timedOut) {
      entry.status = STATUS.TIMED_OUT;
      entry.error = `Timed out after ${Math.round(limit)} ms`;
      if (stats.inFlightAtTimeout > 0) {
        // A write already on the wire when the step was aborted can still land and is not in any count.
        entry.error += `; ${stats.inFlightAtTimeout} write(s) were in flight and may have landed (counts for this step are unknown)`;
      }
      work.catch(() => {}); // late settlement is ignored; the aborted signal blocks further requests
    } else if (outcome.error) {
      entry.status = STATUS.FAILED;
      entry.error = outcome.error.message || String(outcome.error);
    } else {
      entry.status = STATUS.COMPLETED;
      entry.value = outcome.value;
      entry.partial = !!(outcome.value && outcome.value.stoppedEarly);
    }
    results.push(entry);
  }
  const elapsedMs = now() - t0;
  const complete = results.every((r) => r.status === STATUS.COMPLETED && !r.partial);
  return { results, elapsedMs, budgetMs, complete, partial: !complete };
}

module.exports = { runSteps, installFetchGuard, currentStepAborted, STATUS };
