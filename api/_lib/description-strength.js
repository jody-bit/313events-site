// api/_lib/description-strength.js
//
// One rule for "may this text replace the stored description?", shared by the
// connectors that adopt it and by the nightly repair. Pure; no I/O.
//
// Rank (higher wins):
//   5 manual         an editor wrote or confirmed it
//   4 authoritative  recovered from a verified external source
//   3 source_ok      the source's own text and it passes descriptionQuality()
//   2 generated      factual template from structured columns
//   1 source_poor    source text that cannot tell a visitor what the event is
//   0 blank
//
// A write is allowed only when the incoming text outranks what is stored, or
// when both are source_ok (a refreshed source is allowed to update itself).
// A null/blank incoming value NEVER replaces stored text.

const { descriptionQuality } = require("./description-quality");

const RANK = { blank: 0, source_poor: 1, generated: 2, source_ok: 3, authoritative: 4, manual: 5 };

function classifyStored(description, descriptionSource, title) {
  const d = typeof description === "string" ? description.trim() : "";
  if (!d) return "blank";
  if (descriptionSource === "manual") return "manual";
  if (descriptionSource === "authoritative") return "authoritative";
  if (descriptionSource === "generated") return "generated";
  return descriptionQuality(d, title).ok ? "source_ok" : "source_poor";
}

function classifyIncoming(description, title) {
  const d = typeof description === "string" ? description.trim() : "";
  if (!d) return "blank";
  return descriptionQuality(d, title).ok ? "source_ok" : "source_poor";
}

// -> { write, reason, incomingClass, storedClass }
function decideSourceDescription({ stored, storedSource, incoming, title }) {
  const storedClass = classifyStored(stored, storedSource, title);
  const incomingClass = classifyIncoming(incoming, title);
  let write = false;
  let reason;
  if (incomingClass === "blank") reason = "incoming_blank_never_replaces";
  else if (storedClass === "blank") { write = true; reason = "fill_blank"; }
  else if (RANK[incomingClass] > RANK[storedClass]) { write = true; reason = "outranks_stored"; }
  else if (incomingClass === "source_ok" && storedClass === "source_ok") { write = true; reason = "source_refresh"; }
  else reason = "stored_is_stronger_or_equal";
  return { write, reason, incomingClass, storedClass };
}

// Quality classes the nightly repair may replace with factual generated copy.
// truncated / unrelated_to_title are deliberately excluded: they may carry real
// information (or belong to an editor), so they stay flagged, not rewritten.
const REPAIRABLE = new Set(["placeholder", "bare_url", "time_only", "restates_title"]);

// Sources the repair is rolled out to (staged rollout: one connector first).
// Widen only after that connector's refresh is proven not to undo the repair.
const REPAIR_SOURCES = new Set(["GottaGacha"]);

// -> { repairable, quality }
function repairVerdict(event) {
  if (!event) return { repairable: false, quality: null };
  const cls = classifyStored(event.description, event.description_source, event.title);
  if (cls !== "source_poor") return { repairable: false, quality: cls };
  const q = descriptionQuality(event.description, event.title).quality;
  return { repairable: REPAIRABLE.has(q) && REPAIR_SOURCES.has(event.source), quality: q };
}

module.exports = { RANK, REPAIRABLE, REPAIR_SOURCES, classifyStored, classifyIncoming, decideSourceDescription, repairVerdict };
