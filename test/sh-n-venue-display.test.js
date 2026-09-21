// test/sh-n-venue-display.test.js — SH.N (Metadata Self-Healing, EPIC-006).
//
// SH.N's job is presentation-layer normalization: every public surface that
// shows an event's venue name/address/city must prefer canonical venues
// data (reached through a real venue_id) over the event's own raw text
// fields, falling back to raw only when venue_id is null/unresolved or the
// canonical field itself is blank — and never inventing a value neither
// source has. That precedence rule lives as resolveVenueDisplay(), a small,
// fully self-contained pure function (no DOM, no network) duplicated
// verbatim across calendar.html, map.html, event-template.html, and
// radar.html (this project has no build step — every page duplicates its
// own small helpers, see radar.html's own header comment), plus a Node-side
// twin (resolvePublicVenueDisplay) in api/_lib/venue-lookup.js used by
// api/event-meta.js.
//
// This file: (1) extracts the function's exact source out of each HTML
// page via regex and eval()s it — testing the real shipped code, not a
// reimplementation — and asserts all four browser copies are byte-for-byte
// identical (the "keep every copy in sync" contract those files' own
// comments promise); (2) runs the full acceptance-criteria precedence
// matrix against one browser copy AND the Node twin, asserting identical
// results from both (browser/Node parity); (3) does light structural/
// wiring checks per consuming surface (query embeds venue_id + venues(...),
// the mapping function actually calls resolveVenueDisplay, unrelated
// fields are untouched, admin files are untouched, and map.html/
// calendar.html's legacy name-matching pin fallback is still present
// unchanged — additive, not replaced).
//
// No DOM is exercised (decodeEntities() uses document.createElement, not
// available in plain Node, and this project has no jsdom dependency to add
// one) — full-page rendering is out of scope for this suite by design; see
// the SH.N completion report for how surfaces 8/9/10 were otherwise
// verified (code review against the acceptance-criteria examples).
//
// Run: node test/sh-n-venue-display.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function extractResolveVenueDisplay(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  const m = html.match(/function resolveVenueDisplay\([\s\S]*?\n\}\n/);
  if (!m) throw new Error(`resolveVenueDisplay() not found in ${filePath}`);
  return m[0];
}

function evalFn(source) {
  // eslint-disable-next-line no-new-func
  return new Function(`return ${source}`)();
}

