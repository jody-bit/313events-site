-- 2026-09-05 -- Batch 3 of researched Ticketmaster descriptions.
-- Continues the description backlog fill (batch 1 = trial batch, batch 2 = first
-- bigger push) for events with source = 'Ticketmaster' and description IS NULL,
-- covering start_date 2026-09-16 through 2026-09-25.
--
-- Scope: hand-curated from the raw date-ordered backlog, excluding self-evident
-- sports games (X vs Y listings) and small hyperlocal multi-band club bills with
-- no nationally notable headliner, consistent with prior batches.
--
-- 54 primary events got real, sourced descriptions; 8 came back null
-- (researched honestly, no reliable/matching source found) and are left untouched:
--   b74ef7d6 (Nightcrawlers' Teen Art Collective), bbdfb756 (guardin),
--   1e7eb6dd (Harvest Moon), 3e925f32 (Kickstand/Improvement Movement),
--   08688bb0 (Magic Bag Presents: ROCKSTAR), d5bd641a (Sam Rose/Songs & Giggles),
--   194ab4c9 (JMSN -- ticketing page indicates this show may be CANCELLED, flagging
--   for review separately), 5401e9f4 (Keep for Cheap + Latchkey Kids).
-- Their duplicate 29ccd9d8 (2nd Nightcrawlers showtime) is also left untouched since
-- its primary b74ef7d6 has no description to reuse.
--
-- Also includes 6 same-batch duplicate/companion rows (reusing a sibling row's
-- researched description) and 5 rows reusing batch 2's already-written "Come From
-- Away" description verbatim (same touring production, later performances), plus
-- 2 rental/package add-on rows (Jim Gaffigan suite rental, Tom Jones Caesars package).

-- Source: https://news.pollstar.com/2026/06/02/gary-clark-jr-announces-summer-fall-u-s-tour/
update events set description = 'Gary Clark Jr. is a Grammy-winning Texas guitarist and singer whose sound blends blues, rock, soul and hip-hop influences. He plays The Fillmore Detroit as part of his 2026 headlining U.S. tour, which was expanded from summer into fall dates.'
where id = '6de88b71-d782-453e-b4c2-43bbd891ad22';

-- Source: https://www.pabsttheatergroup.com/events/detail/xavier-wulf-2026
update events set description = 'Xavier Wulf is a Memphis rapper associated with the SESH/Working On Dying collective, known for atmospheric, horror-tinged trap production. This stop at Saint Andrew''s Hall is part of his 2026 Cool World Tour, supporting his Cool World album/era.'
where id = 'ec98cc6c-6068-4c78-bd39-889f2afca8e9';

-- Source: https://www.nme.com/news/music/elvis-costello-announces-2026-uk-tour-of-early-songs-featuring-the-imposters-with-charlie-sexton-3917507
update events set description = 'Elvis Costello & The Imposters, joined by guitarist Charlie Sexton, bring their 2026 "Radio Soul!: The Early Songs of Elvis Costello" tour to Royal Oak Music Theatre, a set focused on material from Costello''s early-career catalog.'
where id = 'bab6f304-d833-47b0-bba8-02d0d5ab0d45';

-- Source: https://www.ticketweb.com/event/laundry-day-presents-the-larger-blind-pig-tickets/14909763
update events set description = 'LAUNDRY DAY, the Toronto-based band/collective, plays Blind Pig in Ann Arbor as part of "LAUNDRY DAY Presents: The Larger Than LIFE Tour," their 2026 North American headlining run.'
where id = 'a19f0480-435f-409c-b9d7-2a260bf7b1dd';

-- Source: https://www.axs.com/events/1414712/jane-remover-live-exhibit-tickets
update events set description = 'Jane Remover, an artist known for moving from hyperpop into shoegaze- and rock-inflected sounds (as on the album Census Designated), performs at the Majestic Theatre as part of the 2026 "Live Exhibit" North American tour.'
where id = '709a2d4f-36ab-4c64-9393-78f2cc0e4510';

-- Source: https://thecrofoot.com/events/tangent-gallery-detroit-mi-5677/show-me-the-body-sep-17-2026-10227/
update events set description = 'Show Me the Body, the New York experimental hardcore/noise-punk band known for combining distorted banjo with aggressive guitar and drums, plays Tangent Gallery in Detroit.'
where id = 'a682b311-0667-4b5f-9bd1-5aa21aecc8b7';

-- Source: https://www.songkick.com/concerts/43065409-social-distortion-at-fillmore-detroit
update events set description = 'Social Distortion, the veteran Southern California punk band led by Mike Ness known for fusing punk with rockabilly and country influences, plays The Fillmore Detroit.'
where id = '178cff79-bbcc-496b-9902-7ad734cfc36e';

-- Source: https://www.tmpresale.com/2026/04/22/tinlicker-north-america-2026-at-saint-andrews-hall-in-detroit-sep-17-2026-pre-sale-code
update events set description = 'Tinlicker, the Dutch progressive house/trance act signed to Anjunadeep, brings its "North America 2026" tour to Saint Andrew''s Hall in Detroit.'
where id = '027cb5f2-826b-484b-ade1-0c8b4db774e5';

-- Source: https://www.toledo.com/news/2026/02/24/daily-dose/brooks-dunn-the-bestselling-country-duo-of-all-time-and-most-awarded-artists-in-cma-history-heading-to-the-huntington-center-in-september/
update events set description = 'Brooks & Dunn, the best-selling country duo of all time and one of the most-awarded acts in CMA history, bring their Neon Moon Tour 2026 to Toledo''s Huntington Center. Kix Brooks and Ronnie Dunn have been touring together since the early 1990s behind a catalog of country radio staples.'
where id = 'f6bf56ec-364d-4519-af58-9dd1877816f6';

-- Source: https://www.ticketweb.com/venue/the-magic-bag-ferndale-mi/211805
update events set description = 'Kickstand Productions presents Pokey LaFarge, the St. Louis-based singer-songwriter known for reviving old-time swing, ragtime, and country blues with a modern sensibility (an Independent Music Award winner who''s collaborated with Jack White and played NPR''s Tiny Desk), with support from Cicada Rhythm, the Athens, Georgia folk duo of Andrea DeMarcus and Dave Kirslis, at The Magic Bag.'
where id = '21d95603-402f-4dea-9e96-48c02951d10e';

-- Source: https://www.ticketweb.com/event/lrain-tsdmaac-crypt-tickets/14240774
update events set description = 'L''Rain, the experimental pop project of Brooklyn artist Taja Cheek, whose densely layered, genre-blurring albums (including 2023''s acclaimed I Killed Your Dog and the new fata morgana) have landed on best-of lists from Pitchfork, The Wire, and The New York Times, performs at TSDMAAC (Crypt) in Detroit.'
where id = '84e40af2-d1b2-4734-b1fc-9380daf07cd7';

-- Source: https://district142live.com/tm-attraction/corey-dakota/
update events set description = 'LAKEVIEW, the country duo of Jesse Denaro and Luke Healy known for blending gritty, rock-influenced instrumentation with classic country songwriting, plays District 142 in Wyandotte with support from Jason Cross and Corey Dakota.'
where id = '2ab25305-ea13-4995-9803-9c4d6301bdae';

-- Source: https://www.royaloakmusictheatre.com/events/detail/1502843
update events set description = 'Texas singer-songwriter Paul Cauthen, the baritone-voiced "Big Velvet" known for genre-blending outlaw country and soul records like Room 41, brings his Book of Paul Tour (behind his April 2026 album of the same name) to Royal Oak Music Theatre with support from Ben Chapman.'
where id = '5573828e-4610-4052-bd24-c350875e7a59';

-- Source: https://www.313presents.com/news/detail/indigo-girls-announce-meadow-brook-amphitheatre-show-with-special-guest-linda-perry-september-17
update events set description = 'Grammy-winning folk-rock duo Indigo Girls (Amy Ray and Emily Saliers), whose four-decade catalog got a fresh wave of attention after their music appeared in Barbie, play Meadow Brook Amphitheatre with special guest Linda Perry, the Grammy-nominated producer/songwriter and former 4 Non Blondes frontwoman known for her work with P!nk, Christina Aguilera, and Adele.'
where id = 'e506f88c-f227-4ae7-b9c9-670a857571eb';

-- Source: https://www.axs.com/events/1425625/channel-tres-the-enigma-tour-tickets
update events set description = 'Channel Tres brings his Enigma Tour to Detroit''s Majestic Theatre, with support from ZAINAB.'
where id = '19b0ad07-bf98-4ab3-9951-8faa9649f3f0';

-- Source: https://www.313presents.com/news/detail/comedian-jim-gaffigan-brings-his-everything-is-wonderful-tour-to-the-fox-theatre-friday-september-18
update events set description = 'Eight-time Grammy nominee and three-time Emmy winner Jim Gaffigan brings his Everything Is Wonderful! Tour to Detroit''s Fox Theatre, his observational comedy following the 2024 Hulu special The Skinny, which drew nearly 100 million online clip views.'
where id = '9295a60b-b2ed-4dd3-8b87-a474a7275c72';

-- Source: https://www.facebook.com/StAndrewsHall/posts/just-announced-hulvey-is-coming-to-saint-andrews-hall-on-friday-september-18-wit/1460626742773109/
update events set description = 'Christian hip-hop artist Hulvey brings his Could Be Tonight Tour, named for his 2026 album that marks his final release with Reach Records, to Saint Andrew''s Hall with special guests Indie tribe. and Kijan Boone.'
where id = '0483e9c2-e99b-45c3-889d-6709ad691228';

-- Source: https://www.313presents.com/news/detail/babymetal-celebrate-fox-day-2026-world-tour-announced-with-support-from-halestorm-and-violent-vira-at-pine-knob-music-theatre-friday-september-18
update events set description = 'BABYMETAL, the Japanese metal trio fronted by SU-METAL, MOAMETAL, and MOMOMETAL, brings its World Tour 2026 to Pine Knob Music Theatre with support from Halestorm and Violent Vira, showcasing their signature fusion of heavy metal with J-pop performance.'
where id = '6dba9a8e-932a-467b-911b-d717ab0da528';

-- Source: https://www.ticketmaster.com/gimme-gimme-disco-tickets/artist/2677757
update events set description = 'Gimme Gimme Disco is a touring dance-party night built around disco and other 70s hits, spun by resident DJs for a costume-encouraged crowd -- more themed club night than concert, with glitter and 70s-inspired outfits part of the draw.'
where id = '47979484-8755-4565-8158-11a0d8943ff3';

-- Source: https://purplexperience.com/about/
update events set description = 'Marshall Charloff & The Purple Xperience is widely regarded as the premier Prince tribute act, co-founded in Minneapolis in 2011 by Charloff alongside Matt "Doctor" Fink, the original keyboardist from Prince & The Revolution. The band performs Prince''s catalog entirely live with no backing tracks.'
where id = '655cfe89-3d9a-4efe-ab55-22b3f726e9a8';

-- Source: https://terrapinflyer.com/
update events set description = 'Terrapin Flyer is a long-running Grateful Dead tribute band founded in 1999, known for pairing faithful renditions of Dead classics with the improvisational, jam-heavy spirit of the original band''s live shows; members have performed alongside Grateful Dead-affiliated musicians including Melvin Seals, Vince Welnick, and Tom Constanten.'
where id = '68e360f2-6af0-4f99-8f7f-cee7e3edc63b';

-- Source: https://en.wikipedia.org/wiki/Metal_Church
update events set description = 'Metal Church is a pioneering Pacific Northwest thrash/power metal band formed in 1980 and led by founding guitarist Kurdt Vanderhoof, touring behind the band''s 2026 album Dead to Rights.'
where id = '604aef13-96ec-4bb1-8193-0829a4c40057';

-- Source: https://bestclassicbands.com/herb-alpert-2026-tour-tijuana-brass-band-11-18-25/
update events set description = 'At 91, trumpet legend and A&M Records co-founder Herb Alpert tours with a newly reformed Tijuana Brass to mark the 60th anniversary of his landmark 1965 album Whipped Cream & Other Delights, playing the horn-driven hits that made him a chart phenomenon.'
where id = 'd3d2125b-ed65-442e-a4ad-4ea214da4b04';

-- Source: https://www.ticketmaster.com/briscoe-tickets/artist/2931665
update events set description = 'Briscoe is an Austin, Texas duo -- Truett Heintzelman and Philip Lupton -- whose classic-rock-leaning sound draws on Neil Young, The Beatles, and the Grateful Dead; they''ve toured in support of Zach Bryan and Noah Kahan. Leon Majcen opens the show.'
where id = '78da2a87-9fb6-4986-bb6b-f320b93c793e';

-- Source: https://en.wikipedia.org/wiki/Bowling_for_Soup
update events set description = 'Bowling for Soup is the Texas pop-punk band behind hits like "1985" and the Grammy-nominated "Girl All the Bad Guys Want," known for humor-laced, high-energy live shows fronted by longtime singer Jaret Reddick.'
where id = '2cd016d9-02a6-4372-9677-68104e504e47';

-- Source: https://www.eventticketscenter.com/expose-detroit-tickets/1439280/e
update events set description = 'Exposé is the freestyle/dance-pop trio known for late-1980s hits "Point of No Return," "Come Go with Me," and the chart-topping ballad "Seasons Change," bringing their signature Miami freestyle sound to an intimate show at Sound Board inside MotorCity Casino Hotel.'
where id = '2d518084-1fde-4344-8ec6-61554ccf9f7b';

-- Source: https://www.axs.com/events/1332675/tucker-wetmore-tickets?skin=masonic
update events set description = 'Tucker Wetmore is a fast-rising country artist best known for his breakout single "Wine Into Whiskey"; this Detroit stop is part of his 2026 headlining Brunette World Tour, with support from Jacob Hackworth.'
where id = '14432fe3-2ba8-47c1-b657-88e44edde417';

-- Source: https://www.majesticdetroit.com/events/detail/bella-kay-the-reckless-tour-1510006
update events set description = 'Bella Kay is an emerging alt-pop artist from Houston who broke out with the viral, streaming-chart hits "The Sick" and "iloveitiloveitiloveit"; she brings her heartache-and-survival songwriting to the Majestic Theatre on her headlining Reckless Tour, with support from Hailey Picardi.'
where id = 'f28191cd-d4fd-4ba2-bc3f-d537df0b8df5';

-- Source: https://www.wxyz.com/homepage-showcase/the-longest-running-annual-play-in-detroit-history-makes-its-return-to-detroits-fisher-theater
update events set description = 'Perilous Times, billed as the longest-running annual play in Detroit history, follows a troubled young Detroiter who is transported to biblical times after a blow to the head, guided by a wisecracking, invisible-to-others angel; the production was written and directed by Detroit native and former DPS teacher TJ Hemphill.'
where id = '7a486ffb-dfcc-40f5-820a-f226699acea5';

-- Source: https://www.ticketweb.com/event/yhwh-nailgun-nudo-tsdmaac-catacombs-tickets/14194514
update events set description = 'YHWH Nailgun is an intense experimental/no-wave-leaning quartet that formed during lockdown as a Philadelphia project before relocating to New York, known for channeling raw, primal energy through vocals, synth, guitar, and drums; they play Detroit''s Catacombs space with opener Nudo.'
where id = 'd292e815-538a-4f9d-a515-2359ee0bcca2';

-- Source: https://www.313presents.com/events/detail/hayley-williams
update events set description = '"The Hayley Williams Show" brings the three-time Grammy-winning Paramore frontwoman to Pine Knob for a set pulling from all three of her solo albums, including her acclaimed Ego Death at a Bachelorette Party, following her sold-out tour of that record; Magdalena Bay and Rico Nasty support.'
where id = 'b31bc7e6-ec1f-405c-96c8-414c05ca4967';

-- Source: https://www.ticketweb.com/event/noah-rinker-district-142-tickets/14255764
update events set description = 'Noah Rinker is an American singer-songwriter, guitarist and pianist who released his debut EP "After Dark" in 2024 and signed with Warner Records, gaining wider recognition through his viral song "Save My Soul."'
where id = 'c8d8865f-33d8-4818-b549-0dae5c3a7bb0';

-- Source: https://www.brooklynvegan.com/loathe-announce-fall-tour-with-fleshwater-prostitute/
update events set description = 'This Royal Oak show is part of Loathe''s fall 2026 North American tour behind their new album "A Stranger to You," the Liverpool metalcore band''s first full-length in six years, blending crushing industrial-tinged hardcore with shoegaze-inflected atmospherics; support comes from Prostitute.'
where id = 'c27f03ab-416f-4f47-b69c-741fcee3ef2c';

-- Source: https://metaladdicts.com/black-flag-announces-extensive-2026-us-tour/
update events set description = 'This is the current touring incarnation of Black Flag, led by founding guitarist Greg Ginn alongside vocalist Max Zanelly, bassist David Rodriguez, and drummer Bryce Weston -- not the band''s classic-era lineup, but the same influential hardcore punk institution behind SST Records, stopping at Token Lounge as part of an extensive fall 2026 US tour.'
where id = '8680fbda-e86f-423b-9867-ebbe43e4fae0';

-- Source: https://www.theemeraldtheatre.com/tm-event/grunge-fest-tributes-to-alice-in-chains-stone-temple-pilots/
update events set description = 'Grunge Fest pairs Hollow (an Alice in Chains tribute act) with Creep (a Stone Temple Pilots tribute act), two long-running tribute bands performing hits and deep cuts from the 90s grunge era.'
where id = '221c6132-da9a-4a90-acef-9aeeb37261d9';

-- Source: https://www.flagstarstrand.com/performancesandevents
update events set description = 'A theater screening of the 1988 comedy classic "Coming to America," directed by John Landis and starring Eddie Murphy as an African prince who travels to Queens, New York in search of a wife who will love him for himself, with Arsenio Hall co-starring in multiple roles.'
where id = '6898f1c3-88d2-4412-a021-c667bf20c68f';

-- Source: https://www.ticketweb.com/event/slothrust-the-velveteers-blind-pig-tickets/14957853
update events set description = 'A co-headlining rock bill pairing Slothrust, the Brooklyn-based trio known for blending grunge and alt-rock with jazz-inflected songwriting, with The Velveteers, a Boulder, Colorado garage-rock act built around Demi Demitro''s guitar/vocals and an unusual dual-drummer lineup, whose records have been produced by The Black Keys'' Dan Auerbach.'
where id = '5d3d0666-aaa9-4c2f-86ec-a8cfaece4999';

-- Source: https://en.wikipedia.org/wiki/Leanne_Morgan
update events set description = 'Leanne Morgan is a Tennessee-based stand-up comedian known for relatable jokes about motherhood, menopause, and Southern life; her Netflix specials "I''m Every Woman" (2023) and "Unspeakable Things" (2025), plus her Netflix sitcom "Leanne," have made her one of the most in-demand touring comedians of the past few years.'
where id = 'c5789202-7d5f-4a49-895d-a3faa70a37cf';

-- Source: https://www.313presents.com/news/detail/ray-lamontagne-celebrates-20th-anniversary-of-seminal-debut-album-trouble-with-tour-coming-to-the-fox-theatre-saturday-september-20-2025
update events set description = 'Ray LaMontagne performs his acclaimed 2004 debut album "Trouble" in full for the first time ever live, marking its 20th anniversary; this Fox Theatre date was originally set for September 2025 but was rescheduled to September 2026 after LaMontagne underwent oral surgery, with The Weather Station opening.'
where id = '51ab235b-9ecc-4602-a339-53b12e29b1b4';

-- Source: https://yard-sale-girls.com/
update events set description = 'Yard Sale Girls is a Brooklyn-based sketch comedy team -- Serah Bennett, Micaela Fagan, Becca Marcus, and Sam Speedy -- known for viral video sketches and a touring live show that has played Netflix Is a Joke Fest, New York Comedy Festival, and SF Sketchfest.'
where id = 'cdf2cea4-4a81-4fa7-9a80-6f572f2f2b67';

-- Source: https://www.royaloakmusictheatre.com/events/detail/1307894
update events set description = 'Leonid & Friends is an 11-piece tribute band celebrated for its note-for-note recreation of the horn-driven sound of Chicago, along with covers of acts like Earth, Wind & Fire and Steely Dan; the group has built a large international following through relentless touring and viral fan videos.'
where id = '6db07f87-ee8c-4069-a745-429141fbfd84';

-- Source: https://www.tokenlounge.com/calendar/
update events set description = 'Carry On is a tribute act dedicated to the music of Crosby, Stills, Nash & Young, performing the folk-rock supergroup''s harmony-driven classics live at The Token Lounge in Westland.'
where id = 'eb682f0f-71f1-4f82-80be-904e0e55576f';

-- Source: https://www.concertaddicts.com/news-articles/tours/pennywise-announce-fall-2026-eastern-north-american-tour
update events set description = 'Pennywise, the influential Southern California melodic hardcore band formed in Hermosa Beach in 1988, opens a new Eastern North American tour at Saint Andrew''s Hall, with support from Angel Du$t, H2O, and Murphy''s Law rounding out a stacked punk bill.'
where id = 'be00e2e0-2d44-403a-9955-a0f544ae3150';

-- Source: https://nysmusic.com/2026/07/15/palestinian-pop-star-saint-levant-announces-afandi-world-tour/
update events set description = 'Saint Levant is a Palestinian pop singer-songwriter known for blending Arabic, English, and French lyrics and for his 2022 viral breakout single "Very Few Friends"; his Afandi World Tour, inspired by 1990s Levantine cabaret culture and modern Arabic pop aesthetics, stops at The Fillmore Detroit.'
where id = '0b01ec8e-2ea7-4583-823c-5aa7e37f6acf';

-- Source: https://www.am800cklw.com/news/tom-jones-returning-to-caesars-windsor/
update events set description = 'Tom Jones, the Welsh vocalist behind classics like "It''s Not Unusual," "Delilah," and "What''s New Pussycat?," brings his Come Gather Round Tour to The Colosseum at Caesars Windsor; over his six-decade career he has sold more than 100 million records.'
where id = '7f26c570-f3fb-45fa-8503-1ce13ca8a34c';

-- Source: https://en.wikipedia.org/wiki/Chinese_Football
update events set description = 'Chinese Football is an indie rock/math rock band from Wuhan, China, formed in 2011 and named after (and musically inspired by) the American emo band American Football; known for their 2015 self-titled debut and 2022''s Win & Lose, they bring their intricate, emo-tinged sound to The Blind Pig.'
where id = '9414f754-df84-4364-951f-31722eda957d';

-- Source: https://en.wikipedia.org/wiki/Weezer
update events set description = 'Weezer bring their 32-city arena tour "The Gathering" to Little Caesars Arena, with the Shins and Silversun Pickups opening. The tour follows a viral resurgence of the band''s 2015 track "Go Away" and leads into their twentieth studio album, previewed by the single "Shine Again."'
where id = '37b2e36e-4862-4c96-9e14-162b07d04c49';

-- Source: https://en.wikipedia.org/wiki/Ilana_Glazer
update events set description = 'Ilana Glazer -- the Emmy- and Tony-nominated comedian, writer, and actor best known for co-creating and starring in Comedy Central''s "Broad City" -- brings her stand-up show to the Fillmore Detroit, following her comedy specials "The Planet Is Burning" (2020) and "Human Magic" (2025).'
where id = '15f691a5-f8ea-48cf-ac91-bc3faad3dcb9';

-- Source: https://en.wikipedia.org/wiki/Disco_Biscuits
update events set description = 'The Disco Biscuits, a Philadelphia jam band formed in 1995 at the University of Pennsylvania, play Saint Andrew''s Hall. Known for pioneering "trance fusion" -- blending live improvisation with trance and electronic textures -- they''ve built one of the most devoted touring fanbases in the jam scene over three decades.'
where id = '4260790d-71df-46a7-816c-c1684c6416ba';

-- Source: https://en.wikipedia.org/wiki/16volt
update events set description = 'This industrial-rock bill at Small''s pairs 16volt -- the band founded by Eric Powell in 1988, whose latest album is "More or Less" (2025) -- with Chicago''s Acumen Nation, active since 1988 and known for touring with acts like KMFDM and Front Line Assembly, plus support from Moon 17.'
where id = 'd3531db3-eb12-47d3-8250-9745645f7d13';

-- Source: https://en.wikipedia.org/wiki/Combichrist
update events set description = 'Combichrist, the aggrotech/industrial project led by Andy LaPlegua since 2003, headlines this industrial bill at TSDMAAC as part of a North American tour cycle building toward their new album "The Venom in the Mouth of God" (due 2026), with support from NYC gothic-industrial act Ludovico Technique, plus Dead Animal Assembly Plant (D.A.A.P.) and ObsElite.'
where id = 'c36e76ad-cbcd-4557-8de0-e0bef78f080f';

-- Source: https://en.wikipedia.org/wiki/Logic_(rapper)
update events set description = 'Rappers Logic and G-Eazy reunite for "The Endless Summer Tour Part II," a sequel to their original 2016 co-headlining trek, playing Pine Knob Music Theatre with support from Juicy J.'
where id = 'ea1dbaa5-db9b-4e65-be55-d12f6f9f4e0e';

-- Source: https://en.wikipedia.org/wiki/Cavetown
update events set description = 'English singer-songwriter Cavetown (Robin Skinner) brings his "Running With Scissors Tour" to the Fillmore Detroit in support of his sixth studio album of the same name, released in January 2026, with support from Chloe Moriondo.'
where id = '974ea0f0-4581-45a8-84c5-16e796dfa84f';

-- Source: https://buffalotrafficjamband.bandcamp.com/album/pictures-of-you
update events set description = 'Buffalo Traffic Jam, an acoustic indie-folk duo from Bozeman, Montana formed by Frankie Cassidy and Nathan Ross, bring their "Pictures of You Tour" -- named for their debut album released in July 2026 -- to Saint Andrew''s Hall.'
where id = '835359b3-1ad0-434f-95ff-7761859aba0b';

-- Source: https://arrowsinaction.com
update events set description = 'Arrows in Action, an alternative-pop/pop-punk band formed in 2017 in Gainesville, Florida and now based in Nashville, play El Club on a tour supporting their deluxe album "I Think I''ve Heard This Before."'
where id = '69f1223c-9eee-4f4a-becf-dabfff43776c';

-- Source: https://musichall.org/shows-events/2026-swan-lake
update events set description = 'World Ballet Company brings its touring production of Tchaikovsky''s "Swan Lake" to the Music Hall Center with live orchestral accompaniment, staging the classic tale of a princess turned into a swan by a sorcerer''s curse.'
where id = '6dbb78b5-0f19-4946-8063-f50466f786e7';

-- Source: https://www.exploreflintandgenesee.org/event/alien-ant-farm-celebrating-25-years-of-anthology/
update events set description = 'Alien Ant Farm, the California rock band best known for their 2001 cover of Michael Jackson''s "Smooth Criminal," play The Machine Shop in Flint as part of a tour celebrating 25 years of their breakout album "ANThology," with support from Scarhaven.'
where id = 'b3574928-bf1f-4a52-9eab-58fae9682dcf';

-- Source: https://www.freep.com/events/1085782/alex-lambert/
update events set description = 'Alex Lambert is a Texas-born soul singer known for his powerful, husky voice, performing at The Loving Touch in Ferndale.'
where id = '5124be5c-cee8-4696-a47a-1f3c7c787390';

-- Source: https://www.313presents.com/news/detail/caamp-brings-2026-headlining-tour-to-meadow-brook-amphitheatre-september-24
update events set description = 'Caamp, the Ohio-formed folk-rock duo of Taylor Meier and Evan Westfall, bring their 2026 headlining tour -- a 19-city run co-produced by FPC Live and Live Nation -- to Meadow Brook Amphitheatre, with special guest Whitney.'
where id = 'bb77b250-07cf-4600-9151-0ffa370f1b5e';

-- Source: https://www.313presents.com/news/detail/cash-money-records-no-limit-records-unite-for-a-first-ever-tour
update events set description = 'The first-ever Cash Money Records & No Limit Records Tour comes to Little Caesars Arena, featuring Birdman, Master P, Juvenile, B.G., Silkk The Shocker, and Mannie Fresh -- a landmark pairing of two of the most influential labels in Southern hip-hop history.'
where id = 'ddae042a-6f24-4c21-ab80-51f633a37dc5';

-- Source: https://concerts.consequence.net/events/esdeekid-at-the-fillmore-detroit-tickets/
update events set description = 'EsDeeKid, a Liverpool rapper known for the viral hits "Phantom" and "LV Sandals" and one of the fastest-rising names in the UK underground rap scene, brings his Council House Rat Tour to The Fillmore Detroit with special guest Rico Ace.'
where id = 'bb8c3e9d-b321-4b6d-bdf9-191ce3762480';

-- Source: https://www.livenation.com/event/public-image-ltd-this-is-not-the-last-tour
update events set description = 'Public Image Ltd, the post-punk band John Lydon formed after the Sex Pistols, bring their "This Is Not The Last Tour" to Saint Andrew''s Hall with support from Plague Vendor.'
where id = '11c1b1d2-abca-41bd-9964-13f9e5889ef0';

-- Duplicate/companion of a19f0480-435f-409c-b9d7-2a260bf7b1dd -- Source: https://www.ticketweb.com/event/laundry-day-presents-the-larger-blind-pig-tickets/14909763
update events set description = 'LAUNDRY DAY, the Toronto-based band/collective, plays Blind Pig in Ann Arbor as part of "LAUNDRY DAY Presents: The Larger Than LIFE Tour," their 2026 North American headlining run.'
where id = '0a3d7dba-1165-42ec-95ae-59882473fb9d';

-- Duplicate/companion of 9295a60b-b2ed-4dd3-8b87-a474a7275c72 -- Source: https://www.313presents.com/news/detail/comedian-jim-gaffigan-brings-his-everything-is-wonderful-tour-to-the-fox-theatre-friday-september-18
update events set description = 'Eight-time Grammy nominee and three-time Emmy winner Jim Gaffigan brings his Everything Is Wonderful! Tour to Detroit''s Fox Theatre, his observational comedy following the 2024 Hulu special The Skinny, which drew nearly 100 million online clip views.'
where id = '07073d39-a952-4234-ac71-cf9950416636';

-- Duplicate/companion of 7a486ffb-dfcc-40f5-820a-f226699acea5 -- Source: https://www.wxyz.com/homepage-showcase/the-longest-running-annual-play-in-detroit-history-makes-its-return-to-detroits-fisher-theater
update events set description = 'Perilous Times, billed as the longest-running annual play in Detroit history, follows a troubled young Detroiter who is transported to biblical times after a blow to the head, guided by a wisecracking, invisible-to-others angel; the production was written and directed by Detroit native and former DPS teacher TJ Hemphill.'
where id = 'bf94e5e7-c2a5-4216-9b43-230acf10b46a';

-- Duplicate/companion of 7a486ffb-dfcc-40f5-820a-f226699acea5 -- Source: https://www.wxyz.com/homepage-showcase/the-longest-running-annual-play-in-detroit-history-makes-its-return-to-detroits-fisher-theater
update events set description = 'Perilous Times, billed as the longest-running annual play in Detroit history, follows a troubled young Detroiter who is transported to biblical times after a blow to the head, guided by a wisecracking, invisible-to-others angel; the production was written and directed by Detroit native and former DPS teacher TJ Hemphill.'
where id = '1d4c59a1-ab09-4878-8be3-fe9c40975c52';

-- Duplicate/companion of 6db07f87-ee8c-4069-a745-429141fbfd84 -- Source: https://www.royaloakmusictheatre.com/events/detail/1307894
update events set description = 'Leonid & Friends is an 11-piece tribute band celebrated for its note-for-note recreation of the horn-driven sound of Chicago, along with covers of acts like Earth, Wind & Fire and Steely Dan; the group has built a large international following through relentless touring and viral fan videos.'
where id = '51199c7b-2d4c-48a5-b252-8c3590674151';

-- Duplicate/companion of f6bf56ec-364d-4519-af58-9dd1877816f6 -- Source: https://www.toledo.com/news/2026/02/24/daily-dose/brooks-dunn-the-bestselling-country-duo-of-all-time-and-most-awarded-artists-in-cma-history-heading-to-the-huntington-center-in-september/
update events set description = 'Brooks & Dunn, the best-selling country duo of all time and one of the most-awarded acts in CMA history, bring their Neon Moon Tour 2026 to Toledo''s Huntington Center. Kix Brooks and Ronnie Dunn have been touring together since the early 1990s behind a catalog of country radio staples.'
where id = '9250d70f-28c9-4838-9e0d-ed522cc04ff9';

-- Duplicate/companion (later performance) of Come From Away -- Source: https://comefromaway.com/about.php
update events set description = 'Come From Away tells the true story of Gander, the small Newfoundland town that took in thousands of stranded airline passengers after the September 11, 2001 attacks; the Tony- and Olivier-winning musical by Irene Sankoff and David Hein runs at the Croswell Opera House for a run of performances September 11–20, 2026.'
where id = '3982238c-a231-4de2-8230-2fb7baaa4650';

-- Duplicate/companion (later performance) of Come From Away -- Source: https://comefromaway.com/about.php
update events set description = 'Come From Away tells the true story of Gander, the small Newfoundland town that took in thousands of stranded airline passengers after the September 11, 2001 attacks; the Tony- and Olivier-winning musical by Irene Sankoff and David Hein runs at the Croswell Opera House for a run of performances September 11–20, 2026.'
where id = 'ce308153-0cec-4e23-84c3-7e1d4237805b';

-- Duplicate/companion (later performance) of Come From Away -- Source: https://comefromaway.com/about.php
update events set description = 'Come From Away tells the true story of Gander, the small Newfoundland town that took in thousands of stranded airline passengers after the September 11, 2001 attacks; the Tony- and Olivier-winning musical by Irene Sankoff and David Hein runs at the Croswell Opera House for a run of performances September 11–20, 2026.'
where id = 'e40e28aa-69d7-48a3-a074-7449bbf6a1f9';

-- Duplicate/companion (later performance) of Come From Away -- Source: https://comefromaway.com/about.php
update events set description = 'Come From Away tells the true story of Gander, the small Newfoundland town that took in thousands of stranded airline passengers after the September 11, 2001 attacks; the Tony- and Olivier-winning musical by Irene Sankoff and David Hein runs at the Croswell Opera House for a run of performances September 11–20, 2026.'
where id = '6d955ec4-3e9b-4e7d-b1d8-dd352eba2fab';

-- Duplicate/companion (later performance) of Come From Away -- Source: https://comefromaway.com/about.php
update events set description = 'Come From Away tells the true story of Gander, the small Newfoundland town that took in thousands of stranded airline passengers after the September 11, 2001 attacks; the Tony- and Olivier-winning musical by Irene Sankoff and David Hein runs at the Croswell Opera House for a run of performances September 11–20, 2026.'
where id = '1716d3de-74e6-4ade-a671-faa9449a0244';

-- Rental/package add-on tied to 9295a60b-b2ed-4dd3-8b87-a474a7275c72 -- Source: https://www.313presents.com/news/detail/comedian-jim-gaffigan-brings-his-everything-is-wonderful-tour-to-the-fox-theatre-friday-september-18
update events set description = 'A rental/package add-on for Jim Gaffigan: Everything Is Wonderful!, rather than a separate performance -- same event, same night.'
where id = 'cca02268-93ee-4e83-afe0-db48115f4db1';

-- Rental/package add-on tied to 7f26c570-f3fb-45fa-8503-1ce13ca8a34c -- Source: https://www.am800cklw.com/news/tom-jones-returning-to-caesars-windsor/
update events set description = 'A rental/package add-on for Tom Jones: Come Gather Round Tour, rather than a separate performance -- same event, same night.'
where id = '7f7d4a19-abb6-4fc0-b27b-1a84d33062b3';
