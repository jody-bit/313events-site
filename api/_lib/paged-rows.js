"use strict";

// api/_lib/paged-rows.js -- read EVERY row a Supabase (PostgREST) query matches, server side.
//
// Supabase returns at most "Max rows" rows per request (1,000 on this project) whatever `limit=` asks for, with a 200 and no
// error (see paged-fetch.js for the Oct 3 production defect). A server read that asks for `limit=5000` therefore silently
// loses every row after the first 1,000. This helper advances `offset` by however many rows actually came back and stops on
// an empty page, so it is correct for any cap. Same loop as fetchAllPages in api/admin-events.js, but returns partial rows
// with ok:false instead of dropping them, so a fail-soft caller (the sitemap) can still use what arrived.
//
// CALLERS MUST pass a URL with a deterministic total order -- `order=<col>.asc,id.asc` -- because paging over ties can
// repeat or skip rows at page boundaries. The URL must not already contain `limit=` or `offset=`; this function owns both.
//
// Returns { ok, rows, pages, error? }. ok:false means the rows are partial (a request failed, or the request ceiling was hit).

const PAGE_SIZE = 1000;
const MAX_PAGE_REQUESTS = 60;

async function fetchAllPagedRows(url, headers, options) {
  if (/[?&](limit|offset)=/.test(url)) throw new Error("fetchAllPagedRows: the url must not contain limit= or offset=");
  if (!/[?&]order=[^&]*\bid\.asc\b/.test(url)) throw new Error("fetchAllPagedRows: the url needs a deterministic order ending in id.asc");
  const fetchFn = (options && options.fetch) || fetch;
  const maxRequests = (options && options.maxRequests) || MAX_PAGE_REQUESTS;
  const rows = [];
  let pages = 0;
  for (let request = 0; request < maxRequests; request++) {
    let resp;
    let body;
    try {
      resp = await fetchFn(`${url}&limit=${PAGE_SIZE}&offset=${rows.length}`, { headers });
      body = await resp.json();
    } catch (err) {
      return { ok: false, rows, pages, error: err.message };
    }
    if (!resp.ok) return { ok: false, rows, pages, error: `HTTP ${resp.status}` };
    if (!Array.isArray(body)) return { ok: false, rows, pages, error: "Unexpected response shape" };
    if (body.length === 0) return { ok: true, rows, pages };
    rows.push(...body);
    pages++;
  }
  return { ok: false, rows, pages, error: `Still reading after ${maxRequests} requests (${rows.length} rows)` };
}

module.exports = { fetchAllPagedRows, PAGE_SIZE, MAX_PAGE_REQUESTS };
