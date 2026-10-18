// test/schedule-evidence-pass.test.js
//
// scripts/schedule-evidence-pass.js: the bounded, read-only runner. The extraction pipeline (EI, #216) is injected as a
// small stub so this test stands on its own; the runner never depends on how extraction works, only on its contract.
// No network.
//
// Run: node test/schedule-evidence-pass.test.js
"use strict";
const assert = require("assert");
const { runPass, missingFields, fullyHeld, sourcesFor } = require("../scripts/schedule-evidence-pass.js");
const { createEvidenceFetcher } = require("../api/_lib/evidence-fetch.js");

const NOW = () => new Date("2026-10-18T16:00:00Z");

// Stub pipeline with the same contract as api/_lib/schedule-evidence.js
const pipeline = {
  extractFromPage(p) {
    if (p.blocked) return { url: p.url, tier: p.tier, retrieved_at: p.retrieved_at || null, blocked: p.blocked, season: null };
    if (/BOOM/.test(p.text)) throw new Error("extractor exploded");
    const m = /Season: (\S+) to (\S+)/.exec(p.text);
    return { url: p.url, tier: p.tier, retrieved_at: p.retrieved_at, blocked: null, season: m ? { start: m[1], end: m[2], quote: m[0] } : null };
  },
  proposeSchedule({ pages, stored, internalNote }) {
    if (/PROPOSE-BOOM/.test(internalNote)) throw new Error("propose exploded");
    const out = { proposed: {}, conflicts: [], unsupported: [], blocked: [], kept: [] };
    const seasons = [];
    for (const p of pages) { if (p.blocked) out.blocked.push({ url: p.url, reason: p.blocked }); else if (p.season) seasons.push(p); }
    const distinct = new Set(seasons.map((p) => p.season.start + p.season.end));
    if (distinct.size > 1) out.conflicts.push({ field: "season", candidates: seasons.map((p) => ({ url: p.url, quote: p.season.quote })) });
    else if (seasons.length) out.proposed.season = { value: { start: seasons[0].season.start, end: seasons[0].season.end }, evidence: seasons.map((p) => ({ url: p.url, tier: p.tier, retrieved_at: p.retrieved_at, quote: p.season.quote })) };
    else out.unsupported.push("season");
    return out;
  },
};

function site(map, log) {
  return async (url, opts = {}) => {
    log.push({ url, method: opts.method });
    const hit = map[url];
    if (hit instanceof Error) throw hit;
    if (!hit) return { ok: false, status: 404, text: async () => "" };
    return { ok: hit.status >= 200 && hit.status < 300, status: hit.status, text: async () => hit.body || "" };
  };
}
const mk = (map, log, o = {}) => createEvidenceFetcher({ fetch: site(map, log), sleep: async () => {}, minDelayMs: 0, now: NOW, ...o });
const src = (id, url, tier = "media", extra = {}) => ({ id, url, tier, applies_to: ["haunted"], ...extra });
const cand = (id, extra = {}) => ({ id, kind: "seasonal", group: "haunted", internal_note: "", stored: {}, ...extra });

