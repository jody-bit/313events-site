// event-dates.js — the one shared definition of "on which days is this event
// happening?" (issue #48, Product Owner decisions 2026-10-09 and 2026-10-13).
//
// Plain static include, same pattern as discovery.js / paged-fetch.js (a
// <script src>, no build step, no dependency, no DOM, no network). Exposes one
// global in the browser, `EventDates`, and is require()-able from Node tests.
// index.html, calendar.html, map.html and discovery.js all ask THIS file; none
// carries its own date-range loop any more.
//
// THE RULE (never again an implicit one): a date range on its own never
// implies daily occurrences.
//
//   date_semantics   active on
//   --------------   ------------------------------------------------------
//   single           its start date only, even when its hours cross midnight
//                    (a row whose end_date is the next morning is still one
//                    night)
//   continuous       every day of start..end: a genuinely ongoing thing
//                    (an exhibition, a pass, a seasonal destination period)
//   recurring        only the explicitly evidenced occurrence_dates
//   null / unknown   one date (end <= start): that date. A one-night overnight
//                    row (end = start + 1, with a stated clock time): its
//                    start date. Any other multiday range is SCHEDULE-
//                    UNVERIFIED: a promotional period, not attendable days
//                    (owner decision 2026-10-16: unknown schedule never means
//                    daily availability). It is active on NO specific date.
//                    The event and its range are preserved, nothing is
//                    synthesised, and it stays discoverable through general
//                    (date-less) browsing; reviewReason() routes it to a person.
//
// Opening receptions and special programming are NOT a fourth value. A
// reception is its own `single` event; the exhibition it opens is a
// `continuous` event. Nothing here links them; presentation may.
//
// A recurring row with no usable occurrence_dates is schedule-unverified (see
// above) and is reported by reviewReason().
//
// Lists are capped at MAX_SPAN_DAYS listed days per event (the existing
// defensive guard against a typo'd end_date). The cap is unchanged.

