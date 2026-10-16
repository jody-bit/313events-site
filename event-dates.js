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
//   null / unknown   UNVERIFIED SCHEDULE (owner decision 2026-10-16: an unknown
//                    schedule never means daily availability). A multi-day
//                    range with no verified occurrences is NOT active on any
//                    selected date; availabilityOn() reports it as "unverified"
//                    inside its range so a page can offer it in a clearly
//                    separate "dates unconfirmed" browse. It is never dropped
//                    and its range is preserved; reviewReason() routes it to
//                    review. Exception, so overnight listings keep working: a
//                    one-night span (end = start + 1) whose clock time crosses
//                    midnight is one night, active on its start date only.
//
// Opening receptions and special programming are NOT a fourth value. A
// reception is its own `single` event; the exhibition it opens is a
// `continuous` event. Nothing here links them; presentation may.
//
// A recurring row with no usable occurrence_dates is unverified (same as null)
// and is reported by reviewReason().
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

  // The explicit dates an event is active on, or null when its activity is a
  // plain start..end range (continuous or legacy).
  function explicitDates(e) {
    var sem = semanticsOf(e);
    if (sem === "single") { var s = startOf(e); return isIso(s) ? [s] : []; }
    if (sem === "recurring") { var list = occurrenceList(e); if (list.length) return list; }
    if (sem === null && isOvernightNight(e)) { var o = startOf(e); return isIso(o) ? [o] : []; }
    return null;
  }

  // First clock time in a display string -> minutes after midnight, or null.
  function clockMinutes(str, from) {
    var re = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/ig, m, n = 0;
    while ((m = re.exec(str || ""))) {
      if (n++ === (from || 0)) {
        var h = parseInt(m[1], 10) % 12 + (m[3].toLowerCase() === "p" ? 12 : 0);
        return h * 60 + (m[2] ? parseInt(m[2], 10) : 0);
      }
    }
    return null;
  }

  // One-night listing: end = start + 1, not all-day, and its clock time runs past midnight
  // (an end time earlier than the start, or a single evening start with the end the next day).
  function isOvernightNight(e) {
    var s = startOf(e), en = e && (e.endDate || e.end_date);
    if (!isIso(s) || !isIso(en) || addDays(s, 1) !== en) return false;
    if (e.isAllDay || e.is_all_day) return false;
    var t = e.time || e.time_display || "";
    var a = clockMinutes(t, 0), b = clockMinutes(t, 1);
    if (a === null) return false;
    if (b !== null) return b < a;
    return a >= 17 * 60;
  }

  // "confirmed" | "ongoing" | "unverified": how far the stored schedule can be trusted (names agreed with
  // 02-experience.md section 6.1).
  //   confirmed   single; recurring with usable occurrence_dates; a one-night overnight listing; one date only
  //   ongoing     continuous (a person or evidence classified it as genuinely daily start..end)
  //   unverified  a multi-day range with no verified occurrences (null semantics, or recurring without dates)
  function scheduleState(e) {
    var s = startOf(e);
    if (!isIso(s)) return "unverified";
    if (semanticsOf(e) === "continuous") return endOf(e) > s ? "ongoing" : "confirmed";
    if (explicitDates(e)) return "confirmed";
    return endOf(e) > s ? "unverified" : "confirmed";
  }

  // { start, end, dates|null, semantics|null }: the shape every consumer needs.
  function bounds(e) {
    var dates = explicitDates(e);
    if (dates) return { start: dates[0] || startOf(e), end: dates[dates.length - 1] || startOf(e), dates: dates, semantics: semanticsOf(e) };
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
    if (semanticsOf(e) !== "continuous") return []; // unverified range: never expanded into daily dates
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
    if (!isIso(start)) return false;
    if (endOf(e) <= start) return iso === start;
    return semanticsOf(e) === "continuous" && iso >= start && iso <= endOf(e);
  }

  // What may be said about this event on a selected date:
  //   "confirmed" / "ongoing"  the schedule is verified and the event is active that day
  //   "unverified"  the event's stored range covers the day but its schedule is unverified: a
  //                 page may offer it in a separate "dates unconfirmed" browse, never as available
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
    if (sem === "recurring" && !b.dates) return "recurring-without-dates";
    // Explicit dates are the evidence and are always listed; but start/end drive
    // which rows the pages load, so a date outside them is an inconsistency a person fixes.
    if (sem === "recurring" && b.dates) {
      var rs = startOf(e), re = endOf(e);
      if (isIso(rs) && b.dates.some(function (d) { return d < rs || d > re; })) return "occurrence-outside-range";
    }
    if (sem === null && multi && !e.isAllDay && !e.is_all_day && !!(e.time || e.time_display) && !explicitDates(e)) return "unclassified-multiday-clock-time";
    if (multi && scheduleState(e) === "unverified" && sem === null) return "unverified-multiday-schedule";
    return null;
  }

  var EventDates = Object.freeze({
    MAX_SPAN_DAYS: MAX_SPAN_DAYS,
    semanticsOf: semanticsOf,
    bounds: bounds,
    expand: expand,
    isActiveOn: isActiveOn,
    availabilityOn: availabilityOn,
    scheduleState: scheduleState,
    reviewReason: reviewReason
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = EventDates;
  } else {
    (typeof window !== "undefined" ? window : globalThis).EventDates = EventDates;
  }
})();
