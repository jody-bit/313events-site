// api/_lib/schedule-evidence.js — Stage 1 of the schedule-evidence pass (EI enrichment backlog, owner approval 2026-10-18).
//
// WHY: an unreadable organizer calendar (robots-blocked site, dynamically rendered booking calendar) ended automated
// research at "a person must read it". This module turns text from allow-listed pages into field-level schedule
// evidence so the pass can try the next source before anything becomes manual work.
//
// WHAT IT IS: pure functions. No network, no database, no clock except the explicit `year` argument. It extracts
// values with the exact quoted text they came from, and compares candidates with what is already stored. It never
// invents a value: no quote, no value.
//
// RULES (owner direction 2026-10-18)
//   - A published recurring operating schedule is valid evidence; individual dates are not required.
//   - Advertised weekly hours are never recorded as confirmed dates.
//   - Explicit closures ("dark" / "closed" dates) override recurring hours.
//   - A stronger stored value is kept: OWNER-CORRECTION first, then verified/manual, then source tier.
//   - Two sources that disagree on a field make one conflict naming both quotes; neither is chosen.
//   - A blocked or failed page changes nothing (it is reported as blocked, never as "no schedule").
"use strict";

// The OWNER-CORRECTION reader lives in event-contract.js only once Platform's #210 merges (origin/main does not have it
// yet). Use it when present; otherwise fall back to the same reader (same marker, same line shape) so this module
// works on today's main. When #210 is on main the fallback is never used; delete it then.
const contract = require("./event-contract");
function fallbackOwnerCorrectedFields(note) {
  const out = new Set();
  if (typeof note !== "string" || !note.includes("OWNER-CORRECTION")) return out;
  for (const m of note.matchAll(/^OWNER-CORRECTION\s+\S+\s+\S+\s+fields=([a-z_,]+)/gm)) for (const f of m[1].split(",")) out.add(f);
  return out;
}
const ownerCorrectedFields = typeof contract.ownerCorrectedFields === "function" ? contract.ownerCorrectedFields : fallbackOwnerCorrectedFields;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Source tiers, strongest last. The directory tier covers aggregator listings the owner may supply.
const TIER_RANK = Object.freeze({ directory: 1, media: 2, city_or_venue: 3, official: 4 });
// Rank of a stored/candidate value: OWNER-CORRECTION > verified or manual > source tier.
const RANK_OWNER_CORRECTION = 100;
const RANK_VERIFIED = 80;

