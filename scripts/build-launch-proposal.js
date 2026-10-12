#!/usr/bin/env node
// scripts/build-launch-proposal.js
//
// Generates api/_lib/seasonal-editorial/LAUNCH_PROPOSAL_1.md: the proposed first incremental launch of /fall and
// /fall-color, derived from the private records (entries.json), launch-1.json, the verification log and the ledger.
// Private. Idempotent. No network. It records no approval and changes no record.
//   node scripts/build-launch-proposal.js          write
//   node scripts/build-launch-proposal.js --check  exit 1 if stale
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const ED = require("../api/_lib/seasonal-editorial/editorial.js");
const E_DIR = "api/_lib/seasonal-editorial";
const OUT = path.join(root, E_DIR, "LAUNCH_PROPOSAL_1.md");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, E_DIR, f), "utf8"));
const launch = readJson("launch-1.json"), ver = readJson("verification-2026-10-11.json").collections, cands = readJson("candidates.json").candidates;
const lib = readJson("photo-library.json");
const photos = Object.fromEntries(lib.destination_specific.concat(lib.editorial_atmospheric).map((p) => [p.id, p]));
const all = ED.entries(), C = ED.COLLECTIONS, SLUGS = ["fall", "fall-color"];
const TITLE = { fall: "/fall (Fall Is On.)", "fall-color": "/fall-color (Chase the Color)" };

const L = [];
const p = (s) => L.push(s === undefined ? "" : s);

function bucket(slug, r) {
  const p1 = r.pass1, p2 = r.pass2;
  if (!p1.official_found || (p2 && p2.verdict === "not-confirmed")) return "no-official";
  if (p1.location_confirmed === false) return "location";
  if (slug === "fall") {
    if (p2) return p2.currency === "stale" ? "stale" : p2.currency === "ambiguous" ? "season-ambiguous" : "weak-signal";
    return p1.season_2026 === "yes" ? "read-once-2026" : p1.season_2026 === "no" ? "closed-or-old" : "read-once-no-2026";
  }
  if (p2) return p2.relevance_basis === "character-only" ? "character-only" : "weak-signal";
  return "read-once";
}
const BUCKETS = {
  fall: [
    ["season-ambiguous", "Second read found no dated 2026 season statement (only a footer year or undated text). Re-check the season, then promote."],
    ["weak-signal", "Second read confirmed the place but the 2026 signal is thin or the site covers more than one location."],
    ["read-once-2026", "First read showed a 2026 signal; not yet re-read independently. Promote after a second read."],
    ["read-once-no-2026", "Official page read once; no 2026 season signal found."],
    ["stale", "Official page shows out-of-date season text."],
    ["closed-or-old", "Official page says it is closed for the season or shows only old-season text."],
    ["location", "Official page read, but the location did not match the inventory."],
    ["no-official", "No official website found or readable, so nothing can be verified from an official source."]
  ],
  "fall-color": [
    ["character-only", "Official page describes the park but does not mention fall color or leaves. Whether a park's character alone qualifies is an owner decision."],
    ["weak-signal", "Second read confirmed the place with a weak fall-color signal."],
    ["read-once", "Official page read once; fall-color relevance and a second read still to do."],
    ["location", "Official page read, but the location did not match the inventory."],
    ["no-official", "No official website found or readable."]
  ]
};

p("# Launch proposal 1: /fall and /fall-color");
p();
p("Private. Generated 2026-10-11 by `scripts/build-launch-proposal.js` from `entries.json`, `launch-1.json` and `verification-2026-10-11.json`. The consolidated integration branch keeps `launch-verification.json` and its records; these 16 are the curated records for the launch.");
p();
p("**Status: PROPOSED. Nothing here is approved and nothing is published.** Every record below is declared and derived `READY_FOR_REVIEW`: gate items 1 to 4 are recorded, gate item 5 (`approval {by, at}`) is empty. Only the approving person writes it. Halloween is on its own verification track and is not part of this batch.");
p();

