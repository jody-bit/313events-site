-- 2026-09-05 -- bigger-push batch of researched Ticketmaster descriptions,
-- per Jody's go-ahead to scale up past last night's small trial batch.
-- Same standard as the trial batch: real live web research per event (via
-- parallel research passes, one per sub-batch), original summarized text (not
-- copied verbatim), source cited per statement below. Two candidate events
-- came back with NO usable, verified source and are deliberately left alone
-- rather than guessed at:
--   - caf7df33-d83f-4d7b-9a3c-e2ef235f3ad5 (Best in Grass Michigan Award Show
--     2026, Royal Oak Music Theatre) -- every independent source found lists
--     this on Thu Aug 13, 2026, not the Sept 10, 2026 date on this row.
--   - d9d683da-447c-4076-bdde-501584b329b6 (Monty Python and the Holy Grail,
--     Flagstar Strand Theatre) -- no reliable source found for this specific
--     screening/date.
--
-- Scope was also deliberately narrowed from the full ~900+ Ticketmaster backlog
-- to events with a real, describable identity: touring artists/comedians,
-- named tours, and shows with genuine press/official coverage. Left alone in
-- this pass: sports games (self-explanatory "X vs Y" listings, not normally
-- given narrative descriptions) and small hyperlocal multi-band club bills with
-- no headliner substantial enough to research honestly.

-- Source: https://hoodline.com/2026/09/scarface-too-hort-e-40-headline-return-of-the-legends-at-the-aretha/
update events set description = 'Saturday night of the two-night Return of the Legends hip-hop showcase at the riverfront Aretha Franklin Amphitheatre, featuring Scarface, DJ Quik, and Slim Thug alongside Paul Wall, Devin the Dude, and Lil'' Flip; a different lineup (Too $hort, E-40, 8Ball & MJG, Lady of Rage, and MC Eiht) takes the stage the following night.'
where id = 'c05c8b9d-e405-4a07-bf31-26f2760b8747';

-- Source: https://www.freedomhillamphitheater.com/events/o-a-r-05-september-2026/
update events set description = 'O.A.R. brings its Three Decades Tour to the Michigan Lottery Amphitheatre at Freedom Hill, marking 30 years since the alt-rock band''s founding members began playing together in high school, with support from Gavin DeGraw and KT Tunstall.'
where id = 'def93e7c-8722-4aa8-9f31-76e2855f9339';

-- Source: https://events.sulekha.com/buzz/blog/ranjit-bawa-usa-tour-2026-experience-punjabi-music-across-multiple-cities
update events set description = 'Punjabi singer and actor Ranjit Bawa, known for bhangra and folk hits such as ''Yaari Chandigarh Waliye'' and his award-winning album ''Mitti Da Bawa,'' plays the Music Hall Center as part of his 2026 US tour.'
where id = '535be65b-bb31-4f16-8989-e4ac38501f66';

-- Source: https://post-punk.com/anja-huwe-of-xmal-deutschland-announces-first-north-american-tour-in-40-years/
update events set description = 'Anja Huwe, longtime vocalist of Hamburg post-punk pioneers Xmal Deutschland, plays Small''s on her first North American tour in 40 years, drawing on both the band''s early-1980s 4AD-era catalog and her newer solo material, with Gwendolyn Dot opening.'
where id = 'f7cbd0f1-410a-4b0a-89e4-6e1f3b9b547e';

-- Source: https://ghostcultmag.com/vader-reign-forever-kingdom-of-blood-north-american-tour-2026/
update events set description = 'Polish death metal veterans Vader headline the Reign Forever in Kingdom of Blood tour stop at TSDMAAC''s Catacombs room, backed by fellow death metal acts Jungle Rot, Fleshcrawl, Trash Panda, and Darkeater.'
where id = '3853bedf-9b8f-4085-b637-dd1239a0f3f5';

-- Source: https://en.wikipedia.org/wiki/Anees_(musician)
update events set description = 'Palestinian-American singer-songwriter anees, a former law student turned genre-blending hip-hop/R&B artist best known for his Billboard-charting single ''Sun and Moon,'' performs at Saint Andrew''s Hall.'
where id = 'ea15dea2-9595-4ac4-9a6b-cfa576d7da5b';

