// test/wp07-connector-coverage.test.js — WP 0.7 (safe batching): every
// ingestion connector writes its event rows through the shared helper, and
// nothing else in the codebase sends a batch to the database without
// having been checked for row shape.
//
// WHY A STRUCTURAL TEST. PostgREST rejects a bulk POST whose rows differ in
// key set (see test/notes/postgrest-mixed-keys.md). The helper,
// api/_lib/event-upsert.js, makes that impossible for whatever rows it is
// given — proven in test/event-upsert.test.js against a fake that rejects
// what production rejects. That guarantee only holds for a connector that
// actually uses the helper, so this file pins:
//   1. all 25 event-ingestion connectors call upsertEventRows();
//   2. none of them still posts to events by hand;
//   3. every OTHER direct database POST in api/ and scripts/ is on an
//      audited list. A new write site, or a change to what an existing one
//      sends, fails here until someone has looked at whether its rows can
//      differ in shape.
// Same approach as test/wp017-connector-coverage.test.js (reads source as
// text); runtime proof is in test/wp07-affected-connectors.test.js (the
// connectors that were failing), test/wp07-latent-connectors.test.js (the
// ones that could) and test/wp07-partial-writes.test.js.
//
// Plain Node assert, no dependencies. Run: node test/wp07-connector-coverage.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const read = (rel) => fs.readFileSync(path.join(REPO_DIR, rel), "utf8");
const list = (dir) => fs.readdirSync(path.join(REPO_DIR, dir)).filter((f) => f.endsWith(".js")).map((f) => `${dir}/${f}`);

// The same 25 as test/wp017-connector-coverage.test.js. The second column
// records what was known on 2026-10-03:
//   REJECTED   production's API log shows this connector's batch refused
//              that day with "All object keys must match";
//   LATENT     the row builder writes at least one field as
//              `value || undefined` (or equivalent), so its rows CAN differ
//              in shape, but that day's batch happened to be uniform (or,
//              for Planet Ant, never reached the database);
//   no-undefined  a text scan of the row builder found no field built that
//              way. This is a scan, not a proof — which is exactly why all
//              25 go through the helper rather than only the first two
//              groups.
const CONNECTORS = [
  ["cron-bagleycommunity.js", "no-undefined"],
  ["cron-belle-isle-nature-center.js", "no-undefined"],
  ["cron-bigtimebingo.js", "no-undefined"],
  ["cron-cinema-detroit.js", "no-undefined"],
  ["cron-detroitmonthofdesign.js", "REJECTED"],
  ["cron-detroittraining.js", "REJECTED"],
  ["cron-dossin.js", "no-undefined"],
  ["cron-eventbrite.js", "no-undefined"],
  ["cron-feeds.js", "no-undefined"],
  ["cron-gottagacha.js", "LATENT"], // 2026-10-08: event_url is omitted where a stored link is kept (keepEventUrl); mixed shapes covered by test/gottagacha-event-url.test.js
  ["cron-halo.js", "no-undefined"],
  ["cron-lagerhouse.js", "LATENT"],
  ["cron-localist.js", "no-undefined"],
  ["cron-metrotimes.js", "no-undefined"],
  ["cron-motorcitywine.js", "REJECTED"],
  ["cron-oldmiami.js", "LATENT"],
  ["cron-outerlimitslounge.js", "no-undefined"],
  ["cron-planetanttheatre.js", "LATENT"],
  ["cron-playgrounddetroit.js", "LATENT"],
  ["cron-poppspacking.js", "REJECTED"],
  ["cron-redford-theatre.js", "no-undefined"],
  ["cron-ticketmaster.js", "REJECTED"],
  ["cron-trinosophes.js", "no-undefined"],
  ["cron-visitdetroit.js", "no-undefined"],
  ["cron-wdet.js", "LATENT"],
];

