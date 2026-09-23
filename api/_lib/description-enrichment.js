// api/_lib/description-enrichment.js — factual, template-based description
// generation (2026-09-23, "AI factual descriptions" — Admin automated
// enrichment, approved by the Product Owner).
//
// ** WHY THIS IS A DETERMINISTIC TEMPLATE, NOT A CALL TO AN AI PROVIDER **
// Checked first, per the Product Owner's explicit instruction ("first
// inspect whether this project already has an AI/model/API capability
// available in its runtime"): this project has no package.json, no npm
// dependency of any kind, and no AI/LLM provider credential anywhere in its
// environment (.env.local lists every configured variable name — no
// ANTHROPIC_API_KEY, OPENAI_API_KEY, or similar; confirmed 2026-09-23). Per
// the same instruction — "do NOT fake it" — this module does not pretend to
// call a model. It instead implements exactly the "safe" shape the Product
// Owner specified: a description built ONLY by grammatically connecting
// verified structured fields already on the event, with zero invented
// content by construction (there is no free-text generation step at all to
// go wrong). This fully satisfies the approved requirement today, with no
// external dependency, and needs no further work unless the Product Owner
// later wants more varied prose — see the module-level TODO below for
// exactly what activating that would require.
//
// TO ADD REAL NATURAL-LANGUAGE GENERATION LATER: add an AI provider
// credential (e.g. ANTHROPIC_API_KEY) to Vercel's environment, add that
// provider's SDK as a dependency (this project currently has none), and
// replace buildFactualDescription()'s single return statement with a call
// to that provider — constrained to the same verifiedFacts object this
// function already builds, with the same "connect facts, invent nothing"
// instruction. Nothing else in this module or its caller
// (scripts/generic-metadata-enrichment.js) would need to change.
//
// SAFETY: this function only ever reads fields already present on the
// event/venue rows (title, resolved venue name, start_date, time_display,
// is_free, price_from) — never anything else, never a guess. It never
// fabricates genre, importance, popularity, lineup, pricing beyond the
// event's own price_from/is_free columns, age restriction, accessibility,
// parking, ticket availability, venue characteristics, or promotional
// claims, matching the Product Owner's explicit "safe vs. unsafe" example.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2026-10-05" -> "October 5". Returns null on anything not shaped like an
// ISO date — never guesses at a date from a malformed string.
function formatFactualDate(isoDate) {
  if (typeof isoDate !== "string") return null;
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const monthIdx = parseInt(m[2], 10) - 1;
  const monthName = MONTH_NAMES[monthIdx];
  if (!monthName) return null;
  return `${monthName} ${parseInt(m[3], 10)}`;
}

// Prefers a resolved canonical venue name (e.g. the linked `venues` row,
// already the site's own authoritative display name — see
// api/_lib/venue-lookup.js's resolvePublicVenueDisplay(), same precedence)
// over the event's own raw text, and treats a "Venue TBA"-style placeholder
// as no venue at all rather than printing it into a sentence as if it were
// a real name.
function resolveFactualVenueName(event) {
  const linked = event && event.venues && typeof event.venues.name === "string" ? event.venues.name.trim() : "";
  if (linked) return linked;
  const raw = event && typeof event.venue_name_raw === "string" ? event.venue_name_raw.trim() : "";
  if (!raw) return null;
  if (raw.toLowerCase() === "venue tba") return null; // same exact-match rule as admin.html's isVenueTbaByDesign()
  return raw;
}

function isDescriptionBlank(event) {
  return !event || !event.description || !event.description.trim();
}

// The pure decision + generation function. No I/O. Returns a string (safe
// to write) or null (not enough verified facts to say anything factual —
// in practice this project's schema guarantees `title` and `start_date` are
// always present, so null is essentially unreachable in production, but
// this stays defensive rather than ever emitting an empty/fabricated
// sentence for a row that turns out to be malformed).
function buildFactualDescription(event) {
  if (!event || typeof event.title !== "string" || !event.title.trim()) return null;
  const title = event.title.trim();
  const venueName = resolveFactualVenueName(event);
  const dateText = formatFactualDate(event.start_date);
  const timeText =
    event.is_all_day
      ? null // an all-day/no-single-start-time listing — never print a time_display that isn't there
      : (typeof event.time_display === "string" && event.time_display.trim() ? event.time_display.trim() : null);

  if (!venueName && !dateText && !timeText) return null; // title alone isn't a sentence worth writing

  let sentence = `${title} takes place`;
  if (venueName) sentence += ` at ${venueName}`;
  if (dateText) sentence += ` on ${dateText}`;
  if (timeText) sentence += ` at ${timeText}`;
  sentence += ".";

  // Both are real, already-verified structured columns on the event row
  // (never derived/guessed) — safe to state as fact when present.
  const extras = [];
  if (event.is_free === true) extras.push("Free admission.");
  else if (typeof event.price_from === "number" && event.price_from > 0) {
    extras.push(`Tickets from $${event.price_from}.`);
  }

  return [sentence, ...extras].join(" ");
}

module.exports = {
  formatFactualDate,
  resolveFactualVenueName,
  isDescriptionBlank,
  buildFactualDescription,
};
