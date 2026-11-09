// neighborhoods.html "N upcoming": must page past Supabase's 1,000-row response cap, use the ongoing rule and Detroit's date.
// Deterministic fixture with 1,520 matching rows (> 1,000), served by the repo's mock PostgREST with cap 1000.
"use strict";
const assert = require("assert"), fs = require("fs"), vm = require("vm");
const dir = process.env.REPO_DIR || process.cwd();
const html = fs.readFileSync(`${dir}/neighborhoods.html`, "utf8");
const { makeMockPostgrest } = require(`${dir}/test/fixtures/mock-postgrest.js`);
const { fetchAllRows } = require(`${dir}/paged-fetch.js`);

// structure
const tagAt = (src) => html.indexOf(`<script src="${src}"></script>`);
assert.ok(tagAt("/paged-fetch.js") !== -1 && tagAt("/event-dates.js") !== -1, "loads paged-fetch.js and event-dates.js");
assert.ok(tagAt("/paged-fetch.js") < html.indexOf("fetchAllRows(") && tagAt("/event-dates.js") < html.indexOf("EventDates.detroitClock"), "includes load before use");
assert.ok(!/events_public\?[^`]*limit=\d+/.test(html), "no single capped events request");
assert.ok(/function getTodayISO\(\)\{\s*return EventDates\.detroitClock\(\)\.iso;/.test(html), "Detroit date from the shared helper");
const tpl = (html.match(/fetchAllRows\(`([^`]+events_public[^`]+)`/) || [])[1];
assert.ok(tpl, "paged events_public query not found");
assert.ok(/order=id\.asc`?$/.test(tpl) && tpl.includes("select=id,neighborhood"), "unique tiebreak order and select");
assert.ok(tpl.includes("or=(start_date.gte.${todayISO},and(date_semantics.eq.continuous,end_date.gte.${todayISO}))"), "ongoing rule");
const fn = html.match(/function neighborhoodCounts\(rows\)\{[\s\S]*?\n\}\n/);
assert.ok(fn, "neighborhoodCounts not found");
const neighborhoodCounts = new Function(`${fn[0]}; return neighborhoodCounts;`)();

// fixture
const T = "2026-11-09", past = "2026-10-01", future = "2026-12-01";
let n = 0; const rows = [];
const add = (count, o) => { for (let i = 0; i < count; i++) rows.push(Object.assign({ id: ++n, title: "e" + n, start_date: future, end_date: future, date_semantics: "single", neighborhood: "A" }, o)); };
add(700, { neighborhood: "A" }); add(500, { neighborhood: "B" }); add(300, { neighborhood: "C" });   // 1,500 upcoming
add(20, { neighborhood: "A", start_date: past, end_date: "2027-01-10", date_semantics: "continuous" }); // ongoing: counted
add(200, { neighborhood: "B", start_date: past, end_date: past });                                  // past: not counted
add(50, { neighborhood: "C", start_date: past, end_date: "2026-11-05", date_semantics: "continuous" }); // ended: not counted
add(30, { neighborhood: "B", start_date: past, end_date: "2026-12-20", date_semantics: null });        // unverified past start: not counted
add(40, { neighborhood: null });                                                                    // no neighborhood
// shuffle deterministically so insertion order is not id order
rows.sort((a, b) => ((a.id * 7919) % 1013) - ((b.id * 7919) % 1013));
const truth = { A: 720, B: 500, C: 300 };
assert.ok(truth.A + truth.B + truth.C > 1000, "fixture really exceeds the 1,000-row cap");

(async () => {
  const api = makeMockPostgrest({ events_public: rows }, { cap: 1000 });
  const url = tpl.split("${SUPABASE_URL}").join("https://example.supabase.co").split("${todayISO}").join(T);
  const got = neighborhoodCounts((await fetchAllRows(url, { apikey: "anon" }, { fetchImpl: api.fetch })).rows);
  assert.deepStrictEqual(Object.fromEntries([...got].sort()), truth, "paged counts match the truth across the 1,000-row cap");
  assert.ok(api.log.length > 2, "more than one page was requested");
  // contrast: the old single capped request cannot see them all
  const old = await api.fetch(`https://example.supabase.co/rest/v1/events_public?select=neighborhood&start_date=gte.${T}&neighborhood=not.is.null&limit=3000`);
  const oldRows = await old.json();
  assert.ok(oldRows.length <= 1000 && oldRows.length < truth.A + truth.B + truth.C, "old query was capped (regression contrast)");
  console.log("neighborhoods-count-paged ok (" + (truth.A + truth.B + truth.C) + " rows, old query returned " + oldRows.length + ")");
})().catch((e) => { console.error(e); process.exit(1); });
