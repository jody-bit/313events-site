// scripts/generic-metadata-enrichment.js
//
// Generic (not source-specific) automated enrichment. Originally shipped
// 2026-09-23 ("the 26 source-limited events should NOT merely be hidden --
// THE SYSTEM SHOULD TRY TO ENRICH THEM FIRST"); extended the same day per
// "CORRECTION TO ENRICHMENT PRODUCT BEHAVIOR" -- "JODY SHOULD NOT BE THE
// EXTERNAL RESEARCH LAYER." ONE script, reused across every source, that
// closes what's left after the existing per-source authoritative recovery
// steps (SH.1, Outer Limits, Dossin, Redford -- all unmodified, already run
// as earlier steps in api/admin-events.js's auto_repair_venue action):
//
//   1. reverse venue resolution, ADDRESS -> VENUE NAME (api/_lib/venue-
//      lookup.js's resolveVenueNameFromAddressRepair).
//   1.5. forward venue resolution when it's the one that's stuck: an event
//      has a venue NAME but nothing -- canonical or learned -- resolves its
//      address/city (the real Big Time Bingo / Garden Bowl gap). Bounded
//      external venue discovery (api/_lib/external-discovery.js),
//      verification, persistence (venue-lookup.js's upsertVenueKnowledge),
//      then an immediate same-pass revalidation via SH.1's own
//      resolveVenueAddressCityRepair against the newly-persisted row.
//   2. description enrichment, two levels: LEVEL 1 (authoritative) --
//      bounded external discovery of a real event/venue/organizer page's
//      own descriptive prose; LEVEL 2 (generated, api/_lib/description-
//      enrichment.js) -- a safe factual template built only from verified
//      structured fields, tried only when Level 1 found nothing. Runs for
//      EVERY source, including Resident Advisor -- see "REMOVED" note
//      below.
//   3. last-resort ticket/event link recovery via the venue's own verified
//      digital home (resolveDigitalHomeLink) -- website, else Facebook --
//      only when an event has neither a ticket_url nor an event_url of its
//      own and every earlier, more specific recovery tier has already had
//      its chance.
//
// REMOVED 2026-09-23 (the correction): the blanket Resident-Advirsor
// source exclusion that used to skip this entire script for every RA
// event. The Product Owner's own words: "Your previous report explicitly
// said Resident Advisor was 'untouched.' That is NOT the intended
// behavior... once an event has verified structured facts, its SOURCE must
// not prevent generic description enrichment." There is no longer any
// SOURCE_EXCLUDE in this file. (Nothing here fabricates a secret/TBA venue
// for RA or any other source -- the existing, unchanged, exact-match-only
// venue-resolution rules already protect against ever guessing a real
// venue for one that's genuinely unlisted.)
//
// EXTERNAL DISCOVERY IS DORMANT BY DEFAULT: every call into api/_lib/
// external-discovery.js checks isExternalDiscoveryConfigured() first, which
// requires a real TAVILY_API_KEY in the environment. This project has none
// configured today (confirmed 2026-09-23) -- per the Product Owner's
// explicit "Do NOT purchase anything or invent credentials," this script
// makes NO live external network call in production until Jody adds that
// key. Until then, this script's behavior is byte-for-byte identical to
// before the correction (deterministic-only), just with the RA exclusion
// removed. See the delivery report for the exact setup Jody needs.
//
// BOUNDS: at most MAX_EXTERNAL_VENUE_LOOKUPS_PER_RUN distinct venue names
// and MAX_EXTERNAL_DESCRIPTION_LOOKUPS_PER_RUN event descriptions are ever
// looked up externally in a single run -- "bounded web discovery... NOT
// unrestricted crawling," not a per-event unlimited budget. Once a venue
// name has been looked up (resolved or not) in a run, it is never looked
// up again in that same run -- this is also what makes same-run
// compounding free (see Acceptance Test D).
//
// SAFETY: identical conventions to every other repair script in this
// project -- blank-fields-only, race-safe conditional PATCH (re-asserts
// every field being written is still blank at write time), never touches
// any other column, never overwrites a moderator/authoritative value. A
// description this script writes is marked description_source='generated'
// (Level 2) or description_source='authoritative' (Level 1) --
// migration_038_description_source.sql -- so it stays distinguishable
// from, and appropriately ordered against, a real manually-entered one
// (description_source=null).
//
// Usage:
//   node scripts/generic-metadata-enrichment.js            (writes repairs)
//   node scripts/generic-metadata-enrichment.js --dry-run  (reports only)
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.
// Optionally reads TAVILY_API_KEY for external discovery (see above).

