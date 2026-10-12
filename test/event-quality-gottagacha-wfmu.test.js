// test/event-quality-gottagacha-wfmu.test.js
// GottaGacha source links, Shake Some Action WFMU organizer link, description
// quality, and the link/ticket separation in Needs Follow Up.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

process.env.CRON_SECRET = "";
const gg = require("../api/cron-gottagacha");
const { descriptionQuality } = require("../api/_lib/description-quality");
const { organizerLinkFor, withOrganizerEventUrl, fillBlankOrganizerEventUrls } = require("../api/_lib/organizer-links");
const { upsertEventRows } = require("../api/_lib/event-upsert");
const { evaluateEvent } = require("../api/_lib/integrity");

const SERIES = "678f7ab6-010c-4430-a823-ad9c7d0c6f49";
const IG = "https://www.instagram.com/shakesomeactionwfmu/";

// 1. GottaGacha: every event links back to GottaGacha.
{
  const ok = gg.parseEvent({ id: SERIES, title: "Hi-Fight Circuit #15", eventDate: "2027-01-08", location: "GottaGacha" });
  assert.strictEqual(ok.event_url, `https://www.gottagacha.com/events/${SERIES}?date=2027-01-08`);
  for (const id of ["not-a-uuid", "GFE", "12345"]) {
    const r = gg.parseEvent({ id, title: "GFE Tourney", eventDate: "2026-11-14" });
    assert.strictEqual(r.event_url, "https://www.gottagacha.com/events", "no occurrence page derivable -> official events page");
    assert.ok(!("ticket_url" in r), "ticket_url stays omitted");
  }
  console.log("PASS: every GottaGacha event carries a GottaGacha source link, ticket_url untouched");
}

// 2. Organizer link: fills blank event_url only, never ticket_url.
{
  const t = "Shake Some Action WFMU Presents: H8 Mile + Diet Smiles";
  assert.strictEqual(withOrganizerEventUrl({ title: t, event_url: null }), IG);
  assert.strictEqual(withOrganizerEventUrl({ title: "x", submitter_org_name: "Shake Some Action WFMU" }), IG);
  assert.strictEqual(withOrganizerEventUrl({ title: t, event_url: "https://example.org/e" }), "https://example.org/e", "an existing link is never replaced");
  assert.strictEqual(withOrganizerEventUrl({ title: "Other show", event_url: null }), null, "other organizers untouched");
  assert.strictEqual(organizerLinkFor({ title: "Other show" }), null);
  assert.ok(!("ticket_url" in organizerLinkFor({ title: t })), "organizer rule never yields a ticket link");
  console.log("PASS: Shake Some Action WFMU organizer link fills a blank event_url only");
}

// 3. Integrity: organizer link alone is a valid link (no link.none), free event needs no ticket.
{
  const base = { title: "Shake Some Action WFMU Presents: H8 Mile", source: "manual", external_id: "x", description: "A punk show with four bands.", start_date: "2099-01-01", time_display: "8 PM", venue_name_raw: "Riverside Barbecue", venue_address_raw: "910 N. Summit St", venue_city_raw: "Toledo", is_free: true, ticket_url: null, event_url: IG };
  const codes = (e) => (evaluateEvent(e, { today: "2026-10-12" }).reasons || []).map((r) => r.code);
  assert.ok(!codes(base).includes("link.none"));
  assert.ok(codes({ ...base, event_url: null }).includes("link.none"), "control: no link at all still reported");
  console.log("PASS: an organizer/source link satisfies the link check without a ticket link");
}

// 4. Description quality on the real production strings.
{
  const cases = [
    ["GG Gundam TCG Event", "Gundam TCG", "restates_title"],
    ["Link coming soon", "GFE Tourney", "placeholder"],
    ["coming soon", "GG Halloween", "placeholder"],
    ["Deets dropping soon", "Pokemon Day Part 2", "placeholder"],
    ["ALL DAY :: List Coming Soon", "Horror Movie Day", "placeholder"],
    ["https://www.start.gg/tournament/hi-fight-circuit-13/details", "Hi-Fight Circuit #13", "bare_url"],
    ["10PM-2AM", "Alex Tourney", "time_only"],
    ["Shake Some Action WFMU presents a punk show featuring H8 Mile (Detroit no wave punk), Diet Smiles (Toledo surf punk), Belly Ache (Toledo hardcore punk), Squzz (", "Shake Some Action WFMU Presents: H8 Mile + Diet Smiles", "truncated"],
    ["", "x", "missing"],
    ["Mario Kart Monthly", "Hi-Fight Circuit #15", "unrelated_to_title"],
    ["Casual Magic The Gathering!", "Friday Night Magic", "ok"],
    ["Open play for Mario Kart with a monthly bracket.", "Hi-Fight Circuit #15", "ok"],
  ];
  for (const [d, t, want] of cases) assert.strictEqual(descriptionQuality(d, t).quality, want, d);
  const codes = (d, t) => evaluateEvent({ title: t, description: d, source: "GottaGacha", external_id: "g", start_date: "2099-01-01" }, { today: "2026-10-12" }).reasons.map((r) => r.code);
  assert.ok(codes("10PM-2AM", "Alex Tourney").includes("description.not_descriptive"));
  assert.ok(codes("deets coming soon", "Glotaku Halloween").includes("description.placeholder"));
  console.log("PASS: generic, link-only, time-only, truncated and title-restating descriptions are flagged");
}

