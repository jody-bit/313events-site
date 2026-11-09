// test/paged-query-guard.test.js
//
// Regression guard (Discovery, 2026-11-09; test-only). Supabase returns at most 1,000 rows per request whatever `limit=` asks for
// (paged-fetch.js header), with a 200 and no error. A page that reads events, events_public or venues rows with a plain fetch() therefore
// silently drops everything after row 1,000, and any count derived from that list silently caps. This test fails on any public-page consumer
// of those tables that is none of:
//   - paged through fetchAllRows() (paged-fetch.js),
//   - a count read (`Prefer: count=exact`, header-only), or
//   - bounded by design: a single-row filter (`id=eq.`), an id list (`id=in.(`), or an explicit `limit=` below 1000.
// It is a ratchet: the known offenders below are named, so it passes today. Fixing one means deleting its entry in the SAME change, and the
// test fails if a listed entry no longer offends, so the list can only shrink. Adding a new offender fails.
// Static, heuristic scan of one statement window (the URL line plus the next 12 lines). Run: node test/paged-query-guard.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = process.env.REPO_DIR || process.cwd();
const TABLES = /rest\/v1\/(events_public|events|venues)\b/;
// Public-page consumers only: root-level html/js; not tests, api, scripts, supabase, node_modules, or the pager itself.
const FILES = fs.readdirSync(ROOT).filter((f) => /\.(html|js)$/.test(f) && f !== "paged-fetch.js");

// "file:table:reason", reason = why it is capped. Empty: #374 (neighborhood counts) and #377 (calendar/map venue coordinates) fixed the former offenders.
const KNOWN = [];

function classify(lines, i) {
  const win = lines.slice(i, i + 13).join("\n");
  const line = lines[i];
  if (/fetchAllRows\(/.test(win)) return "paged";
  if (/count=exact/.test(win)) return "count";
  if (/[?&]id=eq\./.test(line) || /[?&]id=in\.\(/.test(line)) return "bounded";
  const lim = /[?&]limit=(\d+)/.exec(line);
  if (lim) return +lim[1] < 1000 ? "bounded" : "limit=" + lim[1];
  const ve = /venue_id=eq\./.test(line);
  return ve ? "unbounded-venue-filter" : "unbounded";
}

const found = [];
for (const f of FILES) {
  const lines = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n");
  lines.forEach((l, i) => {
    const m = TABLES.exec(l);
    if (!m || /^\s*(\/\/|\*)/.test(l)) return;
    const c = classify(lines, i);
    if (!["paged", "count", "bounded"].includes(c)) found.push(`${f}:${m[1]}:${c}`);
  });
}
assert.ok(FILES.length > 5, "scanned the page files");

const unexpected = found.filter((k) => !KNOWN.includes(k));
assert.deepStrictEqual(unexpected, [], "a capped events/events_public/venues query was introduced: page it with fetchAllRows() (order=...,id.asc), read a count header, or bound it below 1000. New: " + unexpected.join(", "));
const stale = KNOWN.filter((k) => !found.includes(k));
assert.deepStrictEqual(stale, [], "these known offenders no longer offend (fixed?): delete them from KNOWN in this change: " + stale.join(", "));

// self-check on the classifier with synthetic lines (so a refactor of the scan cannot silently turn it into a no-op)
const t = (src) => { const L = src.split("\n"); return classify(L, 0); };
assert.strictEqual(t("fetch(`${U}/rest/v1/events_public?select=neighborhood&limit=3000`)"), "limit=3000");
assert.strictEqual(t("fetch(`${U}/rest/v1/events?id=eq.5&select=id`)"), "bounded");
assert.strictEqual(t("fetch(`${U}/rest/v1/events?venue_id=eq.5&limit=100`)"), "bounded");
assert.strictEqual(t("const url = `${U}/rest/v1/events?select=id`;\nfetchAllRows(url, h)"), "paged");
assert.strictEqual(t("const url = `${U}/rest/v1/events?select=id`;\nfetch(url, {headers:{Prefer:'count=exact'}})"), "count");
assert.strictEqual(t("fetch(`${U}/rest/v1/events?select=id`)"), "unbounded");
console.log("paged-query-guard: ok (" + KNOWN.length + " known offenders)");
