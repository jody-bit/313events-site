// test/cron-trinosophes-parse.test.js — api/cron-trinosophes.js
//
// PRODUCTION BUG (2026-09-25): a human reported seeing 7 garbled "events"
// on the live site, all sourced from Trinosophes, all missing a
// ticket/event link, with titles like "at Detroit Public Lirbary" and
// "(Doug McCombs, Steve Shelley, Bruce Lamont, Eric Block)" — fragments of
// real listings, not real event titles. Traced to parseTrinosophesEvents():
// Trinosophes' page is flat, unstructured text (no per-listing wrapper —
// see that file's own BEST-EFFORT header comment), and a single complex
// listing spanning several <br>-separated lines was being split into one
// bogus "event" per line instead of being recognized as one listing.
//
// This fixture is a trimmed but VERBATIM excerpt of Trinosophes' real live
// events page (https://trinosophes.com/Events), captured 2026-09-25 while
// tracing this report — including the real typo ("Lirbary") and the exact
// three listings (October 8 / October 11 / October 25) that together
// produced all 7 of the reported bad rows.
//
// Plain Node assert, no dependencies.
// Run: node test/cron-trinosophes-parse.test.js
"use strict";
const assert = require("assert");
const { parseTrinosophesEvents } = require("../api/cron-trinosophes.js");

// Verbatim (trimmed) excerpt of the real page's raw HTML, September 21
// through October 25, 2026 — captured live 2026-09-25.
const REAL_PAGE_HTML = `
September 21<br>Glenn Jones<br>
Nick Schillace<br><br>

September 22<br>
Tuesdays at Trinosophes presents<br>
Zekkereya el-Magharbel<br>
Kweky Sumbry<br><br>

September 28<br>
Spiral Galaxy<br>
Viands<br>
Matthew Smith (solo instrumental)<br>
<br>

October 1<br>
BASIC<br><br>

October 3<br>
Ellie Falaris Ganelin with &nbsp;Michael Malis and Joel Peterson<br><br>

October 8<br>
Trinosophes and Media City Fil Festival present<br>
world premiere of <i>Gises</i> by Kevin Jerome Everson <br>at Detroit Public Lirbary<br><br>

October 11<br>
Closed for a private event in the evening<br><br>

October 25<br>
Sick Gazelle <br>
(Doug McCombs, Steve Shelley, Bruce Lamont, Eric Block)<br>Cyrus Pireh
<br>
<br><hr>
<br><b>2026<br></b><br>August 28<br>ReGeneration<br><br>
`;

function eventsOn(events, date) {
  return events.filter((e) => e.date === date).map((e) => e.title);
}

function run() {
  const events = parseTrinosophesEvents(REAL_PAGE_HTML);

  // --- 1. A normal two-act date (no special line shapes) is completely
  //     unaffected -- both acts are still their own real event. ---
  assert.deepStrictEqual(
    eventsOn(events, "2026-09-21"),
    ["Glenn Jones", "Nick Schillace"],
    "an ordinary multi-act date must be untouched by the new merge/prefix rules"
  );
  console.log("PASS: an ordinary two-act date is unaffected");

  // --- 2. Root cause #1: a presenter-credit/series-heading line
  //     ("Tuesdays at Trinosophes presents") must never become its own
  //     event -- it's held and prefixed onto the NEXT real line only, and
  //     any further act on the same date stays separate. ---
  assert.deepStrictEqual(
    eventsOn(events, "2026-09-22"),
    ["Tuesdays at Trinosophes presents Zekkereya el-Magharbel", "Kweky Sumbry"],
    "a presenter-credit line must prefix the next real act, never stand alone, and must not swallow a second act on the same date"
  );
  console.log("PASS: [PRODUCTION REGRESSION] a presenter-credit line prefixes the next act instead of becoming its own bogus event");

  // --- 3. A normal three-act date with no special shapes is unaffected. ---
  assert.deepStrictEqual(
    eventsOn(events, "2026-09-28"),
    ["Spiral Galaxy", "Viands", "Matthew Smith (solo instrumental)"],
    "an ordinary three-act date must be untouched -- note a same-line parenthetical (not its own line) is not affected by PARENTHETICAL_ONLY_RE"
  );
  console.log("PASS: an ordinary three-act date is unaffected, including a same-line (not standalone) parenthetical");

  assert.deepStrictEqual(eventsOn(events, "2026-10-01"), ["BASIC"]);
  assert.deepStrictEqual(
    eventsOn(events, "2026-10-03"),
    ["Ellie Falaris Ganelin with Michael Malis and Joel Peterson"],
    "a single-line act description naming sidemen inline via \"with\" is unaffected"
  );
  console.log("PASS: single-act dates are unaffected");

  // --- 4. Root cause #1+#2 together: the real "October 8" listing. A
  //     presenter-credit line, a real film title, and a trailing location
  //     clarifier ("at Detroit Public Lirbary" -- the real page's own typo,
  //     preserved verbatim, never corrected) must all resolve to ONE event,
  //     not three. This is the exact real listing that produced 3 of the 7
  //     reported bad rows. ---
  assert.deepStrictEqual(
    eventsOn(events, "2026-10-08"),
    ["Trinosophes and Media City Fil Festival present world premiere of Gises by Kevin Jerome Everson at Detroit Public Lirbary"],
    "a presenter-credit line + film title + trailing location clarifier must resolve to ONE event"
  );
  console.log("PASS: [PRODUCTION REGRESSION] the real October 8 listing (presenter credit + title + location clarifier) resolves to ONE event, not three");

  // --- 5. Root cause #3: a venue closure notice ("Closed for a private
  //     event in the evening") is never a public event -- the real
  //     "October 11" listing that produced 1 of the 7 reported bad rows. ---
  assert.deepStrictEqual(
    eventsOn(events, "2026-10-11"),
    [],
    "a venue closure notice must never become an event"
  );
  console.log("PASS: [PRODUCTION REGRESSION] a venue closure notice produces zero events");

  // --- 6. Root cause #2: a personnel/credit parenthetical on its own line
  //     ("(Doug McCombs, Steve Shelley, Bruce Lamont, Eric Block)") belongs
  //     to the PRECEDING act, and a genuinely separate second act on the
  //     same date ("Cyrus Pireh") still gets its own event -- the real
  //     "October 25" listing that produced the remaining 3 of the 7
  //     reported bad rows. ---
  assert.deepStrictEqual(
    eventsOn(events, "2026-10-25"),
    ["Sick Gazelle (Doug McCombs, Steve Shelley, Bruce Lamont, Eric Block)", "Cyrus Pireh"],
    "a standalone parenthetical credit must merge into the preceding act, while a genuinely separate second act stays its own event"
  );
  console.log("PASS: [PRODUCTION REGRESSION] the real October 25 listing (act + personnel parenthetical + second act) resolves to TWO events, not three");

  // --- 7. A year heading and a fresh date heading both reset any held
  //     presenter-prefix -- a prefix must never leak across dates/years. ---
  assert.deepStrictEqual(eventsOn(events, "2026-08-28"), ["ReGeneration"]);
  console.log("PASS: a held presenter-prefix never leaks across a date or year boundary");

  console.log("\nAll cron-trinosophes.js parser tests passed.\n");
}

run();