-- Source: https://www.313presents.com/news/detail/danny-elfman-fall-tour-2026-at-the-fox-theatre-september-9
update events set description = 'Composer and former Oingo Boingo frontman Danny Elfman brings an all-rock live show to the Fox Theatre in support of a forthcoming new album, mixing that material with songs from his 2021 record ''Big Mess'' and backed by a band featuring guitarists from Nine Inch Nails and Guns N'' Roses.'
where id = '0a4aa62d-3c5e-44a9-9377-6ea5e189639e';

-- Source: https://www.313presents.com/news/detail/pitbull-returns-to-north-america-bigger-than-ever-im-back-tour-featuring-special-guest-lil-jon-at-pine-knob-music-theatre-september-9
update events set description = 'Pitbull''s ''I''m Back'' tour stops at Pine Knob Music Theatre with a set of career-spanning hits, joined by fellow Miami veteran and crunk-movement pioneer Lil Jon as special guest.'
where id = '533eed54-0cd4-4431-afc0-fe136d8edcb2';

-- Source: https://www.nylon.com/entertainment/adela-red-bottoms-tour-dates-tickets
update events set description = 'Rising pop singer ADÉLA, who recently wrapped a supporting slot on Demi Lovato''s tour, headlines Saint Andrew''s Hall on her debut Red Bottoms Tour.'
where id = 'b1c5e721-ced7-419d-9f75-0b91c306d57e';

-- Source: https://www.ticketweb.com/event/monolord-khemmis-blue-snaggletooth-tsdmaac-tickets/14813523
update events set description = 'Swedish stoner-doom trio Monolord, praised by Decibel Magazine for their hypnotic, heavily distorted sound, headlines this all-ages heavy metal bill at TSDMAAC in Detroit, joined by Denver doom band Khemmis and fellow heavy act Blue Snaggletooth.'
where id = 'c93c72fc-0cf5-4bd3-b366-b98aa2983b22';

-- Source: https://www.ticketweb.com/event/magic-bag-presents-american-aquarium-the-magic-bag-tickets/14981393
update events set description = 'Alt-country band American Aquarium plays The Magic Bag in Ferndale in support of their album New Ways to Lose, a Shooter Jennings-produced record marking the band''s 20th year and 4,000th-plus show, with Nathan Evans Fox opening.'
where id = '96cab1b6-9160-4bbe-9cab-88df02407697';

-- Source: https://y969.iheart.com/content/2026-08-28-carly-pearce-unveils-true-self-unlike-ever-before-in-unapologetic-chapter/
update events set description = 'Grammy-winning country singer Carly Pearce brings her intimate "Honest Woman: Up Close" tour to Saint Andrew''s Hall, showcasing her fifth studio album Honest Woman, a 16-track project co-produced with Ben West featuring collaborators Riley Green, Molly Tuttle, and Dan Tyminski, with support from Belle Frantz.'
where id = '0b892ad3-7652-47b0-8a9d-c5f6e8266f59';

-- Source: https://dwele.com/bio-press
update events set description = 'Detroit-born neo-soul and R&B singer-songwriter Dwele, a Grammy nominee who shared in a production win for Kanye West''s Graduation, performs at the Sound Board inside MotorCity Casino Hotel.'
where id = 'bfc077f6-e3e9-4a26-bdce-001ddb282e2f';

-- Source: https://www.313presents.com/news/detail/roxette-announces-40th-anniversary-tour-2026
update events set description = 'Swedish pop duo Roxette''s 40th Anniversary Tour, featuring founder Per Gessle alongside Lena Philipsson performing hits like "The Look" and "Listen to Your Heart," stops at Pine Knob Music Theatre with support from Taylor Dayne, Nick Lowe, and Los Straitjackets.'
where id = '01138673-579e-48d5-b78c-de857efdd18d';

-- Source: https://www.axs.com/events/1358153/nelly-rescheduled-from-71626-tickets
update events set description = 'Rapper Nelly performs at The Colosseum at Caesars Windsor on a date rescheduled from an originally planned July 16, 2026 show.'
where id = '6d828542-2ffb-4b80-b2f4-0180e1bef9cb';

