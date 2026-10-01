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

const TICKET_AFFILIATE_NOTE_TEXT = "313.events may earn a commission if you purchase through this link.";

// Conditional Ticketmaster affiliate disclosure (Jody, 2026-10-01: "Only
// show this disclosure when the ticket URL is actually an affiliate
// link. Do not show it on ordinary ticket links."). This is deliberately
// narrow: api/cron-ticketmaster.js's affiliateTicketUrl() wraps EVERY
// Ticketmaster event's ticket_url in an Impact Radius affiliate redirect
// unconditionally (see that function's own comment -- there is no
// per-event opt-out, it always wraps a non-null url). That makes
// `source === 'Ticketmaster'` plus a real, non-null ticketUrl both
// necessary and sufficient to mean "this specific link is an active
// affiliate link" -- not a guess, and not something that needs a new
// per-row database flag. No other connector in this codebase injects any
// affiliate/tracking parameters of its own (confirmed during the Phase 1
// audit), so this check is intentionally NOT applied to every ticketUrl
// on the site -- only to Ticketmaster's.
function affiliateDisclosureHtml(e) {
  if (!e || e.source !== 'Ticketmaster') return '';
  if (!e.ticketUrl || !safeUrl(e.ticketUrl)) return '';
  return `<div class="note aff-disclosure">${escapeHtml(TICKET_AFFILIATE_NOTE_TEXT)}</div>`;
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
