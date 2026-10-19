// test/link-field.test.js — api/_lib/link-field.js and its use in upsertEventRows (Q17).
//
// A ticket_url / event_url holds an absolute http(s) event page or nothing. The 565 CivicPlus calendar-feed paths and the
// "Pay at the door" text found in production (R&Q B06, 2026-10-19) are never stored, never resolved against a site.
//
// Plain Node assert, no dependencies. Run: node test/link-field.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { normalizeLinkField, resolveLinkField, normalizeRowLinks, sanitizeLinkForLog, createRejectionLog } = require(`${REPO_DIR}/api/_lib/link-field.js`);
const { upsertEventRows } = require(`${REPO_DIR}/api/_lib/event-upsert.js`);
const contract = require(`${REPO_DIR}/api/_lib/event-contract.js`);
const { makeMockPostgrest, eventsSchema } = require(`${REPO_DIR}/test/fixtures/mock-postgrest.js`);

const URL_BASE = "https://example.supabase.co";
const KEY = "service-role-key";
const event = (id, extra) => ({ external_id: id, title: `Event ${id}`, category: "music", start_date: "2026-10-30", status: "approved", ...extra });
const FEED = "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=23";

function freshDb(rows) {
  const tables = { events: rows || [] };
  const db = makeMockPostgrest(tables, { schema: { events: eventsSchema() } });
  global.fetch = db.fetch;
  return { tables, db };
}

