// test/text-sanitize.test.js — N7 / #224 shared text sanitizer, and its wiring in the shared events writer.
"use strict";
const assert = require("assert");
const REPO = process.env.REPO_DIR || process.cwd();
const { sanitizeText, sanitizeRowText } = require(`${REPO}/api/_lib/text-sanitize.js`);

// The Schoolcraft case (row 303436bd): CSS leaked into the venue name.
assert.strictEqual(sanitizeText(".cf0{font-family:Segoe UI;font-size:10.5pt;} James R. Hartman Theatre"), "James R. Hartman Theatre");
// tags and entities
assert.strictEqual(sanitizeText("<p>Doors at 7 &amp; music at 8</p>"), "Doors at 7 & music at 8");
// R&Q review: an angle-bracketed word that is not an HTML tag is text and survives.
assert.strictEqual(sanitizeText("AC/DC <Live> at Fox"), "AC/DC <Live> at Fox");
assert.strictEqual(sanitizeText("<b>AC/DC</b> <Live> at Fox"), "AC/DC <Live> at Fox");
assert.strictEqual(sanitizeText("Rock&#8217;n&#x2019;Roll &ndash; Live&nbsp;Show"), "Rock’n’Roll – Live Show");
assert.strictEqual(sanitizeText("A<br/>B"), "A B");
assert.strictEqual(sanitizeText("x<!-- hidden -->y<style>.a{color:red}</style>z"), "x y z");
// decoded once only: a literal escaped entity is not decoded twice
assert.strictEqual(sanitizeText("&amp;lt;b&amp;gt;"), "&lt;b&gt;");
// untouched
for (const t of ["Plain title", "DJ VIP RA Night", "Tom & Jerry", "5 < 6 and 7 > 3", "Venue {TBA}", "Price: $5; cash only", "https://example.org/a?b=1&c=2", "", "A\nB"]) assert.strictEqual(sanitizeText(t), t, "unchanged: " + t);
// unknown entity and invalid code point stay as written
assert.strictEqual(sanitizeText("&bogus; &#0; &#xD800;"), "&bogus; &#0; &#xD800;");
// never empties a field
assert.strictEqual(sanitizeText("<br/>"), "<br/>");
assert.strictEqual(sanitizeText(null), null);
assert.strictEqual(sanitizeText(undefined), undefined);
// acronyms / case are not touched (ALL-CAPS handling is separate)
assert.strictEqual(sanitizeText("<b>HALO DETROIT: DJ NIGHT</b>"), "HALO DETROIT: DJ NIGHT");

// row-level: only text fields, copy not mutation, absent fields stay absent
const row = { title: "A &amp; B", description: "<p>d</p>", venue_name_raw: ".cf0{font-family:Segoe UI;font-size:10.5pt;} James R. Hartman Theatre", ticket_url: "https://x.org/?a=1&amp;b=2", venue_city_raw: "Livonia" };
const copy = JSON.stringify(row);
const out = sanitizeRowText(row);
assert.strictEqual(JSON.stringify(row), copy, "input row not mutated");
assert.strictEqual(out.title, "A & B");
assert.strictEqual(out.description, "d");
assert.strictEqual(out.venue_name_raw, "James R. Hartman Theatre");
assert.strictEqual(out.ticket_url, "https://x.org/?a=1&amp;b=2", "URLs are not this sanitizer's business");
assert.ok(!("venue_address_raw" in out));
assert.strictEqual(sanitizeRowText({ title: "Fine" }).title, "Fine");

// wiring: the shared writer sanitizes before sending, and owner-corrected fields are restored afterwards
(async () => {
  const { upsertEventRows } = require(`${REPO}/api/_lib/event-upsert.js`);
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (opts && opts.method === "POST") { sent.push(JSON.parse(opts.body)); return { ok: true, status: 201, text: async () => "" }; }
    return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
  };
  try {
    await upsertEventRows("https://example.supabase.co", "k", [{ source: "City of Livonia - Community Events", external_id: "feed-x-4800", title: "The Real Inspector Hound", start_date: "2026-11-07", venue_name_raw: ".cf0{font-family:Segoe UI;font-size:10.5pt;} James R. Hartman Theatre", description: "<p>Tickets &amp; info</p>" }]);
  } finally { global.fetch = realFetch; }
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0][0].venue_name_raw, "James R. Hartman Theatre");
  assert.strictEqual(sent[0][0].description, "Tickets & info");
  console.log("ok text-sanitize");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
