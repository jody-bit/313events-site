// blocked-names.js: the ONE always-on suppression list and the test for it. Plain static include (<script src="/blocked-names.js">),
// same pattern as search-match.js. Exposes one global: `BlockedNames` (also module.exports for node tests).
//
// WHY (issue #16, Platform-approved 2026-11-04): discovery.js (homepage), calendar.html and map.html each carried their own copy of the
// list. A name added in one place only would have stayed visible on the other surfaces. This is the single copy; test/drift-guard.test.js
// fails if any page or discovery.js declares it again.
//
// Matching is unchanged: case-insensitive substring of the event TITLE (the notes are not searched, on any surface).
// Add a name by adding a string to NAMES.
(function (root) {
  "use strict";

  var NAMES = ["Augustus Williams"];

  function isBlockedEvent(e) {
    if (!e || !e.title) return false;
    var t = String(e.title).toLowerCase();
    for (var i = 0; i < NAMES.length; i++) {
      if (t.indexOf(NAMES[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }

  var api = { NAMES: NAMES, isBlockedEvent: isBlockedEvent };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (root) root.BlockedNames = api;
})(typeof globalThis !== "undefined" ? globalThis : null);
