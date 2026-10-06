// test/cron-enrichment-runlog.test.js — EPIC-006 SH.5 closure (2026-10-01).
//
// cron-enrichment.js (the daily "SH.1 repair + Outer Limits/Dossin/Redford
// recovery + generic enrichment + venue-raw-reparse" cron, see that file's
// own header) previously wrote no source_runs row at all, so no database
// query could confirm whether Vercel had ever actually fired it on
// schedule. This file proves the ADDED telemetry wiring only — it does not
// re-prove any of the six repair scripts' own repair decisions (each has
// its own dedicated, already-passing test file: venue-address-repair,
// sh1-repair-existing-events, outerlimits-description-repair,
// dossin-metadata-repair, redford-metadata-repair,
// generic-metadata-enrichment, venue-raw-reparse-repair).
//
// Strategy: every one of the six repair scripts' own "fetch repair
// candidates" GET request is individually distinguishable by a stable
// query-string marker (see the ROUTES table below, each comment naming the
// source file/line it was read from). Mocking every GET as "zero
// candidates" by default means every script runs its real code and
// legitimately does nothing — the smallest honest way to exercise the full
// six-step sequence without needing six scripts' worth of fixture data.
//
// Run: node test/cron-enrichment-runlog.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const SUPABASE_URL = "https://example.supabase.co";

const SCRIPT_FILES = [
  "api/cron-enrichment.js",
  "api/_lib/run-log.js",
  "api/_lib/source-slugs.js",
  "scripts/sh1-repair-existing-venue-address-city.js",
  "scripts/outerlimits-description-repair.js",
  "scripts/dossin-metadata-repair.js",
  "scripts/redford-metadata-repair.js",
  "scripts/generic-metadata-enrichment.js",
  "scripts/venue-raw-reparse-repair.js",
  "api/_lib/venue-lookup.js",
  "api/_lib/ics-location.js",
  "api/cron-outerlimitslounge.js",
  "scripts/ra-candidate-promotion.js",
  "api/_lib/status-lookup.js",
  "api/_lib/ra-provenance-note.js",
  "api/_lib/source-authority.js",
  "api/_lib/external-discovery.js",
  "scripts/venue-geography.js",
  "scripts/venues-from-stated-places.js",
  "api/_lib/detroit-parcels.js",
  "api/_lib/detroit-geography.js",
  "api/_lib/census-geocoder.js",
];

