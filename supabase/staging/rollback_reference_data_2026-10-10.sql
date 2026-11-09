-- ROLLBACK for the staging-only production-derived reference data (2026-10-10).
-- Run against the STAGING project (efxjdlogohcggpuftivm) ONLY. Never run on production.
-- Restores the pre-load state: staging had 0 editorial rows and exactly the 31 seed/test
-- events listed below (no event had a venue). Venues and neighborhoods are NOT touched
-- (they came from the SZ-15 sanitized venue reference and are shared with other fixtures).
begin;
delete from public.editorial_article_events;   -- staging had 0 rows before the load
delete from public.editorial_articles;         -- staging had 0 rows before the load
delete from public.events
 where id not in (
  'a9cc8b3e-253b-4226-b5a9-2cf7ef361421','22984d7a-51ca-426d-8ea4-6fa7a8a497e0','ae3e9c6b-c121-4987-94fc-8f9ce05cf8b2',
  '4c633e00-8733-42af-af75-5c0dc3f42574','0491c34a-4cc9-4dae-aaae-6b75ff4cd113','726d754e-eeab-4dd5-b33c-10671e7d17d4',
  'add0c2f8-45d2-477d-99a6-8a0d272191b7','8f1e51e6-06a7-4640-806c-9755a0c01cde','8c5bc63f-033d-4a1e-a7ae-a09a10dd93b8',
  'ba65c926-fcde-49d2-a9a4-e89851525de4','24bc920d-753c-487b-8f72-637f4635ff5e','81ed9a3b-1674-4ed1-951b-21d5aa1fb280',
  '8a7e1163-f21a-4f1e-8983-2db7167c3fd3','3e5c7b05-02ee-46ec-9164-a8cd1aadd1ce','51538302-6a9b-4655-8b69-b1d229b127d2',
  '88928f4e-5781-4e39-9985-2b3833604b8e','97c82949-d65a-49df-990e-dc1ce901cb23','487ebdad-5de0-4c5e-a323-4e94d20307aa',
  'fa72b4eb-50cb-4a9b-b631-abbfe373def5','c0888435-33f2-43a8-b683-ca1c7d8457df','62e068da-b24f-4f4a-b4ba-9130beaa8992',
  '2676b99a-722e-47a4-b134-a88fb4efb42d','58306fe3-6d08-441f-bc08-cf7d2d5719f7','4d9bf64c-47e5-443f-b1b0-146cd107f0e5',
  '620153fd-b446-4304-acba-78058319f426','51a21f7f-9b13-44db-ab18-85119a5452dd','b113a9c0-2b53-4bee-8056-972dfae34e3c',
  '25c2d1d3-295c-4d46-bab4-d97e715bbc19','d23bfb4b-8fc8-4153-9d77-3ac7bca7ec12','f3de47c9-a75e-48bd-b817-655d50e35c07',
  'cf903d2d-8898-42b0-b706-f8cf87e78656');
-- Expected afterwards: events = 31, editorial_articles = 0, editorial_article_events = 0.
commit;
