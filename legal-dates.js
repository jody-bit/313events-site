// legal-dates.js — single maintainable source of truth for every legal
// page's "Effective: / Last updated:" line (2026-10-01, Phase 1 Legal +
// Trust pass, item J: "Make these maintainable rather than hard-coding
// them in multiple places.").
//
// This project has no build step -- every HTML page is self-contained and
// duplicates its own small helpers by necessity (see radar.html's own
// header comment on this). A shared *static* JS file referenced by a
// plain <script src> tag is not a deviation from that -- it's the same
// mechanism already used for shared binary assets (assets/wordmark.svg,
// the favicon set, etc.), just for a few lines of text instead of an
// image. Updating a legal page's date means editing ONE line here, not
// five scattered hardcoded strings.
//
// Usage, from inside a legal page's own <body>:
//   <script src="/legal-dates.js"></script>
//   <p id="legalDates"></p>
//   <script>renderLegalDates('legalDates');</script>

const LEGAL_PAGE_DATES = {
  "terms.html": { effective: "2026-10-01", lastUpdated: "2026-10-01" },
  "privacy.html": { effective: "2026-10-01", lastUpdated: "2026-10-01" },
  "copyright.html": { effective: "2026-10-01", lastUpdated: "2026-10-01" },
  "editorial-policy.html": { effective: "2026-10-01", lastUpdated: "2026-10-01" },
  "accessibility.html": { effective: "2026-10-01", lastUpdated: "2026-10-01" },
};
const LEGAL_DATES_FALLBACK = { effective: "2026-10-01", lastUpdated: "2026-10-01" };

function renderLegalDates(elId) {
  // Works whether the page was reached by its real filename (terms.html)
  // or by one of the clean routes added in vercel.json (/terms) -- try
  // the filename first, then the clean path segment with .html appended.
  const seg = (location.pathname.split('/').filter(Boolean).pop() || 'index.html');
  const asFile = seg.endsWith('.html') ? seg : `${seg}.html`;
  const entry = LEGAL_PAGE_DATES[asFile] || LEGAL_DATES_FALLBACK;
  const el = document.getElementById(elId || 'legalDates');
  if (!el) return;
  const fmt = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  el.textContent = `Effective: ${fmt(entry.effective)}   ·   Last updated: ${fmt(entry.lastUpdated)}`;
}
