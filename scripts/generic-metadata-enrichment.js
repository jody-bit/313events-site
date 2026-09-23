// scripts/generic-metadata-enrichment.js
//
// Generic (not source-specific) automated enrichment — 2026-09-23, Admin
// stabilization follow-up. The Product Owner's instruction: "the 26
// source-limited events should NOT merely be hidden from Needs Follow-up.
// THE SYSTEM SHOULD TRY TO ENRICH THEM FIRST... Do not create another
// source-specific repair-script collection." This is that: ONE script,
// reused across every source, that closes what's left after the existing
// per-source authoritative recovery steps (Outer Limits/Dossin/Redford, all
// unmodified) have already run:
//
//   1. safe factual description generation (api/_lib/description-
//      enrichment.js) — only when no authoritative description could be
//      recovered and the description is still genuinely blank.
//   2. reverse venue resolution, ADDRESS -> VENUE NAME (api/_lib/venue-
//      lookup.js's resolveVenueNameFromAddressRepair — the mirror image of
//      SH.1's existing NAME -> ADDRESS tier, extending the same file).
//   3. last-resort ticket/event link recovery via the venue's own verified
//      digital home (resolveDigitalHomeLink) — website, else Facebook —
//      only when an event has neither a ticket_url nor an event_url of its
//      own and every earlier, more specific recovery tier has already had
//      its chance.
//
// EXPLICITLY OUT OF SCOPE, same rules as everywhere else in this project:
// Resident Advisor (never touched by any automation here — see the
// SOURCE_EXCLUDE guard below), start time (never generated or inferred —
// see the Product Owner's explicit instruction; this script does not touch
// time_display at all), external web search / discovery (no such capability
// exists in this project's runtime — see this file's own README section in
// the final report this run feeds, and resolveDigitalHomeLink's own "never
// searches for one" rule).
//
// SAFETY: identical conventions to every other repair script in this
// project — blank-fields-only, race-safe conditional PATCH (re-asserts
// every field being written is still blank at write time), never touches
// any other column, never overwrites a moderator/authoritative value. A
// description this script writes is marked description_source='generated'
// (migration_038_description_source.sql) so it stays distinguishable from,
// and lower-precedence than, a real one.
//
// Usage:
//   node scripts/generic-metadata-enrichment.js            (writes repairs)
//   node scripts/generic-metadata-enrichment.js --dry-run  (reports only)
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.

const path = require("path");
const {
  buildVenueDetailsMap,
  resolveVenueNameFromAddressRepair,
  resolveDigitalHomeLink,
  isBlank,
} = require(path.join(__dirname, "..", "api", "_lib", "venue-lookup"));
const {
  isDescriptionBlank,
  buildFactualDescription,
} = require(path.join(__dirname, "..", "api", "_lib", "description-enrichment"));

// Resident Advisor is explicitly out of scope for every kind of automation
// in this project (secret/TBA venues by design, editorial-only). Guarded
// here directly rather than relying only on callers to filter it out.
const SOURCE_EXCLUDE = new Set(["Resident Advisor"]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchEnrichmentCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders) {
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?start_date=gte.${todayIso()}` +
    `&status=neq.rejected` +
    `&followup_dismissed=is.false` +
    `&or=(description.is.null,and(venue_name_raw.is.null,venue_id.is.null),and(ticket_url.is.null,event_url.is.null))` +
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
// right now — same race-safety convention as SH.1's applyPatch. Returns
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
// repair script in this project.
async function repairGenericMetadata({
  dryRun = false,
  logger = console,
  SUPABASE_URL = process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchCandidates = fetchEnrichmentCandidates,
  applyPatchFn = applyPatch,
} = {}) {
  const counts = {
    totalConsidered: 0,
    descriptionsGenerated: 0,
    venueNamesResolvedFromAddress: 0,
    digitalHomeLinksRecovered: 0,
    skippedResidentAdvisor: 0,
    skippedConcurrentChange: 0,
    written: 0,
    fieldsWritten: 0,
    writtenIds: [],
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to do.");
    return counts;
  }
  const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  const canonicalMaps = await buildVenueDetailsMap(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const candidates = await fetchCandidates(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sbHeaders);
  counts.totalConsidered = candidates.length;

  for (const event of candidates) {
    if (SOURCE_EXCLUDE.has(event.source)) {
      counts.skippedResidentAdvisor++;
      continue;
    }

    let touchedThisEvent = false;

    // 1. Reverse venue resolution (ADDRESS -> VENUE NAME) — runs before
    //    description generation so a description generated in the same pass
    //    can use the newly-resolved venue name, not just whatever was known
    //    at fetch time.
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
          // Reflect the resolution locally so link recovery below (same
          // pass) can use it immediately rather than waiting for a future
          // run to see it.
          event.venue_id = venuePatch.venue_id;
          event.venue_name_raw = venuePatch.venue_name_raw;
        } else {
          counts.skippedConcurrentChange++;
        }
      }
    }

    // 2. Safe factual description generation — only if still genuinely
    //    blank (an authoritative per-source step earlier in the Auto-Repair
    //    sequence already had its chance to fill this in for real).
    if (isDescriptionBlank(event)) {
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

    // 3. Last-resort ticket/event link recovery via the venue's own
    //    verified digital home — only if still genuinely blank after every
    //    more specific recovery tier (including step 1 above, in this same
    //    pass) has had its chance.
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
  SOURCE_EXCLUDE,
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
