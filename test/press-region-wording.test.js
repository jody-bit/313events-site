"use strict";
// Owner decisions 2026-11-20: "On the Radar" becomes "In the Press" in the nav and public pages (radar.html stays the URL),
// and "within 75 miles of Detroit" leaves the meta descriptions for "across Detroit and the surrounding region".
// Held for the owner's wording sign-off: editorial-policy.html, terms.html, and the press-kit text (media page, bios, EPK).
const assert = require("assert"), fs = require("fs"), path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const home = read("index.html"), radar = read("radar.html");
assert.ok(/<a class="site-nav-link" href="radar\.html">In the Press<\/a>/.test(home), "home nav says In the Press and keeps radar.html");
assert.ok(/<h2 class="sec-title">In the Press<\/h2>/.test(home) && /id="onRadarCard"[^>]*aria-label="In the Press"/.test(home), "home section and its landmark");
assert.ok(/<h1 class="page-title">In the Press<\/h1>/.test(radar) && /<title>In the Press /.test(radar), "radar.html heading and title");
["fall.html", "halloween.html", "fall-color.html", "seasonal/render.js"].forEach((f) => assert.ok(/<a href="\/radar\.html">In the Press<\/a>/.test(read(f)), f + ": seasonal nav"));
["index.html", "calendar.html", "map.html", "submit.html", "radar.html", "fall.html", "halloween.html", "fall-color.html"].forEach((f) => {
  assert.ok(!/<a[^>]*>On the Radar<\/a>|<h[12][^>]*>On the Radar</.test(read(f)), f + ": no visible On the Radar left");
});
["index.html", "calendar.html", "map.html", "submit.html"].forEach((f) => {
  const metas = read(f).match(/<meta (?:name|property)="(?:description|og:description|twitter:description)"[^>]*>/g) || [];
  assert.ok(metas.length >= 2, f + ": description metas found");
  metas.forEach((m) => assert.ok(!/75 miles/i.test(m), f + ": meta no longer says 75 miles: " + m));
});
["index.html", "calendar.html", "map.html"].forEach((f) => assert.ok(/across Detroit and the surrounding region/.test(read(f)), f + ": new description wording"));
assert.ok(/Detroit and the surrounding region/.test(read("submit.html")), "submit description");
// Held pages are not touched by this change.
assert.ok(/On the Radar/.test(read("editorial-policy.html")) && /On the Radar/.test(read("terms.html")), "legal and policy pages keep their wording until the owner signs off");
console.log("PASS: In the Press and the region wording, with the held pages left alone");
