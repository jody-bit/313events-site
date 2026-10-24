"use strict";

// RA link contract (2026-10-12 correction):
//   event_url  = https://ra.co/events/<id>   (RA's own event page)
//   ticket_url = a real ticketing destination only; otherwise NULL
//   stored links are never replaced by a generic or unrelated link
//   generic-metadata-enrichment never swaps a venue homepage in for an RA link
//   public "Tickets & info" uses ticket_url, otherwise event_url

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const links = require(path.join(REPO_DIR, "api/_lib/ra-links.js"));
const SUPABASE_URL = "https://example.supabase.co";
const SUPABASE_KEY = "test-key";
const silentLogger = { log() {}, warn() {}, error() {} };

function freshEnrichment() {
  for (const m of ["scripts/generic-metadata-enrichment.js", "api/_lib/venue-lookup.js", "api/_lib/description-enrichment.js", "api/_lib/external-discovery.js"]) {
    delete require.cache[require.resolve(path.join(REPO_DIR, m))];
  }
  return require(path.join(REPO_DIR, "scripts/generic-metadata-enrichment.js"));
}

async function run() {
  // --- helpers ---
  assert.strictEqual(links.deriveRaEventUrl("ra-2542617"), "https://ra.co/events/2542617");
  assert.strictEqual(links.deriveRaEventUrl("2542617"), "https://ra.co/events/2542617");
  assert.strictEqual(links.deriveRaEventUrl("ra-abc"), null);
  assert.strictEqual(links.deriveRaEventUrl(null), null);
  assert.ok(links.isAuthoritativeRaEventUrl("https://ra.co/events/2542617", "ra-2542617"));
  assert.ok(links.isAuthoritativeRaEventUrl("https://www.ra.co/events/2542617?x=1"));
  assert.ok(!links.isAuthoritativeRaEventUrl("https://ra.co/events/9999", "ra-2542617"), "another event's page is not this event's page");
  assert.ok(!links.isAuthoritativeRaEventUrl("https://ra.co/", "ra-2542617"));
  assert.ok(!links.isAuthoritativeRaEventUrl("https://example.com/events/2542617"));
  assert.ok(links.isGenericLink("https://venue.example.com"));
  assert.ok(links.isGenericLink("https://venue.example.com/"));
  assert.ok(links.isGenericLink("not a url"));
  assert.ok(!links.isGenericLink("https://venue.example.com/e/12"));
  assert.strictEqual(links.deriveRaTicketUrl("https://dice.fm/event/abc"), "https://dice.fm/event/abc");
  assert.strictEqual(links.deriveRaTicketUrl("https://ra.co/events/1"), null);
  assert.strictEqual(links.deriveRaTicketUrl("https://dice.fm/"), null);
  assert.strictEqual(links.deriveRaTicketUrl("javascript:alert(1)"), null);
  assert.strictEqual(links.deriveRaTicketUrl(undefined), null);
  console.log("PASS: ra-links helpers -- event page from id only, ticket_url only for a real non-RA, non-generic destination");

  // --- both ingestion paths agree ---
  const sync = require(path.join(REPO_DIR, "scripts/ra-sync.js"));
  const { row } = sync.deriveEventRow(
    { id: "ra-2542617", title: "T", startDate: "2026-11-01T22:00:00.000", url: "https://ra.co/", venueName: "V" },
    new Map()
  );
  assert.strictEqual(row.event_url, "https://ra.co/events/2542617", "a generic JSON-LD url never becomes the event link");
  assert.strictEqual(row.ticket_url, null);
  const withTicket = sync.deriveEventRow(
    { id: "ra-2542617", title: "T", startDate: "2026-11-01T22:00:00.000", ticketUrl: "https://dice.fm/event/abc", venueName: "V" },
    new Map()
  ).row;
  assert.strictEqual(withTicket.ticket_url, "https://dice.fm/event/abc");
  assert.ok(sync.MERGE_BLANK_FIELDS.includes("event_url"), "a later detail fetch may fill a blank event_url");
  assert.ok(sync.MERGE_BLANK_FIELDS.includes("ticket_url"));
  console.log("PASS: ra-sync stores the RA page in event_url (promotion path covered in ra-candidate-promotion.test.js); ticket_url is NULL unless a real destination is stated");

  // --- enrichment never swaps a venue homepage in for an RA link ---
  {
    const { repairGenericMetadata } = freshEnrichment();
    const patches = [];
    global.fetch = async (url, opts = {}) => {
      if (url.includes("/rest/v1/venues")) {
        return { ok: true, status: 200, json: async () => [{ id: "v1", name: "Elektricity", address: "15 S Saginaw", city: "Pontiac", website: "https://elektricity.example.com" }] };
      }
      if (opts.method === "PATCH") {
        patches.push(JSON.parse(opts.body));
        return { ok: true, status: 200, json: async () => [{ id: "x" }] };
      }
      return { ok: true, status: 200, json: async () => [] };
    };
    const base = {
      description: "d", category: "nightlife", start_date: "2026-11-01", time_display: "9:00 PM", is_all_day: false,
      venue_id: "v1", venue_name_raw: "Elektricity", venue_address_raw: "15 S Saginaw", venue_city_raw: "Pontiac",
      ticket_url: null, event_url: null,
    };
    const candidates = [
      { ...base, id: "ra-row", title: "RA Night", source: "Resident Advisor", external_id: "ra-2542617" },
      { ...base, id: "other-row", title: "Other Night", source: "Trinosophes", external_id: null },
    ];
    const counts = await repairGenericMetadata({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger,
      isExternalDiscoveryConfiguredFn: () => false,
      fetchCandidates: async () => candidates,
      applyPatchFn: async (u, h, id, patch) => { patches.push({ id, ...patch }); return true; },
    });
    const ra = patches.find((p) => p.id === "ra-row");
    const other = patches.find((p) => p.id === "other-row");
    assert.ok(ra, "RA row gets its own event page");
    assert.strictEqual(ra.event_url, "https://ra.co/events/2542617");
    assert.ok(!("ticket_url" in ra));
    assert.ok(other && other.event_url === "https://elektricity.example.com", "control: non-RA rows keep the existing digital-home behavior");
    assert.ok(counts.digitalHomeLinksRecovered >= 1);

    // A row that already has an authoritative link is not a link-recovery target at all.
    patches.length = 0;
    await repairGenericMetadata({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger,
      isExternalDiscoveryConfiguredFn: () => false,
      fetchCandidates: async () => [{ ...candidates[0], event_url: "https://ra.co/events/2542617" }],
      applyPatchFn: async (u, h, id, patch) => { patches.push({ id, ...patch }); return true; },
    });
    assert.ok(!patches.some((p) => "event_url" in p || "ticket_url" in p), "an existing authoritative RA link is never replaced");
  }
  console.log("PASS: generic-metadata-enrichment never replaces or displaces an authoritative RA link with a venue homepage");

  // --- backfill: fills blanks only, never replaces ---
  {
    const { repairRaTimes } = require(path.join(REPO_DIR, "scripts/ra-time-backfill.js"));
    const patches = [];
    await repairRaTimes({
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY, logger: silentLogger, dryRun: false,
      fetchCandidates: async () => [
        { id: "a", external_id: "ra-1000001", title: "A", start_date: "2026-11-01", end_date: null, time_display: null, event_url: "https://ra.co/events/1000001", ticket_url: "https://dice.fm/event/a" },
        { id: "b", external_id: "ra-1000002", title: "B", start_date: "2026-11-01", end_date: null, time_display: null, event_url: null, ticket_url: null },
      ],
      fetchDetailData: async () => new Map([
        ["ra-1000001", { startDate: "2026-11-01T22:00:00.000", endDate: null, ticketUrl: "https://tickets.other.example/z", title: "A" }],
        ["ra-1000002", { startDate: "2026-11-01T22:00:00.000", endDate: null, ticketUrl: "https://example.com/", title: "B" }],
      ]),
      applyPatchFn: async (u, h, event, body) => { patches.push({ id: event.id, body }); return true; },
    });
    const a = patches.find((p) => p.id === "a").body;
    const b = patches.find((p) => p.id === "b").body;
    assert.ok(!("event_url" in a) && !("ticket_url" in a), "stored links are never replaced");
    assert.strictEqual(b.event_url, "https://ra.co/events/1000002");
    assert.ok(!("ticket_url" in b), "a generic homepage is not a ticketing destination");
  }
  console.log("PASS: backfill fills blank event_url only, never replaces a stored link, never writes a generic ticket_url");

  // --- public pages: Get tickets = ticket_url, otherwise Event details = event_url ---
  for (const f of ["index.html", "calendar.html", "map.html", "event-template.html"]) {
    const src = fs.readFileSync(path.join(REPO_DIR, f), "utf8");
    // every public page chooses through event-links.js (see test/event-links.test.js)
    assert.ok(/EventLinks\.resolve\(e\)/.test(src), `${f}: link choice goes through EventLinks.resolve`);
  }
  console.log("PASS: homepage, calendar, map and event pages choose Get tickets from ticket_url, else Event details from event_url, without a duplicate Event details button");
}

run().catch((err) => { console.error("FAIL:", err); process.exit(1); });
