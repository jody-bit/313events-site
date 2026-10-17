// test/enrichment-poor-description-query.test.js — the poor-description candidate query must survive every
// REPAIR_SOURCES name. "St. Clair Shores - Events & Programs" contains "&"; sent raw it ends the `source`
// parameter mid-name and PostgREST answers HTTP 400, so the CivicPlus repair (Stage 1, #136) never ran in
// production (enrichment run 2026-10-17 12:30Z: partial, "Failed to fetch poor-description candidates: HTTP 400").
//
// Run: node test/enrichment-poor-description-query.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { poorDescriptionCandidatesUrl } = require(`${REPO_DIR}/scripts/generic-metadata-enrichment.js`);
const { REPAIR_SOURCES, CIVICPLUS_FEED_SOURCES } = require(`${REPO_DIR}/api/_lib/description-strength.js`);

const url = poorDescriptionCandidatesUrl("https://example.supabase.co");
const query = url.slice(url.indexOf("?") + 1);

// 1. Every top-level parameter is one the query intends: a raw "&" inside a source name would add a bogus one.
const keys = query.split("&").map((kv) => kv.split("=")[0]);
const allowed = new Set(["start_date", "status", "followup_dismissed", "description", "source", "select", "limit"]);
for (const k of keys) assert.ok(allowed.has(k), `unexpected query parameter "${k}" (a source name leaked an "&")`);
assert.strictEqual(keys.filter((k) => k === "source").length, 1, "exactly one source filter");

// 2. The source filter decodes back to exactly REPAIR_SOURCES, names intact.
const sourceParam = new URLSearchParams(query).get("source");
assert.ok(/^in\.\(.*\)$/.test(sourceParam), "source=in.(...) shape");
const names = [...sourceParam.slice(4, -1).matchAll(/"([^"]*)"/g)].map((m) => decodeURIComponent(m[1]));
assert.deepStrictEqual([...names].sort(), [...REPAIR_SOURCES].sort());
assert.ok(names.includes("St. Clair Shores - Events & Programs"));
assert.ok(names.includes("Mount Clemens Public Library - Children's Events"));

// 3. No raw "&", "#", "+" or space survives inside the encoded names (the characters that break a query string).
const rawSource = query.split("&").find((kv) => kv.startsWith("source="));
for (const m of rawSource.matchAll(/"([^"]*)"/g)) assert.ok(!/[&#+\s]/.test(m[1]), `unencoded character in ${m[1]}`);
assert.ok(rawSource.includes("St.%20Clair%20Shores%20-%20Events%20%26%20Programs"));

// 4. Any future REPAIR_SOURCES name with a hostile character is also safe.
const odd = poorDescriptionCandidatesUrl("https://x.test", ["A & B", "C#1", "D+E"]);
const oddRaw = odd.split("?")[1].split("&").find((kv) => kv.startsWith("source="));
assert.strictEqual(oddRaw, 'source=in.("A%20%26%20B","C%231","D%2BE")');
assert.strictEqual(odd.split("?")[1].split("&").filter((kv) => kv.startsWith("source=")).length, 1);
assert.ok(CIVICPLUS_FEED_SOURCES.length === 15);
console.log("OK enrichment poor-description query encodes every source name");
