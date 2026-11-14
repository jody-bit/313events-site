// load-discovery.js: discovery.js needs the shared /blocked-names.js and /place-list.js loaded first (issue #16: one copy of each).
// In a browser the page's <script> tags do that; in node, tests require this file instead of discovery.js and get the same exports.
"use strict";
require("../../blocked-names.js");
require("../../place-list.js");
module.exports = require("../../discovery.js");
