-- DQ-004 classification backfill (PRODUCTION, NOT AUTHORIZED TO RUN).
-- Source of truth: EI's audit event-intelligence/data-quality/dq-004-association-audit.sql (176 links + 5 orphan articles), keyed on the
-- 8-character id prefixes EI used (verified unique across all links). Owner decision 2026-10-16 03:07Z (Option A):
--   Verified -> verified; Candidate -> candidate; Needs Follow Up -> needs_follow_up;
--   Rejected -> rejected ONLY for the article-body-verified Harvest Festival link (f82a820d); the other headline-only
--   "Rejected" calls are recorded as needs_follow_up (hidden, preserved, never auto-public, eligible for evidence-based reassessment).
-- Nothing is deleted. Defaults for links EI did not individually list: match_type manual -> verified (EI headline check),
-- otherwise candidate. Every classified row gets verified_by 'audit_2026_10_16' and a one-entry verification_history.
-- Requires the columns migration (20261016000000) first; the public-read policy swap (20261016000001) runs AFTER this.
-- Expected after the run (production): 181 rows = 88 verified, 15 candidate, 77 needs_follow_up, 1 rejected (after EI/R&Q body spot-check, 2026-10-16 03:30Z).
begin;
create table if not exists public.editorial_article_events_backup_dq004_20261016 as select * from public.editorial_article_events;
alter table public.editorial_article_events_backup_dq004_20261016 enable row level security;

-- 1. the 3 orphan articles that EI verified and the 2 headline-only mismatches get join rows (matched_event_id already points at the event).
with orph(aid, st, basis) as (values
  ('693e4a13','verified','EI 2026-10-16 headline review (article body not read): Headline names Dossin Great Lakes Museum, Lost Mariners Day and the Nov 8 brunch; event is Lost Mariners Brunch at Dossin, 2026-11-08'),
  ('1937ef94','verified','EI 2026-10-16 headline review (article body not read): Headline names Hallelujah for Heat, Fellowship Chapel, Oct 24; event is Hallelujah for Heat 2026 at Fellowship Chapel, 2026-10-24'),
  ('a92942d1','verified','EI 2026-10-16 headline review (article body not read): Headline names Detroit Opera Tosca opening Nov 1; event is Tosca at Detroit Opera House, 2026-11-01'),
  ('16025ce2','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is an Ann Arbor shop profile (Dragonfly Earth Essentials); event is Rochester Posed (Rochester, Oct 1)'),
  ('20e52e7f','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is an Ann Arbor market profile (Le Petit Boulevard Market); event is Rochester Posed (Rochester, Oct 1)')
)
insert into public.editorial_article_events (article_id, event_id, verification_status)
select a.id, a.matched_event_id, 'candidate'
from public.editorial_articles a join orph o on o.aid = left(a.id::text, 8)
where a.matched_event_id is not null
on conflict (article_id, event_id) do nothing;

