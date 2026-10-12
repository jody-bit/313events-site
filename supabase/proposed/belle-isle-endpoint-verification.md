# Belle Isle endpoint verification (read-only)

The connector stays as is until this shows a correction is warranted.

1. From a normal browser or network (not a cloud sandbox), run `node scripts/belle-isle-verify.js`.
   It makes two GET requests (default, and with a start_date) and writes nothing.
   No browser access to a terminal? Open the URL in `BASE` (`?per_page=50`), save the body as
   `page1.json`, and run `node scripts/belle-isle-verify.js --file page1.json --status 200`.
2. Read the verdict per request: VALID_WITH_EVENTS, VALID_EMPTY, BLOCKED (401/403/429 or an HTML
   page), INVALID_STRUCTURE (200 without a Tribe `events` array), NOT_FOUND (endpoint moved).
3. Read the limits: returned vs total, `total_pages` (the connector reads page 1 only), the earliest
   and latest dates (window).
4. Compare by eye with https://belleislenaturecenter.org/program-calendar/ : a VALID_EMPTY is only
   correct if the page lists no upcoming programs.
5. Share the JSON verdict. A connector change needs the evidence above and fresh approval.
