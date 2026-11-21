"use strict";
// Subscribable ICS feed of the next 14 days, confirmed start times only. Pure functions: no I/O, no env, no network.
// A row is listed only when ALL of these hold: approved; a single-day start_date inside [today, today+13] (Detroit);
// not all-day; a start time parsed from the first time in time_display; schedule state "confirmed". Anything else is left
// out, never guessed: unknown times, "Evening" placeholders, schedule-unverified ranges and recurring series are not listed.
const EventDates = require("../../event-dates");
// Location, text escaping and folding come from the one shared formatter every calendar export must use (test/calendar-location.test.js).
const { CalendarLocation } = require("../../calendar-location.js");

const WINDOW_DAYS = 14;
const DEFAULT_MINUTES = 120; // DEC-028: a stated start with no end shows a 2 hour block
const TZ = "America/Detroit";
const CAL_NAME = "313.events: next 14 days";

const TIME = /(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?/gi;
function toMinutes(h, m, ap) { h = +h; if (h < 1 || h > 12) return null; return (h % 12 + (ap.toLowerCase() === "p" ? 12 : 0)) * 60 + +(m || 0); }
// Start = a time at the very start of time_display; end = the second time after a range dash. Anything else is unknown.
function parseTimes(display) {
  const t = String(display || "").trim();
  const start = /^(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?\b/i.exec(t);
  if (!start) return null;
  const s = toMinutes(start[1], start[2], start[3]); if (s === null) return null;
  const rest = t.slice(start[0].length);
  const end = /^\s*(?:[–—-]|to)\s*(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?\b/i.exec(rest);
  const e = end ? toMinutes(end[1], end[2], end[3]) : null;
  return { start: s, end: e };
}
const pad = (n) => String(n).padStart(2, "0");
function addDays(iso, n) { return new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10); }
// Detroit wall-clock (iso date + minutes since midnight) to a UTC Date, DST-correct.
function detroitToUtc(iso, minutes) {
  const [y, mo, d] = iso.split("-").map(Number);
  let guess = Date.UTC(y, mo - 1, d, 0, 0) + minutes * 60000;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const wall = (ms) => { const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); };
  for (let i = 0; i < 2; i++) guess -= wall(guess) - (Date.UTC(y, mo - 1, d, 0, 0) + minutes * 60000);
  return new Date(guess);
}
const stamp = (dt) => `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`;
const esc = CalendarLocation.icsEscape, fold = CalendarLocation.foldICSLine;
const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch (_) { return null; } };

// Why a row is or is not listed. Returns { listed:true, startMin, endMin } or { listed:false, reason }.
function classify(row, today, lastDay) {
  if (!row || !row.id || !row.title) return { listed: false, reason: "incomplete" };
  if (row.status && row.status !== "approved") return { listed: false, reason: "not_public" };
  if (!row.start_date || row.start_date < today || row.start_date > lastDay) return { listed: false, reason: "outside_window" };
  if (row.is_all_day) return { listed: false, reason: "all_day" };
  if (row.end_date && row.end_date !== row.start_date) return { listed: false, reason: "multi_day" };
  if (EventDates.scheduleState(row) !== "confirmed") return { listed: false, reason: "schedule_unconfirmed" };
  const t = parseTimes(row.time_display);
  if (!t) return { listed: false, reason: "time_unconfirmed" };
  return { listed: true, startMin: t.start, endMin: t.end };
}

function buildFeed(rows, opts) {
  const o = opts || {};
  const nowMs = o.nowMs || Date.now();
  const siteUrl = (o.siteUrl || "https://313.events").replace(/\/$/, "");
  const today = o.today || new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(nowMs));
  const lastDay = addDays(today, WINDOW_DAYS - 1);
  const skipped = {}; const events = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const c = classify(r, today, lastDay);
    if (!c.listed) { skipped[c.reason] = (skipped[c.reason] || 0) + 1; continue; }
    const start = detroitToUtc(r.start_date, c.startMin);
    let endMin = c.endMin !== null ? c.endMin : c.startMin + DEFAULT_MINUTES;
    if (endMin <= c.startMin) endMin += 24 * 60; // crosses midnight
    const end = new Date(start.getTime() + (endMin - c.startMin) * 60000);
    const where = CalendarLocation.icsLocationLine(CalendarLocation.resolveForEvent({ venue: r.venue_name_raw, locEventAddress: r.venue_address_raw, locEventCity: r.venue_city_raw }));
    const page = siteUrl + "/event.html?id=" + encodeURIComponent(r.id);
    events.push({ r, start, end, where, page });
  }
  events.sort((a, b) => a.start - b.start || String(a.r.id).localeCompare(String(b.r.id)));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//313.events//Next 14 days//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc(CAL_NAME), "X-WR-TIMEZONE:" + TZ, "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  const dtstamp = stamp(new Date(nowMs));
  for (const e of events) {
    const link = safeUrl(e.r.ticket_url) || safeUrl(e.r.event_url);
    lines.push("BEGIN:VEVENT", "UID:" + e.r.id + "@313.events", "DTSTAMP:" + dtstamp, "DTSTART:" + stamp(e.start), "DTEND:" + stamp(e.end),
      "SUMMARY:" + esc(e.r.title));
    if (e.where) lines.push(e.where);
    lines.push("DESCRIPTION:" + esc("Details: " + e.page + (link ? "\n" + link : "")), "URL:" + e.page, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return { ics: lines.map(fold).join("\r\n") + "\r\n", listed: events.length, skipped, window: { from: today, to: lastDay } };
}

module.exports = { buildFeed, classify, parseTimes, detroitToUtc, WINDOW_DAYS };
