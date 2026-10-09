"use strict";
// test/venue-knowledge.test.js — Issue #49 (Admin Hardening): reusable venue
// knowledge resolves location gaps, conservatively. One check per case the
// Product Owner listed on 2026-10-09, plus the ones the production
// evaluation surfaced. No network: every input is in this file.

const assert = require("assert");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const K = require(path.join(ROOT, "api/_lib/venue-knowledge"));
const { resolveVenueAddressCityRepair, buildLearnedVenueAddressCityMap, buildVenueDetailsMap } = require(path.join(ROOT, "api/_lib/venue-lookup"));
const { repairExistingEvents } = require(path.join(ROOT, "scripts/sh1-repair-existing-venue-address-city"));

let n = 0;
const check = (label, fn) => { fn(); n++; console.log("PASS: " + label); };

let seq = 0;
const ev = (o) => ({ id: o.id || `e${++seq}`, status: "approved", start_date: o.start_date || `2026-10-${String(10 + (seq % 18)).padStart(2, "0")}`, venue_id: null, venue_address_raw: null, venue_city_raw: null, source: "Resident Advisor", external_id: o.external_id === undefined ? `ra-${1000 + seq}` : o.external_id, feed_source_id: null, no_fixed_venue: false, internal_note: null, ...o });
const know = (events, venues = []) => K.buildVenueKnowledge({ events, venues });

// Two independent sources agree on Tigris.
const TIGRIS = [
  ev({ venue_name_raw: "Tigris", venue_address_raw: "2545 Bagley St", venue_city_raw: "Detroit" }),
  ev({ venue_name_raw: "Tigris", venue_address_raw: "2545 Bagley Street", venue_city_raw: "Detroit, MI 48216", source: "Venue Submission", external_id: null }),
];

check("known venue + missing address: two independent sources fill the street", () => {
  const k = know(TIGRIS);
  assert.strictEqual(k.byName.get("tigris").status, "learned");
  const d = K.resolveLocationGap(ev({ venue_name_raw: "Tigris", venue_city_raw: "Detroit" }), k);
  assert.strictEqual(d.action, "fill");
  assert.deepStrictEqual(d.patch, { venue_address_raw: "2545 Bagley St" });
});

check("known venue + missing city: the city is filled, the event's own street kept", () => {
  const d = K.resolveLocationGap(ev({ venue_name_raw: "Tigris", venue_address_raw: "2545 Bagley St." }), know(TIGRIS));
  assert.strictEqual(d.action, "fill");
  assert.deepStrictEqual(d.patch, { venue_city_raw: "Detroit" });
});

check("a better event address survives: a different street on the event is a conflict, never overwritten", () => {
  const d = K.resolveLocationGap(ev({ venue_name_raw: "Tigris", venue_address_raw: "1 Other Rd" }), know(TIGRIS));
  assert.strictEqual(d.action, "conflict");
  assert.deepStrictEqual(d.patch, {});
});

check("a better event city survives: nothing on a fully stated event is touched", () => {
  const d = K.resolveLocationGap(ev({ venue_name_raw: "Tigris", venue_address_raw: "2545 Bagley St", venue_city_raw: "Detroit" }), know(TIGRIS));
  assert.strictEqual(d.action, "none");
  const patch = resolveVenueAddressCityRepair({ venue_id: "v1", venue_name_raw: "X", venue_address_raw: "9 A St", venue_city_raw: "Troy" }, { byId: new Map([["v1", { id: "v1", address: "1 B St", city: "Detroit" }]]), byName: new Map() }, new Map());
  assert.deepStrictEqual(patch, {});
});

check("an event/venue city conflict is surfaced, not filled (Needs Decision)", () => {
  const d = K.resolveLocationGap(ev({ venue_name_raw: "Tigris", venue_city_raw: "Ferndale" }), know(TIGRIS));
  assert.strictEqual(d.action, "conflict");
  assert.strictEqual(d.reason, "event_city_disagrees");
  const s = K.summarizeVenueRepairs([ev({ venue_name_raw: "Tigris", venue_city_raw: "Ferndale" })], know(TIGRIS));
  assert.strictEqual(s.totals.conflict, 1);
});

