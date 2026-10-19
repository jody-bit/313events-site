// Title-case proposal for ALL-CAPS event titles. Pure function, shadow mode:
// nothing calls it yet (N7 / #224 owns wiring it into a shared sanitizer).
//
// Conservative by design. A title is only touched when ALL of these hold:
//   - every letter is uppercase, and there are at least two words (a single
//     all-caps word is an artist or brand styling: KREWELLA, AYYBO, SHADOWPLAY);
//   - it is not on a source-specific keep-as-is list (see KEEP_SOURCES).
// Inside a touched title: acronyms, roman numerals and branded words stay
// upper-case; small words go lower-case (except first/last and after a colon);
// artist stylings with symbols (HE$H) keep their original casing.
"use strict";

// Stay upper-case. Extend by evidence, one row at a time.
const KEEP_UPPER = new Set([
  "DJ", "DJS", "NYE", "USA", "UK", "US", "TV", "VIP", "BMR", "BIA", "DDA", "LGBTQ", "LGBTQ+", "BLUF", "HALO", "DFEST", "BGSU",
  "MC", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "BBQ", "DIY", "AMC", "NFL", "NBA", "MLB", "NHL", "PTA", "UAW",
  "KATSEYE", "DPW", "DTD", "WSO", "ABC", "ATM", "EDM", "EP", "LP", "LA", "NYC", "DC", "OH", "MI", "ID", "OK", "AM", "PM", "TBA", "TBD", "21+", "18+",
]);
// Lower-case unless first, last, or right after ":" / "-" / "//".
const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "vs", "vs.", "w/", "with", "x"]);
// Sources whose all-caps titles are the organiser's own branding; never rewritten.
const KEEP_SOURCES = new Set(["HALO Detroit"]);

function isAllCaps(s) {
  const letters = s.replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function caseWord(w, first, last, afterBreak) {
  const bare = w.replace(/^[^\p{L}\p{N}+$&]+|[^\p{L}\p{N}+$&.]+$/gu, "");
  if (!bare) return w;
  // A slash joins two names or a "w/" lead-in ("AFTER DARK/AFRO", "W/ALAINA"): case each side, capitalise after the slash.
  if (bare.includes("/")) {
    const parts = bare.split("/");
    const done = parts.map((part, i) => {
      if (!part) return part;
      if (i === 0 && part.toUpperCase() === "W" && parts.length > 1) return "w";
      return caseWord(part, first && i === 0, last && i === parts.length - 1, i > 0);
    }).join("/");
    return w.replace(bare, done);
  }
  if (/[$@#0-9]/.test(bare) && !/^\d+(st|nd|rd|th)?$/i.test(bare)) return w;      // HE$H, 21+, 313: leave as typed
  if (/\p{L}&\p{L}/u.test(bare)) return w;                                          // R&B, Q&A: internal ampersand, as typed
  if (/^(?:\p{L}\.){2,}\p{L}?\.?$/u.test(bare)) return w;                           // O.A.R., U.S.A.: dotted initials, as typed
  if (KEEP_UPPER.has(bare)) return w;
  if (/^[A-Z]\.?$/.test(bare) && !first) return w;                                   // initials
  if (bare.length >= 2 && /^\p{L}+$/u.test(bare) && !/[aeiouyà-öø-ý]/iu.test(bare)) return w;  // no vowels (SPKR, BRNCH): a stylised name, as typed
  const low = bare.toLowerCase();
  if (!first && !last && !afterBreak && SMALL.has(low)) return w.replace(bare, low);
  const cased = bare.split(/(['’-])/).map((p) => (/^['’-]$/.test(p) ? p : (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))).join("")
    .replace(/(['’])S\b/g, "$1s");                                                   // OCTOBER'S -> October's
  return w.replace(bare, cased);
}

// Returns { title, changed, reason }. Never throws; non-strings are returned as is.
function proposeTitleCase(title, ctx = {}) {
  if (typeof title !== "string") return { title, changed: false, reason: "not_a_string" };
  const t = title.trim();
  if (!isAllCaps(t)) return { title, changed: false, reason: "not_all_caps" };
  if (ctx.source && KEEP_SOURCES.has(ctx.source)) return { title, changed: false, reason: "source_keeps_caps" };
  const words = t.split(/\s+/);
  if (words.length < 2) return { title, changed: false, reason: "single_word_styling" };
  const out = words.map((w, i) => {
    const prev = i > 0 ? words[i - 1] : "";
    const afterBreak = /[:\-–—]$/.test(prev) || prev === "//" || prev === "•" || prev === "|";
    return caseWord(w, i === 0, i === words.length - 1, afterBreak);
  }).join(" ");
  return { title: out, changed: out !== t, reason: out !== t ? "all_caps_to_title_case" : "unchanged" };
}

module.exports = { proposeTitleCase, isAllCaps, KEEP_UPPER, SMALL, KEEP_SOURCES };