const rows = SLUGS.map((s) => {
  const ids = launch.collections[s], recs = ids.map((id) => all[s].find((e) => e.id === id));
  const routes = recs.map((e) => C.gate(e).imageRoute);
  const inv = cands.filter((c) => c.collection === s);
  return { s, n: recs.length, own: routes.filter((r) => r === "owner-photo").length, ill: routes.filter((r) => r === "illustration").length, other: routes.filter((r) => r !== "owner-photo" && r !== "illustration").length, inv: inv.length, without: inv.filter((c) => !c.entry_id).length };
});
p("## At a glance");
p();
p("| Collection | Proposed | Your own photo | Labelled illustration | Inventory rows | Not yet proposed |");
p("|---|---|---|---|---|---|");
for (const r of rows) p("| " + TITLE[r.s] + " | " + r.n + " | " + r.own + " | " + r.ill + " | " + r.inv + " | " + (r.inv - r.n) + " |");
p();
p("Every proposed record has: a verified name and location taken from its official page, the official source URL, a recorded relevance note, and an image by a recorded route. No hours, admission, dates or accessibility appear on any card (none are displayed, so none are asserted). Season dates seen on official pages are kept in the evidence notes only.");
p();
p("## How to approve one record");
p();
p("Each record is its own decision. To approve, the approving person adds `\"approval\": { \"by\": \"<name>\", \"at\": \"YYYY-MM-DD\" }` to that record in `entries.json`, sets `status` to `PUBLISHED`, and runs `node scripts/build-seasonal.js`. The tests refuse a `PUBLISHED` status that the gate does not derive. Nothing in this repository writes an approval. To decline or hold a record, leave it as is. Swapping an image later changes only the record's `image` block, not its verified facts.");
p();
p("Preview: open `/fall?qa=1&launch=1` and `/fall-color?qa=1&launch=1` on a Vercel Preview of this branch. The **Launch preview** button in the QA bar switches between the full QA review and the proposed launch records drawn with the public card layout (hero, filters and cards unchanged). It exists only on Previews and local development.");
p();

function packet(slug, e, i) {
  const g = C.gate(e), rv = ED.review(e), im = e.image;
  const off = e.evidence.find((x) => x.level === "official");
  p("### " + (i + 1) + ". " + e.name + " (" + e.city + ", " + e.region + ")");
  p();
  p("- **Decision:** Approve / Hold / Decline (yours). State: `" + rv.state + "`. Outstanding: " + (rv.outstanding.length ? rv.outstanding.map((o) => o.replace(/:.*$/, "")).join("; ") : "none") + ".");
  p("- **Official source:** " + off.url + " (read " + off.checkedAt + ", two reads).");
  p("- **What the official page shows:** " + off.note);
  p("- **Relevance (" + (e.relevance.basis || "recorded") + "):** " + e.relevance.note);
  p("- **Card text:** " + e.summary);
  p("- **Categories:** " + e.categories.join(", ") + (e.featured ? " · proposed for the Don't-miss rail" : ""));
  if (g.imageRoute === "owner-photo") {
    const ph = photos[im.ownerPhoto.photoId];
    p("- **Image:** your own photo, `" + im.ownerPhoto.photoId + "` (" + ph.subject + "; captured " + ph.capture_date + "; original " + ph.original.filename + "). Rights: " + im.ownerPhoto.authorization.statement + ". The photographer's name and the date of the grant are not recorded. Credit text: " + im.credit + ". The approved public card shows no credit line for a non-linked photo.");
  } else {
    p("- **Image:** labelled illustration, `" + im.src.replace("/assets/seasonal/", "") + "` (generated artwork supplied by 313.events; tool and terms not recorded). The card carries the persistent \"Illustrative image\" badge. It is not a photograph of this place.");
  }
  if (im.remoteParked) p("- **Parked linked image:** " + im.remoteParked.src + " (" + im.remoteParked.credit + "). Not used by this record; kept in the QA view as an unadopted alternative.");
  if (rv.caveats.length) p("- **Caveats:** " + rv.caveats.join(" "));
  p();
}

for (const slug of SLUGS) {
  p("## " + TITLE[slug] + ": proposed records");
  p();
  launch.collections[slug].forEach((id, i) => packet(slug, all[slug].find((e) => e.id === id), i));
}

p("## Not proposed yet");
p();
for (const slug of SLUGS) {
  p("### " + TITLE[slug]);
  p();
  const inL = new Set(launch.collections[slug]);
  const byB = {};
  const rowsFor = cands.filter((c) => c.collection === slug);
  const verified = ver[slug];
  for (const r of verified) {
    const row = rowsFor.find((c) => c.name === r.name);
    const id = row && (row.entry_id || row.published_id);
    if (id && inL.has(id)) continue;
    (byB[bucket(slug, r)] = byB[bucket(slug, r)] || []).push(r.name);
  }
  const verifiedNames = new Set(verified.map((r) => r.name));
  const unread = rowsFor.filter((c) => !verifiedNames.has(c.name));
  for (const [k, why] of BUCKETS[slug]) if (byB[k]) { p("- **" + byB[k].length + (byB[k].length === 1 ? " row. " : " rows. ") + why + "** " + byB[k].join("; ") + "."); }
  p("- **" + unread.length + " inventory rows have not been read at all** (still HOLD_UNVERIFIED).");
  p();
}
const others = SLUGS.flatMap((sl) => all[sl].filter((e) => !launch.collections[sl].includes(e.id)).map((e) => ({ sl, e, st: C.readiness(e).state, route: C.gate(e).imageRoute })));
const rfr = others.filter((o) => o.st === "READY_FOR_REVIEW");
p("The integration branch's own reads (`launch-verification.json`, 50 destinations) and records are preserved as authored: " + others.length + " other fall and fall-color records stay out of this batch (" + others.filter((o) => o.st === "CONTENT_VERIFIED").length + " `CONTENT_VERIFIED`, " + others.filter((o) => o.st === "HOLD_UNVERIFIED").length + " `HOLD_UNVERIFIED`, " + rfr.length + " `READY_FOR_REVIEW`). " +
  (rfr.length ? "The `READY_FOR_REVIEW` ones are " + rfr.map((o) => o.e.name + " (" + o.route + " image)").join(", ") + "; they are not proposed, and any linked image on them is not adopted for launch." : ""));