(async () => {
  // helpers
  assert.deepStrictEqual(missingFields(cand("x", { stored: { season: { value: 1 } } })), ["weekly_hours", "closed_dates"]);
  assert.ok(fullyHeld(cand("x", { stored: { season: { value: 1, rank_source: "verified" }, weekly_hours: { value: 1, rank_source: "manual" }, closed_dates: { value: [], rank_source: "owner_correction" } } })));
  assert.ok(!fullyHeld(cand("x", { stored: { season: { value: 1, rank_source: "tier" } } })));
  assert.deepStrictEqual(sourcesFor(cand("c1"), [src("a", "u1"), { id: "b", url: "u2", tier: "media", candidate_ids: ["c1"] }, { id: "c", url: "u3", tier: "media", applies_to: ["other"] }]).map((s) => s.id), ["a", "b"]);

  // 1. happy path: read-only (GET only), robots honored, evidence quoted with URL and retrieved_at, shared source fetched once
  let log = [];
  let f = mk({
    "https://a.test/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /private" },
    "https://a.test/season": { status: 200, body: "Season: 2026-09-18 to 2026-11-07" },
  }, log);
  const frozenInput = [cand("c1"), cand("c2")];
  let run = await runPass({ candidates: frozenInput, sources: [src("s1", "https://a.test/season")], fetcher: f, pipeline, now: NOW });
  assert.strictEqual(run.writes, 0);
  assert.ok(log.every((l) => l.method === "GET"), "only GET is ever issued");
  assert.strictEqual(log.filter((l) => l.url === "https://a.test/season").length, 1, "a shared source is fetched once per run");
  const ev = run.candidates[0].result.proposed.season.evidence[0];
  assert.deepStrictEqual([ev.url, ev.retrieved_at, !!ev.quote], ["https://a.test/season", "2026-10-18T16:00:00.000Z", true]);
  assert.ok(run.candidates[1].result.proposed.season, "second candidate reuses the fetched page");
  assert.deepStrictEqual(run.summary, { candidates: 2, resolvable: 2, conflict: 0, unsupported: 0, skipped: 0, failed_pages: 0 });

  // 2. no publication-affecting keys anywhere in the output; inputs untouched
  const text = JSON.stringify(run);
  for (const k of ["\"status\":\"", "published", "featured", "approved"]) assert.ok(!text.includes(k), "output must not carry " + k);
  assert.deepStrictEqual(frozenInput, [cand("c1"), cand("c2")], "candidates are not modified");

  // 3. robots Disallow: recorded as blocked, page never requested, never retried; run continues with other sources
  log = [];
  f = mk({
    "https://b.test/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /private" },
    "https://b.test/private/cal": { status: 200, body: "Season: 2026-01-01 to 2026-01-02" },
    "https://c.test/robots.txt": { status: 404 },
    "https://c.test/ok": { status: 200, body: "Season: 2026-09-18 to 2026-11-07" },
  }, log);
  run = await runPass({ candidates: [cand("c1")], sources: [src("a", "https://b.test/private/cal", "official"), src("b", "https://c.test/ok")], fetcher: f, pipeline, now: NOW });
  assert.ok(!log.some((l) => l.url.includes("/private/cal")), "blocked page never fetched");
  assert.deepStrictEqual(run.candidates[0].pages.map((p) => [p.outcome, p.attempts]), [["blocked", 1], ["ok", 1]]);
  assert.deepStrictEqual(run.candidates[0].result.blocked, [{ url: "https://b.test/private/cal", reason: "robots" }]);
  assert.ok(run.candidates[0].result.proposed.season, "other sources still produce evidence");

  // 4. robots.txt unreadable (5xx): fail closed, no retry of the page, recorded
  log = [];
  f = mk({ "https://d.test/robots.txt": { status: 503 }, "https://d.test/p": { status: 200, body: "Season: 2026-09-18 to 2026-11-07" } }, log);
  run = await runPass({ candidates: [cand("c1")], sources: [src("a", "https://d.test/p")], fetcher: f, pipeline, now: NOW });
  assert.strictEqual(run.candidates[0].pages[0].outcome, "robots_unavailable");
  assert.strictEqual(run.candidates[0].result.blocked[0].reason, "robots_unavailable");
  assert.ok(!log.some((l) => l.url === "https://d.test/p"));
  assert.strictEqual(run.candidates[0].result.proposed.season, undefined);

  // 5. retries: a 503 page is retried exactly once then recorded as fetch_failed; a 404 page is not retried
  log = [];
  f = mk({ "https://e.test/robots.txt": { status: 404 }, "https://e.test/flaky": { status: 503 }, "https://e.test/gone": { status: 404 } }, log);
  run = await runPass({ candidates: [cand("c1")], sources: [src("a", "https://e.test/flaky"), src("b", "https://e.test/gone")], fetcher: f, pipeline, now: NOW });
  assert.strictEqual(log.filter((l) => l.url === "https://e.test/flaky").length, 2, "one retry for a 5xx");
  assert.strictEqual(log.filter((l) => l.url === "https://e.test/gone").length, 1, "no retry for a 404");
  assert.deepStrictEqual(run.candidates[0].result.blocked.map((b) => b.reason), ["fetch_failed", "fetch_failed"]);
  assert.deepStrictEqual(run.candidates[0].result.unsupported, ["season"], "failures yield 'unsupported', never a guess");

  // 6. an extractor that throws is isolated to its page; a proposer that throws leaves the record with no proposal
  f = mk({ "https://g.test/robots.txt": { status: 404 }, "https://g.test/bad": { status: 200, body: "BOOM" }, "https://g.test/good": { status: 200, body: "Season: 2026-09-18 to 2026-11-07" } }, []);
  run = await runPass({ candidates: [cand("c1"), cand("c2", { internal_note: "PROPOSE-BOOM" })], sources: [src("a", "https://g.test/bad"), src("b", "https://g.test/good")], fetcher: f, pipeline, now: NOW });
  assert.strictEqual(run.candidates[0].pages[0].outcome, "extract_failed");
  assert.ok(run.candidates[0].result.proposed.season, "the other page still works");
  assert.strictEqual(run.candidates[1].result, null);
  assert.ok(/propose_failed/.test(run.candidates[1].note));

  // 7. conflicts are surfaced, not resolved
  f = mk({ "https://h.test/robots.txt": { status: 404 }, "https://h.test/a": { status: 200, body: "Season: 2026-09-18 to 2026-11-07" }, "https://h.test/b": { status: 200, body: "Season: 2026-09-25 to 2026-11-07" } }, []);
  run = await runPass({ candidates: [cand("c1")], sources: [src("a", "https://h.test/a", "official"), src("b", "https://h.test/b")], fetcher: f, pipeline, now: NOW });
  assert.strictEqual(run.candidates[0].result.conflicts.length, 1);
  assert.strictEqual(run.candidates[0].result.proposed.season, undefined);
  assert.strictEqual(run.summary.conflict, 1);

  // 8. a record fully held at verified/manual/OWNER-CORRECTION strength costs no fetch at all; no source = unsupported
  log = [];
  f = mk({}, log);
  const held = cand("held", { stored: { season: { value: 1, rank_source: "verified" }, weekly_hours: { value: 1, rank_source: "manual" }, closed_dates: { value: [], rank_source: "owner_correction" } } });
  run = await runPass({ candidates: [held, cand("nosrc", { group: "unmatched" })], sources: [src("a", "https://i.test/p")], fetcher: f, pipeline, now: NOW });
  assert.strictEqual(log.length, 0, "no fetch for held or unmatched candidates");
  assert.ok(/^nothing_to_do/.test(run.candidates[0].note));
  assert.strictEqual(run.candidates[1].note, "no_allow_listed_source");
  assert.deepStrictEqual([run.summary.skipped, run.summary.unsupported], [1, 1]);

  // 9. bounds: candidate cap and time budget stop the run and say so
  f = mk({ "https://j.test/robots.txt": { status: 404 }, "https://j.test/p": { status: 200, body: "Season: 2026-09-18 to 2026-11-07" } }, []);
  run = await runPass({ candidates: [cand("1"), cand("2"), cand("3")], sources: [src("a", "https://j.test/p")], fetcher: f, pipeline, now: NOW, limits: { maxCandidates: 2 } });
  assert.deepStrictEqual([run.candidates.length, run.stopped], [2, "max_candidates"]);
  run = await runPass({ candidates: [cand("1")], sources: [src("a", "https://j.test/p")], fetcher: f, pipeline, now: NOW, limits: { budgetMs: -1 } });
  assert.deepStrictEqual([run.candidates.length, run.stopped], [0, "budget"]);
  const capped = mk({ "https://k.test/robots.txt": { status: 404 }, "https://k.test/1": { status: 200, body: "x" }, "https://k.test/2": { status: 200, body: "x" } }, [], { maxPages: 1 });
  run = await runPass({ candidates: [cand("1")], sources: [src("a", "https://k.test/1"), src("b", "https://k.test/2")], fetcher: capped, pipeline, now: NOW });
  assert.deepStrictEqual(run.candidates[0].pages.map((p) => p.outcome), ["ok", "page_cap"], "the fetcher's page cap bounds a run");

  console.log("schedule-evidence-pass: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
