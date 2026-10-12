#!/usr/bin/env node
"use strict";
// scripts/ics-feed-dry-run.js — a READ-ONLY dry run of one ICS feed through the
// existing generic feed pipeline (api/cron-feeds.js: its ICS parser, TZID /
// all-day handling, location parsing, venue lookup and status-preserving
// upsert). It runs the REAL handler against an in-memory fake database and a
// local .ics file, so nothing here can reach, read or write any real database,
// production included, and nothing is fetched from the internet.
//
//   node scripts/ics-feed-dry-run.js --ics FILE [options]
//
//   --ics FILE          the downloaded .ics (required)
//   --existing FILE     JSON array of event rows treated as already stored (e.g. an
//                       export of the events table; include id, title, start_date,
//                       time_display, venue_name_raw, status, external_id, source)
//                       so new / updated / duplicate are counted against them.
//                       Default: none stored (every event counts as new).
//   --venue-name NAME   feed_sources.venue_name  (default "City of Lathrup Village")
//   --category CAT      feed_sources.default_category (default "community")
//   --per-event-location / --no-per-event-location
//                       feed_sources.location_per_event (default on: a city calendar
//                       lists many places)
//   --today YYYY-MM-DD  hold the clock at this Detroit day
//   --json              print the whole report as JSON
//
// "Duplicates" are found with the same planConsolidation() the nightly
// duplicate pass uses (scripts/duplicate-consolidation.js), run over the
// stored rows plus the incoming ones.

const fs = require("fs");
const path = require("path");

const REPO_DIR = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const icsFile = opt("--ics");
if (!icsFile) { console.error("usage: node scripts/ics-feed-dry-run.js --ics FILE [--existing FILE] [--json]"); process.exit(2); }
const icsText = fs.readFileSync(icsFile, "utf8");
const existing = opt("--existing") ? JSON.parse(fs.readFileSync(opt("--existing"), "utf8")) : [];
const today = opt("--today");

const SUPABASE_URL = "https://dry-run.invalid.supabase.co";
const FEED_URL = "https://feed.dry-run.invalid/calendar.ics";
const feedSource = {
  id: "00000000-0000-0000-0000-00000000dr01", // placeholder: the real id exists only once the row does
  venue_name: opt("--venue-name") || "City of Lathrup Village",
  contact_email: "(not set)",
  feed_url: FEED_URL,
  feed_format: "ics",
  default_category: opt("--category") || "community",
  status: "approved",
  location_per_event: !flag("--no-per-event-location"),
};