const path = require("path");
const {
  buildVenueDetailsMap,
  resolveVenueNameFromAddressRepair,
  resolveVenueAddressCityRepair,
  resolveDigitalHomeLink,
  mergeVenueIntoMaps,
  upsertVenueKnowledge,
  normalizeVenueName,
  isBlank,
} = require(path.join(__dirname, "..", "api", "_lib", "venue-lookup"));
const {
  isDescriptionBlank,
  buildFactualDescription,
} = require(path.join(__dirname, "..", "api", "_lib", "description-enrichment"));
const {
  isExternalDiscoveryConfigured,
  discoverVenueKnowledge,
  discoverAuthoritativeDescription,
} = require(path.join(__dirname, "..", "api", "_lib", "external-discovery"));

// Bounds -- see header. Independent of whether external discovery is even
// configured; these protect against a single run hammering a real provider
// once one is, and document the "bounded, not unrestricted" contract even
// while dormant.
const MAX_EXTERNAL_VENUE_LOOKUPS_PER_RUN = 25;
const MAX_EXTERNAL_DESCRIPTION_LOOKUPS_PER_RUN = 50;

// Tier C (learned-historical) already had its chance in SH.1's own,
// separate Step-1 script (scripts/sh1-repair-existing-venue-address-city.js)
// before this script ever runs -- if a learned match would have resolved
// an event, it already did. This script's own revalidation only needs
// tiers A/B (the canonical maps), so an empty Map is passed deliberately
// wherever resolveVenueAddressCityRepair is called from here.
const EMPTY_LEARNED_MAP = new Map();

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchEnrichmentCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=neq.rejected` +
    `&followup_dismissed=is.false` +
    `&or=(description.is.null,and(venue_name_raw.is.null,venue_id.is.null),and(ticket_url.is.null,event_url.is.null),and(venue_address_raw.is.null,venue_city_raw.is.null,venue_id.is.null))` +
    `&select=id,title,description,category,is_free,price_from,start_date,time_display,is_all_day,` +
    `venue_id,venue_name_raw,venue_address_raw,venue_city_raw,ticket_url,event_url,source,` +
    `venues(name,address,city,website,facebook_url)` +
    `&limit=1000`;
  const resp = await fetch(url, { headers: sbHeaders });
  if (!resp.ok) throw new Error(`Failed to fetch enrichment candidates: HTTP ${resp.status}`);
  const rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected response shape fetching enrichment candidates");
  return rows;
}

// One conditional PATCH per resolved field-group, each re-asserting (in the
// WHERE clause itself) that every field it's about to write is STILL blank
// right now -- same race-safety convention as SH.1's applyPatch. Returns
// true if the write actually applied.
async function applyPatch(SUPABASE_URL, sbHeaders, eventId, patch, stillBlankFields) {
  const filters = stillBlankFields.map((k) => `${k}.is.null`);
  const filterQs = filters.length > 1 ? `and=(${filters.join(",")})` : filters.map((f) => f.replace(".", "=")).join("");
  const url = `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&${filterQs}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) throw new Error(`PATCH failed for event ${eventId}: HTTP ${resp.status}`);
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