function freshHandler() {
  for (const f of SCRIPT_FILES) {
    const p = `${REPO_DIR}/${f}`;
    try {
      delete require.cache[require.resolve(p)];
    } catch {
      // not every file is required by every test run; fine to skip
    }
  }
  return require(`${REPO_DIR}/api/cron-enrichment.js`);
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

// Distinguishing markers for each script's own fetchRepairCandidates() GET,
// read directly from each file (see this file's header):
//   SH.1              scripts/sh1-repair-existing-venue-address-city.js:78  or=(venue_address_raw.is.null,venue_city_raw.is.null) -- no source=eq.
//   Outer Limits      scripts/outerlimits-description-repair.js:61-63       source=eq....&description=is.null (not inside or=)
//   Dossin            scripts/dossin-metadata-repair.js:105-106             source=eq....&ticket_url=is.null&event_url=is.null
//   Redford           scripts/redford-metadata-repair.js:83-84              source=eq....&or=(description.is.null,ticket_url.is.null,event_url.is.null)
//   Generic            scripts/generic-metadata-enrichment.js:125           followup_dismissed=is.false
//   venue-raw-reparse  scripts/venue-raw-reparse-repair.js:74-77            venue_name_raw=not.is.null
function classifyGet(url) {
  // scripts/venues-from-stated-places.js: public events with a venue name and no venue record.
  if (url.includes("venue_id=is.null&status=eq.approved&venue_name_raw=not.is.null")) return "venueRecords";
  if (url.includes("followup_dismissed=is.false")) return "generic";
  if (url.includes("venue_name_raw=not.is.null")) return "venueRawReparse";
  if (url.includes("or=(description.is.null,ticket_url.is.null,event_url.is.null)")) return "redford";
  if (url.includes("ticket_url=is.null&event_url=is.null")) return "dossin";
  if (url.includes("description=is.null")) return "outerLimits";
  if (url.includes("or=(venue_address_raw.is.null,venue_city_raw.is.null)")) return "sh1";
  return null;
}

// Outer Limits, Dossin, and Redford each also fetch their own live source
// page unconditionally (to build a description/link lookup map), separate
// from and in addition to their own Supabase candidates GET -- see
// api/cron-outerlimitslounge.js's FEED_URL, api/cron-dossin.js's/api/cron-
// redford-theatre.js's own SOURCE_URL constants. These need their own
// benign default responses for the "zero candidates, nothing to do" case
// to actually reach "nothing to do" instead of erroring on an unmocked URL.
const EXTERNAL_SOURCE_URLS = {
  "https://www.outerlimitslounge.com/events?format=json": () => ({ ok: true, status: 200, json: async () => ({ upcoming: [] }) }),
  "https://www.detroithistorical.org/events": () => ({ ok: true, status: 200, text: async () => "<html></html>" }),
  "https://redfordtheatre.com/events/": () => ({ ok: true, status: 200, text: async () => "<html></html>" }),
};

function makeMockFetch({ runInsert, runUpdate, failGet = {} } = {}) {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    let body = null;
    if (opts.body) {
      try { body = JSON.parse(opts.body); } catch { body = opts.body; }
    }
    calls.push({ url, method, body });

    if (url.includes("/rest/v1/source_runs") && method === "POST") {
      return runInsert ? runInsert() : { ok: true, status: 201, json: async () => [{ id: "run-1" }] };
    }
    if (url.includes("/rest/v1/source_runs") && method === "PATCH") {
      return runUpdate ? runUpdate() : { ok: true, status: 204, json: async () => ({}) };
    }
    // Step 0 (RA candidate-promotion, 2026-10-01) reads the latest
    // Resident Advisor source_runs row looking for a backlog to promote --
    // an empty array here means "no RA session found yet," the same
    // honest "zero candidates everywhere" default every other step in
    // this mock already uses (scripts/ra-candidate-promotion.js's own
    // getLatestRaSession fails soft to sessionFound:false, never an
    // error, on an empty result).
    if (url.includes("/rest/v1/source_runs") && method === "GET") {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (EXTERNAL_SOURCE_URLS[url]) {
      return EXTERNAL_SOURCE_URLS[url]();
    }
    if (url.includes("/rest/v1/venues")) {
      return { ok: true, status: 200, json: async () => [] };
    }
    // The venue-geography step (2026-10-05) also reads the neighborhood
    // labels. No venues, no labels: it runs and has nothing to do.
    if (url.includes("/rest/v1/neighborhoods") && method === "GET") {
      if (failGet.neighborhoods) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => [] };
    }
    if (url.includes("/rest/v1/events") && method === "GET") {
      const which = classifyGet(url);
      if (which && failGet[which]) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => [] };
    }
    if (url.includes("/rest/v1/events") && method === "PATCH") {
      return { ok: true, status: 200, json: async () => [] };
    }
    throw new Error("unmocked URL in test: " + method + " " + url);
  };
  return { fetchFn, calls };
}

function patchCalls(calls) {
  return calls.filter((c) => c.url.includes("/rest/v1/source_runs") && c.method === "PATCH");
}
function insertCalls(calls) {
  return calls.filter((c) => c.url.includes("/rest/v1/source_runs") && c.method === "POST");
}

