// api/_lib/zero-write-reasons.js -- additive run-log detail for connectors
// that finish with fetched > 0 and written = 0 (2026-11-07 draft). Pure.
// Splits "why nothing was written" into named reason counts so the tower can
// tell FILTERED (no date / past / venue-city / category) from DEDUP, REJECTED
// and ERROR. Goes into source_runs.session_data.zero_write_reasons; no
// behaviour change, no new columns.
"use strict";

const REASON_CLASS = {
  unparsed: "filtered", // not an event / no usable date
  past_date: "filtered",
  no_start_date: "filtered",
  venue_city_not_allowed: "filtered",
  category_unmapped: "filtered",
  dedup: "dedup",
  rejected: "rejected",
  error: "error",
};

function zeroWriteReasons(fetched, counts) {
  const reasons = {};
  let explained = 0;
  for (const [k, v] of Object.entries(counts || {})) {
    if (!REASON_CLASS[k] || !Number.isInteger(v) || v <= 0) continue;
    reasons[k] = v;
    explained += v;
  }
  const byClass = {};
  for (const [k, v] of Object.entries(reasons)) byClass[REASON_CLASS[k]] = (byClass[REASON_CLASS[k]] || 0) + v;
  return {
    zero_write_reasons: {
      fetched: Number.isInteger(fetched) ? fetched : null,
      reasons,
      byClass,
      unexplained: Number.isInteger(fetched) ? Math.max(0, fetched - explained) : null,
    },
  };
}

module.exports = { zeroWriteReasons, REASON_CLASS };