-- 2. classify every pair.
with art(aid, st, basis) as (values
  ('f412c8b8','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Elmwood Cemetery lights (Elmwood Alight); event is a Dossin guided tour'),
  ('a7be505f','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is a news report on a historian''s death; event LEGACY at Music Hall'),
  ('5379a9d1','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about SNAP/Dana Nessel policy; event is the Michigander concert (title substring only)'),
  ('cd43d343','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about SNAP/Dana Nessel policy; event is the Michigander concert (title substring only)'),
  ('1d85d6e0','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Wayne State digital-skills program; event is Thanksgiving at a senior center'),
  ('82ddf38f','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Farmington / St. Clair Shores market; event is Royal Oak Farmers Market'),
  ('ad7eb674','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Farmington / St. Clair Shores market; event is Royal Oak Farmers Market'),
  ('f82a820d','rejected','EI 2026-10-16: article body read: Article covers the City of Madison Heights Harvest Festival at Rosie''s Park (Oct 10); event is Upland Hills Farm, Oxford (verified by reading the article, DQ-004)'),
  ('172f2c27','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Articles are about War Memorial reconstruction / a storm; event "Flooding" is a concert at The Crofoot'),
  ('fe792148','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Articles are about War Memorial reconstruction / a storm; event "Flooding" is a concert at The Crofoot'),
  ('5df65c34','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Junior League''s Kitchens for a Cause; event "Texture"'),
  ('f70d7ddb','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article concerns a playground / an album release; event "Brand New" is a band concert at the Fox'),
  ('eedbe77b','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article concerns a playground / an album release; event "Brand New" is a band concert at the Fox'),
  ('10179f51','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article concerns a playground / an album release; event "Brand New" is a band concert at the Fox'),
  ('b536e692','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is a 2018 Mo Pop lineup; event is a 2026 concert'),
  ('3961824d','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about DSO instrument donations; event is a Frankie Moreno concert'),
  ('89fa2239','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about the Dirty Dancing musical; event is a men''s fashion show'),
  ('6e2aaa14','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Gratiot Avenue / MDOT; events are adaptive recreation programs'),
  ('5a647a43','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about a library incident / authors / millage; event is Chalk the Walk'),
  ('0403ab18','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about a library incident / authors / millage; event is Chalk the Walk'),
  ('42417fb0','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about a library incident / authors / millage; event is Chalk the Walk'),
  ('4682ee3c','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about school-district park operations; event is Nature Jewelry Making'),
  ('643b9882','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about a robot sculpture; event is a murder-mystery tour'),
  ('e57b909d','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Detroit school board candidates; event is a music show at Small''s'),
  ('3ce2167a','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Detroit school board candidates; event is a music show at Small''s'),
  ('beb7e307','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is the DSO Opening Night Gala; event is the Eloise haunted attraction'),
  ('773494dd','needs_follow_up','EI 2026-10-16 headline review (article body not read): Article is about the Masonic Temple''s centennial (venue topic), not clearly a different event; check body for the Isakov show'),
  ('adff53ae','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article ("Who will save the bees?") is unrelated to the Saturday Market'),
  ('70be9f2d','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Ferndale Pride; event is a book/album launch at Affirmations'),
  ('57aa4862','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about a different Playground Detroit show (Season Fair / Synthetic Nostalgia)'),
  ('392115d7','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about a different Playground Detroit show (Season Fair / Synthetic Nostalgia)'),
  ('df93d8de','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Jim Gaffigan in Novi; event is The Chicks at the Fox'),
  ('e30b8b0c','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is the Troy Family Daze Parade; events are Troy community center programs (already admin_dismissed)'),
  ('30b7a8a8','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Clawson tree removal; event is a city buildings closure'),
  ('3515a8a0','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about a Gilmore Girls festival in Brighton'),
  ('9fee7b9f','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Comerica Park''s new name, not these games or the film festival'),
  ('bcc012c7','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about a Concert of Colors performer, not "MAD presents: The Big One"'),
  ('c15bdd2c','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Fash Bash / a DIA exhibition, not Dance City Festival'),
  ('1420c105','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Fash Bash / a DIA exhibition, not Dance City Festival'),
  ('e80ce46d','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is a Lions-history list, not the Saints game'),
  ('faa1b39f','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Ford House Harvest Day (Sept 26), not the Sept 18 summer concert'),
  ('da132fae','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Recipe columns, unrelated to the Eastern Market events'),
  ('ed8ab6f1','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Recipe columns, unrelated to the Eastern Market events'),
  ('f270dcf8','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about the Eastern Market book festival, not First Wednesdays / After Dark'),
  ('921cf6bb','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about a street naming; event is Black Leaders Detroit'),
  ('5536799d','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is the Detroit Hot Sauce Festival, not the two Masonic shows'),
  ('94dee228','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('475998ff','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('377c83ad','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('0331e1c6','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('3ff07e01','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('d181e074','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('652aaa7b','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('2d527167','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('945d7820','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('1f1d34be','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('be1e8fbd','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('71681f50','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('a19abfe1','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('3fe703e3','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('f5acd89c','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('33f60b02','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('4d56c2f6','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('e48db44f','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('ad5fed6a','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('e1b9a58d','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('68c5cb70','verified','EI 2026-10-16 headline review (article body not read): Headline names the specific event (or its distinctive series) and its date/place align'),
  ('a8199fb9','verified','EI 2026-10-16 headline review (article body not read): Headline names the event/place and dates align'),
  ('4a099f45','verified','EI 2026-10-16 headline review (article body not read): Headline names the event/place and dates align'),
  ('ffb6ff00','verified','EI 2026-10-16 headline review (article body not read): Headline names the event/place and dates align'),
  ('a72c1b7d','verified','EI 2026-10-16 headline review (article body not read): Headline names the event/place and dates align'),
  ('7d319a59','candidate','EI 2026-10-16 headline review (article body not read): Headline concerns the performer/topic or is a roundup; article body not read; event link plausible but unproven'),
  ('a7b38b0e','candidate','EI 2026-10-16 headline review (article body not read): Headline concerns the performer/topic or is a roundup; article body not read; event link plausible but unproven'),
  ('e0f3ec4f','candidate','EI 2026-10-16 headline review (article body not read): Headline concerns the performer/topic or is a roundup; article body not read; event link plausible but unproven'),
  ('e3fafcdc','candidate','EI 2026-10-16 headline review (article body not read): Headline concerns the performer/topic or is a roundup; article body not read; event link plausible but unproven'),
  ('96b4ba60','candidate','EI 2026-10-16 headline review (article body not read): Headline concerns the performer/topic or is a roundup; article body not read; event link plausible but unproven'),
  ('ff28a1d4','candidate','EI 2026-10-16 headline review (article body not read): Headline concerns the performer/topic or is a roundup; article body not read; event link plausible but unproven'),
  ('765ef6ca','candidate','EI 2026-10-16 headline review (article body not read): Headline concerns the performer/topic or is a roundup; article body not read; event link plausible but unproven'),
  ('7f43f0e5','candidate','EI 2026-10-16 headline review (article body not read): Headline concerns the performer/topic or is a roundup; article body not read; event link plausible but unproven'),
  ('a66ec58b','candidate','EI 2026-10-16 headline review (article body not read): Headline concerns the performer/topic or is a roundup; article body not read; event link plausible but unproven'),
  ('f839d668','candidate','EI 2026-10-16 headline review (article body not read): Headline concerns the performer/topic or is a roundup; article body not read; event link plausible but unproven'),
  ('231f9751','needs_follow_up','EI 2026-10-16 headline review (article body not read): Related subject or venue but not clearly the same event; check article body'),
  ('e81ca4b9','needs_follow_up','EI 2026-10-16 headline review (article body not read): Related subject or venue but not clearly the same event; check article body'),
  ('410c2125','needs_follow_up','EI 2026-10-16 headline review (article body not read): Related subject or venue but not clearly the same event; check article body'),
  ('d21383f6','needs_follow_up','EI 2026-10-16 headline review (article body not read): Related subject or venue but not clearly the same event; check article body'),
  ('b72004e2','needs_follow_up','EI 2026-10-16 headline review (article body not read): Related subject or venue but not clearly the same event; check article body'),
  ('38101fdb','needs_follow_up','EI 2026-10-16 headline review (article body not read): Related subject or venue but not clearly the same event; check article body'),
  ('dc2323af','needs_follow_up','EI 2026-10-16 headline review (article body not read): Related subject or venue but not clearly the same event; check article body')
), pair(aid, eid, st, basis) as (values
  ('33f60b02','e46d1571','candidate','EI/R&Q 2026-10-16 spot-check: publisher returned a 403 bot check, article body could not be read (EI browser and R&Q Mac); stays hidden until the body is read'),
  ('33f60b02','4bf662f9','candidate','EI/R&Q 2026-10-16 spot-check: publisher returned a 403 bot check, article body could not be read (EI browser and R&Q Mac); stays hidden until the body is read'),
  ('33f60b02','505d10a7','candidate','EI/R&Q 2026-10-16 spot-check: publisher returned a 403 bot check, article body could not be read (EI browser and R&Q Mac); stays hidden until the body is read'),
  ('128b5fcd','5dbb97a8','candidate','EI/R&Q 2026-10-16 spot-check: publisher returned a 403 bot check, article body could not be read (EI browser and R&Q Mac); stays hidden until the body is read'),
  ('fce58ea5','517856ff','needs_follow_up','EI 2026-10-16 article body read: names Dally in the Alley but not an official after-party at Marble Bar; needs evidence'),
  ('6a2458a4','87808e63','needs_follow_up','R&Q 2026-10-16 article body read: article puts Sweet Endings on Oct 3-4, event is dated Oct 2; needs evidence'),
  ('4ddf1399','7d9368ad','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article about Ferndale art; event is Rochester Posed'),
  ('c1fdef72','e1e9358a','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about Youmacon; event is Furfluencer Extravaganza'),
  ('c1fdef72','2cb556e2','verified','EI 2026-10-16 headline review (article body not read): Headline names Youmacon'),
  ('4ddf1399','69f36b20','verified','EI 2026-10-16 headline review (article body not read): Headline concerns Ferndale downtown art fair; dates align'),
  ('e1e8e727','312d5ff2','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is about The Coney; event is Detroit Story Fest'),
  ('e1e8e727','c99efcd1','verified','EI 2026-10-16 headline review (article body not read): Headline names The Coney'),
  ('65426058','a988b000','verified','EI 2026-10-16 headline review (article body not read): Headline names Detroit Black Film Festival'),
  ('65426058','9e1be88c','candidate','EI 2026-10-16 headline review (article body not read): Roundup; not shown to include Chalk the Walk'),
  ('14b12c7d','023ba8a6','verified','EI 2026-10-16 headline review (article body not read): Headline names "Eastern Market stays up late" (After Dark)'),
  ('14b12c7d','1d0c0223','needs_follow_up','EI 2026-10-16 headline review (article body not read): Shed 5 SkillsLab not named in headline; absence from headline is not proof of a different event; check body'),
  ('8766f51f','0a4aa62d','verified','EI 2026-10-16 headline review (article body not read): Headline names Danny Elfman; event is Danny Elfman, pub 1 day before'),
  ('8766f51f','ad2c9491','needs_follow_up','EI 2026-10-16 headline review (article body not read): Ray LaMontagne not in headline; may be a multi-show article; check body'),
  ('8766f51f','5d61ad41','needs_follow_up','EI 2026-10-16 headline review (article body not read): Jim Gaffigan not in headline; may be a multi-show article; check body'),
  ('d2c56f4b','6072c273','needs_follow_up','EI 2026-10-16 headline review (article body not read): Article exhibition is at Posterity Gallery; this event is at College for Creative Studies on Oct 2, venue conflict'),
  ('d2c56f4b','7afb51ae','verified','EI 2026-10-16 headline review (article body not read): Posterity Gallery exhibition named in headline')
), orph(aid, st, basis) as (values
  ('693e4a13','verified','EI 2026-10-16 headline review (article body not read): Headline names Dossin Great Lakes Museum, Lost Mariners Day and the Nov 8 brunch; event is Lost Mariners Brunch at Dossin, 2026-11-08'),
  ('1937ef94','verified','EI 2026-10-16 headline review (article body not read): Headline names Hallelujah for Heat, Fellowship Chapel, Oct 24; event is Hallelujah for Heat 2026 at Fellowship Chapel, 2026-10-24'),
  ('a92942d1','verified','EI 2026-10-16 headline review (article body not read): Headline names Detroit Opera Tosca opening Nov 1; event is Tosca at Detroit Opera House, 2026-11-01'),
  ('16025ce2','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is an Ann Arbor shop profile (Dragonfly Earth Essentials); event is Rochester Posed (Rochester, Oct 1)'),
  ('20e52e7f','needs_follow_up','EI 2026-10-16 headline-only mismatch (article body not read), needs evidence before it can be called final: Article is an Ann Arbor market profile (Le Petit Boulevard Market); event is Rochester Posed (Rochester, Oct 1)')
), cls as (
  select ae.article_id, ae.event_id,
         coalesce(p.st, o.st, oo.st, case when a.match_type = 'manual' then 'verified' else 'candidate' end) as st,
         coalesce(p.basis, o.basis, oo.basis,
                  case when a.match_type = 'manual' then 'EI 2026-10-16: admin-created (manual) link; headline names the event (creator not recorded)'
                       else 'EI 2026-10-16: algorithmic (' || coalesce(a.match_type::text, 'unknown') || ') match; not verified' end) as basis
  from public.editorial_article_events ae
  join public.editorial_articles a on a.id = ae.article_id
  left join pair p on p.aid = left(ae.article_id::text, 8) and p.eid = left(ae.event_id::text, 8)
  left join art o on o.aid = left(ae.article_id::text, 8) and p.aid is null
  left join orph oo on oo.aid = left(ae.article_id::text, 8) and p.aid is null and o.aid is null
)
update public.editorial_article_events ae
set verification_status = c.st,
    verified_by = 'audit_2026_10_16',
    verified_at = now(),
    verification_basis = c.basis,
    verification_history = jsonb_build_array(jsonb_build_object('at', now(), 'from', 'candidate', 'to', c.st, 'by', 'audit_2026_10_16', 'basis', c.basis))
from cls c
where ae.article_id = c.article_id and ae.event_id = c.event_id;

-- 3. assertions.
do $$
declare n_total int; n_ver int; n_cand int; n_nfu int; n_rej int; n_unaudited int; n_orphan_left int;
begin
  select count(*), count(*) filter (where verification_status='verified'), count(*) filter (where verification_status='candidate'),
         count(*) filter (where verification_status='needs_follow_up'), count(*) filter (where verification_status='rejected'),
         count(*) filter (where verified_by is distinct from 'audit_2026_10_16')
    into n_total, n_ver, n_cand, n_nfu, n_rej, n_unaudited
  from public.editorial_article_events;
  select count(*) into n_orphan_left from public.editorial_articles a
   where a.matched_event_id is not null and left(a.id::text,8) in ('693e4a13','1937ef94','a92942d1','16025ce2','20e52e7f')
     and not exists (select 1 from public.editorial_article_events ae where ae.article_id = a.id);
  if n_unaudited <> 0 then raise exception 'DQ-004 backfill: % rows were not classified', n_unaudited; end if;
  if n_orphan_left <> 0 then raise exception 'DQ-004 backfill: % orphan articles still have no join row', n_orphan_left; end if;
  if (select count(*) from public.editorial_article_events where verification_status='rejected' and left(article_id::text,8) <> 'f82a820d') <> 0 then
    raise exception 'DQ-004 backfill: only the Harvest Festival link may be rejected';
  end if;
  if n_total <> 181 or n_ver <> 88 or n_cand <> 15 or n_nfu <> 77 or n_rej <> 1 then
    raise exception 'DQ-004 backfill: unexpected counts total=% verified=% candidate=% needs_follow_up=% rejected=% (expected 181/88/15/77/1)', n_total, n_ver, n_cand, n_nfu, n_rej;
  end if;
end $$;
commit;

-- Rollback (restores the pre-backfill rows exactly; the 5 orphan join rows are removed):
--   begin;
--   delete from public.editorial_article_events ae where not exists (select 1 from public.editorial_article_events_backup_dq004_20261016 b where b.article_id = ae.article_id and b.event_id = ae.event_id);
--   update public.editorial_article_events ae set verification_status='candidate', verified_by=null, verified_at=null, verification_basis=null, verification_history='[]'::jsonb;
--   commit;