// Every direct `rest/v1/<table>` POST that is allowed to exist outside the
// helper, with what it sends and why its shape cannot vary. Audited
// 2026-10-03.
const AUDITED_DIRECT_POSTS = [
  ["api/_lib/event-source-identities.js", "event_source_identities", "[{ event_id: eventId, source, source_id: sourceId }]", "one row"],
  ["api/_lib/run-log.js", "source_runs", '[{ source_slug: sourceSlug, outcome: "started" }]', "one row"],
  ["api/_lib/venue-lookup.js", "venues", "insertBody", "single object, not a batch"],
  ["api/admin-editorial.js", "editorial_article_events", "{ article_id: articleId, event_id: eventId }", "single object"],
  ["api/admin-editorial.js", "events", "row", "single object (one manually created event)"],
  ["api/admin-editorial.js", "editorial_article_events", "{ article_id: articleId, event_id: inserted.id }", "single object"],
  ["api/cron-editorial.js", "editorial_article_events", "{ article_id: article.id, event_id: match.event.id }", "single object"],
  ["api/cron-editorial.js", "editorial_articles", "rows", "batch; every row is built with the same nine keys, blanks as null"],
  ["api/cron-editorial.js", "editorial_article_events", "joinRows", "batch; every row is { article_id, event_id }"],
  ["api/cron-healthcheck.js", "healthchecks", "[{ overall, duration_ms: durationMs, checks }]", "one row"],
  ["api/submit-feed.js", "feed_sources", "row", "single object"],
  ["api/submit.js", "events", "row", "single object (one public submission)"],
  ["scripts/duplicate-consolidation.js", "editorial_article_events", "{ article_id: link.article_id, event_id: survivor.id }", "single object (a press link re-pointed at the canonical event)"],
  ["scripts/press-coverage-linking.js", "editorial_article_events", "{ article_id: articleId, event_id: eventId }", "single object"],
  ["scripts/press-coverage-linking.js", "events", "row", "single object (one sourced editorial candidate, on_conflict=external_id, ignore-duplicates)"],
  ["scripts/ra-candidate-promotion.js", "events", "[row]", "one row"],
  ["scripts/ra-sync.js", "events", "payload", "batch; deriveEventRow() sets all 18 keys on every row, blanks as null (description, end_date, time_display, price_from, image_url, address, city, note)"],
  ["scripts/venue-geography.js", "neighborhoods", "[{ name, area_note: null, is_district: false }]", "one row (a neighborhood label, only when labels from City names are asked for; on_conflict=name, ignore-duplicates)"],
  ["scripts/venues-from-stated-places.js", "venues", "[{ name: place.name, address: place.address, city: place.city }]", "one row (one canonical venue)"],
];

function findDirectPosts(file) {
  const source = read(file);
  const found = [];
  const re = /rest\/v1\/([a-z_]+)[^\n]*\n(?:[^\n]*\n){0,2}?[^\n]*method: "POST"/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const tail = source.slice(m.index + m[0].length, m.index + m[0].length + 900);
    const body = /body: JSON\.stringify\(([^\n]*)\),?\n/.exec(tail);
    found.push([file, m[1], body ? body[1] : "?"]);
  }
  return found;
}