check("Venue TBA (and every TBA wording) is excluded and inherits nothing", () => {
  for (const name of ["Venue TBA", "TBA", "Location TBA", "TBA - Secret Location", "TBA - The Vault 313 (16940 Hamilton)", "Venue TBD"]) {
    assert.strictEqual(K.exclusionReason(name), "tba", name);
    const k = know([...TIGRIS, ev({ venue_name_raw: name, venue_address_raw: "2545 Bagley St", venue_city_raw: "Detroit" }), ev({ venue_name_raw: name, venue_address_raw: "2545 Bagley St", venue_city_raw: "Detroit", source: "Venue Submission", external_id: null })]);
    assert.strictEqual(k.byName.has(name.toLowerCase()), false, `${name}: never knowledge`);
    assert.strictEqual(K.resolveLocationGap(ev({ venue_name_raw: name }), k).action, "excluded");
  }
  const tba = { id: "venue-tba", name: "Venue TBA", address: null, city: "Detroit" };
  assert.deepStrictEqual(resolveVenueAddressCityRepair({ venue_id: "venue-tba", venue_name_raw: "Venue TBA" }, { byId: new Map([["venue-tba", tba]]), byName: new Map([["venue tba", tba]]) }, new Map()), {});
});

check("Multiple Locations is excluded", () => {
  for (const name of ["Multiple Locations", "Various locations around Detroit", "Citywide"]) assert.strictEqual(K.exclusionReason(name), "multiple_locations", name);
  assert.strictEqual(K.resolveLocationGap(ev({ venue_name_raw: "Multiple Locations" }), know([])).action, "excluded");
});

check("secret and mobile venues are excluded", () => {
  assert.strictEqual(K.exclusionReason("Venue TBA (secret loft, revealed to ticket holders)"), "tba");
  assert.strictEqual(K.exclusionReason("Secret warehouse"), "secret");
  assert.strictEqual(K.exclusionReason("Address sent to ticket holders"), "secret");
  assert.strictEqual(K.exclusionReason("Downtown pub crawl"), "mobile");
  assert.strictEqual(K.exclusionReason("Eastern Market", { no_fixed_venue: true }), "mobile");
  assert.strictEqual(K.resolveLocationGap(ev({ venue_name_raw: "Tigris", no_fixed_venue: true }), know(TIGRIS)).action, "excluded", "a mobile event is never given a venue's street, even a known one");
  assert.strictEqual(K.exclusionReason("Pelissier Street (between Wyandotte & Park)"), "street_segment");
  assert.strictEqual(K.exclusionReason("Woodward Avenue"), "street_segment");
  assert.strictEqual(K.exclusionReason("Online"), "online");
  assert.strictEqual(K.exclusionReason("Tigris"), null);
  assert.strictEqual(K.exclusionReason("The Fillmore Detroit"), null);
});

check("an ambiguous venue name (one name, different cities) is excluded", () => {
  const k = know([
    ev({ venue_name_raw: "Community Center", venue_address_raw: "100 Main St", venue_city_raw: "Livonia", source: "City of Livonia", external_id: "feed-1-a" }),
    ev({ venue_name_raw: "Community Center", venue_address_raw: "5 Elm St", venue_city_raw: "Troy", source: "City of Troy", external_id: null }),
    ev({ venue_name_raw: "Community Center", venue_address_raw: "5 Elm St", venue_city_raw: "Troy", source: "Troy Library", external_id: null }),
  ]);
  assert.strictEqual(k.byName.get("community center").status, "ambiguous");
  const d = K.resolveLocationGap(ev({ venue_name_raw: "Community Center" }), k);
  assert.strictEqual(d.action, "excluded");
  assert.strictEqual(d.reason, "ambiguous_name");
  // Two canonical venues of one name are ambiguous too.
  const k2 = know([], [{ id: "a", name: "The Loft", address: "1 A St", city: "Detroit" }, { id: "b", name: "The Loft", address: "2 B St", city: "Ferndale" }]);
  assert.strictEqual(K.resolveLocationGap(ev({ venue_name_raw: "The Loft" }), k2).action, "excluded");
});

