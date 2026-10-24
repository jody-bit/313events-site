// test/unplaced-line.test.js — "M more have a location we haven't mapped yet. Show them." on homepage, calendar and map.
// Events whose city cannot be placed are left out of an active place filter (never guessed at). The line counts them and
// "Show them" lets them through. Run: node test/unplaced-line.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
require("../search-match.js");
const { Discovery } = require("../discovery.js");

const ev = (id, city) => ({ id, title: "T" + id, venue: "V", city, cat: "music", date: "2026-11-15" });
const events = [ev("a", "Detroit"), ev("b", "Warren"), ev("c", "Dryden"), ev("d", "Nowhereville")];
const ctx = { now: new Date("2026-10-24T17:00:00Z"), defaultWhen: "all" };
const orbit = Discovery.change(Discovery.defaults(), { where: { place: "Detroit", radius: "orbit" } });
const ids = (c) => events.filter((e) => Discovery.matches(e, orbit, c)).map((e) => e.id).join();

// 1. default: unplaced events are left out of a place filter and counted; includeUnplaced lets them through
{
  const left = Discovery.facets(events, orbit, ctx, "placement").get("unplaced");
  assert.ok(left >= 1, "the placement facet counts the unplaced events");
  const without = ids(ctx), withThem = ids(Object.assign({}, ctx, { includeUnplaced: true }));
  assert.ok(!/c|d/.test(without.replace(/a|b/g, "")) , "unplaced events are not in the place-filtered list: " + without);
  assert.strictEqual(withThem.split(",").length, without.split(",").length + left, "'Show them' adds exactly the counted events");
  console.log("PASS: includeUnplaced adds exactly the counted unplaced events");
}
// 2. no place filter: nothing changes either way
{
  const none = Discovery.defaults();
  const a = events.filter((e) => Discovery.matches(e, none, ctx)).length, b = events.filter((e) => Discovery.matches(e, none, Object.assign({}, ctx, { includeUnplaced: true }))).length;
  assert.strictEqual(a, events.length); assert.strictEqual(a, b);
  console.log("PASS: without a place filter the flag changes nothing");
}
// 3. the three pages carry the one line and the toggle
{
  const w = /we haven't mapped yet/;
  for (const f of ["index.html", "calendar.html", "map.html"]) {
    const h = read(f);
    assert.ok(w.test(h) && /Show them/.test(h) && /Hide them/.test(h), f + " has the line and both buttons");
  }
  assert.ok(/includeUnplaced: showUnplaced/.test(read("index.html")));
  for (const f of ["calendar.html", "map.html"]) assert.ok(/showUnplaced && at\.status === 'unplaced'/.test(read(f)), f + " lets unplaced through only on request");
  console.log("PASS: homepage, calendar and map carry the same line and toggle");
}

// 4. owner wording (2026-10-24): visitor-friendly singular/plural, revealed cards never read as confirmed, map has no pin for them
{
  for (const f of ["index.html", "calendar.html", "map.html"]) {
    const h = read(f);
    assert.ok(/event has a location'\s*:\s*'events have locations'/.test(h), f + " uses grammatical singular/plural");
    assert.ok(/we haven't mapped yet/.test(h) && !/haven't placed yet/.test(h), f + " says mapped, not placed");
    assert.ok(/can't confirm/.test(h), f + " says revealed events are not confirmed inside the area");
    assert.ok(/id="unplacedToggle"|btn\.id = 'unplacedToggle'/.test(h) && /aria-expanded/.test(h), f + " keeps focus target and aria-expanded");
  }
  assert.ok(/Location not mapped yet/.test(read("index.html")) && /Location not mapped yet/.test(read("calendar.html")), "each revealed card carries its own marker");
  const map = read("map.html");
  assert.ok(/if\(place\.unmapped\) return;/.test(map), "the map draws no pin for events that are not mapped");
  assert.ok(/syncUnplacedKey\(\)/.test(read("index.html")) && /syncUnplacedKey\(\)/.test(read("calendar.html")), "changing the place or radius hides them again");
  console.log("PASS: owner wording, no-confirmation text, per-card marker, no map pin, reset on filter change");
}