-- Source: https://www.songkick.com/concerts/42739988-elefante-at-harpos-concert-theatre
update events set description = 'Grammy-nominated Mexican rock en español band Elefante, formed in Mexico City in the early 1990s and Latin Grammy-nominated for their 2005 self-titled album, plays a 21+ show at Harpos in Detroit.'
where id = 'acfa6904-f043-41b7-8ec7-a791a690e209';

-- Source: https://www.ticketweb.com/event/magic-bag-presents-damien-jurado-the-magic-bag-tickets/14897063?pl=magicbag
update events set description = 'Singer-songwriter Damien Jurado, marking his 25th year as a recording artist, plays The Magic Bag in support of his 18th album, Reggae Film Star, with St. Yuma opening.'
where id = 'a46ed1f1-9971-4562-a39e-3e30a9d873d8';

-- Source: https://visittoledo.org/event/rodney-carrington
update events set description = 'Comedian and musician Rodney Carrington brings his blend of stand-up storytelling and original comedic songs to the Stranahan Theatre. Carrington built his career on platinum-selling comedy albums, the sitcom Rodney, and film roles including Beer for My Horses.'
where id = 'd1c7e222-a590-44e5-9d41-307bd6d75b19';

-- Source: https://en.wikipedia.org/wiki/Oskar_med_k
update events set description = 'Norwegian electronic producer Oskar Sjåvåg, who performs as oskar med k, plays the Majestic Theatre on his current tour. He broke through with the single "Make Me Feel" and later teamed with Khalid on a remix that appeared on Khalid''s 2025 album After the Sun Goes Down.'
where id = 'ed99ef85-b219-4fba-85ae-b5d4e6912992';

-- Source: https://thefim.org/event/rodneyatkins/
update events set description = 'Country singer Rodney Atkins, known for hits including "Watching You" and "If You''re Going Through Hell," performs at the Capitol Theatre with opening support from the Family Tradition Band. Atkins has notched six number-one country radio singles over a career spanning three decades on the same record label.'
where id = 'b858db13-d2dc-4ee1-8939-a13c8e3b1340';

-- Source: https://www.313presents.com/news/detail/comedian-mojo-brookzz-outta-pocket-comedy-tour-adds-second-show-at-the-fox-theatre-friday-september-11
update events set description = 'Comedian Dyon "Mojo" Brookzz, who broke out on Wild ''N Out and appears in Tyler Perry''s Netflix series Miss Governor, brings his Outta Pocket Comedy Tour to the Fox Theatre, where a second show was added after the original 7 p.m. performance sold out.'
where id = 'dafc06c8-df68-4ec3-b189-cb692a3b389e';

-- Source: https://www.musichall.org/shows-events/russell-peters
update events set description = 'Comedian Russell Peters brings his Relax World Tour, which has played 65 cities across 25 countries since its October 2024 launch, to the Music Hall Center. Peters was the first comedian to headline a Netflix Original Comedy Special (Notorious, 2013) and has been named one of Rolling Stone''s 50 Best Comics of All Time.'
where id = 'd4f7cd06-a2ae-403e-a738-f955a833b7d0';

-- Source: https://windsorite.ca/2026/05/jim-jefferies-heads-to-the-colosseum-stage/
update events set description = 'Australian comedian Jim Jefferies brings his Son of a Carpenter tour to The Colosseum at Caesars Windsor, mixing stories drawn from his father''s carpentry trade with his characteristically unfiltered takes on modern life.'
where id = '475c179e-1762-44e2-8692-d5c774ac32d8';

-- Source: https://blabbermouth.net/news/turnstile-announces-the-never-enough-tour-pt-2-for-september-october-2026
update events set description = 'Hardcore band Turnstile bring their Never Enough Tour Pt. 2, a run marking one year since their Grammy-winning album, to Russell Industrial Center with support from Ceremony, Hitech, and King''s Command. The tour features city-specific lineups and partnerships with local nonprofits at each stop.'
where id = 'fc81a0db-b178-43a9-844a-72725c8c62fa';

