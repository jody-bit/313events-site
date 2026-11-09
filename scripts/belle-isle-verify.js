#!/usr/bin/env node
"use strict";

// scripts/belle-isle-verify.js -- READ-ONLY verification of the Belle Isle Nature Center
// events endpoint. Changes nothing; the connector is not touched or called.
//
//   Live (GET only, run from a normal network, not this sandbox):
//     node scripts/belle-isle-verify.js
//   From saved responses (e.g. copied from a browser; JSON body file, optional status):
//     node scripts/belle-isle-verify.js --file page1.json [--status 200]
//
// Classifies the response as exactly one of:
//   VALID_WITH_EVENTS   200, JSON object with a non-empty `events` array
//   VALID_EMPTY         200, JSON object with `events: []`
//   BLOCKED             401/403/429, or an HTML / challenge page instead of JSON
//   INVALID_STRUCTURE   200 but not the Tribe shape (no `events` array, error object, array root)
//   NOT_FOUND           404 / rest_no_route (endpoint moved or plugin removed)
// plus limits: total vs returned, total_pages > 1 (the connector reads page 1 only),
// and the earliest/latest dates returned (window).

const BASE = "https://belleislenaturecenter.org/wp-json/tribe/events/v1/events";

function classify({ status, contentType, body }) {
  const text = typeof body === "string" ? body : null;
  let json = typeof body === "object" ? body : null;
  if (text !== null) { try { json = JSON.parse(text); } catch (_) { json = null; } }
  const looksHtml = text !== null && json === null && /<\s*(html|!doctype|head|body)/i.test(text);
  if (status === 401 || status === 403 || status === 429 || (looksHtml && status !== 404)) return { kind: "BLOCKED", detail: `HTTP ${status}${looksHtml ? ", HTML page instead of JSON (WAF / challenge / consent)" : ""}` };
  if (status === 404 || (json && json.code === "rest_no_route")) return { kind: "NOT_FOUND", detail: `HTTP ${status}${json && json.code ? " " + json.code : ""}` };
  if (!(status >= 200 && status < 300)) return { kind: "INVALID_STRUCTURE", detail: `HTTP ${status}` };
  if (!json || typeof json !== "object" || Array.isArray(json) || !Array.isArray(json.events)) {
    return { kind: "INVALID_STRUCTURE", detail: json && typeof json === "object" ? `no events array (keys: ${Object.keys(json).slice(0, 8).join(",")})` : "body is not a JSON object" };
  }
  const dates = json.events.map((e) => String(e.start_date || "").slice(0, 10)).filter(Boolean).sort();
  const limits = {
    returned: json.events.length,
    total: typeof json.total === "number" ? json.total : null,
    total_pages: typeof json.total_pages === "number" ? json.total_pages : null,
    has_next_page: Boolean(json.next_rest_url),
    earliest: dates[0] || null,
    latest: dates[dates.length - 1] || null,
  };
  const notes = [];
  if (limits.total_pages && limits.total_pages > 1) notes.push(`total_pages=${limits.total_pages}: the connector reads page 1 only (per_page=50); events beyond ${limits.returned} are never fetched`);
  if (limits.total !== null && limits.total > limits.returned && !(limits.total_pages > 1)) notes.push("total exceeds returned with no further page: possible server-side cap");
  if (!json.events.length) notes.push("empty is only meaningful if the website's own program calendar shows no upcoming programs; compare by eye");
  return { kind: json.events.length ? "VALID_WITH_EVENTS" : "VALID_EMPTY", detail: `HTTP ${status}`, limits, notes };
}

module.exports = { classify, BASE };

if (require.main === module) {
  const fs = require("fs");
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  (async () => {
    let result;
    if (arg("--file")) {
      result = classify({ status: Number(arg("--status") || 200), body: fs.readFileSync(arg("--file"), "utf8") });
    } else {
      const probes = [["default", `${BASE}?per_page=50`], ["date window", `${BASE}?per_page=50&start_date=${new Date().toISOString().slice(0, 10)}`]];
      result = {};
      for (const [name, url] of probes) {
        try {
          const r = await fetch(url, { method: "GET", headers: { "User-Agent": "313.events endpoint check" } });
          result[name] = { url, ...classify({ status: r.status, contentType: r.headers.get("content-type"), body: await r.text() }) };
        } catch (e) { result[name] = { url, kind: "BLOCKED", detail: "network error: " + e.message }; }
      }
    }
    console.log(JSON.stringify(result, null, 2));
  })();
}
