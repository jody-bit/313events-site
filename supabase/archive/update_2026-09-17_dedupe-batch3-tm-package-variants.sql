-- Duplicate-events cleanup, batch 3, 2026-09-17. The 36 same-source
-- Ticketmaster-vs-Ticketmaster duplicate pairs reported earlier ("do a
-- full smoke on redundant events... do it").
--
-- Two sub-patterns:
--  (a) Package/rental variants (30 pairs) -- Ticketmaster's own API issues
--      a separate event id for a "Suite Rental", "Party Box Rental", or
--      "| Caesars Ticket + Hotel Packages" bundle of the same real show.
--      Rejecting the bundle/rental variant, keeping the plain listing --
--      confirmed by a clean keyword match on every one of these titles.
--  (b) No keyword, same real event synced twice under different wording
--      (6 pairs) -- resolved individually by picking the fuller/more
--      complete title (Broadway Rave, Lauren Sanderson, Alien Ant Farm,
--      Bayonne, American Aquarium, Michael Franti) or, for the one exact
--      title duplicate (Mania: The ABBA Tribute), arbitrarily since
--      nothing distinguishes them.
--
-- One of these (Los Tigres) needed an extra fix: the surviving row's own
-- title was wrong ("Los Tigres del Mundo" -- not a real band name) while
-- the rejected "Suite Rental" row had the correct one ("Los Tigres del
-- Norte"). Correcting the surviving row's title as part of this file
-- rather than keeping a wrong title just because it happened to be on the
-- non-rental listing.
update events set title = 'Los Tigres del Norte'
where id = '04da4014-011f-471f-aa36-bd0eb20de386';

update events
set status = 'rejected',
    internal_note = 'Duplicate Ticketmaster listing for the same show -- package/rental-bundle variant or a second synced copy of the plain listing. See update_2026-09-17_dedupe-batch3-tm-package-variants.sql header for the full pair list and reasoning.'
where id in (
  -- package/rental keyword matches
  'f54cb804-e55f-4cdd-bf68-e735f6ab5240', -- TWISTED SISTER | Caesars Ticket + Hotel Packages
  '824709b9-6e3c-46e7-b15c-1078961b34ab', -- Josh Ross | Caesars Ticket + Hotel Packages
  '1001a309-c186-4494-8b19-4c12115db190', -- BERT KREISCHER | Caesars Ticket + Hotel Packages
  '7f7d4a19-abb6-4fc0-b27b-1a84d33062b3', -- Tom Jones | Caesars Ticket + Hotel Packages
  '30cbb8ae-82ae-4522-939b-78f3e1b28770', -- UB40 | Caesars Ticket + Hotel Packagess
  'af16446c-0449-432d-b78b-e74faf7a6860', -- Lee Brice | Caesars Ticket + Hotel Packages
  '3d04e689-34ce-47b2-aed0-fb5bdba100b8', -- Jim Jefferies | Caesars Ticket + Hotel Packages
  '72073039-178b-4f73-93a5-622f50c8031d', -- Mitchell Tenpenny | Caesars Ticket + Hotel Packages
  '426f6bae-62f6-4927-a004-9cf11f7b60dc', -- Nelly | Caesars Ticket + Hotel Packages
  'e7d0a776-c56c-474b-a96d-db55c6179c3b', -- The Black Keys | Caesars Ticket + Hotel Packages
  'b269f505-c93e-4aa9-b035-02cc0462f3c5', -- Alice Cooper | Caesars Ticket + Hotel Packages
  '68b8a7c3-ad41-41ef-9361-87a270dd1ce6', -- The Rock Orchestra - Party Box Rental
  'd20defed-7ce9-4ba5-9c92-25f9763f8db6', -- Grinch (12/1) - Suite Rental
  'a84692a0-8e07-482a-bea5-8af2efeda645', -- Grinch (12/2) - Suite Rental
  'ba6d659b-e428-45f4-848a-aaddd0960a88', -- Danny Elfman - Suite Rental
  '53e62b1b-fe9c-4a5b-88fb-ee09fc76f3b5', -- Mrs. Doubtfire (10/2) - Suite Rental
  'b7130385-d050-457f-aca8-8f259c6ee42f', -- Mrs. Doubtfire (10/3 showtime A) - Suite Rental
  '1cb5784d-dbb1-46d8-ba0e-b2c8098a771e', -- Mrs. Doubtfire (10/3 showtime B) - Suite Rental
  '28825066-9ed5-4ffa-adb7-3973ebc75e85', -- The Thorn (10/9) - Suite Rental
  '89d9f660-c5c8-4560-97a8-e050769853fb', -- The Thorn (10/10) - Suite Rental
  '9be24fae-1738-4231-9b80-ebd5f0965105', -- All Star Comedy Festival - Suite Rental
  '9730173d-157a-4c39-bb91-86e6465db31f', -- Assala Nasri - Suite Rental
  'dda3f9a8-d67c-425d-872e-de996bfaeb01', -- Elmo's Got the Moves (showtime A) - Suite Rental
  '01254ec8-d205-470d-b6a4-82819a3bbb1f', -- Elmo's Got the Moves (showtime B) - Suite Rental
  '23ab0a63-3b03-4839-b8ed-f74f59541946', -- Little Big Town - Suite Rental
  '2e5852e5-49d5-44cc-9e62-b77be6ee9fac', -- Whiskey Myers | Caesars Ticket + Hotel Packages
  '802fff9b-5444-4e59-bd2c-f659e38f9228', -- Los Tigres del Norte - Suite Rental
  -- no-keyword same-event duplicates, resolved by title completeness
  '15babfd8-f79f-48e7-8506-5279f3f80bb6', -- "Broadway Rave" (kept: "...The Musical Theatre Dance Party")
  'fbc73563-11ad-41ad-a378-5fbe5260089a', -- "Lauren Sanderson" (kept: "...Lauren Sanderson, XKYLER" -- has support act)
  '43a6f82c-492f-4710-a793-7dbcbe7e9910', -- "Maddie Zahm, Semler" (kept: "Maddie Zahm w/ Semler")
  'd518313d-8da3-44dc-a468-b3dfad2d1657', -- "Mania: The ABBA Tribute" (exact dup, arbitrary keep)
  '81a48b1f-2387-4ffa-98e7-1b750b54639b', -- "Alien Ant Farm w/ Scarhaven" (kept: fuller "...wsg Scarhaven and Lex Bauman")
  'bc8b3e65-8dd0-43b1-b403-718543472c18', -- "Bayonne" (kept: "Kickstand Productions Presents Bayonne - The 'Filters' Tour")
  '96cab1b6-9160-4bbe-9cab-88df02407697', -- "American Aquarium" (kept: "Magic Bag Presents: American Aquarium")
  '56336599-474f-44d0-8605-584c5baea2ac', -- "Michael Franti" (kept: fuller "MICHAEL FRANTI TRIO wsg Wheeland Brothers (acoustic)")
  'ffa7493f-f3af-4886-b0f5-abbde1f8d53f'  -- "R&B ONLY LIVE (21+)" (kept: "R&B ONLY LIVE - Detroit, MI")
)
and status = 'approved';

insert into schema_migrations (filename) values ('update_2026-09-17_dedupe-batch3-tm-package-variants.sql')
on conflict (filename) do nothing;