(function () {
  "use strict";

  var MAX_SPAN_DAYS = 60;
  var ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  var SEMANTICS = { single: 1, continuous: 1, recurring: 1 };

  function isIso(s) { return typeof s === "string" && ISO_RE.test(s); }

  function semanticsOf(e) {
    var v = e && (e.dateSemantics || e.date_semantics);
    return (typeof v === "string" && SEMANTICS[v]) ? v : null;
  }

  // Sorted, de-duplicated, valid ISO dates; [] when there are none.
  function occurrenceList(e) {
    var raw = e && (e.occurrenceDates || e.occurrence_dates);
    if (!Array.isArray(raw)) return [];
    var seen = {};
    var out = [];
    raw.forEach(function (d) { if (isIso(d) && !seen[d]) { seen[d] = 1; out.push(d); } });
    return out.sort();
  }

  function startOf(e) { return e && (e.date || e.start_date); }
  function endOf(e) {
    var s = startOf(e);
    var en = e && (e.endDate || e.end_date);
    return (isIso(en) && isIso(s) && en > s) ? en : s;
  }

  var CLOCK_G = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b/ig;

  function nextDay(iso) { return addDays(iso, 1); }

  // Minutes after midnight for every 12-hour clock time in a time string, in order.
  function clockTimes(t) {
    var out = [], m;
    if (typeof t !== "string") return out;
    CLOCK_G.lastIndex = 0;
    while ((m = CLOCK_G.exec(t)) !== null) {
      var h = parseInt(m[1], 10) % 12;
      if (m[3].toLowerCase() === "p") h += 12;
      out.push(h * 60 + (m[2] ? parseInt(m[2], 10) : 0));
    }
    return out;
  }

  // One unclassified night that crosses midnight: end_date is exactly the next
  // day, the row is not all-day, and its stated hours are a range whose END
  // clock time is earlier than its START ("10:00 PM - 2:00 AM", or "(next
  // day)"). Same-shape rows without that evidence (a Fri-Sat festival with a
  // start time, a start time alone) are NOT assumed overnight. This is the
  // documented `single` shape applied to rows nobody classified yet, so late-
  // night RA / POSH listings keep their date-specific listing.
  function isOvernightNight(e) {
    var s = startOf(e), en = e && (e.endDate || e.end_date);
    if (!isIso(s) || !isIso(en) || en !== nextDay(s)) return false;
    if (e.isAllDay || e.is_all_day) return false;
    var t = e.time || e.time_display;
    var c = clockTimes(t);
    return c.length >= 2 && c[c.length - 1] < c[0];
  }

  // Display time: an aggregator end of "11:59 PM" is a placeholder, not a real end (DQ sweep 2026-10-19, 245 rows).
  // Treat it as unknown and show the start only; with no end, calendar exports use the existing 2-hour default.
  // Only a trailing "11:59 PM" after a real start clock time is dropped; "11:59 PM" alone and every other range stay as stored.
  function displayTime(t) {
    if (typeof t !== "string") return t;
    var m = t.match(/^(.*?\S)\s*(?:[\u2013\u2014-]|\bto\b|\buntil\b)\s*11:59\s*PM\s*$/i);
    if (m && /\d\s*(?:AM|PM)|\bnoon\b/i.test(m[1])) return m[1];
    return t;
  }

  function isMultiDay(e) {
    var s = startOf(e);
    return isIso(s) && endOf(e) > s;
  }

  // "confirmed": attendable exactly on explicitDates(e); "ongoing": every day
  // of start..end (classified continuous); "unverified": a multiday range
  // whose attendable days are not known. A single-date row is "confirmed".
  function scheduleState(e) {
    var sem = semanticsOf(e);
    if (sem === "single") return "confirmed";
    if (sem === "continuous") return "ongoing";
    if (sem === "recurring") return occurrenceList(e).length ? "confirmed" : "unverified";
    if (!isMultiDay(e)) return "confirmed";
    return isOvernightNight(e) ? "confirmed" : "unverified";
  }

  // The explicit dates an event is active on, or null when its activity is a
  // plain start..end range (continuous). A schedule-unverified row has no
  // attendable date: [].
  function explicitDates(e) {
    var st = scheduleState(e);
    if (st === "ongoing") return null;
    if (st === "unverified") return [];
    if (semanticsOf(e) === "recurring") return occurrenceList(e);
    var s = startOf(e);
    return isIso(s) ? [s] : [];
  }

  // { start, end, dates|null, semantics|null }: the shape every consumer needs.
  function bounds(e) {
    var dates = explicitDates(e);
    if (dates) return { start: dates[0] || startOf(e), end: dates.length ? dates[dates.length - 1] : endOf(e), dates: dates, semantics: semanticsOf(e) };
    return { start: startOf(e), end: endOf(e), dates: null, semantics: semanticsOf(e) };
  }

  function addDays(iso, n) {
    var d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // The ISO dates an event is listed under. floorIso: the first day the page
  // shows. A long-running multi-day event is listed from there instead of
  // from its long-past start, so the 60-day cap is never spent on days the
  // page does not show (same behaviour index.html had).
  function expand(e, floorIso) {
    var dates = explicitDates(e);
    if (dates) return floorIso ? dates.filter(function (d) { return d >= floorIso; }).slice(0, MAX_SPAN_DAYS) : dates.slice(0, MAX_SPAN_DAYS);
    var start = startOf(e), end = endOf(e);
    if (!isIso(start)) return [];
    if (end <= start) return [start];
    var first = (floorIso && floorIso > start && floorIso <= end) ? floorIso : start;
    var out = [];
    var cur = first;
    while (cur <= end && out.length < MAX_SPAN_DAYS) { out.push(cur); cur = addDays(cur, 1); }
    return out;
  }

  // Is the event happening on this ISO date? (Uncapped: the cap only bounds
  // how many days a list page enumerates.)
  function isActiveOn(e, iso) {
    var dates = explicitDates(e);
    if (dates) return dates.indexOf(iso) !== -1;
    var start = startOf(e);
    return isIso(start) && iso >= start && iso <= endOf(e);
  }

  // What may be said about this event on a selected date (shape shared with Platform's #142):
  //   "confirmed" / "ongoing"  the schedule is verified and the event is active that day
  //   "unverified"  the stored range covers the day but its schedule is unverified: a page may
  //                 offer it in a separate "Dates not confirmed" browse, never as available
  //   null          not on that date
  function availabilityOn(e, iso) {
    if (isActiveOn(e, iso)) return scheduleState(e) === "ongoing" ? "ongoing" : "confirmed";
    if (scheduleState(e) === "unverified") {
      var start = startOf(e);
      if (isIso(start) && iso >= start && iso <= endOf(e)) return "unverified";
    }
    return null;
  }

  // Why a person should classify this row, or null. Never a reason to remove
  // it: ambiguity is routed to review, not deleted.
  //   unclassified-multiday-clock-time: legacy range that also states a clock
  //     time; may be a nightly run, a series, or one continuous thing
  //   recurring-without-dates: marked recurring but no occurrence_dates
//   occurrence-outside-range: an occurrence date falls outside start..end; it
//     is still listed (evidence wins) but start/end should be corrected
  function reviewReason(e) {
    var sem = semanticsOf(e);
    var b = bounds(e);
    var multi = isIso(b.start) && isIso(b.end) && b.end > b.start;
    if (sem === "recurring" && !(b.dates && b.dates.length)) return "recurring-without-dates";
    // Explicit dates are the evidence and are always listed; but start/end drive
    // which rows the pages load, so a date outside them is an inconsistency a person fixes.
    if (sem === "recurring" && b.dates) {
      var rs = startOf(e), re = endOf(e);
      if (isIso(rs) && b.dates.some(function (d) { return d < rs || d > re; })) return "occurrence-outside-range";
    }
    if (scheduleState(e) === "unverified") {
      if (sem === null && !e.isAllDay && !e.is_all_day && !!(e.time || e.time_display)) return "unclassified-multiday-clock-time";
      return "unverified-multiday-schedule";
    }
    return null;
  }

  var EventDates = Object.freeze({
    MAX_SPAN_DAYS: MAX_SPAN_DAYS,
    semanticsOf: semanticsOf,
    scheduleState: scheduleState,
    bounds: bounds,
    expand: expand,
    isActiveOn: isActiveOn,
    availabilityOn: availabilityOn,
    reviewReason: reviewReason,
    displayTime: displayTime
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = EventDates;
  } else {
    (typeof window !== "undefined" ? window : globalThis).EventDates = EventDates;
  }
})();
