/* seasonal/fixtures.js — TEST FIXTURES for the seasonal collection pages.
 *
 * These are INVENTED records that exist only so a Preview (or a test) can
 * exercise cards, filters, search, grid/list, image rendering, the Don't Miss
 * rail and the "no match" state while real destinations are still on hold.
 *
 * They are NOT destinations, are not drawn from the inventory, and carry no
 * verification, rights or approval. Isolation rules:
 *   - every record has `fixture: true`; collections.js never publishes a
 *     fixture (isPublic() rejects it), and seasonal/collections.js holds none;
 *   - the only code that merges them in is seasonal/page.js, which does so
 *     only with ?fixtures=1 AND only after /config.js reports a non-production
 *     environment (fail closed: if config is missing or says "production", or
 *     anything errors, nothing is merged);
 *   - built HTML (fall.html etc.) never contains them (the tests check this);
 *   - they never touch seasonal/candidates.json or any production record.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SeasonalFixtures = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function image(col, n) {
    return { src: "/assets/seasonal/" + col + "-card-" + n + ".webp", source: "Test fixture (reuses a collection graphic)",
      credit: "n/a (fixture)", license: "n/a (fixture)", illustrative: true };
  }
  function fx(col, n, id, name, cats, featured, extra) {
    return Object.assign({ id: "fixture-" + id, fixture: true, status: "FIXTURE", name: "FIXTURE: " + name, city: "Fixtureville", region: "MI",
      categories: cats, featured: featured, summary: "Invented test record. Not a real destination.", image: image(col, n), evidence: [] }, extra || {});
  }
  var FIXTURES = {
    fall: [
      fx("fall", 5, "fall-1", "Example Cider Mill", ["cider-donuts"], true, { website: "https://example.com/" }),
      fx("fall", 6, "fall-2", "Example Pumpkin Patch With A Deliberately Very Long Name To Test Wrapping", ["farm-experiences"], true),
      fx("fall", 7, "fall-3", "Example Harvest Fair", ["fall-festivals", "farm-experiences"], false),
      fx("fall", 8, "fall-4", "Example Orchard", ["cider-donuts", "farm-experiences"], false)
    ],
    halloween: [
      fx("halloween", 7, "hw-1", "Example Haunted House", ["haunted-attractions", "serious-scares"], true, { website: "https://example.com/" }),
      fx("halloween", 8, "hw-2", "Example Ghost Walk", ["ghosts-history"], true),
      fx("halloween", 1, "hw-3", "Example Family Night", ["family-friendly"], false),
      fx("halloween", 2, "hw-4", "Example Oddities Museum", ["strange-unusual"], false)
    ],
    "fall-color": [
      fx("fall-color", 5, "fc-1", "Example Metropark", ["parks-gardens", "trails-woods"], true, { website: "https://example.com/" }),
      fx("fall-color", 6, "fc-2", "Example Riverwalk", ["waterfronts"], true),
      fx("fall-color", 7, "fc-3", "Example Arboretum", ["parks-gardens"], false),
      fx("fall-color", 8, "fc-4", "Example Woodland Trail", ["trails-woods"], false)
    ]
  };
  return { FIXTURES: FIXTURES, forCollection: function (slug) { return FIXTURES[slug] || []; } };
});
