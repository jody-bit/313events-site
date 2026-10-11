#!/usr/bin/env node
"use strict";
// scripts/antonartcenter-dry-run.js — a dry-run ingestion of the Anton Art
// Center source. It runs the REAL handler (api/cron-antonartcenter.js,
// ?dry_run=1) with every database call answered by the in-memory fake
// (test/fixtures/mock-postgrest.js), so nothing here can reach, read or write
// any real database, production included.
//
//   node scripts/antonartcenter-dry-run.js [options]
//
//   (default)         the two sources are served from test/fixtures/antonartcenter/
//                     (what theartcenter.org showed on 2026-10-11), and the clock
//                     is held at 2026-10-11.
//   --live            fetch the two public sources from the internet instead
//                     (theartcenter.org and the Events Calendar widget's public
//                     JSON), with the real clock. Still no real database.
//   --today YYYY-MM-DD  hold the clock at this Detroit day.
//   --existing FILE   a JSON array of event rows to treat as already stored
//                     (e.g. an export of the events table) so new / updated /
//                     duplicate are counted against them. Default: none stored.
//   --json            print the handler's whole response as JSON.
//
// It prints: events discovered, new, existing updated, duplicates, records
// needing review, errors — and the row-by-row plan.

const fs = require("fs");
const path = require("path");

const REPO_DIR = path.resolve(__dirname, "..");
process.env.REPO_DIR = REPO_DIR;
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const live = flag("--live");
const today = opt("--today") || (live ? null : "2026-10-11");
const existing = opt("--existing") ? JSON.parse(fs.readFileSync(opt("--existing"), "utf8")) : [];

const H = require(path.join(REPO_DIR, "test/fixtures/connector-harness.js"));
const R = require(path.join(REPO_DIR, "api/_lib/antonartcenter-rows.js"));
const FX = path.join(REPO_DIR, "test/fixtures/antonartcenter");
const read = (f) => fs.readFileSync(path.join(FX, f), "utf8");

const POSTS = {
  "https://www.theartcenter.org/single-post/michigan-annual-liv": "post-michigan-annual.html",
  "https://www.theartcenter.org/single-post/barbara-clay-finding-my-way": "post-barbara-clay.html",
};

async function main() {
  const realFetch = global.fetch;
  const upstream = live
    ? null
    : (url) => {
        if (url === R.EXHIBITS_URL) return H.page(read("exhibits.html"));
        if (POSTS[url]) return H.page(read(POSTS[url]));
        if (url === R.CALENDAR_API_URL) return H.page(read("calendar.json"));
        return null;
      };
  const w = H.world({ events: existing, venues: [], upstream: upstream || (() => null) });
  if (live) {
    // Only the two public sources go to the internet; the database stays the in-memory fake.
    const fake = global.fetch;
    global.fetch = (url, init) => (String(url).startsWith(H.SUPABASE_URL) ? fake(url, init) : realFetch(url, init));
  }
  process.env.SUPABASE_URL = H.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dry-run-key";
  delete process.env.CRON_SECRET;
  for (const key of Object.keys(require.cache)) if (key.startsWith(`${REPO_DIR}/api/`)) delete require.cache[key];
  const handler = require(path.join(REPO_DIR, "api/cron-antonartcenter.js"));

  const res = H.makeRes();
  const RealDate = Date;
  if (today) {
    const fixed = new RealDate(`${today}T14:00:00Z`).getTime();
    global.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(fixed); else super(...a); } static now() { return fixed; } };
  }
  try { await handler({ headers: {}, query: { dry_run: "1" } }, res); } finally { global.Date = RealDate; }

  const body = res._body;
  const wrote = w.db.log.filter((r) => r.method !== "GET").length;
  if (flag("--json")) { console.log(JSON.stringify({ status: res._status, database_writes: wrote, ...body }, null, 2)); return; }

  const c = body.counts || {};
  console.log(`Anton Art Center — dry run (${live ? "live sources" : "captured sources, observed 2026-10-11"}; clock ${today || "real"}; stored rows assumed: ${existing.length})`);
  console.log(`HTTP ${res._status}; database writes made: ${wrote}\n`);
  const line = (k, v) => console.log(`  ${k.padEnd(36)} ${v}`);
  line("Events discovered", c.discovered);
  line("  exhibitions (exhibits page)", c.exhibits);
  line("  calendar events (current/upcoming)", c.calendar_events);
  line("New events", c.new);
  line("  would publish", c.new_published);
  line("  would hold as pending_review", c.new_pending_review);
  line("Existing events updated", c.existing_updated);
  line("Duplicates", c.duplicates);
  line("  same event on both pages", c.duplicates_within_source);
  line("  already carried by another row", c.duplicates_other_sources);
  line("Records needing review", c.needing_review);
  line("  existing rows left as stored", c.existing_not_written_needs_review);
  line("Past entries skipped", c.past_skipped);
  line("Errors", (body.errors || []).length);
  for (const e of body.errors || []) console.log(`    - ${e}`);
  console.log("\nPlan:");
  for (const p of body.plan || []) {
    const when = p.end_date ? `${p.start_date} → ${p.end_date}` : p.start_date;
    console.log(`  ${p.action.padEnd(24)} ${when.padEnd(24)} ${(p.time_display || "(no time)").padEnd(20)} ${p.title}${p.review.length ? `   [${p.review.join(", ")}]` : ""}`);
  }
  if ((body.duplicates && body.duplicates.within_source || []).length) {
    console.log("\nDuplicates merged:");
    for (const d of body.duplicates.within_source) console.log(`  ${d.title}: ${d.reason} (kept ${d.keptExternalId})`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
