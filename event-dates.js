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
//   null / unknown   LEGACY: every day of start..end, exactly as before. The
//                    event is not yet classified. It is never dropped; it is
//                    surfaced by reviewReason() so a person classifies it.
//
// Opening receptions and special programming are NOT a fourth value. A
// reception is its own `single` event; the exhibition it opens is a
// `continuous` event. Nothing here links them; presentation may.
//
// A recurring row with no usable occurrence_dates falls back to the legacy
// range (coverage preserved) and is reported by reviewReason().
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
    return null;
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

  // Why a person should classify this row, or null. Never a reason to remove
  // it: ambiguity is routed to review, not deleted.
  //   unclassified-multiday-clock-time: legacy range that also states a clock
  //     time; may be a nightly run, a series, or one continuous thing
  //   recurring-without-dates: marked recurring but no occurrence_dates
  function reviewReason(e) {
    var sem = semanticsOf(e);
    var b = bounds(e);
    var multi = isIso(b.start) && isIso(b.end) && b.end > b.start;
    if (sem === "recurring" && !b.dates) return "recurring-without-dates";
    if (sem === null && multi && !e.isAllDay && !e.is_all_day && !!(e.time || e.time_display)) return "unclassified-multiday-clock-time";
    return null;
  }

  var EventDates = Object.freeze({
    MAX_SPAN_DAYS: MAX_SPAN_DAYS,
    semanticsOf: semanticsOf,
    bounds: bounds,
    expand: expand,
    isActiveOn: isActiveOn,
    reviewReason: reviewReason
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = EventDates;
  } else {
    (typeof window !== "undefined" ? window : globalThis).EventDates = EventDates;
  }
})();
