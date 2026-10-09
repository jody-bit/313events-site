// test/no-internal-fields-public.test.js
// Guard: internal / editorial / operational event fields must never be fetched
// or rendered by a public surface. On 2026-10-06 events.note (a free-text
// column that staff and research sessions used for editorial commentary such
// as "included per Jody's request ...") was printed on event cards, the event
// page, the .ics download and search matching, for ~300 approved events.
// The public pages must not read it, whatever the database lets anon select.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// Columns that must never appear in a public surface's events read.
const INTERNAL = ["note", "internal_note", "submitter_email", "submitter_org_name", "organizer_id",
  "feed_source_id", "external_id", "followup_dismissed", "followup_dismissed_note", "followup_dismissed_at",
  "description_source", "link_check_status", "link_checked_at"];

// admin.html is the authenticated Admin tool, not a public surface.
const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html") && f !== "admin.html")
  .concat(["discovery.js", "api/event-meta.js", "api/venue-meta.js", "api/sitemap.js"]);

// 1. No public events / events_public read asks for an internal column or select=*.
function selectCols(url) {
  const m = url.match(/[?&]select=([^&`'"]*)/);
  if (!m) return [];
  let depth = 0, cur = "", out = [];
  const flush = () => { const t = cur.trim(); if (t && !t.includes("(")) out.push(t); cur = ""; };
  for (const ch of m[1].replace(/\$\{[^}]*\}/g, "")) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { flush(); continue; }
    cur += ch;
  }
  flush();
  return out;
}
let reads = 0;
for (const f of pages) {
  for (const m of read(f).matchAll(/rest\/v1\/(?:events|events_public)\?[^`'"]*/g)) {
    reads++;
    const cols = selectCols(m[0]);
    assert(!cols.includes("*"), `${f}: public events read uses select=*`);
    for (const c of cols) assert(!INTERNAL.includes(c), `${f}: public events read selects internal column "${c}"`);
  }
}
assert(reads >= 6, "expected to find the pages' events reads, found " + reads);

// 2. No public surface maps, renders, exports or searches an event's `note`.
//    (Static fallback sample rows still carry a `note:` property in the HTML
//    source; nothing may read it back.)
for (const f of pages) {
  const code = read(f).split("\n")
    .filter((l) => !/^\s*\{date:/.test(l))        // static sample rows
    .join("\n");
  assert(!/\b(?:e|ev|event|row|r)\.note\b/.test(code), `${f}: reads \`.note\` of an event/row`);
  assert(!/row\.internal_note|\.internal_note\b|\.submitter_email\b|\.submitter_org_name\b/.test(code), `${f}: touches a private field`);
  assert(!/id="evtNote"/.test(code), `${f}: still has the event-note element`);
}

// 3. The downloadable calendar entry (.ics) and share text are built from public
//    fields only.
for (const f of ["index.html", "event-template.html"]) {
  const m = read(f).match(/function buildEventDescription\(e\)\{[\s\S]*?\n\}/);
  assert(m, f + ": buildEventDescription not found");
  assert(!/note/.test(m[0]), f + ": buildEventDescription must not include a note");
}

console.log("no-internal-fields-public: ok (" + reads + " public events reads checked)");
