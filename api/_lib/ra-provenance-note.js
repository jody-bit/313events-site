"use strict";

// api/_lib/ra-provenance-note.js
//
// Shared "machine-readable-ish" provenance format written into events.internal_note (admin-only; it must never reach the public `note` column)
// -- 2026-10-01, RA candidate-recovery MVP (Product Owner decision 3:
// "Use the existing internal note field for the MVP. Do not add a
// migration or new provenance schema now... consistent machine-readable-
// ish format so these records can be migrated later if needed").
//
// Two callers, one format, so they never silently drift apart:
//   - scripts/ra-candidate-promotion.js writes the FIRST line at creation
//     time (buildRaDiscoveryNote) -- the RA discovery id/url and exactly
//     which listing-card fields RA itself supplied.
//   - scripts/generic-metadata-enrichment.js APPENDS one line
//     (appendEnrichmentProvenance) every time an independent, non-RA
//     source confirms a field -- which field, what tier (api/_lib/
//     source-authority.js), and that source's own URL.
//
// Deliberately plain text in an existing column, not a new jsonb/table --
// smallest possible change per the Product Owner's explicit instruction.
// parseRaProvenanceNote() exists so a future migration to real columns can
// read every record back out losslessly, and so tests can assert on
// structure instead of exact string formatting.
//
// Format: one record per line, each line "TAG vN | key=value | key=value
// | ...". Never includes a note line this module didn't itself write --
// buildRaDiscoveryNote/appendEnrichmentProvenance only ever produce their
// own tagged line(s); any pre-existing human-written note content (rare,
// but possible on a row a moderator already touched) is preserved ABOVE
// these lines, never overwritten.

const DISCOVERY_TAG = "RA_PROVENANCE";
const ENRICHMENT_TAG = "RA_ENRICHMENT";
const FORMAT_VERSION = "v1";

// Bounds -- defensive, not expected to bind in practice (today's only two
// enrichment call sites mean at most ~2 appended lines per event), but a
// note column holding an unbounded, ever-growing history on a row that
// gets re-processed many times is still worth a hard ceiling.
const MAX_NOTE_LENGTH = 4000;
const MAX_ENRICHMENT_LINES = 10;

function escapeValue(v) {
  // Values are controlled inputs (ids, urls, enum-like tier names, iso
  // timestamps) -- this only guards against a literal "|" or newline
  // breaking the one-line-per-record format, never meant as general HTML/
  // SQL escaping (this is a plain text column, not rendered as markup).
  return String(v == null ? "" : v).replace(/\|/g, "/").replace(/[\r\n]+/g, " ").trim();
}

// buildRaDiscoveryNote({ raId, raUrl, presentFields }) -> string
//
// The FIRST line of a promoted candidate's note. presentFields is exactly
// the subset of api/_lib (really scripts/ra-sync.js's) LISTING_METADATA_FIELDS
// this specific id actually had -- never a fixed/assumed list -- so the
// note is always a truthful record of what RA's own listing card showed.
function buildRaDiscoveryNote({ raId, raUrl, presentFields = [] } = {}) {
  const fields = Array.isArray(presentFields) ? presentFields.filter(Boolean) : [];
  return [
    DISCOVERY_TAG,
    FORMAT_VERSION,
    `ra_id=${escapeValue(raId)}`,
    `ra_url=${escapeValue(raUrl || "")}`,
    `ra_fields=${fields.map(escapeValue).join(",")}`,
    "status=unresolved",
  ].join(" | ");
}

// appendEnrichmentProvenance(currentNote, { field, tier, sourceUrl, confirmedAt })
//   -> string
//
// Appends one RA_ENRICHMENT line recording an independent source's
// confirmation of one field. Never removes or rewrites any existing line
// (including a prior RA_PROVENANCE line, or a human moderator's own free
// text) -- purely additive. Caps total length and line count (see above);
// once MAX_ENRICHMENT_LINES is reached, the OLDEST enrichment line is
// dropped first (the RA_PROVENANCE discovery line, if present, is never
// dropped -- it's always kept as the anchor record).
function appendEnrichmentProvenance(currentNote, { field, tier, sourceUrl, confirmedAt } = {}) {
  const line = [
    ENRICHMENT_TAG,
    FORMAT_VERSION,
    `field=${escapeValue(field)}`,
    `tier=${escapeValue(tier)}`,
    `source_url=${escapeValue(sourceUrl)}`,
    `confirmed_at=${escapeValue(confirmedAt || new Date().toISOString())}`,
  ].join(" | ");

  const existingLines = (currentNote || "").split("\n").filter((l) => l.trim().length > 0);
  const discoveryLines = existingLines.filter((l) => l.startsWith(DISCOVERY_TAG));
  const otherLines = existingLines.filter((l) => !l.startsWith(DISCOVERY_TAG) && l.startsWith(ENRICHMENT_TAG));
  const freeTextLines = existingLines.filter((l) => !l.startsWith(DISCOVERY_TAG) && !l.startsWith(ENRICHMENT_TAG));

  let enrichmentLines = [...otherLines, line];
  if (enrichmentLines.length > MAX_ENRICHMENT_LINES) {
    enrichmentLines = enrichmentLines.slice(enrichmentLines.length - MAX_ENRICHMENT_LINES);
  }

  const merged = [...freeTextLines, ...discoveryLines, ...enrichmentLines].join("\n");
  return merged.length > MAX_NOTE_LENGTH ? merged.slice(merged.length - MAX_NOTE_LENGTH) : merged;
}

// parseRaProvenanceNote(note) -> { discovery: {...}|null, enrichments: [...], freeText: [...] }
//
// Lossless-enough read-back for tests and for a future real migration.
// Never throws on a note this module didn't write (a plain human note, or
// null/blank) -- returns discovery:null, enrichments:[], freeText:[the
// whole thing] in that case.
function parseLine(line) {
  const parts = line.split("|").map((p) => p.trim());
  const tag = parts[0] ? parts[0].split(" ")[0] : "";
  const fields = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    fields[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return { tag, fields };
}

function parseRaProvenanceNote(note) {
  const lines = (note || "").split("\n").filter((l) => l.trim().length > 0);
  let discovery = null;
  const enrichments = [];
  const freeText = [];
  for (const line of lines) {
    if (line.startsWith(DISCOVERY_TAG)) {
      const { fields } = parseLine(line);
      discovery = {
        raId: fields.ra_id || null,
        raUrl: fields.ra_url || null,
        raFields: fields.ra_fields ? fields.ra_fields.split(",").filter(Boolean) : [],
        status: fields.status || null,
      };
    } else if (line.startsWith(ENRICHMENT_TAG)) {
      const { fields } = parseLine(line);
      enrichments.push({
        field: fields.field || null,
        tier: fields.tier || null,
        sourceUrl: fields.source_url || null,
        confirmedAt: fields.confirmed_at || null,
      });
    } else {
      freeText.push(line);
    }
  }
  return { discovery, enrichments, freeText };
}

module.exports = {
  DISCOVERY_TAG,
  ENRICHMENT_TAG,
  buildRaDiscoveryNote,
  appendEnrichmentProvenance,
  parseRaProvenanceNote,
};
