// test/description-enrichment.test.js — api/_lib/description-enrichment.js
//
// 2026-09-23, "AI factual descriptions" (Admin automated enrichment). Proves
// buildFactualDescription() only ever connects verified structured fields
// already on the event — matching the Product Owner's exact safe/unsafe
// example — and never fabricates anything beyond them.
//
// Plain Node assert, no dependencies.
// Run: node test/description-enrichment.test.js
"use strict";
const assert = require("assert");

const REPO_DIR = process.env.REPO_DIR || process.cwd();

function freshLib() {
  delete require.cache[require.resolve(`${REPO_DIR}/api/_lib/description-enrichment.js`)];
  return require(`${REPO_DIR}/api/_lib/description-enrichment.js`);
}

async function run() {
  const { formatFactualDate, resolveFactualVenueName, isDescriptionBlank, buildFactualDescription } = freshLib();

  // --- 1. The Product Owner's exact "safe" example ---
  {
    const event = { title: "Big Time Bingo", venue_name_raw: "Garden Bowl", start_date: "2026-09-28", time_display: "7:30 PM" };
    const desc = buildFactualDescription(event);
    assert.strictEqual(desc, "Big Time Bingo takes place at Garden Bowl on September 28 at 7:30 PM.");
  }
  console.log("PASS: matches the Product Owner's exact safe example verbatim");

  // --- 2. Never invents anything beyond the given fields — no genre, no
  //     promotional language, no adjectives of any kind. ---
  {
    const event = { title: "Big Time Bingo", venue_name_raw: "Garden Bowl", start_date: "2026-09-28", time_display: "7:30 PM" };
    const desc = buildFactualDescription(event);
    for (const forbidden of ["wildest", "legendary", "returns", "!", "amazing", "don't miss"]) {
      assert.ok(!desc.toLowerCase().includes(forbidden.toLowerCase()), `must not contain invented promotional language: "${forbidden}"`);
    }
  }
  console.log("PASS: contains no invented promotional/subjective language");

  // --- 3. A resolved canonical venue name (event.venues.name) takes
  //     precedence over the raw text, same precedence as this project's own
  //     resolvePublicVenueDisplay(). ---
  {
    const event = { title: "Show", venue_name_raw: "outer limits", venues: { name: "Outer Limits Lounge" }, start_date: "2026-10-01", time_display: null };
    const desc = buildFactualDescription(event);
    assert.ok(desc.includes("at Outer Limits Lounge"), "must prefer the canonical venue name over raw text");
    assert.ok(!desc.includes("outer limits"), "must not also print the raw (differently-cased) venue text");
  }
  console.log("PASS: prefers the canonical linked venue name over raw venue_name_raw");

  // --- 4. Graceful degradation: no venue known, no time known — still a
  //     safe, factual sentence using only title + date. ---
  {
    const event = { title: "Elmwood Alight", venue_name_raw: null, venues: null, start_date: "2026-10-01", time_display: null };
    const desc = buildFactualDescription(event);
    assert.strictEqual(desc, "Elmwood Alight takes place on October 1.");
  }
  console.log("PASS: degrades gracefully to title + date when venue/time are unknown");

  // --- 5. A "Venue TBA" placeholder is never printed as if it were a real
  //     venue name (same exact-match rule as admin.html's isVenueTbaByDesign). ---
  {
    const event = { title: "Secret Show", venue_name_raw: "Venue TBA", start_date: "2026-10-05", time_display: "10:00 PM" };
    const desc = buildFactualDescription(event);
    assert.ok(!desc.toLowerCase().includes("venue tba"), "must never print a TBA placeholder as a venue name");
    assert.strictEqual(desc, "Secret Show takes place on October 5 at 10:00 PM.");
  }
  console.log("PASS: a 'Venue TBA' placeholder is treated as no venue, never printed as a real name");

  // --- 6. is_all_day=true events never print a time_display, even if one
  //     is somehow present on the row (mirrors getMissingFields' own rule
  //     that is_all_day exempts start-time checking). ---
  {
    const event = { title: "All-Day Festival", venue_name_raw: "Downtown", start_date: "2026-10-10", time_display: "Gates 9 AM", is_all_day: true };
    const desc = buildFactualDescription(event);
    assert.ok(!desc.includes("Gates 9 AM"), "an all-day event must not have a time printed");
  }
  console.log("PASS: is_all_day events never have a time printed");

  // --- 7. Verified is_free / price_from are safe to state (real structured
  //     columns, never invented) — but never both, and never fabricated
  //     pricing when neither is set. ---
  {
    const free = buildFactualDescription({ title: "Free Show", start_date: "2026-10-01", is_free: true });
    assert.ok(free.includes("Free admission."), "is_free=true is a verified fact, safe to state");

    const priced = buildFactualDescription({ title: "Paid Show", start_date: "2026-10-01", price_from: 25 });
    assert.ok(priced.includes("Tickets from $25."), "a verified price_from is safe to state");

    const neither = buildFactualDescription({ title: "Unknown Price Show", start_date: "2026-10-01" });
    assert.ok(!neither.includes("Free") && !neither.includes("Tickets"), "must not fabricate pricing information that isn't on the row");
  }
  console.log("PASS: is_free/price_from are stated only when actually verified, never fabricated");

  // --- 8. Never overwrites — the caller's job, but isDescriptionBlank()
  //     itself must correctly gate on "genuinely blank," matching
  //     getMissingFields()'s own admin.html definition. ---
  {
    assert.strictEqual(isDescriptionBlank({ description: null }), true);
    assert.strictEqual(isDescriptionBlank({ description: "" }), true);
    assert.strictEqual(isDescriptionBlank({ description: "   " }), true);
    assert.strictEqual(isDescriptionBlank({ description: "A real description." }), false);
  }
  console.log("PASS: isDescriptionBlank matches admin.html's own blank definition");

  // --- 9. formatFactualDate: exact transform, no timezone drift (pure
  //     string parsing, never a Date object that could shift a day). ---
  {
    assert.strictEqual(formatFactualDate("2026-01-01"), "January 1");
    assert.strictEqual(formatFactualDate("2026-12-31"), "December 31");
    assert.strictEqual(formatFactualDate(null), null);
    assert.strictEqual(formatFactualDate("not-a-date"), null);
  }
  console.log("PASS: formatFactualDate transforms ISO dates correctly and never guesses at malformed input");

  // --- 10. resolveFactualVenueName: direct spot-check of the precedence
  //     and TBA rules exercised indirectly above. ---
  {
    assert.strictEqual(resolveFactualVenueName({ venues: { name: "Canonical Name" }, venue_name_raw: "raw" }), "Canonical Name");
    assert.strictEqual(resolveFactualVenueName({ venues: null, venue_name_raw: "Raw Venue" }), "Raw Venue");
    assert.strictEqual(resolveFactualVenueName({ venue_name_raw: "venue tba" }), null);
    assert.strictEqual(resolveFactualVenueName({ venue_name_raw: null }), null);
  }
  console.log("PASS: resolveFactualVenueName precedence and TBA exclusion are both correct");

  // --- 11. No title at all (defensive — schema guarantees this never
  //     happens in production) returns null, never an empty/fabricated
  //     sentence. ---
  {
    assert.strictEqual(buildFactualDescription({ title: "", start_date: "2026-10-01" }), null);
    assert.strictEqual(buildFactualDescription(null), null);
  }
  console.log("PASS: a missing title returns null rather than an empty or fabricated sentence");

  console.log("\nAll description-enrichment.js tests passed.");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
