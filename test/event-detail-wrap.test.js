// Long unbroken strings (e.g. a pasted URL at the end of a description) must
// wrap inside the event-detail text classes instead of painting past the
// viewport at 375px.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const html = fs.readFileSync(path.join(__dirname, "..", "event-template.html"), "utf8");
["h1.evt-detail-title", ".evt-detail-meta", ".evt-detail-desc", ".evt-detail-source"].forEach((sel) => {
  const i = html.indexOf(sel + "{");
  assert.ok(i >= 0, sel + " rule missing");
  const rule = html.slice(i, html.indexOf("}", i));
  assert.ok(/overflow-wrap:\s*anywhere/.test(rule), sel + " must set overflow-wrap:anywhere");
});
console.log("event-detail-wrap: ok");