function monthNum(s) { return MONTHS[String(s).toLowerCase().replace(/\.$/, "").slice(0, s.toLowerCase().startsWith("sept") ? 4 : 3)] || null; }
function iso(year, month, day) {
  if (!month || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 ? d.toISOString().slice(0, 10) : null;
}

// -> { start, end, quote } | null. Needs both ends in one "A to B" range with explicit months.
function extractSeasonRange(text, year) {
  const re = new RegExp(`${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:,?\\s*${year})?\\s*(?:-|–|—|to|through|until)\\s*${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, "i");
  const m = re.exec(String(text || ""));
  if (m) {
    const start = iso(year, monthNum(m[1]), Number(m[2])), end = iso(year, monthNum(m[3]), Number(m[4]));
    return start && end && start <= end ? { start, end, quote: m[0] } : null;
  }
  return extractSplitSeason(text, year);
}

// Opening and closing dates in separate sentences ("opens Friday, Sept. 18 ... runs every day through Nov. 7").
// Needs an explicit opening phrase and an explicit closing phrase within 400 characters, both with month and day.
// The closing date is taken from the LAST closing phrase in that window (a "from Oct. 1 ... through Nov. 7" detail
// does not replace the opening date). Quote is the joined text span, so nothing is stated without its words.
function extractSplitSeason(text, year) {
  const t = String(text || "");
  const open = new RegExp(`\\b(?:opens?|opening night|begins?|starts?)\\b[^.\\n]{0,40}?${MONTH_RE}\\s+(\\d{1,2})`, "i").exec(t);
  if (!open) return null;
  const from = open.index + open[0].length;
  const window = t.slice(from, from + 400);
  const close = [...window.matchAll(new RegExp(`\\b(?:through|until|to|closes?|ends?)\\b[^.\\n]{0,25}?${MONTH_RE}\\s+(\\d{1,2})`, "gi"))];
  if (!close.length) return null;
  const last = close[close.length - 1];
  const start = iso(year, monthNum(open[1]), Number(open[2])), end = iso(year, monthNum(last[1]), Number(last[2]));
  if (!start || !end || start > end) return null;
  return { start, end, quote: t.slice(open.index, from + last.index + last[0].length) };
}

// ---- clock times ----------------------------------------------------------------------------------------------
// "7:30 PM", "7pm", "7 p.m.", "noon", "midnight" -> minutes since 00:00, or null. A bare hour without a meridiem is
// returned as { hour, minute, ap: null } so a range can inherit the closing meridiem ("7-11 PM").
const TIME_PART = "(?:noon|midnight|(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?)";
function parseClock(word, h, m, ap) {
  const w = String(word || "").toLowerCase();
  if (w === "noon") return { min: 12 * 60, ap: "PM", named: true };
  if (w === "midnight") return { min: 0, ap: "AM", named: true };
  const hh = Number(h), mm = m ? Number(m) : 0;
  if (!(hh >= 1 && hh <= 12) || mm > 59) return null;
  return { hour: hh, minute: mm, ap: ap ? (/^a/i.test(ap) ? "AM" : "PM") : null };
}
function toMin(c) { return c.min !== undefined ? c.min : (c.hour % 12) * 60 + c.minute + (c.ap === "PM" ? 720 : 0); }
function fmtMin(min) {
  const h24 = Math.floor(min / 60) % 24, m = min % 60, ap = h24 >= 12 ? "PM" : "AM", h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}
// open/close clocks -> { hours: "7:00 PM-12:00 AM", overnight } | null. A bare opening hour inherits the closing meridiem
// ("7-11 PM"); an ambiguous inheritance (close PM but opening hour larger, "11-2 PM") is refused, never guessed.
function resolveRange(o, c) {
  if (!o || !c) return null;
  if (c.ap === null) return null;                      // a closing time with no meridiem is not evidence
  let open = { ...o };
  if (open.ap === null && open.min === undefined) {
    open.ap = c.ap;
    if (c.min === undefined && toMin(open) >= toMin(c) && c.ap === "AM" && open.hour !== 12) open.ap = "PM";   // "11-2 AM" -> 11 PM to 2 AM
    else if (c.min === undefined && toMin(open) >= toMin(c) && c.ap === "PM") return null;                      // "11-2 PM": ambiguous
  }
  const om = toMin(open), cm = toMin(c);
  if (om === cm) return null;
  return { hours: `${fmtMin(om)}-${fmtMin(cm)}`, overnight: cm < om };
}

const DAY_ABBR = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_WORD = "(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tues|Tue|Wed|Thurs|Thur|Thu|Fri|Sat)s?\\b\\.?";
const DAY_ANY = `(?:${DAY_WORD})`;
const GROUP_WORD = "(?:weekends?|weekdays?|nightly|daily|every\\s+(?:day|night|evening))";
const SPEC_RE = new RegExp(`\\b(?:${GROUP_WORD}|${DAY_ANY}(?:\\s*(?:-|–|—|to|through|thru)\\s*${DAY_ANY}|(?:\\s*(?:,|&|and|\\+)\\s*${DAY_ANY})+)?)`, "gi");
const SEP = "\\s*(?:-|–|—|to|until|till)\\s*";
const RANGE_RE = new RegExp(`^[^0-9A-Za-z]{0,3}(?:(?:from|open|opens|at|hours)\\s+){0,2}[^0-9A-Za-z]{0,3}${TIME_PART}${SEP}${TIME_PART}`, "i");
function dayIdx(w) { return DAY_ABBR[String(w).slice(0, 3).toLowerCase()]; }
function expandSpec(spec) {
  const t = spec.toLowerCase();
  if (/weekends?/.test(t)) return [6, 0];                 // weekend = Saturday and Sunday (no Friday)
  if (/weekdays?/.test(t)) return [1, 2, 3, 4, 5];
  if (/nightly|daily|every/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  const names = [...spec.matchAll(new RegExp(DAY_ANY, "gi"))].map((m) => dayIdx(m[0]));
  if (!names.length || names.some((d) => d === undefined)) return [];
  if (/(?:-|–|—|\bto\b|through|thru)/i.test(spec) && names.length === 2) {
    const out = []; for (let d = names[0], n = 0; n < 7; n++, d = (d + 1) % 7) { out.push(d); if (d === names[1]) break; } return out;
  }
  return [...new Set(names)];
}

// Weekly hours from lines/sentences such as "Monday – Thursday: 7:30 PM – 10:30 PM", "Fri & Sat 7pm-midnight",
// "Fridays and Saturdays, 7 p.m. to 11 p.m.", "weekends from 6-10 PM", "nightly 7 PM to 2 AM".
// -> { byDay: {0..6: "7:30 PM-10:30 PM"}, overnight: {day: true}, quotes } | null. Days not stated are absent, never filled.
// A day given two different hours inside one page is dropped from byDay and reported in `ambiguous`.
function extractWeeklyHours(text) {
  const t = String(text || "");
  const byDay = {}, overnight = {}, quotes = [], seen = {}, ambiguous = [];
  for (const m of t.matchAll(SPEC_RE)) {
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 60);
    const r = RANGE_RE.exec(after);
    if (!r) continue;
    // TIME_PART groups: (1,2,3) open, (4,5,6) close; "noon"/"midnight" words are matched separately
    const openNamed = /^(?:[^0-9A-Za-z]|from|open|opens|at|hours)*\b(noon|midnight)\b/i.exec(after);
    const closeNamed = new RegExp(`${SEP}(noon|midnight)\\b`, "i").exec(after);
    const oc = openNamed ? parseClock(openNamed[1]) : parseClock(null, r[1], r[2], r[3]);
    const cc = closeNamed ? parseClock(closeNamed[1]) : parseClock(null, r[4], r[5], r[6]);
    const res = resolveRange(oc, cc);
    if (!res) continue;
    const days = expandSpec(m[0]);
    if (!days.length) continue;
    for (const d of days) {
      if (seen[d] !== undefined && seen[d] !== res.hours) { ambiguous.push(d); delete byDay[d]; delete overnight[d]; continue; }
      if (ambiguous.includes(d)) continue;
      seen[d] = res.hours; byDay[d] = res.hours; if (res.overnight) overnight[d] = true;
    }
    quotes.push((m[0] + after.slice(0, r.index + r[0].length)).trim());
  }
  return quotes.length && Object.keys(byDay).length ? { byDay, overnight, quotes, ambiguous } : null;
}

// Closed / dark dates. Looks only inside a sentence that contains "dark" or "closed" and lists dates after it.
// Accepts "Oct. 5-6", "Oct. 12", "Nov. 2-5". -> { dates: ["2026-10-05", ...], quote } | null
function extractClosedDates(text, year) {
  const sentences = String(text || "").split(/(?<=[.!?])\s+(?=[A-Z])|\n+/);
  for (const s of sentences) {
    const k = /\b(dark|closed|except(?:ing)?|not open|no (?:shows|performances|tours|events))\b/i.exec(s);
    if (!k) continue;
    const tail = s.slice(k.index + k[0].length);
    const dates = new Set();
    const re = new RegExp(`${MONTH_RE}\\s+(\\d{1,2})(?:\\s*(?:-|–|—)\\s*(\\d{1,2}))?`, "gi");
    for (const m of tail.matchAll(re)) {
      const mon = monthNum(m[1]); const d1 = Number(m[2]); const d2 = m[3] ? Number(m[3]) : d1;
      if (d2 < d1) continue;
      for (let d = d1; d <= d2; d++) { const v = iso(year, mon, d); if (v) dates.add(v); }
    }
    if (dates.size) return { dates: [...dates].sort(), quote: s.trim() };
  }
  return null;
}

// "weekends only" / "every day from <date>" qualifiers are returned as quotes only; they are not turned into dates.
function extractOperatingNotes(text) {
  const out = [];
  for (const re of [/weekends? only[^.]*\./i, /every day[^.]*\./i, /daily[^.]*\./i]) { const m = re.exec(String(text || "")); if (m) out.push(m[0].trim()); }
  return out;
}

// page: { url, tier, retrieved_at, text, blocked?: "robots"|"robots_unavailable"|"fetch_failed"|"dynamic" }
// -> { url, tier, retrieved_at, blocked, season, weekly_hours, closed_dates, notes }   (fields null when no quote supports them)
function extractFromPage(page, year) {
  const p = page || {};
  const base = { url: p.url || null, tier: p.tier || null, retrieved_at: p.retrieved_at || null, blocked: p.blocked || null };
  if (p.blocked || typeof p.text !== "string") return { ...base, season: null, weekly_hours: null, closed_dates: null, notes: [] };
  return { ...base, season: extractSeasonRange(p.text, year), weekly_hours: extractWeeklyHours(p.text), closed_dates: extractClosedDates(p.text, year), notes: extractOperatingNotes(p.text) };
}

// Rank of a stored value. stored = { rank_source: "owner_correction"|"verified"|"manual"|"tier", tier }.
function rankOf(v) {
  if (!v) return 0;
  if (v.rank_source === "owner_correction") return RANK_OWNER_CORRECTION;
  if (v.rank_source === "verified" || v.rank_source === "manual") return RANK_VERIFIED;
  return (TIER_RANK[v.tier] || 0) * 10;
}

// Does a stored internal_note lock this field (OWNER-CORRECTION line)? Reuses the shared reader.
function lockedByOwner(internalNote, field) { return ownerCorrectedFields(internalNote).has(field); }

// -> { keep: true, reason } when the stored value is at least as strong as the candidate, else { keep: false }.
function compareToStored(stored, candidate) {
  if (!stored || stored.value === null || stored.value === undefined) return { keep: false, reason: "no stored value" };
  const s = rankOf(stored), c = rankOf(candidate);
  return s >= c ? { keep: true, reason: `stored rank ${s} >= candidate rank ${c}` } : { keep: false, reason: `candidate rank ${c} > stored rank ${s}` };
}

// pages: extractFromPage results. stored: { season, weekly_hours, closed_dates } each { value, rank_source, tier } or null;
// internalNote: the row's internal_note (OWNER-CORRECTION lock check).
// -> { proposed: { field: { value, evidence: [{url,tier,retrieved_at,quote}], confidence } },
//      conflicts: [{ field, candidates: [{value,url,quote}] }], unsupported: [field], blocked: [{url,reason}], kept: [{field,reason}] }
function proposeSchedule({ pages, stored, internalNote }) {
  const out = { proposed: {}, conflicts: [], unsupported: [], blocked: [], kept: [] };
  const usable = [];
  for (const p of pages || []) { if (p.blocked) out.blocked.push({ url: p.url, reason: p.blocked }); else usable.push(p); }

  const fields = [
    ["season", (p) => p.season && { value: { start: p.season.start, end: p.season.end }, quote: p.season.quote }, "season"],
    ["weekly_hours", (p) => p.weekly_hours && { value: p.weekly_hours.byDay, overnight: p.weekly_hours.overnight, ambiguous: p.weekly_hours.ambiguous, quote: p.weekly_hours.quotes.join(" | ") }, "time_display"],
    ["closed_dates", (p) => p.closed_dates && { value: p.closed_dates.dates, quote: p.closed_dates.quote }, null],
  ];
  for (const [field, pick, lockField] of fields) {
    const cands = [];
    for (const p of usable) { const v = pick(p); if (v) cands.push({ ...v, url: p.url, tier: p.tier, retrieved_at: p.retrieved_at }); }
    if (field === "weekly_hours") for (const p of usable) if (p.weekly_hours && p.weekly_hours.ambiguous.length) out.conflicts.push({ field, days: p.weekly_hours.ambiguous, reason: "two different hours for one day on one page", candidates: [{ url: p.url, quote: p.weekly_hours.quotes.join(" | ") }] });
    if (!cands.length) { out.unsupported.push(field); continue; }
    if (lockField && lockedByOwner(internalNote, lockField)) { out.kept.push({ field, reason: "OWNER-CORRECTION lock" }); continue; }
    // closed dates from different pages are cumulative (a longer list is not a disagreement); season and hours must agree.
    let value, evidence = cands, agree = true, extra = {};
    if (field === "closed_dates") value = [...new Set(cands.flatMap((c) => c.value))].sort();
    else if (field === "weekly_hours") {
      // Partial pages merge per day (one page may give Fri/Sat, another the rest). A day with two different hours is a conflict.
      const perDay = {}, overnightDays = new Set();
      for (const c of cands) for (const [d, h] of Object.entries(c.value)) (perDay[d] = perDay[d] || new Map()).set(h, c);
      for (const c of cands) for (const d of Object.keys(c.overnight || {})) overnightDays.add(Number(d));
      const clash = Object.entries(perDay).filter(([, m]) => m.size > 1);
      if (clash.length) {
        agree = false;
        out.conflicts.push({ field, days: clash.map(([d]) => Number(d)), candidates: cands.map((c) => ({ value: c.value, url: c.url, quote: c.quote })) });
      } else {
        value = Object.fromEntries(Object.entries(perDay).map(([d, m]) => [d, [...m.keys()][0]]));
        extra = { overnight_days: [...overnightDays].sort() };
      }
    } else {
      const key = (c) => JSON.stringify(c.value);
      const top = Math.max(...cands.map((c) => TIER_RANK[c.tier] || 0));
      const strongest = cands.filter((c) => (TIER_RANK[c.tier] || 0) === top);
      const distinct = new Set(cands.map(key));
      if (distinct.size > 1) {
        // a lower tier disagreeing with a higher tier is still a conflict: nothing is auto-resolved by rank alone
        agree = false;
        out.conflicts.push({ field, candidates: cands.map((c) => ({ value: c.value, url: c.url, quote: c.quote })) });
      } else value = strongest[0].value;
    }
    if (!agree) continue;
    const best = Math.max(...cands.map((c) => TIER_RANK[c.tier] || 0));
    const cmp = compareToStored(stored && stored[field], { tier: Object.keys(TIER_RANK).find((k) => TIER_RANK[k] === best) });
    if (cmp.keep) { out.kept.push({ field, reason: cmp.reason }); continue; }
    out.proposed[field] = {
      value,
      evidence: evidence.map((c) => ({ url: c.url, tier: c.tier, retrieved_at: c.retrieved_at, quote: c.quote })),
      confidence: new Set(cands.map((c) => c.url)).size >= 3 ? "high" : new Set(cands.map((c) => c.url)).size === 2 ? "medium-high" : "medium",
      ...extra,
      kind: field === "weekly_hours" ? "advertised_hours" : field === "season" ? "advertised_season" : "listed_closures",
    };
  }
  return out;
}

// "7:00 PM-12:00 AM" -> true when the closing time is at or before the opening time (it ends after midnight).
function isOvernight(hours) {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)-(\d{1,2}):(\d{2}) (AM|PM)$/.exec(String(hours || ""));
  if (!m) return false;
  const a = parseClock(null, m[1], m[2], m[3]), b = parseClock(null, m[4], m[5], m[6]);
  return !!(a && b) && toMin(b) < toMin(a);
}

// Expands a proposal into a day list: recurring weekly hours inside the season, minus explicit closures.
// Closures always win. A day with no hours in the weekly table is left out, never defaulted.
function buildCalendar({ season, weeklyHours, closedDates, from }) {
  if (!season || !weeklyHours) return [];
  const closed = new Set(closedDates || []);
  const out = [];
  const startMs = Date.parse((from && from > season.start ? from : season.start) + "T00:00:00Z");
  const endMs = Date.parse(season.end + "T00:00:00Z");
  for (let t = startMs; t <= endMs; t += 86400000) {
    const d = new Date(t), day = d.toISOString().slice(0, 10);
    if (closed.has(day)) { out.push({ date: day, open: false, hours: null, dark: true }); continue; }
    const h = weeklyHours[d.getUTCDay()];
    if (h) out.push({ date: day, open: true, hours: h, dark: false, overnight: isOvernight(h) });
  }
  return out;
}

// Maps a proposeSchedule() result to the private `schedule` object seasonal entries carry (Experience, PR #214):
// { season:{start,end,timezone}, weeklyHours:{mon..sun}, darkDays:[ISO], explicitClosuresOverrideHours, provenance:{field:{confidence,sources,retrievedAt}} }.
// Only fields with evidence are included; an unsupported field is omitted, never defaulted. Confidence is the machine label
// (high / medium-high / medium); the owner-worded labels on an existing entry are not overwritten by this function.
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function toEntrySchedule(proposal, { timezone } = {}) {
  const p = (proposal && proposal.proposed) || {};
  const out = { explicitClosuresOverrideHours: true, provenance: {} };
  const prov = (f) => ({ confidence: p[f].confidence, sources: [...new Set(p[f].evidence.map((e) => e.url))], retrievedAt: p[f].evidence.map((e) => e.retrieved_at).filter(Boolean).sort().pop() || null });
  if (p.season) { out.season = { start: p.season.value.start, end: p.season.value.end, timezone: timezone || "America/Detroit" }; out.provenance.season = prov("season"); }
  if (p.weekly_hours) {
    out.weeklyHours = {};
    for (let i = 0; i < 7; i++) if (p.weekly_hours.value[i]) out.weeklyHours[DAY_KEYS[i]] = p.weekly_hours.value[i];
    out.provenance.weeklyHours = prov("weekly_hours");
  }
  if (p.closed_dates) { out.darkDays = p.closed_dates.value.slice(); out.provenance.darkDays = prov("closed_dates"); }
  return out;
}

module.exports = {
  toEntrySchedule, isOvernight, fallbackOwnerCorrectedFields,
  TIER_RANK, RANK_OWNER_CORRECTION, RANK_VERIFIED,
  extractSeasonRange, extractWeeklyHours, extractClosedDates, extractOperatingNotes, extractFromPage,
  rankOf, lockedByOwner, compareToStored, proposeSchedule, buildCalendar,
};