// The testable core. Injectable dependencies, same pattern as every other
// repair script in this project -- including the external-discovery
// functions themselves, so the full pipeline (ordering, verification
// gating, persistence, revalidation, compounding reuse) is provable with a
// mocked provider without ever touching a real network call.
async function repairGenericMetadata({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchEnrichmentCandidates,
  applyPatchFn = applyPatch,
  isExternalDiscoveryConfiguredFn = isExternalDiscoveryConfigured,
  discoverVenueKnowledgeFn = discoverVenueKnowledge,
  discoverAuthoritativeDescriptionFn = discoverAuthoritativeDescription,
  upsertVenueKnowledgeFn = upsertVenueKnowledge,
  externalApiKey = process.env.TAVILY_API_KEY,
  externalFetchFn = undefined,
} = {}) {
  const counts = {
    totalConsidered: 0,
    descriptionsGenerated: 0,
    venueNamesResolvedFromAddress: 0,
    digitalHomeLinksRecovered: 0,
    externalVenueDiscoveryAttempted: 0,
    externalVenueDiscoveryResolved: 0,
    externalVenueDiscoveryNoResult: 0,
    externalVenueDiscoveryUnavailable: 0,
    externalDescriptionsRecovered: 0,
    externalDescriptionNoResult: 0,
    externalDescriptionUnavailable: 0,
    skippedConcurrentChange: 0,
    written: 0,
    fieldsWritten: 0,
    writtenIds: [],
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set -- nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  const canonicalMaps = await buildVenueDetailsMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const candidates = await fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders);
  counts.totalConsidered = candidates.length;

  const attemptedVenueDiscoveryNames = new Set();
  let externalVenueLookupsUsed = 0;
  let externalDescriptionLookupsUsed = 0;

  for (const event of candidates) {
    let touchedThisEvent = false;

    // 1. Reverse venue resolution (ADDRESS -> VENUE NAME) -- runs before
    //    description generation so a description generated in the same
    //    pass can use the newly-resolved venue name, not just whatever was
    //    known at fetch time.
    const venuePatch = resolveVenueNameFromAddressRepair(event, canonicalMaps);
    if (Object.keys(venuePatch).length > 0) {
      if (dryRun) {
        logger.log(`[dry-run] would resolve venue name from address for event ${event.id}:`, venuePatch);
      } else {
        const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, venuePatch, ["venue_name_raw", "venue_id"]);
        if (applied) {
          counts.venueNamesResolvedFromAddress++;
          counts.fieldsWritten += Object.keys(venuePatch).length;
          touchedThisEvent = true;
          event.venue_id = venuePatch.venue_id;
          event.venue_name_raw = venuePatch.venue_name_raw;
        } else {
          counts.skippedConcurrentChange++;
        }
      }
    }

    // 1.5. Forward venue resolution when a venue NAME exists but nothing
    //    -- canonical or learned -- resolves its address/city (the Big
    //    Time Bingo / Garden Bowl gap). First check whether it's already
    //    resolvable deterministically (a canonical row that's appeared
    //    since SH.1's own Step-1 script last ran, or one this same pass
    //    just persisted for an earlier event at the same venue -- see
    //    Acceptance Test D). Only when that's genuinely exhausted does this
    //    reach for bounded external discovery.
    if (isBlank(event.venue_id) && !isBlank(event.venue_name_raw) && (isBlank(event.venue_address_raw) || isBlank(event.venue_city_raw))) {
      const deterministic = resolveVenueAddressCityRepair(event, canonicalMaps, EMPTY_LEARNED_MAP);
      if (Object.keys(deterministic).length > 0) {
        if (dryRun) {
          logger.log(`[dry-run] would resolve venue address/city deterministically for event ${event.id}:`, deterministic);
        } else {
          const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, deterministic, Object.keys(deterministic));
          if (applied) {
            counts.fieldsWritten += Object.keys(deterministic).length;
            touchedThisEvent = true;
            Object.assign(event, deterministic);
          } else {
            counts.skippedConcurrentChange++;
          }
        }
      } else {
        const nameKey = normalizeVenueName(event.venue_name_raw);
        const alreadyAttempted = !nameKey || attemptedVenueDiscoveryNames.has(nameKey);
        if (!alreadyAttempted && externalVenueLookupsUsed < MAX_EXTERNAL_VENUE_LOOKUPS_PER_RUN) {
          attemptedVenueDiscoveryNames.add(nameKey);
          if (!isExternalDiscoveryConfiguredFn()) {
            counts.externalVenueDiscoveryUnavailable++;
          } else {
            externalVenueLookupsUsed++;
            counts.externalVenueDiscoveryAttempted++;
            let discovery = null;
            try {
              discovery = await discoverVenueKnowledgeFn({ venueName: event.venue_name_raw, apiKey: externalApiKey, fetchFn: externalFetchFn });
            } catch {
              discovery = null;
            }
            if (!discovery) {
              counts.externalVenueDiscoveryNoResult++;
            } else if (dryRun) {
              logger.log(`[dry-run] would persist external venue knowledge for "${event.venue_name_raw}":`, discovery);
            } else {
              const persisted = await upsertVenueKnowledgeFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, discovery, undefined);
              if (persisted) {
                counts.externalVenueDiscoveryResolved++;
                mergeVenueIntoMaps(canonicalMaps, persisted);
                const revalidated = resolveVenueAddressCityRepair(event, canonicalMaps, EMPTY_LEARNED_MAP);
                if (Object.keys(revalidated).length > 0) {
                  const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, revalidated, Object.keys(revalidated));
                  if (applied) {
                    counts.fieldsWritten += Object.keys(revalidated).length;
                    touchedThisEvent = true;
                    Object.assign(event, revalidated);
                  } else {
                    counts.skippedConcurrentChange++;
                  }
                }
              }
            }
          }
        }
      }
    }

    // 2. Description enrichment -- LEVEL 1 (verified external, authoritative
    //    prose) is always tried before LEVEL 2 (generated factual
    //    template), so "authoritative prose must outrank generated prose"
    //    holds structurally, not just by convention. Runs for EVERY source
    //    now, including Resident Advisor -- no SOURCE_EXCLUDE anywhere in
    //    this file.
    if (isDescriptionBlank(event)) {
      let usedLevel1 = false;
      if (externalDescriptionLookupsUsed < MAX_EXTERNAL_DESCRIPTION_LOOKUPS_PER_RUN) {
        if (!isExternalDiscoveryConfiguredFn()) {
          counts.externalDescriptionUnavailable++;
        } else {
          externalDescriptionLookupsUsed++;
          let authoritative = null;
          try {
            authoritative = await discoverAuthoritativeDescriptionFn({ event, apiKey: externalApiKey, fetchFn: externalFetchFn });
          } catch {
            authoritative = null;
          }
          if (!authoritative) {
            counts.externalDescriptionNoResult++;
          } else if (dryRun) {
            logger.log(`[dry-run] would write authoritative description for event ${event.id}: "${authoritative.text}" (source: ${authoritative.sourceUrl})`);
          } else {
            const applied = await applyPatchFn(
              SUPABASE_URL, sbHeaders, event.id,
              { description: authoritative.text, description_source: "authoritative" },
              ["description"]
            );
            if (applied) {
              counts.externalDescriptionsRecovered++;
              counts.fieldsWritten += 1;
              touchedThisEvent = true;
              usedLevel1 = true;
              event.description = authoritative.text;
            } else {
              counts.skippedConcurrentChange++;
            }
          }
        }
      }

      if (!usedLevel1 && isDescriptionBlank(event)) {
        const generated = buildFactualDescription(event);
        if (generated) {
          if (dryRun) {
            logger.log(`[dry-run] would generate description for event ${event.id}: "${generated}"`);
          } else {
            const applied = await applyPatchFn(
              SUPABASE_URL, sbHeaders, event.id,
              { description: generated, description_source: "generated" },
              ["description"]
            );
            if (applied) {
              counts.descriptionsGenerated++;
              counts.fieldsWritten += 1; // description_source is provenance metadata, not counted as its own "field repaired"
              touchedThisEvent = true;
            } else {
              counts.skippedConcurrentChange++;
            }
          }
        }
      }
    }

    // 3. Last-resort ticket/event link recovery via the venue's own
    //    verified digital home -- only if still genuinely blank after
    //    every more specific recovery tier (including steps 1/1.5 above,
    //    in this same pass) has had its chance.
    if (isBlank(event.ticket_url) && isBlank(event.event_url)) {
      const link = resolveDigitalHomeLink(event, canonicalMaps);
      if (link) {
        if (dryRun) {
          logger.log(`[dry-run] would set event_url from venue digital home for event ${event.id}: ${link}`);
        } else {
          const applied = await applyPatchFn(SUPABASE_URL, sbHeaders, event.id, { event_url: link }, ["ticket_url", "event_url"]);
          if (applied) {
            counts.digitalHomeLinksRecovered++;
            counts.fieldsWritten += 1;
            touchedThisEvent = true;
          } else {
            counts.skippedConcurrentChange++;
          }
        }
      }
    }

    if (touchedThisEvent) {
      counts.written++;
      counts.writtenIds.push(event.id);
    }
  }

  return counts;
}

module.exports = {
  repairGenericMetadata,
  fetchEnrichmentCandidates,
  applyPatch,
  MAX_EXTERNAL_VENUE_LOOKUPS_PER_RUN,
  MAX_EXTERNAL_DESCRIPTION_LOOKUPS_PER_RUN,
};

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  repairGenericMetadata({ dryRun })
    .then((counts) => {
      console.log(`\nGeneric metadata enrichment ${dryRun ? "(dry run) " : ""}summary:`);
      console.log(counts);
    })
    .catch((err) => {
      console.error("Generic metadata enrichment failed:", err);
      process.exitCode = 1;
    });
}
