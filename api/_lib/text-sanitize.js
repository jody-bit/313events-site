// api/_lib/text-sanitize.js — N7 / #224: one text cleaner for event fields at ingestion. Pure functions, no I/O.
//
// Removes what a feed's markup leaks into plain-text fields:
//   - stray CSS / RTF-export rule blocks, e.g. ".cf0{font-family:Segoe UI;font-size:10.5pt;} James R. Hartman Theatre"
//     (City of Livonia, Schoolcraft row 303436bd) becomes "James R. Hartman Theatre";
//   - HTML tags (<p>, <br/>, <a href>, comments) and <script>/<style> blocks;
//   - HTML entities, decoded ONCE (named: the common set below; numeric: &#8217; &#x2019;).
// It does NOT change case (ALL-CAPS titles are a separate, display-time decision), does not touch URLs, and never invents text:
// a field that would end up empty is returned unchanged so no value is lost.
// Owner-corrected text is protected by protectOwnerCorrections in event-upsert.js, which runs after this and restores those fields.
"use strict";

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", hellip: "…", copy: "©", reg: "®", trade: "™", eacute: "é", egrave: "è",
  aacute: "á", ntilde: "ñ", ouml: "ö", uuml: "ü", auml: "ä", ccedil: "ç", middot: "·", bull: "•",
};

function decodeEntitiesOnce(s) {
  return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,9}));/g, (whole, dec, hex, name) => {
    if (name) return Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : whole;
    const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    if (!(cp > 0 && cp <= 0x10FFFF) || (cp >= 0xD800 && cp <= 0xDFFF)) return whole;
    return String.fromCodePoint(cp);
  });
}

// A CSS-looking rule block: optional selector, then { prop:value; ... }. Requires a "prop:value" inside so prose braces survive.
const CSS_BLOCK = /(?:[.#]?[A-Za-z_][\w-]*\s*)?\{\s*[A-Za-z-]+\s*:[^{}]*\}/g;

function sanitizeText(value) {
  if (typeof value !== "string" || !value) return value;
  let s = value;
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<\/?[A-Za-z][^<>]*>/g, " ");
  s = s.replace(CSS_BLOCK, " ");
  s = decodeEntitiesOnce(s);
  s = s.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s === "" ? value : s;
}

const TEXT_FIELDS = ["title", "description", "venue_name_raw", "venue_address_raw", "venue_city_raw"];

// Returns a copy of the row with its text fields cleaned; fields that are absent stay absent.
function sanitizeRowText(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  let out = row;
  for (const f of TEXT_FIELDS) {
    if (typeof row[f] !== "string") continue;
    const cleaned = sanitizeText(row[f]);
    if (cleaned !== row[f]) { if (out === row) out = Object.assign({}, row); out[f] = cleaned; }
  }
  return out;
}

module.exports = { sanitizeText, sanitizeRowText, decodeEntitiesOnce, TEXT_FIELDS };
