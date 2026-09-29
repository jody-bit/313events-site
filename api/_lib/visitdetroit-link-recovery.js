"use strict";

// api/_lib/visitdetroit-link-recovery.js
//
// VisitDetroit's own dead-event-URL recovery strategy for
// api/_lib/link-health.js's generic healEventUrl() framework.
//
// ROOT CAUSE (confirmed 2026-09-28 by directly re-checking two known-dead
// stored URLs against the live site): VisitDetroit's Algolia search index
// -- the source api/cron-visitdetroit.js reads -- still carries each
// event's OLD uri path (e.g. "/christmas-cookie-coach-tour/"), even though
// visitdetroit.com's own live site has since moved every event page under
// a new "/events/" prefix (e.g. "/events/christmas-cookie-coach-tour/").
// This is URL drift on VisitDetroit's own side -- their search index's uri
// field is stale, not evidence the event itself was removed. Both
// known-affected events (Christmas Cookie Coach Tour, The Original Detroit
// Christmas Bakery Bus Tour) still exist live, confirmed, just under the
// new path shape.
//
// STRATEGY: for a confirmed-dead https://visitdetroit.com/<slug>/ URL
// (OLD_SHAPE_RE deliberately excludes anything already under /events/ --
// that would indicate a DIFFERENT kind of dead link, not this known drift,
// and this strategy does not attempt to handle that case), try the same
// slug under /events/. If that responds ok AND the resulting page's own
// text contains the expected event title (case-insensitive substring
// match -- the same "confirm identity before trusting a recovered link"
// bar this project already uses elsewhere for source recovery, e.g.
// dossin-metadata-repair.js's per-event link uniqueness guard), return the
// candidate. Otherwise return null. The identity check itself is
// api/_lib/link-health.js's htmlContainsTitle() -- a plain
// case-insensitive substring match would falsely reject genuine matches
// whenever the title contains a character (a quote, an ampersand, an
// apostrophe) that the candidate page's raw HTML re-encodes as an HTML
// entity or a JSON-LD escape sequence; see that function's own header
// for the two real 2026-09-29 examples this fixes.
//
// Deliberately does NOT fall back to a generic visitdetroit.com/events/
// listing page, the site's homepage, or any other "at least it's not
// null" substitute -- per the product requirement, an unrelated generic
// page is strictly worse than an honestly-dead link, because it looks
// resolved without being resolved.
const { htmlContainsTitle } = require("./link-health");

// Slug character class deliberately uses Unicode letter/number
// properties (\p{L}/\p{N}), not [a-z0-9] -- confirmed 2026-09-29: the
// real dead URL for "What We Notice: Living in Art - Ashley Menth & Tzu
// Pore" is https://visitdetroit.com/what-we-notice-living-in-art-ashley-
// menth-tzu-pore/ (with an accented e), which an ASCII-only slug pattern
// silently refuses to match at all -- not a false negative on identity,
// a false negative on even recognizing the URL shape. Still a strict
// single-path-segment match (still requires the `u` flag's stricter
// Unicode-aware parsing), so this remains no more permissive than
// before about *what* it matches, just about *which characters* a real
// slug is allowed to contain.
const OLD_SHAPE_RE = /^https:\/\/visitdetroit\.com\/(?!events\/)([\p{L}\p{N}-]+)\/?$/iu;

async function visitDetroitRecoveryStrategy(deadUrl, { title, fetchFn = fetch } = {}) {
  const match = OLD_SHAPE_RE.exec(deadUrl);
  if (!match) return null;
  if (!title || !title.trim()) return null; // no identity to verify against -- never guess

  const slug = match[1];
  const candidate = `https://visitdetroit.com/events/${slug}/`;

  let resp;
  try {
    resp = await fetchFn(candidate, { method: "GET", redirect: "follow" });
  } catch {
    return null;
  }
  if (!resp.ok) return null;

  let html = "";
  try {
    html = await resp.text();
  } catch {
    return null;
  }

  if (!htmlContainsTitle(html, title)) return null; // not confidently the same event

  return candidate;
}

module.exports = { visitDetroitRecoveryStrategy, OLD_SHAPE_RE };