-- Source: https://www.313presents.com/events/detail/erykah-badu
update events set description = 'Neo-soul icon Erykah Badu brings her "LIVE" tour to Michigan Lottery Amphitheatre at Freedom Hill, with support from producer The Alchemist and hip-hop pioneers De La Soul. The five-time Grammy winner has spent nearly three decades building a reputation for genre-defying, improvisational live shows.'
where id = 'e50f7784-f11d-4d1c-bb98-d120dd6b2efb';

-- Source: https://www.imperialtheatre.net/show/gerry-dee-funny-you-should-say-that
update events set description = 'Comedian Gerry Dee, star and co-creator of CBC''s Mr. D for eight seasons, brings his "Funny You Should Say That" stand-up show to the Imperial Theatre. Dee currently hosts Family Feud Canada and appears in Fox''s Animal Control, and is the author of the bestselling book Teaching: It''s Harder Than It Looks.'
where id = 'bbc97273-f269-4147-9620-9adbce43de89';

-- Source: https://comefromaway.com/about.php
update events set description = 'Come From Away tells the true story of Gander, the small Newfoundland town that took in thousands of stranded airline passengers after the September 11, 2001 attacks; the Tony- and Olivier-winning musical by Irene Sankoff and David Hein runs at the Croswell Opera House for a run of performances September 11–20, 2026.'
where id = 'ab40f222-3fc1-4601-b294-4f7259f1c0a0';

-- Source: https://www.drumandbassproper.com/in-2026-we-bid-farewell-to-ivy-lab/
update events set description = 'Ivy Lab is the London bass-music project of Sabre and Stray (a trio with Halogenix until his 2018 departure), known since 2012 for blending drum and bass, halftime and hip-hop influences; their 2026 shows, including this Lincoln Factory date, come as part of a run the duo has billed as their farewell tour before ending the project.'
where id = '15bdc0f8-f0bb-4dc7-b71f-bc0a20c3e515';

-- Source: https://www.313presents.com/news/detail/lily-allen-announces-fall-2026-arena-tour-across-north-america-including-the-fox-theatre-saturday-september-12
update events set description = 'On this stop of her Fall 2026 arena tour, British singer Lily Allen performs her album West End Girl in full and in track order at the Fox Theatre, part of what''s billed as her largest headlining run of shows to date.'
where id = 'dc7fa2d9-b66a-4908-8366-bbbf7ec3c90f';

-- Source: https://en.wikipedia.org/wiki/Atsuko_Okatsuka
update events set description = 'Comedian Atsuko Okatsuka, whose 2022 HBO debut special The Intruder was named a best-of-the-year pick by the New York Times and who followed it with the 2025 Hulu special Father, brings her stand-up to the Fillmore Detroit on her Big Bowl Tour.'
where id = 'bdd502f1-8f47-418d-90f5-f7897702e486';

-- Source: https://www.soundboarddetroit.com/eventdetail.aspx?contentid=52722
update events set description = 'Birmingham, Alabama-based comedian and radio host Rickey Smiley, known for his prank-call comedy and for hosting the nationally syndicated Rickey Smiley Morning Show, brings his ADHD Tour Live to the Sound Board at MotorCity Casino Hotel.'
where id = 'e6603555-1844-405f-ba68-eb15e3fe70c5';

-- Source: https://www.hasanhatesronny.com/
update events set description = 'Comedians Hasan Minhaj and Ronny Chieng face off in a one-night, comedic "no-holds-barred" live debate as part of their joint tour Hasan Hates Ronny, Ronny Hates Hasan: A Debate to the Death, which plays theaters and arenas across North America and beyond through early 2027.'
where id = '8cd6b29d-30bf-41df-a8b9-05f931df6008';

-- Source: https://en.wikipedia.org/wiki/The_Weight_of_the_Woods
update events set description = 'Irish singer-songwriter Dermot Kennedy tours behind The Weight of the Woods, his third studio album, released April 3, 2026, which debuted at number one on the UK Albums Chart and made him the first Irish solo artist to top that chart with each of his first three albums.'
where id = '77fd234c-4afb-43dc-90d7-d20737571226';

-- Source: https://us.atgtickets.com/events/napoleon-dynamite-live/fisher-theatre/
update events set description = 'Napoleon Dynamite Live pairs a full screening of the 2004 cult comedy with a live, interactive Q&A, improv and game-show segment featuring original cast members Jon Heder, Jon Gries and Efren Ramirez, marking the film''s 20th anniversary.'
where id = 'e5f6fb73-8e21-4559-a98f-f304b3b79eb9';

