// test/editorial-stone-wall-regression.test.js — Admin Hardening acceptance
// case (2026-10-08): the Stone Wall Pumpkin Festival.
//
// Production published this C&G Newspapers article as:
//   Venue TBA · 11 Mile Road · Warren · Oct. 6-10 · no time ·
//   description cut off at "held this year from 10 a.m."
// The real event (article, rochesterhills.org museum page, city calendar):
//   Sat. Oct. 10, 2026, 10 a.m.-4 p.m., Rochester Hills Museum at Van Hoosen
//   Farm, 1005 Van Hoosen Rd, Rochester Hills.
// Each wrong value had its own cause in scripts/press-coverage-linking.js:
//   - "11 Mile Road, Warren": the outlet's own OFFICE address in the site
//     footer (no "Related Articles" heading in the server HTML, so nothing
//     was trimmed) -> extractStreetAddress(), which outranks every other
//     city signal.
//   - Oct. 6: the byline's publish date, before the event's first mention;
//     the date window had an end but no start.
//   - Oct. 10 end date: "the last of any two dates" became an end date.
//   - "10 a.m.": "a.m. " read as a sentence boundary.
// The same footer address is on two more published events (Backyard and
// Beyond, Your Attention Please).
//
// The page below is a SYNTHETIC reconstruction of the real page's shape
// (header navigation naming many cities, byline date, dateline, venue
// mention, photo caption, footer office address) in paraphrased words.
//
// Run: node test/editorial-stone-wall-regression.test.js
"use strict";
const assert = require("assert");
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const pc = require(`${REPO_DIR}/scripts/press-coverage-linking.js`);

const PUBLISHED = "2026-10-06T19:07:29+00:00";
const HEADLINE = "Pumpkin festival celebrates fall harvest with family fun";
const PAGE = `<html><head><title>${HEADLINE} - C &amp; G Newspapers</title></head><body>
<nav><ul><li>Birmingham-Bloomfield Eagle</li><li>Farmington Press</li><li>Novi Note</li><li>Rochester Post</li>
<li>Royal Oak Review</li><li>Southfield Sun</li><li>Sterling Heights Sentry</li><li>Troy Times</li><li>Warren Weekly</li></ul></nav>
<main><h1>${HEADLINE}</h1><p class="byline">By staff on October 06, 2026</p>
<p>ROCHESTER HILLS — Families have lots to do at the Rochester Hills Museum at Van Hoosen Farm to mark the harvest season this month.</p>
<p>For more than 25 years the museum has hosted its Stone Wall Pumpkin Festival, held this year from 10 a.m. to 4 p.m. Saturday, Oct. 10. Admission is $8 for members and $12 for others.</p>
<p class="caption">Carvers set their pumpkins on the wall at the Stone Wall Pumpkin Festival, to be lit after dark.</p>
<p>A scarecrow exhibit is also unveiled that day. The pumpkins are lit from 7 p.m. to 9 p.m.</p>
<p>For a full schedule, visit rochesterhills.org/museum.</p></main>
<footer><p>Copyright C &amp; G Publishing. All Rights Reserved.</p><p>OFFICE: 13650 E. 11 Mile Road, Warren, MI 48089 (586) 498-8000</p>
<ul><li>Farmington Press</li><li>Warren Weekly</li></ul></footer></body></html>`;

async function pageText(html) {
  return pc.fetchArticleText("https://example.com/stone-wall", async () => ({ ok: true, status: 200, text: async () => html }));
}

