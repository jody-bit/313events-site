"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { canonicalVisitDetroitUrl, OLD_SHAPE_RE } = require("../api/_lib/visitdetroit-link-recovery");

// P0 2026-10-16: the search index still emits "/<slug>/", which 404s; the live page is "/events/<slug>/".
assert.strictEqual(canonicalVisitDetroitUrl("/cider-in-the-city/"), "https://visitdetroit.com/events/cider-in-the-city/");
assert.strictEqual(canonicalVisitDetroitUrl("/cider-in-the-city"), "https://visitdetroit.com/events/cider-in-the-city/");
assert.strictEqual(canonicalVisitDetroitUrl("/ballets-jazz-montréal/"), "https://visitdetroit.com/events/ballets-jazz-montréal/", "unicode slugs");
assert.strictEqual(canonicalVisitDetroitUrl("/events/cider-in-the-city/"), "https://visitdetroit.com/events/cider-in-the-city/", "already canonical: unchanged");
assert.strictEqual(canonicalVisitDetroitUrl("/events/"), "https://visitdetroit.com/events/", "never rewrites the events listing page");
assert.strictEqual(canonicalVisitDetroitUrl("/a/b/"), "https://visitdetroit.com/a/b/", "multi-segment paths are kept as given");
assert.strictEqual(canonicalVisitDetroitUrl(""), null);
assert.strictEqual(canonicalVisitDetroitUrl(undefined), null);
assert.ok(!OLD_SHAPE_RE.test(canonicalVisitDetroitUrl("/zoo-boo-at-the-detroit-zoo-2/")), "the stored form is never the dead shape");

const src = fs.readFileSync(path.join(__dirname, "..", "api", "cron-visitdetroit.js"), "utf8");
assert.ok(src.includes("ticket_url: canonicalVisitDetroitUrl(h.uri)"), "the importer stores the canonical form");
assert.ok(!/visitdetroit\.com\$\{h\.uri\}/.test(src), "the importer no longer concatenates the raw uri");

const repair = fs.readFileSync(path.join(__dirname, "..", "scripts", "visitdetroit-dead-link-repair.js"), "utf8");
assert.ok(repair.includes("OLD_SHAPE_RE.test(event.ticket_url)"), "an 'ok' on the dead bare-slug shape is never recorded as ok");
console.log("PASS: visitdetroit canonical ticket_url");
