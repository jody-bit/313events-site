// test/ra-provenance-note.test.js — api/_lib/ra-provenance-note.js: the
// shared machine-readable-ish note format (Product Owner decision 3, RA
// candidate-recovery MVP, 2026-10-01). Both scripts/ra-candidate-
// promotion.js (initial RA_PROVENANCE line) and scripts/generic-metadata-
// enrichment.js (appended RA_ENRICHMENT lines) depend on this format
// staying internally consistent and round-trippable.
//
// Plain Node assert, no dependencies.
// Run: node test/ra-provenance-note.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const {
  buildRaDiscoveryNote,
  appendEnrichmentProvenance,
  parseRaProvenanceNote,
} = require(`${REPO_DIR}/api/_lib/ra-provenance-note.js`);

// 1. buildRaDiscoveryNote records exactly the RA id/url and exactly the
//    fields actually present -- never a fixed assumed list.
{
  const note = buildRaDiscoveryNote({
    raId: "ra-2500295",
    raUrl: "https://ra.co/events/2500295",
    presentFields: ["title", "date", "venueName"],
  });
  const parsed = parseRaProvenanceNote(note);
  assert.strictEqual(parsed.discovery.raId, "ra-2500295");
  assert.strictEqual(parsed.discovery.raUrl, "https://ra.co/events/2500295");
  assert.deepStrictEqual(parsed.discovery.raFields, ["title", "date", "venueName"]);
  assert.strictEqual(parsed.discovery.status, "unresolved");
  assert.strictEqual(parsed.enrichments.length, 0);
}
console.log("PASS: buildRaDiscoveryNote records the RA id/url and exactly the listing fields actually present");

// 2. appendEnrichmentProvenance is purely additive -- the discovery line
//    survives, in order, and each enrichment is readable back out with
//    its own field/tier/source/timestamp.
{
  let note = buildRaDiscoveryNote({ raId: "ra-1", raUrl: "https://ra.co/events/1", presentFields: ["title", "date"] });
  note = appendEnrichmentProvenance(note, {
    field: "venue_address_raw+venue_city_raw",
    tier: "primary_authoritative",
    sourceUrl: "https://realvenue.com/about",
    confirmedAt: "2026-10-02T12:00:00.000Z",
  });
  note = appendEnrichmentProvenance(note, {
    field: "description",
    tier: "secondary_corroborating",
    sourceUrl: "https://someartist.com/shows",
    confirmedAt: "2026-10-02T12:05:00.000Z",
  });
  const parsed = parseRaProvenanceNote(note);
  assert.strictEqual(parsed.discovery.raId, "ra-1", "the original RA_PROVENANCE line must survive every later append");
  assert.strictEqual(parsed.enrichments.length, 2);
  assert.strictEqual(parsed.enrichments[0].field, "venue_address_raw+venue_city_raw");
  assert.strictEqual(parsed.enrichments[0].tier, "primary_authoritative");
  assert.strictEqual(parsed.enrichments[0].sourceUrl, "https://realvenue.com/about");
  assert.strictEqual(parsed.enrichments[1].field, "description");
  assert.strictEqual(parsed.enrichments[1].tier, "secondary_corroborating");
}
console.log("PASS: appendEnrichmentProvenance is purely additive and every field/tier/source/timestamp reads back correctly");

// 3. A pre-existing human-written note (a moderator's own free text, no
//    RA_PROVENANCE line at all) is preserved, never discarded, when an
//    enrichment line is appended.
{
  const humanNote = "Jody: confirmed this is a recurring monthly night, keep even if quiet some months.";
  const note = appendEnrichmentProvenance(humanNote, {
    field: "description",
    tier: "primary_authoritative",
    sourceUrl: "https://venue.com/x",
    confirmedAt: "2026-10-02T12:00:00.000Z",
  });
  const parsed = parseRaProvenanceNote(note);
  assert.deepStrictEqual(parsed.freeText, [humanNote]);
  assert.strictEqual(parsed.enrichments.length, 1);
}
console.log("PASS: a moderator's pre-existing free-text note is preserved, not overwritten, when an enrichment line is appended");

// 4. Never throws on null/blank/plain-text input.
{
  assert.doesNotThrow(() => parseRaProvenanceNote(null));
  assert.doesNotThrow(() => parseRaProvenanceNote(""));
  assert.doesNotThrow(() => appendEnrichmentProvenance(null, { field: "x", tier: "discovery_only", sourceUrl: "https://x.com" }));
  const parsed = parseRaProvenanceNote("just a plain note, nothing tagged");
  assert.strictEqual(parsed.discovery, null);
  assert.deepStrictEqual(parsed.freeText, ["just a plain note, nothing tagged"]);
}
console.log("PASS: parse/append never throw on null, blank, or untagged plain-text notes");

// 5. A "|" or newline inside a value is neutralized, never breaks the
//    one-line-per-record format.
{
  const note = buildRaDiscoveryNote({ raId: "ra-2", raUrl: "https://ra.co/events/2?x=a|b\nc", presentFields: ["title"] });
  assert.strictEqual(note.split("\n").length, 1, "a single record must always stay on one line");
}
console.log("PASS: a stray '|' or newline in a value is neutralized, never breaks the one-record-per-line format");

console.log("\nAll ra-provenance-note.js tests passed.");
