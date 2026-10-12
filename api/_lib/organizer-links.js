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
    titlePattern: "shake some action wfmu",
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

// Blank-only back-fill for rows an ingestion path has just written. One
// PATCH per organizer, filtered in the database to rows whose event_url is
// NULL or empty, so a verified event-specific URL is structurally
// impossible to overwrite and ticket_url is not in the payload. Failure is
// swallowed: the link is an enhancement and must never fail an ingestion
// run. Called only when a written row actually matches an organizer.
async function fillBlankOrganizerEventUrls(supabaseUrl, serviceRoleKey, rows, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const matched = new Map();
  for (const row of rows || []) {
    const hit = row && typeof row === "object" ? organizerLinkFor(row) : null;
    if (hit) matched.set(hit.key, hit);
  }
  let patched = 0;
  for (const [key, hit] of matched) {
    const o = ORGANIZER_LINKS.find((x) => x.key === key);
    // ilike pattern from the organizer's name words: "shake some action wfmu"
    const pattern = encodeURIComponent(`*${o.titlePattern}*`);
    try {
      const resp = await doFetch(
        `${supabaseUrl}/rest/v1/events?title=ilike.${pattern}&or=(event_url.is.null,event_url.eq.)`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Prefer: "return=minimal" },
          body: JSON.stringify({ event_url: hit.event_url }),
        }
      );
      if (resp && resp.ok) patched += 1;
    } catch {
      /* never fail an ingestion run for a link back-fill */
    }
  }
  return patched;
}

module.exports = { ORGANIZER_LINKS, organizerLinkFor, withOrganizerEventUrl, fillBlankOrganizerEventUrls };