// 5. admin.html's inline copy agrees with the module; link vs ticket separation in getMissingFields.
{
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
  const a = html.indexOf("function getMissingFields(e)");
  const gm = html.slice(a, html.indexOf("\n}\n", a) + 3);
  const ctx = {};
  vm.runInNewContext(gm + "; this.getMissingFields = getMissingFields;", ctx);
  const full = { title: "Show", description: "x", venue_address_raw: "910 N. Summit St", time_display: "8 PM", ticket_url: null, event_url: IG, is_free: true };
  const gaps = (d, t) => Array.from(ctx.getMissingFields({ ...full, title: t, description: d }));
  const samples = [["GG Gundam TCG Event", "Gundam TCG"], ["Link coming soon", "x"], ["10PM-2AM", "x"], ["https://a.b/c", "x"], ["A real band plays all night.", "Show"], ["foo (bar", "x"], ["deets coming soon | time is a placeholder", "x"], ["ALL DAY :: List Coming Soon", "x"], ["Casual Magic The Gathering!", "Friday Night Magic"], ["A long time ago...", "x"], ["Mario Kart Monthly", "Hi-Fight Circuit #15"], ["Open play for Mario Kart with a monthly bracket.", "Hi-Fight Circuit #15"], ["A long time ago...", "Return of the Jedi 1983"]];
  for (const [d, t] of samples) assert.strictEqual(gaps(d, t).length === 0, descriptionQuality(d, t).ok, d);
  assert.deepStrictEqual(gaps("A punk show with four bands.", "Show"), [], "organizer link, no ticket: not a follow-up");
  assert.deepStrictEqual(gaps("Squzz (", "Show"), ["description"], "truncated description is a follow-up");
  // the four original Needs Follow Up events, each flagged for a real reason
  assert.deepStrictEqual(gaps("Mario Kart Monthly", "Hi-Fight Circuit #15"), ["description"], "Hi-Fight Circuit #15");
  assert.deepStrictEqual(gaps("Link coming soon", "GFE Tourney"), ["description"], "GFE Tourney");
  assert.deepStrictEqual(gaps("coming soon", "PART 2"), ["description"], "PART 2");
  assert.deepStrictEqual(gaps("Shake Some Action WFMU presents a punk show featuring Squzz (", "Shake Some Action WFMU Presents: H8 Mile + Diet Smiles"), ["description"], "Shake Some Action WFMU");
  console.log("PASS: admin.html Needs Follow-up agrees with the module and does not require a ticket link");
}

// 6. All ingestion paths: blank-only back-fill, never ticket_url, never a set link.
(async () => {
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 204, text: async () => "" }; };
  const wfmu = { title: "Shake Some Action WFMU Presents: X", external_id: "e1", event_url: "https://example.org/verified" };
  const n = await fillBlankOrganizerEventUrls("https://db.test", "k", [wfmu, { title: "Other", external_id: "e2" }], fakeFetch);
  assert.strictEqual(n, 1, "one PATCH, for the matched organizer only");
  const c = calls[0];
  assert.strictEqual(c.init.method, "PATCH");
  assert.ok(c.url.includes("or=(event_url.is.null,event_url.eq.)"), "database-side blank-only filter");
  assert.ok(decodeURIComponent(c.url).includes("title=ilike.*shake some action wfmu*"));
  assert.deepStrictEqual(JSON.parse(c.init.body), { event_url: IG }, "payload is event_url alone: ticket_url never sent");
  assert.strictEqual((await fillBlankOrganizerEventUrls("https://db.test", "k", [{ title: "Nope" }], fakeFetch)), 0);
  assert.strictEqual(calls.length, 1, "no organizer match -> no request");
  assert.strictEqual(await fillBlankOrganizerEventUrls("https://db.test", "k", [wfmu], async () => { throw new Error("down"); }), 0, "failure never fails ingestion");

  // wired into the shared upsert used by every connector
  const seen = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => { seen.push({ url, method: init && init.method }); return { ok: true, status: 201, text: async () => "" }; };
  try {
    await upsertEventRows("https://db.test", "k", [{ external_id: "e1", title: "Shake Some Action WFMU Presents: Y", source: "Eventbrite", ticket_url: "https://tix.example/y" }]);
    assert.ok(seen.some((x) => x.method === "PATCH" && x.url.includes("event_url.is.null")), "shared upsert back-fills blank organizer links");
    seen.length = 0;
    await upsertEventRows("https://db.test", "k", [{ external_id: "e2", title: "Ordinary show" }]);
    assert.ok(!seen.some((x) => x.method === "PATCH"), "other events: no extra request");
  } finally { global.fetch = realFetch; }
  console.log("PASS: organizer link back-fills blank event_url on every ingestion path; ticket_url and set links untouched");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
