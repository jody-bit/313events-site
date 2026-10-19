// test/link-field.test.js — api/_lib/link-field.js and its use in upsertEventRows (Q17).
//
// A ticket_url / event_url holds an absolute http(s) event page or nothing. The 565 CivicPlus calendar-feed paths and the
// "Pay at the door" text found in production (R&Q B06, 2026-10-19) are never stored, never resolved against a site.
//
// Plain Node assert, no dependencies. Run: node test/link-field.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();
const { normalizeLinkField, resolveLinkField, normalizeRowLinks } = require(`${REPO_DIR}/api/_lib/link-field.js`);
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
    assert.strictEqual(out.ticket_url, null, "ticket_url is source-authoritative: written as null");
    assert.ok(!("event_url" in out), "event_url is protect-from-blank: omitted so the stored value stands");
    const bare = event("n");
    assert.strictEqual(normalizeRowLinks(bare), bare);
    assert.ok(!("ticket_url" in normalizeRowLinks(bare)), "a row without the key does not gain one");
    assert.strictEqual(normalizeRowLinks(null), null);
  }
  console.log("PASS: rows are copied, never mutated; ticket_url becomes null, event_url is omitted, absent keys stay absent");

  // --- 3. through the shared writer ---------------------------------------------------------------------------------
  {
    const { tables } = freshDb([
      event("feed-1", { ticket_url: FEED, event_url: "https://royaloakmi.com/e/1" }), // 565 shape, stored
      event("text-1", { ticket_url: "https://example.com/real" }),
    ]);
    const rows = [
      event("feed-1", { ticket_url: FEED, event_url: "Pay at the door" }),
      event("text-1", { ticket_url: "Pay at the door" }),
      event("new-1", { ticket_url: "https://royaloakmi.com" + FEED }),
      event("ok-1", { ticket_url: "https://example.com/ok" }),
    ];
    const input = JSON.stringify(rows);
    const resp = await upsertEventRows(URL_BASE, KEY, rows);
    assert.ok(resp.ok, "the write succeeds");
    assert.strictEqual(JSON.stringify(rows), input, "the connector's rows are not mutated");
    const by = (id) => tables.events.find((r) => r.external_id === id);
    assert.strictEqual(by("feed-1").ticket_url, null, "a refresh clears a stored feed path");
    assert.strictEqual(by("feed-1").event_url, "https://royaloakmi.com/e/1", "an unusable event_url never overwrites a stored one");
    assert.strictEqual(by("text-1").ticket_url, null, "price text is not stored as a link");
    assert.strictEqual(by("new-1").ticket_url, null, "a new row with a feed URL stores no link");
    assert.strictEqual(by("ok-1").ticket_url, "https://example.com/ok", "a good link is stored as sent");
  }
  console.log("PASS: through upsertEventRows — feed paths and price text are never stored, a refresh clears stored feed paths, good links are untouched");

  // --- 4. an owner-corrected link is never replaced -----------------------------------------------------------------
  {
    const line = contract.buildOwnerCorrectionLine({ at: "2026-10-19T03:00:00Z", editId: "e1", actor: "admin", changes: [{ field: "ticket_url", before: FEED, after: "https://example.com/fixed" }], note: "" });
    const { tables } = freshDb([event("own-1", { ticket_url: "https://example.com/fixed", internal_note: contract.appendNoteLine(null, line) })]);
    await upsertEventRows(URL_BASE, KEY, [event("own-1", { ticket_url: FEED })]);
    assert.strictEqual(tables.events.find((r) => r.external_id === "own-1").ticket_url, "https://example.com/fixed", "the owner correction survives a feed refresh");
  }
  console.log("PASS: an owner-corrected ticket_url still wins over the feed");

  console.log("\nAll link-field.test.js checks passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
