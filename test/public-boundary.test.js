// test/public-boundary.test.js
// SZ-01 guard: anonymous clients may read only an explicit allowlist of `events`
// columns, and nothing anonymous may write. Two checks that need no database:
//  1. the migration grants exactly the allowlist and no private column;
//  2. every anon-key read of `events` in the pages and public API endpoints
//     (select list, filters, ordering) stays inside that allowlist, so a page
//     that starts selecting a private column fails here, not in production.
// The live database is checked by supabase/verify/public_boundary_check.sql.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// ---- 1. the migration -------------------------------------------------------
const sql = read("supabase/migrations/20261006000003_sz01_public_access_boundary.sql")
  .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const grant = sql.match(/grant select \(([^)]+)\) on table events to anon, authenticated;/);
assert(grant, "migration must column-grant SELECT on events to anon, authenticated");
const allow = new Set(grant[1].split(",").map((s) => s.trim()).filter(Boolean));

const PRIVATE = ["note", "submitter_email", "submitter_org_name", "internal_note", "organizer_id", "feed_source_id",
  "external_id", "created_at", "followup_dismissed", "followup_dismissed_note", "followup_dismissed_at",
  "neighborhood_id", "neighborhood_confidence", "neighborhood_source", "description_source",
  "link_check_status", "link_checked_at", "is_recurring", "is_all_day", "no_fixed_venue"];
for (const c of PRIVATE) assert(!allow.has(c), `private column "${c}" must not be in the public allowlist`);

// No other grant to anon/authenticated on events, no write grants anywhere, internal tables never granted.
const grants = [...sql.matchAll(/grant\s+([^;]+?)\s+to\s+anon, authenticated;/gi)].map((m) => m[1]);
for (const g of grants) assert(!/\b(insert|update|delete|truncate|all|trigger|references)\b/i.test(g), "no write grant allowed: " + g);
const tableGrant = grants.find((g) => /^select on table/i.test(g));
for (const t of ["event_source_identities", "feed_sources", "healthchecks", "schema_migrations", "source_runs"])
  assert(!new RegExp("\\b" + t + "\\b").test(tableGrant), t + " is internal and must not be granted");
assert(!/\bevents,/.test(tableGrant) && !/\bevents\b(?!_)/.test(tableGrant.replace(/events_public/g, "")), "events must only be column-granted");
assert(/create view events_public with \(security_invoker = true\)/.test(sql), "events_public must be security_invoker");
const viewSql = sql.slice(sql.indexOf("create view events_public"));
assert(!/\be\.note\b/.test(viewSql.split(";")[0]), "events_public must not expose note");
assert(/drop policy if exists "public submit pending events" on events/.test(sql));
assert(/drop policy if exists "public submit pending feed sources" on feed_sources/.test(sql));
assert(/alter function set_updated_at\(\) set search_path = ''/.test(sql));

// ---- 2. anon-key reads of events must stay inside the allowlist ------------
// Surfaces that read with the publishable (anon) key.
const files = fs.readdirSync(root).filter((f) => f.endsWith(".html"))
  .concat(["api/event-meta.js", "api/venue-meta.js", "api/sitemap.js"]);
const KEYWORDS = new Set(["select", "order", "limit", "offset", "or", "and"]);
function topLevel(list) { // top-level columns only; embedded resources like venues(name,city) are skipped
  const out = []; let depth = 0, cur = "";
  const flush = () => { const t = cur.trim(); if (t && !t.includes("(")) out.push(t.replace(/!.*$/, "")); cur = ""; };
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { flush(); continue; }
    cur += ch;
  }
  flush();
  return out;
}
const seen = [];
for (const f of files) {
  const text = read(f);
  for (const m of text.matchAll(/rest\/v1\/events\?([^`'"]*)/g)) {
    const qs = m[1].replace(/\$\{[^}]*\}/g, "");
    const cols = new Set();
    for (const part of qs.split("&")) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      const key = part.slice(0, eq), val = part.slice(eq + 1);
      if (key === "select") topLevel(val).forEach((c) => cols.add(c));
      else if (key === "order") val.split(",").forEach((o) => cols.add(o.split(".")[0]));
      else if (key === "or" || key === "and") for (const x of val.matchAll(/(\w+)\.(?:gte|lte|gt|lt|eq|neq|is|in)\b/g)) cols.add(x[1]);
      else if (!KEYWORDS.has(key)) cols.add(key);
    }
    cols.delete("*");
    assert(!qs.includes("select=*"), f + ": anon read of events must not use select=*");
    for (const c of cols) { assert(allow.has(c), `${f}: anon read of events uses "${c}", which is not in the public allowlist`); }
    seen.push(f);
  }
}
assert(seen.length >= 8, "expected to scan the pages' events reads, found " + seen.length);

// Health check: its single anon read of events asks only for id and status.
const hc = read("api/cron-healthcheck.js");
assert(hc.includes("rest/v1/events?select=id&status=eq.approved&limit=1"), "healthcheck anon read changed; re-verify against the allowlist");

console.log("public-boundary: ok (" + allow.size + " public events columns; " + seen.length + " anon reads checked)");