check("repeated events at a known venue do not repeatedly enter Needs Follow-Up (every new event resolves the same way)", () => {
  const k = know(TIGRIS);
  for (let i = 0; i < 5; i++) assert.strictEqual(K.resolveLocationGap(ev({ venue_name_raw: "Tigris", start_date: `2026-11-0${i + 1}` }), k).action, "fill");
  // ...and knowledge is not weakened by its own fills: a filled row carries the marker and is not evidence.
  const filled = ev({ venue_name_raw: "Tigris", venue_address_raw: "2545 Bagley St", venue_city_raw: "Detroit", internal_note: `${K.FILL_MARKER} 2026-10-09: venue_address_raw from learned` });
  assert.strictEqual(know([...TIGRIS, filled]).byName.get("tigris").evidence.rows, 2);
});

check("a successful repair removes the actionable location condition", () => {
  const vm = require("vm");
  const fs = require("fs");
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  const a = html.indexOf("function getMissingFields(e)");
  const b = html.indexOf("\n}\n", a) + 3;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(html.slice(a, b) + ";this.g=getMissingFields;", ctx);
  const before = ev({ venue_name_raw: "Tigris", description: "x", ticket_url: "https://t", time_display: "9 PM" });
  assert.ok(ctx.g(before).includes("venue address/city"));
  const d = K.resolveLocationGap(before, know(TIGRIS));
  // With no city either, both fields come from knowledge.
  assert.deepStrictEqual(d.patch, { venue_address_raw: "2545 Bagley St", venue_city_raw: "Detroit" });
  assert.ok(!ctx.g({ ...before, ...d.patch }).includes("venue address/city"));
});

