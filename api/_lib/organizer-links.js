// api/_lib/organizer-links.js
//
// Organizers whose own page is the verified source/organizer link for every
// event they present. When an event from one of them has no event_url, that
// page is used, so the event is never sent to Needs Follow Up just because it
// has no ticketing when a valid organizer/source link exists.
//
// Rules:
//   - event_url only. ticket_url is a different field and is never touched or
//     derived: a separate, verified event-specific ticket link stays exactly
//     where it is.
//   - an event_url that is already set (a person's, another connector's) is
//     never replaced.
//   - entries are added only with a link the owner supplied or verified.

const ORGANIZER_LINKS = Object.freeze([
  {
    key: "shake-some-action-wfmu",
    // Title ("Shake Some Action WFMU Presents: ..."), organizer name, or the
    // organizer's handle in the notes/description.
    match: /shake\s+some\s+action\s+wfmu|@?shakesomeactionwfmu/i,
    event_url: "https://www.instagram.com/shakesomeactionwfmu/",
  },
]);

function organizerLinkFor(row) {
  const r = row || {};
  const haystack = [r.title, r.submitter_org_name, r.organizer, r.internal_note]
    .filter((v) => typeof v === "string")
    .join(" \n ");
  const hit = ORGANIZER_LINKS.find((o) => o.match.test(haystack));
  return hit ? { key: hit.key, event_url: hit.event_url } : null;
}

// Returns the event_url to store: the row's own when present, else the
// organizer's. Never reads or returns a ticket link.
function withOrganizerEventUrl(row) {
  const own = row && typeof row.event_url === "string" ? row.event_url.trim() : "";
  if (own) return own;
  const hit = organizerLinkFor(row);
  return hit ? hit.event_url : (row && row.event_url) || null;
}

module.exports = { ORGANIZER_LINKS, organizerLinkFor, withOrganizerEventUrl };
