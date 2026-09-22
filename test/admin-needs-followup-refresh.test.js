// test/admin-needs-followup-refresh.test.js — Needs Follow-up Refresh
// investigation (2026-09-22).
//
// This runs the REAL inline <script> from admin.html inside a Node `vm`
// context, not a hand-copied reproduction of its functions -- the whole
// point of this suite is proving the actual shipped refresh mechanism
// behaves correctly (fresh fetch every time, no stale-data reuse, errors
// surfaced, success/failure honestly reported), which a hand-copy could
// pass even if the real file had a typo. getMissingFields() itself is
// still exercised via this same real-script route, not a separate copy.
//
// The six sibling loaders loadAll() also calls (loadQueue, loadFeedQueue,
// loadEditorial, loadHidden, loadHealthcheck, loadVenues) are stubbed out
// as no-ops after the script runs -- they are unmodified by this fix and
// genuinely out of scope (see admin.html's own loadAll() comment), so
// exercising their real fetch/DOM behavior here would just be testing
// unrelated, unchanged code. Overriding them at the global-function level
// (not editing the script text) leaves loadIncomplete()/loadAll()/
// setRefreshStatus() -- the functions this investigation actually
// touched -- running as real, unmodified admin.html code.
//
// A minimal hand-built `document`/`fetch` stand-in is used instead of a
// jsdom dependency (not installed in this environment, and network access
// to fetch a new package is unavailable here) -- just enough DOM surface
// for the functions under test: getElementById (auto-vivifying stub
// elements with textContent/innerHTML/style/classList/disabled) and
// createElement('div') for escapeHtml()'s real HTML-escaping behavior.
//
// Run: node test/admin-needs-followup-refresh.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function extractMainScript() {
  const html = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  // The last inline <script> (no src) is the app logic; the first <script>
  // tag in the file is the Google Analytics snippet (has a `src`, doesn't
  // match this no-src regex at all in practice, but guard by taking the
  // longest block regardless).
  blocks.sort((a, b) => b.length - a.length);
  return blocks[0];
}

function makeElement(id) {
  return {
    id,
    _text: "",
    _html: "",
    style: { display: "" },
    disabled: false,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) {
        const has = this._set.has(c);
        const want = force === undefined ? !has : force;
        if (want) this._set.add(c); else this._set.delete(c);
      },
    },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v == null ? "" : String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v == null ? "" : String(v); },
  };
}

function makeDocument() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(tag) {
      // Real browsers HTML-escape &, < and > when textContent is read back
      // via innerHTML -- exactly what escapeHtml() in admin.html relies on.
      const el = makeElement(null);
      Object.defineProperty(el, "textContent", {
        get() { return el._text; },
        set(v) {
          el._text = v == null ? "" : String(v);
          el._html = el._text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },
      });
      return el;
    },
    querySelectorAll() { return []; },
    _elements: elements,
  };
}

function buildSandbox() {
  const sandbox = {
    document: makeDocument(),
    console,
    fetch: undefined, // set per-test
    alert() {},
    prompt() { return ""; },
    URLSearchParams,
    encodeURIComponent,
    Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(extractMainScript(), sandbox, { filename: "admin.html (inline script)" });
  // Stub the six sibling loaders loadAll() also calls -- unmodified,
  // out-of-scope, and would otherwise need their own fetch/DOM mocking
  // just to not throw. See file header.
  for (const name of ["loadQueue", "loadFeedQueue", "loadEditorial", "loadHidden", "loadHealthcheck", "loadVenues"]) {
    sandbox[name] = async () => {};
  }
  return sandbox;
}

function eventRow(overrides) {
  return {
    id: "evt-1",
    title: "White Shag Reunion",
    category: "nightlife",
    status: "approved",
    start_date: "2026-10-10",
    time_display: null,
    is_all_day: false,
    venue_name_raw: "Some Venue",
    venue_address_raw: "123 Main St",
    venue_city_raw: "Detroit",
    venue_id: null,
    venues: null,
    description: "A real description.",
    ticket_url: "https://example.com/tickets",
    event_url: null,
    source: "Manual",
    followup_dismissed: false,
    ...overrides,
  };
}

function makeFetchTracker(responder) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return responder(url, opts, calls.length);
  };
  return { fn, calls };
}

