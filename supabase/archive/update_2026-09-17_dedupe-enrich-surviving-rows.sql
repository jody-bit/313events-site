-- Duplicate-events cleanup, enrichment follow-up, 2026-09-17.
--
-- Jody's question after batch1/batch2 ran: "when you dedupe are you also
-- combining the different posts about the same event to make sure the
-- single event left behind has the most comprehensive information?" --
-- honest answer was no, not yet. batch1/batch2 only picked a winner and
-- rejected the loser; nothing was merged. This file fixes that: for every
-- pair from those two batches, it fills in any gap on the SURVIVING row
-- (image_url, description, price_from, is_free, ticket_url) using
-- whatever the REJECTED row had, wherever the surviving row is missing it.
--
-- Nothing here overwrites data the surviving row already has -- every
-- field uses coalesce()/nullif() so a populated value on the keeper is
-- always left alone. The one judgment-call field is description: if the
-- rejected row's description is longer than the keeper's, the longer one
-- wins on the theory that more detail beats less -- worth a spot check
-- since "longer" isn't always "better written."
--
-- Rejected rows keep status='rejected' -- this is purely enrichment of the
-- live row, not a status change, and it's safe to re-run (every update is
-- idempotent: once a field is filled, coalesce()/nullif() makes it a
-- no-op on a second pass).
--
-- ---------------------------------------------------------------------
-- Part 1: the 3 RA-internal duplicates from batch1. The surviving row is
-- looked up by external_id since batch1 didn't record its row id directly
-- (it was an upsert target, not a hardcoded id).
update events k
set image_url = coalesce(nullif(k.image_url, ''), r.image_url),
    description = case when length(coalesce(r.description,'')) > length(coalesce(k.description,'')) then r.description else k.description end,
    price_from = coalesce(k.price_from, r.price_from),
    is_free = coalesce(k.is_free, r.is_free),
    ticket_url = coalesce(nullif(k.ticket_url, ''), r.ticket_url)
from events r
where k.external_id = 'ra-2495956' and r.id = '3113d4d0-2760-4736-a31a-399df383314d';

update events k
set image_url = coalesce(nullif(k.image_url, ''), r.image_url),
    description = case when length(coalesce(r.description,'')) > length(coalesce(k.description,'')) then r.description else k.description end,
    price_from = coalesce(k.price_from, r.price_from),
    is_free = coalesce(k.is_free, r.is_free),
    ticket_url = coalesce(nullif(k.ticket_url, ''), r.ticket_url)
from events r
where k.external_id = 'ra-2507381' and r.id = 'ed8e7a74-ba53-4ff2-b660-82274298c042';

update events k
set image_url = coalesce(nullif(k.image_url, ''), r.image_url),
    description = case when length(coalesce(r.description,'')) > length(coalesce(k.description,'')) then r.description else k.description end,
    price_from = coalesce(k.price_from, r.price_from),
    is_free = coalesce(k.is_free, r.is_free),
    ticket_url = coalesce(nullif(k.ticket_url, ''), r.ticket_url)
from events r
where k.external_id = 'ra-2502088' and r.id = 'b53f69dd-f59e-4d1d-930a-b43dc6091421';

