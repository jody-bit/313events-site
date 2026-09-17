-- Duplicate-events cleanup, enrichment pass for batch3/batch4, 2026-09-17.
-- Same purpose as update_2026-09-17_dedupe-enrich-surviving-rows.sql:
-- backfill the surviving row in each of the 48 batch3/batch4 pairs with
-- image_url/description/price_from/is_free/ticket_url from whichever
-- rejected row had a better value, wherever the survivor is missing it.
-- Every field uses coalesce()/nullif(), so nothing already populated on
-- the survivor gets overwritten, and this is safe to re-run.
with pairs(keep_id, reject_id) as (
  values
    -- batch3: Ticketmaster package/rental + no-keyword variants
    ('809b64e0-89c8-4d15-8bdd-4e3defeb2b86'::uuid, '15babfd8-f79f-48e7-8506-5279f3f80bb6'::uuid),
    ('81765e2f-d67f-4b07-83ce-ac0c5c9c6ad1'::uuid, 'fbc73563-11ad-41ad-a378-5fbe5260089a'::uuid),
    ('1ba3289c-4fa2-4a54-9db5-dd8a84407ad1'::uuid, '43a6f82c-492f-4710-a793-7dbcbe7e9910'::uuid),
    ('80eb8131-4c8a-4747-b8b2-c2cafed40cc4'::uuid, 'd518313d-8da3-44dc-a468-b3dfad2d1657'::uuid),
    ('af08f835-b96b-437d-94f6-2edd3786fc13'::uuid, 'f54cb804-e55f-4cdd-bf68-e735f6ab5240'::uuid),
    ('8d412a19-4076-4358-a34a-97a25acac28a'::uuid, '824709b9-6e3c-46e7-b15c-1078961b34ab'::uuid),
    ('c77704b2-1359-4f3b-9d08-c9605c4172fa'::uuid, '1001a309-c186-4494-8b19-4c12115db190'::uuid),
    ('7f26c570-f3fb-45fa-8503-1ce13ca8a34c'::uuid, '7f7d4a19-abb6-4fc0-b27b-1a84d33062b3'::uuid),
    ('5dd23c21-49ed-4381-ab58-e3e27bc1e0c1'::uuid, '30cbb8ae-82ae-4522-939b-78f3e1b28770'::uuid),
    ('f396aed0-ae7f-48de-ab09-d80afdac4051'::uuid, 'af16446c-0449-432d-b78b-e74faf7a6860'::uuid),
    ('475c179e-1762-44e2-8692-d5c774ac32d8'::uuid, '3d04e689-34ce-47b2-aed0-fb5bdba100b8'::uuid),
    ('3766bb6e-bd7d-4386-be10-84a73d60d0fb'::uuid, '72073039-178b-4f73-93a5-622f50c8031d'::uuid),
    ('6d828542-2ffb-4b80-b2f4-0180e1bef9cb'::uuid, '426f6bae-62f6-4927-a004-9cf11f7b60dc'::uuid),
    ('b8446605-24a7-49dc-b799-f9664d583ce5'::uuid, 'e7d0a776-c56c-474b-a96d-db55c6179c3b'::uuid),
    ('4d4aac4f-06b2-4636-8cfa-2b1c1e51851d'::uuid, 'b269f505-c93e-4aa9-b035-02cc0462f3c5'::uuid),
    ('e3210038-25a0-4d5c-a8e1-1346a0968e94'::uuid, '81a48b1f-2387-4ffa-98e7-1b750b54639b'::uuid),
    ('99797a7d-eb94-44c6-b84f-8de2c9845898'::uuid, 'bc8b3e65-8dd0-43b1-b403-718543472c18'::uuid),
    ('4bde402f-ef7f-4468-abb1-db2efa069b34'::uuid, '68b8a7c3-ad41-41ef-9361-87a270dd1ce6'::uuid),
    ('9f5b2c84-a3fa-47c9-bffb-dee108928294'::uuid, '96cab1b6-9160-4bbe-9cab-88df02407697'::uuid),
    ('04da4014-011f-471f-aa36-bd0eb20de386'::uuid, '802fff9b-5444-4e59-bd2c-f659e38f9228'::uuid),
    ('4b422547-1908-45f9-b5f5-a3ddeaa79eca'::uuid, 'd20defed-7ce9-4ba5-9c92-25f9763f8db6'::uuid),
    ('0b27d803-9830-4174-b990-5b1749f374c2'::uuid, 'a84692a0-8e07-482a-bea5-8af2efeda645'::uuid),
    ('0a4aa62d-3c5e-44a9-9377-6ea5e189639e'::uuid, 'ba6d659b-e428-45f4-848a-aaddd0960a88'::uuid),
    ('fd1c7ca1-e58b-43f9-a761-297362a47ec4'::uuid, '53e62b1b-fe9c-4a5b-88fb-ee09fc76f3b5'::uuid),
    ('c45dcb89-b160-4e4b-a393-d395dd9d9a68'::uuid, '56336599-474f-44d0-8605-584c5baea2ac'::uuid),
    ('51c374f2-e17b-4bfb-9f5e-1c5e7f22cadc'::uuid, '2e5852e5-49d5-44cc-9e62-b77be6ee9fac'::uuid),
    ('10dd84a5-b17d-4760-a603-8028cfbfe0c5'::uuid, 'b7130385-d050-457f-aca8-8f259c6ee42f'::uuid),
    ('de6c7d01-fb1f-4412-b732-1e7b6ff75d60'::uuid, '1cb5784d-dbb1-46d8-ba0e-b2c8098a771e'::uuid),
    ('6fcbf3c1-f59b-4f0d-828f-5f0eab39867f'::uuid, '28825066-9ed5-4ffa-adb7-3973ebc75e85'::uuid),
    ('b5202e07-46de-44ea-beb6-c1fdfc964bfc'::uuid, '89d9f660-c5c8-4560-97a8-e050769853fb'::uuid),
    ('6803a626-caea-4b7c-852e-8bfcab69fb21'::uuid, '9be24fae-1738-4231-9b80-ebd5f0965105'::uuid),
    ('cbf24eeb-b22a-4fef-a98c-3878b666d400'::uuid, '9730173d-157a-4c39-bb91-86e6465db31f'::uuid),
    ('d3f1f1d5-daca-49f1-9826-afeafd99156e'::uuid, 'ffa7493f-f3af-4886-b0f5-abbde1f8d53f'::uuid),
    ('f0d94d03-8207-4f71-b88b-1de2af86a81f'::uuid, 'dda3f9a8-d67c-425d-872e-de996bfaeb01'::uuid),
    ('218a7d63-b94c-4674-a1f5-94c3eb22445e'::uuid, '01254ec8-d205-470d-b6a4-82819a3bbb1f'::uuid),
    ('53fa88b3-223a-4e7c-9838-d94baa1ce8ab'::uuid, '23ab0a63-3b03-4839-b8ed-f74f59541946'::uuid),
    -- batch4: remaining cross-source pairs + one VisitDetroit-internal dup
    ('6df113d6-706e-4711-a967-074f23bacbfb'::uuid, 'ab3dbe29-a5ee-4af3-8279-0c7a6dad7767'::uuid),
    ('12898237-2c41-4179-9c09-6ca04595d477'::uuid, 'd0773f02-8270-4d9f-a003-8475a50ba283'::uuid),
    ('4358a48e-f670-4444-b47a-eb9b8dcfba7e'::uuid, 'abab9034-7692-4dcb-85cf-74a359492ed3'::uuid),
    ('aa94ba66-d4ca-43e0-9f36-67ca56ae25ad'::uuid, 'cff7bf5d-0e0c-4d45-9ac5-5f104dd2a8b0'::uuid),
    ('de19762e-c14e-46e1-a111-a857596fcfbd'::uuid, 'd1c70416-3e36-45a5-9a6d-5d81e76fb9cd'::uuid),
    ('15bdc0f8-f0bb-4dc7-b71f-bc0a20c3e515'::uuid, 'bcae6786-454a-4e95-9fe5-3f4906498ad0'::uuid),
    ('90953eeb-81ac-4991-90e5-539cae5e1689'::uuid, 'a9ef3a5b-b378-4ce5-8c9c-9daaa0dfd7cf'::uuid),
    ('c99efcd1-9543-442e-8d03-11b2ae4fc0f0'::uuid, '92d92539-a92f-4be4-85ec-2ec3264611ad'::uuid),
    ('5d46980f-026e-4a6e-b2dc-d33d6b346ec5'::uuid, 'f0907190-96d3-4ad8-b883-ef67fdc1fcf5'::uuid),
    ('5e0ec275-3c22-42fd-a56c-487bc70a55ad'::uuid, 'a189d289-2f09-4275-926a-4accaabd56e7'::uuid),
    ('9caf509d-6691-40a8-b1ff-b9e5c6b2906b'::uuid, '6bd91590-926d-4a8e-a6ae-8d15be7e42aa'::uuid),
    ('8e67ecc9-f82b-4f8f-80a3-b16668f6c829'::uuid, '13267756-2712-4116-82ec-9bfdaf2e0672'::uuid)
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

insert into schema_migrations (filename) values ('update_2026-09-17_dedupe-enrich-batch3-4.sql')
on conflict (filename) do nothing;
