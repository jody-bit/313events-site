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
// candidate. Otherwise return null.
//
// Deliberately does NOT fall back to a generic visitdetroit.com/events/
// listing page, the site's homepage, or any other "at least it's not
// null" substitute -- per the product requirement, an unrelated generic
// page is strictly worse than an honestly-dead link, because it looks
// resolved without being resolved.
const OLD_SHAPE_RE = /^https:\/\/visitdetroit\.com\/(?!events\/)([a-z0-9-]+)\/?$/i;

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

  const normalizedTitle = title.trim().toLowerCase();
  const normalizedHtml = html.toLowerCase();
  if (!normalizedHtml.includes(normalizedTitle)) return null; // not confidently the same event

  return candidate;
}

module.exports = { visitDetroitRecoveryStrategy, OLD_SHAPE_RE };
