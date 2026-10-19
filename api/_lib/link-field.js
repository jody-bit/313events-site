// api/_lib/link-field.js — the one rule for what may be stored in events.ticket_url / events.event_url.
//
// Q17 (quality recovery, 2026-10-19): 567 upcoming events stored a value that is not an absolute http(s) URL, and the
// public pages resolve a relative value against 313.events itself, so the "Tickets & info" button led to a 313.events 404.
// 565 were the CivicPlus calendar-feed path (/common/modules/iCalendar/iCalendar.aspx?feed=...) that municipal ICS feeds
// publish in VEVENT URL; 2 were price text ("Pay at the door").
//
// A link field holds an absolute http(s) event or ticket page, or nothing. Nothing is never guessed or resolved against
// the feed's origin: a feed path resolved against its site is a valid-looking wrong link.
"use strict";

// Calendar-feed endpoints: a real, reachable page that is not the event.
const FEED_PATH = /\/common\/modules\/icalendar\/|\/icalendar\.aspx(?:\?|$)|\.(?:ics|rss)(?:\?|#|$)/i;

// -> the trimmed absolute http(s) URL, or null.
function normalizeLinkField(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  let u;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || u.hostname.indexOf(".") === -1) return null;
  if (FEED_PATH.test(u.pathname + u.search)) return null;
  return v;
}

// Connector-side form, for a source that supplied `value` as its link and whose own feed/page URL is `baseUrl`.
// A site-relative path ("/events/42") is resolved against the source's origin ONLY when the source context is an http(s)
// URL and the result is an event page (not a calendar feed). Anything else is not guessed.
// -> { url, raw, reason } with reason "ok" | "resolved" | "empty" | "feed_path" | "not_a_link" | "unresolvable".
function resolveLinkField(value, baseUrl) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { url: null, raw: raw || null, reason: "empty" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    const url = normalizeLinkField(raw);
    if (url) return { url, raw, reason: "ok" };
    try { if (FEED_PATH.test(new URL(raw).pathname + new URL(raw).search)) return { url: null, raw, reason: "feed_path" }; } catch { /* fall through */ }
    return { url: null, raw, reason: "not_a_link" };
  }
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    let base;
    try { base = new URL(String(baseUrl)); } catch { base = null; }
    if (base && (base.protocol === "http:" || base.protocol === "https:")) {
      const abs = base.origin + raw;
      if (FEED_PATH.test(raw)) return { url: null, raw, reason: "feed_path" };
      const url = normalizeLinkField(abs);
      return url ? { url, raw, reason: "resolved" } : { url: null, raw, reason: "unresolvable" };
    }
    return { url: null, raw, reason: "unresolvable" };
  }
  return { url: null, raw, reason: "not_a_link" };
}

// Applies the rule to one row without mutating it. ticket_url is source-authoritative, so an unusable value is written as
// null (a refresh clears a stored feed path). event_url is protect-from-blank (event-contract FIELD_POLICY), so an unusable
// value is omitted and the stored one stands. A field the row does not carry is left absent.
function normalizeRowLinks(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
  let out = row;
  for (const field of ["ticket_url", "event_url"]) {
    if (!(field in row) || row[field] === undefined || row[field] === null) continue;
    const clean = normalizeLinkField(row[field]);
    if (clean === row[field]) continue;
    if (out === row) out = { ...row };
    if (clean !== null) out[field] = clean;
    else if (field === "ticket_url") out[field] = null;
    else delete out[field];
  }
  return out;
}

module.exports = { normalizeLinkField, resolveLinkField, normalizeRowLinks, FEED_PATH };
