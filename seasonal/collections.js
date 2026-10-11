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
  // The generated card is the first fallback. `alt` is the second (another approved generated card); the branded
  // placeholder is the last. Chain used by seasonal/render.js: linked image -> card -> alternate card -> placeholder.
  var PLACEHOLDER = "/assets/placeholders/event-800.webp";
  function img(collection, n, alt) {
    var a = alt || (n % 8) + 1;
    return Object.assign({ src: "/assets/seasonal/" + collection + "-card-" + n + ".webp",
      alternates: ["/assets/seasonal/" + collection + "-card-" + a + ".webp"], placeholder: PLACEHOLDER }, ILLUSTRATIVE);
  }
  // An image linked from the destination's own site, shown from there, with the generated card as the
  // fallback if the link breaks (seasonal/render.js swaps it in). Recorded owner decision: see
  // seasonal/EDITORIAL_HANDOFF.md "Linked images". NOT a licensed or acquired file.
  function linked(collection, n, r, alt) {
    var base = img(collection, n, alt);
    base.remote = { src: r.src, sourcePage: r.sourcePage, credit: r.credit, acceptedBy: "Jody Tyree (owner)", acceptedAt: "2026-10-11",
      riskNote: "Owner accepted the copyright risk; no permission from the rights holder is on file. Remove promptly if the owner asks.",
      note: r.note || null };
    return base;
  }
  function official(note, url) { return { level: "official", note: note, url: url, websiteChecked: true, checkedAt: "2026-10-11", checkedBy: "Claude (Cowork session), read in Chrome" }; }
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
          image: linked("fall", 1, { src: "https://oaklandcounty115.com/wp-content/uploads/2018/09/20180909_yates_01.jpg", sourcePage: "https://oaklandcounty115.com/2018/09/09/explore-yates-cider-mill/", credit: "Oakland County Times",
            note: "2018 photo of the mill and water wheel, 600x450. Original link was http; https version loads." }),
          evidence: [ev("Inventory #42 (Cider/orchard). WXYZ 2026 cider-mill opening list shows Yates at 1950 E. Avon Rd. as open; undated otherwise. Another listing shows a second Orion Twp location; not published here.")] },
        { id: "parmenters-northville-cider-mill", name: "Parmenter's Northville Cider Mill", city: "Northville", region: "MI",
          categories: ["cider-donuts"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Cider mill in Northville.",
          image: linked("fall", 2, { src: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/19/f0/e0/e2/photo0jpg.jpg?w=1200&h=-1&s=1", sourcePage: "https://www.tripadvisor.com/Attraction_Review-g42532-d7149065-Reviews-Parmenter_s_Cider_Mill-Northville_Michigan.html", credit: "Tripadvisor traveler photo",
            note: "Traveler-uploaded photo of the mill's red barn. Not from the mill's own site (its own photos were too small)." }),
          evidence: [ev("Inventory #28 (Cider/orchard). WXYZ 2026 opening list: 714 Base Line Rd., listed opening Aug 29 (not displayed).")] },
        { id: "blakes-orchard-cider-mill", name: "Blake's Orchard & Cider Mill", city: "Armada", region: "MI",
          categories: ["cider-donuts", "farm-experiences"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Orchard and cider mill in Armada with fall farm activities.",
          website: "https://www.blakefarms.com", image: linked("fall", 3, { src: "https://blakefarms.com/wp-content/uploads/2024/05/BLAKES-BIG-APPLE.jpg", sourcePage: "https://blakefarms.com/big-apple/", credit: "Blake Farms",
            note: "Official photo of the Big Apple landmark at sunset; portrait crop. Not specifically a fall-activity photo." }),
          evidence: [ev("Inventory #7. Yahoo/Macomb County/Islands.com coverage describe wagon rides and party packages in fall; Blake's has several sites (inventory #8-10), only the Armada orchard is published.", "https://www.blakefarms.com")] },
        { id: "wiards-orchards", name: "Wiard's Orchards", city: "Ypsilanti", region: "MI",
          categories: ["farm-experiences", "fall-festivals"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Orchard in Ypsilanti known for its fall Country Fair.",
          website: "https://www.wiards.com", image: linked("fall", 4, { src: "https://cdn.prod.website-files.com/6100464ae6f378353e5dc239/610ae3a9f6f80d50841334c1_Wiard%27s%20Cider%20Mill.jpg", sourcePage: "https://www.wiards.com/orchard-info/wiards-history", credit: "Wiard's Orchards",
            note: "Official site photo, 602x452 (small): cider-mill cart with fall flowers." }),
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
          image: linked("halloween", 1, { src: "https://hauntedpontiac.com/wp-content/uploads/2018/07/11.jpg", sourcePage: "https://hauntedpontiac.com/contact/", credit: "Erebus Haunted Attraction",
            note: "Night photo of the Erebus building with its searchlight beam. Source site hauntedpontiac.com appears to be Erebus's own site; not independently confirmed." }),
          evidence: [ev("Inventory #1 (four-story haunted house). WXYZ 2026 haunted-house guide and Pontiac city report: 2026 season under way. Schedule not displayed.")] },
        { id: "eloise-asylum", name: "Eloise Asylum", city: "Westland", region: "MI",
          categories: ["haunted-attractions", "serious-scares"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Haunted attraction in the former Eloise psychiatric hospital in Westland.",
          image: img("halloween", 2),
          evidence: [ev("Inventory #2. WXYZ 2026 report: sixth season, opens Sept 25. Ticket prices not displayed.")] },
        { id: "halloween-greenfield-village", name: "Hallowe'en in Greenfield Village", city: "Dearborn", region: "MI",
          categories: ["family-friendly", "ghosts-history"], featured: true, status: "READY_FOR_REVIEW",
          summary: "The Henry Ford's evening Halloween event in Greenfield Village.",
          website: "https://www.thehenryford.org/visit/things-to-do/calendar/halloween-in-greenfield-village",
          image: linked("halloween", 3, { src: "https://www.thehenryford.org/images/thehenryfordlibraries/event-card-1064x798/halloween_pumpkins_1064x798.png", sourcePage: "https://www.thehenryford.org/visit/things-to-do/calendar/halloween-in-greenfield-village", credit: "The Henry Ford",
            note: "The event's own card image: lit pumpkins before a historic house at dusk. It may be generated or heavily edited art rather than a photograph; not verified as a photo of the event." }),
          evidence: [ev("Inventory #35. thehenryford.org 2026 news: 46th season; the event page reports general admission sold out. Availability not displayed.", "https://www.thehenryford.org/visit/things-to-do/calendar/halloween-in-greenfield-village"),
            official("Official Henry Ford event page read 2026-10-11: Hallowe'en in Greenfield Village, Oct 1-4, 8-11, 15-18, 22-25, 2026. Dates are not shown on the card.", "https://www.thehenryford.org/visit/things-to-do/calendar/halloween-in-greenfield-village")],
          relevance: { confirmed: true, note: "Official page describes Hallowe'en in Greenfield Village, October 2026.", checkedAt: "2026-10-11", checkedBy: "Claude (Cowork session), read in Chrome" } },
        { id: "zoo-boo", name: "Zoo Boo at the Detroit Zoo", city: "Royal Oak", region: "MI",
          categories: ["family-friendly"], featured: true, status: "READY_FOR_REVIEW",
          summary: "Halloween trick-or-treating event at the Detroit Zoo.",
          website: "https://detroitzoo.org/events/zoo-boo/",
          image: linked("halloween", 4, { src: "https://detroitzoo.org/wp-content/uploads/2026/01/zoo-boo-hero-min.webp", sourcePage: "https://detroitzoo.org/events/zoo-boo/", credit: "Detroit Zoo",
            note: "Official Zoo Boo hero photo: pumpkin scarecrow display in front of the zoo's Wildlife Interpretive Gallery." }),
          evidence: [ev("Inventory #38. WXYZ 2026: returns on select October weekends. One date listed as a typo in the source, so no dates shown."),
            official("Official Detroit Zoo page read 2026-10-11: Zoo Boo returns the first four weekends in October. Dates are not shown on the card.", "https://detroitzoo.org/events/zoo-boo/")],
          relevance: { confirmed: true, note: "Official page describes Zoo Boo, a Halloween event at the Detroit Zoo, October 2026.", checkedAt: "2026-10-11", checkedBy: "Claude (Cowork session), read in Chrome" } },
        { id: "glenlore-carnevil-2", name: "Glenlore Trails: CarnEvil 2", city: "Commerce Township", region: "MI",
          categories: ["strange-unusual", "haunted-attractions"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Illuminated forest walk with a carnival-horror theme in Commerce Township.",
          website: "https://glenloretrails.com", image: img("halloween", 5),
          evidence: [ev("Inventory #32. Michigan.org / Michigan Public 2026 listings; glenloretrails.com named for tickets.", "https://glenloretrails.com")] },
        { id: "crossroads-ghosts-goodies", name: "Halloween Ghosts & Goodies at Crossroads Village", city: "Flint area", region: "MI",
          categories: ["family-friendly"], featured: false, status: "READY_FOR_REVIEW",
          summary: "Family Halloween at Crossroads Village and the Huckleberry Railroad.",
          website: "https://geneseecountyparks.org/halloween-ghosts-goodies/",
          image: linked("halloween", 6, { src: "https://geneseecountyparks.org/wp-content/uploads/2023/10/209A9950-scaled.jpg", sourcePage: "https://geneseecountyparks.org/halloween-ghosts-goodies/", credit: "Genesee County Parks",
            note: "Header photo of the official Halloween Ghosts & Goodies page: carved pumpkins and cobwebs on a porch. Generic Halloween scene; may not show Crossroads Village itself." }),
          evidence: [ev("Inventory #39. A late-summer 2026 listing invites reservations for the 2026 event; specific 2026 dates not found."),
            official("Official Genesee County Parks page read 2026-10-11: Halloween Ghosts & Goodies at Crossroads Village, October 2026 (3-4, 9-11, 16-18, 22-25, 29-30). Dates are not shown on the card.", "https://geneseecountyparks.org/halloween-ghosts-goodies/")],
          relevance: { confirmed: true, note: "Official page describes Halloween Ghosts & Goodies at Crossroads Village, October 2026.", checkedAt: "2026-10-11", checkedBy: "Claude (Cowork session), read in Chrome" } },
        { id: "hush-haunted-attraction", name: "Hush Haunted Attraction", city: "Westland", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Multiple haunted houses in Westland.",
          website: "https://hushhauntedattractions.com/",
          image: linked("halloween", 2, { src: "https://hushhauntedattractions.com/wp-content/uploads/2025/07/vampire-hero-image1.webp", sourcePage: "https://hushhauntedattractions.com/", credit: "Hush Haunted Attractions (official site)",
            note: "Hush vampire hero image. Found in the catalogue pass (Google Images (Chrome)); size 1440x902." }, 1),
          evidence: [ev("Inventory #3. Multiple haunted houses Not yet checked against the official source.")] },
        { id: "azra-chamber-of-horrors", name: "Azra Chamber of Horrors", city: "Madison Heights", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Multilevel haunted maze in Madison Heights.",
          website: "https://azrahaunt.com/",
          image: linked("halloween", 7, { src: "https://azrahaunt.com/wp-content/uploads/2026/07/Copy-of-DSC04640-min.jpg.webp", sourcePage: "https://azrahaunt.com/", credit: "Azra Haunted House (official site)",
            note: "Azra guests startled in the haunt. Found in the catalogue pass (Google Images (Chrome)); size 1000x667." }, 6),
          evidence: [ev("Inventory #4. Multilevel haunted maze Not yet checked against the official source.")] },
        { id: "rotten-manor", name: "Rotten Manor", city: "Holly", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted manor, forest and asylum in Holly.",
          website: "https://rottenmanor.com/attractions-rotten-manor/",
          image: linked("halloween", 8, { src: "https://rottenmanor.com/wp-content/uploads/2019/06/iOS-Slider-1.jpg", sourcePage: "https://rottenmanor.com/attractions-rotten-manor/", credit: "Rotten Manor (official site)",
            note: "Rotten Manor haunted facade at night. Found in the catalogue pass (Google Images (Chrome)); size 1920x758." }, 5),
          evidence: [ev("Inventory #5. Haunted manor, forest and asylum Not yet checked against the official source.")] },
        { id: "wiards-night-terrors", name: "Wiard's Night Terrors", city: "Ypsilanti", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted thrill park in Ypsilanti.",
          image: linked("halloween", 3, { src: "https://cloudfront-us-east-1.images.arcpublishing.com/advancelocal/AP2MN6MKXBAZLFD2OKU65J3DRA.JPG", sourcePage: "https://www.mlive.com/galleries/A3ERGWG7PZDWFJXBWXU6JO6QZE/", credit: "MLive",
            note: "Hayride of the Lost at Wiard's Night Terrors. Found in the catalogue pass (Google Images (Chrome)); size 1300x886." }, 2),
          evidence: [ev("Inventory #6. Haunted thrill park Not yet checked against the official source.")] },
        { id: "slay-nights", name: "Slay Nights", city: "Howell", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Story-driven haunted house in Howell.",
          website: "https://slaynights.com/",
          image: linked("halloween", 7, { src: "https://slaynights.com/wp-content/uploads/2026/07/slay-nights-reimagined-hero-1280x667.webp", sourcePage: "https://slaynights.com/", credit: "Slay Nights (official site)",
            note: "Official site hero graphic: Slay Nights logo and title art. Promotional artwork, not a photo of the venue." }, 1),
          evidence: [ev("Inventory #7. Story-driven haunted house Not yet checked against the official source."),
            official("Official site read 2026-10-11 in Chrome (page title: Home - Slay Nights - Haunted House - Howell, MI). Read to find the image only; relevance to the collection and 2026 dates are not reviewed.", "https://slaynights.com/")] },
        { id: "scarefest-scream-park", name: "Scarefest Scream Park", city: "Lenox Township", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted hayride, maze and forest in Lenox Township.",
          image: linked("halloween", 6, { src: "https://eu-central-1-shared-euc1-02.graphassets.com/AGYewIelvQiOhmtc8ww7Yz/cmg7vavfq5g0a07w4nt7fz90r", sourcePage: "https://waitwhile.com/case-studies/scarefest-scream-park/", credit: "Waitwhile case study (third-party)",
            note: "Scarefest Scream Park entrance and cast. Found in the catalogue pass (Google Images (Chrome)); size 2160x1215." }, 8),
          evidence: [ev("Inventory #8. Haunted hayride, maze and forest Not yet checked against the official source.")] },
        { id: "blakes-haunted-attractions", name: "Blake's Haunted Attractions", city: "Armada", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted barn and hayride in Armada.",
          website: "https://blakefarms.com/haunted-attractions/",
          image: linked("halloween", 5, { src: "https://blakefarms.com/wp-content/uploads/2024/08/BF_2023-Haunted-Photography-088-scaled.jpg", sourcePage: "https://blakefarms.com/haunted-attractions/", credit: "Blake Farms (official site)",
            note: "Official page image: costumed figure in a lit corn maze at night. Photo from Blake Farms' own haunted-attractions page (2023 season)." }, 2),
          evidence: [ev("Inventory #9. Haunted barn and hayride Not yet checked against the official source."),
            official("Official site read 2026-10-11 in Chrome (page title: Blake Farms haunted attractions page). Read to find the image only; relevance to the collection and 2026 dates are not reviewed.", "https://blakefarms.com/haunted-attractions/")] },
        { id: "the-scream-machine", name: "The Scream Machine", city: "Taylor", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted asylum experience in Taylor.",
          image: img("halloween", 7, 3),
          evidence: [ev("Inventory #10. Haunted asylum experience Not yet checked against the official source.")] },
        { id: "deranged-haunt", name: "Deranged Haunt", city: "Romulus", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted woods in Romulus.",
          website: "https://derangedhauntedattraction.com/",
          image: linked("halloween", 8, { src: "https://derangedhauntedattraction.com/wp-content/uploads/2026/09/deranged-featured-1024x576.png", sourcePage: "https://derangedhauntedattraction.com/", credit: "Deranged Haunted Attraction (official site)",
            note: "Official site featured image: character artwork with the Deranged logo. Promotional artwork, not a venue photo. derangedhaunt.com redirects to this domain." }, 1),
          evidence: [ev("Inventory #11. Haunted woods Not yet checked against the official source."),
            official("Official site read 2026-10-11 in Chrome (page title: Haunted House Near Detroit, MI | Deranged Haunted Attraction). Read to find the image only; relevance to the collection and 2026 dates are not reviewed.", "https://derangedhauntedattraction.com/")] },
        { id: "slaughterhouse-adventure", name: "Slaughterhouse Adventure", city: "Fowlerville", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted house and corn maze in Fowlerville.",
          image: img("halloween", 2, 6),
          evidence: [ev("Inventory #12. Haunted house and corn maze Not yet checked against the official source.")] },
        { id: "full-moon-manor-at-bonadeo-farms", name: "Full Moon Manor at Bonadeo Farms", city: "Highland", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted farm in Highland.",
          image: img("halloween", 7, 5),
          evidence: [ev("Inventory #13. Haunted farm Not yet checked against the official source.")] },
        { id: "exit-13-haunted-house", name: "Exit 13 Haunted House", city: "Mount Morris", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Extreme interactive haunt in Mount Morris.",
          image: img("halloween", 8, 3),
          evidence: [ev("Inventory #14. Extreme interactive haunt; operating status needs verification Flags: operating status/2026 occurrence flagged in inventory. Not yet checked against the official source.")] },
        { id: "nightmare-fields-at-the-pumpkin-factory", name: "Nightmare Fields at The Pumpkin Factory", city: "Belleville", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted field attraction in Belleville.",
          image: img("halloween", 1, 2),
          evidence: [ev("Inventory #15. Haunted field attraction Not yet checked against the official source.")] },
        { id: "scarehouse-windsor", name: "Scarehouse Windsor", city: "Windsor", region: "ON",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Indoor haunted attractions and immersive horror in Windsor.",
          website: "https://scarehousewindsor.com/",
          image: linked("halloween", 7, { src: "https://scarehousewindsor.com/hero-centre.jpg", sourcePage: "https://scarehousewindsor.com/", credit: "Scarehouse Windsor (official site)",
            note: "Official site hero: the lit Scarehouse building with its sign. Cropped by the card, so the sign is partly cut." }, 6),
          evidence: [ev("Inventory #16. Indoor haunted attractions and immersive horror Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source."),
            official("Official site read 2026-10-11 in Chrome (page title: Scarehouse Windsor — Halloween Haunted House & Dinner Experience). Read to find the image only; relevance to the collection and 2026 dates are not reviewed.", "https://scarehousewindsor.com/")] },
        { id: "the-howling-haunted-trail-and-party", name: "The Howling Haunted Trail & Party", city: "Fenton", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted woodland trail in Fenton.",
          image: img("halloween", 5, 8),
          evidence: [ev("Inventory #17. Haunted woodland trail Not yet checked against the official source.")] },
        { id: "terrorfied-forest", name: "Terrorfied Forest", city: "Pinckney", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Outdoor haunted forest in Pinckney.",
          image: img("halloween", 3, 2),
          evidence: [ev("Inventory #18. Outdoor haunted forest Not yet checked against the official source.")] },
        { id: "past-tense-after-dark", name: "Past Tense After Dark", city: "Lapeer", region: "MI",
          categories: ["haunted-attractions","ghosts-history"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted hayride, corn maze and house in Lapeer.",
          image: img("halloween", 1, 7),
          evidence: [ev("Inventory #19. Haunted hayride, corn maze and house Not yet checked against the official source.")] },
        { id: "spooky-trails", name: "Spooky Trails", city: "Swartz Creek", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted maze, cornfield and hayride in Swartz Creek.",
          image: img("halloween", 3, 8),
          evidence: [ev("Inventory #20. Haunted maze, cornfield and hayride Not yet checked against the official source.")] },
        { id: "panic-in-the-pines", name: "Panic in the Pines", city: "Genoa", region: "OH",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted hayride and woods in Genoa.",
          image: img("halloween", 6, 2),
          evidence: [ev("Inventory #21. Haunted hayride and woods Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "field-of-fear", name: "Field of Fear", city: "Monclova", region: "OH",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted cornfield attractions in Monclova.",
          website: "https://fieldoffear.com/",
          image: linked("halloween", 5, { src: "https://fieldoffear.com/wp-content/uploads/2026/08/stormy_stockyard_entrance.png", sourcePage: "https://fieldoffear.com/", credit: "Field of Fear (official site)",
            note: "Official site artwork: the Stockyard entrance gate and cornfield under a stormy sky. It may be illustration or generated art, not a verified photo." }, 7),
          evidence: [ev("Inventory #22. Haunted cornfield attractions Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source."),
            official("Official site read 2026-10-11 in Chrome (page title: Field of Fear). Read to find the image only; relevance to the collection and 2026 dates are not reviewed.", "https://fieldoffear.com/")] },
        { id: "bates-haunted-sawmill", name: "Bates Haunted Sawmill", city: "Millington", region: "MI",
          categories: ["haunted-attractions","ghosts-history"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Rustic haunted sawmill and maze in Millington.",
          image: img("halloween", 8, 3),
          evidence: [ev("Inventory #23. Rustic haunted sawmill and maze; radius check Flags: radius check needed. Not yet checked against the official source.")] },
        { id: "dearborn-haunted-trail", name: "Dearborn Haunted Trail", city: "Dearborn", region: "MI",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted woodland trail in Dearborn.",
          image: linked("halloween", 1, { src: "https://dearborn.gov/sites/default/files/inline-images/Haunted%20Trail%20Web%203_0.png", sourcePage: "https://dearborn.gov/government/news-communication/Dearborns-Haunted-Trail-returns-to-Ford-Field-Park-Oct-16-18", credit: "City of Dearborn",
            note: "Creature in the woods, Dearborn Haunted Trail. Found in the catalogue pass (Google Images (Chrome)); size 600x600." }, 2),
          evidence: [ev("Inventory #24. Haunted woodland trail Not yet checked against the official source.")] },
        { id: "sanilac-museums-haunted-village", name: "Sanilac Museum's Haunted Village", city: "Port Sanilac", region: "MI",
          categories: ["haunted-attractions","ghosts-history"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted historic village in Port Sanilac.",
          image: img("halloween", 4, 7),
          evidence: [ev("Inventory #25. Haunted historic village; radius check Flags: radius check needed. Not yet checked against the official source.")] },
        { id: "distracted-haunted-house", name: "Distracted Haunted House", city: "Bowling Green", region: "OH",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Indoor haunted house in Bowling Green.",
          image: img("halloween", 8, 6),
          evidence: [ev("Inventory #26. Indoor haunted house; radius check Flags: radius check needed; outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "haunted-hydro", name: "Haunted Hydro", city: "Fremont", region: "OH",
          categories: ["haunted-attractions","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Industrial haunted attraction in Fremont.",
          image: img("halloween", 2, 5),
          evidence: [ev("Inventory #27. Industrial haunted attraction; radius check Flags: radius check needed; outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "mortuary-manor-funeral-museum", name: "Mortuary Manor Funeral Museum", city: "Toledo", region: "OH",
          categories: ["strange-unusual","ghosts-history"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Funeral history and paranormal tours in Toledo.",
          image: img("halloween", 7, 3),
          evidence: [ev("Inventory #28. Funeral history and paranormal tours Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "wildwood-manor-house", name: "Wildwood Manor House", city: "Toledo", region: "OH",
          categories: ["ghosts-history"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Seasonal eerie manor tours in Toledo.",
          image: img("halloween", 8, 1),
          evidence: [ev("Inventory #29. Seasonal eerie manor tours Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "fort-meigs-garrison-ghost-walk", name: "Fort Meigs Garrison Ghost Walk", city: "Perrysburg", region: "OH",
          categories: ["ghosts-history"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Historical ghost walk in Perrysburg.",
          website: "https://fortmeigs.org/",
          image: linked("halloween", 5, { src: "https://fortmeigs.org/wp-content/uploads/2022/10/Fort-Meigs-Historic-Site-7.jpg", sourcePage: "https://fortmeigs.org/", credit: "Fort Meigs Historic Site (official site)",
            note: "Official site photo of the reconstructed fort with the site name overlaid. The place where the ghost walk happens, not a photo of the walk." }, 2),
          evidence: [ev("Inventory #30. Historical ghost walk Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source."),
            official("Official site read 2026-10-11 in Chrome (page title: Fort Meigs – Ohio's War of 1812 Battlefield). Read to find the image only; relevance to the collection and 2026 dates are not reviewed.", "https://fortmeigs.org/")] },
        { id: "haunted-waterville-tours", name: "Haunted Waterville Tours", city: "Waterville", region: "OH",
          categories: ["ghosts-history"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Historical ghost tours in Waterville.",
          image: img("halloween", 7, 8),
          evidence: [ev("Inventory #31. Historical ghost tours Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "halloween-stroll-at-canterbury-village", name: "Halloween Stroll at Canterbury Village", city: "Lake Orion", region: "MI",
          categories: ["family-friendly","strange-unusual"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Halloween light displays and characters in Lake Orion.",
          website: "https://www.canterburyvillage.com/",
          image: linked("halloween", 4, { src: "https://www.canterburyvillage.com/wp-content/uploads/2024/01/header2.jpg", sourcePage: "https://www.canterburyvillage.com/", credit: "Canterbury Village (official site)",
            note: "Official site header: the Canterbury Village storefronts with its 30th-anniversary badge. A venue photo, not Halloween-specific." }, 8),
          evidence: [ev("Inventory #33. Halloween light displays and characters Not yet checked against the official source."),
            official("Official site read 2026-10-11 in Chrome (page title: Canterbury Village – Lake Orion). Read to find the image only; relevance to the collection and 2026 dates are not reviewed.", "https://www.canterburyvillage.com/")] },
        { id: "hallowglow-at-treerunner", name: "HallowGlow at TreeRunner", city: "West Bloomfield", region: "MI",
          categories: ["family-friendly","strange-unusual"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Halloween-themed aerial adventure in West Bloomfield.",
          website: "https://treerunnerparks.com/westbloomfield/glow-nights/",
          image: linked("halloween", 4, { src: "https://treerunnerparks.com/westbloomfield/wp-content/uploads/sites/10/2020/03/Glow-Night-4-scaled.jpg", sourcePage: "https://treerunnerparks.com/westbloomfield/glow-nights/", credit: "TreeRunner Parks (official site)",
            note: "Glow Night at TreeRunner. Found in the catalogue pass (Google Images (Chrome)); size 1801x1200." }, 2),
          evidence: [ev("Inventory #34. Halloween-themed aerial adventure Not yet checked against the official source.")] },
        { id: "theatre-bizarre", name: "Theatre Bizarre", city: "Detroit", region: "MI",
          categories: ["strange-unusual","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Adults-only immersive masquerade in Detroit.",
          image: img("halloween", 7, 6),
          evidence: [ev("Inventory #36. Adults-only immersive masquerade; 2026 occurrence must be verified Flags: operating status/2026 occurrence flagged in inventory; adults-only: age guidance to confirm. Not yet checked against the official source.")] },
        { id: "scarehouse-windsor-immersive-dinner", name: "Scarehouse Windsor Immersive Dinner", city: "Windsor", region: "ON",
          categories: ["strange-unusual","serious-scares"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Theatrical horror dining in Windsor.",
          website: "https://scarehousewindsor.com/",
          image: linked("halloween", 8, { src: "https://scarehousewindsor.com/hero-centre.jpg", sourcePage: "https://scarehousewindsor.com/", credit: "Scarehouse Windsor (official site)",
            note: "Same official hero as the Scarehouse Windsor entry; the Immersive Dinner is run on the same official site. No separate dinner image found." }, 5),
          evidence: [ev("Inventory #37. Theatrical horror dining Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source."),
            official("Official site read 2026-10-11 in Chrome (page title: Scarehouse Windsor — Halloween Haunted House & Dinner Experience). Read to find the image only; relevance to the collection and 2026 dates are not reviewed.", "https://scarehousewindsor.com/")] },
        { id: "brick-or-treat-at-legoland-discovery-center", name: "Brick-or-Treat at LEGOLAND Discovery Center", city: "Auburn Hills", region: "MI",
          categories: ["family-friendly"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "LEGO-themed Halloween activities in Auburn Hills.",
          website: "https://www.legolanddiscoverycenter.com/michigan/",
          image: linked("halloween", 3, { src: "https://www.legolanddiscoverycenter.com/michigan/media/jr1gxmg2/webtile_event_mobile_1200x1500px_p_v1_ldc_en-uk_halloween_2026.jpg", sourcePage: "https://www.legolanddiscoverycenter.com/michigan/", credit: "LEGOLAND Discovery Center Michigan (official site)",
            note: "Official Halloween 2026 promo tile (children building a LEGO jack-o'-lantern). Brand promotional image; the file name says en-uk, so it may be a UK-market tile." }, 2),
          evidence: [ev("Inventory #40. LEGO-themed Halloween activities Not yet checked against the official source."),
            official("Official site read 2026-10-11 in Chrome (page title: Top Kids Attraction | LEGOLAND Discovery Center Michigan). Read to find the image only; relevance to the collection and 2026 dates are not reviewed.", "https://www.legolanddiscoverycenter.com/michigan/")] },
        { id: "ooky-spooky-light-show", name: "Ooky Spooky Light Show", city: "Flint", region: "MI",
          categories: ["family-friendly"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Planetarium Halloween show in Flint.",
          image: img("halloween", 4, 7),
          evidence: [ev("Inventory #41. Planetarium Halloween show Not yet checked against the official source.")] },
        { id: "laser-halloween", name: "Laser Halloween", city: "Flint", region: "MI",
          categories: ["family-friendly"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Halloween-themed laser show in Flint.",
          image: img("halloween", 3, 8),
          evidence: [ev("Inventory #42. Halloween-themed laser show Not yet checked against the official source.")] },
        { id: "thiessen-orchards-scaredy-cat-barn", name: "Thiessen Orchards Scaredy Cat Barn", city: "Leamington", region: "ON",
          categories: ["family-friendly"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Gentle haunted barn in Leamington.",
          image: img("halloween", 4, 2),
          evidence: [ev("Inventory #43. Gentle haunted barn; radius check Flags: radius check needed; outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "jack-o-lanterns-among-the-trees", name: "Jack-O-Lanterns Among the Trees", city: "Troy", region: "MI",
          categories: ["family-friendly"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Illuminated woodland walk in Troy.",
          image: linked("halloween", 3, { src: "https://littleguidedetroit.com/wp-content/uploads/2024/09/LittleGuide-Detroit-Trick-or-treat-among-the-trees-Stage-Nature-Center-1.jpg", sourcePage: "https://littleguidedetroit.com/event/jack-o-lanterns-among-the-trees/", credit: "LittleGuide Detroit",
            note: "Trick-or-treat among the trees, Stage Nature Center. Found in the catalogue pass (Google Images (Chrome)); size 1200x800." }, 7),
          evidence: [ev("Inventory #44. Illuminated woodland walk Not yet checked against the official source.")] },
        { id: "halloween-stroll", name: "Halloween Stroll", city: "Port Huron", region: "MI",
          categories: ["family-friendly"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Family Halloween trail in Port Huron.",
          image: img("halloween", 4, 8),
          evidence: [ev("Inventory #45. Family Halloween trail Not yet checked against the official source.")] },
        { id: "agony-on-alcott", name: "Agony on Alcott", city: "Flint", region: "MI",
          categories: ["haunted-attractions","strange-unusual"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Independent residential haunt in Flint.",
          image: img("halloween", 3, 2),
          evidence: [ev("Inventory #46. Independent residential haunt Not yet checked against the official source.")] },
        { id: "reapers-gate-home-haunt", name: "Reapers Gate Home Haunt", city: "Windsor", region: "ON",
          categories: ["haunted-attractions","strange-unusual"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Free home haunt with actors and animatronics in Windsor.",
          image: img("halloween", 7, 1),
          evidence: [ev("Inventory #47. Free home haunt with actors and animatronics Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "windsor-essex-yard-haunt-map", name: "Windsor–Essex Yard Haunt Map", city: "Windsor–Essex", region: "ON",
          categories: ["strange-unusual"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Community Halloween display discovery in Windsor–Essex.",
          image: img("halloween", 8, 6),
          evidence: [ev("Inventory #48. Community Halloween display discovery Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "halloween-hunt-the-haunts", name: "Halloween Hunt the Haunts", city: "Windsor–Essex", region: "ON",
          categories: ["strange-unusual"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Regional haunt-discovery experience in Windsor–Essex.",
          image: img("halloween", 5, 2),
          evidence: [ev("Inventory #49. Regional haunt-discovery experience Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "motor-city-ghosts", name: "Motor City Ghosts", city: "Detroit", region: "MI",
          categories: ["ghosts-history"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Guided ghost walks in Detroit.",
          image: img("halloween", 7, 8),
          evidence: [ev("Inventory #50. Guided ghost walks Not yet checked against the official source.")] },
        { id: "spooky-janes-walk", name: "Spooky Jane's Walk", city: "Windsor–Essex", region: "ON",
          categories: ["ghosts-history"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Haunted-history walking tours in Windsor–Essex.",
          image: img("halloween", 4, 8),
          evidence: [ev("Inventory #51. Haunted-history walking tours Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] },
        { id: "sandwich-town-ghost-tour", name: "Sandwich Town Ghost Tour", city: "Windsor", region: "ON",
          categories: ["ghosts-history"], featured: false, status: "HOLD_UNVERIFIED",
          summary: "Historical ghost walk in Windsor.",
          image: img("halloween", 5, 2),
          evidence: [ev("Inventory #52. Historical ghost walk Flags: outside Michigan: Orbit eligibility and coordinates to confirm. Not yet checked against the official source.")] }
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
          website: "https://www.metroparks.com", image: linked("fall-color", 1, { src: "https://www.metroparks.com/wp-content/uploads/2021/08/PG_0023_Kensington.jpg", sourcePage: "https://www.metroparks.com/kensington-metropark/", credit: "Huron-Clinton Metroparks",
            note: "Official Metroparks Kensington page image, 1920x1080. Chosen from Google Images results." }),
          evidence: [ev("Fall-color inventory. Metro Parent and local guides cite fall foliage and trails; no official foliage report found, so no peak-color claim is made.", "https://www.metroparks.com")] },
        { id: "stony-creek-metropark", name: "Stony Creek Metropark", city: "Shelby Township", region: "MI",
          categories: ["waterfronts", "trails-woods"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Huron-Clinton Metropark with lake views and wooded trails.",
          website: "https://www.metroparks.com", image: linked("fall-color", 2, { src: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/28/1d/82/c6/stony-creek-metropark.jpg?w=1200&h=-1&s=1", sourcePage: "https://www.tripadvisor.com/Attraction_Review-g42695-d560594-Reviews-or10-Stony_Creek_Metropark-Shelby_Township_Michigan.html", credit: "Tripadvisor traveler photo",
            note: "Traveler-uploaded photo from the park's Tripadvisor page." }),
          evidence: [ev("Fall-color inventory. Metro Parent and Macomb Now quote Metroparks marketing calling it a popular fall-color destination.", "https://www.metroparks.com")] },
        { id: "hudson-mills-metropark", name: "Hudson Mills Metropark", city: "Dexter", region: "MI",
          categories: ["trails-woods", "waterfronts"], featured: true, status: "HOLD_UNVERIFIED",
          summary: "Huron-Clinton Metropark on the Huron River with forest trails.",
          website: "https://www.metroparks.com", image: linked("fall-color", 3, { src: "https://images.alltrails.com/eyJidWNrZXQiOiJhc3NldHMuYWxsdHJhaWxzLmNvbSIsImtleSI6InVwbG9hZHMvcGhvdG8vaW1hZ2UvNTMyODk5MTgvNGM4MzZkOGQ0OTE0NmNmZWY5M2YzNTdiMWM1NWU1Y2IuanBnIiwiZWRpdHMiOnsidG9Gb3JtYXQiOiJ3ZWJwIiwicmVzaXplIjp7IndpZHRoIjoiMTA4MCIsImhlaWdodCI6IjcwMCIsImZpdCI6ImNvdmVyIn0sInJvdGF0ZSI6bnVsbCwianBlZyI6eyJ0cmVsbGlzUXVhbnRpc2F0aW9uIjp0cnVlLCJvdmVyc2hvb3REZXJpbmdpbmciOnRydWUsIm9wdGltaXNlU2NhbnMiOnRydWUsInF1YW50aXNhdGlvblRhYmxlIjozfX19", sourcePage: "https://www.alltrails.com/parks/us/michigan/hudson-mills-metropolitan-park", credit: "AllTrails user photo",
            note: "User-uploaded photo on the park's AllTrails page. The link is a long CDN link and could break sooner than others." }),
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
    // Linked image (owner decision 2026-10-11): shown from the destination's own site with the generated card as the
    // fallback. Needs the link, its source page, a credit and the recorded owner acceptance. Replaces items 3 and 4 only.
    var rm = img.remote;
    var remote = !!(rm && HTTPS.test(rm.src || "") && HTTPS.test(rm.sourcePage || "") && has(rm.credit) && has(rm.acceptedBy) && DATE.test(rm.acceptedAt || "") && has(rm.riskNote) &&
      has(img.src) && /^\/assets\//.test(img.src));
    acquired = acquired || remote;
    rights = rights || remote;
    var imageStarted = !!rm || (img.illustrative !== true && (has(img.sourcePage) || has(img.license)));
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
  // `includeReview` is set only by withReview() below (Preview-only ?review=1); production data never carries it.
  function published(c) { return c.entries.filter(function (e) { return isPublic(e) || (c.includeFixtures === true && e.fixture === true) || (c.includeReview === true && !e.fixture); }); }
  function entriesPublic(c) { return c.entries.filter(isPublic).length; }

  // Preview/review only: the collection with EVERY entry listed (each still carries its real gate state and is
  // labelled "Review only" by seasonal/render.js). Used solely by seasonal/page.js behind the non-production check.
  // It does not change any entry, so the gate and the production page are unaffected.
  function withReview(c) {
    var copy = Object.assign({}, c);
    copy.includeReview = true;
    return copy;
  }

  // Preview/test only: the collection with extra fixture entries appended.
  // Used solely by seasonal/page.js behind the non-production check.
  function withFixtures(c, fixtures) {
    var copy = Object.assign({}, c);
    copy.entries = c.entries.concat((fixtures || []).filter(function (f) { return f.fixture === true; }));
    copy.includeFixtures = true;
    return copy;
  }

  return { COLLECTIONS: COLLECTIONS, ORDER: ORDER, CROSS: CROSS, STATES: STATES, published: published, entriesPublic: entriesPublic, withReview: withReview,
    readiness: readiness, gate: gate, isPublic: isPublic, withFixtures: withFixtures };
});