check("no duplicate events or venues: resolution only fills fields and links to an existing venue", () => {
  const venues = [{ id: "v-halo", name: "HALO Detroit", address: "8070 Greenfield Rd", city: "Detroit" }];
  const k = know([], venues);
  const d = K.resolveLocationGap(ev({ venue_name_raw: "HALO Detroit" }), k);
  assert.strictEqual(d.action, "fill");
  assert.deepStrictEqual(Object.keys(d.patch).sort(), ["venue_address_raw", "venue_city_raw", "venue_id"]);
  assert.strictEqual(d.patch.venue_id, "v-halo", "an existing venue, never a new one");
  // A learned (non-canonical) venue is never linked and never created.
  const d2 = K.resolveLocationGap(ev({ venue_name_raw: "Tigris" }), know(TIGRIS));
  assert.strictEqual(d2.patch.venue_id, undefined);
  const src = require("fs").readFileSync(path.join(ROOT, "api/_lib/venue-knowledge.js"), "utf8");
  assert.ok(!/fetch\(|method:\s*"(?:POST|PATCH)"/.test(src), "venue-knowledge.js is pure: it writes nothing");
});

check("same-source duplication does not count as independent corroboration", () => {
  // Four Resident Advisor rows, one with no external_id: one source.
  const rows = [1, 2, 3].map((i) => ev({ venue_name_raw: "Traverse City Whiskey Co. Outpost", venue_address_raw: "22812 Woodward Ave #200", venue_city_raw: "Ferndale" }));
  rows.push(ev({ venue_name_raw: "Traverse City Whiskey Co. Outpost", venue_address_raw: "22812 Woodward Ave #200", venue_city_raw: "Ferndale", external_id: null, source: "Paxahau / Resident Advisor" }));
  const k = know(rows);
  const entry = k.byName.get("traverse city whiskey co. outpost");
  assert.strictEqual(entry.status, "single_source");
  assert.strictEqual(entry.evidence.sources.length, 1);
  const d = K.resolveLocationGap(ev({ venue_name_raw: "Traverse City Whiskey Co. Outpost" }), k);
  assert.strictEqual(d.action, "confirm", "one source: a person confirms the venue once");
  assert.deepStrictEqual(d.patch, {});
  // Rows of one ICS feed are one source; a feed, Ticketmaster and Metro Times never corroborate (their addresses may be our copies).
  const copies = [
    ev({ venue_name_raw: "Kiosk", venue_address_raw: "1 Main St", venue_city_raw: "Detroit", source: "Feed A", external_id: "feed-a-1", feed_source_id: "fa" }),
    ev({ venue_name_raw: "Kiosk", venue_address_raw: "1 Main St", venue_city_raw: "Detroit", source: "Ticketmaster", external_id: "vvABC" }),
    ev({ venue_name_raw: "Kiosk", venue_address_raw: "1 Main St", venue_city_raw: "Detroit", source: "VisitDetroit", external_id: "vd-1" }),
  ];
  assert.strictEqual(know(copies).byName.get("kiosk").status, "single_source");
});

check("alias resolution does not create duplicate venues: only exact names, never fuzzy", () => {
  const venues = [{ id: "v1", name: "Fox Theatre", address: "2211 Woodward Ave", city: "Detroit" }, { id: "v2", name: "Fox Theatre Detroit", address: null, city: "Detroit" }];
  const k = know([], venues);
  // "Fox Theatre Detroit" is not resolved to "Fox Theatre" (an alias is a person's call): no street, no link to v1.
  const d = K.resolveLocationGap(ev({ venue_name_raw: "Fox Theatre Detroit" }), k);
  assert.notStrictEqual(d.patch.venue_id, "v1");
  assert.strictEqual(d.patch.venue_address_raw, undefined);
  // The two Vault 313 spellings stay two names; neither is merged by this code.
  const vault = know([
    ev({ venue_name_raw: "The Vault 313", venue_address_raw: "16940 Hamilton Ave", venue_city_raw: "Highland Park" }),
    ev({ venue_name_raw: "The Vault 313", venue_address_raw: "16940 Hamilton Ave", venue_city_raw: "Highland Park", source: "Venue Submission", external_id: null }),
    ev({ venue_name_raw: "Vault313 (Highland Park)", venue_address_raw: "16940 Hamilton Ave", venue_city_raw: "Highland Park", external_id: null, venue_id: "cb82" }),
  ], [{ id: "cb82", name: "Vault313 (Highland Park)", address: null, city: "Detroit" }]);
  assert.strictEqual(vault.byName.get("the vault 313").status, "learned");
  assert.strictEqual(vault.byName.get("vault313 (highland park)").status, "canonical_conflict", "the record's Detroit is disputed by every event");
  assert.strictEqual(vault.entries.filter((e) => /vault/.test(e.key)).length, 2);
});

check("incorrect canonical geography cannot override verified event geography", () => {
  // Pronto Royal Oak: the record says Detroit; the events say Royal Oak.
  const venues = [{ id: "pronto", name: "Pronto Royal Oak", address: "608 S Washington Ave", city: "Detroit" }];
  const events = [
    ev({ venue_name_raw: "Pronto Royal Oak", venue_address_raw: "608 Washington Ave.", venue_city_raw: "Royal Oak" }),
    ev({ venue_name_raw: "Pronto Royal Oak", venue_address_raw: "608 Washington Ave", venue_city_raw: "Royal Oak" }),
  ];
  const k = know(events, venues);
  assert.strictEqual(k.byName.get("pronto royal oak").status, "canonical_conflict");
  // A linked event in Royal Oak is never given the record's Detroit...
  const linked = ev({ venue_name_raw: "Pronto Royal Oak", venue_id: "pronto", venue_city_raw: "Royal Oak" });
  assert.strictEqual(K.resolveLocationGap(linked, k).action, "conflict");
  // ...an unlinked one is not linked to it, and nothing is filled from a disputed record.
  const d = K.resolveLocationGap(ev({ venue_name_raw: "Pronto Royal Oak" }), k);
  assert.strictEqual(d.action, "conflict");
  assert.deepStrictEqual(d.patch, {});
  const s = K.summarizeVenueRepairs([linked], k);
  assert.strictEqual(s.canonicalConflicts.length, 1);
  assert.strictEqual(s.canonicalConflicts[0].venueId, "pronto");
});

check("a blank incoming Ticketmaster address cannot erase learned canonical knowledge", () => {
  const venues = [{ id: "lca", name: "Little Caesars Arena", address: null, city: "Detroit" }];
  const said = [
    ev({ venue_name_raw: "Little Caesars Arena", venue_id: "lca", venue_address_raw: "2645 Woodward Ave.", venue_city_raw: "Detroit", source: "VisitDetroit", external_id: "vd-1" }),
    ev({ venue_name_raw: "Little Caesars Arena", venue_id: "lca", venue_address_raw: "2645 Woodward Avenue", venue_city_raw: "Detroit", source: "Manual", external_id: null }),
  ];
  // The newest Ticketmaster rows re-send a blank address (DEBT-011).
  const tm = [1, 2, 3].map((i) => ev({ venue_name_raw: "Little Caesars Arena", venue_id: "lca", venue_address_raw: null, venue_city_raw: "Detroit", source: "Ticketmaster", external_id: `vvT${i}`, start_date: "2026-12-0" + i }));
  const k = know([...said, ...tm], venues);
  const entry = k.byVenueId.get("lca");
  assert.strictEqual(entry.status, "learned");
  assert.strictEqual(entry.address, "2645 Woodward Ave.");
  assert.strictEqual(entry.canonicalGap, true, "the durable fix is the venue record (listed as a venue-level repair)");
  for (const row of tm) assert.deepStrictEqual(K.resolveLocationGap(row, k).patch, { venue_address_raw: "2645 Woodward Ave." }, "each re-sent blank is answered again, from knowledge that did not move");
  const s = K.summarizeVenueRepairs(tm, k);
  assert.strictEqual(s.canonicalRepairs[0].kind, "fill_canonical_address");
  assert.strictEqual(s.canonicalRepairs[0].events, 3);
});

check("campus/building names: one first-party source, one campus street, two or more dates", () => {
  const mk = (b, d, addr = "44575 Garfield Road") => ev({ venue_name_raw: `Center Campus, ${b}`, venue_address_raw: addr, venue_city_raw: addr ? "Clinton Township" : null, source: "Macomb Community College", external_id: `localist-macomb-${++seq}`, start_date: d });
  const k = know([mk("E Building", "2026-10-21"), mk("University Center 1", "2026-10-20"), mk("K Building", "2026-11-21")]);
  const apex = ev({ venue_name_raw: "Center Campus, Macomb Regional APEX Accelerator", source: "Macomb Community College", external_id: "localist-macomb-x" });
  assert.deepStrictEqual(K.resolveLocationGap(apex, k).patch, { venue_address_raw: "44575 Garfield Road", venue_city_raw: "Clinton Township" });
  // Another source's "Center Campus, ..." is not this campus.
  assert.strictEqual(K.resolveLocationGap({ ...apex, source: "Oakland CC", external_id: null }, k).action, "unknown");
  // A building at another street on the same campus: no campus rule.
  const k2 = know([mk("E Building", "2026-10-21"), mk("Annex", "2026-10-22", "1 Other Rd")]);
  assert.notStrictEqual(K.resolveLocationGap(apex, k2).action, "fill");
});

check("an address stated in the event's own location text is used only when complete and unique", () => {
  const livonia = ev({ venue_name_raw: "Fall Bug Hunt Saturday, October 10, 2026 10 a.m. &ndash; 4 p.m. Meet at the Plymouth Arts and Recreation Center, 650 Church St. Plymouth, MI - Meet at the Plymouth Arts and Recreation 650 Church Street Plymouth MI", source: "City of Livonia - Community Events", external_id: "feed-2f-1", feed_source_id: "2f" });
  assert.deepStrictEqual(K.resolveLocationGap(livonia, know([])).patch, { venue_address_raw: "650 Church St", venue_city_raw: "Plymouth" });
  assert.strictEqual(K.extractStatedAddress("- Fire Station 2 1019 E Big Beaver Rd Troy MI 48083"), null, "a number before the house number");
  assert.strictEqual(K.extractStatedAddress("Pro Football Hall of Fame 2121 George Halas Dr NW Canton OH 44708"), null, "Canton, Ohio is not Canton, Michigan");
  assert.strictEqual(K.extractStatedAddress("1 A St Detroit MI or 2 B St Detroit MI"), null, "two addresses");
  assert.strictEqual(K.extractStatedAddress("Join us downtown - Rochester MI 48307"), null, "no street");
  // The event's own city wins over the text: a different stated city is a conflict.
  assert.strictEqual(K.resolveLocationGap({ ...livonia, venue_city_raw: "Livonia" }, know([])).action, "conflict");
});

check("provenance: a learned fill writes what filled it, and the marker", () => {
  const d = K.resolveLocationGap(ev({ venue_name_raw: "Tigris" }), know(TIGRIS));
  const line = K.provenanceLine(d, "2026-10-09");
  assert.ok(line.startsWith(`${K.FILL_MARKER} 2026-10-09: venue_address_raw, venue_city_raw from learned (learned) for "Tigris"`), line);
  assert.ok(/Resident Advisor×1/.test(line) && /Venue Submission×1/.test(line), line);
});

(async () => {
  // The learned map now reads every approved address row, in pages, with no 500-row window.
  {
    const urls = [];
    const page = (offset) => Array.from({ length: offset === 0 ? 1000 : 3 }, (_, i) => ({ id: `r${offset + i}`, status: "approved", venue_name_raw: `Venue ${offset + i}`, venue_address_raw: "1 Main St", venue_city_raw: "Detroit", source: "X" }));
    global.fetch = async (url) => {
      urls.push(url);
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      const offset = Number(/offset=(\d+)/.exec(url)[1]);
      if (offset === 0) {
        // Tigris is on the LAST page: under the 500-row window it was never seen.
        return { ok: true, status: 200, json: async () => page(0) };
      }
      return { ok: true, status: 200, json: async () => [...page(1000).slice(0, 1), ...TIGRIS] };
    };
    const learned = await buildLearnedVenueAddressCityMap("https://example.supabase.co", "k");
    const eventUrls = urls.filter((u) => u.includes("/rest/v1/events"));
    assert.strictEqual(eventUrls.length, 2, "paged until a short page");
    assert.ok(eventUrls.every((u) => !u.includes("limit=500") && u.includes("status=eq.approved") && u.includes("order=id.asc")));
    assert.strictEqual(learned.get("tigris").status, "learned");
    assert.strictEqual(learned.get("tigris").address, "2545 Bagley St");
    assert.strictEqual(learned.has("venue 0"), false, "one row of one source is not knowledge");
    n++; console.log("PASS: the learned map reads every approved address row (paged, deterministic order), not the 500 most recently updated");
  }
  // The nightly/Admin repair writes the fill with provenance, guarded by updated_at.
  {
    const calls = [];
    global.fetch = async (url) => {
      if (url.includes("/rest/v1/venues")) return { ok: true, status: 200, json: async () => [] };
      if (url.includes("venue_address_raw=not.is.null")) return { ok: true, status: 200, json: async () => TIGRIS };
      throw new Error("unmocked " + url);
    };
    const counts = await repairExistingEvents({
      SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", logger: { log() {}, warn() {}, error() {} },
      fetchCandidates: async () => [
        ev({ id: "t1", venue_name_raw: "Tigris", internal_note: "RA note", updated_at: "2026-10-09T10:00:00Z" }),
        ev({ id: "t2", venue_name_raw: "TBA - Secret Location" }),
        ev({ id: "t3", venue_name_raw: "Tigris", venue_city_raw: "Ferndale" }),
        ev({ id: "t4", venue_name_raw: "Nowhere Known" }),
      ],
      applyPatchFn: async (u, h, id, patch, opts) => { calls.push({ id, patch, opts }); return true; },
    });
    assert.strictEqual(counts.written, 1);
    assert.strictEqual(counts.fieldsWritten, 2);
    assert.strictEqual(counts.excluded, 1);
    assert.strictEqual(counts.conflicts, 1);
    assert.strictEqual(counts.unresolved, 3);
    assert.strictEqual(calls[0].id, "t1");
    assert.strictEqual(calls[0].patch.venue_address_raw, "2545 Bagley St");
    assert.ok(calls[0].patch.internal_note.startsWith("RA note\n" + K.FILL_MARKER), "the existing note is kept, the provenance line appended");
    assert.strictEqual(calls[0].opts.updatedAt, "2026-10-09T10:00:00Z");
    assert.ok(!("status" in calls[0].patch), "publication status is never touched");
    n++; console.log("PASS: the repair fills with provenance, keeps the existing note, guards on updated_at, and never touches status");
  }
  console.log(`\nAll ${n} venue-knowledge checks passed.`);
})().catch((err) => { console.error("FAIL:", err); process.exitCode = 1; });
