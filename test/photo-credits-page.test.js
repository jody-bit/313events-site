// test/photo-credits-page.test.js — "Photo Credits & Attributions" page (/photo-credits), generated from data/photo-credits.json.
// Credits stay on cards until this page is published and verified (separate change); this page only adds the central listing.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { build, validate } = require("../scripts/build-credits");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const data = JSON.parse(read("data/photo-credits.json"));
const page = read("photo-credits.html");

// generated file is current
assert.strictEqual(page, build(), "photo-credits.html matches the generator (run node scripts/build-credits.js)");

// route
const rewrites = JSON.parse(read("vercel.json")).rewrites;
assert.ok(rewrites.some((r) => r.source === "/photo-credits" && r.destination === "/photo-credits.html"), "/photo-credits resolves to photo-credits.html");

// every license-required entry is public and present with its license link and source link, and wording verbatim
const required = data.entries.filter((e) => e.attribution_required_by_license === true);
assert.ok(required.length >= 35, `required entries present (${required.length})`);
for (const e of required) {
  assert.strictEqual(e.public, true, `${e.id}: required entry is public`);
  assert.ok(page.includes(`id="credit-${e.collection}-${e.id}"`), `${e.id}: row present`);
  assert.ok(page.includes(`<a href="${e.license_url}" rel="noopener">${e.license_url}</a>`) || page.includes(`href="${e.license_url}"`), `${e.id}: license linked`);
  assert.ok(page.includes(`href="${e.source_url.replace(/&/g, "&amp;")}"`), `${e.id}: source file page linked`);
  const name = (e.credited_name || e.holder).split(/ from | at /)[0];
  assert.ok(page.includes(name), `${e.id}: creator named`);
}

// rows == public entries, no more
const publicEntries = data.entries.filter((e) => e.public === true);
const rows = page.match(/<li class="legal-li" id="credit-/g) || [];
assert.strictEqual(rows.length, publicEntries.length, "rows == public entries");

// default: illustrations, risk-accepted images and no-credit owner photos never listed
for (const e of data.entries.filter((x) => x.public !== true)) {
  assert.ok(!page.includes(`id="credit-${e.collection}-${e.id}"`), `${e.id}: not listed`);
}
for (const e of data.entries.filter((x) => /illustration|risk/.test(x.image_kind))) assert.notStrictEqual(e.public, true, `${e.id}: never public by default`);
assert.ok(!/Goodison|Damouni|Kensington Metropark/.test(page), "risk-accepted organizer images are not listed");

// Share-alike note on CC BY-SA rows
for (const e of publicEntries.filter((x) => /BY-SA/.test(x.license))) {
  const li = page.slice(page.indexOf(`id="credit-${e.collection}-${e.id}"`)).split("</li>")[0];
  assert.ok(/same license/.test(li), `${e.id}: share-alike note`);
}

// every CC BY-SA row carries the ShareAlike line (18 today); owner-photo rows use the approved public sentence
assert.strictEqual(publicEntries.filter((x) => /BY-SA/.test(x.license)).length, 18, "18 BY-SA rows");
for (const id of ["diehls-orchard-and-cider-mill", "highland-state-recreation-area"]) {
  const li = page.slice(page.indexOf(`id="credit-`), page.length).split("</li>").find((x) => x.includes(id));
  assert.ok(li.includes("Photography &copy; Miriam Vukich. Taken for 313.events and used with the photographer&rsquo;s authorization. Cropped and resized for display."), id + ": approved public sentence");
}
assert.ok(!/acquired block/.test(page), "no internal wording on the page");

// the build refuses a required entry with no wording, or one that is not public
{
  const bad = JSON.parse(JSON.stringify(data.entries));
  const r = bad.find((e) => e.attribution_required_by_license === true);
  r.required_wording = null;
  assert.ok(validate(bad).some((m) => /required_wording is empty/.test(m)), "missing required_wording fails validation");
  r.required_wording = "x"; r.public = false;
  assert.ok(validate(bad).some((m) => /not public/.test(m)), "unlisted required entry fails validation");
}

// no layout/nav change: same header and footer as the Copyright page; footer link on this page points here
assert.ok(page.includes('<a href="/photo-credits">Photo Credits</a>'), "footer links to the page");
assert.ok(/<link rel="canonical" href="https:\/\/313\.events\/photo-credits">/.test(page), "canonical");

// cards still carry their credits in this change
assert.ok(/creditLine|sc-credit/.test(read("seasonal/render.js")), "card credits not removed here");
console.log(`PASS: photo credits page (${rows.length} rows, ${required.length} license-required)`);
