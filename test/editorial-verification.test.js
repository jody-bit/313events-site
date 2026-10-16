// test/editorial-verification.test.js — DQ-004: verified-only editorial associations.
//
// "313.events must never publicly claim that an article covers an event unless that association is
// supported by reliable evidence." Covers: the automatic-verification rule, the matchers (rejected
// pairs are never re-created), the admin decisions and their audit trail, the migration, and that the
// homepage, event page and On the Radar read verified pairs only.
//
// Plain Node assert, no dependencies. Run: node test/editorial-verification.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO_DIR || process.cwd();
const read = (f) => fs.readFileSync(path.join(REPO, f), "utf8");

process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.ADMIN_SECRET = "admin-secret";
process.env.CRON_SECRET = "cron-secret";

const V = require(path.join(REPO, "api/_lib/editorial-verification.js"));

(async () => {
  // ---------------------------------------------------------------------------------------------
  console.log("-- 1. the automatic verification rule (auto_rule_v1)");
  const art = (title, excerpt, publishedAt) => ({ title, excerpt, publishedAt: publishedAt || "2026-10-02T12:00:00Z" });
  const ev = (o) => Object.assign({ title: "Elmwood Alight", start_date: "2026-10-10", venueName: "Elmwood Cemetery", city: "Detroit" }, o);

  // Distinctive title + the event's venue named + date window -> verified.
  let v = V.evaluateAutoLink(art("Elmwood Alight returns", "Lantern-lit evening at Elmwood Cemetery"), ev(), { matchType: "title", sameTitleCount: 1 });
  assert.strictEqual(v.status, "verified");
  assert.strictEqual(v.by, "auto_rule_v1");

  // A shared title alone is never enough (title only, no venue, no city).
  v = V.evaluateAutoLink(art("Elmwood Alight returns", "A night of lanterns"), ev(), { matchType: "title", sameTitleCount: 1 });
  assert.strictEqual(v.status, "candidate", "title alone stays a hidden candidate");

  // "Detroit" alone corroborates nothing.
  v = V.evaluateAutoLink(art("Elmwood Alight returns to Detroit", "Lanterns"), ev(), { matchType: "title", sameTitleCount: 1 });
  assert.strictEqual(v.status, "candidate", "the word Detroit is not corroboration");

  // THE HARVEST FESTIVAL CASE: same generic title, article is about a different place.
  v = V.evaluateAutoLink(
    art("Harvest Festival returns to Rosie's Park", "Madison Heights residents gather for the annual Harvest Festival", "2026-10-02T20:22:00Z"),
    ev({ title: "Harvest Festival", start_date: "2026-10-03", venueName: "Upland Hills Farm", city: "Oxford" }),
    { matchType: "title", sameTitleCount: 1 });
  assert.strictEqual(v.status, "needs_follow_up", "conflicting municipality prevents automatic verification");
  assert.ok(/madison heights/.test(v.basis), "the conflicting place is recorded");

  // Generic-title collision: many events share the title; venue named in the text does not rescue it.
  v = V.evaluateAutoLink(art("Farmers Market opens at Royal Oak Farmers Market", "Royal Oak"), ev({ title: "Farmers Market", venueName: "Royal Oak Farmers Market", city: "Royal Oak" }), { matchType: "title", sameTitleCount: 73 });
  assert.strictEqual(v.status, "candidate");
  assert.ok(/generic title/.test(v.basis));

  // A venue/date match is a venue-topic signal, never identity.
  v = V.evaluateAutoLink(art("Masonic Temple centennial", "At the Masonic Temple"), ev({ title: "Isakov", venueName: "Masonic Temple" }), { matchType: "venue_date", sameTitleCount: 1 });
  assert.strictEqual(v.status, "candidate");

  // Whole-word matching: "Michigander" is not in "Michiganders".
  v = V.evaluateAutoLink(art("167K Michiganders could lose SNAP", "Dana Nessel, Saint Andrew's Hall"), ev({ title: "Michigander", venueName: "Saint Andrew's Hall", city: "Detroit" }), { matchType: "title", sameTitleCount: 1 });
  assert.strictEqual(v.status, "candidate", "substring is not a match");

  // Date window.
  v = V.evaluateAutoLink(art("Elmwood Alight returns", "Elmwood Cemetery", "2018-01-01T00:00:00Z"), ev(), { matchType: "title", sameTitleCount: 1 });
  assert.strictEqual(v.status, "candidate", "a 2018 article does not verify a 2026 event");
  console.log("PASS: 1. title alone, Detroit alone, generic titles, venue_date, substrings and old articles never verify; conflicting places go to follow-up");

  // ---------------------------------------------------------------------------------------------
  console.log("-- 2. new rows fail closed and carry provenance");
  const row = V.newLinkRow("a1", "e1", { status: "candidate", by: "auto_rule_v1", basis: "why" });
  assert.strictEqual(row.verification_status, "candidate");
  assert.strictEqual(row.verified_by, null);
  assert.strictEqual(row.verified_at, null);
  assert.strictEqual(row.verification_history.length, 1);
  const vrow = V.newLinkRow("a1", "e1", { status: "verified", by: "auto_rule_v1", basis: "ok" });
  assert.ok(vrow.verified_at && vrow.verified_by === "auto_rule_v1");
  const sql = read("supabase/migrations/20261016000000_dq004_editorial_link_verification.sql");
  assert.ok(/verification_status\s+text\s+not null default 'candidate'/.test(sql), "the column default is candidate: a writer that omits it creates a hidden row");
  assert.ok(/check \(verification_status in \('verified', 'candidate', 'needs_follow_up', 'rejected'\)\)/.test(sql));
  assert.ok(/for select using \(verification_status = 'verified'\)/.test(sql), "the public key can read verified rows only");
  assert.ok(/revoke select on editorial_article_events from anon, authenticated;/.test(sql) && /grant select \(article_id, event_id, created_at, verification_status\)/.test(sql), "internal columns are not readable by the public key");
  assert.ok(!/delete from|drop table|truncate/i.test(sql), "the migration deletes nothing");
  console.log("PASS: 2. default candidate, provenance recorded, verified-only public policy, internal columns private, nothing deleted");

  // ---------------------------------------------------------------------------------------------
  console.log("-- 3. the feed matcher never re-creates a rejected pair");
  const cron = require(path.join(REPO, "api/cron-editorial.js"));
  const events = [
    { id: "ev-oxford", title: "Harvest Festival", start_date: "2026-10-03", venue_name_raw: "Upland Hills Farm", venue_city_raw: "Oxford" },
    { id: "ev-other", title: "Rosie's Park Concert", start_date: "2026-10-09", venue_name_raw: "Rosie's Park", venue_city_raw: "Madison Heights" },
  ];
  const article = { title: "Harvest Festival returns to Rosie's Park", excerpt: "Madison Heights hosts a concert at Rosie's Park", url: "https://x/1", publishedAt: "2026-10-02T20:00:00Z" };
  let m = cron.matchArticleToEvent(article, events);
  assert.strictEqual(m.event.id, "ev-oxford", "without a rejection the generic title matches (as a hidden candidate/follow-up)");
  assert.notStrictEqual(m.verification.status, "verified", "…and is not verified");
  m = cron.matchArticleToEvent(article, events, { excluded: new Set(["ev-oxford"]) });
  assert.ok(!m || m.event.id !== "ev-oxford", "a rejected pair is skipped by the matcher");
  console.log("PASS: 3. the rejected Harvest Festival pair is skipped; the unrejected match is never verified");

  // ---------------------------------------------------------------------------------------------
  console.log("-- 4. press-coverage-linking: hidden by default, rejected skipped, created-from-article verified");
  const pcl = require(path.join(REPO, "scripts/press-coverage-linking.js"));
  const cands = [{ id: "ev-1", title: "Harvest Festival", start_date: "2026-10-03", venue_name_raw: "Upland Hills Farm", venue_city_raw: "Oxford" }];
  let dm = pcl.deepMatchArticleToEvent("Harvest Festival returns to Rosie's Park in Madison Heights", "2026-10-02", cands, { titleCounts: new Map(), articleTitle: "Harvest Festival returns to Rosie's Park" });
  assert.strictEqual(dm.event.id, "ev-1");
  assert.notStrictEqual(dm.verification.status, "verified");
  dm = pcl.deepMatchArticleToEvent("Harvest Festival returns to Rosie's Park in Madison Heights", "2026-10-02", cands, { excluded: new Set(["ev-1"]) });
  assert.strictEqual(dm, null, "rejected pair is not offered again by the deep matcher");
  // applyLink writes ignore-duplicates, never overwrites an existing status
  const posted = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { posted.push({ url, opts }); return { ok: true, status: 201, text: async () => "", json: async () => [] }; };
  const apply = require(path.join(REPO, "scripts/press-coverage-linking.js"));
  assert.ok(typeof apply.linkPressCoverageQueue === "function");
  global.fetch = realFetch;
  const src = read("scripts/press-coverage-linking.js");
  assert.ok(/applyLinkFn\(SUPABASE_URL, sbHeaders, article\.id, created\.id, "manual", CREATED_FROM_ARTICLE\)/.test(src), "an event created from the article is verified by construction");
  assert.ok(/resolution=ignore-duplicates,return=minimal[\s\S]{0,200}newLinkRow/.test(src), "press-coverage links never overwrite an existing pair");
  const cronSrc = read("api/cron-editorial.js");
  assert.ok(!/editorial_article_events\?on_conflict=article_id,event_id`[\s\S]{0,160}merge-duplicates/.test(cronSrc), "cron-editorial no longer merge-upserts join rows (would overwrite a status)");
  console.log("PASS: 4. deep matcher gives hidden verdicts, skips rejected pairs; writers use ignore-duplicates");

  // ---------------------------------------------------------------------------------------------
  console.log("-- 5. admin decisions: audit trail, override, rejected pairs reopenable");
  const store = new Map(); // `${a}|${e}` -> row
  const articles = new Map([["a1", { id: "a1", matched_event_id: "e1", match_type: "title" }]]);
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, method, body });
    const ok = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) });
    const pair = /article_id=eq\.([^&]+)&event_id=eq\.([^&]+)/.exec(url);
    if (url.includes("/editorial_article_events")) {
      if (method === "GET" && pair) { const r = store.get(`${pair[1]}|${pair[2]}`); return ok(r ? [r] : []); }
      if (method === "PATCH" && pair) { const k = `${pair[1]}|${pair[2]}`; store.set(k, Object.assign({}, store.get(k), body)); return ok([]); }
      if (method === "POST") { store.set(`${body.article_id}|${body.event_id}`, body); return ok([]); }
    }
    if (url.includes("/editorial_articles")) {
      const idm = /id=eq\.([^&]+)/.exec(url);
      if (method === "PATCH" && idm) {
        const a = articles.get(idm[1]);
        if (url.includes("matched_event_id=is.null") && a.matched_event_id !== null) return ok([]);
        if (/matched_event_id=eq\.([^&]+)/.test(url) && a.matched_event_id !== /matched_event_id=eq\.([^&]+)/.exec(url)[1]) return ok([]);
        Object.assign(a, body); return ok([]);
      }
    }
    return ok([]);
  };
  delete require.cache[require.resolve(path.join(REPO, "api/admin-editorial.js"))];
  const admin = require(path.join(REPO, "api/admin-editorial.js"));
  const call = async (body) => {
    let status = 0, out;
    await admin({ method: "POST", headers: { "x-admin-secret": "admin-secret" }, body }, { status(c) { status = c; return this; }, json(j) { out = j; return this; } });
    return { status, out };
  };
  store.set("a1|e1", { article_id: "a1", event_id: "e1", verification_status: "candidate", verification_history: [{ to: "candidate", by: "auto_rule_v1" }] });

  let r = await call({ articleId: "a1", eventId: "e1", action: "reject_link", note: "different Harvest Festival" });
  assert.strictEqual(r.status, 200);
  let rowNow = store.get("a1|e1");
  assert.strictEqual(rowNow.verification_status, "rejected");
  assert.strictEqual(rowNow.verified_by, "admin");
  assert.strictEqual(rowNow.verification_history.length, 2, "the previous state is kept in the audit trail");
  assert.strictEqual(rowNow.verification_history[1].from, "candidate");
  assert.ok(/different Harvest Festival/.test(rowNow.verification_basis));
  assert.strictEqual(articles.get("a1").matched_event_id, null, "rejecting clears the article's primary match; the pair row stays");
  assert.ok(!calls.some((c) => c.method === "DELETE"), "nothing is deleted");

  r = await call({ articleId: "a1", eventId: "e1", action: "reopen_link", note: "" });
  assert.strictEqual(store.get("a1|e1").verification_status, "candidate", "an administrator can reconsider a rejected pair");
  assert.strictEqual(store.get("a1|e1").verification_history.length, 3);

  r = await call({ articleId: "a1", eventId: "e1", action: "confirm_link", note: "article body names the event, venue and dates" });
  assert.strictEqual(store.get("a1|e1").verification_status, "verified");
  assert.strictEqual(articles.get("a1").matched_event_id, "e1", "the first confirmed event becomes the article's primary match");
  assert.strictEqual(store.get("a1|e1").verification_history.length, 4);

  // link_event overrides even a rejected pair and creates missing pairs as verified
  store.set("a2|e9", { article_id: "a2", event_id: "e9", verification_status: "rejected", verification_history: [] });
  articles.set("a2", { id: "a2", matched_event_id: null, match_type: null });
  r = await call({ articleId: "a2", action: "link_event", eventId: "e9" });
  assert.strictEqual(store.get("a2|e9").verification_status, "verified");
  assert.strictEqual(store.get("a2|e9").verification_history.length, 1);
  r = await call({ articleId: "a2", action: "link_event", eventId: "e10" });
  assert.strictEqual(store.get("a2|e10").verification_status, "verified", "an article linked to a second event gets its own verified pair");
  assert.strictEqual(store.get("a2|e9").verification_status, "verified", "…and the first pair is unchanged (one article, several events)");

  r = await call({ articleId: "a1", eventId: "e1", action: "bogus" });
  assert.strictEqual(r.status, 400);
  global.fetch = realFetch;
  console.log("PASS: 5. confirm / reject / follow-up / reopen / link_event write status, actor, time, basis and an appended history; no deletes");

  // ---------------------------------------------------------------------------------------------
  console.log("-- 6. merging duplicate events keeps each link's verification state");
  assert.ok(/verification_status: link\.verification_status \|\| "candidate"/.test(read("scripts/duplicate-consolidation.js")));
  console.log("PASS: 6. consolidated press links stay verified / hidden / rejected as they were");

  // ---------------------------------------------------------------------------------------------
  console.log("-- 7. all three public surfaces read verified pairs only");
  const idx = read("index.html");
  const evt = read("event-template.html");
  const radar = read("radar.html");
  assert.ok(/editorial_article_events\?verification_status=eq\.verified&select=/.test(idx), "homepage asks for verified pairs");
  assert.ok(/editorial_article_events\?event_id=eq\.\$\{encodeURIComponent\(id\)\}&verification_status=eq\.verified/.test(evt), "event page asks for verified pairs");
  assert.ok(/editorial_article_events\.verification_status=eq\.verified/.test(radar) && !/const url = `[^`]*matched_event_id_fkey/.test(radar), "On the Radar takes its event only from verified join rows, not matched_event_id");
  // radar's mapping, run for real
  const fn = /function verifiedEventFor\(r\)\{[\s\S]*?\n    \}\n/.exec(radar);
  assert.ok(fn, "radar.html defines verifiedEventFor");
  const verifiedEventFor = new Function(fn[0] + "; return verifiedEventFor;")();
  const e1 = { id: "e1", status: "approved", start_date: "2026-10-20" };
  const e2 = { id: "e2", status: "approved", start_date: "2026-10-05" };
  const hidden = { id: "e3", status: "pending_review", start_date: "2026-10-01" };
  assert.deepStrictEqual(verifiedEventFor({ matched_event_id: null, editorial_article_events: [] }), { hadLinks: false, event: null }, "no associations: no event, no empty UI");
  assert.strictEqual(verifiedEventFor({ matched_event_id: "e1", editorial_article_events: [{ event_id: "e2", verification_status: "verified", events: e2 }, { event_id: "e1", verification_status: "verified", events: e1 }] }).event.id, "e1", "the article's primary verified match wins");
  assert.strictEqual(verifiedEventFor({ matched_event_id: "x", editorial_article_events: [{ event_id: "e1", verification_status: "verified", events: e1 }, { event_id: "e2", verification_status: "verified", events: e2 }] }).event.id, "e2", "otherwise the earliest verified event (one article, several events)");
  assert.strictEqual(verifiedEventFor({ matched_event_id: "e1", editorial_article_events: [{ event_id: "e1", verification_status: "candidate", events: e1 }] }).event, null, "an unverified pair gives no event even if the server returned it");
  assert.deepStrictEqual(verifiedEventFor({ matched_event_id: "e3", editorial_article_events: [{ event_id: "e3", verification_status: "verified", events: hidden }] }), { hadLinks: true, event: null }, "a verified pair to a hidden event is dropped, not shown as a dead link");
  console.log("PASS: 7. homepage, event page and radar share one rule; radar tolerates zero, one and many associations");

  console.log("\nAll DQ-004 editorial verification tests passed.");
})().catch((err) => { console.error("FAIL:", err); process.exit(1); });