async function run() {
  const HTML_FILES = ["calendar.html", "map.html", "event-template.html", "radar.html"];
  const sources = {};
  for (const f of HTML_FILES) {
    sources[f] = extractResolveVenueDisplay(`${REPO_DIR}/${f}`);
  }
  console.log("PASS: resolveVenueDisplay() extracted from all four public pages");

  // --- 1. all four browser copies are byte-for-byte identical ---
  const canonical = sources["calendar.html"];
  for (const f of HTML_FILES) {
    assert.strictEqual(sources[f], canonical, `${f}'s resolveVenueDisplay() has drifted from calendar.html's copy`);
  }
  console.log("PASS: resolveVenueDisplay() is byte-for-byte identical across calendar.html, map.html, event-template.html, radar.html");

  const browserFn = evalFn(canonical);

  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/venue-lookup.js`)];
  const { resolvePublicVenueDisplay: nodeFn } = require(`${REPO_DIR}/api/_lib/venue-lookup.js`);

  // Run every scenario against BOTH the browser copy and the Node twin,
  // asserting identical results — the real behavioral-parity bar, not just
  // textual sameness within the browser copies.
  function bothAgree(row, expected, label) {
    const b = browserFn(row);
    const n = nodeFn(row);
    assert.deepStrictEqual(b, expected, `browser resolveVenueDisplay() wrong for: ${label}`);
    assert.deepStrictEqual(n, expected, `Node resolvePublicVenueDisplay() wrong for: ${label}`);
    assert.deepStrictEqual(b, n, `browser/Node disagree for: ${label}`);
  }

  // --- Acceptance criterion 1: valid venue_id + complete canonical venue -> canonical displayed ---
  bothAgree(
    { venue_id: "v1", venue_name_raw: "Raw Name", venue_address_raw: "1 Raw St", venue_city_raw: "Raw City",
      venues: { name: "Canonical Venue", address: "123 Canonical Ave", city: "Detroit", lat: 42.33, lng: -83.05 } },
    { name: "Canonical Venue", address: "123 Canonical Ave", city: "Detroit", lat: 42.33, lng: -83.05 },
    "criterion 1 — complete canonical venue"
  );
  console.log("PASS: 1. valid venue_id + complete canonical venue -> canonical name/address/city");

  // --- Acceptance criterion 2: canonical address missing, raw present -> raw address shown ---
  bothAgree(
    { venue_id: "v1", venue_name_raw: "Raw Name", venue_address_raw: "1 Raw St", venue_city_raw: "Raw City",
      venues: { name: "Canonical Venue", address: null, city: "Canonical City", lat: 1, lng: 2 } },
    { name: "Canonical Venue", address: "1 Raw St", city: "Canonical City", lat: 1, lng: 2 },
    "criterion 2 — canonical address missing"
  );
  console.log("PASS: 2. valid venue_id + canonical address missing + raw address present -> raw address displayed");

  // --- Acceptance criterion 3: canonical city missing, raw present -> raw city shown ---
  bothAgree(
    { venue_id: "v1", venue_name_raw: "Raw Name", venue_address_raw: "1 Raw St", venue_city_raw: "Raw City",
      venues: { name: "Canonical Venue", address: "123 Canonical Ave", city: null, lat: 1, lng: 2 } },
    { name: "Canonical Venue", address: "123 Canonical Ave", city: "Raw City", lat: 1, lng: 2 },
    "criterion 3 — canonical city missing"
  );
  console.log("PASS: 3. valid venue_id + canonical city missing + raw city present -> raw city displayed");

  // --- Acceptance criterion 4: venue_id null -> raw metadata displayed ---
  bothAgree(
    { venue_id: null, venue_name_raw: "Raw Name", venue_address_raw: "1 Raw St", venue_city_raw: "Raw City", venues: null },
    { name: "Raw Name", address: "1 Raw St", city: "Raw City", lat: null, lng: null },
    "criterion 4 — venue_id null"
  );
  console.log("PASS: 4. venue_id null + raw venue metadata -> raw metadata displayed");

  // --- Acceptance criterion 5: canonical and raw disagree -> canonical wins ---
  bothAgree(
    { venue_id: "v1", venue_name_raw: "Old Name", venue_address_raw: "Old Address", venue_city_raw: "Old City",
      venues: { name: "New Name", address: "New Address", city: "New City", lat: 1, lng: 2 } },
    { name: "New Name", address: "New Address", city: "New City", lat: 1, lng: 2 },
    "criterion 5 — canonical/raw disagree"
  );
  console.log("PASS: 5. canonical and raw values disagree -> canonical value displayed");

  // --- Acceptance criterion 6: no canonical or raw address -> no address invented ---
  bothAgree(
    { venue_id: "v1", venue_name_raw: "Raw Name", venue_address_raw: null, venue_city_raw: null,
      venues: { name: "Canonical Venue", address: null, city: null, lat: null, lng: null } },
    { name: "Canonical Venue", address: null, city: null, lat: null, lng: null },
    "criterion 6 — no canonical or raw address"
  );
  bothAgree(
    { venue_id: null, venue_name_raw: null, venue_address_raw: null, venue_city_raw: null, venues: null },
    { name: null, address: null, city: null, lat: null, lng: null },
    "criterion 6b — nothing at all"
  );
  console.log("PASS: 6. no canonical or raw address -> no address invented (null, not fabricated)");

  // --- Acceptance criterion 7: TBA/unknown venue behavior remains valid ---
  // resolveVenueDisplay() itself never invents "Venue TBA" text — that
  // fallback lives one layer up, in each page's own mapping function
  // (`decodeEntities(vd.name) || "Venue TBA"`), unchanged by this WP. What
  // this function must do is hand that layer a real null, not a guess, when
  // neither source has a name — proven by criterion 6b above. Confirm the
  // "|| \"Venue TBA\"" fallback text is still present, unedited, in every
  // consuming page's mapping function.
  for (const f of HTML_FILES) {
    const html = fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
    assert.ok(/decodeEntities\((?:vd\.name|resolveVenueDisplay\(r\.events\)\.name)\) \|\| ['"]Venue TBA['"]/.test(html),
      `${f} lost its "Venue TBA" fallback for a null resolved name`);
  }
  console.log("PASS: 7. TBA/unknown venue fallback ('Venue TBA') is preserved in every consuming page");

  // --- Explicit architectural check (SH.N acceptance): if SH.1's production
  // repair NEVER ran (raw fields stay null), an event with a valid venue_id
  // and a real canonical address must still display that address. ---
  bothAgree(
    { venue_id: "v1", venue_name_raw: null, venue_address_raw: null, venue_city_raw: null,
      venues: { name: "Canonical Venue", address: "123 Canonical Ave", city: "Detroit", lat: 42.33, lng: -83.05 } },
    { name: "Canonical Venue", address: "123 Canonical Ave", city: "Detroit", lat: 42.33, lng: -83.05 },
    "architectural check — SH.1 never ran, canonical still displays"
  );
  console.log("PASS: architectural check — a venue_id-linked event with a real canonical address displays it even with every raw field null (SH.1 never having run)");

  // --- Surface wiring checks (criteria 8/9/10: each surface actually calls
  // resolveVenueDisplay() and embeds venue_id + venues(...) in its query) ---
  const calendarHtml = fs.readFileSync(`${REPO_DIR}/calendar.html`, "utf8");
  assert.ok(/venue_id,venues\(name,address,city,lat,lng\)/.test(calendarHtml), "calendar.html's query is missing the venues(...) embed");
  assert.ok(/const vd = resolveVenueDisplay\(row\);/.test(calendarHtml), "calendar.html's mapSupabaseRow doesn't call resolveVenueDisplay");
  console.log("PASS: 9. calendar.html embeds canonical venue data and resolves it through resolveVenueDisplay()");

  const mapHtml = fs.readFileSync(`${REPO_DIR}/map.html`, "utf8");
  assert.ok(/venue_id,venues\(name,address,city,lat,lng\)/.test(mapHtml), "map.html's query is missing the venues(...) embed");
  assert.ok(/const vd = resolveVenueDisplay\(row\);/.test(mapHtml), "map.html's mapSupabaseRow doesn't call resolveVenueDisplay");
  console.log("PASS: 8/11. map.html embeds canonical venue data and resolves it through resolveVenueDisplay()");

  const eventTemplateHtml = fs.readFileSync(`${REPO_DIR}/event-template.html`, "utf8");
  assert.ok(/venue_id,venues\(name,address,city,lat,lng\)/.test(eventTemplateHtml), "event-template.html's query is missing the venues(...) embed");
  assert.ok(/const vd = resolveVenueDisplay\(row\);/.test(eventTemplateHtml), "event-template.html's mapRow doesn't call resolveVenueDisplay");
  console.log("PASS: 10. event-template.html embeds canonical venue data and resolves it through resolveVenueDisplay()");

  const radarHtml = fs.readFileSync(`${REPO_DIR}/radar.html`, "utf8");
  assert.ok(/venue_id,venue_name_raw,venue_city_raw,venues\(name,city\)/.test(radarHtml), "radar.html's nested embed is missing venue_id/venues(...)");
  assert.ok(/resolveVenueDisplay\(r\.events\)/.test(radarHtml), "radar.html's article mapping doesn't call resolveVenueDisplay");
  console.log("PASS: radar.html (additional public surface found during the audit) embeds canonical venue data and resolves it through resolveVenueDisplay()");

  const eventMetaJs = fs.readFileSync(`${REPO_DIR}/api/event-meta.js`, "utf8");
  assert.ok(/venue_id,venue_name_raw,venue_city_raw,venues\(name,city\)/.test(eventMetaJs), "event-meta.js's query is missing venue_id/venues(...)");
  assert.ok(/resolvePublicVenueDisplay\(e\)/.test(eventMetaJs), "event-meta.js doesn't call resolvePublicVenueDisplay");
  console.log("PASS: api/event-meta.js (server-rendered social-preview tags, additional surface found during the audit) uses the Node-side resolver");

  // --- Criterion 11: map behavior does not regress — the legacy
  // name-matching VENUE_LATLNG_MAP/loadVenueLatLng() fallback must still be
  // present, unchanged, in both calendar.html and map.html; the new
  // canonical-coordinate path must be additive (checked first, falls
  // through to the old path, never replaces it). ---
  for (const f of ["calendar.html", "map.html"]) {
    const html = fs.readFileSync(`${REPO_DIR}/${f}`, "utf8");
    assert.ok(/const VENUE_LATLNG_MAP = new Map\(\);/.test(html), `${f} lost its legacy VENUE_LATLNG_MAP fallback`);
    assert.ok(/async function loadVenueLatLng\(\)/.test(html), `${f} lost its legacy loadVenueLatLng() fallback`);
    const resolvePlaceMatch = html.match(/function resolvePlace\(e\)\{[\s\S]*?\n\}/);
    assert.ok(resolvePlaceMatch, `${f}'s resolvePlace() not found`);
    const body = resolvePlaceMatch[0];
    const canonicalIdx = body.indexOf("e.canonicalLat");
    const legacyIdx = body.indexOf("VENUE_LATLNG_MAP.get(vKey)");
    assert.ok(canonicalIdx !== -1 && legacyIdx !== -1 && canonicalIdx < legacyIdx,
      `${f}'s resolvePlace() must check canonical coordinates before falling back to the legacy name-match map`);
  }
  console.log("PASS: 11. map.html and calendar.html's legacy name-matching pin fallback is preserved unchanged; canonical venue_id coordinates are an additive, preferred path, not a replacement");

  // --- Criterion 12: admin behavior untouched ---
  const adminHtml = fs.readFileSync(`${REPO_DIR}/admin.html`, "utf8");
  const adminEventsJs = fs.readFileSync(`${REPO_DIR}/api/admin-events.js`, "utf8");
  assert.ok(!/resolveVenueDisplay/.test(adminHtml), "admin.html should not have been touched by SH.N");
  assert.ok(!/resolveVenueDisplay|resolvePublicVenueDisplay/.test(adminEventsJs), "api/admin-events.js should not have been touched by SH.N");
  console.log("PASS: 12. admin.html and api/admin-events.js (Needs Follow-up) are untouched by SH.N");

  // --- Criterion 13: unrelated event metadata fields still present in each
  // mapping function (a light smoke check that surrounding code wasn't
  // clobbered by the surgical edits above) ---
  assert.ok(/ticketUrl: row\.ticket_url \|\| undefined/.test(calendarHtml), "calendar.html lost an unrelated field (ticketUrl)");
  assert.ok(/priceFrom: row\.price_from/.test(calendarHtml), "calendar.html lost an unrelated field (priceFrom)");
  assert.ok(/ticketStatus: row\.ticket_status \|\| undefined/.test(eventTemplateHtml), "event-template.html lost an unrelated field (ticketStatus)");
  assert.ok(/clothingOptional: !!row\.is_clothing_optional/.test(eventTemplateHtml), "event-template.html lost an unrelated field (clothingOptional)");
  assert.ok(/imageUrl: row\.image_url \|\| undefined/.test(mapHtml), "map.html lost an unrelated field (imageUrl)");
  console.log("PASS: 13. unrelated event metadata fields are unchanged in every edited mapping function");

  console.log("\nAll SH.N venue-display resolution tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
