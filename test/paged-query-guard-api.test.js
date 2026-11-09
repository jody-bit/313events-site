// test/paged-query-guard-api.test.js
//
// DRAFT, test-only. Server-side companion to test/paged-query-guard.test.js (#376, which scans only root-level public pages).
// Supabase returns at most 1,000 rows per request whatever `limit=` asks for (paged-fetch.js header), with a 200 and no error, so a server
// read of events, events_public or venues that is not paged silently drops every row after 1,000 (the sitemap, the link-check candidate pool and
// the dedupe/enrichment scans are server consumers of exactly this). A statement under api/ that reads those tables fails this test unless it is:
//   - paged (fetchAllPagedRows / fetchAllPages / fetchAllRows in the statement window),
//   - a count read (`count=exact`), or bounded by design (`id=eq.`, `id=in.(`, or an explicit `limit=` below 1000), or
//   - a write (PATCH / POST / DELETE / PUT in the window): not a list read.
// Same ratchet as #376: the known offenders are NAMED so the test passes today; fixing one means deleting its entry in the SAME change, a stale
// entry fails, a new offender fails. Static heuristic over one statement window (the URL line plus the next 12 lines); it cannot prove a read is
// safe, only flag the common unpaged shape.
// BLIND SPOT (P1 review): only literal table names are matched. A table built from a variable (`rest/v1/${table}`) is NOT scanned, so a
// generic helper that reads any table is invisible here; review such helpers by hand.
// MANUAL FINDING (P1 review): api/_lib/organizer-links.js:65 is a bulk PATCH (a write inside its own fetch call), not a list read. No production code is touched. Run: node test/paged-query-guard-api.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = process.env.REPO_DIR || process.cwd();
const TABLES = /rest\/v1\/(events_public|events|venues)\b/;
const PAGERS = /\b(fetchAllPagedRows|fetchAllPages|fetchAllRows)\(/;

function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? listJs(p) : /\.js$/.test(d.name) && d.name !== "paged-rows.js" ? [p] : [];
  });
}

// The text of the fetch call this URL line belongs to: from the nearest opening fetch( / doFetch( at or up to 3 lines above the URL line,
// to the first line at or after it that closes the call (ends with ");" or ")"), at most 10 lines. Falls back to the next fetch( after the URL
// line when the URL is built into a const first. A method counts as a write ONLY if it is inside this call.
function callText(lines, i) {
  const open = /\b\w*[fF]etch\w*\(/;
  let start = -1;
  for (let k = i; k >= Math.max(0, i - 3); k--) if (open.test(lines[k])) { start = k; break; }
  if (start < 0) {
    // The URL is built into a variable first: only a later fetch call that USES that variable is this read's call (P1 residual: an unrelated
    // PATCH within a few lines must not exempt it). No variable name found, or no call using it: not a write.
    const v = /(?:const|let|var)\s+(\w+)\s*=/.exec(lines[i]);
    if (!v) return "";
    const used = new RegExp("\\b" + v[1] + "\\b");
    for (let k = i + 1; k < Math.min(lines.length, i + 8); k++) if (open.test(lines[k]) && used.test(lines[k])) { start = k; break; }
    if (start < 0) return "";
  }
  let end = start;
  for (let k = Math.max(start, i); k < Math.min(lines.length, start + 10); k++) { end = k; if (/\)\s*;?\s*$/.test(lines[k]) || /\}\s*\)\s*;?\s*$/.test(lines[k])) break; }
  return lines.slice(start, end + 1).join("\n");
}