p();

p("## Image sources audited, in your priority order");
p();
const own = cands.filter((c) => SLUGS.includes(c.collection) && (c.photos || []).length);
p("1. **Your library.** " + own.reduce((n, c) => n + c.photos.length, 0) + " owner photos are matched to " + own.length + " fall and fall-color inventory rows. Used: one for Diehl's (pumpkin field) and one for Highland. Not used: Long Family's four photos each show a person posing as the main subject (two were tagged \"incidental\" in the library metadata, which was wrong); Cranbrook's two are August and February shots; Apple Charlie's 13 photos belong to a place with no official source yet; the remaining fall-color matches are spring, summer or winter shots, details, or places outside Michigan, not autumn color here. The library's description of the Highland photo said boardwalk; it is a gravel trail beside a road, and the entry was corrected. Diehl's has 24 other photos (donuts, hayride, corn maze, cider counter) that can replace the pumpkin photo.");
p("2. **Official photography with documented reuse rights.** None found. Official pages show images, but none of the pages read states reuse terms for them, so none is used. Publicly viewable is not treated as permission.");
p("3. **Wikimedia Commons.** Not checked: the Commons site could not be reached from this environment, and the search budget was exhausted. No Commons image is proposed, and no license or credit is asserted. Unverified leads to check by hand: Yates Cider Mill main building, Franklin historic mill, Wasem Fruit Farm orchard, Category:Kensington Metropark, Cranbrook, Belle Isle, Matthaei Botanical Gardens, Hudson Mills, Huron Meadows, Dexter-Huron, Lower Huron.");
p("4. **Existing generated artwork.** Used for " + rows.reduce((n, r) => n + r.ill, 0) + " records as labelled temporary illustrations, with the \"Illustrative image\" badge. Eight generated cards per collection are reused across records, so a few records share an image. Three of the fall-color cards show the Detroit skyline, so they were deliberately not used for suburban parks.");
p();

p("## Blockers and owner decisions");
p();
p("1. **Approval (gate 5)** for each record you want public. None is recorded.");
p("2. **Relevance standard for /fall-color.** Indian Springs and Cranbrook have official prose that mentions fall color. Stony Creek's page says only \"spectacular fall views\". Highland's and Holly's official pages mention fall leaves only in photo captions. They are proposed with that basis stated on the record; you can drop them. " + ((byFC => byFC)(ver["fall-color"].filter((r) => r.pass2 && r.pass2.relevance_basis === "character-only").length)) + " other parks were held because their official pages describe the park without mentioning fall color.");
p("3. **Owner-photo credit and rights.** The photographer's name and the date of the grant are not recorded for any library photo. The existing Photo Credits page (`/copyright#photo-credits`) now explains both card image kinds: a photo credited \"313.events archive\" is used with the photographer's authorization to 313.events (photographer not named), and \"Illustrative image\" cards show generated artwork. If you want a named photographer credited, supply the name. The approved card layout is unchanged and shows no per-card credit line.");
p("4. **Public projection (fixed).** A published record now reaches `published-entries.js` in display form only: id, name, city, region, categories, featured, summary, website and the image source fields. Evidence notes and URLs, reviewer names, relevance notes, owner-photo authorization and library ids, file hashes, risk-acceptance text, parked images and the approval `{by, at}` stay private. A test covers all 16 records approved in memory.");
p("5. **Linked images** (Wiard's and Stony Creek had one; no launch record uses one). They are parked, not adopted. Your 2026-10-11 acceptance of linked-image risk is a decision about risk, not usage rights; no rights-holder permission is on file.");
p("6. **Season currency.** Several fall rows need a second read of the season before they can be proposed (see Not proposed yet).");
p("7. **Highland's address.** The official Michigan DNR page gives White Lake (48383); your inventory said Highland. The card says White Lake.");
p("8. **Wiard's.** The Country Fair attractions read \"Temporarily Closed\" on the page read, so the card no longer mentions the Country Fair.");
p("9. **Verification method.** Official pages were read through a page-summarising fetch tool, twice for each proposed record. That tool returns a model's summary, not a page capture. Re-confirm against the live page at approval.");
p();
const text = L.join("\n") + "\n";
if (process.argv.includes("--check")) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== text) { console.error("stale: " + E_DIR + "/LAUNCH_PROPOSAL_1.md"); process.exit(1); }
} else fs.writeFileSync(OUT, text);
