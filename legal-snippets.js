// legal-snippets.js — shared, reusable legal/trust copy fragments
// (2026-10-01, Phase 1 Legal + Trust pass). Defined once here instead of
// drifting across the several HTML pages that need the identical wording
// -- same static-include pattern as legal-dates.js (see that file's own
// comment on why a shared static JS file fits this project's
// no-build-step architecture without changing it).
//
// Every function here is a pure string/HTML builder. Callers only invoke
// these from inside their own render()-time code (after a Supabase fetch
// resolves), by which point every script on the page -- including this
// one, and including each page's own escapeHtml()/safeUrl() helpers --
// has already run its top-level declarations. Load order of the <script
// src> tag on the page therefore doesn't matter, as long as it's present
// somewhere before the page's first render() call (in practice, anywhere
// in <head> or <body>).

// Affiliate disclosure (owner-approved wording, 2026-10-22). ONE definition of the words, ONE registry of the
// compensated relationships, ONE component. Pages call affiliateDisclosureHtml(e) and nothing else; no page carries
// its own copy of the wording or its own test of "is this an affiliate link".
const AFFILIATE_DISCLOSURE = Object.freeze({
  heading: "SUPPORT THE ORBIT.",
  body: "Ticket links may earn us a commission."
});

// The compensated relationships. A link is an affiliate link when its HOST is one of a relationship's hosts (or a
// subdomain of one), so the notice follows the link that is actually shown, not the event's source. Today the only
// confirmed relationship is Ticketmaster through Impact: api/cron-ticketmaster.js wraps a Ticketmaster ticket_url
// in ticketmaster.evyy.net. Add a relationship here (id, program, hosts) once the owner confirms it exists; the
// disclosure then follows with no page change. Do NOT list a network nothing creates links for.
const AFFILIATE_RELATIONSHIPS = Object.freeze([
  Object.freeze({ id: "ticketmaster-impact", program: "Ticketmaster via Impact", hosts: Object.freeze(["ticketmaster.evyy.net"]) })
]);

// The relationship a URL belongs to, or null. Only http(s) URLs with a parseable host count.
function affiliateRelationshipFor(url) {
  if (!url || typeof url !== 'string') return null;
  let host;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    host = u.hostname.toLowerCase();
  } catch (_) {
    return null;
  }
  for (const r of AFFILIATE_RELATIONSHIPS) {
    for (const h of r.hosts) if (host === h || host.endsWith('.' + h)) return r;
  }
  return null;
}

function isAffiliateLink(url) {
  return affiliateRelationshipFor(url) !== null;
}

// The disclosure for ONE event card or detail view: empty unless a link that page would actually show (the ticket
// link, or the event-page link) is an affiliate link. A Ticketmaster row whose link is not wrapped shows nothing;
// a row from any other source with a wrapped link shows the notice. Render it directly after the row of action
// links, once per view, never in a list header or footer.
function affiliateDisclosureHtml(e) {
  if (!e) return '';
  const shown = [e.ticketUrl, e.eventPageUrl].filter((u) => u && safeUrl(u));
  if (!shown.some(isAffiliateLink)) return '';
  return `<div class="aff-disclosure" role="note"><strong class="aff-disclosure-head">${escapeHtml(AFFILIATE_DISCLOSURE.heading)}</strong> <span class="aff-disclosure-body">${escapeHtml(AFFILIATE_DISCLOSURE.body)}</span></div>`;
}

// The one style rule for the notice, written into the page so no page defines its own. Colour tokens only (the
// fallbacks equal the site's own ink values): heading in --ink, body in --ink-soft, both clear 4.5:1 on the page
// and card backgrounds; wraps down to a 320px screen.
if (typeof document !== 'undefined' && document.createElement && !document.getElementById('aff-disclosure-style')) {
  const style = document.createElement('style');
  style.id = 'aff-disclosure-style';
  style.textContent = '.aff-disclosure{display:block;margin-top:6px;font-size:12px;line-height:1.4;font-style:normal;overflow-wrap:anywhere;color:var(--ink-soft,#A9AAA3);}' +
    '.aff-disclosure-head{font-weight:700;letter-spacing:.04em;color:var(--ink,#F2F0E8);}';
  (document.head || document.documentElement).appendChild(style);
}

// Generic trademark/independence disclaimer (item I). Deliberately NOT
// 313-Presents-specific (Jody, 2026-10-01: "Do NOT add a 313 Presents-
// specific disclaimer... Do not create an unnecessary association between
// the two brands") -- 313 Presents may still appear factually as a data
// source (see sources.html's own sources table) without this text calling
// it out by name. Used on terms.html; available here so any other page
// that needs it later pulls the identical wording.
const TRADEMARK_DISCLAIMER_TEXT = "Third-party event, artist, venue, organizer, promoter, ticketing-company, and other names and trademarks belong to their respective owners. Their appearance on 313.events does not imply sponsorship, endorsement, affiliation, or partnership unless explicitly stated.";

// Short-form event-accuracy disclaimer (item C) -- the condensed version
// for product UX, distinct from the full Terms-page language.
// index.html/calendar.html/map.html's existing footer sentence already
// serves this role on those three pages verbatim; this constant exists so
// any OTHER surface that needs the same short-form disclaimer later pulls
// the identical wording instead of a slightly different paraphrase.
const EVENT_ACCURACY_SHORT_NOTE = "Always confirm dates, times, and venues before making plans.";