-- Source: https://en.wikipedia.org/wiki/Rio_da_Yung_OG
update events set description = 'Rio Da Yung OG, born Da''Mario Horne-McCullough, is a Flint-raised rapper known for raw, unpolished verses and a key voice in Michigan''s street-rap scene alongside mentor Peezy. He returned to touring after being released from federal prison in December 2024, having served time on drug-trafficking charges.'
where id = '80fd9758-7823-4ec4-a116-0bd7a48df0c2';

-- Source: https://visittoledo.org/event/john-crist/
update events set description = 'John Crist is a stand-up comedian and viral sketch creator with more than a billion online video views, known for storytelling-driven bits about relationships and everyday modern life. He tours behind his special "Emotional Support."'
where id = '69199adb-9a2d-4844-8923-5901f079453f';

-- Source: https://consequence.net/2026/07/issa-rae-insecure-the-10th-anniversary-tour/
update events set description = 'Insecure: The 10th Anniversary Tour is a live conversation series, not a screening or concert, in which series creator Issa Rae and showrunner Prentice Penny mark a decade since the HBO comedy''s debut with behind-the-scenes stories; select stops also bring surprise appearances from cast members such as Yvonne Orji, Jay Ellis, or Natasha Rothwell.'
where id = '5311a632-1075-4b4e-9b8a-d2e33025e432';

-- Source: https://www.313presents.com/news/detail/breaking-benjamin-bring-2026-north-american-tour-with-special-guests-chevelle-starset-kami-kehoe-to-pine-knob-music-theatre-september-13
update events set description = 'Breaking Benjamin bring their 2026 North American tour to Pine Knob Music Theatre with support from Chevelle, Starset, and Kami Kehoe.'
where id = 'fcfdd37a-a918-4f0d-9b27-50fcbb9608db';

-- Source: https://blabbermouth.net/news/all-shall-perish-announces-north-american-tour-celebrating-20th-anniversary-of-the-price-of-existence
update events set description = 'All Shall Perish stop in Detroit on a tour marking the 20th anniversary of their 2006 album "The Price of Existence," performing the record in full, including songs the band says they have rarely or never played live before.'
where id = '3a3c5f6b-354e-495b-91ed-b1df9c44b561';

-- Source: https://www.majesticdetroit.com/events/detail/lp-1425378
update events set description = 'LP (Laura Pergolizzi) brings her "All Is Not Lost" tour to the Majestic Theatre; the singer-songwriter has racked up billions of career streams and a devoted fan following built on genre-blending, emotionally direct songwriting.'
where id = '30bbdb73-740f-4652-ac99-e23652316040';

-- Source: https://blabbermouth.net/news/revocation-announces-20-years-of-torment-september-october-2026-north-american-tour
update events set description = 'Revocation''s "20 Years Of Torment" tour marks two decades of the tech-death band, with a set pulling from across their catalog plus material from 2025''s "New Gods, New Masters," joined at The Sanctuary Detroit by Defeated Sanity, Fuming Mouth, and Weeping.'
where id = 'a1bdea64-9731-4091-8a0a-dbc3f15e774d';

-- Source: https://www.tokenlounge.com/tm-event/laith-al-saadi/
update events set description = 'Laith Al-Saadi, an Ann Arbor blues-rock guitarist trained at the University of Michigan School of Music, gained national attention as a Season 10 finalist on NBC''s "The Voice" and has shared stages with Taj Mahal, Buddy Guy, and B.B. King.'
where id = '4312254e-ab4a-44c2-9e1d-f8ddafa77495';

-- Source: https://en.wikipedia.org/wiki/Chief_Keef
update events set description = 'Chief Keef, the Chicago rapper credited with pioneering the drill subgenre via his 2012 breakout "I Don''t Like," plays the Fillmore Detroit; his catalog spans "Love Sosa" and "Finally Rich" through 2024''s "Almighty So 2."'
where id = '43e3e17b-a3a6-46d7-b83b-64ada0945fdc';

