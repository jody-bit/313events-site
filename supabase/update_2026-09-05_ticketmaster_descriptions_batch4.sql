-- 2026-09-05 -- Batch 4 of researched Ticketmaster descriptions.
-- Continues the description backlog fill (batches 1-3 = trial, first bigger
-- push, and second bigger push) for events with source = 'Ticketmaster' and
-- description IS NULL, covering start_date 2026-09-26 through 2026-10-02.
--
-- Scope: hand-curated from the raw date-ordered backlog, excluding self-evident
-- sports games (X vs Y listings) and small hyperlocal multi-band club bills with
-- no nationally notable headliner, consistent with prior batches.
--
-- All 59 primary events got real, sourced descriptions this round --
-- no honest nulls this batch (research came back clean for everything attempted).
--
-- Also includes 2 duplicate rows (Alien Ant Farm's redundant District 142 listing,
-- UniverSoul Circus's second showing reusing the first) and 6 rental/package
-- add-on rows (Bleachers party box, Bert Kreischer/Malcolm Todd/Chicks/Mrs.
-- Doubtfire/UB40 Caesars & suite packages).

-- Source: https://kissfmdetroit.com/event/bryson-tiller-presents-the-neo-trapsoul-tour/
update events set description = 'Bryson Tiller, the platinum-selling R&B and hip-hop artist known for his Trapsoul album series, headlines The Neo Trapsoul Tour at Pine Knob Music Theatre, with special guests Majid Jordan and Ty Dolla $ign.'
where id = 'e224271d-7038-4b5e-af16-14d55e56358c';

-- Source: https://en.wikipedia.org/wiki/Mico_(singer)
update events set description = 'MICO (Jose Miguel Veloso), the Filipino-Canadian singer-songwriter known for the hit "cut my hair" and his 2026 debut album When the Lights Turn On, brings his Running From A Feeling Tour to Saint Andrew''s Hall.'
where id = '8afc8cd6-a041-40b4-945f-af1aefe4463d';

-- Source: https://en.wikipedia.org/wiki/Polyphia
update events set description = 'Polyphia, the Plano, Texas instrumental progressive-rock band known for blending virtuosic guitar work with hip-hop and EDM influences, brings its 2026 "Tour MMXXVI" to The Fillmore Detroit, with support from Ladrones and RJ Pasin, ahead of their fifth album Be Not Afraid.'
where id = '860679b0-957e-4f21-b370-07ade010a427';

-- Source: https://www.soundboarddetroit.com
update events set description = 'Grammy-nominated R&B and soul artist Raheem DeVaughn returns to Sound Board at MotorCity Casino Hotel.'
where id = '61c33799-35d0-4776-8a63-c72c829baa0a';

-- Source: https://www.theconeydetroit.org/the-event
update events set description = 'The Coney is a star-studded comedy and variety fundraiser at the Detroit Opera House, bringing together Detroit and out-of-town talent for a night of music, comedy, and Motor City-flavored surprises, with proceeds supporting Detroit youth arts education.'
where id = 'c99efcd1-9543-442e-8d03-11b2ae4fc0f0';

-- Source: https://en.wikipedia.org/wiki/Ravyn_Lenae
update events set description = 'Chicago-born R&B singer-songwriter Ravyn Lenae, whose "Love Me Not" reached the Billboard Hot 100 top 10, brings her Blue Island Tour -- in support of her 2026 album Blue Island -- to the Masonic Temple, with support from Lexa Gates.'
where id = 'e14f5078-5b90-4cd6-acc9-77ccc07eda0f';

-- Source: https://kingmala.com/pages/tour
update events set description = 'KiNG MALA (Areli Castro), the El Paso-born, Los Angeles-based alternative pop/soul artist known for songs like "She Calls Me Daddy," brings The Golden Thing Tour to The Loving Touch in Ferndale.'
where id = '7b60fb98-7dcf-4ce9-924f-cbaea7c96091';

-- Source: https://www.royaloakmusictheatre.com
update events set description = 'Comedian and actor Harland Williams (Dumb and Dumber, RocketMan) brings his stand-up to Royal Oak Music Theatre.'
where id = '0e0db8aa-7d7a-4186-a883-ac7b3bb47c29';

-- Source: https://en.wikipedia.org/wiki/Sub_Urban_(musician)
update events set description = 'Sub Urban (Daniel Maisonneuve), the singer-songwriter best known for his viral hit "Cradles," brings The Bell Tolls Tour -- following his 2025 album If Nevermore -- to the Blind Pig in Ann Arbor, with support from Golden Cats.'
where id = '6c115ab1-3785-464a-b0e8-95d535d421d8';

-- Source: https://en.wikipedia.org/wiki/The_Inspector_Cluzo
update events set description = 'The Inspector Cluzo -- the high-energy French rock-blues guitar-and-drums duo from Mont-de-Marsan, formed in 2008 by Laurent "Malcolm" Lacrouts and Mathieu "Phil" Jourdain -- bring their raucous live show to Detroit''s TSDMAAC (Crypt), with support from The Messenger Birds.'
where id = '0f01931a-5010-4d51-a5ab-bc2dd91635e8';

-- Source: https://www.flagstarstrand.com/cinema-at-the-strand
update events set description = 'A screening of Illumination''s animated film "Minions & Monsters" (2026), directed by Pierre Coffin with a cast including Christoph Waltz, presented at the Flagstar Strand Theatre for the Performing Arts as part of its Cinema at the Strand series.'
where id = '7cf036ff-d0ef-4fb1-85c5-07bc5a44cfd4';

-- Source: https://www.ticketweb.com/event/bayway-edgemen-tickets/15030813
update events set description = 'Bayway, the hard-hitting hardcore band from Elizabeth, New Jersey, formed in 2022 and signed to Trustkill Records, brings its raw NJHC sound to Edgemen in Clinton Township, with support from Cold Steel, Two-Piece, and Load Tha Nine.'
where id = '9060ff78-5e79-45d3-bbd8-2e2607cada47';

-- Source: https://www.livenation.com/venue/KovZpZAEAktA/the-fillmore-detroit-events
update events set description = 'Gym Class Heroes and Lupe Fiasco co-headline the Back To Basics Tour at The Fillmore Detroit, bringing their 2000s hip-hop/rock hits together for one night, with support from B.o.B.'
where id = '01565718-44d5-454c-b8aa-4c14c3da64d1';

-- Source: https://www.michigan.org/event/knocked-loose-denzel-curry-hive-mind-tour
update events set description = 'Metalcore band Knocked Loose and rapper Denzel Curry co-headline the genre-blending Hive Mind Tour at the Majestic Theatre in Detroit, with direct support from Superheaven and Boundaries.'
where id = 'e4b6608b-9937-4e9d-9b14-c105c5c436a1';

-- Source: https://www.313presents.com/news/detail/staind-bring-break-the-cycle-25th-anniversary-tour-featuring-seether-with-special-guests-hoobastank-and-hinder-to-pine-knob-music-theatre-september-27
update events set description = 'Multi-platinum rock band Staind celebrate the 25th anniversary of their breakthrough album "Break the Cycle" on this tour, with special guests Seether, Hoobastank, and Hinder, stopping at Pine Knob Music Theatre.'
where id = 'c7589c39-f6ea-442f-b467-879744779190';

-- Source: https://www.soundboarddetroit.com
update events set description = 'Whose Line Is It Anyway? improv stars Colin Mochrie and Brad Sherwood bring their unscripted, audience-driven comedy show to Sound Board at MotorCity Casino Hotel.'
where id = '29f9d9cc-1ddf-48c3-b1cf-9bdc2d0ece54';

-- Source: https://www.themasonic.com/calendar
update events set description = 'British new wave veterans Squeeze, known for hits like "Tempted" and "Cool for Cats," bring their North American tour to the Masonic Temple in Detroit.'
where id = 'ebd7d3bf-29d2-4737-a869-f17fa9d3e6be';

-- Source: https://en.wikipedia.org/wiki/The_Supersuckers
update events set description = 'Long-running Tucson-formed, Seattle-based cowpunk band the Supersuckers -- fronted by bassist/vocalist Eddie Spaghetti since 1988 and known for blending hard rock with alt-country -- play Small''s in Hamtramck with support from The Rumours and Against The Grain.'
where id = '3785fbaa-6032-4045-b2fc-94ab53986ce9';

-- Source: https://www.themagicbag.com
update events set description = 'GayC/DC, billed as the world''s first and only all-gay tribute to AC/DC and founded by Pansy Division bassist Chris Freeman, brings its faithful-but-queered recreation of the AC/DC catalog to The Magic Bag in Ferndale.'
where id = 'a464a9ef-0c3a-4de6-a66b-babcce470b21';

-- Source: https://en.wikipedia.org/wiki/Lambrini_Girls
update events set description = 'English punk duo Lambrini Girls -- Phoebe Lunny and Selin Macieira-Boşgelmez, whose 2025 debut album Who Let the Dogs Out charted at No. 16 in the UK and drew acclaim for its raucous, politically charged riot-grrrl-influenced sound -- play the Majestic Theatre in Detroit with support from Big Special and Big Girl, a rescheduled date from a May 2026 show postponed due to injury.'
where id = 'ca08a31b-f8b0-45f0-8bdb-833a97dcfb9b';

-- Source: https://www.songkick.com/concerts/43027777-ben-harper-and-the-innocent-criminals
update events set description = 'Grammy-winning singer-songwriter Ben Harper reunites with his longtime backing band The Innocent Criminals for an intimate general-admission show at Saint Andrew''s Hall in Detroit.'
where id = '01b1fb52-a06f-4c26-8c62-8d1d32e88104';

-- Source: https://theark.org
update events set description = 'Arkansas-based folk singer-songwriter and poet Willi Carlisle brings his Universal Bubba Tour, tied to his forthcoming album The Universal Bubba, to The Ark in Ann Arbor with special guest William Matheny.'
where id = '5fc661e5-f620-4582-a91d-7439c79ddaa0';

-- Source: https://en.wikipedia.org/wiki/Donald_Harrison
update events set description = 'NEA Jazz Master and New Orleans saxophonist Donald Harrison Jr. -- known as "Big Chief" for his role leading the Congo Square Nation Afro-New Orleans Cultural Group and for pioneering his genre-blending "Nouveau Swing" style -- performs an intimate set at Aretha''s Jazz Cafe in Detroit.'
where id = '05710edf-87f3-4d0e-b112-83da2f81b7cb';

-- Source: https://www.313presents.com/news
update events set description = 'Grammy-nominated singer Teddy Swims -- best known for the hit "Lose Control" -- brings his The UGLY Tour to Little Caesars Arena in Detroit, with support from Mac Ayres and MarcLo.'
where id = '4c645180-0436-409e-8dae-8f5abaa37285';

-- Source: https://www.313presents.com/news
update events set description = 'Jack Antonoff''s band Bleachers bring their Bleachers Forever Tour to the Michigan Lottery Amphitheatre at Freedom Hill in Sterling Heights, with support from This Is Lorelei.'
where id = '2c403845-a395-4bc2-bf9a-d66da37c2d86';

-- Source: https://www.ticketweb.com/search?q=greenleaf+howling+giant
update events set description = 'Greenleaf, the Swedish stoner rock band formed in 1999 by Tommi Holappa (also of Dozer) with members drawn from Truckfighters and Lowrider, headlines this stoner/doom bill at TSDMAAC''s Crypt stage, with support from Howling Giant and Armada Lodge.'
where id = 'bbdb85b9-171c-4624-8d80-490a13c6f0a0';

-- Source: https://community.metrotimes.com
update events set description = 'Jenna Raine, a Christian pop singer-songwriter who built a following of over a million on TikTok, brings her Jeans, Boys & Jesus Tour -- named for her debut album -- to the Magic Bag with special guest Zoe Levert.'
where id = 'fff65a63-fb5b-4bf4-86fb-9fdbaed8952e';

-- Source: https://www.axs.com/events/alien-ant-farm-tickets
update events set description = 'Alien Ant Farm, the California rock band best known for their 2001 cover of Michael Jackson''s "Smooth Criminal," play District 142 as part of a tour celebrating 25 years of their breakout album "ANThology," with support from Scarhaven.'
where id = '81a48b1f-2387-4ffa-98e7-1b750b54639b';

-- Source: https://www.noelmillerlive.com/
update events set description = 'Noel Miller -- the Canadian-American YouTuber, comedian, and podcaster (Cold Ones, formerly one half of Cody & Noel) -- brings his stand-up "New Supply" tour to the Royal Oak Music Theatre.'
where id = '0df7d25b-bc93-4319-b211-3f60980a93d9';

-- Source: https://blindpigmusic.com/calendar/
update events set description = 'A 2010s pop-rap throwback bill headlined by Shwayze (the surf-pop rapper behind "Corona and Lime"), with Sammy Adams ("Driving Me Crazy") and Chiddy Bang ("Opposite of Adults," "Ray Charles") in support, at the Blind Pig.'
where id = 'a7ba8979-06ef-48a8-b045-417b7c18bc83';

-- Source: https://www.michigan.org/event/chicks
update events set description = 'The Chicks -- Natalie Maines, Martie Maguire, and Emily Strayer, the best-selling U.S. female band of all time -- bring their Taking the Long Way 20th Anniversary Tour to the Fox Theatre, performing the Grammy-winning 2006 album (Album, Record, and Song of the Year, including "Not Ready to Make Nice") in full before a set of career hits.'
where id = 'a0af8ca0-bd31-4a43-a5e9-54cbbac25fcd';

-- Source: https://www.freedomhillamphitheater.com/events/role-model-30-september-2026/
update events set description = 'Role Model (Tucker Pillsbury) brings his Chuck On Tour, in support of his third studio album "Chuck Timely & The Hourglass" (released August 2026), to the Michigan Lottery Amphitheatre at Freedom Hill with special guest Samia.'
where id = 'b4bd8ede-35f3-492a-a9a3-1c2fc2b6f14a';

-- Source: https://glidemagazine.com
update events set description = 'Militarie Gun, the Los Angeles alternative/hardcore-punk band, brings its aptly named "20 Songs for 20 Dollars" headline tour -- every ticket priced at just $20 -- to the Loving Touch, with support from Softcult, Shady Nasty, and Dazy.'
where id = 'd5bd061b-fed7-4904-991c-e7f72c37f83e';

-- Source: https://www.themagicbag.com/concerts-magicbag/kickstand-productions-presents
update events set description = 'Haute & Freddy is the theatrical synth-pop duo of Michelle Buzz and Lance Shipp, touring in support of their debut album "Big Disgrace" and known for elaborate, costumed live shows built around fan favorites like "Shy Girl" and "Scantily Clad."'
where id = '92da63ce-4634-4ca6-ab3b-c127a8affd31';

-- Source: https://ragman.org/everything-yes
update events set description = 'Everything Yes is a North Carolina-based jazz-fusion group that grew out of late-night university jam sessions, spearheaded by drummer/YouTuber Zack Graybeal ("ZackGrooves") alongside bandmates including Cole Sipe, Reggie McNeill and Sean Reeser.'
where id = 'db5e2925-ab0b-4b91-9c3f-ad6b40ac2ff9';

-- Source: https://www.313presents.com/news/detail/doja-cat-announces-2026-dates-for-tour-ma-vie-world-tour-to-include-little-caesars-arena-october-1-2026
update events set description = 'Grammy-winning superstar Doja Cat brings her Tour Ma Vie World Tour -- her biggest headlining run to date, in support of fifth studio album "Vie" -- to Little Caesars Arena, with special guest Latto opening the Detroit show.'
where id = '89901b03-4d9a-440a-a10d-201ed0629df2';

-- Source: https://en.wikipedia.org/wiki/Do_That_Again_(Malcolm_Todd_album)
update events set description = 'Singer-songwriter Malcolm Todd, who broke out via TikTok and the Billboard Hot 100 hit "Chest Pain (I Love)," headlines the Fox Theatre on his Do That Again Tour, a Live Nation-promoted North American run supporting his sophomore album "Do That Again" (Columbia Records, 2026).'
where id = '2051013b-743d-4b6b-a68f-7dda12a5c826';

-- Source: https://www.ticketmaster.com/universoul-circus-detroit-michigan-10-01-2026/event/0800651DD550EAA1
update events set description = 'UniverSoul Circus, the Black-owned, hip-hop-infused touring circus founded by Cedric Walker in 1994, returns to Detroit for a multi-week run of acrobatics, comedy and multicultural performance acts staged outside the Aretha Franklin Amphitheatre.'
where id = '87c3200d-0255-4dbc-b249-84e0daa35b1c';

-- Source: https://en.wikipedia.org/wiki/Marrow_Deep
update events set description = 'Progressive-metal veterans Mastodon bring The Poisonous Weapons Tour, with support from Deafheaven and Alcest, to the Fillmore Detroit in support of their ninth studio album "Marrow Deep" -- the band''s first release since the 2025 death of founding guitarist Brent Hinds.'
where id = '0b84ebb6-9604-4103-8458-d5bf7f8cf8c8';

-- Source: https://www.livenation.com/event/16vZZ_FFAG7tVYU/bert-kreischer-permission-to-party
update events set description = 'Stand-up comedian and podcaster Bert Kreischer, best known for his viral "Machine" story, brings his Permission to Party World Tour to The Colosseum at Caesars Windsor.'
where id = 'c77704b2-1359-4f3b-9d08-c9605c4172fa';

-- Source: https://www.livenation.com/event/vvG1OZ_G6x5zlm/buzzcocks-celebrating-50-years-of-buzzcocks
update events set description = 'Pioneering English punk band Buzzcocks -- known for classics like "Ever Fallen in Love (With Someone You Shouldn''t''ve)" -- play Saint Andrew''s Hall on their Celebrating 50 Years of Buzzcocks anniversary tour, marking five decades since the group''s formation.'
where id = 'ef5e776b-5a17-4a4e-aab4-f962a00f6308';

-- Source: https://www.ticketweb.com/event/the-schizophonics-burning-smalls-tickets/14201624
update events set description = 'San Diego garage-rock/soul trio The Schizophonics, known for explosive, high-energy live shows blending Motown grit, ''60s garage rock and ''70s punk, bring their Burning Floor Tour to Small''s with support from Descartes A Kant.'
where id = 'bc1106c9-be7c-42fb-a80b-9f86f56690cb';

-- Source: https://www.labyrinthinconcert.com/
update events set description = 'A 40th-anniversary live-to-film concert experience of Jim Henson''s 1986 fantasy film Labyrinth, screened while a live band performs the David Bowie/Trevor Jones score in sync with the film.'
where id = 'fc4c46a4-effa-468e-878d-cee0f5922678';

-- Source: https://www.fabiofrizzi.com/fall2026
update events set description = 'Italian composer Fabio Frizzi, famed for scoring Lucio Fulci horror classics like Zombie and The Beyond, performs his FRIZZI2FULCI concert with his F2F Band at TSDMAAC, with special guest Ethan Lee McCarthy.'
where id = '31809646-5ba0-4178-bafa-16071a74d4b9';

-- Source: https://songbyrddc.com/event/ella-boh-blurry-tour/
update events set description = 'LA-based dark pop artist Ella Boh brings her Blurry Tour, in support of her BLURRY EP, to the Pike Room at The Crofoot with support from Psylosia.'
where id = 'acbc12f5-7059-4023-b7b9-bb5ccc5e23a7';

-- Source: https://blindpigmusic.com/calendar/
update events set description = 'The Holdup headlines a night at the Blind Pig with support from CYDEWAYS and Dylan Reese.'
where id = '8d0a20b8-bee4-410e-a005-2badf970a5b6';

-- Source: https://en.wikipedia.org/wiki/Citizen_(band)
update events set description = 'Ohio/Michigan emo-rock band Citizen, touring behind their sixth album Halcyon Blues (2026), bring their Halcyon Blues World Tour to the Majestic Theatre with support from Anxious, Hotline TNT, and Cryogeyser.'
where id = 'f932cf98-8e88-48d9-b4a7-7f7ddd694f5b';

-- Source: https://doubtfirethemusical.com/tour
update events set description = 'The touring stage musical adaptation of the 1993 film Mrs. Doubtfire, following a divorced father who disguises himself as a British nanny to stay close to his kids, plays the Fox Theatre for performances October 2-3, 2026.'
where id = 'fd1c7ca1-e58b-43f9-a761-297362a47ec4';

-- Source: https://www.thefillmoredetroit.com/shows
update events set description = 'The revived Taste of Chaos tour returns with co-headliners Hollywood Undead and In This Moment, joined by I See Stars, Vana, and Melrose Avenue, at The Fillmore Detroit.'
where id = '3041c7bc-d95a-49c2-bef8-a33ad7847511';

-- Source: https://en.wikipedia.org/wiki/Naomi_Sharon
update events set description = 'Dutch R&B singer Naomi Sharon, the first female artist signed to Drake''s OVO Sound label, tours behind her sophomore album No Sleep in Paradise (released June 2026).'
where id = '62196e31-ea66-4d6f-95c4-a3d7af9b52c7';

-- Source: https://ultimateclassicrock.com/ub40-2026-big-love-tour/
update events set description = 'UB40 Featuring Ali Campbell -- led by the British reggae group''s original lead singer alongside longtime members Astro and Mickey Virtue -- brings their Big Love Tour to The Colosseum at Caesars Windsor.'
where id = '5dd23c21-49ed-4381-ab58-e3e27bc1e0c1';

-- Source: https://www.313presents.com
update events set description = 'Foster The People -- the alt-pop band behind hits like "Pumped Up Kicks" and "Sit Next to Me" -- bring their 2026 Good Mourning Sunshine Tour to the Michigan Lottery Amphitheatre at Freedom Hill, with special guest Goth Babe opening the show.'
where id = 'daa1f3c1-7f8a-4309-a11d-ec26b88714bc';

-- Source: https://andiamoshowroom.com
update events set description = 'Vocalist Jenene Caramielo performs her live Celine Dion tribute experience, backed by a full band playing iconic hits like "My Heart Will Go On" and "The Power of Love," at the Andiamo Celebrity Showroom.'
where id = 'ad12dcc3-0565-46f3-9006-874d4c39ac16';

-- Source: https://www.royaloakmusictheatre.com
update events set description = 'British singer-songwriter Artemas, who broke out with the viral hit "i like the way you kiss me," brings his 2026 tour to the Royal Oak Music Theatre.'
where id = '673bbf4d-10e5-47d4-bcd3-d1db8e91b5cd';

-- Source: https://www.theemeraldtheatre.com
update events set description = 'ADRENALIZE: The Ultimate Def Leppard Experience recreates the sound and swagger of a classic Def Leppard arena show, playing hits like "Pour Some Sugar on Me," "Photograph," and "Hysteria" live at the Emerald Theatre.'
where id = '87258d74-665c-45f2-be85-0eab6cf7aa4e';

-- Source: https://www.whoselive.com
update events set description = 'Whose Live Anyway? brings original Whose Line Is It Anyway? cast members Ryan Stiles, Greg Proops, Jeff B. Davis, and Joel Murray to the Michigan Theater for 90 minutes of unscripted, audience-driven improv comedy and song.'
where id = 'd61fbe73-c8d3-4228-8552-fdb352c96674';

-- Source: https://www.flagstarstrand.com
update events set description = 'A Halloween double feature at the Flagstar Strand Theatre pairing George Romero''s zombie classic "Night of the Living Dead" with the original 1960 "Little Shop of Horrors," part of the venue''s Cinema at the Strand screening series.'
where id = '1c1b3e3a-5915-486a-bb69-14e0cd5749bb';

-- Source: https://www.kaninwren.com
update events set description = 'Michigan-based singer-songwriter Kanin Wren, known both for her original pop material and her popular live "Taylor Swift Experience" tribute show, performs at the Blind Pig.'
where id = 'c2009b8e-f9bf-4bae-851c-3d5b617cbeba';

-- Source: https://huntingtoncentertoledo.com
update events set description = 'Christmas Stampede is a family-friendly holiday arena spectacular that fuses Western rodeo tradition -- horses and rodeo action -- with big-show, Christmas-themed production at the Huntington Center.'
where id = '9f9b93b0-843d-45e8-9dee-09612f936f8d';

-- Duplicate/companion of 81a48b1f-2387-4ffa-98e7-1b750b54639b -- Source: https://www.axs.com/events/alien-ant-farm-tickets
update events set description = 'Alien Ant Farm, the California rock band best known for their 2001 cover of Michael Jackson''s "Smooth Criminal," play District 142 as part of a tour celebrating 25 years of their breakout album "ANThology," with support from Scarhaven.'
where id = 'e3210038-25a0-4d5c-a8e1-1346a0968e94';

-- Duplicate/companion of 87c3200d-0255-4dbc-b249-84e0daa35b1c -- Source: https://www.ticketmaster.com/universoul-circus-detroit-michigan-10-01-2026/event/0800651DD550EAA1
update events set description = 'UniverSoul Circus, the Black-owned, hip-hop-infused touring circus founded by Cedric Walker in 1994, returns to Detroit for a multi-week run of acrobatics, comedy and multicultural performance acts staged outside the Aretha Franklin Amphitheatre.'
where id = '57a5a2ac-156e-43b9-9afe-88c872850b1a';

-- Rental/package add-on tied to 2c403845-a395-4bc2-bf9a-d66da37c2d86 -- Source: https://www.313presents.com/news
update events set description = 'A rental/package add-on for Bleachers Forever, rather than a separate performance -- same event, same night.'
where id = '53b1daa6-aa09-402c-8d9a-735612cafb05';

-- Rental/package add-on tied to c77704b2-1359-4f3b-9d08-c9605c4172fa -- Source: https://www.livenation.com/event/16vZZ_FFAG7tVYU/bert-kreischer-permission-to-party
update events set description = 'A rental/package add-on for Bert Kreischer: Permission To Party, rather than a separate performance -- same event, same night.'
where id = '1001a309-c186-4494-8b19-4c12115db190';

-- Rental/package add-on tied to 2051013b-743d-4b6b-a68f-7dda12a5c826 -- Source: https://en.wikipedia.org/wiki/Do_That_Again_(Malcolm_Todd_album)
update events set description = 'A rental/package add-on for Malcolm Todd: Do That Again Tour, rather than a separate performance -- same event, same night.'
where id = 'b841a9ba-b8a5-4e73-9ea3-a75f340e3000';

-- Rental/package add-on tied to a0af8ca0-bd31-4a43-a5e9-54cbbac25fcd -- Source: https://www.michigan.org/event/chicks
update events set description = 'A rental/package add-on for The Chicks - Taking The Long Way, rather than a separate performance -- same event, same night.'
where id = 'd8f5321e-3ce0-48a3-8914-396eb2d51e46';

-- Rental/package add-on tied to fd1c7ca1-e58b-43f9-a761-297362a47ec4 -- Source: https://doubtfirethemusical.com/tour
update events set description = 'A rental/package add-on for Mrs. Doubtfire, rather than a separate performance -- same event, same night.'
where id = '53e62b1b-fe9c-4a5b-88fb-ee09fc76f3b5';

-- Rental/package add-on tied to 5dd23c21-49ed-4381-ab58-e3e27bc1e0c1 -- Source: https://ultimateclassicrock.com/ub40-2026-big-love-tour/
update events set description = 'A rental/package add-on for UB40, rather than a separate performance -- same event, same night.'
where id = '30cbb8ae-82ae-4522-939b-78f3e1b28770';