async function run() {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  delete process.env.CRON_SECRET;

  // --- 1. normal run, zero candidates anywhere (the honest common case for
  //     this mock): all six steps execute, nothing to write, telemetry
  //     logs outcome=success. ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({});
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.ok, true);
    assert.strictEqual(res._body.written, 0);

    const inserts = insertCalls(calls);
    assert.strictEqual(inserts.length, 1, "exactly one source_runs row must be started per invocation");
    assert.strictEqual(inserts[0].body[0].source_slug, "enrichment");
    assert.strictEqual(inserts[0].body[0].outcome, "started");

    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1, "exactly one source_runs row must be finished per invocation");
    assert.strictEqual(patches[0].body.outcome, "success");
    assert.strictEqual(patches[0].body.records_written, 0);
    assert.strictEqual(patches[0].body.error_sample, null, "no error_sample on a clean success");
    // VENUE GEOGRAPHY IS OFF unless VENUE_GEOGRAPHY=on (Product Owner,
    // 2026-10-05: not before the Production Data Quality Audit). Off means
    // off: the neighborhood labels are not even read, no geocoder and no City
    // service is asked, nothing is written.
    assert.strictEqual(res._body.venueGeography, "off (set VENUE_GEOGRAPHY=on to run it)");
    assert.strictEqual(res._body.venueGeographyError, null);
    assert.ok(!calls.some((c) => /\/rest\/v1\/neighborhoods|census\.gov|arcgis\.com/.test(c.url)));
    // VENUE RECORDS ARE OFF unless VENUE_RECORDS=on, the same way.
    assert.strictEqual(res._body.venueRecords, "off (set VENUE_RECORDS=on to run it)");
    assert.strictEqual(res._body.venueRecordError, null);
    assert.ok(!calls.some((c) => c.method !== "GET" && /\/rest\/v1\/venues/.test(c.url)), "no venue is created or changed");
    assert.ok(!calls.some((c) => /status=eq\.approved&venue_name_raw=not\.is\.null/.test(c.url)));
  }
  console.log("PASS: venue geography and venue records do not run unless switched on");

  // Neither switch reaches the other; "on" is the only value that turns one on.
  {
    process.env.VENUE_RECORDS = "on";
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({});
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    delete process.env.VENUE_RECORDS;
    assert.deepStrictEqual(res._body.venueRecords.created, []);
    assert.strictEqual(res._body.venueGeography, "off (set VENUE_GEOGRAPHY=on to run it)");
    assert.ok(calls.some((c) => /status=eq\.approved&venue_name_raw=not\.is\.null/.test(c.url)));
    assert.ok(!calls.some((c) => /\/rest\/v1\/neighborhoods/.test(c.url)));
  }
  // Nothing in production asks for neighborhood labels to be created from City names.
  {
    const fs = require("fs");
    for (const file of ["api/cron-enrichment.js", "api/admin-events.js"]) assert.ok(!/createLabels/.test(fs.readFileSync(`${REPO_DIR}/${file}`, "utf8")), `${file} must not pass createLabels`);
  }

  // --- 1b. turned on: it runs against the committed City snapshot and, with
  //     no venues, asks no geocoder and writes nothing. ---
  for (const value of ["on", " ON "]) {
    process.env.VENUE_GEOGRAPHY = value;
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({});
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    delete process.env.VENUE_GEOGRAPHY;
    assert.strictEqual(res._body.venueGeographyError, null);
    assert.strictEqual(res._body.venueGeography.venues, 0);
    assert.ok(calls.some((c) => /\/rest\/v1\/neighborhoods/.test(c.url)));
    assert.ok(!calls.some((c) => /census\.gov|arcgis\.com/.test(c.url)), "no geocoder request when no venue needs coordinates");
    assert.strictEqual(patchCalls(calls)[0].body.outcome, "success");
  }
  for (const value of ["", "off", "true", "1", "dry"]) {
    process.env.VENUE_GEOGRAPHY = value;
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({});
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    delete process.env.VENUE_GEOGRAPHY;
    assert.ok(!calls.some((c) => /\/rest\/v1\/neighborhoods/.test(c.url)), `"${value}" is not "on"`);
  }
  console.log("PASS: a normal run with zero candidates anywhere logs source_runs outcome=success, records_written=0");

  // --- 2. one of the individually try/caught steps fails (Outer Limits);
  //     every other step still runs (failure isolation unchanged), but
  //     telemetry now logs outcome=partial with that step's error in
  //     error_sample. The handler still responds ok:true -- a partial
  //     enrichment run is not an HTTP failure, same as before this change. ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({ failGet: { outerLimits: true } });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.ok, true, "a single isolated step failure must not fail the whole response");
    assert.ok(res._body.outerLimitsDescriptionError, "the failed step's own error must still be surfaced in the response, unchanged");

    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "partial");
    assert.ok(patches[0].body.error_sample && patches[0].body.error_sample.includes("Outer Limits"), "error_sample must include the failed step's own error text");
  }
  console.log("PASS: an isolated step failure (Outer Limits) logs source_runs outcome=partial with that step's error, response stays ok:true");

  // --- 3. the one step that was never individually try/caught
  //     (repairExistingEvents, SH.1) throws: previously this crashed the
  //     handler with nothing recorded anywhere. Now the new top-level
  //     try/catch logs outcome=failed and still returns a normal (200,
  //     ok:false) response instead of an unhandled exception. ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({ failGet: { sh1: true } });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200, "a top-level failure must still respond normally, not crash/500");
    assert.strictEqual(res._body.ok, false);
    assert.ok(res._body.error && res._body.error.includes("repair candidates"), "the SH.1 fetch failure's own error must be surfaced");

    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 1);
    assert.strictEqual(patches[0].body.outcome, "failed");
    assert.ok(patches[0].body.error_sample, "a failed run must carry an error_sample");
  }
  console.log("PASS: an SH.1-step failure (previously uncaught) logs source_runs outcome=failed and responds (200, ok:false) instead of crashing");

  // --- 4. source_runs logging itself is unavailable (startRun's own POST
  //     fails) -- run-log.js's existing fail-safe behavior (never throws,
  //     returns null) must still mean the cron's real work proceeds and
  //     responds exactly as before; no PATCH is attempted since there is
  //     no runId to finish. ---
  {
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({ runInsert: () => ({ ok: false, status: 500, json: async () => ({}) }) });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.ok, true, "a source_runs logging outage must not affect the cron's own success/response");
    const patches = patchCalls(calls);
    assert.strictEqual(patches.length, 0, "no PATCH is attempted when startRun() never produced a runId");
  }
  console.log("PASS: a source_runs logging outage does not affect cron-enrichment's own success/response (fail-safe, unchanged run-log.js behavior)");

  // --- 5. the venue-geography step, turned on, fails (it cannot read the
  //     neighborhood labels): isolated like every other step -- the rest of
  //     the run is unaffected, the response stays ok:true, telemetry says
  //     partial. ---
  {
    process.env.VENUE_GEOGRAPHY = "on";
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({ failGet: { neighborhoods: true } });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.ok, true);
    assert.ok(/Failed to read neighborhoods/.test(res._body.venueGeographyError));
    assert.strictEqual(res._body.duplicateConsolidationError, null, "the steps before it are untouched");
    const patches = patchCalls(calls);
    assert.strictEqual(patches[0].body.outcome, "partial");
    assert.ok(/Failed to read neighborhoods/.test(patches[0].body.error_sample));
    delete process.env.VENUE_GEOGRAPHY;
  }
  console.log("PASS: a venue-geography failure is isolated — outcome=partial, every other step unaffected");

  // --- 6. the venue-records step, turned on, fails: isolated, like every other step. ---
  {
    process.env.VENUE_RECORDS = "on";
    const handler = freshHandler();
    const { fetchFn, calls } = makeMockFetch({ failGet: { venueRecords: true } });
    global.fetch = fetchFn;
    const res = makeRes();
    await handler({ headers: {} }, res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._body.ok, true);
    assert.ok(/Failed to read events without a venue/.test(res._body.venueRecordError));
    assert.strictEqual(res._body.duplicateConsolidationError, null);
    assert.strictEqual(patchCalls(calls)[0].body.outcome, "partial");
    delete process.env.VENUE_RECORDS;
  }
  console.log("PASS: a venue-records failure is isolated — outcome=partial, every other step unaffected");

  console.log("\nAll cron-enrichment.js SH.5 telemetry tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