-- Source: https://blabbermouth.net/news/ensiferum-announces-september-2026-north-american-tour-with-firewind
update events set description = 'Finnish folk-metal veterans Ensiferum headline a North American tour stop at TSDMAAC in Detroit in support of their 2024 album Winter Storm, joined by Greek power-metal band Firewind — fronted by guitarist Gus G, known for his work with Ozzy Osbourne — plus support act Ardennes.'
where id = '3aa119ba-e6ce-488a-8012-a315f2e4ee42';

-- Source: https://www.313presents.com/news/detail/suicideboys-announce-grey-day-tour-2026-the-indie-rap-titans-return-for-33-date-arena-amphitheatre-run-across-north-america-includes-pine-knob-music-theatre-september-15
update events set description = 'New Orleans hip-hop duo $uicideboy$ bring their annual Grey Day Tour — a 33-date arena and amphitheater run and one of the country''s top-grossing rap tours — to Pine Knob Music Theatre, with support from Destroy Lonely and other guests; $1 from every ticket benefits mental health initiatives through a partnership with PLUS1.'
where id = '0e430bca-54af-4286-84a4-2b536f25ce33';

-- Source: https://sonsoflegion.com/soultosoltourtickets
update events set description = 'Nashville-based act Sons of Legion, whose sound blends rock''s raw energy with blues and soul, bring their Soul to SØL World Tour 2026 to The Fillmore Detroit as part of a run of North American and European dates through the fall.'
where id = 'e8b846ec-0766-4542-8b58-955d08b57cde';

-- Source: https://www.themagicbag.com/concerts-magicbag/fastball-and-spacehog
update events set description = 'Austin alt-rock trio Fastball, best known for the Grammy-nominated hit "The Way" along with "Out of My Head" and "Fire Escape," play The Magic Bag alongside 90s glam-rock band Spacehog, known for their hit "In the Meantime," with doors at 7pm.'
where id = '683351bb-6616-4815-8ff1-77f4d7fcb481';

-- Source: https://www.royaloakmusictheatre.com/events/detail/1304815
update events set description = 'Feminist punk pioneers Bikini Kill, formed in Olympia and Washington, D.C. in 1990 and credited with sparking the Riot Grrrl movement, play Royal Oak Music Theatre as part of their ongoing reunion tour, which since 2019 has paired original members Kathleen Hanna, Tobi Vail, and Kathi Wilcox with Erica Dawn Lyle.'
where id = '956a8c8b-d4c9-42d2-a351-6dd345ae21cb';

-- Source: https://www.bethhart.com/biography-2/
update events set description = 'Grammy-nominated blues-rock singer-songwriter Beth Hart, celebrated for a genre-spanning career and acclaimed collaborations with Joe Bonamassa and Jeff Beck, performs at the Michigan Theater in Ann Arbor.'
where id = 'ae0f8161-da36-4665-86cf-a23b0ddef630';

-- Same show, different date/showtime/listing as a primary row above --
-- reusing that row's researched description rather than re-researching.

-- Duplicate/companion of 96cab1b6-9160-4bbe-9cab-88df02407697 -- Source: https://www.ticketweb.com/event/magic-bag-presents-american-aquarium-the-magic-bag-tickets/14981393
update events set description = 'Alt-country band American Aquarium plays The Magic Bag in Ferndale in support of their album New Ways to Lose, a Shooter Jennings-produced record marking the band''s 20th year and 4,000th-plus show, with Nathan Evans Fox opening.'
where id = '9f5b2c84-a3fa-47c9-bffb-dee108928294';

-- Duplicate/companion of 0b892ad3-7652-47b0-8a9d-c5f6e8266f59 -- Source: https://y969.iheart.com/content/2026-08-28-carly-pearce-unveils-true-self-unlike-ever-before-in-unapologetic-chapter/
update events set description = 'Grammy-winning country singer Carly Pearce brings her intimate "Honest Woman: Up Close" tour to Saint Andrew''s Hall, showcasing her fifth studio album Honest Woman, a 16-track project co-produced with Ben West featuring collaborators Riley Green, Molly Tuttle, and Dan Tyminski, with support from Belle Frantz.'
where id = '8b15d26c-41eb-40d8-ac5d-00d528e126af';

