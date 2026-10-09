-- Taxonomy contract, database side. Read-only. Every row must read pass = true.
-- (test/category-contract.test.js proves the application side matches the
-- migrations; this proves a live database matches them.)
select 'event_category enum equals categories.slug set' as check,
       (select array_agg(enumlabel::text order by enumlabel) from pg_enum where enumtypid = 'event_category'::regtype)
     = (select array_agg(slug order by slug) from categories) as pass
union all
select 'gaming is in the enum', exists (select 1 from pg_enum where enumtypid = 'event_category'::regtype and enumlabel = 'gaming')
union all
select 'gaming reference row is Gaming & Esports, sort 15', exists (select 1 from categories where slug = 'gaming' and label = 'Gaming & Esports' and sort_order = 15)
union all
select 'categories has 15 rows', (select count(*) from categories) = 15;