const ok = (body, status) => ({ ok: true, status: status || 200, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

async function main() {
  const writes = []; // every non-GET the handler attempted (all absorbed by the fake)
  const captured = [];
  global.fetch = async (url, init = {}) => {
    const target = String(url);
    const method = (init.method || "GET").toUpperCase();
    if (target === FEED_URL) return ok(icsText);
    if (!target.startsWith(SUPABASE_URL)) throw new Error("dry run refused a request outside the fake database: " + target);
    if (method !== "GET") {
      writes.push({ method, url: target });
      if (/\/rest\/v1\/events/.test(target) && method === "POST") captured.push(...JSON.parse(init.body));
      return ok([], 201);
    }
    if (target.includes("/rest/v1/feed_sources")) return ok([feedSource]);
    if (target.includes("/rest/v1/venues")) return ok([]);
    if (target.includes("/rest/v1/events")) {
      const m = target.match(/external_id=in\.\(([^)]*)\)/);
      if (m) {
        const ids = new Set(decodeURIComponent(m[1]).split(",").map((s) => s.replace(/^"|"$/g, "")));
        return ok(existing.filter((r) => ids.has(r.external_id)).map((r) => ({ external_id: r.external_id, status: r.status })));
      }
      return ok(existing);
    }
    return ok([]);
  };
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dry-run-key";
  delete process.env.CRON_SECRET;
  for (const key of Object.keys(require.cache)) if (key.startsWith(`${REPO_DIR}/api/`)) delete require.cache[key];
  const { planConsolidation } = require(path.join(REPO_DIR, "scripts/duplicate-consolidation.js"));
  const handler = require(path.join(REPO_DIR, "api/cron-feeds.js"));

  const res = { _status: null, _body: null, status(c) { this._status = c; return this; }, json(b) { this._body = b; return this; } };
  const RealDate = Date;
  if (today) {
    const fixed = new RealDate(`${today}T14:00:00Z`).getTime();
    global.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(fixed); else super(...a); } static now() { return fixed; } };
  }
  try { await handler({ headers: {} }, res); } finally { global.Date = RealDate; }

  const vevents = (icsText.match(/^BEGIN:VEVENT/gim) || []).length;
  const pollResult = res._body && res._body.results && res._body.results[0] && res._body.results[0].result;
  const errors = [];
  if (res._status !== 200) errors.push(`handler returned HTTP ${res._status}: ${JSON.stringify(res._body)}`);
  if (pollResult && /^(Error|Fetch failed|Skipped)/.test(pollResult)) errors.push(pollResult);
  if (vevents > captured.length) errors.push(`${vevents - captured.length} VEVENT(s) in the file produced no row (no DTSTART, not parseable, or filtered as not a real event)`);

  // Classify each incoming row against what is stored.
  const storedById = new Map(existing.map((r) => [r.external_id, r]));
  const incoming = captured.map((r, i) => ({ ...r, id: `incoming-${i}`, status: storedById.get(r.external_id)?.status || "approved" }));
  const fresh = incoming.filter((r) => !storedById.has(r.external_id));
  const plan = planConsolidation([...existing.filter((r) => r.id), ...fresh]);
  const incomingIds = new Set(fresh.map((r) => r.id));
  const dupOf = new Map(); // incoming id -> the stored/other row it duplicates
  for (const m of plan.merges) {
    if (incomingIds.has(m.loser.id)) dupOf.set(m.loser.id, m.survivor);
    else if (incomingIds.has(m.survivor.id)) dupOf.set(m.survivor.id, m.loser);
  }
  const possibleDup = new Set();
  for (const rv of plan.reviews) for (const r of [rv.a, rv.b]) if (incomingIds.has(r.id)) possibleDup.add(r.id);

  // What would make a row uncertain. Start times are never invented: a timed
  // event without one in the feed, or no stated place, is flagged.
  const reviewReasons = (r) => {
    const why = [];
    if (!r.is_all_day && !r.time_display) why.push("no start time in feed");
    if (!r.venue_id && (!r.venue_name_raw || /^venue tba$/i.test(r.venue_name_raw) || r.venue_name_raw === feedSource.venue_name)) why.push("no stated venue");
    if (feedSource.location_per_event && !r.venue_address_raw) why.push("no street address");
    if (!r.description) why.push("no description");
    if (possibleDup.has(r.id)) why.push("possible duplicate");
    return why;
  };

  const rows = incoming.map((r) => {
    const stored = storedById.get(r.external_id);
    const dup = dupOf.get(r.id);
    const action = stored ? "update_existing" : dup ? "duplicate" : "new";
    return { action, external_id: r.external_id, title: r.title, start_date: r.start_date, end_date: r.end_date, is_all_day: r.is_all_day, time_display: r.time_display, venue_name_raw: r.venue_name_raw, venue_address_raw: r.venue_address_raw, venue_city_raw: r.venue_city_raw, category: r.category, has_image: !!r.image_url, has_url: !!r.ticket_url, has_description: !!r.description, review: reviewReasons(r), duplicate_of: dup ? { title: dup.title, source: dup.source, id: dup.id } : null };
  });
  const count = (fn) => rows.filter(fn).length;
  const report = {
    http_status: res._status,
    database_writes_attempted_and_absorbed: writes.length,
    counts: {
      vevents_in_file: vevents,
      discovered: captured.length,
      new: count((r) => r.action === "new"),
      existing_updated: count((r) => r.action === "update_existing"),
      duplicates: count((r) => r.action === "duplicate"),
      needing_review: count((r) => r.review.length > 0),
      with_image: count((r) => r.has_image),
    },
    errors,
    rows,
  };

  if (flag("--json")) { console.log(JSON.stringify(report, null, 2)); return; }
  const c = report.counts;
  console.log(`ICS feed dry run — ${feedSource.venue_name} (${path.basename(icsFile)}; stored rows assumed: ${existing.length})`);
  console.log(`HTTP ${report.http_status}; real database writes: 0 (${writes.length} absorbed by the fake)\n`);
  const line = (k, v) => console.log(`  ${k.padEnd(30)} ${v}`);
  line("VEVENTs in file", c.vevents_in_file);
  line("Events discovered", c.discovered);
  line("New events", c.new);
  line("Existing events updated", c.existing_updated);
  line("Duplicates", c.duplicates);
  line("Records needing review", c.needing_review);
  line("With image", c.with_image);
  line("Errors", errors.length);
  for (const e of errors) console.log(`    - ${e}`);
  console.log("\nPlan:");
  for (const r of rows) {
    const when = r.end_date ? `${r.start_date} → ${r.end_date}` : r.start_date;
    console.log(`  ${r.action.padEnd(16)} ${when.padEnd(24)} ${(r.is_all_day ? "(all day)" : r.time_display || "(no time)").padEnd(20)} ${r.title}${r.review.length ? `   [${r.review.join(", ")}]` : ""}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