-- Duplicate/companion of dafc06c8-df68-4ec3-b189-cb692a3b389e -- Source: https://www.313presents.com/news/detail/comedian-mojo-brookzz-outta-pocket-comedy-tour-adds-second-show-at-the-fox-theatre-friday-september-11
update events set description = 'Comedian Dyon "Mojo" Brookzz, who broke out on Wild ''N Out and appears in Tyler Perry''s Netflix series Miss Governor, brings his Outta Pocket Comedy Tour to the Fox Theatre, where a second show was added after the original 7 p.m. performance sold out.'
where id = '57e9258d-1947-43de-bfba-427a90381fc1';

-- Duplicate/companion of bbc97273-f269-4147-9620-9adbce43de89 -- Source: https://www.imperialtheatre.net/show/gerry-dee-funny-you-should-say-that
update events set description = 'Comedian Gerry Dee, star and co-creator of CBC''s Mr. D for eight seasons, brings his "Funny You Should Say That" stand-up show to the Imperial Theatre. Dee currently hosts Family Feud Canada and appears in Fox''s Animal Control, and is the author of the bestselling book Teaching: It''s Harder Than It Looks.'
where id = 'd961d8c1-6672-47eb-bc2a-d26e92e4de1b';

-- Duplicate/companion of ab40f222-3fc1-4601-b294-4f7259f1c0a0 -- Source: https://comefromaway.com/about.php
update events set description = 'Come From Away tells the true story of Gander, the small Newfoundland town that took in thousands of stranded airline passengers after the September 11, 2001 attacks; the Tony- and Olivier-winning musical by Irene Sankoff and David Hein runs at the Croswell Opera House for a run of performances September 11–20, 2026.'
where id = 'b660ce47-30f3-4c54-a18a-349e4c92fc47';

-- Duplicate/companion of ab40f222-3fc1-4601-b294-4f7259f1c0a0 -- Source: https://comefromaway.com/about.php
update events set description = 'Come From Away tells the true story of Gander, the small Newfoundland town that took in thousands of stranded airline passengers after the September 11, 2001 attacks; the Tony- and Olivier-winning musical by Irene Sankoff and David Hein runs at the Croswell Opera House for a run of performances September 11–20, 2026.'
where id = 'd9226bb3-560f-41e8-a8c1-2d6d0454a159';

-- Duplicate/companion of ab40f222-3fc1-4601-b294-4f7259f1c0a0 -- Source: https://comefromaway.com/about.php
update events set description = 'Come From Away tells the true story of Gander, the small Newfoundland town that took in thousands of stranded airline passengers after the September 11, 2001 attacks; the Tony- and Olivier-winning musical by Irene Sankoff and David Hein runs at the Croswell Opera House for a run of performances September 11–20, 2026.'
where id = '9f3e0ac1-7223-47ae-be68-882dd2f01e2d';

-- Rental/package listings -- a box/suite/hotel-package add-on tied to a main
-- show above, not a separate performance. Same pattern as the Jill Scott Suite
-- Rental rows from last night's trial batch.

update events set description = 'A rental/package add-on for O.A.R.''s Three Decades Tour show, rather than a separate performance -- same event, same night.'
where id = '73891fac-34f8-4be1-8b5a-63ba8966eed4';

update events set description = 'A rental/package add-on for Danny Elfman''s show, rather than a separate performance -- same event, same night.'
where id = 'ba6d659b-e428-45f4-848a-aaddd0960a88';

update events set description = 'A rental/package add-on for Nelly''s show, rather than a separate performance -- same event, same night.'
where id = '426f6bae-62f6-4927-a004-9cf11f7b60dc';

update events set description = 'A rental/package add-on for Mojo Brookzz''s Outta Pocket Comedy Tour show, rather than a separate performance -- same event, same night.'
where id = '994b3cce-0812-4bd2-9791-2ed5fbd2fa84';

update events set description = 'A rental/package add-on for Jim Jefferies'' Son of a Carpenter show, rather than a separate performance -- same event, same night.'
where id = '3d04e689-34ce-47b2-aed0-fb5bdba100b8';

update events set description = 'A rental/package add-on for Dermot Kennedy''s show, rather than a separate performance -- same event, same night.'
where id = '27bd68c7-a1f5-4470-837a-30a0b3821724';