-- ---------------------------------------------------------------------
-- Part 2: the 41 Ticketmaster-vs-VisitDetroit pairs from batch2. Keeper
-- and reject ids are both known directly, so this is one pass over a
-- VALUES list.
with pairs(keep_id, reject_id) as (
  values
    ('6dba9a8e-932a-467b-911b-d717ab0da528'::uuid, '20f53f2e-790f-4251-8dc5-61941b26d09d'::uuid),
    ('4bf0fade-215a-4ce0-bf4b-28cb3e1a3c25'::uuid, '20b0878e-3755-4764-b415-c0dd14b4d0e2'::uuid),
    ('606413b6-97fb-494b-a8cd-40fe27451eab'::uuid, 'ba2a580b-f543-4f62-8f4a-b4961d1c5bbf'::uuid),
    ('57571269-0c30-4b8a-8f87-8d81c0771e0f'::uuid, '1b1b3ad6-866a-403c-a8dd-2050a4d16b22'::uuid),
    ('8b7e11de-e24b-4ba2-b0bb-c55b9c62b5d0'::uuid, 'd82c271c-0530-4581-81fe-4ade7381f191'::uuid),
    ('9250d70f-28c9-4838-9e0d-ed522cc04ff9'::uuid, 'da72a0a9-10bc-4dab-8601-f8b0b766dd9e'::uuid),
    ('bb77b250-07cf-4600-9151-0ffa370f1b5e'::uuid, 'fad4df02-fb36-4184-8323-6c4b45e80583'::uuid),
    ('f13b89e2-ab75-498d-9266-1413259db0c0'::uuid, 'ebec9fd6-6eb9-4191-9689-9cf6ecf1e331'::uuid),
    ('7e40fcac-46e5-4667-90fb-b320c3df055b'::uuid, '155b3cb6-25cf-4a68-9549-b8eaa5f57b8a'::uuid),
    ('535276bb-7a6e-45ad-82e2-49e63cd44417'::uuid, 'a9c4a5bc-b762-4e6e-ab3a-6305cc1c96bf'::uuid),
    ('38ceecfc-f056-4850-be22-b3197bdd460b'::uuid, 'db305804-1f90-4359-a1db-5200973c599e'::uuid),
    ('2841edd6-dda2-4863-9d1e-d44ba0580ba0'::uuid, 'ca46bf3f-f543-4a11-aef4-d2edc2bafab9'::uuid),
    ('3f099190-ed54-44a8-982c-b139b479f6cd'::uuid, 'd262490e-976b-412c-8805-58780dc5ca28'::uuid),
    ('5b5d9567-aaf1-4ea0-b6fa-67f928158262'::uuid, '7293a35f-ad36-4f54-b209-15a774bb732a'::uuid),
    ('245112b3-6a7f-41c0-a76d-0dd9f68482ca'::uuid, '9b1a4bf4-9de1-4642-bc15-1838622c34df'::uuid),
    ('fe872c23-3060-4c81-ac8f-f79145b3819e'::uuid, '9cbf9f7c-1d7c-4369-a541-d2884b63a9ac'::uuid),
    ('7e12e5cd-7920-475f-b11b-e9371f7359ec'::uuid, 'c5bff85e-b5ef-4742-a24e-9291729ebc13'::uuid),
    ('fa26c788-96f4-48e1-9a72-1eeec282fa55'::uuid, 'a332061d-a406-470d-aa9d-876f23cf128f'::uuid),
    ('8913dd7b-eac7-4dc9-b464-5e385eb361f9'::uuid, 'bafebf46-9e36-4847-8d4e-72f552527964'::uuid),
    ('d934518d-1e6d-40f0-b6e5-49bbeeedf170'::uuid, 'c127a406-35a9-4b9f-920d-6e5fd71371c1'::uuid),
    ('e506f88c-f227-4ae7-b9c9-670a857571eb'::uuid, '9d902fe5-0467-43dc-803d-8abe411f493c'::uuid),
    ('655cfe89-3d9a-4efe-ab55-22b3f726e9a8'::uuid, 'd2d6d56c-e4bc-4e5b-bbdc-94a283db9e43'::uuid),
    ('b31bc7e6-ec1f-405c-96c8-414c05ca4967'::uuid, 'e50825c7-2dd2-47f6-be85-33acddb5e92e'::uuid),
    ('3e2a873f-e3f0-4be8-8a74-073d8e9e84fc'::uuid, 'ebbbed97-3dae-4d93-bb7c-d61a454f37bf'::uuid),
    ('ea1dbaa5-db9b-4e65-be55-d12f6f9f4e0e'::uuid, '34efee68-49f5-410f-b3a0-f0c529b45ada'::uuid),
    ('89901b03-4d9a-440a-a10d-201ed0629df2'::uuid, 'dc80079d-00d6-4153-81c1-f427e70440a0'::uuid),
    ('94099462-6f6b-4052-bc7c-4045bea87d13'::uuid, '099a6b2e-f612-4a99-80b4-3be57bebb54f'::uuid),
    ('e224271d-7038-4b5e-af16-14d55e56358c'::uuid, '174277d1-fb5a-494c-ab38-e9c459d70dad'::uuid),
    ('79bd0a0d-f614-4181-9e7a-6ce89db7e2c9'::uuid, 'a92b92d1-961b-4cde-af89-268fa6f0821f'::uuid),
    ('05f52279-cec6-4224-b4c8-e05edc18a04d'::uuid, 'a0c59add-c452-40fe-9a5c-d2adc278e04b'::uuid),
    ('ec3a1a2c-5a24-41e7-818b-4c39ada10754'::uuid, '44233150-fc77-4bac-bad5-3c4f3a551ba0'::uuid),
    ('a6e36eb3-30b0-4f97-9f96-e2f42e9cf7a2'::uuid, 'fa6601e5-ddfb-448f-a8ec-ed53806e20b5'::uuid),
    ('1cd31f92-8605-4da1-9c5c-f519bac2b145'::uuid, 'd9e19274-617f-40a3-b470-00fb954eacb7'::uuid),
    ('407a680e-99e2-4cec-b7d8-6f821042de15'::uuid, '51042241-bf7b-4e8f-bd24-1005713f0871'::uuid),
    ('0e430bca-54af-4286-84a4-2b536f25ce33'::uuid, 'f0f4d908-5938-4b04-99c1-0a6aa9de93cf'::uuid),
    ('479823d0-0ac8-4cf9-a391-21a7b321cb1b'::uuid, '0bb4c3e1-6aa2-4c04-aac5-f83f74c1c065'::uuid),
    ('c7589c39-f6ea-442f-b467-879744779190'::uuid, '28122d1a-513e-4138-9370-4517c4a06e6f'::uuid),
    ('374b15a8-78dc-42ca-beb7-1ef57a5327a4'::uuid, '00a1ce98-dace-496f-a128-43f9737109a1'::uuid),
    ('8be77a1b-d8d0-4720-909e-994c65145c22'::uuid, 'edba7499-a763-467e-bb16-91485ea52ddc'::uuid),
    ('b446f0ad-840e-4e1b-b62f-d00b6d6cb039'::uuid, 'b7b41d05-d4f7-47c6-b917-686d282b1ac0'::uuid),
    ('7e77b4e5-817a-4490-b466-d99f41ac7693'::uuid, 'e532c0d4-5942-41b5-94d5-33a988859f2f'::uuid)
)
update events k
set image_url = coalesce(nullif(k.image_url, ''), r.image_url),
    description = case when length(coalesce(r.description,'')) > length(coalesce(k.description,'')) then r.description else k.description end,
    price_from = coalesce(k.price_from, r.price_from),
    is_free = coalesce(k.is_free, r.is_free),
    ticket_url = coalesce(nullif(k.ticket_url, ''), r.ticket_url)
from pairs p
join events r on r.id = p.reject_id
where k.id = p.keep_id;

insert into schema_migrations (filename) values ('update_2026-09-17_dedupe-enrich-surviving-rows.sql')
on conflict (filename) do nothing;
