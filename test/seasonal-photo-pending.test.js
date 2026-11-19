// test/seasonal-photo-pending.test.js — owner direction Nov 4: in an owner-review Preview a generic placeholder is labelled "Photo pending"
// (a publication blocker). Public placeholders now use an honest text treatment under the Nov 13 site-trust request.
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

// Public cards must not present the generic cover as event photography.
assert.ok(/class="sc-card-media sc-no-photo"/.test(R.card(col(), ph, {})), "public generic cover gets the no-photo treatment");
const linkedReal = entry({ src: "/assets/seasonal/real-photo.jpg", illustrative: false, remote: { src: "https://example.org/event.jpg", sourcePage: "https://example.org/event", credit: "Venue" } });
assert.ok(!/Illustrative image/.test(R.card(col(), linkedReal, {})), "a linked photo falling back to a real photo is never called illustrative");
const FB = require("../seasonal/image-fallback.js");
for (const k of Object.keys(FB._failed)) delete FB._failed[k];
const classes = new Set();
const attrs = {src:"https://example.org/fails.jpg", "data-fb":JSON.stringify(["/assets/seasonal/real-photo.jpg", PH])};
const img = {parentNode:{classList:{add:c=>classes.add(c)}},getAttribute:k=>attrs[k] ?? null,setAttribute:(k,v)=>attrs[k]=v};
assert.strictEqual(FB.handleFailure(img, ()=>assert.fail()), "next");
assert.ok(!classes.has("sc-no-photo"), "real fallback remains a photograph");
assert.strictEqual(FB.handleFailure(img, ()=>assert.fail()), "next");
assert.ok(classes.has("sc-no-photo"), "generic fallback becomes text treatment");
let replaced = false;
assert.strictEqual(FB.handleFailure(img, ()=>replaced=true), "placeholder");
assert.ok(replaced && classes.has("sc-no-photo"), "exhausted fallback retains honest no-photo state");
for (const k of Object.keys(FB._failed)) delete FB._failed[k];
console.log("PASS: public and runtime generic image fallbacks are labelled; real photos are not mislabelled illustrations");

const canonToIllustration = entry({canonical:"https://example.org/canonical.jpg",src:"/assets/seasonal/illustration.webp",illustrative:true});
assert.ok(/sc-illus sc-illus-fb">Illustrative image/.test(R.card(col(), canonToIllustration, {})), "failed canonical photo retains the cover's illustration disclosure");

// Alternates carry no independent photo provenance; never present them as the original photo.
const altAttrs = {src:"https://example.org/real.jpg","data-cover-src":"https://example.org/real.jpg","data-fb":JSON.stringify(["/assets/seasonal/fall-color-card-1.webp",PH])};
const mediaClasses = new Set(), cardClasses = new Set();
const altImg = {parentNode:{classList:{add:c=>mediaClasses.add(c)}},closest:()=>({classList:{add:c=>cardClasses.add(c)}}),getAttribute:k=>altAttrs[k] ?? null,setAttribute:(k,v)=>altAttrs[k]=v};
assert.strictEqual(FB.handleFailure(altImg, ()=>assert.fail()), "next");
assert.ok(mediaClasses.has("sc-no-photo"), "unproven alternate artwork gets the no-photo treatment");
assert.ok(cardClasses.has("sc-fell-back"), "card body hides the failed original photo credit");
const creditedCover = entry({canonical:"https://example.org/canon.jpg",src:"/assets/seasonal/real.jpg",illustrative:false,credit:"Example, CC BY-SA 3.0, via Wikimedia Commons"});
assert.ok(/sc-credit sc-cover-credit/.test(R.card(col(),creditedCover,{})), "licensed fallback retains its credit, hidden until used");
for (const k of Object.keys(FB._failed)) delete FB._failed[k];

const remoteAttrs = {src:"https://example.org/canonical.jpg","data-cover-src":"/real-cover.jpg","data-remote-src":"https://example.org/remote.jpg","data-fb":JSON.stringify(["https://example.org/remote.jpg","/real-cover.jpg"])};
const selected = {}, parentClasses = new Set();
const remoteImg = {parentNode:{classList:{add:c=>parentClasses.add(c),remove:c=>parentClasses.delete(c)},setAttribute:(k,v)=>selected[k]=v},getAttribute:k=>remoteAttrs[k] ?? null,setAttribute:(k,v)=>remoteAttrs[k]=v};
assert.strictEqual(FB.handleFailure(remoteImg,()=>assert.fail()),"next");
assert.ok(!parentClasses.has("sc-no-photo") && selected["data-image-source"]==="remote", "declared remote photo remains visible after canonical failure");
assert.strictEqual(FB.handleFailure(remoteImg,()=>assert.fail()),"next");
assert.ok(!parentClasses.has("sc-no-photo") && selected["data-image-source"]==="cover", "known cover remains visible after remote failure");
for (const k of Object.keys(FB._failed)) delete FB._failed[k];
