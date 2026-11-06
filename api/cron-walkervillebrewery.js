"use strict";
// Walkerville Brewery (Windsor, ON) events -> events table. DRAFT, NOT SCHEDULED: this file is
// deliberately absent from vercel.json, so merging it activates nothing. Activation (a new source,
// the first Ontario one with its own connector) is Jody's call: add the vercel.json cron, plus an
// R&Q-reviewed run on staging first. See api/_lib/walkerville-rows.js for the source shape and caveats.
const { requireCronAuth } = require("./_lib/cron-auth");
const { startRun, finishRun } = require("./_lib/run-log");
const { SLUGS } = require("./_lib/source-slugs");
const { lookupExistingStatuses } = require("./_lib/status-lookup");
const { upsertEventRows } = require("./_lib/event-upsert");
const { buildVenueNameToIdMap, resolveVenueId } = require("./_lib/venue-lookup");
const { parseWalkervilleEvents, buildRow, SITE, VENUE_NAME } = require("./_lib/walkerville-rows");

const SUPABASE_URL = process.env.SUPABASE_URL;
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SOURCE_SLUG = SLUGS.walkervillebrewery;
const DEFAULT_STATUS = "approved"; // the venue's own official calendar, same tier as the other single-venue crons
const MONTHS_AHEAD = 3;

function monthKeys(now) {
  const out = [];
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(`${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`);
  }
  return out;
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (313.events event calendar)", Accept: "application/json" } });
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;
  const runHandle = await startRun(SOURCE_SLUG);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ upserted: 0, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }
  const items = [];
  let itemsFound = 0, skipped = 0;
  try {
    // upcoming list first, then each month view (the calendar page the owner pointed at).
    const urls = [`${SITE}/events?format=json`, ...monthKeys(new Date()).map((m) => `${SITE}/events?format=json&month=${m}`)];
    for (const u of urls) {
      const parsed = parseWalkervilleEvents(await fetchJson(u));
      itemsFound += parsed.itemsFound; skipped += parsed.skipped;
      items.push(...parsed.events);
    }
  } catch (err) {
    const blocked = err.status === 401 || err.status === 403;
    await finishRun(runHandle, { outcome: blocked ? "blocked" : "failed", http_status: err.status, error_sample: "Fetch failed: " + err.message });
    res.status(200).json({ upserted: 0, error: "Fetch failed: " + err.message });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map();
  for (const e of items) { const row = buildRow(e, today); if (row && !byId.has(row.external_id)) byId.set(row.external_id, row); }
  const rows = Array.from(byId.values());
  if (!rows.length) {
    await finishRun(runHandle, { outcome: "success", records_fetched: itemsFound, records_parsed: items.length, records_written: 0 });
    res.status(200).json({ upserted: 0, note: "No current Walkerville Brewery events parsed.", skipped });
    return;
  }
  try {
    const venueMap = await buildVenueNameToIdMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let existing;
    try {
      existing = await lookupExistingStatuses(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, rows.map((r) => r.external_id));
    } catch (lookupErr) {
      await finishRun(runHandle, { outcome: "failed", http_status: 502, error_sample: "Status lookup failed: " + lookupErr.message });
      res.status(502).json({ upserted: 0, error: "Status lookup failed, aborting to protect existing moderation state: " + lookupErr.message });
      return;
    }
    const withStatus = rows.map((r) => ({ ...r, venue_id: resolveVenueId(venueMap, r.venue_name_raw), status: existing.get(r.external_id) || DEFAULT_STATUS }));
    const resp = await upsertEventRows(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, withStatus);
    if (!resp.ok) {
      const t = await resp.text();
      await finishRun(runHandle, { outcome: "failed", http_status: resp.status, records_fetched: itemsFound, records_parsed: items.length, records_written: resp.written, error_sample: "Supabase upsert failed: " + t });
      res.status(502).json({ upserted: resp.written, error: "Supabase upsert failed: " + t });
      return;
    }
    await finishRun(runHandle, { outcome: "success", http_status: resp.status, records_fetched: itemsFound, records_parsed: items.length, records_written: withStatus.length });
    res.status(200).json({ upserted: withStatus.length, venue: VENUE_NAME, skipped });
  } catch (err) {
    await finishRun(runHandle, { outcome: "failed", records_fetched: itemsFound, records_parsed: items.length, error_sample: err.message });
    res.status(500).json({ upserted: 0, error: err.message });
  }
}
module.exports = handler;
module.exports.monthKeys = monthKeys;
