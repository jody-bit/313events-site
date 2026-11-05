"use strict";

// api/_lib/venue-location-gate.js
//
// Approve-time check for a hand-submitted event (source "Venue Submission"):
// it must not go live with no venue link AND no city (P1 audit EXPORT-2; the
// public form has a free-text venue and optional address, so a submission can
// arrive with neither). Pure: a row in, a verdict out. Writes nothing.
//
//   { ok: true }                          nothing to do
//   { ok: true, patch: { venue_city_raw } } the stored address states a known
//                                          city; fill it in the same approve
//   { ok: false, code, why }              block; the row stays pending_review
//
// Not applied to other sources, to rows linked to a venue, to rows with a
// city, or to events that by design have no fixed venue. A moderator can
// approve on purpose with acknowledgeMissingLocation:true.

const path = require("path");
const { cityFromAddress } = require(path.join(__dirname, "address-city"));

const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";

function venueLocationGate(row, { acknowledged = false } = {}) {
  if (!row || row.source !== "Venue Submission") return { ok: true };
  if (!isBlank(row.venue_id) || !isBlank(row.venue_city_raw) || row.no_fixed_venue === true) return { ok: true };
  const stated = cityFromAddress(row.venue_address_raw);
  if (stated) return { ok: true, patch: { venue_city_raw: stated.city } };
  if (acknowledged) return { ok: true };
  return {
    ok: false,
    code: "MISSING_VENUE_LOCATION",
    why: "This submission is not linked to a venue and has no city, so it cannot be placed. Add the venue or city first, or approve it on purpose.",
  };
}

module.exports = { venueLocationGate };
