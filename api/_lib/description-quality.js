// api/_lib/description-quality.js
//
// "A nonempty description is not automatically a useful description."
// Classifies a stored description as one of:
//   missing       blank
//   placeholder   "coming soon", "deets coming soon", "link coming soon", TBA ...
//   bare_url      nothing but a link (a link is a source, not a description)
//   time_only     nothing but a time or time range ("10PM-2AM")
//   restates_title  adds nothing to the title ("GG Gundam TCG Event" on "Gundam TCG")
//   truncated     cut off mid-thought (unbalanced "(", dangling "and"/","/"(")
//   ok            anything else
//
// Deliberately conservative: it only names descriptions that cannot tell a
// visitor what the event is. It never rewrites or invents text; the caller
// flags the record for editorial follow-up.
//
// admin.html carries an inline copy (a browser script cannot require this
// file); test/description-quality.test.js asserts the two agree.

const PLACEHOLDER_RE = /^(?:tba|tbd|n\/?a|none|no description(?: available)?|(?:more\s+)?(?:deets|details|info(?:rmation)?|link|list|lineup|line-up|times?)\b[^.!?]{0,30}\b(?:coming soon|dropping soon|to come|tba|tbd|to be announced)|(?:description\s+)?coming soon|(?:deets|details|info)\s+(?:soon|tba|tbd)|stay tuned)[\s.!:]*$/i;
// A short note that is mostly "coming soon" ("ALL DAY :: List Coming Soon",
// "deets coming soon | time is a placeholder") is still a placeholder.
const SOON_RE = /\b(?:coming soon|dropping soon|deets|details to come|tba|tbd)\b/i;
const BARE_URL_RE = /^(?:https?:\/\/|www\.)\S+$/i;
const TIME = String.raw`\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?`;
const TIME_ONLY_RE = new RegExp(String.raw`^(?:doors?\s*:?\s*)?${TIME}(?:\s*[-–—]\s*|\s+to\s+)${TIME}$|^(?:doors?\s*:?\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)$`, "i");
const FILLER = new Set(["a", "an", "the", "event", "events", "night", "day", "gg", "presents", "present", "special", "open", "of", "at", "for", "and", "gotta", "gacha", "gottagacha"]);

function words(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function isTruncated(d) {
  let depth = 0;
  for (const ch of d) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
  }
  if (depth > 0) return true;
  return /(?:[(,;:&\-–]|\b(?:and|or|with|featuring|feat\.?|plus|the|a|an|of|at|in|on|by|from|to))\s*$/i.test(d);
}

function descriptionQuality(description, title) {
  const d = typeof description === "string" ? description.trim() : "";
  if (!d) return { quality: "missing", ok: false };
  if (PLACEHOLDER_RE.test(d)) return { quality: "placeholder", ok: false };
  if (SOON_RE.test(d) && words(d).length <= 8) return { quality: "placeholder", ok: false };
  if (BARE_URL_RE.test(d)) return { quality: "bare_url", ok: false };
  if (TIME_ONLY_RE.test(d)) return { quality: "time_only", ok: false };
  if (isTruncated(d)) return { quality: "truncated", ok: false };
  const extra = words(d).filter((w) => !FILLER.has(w) && !words(title).includes(w));
  if (extra.length === 0) return { quality: "restates_title", ok: false };
  return { quality: "ok", ok: true };
}

module.exports = { descriptionQuality, PLACEHOLDER_RE, BARE_URL_RE, TIME_ONLY_RE, isTruncated };
