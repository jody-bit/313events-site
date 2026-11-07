// test/description-entity-sanitize.test.js -- generated descriptions must not carry literal entities from stored title/venue.
"use strict";
const assert = require("assert");
const { buildFactualDescription } = require("../api/_lib/description-enrichment");

const base = { title: "Wayne County Women’s Health Summit", venue_name_raw: "Schoolcraft College&rsquo;s VisTaTech Center", start_date: "2026-11-13", time_display: "9:30 AM", is_all_day: false };
const out = buildFactualDescription(base);
assert.ok(out && !/&[a-z#0-9]+;/i.test(out), "no literal entity in generated text: " + out);
assert.ok(out.includes("Schoolcraft College’s VisTaTech Center"));
assert.ok(buildFactualDescription({ ...base, title: "Rock &amp; Roll &lt;3 Night" }).startsWith("Rock & Roll <3 Night takes place"));
// plain venue and title unchanged
assert.strictEqual(buildFactualDescription({ ...base, venue_name_raw: "The Fillmore" }).includes("at The Fillmore"), true);
// nothing to say stays null (no regression)
assert.strictEqual(buildFactualDescription({ title: "X" }), null);
console.log("PASS: description-entity-sanitize -- generated description decodes stored title/venue entities");
