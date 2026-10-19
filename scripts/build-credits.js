#!/usr/bin/env node
// scripts/build-credits.js — generates photo-credits.html ("Photo Credits & Attributions") from data/photo-credits.json.
//   node scripts/build-credits.js           write photo-credits.html
//   node scripts/build-credits.js --check   exit 1 if photo-credits.html is not what the data produces
// The page chrome (head, header, footer) is taken from copyright.html so the two legal pages cannot drift apart.
// Fails the build if a publicly listed entry that the license requires credit for has no required_wording, or if a
// license-required entry is not listed. Rows marked public:false (illustrations, risk-accepted images, owner photos with
// no credit required) are never rendered.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data", "photo-credits.json");
const OUT = path.join(ROOT, "photo-credits.html");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const GROUPS = [
  ["homepage", "Homepage neighborhoods"],
  ["fall", "Fall Is On."],
  ["fall-color", "Fall Colors"],
  ["halloween", "Halloween"],
];

function validate(entries) {
  const errs = [];
  for (const e of entries) {
    const tag = `${e.collection}/${e.id}`;
    if (typeof e.public !== "boolean") errs.push(`${tag}: public flag missing`);
    if (e.attribution_required_by_license === true) {
      if (e.public !== true) errs.push(`${tag}: license requires attribution but the entry is not public`);
      if (!e.required_wording) errs.push(`${tag}: license requires attribution but required_wording is empty`);
      if (!e.license_url || !e.source_url) errs.push(`${tag}: required entry lacks license_url or source_url`);
    }
    if (e.public === true && !(e.credited_name || e.holder)) errs.push(`${tag}: public entry has no credited name`);
  }
  return errs;
}

// Replace each known URL in the (already escaped) text with a link, so the wording stays verbatim.
function linkify(text, urls) {
  let out = esc(text);
  for (const u of urls.filter(Boolean).sort((a, b) => b.length - a.length)) {
    const eu = esc(u);
    out = out.split(eu).join(`<a href="${eu}" rel="noopener">${eu}</a>`);
  }
  return out;
}

function row(e) {
  const anchor = `credit-${e.collection}-${e.id}`;
  const bits = [];
  if (e.attribution_required_by_license && e.required_wording) {
    bits.push(linkify(e.required_wording, [e.license_url, e.source_url]));
    // Author-specified wording (verbatim) may omit a link; add it beside the wording rather than editing it.
    if (!e.required_wording.includes(e.source_url)) bits.push(`<a href="${esc(e.source_url)}" rel="noopener">Source file page</a>.`);
    if (!e.required_wording.includes(e.license_url)) bits.push(`License: <a href="${esc(e.license_url)}" rel="noopener">${esc(e.license)}</a>.`);
  } else if (e.source === "Wikimedia Commons") {
    const who = esc(e.credited_name || e.holder);
    const lic = e.license_url ? `<a href="${esc(e.license_url)}" rel="noopener">${esc(e.license)}</a>` : esc(e.license);
    bits.push(`Photo by ${who}, ${lic}, via <a href="${esc(e.source_url)}" rel="noopener">Wikimedia Commons</a>. No credit is required by this license.`);
  } else {
    bits.push(`Photography &copy; ${esc(e.credited_name || e.holder)}. Taken for 313.events and used with the photographer&rsquo;s authorization.`);
  }
  if (e.modification_disclosure) bits.push(esc(e.modification_disclosure));
  if (e.sharealike) bits.push("Adaptations are shared under the same license.");
  return `      <li class="legal-li" id="${esc(anchor)}"><strong>${esc(e.destination)}</strong> &mdash; ${bits.join(" ")}</li>`;
}

function build() {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const errs = validate(data.entries);
  if (errs.length) throw new Error("photo-credits data invalid:\n  " + errs.join("\n  "));
  const known = new Set(GROUPS.map((g) => g[0]));
  for (const e of data.entries) if (e.public && !known.has(e.collection)) throw new Error(`unknown collection ${e.collection}`);

  const base = fs.readFileSync(path.join(ROOT, "copyright.html"), "utf8");
  const headEnd = base.indexOf("</style>");
  const bodyStart = base.indexOf("<body>");
  const titleAt = base.indexOf('<h1 class="legal-title">');
  const footAt = base.indexOf('<footer class="site">');
  if ([headEnd, bodyStart, titleAt, footAt].some((n) => n < 0)) throw new Error("copyright.html layout changed; update build-credits.js");

  // head: drop the DMCA design comment, retitle
  let head = base.slice(0, bodyStart);
  head = head.replace(/<!--[\s\S]*?-->\s*(?=<style>)/, "");
  const TITLE = "Photo Credits &amp; Attributions";
  const DESC = "Who took the photographs on 313.events, where they come from, and the licenses that apply.";
  head = head
    .replace(/<title>[^<]*<\/title>/, `<title>${TITLE} — 313.events</title>`)
    .replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="https://313.events/photo-credits">')
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${DESC}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${TITLE} — 313.events">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${DESC}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="https://313.events/photo-credits">')
    .replace("</style>", "  .credit-count{font-size:13px;color:var(--ink-dim);margin:0 0 14px;}\n  li.legal-li:target{outline:2px solid var(--accent);outline-offset:4px;}\n</style>");
  const header = base.slice(bodyStart, titleAt);

  const sections = [];
  let total = 0;
  for (const [key, label] of GROUPS) {
    const rows = data.entries
      .filter((e) => e.collection === key && e.public === true)
      .sort((a, b) => a.destination.localeCompare(b.destination, "en"));
    if (!rows.length) continue;
    total += rows.length;
    sections.push(`    <h2 class="legal-h" id="credits-${key}">${esc(label)}</h2>\n    <ul class="legal-ul">\n${rows.map(row).join("\n")}\n    </ul>`);
  }

  const intro = "Photos on 313.events come from Wikimedia Commons contributors, event organizers and venues, and 313.events. Where a license asks for credit, it is listed here. Photos may be cropped or resized for display. Illustrations marked as illustrations are not photographs of the place shown.";
  const body = [
    header.replace(/<body>\s*/, "<body>\n  ").trimEnd(),
    "",
    '    <h1 class="legal-title">Photo Credits &amp; Attributions</h1>',
    `    <p class="legal-intro">${esc(intro)}</p>`,
    `    <p class="credit-count">${total} photographs listed.</p>`,
    "",
    sections.join("\n\n"),
    "",
    '    <p class="legal-p">Listing a photograph here credits its creator. It does not by itself grant anyone permission to reuse the photograph; see the license linked on each row, or contact the rights holder. To report a problem with a credit, see <a href="/copyright">Copyright / DMCA</a>.</p>',
    "",
    "    ",
  ].join("\n");
  return head + body + base.slice(footAt);
}

if (require.main === module) {
  const html = build();
  if (process.argv.includes("--check")) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (cur !== html) { console.error("photo-credits.html is out of date; run node scripts/build-credits.js"); process.exit(1); }
    console.log("photo-credits.html is up to date");
  } else {
    fs.writeFileSync(OUT, html);
    console.log("wrote photo-credits.html");
  }
}

module.exports = { build, validate, row };
