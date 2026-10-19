#!/usr/bin/env node
// scripts/build-seasonal-launch.js
//
// Fall Is On. and Fall Colors launch preparation. Reads the official-source reads recorded in
// api/_lib/seasonal-editorial/launch-verification.json and
//   1. upserts the private destination records in entries.json (collections "fall" and "fall-color"),
//   2. links each ledger row in candidates.json to its record (entry_key), and
//   3. writes the QA-only datasets fall-qa.json and fall-color-qa.json (all inventory rows, served by
//      /api/seasonal-qa outside production only).
// It never writes `approval`, never sets a status by hand (the gate derives it) and never publishes anything.
// Records listed in launch-1.json (launch proposal 1) are curated by hand from two independent official-page reads and are
// kept exactly as authored in entries.json: this script does not rebuild them. It only reflects them in the QA datasets,
// where it flags them as proposed (QA `launch`), and lists any parked linked image as an unadopted alternative.
// Idempotent. No network.
//   node scripts/build-seasonal-launch.js          write
//   node scripts/build-seasonal-launch.js --check  exit 1 if stale
// Run order after changing data: this script, then scripts/build-halloween-qa.js (ledger sync), then
// scripts/build-seasonal.js.
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const E_DIR = "api/_lib/seasonal-editorial";
const ED = require("../api/_lib/seasonal-editorial/editorial.js");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, E_DIR, f), "utf8"));
const slug = (s) => s.toLowerCase().replace(/[’']/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const launch = read("launch-verification.json");
const proposal = read("launch-1.json");
const curatedIds = (col) => new Set(proposal.collections[col] || []);
// Records the owner has held out of the proposal (launch-1.json "held") stay hand-curated: never rebuilt from launch-verification.json, never flagged as proposed.
const heldIds = (col) => new Set(Object.keys((proposal.held || {})[col] || {}));
// Expansion batch (launch-expansion.json, written by scripts/prepare-expansion.js): reviewed records, hand-curated and flagged as proposed.
const expansion = (() => { try { return read("launch-expansion.json"); } catch (e) { return { batch: null, collections: {} }; } })();
const expansionIds = (col) => new Set((expansion.collections || {})[col] || []);
// Release batch 2 (release-2.json, owner gate 5 on 2026-10-19): three hand-curated records with DEC-029 image provenance. Kept exactly as authored.
const release2 = (() => { try { return read("release-2.json"); } catch (e) { return { collections: {} }; } })();
const release2Ids = (col) => new Set((release2.collections || {})[col] || []);
const handIds = (col) => new Set([...curatedIds(col), ...expansionIds(col), ...heldIds(col), ...release2Ids(col)]);
const lib = read("photo-library.json");
const reg = read("candidates.json");
const entriesFile = read("entries.json");
const DATE = "2026-10-11";
const CHECKED_BY = "Claude Code: automated read of the official page; owner review pending";
const ART_COUNT = 8;

const photos = lib.destination_specific.concat(lib.editorial_atmospheric);
const photoById = Object.fromEntries(photos.map((p) => [p.id, p]));
const norm = (s) => String(s).replace(/[’]/g, "'").toLowerCase();

// Row-specific record ids where the name alone is ambiguous (two "Heritage Park" rows).
const KEY_OVERRIDE = { "fall-color|Heritage Park|Farmington Hills, MI": "heritage-park-farmington-hills", "fall-color|Heritage Park|Taylor, MI": "heritage-park-taylor" };
const keyFor = (c) => KEY_OVERRIDE[c.collection + "|" + c.name + "|" + c.location] || slug(c.name);

const AUTUMN = /autumn|\bfall\b|colou?r|foliage/i;
const NOT_AUTUMN = /\b(May|June|July|August|April|January|February|Feb|winter|spring|summer|night|blue hour)\b/i;
const FRUIT_PRIORITY = [/orchard/i, /barn/i, /pumpkin/i, /tree line|trail/i, /cider|donut/i, /hayride/i];
const cleanPhoto = (p) => (p.editorial_flags || []).length === 0 && (p.quality_flags || []).length === 0 && /^(none|incidental|none or incidental)$/.test(p.people_visible || "none");
const conf = (p) => (p.destination && p.destination.match_confidence) || "";
function chooseDefault(col, list) {
  let c = list.filter(cleanPhoto);
  if (col === "fall-color") c = c.filter((p) => AUTUMN.test(p.subject) && !NOT_AUTUMN.test(p.subject));
  const rank = (p) => (conf(p) === "HIGH" ? 0 : 10) + (/guardrail|road|bike/i.test(p.subject) ? 20 : 0) + (() => { const i = FRUIT_PRIORITY.findIndex((r) => r.test(p.subject)); return i < 0 ? 5 : i; })();
  return c.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))[0] || null;
}
const destPhotos = (col, row) => lib.destination_specific.filter((p) => p.destination.collection === col && norm(p.destination.name) === norm(row.name) &&
  (row.location.replace(/,.*$/, "").toLowerCase().indexOf((p.destination.asset_key.split("__").pop() || "").split("-mi")[0].split("-")[0]) >= 0 || true))
  // "Heritage Park": the library's photos are the Farmington Hills park (asset_key ends in farmington-hills-mi)
  .filter((p) => norm(row.name) !== "heritage park" || (/farmington/i.test(p.destination.asset_key) === /Farmington/.test(row.location)));

