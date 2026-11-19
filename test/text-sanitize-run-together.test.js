// Run: node test/text-sanitize-run-together.test.js
"use strict";
const assert = require("assert");
const { fixRunTogether, sanitizeRowText } = require("../api/_lib/text-sanitize.js");
const eq = (a, b, m) => assert.strictEqual(fixRunTogether(a), b, m);
eq("Fridays: 7:00 - 8:50 p.m.Saturdays: 3:30 - 5:20 p.m and 7:00", "Fridays: 7:00 - 8:50 p.m. Saturdays: 3:30 - 5:20 p.m and 7:00", "BGSU Public Skate");
eq("at Music Hall!Our mission continues", "at Music Hall! Our mission continues", "VisitDetroit");
eq("freaky or somewhere in between.Friday, November 20", "freaky or somewhere in between. Friday, November 20", "Congregation");
eq("Call National Heating www.NationalHeating.com www.National", "Call National Heating www.NationalHeating.com www.National", "URLs and domains untouched");
eq("see https://x.org/Page.Name and J.R.Smith", "see https://x.org/Page.Name and J.R.Smith", "URL and initials untouched");
eq("Already spaced. Text stays! Same?", "Already spaced. Text stays! Same?", "no change when spaced");
eq("v2.0Beta and 3.5Gb", "v2.0Beta and 3.5Gb", "no sentence break before lowercase/digit pairs");
const once = fixRunTogether("end.Next"); assert.strictEqual(fixRunTogether(once), once, "idempotent");
assert.strictEqual(sanitizeRowText({ title: "Go.Now", description: "a.B ok.Next" }).title, "Go.Now", "title untouched");
assert.strictEqual(sanitizeRowText({ description: "ok.Next" }).description, "ok. Next", "description fixed through the row sanitizer");
console.log("PASS: text-sanitize run-together fix");
