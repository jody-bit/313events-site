"use strict";

// api/_lib/venue-resolver.js
//
// Reusable venue resolver, v0 (offline, read-only). Pure and synchronous:
// callers preload ctx and the function does no I/O and writes nothing.
//
//   resolveVenue(input, ctx) -> {
//     status: verified | proposed | ambiguous | conflict | preserved | unresolved,
//     reason_code, identity, fill, evidence, candidates, flags, write: "none"
//   }
//
// input: { event_id, venue_id, venue_name_raw, address, city, source,
//          source_url, online_flag, internal_note }
// ctx:   { venues:    [{ id, name, address, city, zip, lat, lng }],
//          knowledge: [{ venue_id, address, city, tier, sources:[], url }] }
//
// Rules: only EMPTY fields are filled, never overwritten. Verified needs a
// unique exact normalized-name match, or an address match, backed by the
// canonical tier or at least 2 independent sources. One source gives
// "proposed" (a person decides). Locked, online, mobile, multisite and TBA
// rows come back "preserved" with a flag and no fill.

const path = require("path");
const { normalizeVenueName, normalizeAddressCity, isPlaceholderVenueName, citiesConflict, isBlank } =
  require(path.join(__dirname, "venue-lookup"));

const LOCK_RE = /(OWNER-CORRECTION|EDITORIAL[-_ ]HOLD)/;
const ONLINE_RE = /^(online|virtual|livestream|live stream|zoom|webinar)\b/i;
const MOBILE_RE = /\b(food truck|mobile|bus tour|walking tour|ride|parade route|various locations?)\b/i;
const MULTISITE_RE = /\b(multiple (venues|locations|sites)|citywide|city-wide|throughout|multiple sites)\b/i;
const FILL_FIELDS = ["address", "city", "zip", "lat", "lng"];

function result(status, reason_code, extra) {
  return Object.assign(
    { status, reason_code, identity: null, fill: {}, evidence: [], candidates: [], flags: [], write: "none" },
    extra || {}
  );
}

function missingFill(venue, input) {
  const fill = {};
  const have = { address: input.address, city: input.city };
  for (const f of FILL_FIELDS) {
    if (isBlank(have[f]) && !isBlank(venue[f])) fill[f] = venue[f];
  }
  return fill;
}

function identityOf(v, tier) {
  return { venue_id: v.id, canonical_name: v.name, tier };
}

function resolveVenue(input, ctx) {
  const inp = input || {};
  const venues = (ctx && ctx.venues) || [];
  const knowledge = (ctx && ctx.knowledge) || [];
  const flags = [];
  const name = typeof inp.venue_name_raw === "string" ? inp.venue_name_raw.trim() : "";

  if (LOCK_RE.test(String(inp.internal_note || "")) || inp.source === "Manual") flags.push("OWNER_LOCKED");
  if (inp.online_flag === true || ONLINE_RE.test(name)) flags.push("ONLINE");
  if (MOBILE_RE.test(name)) flags.push("MOBILE");
  if (MULTISITE_RE.test(name)) flags.push("MULTISITE");
  if (!name || isPlaceholderVenueName(name) || /^tba\b/i.test(name)) flags.push("TBA");
  if (flags.length) return result("preserved", flags[0], { flags });

  // Already linked: confirm or flag a conflict, never relink.
  const linked = !isBlank(inp.venue_id) ? venues.find((v) => v.id === inp.venue_id) : null;
  const key = normalizeVenueName(name);
  const byName = venues.filter((v) => normalizeVenueName(v.name) === key);
  const candidatesFrom = (list) => list.map((v) => ({ venue_id: v.id, score: 1 }));

  let match = null;
  let how = null;
  if (linked) {
    match = linked;
    how = "linked";
  } else if (byName.length === 1) {
    match = byName[0];
    how = "name";
  } else if (byName.length > 1) {
    return result("ambiguous", "AMBIGUOUS_NAME", { candidates: candidatesFrom(byName) });
  } else {
    const ak = normalizeAddressCity(inp.address, inp.city);
    if (ak) {
      const byAddr = venues.filter((v) => normalizeAddressCity(v.address, v.city) === ak);
      if (byAddr.length === 1) {
        match = byAddr[0];
        how = "address";
      } else if (byAddr.length > 1) {
        return result("ambiguous", "AMBIGUOUS_ADDRESS", { candidates: candidatesFrom(byAddr) });
      }
    }
  }
  if (!match) return result("unresolved", "NO_MATCH");

  // A stated city that disagrees with the venue's is a conflict, not a fill.
  if (!isBlank(inp.city) && !isBlank(match.city) && citiesConflict(inp.city, match.city)) {
    return result("conflict", "CITY_CONFLICT", {
      identity: identityOf(match, null),
      flags: ["EXISTING_VALUE_CONFLICT"],
      candidates: candidatesFrom([match]),
    });
  }

  const know = knowledge.filter((k) => k.venue_id === match.id);
  const evidence = know.map((k) => ({ source: (k.sources || []).join("+") || null, tier: k.tier || null, kind: how, url: k.url || null }));
  const independent = new Set(know.flatMap((k) => k.sources || [])).size;
  const canonical = know.some((k) => k.tier === "canonical");
  const tier = canonical ? "canonical" : know.length ? know[0].tier || null : null;
  const verified = how === "linked" || canonical || independent >= 2;
  const fill = missingFill(match, inp);

  return result(verified ? "verified" : "proposed", verified ? "VERIFIED_" + how.toUpperCase() : "SINGLE_SOURCE", {
    identity: identityOf(match, tier),
    fill,
    evidence,
  });
}

module.exports = { resolveVenue };
