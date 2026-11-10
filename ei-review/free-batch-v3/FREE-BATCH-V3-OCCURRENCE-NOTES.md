# FREE-BATCH-V3 occurrence notes for the three flagged rows (2026-11-09)
No SQL, no batch change, no new research: this reuses the page text EI already read plus the connector code. FREE-BATCH-V3.sql/.rollback.sql/.md and the source-checks file keep their hashes.

| Row | Concern | Resolution | Evidence |
|---|---|---|---|
| 2d5f74f8-cf80-4970-895a-4d9a3e0a40ce (Detroit Historical Museum free evening, 2026-11-12) | Page shows "Nov 12, 5-8 PM" with no year | KEEP. Year is from the SOURCE's structured date, not the footer | api/cron-visitdetroit.js derives start_date from the Algolia hit's ISO startDate (detroitParts(h.startDate), lines ~236-275), which includes the year; the stored row is start_date 2026-11-12. Nov 12 2026 is a Thursday. The page text was only used for the admission wording ("FREE") |
| 062e4d6b-1b7a-45d9-8ab9-511a98ed411c (Pop Up Art Stop, 2026-11-14) | Page shows "Nov 14, 1-5 PM" with no year | KEEP. Same: stored start_date 2026-11-14 comes from the source hit's ISO startDate | Same connector path. Nov 14 2026 is a Saturday |
| 524b3a60-… (Royal Oak Market: Art Fair Edition, 2026-11-20) | Page range text conflicts | KEEP. The occurrence start is not in conflict | EID 8593 page header reads "Friday, November 20, 2026" and its ISO timestamp is 2026-11-20T11:00:00, matching the stored start_date 2026-11-20. Only the range wording differs ("November 20 - 21" field, "November 19-20" in the description); that is about the run's span, and sister row 86131dab covers 2026-11-19. Admission is "Free, indoor event" on both pages |

Limits: the VisitDetroit Algolia hit itself was not re-fetched (no new research); the year rests on the connector's parse of it plus the stored start_date. If Codex wants a stricter standard, the minimal alternative is to exclude 2d5f74f8 and 062e4d6b only; the batch would then be 34 rows with new hashes. 21e5afd4/ea179197 unchanged, no merge, no job resume.