async function run() {
  const text = await pageText(PAGE);

  // 1. the footer never reaches extraction
  assert.ok(!text.includes("11 Mile Road"), "the outlet's office address is cut with the footer");
  assert.strictEqual(pc.trimTrailingBoilerplate("Body text. ©2026 Some Outlet | All Rights Reserved 123 Main St, Detroit"), "Body text.", "a © ... All Rights Reserved footer is cut too");
  assert.strictEqual(pc.trimTrailingBoilerplate("Photo © 2026 Jane Doe. The fest runs Oct. 10."), "Photo © 2026 Jane Doe. The fest runs Oct. 10.", "a photo credit is not a footer");
  assert.strictEqual(pc.trimTrailingBoilerplate("She says copyright law protects the mural."), "She says copyright law protects the mural.", "the word copyright in a sentence is not a footer");
  console.log("PASS: the publisher's footer (office address) is trimmed before any extractor sees it");

  // 2. identity: no Warren, the real single date, a whole sentence
  const id = pc.extractEventIdentity(HEADLINE, text, PUBLISHED);
  assert.strictEqual(id.title, "Stone Wall Pumpkin Festival");
  assert.strictEqual(id.streetAddress, null, "no address is stated for the event itself");
  assert.notStrictEqual(id.city, "Warren", "Warren appears only in navigation/footer chrome");
  assert.strictEqual(id.startDate, "2026-10-10", "never the byline's publish date");
  assert.strictEqual(id.endDate, null, "a one-day event is not a range");
  assert.ok(id.description && id.description.endsWith("Saturday, Oct. 10."), `whole sentence, not cut at "a.m.": ${id.description}`);
  console.log("PASS: extraction yields the real date (Oct. 10 only), no fabricated end date, no footer address, and the full sentence");

  // 3. with no confident location the article goes to a person -- not published with a guess
  const verdict = pc.isSufficientForCreate(id);
  assert.strictEqual(verdict.sufficient, false);
  {
    const created = [];
    const counts = await pc.linkPressCoverageQueue({
      SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", logger: { log() {}, warn() {}, error() {} },
      nowIso: "2026-10-06",
      fetchQueue: async () => [{ id: "a-stone-wall", title: HEADLINE, excerpt: "ROCHESTER HILLS — Families have lots to do at the Rochester Hills Museum at Van Hoosen Farm.", url: "https://example.com/stone-wall", published_at: PUBLISHED }],
      fetchCandidateEvents: async () => [],
      fetchArticleTextFn: async () => text,
      buildVenueIdMap: async () => new Map(),
      createEventFn: async (...a) => { created.push(a[3]); return { id: "x" }; },
      applyLinkFn: async () => true,
      repairGenericMetadataFn: async () => ({ written: 0 }),
    });
    assert.strictEqual(created.length, 0, "no event is created from an article whose location could not be confirmed");
    assert.strictEqual(counts.stillHuman, 1, "it stays in Press Coverage for a decision");
  }
  console.log("PASS: without a confirmed venue the article stays with a person instead of publishing Venue TBA / Warren");

  // 4. no regressions in what the window and ranges are meant to keep
  const P = "2026-10-01T12:00:00Z";
  assert.deepStrictEqual(pc.extractEventDates("Big news. On Oct. 10, the Harvest Fest returns.", P, "Harvest Fest"), ["2026-10-10"], "a date earlier in the SAME sentence still counts");
  assert.deepStrictEqual(pc.extractEventDates("Posted Oct. 2, 2026. The Harvest Fest returns Oct. 10.", P, "Harvest Fest"), ["2026-10-10"], "a date in an earlier sentence (a byline) does not");
  const ranged = pc.extractEventIdentity("x", "The Harvest Fest runs Oct. 10 through Oct. 12 at the Grand Hall.", P);
  assert.deepStrictEqual([ranged.startDate, ranged.endDate], ["2026-10-10", "2026-10-12"], "a stated range is kept");
  const dayRange = pc.extractEventIdentity("x", "The Harvest Fest is Oct. 10-12 at the Grand Hall.", P);
  assert.deepStrictEqual([dayRange.startDate, dayRange.endDate], ["2026-10-10", "2026-10-12"], "Oct. 10-12 is a stated range");
  const twoSessions = pc.extractEventIdentity("x", "The Harvest Fest is Oct. 10 and again Oct. 17 at the Grand Hall.", P);
  assert.deepStrictEqual([twoSessions.startDate, twoSessions.endDate, twoSessions.latestDate], ["2026-10-10", null, "2026-10-17"], "two separate dates are not a range");
  console.log("PASS: same-sentence dates and stated ranges still work; two separate dates no longer become a range");
}

run().then(() => console.log("editorial-stone-wall-regression: ok")).catch((err) => { console.error(err); process.exit(1); });
