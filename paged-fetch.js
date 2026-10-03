// paged-fetch.js — loads EVERY row a Supabase (PostgREST) query matches,
// not just the first page of them. Shared static include, same pattern as
// legal-snippets.js / legal-dates.js (a plain <script src> — no build step,
// no dependency). Exposes exactly one global: fetchAllRows().
//
// WHY THIS EXISTS (2026-10-03, production defect). Supabase's API returns
// at most "Max rows" rows per request (1,000 on this project) REGARDLESS of
// the `limit=` a query asks for — `limit=2000` and `limit=5000` both came
// back with exactly 1,000 rows, with a 200/206 status and no error. Every
// page's event query was a single un-paged request, so once the table
// passed 1,000 matching rows each page silently lost everything after its
// first 1,000 in `order=start_date.asc` order:
//   - calendar.html (no date floor) kept the OLDEST 1,000 approved events,
//     which by 2026-10-03 ended on 2026-10-02 — i.e. it loaded zero events
//     starting today or later (today's cell showed 19 of 121).
//   - index.html / map.html kept 686 of 1,901 upcoming events, ending
//     2026-10-20; search, "all upcoming", neighborhood counts and radius
//     filtering all stopped there.
// The earlier `limit=2000` / `limit=5000` "audit fixes" in those files were
// written on the belief that an explicit limit lifts the cap. It does not.
//
// HOW IT WORKS.
//   1. One tiny request (`Prefer: count=exact`, `Range: 0-0`) reads the
//      exact number of matching rows off the Content-Range header — the
//      same technique index.html's loadOrbitEventTotal() already uses.
//   2. Fast path: every page is requested at once (`limit`/`offset`), so
//      the whole set arrives in roughly the time of the slowest page.
//   3. The fast path is only trusted if it returned as many rows as the
//      count promised. If it returned fewer — meaning the server's cap is
//      lower than the page size asked for — or the count was unavailable,
//      or any request failed, it falls back to the slow path:
//   4. Slow path: one page at a time, advancing by HOWEVER MANY ROWS
//      ACTUALLY CAME BACK, until the known total is reached or a page comes
//      back empty. This is correct for any server cap, including one that
//      changes later; it never assumes 1,000.
//
// CALLERS MUST pass a URL with a deterministic total order — add a unique
// tiebreak, e.g. `order=start_date.asc,id.asc`. `start_date` alone is not a
// total order (hundreds of events share a date), and paging over ties can
// repeat or skip rows at page boundaries. The URL must not already contain
// `limit=` or `offset=`; this function owns both.
//
// RETURNS { rows, total, complete, pages }.
//   complete === false means the result is known to be partial (a later
//   page failed even after a retry, or the safety ceiling was reached). It
//   is also reported with console.warn. A failure of the very first request
//   throws instead, so a caller's existing try/catch keeps its fallback
//   data on screen exactly as before.
(function (root) {
  "use strict";

  var DEFAULT_PAGE_SIZE = 1000;
  // Safety ceiling against a runaway loop, not a product limit. Reaching it
  // is reported (complete:false + console.warn), never silent.
  var DEFAULT_MAX_ROWS = 50000;

  function warn(message) {
    if (typeof console !== "undefined" && console.warn) console.warn("[paged-fetch] " + message);
  }

  // "0-0/2953" -> 2953.  "*/0" -> 0.  "0-999/*" or missing -> null.
  function parseTotal(contentRange) {
    if (!contentRange) return null;
    var slash = contentRange.lastIndexOf("/");
    if (slash === -1) return null;
    var n = parseInt(contentRange.slice(slash + 1), 10);
    return isNaN(n) ? null : n;
  }

  function withParams(url, pageSize, offset) {
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "limit=" + pageSize + "&offset=" + offset;
  }

  async function fetchAllRows(url, headers, options) {
    options = options || {};
    var doFetch = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!doFetch) throw new Error("paged-fetch: no fetch implementation available");
    if (/[?&](limit|offset)=/.test(url)) {
      throw new Error("paged-fetch: pass the URL without limit=/offset= (fetchAllRows adds them)");
    }
    var pageSize = options.pageSize > 0 ? Math.floor(options.pageSize) : DEFAULT_PAGE_SIZE;
    var maxRows = options.maxRows > 0 ? Math.floor(options.maxRows) : DEFAULT_MAX_ROWS;
    var baseHeaders = headers || {};

    // One page. A 416 means "offset is past the end" (PostgREST answers
    // that way when a count was requested) and is treated as an empty
    // page, not an error. Any other failure is retried once, then thrown.
    async function fetchPage(offset) {
      var lastError = null;
      for (var attempt = 0; attempt < 2; attempt++) {
        try {
          var resp = await doFetch(withParams(url, pageSize, offset), { headers: baseHeaders });
          if (resp.status === 416) return [];
          if (!resp.ok) throw new Error("HTTP " + resp.status);
          var rows = await resp.json();
          if (!Array.isArray(rows)) throw new Error("response was not a list of rows");
          return rows;
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    }

    // Exact number of matching rows, or null if it can't be determined
    // (the slow path below works without it).
    async function fetchTotal() {
      try {
        var countHeaders = {};
        Object.keys(baseHeaders).forEach(function (k) { countHeaders[k] = baseHeaders[k]; });
        countHeaders.Prefer = "count=exact";
        countHeaders.Range = "0-0";
        var resp = await doFetch(url, { headers: countHeaders });
        // 416 with "*/0" is how an empty result set is reported here.
        if (!resp.ok && resp.status !== 416) return null;
        return parseTotal(resp.headers && resp.headers.get ? resp.headers.get("content-range") : null);
      } catch (err) {
        return null;
      }
    }

    var total = await fetchTotal();
    if (total === 0) return { rows: [], total: 0, complete: true, pages: 0 };

    var rows = null;
    var pages = 0;
    var complete = true;

    // ---- Fast path: all pages at once ----
    if (total !== null) {
      var wanted = Math.min(total, maxRows);
      var offsets = [];
      for (var off = 0; off < wanted; off += pageSize) offsets.push(off);
      try {
        var results = await Promise.all(offsets.map(fetchPage));
        var received = results.reduce(function (sum, page) { return sum + page.length; }, 0);
        if (received >= wanted) {
          rows = [];
          results.forEach(function (page) { rows = rows.concat(page); });
          pages = results.length;
        }
        // else: fewer rows came back than the count promised, which means
        // the server returned less per page than was asked for and these
        // pages have gaps between them — discard and go page by page.
      } catch (err) {
        // A page failed even after its retry — go page by page instead, so
        // whatever can be loaded still is.
      }
    }

    // ---- Slow path: one page at a time, cap-agnostic ----
    if (rows === null) {
      rows = [];
      pages = 0;
      var offset = 0;
      while (offset < maxRows) {
        var page;
        try {
          page = await fetchPage(offset);
        } catch (err) {
          if (offset === 0) throw err; // nothing loaded at all — let the caller keep its fallback
          complete = false;
          warn("stopped after " + rows.length + " rows: a page failed to load (" + (err && err.message) + ")");
          break;
        }
        if (!page.length) break;
        rows = rows.concat(page);
        pages++;
        offset += page.length;
        if (total !== null && offset >= total) break;
      }
      if (total === null && offset >= maxRows) {
        complete = false;
        warn("result truncated at the " + maxRows + "-row safety ceiling (total unknown)");
      }
    }

    // Rows that carry an `id` are de-duplicated: if a row is inserted
    // upstream while pages are in flight, a later page can repeat a row an
    // earlier page already returned.
    if (rows.length && rows[0] && typeof rows[0] === "object" && "id" in rows[0]) {
      var seen = new Set();
      rows = rows.filter(function (r) {
        if (r == null || r.id == null) return true;
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    }

    if (total !== null && total > maxRows) {
      complete = false;
      warn("result truncated at the " + maxRows + "-row safety ceiling (" + total + " rows match)");
    }

    return { rows: rows, total: total, complete: complete, pages: pages };
  }

  root.fetchAllRows = fetchAllRows;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { fetchAllRows: fetchAllRows };
  }
})(typeof window !== "undefined" ? window : globalThis);
