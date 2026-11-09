// test/seasonal-photo-pending.test.js — owner direction Nov 4: in an owner-review Preview a generic placeholder is labelled "Photo pending"
// (a publication blocker), never presented as a photograph and never relabelled as a finished illustration. Outside the Preview nothing changes.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const R = require(path.join(root, "seasonal/render.js"));
const PH = "/assets/placeholders/event-800.webp";
const entry = (img) => ({ id: "x", name: "X", city: "Detroit", region: "MI", categories: [], status: "PUBLISHED", summary: "s", website: "https://example.org", image: img });
const col = (extra) => Object.assign({ slug: "off-the-beaten-orbit", title: "T", titleLines: ["T"], subtitle: "s", categories: [], entries: [] }, extra || {});
const preview = { previewPendingPhotos: true };

const ph = entry({ src: PH, illustrative: false });
assert.ok(/<span class="sc-pending">Photo pending<\/span>/.test(R.card(col(preview), ph, {})), "placeholder card in Preview is labelled");
assert.ok(!/Illustrative image|sc-illus/.test(R.card(col(preview), ph, {})), "a placeholder is never relabelled as an illustration");
assert.ok(!/Photo pending/.test(R.card(col(), ph, {})), "without the Preview flag nothing changes");
assert.ok(!/Photo pending/.test(R.card(col({ previewPendingPhotos: false }), ph, {})), "only an explicit true counts");
const real = entry({ src: "/assets/seasonal/real-photo.jpg", illustrative: false, credit: "Photography © Jody" });
assert.ok(!/Photo pending/.test(R.card(col(preview), real, {})), "a real photograph is not labelled");
const illus = entry({ src: "/assets/seasonal/card.jpg", illustrative: true });
assert.ok(/Illustrative image/.test(R.card(col(preview), illus, {})) && !/Photo pending/.test(R.card(col(preview), illus, {})), "an illustration keeps its own label only");
const nosrc = entry({ illustrative: false });
assert.ok(/Photo pending/.test(R.card(col(preview), nosrc, {})), "no image at all is pending too");

const hero = (extra, h) => R.main(col(Object.assign({ hero: Object.assign({ desktop: PH, mobile: PH, alt: "", illustrative: false, objectPosition: "50% 50%" }, h), entries: [] }, extra)), {});
assert.ok(/sc-pending sc-pending-hero">Photo pending/.test(hero(preview)), "placeholder hero in Preview is labelled");
assert.ok(!/Photo pending/.test(hero({})), "hero unchanged outside the Preview");
assert.ok(!/Photo pending/.test(hero(preview, { desktop: "/assets/seasonal/hero.jpg", mobile: "/assets/seasonal/hero-m.jpg" })), "a real hero is not labelled");

// the Preview endpoint sets the flag; production pages do not
assert.ok(/previewPendingPhotos: true/.test(fs.readFileSync(path.join(root, "api/seasonal-preview.js"), "utf8")));
for (const f of ["seasonal/page.js", "seasonal/collections.js"]) assert.ok(!/previewPendingPhotos/.test(fs.readFileSync(path.join(root, f), "utf8")), f + " never sets the Preview flag");
assert.ok(/\.sc-pending\{/.test(fs.readFileSync(path.join(root, "seasonal/seasonal.css"), "utf8")), "label style exists");
console.log("PASS: Preview labels generic placeholders 'Photo pending' (cards and hero), never as illustrations; production rendering unchanged");
