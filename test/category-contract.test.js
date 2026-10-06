// test/category-contract.test.js
// Taxonomy contract: every event category the application can emit must be
// accepted by the database. On 2026-10-06 the Submit form, three API
// allow-lists, the admin form and discovery.js all offered "gaming" while
// production's `event_category` enum (and `categories` table) had never
// received it (BUG-008): public submissions and the GottaGacha connector were
// rejected with 22P02. This test derives the database taxonomy from the
// migrations that build it and compares it with every place the app defines
// or emits a category, so drift in either direction fails here, not in
// production. It needs no database.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const noComments = (s) => s.split("\n").map((l) => l.replace(/\s--.*$|^\s*--.*$/, "")).join("\n");
const setOf = (a) => [...new Set(a)].sort();
const only = (label, got, want) => assert.deepStrictEqual(setOf(got), setOf(want),
  `${label}: ${JSON.stringify(setOf(got))} !== database taxonomy ${JSON.stringify(setOf(want))}`);

// ---- 1. the database taxonomy, from the migrations in apply order ----------
const dir = path.join(root, "supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
let enumValues = [], categoryRows = [];
for (const f of files) {
  const sql = noComments(read("supabase/migrations/" + f));
  const create = sql.match(/create type event_category as enum \(([^)]*)\)/i);
  if (create) enumValues.push(...[...create[1].matchAll(/'(\w+)'/g)].map((m) => m[1]));
  for (const m of sql.matchAll(/alter type event_category add value (?:if not exists )?'(\w+)'/gi)) enumValues.push(m[1]);
  for (const stmt of sql.matchAll(/insert into categories\s*\([^)]*\)\s*values([\s\S]*?)(?:on conflict|;)/gi))
    for (const row of stmt[1].matchAll(/\(\s*'(\w+)'\s*,\s*'([^']*)'\s*,\s*'var\([^']*\)'\s*,\s*(\d+)\s*\)/g)) categoryRows.push({ slug: row[1], label: row[2] });
}
assert(enumValues.length >= 14, "could not read the event_category enum from supabase/migrations");
const taxonomy = setOf(enumValues);
only("categories reference table", categoryRows.map((r) => r.slug), taxonomy);

// ---- 2. every place the app lets a person or an editor choose a category ---
function keys(src, from, until) { const i = src.indexOf(from); assert(i >= 0, "marker not found: " + from); return [...src.slice(i, i + until).matchAll(/key:\s*"(\w+)"/g)].map((m) => m[1]); }
const submit = read("submit.html");
const catsStart = submit.indexOf("const CATS = [");
const catsBlock = submit.slice(catsStart, submit.indexOf("];", catsStart));
only("submit.html Submit/feed category list", [...catsBlock.matchAll(/\{key:"(\w+)"/g)].map((m) => m[1]), taxonomy);
for (const f of ["api/submit.js", "api/submit-feed.js", "api/admin-editorial.js"]) {
  const m = noComments(read(f).replace(/\/\/[^\n]*/g, "")).match(/VALID_CATEGORIES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert(m, f + ": VALID_CATEGORIES not found");
  only(f + " VALID_CATEGORIES", [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]), taxonomy);
}
const admin = read("admin.html");
const gi = admin.indexOf("['gaming', 'Gaming & Esports']");
assert(gi >= 0, "admin.html category list not found");
const adminBlock = admin.slice(admin.lastIndexOf("[", gi - 900), gi + 120);
only("admin.html category list", [...adminBlock.matchAll(/\['(\w+)',\s*'[^']+'\]/g)].map((m) => m[1]), taxonomy);
const disc = read("discovery.js");
const ds = disc.indexOf("var DEFAULT_CATEGORIES");
only("discovery.js categories", keys(disc, "var DEFAULT_CATEGORIES", disc.indexOf("];", ds) - ds), taxonomy);

// Labels the visitor sees match the reference table.
const labels = new Map(categoryRows.map((r) => [r.slug, r.label]));
for (const m of catsBlock.matchAll(/\{key:"(\w+)",\s*label:"([^"]+)"/g))
  assert.strictEqual(m[2], labels.get(m[1]), `submit.html label for "${m[1]}" differs from categories table`);

// ---- 3. categories the connectors can emit ---------------------------------
const emitted = new Map(); // value -> files
const note = (v, f) => emitted.set(v, [...(emitted.get(v) || []), f]);
for (const f of fs.readdirSync(path.join(root, "api")).filter((n) => /^cron-.*\.js$/.test(n))) {
  const src = noComments(read("api/" + f).replace(/\/\/[^\n]*/g, ""));
  for (const m of src.matchAll(/\b(?:category|defaultCategory|DEFAULT_CATEGORY|CATEGORY)\s*[:=]\s*["'](\w+)["']/g)) note(m[1], f);
  // `return "x"` inside a function whose name mentions "categor"
  for (const fn of src.matchAll(/function\s+\w*[Cc]ategor\w*\s*\([^)]*\)\s*\{/g)) {
    let depth = 1, i = fn.index + fn[0].length;           // the function's own body, by brace matching
    while (i < src.length && depth > 0) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
    for (const m of src.slice(fn.index, i).matchAll(/return\s+["'](\w+)["']/g)) note(m[1], f);
  }
}
assert(emitted.has("gaming") && emitted.get("gaming").includes("cron-gottagacha.js"), "extractor sanity: it must find GottaGacha's 'gaming' (otherwise this check is silently dead)");
assert(emitted.size >= 8, "extractor found too few connector categories: " + emitted.size);
for (const [v, fs_] of emitted) assert(taxonomy.includes(v), `connector(s) ${fs_.join(", ")} emit category "${v}" which the database enum does not accept`);

console.log(`category-contract: ok (${taxonomy.length} categories; ${emitted.size} connector values checked; UI, API validators, admin and discovery.js all equal the database taxonomy)`);
