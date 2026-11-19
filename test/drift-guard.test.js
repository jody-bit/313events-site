// drift-guard.test.js (issue #16): the homepage (discovery.js), calendar.html and map.html share ONE blocked-name list and ONE place list.
// 1. Neither list, nor isBlockedEvent, may be declared anywhere except blocked-names.js / place-list.js.
// 2. All three surfaces load both modules before using them.
// 3. Parity: the three surfaces return the same blocked set and the same places.
// CI runs the whole suite twice (today and +120 days); nothing here depends on the date.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.env.REPO_DIR || path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const SHARED_FILES = new Set(["blocked-names.js", "place-list.js"]);

// ---- 1. no private declaration anywhere else (comments ignored) ----
const DECLARES = [
  /\b(?:const|let|var)\s+(?:BLOCKED_NAMES|DEFAULT_PLACES|LOCATIONS|isBlockedEvent)\b/,
  /\bfunction\s+isBlockedEvent\b/,
  /\b(?:BLOCKED_NAMES|DEFAULT_PLACES|LOCATIONS)\s*=\s*\[/,
  /\bisBlockedEvent\s*=/,
];
const candidates = fs.readdirSync(ROOT).filter((f) => /\.(html|js)$/.test(f) && !SHARED_FILES.has(f));
assert.ok(candidates.includes("discovery.js") && candidates.includes("calendar.html") && candidates.includes("map.html") && candidates.includes("index.html"));
for (const f of candidates) {
  read(f).split("\n").forEach((line, i) => {
    const code = line.replace(/^\s*(\/\/|\*|<!--).*$/, "");
    for (const re of DECLARES) assert.ok(!re.test(code), `${f}:${i + 1} declares its own copy of a shared rule (${re}). Use blocked-names.js / place-list.js.`);
  });
}
console.log(`PASS: no private BLOCKED_NAMES / isBlockedEvent / DEFAULT_PLACES / LOCATIONS in ${candidates.length} root pages and scripts`);

// ---- 2. every surface loads both modules before it uses them ----
const idx = (h, s) => h.indexOf(s);
{
  const home = read("index.html"), cal = read("calendar.html"), map = read("map.html");
  for (const [name, h, firstUse] of [["index.html", home, '<script src="/discovery.js"></script>'], ["calendar.html", cal, "PlaceList.locations()"], ["map.html", map, "PlaceList.locations()"]]) {
    for (const mod of ["/place-list.js", "/blocked-names.js"]) {
      const at = idx(h, `<script src="${mod}"></script>`);
      assert.ok(at !== -1, `${name} must load ${mod}`);
      assert.ok(at < idx(h, firstUse), `${name} must load ${mod} before it is used`);
    }
  }
  assert.ok(/BlockedNames\.isBlockedEvent\(e\)/.test(cal) && /BlockedNames\.isBlockedEvent\(e\)/.test(map), "calendar and map filter through BlockedNames.isBlockedEvent");
  assert.ok(/GLOBAL\.BlockedNames\.isBlockedEvent\(e\)/.test(read("discovery.js")), "discovery.js filters through BlockedNames.isBlockedEvent");
  console.log("PASS: index.html, calendar.html and map.html load /place-list.js and /blocked-names.js before using them");
}

// ---- 3. parity ----
const BN = require(path.join(ROOT, "blocked-names.js"));
const PL = require(path.join(ROOT, "place-list.js"));
const { Discovery: D } = require(path.join(ROOT, "test/fixtures/load-discovery.js"));
const NOW = { now: new Date("2026-10-03T19:00:00Z") };
const ev = (title) => ({ id: "p", date: "2026-10-03", cat: "music", title });

// Blocked set: every name (any case, embedded in a longer title), plus clean titles that must stay visible.
const probes = [];
for (const n of BN.NAMES) probes.push(n, n.toUpperCase(), "An evening with " + n + " live", n.slice(0, -1));
probes.push("Jazz Night", "", "Augustus", "Williams");
for (const t of probes) {
  const shared = BN.isBlockedEvent(ev(t));
  assert.strictEqual(D.matches(ev(t), D.defaults(), NOW) === false, shared, `homepage and shared module agree on "${t}"`);
}
for (const n of BN.NAMES) assert.strictEqual(D.matches(ev("x " + n), D.defaults(), NOW), false, n + " is hidden on the homepage");
assert.strictEqual(D.matches(ev("Jazz Night"), D.defaults(), NOW), true, "an ordinary event still shows");
// The pages run the very same call, so their blocked set is BN's; check the page code really is only that call.
for (const f of ["calendar.html", "map.html"]) {
  const lines = read(f).split("\n").filter((l) => /isBlockedEvent/.test(l)).map((l) => l.trim());
  assert.deepStrictEqual(lines, ["if(BlockedNames.isBlockedEvent(e)) return false;"], `${f} uses only the shared blocked-name test`);
}
console.log("PASS: homepage, calendar and map hide the same events (one list, one test)");

// Places: the homepage's table and the pages' tables are the same places.
const homePlaces = D.places.map((p) => [p.name, p.type, p.region, p.lat, p.lng].join("|"));
const sharedTuples = PL.PLACES.map((p) => p.join("|"));
assert.deepStrictEqual(homePlaces, sharedTuples, "the homepage's places are the shared list, in order");
for (const f of ["calendar.html", "map.html"]) {
  const html = read(f);
  const decl = /const KNOWN_PLACES = PlaceList\.locations\(\);/.exec(html);
  assert.ok(decl, f + " builds its places from PlaceList.locations()");
  const sb = vm.createContext({ PlaceList: PL });
  const got = vm.runInContext(decl[0] + "\nKNOWN_PLACES.map(function(p){ return [p.name,p.type,p.region,p.lat,p.lng].join('|'); })", sb);
  assert.deepStrictEqual(Array.from(got), sharedTuples, `${f}: the page's places are the shared list`);
}
// A page may push its own Phase 2 cities, but that must never reach the shared list.
{
  const a = PL.locations(), n = a.length;
  a.push({ name: "Probe", type: "city" });
  assert.strictEqual(PL.locations().length, n, "locations() returns a fresh array each call");
  assert.strictEqual(PL.PLACES.length, n);
}
console.log(`PASS: homepage, calendar and map share the same ${sharedTuples.length} places`);