async function run() {
  // --- 1. WHITE SHAG CANARY: getMissingFields(), via the real admin.html
  //     code path -- an event missing time_display is flagged; the same
  //     event with time_display = 'Doors 7:00 PM' is not. Answers task
  //     question 5 directly from code, not assumption. ---
  {
    const sandbox = buildSandbox();
    const missingTime = eventRow({ time_display: null });
    const clearedTime = eventRow({ time_display: "Doors 7:00 PM" });
    assert.ok(sandbox.getMissingFields(missingTime).includes("start time"), "a null time_display must flag 'start time'");
    assert.ok(!sandbox.getMissingFields(clearedTime).includes("start time"), "a nonblank time_display ('Doors 7:00 PM') must NOT flag 'start time' -- White Shag's canary condition");
    // Array.from() normalizes a vm-realm Array to this realm's Array
    // before comparing -- assert.deepStrictEqual treats cross-realm arrays
    // (different Array.prototype identity) as unequal even with identical
    // contents, which is a vm quirk, not a real behavioral difference.
    assert.deepStrictEqual(Array.from(sandbox.getMissingFields(clearedTime)), [], "with time_display set and every other field already present, this row must be fully cleared");
  }
  console.log("PASS: White Shag canary -- nonblank time_display clears START TIME under the real getMissingFields()");

  // --- 2. Refresh triggers a genuinely NEW data request each call (not a
  //     cached Promise/result) -- call loadIncomplete() twice, assert two
  //     separate fetches were made. ---
  {
    const sandbox = buildSandbox();
    const { fn, calls } = makeFetchTracker(() => ({ ok: true, status: 200, json: async () => ({ events: [] }) }));
    sandbox.fetch = fn;
    await sandbox.loadIncomplete();
    await sandbox.loadIncomplete();
    assert.strictEqual(calls.length, 2, "each call to loadIncomplete() must issue its own network request, not reuse a cached result");
    assert.ok(calls.every((c) => c.url === "/api/admin-events?incomplete=1"), "every call must hit the incomplete=1 endpoint");
  }
  console.log("PASS: loadIncomplete() issues a fresh fetch on every call -- no cached Promise/result reuse");

  // --- 3. Refreshed data REPLACES stale data: first response has one
  //     flagged event, second (simulating White Shag's fix having landed)
  //     has zero -- the second render must fully replace the first, not
  //     merge/append. ---
  {
    const sandbox = buildSandbox();
    let call = 0;
    sandbox.fetch = async () => {
      call++;
      const events = call === 1 ? [eventRow({ time_display: null })] : [eventRow({ time_display: "Doors 7:00 PM" })];
      return { ok: true, status: 200, json: async () => ({ events }) };
    };
    await sandbox.loadIncomplete();
    const badgeAfterFirst = sandbox.document.getElementById("badge-followup").textContent;
    assert.strictEqual(badgeAfterFirst, "1", "first load: one event missing start time");
    await sandbox.loadIncomplete();
    const badgeAfterSecond = sandbox.document.getElementById("badge-followup").textContent;
    assert.strictEqual(badgeAfterSecond, "0", "second load must REPLACE, not add to, the first -- count must drop to 0 once the underlying row clears");
    const listHtml = sandbox.document.getElementById("incompleteList").innerHTML;
    assert.ok(listHtml.includes("Nothing missing"), "the rendered list itself must also reflect the fresh, empty result");
  }
  console.log("PASS: a fresh response fully replaces the previous one -- Needs Follow-up is recomputed, not merged, and the displayed count changes when an event becomes complete");

  // --- 4. Failed refresh does NOT falsely report success, and surfaces the
  //     failure instead of silently leaving old data looking current. ---
  {
    const sandbox = buildSandbox();
    // First, a successful load so there IS old data on screen.
    sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => ({ events: [eventRow({ time_display: null })] }) });
    await sandbox.loadIncomplete();
    const listBefore = sandbox.document.getElementById("incompleteList").innerHTML;
    assert.ok(listBefore.includes("White Shag Reunion"), "sanity: the stale card is on screen before the failed refresh");

    // Now simulate a failed refresh (e.g. a transient 500).
    sandbox.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: "internal error" }) });
    const ok = await sandbox.loadIncomplete();
    assert.strictEqual(ok, false, "loadIncomplete() must report failure, not silently return as if it succeeded");
    const errEl = sandbox.document.getElementById("incompleteError");
    assert.strictEqual(errEl.style.display, "block", "a failed refresh must show a visible error banner");
    assert.ok(errEl.textContent.length > 0, "the error banner must contain a real message, not be blank");
    const listAfter = sandbox.document.getElementById("incompleteList").innerHTML;
    assert.strictEqual(listAfter, listBefore, "on failure the previous (last-known-good) list must be left alone, not blanked or corrupted");
  }
  console.log("PASS: a failed refresh reports failure, shows a visible error, and preserves (doesn't corrupt) the last-known-good list");

  // --- 4b. Same for a thrown network error (not just a non-OK response). ---
  {
    const sandbox = buildSandbox();
    sandbox.fetch = async () => { throw new Error("network down"); };
    const ok = await sandbox.loadIncomplete();
    assert.strictEqual(ok, false, "a thrown fetch error must also report failure, not throw uncaught or report success");
    const errEl = sandbox.document.getElementById("incompleteError");
    assert.strictEqual(errEl.style.display, "block");
    assert.ok(errEl.textContent.includes("network down"), "the real error message should be surfaced, not swallowed");
  }
  console.log("PASS: a thrown network error is caught, reported as failure, and surfaced -- not silently swallowed");

  // --- 5. loadAll() (what the Refresh button actually calls): shows a
  //     loading state on the button, and only stamps "Last refreshed" when
  //     the Needs Follow-up fetch actually succeeded -- never on failure. ---
  {
    const sandbox = buildSandbox();
    let resolveFetch;
    const pending = new Promise((r) => { resolveFetch = r; });
    let fetchStarted = false;
    sandbox.fetch = async () => {
      fetchStarted = true;
      await pending;
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    };
    const btn = sandbox.document.getElementById("refreshBtn");
    btn.textContent = "↻ Refresh";
    const runPromise = sandbox.loadAll();
    // Yield a tick so loadAll() has entered its try block and called fetch.
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(fetchStarted, "loadAll() must have started a real fetch before resolving");
    assert.strictEqual(btn.disabled, true, "the Refresh button must show a loading state (disabled) while a refresh is in flight");
    assert.strictEqual(sandbox.document.getElementById("refreshStatus").textContent, "Refreshing…", "a visible in-flight status must be shown");
    resolveFetch();
    await runPromise;
    assert.strictEqual(btn.disabled, false, "the button must re-enable once the refresh completes");
    assert.strictEqual(btn.textContent, "↻ Refresh", "the button label must be restored after completion");
    assert.ok(sandbox.document.getElementById("refreshStatus").textContent.startsWith("Last refreshed:"), "a successful refresh must stamp a Last refreshed indicator");
  }
  console.log("PASS: loadAll() shows a loading state on the Refresh button and stamps Last refreshed only after a real completed fetch");

  {
    const sandbox = buildSandbox();
    sandbox.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) });
    await sandbox.loadAll();
    const statusEl = sandbox.document.getElementById("refreshStatus");
    assert.ok(!statusEl.textContent.startsWith("Last refreshed:"), "loadAll() must NOT stamp Last refreshed when the Needs Follow-up fetch failed -- that would falsely report success");
    assert.ok(statusEl.classList.contains("refresh-error"), "a failed refresh must be visually distinguished as an error, not look like a normal successful refresh");
    assert.ok(/fail/i.test(statusEl.textContent), "the status text must say the refresh failed");
  }
  console.log("PASS: loadAll() does not falsely report success (no Last refreshed stamp, visible error state) when the Needs Follow-up fetch fails");

  console.log("\nAll admin.html Needs Follow-up refresh tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
