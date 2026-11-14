// One rule for every automated writer: a row the owner supplied or protected is never changed by automation,
// not even to fill a blank (the owner may have left the field blank on purpose).
// Owner-supplied = Manual source, or a private note carrying an owner correction or an editorial hold.
// Same rule as scripts/sh1-repair-existing-venue-address-city.js (#312); unify on this helper when #312 lands.
// Limit: an intentional blank on a row WITHOUT either marker cannot be recognised. Mark it EDITORIAL-HOLD.
"use strict";

const OWNER_NOTE_RE = /OWNER-CORRECTION|EDITORIAL[-_ ]HOLD/i;

// options.includeManualSource (default true). generic-metadata-enrichment passes false: generating a missing description for
// a Manual row is its existing, provenance-marked behaviour (description_source=generated), pending the owner's decision.
function isOwnerSuppliedRow(event, options) {
  if (!event || typeof event !== "object") return false;
  const includeManual = !options || options.includeManualSource !== false;
  if (includeManual && String(event.source || "").trim().toLowerCase() === "manual") return true;
  return typeof event.internal_note === "string" && OWNER_NOTE_RE.test(event.internal_note);
}

module.exports = { isOwnerSuppliedRow, OWNER_NOTE_RE };
