/* seasonal/collections.js — static structured content for the seasonal
 * collection pages (/fall, /halloween, /fall-color).
 *
 * Works in the browser (window.SeasonalCollections) and in node tests
 * (module.exports). No database, no network.
 *
 * PUBLICATION GATE (release candidate). An entry renders publicly only when
 * `status === "PUBLISHED"` AND `readiness(entry).state === "PUBLISHED"`, i.e.
 * every one of these is recorded on the entry itself:
 *   1. official-source verification: an `evidence` item with level "official",
 *      websiteChecked true, an https url, checkedAt (YYYY-MM-DD) and checkedBy;
 *   2. relevance to the collection confirmed: `relevance.confirmed === true`
 *      with a note, checkedAt and checkedBy;
 *   3. an acquired image: `image.acquired` {file, bytes, sha256, width,
 *      height, acquiredAt} and `image.src === image.acquired.file`, and the
 *      image is not `illustrative`. A photo URL alone is not an acquired
 *      image; a recorded license without a downloaded, hash-validated file
 *      is not an acquired image (scripts/build-seasonal.js verifies the
 *      file exists and its sha256 matches);
 *   4. image rights recorded: `image.license`, `image.licenseUrl` (https),
 *      `image.credit` (attribution) and `image.rightsVerifiedAt`;
 *   5. explicit publication approval: `approval` {by, at}.
 * `status` is the ledger state the editor declares; it uses the existing
 * field (no parallel status system). The five states, derived by readiness():
 *   HOLD_UNVERIFIED   no official-source verification and/or relevance yet
 *   CONTENT_VERIFIED  1 + 2 complete; image work not started
 *   IMAGE_PENDING     1 + 2 complete; image started but 3 and/or 4 incomplete
 *   READY_FOR_REVIEW  1-4 complete; awaiting explicit approval (5)
 *   PUBLISHED         1-5 complete
 * A declared status that disagrees with the derived one fails the tests, so a
 * status can never be used to bypass the gate. Entries with `fixture: true`
 * are never public (see seasonal/fixtures.js).
 * See seasonal/EDITORIAL_HANDOFF.md.
 *
 * WHAT IS NOT HERE ON PURPOSE: operating hours, admission, event dates,
 * accessibility, coordinates, distance. None was verified from an official
 * source, so none is shown. Dates found in news coverage are kept in
 * `evidence` for the reviewer, never rendered.
 *
 * `evidence.level`:
 *   "inventory+search"  identity + location in the research inventory and
 *                       corroborated by independent web coverage. Official
 *                       site was NOT fetched (outbound fetch was blocked).
 *                       Does NOT satisfy the gate.
 *   "official"          the destination's own site was fetched and read
 *                       (see gate item 1).
 * `website` is set only when that domain appeared in a search result; it is
 * still flagged `websiteChecked: false`.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SeasonalCollections = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ILLUSTRATIVE = {
    source: "313.events supplied collection graphic (AI-generated), cropped",
    credit: "313.events",
    license: "Supplied by 313.events; generation tool and terms not recorded",
    illustrative: true
  };
  function img(collection, n) {
    return Object.assign({ src: "/assets/seasonal/" + collection + "-card-" + n + ".webp" }, ILLUSTRATIVE);
  }
  function ev(note, url) { return { level: "inventory+search", note: note, url: url || null, websiteChecked: false }; }

  var COLLECTIONS = {
    fall: {
      slug: "fall",
      route: "/fall",
      title: "Fall Is On.",
      titleLines: ["Fall", "Is On."],
      tagline: null,
      subtitle: "Cider mills. Pumpkin patches. Orchards. Donuts. Hayrides. Find your fall.",
      metaDescription: "Cider mills, orchards, pumpkin patches and fall farm days across the Detroit Orbit. A 313.events seasonal collection.",
      filterLabel: "What do you want to do?",
      dontMissTitle: "Don't miss this fall",
      exploreTitle: "Explore fall in the Orbit",
      discoverTitle: "Discover by experience",
      mapTitle: "Explore more of the Orbit",
      mapBlurb: "The events map shows all 313.events listings, not only this collection.",
      hero: { desktop: "/assets/seasonal/fall-hero-1600.webp", mobile: "/assets/seasonal/fall-hero-800.webp",
        alt: "", illustrative: true, objectPosition: "50% 40%" },
      categories: [
        { id: "cider-donuts", label: "Cider + Donuts", tile: "Get cider + donuts" },
        { id: "farm-experiences", label: "Farm Experiences", tile: "Explore a farm" },
        { id: "fall-festivals", label: "Fall Festivals", tile: "Make a day of it" }
      ],
      entries: [
        { id: "yates-cider-mill", name: "Yates Cider Mill", city: "Rochester Hills", region: "MI",
          categories: ["cider-donuts"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Cider mill in Rochester Hills.",
          image: img("fall", 1),
          evidence: [ev("Inventory #42 (Cider/orchard). WXYZ 2026 cider-mill opening list shows Yates at 1950 E. Avon Rd. as open; undated otherwise. Another listing shows a second Orion Twp location; not published here.")] },
        { id: "parmenters-northville-cider-mill", name: "Parmenter's Northville Cider Mill", city: "Northville", region: "MI",
          categories: ["cider-donuts"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Cider mill in Northville.",
          image: img("fall", 2),
          evidence: [ev("Inventory #28 (Cider/orchard). WXYZ 2026 opening list: 714 Base Line Rd., listed opening Aug 29 (not displayed).")] },
        { id: "blakes-orchard-cider-mill", name: "Blake's Orchard & Cider Mill", city: "Armada", region: "MI",
          categories: ["cider-donuts", "farm-experiences"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Orchard and cider mill in Armada with fall farm activities.",
          website: "https://www.blakefarms.com", image: img("fall", 3),
          evidence: [ev("Inventory #7. Yahoo/Macomb County/Islands.com coverage describe wagon rides and party packages in fall; Blake's has several sites (inventory #8-10), only the Armada orchard is published.", "https://www.blakefarms.com")] },
        { id: "wiards-orchards", name: "Wiard's Orchards", city: "Ypsilanti", region: "MI",
          categories: ["farm-experiences", "fall-festivals"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Orchard in Ypsilanti known for its fall Country Fair.",
          website: "https://www.wiards.com", image: img("fall", 4),
          evidence: [ev("Inventory #41. Axios (Aug 31 2026) and Ann Arbor-area listings describe the Country Fair at 5565 Merritt Rd. 2026 schedule not confirmed.", "https://www.wiards.com")] }
      ]
    },

    halloween: {
      slug: "halloween",
      route: "/halloween",
      title: "The Dark Orbit",
      titleLines: ["The Dark", "Orbit"],
      tagline: "The Orbit gets dark.",
      subtitle: "Haunts. Horror. Ghosts. Oddities. Family fun. Halloween across the Detroit Orbit.",
      metaDescription: "Haunted attractions, ghost history, immersive trails and family Halloween across the Detroit Orbit. A 313.events seasonal collection.",
      filterLabel: "What kind of dark?",
      dontMissTitle: "Don't miss after dark",
      exploreTitle: "Explore the Dark Orbit",
      discoverTitle: "How dark do you want to go?",
      mapTitle: "Explore more of the Orbit",
      mapBlurb: "The events map shows all 313.events listings, not only this collection.",
      hero: { desktop: "/assets/seasonal/halloween-hero-1600.webp", mobile: "/assets/seasonal/halloween-hero-800.webp",
        alt: "", illustrative: true, objectPosition: "50% 50%" },
      categories: [
        { id: "serious-scares", label: "Serious Scares", tile: "Get scared" },
        { id: "haunted-attractions", label: "Haunted Attractions", tile: "Explore the haunted" },
        { id: "ghosts-history", label: "Ghosts + History", tile: "Walk through history" },
        { id: "family-friendly", label: "Family Friendly", tile: "Take the family" },
        { id: "strange-unusual", label: "Strange + Unusual", tile: "Try something strange" }
      ],
      entries: [
        { id: "erebus", name: "Erebus Haunted Attraction", city: "Pontiac", region: "MI",
          categories: ["haunted-attractions", "serious-scares"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Multi-story haunted attraction in Pontiac.",
          image: img("halloween", 1),
          evidence: [ev("Inventory #1 (four-story haunted house). WXYZ 2026 haunted-house guide and Pontiac city report: 2026 season under way. Schedule not displayed.")] },
        { id: "eloise-asylum", name: "Eloise Asylum", city: "Westland", region: "MI",
          categories: ["haunted-attractions", "serious-scares"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Haunted attraction in the former Eloise psychiatric hospital in Westland.",
          image: img("halloween", 2),
          evidence: [ev("Inventory #2. WXYZ 2026 report: sixth season, opens Sept 25. Ticket prices not displayed.")] },
        { id: "halloween-greenfield-village", name: "Hallowe'en in Greenfield Village", city: "Dearborn", region: "MI",
          categories: ["family-friendly", "ghosts-history"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "The Henry Ford's evening Halloween event in Greenfield Village.",
          website: "https://www.thehenryford.org/visit/things-to-do/calendar/halloween-in-greenfield-village",
          image: img("halloween", 3),
          evidence: [ev("Inventory #35. thehenryford.org 2026 news: 46th season; the event page reports general admission sold out. Availability not displayed.", "https://www.thehenryford.org/visit/things-to-do/calendar/halloween-in-greenfield-village")] },
        { id: "zoo-boo", name: "Zoo Boo at the Detroit Zoo", city: "Royal Oak", region: "MI",
          categories: ["family-friendly"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Halloween trick-or-treating event at the Detroit Zoo.",
          image: img("halloween", 4),
          evidence: [ev("Inventory #38. WXYZ 2026: returns on select October weekends. One date listed as a typo in the source, so no dates shown.")] },
        { id: "glenlore-carnevil-2", name: "Glenlore Trails: CarnEvil 2", city: "Commerce Township", region: "MI",
          categories: ["strange-unusual", "haunted-attractions"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Illuminated forest walk with a carnival-horror theme in Commerce Township.",
          website: "https://glenloretrails.com", image: img("halloween", 5),
          evidence: [ev("Inventory #32. Michigan.org / Michigan Public 2026 listings; glenloretrails.com named for tickets.", "https://glenloretrails.com")] },
        { id: "crossroads-ghosts-goodies", name: "Halloween Ghosts & Goodies at Crossroads Village", city: "Flint area", region: "MI",
          categories: ["family-friendly"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Family Halloween at Crossroads Village and the Huckleberry Railroad.",
          image: img("halloween", 6),
          evidence: [ev("Inventory #39. A late-summer 2026 listing invites reservations for the 2026 event; specific 2026 dates not found.")] }
      ]
    },

    "fall-color": {
      slug: "fall-color",
      route: "/fall-color",
      title: "Fall Colors",
      titleLines: ["Fall Colors"],
      tagline: "Chase the color.",
      subtitle: "Trails. Parks. Scenic drives. Waterfronts. Find the Detroit Orbit at peak color.",
      metaDescription: "Parks, trails, arboretums and waterfronts for fall color across the Detroit Orbit. A 313.events seasonal collection.",
      filterLabel: "How do you want to explore?",
      dontMissTitle: "Don't miss the color",
      exploreTitle: "Explore fall colors",
      discoverTitle: "How will you chase the color?",
      mapTitle: "Explore more of the Orbit",
      mapBlurb: "The events map shows all 313.events listings, not only this collection.",
      hero: { desktop: "/assets/seasonal/fall-color-hero-1600.webp", mobile: "/assets/seasonal/fall-color-hero-800.webp",
        alt: "", illustrative: true, objectPosition: "50% 50%" },
      categories: [
        { id: "parks-gardens", label: "Parks + Gardens", tile: "Visit a park" },
        { id: "trails-woods", label: "Trails + Woods", tile: "Walk under the trees" },
        { id: "waterfronts", label: "Waterfronts", tile: "Explore the waterfront" }
      ],
      entries: [
        { id: "kensington-metropark", name: "Kensington Metropark", city: "Milford", region: "MI",
          categories: ["trails-woods", "parks-gardens"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Huron-Clinton Metropark with wooded trails and Kent Lake.",
          website: "https://www.metroparks.com", image: img("fall-color", 1),
          evidence: [ev("Fall-color inventory. Metro Parent and local guides cite fall foliage and trails; no official foliage report found, so no peak-color claim is made.", "https://www.metroparks.com")] },
        { id: "stony-creek-metropark", name: "Stony Creek Metropark", city: "Shelby Township", region: "MI",
          categories: ["waterfronts", "trails-woods"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Huron-Clinton Metropark with lake views and wooded trails.",
          website: "https://www.metroparks.com", image: img("fall-color", 2),
          evidence: [ev("Fall-color inventory. Metro Parent and Macomb Now quote Metroparks marketing calling it a popular fall-color destination.", "https://www.metroparks.com")] },
        { id: "hudson-mills-metropark", name: "Hudson Mills Metropark", city: "Dexter", region: "MI",
          categories: ["trails-woods", "waterfronts"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Huron-Clinton Metropark on the Huron River with forest trails.",
          website: "https://www.metroparks.com", image: img("fall-color", 3),
          evidence: [ev("Fall-color inventory. Metro Parent: 8801 N. Territorial Rd., paved path, Acorn Nature Trail, Huron River.", "https://www.metroparks.com")] },
        { id: "nichols-arboretum", name: "Nichols Arboretum", city: "Ann Arbor", region: "MI",
          categories: ["parks-gardens", "trails-woods"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "University of Michigan arboretum in Ann Arbor.",
          image: img("fall-color", 4),
          evidence: [ev("Fall-color inventory. U-M news (older release) and local guides describe fall color; current rules and hours not confirmed so none are shown.")] }
      ]
    }
  };

  var ORDER = ["fall", "halloween", "fall-color"];
  var CROSS = {
    fall: { label: "Fall Is On.", route: "/fall", img: "/assets/seasonal/fall-card-3.webp" },
    halloween: { label: "The Dark Orbit", route: "/halloween", img: "/assets/seasonal/halloween-card-1.webp" },
    "fall-color": { label: "Fall Colors", route: "/fall-color", img: "/assets/seasonal/fall-color-card-1.webp" }
  };

  var STATES = ["HOLD_UNVERIFIED", "CONTENT_VERIFIED", "IMAGE_PENDING", "READY_FOR_REVIEW", "PUBLISHED"];
  var DATE = /^\d{4}-\d{2}-\d{2}$/, HTTPS = /^https:\/\//, SHA = /^[0-9a-f]{64}$/;
  function has(v) { return typeof v === "string" && v.trim().length > 0; }

  // Pure field checks (no file system): which gate items an entry satisfies.
  function gate(e) {
    var ev = e.evidence || [], img = e.image || {}, acq = img.acquired, rel = e.relevance, ap = e.approval;
    var official = ev.some(function (x) {
      return x && x.level === "official" && x.websiteChecked === true && HTTPS.test(x.url || "") && DATE.test(x.checkedAt || "") && has(x.checkedBy);
    });
    var relevance = !!(rel && rel.confirmed === true && has(rel.note) && DATE.test(rel.checkedAt || "") && has(rel.checkedBy));
    var identity = has(e.name) && has(e.city) && has(e.region) && has(e.summary) && !!(e.categories && e.categories.length);
    var acquired = !!(acq && img.illustrative !== true && has(acq.file) && img.src === acq.file && acq.bytes > 0 &&
      SHA.test(acq.sha256 || "") && acq.width > 0 && acq.height > 0 && DATE.test(acq.acquiredAt || ""));
    var rights = has(img.license) && HTTPS.test(img.licenseUrl || "") && has(img.credit) && DATE.test(img.rightsVerifiedAt || "");
    var imageStarted = img.illustrative !== true && (has(img.sourcePage) || has(img.license));
    var approval = !!(ap && has(ap.by) && DATE.test(ap.at || ""));
    return { official: official, relevance: relevance, identity: identity, acquired: acquired, rights: rights,
      imageStarted: imageStarted, approval: approval };
  }
  function readiness(e) {
    var g = gate(e), state;
    if (!(g.official && g.relevance && g.identity)) state = "HOLD_UNVERIFIED";
    else if (!(g.acquired && g.rights)) state = g.imageStarted ? "IMAGE_PENDING" : "CONTENT_VERIFIED";
    else if (!g.approval) state = "READY_FOR_REVIEW";
    else state = "PUBLISHED";
    return { state: state, gate: g };
  }
  // The only way an entry becomes public: declared PUBLISHED and derived
  // PUBLISHED. Fixtures are never public here.
  function isPublic(e) { return !e.fixture && e.status === "PUBLISHED" && readiness(e).state === "PUBLISHED"; }
  // `includeFixtures` is set only by withFixtures() below; production data never carries it.
  function published(c) { return c.entries.filter(function (e) { return isPublic(e) || (c.includeFixtures === true && e.fixture === true); }); }

  // Preview/test only: the collection with extra fixture entries appended.
  // Used solely by seasonal/page.js behind the non-production check.
  function withFixtures(c, fixtures) {
    var copy = Object.assign({}, c);
    copy.entries = c.entries.concat((fixtures || []).filter(function (f) { return f.fixture === true; }));
    copy.includeFixtures = true;
    return copy;
  }

  return { COLLECTIONS: COLLECTIONS, ORDER: ORDER, CROSS: CROSS, STATES: STATES, published: published,
    readiness: readiness, gate: gate, isPublic: isPublic, withFixtures: withFixtures };
});
