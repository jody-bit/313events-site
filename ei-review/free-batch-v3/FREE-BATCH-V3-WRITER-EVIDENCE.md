# FREE-BATCH-V3 writer evidence (read from main 6e62723, source code only; no run, no log query, no SQL)

Question: which scheduled writers could set is_free on the 36 rows, and would a V3 write revert?

Finding: none of the nine sources writes is_free. Every one is either api/cron-feeds.js (grep -i free finds only an unrelated comment; is_free appears nowhere in it or in api/_lib/event-upsert.js) or api/cron-visitdetroit.js (explicitly omits is_free, line 355). With the key omitted an existing row keeps its value (event-upsert semantics), so a V3 true value is not rewritten by these connectors. Not Localist: none of the 36 uses cron-localist.

Other code that touches is_free: scripts/duplicate-consolidation.js can only raise a survivor to true from a duplicate (never to false; the nightly merge job is paused); description-enrichment, generic-metadata-enrichment, control-tower, cron-post-to-facebook only read it; ra-sync, submit.js and admin-editorial write it for their own rows (none of the 36 is RA, submit or editorial). Manual edits via admin are owner actions.

Evidence limits: the livestate of the feed_sources table was not read (EI has no production SELECT). Which feed_sources row feeds each source is inferred from the source names and FEED_SUBMISSIONS.md (explicit only for The Congregation); no dedicated connector exists in api/ for the others. Real run behaviour after V3 is unobserved; recommend one read-only recheck after the next feeds run (22Z) and the 06Z VisitDetroit run.

Wording reconciliation: the committed FREE-BATCH-V3.md (hash 5e1aeda3…) says feed connectors were not re-audited and values may revert. That sentence stays accurate for what was known when it was written; THIS file supersedes it with the code evidence above. The brief is not edited so its hash stays pinned.

| Source | Rows | Writer | is_free written by it? | Effect on a V3 true value |
|---|---|---|---|---|
| Downtown Windsor BIA | 17 | feed_sources via api/cron-feeds.js (ICS/RSS) | none: cron-feeds.js has no is_free key; event-upsert has none | Omitted key = stored value stands (event-upsert.js semantics) |
| Canton Township Communit | 1 | feed_sources via api/cron-feeds.js | none (same) | stands |
| The Congregation | 4 | feed_sources via api/cron-feeds.js (FEED_SUBMISSIONS.md 2026-09-29) | none (same) | stands |
| VisitDetroit | 2 | api/cron-visitdetroit.js (06Z) | none: line 355 'is_free is not sent... a stored value (e.g. a reviewer-set FREE) stands' | stands |
| Tourism Windsor Essex Pe | 1 | feed_sources via api/cron-feeds.js | none (same) | stands |
| City of Livonia - Parks | 7 | feed_sources via api/cron-feeds.js | none (same) | stands |
| City of Madison Heights | 1 | feed_sources via api/cron-feeds.js | none (same) | stands |
| City of Royal Oak | 2 | feed_sources via api/cron-feeds.js | none (same) | stands |
| City of Livonia - Senior | 1 | feed_sources via api/cron-feeds.js | none (same) | stands |

Row ids by source:
- Downtown Windsor BIA: 09c66613-6dce-4b36-a40f-879e395bd05d, 4c4cb963-0b6f-4a6b-9981-00bae84b610d, 759f8e54-92fc-4cb3-83eb-d935717e15c7, a8259cbc-2dad-4812-a2b5-b05270acd695, 814f6985-f6d8-40c0-8eb8-3ee5076d7a7d, 36064bbd-8ac9-4a16-acba-c57a664c8d2a, 69688497-b36a-424b-a713-aa7046f50f83, 8859c93b-531d-4683-93ed-2c5409f25797, c0e1cc07-ba4c-441a-88d9-9c4bdc454bbc, 4bcd4af5-9901-403c-92ee-3675012978af, 68fa6e5f-3695-46be-84a5-2c519ed6a61f, d41c03a1-9a86-4f11-a138-44191a55a5bc, 83c92321-d42e-478a-9b8d-844ca7d709e2, a587229a-e5f7-4ce3-9cff-be1fb3eab718, 7cd691d5-45b5-4cef-aaf7-100939b1972e, d1992cbf-48b0-4ccd-97aa-5037aff4a731, f24370b1-2c67-459b-a930-401f78a8ca6a
- Canton Township Communit: 1f5d6e64-63ea-43ca-a6e8-c7b9a4fe8d09
- The Congregation: bbef84eb-9c66-490b-91c8-fcdb75f5b8ff, 7f2a60dc-6f74-4fab-aa6f-fb439f029b82, 871b8457-8c06-4704-b12d-ed9476e3b51f, 092e7a39-5ca8-4849-8fc3-6b3d1b9b11d8
- VisitDetroit: 2d5f74f8-cf80-4970-895a-4d9a3e0a40ce, 062e4d6b-1b7a-45d9-8ab9-511a98ed411c
- Tourism Windsor Essex Pe: 8899672e-086d-4ba5-97c2-fbc049d750c7
- City of Livonia - Parks: 09c5ac18-4df8-40b0-ae94-f83eb725c419, 21e5afd4-324f-450a-ad3a-35b26a0c59d7, b7f2ed57-9c90-4bc6-a0cf-591131015087, 2a19b3da-dd17-4c0d-b7f6-5458a41ed365, 8ef9e221-c32a-4a8f-b9b5-52234cec3763, 5f79aa3f-e050-4b08-9941-b3678a43c866, 15ece4af-a71d-4f43-b129-db115f8e2f61
- City of Madison Heights: 398011cc-78b2-416e-ab8d-514d0ea57928
- City of Royal Oak: 86131dab-2467-4a24-bdc9-b9cfc234f783, 524b3a60-9971-4a2c-bc40-592b3a28ba9c
- City of Livonia - Senior: ea179197-6a5c-4756-afd7-d18cb6f9004b
