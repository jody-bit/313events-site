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

const LABEL = {
  unparsed: "not an event or no usable date",
  past_date: "already past",
  no_start_date: "no start date",
  venue_city_not_allowed: "venue or city outside the covered area",
  category_unmapped: "category not mapped",
  dedup: "duplicates",
  rejected: "rejected",
  error: "errors",
};

// Read side (Admin / control tower): persisted block -> one human-readable line.
// Absent block = UNKNOWN. An unreported fetched count is never shown as 0.
function readZeroWriteReasons(block) {
  if (!block || typeof block !== "object" || !block.reasons || typeof block.reasons !== "object") return { known: false, text: null };
  const parts = Object.entries(block.reasons)
    .filter(([k, v]) => LABEL[k] && Number.isInteger(v) && v > 0)
    .map(([k, v]) => `${v} ${LABEL[k]}`);
  if (Number.isInteger(block.unexplained) && block.unexplained > 0) parts.push(`${block.unexplained} unexplained`);
  const head = Number.isInteger(block.fetched) ? `${block.fetched} fetched, none written` : "fetched count not recorded, none written";
  return { known: true, text: parts.length ? `${head}: ${parts.join(", ")}` : head };
}

module.exports = { zeroWriteReasons, readZeroWriteReasons, REASON_CLASS };