const ART = (col, n) => "/assets/seasonal/" + (col === "fall" ? "fall" : "fall-color") + "-card-" + n + ".webp";
const stateOf = (e) => ED.COLLECTIONS.readiness(e).state;

function city(loc) { const m = /^(.*), ([A-Z]{2})$/.exec(loc); return m ? { city: m[1], region: m[2] } : { city: loc, region: "" }; }
// Card summaries name only the kinds of things a page lists: no parentheticals, numbers, prices, hours or dates.
function sentence(items) {
  return items.map((a) => String(a).replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim()).filter((a) => a && !/\d|\$|\bfree\b|\badmission\b|\bopen\b|\bhours?\b|\bdaily\b|\bweekends?\b/i.test(a)).slice(0, 4).join(", ");
}

const MILES = (a, b, c, d) => { const R = 3958.8, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const DETROIT = [42.3314, -83.0458];
function listOf(v) { return (v.activities && v.activities.length ? v.activities : v.features) || []; }
function distanceFlag(v) {
  if (typeof v.lat !== "number" || typeof v.lon !== "number") return null;
  const mi = MILES(DETROIT[0], DETROIT[1], v.lat, v.lon);
  return { miles: Math.round(mi), outside: mi > 75 };
}

const RISKY = /\b(hours?|admission|\$\d|tickets?|open now|open today|peak|wheelchair|accessible|\d{1,2}(am|pm|:\d\d)|oct(ober)?\.? \d)/i;
function safeNote(note, name, where) {
  const n = String(note || "").replace(/\s+/g, " ").trim();
  return n && !RISKY.test(n) ? n + "." : name.replace(/’/g, "'") + " in " + where.city + ", inventory candidate.";
}
function buildEntry(col, item, existing, n) {
  const row = reg.candidates.find((c) => c.collection === col && c.name === item.ledger_name && c.location === item.ledger_location);
  const id = existing ? existing.id : keyFor(row);
  const v = item.verification, read_ok = v.read_ok === true;
  const where = city(row.location);
  const e = existing ? JSON.parse(JSON.stringify(existing)) : { id, name: row.name.replace(/’/g, "'"), city: where.city, region: where.region, categories: item.categories, featured: false, status: "HOLD_UNVERIFIED", summary: safeNote(row.inventory_note, row.name, where), image: null };
  if (!existing) {
    const art = ART(col, 1 + (n % ART_COUNT));
    e.image = { src: art, alternates: [ART(col, 1 + ((n + 3) % ART_COUNT))], placeholder: "/assets/placeholders/event-800.webp", source: "313.events supplied collection graphic (AI-generated), cropped",
      credit: "313.events", license: "Supplied by 313.events; generation tool and terms not recorded", illustrative: true };
  }
  e.categories = existing ? e.categories : item.categories;
  // Evidence: keep what was there, replace any previous automated official read, add the new one.
  e.evidence = (e.evidence || []).filter((x) => !(x.level === "official" && x.checkedBy === CHECKED_BY) && !(x.level === "inventory+search" && x.checkedAt === DATE && /^Official page could not be read/.test(x.note || "")));
  if (read_ok) {
    e.website = v.official_url;
    const asStated = (v.status || v.access || "").trim();
    e.evidence.push({ level: "official", websiteChecked: true, url: v.official_url, checkedAt: DATE, checkedBy: CHECKED_BY,
      note: "Official page read " + DATE + ". Address as stated: " + (v.address || "not stated") + ". " + (asStated ? "Season/hours as stated: " + asStated + ". " : "") +
        (v.flags && v.flags.length ? "Flags: " + v.flags.join("; ") + "." : "") });
    if (col === "fall" || item.relevance_confirmed) {
      // summary is built only from what the official page lists
      e.summary = e.name + " in " + e.city + ". " + (col === "fall" ? "Official page lists " : "Listed features: ") + (sentence(listOf(v)) || "its seasonal programs") + ".";
    }
  } else {
    e.evidence.push({ level: "inventory+search", websiteChecked: false, url: v.official_url || null, checkedAt: DATE,
      note: "Official page could not be read on " + DATE + ": " + (v.flags || []).join("; ") + ". Not verified." });
  }
  const rd = item.relevance || null;
  if (read_ok || (rd && rd.evidence && rd.evidence.length)) {
    e.relevance = { confirmed: item.relevance_confirmed === true, checkedAt: DATE, checkedBy: CHECKED_BY,
      note: item.relevance_confirmed ? ((rd && rd.rationale) || v.relevance || "Official page lists seasonal activities for the collection.") : "Not confirmed: " + ((rd && rd.rationale) || v.relevance || "no credible source found that describes seasonal activity for this collection") + ((v.flags || []).some((f) => /Outside the 75-mile/.test(f)) ? " " + (v.flags || []).find((f) => /Outside the 75-mile/.test(f)) : "") + " Awaiting editorial judgment." };
    if (rd) { e.relevance.confidence = rd.confidence; e.relevance.evidence = rd.evidence; e.relevance.unresolved = rd.unresolved || []; }
  }
  {
    const dist = distanceFlag(v);
    if (dist) e.distance = { miles: dist.miles, outside75: dist.outside, note: "Straight-line miles from Detroit centre; coordinates approximate (" + (v.coord_source || "source not stated") + ")" };
  }
  if (!(read_ok || (rd && rd.evidence && rd.evidence.length))) delete e.relevance;
  // Photography: the owner's own photograph (priority 1) when a clean one exists, otherwise the generated card stays.
  if (e.image && e.image.remote) {
    // Owner direction 2026-10-11: a publicly accessible third-party photo is not licensed. It stays a QA candidate only.
    e.image.linkedCandidates = (e.image.linkedCandidates || []).concat([e.image.remote]);
    delete e.image.remote;
  }
  const pick = chooseDefault(col, destPhotos(col, row));
  if (pick) {
    const oi = ED.ownerPhotoImage(pick.id, { acquiredAt: DATE, verifiedAt: DATE, verifiedBy: "Claude Code: size, dimensions and sha256 computed from the repository file",
      recordedBy: "Jody Tyree (owner photo recorded in photo-library.json, " + (pick.review_ref || pick.id) + ")", recordedAt: DATE });
    e.image = Object.assign({ alternates: e.image.alternates, placeholder: e.image.placeholder }, oi);
  }
  e.status = "HOLD_UNVERIFIED";
  e.status = stateOf(e);
  return { entry: e, row, pick };
}

// ---- 1. entries
const out = JSON.parse(JSON.stringify(entriesFile));
const built = { fall: [], "fall-color": [] };
for (const col of ["fall", "fall-color"]) {
  let n = 0;
  for (const item of launch.collections[col]) {
    // Owner decision 2026-10-19 (Almar duplicate): this research row is a duplicate of the canonical Almar Orchards record and is
    // no longer in the inventory ledger. The research file stays untouched as history; the generator skips the consolidated row.
    if (col === "fall" && item.ledger_name === "JK’s Farmhouse Ciders / Almar Orchards") continue;
    const row = reg.candidates.find((c) => c.collection === col && c.name === item.ledger_name && c.location === item.ledger_location);
    if (!row) throw new Error("no ledger row for " + col + " " + item.ledger_name);
    const key = keyFor(row);
    const existing = out[col].find((e) => e.id === key) || (KEY_OVERRIDE[col + "|" + row.name + "|" + row.location] ? null : out[col].find((e) => norm(e.name) === norm(item.ledger_name)));
    if (existing && handIds(col).has(existing.id)) { n++; built[col].push({ entry: existing, row, pick: null }); continue; }
    const b = buildEntry(col, item, existing, n++);
    if (existing) out[col][out[col].indexOf(existing)] = b.entry; else out[col].push(b.entry);
    built[col].push(b);
  }
}
// ---- 2. ledger links: entry_key on the rows whose name alone is ambiguous
const regOut = JSON.parse(JSON.stringify(reg));
for (const c of regOut.candidates) { const k = KEY_OVERRIDE[c.collection + "|" + c.name + "|" + c.location]; if (k) c.entry_key = k; }

// ---- 2b. photo library: tie each destination photo to its record id (published_id is the library's link field)
const libOut = JSON.parse(JSON.stringify(lib));
for (const c of regOut.candidates) {
  if (c.collection === "halloween") continue;
  const key = c.entry_key || c.published_id || slug(c.name);
  if (!out[c.collection].some((e) => e.id === key)) continue;
  for (const p of destPhotos(c.collection, c)) {
    const lp = libOut.destination_specific.find((x) => x.id === p.id);
    if (lp && !lp.destination.published_id) lp.destination.published_id = key;
  }
}

// ---- 3. QA datasets
const atm = (col) => lib.editorial_atmospheric.filter((p) => p.seasonal_theme === col && cleanPhoto(p)).slice(0, 3);
function photoOpt(p, type) {
  const warn = [].concat(p.editorial_flags || [], p.quality_flags || []);
  if (type === "owner_photo_destination" && NOT_AUTUMN.test(p.subject) && p.destination && p.destination.collection === "fall-color") warn.push("Not an autumn photograph: " + p.subject);
  if (type === "owner_photo_atmospheric") warn.unshift("Atmospheric photo: does NOT depict this destination");
  return { id: p.id, type, src: p.files.card, source: "313.events owner photo archive" + (p.capture_date ? ", captured " + p.capture_date : ""), credit: p.credit, rights_status: p.license,
    illustrative: false, depicts_actual_destination: type === "owner_photo_destination", subject: p.subject, warnings: warn, image_kind: "photo", rights_basis: "owner-authorization", license_url: null };
}
function genOpt(col, src, n) {
  return { id: "gen-" + col + "-" + n, type: "generated_illustrative", src, source: "313.events supplied " + (col === "fall" ? "Fall" : "Fall Colors") + " graphic (AI-generated), cropped", credit: "313.events",
    rights_status: "supplied by 313.events; generation tool and terms not recorded", illustrative: true, depicts_actual_destination: false, warnings: [], image_kind: "generated-artwork" };
}
function deriveCats(col, note) {
  if (col === "fall") return /^Pumpkins$/i.test(note) || /^Orchard$/i.test(note) ? ["farm-experiences"] : /^Both$/i.test(note) ? ["cider-donuts", "farm-experiences"] : ["cider-donuts"];
  if (/river|lake|water|shore|bay|marsh|wetland|reservoir|falls/i.test(note)) return ["waterfronts"];
  if (/trail|wood|forest|hik|drive|cycl|greenway|prairie|savanna/i.test(note)) return ["trails-woods"];
  return ["parks-gardens"];
}
// The launch proposal flag. Membership comes from launch-1.json; the gate's own answer decides everything else. A proposed record that is
// approved, public or not READY_FOR_REVIEW is a build error: the proposal is for records awaiting approval.
function launchFor(col, e, rv, prim, batch) {
  // A proposed record is READY_FOR_REVIEW with no approval, or PUBLISHED with the approver's recorded approval (never one without the other).
  const approved = !!rv.gate.approval;
  if (approved ? !(e.status === "PUBLISHED" && ED.COLLECTIONS.isPublic(e)) : e.status !== "READY_FOR_REVIEW") throw new Error(col + "/" + e.id + ": a launch record must be READY_FOR_REVIEW with no approval, or PUBLISHED with a recorded approval");
  const route = rv.gate.imageRoute;
  return { batch: batch || proposal.batch, featured: !!e.featured, image_route: route, image_depicts_destination: !!prim.depicts_actual_destination,
    image_note: route === "owner-photo" ? "Image: your own photo of this place (owner-authorized), " + prim.id : route === "acquired-file" && prim.type === "licensed_third_party" ? "Image: openly licensed photograph (" + prim.rights_status.split(" (")[0] + ", Wikimedia Commons)" : route === "illustration" ? "Image: labelled illustration (generated artwork, not a photo of this place)" : "Image: " + route };
}
const datasets = {};
for (const col of ["fall", "fall-color"]) {
  const entriesById = Object.fromEntries(out[col].map((e) => [e.id, e]));
  const discoveredFile = (() => { try { return read("discovered-destinations.json"); } catch (e) { return { collections: {} }; } })();
  const discovered = (discoveredFile.collections[col] || []).map((d) => ({ collection: col, name: d.ledger_name, location: d.ledger_location, inventory_no: null, inventory_note: "", section: null, flags: ["Discovered during research: not in the research inventory; owner decision to add"], discovered: true, _item: d }));
  const rows = regOut.candidates.filter((c) => c.collection === col).concat(discovered);
  const records = [];
  let artN = 0;
  for (const c of rows) {
    const key = c.entry_key || c.published_id || slug(c.name);
    const e = c.discovered ? null : (entriesById[key] || null);
    const wh = city(c.location);
    const opts = [];
    const dest = destPhotos(col, c);
    // An openly licensed photograph (third-party license route, e.g. Wikimedia Commons) is its own option type and is the record's default.
    const licensed = !!(e && e.image && e.image.illustrative === false && !e.image.ownerPhoto && e.image.license && /^https:\/\//.test(e.image.licenseUrl || ""));
    // An archival photograph (image.historic === true, repo file, not an illustration) is its own QA option so the "Historic photo" badge can be reviewed in a preview. It carries no rights claim.
    const archival = !!(e && e.image && e.image.historic === true && e.image.illustrative === false && e.image.acquired && e.image.acquired.file === e.image.src);
    const defaultPick = e && e.image && e.image.ownerPhoto ? e.image.ownerPhoto.photoId : (archival ? "archival-" + e.id : (licensed ? "commons-" + e.id : null));
    dest.forEach((p) => opts.push(photoOpt(p, "owner_photo_destination")));
    if (archival) opts.unshift({ id: "archival-" + e.id, type: "archival_acquired", src: e.image.src, source: e.image.source, credit: "Kept in the private record (not drawn on the card)", rights_status: (e.image.provenance && e.image.provenance.rights) || "Not cleared",
      illustrative: false, depicts_actual_destination: true, historic: true, warnings: ["Archival photograph: shown with the Historic photo badge and no credit line. Rights not cleared; DEC-029 risk acceptance not recorded for this image."], image_kind: "photo" });
    if (licensed) opts.unshift({ id: "commons-" + e.id, type: "licensed_third_party", src: e.image.src, source: e.image.source, credit: e.image.credit, rights_status: e.image.license + " (" + e.image.licenseUrl + ")",
      illustrative: false, depicts_actual_destination: true, warnings: [], image_kind: "photo", rights_basis: "third-party-license", license_url: e.image.licenseUrl, source_page: e.image.commons && e.image.commons.filePage });
    let primary;
    const art1 = genOpt(col, e && e.image && !e.image.ownerPhoto && !licensed ? e.image.src : ART(col, 1 + (artN++ % ART_COUNT)), (e && e.image && !licensed && e.image.src.match(/-(\d)\.webp$/) || [0, 1 + artN % ART_COUNT])[1]);
    // The second card is the record's own first alternate when it has one, else a different card from the first (never a duplicate option id).
    let n2 = 1 + (artN + 3) % ART_COUNT;
    const alt0 = e && e.image && !e.image.ownerPhoto && !licensed && (e.image.alternates || []).find((u) => /-card-\d\.webp$/.test(u));
    if (alt0) n2 = +/-(\d)\.webp$/.exec(alt0)[1];
    if (n2 === +art1.id.split("-").pop()) n2 = 1 + (n2 % ART_COUNT);
    const art2 = genOpt(col, ART(col, n2), n2);
    ((e && e.image && e.image.linkedCandidates) || []).forEach((r, i) => {
      opts.push({ id: "link-" + e.id + (i ? "-" + i : ""), type: "linked_third_party", src: r.src, source: "Third-party page: " + r.sourcePage, credit: r.credit, rights_status: "not cleared: linked image; permission not confirmed; NOT licensed and not eligible for publication",
        illustrative: false, depicts_actual_destination: true, warnings: ["Linked third-party image: rights unresolved. Replaced by illustration or held until a licensed or owner photo exists."], image_kind: "photo", source_type: "third-party", permission_on_file: false,
        risk_acceptance: null, load_check: null });
    });
    opts.push(art1, art2);
    if (e && e.image && e.image.remoteParked && e.image.remoteParked.src) {
      const r = e.image.remoteParked;
      opts.push({ id: "link-" + e.id, type: "linked_third_party", src: r.src, source: "Third-party page: " + r.sourcePage, credit: r.credit, rights_status: "not cleared: linked image; permission not confirmed",
        illustrative: false, depicts_actual_destination: false, parked: true, warnings: ["Parked: the launch record does not use this linked image. Kept for reference only; no rights-holder permission is on file."], image_kind: "photo",
        source_type: "third-party", permission_on_file: false, risk_acceptance: null, load_check: null });
    }
    atm(col).forEach((p) => opts.push(photoOpt(p, "owner_photo_atmospheric")));
    primary = defaultPick || art1.id;
    const prim = opts.find((o) => o.id === primary) || opts[0];
    const options = [prim].concat(opts.filter((o) => o !== prim));
    const fallbacks = options.filter((o) => o.illustrative);
    let v = null;
    const item = c._item || launch.collections[col].find((x) => x.ledger_name === c.name && x.ledger_location === c.location);
    if (item) v = item.verification;
    const rv = e ? ED.review(e) : null;
    const curated = !!(e && handIds(col).has(e.id)), proposed = !!(e && (curatedIds(col).has(e.id) || expansionIds(col).has(e.id)));
    const status = curated ? (rv.gate.official && rv.gate.relevance ? "verified" : "partial") : !v ? "unverified" : v.read_ok ? (item.relevance_confirmed ? "verified" : "partial") : "unverified";
    const offEv = curated ? e.evidence.find((x) => x.level === "official") : null;
    const detail = curated ? "Official page read " + offEv.checkedAt + " (" + offEv.url + "), two independent reads. Relevance (" + (e.relevance.basis || "recorded") + "): " + e.relevance.note + " Season and hours are not shown on the card."
      : !v ? "Inventory candidate only. No official source has been read for this destination yet."
      : v.read_ok ? "Official page read " + DATE + " (" + v.official_url + "). " + (item.relevance_confirmed ? "Relevance to the collection proposed from the page. " : "Relevance to the collection NOT confirmed: " + (v.relevance || "") + " ") + "Season and hours are not shown on the card; the as-stated values are kept in the private record."
        : "Official page could not be read " + DATE + ". " + (v.flags || []).join("; ");
    const flags = (c.flags || []).slice();
    if (v && !curated) (v.flags || []).forEach((f) => flags.push(f));
    if (curated && e.relevance.basis && e.relevance.basis !== "direct-prose") flags.push("Weaker relevance basis (" + e.relevance.basis + ")");
    records.push({
      id: e ? e.id : (c.discovered ? "discovered-" + key : key), discovered: !!c.discovered, inventory_no: c.inventory_no || null, name: e ? e.name : c.name.replace(/’/g, "'"), city: e ? e.city : wh.city, region: e ? e.region : wh.region,
      categories: e ? e.categories : (item && item.categories) || deriveCats(col, c.inventory_note || c.section || ""), category_source: e ? "record" : "derived for QA only",
      advisory: (e && e.accessAdvisories && e.accessAdvisories.publicText) || null, summary: e ? e.summary : c.discovered ? c.name.replace(/’/g, "'") + " in " + wh.city + ". Listed features: " + (sentence(listOf(v || {})) || "its seasonal programs") + "." : (c.inventory_note || "") + ".", official_site: e && e.website || null, website: e && e.website || null, dates_hours: null,
      verification: { status, official_site_checked: !!(v && v.read_ok), detail, flags },
      public: e ? ED.COLLECTIONS.isPublic(e) : false,
      publication: rv ? { declared_status: e.status, state: rv.state, gate: { official: rv.gate.official, relevance: rv.gate.relevance, image: rv.gate.acquired, rights: rv.gate.rights, approval: rv.gate.approval },
        image_route: rv.gate.imageRoute, rights_route: rv.gate.rightsRoute, outstanding: rv.outstanding, caveats: rv.caveats, legacy: e.migration ? { was_published_on: e.migration.legacyBranch + " " + e.migration.legacyCommit, basis: e.migration.legacyBasis } : null }
        : { declared_status: "HOLD_UNVERIFIED", state: "HOLD_UNVERIFIED", gate: { official: false, relevance: false, image: false, rights: false, approval: false }, image_route: null, rights_route: null,
          outstanding: ["Gate 1, official-source verification: not yet read.", "Gate 2, relevance: not confirmed.", "Gate 3/4, image and rights: not complete.", "Gate 5, explicit publication approval: not recorded."], caveats: [], legacy: null },
      recorded_alternatives: [],
      launch: proposed ? launchFor(col, e, rv, prim, curatedIds(col).has(e.id) ? proposal.batch : expansion.batch) : null,
      manifest: { destination_id: e ? e.id : key, destination_name: c.name, primary_image: prim.src, primary_image_type: prim.type, primary_image_credit: prim.credit,
        primary_image_rights_status: prim.rights_status, fallback_image: (fallbacks[0] || art1).src, secondary_fallback_image: (fallbacks[1] || art2).src,
        alternative_images: options.slice(1).map((o) => o.id), image_status: prim.illustrative ? "generated_default" : "owner_photo", editorial_approval_status: "not_approved" },
      image_options: options
    });
  }
  const missing = [...handIds(col)].filter((id) => !out[col].some((e) => e.id === id));
  if (missing.length) throw new Error(col + ": launch-1.json lists records that do not exist: " + missing.join(", "));
  datasets[col] = { generated: DATE, collection: col, launch: { batch: proposal.batch, proposed: curatedIds(col).size, expansion: expansion.batch ? { batch: expansion.batch, proposed: expansionIds(col).size } : null }, note: "QA-only dataset. Served by /api/seasonal-qa outside production only. Not for public display. Nothing here is approved; the publication gate decides, and no approval is recorded.", records };
}

const files = [
  [E_DIR + "/entries.json", JSON.stringify(out, null, 1) + "\n"],
  [E_DIR + "/candidates.json", JSON.stringify(regOut, null, 1) + "\n"],
  [E_DIR + "/photo-library.json", JSON.stringify(libOut, null, 1)], // the file has no trailing newline
  [E_DIR + "/fall-qa.json", JSON.stringify(datasets.fall, null, 1) + "\n"],
  [E_DIR + "/fall-color-qa.json", JSON.stringify(datasets["fall-color"], null, 1) + "\n"]
];
if (process.argv.includes("--check")) {
  const stale = files.filter(([f, t]) => !fs.existsSync(path.join(root, f)) || fs.readFileSync(path.join(root, f), "utf8") !== t).map((x) => x[0]);
  if (stale.length) { console.error("stale: " + stale.join(", ")); process.exit(1); }
} else files.forEach(([f, t]) => fs.writeFileSync(path.join(root, f), t));
const summary = {};
for (const col of ["fall", "fall-color"]) { const s = {}; out[col].forEach((e) => { const k = stateOf(e); s[k] = (s[k] || 0) + 1; }); summary[col] = { records: out[col].length, states: s }; }
console.log(JSON.stringify(summary));
