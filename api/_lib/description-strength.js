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

// ---- Ingestion precedence for connectors that never overwrote stored text (Ticketmaster) --------------------------
// Owner direction 2026-10-24: a generic research-written artist biography must not outrank a source's own event-specific
// text; explicitly approved copy stays protected; stronger stored facts are preserved; conflicts go to review.
//
// A stored description counts as "research_generic" when its source is unknown (null) or tagged research_unsourced (a tag
// that needs a schema change and is inert until it exists) AND it reads like a generic biography: a short text that says
// what the artist is known for and carries no date, price or time. Anything else with a null source is kept as written.
const GENERIC_BIO_RE = /\b(known for|best known|celebrated|renowned|legendary|pioneering|veterans?|long-running|fast-rising|grammy-winning)\b/i;
// Hard facts: always a concrete fact. A date fraction must be a real month/day, so a tour name like "80/65" is not one.
const HARD_FACT_RE = /(\$\s?\d|\b\d{1,2}(:\d{2})?\s?(a|p)\.?m\b|\b(doors?|rescheduled|postponed|vip|sold out|presale|on sale)\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])\b)/i;
// Soft facts: a stored-only fact only when the title and the source text do not already say it (a TM title like
// "X with support from Y" or "ticket-and-hotel package" already carries them).
const SOFT_FACT_RE = /\b(support(ed|ing)?|special guests?|opening act|package)\b/i;
const SOFT_FACT_G = new RegExp(SOFT_FACT_RE.source, "gi");
// "support from Rain City Drive", "special guest Bello Nock": the named act decides, not the word.
const SUPPORT_NAME_RE = /\b(?:support(?:ed|ing)?|special guests?|opening act)\b(?:\s+(?:from|by|with|of))?\s+((?:[A-Z][\w'’.&-]*\s?){1,4})/g;
const CONCRETE_FACT_RE = new RegExp(HARD_FACT_RE.source + "|" + SOFT_FACT_RE.source, "i");
function storedOnlyFacts(text, ...others) {
  const hard = text.match(new RegExp(HARD_FACT_RE.source, "gi")) || [];
  const known = others.filter(Boolean).join(" ").toLowerCase();
  const names = [...text.matchAll(SUPPORT_NAME_RE)].map((m) => ({ phrase: m[0].trim().toLowerCase(), first: m[1].trim().split(/\s+/)[0].toLowerCase() }));
  const soft = [];
  for (const f of text.match(SOFT_FACT_G) || []) {
    const word = f.toLowerCase();
    if (word === "package") { if (!/hotel|package|ticket/.test(known)) soft.push(f); continue; }
    // a support / special-guest phrase is a stored-only fact only when the named act is absent from the title and source text
    const n = names.find((x) => x.phrase.startsWith(word));
    const said = n ? known.includes(n.first) : known.includes(word.replace(/(ed|ing)$/, ""));
    if (!said) soft.push(f);
  }
  return hard.concat(soft);
}
const GENERIC_BIO_MAX_CHARS = 260;

function isGenericBiography(text, { title = "", incoming = "" } = {}) {
  const d = typeof text === "string" ? text.trim() : "";
  return d.length > 0 && d.length < GENERIC_BIO_MAX_CHARS && GENERIC_BIO_RE.test(d) && storedOnlyFacts(d, title, incoming).length === 0;
}

// -> { action: "keep" | "replace" | "review", reason }
// stored/storedSource: what the row holds now. incoming: the source's own event text (e.g. Ticketmaster `info`).
function decideEventSpecificDescription({ stored, storedSource, incoming, title }) {
  const inc = typeof incoming === "string" ? incoming.trim() : "";
  const old = typeof stored === "string" ? stored.trim() : "";
  if (!inc) return { action: "keep", reason: "incoming_blank_never_replaces" };
  if (descriptionQuality(inc, title).ok !== true) return { action: "keep", reason: "incoming_not_usable" };
  if (!old) return { action: "replace", reason: "fill_blank" };
  if (storedSource === "manual") return { action: "keep", reason: "manual_protected" };
  if (storedSource === "authoritative") {
    // two source texts: only a changed source text is a conflict worth a person's eyes
    return old === inc ? { action: "keep", reason: "unchanged" } : { action: "keep", reason: "authoritative_stored" };
  }
  const researchTag = storedSource === "research_unsourced";
  const unknown = storedSource === null || storedSource === undefined || storedSource === "";
  const generated = storedSource === "generated";
  const replaceable = researchTag || generated || (unknown && (isGenericBiography(old, { title, incoming: inc }) || !descriptionQuality(old, title).ok));
  if (!replaceable) return { action: "keep", reason: "stored_text_preserved" };
  // stronger facts: if the stored text carries a concrete fact the source text lacks, a person decides
  const storedFacts = storedOnlyFacts(old, title);
  const lost = storedFacts.filter((f) => !inc.toLowerCase().includes(f.toLowerCase()));
  if (lost.length) return { action: "review", reason: "stored_text_has_facts_the_source_lacks: " + lost.slice(0, 3).join(", ") };
  if (inc.length < old.length && !(researchTag || generated || isGenericBiography(old, { title, incoming: inc }))) return { action: "keep", reason: "never_replace_with_shorter" };
  return { action: "replace", reason: researchTag ? "research_unsourced_replaced_by_source" : generated ? "generated_replaced_by_source" : "generic_biography_replaced_by_source" };
}

// Quality classes the nightly repair may replace with factual generated copy.
// truncated / unrelated_to_title are deliberately excluded: they may carry real
// information (or belong to an editor), so they stay flagged, not rewritten.
const REPAIRABLE = new Set(["placeholder", "bare_url", "time_only", "restates_title"]);

// Sources the repair is rolled out to (staged rollout: one connector first).
// Widen only after that connector's refresh is proven not to undo the repair.
//
// Stage 1 of the admin queue modernization (owner decision 2026-10-16): the 15
// CivicPlus calendar feeds whose iCal DESCRIPTION is only the event's own
// calendar.aspx?EID= page. Names are the `events.source` values (feed venue_name)
// as stored in production. api/cron-feeds.js applies decideSourceDescription()
// to these sources, so the feed's next refresh cannot put the URL back.
const CIVICPLUS_FEED_SOURCES = [
  "Mount Clemens Public Library - Adult Events",
  "Mount Clemens Public Library - Children's Events",
  "Mount Clemens Public Library - Teen Events",
  "City of Royal Oak",
  "Sterling Heights - Library",
  "Sterling Heights - Parks and Recreation",
  "Richmond Recreation Calendar",
  "Redford Township Community Events",
  "City of Rochester - Events",
  "Macomb Township Events",
  "City of Livonia - Community Events",
  "St. Clair Shores - Events & Programs",
  "Canton Township Community and Special Events",
  "City of Wyandotte - City Events",
  "City of Northville Events",
];
const REPAIR_SOURCES = new Set(["GottaGacha", ...CIVICPLUS_FEED_SOURCES]);

// -> { repairable, quality }
function repairVerdict(event) {
  if (!event) return { repairable: false, quality: null };
  const cls = classifyStored(event.description, event.description_source, event.title);
  if (cls !== "source_poor") return { repairable: false, quality: cls };
  const q = descriptionQuality(event.description, event.title).quality;
  return { repairable: REPAIRABLE.has(q) && REPAIR_SOURCES.has(event.source), quality: q };
}

module.exports = { isGenericBiography, decideEventSpecificDescription, GENERIC_BIO_MAX_CHARS, RANK, REPAIRABLE, REPAIR_SOURCES, CIVICPLUS_FEED_SOURCES, classifyStored, classifyIncoming, decideSourceDescription, repairVerdict };
