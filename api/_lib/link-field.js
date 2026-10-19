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

// Applies the rule to one row without mutating it. An unusable value is OMITTED from the write for both fields, so a rejected
// incoming link can never overwrite a valid stored one (merge-duplicates leaves an omitted column alone; a new row gets the
// column default, null). A field the row does not
// carry is left absent. Existing stored feed paths are cleared by the guarded repair, not by a refresh.
function normalizeRowLinks(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
  let out = row;
  for (const field of ["ticket_url", "event_url"]) {
    if (!(field in row)) continue;
    const clean = normalizeLinkField(row[field]);
    if (clean === row[field]) continue;
    if (out === row) out = { ...row };
    if (clean !== null) out[field] = clean;
    else delete out[field];
  }
  return out;
}

// ---- diagnostics: bounded, sanitized logging of rejected links (owner decision 2026-10-19 03:30Z) --------------------------
// A rejected value can still carry credentials, tokens or personal data (a signed URL, ?email=, user:pass@host). The value
// is logged only after sanitizeLinkForLog, and only for the first `limit` rejections of a run; the rest are counted by
// source and reason, with no value.
// A rejected link is logged as host + path ONLY, or a placeholder when it is not a URL or a site-relative path. The query string and fragment are dropped in every branch, so a secret cannot
// reach a log line, a feed poll note or the run response by hiding in a parameter, whatever its name, or in a URL nested in a
// parameter, or in text that fails URL parsing. Credentials in the authority (user:pass@host) are dropped, and secret-shaped
// runs, emails and phone-like numbers are masked wherever they appear (path included).
const SECRET_SHAPE = /(?:\b(?:sk|pk|rk|whsec|ghp|gho|xox[abp])_[A-Za-z0-9_]{6,}|\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)*|\bAKIA[0-9A-Z]{12,}|[A-Za-z0-9_-]{24,})/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const NUMBERISH = /\+?\d[\d\s().-]{8,}\d/g;
const LOG_VALUE_MAX = 120;

const UNPARSEABLE = "[unparseable value]";

// -> "https://host/path" for an absolute URL, "/path" for a site-relative path, otherwise the placeholder. Never the raw input.
function sanitizeLinkForLog(value) {
  const v = typeof value === "string" ? value.trim() : "";
  let out;
  if (!v) return "";
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
      const u = new URL(v);
      out = `${u.protocol}//${u.host}${u.pathname}`; // URL parsing separates userinfo, query and fragment, which are all dropped
    } else if (v.startsWith("/") && !v.startsWith("//")) {
      out = new URL(v, "http://relative.invalid").pathname; // a site-relative path: path only, no decoding, a bad percent sequence cannot throw
    } else {
      return UNPARSEABLE; // price text, protocol-relative, bare host, mailto:, malformed: nothing from the input is echoed
    }
  } catch {
    return UNPARSEABLE;
  }
  out = out.replace(/(^|\/)[0-9a-f-]{24,}(?=\/|$)/gi, "$1[redacted]").replace(EMAIL, "[email]").replace(SECRET_SHAPE, "[redacted]").replace(NUMBERISH, "[number]");
  return out.length > LOG_VALUE_MAX ? out.slice(0, LOG_VALUE_MAX) + "…" : out;
}

// -> { record(source, rejectedLinks), summary() }. `source` = { id, venue_name }; rejectedLinks = [{ raw, reason }].
function createRejectionLog({ limit = 20, log = console.log } = {}) {
  let logged = 0;
  const aggregate = new Map(); // `${source id}\u0000${reason}` -> { source, source_name, reason, count } for rejections past the limit
  const totals = new Map();
  return {
    record(source, rejectedLinks) {
      for (const r of rejectedLinks || []) {
        const id = String((source && source.id) || "unknown");
        const tk = `${id}\u0000${r.reason}`;
        const t = totals.get(tk) || { source: id, source_name: (source && source.venue_name) || null, reason: r.reason, count: 0 };
        t.count++; totals.set(tk, t);
        if (logged < limit) {
          logged++;
          log(`[feeds] rejected_ticket_link source=${id} reason=${r.reason} value=${JSON.stringify(sanitizeLinkForLog(r.raw))}`);
        } else {
          const a = aggregate.get(tk) || { source: id, source_name: t.source_name, reason: r.reason, count: 0 };
          a.count++; aggregate.set(tk, a);
        }
      }
    },
    summary() {
      return { logged, aggregated: Array.from(aggregate.values()), totalsBySourceAndReason: Array.from(totals.values()) };
    },
    flush() {
      for (const a of aggregate.values()) log(`[feeds] rejected_ticket_link_aggregate source=${a.source} reason=${a.reason} count=${a.count}`);
    },
  };
}

module.exports = { normalizeLinkField, resolveLinkField, normalizeRowLinks, sanitizeLinkForLog, createRejectionLog, FEED_PATH };