async function run() {
  // --- 1. the rule -----------------------------------------------------------
  assert.strictEqual(normalizeLinkField("https://example.com/events/42"), "https://example.com/events/42");
  assert.strictEqual(normalizeLinkField("  http://example.com/t?id=1  "), "http://example.com/t?id=1", "trimmed, otherwise untouched");
  assert.strictEqual(normalizeLinkField("https://www.eventbrite.com/e/some-show-tickets-123"), "https://www.eventbrite.com/e/some-show-tickets-123");
  for (const bad of [FEED, "Pay at the door", "", "   ", "example.com/tickets", "//example.com/tickets", "/events/42", "mailto:a@b.co", "javascript:alert(1)", "ftp://example.com/x", "https://", "https://localhost/x", 42, {}, []]) {
    assert.strictEqual(normalizeLinkField(bad), null, `rejected: ${JSON.stringify(bad)}`);
  }
  // the feed path is rejected even when absolute: it resolves to a real page that is not the event
  for (const feed of ["https://www.royaloakmi.com" + FEED, "https://x.gov/common/modules/iCalendar/iCalendar.aspx?feed=calendar", "https://x.org/calendar.ics", "https://x.org/feed.rss?cat=1"]) {
    assert.strictEqual(normalizeLinkField(feed), null, `calendar feed rejected: ${feed}`);
  }
  assert.strictEqual(normalizeLinkField("https://x.gov/Calendar.aspx?EID=912"), "https://x.gov/Calendar.aspx?EID=912", "a CivicPlus EVENT page is fine");
  assert.strictEqual(normalizeLinkField("https://x.org/topics-and-ics-guide"), "https://x.org/topics-and-ics-guide", ".ics only counts as an extension");
  console.log("PASS: only an absolute http(s) event page is a link; feed paths, price text, relative and non-web values are not");

  // --- 1b. connector side: resolution only with source context, never for a feed path -------------------------------------
  {
    const base = "https://www.royaloakmi.com/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=23";
    assert.deepStrictEqual(resolveLinkField("https://a.org/e/1", base), { url: "https://a.org/e/1", raw: "https://a.org/e/1", reason: "ok" });
    assert.deepStrictEqual(resolveLinkField("/Calendar.aspx?EID=912", base), { url: "https://www.royaloakmi.com/Calendar.aspx?EID=912", raw: "/Calendar.aspx?EID=912", reason: "resolved" });
    assert.strictEqual(resolveLinkField(FEED, base).reason, "feed_path", "the CivicPlus feed path is not an event page, even though it would resolve");
    assert.strictEqual(resolveLinkField(FEED, base).url, null);
    assert.strictEqual(resolveLinkField("https://x.gov" + FEED, base).reason, "feed_path");
    assert.strictEqual(resolveLinkField("/events/9", undefined).reason, "unresolvable", "no source context, no resolution");
    assert.strictEqual(resolveLinkField("/events/9", "not a url").reason, "unresolvable");
    assert.strictEqual(resolveLinkField("/events/9", "ftp://x.org/f").reason, "unresolvable");
    assert.strictEqual(resolveLinkField("//other.org/x", base).reason, "not_a_link", "protocol-relative is not guessed");
    assert.strictEqual(resolveLinkField("Pay at the door", base).reason, "not_a_link");
    assert.strictEqual(resolveLinkField("", base).reason, "empty");
    assert.strictEqual(resolveLinkField(undefined, base).reason, "empty");
    assert.strictEqual(resolveLinkField("javascript:alert(1)", base).reason, "not_a_link");
  }
  console.log("PASS: a site-relative path resolves only against an http(s) source and only to an event page; feed paths and text do not");

  // --- 2. rows: no mutation, absent stays absent, ticket_url nulls, event_url omits --------------------------------
  {
    const good = event("g", { ticket_url: "https://example.com/t", event_url: "https://example.com/e" });
    assert.strictEqual(normalizeRowLinks(good), good, "a clean row is returned as is");
    const bad = event("b", { ticket_url: FEED, event_url: "Pay at the door" });
    const snapshot = JSON.stringify(bad);
    const out = normalizeRowLinks(bad);
    assert.strictEqual(JSON.stringify(bad), snapshot, "the caller's row is not mutated");
    assert.ok(!("ticket_url" in out), "an unusable ticket_url is omitted so the stored value stands");
    assert.ok(!("event_url" in out), "an unusable event_url is omitted so the stored value stands");
    for (const blank of ["", "   "]) {
      assert.ok(!("ticket_url" in normalizeRowLinks(event("nl", { ticket_url: blank }))), `a blank link (${JSON.stringify(blank)}) is omitted`);
    }
    assert.strictEqual(normalizeRowLinks(event("nl", { ticket_url: null })).ticket_url, null, "an explicit null is left as the connector sent it (HALO clears a link on purpose)");
    const bare = event("n");
    assert.strictEqual(normalizeRowLinks(bare), bare);
    assert.ok(!("ticket_url" in normalizeRowLinks(bare)), "a row without the key does not gain one");
    assert.strictEqual(normalizeRowLinks(null), null);
  }
  console.log("PASS: rows are copied, never mutated; an unusable link is omitted, an explicit null is kept, absent keys stay absent");

  // --- 3. through the shared writer ---------------------------------------------------------------------------------
  {
    const { tables } = freshDb([
      event("feed-1", { ticket_url: FEED, event_url: "https://royaloakmi.com/e/1" }), // 565 shape, stored; the repair clears it
      event("valid-1", { ticket_url: "https://example.com/real", event_url: "https://example.com/real-e" }),
      event("valid-2", { ticket_url: "https://example.com/real2" }),
    ]);
    const rows = [
      event("feed-1", { ticket_url: FEED, event_url: "Pay at the door" }),
      event("valid-1", { ticket_url: "Pay at the door", event_url: "//example.com/x" }), // rejected incoming over valid stored
      event("valid-2", { ticket_url: "https://royaloakmi.com" + FEED }),                  // absolute feed URL over valid stored
      event("new-1", { ticket_url: "https://royaloakmi.com" + FEED }),
      event("ok-1", { ticket_url: "https://example.com/ok" }),
      event("none-1", { ticket_url: null }),
    ];
    const input = JSON.stringify(rows);
    const resp = await upsertEventRows(URL_BASE, KEY, rows);
    assert.ok(resp.ok, "the write succeeds");
    assert.strictEqual(JSON.stringify(rows), input, "the connector's rows are not mutated");
    const by = (id) => tables.events.find((r) => r.external_id === id);
    assert.strictEqual(by("valid-1").ticket_url, "https://example.com/real", "a rejected incoming ticket_url never overwrites a valid stored one");
    assert.strictEqual(by("valid-1").event_url, "https://example.com/real-e", "nor does a rejected event_url");
    assert.strictEqual(by("valid-2").ticket_url, "https://example.com/real2", "an absolute feed URL does not replace a valid stored link either");
    assert.strictEqual(by("feed-1").ticket_url, FEED, "a stored feed path is left for the guarded repair, a refresh does not rewrite it");
    assert.strictEqual(by("new-1").ticket_url == null, true, "a new row with a feed URL stores no link");
    assert.strictEqual(by("ok-1").ticket_url, "https://example.com/ok", "a good link is stored as sent");
    assert.strictEqual(by("none-1").ticket_url == null, true);
  }

  // --- 3b. regression matrix: stored valid link vs each kind of incoming value, and repeated ingestion ---------------------
  {
    const STORED = "https://tickets.example.org/e/100";
    const cases = [
      ["invalid incoming (feed path)", { ticket_url: FEED }, STORED],
      ["invalid incoming (price text)", { ticket_url: "Pay at the door" }, STORED],
      ["invalid incoming (protocol-relative)", { ticket_url: "//tickets.example.org/e/9" }, STORED],
      ["missing incoming (blank)", { ticket_url: "  " }, STORED],
      ["missing incoming (undefined)", { ticket_url: undefined }, STORED],
      ["missing incoming (key absent)", {}, STORED],
      ["verified replacement (organizer moved the page)", { ticket_url: "https://tickets.example.org/e/100-new" }, "https://tickets.example.org/e/100-new"],
      ["same value again", { ticket_url: STORED }, STORED],
    ];
    for (const [name, incoming, expected] of cases) {
      const { tables } = freshDb([event("m-1", { ticket_url: STORED, title: "Keep me" })]);
      const first = await upsertEventRows(URL_BASE, KEY, [event("m-1", { title: "Keep me", ...incoming })]);
      assert.ok(first.ok, `${name}: write accepted`);
      const afterFirst = JSON.stringify(tables.events);
      assert.strictEqual(tables.events.length, 1, `${name}: no event added or discarded`);
      assert.strictEqual(tables.events[0].ticket_url, expected, `${name}: stored ticket_url`);
      assert.strictEqual(tables.events[0].title, "Keep me", `${name}: the event is intact`);
      const second = await upsertEventRows(URL_BASE, KEY, [event("m-1", { title: "Keep me", ...incoming })]);
      assert.ok(second.ok);
      assert.strictEqual(JSON.stringify(tables.events).replace(/"updated_at":"[^"]*",?/g, ""), afterFirst.replace(/"updated_at":"[^"]*",?/g, ""), `${name}: repeated ingestion changes nothing`);
    }
  }
  console.log("PASS: stored valid link vs invalid, missing and valid-replacement incoming values; repeated ingestion is idempotent; no event is discarded");
  console.log("PASS: through upsertEventRows — rejected links never overwrite a stored link, new rows store none, good links are untouched");

  // --- 4. an owner-corrected link is never replaced -----------------------------------------------------------------
  {
    const line = contract.buildOwnerCorrectionLine({ at: "2026-10-19T03:00:00Z", editId: "e1", actor: "admin", changes: [{ field: "ticket_url", before: FEED, after: "https://example.com/fixed" }], note: "" });
    const { tables } = freshDb([event("own-1", { ticket_url: "https://example.com/fixed", internal_note: contract.appendNoteLine(null, line) })]);
    await upsertEventRows(URL_BASE, KEY, [event("own-1", { ticket_url: FEED })]);
    assert.strictEqual(tables.events.find((r) => r.external_id === "own-1").ticket_url, "https://example.com/fixed", "the owner correction survives a feed refresh");
  }
  console.log("PASS: an owner-corrected ticket_url still wins over the feed");

  // --- 5. diagnostics: sanitized, bounded, aggregated ---------------------------------------------------------------
  {
    const clean = sanitizeLinkForLog("https://user:hunter2@x.org/e/1?token=abc123&email=jo@x.org&catID=7&sig=zz#frag");
    assert.ok(!/hunter2|abc123|jo@x\.org|zz|frag|user:/.test(clean), `credentials, tokens, email and fragment are redacted: ${clean}`);
    assert.ok(/catID=7/.test(clean), "a harmless parameter stays useful");
    assert.strictEqual(sanitizeLinkForLog("/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=23"), "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=23");
    assert.strictEqual(sanitizeLinkForLog("/a?api_key=SECRET&x=1"), "/a?api_key=[redacted]&x=1", "a relative value is masked too");
    assert.ok(!/@/.test(sanitizeLinkForLog("Email jo@x.org to pay at the door")) && /\[email\]/.test(sanitizeLinkForLog("Email jo@x.org")));
    assert.ok(!/555/.test(sanitizeLinkForLog("Call (313) 555-0142 for tickets")), "phone numbers are masked");
    assert.ok(!/[0-9a-f]{24}/.test(sanitizeLinkForLog("https://x.org/t/0123456789abcdef0123456789abcdef/e")), "long token-like path segments are masked");
    assert.ok(sanitizeLinkForLog("x".repeat(500)).length <= 121, "long values are cut");
    assert.strictEqual(sanitizeLinkForLog(undefined), "");

    const lines = [];
    const rl = createRejectionLog({ limit: 20, log: (l) => lines.push(l) });
    const a = { id: "fs-a", venue_name: "City A" }, b = { id: "fs-b", venue_name: "City B" };
    rl.record(a, Array.from({ length: 15 }, (_, i) => ({ raw: `/p/${i}?token=t${i}`, reason: "feed_path" })));
    rl.record(b, Array.from({ length: 10 }, () => ({ raw: "Pay at the door", reason: "not_a_link" })));
    rl.record(a, [{ raw: "/x?token=late", reason: "feed_path" }]);
    rl.flush();
    const detail = lines.filter((l) => l.includes("rejected_ticket_link source="));
    assert.strictEqual(detail.length, 20, "at most 20 individual values are logged per run");
    assert.ok(detail.every((l) => /source=fs-[ab] reason=(feed_path|not_a_link) value=/.test(l)), "each line carries source, reason, value");
    assert.ok(!lines.join("\n").includes("token=t"), "no raw token value reaches the log");
    assert.ok(!lines.join("\n").includes("late"), "values past the limit are not logged");
    const agg = lines.filter((l) => l.includes("rejected_ticket_link_aggregate"));
    assert.deepStrictEqual(agg.sort(), [
      "[feeds] rejected_ticket_link_aggregate source=fs-a reason=feed_path count=1",
      "[feeds] rejected_ticket_link_aggregate source=fs-b reason=not_a_link count=5",
    ].sort(), "the rest are aggregated by source and reason, without values");
    const sum = rl.summary();
    assert.strictEqual(sum.logged, 20);
    assert.strictEqual(sum.totalsBySourceAndReason.reduce((n, t) => n + t.count, 0), 26, "totals account for every rejection");
  }
  console.log("PASS: rejected links are logged sanitized, at most 20 per run, the rest aggregated by source and reason without values");

  console.log("\nAll link-field.test.js checks passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