function classify(lines, i) {
  const win = lines.slice(i, i + 13).join("\n");
  // The URL template can continue on the next lines (`...&order=x&limit=5000`): look at the URL line plus the two after it.
  const line = lines.slice(i, i + 3).join("");
  if (PAGERS.test(win)) return "paged";
  if (/count=exact/.test(win)) return "count";
  // limit of 1000 or more is checked BEFORE the write exemption: a list read capped at 1,000 is an offender whatever follows it.
  const lim = /[?&]limit=(\d+)/.exec(line);
  if (lim && +lim[1] >= 1000) return "limit=" + lim[1];
  if (/method:\s*["'](PATCH|POST|DELETE|PUT)["']/i.test(callText(lines, i))) return "write";
  if (/[?&]id=eq\./.test(line) || /[?&]id=in\.\(/.test(line)) return "bounded";
  if (lim) return "bounded";
  return "unbounded";
}

const FILES = listJs(path.join(ROOT, "api"));
assert.ok(FILES.length > 10, "scanned the api files");
const found = [];
for (const f of FILES) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((l, i) => {
    const m = TABLES.exec(l);
    if (!m || /^\s*(\/\/|\*)/.test(l)) return;
    const c = classify(lines, i);
    if (!["paged", "count", "bounded", "write"].includes(c)) found.push(`${rel}:${m[1]}:${c}`);
  });
}

// "file:table:reason". Generated against main 154b9370; see the draft note for which of these are real unbounded list reads.
const KNOWN = [
  "api/_lib/control-tower.js:events:unbounded",
  "api/_lib/control-tower.js:venues:unbounded",
  "api/_lib/event-upsert.js:events:unbounded",
  "api/_lib/status-lookup.js:events:unbounded",
  "api/_lib/venue-lookup.js:events:unbounded",
  "api/_lib/venue-lookup.js:venues:limit=1000",
  "api/admin-venues.js:venues:limit=1000",
  "api/cron-antonartcenter.js:events:limit=1000",
  "api/cron-editorial.js:events:unbounded",
  "api/cron-motorcitywine.js:events:limit=1000",
  "api/cron-post-to-facebook.js:events:unbounded",
  "api/cron-visitdetroit.js:events:unbounded",
];

const uniq = (a) => Array.from(new Set(a));
const unexpected = uniq(found).filter((k) => !KNOWN.includes(k));
assert.deepStrictEqual(unexpected, [], "a server read of events/events_public/venues is not paged: use fetchAllPagedRows (order=...,id.asc), a count header, or bound it below 1000. New: " + unexpected.join(", "));
const stale = KNOWN.filter((k) => !found.includes(k));
assert.deepStrictEqual(stale, [], "these known offenders no longer offend (fixed?): delete them from KNOWN in this change: " + stale.join(", "));

// self-check on the classifier
const t = (src) => classify(src.split("\n"), 0);
assert.strictEqual(t("fetch(`${U}/rest/v1/events?select=id&limit=5000`)"), "limit=5000");
assert.strictEqual(t("fetch(`${U}/rest/v1/events?select=id`)"), "unbounded");
assert.strictEqual(t("fetch(`${U}/rest/v1/events?id=eq.5`)"), "bounded");
assert.strictEqual(t("fetch(`${U}/rest/v1/events?id=eq.5`, {\n method: \"PATCH\" })"), "write");
assert.strictEqual(t("const url = `${U}/rest/v1/events?select=id&limit=5000`;\nconst r = await fetch(url, { headers });\nawait fetch(u2, { method: \"PATCH\" });"), "limit=5000", "a later PATCH does not exempt a capped read");
assert.strictEqual(t("const url = `${U}/rest/v1/events?select=id`;\nconst r = await fetch(url, { headers });\nawait fetch(u2, { method: \"PATCH\" });"), "unbounded", "a later PATCH in another call does not exempt an unbounded read");
assert.strictEqual(t("const url = `${U}/rest/v1/events?select=id`;\nawait fetch(other, { method: \"PATCH\" });\nawait fetch(url, { headers });"), "unbounded", "an unrelated PATCH between the const and its fetch does not exempt it");
assert.strictEqual(t("const url = `${U}/rest/v1/events?status=eq.x`;\nawait fetch(url, { method: \"PATCH\", body: b });"), "write", "a const URL used by a PATCH call is a write");
assert.strictEqual(t("await doFetch(\n  `${U}/rest/v1/events?title=ilike.x`,\n  {\n method: \"PATCH\", body: b }\n);").length > 0, true);
assert.strictEqual(t("fetch(`${U}/rest/v1/events?status=eq.x`, {\n method: \"PATCH\" })"), "write");
assert.strictEqual(t("const url = `${U}/rest/v1/events?select=id`;\nawait fetchAllPagedRows(url, h)"), "paged");
assert.strictEqual(t("fetch(`${U}/rest/v1/events?select=id`, { headers: { Prefer: \"count=exact\" } })"), "count");
console.log("paged-query-guard-api: ok (" + KNOWN.length + " known offenders)");
