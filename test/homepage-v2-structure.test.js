// test/homepage-v2-structure.test.js — the structure of Homepage V2.
//
// The behaviour behind each section (filters, search, the stream, Don't Miss
// selection, calendar export) is pinned by the other homepage tests. This file
// pins what V2 itself decided: the order of the six sections, that the right
// sidebar is gone and nothing it held was moved, the hero's copy and logo,
// that the mobile Don't Miss and neighbourhood rails are real swipe
// carousels, and that the palette stays inside the Design System.
//
// Layout is measured in Chromium (1280 / 768 / 390 / 320 screenshots); Node
// cannot do that, so this guards the rules those measurements depend on.
//
// Run: node test/homepage-v2-structure.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${REPO_DIR}/index.html`, "utf8");
const body = html.slice(html.indexOf("<body>"));
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, "");
const flat = css.replace(/\s+/g, " ");
const at = (s) => { const i = body.indexOf(s); assert.ok(i !== -1, `the page has ${s}`); return i; };

// --- 1. Six sections, in the approved order, and no sidebar ---
{
  const order = ['id="heroSection"', 'id="discoveryShell"', 'id="dontMissSection"', 'id="listView"', 'id="neighborhoodsSection"', 'id="nearYouCard"', 'id="onRadarCard"'];
  order.reduce((prev, s) => { assert.ok(at(s) > prev, `${s} comes after what precedes it`); return at(s); }, -1);
  // The stream is one block: its continuation is directly beneath it, ahead of Neighborhoods.
  assert.ok(at('id="listView"') < at('id="listMore"') && at('id="listMore"') < at('id="neighborhoodsSection"'), "What's Happening is not split around the sections that follow it");
  assert.ok(!/<aside\b|homeSidebar|class="side-card"/.test(body), "no right sidebar");
  assert.ok(/grid-template-areas:\s*"dm dm"\s*"list list"\s*"nb orbit"\s*"radar radar";/.test(css), "desktop grid: Don't Miss, stream, Neighborhoods beside Orbit, Radar");
  assert.ok(/@media \(max-width:980px\)\{\s*\.home-body\{[^}]*grid-template-areas:"dm" "list" "nb" "orbit" "radar";/.test(css), "below 981px: one column, same order");
}
console.log("PASS: section order, one unsplit stream, no sidebar");

// --- 2. The hero ---
{
  const hero = body.slice(at('id="heroSection"'), at('id="discoveryShell"'));
  assert.ok(/class="hl-line">THE CITY</.test(hero) && /class="hl-text">IS ON</.test(hero), "THE CITY IS ON.");
  assert.ok(/aria-label="THE CITY IS ON\."/.test(hero), "the hero is named for assistive tech");
  assert.ok(/id="heroToday"/.test(hero), "the real event count lives here (renderHeroToday)");
  assert.ok(/<img src="\/assets\/wordmark\.svg" alt="313\.events" height="26"/.test(body), "the approved logo asset, unchanged");
  assert.ok(fs.existsSync(`${REPO_DIR}/assets/wordmark.svg`));
}
console.log("PASS: hero copy and logo");

// --- 3. Mobile carousels: swipeable, snapping, with the next card peeking ---
{
  assert.ok(/@media \(max-width:980px\)\s*\{\s*\.dm-grid\{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;/.test(flat), "Don't Miss scrolls and snaps horizontally on tablet and phone");
  assert.ok(/\.dm-card\{flex:0 0 (\d+)%;scroll-snap-align:start;\}/.test(flat), "each Don't Miss card snaps to the start");
  const phone = flat.match(/@media \(max-width:640px\)[^@]*\.dm-card\{flex-basis:(\d+)%/);
  assert.ok(phone && +phone[1] > 70 && +phone[1] < 95, "on a phone one card leads and the next peeks in (a basis between 70% and 95%)");
  assert.ok(/id="dmDots"|dm-dots/.test(html), "the carousel has position dots");
  assert.ok(/\.neighborhoods-rail\{[^}]*overflow-x:auto/.test(flat), "the neighbourhood rail scrolls horizontally");
  assert.ok(/\.radar-rail\{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;/.test(flat), "the Radar rail swipes on tablet and phone");
}
console.log("PASS: Don't Miss, neighbourhood and Radar rails swipe, with the next card peeking on a phone");

// --- 4. On the Radar: working article destinations ---
{
  const fn = html.slice(html.indexOf("function renderOnRadarCard"), html.indexOf("function renderOnRadarCard") + 6000);
  assert.ok(/<a class="rc-link" href="\$\{escapeHtml\(articleHref\)\}" target="_blank" rel="noopener noreferrer">/.test(fn), "each card opens its article, in a new tab, without opener access");
  assert.ok(/<div class="rc-link">/.test(fn), "a card with no destination is not a link at all — no dead links");
  assert.ok(/ON_RADAR_LIMIT\s*=\s*4/.test(html), "four compact cards");
}
console.log("PASS: On the Radar cards link to their articles");

// --- 5. The palette stays inside Design System V2.1 ---
{
  const root = css.match(/:root\s*\{([^}]*)\}/)[1];
  for (const hex of ["#0A0A0A", "#F2F0E8", "#D7FF00", "#A9AAA3", "#202020"]) assert.ok(new RegExp(hex, "i").test(css), `the palette includes ${hex}`);
  assert.ok(!/\.evt-cat\{[^}]*(color|background):\s*(var\(--cat|#[0-9a-f]{3,6}\b)/i.test(flat.replace(/var\(--(?:ink|line|bg|surface|accent)[a-z-]*\)/g, "")), "the category tag on a row is neutral — no per-category colour");
  assert.ok(!/style="color:/.test(html.slice(html.indexOf("function streamRowHtml"), html.indexOf("function streamRowHtml") + 6000)), "no inline colour on a stream row");
  void root;
}
console.log("PASS: palette — Design System colours only, neutral category tags");

// --- 6. Fidelity pass 2: the neighborhood and press rails ---
{
  const nav = body.slice(at('id="neighborhoodsSection"'), at('id="nearYouCard"'));
  assert.ok(/<div class="neighborhoods-rail rail" id="neighborhoodsRail" role="group" aria-roledescription="carousel" aria-label="Neighborhoods">/.test(nav), "the neighborhood rail is a labelled carousel");
  assert.ok(/class="rail-btn rail-prev" aria-label="Previous neighborhoods"/.test(nav) && /class="rail-btn rail-next" aria-label="More neighborhoods"/.test(nav), "with real previous / next buttons");
  const fn = html.slice(html.indexOf("function renderNeighborhoodsRail"), html.indexOf("function renderNeighborhoodsRail") + 5000);
  assert.ok(/NEIGHBORHOOD_RAIL_LIMIT = 20/.test(html) && !/nth-child\(n\+6\)/.test(css), "every neighborhood (up to the limit) is on the rail; none is hidden on desktop");
  assert.ok(/neigh-card rail-item/.test(fn) && /aria-pressed=/.test(fn), "each card is a focusable button that says whether it is selected");
  assert.ok(/\.neigh-card\{[^}]*flex:0 0 calc\(\(100% - 40px\) \/ 5\)/.test(flat), "desktop: five cards in view, the rest by scrolling");
  assert.ok(/@media \(max-width:980px\)\s*\{\s*\.neighborhoods-section\{[^}]*\}\s*\.neigh-card\{flex-basis:calc\(\(100% - 30px\) \/ 3\.6\)/.test(flat), "tablet: three cards and the next one's edge");
  assert.ok(/\.neigh-card\{flex-basis:64%/.test(flat), "phone: one card and the edge of the next");
  assert.ok(/\.neigh-card:not\(\.has-photo\)\{background:var\(--panel-alt\) url\('\/assets\/atmosphere\/313-events-scan-lines\.svg'\)/.test(flat) && fs.existsSync(`${REPO_DIR}/assets/atmosphere/313-events-scan-lines.svg`), "no approved photo: a quiet Charcoal plate under the existing scan-line asset");

  const radar = html.slice(html.indexOf("function renderOnRadarCard"), html.indexOf("function renderOnRadarCard") + 7000);
  assert.ok(/<div class="radar-rail rail" role="group" aria-roledescription="carousel" aria-label="On the Radar">/.test(radar) && /class="rail-btn rail-next" aria-label="More articles"/.test(radar), "the press rail is a labelled carousel with buttons");
  assert.ok(/\.rc-link\{position:relative;[^}]*aspect-ratio:3\/2/.test(flat) && /\.rc-body\{[^}]*position:absolute;[^}]*bottom:0/.test(flat), "image-led: the card is the photograph, the source, headline and date sit on a scrim");
  assert.ok(/<span class="rc-media-fallback"><\/span>/.test(radar) && !/radial-gradient\(circle at 100% 0/.test(css), "an article with no supported image gets the quiet scan-line plate, no drawn graphic");
  assert.ok(/article\.thumbnailUrl && safeUrl\(article\.thumbnailUrl\)/.test(radar) && !/event\.image/.test(radar), "only the article's own thumbnail is ever used — never the covered event's picture");

  // Rail behaviour (buttons, arrow keys, "more this way" state).
  assert.ok(/function railState\(wrap\)/.test(html) && /document\.addEventListener\('keydown'/.test(html) && /e\.key !== 'ArrowRight' && e\.key !== 'ArrowLeft'/.test(html), "buttons and arrow keys are wired");
  assert.ok(/\.rail-btn\[hidden\]\{display:none;\}/.test(flat), "a button is out of the way when there is nothing in that direction");
}
console.log("PASS: neighborhood and press rails — carousels with buttons, 5 / 3.6 / 1.5 cards in view, photo-led, quiet fallbacks, article images only");

// --- 7. Neighbourhood photographs: weight ---
// A hotlinked Commons original can be several megabytes (Eastern Market was
// 6000x4000, ~7.8 MB) for a card about 224 px wide. Every hotlinked photo
// must therefore be a sized /thumb/ rendition, and any local photo must be a
// file that exists. Attribution keeps pointing at the original file.
{
  const block = html.match(/const NEIGHBORHOOD_PHOTOS = \{[\s\S]*?\n\};/)[0];
  const srcs = [...block.matchAll(/^\s{4}src:\s*'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(srcs.length >= 7, "the hotlinked neighbourhood photographs are listed");
  srcs.forEach((u) => assert.ok(/\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+\/(\d+)px-[^/]+$/.test(u) || /\/commons\/4\/4b\/MikerussellCampusmartiusParkDetroit\.jpg$/.test(u), `hotlink is a sized rendition, not a full-size original: ${u}`));
  srcs.forEach((u) => { const m = u.match(/\/(\d+)px-/); if (m) assert.ok(+m[1] >= 500 && +m[1] <= 960, `rendition width is 500-960 px: ${u}`); });
  [...block.matchAll(/^\s{4}file:\s*'([^']+)'/gm)].forEach((m) => assert.ok(fs.existsSync(`${REPO_DIR}/assets/photography/neighborhoods/${m[1]}`), `local photo exists: ${m[1]}`));
  assert.ok(/attribution: \{\s*url: 'https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/b\/b2\/Detroit_May_2023_03_%28Eastern_Market%29\.jpg'/.test(block) && /attribution: \{\s*url: 'https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/e\/ea\/Mexican_Village_Detroit\.jpg'/.test(block), "attribution still names the original files");
}
// Every photograph is keyed by the exact production neighbourhood name, or it
// can never match a card (Fitzgerald-Marygrove sat under "Fitzgerald" and never showed).
{
  const block = html.match(/const NEIGHBORHOOD_PHOTOS = \{[\s\S]*?\n\};/)[0];
  const keys = [...block.matchAll(/^  "([^"]+)": \{/gm)].map((m) => m[1]).sort();
  assert.deepStrictEqual(keys, ["Downtown", "Eastern Market", "Eastside Historic Cemetery District", "Fitzgerald-Marygrove", "Midtown", "Mexicantown / Southwest Detroit", "North Corktown", "Old Redford"].sort(), "photograph keys are production neighbourhood names");
  assert.ok(!/^  "Fitzgerald": \{/m.test(block), "no photograph under the non-production name Fitzgerald");
}
console.log("PASS: neighbourhood photographs are sized renditions, local files exist, attribution unchanged");

console.log("\nAll Homepage V2 structure tests passed.");