function run() {
  const cronFiles = list("api").filter((f) => path.basename(f).startsWith("cron-"));

  // --- 1. every ingestion connector uses the helper ---------------------------
  for (const [file] of CONNECTORS) {
    const source = read(`api/${file}`);
    assert.ok(source.includes('const { upsertEventRows } = require("./_lib/event-upsert");'), `${file} must require api/_lib/event-upsert.js`);
    assert.ok(/await upsertEventRows\(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, \w+\)/.test(source), `${file} must write its rows with upsertEventRows()`);
  }
  const usingHelper = cronFiles.filter((f) => read(f).includes("upsertEventRows(")).map((f) => path.basename(f)).sort();
  assert.deepStrictEqual(usingHelper, CONNECTORS.map(([file]) => file).sort(), "the connector list above is exactly the set of cron files that write events");
  console.log(`PASS: all ${CONNECTORS.length} event-ingestion connectors write through api/_lib/event-upsert.js`);

  // --- 2. no connector posts to events by hand any more ------------------------
  for (const file of cronFiles) {
    const source = read(file);
    assert.ok(!/rest\/v1\/events\?on_conflict/.test(source), `${file} must not build its own events upsert request — use upsertEventRows()`);
    assert.ok(!/rest\/v1\/events[`"'?][^\n]*\n(?:[^\n]*\n){0,2}?[^\n]*method: "POST"/.test(source), `${file} must not POST to events directly`);
  }
  console.log("PASS: no cron file builds its own events upsert request");

  // --- 3. the connector failure branches report what was really written -------
  // (Runtime proof for one connector of each pattern is in
  // test/wp07-partial-writes.test.js; this pins the same code in all 25.)
  const CHUNKED = ["cron-detroitmonthofdesign.js", "cron-playgrounddetroit.js"];
  for (const [file] of CONNECTORS) {
    const source = read(`api/${file}`);
    const call = source.indexOf("await upsertEventRows(");
    const failure = source.slice(call, call + 1800); // the failure branch directly follows the call
    if (CHUNKED.includes(file)) {
      assert.ok(failure.includes("chunkErrors.push({ externalIds: resp.failedRows.map((r) => r.external_id), error: errText });"), `${file}: a chunk's error must list the rejected rows, not the whole chunk`);
      assert.ok(failure.includes("upserted += resp.written;\n        continue;"), `${file}: rows written before/after a rejected group must be counted`);
    } else if (file === "cron-poppspacking.js") {
      assert.ok(failure.includes("return { ok: false, count: resp.written, error: errText };"), `${file}: must report resp.written`);
    } else if (file === "cron-feeds.js") {
      assert.ok(failure.includes("upserted: upsertResp.written, failed: true };"), `${file}: must report upsertResp.written and mark the failure`);
      assert.ok(source.includes("pollResult = outcome.upserted && !outcome.failed"), `${file}: a partial write must not be read as a clean one`);
    } else {
      assert.ok(/res\.status\(502\)\.json\(\{ upserted: resp\.written, (skipped, )?error: "Supabase upsert failed: " \+ errText \}\);/.test(failure), `${file}: the 502 must report resp.written, not a hard-coded 0`);
      if (source.includes('require("./_lib/run-log")')) {
        assert.ok(/outcome: "failed",\n\s+http_status: resp\.status,[\s\S]{0,160}records_written: resp\.written,\n\s+error_sample: "Supabase upsert failed: " \+ errText,/.test(failure),
          `${file}: the run log must record outcome failed with records_written: resp.written`);
      }
    }
    assert.ok(!/upserted: 0, (skipped, )?error: "Supabase upsert failed/.test(source) && !/records_written: 0,\n\s+error_sample: "Supabase upsert failed/.test(source), `${file}: no hard-coded 0 left on the upsert-failure path`);
  }
  console.log("PASS: every connector reports the true written count when part of a batch is rejected (and a run-logged one still logs the run as failed)");

  // --- 4. the helper itself never widens a row ---------------------------------
  {
    const helper = read("api/_lib/event-upsert.js").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/columns=/.test(helper), "the helper must not use a columns= list (PostgREST would null-fill the absent keys)");
    assert.ok(!/missing=default/.test(helper), "nor Prefer: missing=default");
    assert.ok(helper.includes('body: `[${group.json.join(",")}]`'), "each request body is assembled from the group's own rows, serialized once");
  }
  console.log("PASS: the helper sends each group's rows as given — no columns= list, no missing=default (behavior proven in test/event-upsert.test.js)");

  // --- 5. every other direct database POST has been audited --------------------
  {
    const files = [...list("api"), ...list("api/_lib"), ...list("scripts")].sort();
    const found = files.flatMap(findDirectPosts);
    const expected = AUDITED_DIRECT_POSTS.map(([file, table, body]) => [file, table, body]);
    assert.deepStrictEqual(found, expected,
      "the set of direct database POSTs changed. A bulk POST whose rows differ in key set is rejected in full by PostgREST — " +
      "check whether the new/changed site can send such a batch (if it writes event rows, use upsertEventRows()), then update AUDITED_DIRECT_POSTS.");
    // The two RA scripts and the editorial candidate writer (2026-10-05: one
    // row keyed by external_id so a rerun never duplicates) are the only
    // direct events upserts left, and are listed above with why they are safe.
    const directEventUpserts = files.filter((f) => /rest\/v1\/events\?on_conflict/.test(read(f)));
    assert.deepStrictEqual(directEventUpserts, ["scripts/press-coverage-linking.js", "scripts/ra-candidate-promotion.js", "scripts/ra-sync.js"]);
  }
  console.log(`PASS: the ${AUDITED_DIRECT_POSTS.length} remaining direct database POSTs are exactly the audited ones (single objects, one-row arrays, or batches built with a fixed key set)`);

  // --- 6. the audit labels above are checked against the code -----------------
  // A connector builds a field as undefined exactly when its (comment-
  // stripped) source uses `undefined` as a value.
  const usesUndefinedValue = (file) => read(`api/${file}`).split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .some((line) => /\bundefined\b/.test(line) && !/[!=]==\s*undefined|typeof|error_sample/.test(line));
  for (const [file, audit] of CONNECTORS) {
    assert.strictEqual(usesUndefinedValue(file), audit !== "no-undefined",
      `${file} is labelled ${audit} but ${usesUndefinedValue(file) ? "builds" : "does not build"} a field as undefined — re-audit it and add it to the runtime tests if its rows can now differ in shape`);
  }
  const count = (label) => CONNECTORS.filter(([, audit]) => audit === label).length;
  console.log(`PASS: the ${count("REJECTED") + count("LATENT")} connectors labelled as able to emit differing shapes are exactly the ones whose code builds a field as undefined`);
  console.log(`\n  ${count("REJECTED")} connectors were being rejected in production, ${count("LATENT")} more can emit rows of differing shape, ${count("no-undefined")} showed no such field on a scan — all ${CONNECTORS.length} now use the helper.`);
  console.log("\nAll wp07-connector-coverage.test.js checks passed.");
}

try {
  run();
} catch (err) {
  console.error("FAIL:", err);
  process.exitCode = 1;
}
