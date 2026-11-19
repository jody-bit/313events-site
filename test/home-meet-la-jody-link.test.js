"use strict";
// MKT-005 (owner-approved 2026-11-19): the homepage carries ONE small "Meet LA Jody" link to the About page, after the
// event-discovery sections and before the footer. No promo cards, and nothing for the Collective, Sentient or Creatives Care.
const assert = require("assert"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const links = [...html.matchAll(/<p class="meet-jody">([\s\S]*?)<\/p>/g)];
assert.strictEqual(links.length, 1, "exactly one Meet LA Jody line");
assert.strictEqual(links[0][1], 'There&rsquo;s a person behind this website. <a href="/about.html">Meet LA Jody &rarr;</a>', "approved wording and link target");
const at = links[0].index;
assert.ok(at > html.indexOf('id="onRadarCard"') && at > html.indexOf('id="nearYouCard"'), "after the event-discovery sections");
assert.ok(at < html.indexOf("</main>") && at < html.indexOf('<footer class="site">'), "before the footer");
assert.ok(!/detroitmusiccollective\.com|www\.sentientproductions\.com|Creatives Care/i.test(html), "no Collective, Sentient or Creatives Care placement on the homepage");
console.log("PASS: homepage has one small Meet LA Jody link to /about.html, nothing else added");
