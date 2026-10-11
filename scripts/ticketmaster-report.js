#!/usr/bin/env node
"use strict";

// scripts/ticketmaster-report.js -- READ-ONLY Ticketmaster synchronisation report.
//
//   Offline (no network, no credentials):
//     node scripts/ticketmaster-report.js --tm discovery.json --existing events.json
//   Live fetch from the Discovery API, existing rows from a file:
//     TICKETMASTER_API_KEY=... node scripts/ticketmaster-report.js --existing events.json
//   Live fetch and existing rows read (GET only) from Supabase:
//     TICKETMASTER_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//       node scripts/ticketmaster-report.js --existing-from-supabase
//
// It never writes: the only requests it can make are GETs to the Discovery API and
// (with --existing-from-supabase) GETs to Supabase. It does not call the cron handler,
// writes no run log, and cannot publish, update or cancel anything.
// Options: --out FILE.json (default: stdout), --markdown FILE.md, --today YYYY-MM-DD.
//
// --tm file shape: {"events":[...Discovery events...], "info":{"complete":true,"pagesFetched":5,
//   "totalElements":950,"httpStatus":200,"reason":null}}
// --existing file shape: array of events rows (id, title, start_date, time_display, source,
//   external_id, status, venue_id, venue_name_raw, venue_address_raw, venue_city_raw,
//   description or has_description, price_from, ticket_status, ticket_url, event_url, created_at).

const fs = require("fs");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
const flag = (name) => process.argv.includes(name);

const COLUMNS = "id,title,start_date,end_date,time_display,is_all_day,source,external_id,status,venue_id,venue_name_raw,venue_address_raw,venue_city_raw,description,description_source,image_url,ticket_url,event_url,is_free,price_from,ticket_status,internal_note,created_at";

// GET-only Supabase reader (paged).
async function readExistingFromSupabase(todayISO, fetchFn = fetch) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --existing-from-supabase");
  const get = async (query) => {
    const rows = [];
    for (let offset = 0; offset < 40000; offset += 1000) {
      const r = await fetchFn(`${base}/rest/v1/events?${query}&order=id.asc`, {
        method: "GET",
        headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${offset}-${offset + 999}` },
      });
      if (!r.ok) throw new Error(`Supabase read failed: HTTP ${r.status}`);
      const page = await r.json();
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return rows;
  };
  const tm = await get(`select=${COLUMNS}&source=eq.Ticketmaster`);
  const upcoming = await get(`select=${COLUMNS}&source=neq.Ticketmaster&status=neq.rejected&start_date=gte.${todayISO}`);
  return [...tm, ...upcoming];
}

async function main() {
  const todayISO = arg("--today") || new Date().toISOString().slice(0, 10);

  // Preflight: say what is available, never print a secret.
  const preflight = {
    ticketmaster_api_key_present: Boolean(process.env.TICKETMASTER_API_KEY),
    supabase_read_configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    mode: arg("--tm") ? "offline discovery file" : "live Discovery API",
  };
  console.error("preflight:", JSON.stringify(preflight));

  let fetched;
  if (arg("--tm")) {
    fetched = JSON.parse(fs.readFileSync(arg("--tm"), "utf8"));
  } else {
    if (!preflight.ticketmaster_api_key_present) {
      console.error("TICKETMASTER_API_KEY is not set: refusing to attempt a live fetch. Use --tm FILE or set the key.");
      process.exit(2);
    }
  }

  // The connector reads its key and database URL at load time.
  const connector = require("../api/cron-ticketmaster.js");
  if (!fetched) {
    const { events, ...info } = await connector.fetchTicketmasterEvents();
    fetched = { events, info };
  }

  let existing;
  if (flag("--existing-from-supabase")) existing = await readExistingFromSupabase(todayISO);
  else if (arg("--existing")) existing = JSON.parse(fs.readFileSync(arg("--existing"), "utf8"));
  else { console.error("Provide --existing FILE or --existing-from-supabase."); process.exit(2); }

  const { planConsolidation } = require("./duplicate-consolidation.js");
  const { buildReport } = require("../api/_lib/ticketmaster-report.js");
  const report = buildReport({
    fetched, existing, today: todayISO,
    shapeForDb: connector.shapeForDb, mapCategory: connector.mapCategory, planConsolidation,
  });
  report.preflight = preflight;

  const json = JSON.stringify(report, null, 2);
  if (arg("--out")) fs.writeFileSync(arg("--out"), json + "\n"); else console.log(json);
  if (arg("--markdown")) fs.writeFileSync(arg("--markdown"), toMarkdown(report));
}

function toMarkdown(r) {
  const e = r.estimate;
  return [
    `# Ticketmaster report-only run (${r.generated_for})`,
    "",
    `Writes performed: ${r.writes_performed}. Fetch complete: ${r.retrieval.complete}${r.retrieval.reason ? ` (${r.retrieval.reason})` : ""}.`,
    `API total ${r.retrieval.api_total_elements ?? "unknown"}, fetched ${r.retrieval.events_fetched}, kept ${r.shaping.kept}.`,
    "",
    "| Would be | Count |", "|---|---|",
    `| New | ${e.new} (${e.new_with_potential_duplicate} with a potential duplicate) |`,
    `| Changed | ${e.changed} |`,
    `| Unchanged | ${e.unchanged} |`,
    `| Marked cancelled / postponed / rescheduled by Ticketmaster | ${e.flagged_cancelled_by_ticketmaster} / ${e.flagged_postponed_by_ticketmaster} / ${e.flagged_rescheduled_by_ticketmaster} |`,
    `| Stored, not returned (verify, not cancelled) | ${e.stored_not_returned_verify}${e.stored_not_returned_reliable ? "" : " (unreliable: incomplete fetch)"} |`,
    `| Stored descriptions protected | ${r.descriptions.stored_descriptions_protected_from_overwrite} |`,
    "",
    ...(r.flags.length ? ["## Flags", ...r.flags.map((f) => `- ${f}`), ""] : []),
  ].join("\n");
}

module.exports = { readExistingFromSupabase, toMarkdown };

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
