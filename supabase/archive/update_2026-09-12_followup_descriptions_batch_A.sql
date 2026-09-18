-- 313.events: Fill missing DESCRIPTIONS for Ticketmaster-sourced events
-- Batch: Phase-1 admin follow-up backlog (799-record PDF), description-only subset
-- Generated: 672 events
-- Each event was researched individually; 'generic' confidence = honest venue/category-based
-- description written when specific facts about the act/show could not be confirmed.

-- Detroit Tigers vs. Colorado Rockies | Comerica Park | 2026-09-12 1:10 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Detroit Tigers take on the Colorado Rockies in this MLB regular-season matchup at Comerica Park, the Tigers'' home ballpark in downtown Detroit.' WHERE id = '60ee4031-ea34-4a53-b943-9a3b2e003fe6';

-- Lily Allen Performs West End Girl | Fox Theatre Detroit | 2026-09-12 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'British singer-songwriter Lily Allen, known for hits like "Smile" and "Not Fair," performs at the Fox Theatre in support of her album West End Girl, blending pop hooks with her signature witty, confessional lyrics.' WHERE id = 'dc7fa2d9-b66a-4908-8366-bbbf7ec3c90f';

-- Atsuko Okatsuka: The Big Bowl Tour | The Fillmore Detroit | 2026-09-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian Atsuko Okatsuka, known for her HBO comedy specials and distinctive bowl-cut bangs, brings her stand-up act to the Fillmore Detroit as part of The Big Bowl Tour.' WHERE id = 'bdd502f1-8f47-418d-90f5-f7897702e486';

-- Rickey Smiley | Sound Board at MotorCity Casino Hotel | 2026-09-12 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian, radio host, and actor Rickey Smiley, known for The Rickey Smiley Morning Show and his family-friendly stand-up, performs live at the Sound Board.' WHERE id = 'e6603555-1844-405f-ba68-eb15e3fe70c5';

-- Michigan Wolverines Football vs. Oklahoma Sooners Football | Michigan Stadium | 2026-09-12 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Michigan Wolverines host the Oklahoma Sooners in a non-conference college football matchup at Michigan Stadium, known as "The Big House," in Ann Arbor.' WHERE id = '48aaa199-3acb-482c-934d-a1191aaf53c3';

-- Hasan Hates Ronny, Ronny Hates Hasan: A Debate To The Death (13+ Event) | Masonic Temple - Detroit | 2026-09-12 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedians Hasan Minhaj and Ronny Chieng bring their joint stand-up tour to the Masonic Temple, staging a comedic "debate to the death" that pits the two friends'' contrasting styles and opinions against each other.' WHERE id = '8cd6b29d-30bf-41df-a8b9-05f931df6008';

-- saint harison presents the ghosted tour | The Shelter | 2026-09-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'R&B and soul artist Saint Harison brings his North American headline run to The Shelter in support of his EP "ghosted," blending soul, indie, and pop influences with introspective songwriting.' WHERE id = '5675dab4-00ec-4d09-ae5d-6d412c679588';

-- Come from Away (Touring) | Croswell Opera House | 2026-09-12 2:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Tony-nominated musical Come From Away tells the true story of Gander, Newfoundland, the small town that welcomed thousands of stranded air travelers after 9/11 grounded flights across North America.' WHERE id = 'b660ce47-30f3-4c54-a18a-349e4c92fc47';

-- Come from Away (Touring) | Croswell Opera House | 2026-09-12 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Tony-nominated musical Come From Away tells the true story of Gander, Newfoundland, the small town that welcomed thousands of stranded air travelers after 9/11 grounded flights across North America.' WHERE id = 'd9226bb3-560f-41e8-a8c1-2d6d0454a159';

-- Dermot Kennedy: The Weight of the Woods Tour | Michigan Lottery Amphitheatre at Freedom Hill | 2026-09-12 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Irish singer-songwriter Dermot Kennedy, known for his emotive folk-pop sound and songs like "Giants" and "Outnumbered," brings The Weight of the Woods Tour to the Michigan Lottery Amphitheatre.' WHERE id = '77fd234c-4afb-43dc-90d7-d20737571226';

-- Napoleon Dynamite | Fisher Theatre - Detroit | 2026-09-12 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Napoleon Dynamite LIVE! pairs a full screening of the 2004 cult-classic comedy with an interactive live show featuring appearances from cast members such as Jon Heder, Jon Gries, and Efren Ramirez in a mix of Q&A, improv, and games.' WHERE id = 'e5f6fb73-8e21-4559-a98f-f304b3b79eb9';

-- Keep Flying wsg Middle - Out + Moronic Device + One Exit Down | Small's | 2026-09-12 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local and regional rock lineup takes the stage at Small''s, headlined by Keep Flying with support from Middle - Out, Moronic Device, and One Exit Down.' WHERE id = 'ad3c9d49-3a01-462a-bea7-961d7a1d0d8a';

-- Dermot Kennedy - Party Box Rental | Michigan Lottery Amphitheatre at Freedom Hill | 2026-09-12 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A premium party box rental package for Dermot Kennedy''s Weight of the Woods Tour stop at the Michigan Lottery Amphitheatre at Freedom Hill, offering a private viewing space for the Irish singer-songwriter''s show.' WHERE id = '27bd68c7-a1f5-4470-837a-30a0b3821724';

-- The Amalgamation Project 4 LIVE wsg School of Rock Ann Arbor House Band | TSDMAAC (Crypt) | 2026-09-12 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live local music showcase featuring The Amalgamation Project alongside the School of Rock Ann Arbor House Band, spotlighting area musicians at the Crypt venue.' WHERE id = 'fc52da76-fc0e-4d84-9621-c1136bf2a065';

-- Magic Bag Presents: Broadzilla 30th Anniversary | The Magic Bag | 2026-09-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Detroit all-female hard rock trio Broadzilla, formed in 1996 and known for opening for acts like Skid Row and Joan Jett, celebrates 30 years together with a hometown show at the Magic Bag.' WHERE id = '9a760758-db5f-42d3-9d02-da16e39b64a3';

-- DON JOVI – The Ultimate Tribute to the Music of Bon Jovi | Emerald Theatre | 2026-09-12 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'DON JOVI delivers a high-energy tribute to the music of Bon Jovi, recreating the rock band''s biggest hits live at the Emerald Theatre.' WHERE id = '8bffaf0a-3ae6-4870-af48-377879a9ffce';

-- Monty Python and the Holy Grail | Flagstar Strand Theatre for the Performing Arts | 2026-09-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A screening of Monty Python and the Holy Grail, the beloved 1975 British comedy classic that reimagines the legend of King Arthur and his knights with absurdist humor.' WHERE id = 'd9d683da-447c-4076-bdde-501584b329b6';

-- USA Hockey National Team Development Program vs. Muskegon Lumberjacks | USA Hockey Arena | 2026-09-12 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'USA Hockey''s National Team Development Program, which trains the country''s top young players in Plymouth, faces the Muskegon Lumberjacks of the USHL in an exhibition matchup at USA Hockey Arena.' WHERE id = '71cb75c8-87b2-4ace-8c00-cd21689905d4';

-- Rio Da Yung OG | The Crofoot Ballroom | 2026-09-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Flint-born rapper Rio Da Yung OG, a key figure in Michigan''s underground street rap scene known for his rapid-fire delivery and mixtapes like From the Auto, performs live at the Crofoot Ballroom.' WHERE id = '80fd9758-7823-4ec4-a116-0bd7a48df0c2';

-- Oakland University Men's Soccer vs. Northern Illinois University Huskies Men's Soccer | Oakland Soccer Field | 2026-09-12 2:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Oakland University''s men''s soccer team hosts Northern Illinois in a collegiate soccer matchup at the Oakland Soccer Field.' WHERE id = '2cacb1ce-9459-4fba-8cbd-a1b7842a1ebf';

-- Oakland University Golden Grizzlies Volleyball vs. Eastern Michigan Eagles Volleyball | OU Credit Union O'rena | 2026-09-12 3:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Oakland University''s Golden Grizzlies volleyball team takes on Eastern Michigan in a collegiate women''s volleyball match at the OU Credit Union O''rena.' WHERE id = '610e7b39-642f-4b26-9307-d9373534d38c';

-- Saddle Up: Maize & Blue | Diamondback Music Hall | 2026-09-12 9:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A country-themed tailgate party tied to the Michigan-Oklahoma football game, featuring line-dancing lessons, a DJ spinning country hits, tailgate games, and a mechanical bull at Diamondback Music Hall.' WHERE id = 'c445e5c7-313d-48c7-817e-5634ce918bfb';

-- WCBN FALL FUNDRAISER , AMERICAN SPIRIT, Carouselle, The Mansion | Blind Pig | 2026-09-12 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A benefit concert for WCBN-FM, the University of Michigan''s independent freeform radio station, featuring local acts American Spirit, Carouselle, and The Mansion at the Blind Pig.' WHERE id = '77ddd6db-b71a-475c-b27d-a10a560a2654';

-- John Crist | Stranahan Theatre | 2026-09-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Stand-up comedian John Crist, known for his viral observational sketches and clean, relatable humor about everyday and faith-based life, performs live at the Stranahan Theatre.' WHERE id = '69199adb-9a2d-4844-8923-5901f079453f';

-- Toledo Rockets Football vs. Central Connecticut St Blue Devils Football | Glass Bowl Stadium | 2026-09-12 Evening | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'The Toledo Rockets host Central Connecticut State in a college football matchup at the Glass Bowl Stadium.' WHERE id = '16b3ac2d-8ffd-4335-85da-27d6be614c29';

-- Detroit Tigers vs. Colorado Rockies | Comerica Park | 2026-09-13 12:10 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Detroit Tigers take on the Colorado Rockies in this MLB regular-season matchup at Comerica Park, the Tigers'' home ballpark in downtown Detroit.' WHERE id = '29d118f6-9d46-41d3-9692-47c1112a8439';

-- Detroit Lions vs. New Orleans Saints | Ford Field | 2026-09-13 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Detroit Lions host the New Orleans Saints in an NFL regular-season matchup at Ford Field.' WHERE id = 'e62e0242-c417-40ed-97a7-4eb8295b308e';

-- Insecure: The 10th Anniversary Tour | The Fillmore Detroit | 2026-09-13 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Issa Rae and Insecure showrunner Prentice Penny bring a live retrospective tour to the Fillmore Detroit, celebrating 10 years of the acclaimed HBO comedy series with conversation and cast reflections.' WHERE id = '5311a632-1075-4b4e-9b8a-d2e33025e432';

-- Breaking Benjamin | Pine Knob Music Theatre | 2026-09-13 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Post-grunge rock band Breaking Benjamin, known for hits like "The Diary of Jane" and "Blow Me Away," performs live at Pine Knob Music Theatre.' WHERE id = 'fcfdd37a-a918-4f0d-9b27-50fcbb9608db';

-- All Shall Perish - The Price Of Existence: 20-Year Anniversary | Saint Andrew's Hall | 2026-09-13 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Deathcore band All Shall Perish marks the 20th anniversary of their album The Price of Existence with a live performance at Saint Andrew''s Hall.' WHERE id = '3a3c5f6b-354e-495b-91ed-b1df9c44b561';

-- LP | Majestic Theatre-MI | 2026-09-13 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Singer-songwriter LP (Laura Pergolizzi), known for her powerhouse voice and hit song "Lost on You," performs live at the Majestic Theatre.' WHERE id = '30bbdb73-740f-4652-ac99-e23652316040';

-- Come from Away (Touring) | Croswell Opera House | 2026-09-13 2:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Tony-nominated musical Come From Away tells the true story of Gander, Newfoundland, the small town that welcomed thousands of stranded air travelers after 9/11 grounded flights across North America.' WHERE id = '9f3e0ac1-7223-47ae-be68-882dd2f01e2d';

-- Cinema Stereo, Suede Brain, The Custodians, Liam Kelly (Solo) | Small's | 2026-09-13 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'An evening of local indie and alternative rock at Small''s, featuring Cinema Stereo, Suede Brain, and The Custodians, plus a solo set from Liam Kelly.' WHERE id = '3569fc83-a3ab-4d16-91c9-55703e4bc234';

-- Revocation (20 Years Of Torment) wsg: Defeated Sanity, Fuming Mouth, Weeping & Nethergate | TSDMAAC | 2026-09-13 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Boston-based technical death metal band Revocation celebrates 20 years as a band, with support from Defeated Sanity, Fuming Mouth, Weeping, and Nethergate at TSDMAAC.' WHERE id = 'a1bdea64-9731-4091-8a0a-dbc3f15e774d';

-- VOID, Phantom, Savetta, Dementia | TSDMAAC | 2026-09-13 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A heavy local metal and hardcore lineup featuring VOID, Phantom, Savetta, and Dementia takes the stage at TSDMAAC.' WHERE id = 'f4c7bb26-c792-400f-99ce-e7eb360bd97d';

-- Somewhere In Detroit and Rise & Shine Lifestyle Present: Erotic Poetry Night | The Magic Bag | 2026-09-13 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Somewhere In Detroit and Rise & Shine Lifestyle present Erotic Poetry Night, an adult-oriented spoken-word showcase at the Magic Bag.' WHERE id = '7aa32aeb-3285-443c-a8af-585d014d54ab';

-- Laith Al-Saadi | The Token Lounge | 2026-09-13 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Michigan blues-rock guitarist and singer Laith Al-Saadi, a Top 4 finalist on NBC''s The Voice, performs live at the Token Lounge.' WHERE id = '4312254e-ab4a-44c2-9e1d-f8ddafa77495';

-- Crowned in Sound | Max M. & Marjorie S. Fisher Music Center | 2026-09-14 6:00 PM–9:00 PM | source: Community Calendar | confidence: generic
UPDATE events SET description = 'Crowned in Sound is a live music event held at the Max M. & Marjorie S. Fisher Music Center, longtime home of the Detroit Symphony Orchestra.' WHERE id = 'c824a728-d59a-4b3f-b264-2f2416db66d5';

-- CHIEF KEEF | The Fillmore Detroit | 2026-09-14 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Chicago rapper Chief Keef, a pioneering figure in drill music known for hits like "I Don''t Like" and "Love Sosa," performs live at the Fillmore Detroit.' WHERE id = '43e3e17b-a3a6-46d7-b83b-64ada0945fdc';

-- Ensiferum, Firewind, Ardennes | TSDMAAC | 2026-09-14 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Finnish folk metal band Ensiferum headlines alongside Greek power metal act Firewind, with support from Ardennes, at TSDMAAC.' WHERE id = '3aa119ba-e6ce-488a-8012-a315f2e4ee42';

-- $uicideboy$ Present Grey Day Tour 2026 W. Destroy Lonely & More | Pine Knob Music Theatre | 2026-09-15 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'New Orleans hip-hop duo $uicideboy$ bring their annual Grey Day Tour to Pine Knob Music Theatre, with support from rapper Destroy Lonely and other guests.' WHERE id = '0e430bca-54af-4286-84a4-2b536f25ce33';

-- Sons of Legion - Soul to SØL World Tour 2026 | The Fillmore Detroit | 2026-09-15 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Nashville-based indie rock and soul band Sons of Legion perform at the Fillmore Detroit as part of their Soul to SØL World Tour.' WHERE id = 'e8b846ec-0766-4542-8b58-955d08b57cde';

-- Magic Bag Presents: Fastball and Spacehog | The Magic Bag | 2026-09-15 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = '''90s alt-rock acts Fastball, known for the hit "The Way," and Spacehog, known for "In the Meantime," share a bill at the Magic Bag.' WHERE id = '683351bb-6616-4815-8ff1-77f4d7fcb481';

-- Bikini Kill | Royal Oak Music Theatre | 2026-09-15 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Riot grrrl pioneers Bikini Kill, fronted by Kathleen Hanna, perform live at the Royal Oak Music Theatre.' WHERE id = '956a8c8b-d4c9-42d2-a351-6dd345ae21cb';

-- Beth Hart | Michigan Theater | 2026-09-15 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Acclaimed American blues-rock singer-songwriter Beth Hart, known for her powerful, emotive vocals, performs live at the Michigan Theater.' WHERE id = 'ae0f8161-da36-4665-86cf-a23b0ddef630';

-- Toledo Mudhens vs. Louisville Bats | Fifth Third Field - Toledo | 2026-09-15 6:35 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Toledo Mud Hens, the Triple-A affiliate of the Detroit Tigers, host the Louisville Bats, affiliate of the Cincinnati Reds, in an International League minor league baseball game.' WHERE id = 'bb10335c-1170-422a-b766-e421ff402895';

-- Global Plague, Death Hex, Convulsis, Tormentous | TSDMAAC (Confessional) | 2026-09-16 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local extreme metal bill featuring Global Plague, Death Hex, Convulsis, and Tormentous at TSDMAAC''s Confessional stage.' WHERE id = '8333015b-f852-4d83-8780-fba2c3a0bcfe';

-- The Nightcrawlers' Teen Art Collective - Stage 13: The Final Cut | Flagstar Strand Theatre for the Performing Arts | 2026-09-16 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'The Nightcrawlers'' Teen Art Collective, a youth performing arts program, presents Stage 13: The Final Cut, a showcase produced and performed by teenage artists at the Flagstar Strand Theatre.' WHERE id = 'b74ef7d6-9918-4dc6-87f1-391e6b7779a6';

-- Toledo Mudhens vs. Louisville Bats | Fifth Third Field - Toledo | 2026-09-16 6:35 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Toledo Mud Hens, the Triple-A affiliate of the Detroit Tigers, host the Louisville Bats, affiliate of the Cincinnati Reds, in an International League minor league baseball game.' WHERE id = '797a3e13-1915-455e-bc24-ef1d5ea2e5c2';

-- Pink Breath of Heaven, Sulk, Bloody Run | TSDMAAC (Confessional) | 2026-09-17 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local alternative and indie rock lineup featuring Pink Breath of Heaven, Sulk, and Bloody Run performs at TSDMAAC''s Confessional stage.' WHERE id = 'd0aec4e6-403a-4fad-8e56-78bc25503829';

-- GAMMACIDE • Zanzibar | The Token Lounge | 2026-09-17 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Gammacide, a veteran Texas thrash metal band rooted in the genre''s 1980s underground scene, brings its heavy, riff-driven sound to the Token Lounge.' WHERE id = '603eccba-176d-4562-97ef-684b64c74e5c';

-- The Nightcrawlers' Teen Art Collective - Stage 13: The Final Cut | Flagstar Strand Theatre for the Performing Arts | 2026-09-17 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'The Nightcrawlers'' Teen Art Collective, a youth performing arts program, presents Stage 13: The Final Cut, a showcase produced and performed by teenage artists at the Flagstar Strand Theatre.' WHERE id = '29ccd9d8-37b4-464a-900e-b8e973cd8dd6';

-- Michigan Wolverines Womens Volleyball vs. Eastern Michigan Eagles Womens Volleyball | Crisler Center | 2026-09-17 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'The Michigan Wolverines women''s volleyball team hosts Eastern Michigan in a collegiate match at Crisler Center.' WHERE id = 'c52768b6-aebf-4db7-936f-ec013523a211';

-- CHECKER, Baits, Brown Sugar, Airplane Weather | Blind Pig | 2026-09-17 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local indie and rock showcase at the Blind Pig featuring CHECKER, Baits, Brown Sugar, and Airplane Weather.' WHERE id = '95e9fa66-2ca9-4dba-a080-1fb7b5579f41';

-- Toledo Mudhens vs. Louisville Bats | Fifth Third Field - Toledo | 2026-09-17 6:35 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Toledo Mud Hens, the Triple-A affiliate of the Detroit Tigers, host the Louisville Bats, affiliate of the Cincinnati Reds, in an International League minor league baseball game.' WHERE id = '1de4299d-df2e-4cd5-8c4a-f49bc621e421';

-- The Firefighters vs. Savannah Party Animals | Comerica Park | 2026-09-18 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Firefighters take on the Savannah Party Animals in a Banana Ball World Tour showcase, the entertainment-driven spinoff baseball league created by the Savannah Bananas, at Comerica Park.' WHERE id = 'd6fdec40-8daf-4b54-99e0-f8c71b93f855';

-- Crown Magnetar, To The Grave, Face Yourself, Backbiter, Neverender | TSDMAAC (Catacombs) | 2026-09-18 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A deathcore and metalcore show at TSDMAAC''s Catacombs stage headlined by Crown Magnetar, a deathcore band with releases including The Codex of Flesh, alongside support acts To The Grave, Face Yourself, Backbiter, and Neverender.' WHERE id = '36d24fa4-8dcc-4b35-b451-6ba07026fd7d';

-- Aggro or Die!, Chumhuffer, Something Bitter | TSDMAAC | 2026-09-18 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live heavy music show at TSDMAAC in Detroit featuring the acts Aggro or Die!, Chumhuffer, and Something Bitter, part of the venue''s regular lineup of touring and local bands.' WHERE id = '0b9b3dcc-35ed-4d13-adf7-151f83ed8cf4';

-- guardin | Pike Room @ The Crofoot | 2026-09-18 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live performance by guardin, an independent musician with music available on Spotify and Apple Music, at the Pike Room inside The Crofoot in Pontiac.' WHERE id = 'bbdfb756-5964-4d5f-b73d-81e99df20940';

-- Oakland University Golden Grizzlies Volleyball vs. Marist Red Foxes Womens Volleyball | OU Credit Union O'rena | 2026-09-18 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An Oakland University Golden Grizzlies women''s volleyball home match against the Marist Red Foxes, played at the OU Credit Union O''rena as part of the college volleyball regular season.' WHERE id = '792e072b-3183-4076-ad5e-058a5fe10869';

-- Line Dance Night Out | Diamondback Music Hall | 2026-09-18 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A country line-dancing social night at Diamondback Music Hall in Belleville, featuring line dance instruction and music for dancers of all skill levels.' WHERE id = 'eb59d618-2506-44d5-b182-cd285b4797e8';

-- Toledo Mudhens vs. Louisville Bats | Fifth Third Field - Toledo | 2026-09-18 7:05 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Minor League Baseball game in the International League between the Toledo Mud Hens, the Detroit Tigers'' Triple-A affiliate, and the Louisville Bats, the Cincinnati Reds'' Triple-A affiliate, at Fifth Third Field in Toledo.' WHERE id = 'c14b4a9a-166a-403f-8528-f8271e61019a';

-- Toledo Rockets Football vs. Temple Owls Football | Glass Bowl Stadium | 2026-09-19 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A college football game between the Toledo Rockets, of the Mid-American Conference, and the Temple Owls, of the American Athletic Conference, played at the Glass Bowl Stadium in Toledo.' WHERE id = '4d209fc3-743f-4757-8b4c-94129301e493';

-- The Firefighters vs. Savannah Party Animals | Comerica Park | 2026-09-19 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Banana Ball exhibition baseball game at Comerica Park featuring the Firefighters and the Savannah Party Animals, two entertainment-focused touring teams from the Savannah Bananas organization known for trick plays and fan interaction.' WHERE id = '690b9f6c-baed-42af-8403-2e6682248f06';

-- Detroit City FC vs. Pittsburgh Riverhounds SC | Keyworth Stadium | 2026-09-19 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A USL Championship soccer match at Keyworth Stadium in Hamtramck between Detroit City FC and the Pittsburgh Riverhounds SC.' WHERE id = 'a87beb83-905d-4995-a7b0-28fa63db3622';

-- Harvest Moon | Music Hall Center | 2026-09-19 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live music performance at the Music Hall Center in Detroit, part of the venue''s touring concert lineup.' WHERE id = '1e7eb6dd-19f0-4967-9de4-be91716687c6';

-- Michigan Wolverines Football vs. UTEP Miners Football | Michigan Stadium | 2026-09-19 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Michigan Wolverines home football game against the UTEP Miners, played at Michigan Stadium in Ann Arbor.' WHERE id = 'c945e5fb-114a-40e0-8a61-d6fae13b1797';

-- Kickstand Productions Presents Improvement Movement - Your Perfect Real LIVE '26 | The Loving Touch | 2026-09-19 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live stage show at The Loving Touch in Ferndale, presented by Kickstand Productions as part of its ''Improvement Movement'' event series.' WHERE id = '3e925f32-255e-43cc-afa0-dff46ba4e931';

-- Magic Bag Presents: ROCKSTAR | The Magic Bag | 2026-09-19 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A classic rock and hair-metal tribute show at The Magic Bag, with performers in costume channeling iconic frontmen such as Freddie Mercury, Axl Rose, and Ozzy Osbourne through renditions of 1970s and ''80s arena rock anthems.' WHERE id = '08688bb0-4c34-429e-b53e-367b6c0e3c18';

-- Oakland University Women's Soccer vs. Cleveland State Women's Soccer | Oakland Soccer Field | 2026-09-19 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An Oakland University Golden Grizzlies women''s soccer home match against Cleveland State, played at the Oakland Soccer Field.' WHERE id = '2dfb203f-5739-4b7a-b2b5-4d1579015d31';

-- Toledo Mudhens vs. Louisville Bats | Fifth Third Field - Toledo | 2026-09-19 5:05 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Minor League Baseball game in the International League between the Toledo Mud Hens, the Detroit Tigers'' Triple-A affiliate, and the Louisville Bats, the Cincinnati Reds'' Triple-A affiliate, at Fifth Third Field in Toledo.' WHERE id = 'd6054bc0-f31b-4738-a139-6bb285609865';

-- Nevertel, Rivals, Ocean Sleeper | TSDMAAC | 2026-09-20 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A metalcore show at TSDMAAC in Detroit headlined by Ocean Sleeper, with support from Nevertel and Rivals.' WHERE id = '24a1c899-e10d-4f2b-a714-d574b60dbde1';

-- Sam Rose Entertainment Presents: Songs & Giggles | The Magic Bag | 2026-09-20 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A family-oriented live entertainment show at The Magic Bag presented by SamRose Entertainment, whose touring lineup of similarly branded shows (including ''Jingle Bell Laughs'') blends music and comedy for family audiences.' WHERE id = 'd5bd641a-891f-4200-bb7e-b217a561b230';

-- Oakland University Golden Grizzlies Volleyball vs. Illinois State Women's Volleyball | OU Credit Union O'rena | 2026-09-20 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An Oakland University Golden Grizzlies women''s volleyball home match against Illinois State, played at the OU Credit Union O''rena.' WHERE id = '4c48fa2d-6504-445a-8d83-918690e2e2ca';

-- Michigan Wolverines Womens Volleyball vs. Cornell Big Red Womens Volleyball | Cliff Keen Arena | 2026-09-20 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Michigan Wolverines women''s volleyball home match against the Cornell Big Red, played at Cliff Keen Arena in Ann Arbor.' WHERE id = '66823a12-b0d8-449a-ad18-9428ad969050';

-- Toledo Mudhens vs. Louisville Bats | Fifth Third Field - Toledo | 2026-09-20 2:05 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Minor League Baseball game in the International League between the Toledo Mud Hens, the Detroit Tigers'' Triple-A affiliate, and the Louisville Bats, the Cincinnati Reds'' Triple-A affiliate, at Fifth Third Field in Toledo.' WHERE id = 'a220dcfe-7018-42e5-8a8e-00fe80c2de68';

-- Detroit Tigers vs. Washington Nationals | Comerica Park | 2026-09-21 6:40 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Detroit Tigers home game against the Washington Nationals at Comerica Park, part of the MLB regular season.' WHERE id = '4bf0fade-215a-4ce0-bf4b-28cb3e1a3c25';

-- The Iron Roses, Rodeo Boys, Grpplng, Versus The City | TSDMAAC | 2026-09-21 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live rock and hardcore show at TSDMAAC in Detroit featuring The Iron Roses, Rodeo Boys, Grpplng, and Versus The City.' WHERE id = 'b4e88916-2954-46d1-b8e1-cf088a1722f3';

-- JMSN | Blind Pig | 2026-09-21 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live performance by JMSN (Christian Berishaj), the Detroit-born R&B and soul singer-songwriter known for his falsetto vocals and albums such as Whatever Makes U Happy, at the Blind Pig in Ann Arbor.' WHERE id = '194ab4c9-5afd-49c1-9251-fda5424086b7';

-- Detroit Tigers vs. Washington Nationals | Comerica Park | 2026-09-22 6:40 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Detroit Tigers home game against the Washington Nationals at Comerica Park, part of the MLB regular season.' WHERE id = '606413b6-97fb-494b-a8cd-40fe27451eab';

-- Soul Exchange, Pure Bliss, World Of Malice, Concrete Teeth, Black Bagged | TSDMAAC | 2026-09-22 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A heavy metal and hardcore show at TSDMAAC in Detroit featuring Soul Exchange, Pure Bliss, World Of Malice, Concrete Teeth, and Black Bagged.' WHERE id = '01d10a55-6aed-4a4e-98e3-80d69d9a019d';

-- Keep for Cheap + Latchkey Kids | Pike Room @ The Crofoot | 2026-09-22 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live indie rock show at the Pike Room inside The Crofoot in Pontiac featuring Keep for Cheap and Latchkey Kids.' WHERE id = '5401e9f4-e18b-4dcb-b1ff-b5074b7624f4';

-- Detroit Tigers vs. Washington Nationals | Comerica Park | 2026-09-23 1:10 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Detroit Tigers home day game against the Washington Nationals at Comerica Park, part of the MLB regular season.' WHERE id = '57571269-0c30-4b8a-8f87-8d81c0771e0f';

-- Truck Violence | TSDMAAC (Crypt) | 2026-09-23 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live performance by Truck Violence, a Montreal band that fuses hardcore punk with folk influences on their debut album Violence, at TSDMAAC''s Crypt stage in Detroit.' WHERE id = 'af14dff3-9c68-4de8-a76e-02b5920f3f83';

-- Ecosystem, OMO, Bileebob, deastro, kenjiro, charles trees | Blind Pig | 2026-09-23 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A multi-act indie and electronic show at the Blind Pig in Ann Arbor featuring Ecosystem, OMO, Bileebob, deastro (the Michigan-based indie electronic project of Randolph Chabot), kenjiro, and charles trees.' WHERE id = '51678fb9-d4c4-4b04-bc4d-2c409ad93775';

-- Detroit Red Wings vs. Buffalo Sabres | Little Caesars Arena | 2026-09-24 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Detroit Red Wings home game against the Buffalo Sabres at Little Caesars Arena, part of the NHL regular season.' WHERE id = '8b7e11de-e24b-4ba2-b0bb-c55b9c62b5d0';

-- Riot Course, The Standby, Daybreaker, Feign | Small's | 2026-09-24 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live punk and hardcore show at Small''s in Hamtramck featuring Riot Course, The Standby, Daybreaker, and Feign.' WHERE id = 'fbb61ae0-93d7-4292-9a02-1b4de1432218';

-- Cheerleader Roadkill, Diva Bleach, The Jewelry, Something Missing | TSDMAAC | 2026-09-24 6:30 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live rock show at TSDMAAC in Detroit featuring Cheerleader Roadkill, Diva Bleach, The Jewelry, and Something Missing.' WHERE id = '1f303eeb-e6bb-42bb-83c2-46b5ac212c1c';

-- Volcandra, Graveripper, Snugglebunzzz, BlackCloud | TSDMAAC | 2026-09-24 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A heavy metal show at TSDMAAC in Detroit featuring Volcandra, Graveripper, Snugglebunzzz, and BlackCloud.' WHERE id = 'cb0bad57-7727-4294-b244-bec6ba9a55de';

-- my salamander, TOADALLY, Stephen Lubera, petalwave | Blind Pig | 2026-09-24 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live indie rock show at the Blind Pig in Ann Arbor featuring my salamander, TOADALLY, Stephen Lubera, and petalwave.' WHERE id = 'e488f92c-1b9d-4f27-963f-7bb423ec7d9e';

-- Detroit Tigers vs. Pittsburgh Pirates | Comerica Park | 2026-09-25 6:40 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Detroit Tigers home game against the Pittsburgh Pirates at Comerica Park, part of the MLB regular season.' WHERE id = 'f13b89e2-ab75-498d-9266-1413259db0c0';

-- Night of Knockouts XLIII | Sound Board at MotorCity Casino Hotel | 2026-09-25 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Night of Knockouts XLIII, the latest installment of a long-running regional professional boxing and kickboxing card, held at Sound Board at MotorCity Casino Hotel in Detroit.' WHERE id = '85007d81-cf40-4753-a38b-2b9a22fdbd7b';

-- Warren Zeiders | El Club | 2026-09-25 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live performance by Warren Zeiders, a country singer-songwriter known for hit singles including ''Ride the Lightning'' and ''Pretty Little Poison,'' at El Club in Detroit.' WHERE id = 'f0907190-96d3-4ad8-b883-ef67fdc1fcf5';

-- World Ballet Company: Swan Lake with LIVE Orchestra | Music Hall Center | 2026-09-25 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A performance of Tchaikovsky''s classic ballet Swan Lake by the World Ballet Company, accompanied by a live orchestra, at the Music Hall Center in Detroit.' WHERE id = '9d944dcc-429c-42ca-8202-f1e4ac11a39f';

-- The Garden | Russell Industrial Center | 2026-09-25 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live performance by The Garden, the genre-blending punk/rock duo of twin brothers Wyatt and Fletcher Shears, at the Russell Industrial Center in Detroit.' WHERE id = '3638c1ef-e97f-4de5-9dfb-4b08efe61a5a';

-- Aries Spears | Capitol Theatre - MI | 2026-09-25 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stand-up comedy show by Aries Spears, the comedian and impressionist best known for his work on MADtv, at the Capitol Theatre in Flint, Michigan.' WHERE id = '54f5f130-8ca8-461c-a18e-ff28605138d2';

-- Brother Bird, OK Cowgirl, Josie Palmer | TSDMAAC | 2026-09-25 6:30 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live indie folk and rock show at TSDMAAC in Detroit featuring Brother Bird, OK Cowgirl, and Josie Palmer.' WHERE id = '0bd7ba39-6212-4038-a7f2-d6a941df219e';

-- House of Heavy | The Loving Touch | 2026-09-25 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'House of Heavy, a touring nu-metal, alt-metal, and metalcore concert night bringing high-energy sets across those genres to fans of heavier music, at The Loving Touch in Ferndale.' WHERE id = 'cb6f302d-c0c4-499c-ab51-369448de4403';

-- Magic Bag Presents: Start Making Sense: A Talking Heads Tribute | The Magic Bag | 2026-09-25 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Start Making Sense, a tribute band recreating the songs and stage energy of new wave pioneers Talking Heads, performing at The Magic Bag in Ferndale.' WHERE id = 'ece677f4-59aa-450f-a588-5b79b65349c3';

-- STRANGELOVE - The Depeche Mode Experience wsg Atomic Beat (Blondie Tribute) | District 142 | 2026-09-25 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A tribute concert at District 142 featuring STRANGELOVE, a Depeche Mode tribute act, with support from Atomic Beat, a Blondie tribute band.' WHERE id = '146fac79-be89-4965-ac1e-61a6955206c1';

-- Unforgettable Fire | Andiamo Celebrity Showroom | 2026-09-25 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A performance by Unforgettable Fire, a touring tribute band recreating the music and stage show of U2, at the Andiamo Celebrity Showroom in Warren.' WHERE id = '6b676f46-bfad-4e5a-a999-4501e0ed6772';

-- Joe Pug w/ Willie Watson | Ark | 2026-09-25 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A folk and Americana concert at The Ark in Ann Arbor featuring singer-songwriter Joe Pug alongside Willie Watson, a founding member of Old Crow Medicine Show.' WHERE id = '0ba03fb2-f572-4eb9-9965-0152a080e5f8';

-- USED CARS - A Tribute to the CARS, HYNDE SIGHT - Tribute to The Pretenders | The Token Lounge | 2026-09-25 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A double tribute bill at The Token Lounge in Westland featuring USED CARS, paying homage to new wave band The Cars, and HYNDE SIGHT, a tribute to The Pretenders.' WHERE id = '518e4df0-d30a-44c2-ab93-56e8a3bea26e';

-- An Evening With Celtic Thunder | Flagstar Strand Theatre for the Performing Arts | 2026-09-25 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Celtic Thunder, the Irish vocal group known for blending traditional Irish music with contemporary pop and musical-theater style arrangements, at the Flagstar Strand Theatre for the Performing Arts in Pontiac.' WHERE id = '56cfbb06-52ae-4828-b5dc-8c1c3b3900af';

-- Material Girls: Tributes to Madonna, Cher, Blondie, Heart, Adele, Shania & Lady Gaga | Emerald Theatre | 2026-09-25 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Material Girls, a multi-artist tribute revue performing the hits of Madonna, Cher, Blondie, Heart, Adele, Shania Twain, and Lady Gaga, at the Emerald Theatre in Mount Clemens.' WHERE id = '4400aa80-aeb4-43e6-a26a-5527d4c3e7b9';

-- DYING FETUS & SANGUISUGABOGG | The Crofoot Ballroom | 2026-09-25 5:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A death metal concert at The Crofoot Ballroom in Pontiac co-headlined by Dying Fetus, a long-running brutal death metal band from Maryland, and Sanguisugabogg, an Ohio deathgrind act known for aggressive breakdowns.' WHERE id = '19193684-1975-42bd-a8fe-d939e213ecf6';

-- Country Jam w/ Ryan Jay | Diamondback Music Hall | 2026-09-25 9:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A country music show at Diamondback Music Hall in Belleville headlined by Ryan Jay, a Metro Detroit country singer-songwriter known for personal, storytelling-driven original songs.' WHERE id = '619bf0fa-22bc-4259-a3f7-4f711c9dcb70';

-- Michigan Wolverines Womens Volleyball vs. Penn State Nittany Lions Womens Volleyball | Crisler Center | 2026-09-25 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Michigan Wolverines women''s volleyball home match against the Penn State Nittany Lions, played at Crisler Center in Ann Arbor.' WHERE id = '9b3cc64a-0bc5-4403-bc5f-7b3ff1de752c';

-- Detroit Red Wings vs. Columbus Blue Jackets | Little Caesars Arena | 2026-09-26 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Detroit Red Wings home game against the Columbus Blue Jackets at Little Caesars Arena, part of the NHL regular season.' WHERE id = '3e2a873f-e3f0-4be8-8a74-073d8e9e84fc';

-- Detroit Tigers vs. Pittsburgh Pirates | Comerica Park | 2026-09-26 1:10 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Detroit Tigers home day game against the Pittsburgh Pirates at Comerica Park, part of the MLB regular season.' WHERE id = '7e40fcac-46e5-4667-90fb-b320c3df055b';

-- Bowling Green Falcons Football vs. South Florida Bulls Football | Doyt Perry Stadium | 2026-09-26 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A college football game between the Bowling Green Falcons, of the Mid-American Conference, and the South Florida Bulls, of the American Athletic Conference, played at Doyt Perry Stadium in Bowling Green, Ohio.' WHERE id = 'b5dcbc29-dfd3-4d57-82a1-8816b25547ce';

-- Michigan Wolverines Football vs. Iowa Hawkeyes Football | Michigan Stadium | 2026-09-26 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Big Ten college football game between the Michigan Wolverines and the Iowa Hawkeyes, played at Michigan Stadium in Ann Arbor.' WHERE id = '9a615610-b09a-4a20-bff7-4c3177624127';

-- Detroit City FC vs. Colorado Springs Switchbacks FC | Keyworth Stadium | 2026-09-26 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A USL Championship soccer match as Detroit City FC hosts the Colorado Springs Switchbacks FC at Keyworth Stadium in Hamtramck, part of DCFC''s regular season.' WHERE id = '6d24e38a-f32e-4c4e-86e8-4b89c36a2666';

-- Shouldered, Shobijin, A Grim Existence, Sabu | TSDMAAC | 2026-09-26 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A night of underground heavy music at TSDMAAC (Sanctuary Detroit), the city''s all-ages DIY venue, featuring a multi-band bill with Shouldered, Shobijin, A Grim Existence, and Sabu.' WHERE id = 'b3b0cf36-4c51-4511-8301-ff6b29855f55';

-- Magic Bag Presents: MEGA 80s | The Magic Bag | 2026-09-26 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'An 80s-themed dance and cover show at The Magic Bag in Ferndale, part of the venue''s recurring MEGA 80s party celebrating the decade''s biggest hits.' WHERE id = '73cf6d10-3060-41e4-bb53-263a80849ee8';

-- America Tribute-cat Stevens Tribute | Andiamo Celebrity Showroom | 2026-09-26 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'An evening of tribute performances at Andiamo Celebrity Showroom honoring two soft-rock acts: the band America, known for ''A Horse with No Name'' and ''Ventura Highway,'' and singer-songwriter Cat Stevens.' WHERE id = '6841c6b2-1e2f-44ce-ab22-aa6afdf19118';

-- FOX N' VEAD wsg Rob Langdon | District 142 | 2026-09-26 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Fox N'' Vead, an alternative rock band from Concord, North Carolina that blends grunge riffs with country- and blues-tinged melodies, performs at District 142 with support from Rob Langdon.' WHERE id = '1b24d973-4e65-4b30-8143-183a4f2b7dc0';

-- Lexie Blue / Mandalyn & The Hunters / Gina & Johnny | The Token Lounge | 2026-09-26 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live music bill at The Token Lounge headlined by Lexie Blue, a Michigan-based blues-and-soul singer, alongside Mandalyn & The Hunters and Gina & Johnny.' WHERE id = '0aa79c80-1fbf-440f-befd-82a43b89e1fc';

-- JCW Presents: Lunacy Live | Diamondback Music Hall | 2026-09-26 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live professional wrestling event from Juggalo Championship Wrestling (JCW), the promotion tied to Psychopathic Records and Insane Clown Posse, staged at Diamondback Music Hall.' WHERE id = '0859f67c-01a9-4484-9cf9-afc37c801afe';

-- Oakland University Men's Soccer vs. Indiana University Men's Soccer | Oakland Soccer Field | 2026-09-26 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A men''s college soccer match as the Oakland University Golden Grizzlies host Indiana University at Oakland''s Soccer Field in Rochester, Michigan.' WHERE id = '96b0f3f9-092c-4398-9d08-d61a5e5809b0';

-- Eastern Michigan Eagles Football vs. Lindenwood Lions Football | Rynearson Stadium | 2026-09-26 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A college football game as the Eastern Michigan Eagles host the Lindenwood Lions at Rynearson Stadium in Ypsilanti, Michigan.' WHERE id = 'e94044c1-0098-45ff-aa12-3fc2d1df2cbd';

-- Toledo Rockets Football vs. San Diego State Aztecs Football | Glass Bowl Stadium | 2026-09-26 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A college football matchup as the Toledo Rockets host the San Diego State Aztecs at the Glass Bowl in Toledo, Ohio.' WHERE id = '72a6290f-0de6-401a-b53d-c4f02d5dc2ba';

-- Detroit Lions vs. New York Jets | Ford Field | 2026-09-27 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An NFL regular-season game as the Detroit Lions host the New York Jets at Ford Field in downtown Detroit.' WHERE id = '535276bb-7a6e-45ad-82e2-49e63cd44417';

-- Detroit Tigers vs. Pittsburgh Pirates | Comerica Park | 2026-09-27 3:10 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An MLB regular-season game as the Detroit Tigers host the Pittsburgh Pirates at Comerica Park in downtown Detroit.' WHERE id = '38ceecfc-f056-4850-be22-b3197bdd460b';

-- IWAN, Sapona, Ciao | TSDMAAC | 2026-09-27 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local/independent music showcase at TSDMAAC (Sanctuary Detroit), the city''s all-ages DIY venue, featuring IWAN, Sapona, and Ciao on one bill.' WHERE id = '5f49a487-bd83-4e64-ae40-4538e037b395';

-- Michigan Wolverines Womens Volleyball vs. Washington Huskies Womens Volleyball | Crisler Center | 2026-09-27 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Big Ten women''s volleyball match as the Michigan Wolverines host the Washington Huskies at Crisler Center in Ann Arbor.' WHERE id = '79314057-e704-4155-a527-2f2bedf38b52';

-- Blind Pig Comedy | Blind Pig | 2026-09-28 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A stand-up comedy night at the Blind Pig in Ann Arbor, part of the historic venue''s regular comedy programming featuring touring and local comedians.' WHERE id = 'bb7a2caf-323f-4e04-9568-f5962e94331a';

-- Unpopular Opinion Night (21+) | Saint Andrew's Hall | 2026-09-30 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A 21-and-over live show at Saint Andrew''s Hall in Detroit built around audience-driven ''unpopular opinion'' segments, blending comedic banter with crowd participation.' WHERE id = '653e53dd-0cdd-4039-bf98-13a2eb2a8699';

-- She's Green, Witches Exist, Smush | TSDMAAC (Crypt) | 2026-10-01 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'An underground rock/metal bill in the Crypt space at TSDMAAC in Detroit, featuring She''s Green, Witches Exist, and Smush.' WHERE id = '7109d372-caa4-41f6-b264-40e182983518';

-- Oakland University Women's Soccer vs. Youngstown State Women's Soccer | Oakland Soccer Field | 2026-10-01 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A women''s college soccer match as the Oakland University Golden Grizzlies host Youngstown State at Oakland''s Soccer Field in Rochester, Michigan.' WHERE id = 'a8614b98-bf6f-4f98-a6cf-f69ae072b3b2';

-- Detroit Red Wings vs. New York Rangers | Little Caesars Arena | 2026-10-02 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An NHL regular-season game as the Detroit Red Wings host the New York Rangers at Little Caesars Arena.' WHERE id = '3f099190-ed54-44a8-982c-b139b479f6cd';

-- 156/Silence, Aviana, Heavensgate, Fromjoy | TSDMAAC | 2026-10-02 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A metalcore/heavy music bill at TSDMAAC headlined by 156/Silence, an atmospheric metalcore band out of the Pittsburgh area, alongside Aviana, Heavensgate, and Fromjoy.' WHERE id = '9fb48ea6-9b35-47c3-95ab-f1b05fe9803b';

-- Audrey Ray, Taylor Walls, Julian Joel | The Loving Touch | 2026-10-02 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live music bill at The Loving Touch headlined by Audrey Ray, a rising Nashville-based singer-songwriter, with support from Taylor Walls and Julian Joel.' WHERE id = 'a12dbbb2-8bef-4007-9324-35c89f0a33a0';

-- Magic Bag Presents: 80s vs 90s - The Sqaure Pegz vs CLASS | The Magic Bag | 2026-10-02 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A themed cover-band showdown at The Magic Bag in Ferndale, pitting The Sqaure Pegz (playing 80s hits) against CLASS (playing 90s hits) in a decade-vs-decade dance party.' WHERE id = '6596f4d8-ca63-4387-b5b6-92237a41f296';

-- Mick Blankenship | Birthday Bash | W/ Tight Like That • Days of Disaster • Hamshackle | The Token Lounge | 2026-10-02 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A birthday-show bill at The Token Lounge headlined by Mick Blankenship, an independent hard rock artist blending metal and grunge influences, with support from Tight Like That, Days of Disaster, and Hamshackle.' WHERE id = 'f2605810-55ef-4c3a-8361-a441bc90e871';

-- Oakland University Golden Grizzlies Volleyball vs. Wright State University Volleyball | OU Credit Union O'rena | 2026-10-02 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Horizon League women''s volleyball match as the Oakland University Golden Grizzlies host Wright State at the OU Credit Union O''rena in Rochester, Michigan.' WHERE id = '124379ac-764f-435d-82d5-66b5b019dd10';

-- Saddle Up Dance Party (Pitbull Night) | Diamondback Music Hall | 2026-10-02 9:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A themed dance party night at Diamondback Music Hall, part of the venue''s recurring Saddle Up Dance Party series.' WHERE id = '888e27a0-5779-4a51-be5e-261bc500b280';

-- Phoebe Bridgers: The Lost Tour | Little Caesars Arena | 2026-10-03 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Indie singer-songwriter Phoebe Bridgers brings her 2026 arena run, The Lost Tour, to Little Caesars Arena, showcasing her introspective folk-rock songwriting.' WHERE id = 'b5cacb83-9b8c-4b51-8a24-2be0efd895d7';

-- Mrs Doubtfire | Fox Theatre Detroit | 2026-10-03 1:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The touring Broadway musical Mrs. Doubtfire, based on the 1993 film, brings its comedic story of a father who disguises himself as a British nanny to reconnect with his kids to the Fox Theatre Detroit.' WHERE id = '10dd84a5-b17d-4760-a603-8028cfbfe0c5';

-- Mrs Doubtfire | Fox Theatre Detroit | 2026-10-03 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The touring Broadway musical Mrs. Doubtfire, based on the 1993 film, brings its comedic story of a father who disguises himself as a British nanny to reconnect with his kids to the Fox Theatre Detroit.' WHERE id = 'de6c7d01-fb1f-4412-b732-1e7b6ff75d60';

-- Mrs. Doubtfire - Suite Rental | Fox Theatre Detroit | 2026-10-03 1:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Premium suite seating for the touring Broadway musical Mrs. Doubtfire at the Fox Theatre Detroit, based on the 1993 film about a father who poses as a nanny to stay close to his children.' WHERE id = 'b7130385-d050-457f-aca8-8f259c6ee42f';

-- Mrs. Doubtfire - Suite Rental | Fox Theatre Detroit | 2026-10-03 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Premium suite seating for the touring Broadway musical Mrs. Doubtfire at the Fox Theatre Detroit, based on the 1993 film about a father who poses as a nanny to stay close to his children.' WHERE id = '1cb5784d-dbb1-46d8-ba0e-b2c8098a771e';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-03 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring circus known for African-diaspora-inspired acrobatics, comedy, and live music, performs under its big top near the Aretha Franklin Amphitheatre in Detroit.' WHERE id = '1b2a9c0b-5d05-4b07-976b-dd06bd9c3efe';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-03 3:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring circus known for African-diaspora-inspired acrobatics, comedy, and live music, performs under its big top near the Aretha Franklin Amphitheatre in Detroit.' WHERE id = 'b49664da-7cf1-4e8a-bdb0-4baffe34ce51';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-03 12:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring circus known for African-diaspora-inspired acrobatics, comedy, and live music, performs under its big top near the Aretha Franklin Amphitheatre in Detroit.' WHERE id = '297556ab-87e4-477c-a47e-02d78bc27337';

-- SEX PISTOLS (Steve Jones, Paul Cook, Glen Matlock) feat. Frank Carter | The Fillmore Detroit | 2026-10-03 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Original Sex Pistols members Steve Jones, Paul Cook, and Glen Matlock reunite on stage with Frank Carter (Frank Carter and the Rattlesnakes) on vocals for a night of classic British punk at The Fillmore Detroit.' WHERE id = '7dd61462-349e-4499-b953-5b9b10415226';

-- Electric Feels: Indie Rock + Electronic Dance Party (18+) | Saint Andrew's Hall | 2026-10-03 9:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A themed 18-and-over dance party at Saint Andrew''s Hall combining indie rock and electronic dance music, with DJ sets spanning both genres for a late-night crowd.' WHERE id = '3fc559e0-d432-4c60-8bda-e060749bf587';

-- The Spinners | Andiamo Celebrity Showroom | 2026-10-03 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Spinners, the Detroit-rooted R&B vocal group behind hits like ''I''ll Be Around'' and ''The Rubberband Man,'' perform at Andiamo Celebrity Showroom.' WHERE id = '0f2e8465-0f95-4d03-9600-836beb952672';

-- Dan + Shay: The Young Tour | Pine Knob Music Theatre | 2026-10-03 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country duo Dan + Shay bring their 2026 arena tour, The Young Tour, to Pine Knob Music Theatre, performing hits from their Grammy-winning catalog.' WHERE id = '2841edd6-dda2-4863-9d1e-d44ba0580ba0';

-- MrBallen | Jack White Theatre at the Masonic Temple - Detroit | 2026-10-03 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'MrBallen, the former Navy SEAL turned YouTuber and podcaster known for his ''Strange, Dark, and Mysterious'' true-crime and horror storytelling, brings a live show to the Jack White Theatre at the Masonic Temple.' WHERE id = '964304c6-d018-42cb-8cba-8110d701e756';

-- Steve Lacy: Oh yeah? Tour | Michigan Lottery Amphitheatre at Freedom Hill | 2026-10-03 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Grammy-winning musician Steve Lacy, known for his work with The Internet and solo hits like ''Bad Habit,'' performs on his 2026 ''Oh Yeah?'' tour at Michigan Lottery Amphitheatre at Freedom Hill.' WHERE id = 'c578fa4c-fab8-4acf-8cb8-986166b9771b';

-- Bowling Green Falcons Hockey vs. Michigan Wolverines Hockey | Slater Family Ice Arena | 2026-10-03 6:07 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A college hockey game as the Bowling Green Falcons face the Michigan Wolverines at Slater Family Ice Arena.' WHERE id = '0b58f68f-81ad-4870-9bb1-83b66fe73738';

-- Benjamin Tod | Majestic Theatre-MI | 2026-10-03 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Benjamin Tod, frontman of Lost Dog Street Band known for raw, busking-rooted Americana and folk songwriting, performs at the Majestic Theatre in Detroit.' WHERE id = '6123c8d0-6c63-479d-9113-5a5c5bb30c71';

-- Detroit City FC vs. Birmingham Legion FC | Keyworth Stadium | 2026-10-03 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A USL Championship soccer match as Detroit City FC hosts Birmingham Legion FC at Keyworth Stadium in Hamtramck.' WHERE id = 'dd387be0-e978-42c5-8416-1258660cc764';

-- Sanctuary Fight Club! (Live Pro Wrestling) | TSDMAAC | 2026-10-03 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live independent professional wrestling event, Sanctuary Fight Club, staged at TSDMAAC (Sanctuary Detroit), the city''s all-ages DIY venue.' WHERE id = 'fe13c61a-9d48-41e3-93a4-baa9f9290db5';

-- Bayonne | The Loving Touch | 2026-10-03 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Bayonne, the Austin-based project of songwriter Roger Sellers known for layered, loop-driven electronic-pop, performs at The Loving Touch on the ''Filters'' Tour.' WHERE id = 'bc8b3e65-8dd0-43b1-b403-718543472c18';

-- Kickstand Productions Presents Bayonne - The 'Filters' Tour | The Loving Touch | 2026-10-03 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Bayonne, the Austin-based project of songwriter Roger Sellers known for layered, loop-driven electronic-pop, brings his ''Filters'' Tour to The Loving Touch.' WHERE id = '99797a7d-eb94-44c6-b84f-8de2c9845898';

-- Magic Bag Presents: Android Paranoid - A Tribute To Radiohead | The Magic Bag | 2026-10-03 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Android Paranoid, a tribute band dedicated to Radiohead''s catalog, performs the British band''s alternative rock and electronic classics at The Magic Bag in Ferndale.' WHERE id = 'cbcfc5e7-db0a-4858-8e57-54d48376baea';

-- AFROMAN wsg Luniz | District 142 | 2026-10-03 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Rapper Afroman, known for the stoner-rap hit ''Because I Got High,'' performs at District 142 with support from Luniz, the Oakland hip-hop duo behind ''I Got 5 On It.''' WHERE id = '9f484bbe-03ed-4f34-b404-bbbc191cee6f';

-- Akaash Singh | Royal Oak Music Theatre | 2026-10-03 8:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Stand-up comedian Akaash Singh, co-host of the popular ''Flagrant'' podcast, brings his stand-up act to Royal Oak Music Theatre.' WHERE id = 'd893b2ea-4b80-4179-b2af-4b8ef49ce14d';

-- Akaash Singh | Royal Oak Music Theatre | 2026-10-03 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Stand-up comedian Akaash Singh, co-host of the popular ''Flagrant'' podcast, brings his stand-up act to Royal Oak Music Theatre.' WHERE id = '01425b17-8347-499c-8744-8c492f888bdb';

-- Paula Poundstone | Flagstar Strand Theatre for the Performing Arts | 2026-10-03 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Veteran stand-up comedian Paula Poundstone, a longtime panelist on NPR''s ''Wait Wait... Don''t Tell Me!'', performs her observational comedy at the Flagstar Strand Theatre for the Performing Arts.' WHERE id = '8bc4b1c5-ece2-4797-88b1-e58ee0feebd2';

-- USA Hockey National Team Development Program vs. Boston College Eagles Hockey | USA Hockey Arena | 2026-10-03 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An exhibition hockey game as the USA Hockey National Team Development Program''s junior squad faces the Boston College Eagles at USA Hockey Arena in Plymouth, Michigan.' WHERE id = 'cc474712-2104-49b1-b46a-433725d63754';

-- Oakland University Golden Grizzlies Volleyball vs. Northern Kentucky Women's Volleyball | OU Credit Union O'rena | 2026-10-03 4:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Horizon League women''s volleyball match as the Oakland University Golden Grizzlies host Northern Kentucky at the OU Credit Union O''rena.' WHERE id = 'ad5af573-7181-4b39-bfef-24b0430c9bc7';

-- gnash | Blind Pig | 2026-10-03 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Singer-songwriter gnash, best known for the platinum hit ''i hate u, i love u,'' performs at Blind Pig in Ann Arbor.' WHERE id = '7d5b0b64-fdc2-4408-aa98-35c2b3012678';

-- Christmas Stampede | Huntington Center | 2026-10-03 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live event called Christmas Stampede at the Huntington Center in Toledo; the arena regularly hosts bull-riding and rodeo-style competitions, and this show follows in that vein.' WHERE id = '54ed82c4-21af-49ec-8408-5c8f659d9685';

-- Jesse McCartney | Capitol Theatre - MI | 2026-10-03 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Pop singer Jesse McCartney, known for hits like ''Beautiful Soul'' and ''Leavin'','' performs at the Capitol Theatre in Michigan.' WHERE id = '9722c86b-c8e3-45d1-9828-27d835ec202e';

-- Fall Frenzy | Fox Theatre Detroit | 2026-10-04 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A hip-hop concert at Fox Theatre Detroit presented by 313 Presents, featuring Yung Miami, BossMan Dlow, DaBaby, and Rio Da Yung OG.' WHERE id = 'e6d8a288-e31b-4219-a73d-050de13e4454';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-04 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring big-top circus celebrating African American and multicultural culture, brings acrobats, aerialists, comedians, and live music to Detroit for a family-friendly show.' WHERE id = '813d4e83-fe56-4f5d-a53c-534a64b25975';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-04 12:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring big-top circus celebrating African American and multicultural culture, brings acrobats, aerialists, comedians, and live music to Detroit for a family-friendly show.' WHERE id = 'b6905ad0-1e78-485b-aba5-b00f607ece48';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-04 3:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring big-top circus celebrating African American and multicultural culture, brings acrobats, aerialists, comedians, and live music to Detroit for a family-friendly show.' WHERE id = 'a624f684-7ac0-4de0-badd-ce908956b8d2';

-- Two Door Cinema Club - Tourist History 15th Anniversary Tour | The Fillmore Detroit | 2026-10-04 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Northern Irish indie rock band Two Door Cinema Club perform their acclaimed 2010 debut album ''Tourist History'' in full at The Fillmore Detroit to mark its 15th anniversary.' WHERE id = 'b3f3314e-77ee-4568-9452-bc7eea944f0d';

-- Detroit Red Wings vs. Winnipeg Jets | Little Caesars Arena | 2026-10-04 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Detroit Red Wings host the Winnipeg Jets in NHL regular-season action at Little Caesars Arena, downtown Detroit''s home for hockey.' WHERE id = '94099462-6f6b-4052-bc7c-4045bea87d13';

-- Grief Sucks: A One Man Show By KevOnStage (16+) | Saint Andrew's Hall | 2026-10-04 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian and actor KevOnStage (Kevin Fredericks), known for his viral sketches and podcasts, brings his one-man show ''Grief Sucks,'' a candid, comedic reflection on loss and grief, to Saint Andrew''s Hall.' WHERE id = '4a0ee57b-7089-46a0-afe6-13c3e2c56a93';

-- Grief Sucks: A One Man Show By KevOnStage | Saint Andrew's Hall | 2026-10-04 4:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian and actor KevOnStage (Kevin Fredericks), known for his viral sketches and podcasts, brings his one-man show ''Grief Sucks,'' a candid, comedic reflection on loss and grief, to Saint Andrew''s Hall.' WHERE id = '51f290e3-36ff-4cd9-b50f-cc67add2a290';

-- Mark Farner's American Band | Sound Board at MotorCity Casino Hotel | 2026-10-04 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Mark Farner, founding guitarist and vocalist of Grand Funk Railroad, performs classic rock hits with his own American Band at Sound Board inside MotorCity Casino Hotel.' WHERE id = '24dc21f8-9ce3-4914-9ca7-bd14508d6e44';

-- Olivia O'Brien | El Club | 2026-10-04 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Pop singer-songwriter Olivia O''Brien, known for hits like ''Josslyn'' and ''i hate u, i love u,'' performs live at El Club.' WHERE id = '6bd91590-926d-4a8e-a6ae-8d15be7e42aa';

-- Joe Cocker A celebration of the music | The Token Lounge | 2026-10-04 5:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A tribute concert celebrating the music and legacy of late rock and soul singer Joe Cocker, known for hits like ''You Are So Beautiful'' and his Woodstock performance of ''With a Little Help from My Friends,'' at The Token Lounge.' WHERE id = '85383570-46ac-4d00-b967-92324b736572';

-- Oakland University Women's Soccer | Oakland Soccer Field | 2026-10-04 1:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Oakland University''s women''s soccer team takes the field for a home match at Oakland Soccer Field on the school''s Rochester, Michigan campus.' WHERE id = 'ced92182-9473-4af4-b13c-ade3fa608524';

-- Detroit Pistons v Phoenix Suns (Preseason) | Little Caesars Arena | 2026-10-05 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Detroit Pistons face the Phoenix Suns in an NBA preseason exhibition game at Little Caesars Arena.' WHERE id = 'bd1e61dc-0435-4e9a-b06d-64f1642a5527';

-- Brand New - Suite Rental | Fox Theatre Detroit | 2026-10-05 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A suite ticket package for Brand New''s concert at Fox Theatre Detroit; the influential emo/alternative rock band, known for albums like ''Deja Entendu'' and ''The Devil and God Are Raging Inside Me,'' performs live.' WHERE id = 'b34871eb-01d1-4755-bb86-8fe81ed3ad0e';

-- Dan and Phil | Fisher Theatre - Detroit | 2026-10-05 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'British YouTubers and comedy duo Dan Howell and Phil Lester (Dan and Phil) bring their ''Hard Launch'' world tour, mixing live comedy and audience interaction, to the Fisher Theatre.' WHERE id = 'ce1fa580-851e-4f5a-ab3b-02424c5f8f06';

-- Bright Eyes | Majestic Theatre-MI | 2026-10-05 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Indie folk-rock band Bright Eyes, led by singer-songwriter Conor Oberst, performs live at the Majestic Theatre.' WHERE id = '6682cc85-145e-4116-b3e4-c5c42aeaaca4';

-- Amélie Farren, Lilith Max, Rabbitology - The Three Wishes Tour | Blind Pig | 2026-10-05 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A touring package show, ''The Three Wishes Tour,'' bringing indie/alternative singer-songwriters Amélie Farren, Lilith Max, and Rabbitology together for a night of music at the Blind Pig.' WHERE id = 'a0c133fd-6c35-4c6a-b24f-5bc802615a55';

-- Brand New | Fox Theatre Detroit | 2026-10-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Influential emo/alternative rock band Brand New, known for albums like ''Deja Entendu'' and ''The Devil and God Are Raging Inside Me,'' performs live at Fox Theatre Detroit.' WHERE id = '11805363-645b-47d9-81a9-83d15a9f0e90';

-- Dr. Neil deGrasse Tyson-An Astrophysicist Goes to the Movies - Part II | The Fillmore Detroit | 2026-10-06 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Astrophysicist and science communicator Neil deGrasse Tyson returns with ''An Astrophysicist Goes to the Movies – Part II,'' a live talk breaking down the science (and science fiction) in popular films.' WHERE id = '8e0031d7-fa7e-4206-8a5a-ad12b357a90e';

-- GLAIVE - GOD SAVE THE THREE TOUR | Saint Andrew's Hall | 2026-10-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Genre-blending artist glaive, known for mixing emo, pop-punk, and hyperpop-influenced production, brings his ''God Save the Three'' tour to Saint Andrew''s Hall.' WHERE id = '357598e1-99a7-4eef-a237-959851f4c9ad';

-- Detroit Red Wings vs. Ottawa Senators | Little Caesars Arena | 2026-10-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Detroit Red Wings host the Ottawa Senators in NHL regular-season action at Little Caesars Arena.' WHERE id = '5b5d9567-aaf1-4ea0-b6fa-67f928158262';

-- Gregory Alan Isakov | Masonic Temple - Detroit | 2026-10-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Folk singer-songwriter Gregory Alan Isakov, known for his atmospheric, nature-inspired Americana sound, performs at the Masonic Temple Theatre.' WHERE id = '44247d9a-f0e0-488d-b4d2-53c1d7791e58';

-- The Dread Crew Of Oddwood, Wisher, Plethora | TSDMAAC (Crypt) | 2026-10-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Nashville pirate-metal band The Dread Crew of Oddwood, known for their swashbuckling costumes and nautical-themed heavy music, headlines at TSDMAAC''s Crypt with support from Wisher and Plethora.' WHERE id = 'f5ae6579-5c31-444f-9f4c-c995a6a7202d';

-- Best in Grass Michigan Award Show 2026 | Royal Oak Music Theatre | 2026-10-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Best in Grass Michigan is a cannabis-industry awards show held at Royal Oak Music Theatre, where Michigan consumers help judge and honor top local cannabis products and brands.' WHERE id = 'e5072c9f-41d0-45bd-96d8-6cedbde4dce5';

-- Magic Bag Presents: Silverada | The Magic Bag | 2026-10-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Silverada, the Austin, Texas neotraditional country band formerly known as Mike and the Moonpies, performs at The Magic Bag.' WHERE id = '341cb2dc-bef3-455f-9c75-c1b3b9de8e38';

-- Kennedy Ryon: The Can We Evolve? Tour | Pike Room @ The Crofoot | 2026-10-06 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Singer-songwriter Kennedy Ryon brings ''The Can We Evolve? Tour'' to the Pike Room at The Crofoot for an evening of live original music.' WHERE id = '6df1bb2c-8b11-4b80-8145-05e36b279119';

-- Congress The Band- SOLD OUT | Blind Pig | 2026-10-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Congress The Band, an alt-rock act known for songs like ''Wasted While I''m Young,'' plays a sold-out show at the Blind Pig.' WHERE id = '5b58833e-73ba-41ff-a467-afad8cd938d3';

-- Gorillaz - The Mountain Tour | Little Caesars Arena | 2026-10-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Virtual band Gorillaz, the animated project led by Damon Albarn and Jamie Hewlett blending alt-rock, hip-hop, and electronic music, brings ''The Mountain Tour'' to Little Caesars Arena.' WHERE id = '61c04843-07b0-44c5-bcfa-a7574fa1706c';

-- Sawyer Hill - Everybody's Home, Nobody's Happy World Tour | Saint Andrew's Hall | 2026-10-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Rising artist Sawyer Hill, who has toured arenas supporting Yungblud, brings his ''Everybody''s Home, Nobody''s Happy'' world tour, in support of his 2026 debut album of the same name, to Saint Andrew''s Hall.' WHERE id = 'a6be80d2-ee43-42d5-a523-053993ebdec1';

-- Kowloon Walled City, Great Falls, Pillar of Light | TSDMAAC | 2026-10-07 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'San Francisco sludge/noise rock band Kowloon Walled City headlines a heavy music bill with experimental acts Great Falls and Pillar of Light at TSDMAAC.' WHERE id = '4efbac7d-1f74-422a-a126-9d22a593aa45';

-- Kickstand Productions Presents Joon | The Loving Touch | 2026-10-07 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live music performance by the artist Joon at The Loving Touch, presented by Kickstand Productions.' WHERE id = 'ce73faa8-e7b4-40a0-bbd0-a9da94fd9aa3';

-- Michael Franti | District 142 | 2026-10-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Michael Franti, frontman of Michael Franti & Spearhead, known for uplifting reggae-rock anthems like ''Sound of Sunshine'' and his message of positivity and activism, performs live at District 142.' WHERE id = '56336599-474f-44d0-8605-584c5baea2ac';

-- MICHAEL FRANTI TRIO wsg Wheeland Brothers (acoustic) | District 142 | 2026-10-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Michael Franti performs an intimate acoustic trio set at District 142, with support from the Wheeland Brothers.' WHERE id = 'c45dcb89-b160-4e4b-a393-d395dd9d9a68';

-- Too Hot For Leather, Kazha | The Token Lounge | 2026-10-07 6:30 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Too Hot For Leather brings a high-energy night of glam-rock and hair-metal-style showmanship to the Token Lounge, with support from Kazha.' WHERE id = 'be6889cd-d3e9-4f98-8e9c-3441c416e2cf';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-07 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Meadow Brook Theatre presents a stage adaptation of ''The Man Who Shot Liberty Valance,'' the classic Western tale of law, honor, and legend on the frontier famously brought to film with John Wayne and Jimmy Stewart.' WHERE id = '577d8e46-e519-47e5-a796-5fe6c4ee159b';

-- Oakland University Men's Soccer vs. University of Wisconsin Green Bay - Men's Soccer | Oakland Soccer Field | 2026-10-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Oakland University''s men''s soccer team takes on the University of Wisconsin-Green Bay in a Horizon League matchup at Oakland Soccer Field.' WHERE id = '13b916af-8a91-4c8e-b841-d634bc1416c4';

-- Congress The Band | Blind Pig | 2026-10-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Congress The Band, an alt-rock act known for songs like ''Wasted While I''m Young,'' performs live at the Blind Pig.' WHERE id = '69139dab-9f49-4737-962e-a8424f9f7fb3';

-- Sugar w/ J. Robbins | Jack White Theatre at the Masonic Temple - Detroit | 2026-10-08 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Bob Mould''s influential 1990s alternative rock band Sugar reunites for a world tour, performing at the Jack White Theatre with support from J. Robbins of Jawbox.' WHERE id = 'b45c4f89-3afd-4c33-9598-ac26b26706a3';

-- Undertale - The Determination Symphony World Tour | Fox Theatre Detroit | 2026-10-08 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live symphony orchestra performs the acclaimed score from Toby Fox''s video game ''Undertale,'' as part of ''The Determination Symphony'' world tour, at Fox Theatre Detroit.' WHERE id = 'c8c8bda0-c621-4636-bb34-62321354af25';

-- Undertale Symphony - Suite Rental | Fox Theatre Detroit | 2026-10-08 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A suite ticket package for the ''Undertale'' symphony concert at Fox Theatre Detroit, where a live orchestra performs music from Toby Fox''s acclaimed video game.' WHERE id = '8fcb591a-1ea6-4fe1-80a3-eff7411748a0';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-08 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring big-top circus celebrating African American and multicultural culture, brings acrobats, aerialists, comedians, and live music to Detroit for a family-friendly show.' WHERE id = '4c8f001c-9c5a-4b4a-b22d-df2e082a4391';

-- Switchfoot with special guest Anberlin - Forever Now Tour | The Fillmore Detroit | 2026-10-08 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Alt-rock band Switchfoot, known for hits like ''Meant to Live'' and ''Dare You to Move,'' co-headlines the ''Forever Now Tour'' with fellow rock act Anberlin at The Fillmore Detroit.' WHERE id = '38d0deb6-bf45-4e68-8d88-a9d39aca7161';

-- Whiskey Myers w/ The Ransom Brothers | Caesars Ticket + Hotel Packages | The Colosseum at Caesars Windsor | 2026-10-08 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Texas southern rock band Whiskey Myers performs at The Colosseum at Caesars Windsor with support from The Ransom Brothers; this listing includes a Caesars ticket and hotel package.' WHERE id = '2e5852e5-49d5-44cc-9e62-b77be6ee9fac';

-- Whiskey Myers Live w/ The Ransom Brothers | The Colosseum at Caesars Windsor | 2026-10-08 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Texas southern rock band Whiskey Myers, known for songs like ''Stone'' and ''Deep Down in the South,'' performs live at The Colosseum at Caesars Windsor with support from The Ransom Brothers.' WHERE id = '51c374f2-e17b-4bfb-9f5e-1c5e7f22cadc';

-- Vidura Bandara Rajapaksa: The Paradise Gothic Tour | Saint Andrew's Hall | 2026-10-08 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian Vidura Bandara Rajapaksa brings his stand-up comedy special ''The Paradise Gothic Tour'' to Saint Andrew''s Hall.' WHERE id = '026635c8-880d-4294-904f-4bcc7c8f32b7';

-- The Rocky Horror Picture Show feat. Nell Campbell | Fisher Theatre - Detroit | 2026-10-08 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live celebration of the cult classic ''The Rocky Horror Picture Show,'' featuring an in-person appearance by original film cast member Nell Campbell (Columbia), at the Fisher Theatre.' WHERE id = 'fe2f6fc6-8a28-45b0-8b6d-095b31ad7c1d';

-- Daikaiju at Smalls | Small's | 2026-10-08 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Alabama instrumental surf-rock band Daikaiju, known for performing in elaborate monster costumes, brings their high-energy show to Small''s.' WHERE id = 'd81bae32-be8a-4ccd-b734-55cbe19b8899';

-- INOHA, Capital Soiree, Pretoria | TSDMAAC | 2026-10-08 6:30 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A multi-band lineup featuring touring acts INOHA, Capital Soiree, and Pretoria performing live at TSDMAAC.' WHERE id = 'f82a2c39-2f73-404a-93ac-2011e33cd7ac';

-- Magic Bag Presents: Stanley Simmons | The Magic Bag | 2026-10-08 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Stanley Simmons, a new rock band featuring the sons of KISS members Paul Stanley and Gene Simmons, plays The Magic Bag as part of their first-ever U.S. tour following their 2026 debut album.' WHERE id = '078e0343-e959-4642-b91f-4d2bb43d901c';

-- Robin Trower | Royal Oak Music Theatre | 2026-10-08 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'British blues-rock guitarist Robin Trower, a former Procol Harum member best known for his 1974 album ''Bridge of Sighs,'' performs at the Royal Oak Music Theatre.' WHERE id = '4af5f031-d80b-49a5-a992-b8c48824e72a';

-- The American Ride - Toby Keith Tribute | Andiamo Celebrity Showroom | 2026-10-08 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = '''The American Ride'' is a tribute show celebrating the music and career of country star Toby Keith, performing his hits at the Andiamo Celebrity Showroom.' WHERE id = '7f976287-d0fe-45a7-8e14-6416b081656d';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-08 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Meadow Brook Theatre presents a stage adaptation of ''The Man Who Shot Liberty Valance,'' the classic Western tale of law, honor, and legend on the frontier famously brought to film with John Wayne and Jimmy Stewart.' WHERE id = '5874bbff-ab6b-4f96-b6a5-187989854483';

-- The Thorn | Fox Theatre Detroit | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = '''The Thorn'' is a large-scale theatrical and musical dramatization of the story of Jesus''s Passion, staged with elaborate rock-concert-style production at Fox Theatre Detroit.' WHERE id = '6fcbf3c1-f59b-4f0d-828f-5f0eab39867f';

-- The Thorn - Suite Rental | Fox Theatre Detroit | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A suite ticket package for ''The Thorn'' at Fox Theatre Detroit, a large-scale theatrical and musical dramatization of the story of Jesus''s Passion staged with rock-concert-style production.' WHERE id = '28825066-9ed5-4ffa-adb7-3973ebc75e85';

-- Detroit Red Wings vs. Seattle Kraken | Little Caesars Arena | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Detroit Red Wings host the Seattle Kraken in NHL regular-season action at Little Caesars Arena, downtown Detroit''s home for hockey.' WHERE id = '245112b3-6a7f-41c0-a76d-0dd9f68482ca';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring big-top circus celebrating African American and multicultural culture, brings acrobats, aerialists, comedians, and live music to Detroit for a family-friendly show.' WHERE id = 'ce82e655-8553-4d8b-9d5e-1bf2dc8b4609';

-- Rhythm Corps | Saint Andrew's Hall | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Rhythm Corps, the 1980s band best remembered for their college-radio and MTV-era hit ''Common Ground,'' performs at Saint Andrew''s Hall.' WHERE id = 'b28f2937-675e-4270-b734-7521f1560ed2';

-- Chris Tucker | Sound Board at MotorCity Casino Hotel | 2026-10-09 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Stand-up comedy from Chris Tucker, the actor and comedian known for the Rush Hour film franchise and Friday, performing at the Sound Board inside MotorCity Casino Hotel.' WHERE id = '5c11b6ff-e6af-4c70-8ebb-d295ac1a76ac';

-- Interpol | Jack White Theatre at the Masonic Temple - Detroit | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Interpol, the New York post-punk/indie rock band known for albums like Turn On the Bright Lights and songs such as ''Evil,'' performing at the Jack White Theatre inside Detroit''s Masonic Temple.' WHERE id = '82724226-0057-441c-a58b-9b0a02056a0f';

-- Herman's Hermits | Andiamo Celebrity Showroom | 2026-10-09 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Herman''s Hermits, the 1960s British Invasion band behind hits like ''Mrs. Brown You''ve Got a Lovely Daughter'' and ''I''m Into Something Good,'' bring their classic oldies show to the Andiamo Celebrity Showroom.' WHERE id = '7a591a70-d41b-4a9e-9656-3a94a7852453';

-- Jed Harrelson | TSDMAAC | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Nashville-based soul and blues singer Jed Harrelson brings his fusion of soul, R&B, blues, and jazz to TSDMAAC in Detroit as part of his ongoing national tour.' WHERE id = '7e3cbcf7-4f70-434d-bd33-7902a4f8cc96';

-- Upon Your Dead Body, When The Sun Sets, Rematch, Saving Throw | TSDMAAC | 2026-10-09 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A multi-band metal and hardcore lineup featuring Upon Your Dead Body, When The Sun Sets, Rematch, and Saving Throw performing live at TSDMAAC in Detroit.' WHERE id = 'e10284ff-3d52-42b1-8a32-211c7a1e5c9a';

-- Armand Hammer , Quelle Chris | The Loving Touch | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A hip-hop double bill featuring Armand Hammer, the acclaimed underground duo of billy woods and ELUCID known for dense, experimental lyricism, alongside Detroit-based rapper-producer Quelle Chris, at The Loving Touch.' WHERE id = 'd1953470-90a5-485a-8a1c-dd45823beedb';

-- Magic Bag Presents: First To Eleven | The Magic Bag | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'First to Eleven, the band that built a following with acoustic covers and original songs on YouTube and livestreams, performs live at The Magic Bag in Ferndale.' WHERE id = '7ad1f850-4c9c-48ad-9791-833690aa37b5';

-- BON JOURNEYED | District 142 | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Bon Journeyed, a tribute act blending the songs of Bon Jovi and Journey into one show, performs a mix of both bands'' classic rock hits live at District 142 in Wyandotte.' WHERE id = 'a95b4a0d-f9f9-4c5d-9153-d0281d4f0123';

-- 12 STONES • Stonelore • Days of Disaster • Resurrection Story • Duke Charelle • Memento Mori | The Token Lounge | 2026-10-09 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A hard rock bill headlined by 12 Stones, the Louisiana band known for radio hits like ''Broken'' and ''World So Cold,'' with support from Stonelore, Days of Disaster, Resurrection Story, Duke Charelle, and Memento Mori at The Token Lounge.' WHERE id = 'f7e2a52e-69e9-4530-b414-b8299b17f1a6';

-- THE RUSH EXPERIENCE | Emerald Theatre | 2026-10-09 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Rush Experience, a tribute act recreating the sound and stage show of progressive rock legends Rush, performs at the Emerald Theatre in Mount Clemens.' WHERE id = '29044680-6601-4f8f-a30a-dfda4e77d475';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-09 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Meadow Brook Theatre stages The Man Who Shot Liberty Valance, Jethro Compton''s stage adaptation of Dorothy M. Johnson''s Western short story about a young idealist confronting a ruthless outlaw in a lawless frontier town.' WHERE id = '8bddf4e1-153f-45ce-bde2-b72fa315eae1';

-- USA Hockey National Team Development Program vs. Tri-City Storm | USA Hockey Arena | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The USA Hockey National Team Development Program faces the Tri-City Storm in a USHL junior hockey matchup at USA Hockey Arena in Plymouth, Michigan.' WHERE id = 'bebff2fc-55b7-4eb5-8d47-bbc4db8aa393';

-- Oakland University Golden Grizzlies Volleyball vs. Indiana University Women's Volleyball | OU Credit Union O'rena | 2026-10-09 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Oakland University''s Golden Grizzlies volleyball team takes on Indiana University''s Hoosiers in a collegiate women''s volleyball match at the OU Credit Union O''rena.' WHERE id = '1fa6b74b-cc9b-4cf4-9f32-8f93f2f74ac2';

-- Anthony Jeselnik: Wrath of Man | Michigan Theater | 2026-10-09 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Stand-up comedian Anthony Jeselnik, known for his dark, deadpan one-liner style and Comedy Central specials, brings his ''Wrath of Man'' tour to the Michigan Theater in Ann Arbor.' WHERE id = '3e171d5b-f0ee-4b8c-8d37-90ecb55bc1a8';

-- Samara Joy (Age Recommendation 12 and Over) | Hill Auditorium | 2026-10-09 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Samara Joy, the Grammy-winning jazz vocalist celebrated for her rich contralto voice and acclaimed album Linger Awhile, performs at Hill Auditorium in Ann Arbor.' WHERE id = '5102730a-fb10-435f-86f8-5e34dd0f1f7a';

-- Michigan Wolverines Womens Volleyball vs. Iowa Hawkeyes Womens Volleyball | Crisler Center | 2026-10-09 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Michigan Wolverines women''s volleyball team hosts the Iowa Hawkeyes in a Big Ten Conference match at Crisler Center in Ann Arbor.' WHERE id = '62570324-dfc4-4d9a-b234-e20cea4e8309';

-- Justin Nozuka | Blind Pig | 2026-10-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Justin Nozuka, the Canadian singer-songwriter known for soulful folk-pop tracks like ''After Tonight,'' performs live at the Blind Pig in Ann Arbor.' WHERE id = '1c771220-d034-4112-a5dc-f792a7a448f6';

-- Little River Band | Capitol Theatre - MI | 2026-10-09 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Little River Band, the Australian soft-rock group behind classic hits like ''Reminiscing'' and ''Cool Change,'' brings its catalog of 1970s and ''80s favorites to the Capitol Theatre.' WHERE id = '17e15d7f-cfea-4538-8e67-9b89781d6229';

-- Toledo Rockets Football vs. Buffalo Bulls Football | Glass Bowl Stadium | 2026-10-10 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Toledo Rockets host the Buffalo Bulls in a Mid-American Conference college football matchup at the Glass Bowl Stadium in Toledo, Ohio.' WHERE id = '654be702-2cb6-4013-b306-7300b81bcdd4';

-- TWISTED SISTER Featuring Sebastian Bach on Lead Vocals | The Colosseum at Caesars Windsor | 2026-10-10 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Twisted Sister''s surviving members tour in 2026 with Skid Row''s Sebastian Bach on lead vocals, performing the band''s glam-metal hits at The Colosseum at Caesars Windsor.' WHERE id = 'af08f835-b96b-437d-94f6-2edd3786fc13';

-- TWISTED SISTER feat. Sebastian Bach | Caesars Ticket + Hotel Packages | The Colosseum at Caesars Windsor | 2026-10-10 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A ticket-and-hotel package for Twisted Sister''s 2026 tour date at The Colosseum at Caesars Windsor, featuring Sebastian Bach of Skid Row on lead vocals performing the band''s glam-metal classics.' WHERE id = 'f54cb804-e55f-4cdd-bf68-e735f6ab5240';

-- Johnny Blue Skies & the Dark Clouds - Mutiny for the Masses 2026 Tour | Little Caesars Arena | 2026-10-10 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Johnny Blue Skies, the alter ego under which Grammy-winning country artist Sturgill Simpson has been releasing music and touring, brings the ''Mutiny for the Masses'' tour to Little Caesars Arena.' WHERE id = '511a24d9-e811-48c2-9cea-e5f0d063f0c9';

-- The Thorn | Fox Theatre Detroit | 2026-10-10 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Thorn, a large-scale touring theatrical and musical production dramatizing the final days, crucifixion, and resurrection of Jesus with live actors and elaborate staging, comes to the Fox Theatre Detroit.' WHERE id = 'b5202e07-46de-44ea-beb6-c1fdfc964bfc';

-- The Thorn - Suite Rental | Fox Theatre Detroit | 2026-10-10 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A suite-rental ticket option for The Thorn, the touring theatrical and musical production about the Passion of Christ, performing at the Fox Theatre Detroit.' WHERE id = '89d9f660-c5c8-4560-97a8-e050769853fb';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-10 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring circus known for its hip-hop and R&B-infused acts and internationally diverse performers, sets up near the Aretha Franklin Amphitheatre in Detroit.' WHERE id = 'fd1b6a88-f82a-4c33-a046-28bd93c7fa71';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-10 12:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring circus known for its hip-hop and R&B-infused acts and internationally diverse performers, sets up near the Aretha Franklin Amphitheatre in Detroit.' WHERE id = '1af8922f-dfee-4157-931d-90e56b43fec6';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-10 3:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring circus known for its hip-hop and R&B-infused acts and internationally diverse performers, sets up near the Aretha Franklin Amphitheatre in Detroit.' WHERE id = '9d00ec27-69f1-44ca-ae9b-728d8014d814';

-- Pinhead Gunpowder | Saint Andrew's Hall | 2026-10-10 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Pinhead Gunpowder, the pop-punk side project featuring Green Day''s Billie Joe Armstrong, plays a rare live show at Saint Andrew''s Hall in Detroit.' WHERE id = 'ddb9c6b2-06a4-474a-b7a8-dd51f12aac3c';

-- "Weird Al" Yankovic: Bigger & Weirder 2026 Tour | Huntington Center | 2026-10-10 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = '''Weird Al'' Yankovic, the Grammy-winning parody musician famous for songs like ''Eat It'' and ''White & Nerdy,'' brings his ''Bigger & Weirder'' tour, with a full band and elaborate costume changes, to the Huntington Center.' WHERE id = 'f66ae611-3a7a-492a-b8f4-fd5eec8a045a';

-- Chris Tucker | Sound Board at MotorCity Casino Hotel | 2026-10-10 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Stand-up comedy from Chris Tucker, the actor and comedian known for the Rush Hour film franchise and Friday, performing at the Sound Board inside MotorCity Casino Hotel.' WHERE id = 'a0be677f-ee2b-46bd-a748-83431a267d79';

-- Bowling Green Falcons Football vs. Sacramento State Hornets Football | Doyt Perry Stadium | 2026-10-10 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Bowling Green Falcons host the Sacramento State Hornets in a college football matchup at Doyt Perry Stadium in Bowling Green, Ohio.' WHERE id = '6d9dd0a3-8727-49eb-87c0-c6ef013445ee';

-- The Voice Of Whitney Houston: A Symphonic Celebration | Detroit Opera House | 2026-10-10 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A multimedia tribute pairing Whitney Houston''s original master vocal recordings with new live orchestral arrangements performed by the Detroit Opera Orchestra, alongside rare video and photos from her career, at the Detroit Opera House.' WHERE id = '5e0ec275-3c22-42fd-a56c-487bc70a55ad';

-- Art Garfunkel (No children under 5 allowed) | Fisher Theatre - Detroit | 2026-10-10 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Art Garfunkel, one half of the legendary folk-rock duo Simon & Garfunkel known for songs like ''Bridge Over Troubled Water,'' performs a night of music and storytelling at the Fisher Theatre.' WHERE id = '7a913a5e-1370-4571-a887-f27fdbb97839';

-- Detroit City FC vs. Rhode Island FC | Keyworth Stadium | 2026-10-10 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Detroit City FC hosts Rhode Island FC in a USL Championship soccer match at Keyworth Stadium in Hamtramck, part of the club''s regular-season slate.' WHERE id = '03c3963d-7f6c-4f8c-bcfd-8fb86a4b2d54';

-- The Heartland, See You Next Tuesday, Flowers For Persephone, Pigliacci | TSDMAAC | 2026-10-10 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A multi-band metal and hardcore lineup featuring The Heartland, See You Next Tuesday, Flowers For Persephone, and Pigliacci performing live at TSDMAAC in Detroit.' WHERE id = '778ff154-1cb8-4648-aecf-7c525cf329b8';

-- Buddha Trixie, Flight By Nothing, Pleaser | TSDMAAC (Crypt) | 2026-10-10 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local rock show featuring Buddha Trixie, Flight By Nothing, and Pleaser performing live at the Crypt stage inside TSDMAAC in Detroit.' WHERE id = '0788b38f-85cb-4c03-8949-0746790c3c9c';

-- DEERHOOF: SUN LIKE IT HOT TOUR 2026 | The Magic Bag | 2026-10-10 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Deerhoof, the long-running experimental indie-rock band known for its genre-defying sound, tours behind new material including the song ''Sun Like It Hot,'' performing at The Magic Bag.' WHERE id = 'bd10b1ce-8a81-4c70-84e0-d8735fe9e2ca';

-- Robby Hoffman | Royal Oak Music Theatre | 2026-10-10 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Robby Hoffman, the Canadian stand-up comedian and Netflix special star (''Robby Hoffman: Wake Up'') known for sharp, personal comedy, performs at the Royal Oak Music Theatre.' WHERE id = 'cc66eae2-9c76-4225-8e5a-29ded79faa76';

-- "The Ritz - Reunion Show | The Token Lounge | 2026-10-10 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'The Ritz, a Michigan-based band, reunites for a live reunion show at The Token Lounge in Westland, part of the venue''s regular local-band concert lineup.' WHERE id = '590fb2f0-d17d-41bd-bc49-73821d3c3602';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-10 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Meadow Brook Theatre stages The Man Who Shot Liberty Valance, Jethro Compton''s stage adaptation of Dorothy M. Johnson''s Western short story about a young idealist confronting a ruthless outlaw in a lawless frontier town.' WHERE id = '69f3bb13-3ecb-413c-8912-fb057ebc0a44';

-- USA Hockey National Team Development Program vs. Tri-City Storm | USA Hockey Arena | 2026-10-10 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The USA Hockey National Team Development Program faces the Tri-City Storm in a USHL junior hockey matchup at USA Hockey Arena in Plymouth, Michigan.' WHERE id = 'e32094fd-5c2a-4667-900a-d6c78ba38196';

-- Oakland University Golden Grizzlies Volleyball vs. Indiana University Women's Volleyball | OU Credit Union O'rena | 2026-10-10 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Oakland University''s Golden Grizzlies volleyball team takes on Indiana University''s Hoosiers in a collegiate women''s volleyball match at the OU Credit Union O''rena.' WHERE id = '5bea09f5-1185-4133-b828-ccc78b0b43b9';

-- Michigan Wolverines Womens Volleyball vs. Oregon Ducks Womens Volleyball | Crisler Center | 2026-10-10 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Michigan Wolverines women''s volleyball team hosts the Oregon Ducks in a Big Ten Conference match at Crisler Center in Ann Arbor.' WHERE id = '0f1dbf45-a63a-465d-8dbe-e360cf1aaa82';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-11 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring circus known for its hip-hop and R&B-infused acts and internationally diverse performers, sets up near the Aretha Franklin Amphitheatre in Detroit.' WHERE id = '97a941e3-23cf-4617-a9ed-d5597ae72437';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-11 3:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring circus known for its hip-hop and R&B-infused acts and internationally diverse performers, sets up near the Aretha Franklin Amphitheatre in Detroit.' WHERE id = '2dfbd2db-24e3-4cdf-884d-c34d786cd779';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-11 12:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring circus known for its hip-hop and R&B-infused acts and internationally diverse performers, sets up near the Aretha Franklin Amphitheatre in Detroit.' WHERE id = 'f7c34d39-9b69-4909-b3dd-3faa56704ede';

-- Skillet: Comatose 20 Years, Still Screaming Tour | The Fillmore Detroit | 2026-10-11 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Christian rock band Skillet marks the 20th anniversary of their breakout album Comatose with the ''Still Screaming'' tour, performing at The Fillmore Detroit.' WHERE id = '088ee1ba-fcba-4c70-81b8-1a4346ccc201';

-- Get the Led Out | Sound Board at MotorCity Casino Hotel | 2026-10-11 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Get the Led Out, a tribute band devoted to faithfully recreating the studio sound of Led Zeppelin in a live setting, performs at the Sound Board inside MotorCity Casino Hotel.' WHERE id = '70907af5-795f-4676-8967-7f0a76aea8f4';

-- Wind Walkers - The "I Don't Belong Here" Tour | Saint Andrew's Hall | 2026-10-11 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Wind Walkers, an alt-metal band known for genre-blending heavy music, brings its ''I Don''t Belong Here'' tour to Saint Andrew''s Hall in Detroit.' WHERE id = 'fda3ced0-a0fa-45f1-bf89-c02cd764e05f';

-- The Carpenters Songbook - A Live Celebration | Fisher Theatre - Detroit | 2026-10-11 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Carpenters Songbook: A Live Celebration brings the music of Karen and Richard Carpenter, including hits like ''Close to You'' and ''Rainy Days and Mondays,'' to the stage at the Fisher Theatre.' WHERE id = '59d04360-b8e9-4e55-ac4c-f75e57018049';

-- Damag3 with Film and Gender and Connor Cristi | Small's | 2026-10-11 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live music bill featuring Damag3 alongside Film and Gender and Connor Cristi at Small''s in Hamtramck, part of the venue''s regular local concert lineup.' WHERE id = 'cac36abd-c7bf-4277-b753-c5775b21a321';

-- Eyehategod, Cavity, BL'AST!, Luicidal, Evil Army | TSDMAAC | 2026-10-11 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A heavy underground bill led by New Orleans sludge-metal pioneers Eyehategod, with sludge act Cavity, hardcore veterans BL''AST!, Suicidal Tendencies-affiliated Luicidal, and thrash band Evil Army, at TSDMAAC in Detroit.' WHERE id = 'e21472d2-0c4d-482a-9c04-2b4f6a7962ec';

-- Carrie Nation and the Speakeasy | TSDMAAC (Crypt) | 2026-10-11 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Carrie Nation and the Speakeasy perform live at the Crypt stage inside TSDMAAC in Detroit, part of the venue''s regular live music lineup.' WHERE id = '7a552c7b-3985-43fa-8a77-b5c21b9c7efa';

-- Marc Maron | Royal Oak Music Theatre | 2026-10-11 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Marc Maron, the veteran stand-up comedian, actor, and host of the influential ''WTF with Marc Maron'' podcast, brings his stand-up act to the Royal Oak Music Theatre.' WHERE id = 'ce6ca08d-2f1f-4320-9898-8d1a3a1675d8';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-11 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Meadow Brook Theatre stages The Man Who Shot Liberty Valance, Jethro Compton''s stage adaptation of Dorothy M. Johnson''s Western short story about a young idealist confronting a ruthless outlaw in a lawless frontier town.' WHERE id = 'f6dba586-fc94-4836-9362-270ec97e2552';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-11 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Meadow Brook Theatre stages The Man Who Shot Liberty Valance, Jethro Compton''s stage adaptation of Dorothy M. Johnson''s Western short story about a young idealist confronting a ruthless outlaw in a lawless frontier town.' WHERE id = '0f14c7ec-6f2a-48da-be08-b4971d716f00';

-- JCW Presents: Lunacy Live | Diamondback Music Hall | 2026-10-11 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live touring event from Juggalo Championship Wrestling (JCW), the pro wrestling promotion tied to Insane Clown Posse''s Psychopathic Records, featuring live matches performed in front of a crowd at Diamondback Music Hall.' WHERE id = '4f1871d1-4980-42d7-ad5a-b3543ab230b4';

-- BECK: RIDE LONESOME TOUR | Fox Theatre Detroit | 2026-10-12 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Beck, the genre-hopping alt-rock and folk artist behind hits like ''Loser'' and ''Where It''s At'' and acclaimed albums including ''Odelay'' and ''Sea Change,'' brings his Ride Lonesome Tour to the Fox Theatre Detroit.' WHERE id = 'ecb3ea75-ca39-4142-aa6a-5c3aa2e087b0';

-- Beck - Suite Rental | Fox Theatre Detroit | 2026-10-12 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A premium suite ticket package for Beck''s Ride Lonesome Tour concert at the Fox Theatre Detroit, offering upscale box seating for the same October 12 performance by the veteran alt-rock artist.' WHERE id = '8caa9779-7873-4cc2-b3be-17b37c4e05e4';

-- Lily Vakili & Her Band with Mighty Joe Castro and the Gravemen | Small's | 2026-10-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A blues and roots-rock night at Small''s, featuring singer-guitarist Lily Vakili and her band alongside Mighty Joe Castro and the Gravemen.' WHERE id = 'a1aee80f-e66b-45fc-863c-301aace1c68a';

-- Dirty Dancing (Touring) | Fisher Theatre - Detroit | 2026-10-13 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The stage adaptation of the 1987 film Dirty Dancing, following Baby and dance instructor Johnny Castle at a 1960s Catskills resort and set to the film''s classic soundtrack, plays the Fisher Theatre.' WHERE id = '45edf66e-92d9-4bc9-be5a-5e17dde5b2dc';

-- Detroit Red Wings vs. New Jersey Devils | Little Caesars Arena | 2026-10-13 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An NHL regular-season matchup as the Detroit Red Wings host the New Jersey Devils at Little Caesars Arena.' WHERE id = '374b15a8-78dc-42ca-beb7-1ef57a5327a4';

-- Medium Build Presents The King of Having Fun on Tour | Saint Andrew's Hall | 2026-10-13 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Indie artist Medium Build headlines a tour behind his new album ''King of Having Fun,'' bringing his introspective indie-rock songwriting to Saint Andrew''s Hall.' WHERE id = 'e10a7efe-6dbf-446f-b29c-cfdaa78b5fab';

-- Kickstand Productions Presents Avery Cochrane: Weapons of Iridescence Tour | The Loving Touch | 2026-10-13 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Indie singer-songwriter Avery Cochrane, known for singles like ''Griever'' and ''Toy Gun'' from her debut album era, tours behind her Weapons of Iridescence release at The Loving Touch.' WHERE id = 'd595dddf-2dcf-4e76-971a-5b6bb9063620';

-- SPY | Edgemen | 2026-10-13 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live electronic/dance music performance billed as SPY, part of the regular concert lineup at Edgemen.' WHERE id = '9a47edfb-4cc7-4512-a888-d2fa2e1522cd';

-- Neighbour Andy | Blind Pig | 2026-10-13 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Neighbour Andy, an indie folk-pop band from Manitoba, Canada, brings its melodic songwriting to the Blind Pig.' WHERE id = '538c518c-0596-4551-8093-04976cf72633';

-- Dirty Dancing (Touring) | Fisher Theatre - Detroit | 2026-10-14 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The stage adaptation of the 1987 film Dirty Dancing, following Baby and dance instructor Johnny Castle at a 1960s Catskills resort and set to the film''s classic soundtrack, plays the Fisher Theatre.' WHERE id = '97608476-ec45-457a-bbf3-abcf892d9544';

-- Scene Queen: METALICIOUS | Saint Andrew's Hall | 2026-10-14 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Scene Queen, the artist known for blending glam pop with metalcore in a style she calls ''bimbocore,'' tours behind her METALICIOUS EP on Hopeless Records at Saint Andrew''s Hall.' WHERE id = 'b025353a-6f3b-46ef-827d-f0b366fa589d';

-- He Is Legend, In Angles, Excide, Ogemaw County | TSDMAAC | 2026-10-14 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'North Carolina post-hardcore band He Is Legend headlines a heavy-music bill with support from In Angles, Excide, and Ogemaw County.' WHERE id = '0937e300-ad2c-492f-a27b-2e6bae28addf';

-- Lenny Pearce | Royal Oak Music Theatre | 2026-10-14 5:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Lenny Pearce, the ''Toddler Techno'' DJ known for family-friendly ''Baby Raves'' and a Disney development deal, brings his early-evening electronic set to Royal Oak Music Theatre.' WHERE id = 'f15b7a27-8c7f-4fda-b950-be9c33ae3dc2';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-14 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stage adaptation of the classic Western tale The Man Who Shot Liberty Valance, centered on a senator whose reputation was built on a legendary gunfight, presented at Meadow Brook Theatre.' WHERE id = 'ab8120d3-86ca-46d6-b5c1-cc1e3db4ec26';

-- Kenny Wayne Shepherd | Michigan Theater | 2026-10-14 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Blues-rock guitarist Kenny Wayne Shepherd, known for albums like ''Trouble Is...'' and hits such as ''Blue on Black,'' performs at the Michigan Theater.' WHERE id = '29d2942e-061a-4877-b11b-ef6a4aaab52c';

-- Dirty Dancing (Touring) | Fisher Theatre - Detroit | 2026-10-15 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The stage adaptation of the 1987 film Dirty Dancing, following Baby and dance instructor Johnny Castle at a 1960s Catskills resort and set to the film''s classic soundtrack, plays the Fisher Theatre.' WHERE id = '42aceeb2-80e6-4714-91fd-88dca8ae445a';

-- Leanne Morgan -THE TIME OF OUR LIVES TOUR | Fox Theatre Detroit | 2026-10-15 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian Leanne Morgan, known for her hit Netflix stand-up special and relatable Southern humor about marriage and midlife, brings The Time of Our Lives Tour to the Fox Theatre.' WHERE id = '273c9852-9e83-4419-85cc-d7a28aed5def';

-- Leanne Morgan - Suite Rental | Fox Theatre Detroit | 2026-10-15 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A premium suite ticket package for comedian Leanne Morgan''s The Time of Our Lives Tour stop at the Fox Theatre Detroit.' WHERE id = 'f9219c67-c8d5-453d-9e15-dd04bcbe83d4';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-15 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring big-top show celebrating African-American and multicultural performance traditions with acrobats, aerialists, and comedy, sets up near the Aretha Franklin Amphitheatre.' WHERE id = '195b0526-1c8e-4495-b766-422c58efbef5';

-- Detroit Red Wings vs. Philadelphia Flyers | Little Caesars Arena | 2026-10-15 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An NHL regular-season matchup as the Detroit Red Wings host the Philadelphia Flyers at Little Caesars Arena.' WHERE id = 'fe872c23-3060-4c81-ac8f-f79145b3819e';

-- Holywatr: Deo Gratias Tour | Saint Andrew's Hall | 2026-10-15 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Christian hip-hop artist Holywatr tours behind his ''Deo Gratias'' album, bringing his faith-driven rap sound to Saint Andrew''s Hall.' WHERE id = '6b213643-dabe-42fc-9eb2-1dcd27f2b7a7';

-- Modele with Special Guests To Be Announced | Small's | 2026-10-15 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live music performance by Modele with special guests to be announced, part of Small''s regular concert lineup.' WHERE id = '46744817-22d9-497d-ab96-fa34a5e1c3b6';

-- Nik Parr and The Selfless Lovers | The Loving Touch | 2026-10-15 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Nik Parr and The Selfless Lovers, a Michigan-based band, perform a live set at The Loving Touch as part of the venue''s regular concert schedule.' WHERE id = '7b77fbdb-0913-4c53-bbcc-b02b0e484193';

-- Magic Bag Presents: Roger Clyne & the Peacemakers | The Magic Bag | 2026-10-15 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Roger Clyne & the Peacemakers, the Tempe, Arizona desert-rock band led by former Refreshments frontman Roger Clyne, perform at The Magic Bag.' WHERE id = 'b888d42b-5136-45fe-8535-8a0831475991';

-- The Midnight: Time Machines | Royal Oak Music Theatre | 2026-10-15 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Synthwave duo The Midnight, known for nostalgic 1980s-inspired electronic pop, brings its Time Machines Tour to Royal Oak Music Theatre.' WHERE id = '0c85b790-7b29-4cf3-9927-9898c2a753c7';

-- Deraps | The Token Lounge | 2026-10-15 6:30 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live music performance by Deraps at The Token Lounge, part of the venue''s regular concert schedule.' WHERE id = '5e24090d-cc9b-4599-afef-463c47fc162a';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-15 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stage adaptation of the classic Western tale The Man Who Shot Liberty Valance, centered on a senator whose reputation was built on a legendary gunfight, presented at Meadow Brook Theatre.' WHERE id = '58b8ff8a-8505-4a10-9f7e-8a909d77ad8f';

-- Dirty Dancing (Touring) | Fisher Theatre - Detroit | 2026-10-16 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The stage adaptation of the 1987 film Dirty Dancing, following Baby and dance instructor Johnny Castle at a 1960s Catskills resort and set to the film''s classic soundtrack, plays the Fisher Theatre.' WHERE id = 'cb84866c-9553-4c59-b998-c4b9fc572fc0';

-- Leanne Morgan: THE TIME OF OUR LIVES TOUR | Fox Theatre Detroit | 2026-10-16 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian Leanne Morgan, known for her hit Netflix stand-up special and relatable Southern humor about marriage and midlife, brings The Time of Our Lives Tour to the Fox Theatre.' WHERE id = 'a205b690-1824-4244-ba93-c4966cc9dd66';

-- Leanne Morgan - Suite Rental | Fox Theatre Detroit | 2026-10-16 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A premium suite ticket package for comedian Leanne Morgan''s The Time of Our Lives Tour stop at the Fox Theatre Detroit.' WHERE id = '2052b935-30dc-4788-a8d4-c1ee2c2ea7b8';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-16 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the touring big-top show celebrating African-American and multicultural performance traditions with acrobats, aerialists, and comedy, sets up near the Aretha Franklin Amphitheatre.' WHERE id = '230c4e77-aa83-40d0-809f-b0cf640554d5';

-- Suki Waterhouse: The Loveland Tour | The Fillmore Detroit | 2026-10-16 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'English singer and actress Suki Waterhouse, known for indie-pop albums including ''I Can''t Let Go'' and ''Memoir of a Sparklemuffin,'' brings her Loveland Tour to The Fillmore Detroit.' WHERE id = 'cb83cc64-4a87-48f1-9750-ae6992e3a066';

-- Detroit Pistons v Toronto Raptors (Preseason) | Little Caesars Arena | 2026-10-16 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An NBA preseason exhibition game as the Detroit Pistons host the Toronto Raptors at Little Caesars Arena.' WHERE id = 'c5e14e6e-fda9-42b6-b4f3-d86609a118c3';

-- KNOX -- MIDWESTS BEST TOUR | Saint Andrew's Hall | 2026-10-16 6:30 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Musical artist Knox brings the Midwests Best Tour to Saint Andrew''s Hall for a live concert performance.' WHERE id = 'e2468356-3838-4d5c-af77-fe37521a2065';

-- MARVIN - The Marvin Gaye Musical | Music Hall Center | 2026-10-16 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'MARVIN: The Marvin Gaye Musical is a jukebox stage production chronicling the life and legacy of the Motown icon through his classic songs, staged at Music Hall Center.' WHERE id = '42d73954-d03b-46f5-a2ee-e7ec6413139f';

-- Bowling Green Falcons Hockey vs. Niagara Purple Eagles Hockey | Slater Family Ice Arena | 2026-10-16 6:07 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A men''s college hockey matchup between the Bowling Green State University Falcons and the Niagara University Purple Eagles at Slater Family Ice Arena.' WHERE id = '4edf666c-4408-4f8d-a37b-dab3d587ed91';

-- Oso Oso, Leisure Hour, Bad Luck | TSDMAAC | 2026-10-16 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Emo and indie-rock band Oso Oso, led by songwriter Jade Lilitri, headlines a night of guitar-driven music with support from Leisure Hour and Bad Luck.' WHERE id = '2f75d103-e510-472c-b096-954cbd194dfe';

-- Rav, Teller Bank$, Fatboi Sharif | TSDMAAC (Crypt) | 2026-10-16 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A hip-hop bill featuring underground rapper Fatboi Sharif, known for his surreal, experimental style on Backwoodz Studioz, alongside bass artist Rav and rapper Teller Bank$.' WHERE id = 'd9d6c517-721b-470c-b06d-fa40dc4ff16e';

-- Satin Jackets | The Loving Touch | 2026-10-16 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'German producer Satin Jackets, known for his nu-disco and chillwave-influenced electronic sound, performs at The Loving Touch.' WHERE id = '015bdc77-3418-420b-b32c-39274d0f1813';

-- Magic Bag Presents: HAPPY HOUR DANCE CLUB - Ladies Only Dance Party | The Magic Bag | 2026-10-16 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A ladies-only early-evening dance party at The Magic Bag, part of its recurring Happy Hour Dance Club series with DJ-spun music.' WHERE id = '2aa0c4f5-beb6-47b0-9ee5-b1b35ba3b276';

-- ROCK NEVER STOPS – Tributes to Ratt, Poison & Def Leppard | District 142 | 2026-10-16 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A tribute concert paying homage to 1980s rock bands Ratt, Poison, and Def Leppard, presented as part of the Rock Never Stops tribute series at District 142.' WHERE id = '605a6ced-7d81-43b9-b5b4-2699f551d557';

-- The Good Life: Tribute To Tony Bennett | Andiamo Celebrity Showroom | 2026-10-16 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A tribute performance celebrating the music and songbook of legendary crooner Tony Bennett, staged at Andiamo Celebrity Showroom.' WHERE id = 'ea1467c4-6f56-461e-8826-1a913bbc0d79';

-- Coco Montoya, Jim McCarty | The Token Lounge | 2026-10-16 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A blues-guitar double bill featuring Coco Montoya, former lead guitarist for John Mayall''s Bluesbreakers, and Detroit blues-rock veteran Jim McCarty of Mitch Ryder & The Detroit Wheels.' WHERE id = '909c5b55-e272-4ae2-a244-07cc1eff43e3';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-16 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stage adaptation of the classic Western tale The Man Who Shot Liberty Valance, centered on a senator whose reputation was built on a legendary gunfight, presented at Meadow Brook Theatre.' WHERE id = 'bb9dd53e-93fc-4b1f-b45c-245bb4a96e89';

-- Halloween Party 2026 featuring Parallel Fifth | Emerald Theatre | 2026-10-16 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Halloween-themed party at Emerald Theatre featuring live music from Parallel Fifth, a Michigan-based band.' WHERE id = '9bab607b-7df4-4077-83d7-140b140d36ec';

-- TVBOO | The Crofoot Ballroom | 2026-10-16 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Bass-music producer TVBOO, known for his heavy dubstep and trap-influenced sound, performs at The Crofoot Ballroom.' WHERE id = '8d11a8f3-462b-4f9e-be73-09f6987eca70';

-- LOCKED SHUT | Pike Room @ The Crofoot | 2026-10-16 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Midwest hardcore band Locked Shut brings its aggressive, straightforward sound to the Pike Room at The Crofoot.' WHERE id = '3fc9058c-7fed-405f-ac7f-b0f8e4cc435d';

-- USA Hockey National Team Development Program vs. Dubuque Fighting Saints | USA Hockey Arena | 2026-10-16 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'USA Hockey''s National Team Development Program, which trains the country''s top under-18 and under-17 prospects, faces the USHL''s Dubuque Fighting Saints at USA Hockey Arena.' WHERE id = '2ba951b6-e3b1-4292-98ea-73a62a7db400';

-- Mike D 5D | Masonic Temple - Detroit | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live music event billed as Mike D 5D, held at the Masonic Temple''s Jack White Theatre in Detroit, part of the venue''s regular concert calendar.' WHERE id = '433e7cda-f0eb-43f3-b951-d430ab3e8d35';

-- The Muny Centennial Gala | Masonic Temple - Detroit | 2026-10-17 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A theatrical gala event marking a centennial celebration, held in the historic ballroom of the Masonic Temple in Detroit.' WHERE id = 'fc76df3d-9b39-4b4b-bb91-aaa469827654';

-- Dirty Dancing (Touring) | Fisher Theatre - Detroit | 2026-10-17 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The stage adaptation of the 1987 film Dirty Dancing, following Baby and dance instructor Johnny Castle at a 1960s Catskills resort and set to the film''s classic soundtrack, plays the Fisher Theatre.' WHERE id = '1c9fed87-59c7-45a9-b357-08778692ec39';

-- Dirty Dancing (Touring) | Fisher Theatre - Detroit | 2026-10-17 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An afternoon matinee of the stage adaptation of the 1987 film Dirty Dancing, following Baby and dance instructor Johnny Castle at a 1960s Catskills resort, at the Fisher Theatre.' WHERE id = '12db6378-4f89-4721-9dc3-2361b04fd64f';

-- All Star Comedy Festival | Fox Theatre Detroit | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The All Star Comedy Festival brings a lineup of veteran stand-up comedians, with past editions featuring names like Earthquake, Bruce Bruce, Arnez J, and Michael Blackson, to the Fox Theatre.' WHERE id = '6803a626-caea-4b7c-852e-8bfcab69fb21';

-- Detroit Red Wings vs. San Jose Sharks | Little Caesars Arena | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An NHL regular-season matchup as the Detroit Red Wings host the San Jose Sharks at Little Caesars Arena.' WHERE id = '8913dd7b-eac7-4dc9-b464-5e385eb361f9';

-- All Star Comedy Festival - Suite Rental | Fox Theatre Detroit | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A premium suite ticket package for the All Star Comedy Festival stand-up show at the Fox Theatre Detroit.' WHERE id = '9be24fae-1738-4231-9b80-ebd5f0965105';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-17 3:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the Black-owned touring circus known for blending hip-hop, R&B, and global entertainment with traditional big-top acts like aerialists and acrobats, performs its family-friendly show near the Aretha Franklin Amphitheatre.' WHERE id = '78e7648e-70cc-4279-9869-ecd863db47c2';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-17 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the Black-owned touring circus known for blending hip-hop, R&B, and global entertainment with traditional big-top acts like aerialists and acrobats, performs its family-friendly show near the Aretha Franklin Amphitheatre.' WHERE id = 'c94ea7d1-c3bc-44c6-a917-0347f9db5076';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-17 12:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the Black-owned touring circus known for blending hip-hop, R&B, and global entertainment with traditional big-top acts like aerialists and acrobats, performs its family-friendly show near the Aretha Franklin Amphitheatre.' WHERE id = 'e51792d2-8967-48e9-9db4-9197f3456efb';

-- Niko Moon - Back To My Roots Tour | The Fillmore Detroit | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country singer-songwriter Niko Moon, known for his breakout hit ''Good Time'' and his laid-back ''moonshine'' sound blending country, folk, and pop, brings his Back to My Roots Tour to The Fillmore Detroit.' WHERE id = '199c75e0-7cfd-4aa6-9cc6-f4dd8d596de9';

-- Michigan Wolverines Football vs. Penn State Nittany Lions Football | Michigan Stadium | 2026-10-17 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Big Ten college football showdown as the Michigan Wolverines host the Penn State Nittany Lions at Michigan Stadium in Ann Arbor, part of the 2026 conference season.' WHERE id = '9483f76c-9af3-4747-abf6-6cac5acda5fb';

-- Jeffrey Osborne | Sound Board at MotorCity Casino Hotel | 2026-10-17 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'R&B and soul singer Jeffrey Osborne, former lead vocalist of the band L.T.D. and a solo hitmaker known for songs like ''On the Wings of Love'' and ''Stay with Me Tonight,'' performs at Sound Board.' WHERE id = 'f4858965-2db2-4a0c-b6bf-8a87c44be91e';

-- HEY, NOTHING - THE HOUND TOUR | Saint Andrew's Hall | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Indie duo hey, nothing brings The Hound Tour to Saint Andrew''s Hall in support of their debut album ''Hound,'' a stripped-down, back-to-basics collection from the up-and-coming act.' WHERE id = 'e9005752-8204-42f0-a7fc-53ca3efec36b';

-- MARVIN - The Marvin Gaye Musical | Music Hall Center | 2026-10-17 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'MARVIN - The Marvin Gaye Musical brings the life and music of the Motown legend to the stage at Music Hall Center, tracing his rise from Motown session singer to soul icon through his classic songs.' WHERE id = 'ffee9024-0771-49e1-a992-74b8658c9193';

-- MARVIN - The Marvin Gaye Musical | Music Hall Center | 2026-10-17 3:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'MARVIN - The Marvin Gaye Musical brings the life and music of the Motown legend to the stage at Music Hall Center, tracing his rise from Motown session singer to soul icon through his classic songs.' WHERE id = 'd122ab19-5275-45fe-af19-69d40d2230da';

-- Bowling Green Falcons Hockey vs. Niagara Purple Eagles Hockey | Slater Family Ice Arena | 2026-10-17 6:07 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'College hockey action as the Bowling Green Falcons, a Division I program, host the Niagara Purple Eagles at Slater Family Ice Arena in Bowling Green, Ohio.' WHERE id = '6adb7cc7-0a4c-4e39-8428-9bdd05c95c48';

-- Bowling Green Falcons Football vs. Ball State Cardinals Football | Doyt Perry Stadium | 2026-10-17 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Mid-American Conference college football matchup as the Bowling Green Falcons host the Ball State Cardinals at Doyt Perry Stadium in Ohio.' WHERE id = '827509d2-b3f0-4981-b0fb-75fbc6bafa11';

-- Ole 60 | Masonic Temple - Detroit | 2026-10-17 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Nashville country act Ole 60, an Opry-affiliated group known for blending honky-tonk grit with modern country songwriting, performs a live concert at the Masonic Temple in Detroit.' WHERE id = '3f31580e-c201-4ee4-b453-a47124bb1933';

-- Nine Pound Hammer with Sabertooth Gary and The Strains | Small's | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Kentucky psychobilly veterans Nine Pound Hammer, known for their raucous mix of punk and rockabilly since the late 1980s, headline a night at Small''s alongside Sabertooth Gary and The Strains.' WHERE id = 'aa758ba2-6e53-4296-a488-79d8d05514ca';

-- Kickstand Productions Presents Friko - Something Worth Waiting For: The Tour | The Loving Touch | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Chicago indie rock band Friko tours behind their acclaimed sophomore album ''Something Worth Waiting For,'' bringing their sweeping, dynamic sound to The Loving Touch.' WHERE id = '379ed085-9830-4ab3-beef-af71d5adbebd';

-- The Mega 80s Spooktacular | The Magic Bag | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'The Mega 80s Spooktacular brings a Halloween-themed dance party of 1980s hits to The Magic Bag, a costume-friendly night of new wave and pop classics.' WHERE id = 'edfb14c6-1a08-4f89-b4b5-6e729cca16ed';

-- Brantley Gilbert - Real American Tour | Huntington Center | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country music star Brantley Gilbert, known for hits like ''Bottoms Up'' and ''The Weekend'' and his blend of outlaw country and rock, brings his Real American Tour to Huntington Center.' WHERE id = '7a09774b-3d2c-43e6-b8f1-0ab9fede02db';

-- Raputa - J Geils Tribute, Detroit Speed Wagon - REO Speed Wagon Tribute | The Token Lounge | 2026-10-17 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A classic rock tribute double bill at The Token Lounge, featuring Raputa paying homage to The J. Geils Band and Detroit Speed Wagon recreating the hits of REO Speedwagon.' WHERE id = 'b4f16235-8115-414a-a1db-3561e72bbb08';

-- CAIN Live and In Worship Tour with special guest Joe L Barnes - Detroit, MI | Bethesda Christian Church | 2026-10-17 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Contemporary Christian trio CAIN, known for worship songs like ''Rivers'' and connections to country duo Dan + Shay, brings its Live and In Worship Tour to Bethesda Christian Church with special guest Joe L. Barnes.' WHERE id = '6b19cb1f-43a0-4dd5-a0ca-142c039f1c12';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-17 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Meadow Brook Theatre stages ''The Man Who Shot Liberty Valance,'' a stage adaptation of the classic Western tale of law, honor, and legend on the American frontier.' WHERE id = '5c0496ed-60ff-415c-a170-93ad8b1e27e6';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-17 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Meadow Brook Theatre stages ''The Man Who Shot Liberty Valance,'' a stage adaptation of the classic Western tale of law, honor, and legend on the American frontier.' WHERE id = '3e14c1b8-c131-4949-bdcb-6fb3885f66bd';

-- Vertical Horizon | Flagstar Strand Theatre for the Performing Arts | 2026-10-17 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Rock band Vertical Horizon, best known for their 2000 hit ''Everything You Want,'' performs live at the Flagstar Strand Theatre for the Performing Arts in Pontiac.' WHERE id = '406140b3-f105-493f-b147-1b93253686ae';

-- BOOTS & 808s: The Country x EDM Experience | Diamondback Music Hall | 2026-10-17 9:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'BOOTS & 808s: The Country x EDM Experience brings a genre-blending dance party to Diamondback Music Hall, mixing country anthems with electronic dance beats.' WHERE id = '32b78ec3-b17a-4643-9ae7-849acf3c2d43';

-- Eastern Michigan Eagles Football vs. Toledo Rockets Football | Rynearson Stadium | 2026-10-17 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Mid-American Conference college football matchup as the Eastern Michigan Eagles host the Toledo Rockets at Rynearson Stadium in Ypsilanti.' WHERE id = '092ed7a9-91d5-41ef-b86c-9aaade018a97';

-- Broadway Rave - The Musical Theatre Dance Party | Blind Pig | 2026-10-17 9:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Broadway Rave turns Blind Pig into a dance party built around musical theatre anthems, with DJs and singers remixing showtunes from Broadway favorites into a late-night sing-and-dance event.' WHERE id = '809b64e0-89c8-4d15-8bdd-4e3defeb2b86';

-- Broadway Rave | Blind Pig | 2026-10-17 9:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Broadway Rave turns Blind Pig into a dance party built around musical theatre anthems, with DJs and singers remixing showtunes from Broadway favorites into a late-night sing-and-dance event.' WHERE id = '15babfd8-f79f-48e7-8506-5279f3f80bb6';

-- Dirty Dancing (Touring) | Fisher Theatre - Detroit | 2026-10-18 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The stage adaptation of ''Dirty Dancing,'' based on the beloved 1987 film, brings its story of summer romance and iconic dance numbers to the Fisher Theatre in Detroit.' WHERE id = 'c46e1ca4-3213-49ca-824e-096a37399533';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-18 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the Black-owned touring circus known for blending hip-hop, R&B, and global entertainment with traditional big-top acts like aerialists and acrobats, performs its family-friendly show near the Aretha Franklin Amphitheatre.' WHERE id = 'b33ff0fb-f336-4883-8f42-337707d1df1f';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-18 12:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the Black-owned touring circus known for blending hip-hop, R&B, and global entertainment with traditional big-top acts like aerialists and acrobats, performs its family-friendly show near the Aretha Franklin Amphitheatre.' WHERE id = '6d6f1cf8-f3d1-4cac-8e1a-4616fdfca7b9';

-- UniverSoul Circus | Across from the Aretha Franklin Amphitheatre Universoul Circus | 2026-10-18 3:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UniverSoul Circus, the Black-owned touring circus known for blending hip-hop, R&B, and global entertainment with traditional big-top acts like aerialists and acrobats, performs its family-friendly show near the Aretha Franklin Amphitheatre.' WHERE id = '048d39ac-4a95-4097-8850-f9525dcd5f65';

-- Candlebox - Can't Quit You Tour, Fall 2026 | The Fillmore Detroit | 2026-10-18 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = '90s rock band Candlebox, known for their platinum debut single ''Far Behind,'' brings their Can''t Quit You Tour to The Fillmore Detroit.' WHERE id = '702db6c6-d60f-4d76-be5e-27e65a99ebc7';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-18 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Meadow Brook Theatre stages ''The Man Who Shot Liberty Valance,'' a stage adaptation of the classic Western tale of law, honor, and legend on the American frontier.' WHERE id = 'ebe11f10-3475-4e8b-a02e-fa59f9db146d';

-- Dirty Dancing (Touring) | Fisher Theatre - Detroit | 2026-10-18 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The stage adaptation of ''Dirty Dancing,'' based on the beloved 1987 film, brings its story of summer romance and iconic dance numbers to the Fisher Theatre in Detroit.' WHERE id = '2c0caca4-34af-43a0-b973-dd73c780d1e0';

-- The Black Keys: PEACHES 'N KREAM | The Colosseum at Caesars Windsor | 2026-10-18 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Blues-rock duo The Black Keys tour behind their album ''Peaches!'' on the Peaches ''N Kream tour, bringing their gritty, riff-driven sound to The Colosseum at Caesars Windsor.' WHERE id = 'b8446605-24a7-49dc-b799-f9664d583ce5';

-- The Black Keys: PEACHES 'N KREAM | Caesars Ticket + Hotel Packages | The Colosseum at Caesars Windsor | 2026-10-18 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Blues-rock duo The Black Keys tour behind their album ''Peaches!'' on the Peaches ''N Kream tour, with this listing covering a Caesars ticket-and-hotel package for their show at The Colosseum at Caesars Windsor.' WHERE id = 'e7d0a776-c56c-474b-a96d-db55c6179c3b';

-- Mya | Sound Board at MotorCity Casino Hotel | 2026-10-18 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'R&B singer Mya, known for hits like ''Case of the Ex'' and ''Best of Me'' with Jay-Z, and her role in the ''Lady Marmalade'' remake, performs live at Sound Board.' WHERE id = '4568c22d-ee2f-45ec-bf1f-abf09a60a518';

-- MARVIN - The Marvin Gaye Musical | Music Hall Center | 2026-10-18 3:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'MARVIN - The Marvin Gaye Musical brings the life and music of the Motown legend to the stage at Music Hall Center, tracing his rise from Motown session singer to soul icon through his classic songs.' WHERE id = 'e7539e67-69af-4a51-a377-cc99023bf4d0';

-- PIG with Cyanotic and more | Small's | 2026-10-18 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Industrial rock act PIG (Raymond Watts) tours alongside Cyanotic on the Hurt People Tour, bringing aggressive electro-industrial sounds to Small''s with additional support acts.' WHERE id = '2c44edde-ea50-417f-a64d-87f379c8d79c';

-- Lucha Boom! (Live Pro Wrestling) | TSDMAAC | 2026-10-18 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Lucha Boom! brings live lucha libre professional wrestling to TSDMAAC, featuring masked wrestlers performing the high-flying, acrobatic style of Mexican wrestling.' WHERE id = '13e0e8d8-00e0-470c-b566-26dec9704995';

-- Kickstand Productions Presents Brian Posehn w/ Special Guests TBA | The Magic Bag | 2026-10-18 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian and actor Brian Posehn, known for his self-deprecating ''metal nerd'' humor and roles in ''Mr. Show,'' ''The Sarah Silverman Program,'' and ''The Big Bang Theory,'' performs standup at The Magic Bag.' WHERE id = 'df3a0da8-635c-4b33-807c-55a0b7be31b5';

-- The Last Waltz - 50 Year Anniversary Tour featuring CHEST FEVER The Official Revival of THE BAND | The Token Lounge | 2026-10-18 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Tribute act Chest Fever recreates The Band''s legendary farewell concert ''The Last Waltz'' for its 50th anniversary, performing the songs and spirit of the 1976 Martin Scorsese-filmed show at The Token Lounge.' WHERE id = '94d4092a-585b-4514-a576-7100f918f8aa';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-18 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Meadow Brook Theatre stages ''The Man Who Shot Liberty Valance,'' a stage adaptation of the classic Western tale of law, honor, and legend on the American frontier.' WHERE id = '76687ce0-a5db-4d4f-a00e-468f17b42619';

-- Flooding | Pike Room @ The Crofoot | 2026-10-18 6:30 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Flooding, an independent rock act, performs a live show at the Pike Room inside The Crofoot in Pontiac, part of the venue''s regular local and touring music lineup.' WHERE id = '7eed45dc-9b4e-4c3a-a3de-9a638cab4f1b';

-- USA Hockey National Team Development Program vs. Dubuque Fighting Saints | USA Hockey Arena | 2026-10-18 4:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The USA Hockey National Team Development Program''s junior squad, which develops future NHL and Team USA talent, faces the USHL''s Dubuque Fighting Saints at USA Hockey Arena in Plymouth.' WHERE id = '3cf333a6-9a0f-48b5-8714-e6415b24b25d';

-- RED LEATHER- TAHOE TOUR | Blind Pig | 2026-10-18 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Alt-rock artist Red Leather, known for performing behind a masked persona and building a large following through viral social media releases, brings the Tahoe Tour to Blind Pig.' WHERE id = '237666d7-f617-4741-9b5a-9fafbc2b9981';

-- Leah Rudick | Laugh Lounge | 2026-10-18 9:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian Leah Rudick, known for her viral ''Wealthy Woman'' character and her Amazon Prime special ''Spiraling,'' performs standup comedy at Laugh Lounge.' WHERE id = '1eac6d0b-8fed-4693-a5e0-e8b0b2c8a0e4';

-- Leah Rudick | Laugh Lounge | 2026-10-18 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian Leah Rudick, known for her viral ''Wealthy Woman'' character and her Amazon Prime special ''Spiraling,'' performs standup comedy at Laugh Lounge.' WHERE id = '313a1f8b-a795-415d-8c25-ce47ec66e3ea';

-- Rod Wave: Don't Look Down Tour | Little Caesars Arena | 2026-10-19 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Chart-topping singer and rapper Rod Wave, known for emotionally raw hits like ''Heart on Ice'' and multiple No. 1 albums, brings his Don''t Look Down Tour to Little Caesars Arena.' WHERE id = 'a2aa818a-0097-466f-8b10-63298e0f4462';

-- Hokus Pokus Live! | The Fillmore Detroit | 2026-10-19 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Hokus Pokus Live! is a campy Halloween-season parody stage show starring drag performers Ginger Minj, Jujubee, and Sapphira Cristal, spoofing a Halloween cult classic at The Fillmore Detroit.' WHERE id = 'eb39085a-51cf-4d56-ad6b-9f69f482c0a1';

-- The Rogue Route Tour | Masonic Temple - Detroit | 2026-10-19 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Author, pastor, and speaker Sarah Jakes Roberts brings her Rogue Route Tour to the Masonic Temple in Detroit, an inspirational live event centered on her faith-based teaching and personal empowerment message.' WHERE id = 'dff09847-c441-45a3-9fe6-fde7d074d8cc';

-- Detroit Pistons v Boston Celtics (Home Opener) | Little Caesars Arena | 2026-10-20 3:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Detroit Pistons open their 2026-27 NBA season at home against the Boston Celtics at Little Caesars Arena, a nationally notable matchup selected for NBA opening night.' WHERE id = '0b6b0237-258e-4aa3-abdd-aec0ce3d9bf9';

-- Rod Wave: Don't Look Down Tour | Little Caesars Arena | 2026-10-20 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Chart-topping singer and rapper Rod Wave, known for emotionally raw hits like ''Heart on Ice'' and multiple No. 1 albums, brings his Don''t Look Down Tour to Little Caesars Arena.' WHERE id = '1fc24a1e-5bb0-4771-8307-69b15372de44';

-- Big D and the Kids Table, Devon Kay & The Solutions | TSDMAAC (Crypt) | 2026-10-20 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Longtime Boston ska-punk band Big D and the Kids Table, known for their horn-driven, high-energy live shows, performs at TSDMAAC alongside Devon Kay & The Solutions.' WHERE id = 'fedc33b8-7194-464f-9162-af09135a8c3a';

-- Knumears, Catalyst, Soap Box Derby, Gunfighter | TSDMAAC | 2026-10-20 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A multi-band rock show featuring Knumears, Catalyst, Soap Box Derby, and Gunfighter performs together on one bill at TSDMAAC in Detroit.' WHERE id = '14e0448a-92bc-4e4d-842c-fc9e0cee149b';

-- Kickstand Productions Presents Horse Jumper Of Love: Playing their Self Titled Debut in its entirety | The Loving Touch | 2026-10-20 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Boston slowcore band Horse Jumper of Love performs their self-titled 2016 debut album in full at The Loving Touch, marking the record''s anniversary with a start-to-finish live set.' WHERE id = '3f10dfd2-f523-4b2a-81e4-0757b255baa5';

-- Movements w/ Balance & Composure | Royal Oak Music Theatre | 2026-10-20 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Post-hardcore band Movements, known for their emotionally charged sound and hit ''Daylily,'' co-headlines with fellow emo/post-hardcore act Balance and Composure at Royal Oak Music Theatre.' WHERE id = '95e6045e-b4d7-43dd-a6de-7204dad41e95';

-- Oakland University Men's Soccer vs. Bowling Green Falcons Men's Soccer | Oakland Soccer Field | 2026-10-20 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'College soccer action as the Oakland University Golden Grizzlies men''s team hosts the Bowling Green Falcons at Oakland Soccer Field.' WHERE id = '06f28bc3-9c53-4dfc-a59a-64422e42e723';

-- John Cameron Mitchell: Hedwig 25th Anniversary Movie Tour | The Fillmore Detroit | 2026-10-21 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A special 25th-anniversary screening of the cult film ''Hedwig and the Angry Inch,'' featuring a live appearance by writer-director-star John Cameron Mitchell, who created the rock musical and its iconic title role.' WHERE id = '462edb06-0f95-4ac2-b3ff-7e55b85ea1e8';

-- The Bobby Lees | TSDMAAC (Crypt) | 2026-10-21 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live performance by The Bobby Lees, a raw, high-energy garage-punk band from Woodstock, New York known for their blues-inflected rock and roll and chaotic stage presence.' WHERE id = 'f7e22942-8fd8-49f4-9e07-23669ea9894a';

-- Kickstand Productions Presents Vincent Neil Emerson | The Loving Touch | 2026-10-21 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Vincent Neil Emerson, a Texas-based singer-songwriter blending country, folk, and Americana influences, known for introspective storytelling and ties to the outlaw-country scene championed by artists like Colter Wall.' WHERE id = '6c38a91e-fb22-46df-b35f-c81c175e171f';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-21 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stage adaptation of ''The Man Who Shot Liberty Valance,'' the classic Western tale of a lawman, an outlaw, and a frontier town''s reckoning with justice, presented as part of Meadow Brook Theatre''s season.' WHERE id = 'c40c1ab9-feb0-44e2-baa3-c48cbd853875';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-21 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stage adaptation of ''The Man Who Shot Liberty Valance,'' the classic Western tale of a lawman, an outlaw, and a frontier town''s reckoning with justice, presented as part of Meadow Brook Theatre''s season.' WHERE id = '275541f3-33bc-46da-aa3c-bdac7e3d3454';

-- Lauren Sanderson | Blind Pig | 2026-10-21 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Lauren Sanderson, an alt-pop singer-songwriter known for candid, deeply personal lyrics about mental health and identity, and a devoted fanbase built largely through social media.' WHERE id = 'fbc73563-11ad-41ad-a378-5fbe5260089a';

-- Lauren Sanderson, XKYLER | Blind Pig | 2026-10-21 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert featuring alt-pop singer-songwriter Lauren Sanderson, known for candid, personal lyrics and a devoted online fanbase, with supporting artist XKYLER opening the show.' WHERE id = '81765e2f-d67f-4b07-83ce-ac0c5c9c6ad1';

-- Wheeler Walker Jr. - Pullin' Out: The Farewell Tour | The Fillmore Detroit | 2026-10-22 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Wheeler Walker Jr., the raunchy outlaw-country alter ego created by comedian Ben Hoffman, known for crude, comedic songs paired with genuine honky-tonk musicianship and a devoted cult following.' WHERE id = '47630420-755a-4516-b22b-5b4af046e6e7';

-- Genitorturers Live + Lewd Tour featuring support from Nathan James | Small's | 2026-10-22 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Genitorturers, the Florida-based industrial shock-rock band fronted by Gen, known for theatrical, fetish-tinged live shows, with support from vocalist Nathan James.' WHERE id = 'f12459fd-113b-46d5-af29-d5a968fbbb67';

-- Magic Bag Presents: PRAYERS No Tengo Calma Tour 2026 feat. DEVORA & CHRIZ AMAYA | The Magic Bag | 2026-10-22 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by PRAYERS, the San Diego ''cholo goth'' project led by Rafael Reyes blending industrial, hip-hop, and dark wave sounds, with support from DEVORA and Chriz Amaya on their No Tengo Calma tour.' WHERE id = 'e218a8bf-8fd2-4a3d-90d2-7c524d9f3dea';

-- DJ Shadow | Royal Oak Music Theatre | 2026-10-22 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live performance by DJ Shadow, the pioneering turntablist and producer celebrated for sample-based instrumental hip-hop, including the landmark 1996 album ''Endtroducing.....''' WHERE id = '26dc8b4c-8d49-4ca5-8ddc-1ed4f0426e77';

-- Lights Out The UFO Expereice with Andy Parker | The Token Lounge | 2026-10-22 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A tribute concert celebrating the music of the British rock band UFO, featuring the group''s original drummer, Andy Parker, performing their classic catalog live.' WHERE id = '1c4ba404-f330-40dc-b657-9381f54cd21f';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-22 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stage adaptation of ''The Man Who Shot Liberty Valance,'' the classic Western tale of a lawman, an outlaw, and a frontier town''s reckoning with justice, presented as part of Meadow Brook Theatre''s season.' WHERE id = '8b189848-1be4-42d9-8d14-01384b21c8d3';

-- Oakland University Women's Soccer vs. Wright State Women's Soccer | Oakland Soccer Field | 2026-10-22 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Horizon League women''s soccer match between the Oakland University Golden Grizzlies and the Wright State Raiders, played at Oakland''s home field in Rochester, Michigan.' WHERE id = 'd2dcb214-9135-4db6-9546-ca63c14eebcf';

-- Whethan (18 and Over) | Majestic Theatre-MI | 2026-10-23 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Whethan, the American electronic music producer and DJ known for genre-blending dance tracks and collaborations with pop and hip-hop artists; this show is restricted to ages 18 and over.' WHERE id = '4cfd6176-4b29-41b5-90f8-a4a301cea226';

-- Disney Descendants, ZOMBIES & Camp Rock: Worlds Collide Concert Tour | Little Caesars Arena | 2026-10-23 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A family-friendly concert tour bringing together cast members and music from Disney Channel''s ''Descendants,'' ''ZOMBIES,'' and ''Camp Rock'' movie franchises for one combined live show.' WHERE id = 'e91565ae-96ba-4851-ac2e-2f2331ed6744';

-- Bassem Youssef: The Belly of the Beast Tour | The Fillmore Detroit | 2026-10-23 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stand-up comedy show by Bassem Youssef, the Egyptian satirist and former heart surgeon often dubbed ''the Jon Stewart of the Arab world,'' known for his sharp political and social commentary.' WHERE id = 'd2490c11-7626-42c8-a165-e02031a6ec3d';

-- Tracy Lawrence | Stranahan Theatre | 2026-10-23 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Tracy Lawrence, the country music star known for 1990s hits like ''Time Marches On,'' ''Sticks and Stones,'' and ''Texas Tornado.''' WHERE id = '8aa5b76c-d9f3-4ff9-a5e4-08847dbc172b';

-- Bunkerween IV | TSDMAAC | 2026-10-23 5:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'The fourth annual Bunkerween, a recurring Halloween-themed heavy music showcase at TSDMAAC in Detroit spotlighting hardcore, punk, and metal acts from the local underground scene.' WHERE id = 'cbf08797-aea4-4d29-baea-164b98b477ad';

-- Streetlight Manifesto | Royal Oak Music Theatre | 2026-10-23 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Streetlight Manifesto, the New Jersey ska-punk band known for their fast, horn-driven sound and albums like ''Everything Goes Numb'' and ''Somewhere in the Between.''' WHERE id = '646aeeab-cef2-42ca-826c-e2f564d2c38d';

-- The Brokes (The Strokes Tribute) | The Loving Touch | 2026-10-23 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A live tribute performance by The Brokes, a band dedicated to recreating the songs and sound of The Strokes for fans of the influential 2000s rock group.' WHERE id = '0820e5fd-0c60-44c5-aff3-7de061f5918d';

-- Magic Bag Presents: Ohly | The Magic Bag | 2026-10-23 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live performance by Ohly, a Michigan-based singer-songwriter who has been featured in regional media for his original music, playing The Magic Bag''s intimate stage.' WHERE id = 'cdb0111e-61f8-4e5e-b079-02d4d5ea74bc';

-- Shadows Of The 60's | Andiamo Celebrity Showroom | 2026-10-23 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A tribute concert revisiting the sounds of 1960s pop and rock, part of Andiamo Celebrity Showroom''s regular lineup of nostalgia-themed tribute acts and variety shows.' WHERE id = 'f7d48da1-6571-4465-8cb9-dca3351255af';

-- Phil Hanley | Mark Ridley's Comedy Castle | 2026-10-23 9:45 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stand-up set from Phil Hanley, a Canadian comedian known for his deadpan style, his memoir ''Spellbound'' about growing up with dyslexia, and TV roles including Hulu''s ''Life & Beth.''' WHERE id = 'd9dfa686-0c80-4e1e-a1b1-c4b101b6f5a9';

-- YYNOT - Classic RUSH Tribute and Prog Rock Originals, Pound Town Prophet | The Token Lounge | 2026-10-23 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by YYNOT, a band performing tributes to the progressive rock trio Rush alongside their own original prog-rock material, with support from Pound Town Prophet.' WHERE id = 'af03c936-4a00-4d6e-8e01-8dc8c55845a4';

-- JOHNNYSWIM: Greetings from Georgica Pond | Flagstar Strand Theatre for the Performing Arts | 2026-10-23 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by JOHNNYSWIM, the husband-and-wife folk-pop duo Abner Ramirez and Amanda Sudano Ramirez, known for soulful harmonies on songs like ''Home'' and ''Let It Happen.''' WHERE id = 'd5b3eaf6-9e48-4de7-8b55-3198aaaa60ab';

-- Noise Pollution - The AC/DC Experience | Emerald Theatre | 2026-10-23 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A tribute concert by Noise Pollution, a band recreating the high-voltage sound and stage show of AC/DC for fans of the iconic Australian rock band.' WHERE id = 'e34022dd-5417-444b-8d20-a487c154e99d';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-23 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stage adaptation of ''The Man Who Shot Liberty Valance,'' the classic Western tale of a lawman, an outlaw, and a frontier town''s reckoning with justice, presented as part of Meadow Brook Theatre''s season.' WHERE id = 'f3129416-d064-4f2f-bf4e-4457845f6895';

-- 2000's Hip-Hop Rewind feat. Travis Porter | Diamondback Music Hall | 2026-10-23 9:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A 2000s hip-hop throwback concert headlined by Travis Porter, the Atlanta trio known for club hits like ''Make It Rain'' and ''Ayy Ladies.''' WHERE id = 'bd3d51e9-fdae-44b4-a3d9-5f2bf30b42c0';

-- HARBOUR | Blind Pig | 2026-10-23 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live performance by Harbour, a touring band making a stop at the Blind Pig as part of the venue''s regular lineup of independent and emerging musical acts.' WHERE id = 'f5616d60-e49a-4123-ae02-448f15e33fd5';

-- Whethan - WAREHOUSE.WAVS TOUR - (Ages 18+) | Majestic Theatre-MI | 2026-10-24 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Whethan, the American electronic music producer and DJ, on his WAREHOUSE.WAVS tour showcasing his genre-blending dance productions; this show is for ages 18 and over.' WHERE id = '09ff9275-5a3a-4ae1-91d6-ec1c90669e88';

-- Jo Koy: Koy Meets World Tour | Fox Theatre Detroit | 2026-10-24 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stand-up comedy show by Jo Koy, the Filipino-American comedian known for his family-centered storytelling, Netflix specials, and sold-out arena tours.' WHERE id = '335329a4-a08e-48fc-a6e4-a166f56d31ad';

-- Jo Koy - Suite Rental | Fox Theatre Detroit | 2026-10-24 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A premium suite ticket package for Jo Koy''s stand-up comedy performance at the Fox Theatre Detroit, offering elevated seating and amenities for the same show.' WHERE id = '51c10b13-7e46-46e3-bafe-c47ddb1ef5f8';

-- Plini - An Unnameable Desire North American Tour | Saint Andrew's Hall | 2026-10-24 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Plini, the Australian instrumental progressive rock guitarist celebrated for his intricate, atmospheric compositions and virtuosic playing.' WHERE id = '0c09a522-7066-42ac-b000-c928c64aa5a7';

-- Bethel Music | Royal Oak Music Theatre | 2026-10-24 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Bethel Music, the contemporary Christian worship collective associated with Bethel Church in Redding, California, known for songs like ''No Longer Slaves'' and ''Goodness of God.''' WHERE id = '1458401b-86d0-4ee9-b2b8-3e68aedfaad6';

-- Icon For Hire: Scripted 15 Year Anniversary Tour | TSDMAAC (Catacombs) | 2026-10-24 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Icon For Hire, the alternative rock band fronted by Ariel Bloomer, marking the 15th anniversary of their breakout album ''Scripted.''' WHERE id = 'eccaafec-b585-43cf-89cd-21f11281c688';

-- Brother Ali | The Loving Touch | 2026-10-24 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Brother Ali, the Minneapolis rapper and longtime Rhymesayers Entertainment artist known for his socially conscious lyrics and powerful live delivery.' WHERE id = '5b4a2ab4-f9b9-4ec9-bd35-852c6acc64ea';

-- Michigan Wolverines Football vs. Indiana Hoosiers Football | Michigan Stadium | 2026-10-24 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Big Ten Conference football matchup between the Michigan Wolverines and the Indiana Hoosiers, played at Michigan Stadium in Ann Arbor.' WHERE id = '05eef8ee-38bb-419c-977e-7083e8d0dc99';

-- Kickstand Productions Presents The Army, The Navy w/ Ella Woolsey | The Magic Bag | 2026-10-24 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by The Army, The Navy, a touring rock band, with support from singer-songwriter Ella Woolsey, presented by Kickstand Productions at The Magic Bag.' WHERE id = '7ce2b296-7679-4d35-80db-6ed7474d6cd2';

-- The Billy Joel Experience | Andiamo Celebrity Showroom | 2026-10-24 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A tribute concert by The Billy Joel Experience, recreating the songs and piano-driven showmanship of Billy Joel''s classic catalog for a live audience.' WHERE id = 'b85797f7-dd77-4425-ba71-f7e4b40bec0f';

-- Phil Hanley | Mark Ridley's Comedy Castle | 2026-10-24 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stand-up set from Phil Hanley, a Canadian comedian known for his deadpan style, his memoir ''Spellbound'' about growing up with dyslexia, and TV roles including Hulu''s ''Life & Beth.''' WHERE id = 'a4d3128e-b0c4-46c4-a3eb-4b89cece416d';

-- Trapt | The Token Lounge | 2026-10-24 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Trapt, the post-grunge rock band best known for their 2003 breakout single ''Headstrong,'' which became a staple of early-2000s rock radio.' WHERE id = '9d762da0-9fb8-4c6c-885c-a05eb960a87a';

-- Halloween Masquerade Party VAN HAVEN , Tribute to VAN HALEN | The Token Lounge | 2026-10-24 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Halloween-themed masquerade concert featuring Van Haven, a tribute band recreating the music and high-energy showmanship of Van Halen.' WHERE id = '2100d659-7e75-40d3-a31f-6972372a1282';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-24 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stage adaptation of ''The Man Who Shot Liberty Valance,'' the classic Western tale of a lawman, an outlaw, and a frontier town''s reckoning with justice, presented as part of Meadow Brook Theatre''s season.' WHERE id = '27e82a9e-1595-47eb-b83e-35679b131f5e';

-- John Foster | Flagstar Strand Theatre for the Performing Arts | 2026-10-24 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by John Foster, the country singer from Addis, Louisiana who rose to national fame as the runner-up on ''American Idol'' season 23 in 2025.' WHERE id = '7796a325-15a5-487a-b569-cb0b11db6117';

-- Oakland University Golden Grizzlies Volleyball vs. Cleveland State University Volleyball | OU Credit Union O'rena | 2026-10-24 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Horizon League women''s volleyball match between the Oakland University Golden Grizzlies and the Cleveland State Vikings, played at the O''rena in Rochester, Michigan.' WHERE id = '58b171e7-7674-4438-a145-ac39e5e71727';

-- Blade Rave | Blind Pig | 2026-10-24 9:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stop on the Blade Rave tour, a touring vampire-themed dance party and DJ event combining electronic music with an immersive gothic aesthetic and stage production.' WHERE id = 'c33b7243-c6e7-4d22-b2a4-379ca1bb2d14';

-- Toledo Rockets Football vs. Western Michigan Broncos Football | Glass Bowl Stadium | 2026-10-24 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Mid-American Conference football game between the Toledo Rockets and the Western Michigan Broncos, played at the Glass Bowl in Toledo, Ohio.' WHERE id = '9685d2df-55d6-46aa-8ca9-d85638b25fa2';

-- Detroit Lions vs. Green Bay Packers | Ford Field | 2026-10-25 4:25 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An NFL regular-season matchup between the Detroit Lions and the Green Bay Packers, longtime NFC North division rivals, played at Ford Field in Detroit.' WHERE id = '8be77a1b-d8d0-4720-909e-994c65145c22';

-- Judah & the Lion | Saint Andrew's Hall | 2026-10-25 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Judah & the Lion, the Nashville folk-rock band known for blending banjo and mandolin with pop and rock energy on hits like ''Suit and Jacket.''' WHERE id = 'ca2f64dc-b31c-4f9a-b676-5e0097263055';

-- Jonas Brothers: The Burning Up Tour All Over Again | Little Caesars Arena | 2026-10-25 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by the Jonas Brothers, the pop-rock trio of Nick, Joe, and Kevin Jonas, revisiting their early-career sound on a tour celebrating their breakout hits.' WHERE id = '62923d11-1606-4b62-a23a-6037a45342fa';

-- Winger | Sound Board at MotorCity Casino Hotel | 2026-10-25 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Winger, the 1980s hard rock band fronted by Kip Winger, known for hits like ''Seventeen'' and ''Headed for a Heartbreak.''' WHERE id = '617ca5ac-e56d-47d2-a857-ea5935a648ee';

-- Bowling Green Falcons Womens Basketball vs. Ohio Dominican Panthers Womens Basketball | Small's | 2026-10-25 Evening | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A non-conference women''s college basketball game between the Bowling Green Falcons and the Ohio Dominican Panthers, part of the preseason exhibition slate.' WHERE id = 'fe5f29d6-0f54-49af-b563-c57a23ed26f6';

-- Paledusk, Headwreck, Slow Degrade | TSDMAAC | 2026-10-25 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert featuring Paledusk, the Japanese metalcore band on a headlining North American tour, with support from Headwreck and Slow Degrade.' WHERE id = 'aaa2f430-5c49-4dc0-9651-f219ae623d5f';

-- Kickstand Productions Presents: Rehash w/ The Flooks | The Magic Bag | 2026-10-25 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A concert by Rehash, a high-energy rock band described by peers as young and hard-hitting, with support from The Flooks, presented by Kickstand Productions.' WHERE id = '5f5c43a2-5fe6-4d3a-9f4f-ab684ea2d4ab';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-25 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A stage adaptation of ''The Man Who Shot Liberty Valance,'' the classic Western tale of a lawman, an outlaw, and a frontier town''s reckoning with justice, presented as part of Meadow Brook Theatre''s season.' WHERE id = '927d18f7-162d-4d7e-9d9b-c059d9becbda';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-25 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A staging of Jethro Compton''s play adapted from Dorothy M. Johnson''s classic Western short story, following a young lawyer who runs afoul of a ruthless outlaw in a lawless frontier town. Presented by Meadow Brook Theatre in Rochester, Michigan.' WHERE id = 'c4b56ddb-552e-4315-9f0c-6982ef92db8e';

-- Baby Bugs with Special Guest Elliot Lee | Pike Room @ The Crofoot | 2026-10-25 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live music show in the Pike Room at The Crofoot in Pontiac, featuring Baby Bugs with special guest Elliot Lee.' WHERE id = '0cfb5d43-3928-45f2-a352-5933b11c649f';

-- Oakland University Women's Soccer vs. Northern Kentucky Women's Soccer | Oakland Soccer Field | 2026-10-25 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Horizon League women''s soccer match as the Oakland University Golden Grizzlies host the Northern Kentucky Norse at Oakland Soccer Field.' WHERE id = '456b1ef3-318d-4453-80ac-605dae4485f4';

-- Old Crow Medicine Show w/ The Steel Wheels | Stranahan Theatre | 2026-10-26 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Grammy-winning Americana string band Old Crow Medicine Show, known for old-time roots music and the hit "Wagon Wheel," performs with support from Virginia bluegrass-Americana act The Steel Wheels.' WHERE id = 'b466e706-038d-4382-bca4-858d53fe4e9c';

-- Detroit Pistons v Charlotte Hornets | Little Caesars Arena | 2026-10-28 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NBA regular-season action as the Detroit Pistons host the Charlotte Hornets at Little Caesars Arena.' WHERE id = 'fcd6f043-05d5-42ec-b391-0cb6da1c3ac7';

-- Quadeca | Saint Andrew's Hall | 2026-10-28 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Quadeca (Benjamin Lasky), the genre-blending rapper and alt-artist behind acclaimed albums like "I Didn''t Mean to Haunt You" and "Vanisher," performs live at Saint Andrew''s Hall.' WHERE id = '379a7fea-f7dc-44d3-85fb-2e4919f7ffda';

-- Zanias and Automelodi with special guests Sleek Teeth | Small's | 2026-10-28 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A darkwave and minimal-synth double bill at Small''s, pairing Australian-born darkwave vocalist Zanias with Montreal synth artist Automelodi, plus support act Sleek Teeth.' WHERE id = 'b3f1ba61-4462-4fd8-a66e-4530a734ca2a';

-- The Number Twelve Looks Like You, Kaonashi, Differences | TSDMAAC (Crypt) | 2026-10-28 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A heavy mathcore and metalcore lineup at TSDMAAC (The Crypt), featuring longtime New Jersey mathcore act The Number Twelve Looks Like You alongside Kaonashi and Differences.' WHERE id = 'ae721e15-a4de-4524-9f64-d00f5a3491e9';

-- Sleeping with Sirens w/ Rain City Drive | Royal Oak Music Theatre | 2026-10-28 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Post-hardcore/rock band Sleeping with Sirens, known for hits like "If You Can''t Hang," performs at Royal Oak Music Theatre with support from Rain City Drive.' WHERE id = '1ea107f2-5ed8-4bae-b50e-5f0133482037';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-28 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A matinee staging of Jethro Compton''s play adapted from Dorothy M. Johnson''s classic Western short story, following a young lawyer who runs afoul of a ruthless outlaw in a lawless frontier town. Presented by Meadow Brook Theatre.' WHERE id = '62830d81-5b2f-4eb6-afb3-e04cf498f9e9';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-28 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An evening staging of Jethro Compton''s play adapted from Dorothy M. Johnson''s classic Western short story, following a young lawyer who runs afoul of a ruthless outlaw in a lawless frontier town. Presented by Meadow Brook Theatre.' WHERE id = '5908a819-5898-4e7b-b709-1470b598ae9f';

-- USA Hockey National Team Development Program vs. Muskegon Lumberjacks | USA Hockey Arena | 2026-10-28 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'USA Hockey''s National Team Development Program (the U.S. junior national team based in Plymouth, Michigan) faces the USHL''s Muskegon Lumberjacks at USA Hockey Arena.' WHERE id = '8796a800-16ae-400a-89e2-c4da45fba718';

-- The Damned w/ Flamin Groovies | Majestic Theatre-MI | 2026-10-29 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Pioneering British punk band The Damned, known for "New Rose" and "Smash It Up," plays the Majestic Theatre with support from garage-rock veterans The Flamin'' Groovies.' WHERE id = '656da9b0-31e4-48a4-a87f-f2f8c5bab3b3';

-- Detroit Red Wings vs. Chicago Blackhawks | Little Caesars Arena | 2026-10-29 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NHL regular-season hockey as the Detroit Red Wings host the Chicago Blackhawks at Little Caesars Arena.' WHERE id = '7e12e5cd-7920-475f-b11b-e9371f7359ec';

-- Rodrigo y Gabriela - OurHome Tour | The Fillmore Detroit | 2026-10-29 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Mexican instrumental guitar duo Rodrigo y Gabriela, known for blending flamenco, rock and metal influences into their acoustic sound, bring their OurHome Tour to The Fillmore Detroit.' WHERE id = '9ca000a1-9105-493e-835c-be7a247b7280';

-- SiM - HOOMAN WORLD TOUR | Saint Andrew's Hall | 2026-10-29 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Japanese rock band SiM, known for blending reggae, punk and metalcore and for the viral anime theme song "The Name" (from Jujutsu Kaisen), bring their HOOMAN WORLD TOUR to Saint Andrew''s Hall.' WHERE id = '50bf9aec-eee5-44a5-8480-093fb96f535e';

-- Beat | Masonic Temple - Detroit | 2026-10-29 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'BEAT, the supergroup of Adrian Belew, Steve Vai and Tony Levin joined by drummer Terry Bozzio, performs the early-1980s King Crimson catalog (the Discipline/Beat/Three of a Perfect Pair era) live at the Masonic Temple.' WHERE id = '62cd9eab-041a-4b5b-acac-71a5d78d6a68';

-- Goddamn Gallows with Go Hang + Vlad’s Skeletal Circus | Small's | 2026-10-29 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Michigan-rooted gypsy-punk band Goddamn Gallows, known for mixing punk, bluegrass and metal, plays Small''s with support from Go Hang and Vlad''s Skeletal Circus.' WHERE id = '0f5e4bbd-fa57-4b9c-a3b5-9834c0478d48';

-- Kickstand Productions Presents Zauntee: God Remembers Tour | The Loving Touch | 2026-10-29 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Christian hip-hop artist Zauntee, signed to Atlantic Records and a multiple Dove Award nominee, brings his God Remembers Tour to The Loving Touch, presented by Kickstand Productions.' WHERE id = '6e0336fa-b78f-4250-bd1d-28f58044479d';

-- Marshall Crenshaw | The Magic Bag | 2026-10-29 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Veteran power-pop singer-songwriter Marshall Crenshaw, best known for his 1982 hit "Someday, Someway," performs at The Magic Bag.' WHERE id = 'efcce5ed-0ef2-497c-b4a1-92187519eef5';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-29 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An evening staging of Jethro Compton''s play adapted from Dorothy M. Johnson''s classic Western short story, following a young lawyer who runs afoul of a ruthless outlaw in a lawless frontier town. Presented by Meadow Brook Theatre.' WHERE id = '2cb8da76-cd78-4866-aee0-6ff6aa98b925';

-- Blue October: The Foiled 20th Anniversary World Tour | The Fillmore Detroit | 2026-10-30 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Texas alt-rock band Blue October marks the 20th anniversary of their breakthrough album "Foiled," home to the hit "Hate Me," on their Foiled 20th Anniversary World Tour at The Fillmore Detroit.' WHERE id = 'ba5b848a-bc2f-400c-9dd1-b9a0b2bda0ca';

-- Twiztid | Saint Andrew's Hall | 2026-10-30 5:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Horrorcore hip-hop duo Twiztid, of Detroit''s Psychopathic Records label founded by Insane Clown Posse, performs at Saint Andrew''s Hall.' WHERE id = '6332a7c2-b143-449d-9edd-d8e66adebc6b';

-- MotorCity Cage Night XXVI | Sound Board at MotorCity Casino Hotel | 2026-10-30 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'MotorCity Cage Night XXVI, a local mixed martial arts fight card, is held at Sound Board inside MotorCity Casino Hotel.' WHERE id = '3d3d8e71-2c2e-43c9-8baa-6431ab2e3e64';

-- The Lalas Burlesque Show | MGM Grand Detroit Event Center | 2026-10-30 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'The Lalas Burlesque Show brings a variety night of burlesque dance, costume and comedic performance to the MGM Grand Detroit Event Center.' WHERE id = '8dbcc27d-5135-4c4c-beb2-f88e070ac497';

-- Cortisa Star - For All The Dolls Tour | TSDMAAC (Crypt) | 2026-10-30 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Cortisa Star, the trans rapper who rose to viral fame on TikTok for her bold, unapologetic style, brings her For All The Dolls Tour to TSDMAAC (The Crypt).' WHERE id = '81776164-3a72-4876-90be-00918ad40f4c';

-- Highway to Hell - an 80's Hair Metal / Glam Dance Party | The Loving Touch | 2026-10-30 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Highway to Hell is a themed dance party at The Loving Touch spinning 1980s hair metal and glam rock hits rather than a live tribute performance.' WHERE id = 'abf256c6-8861-498d-8837-49669538be4d';

-- Magic Bag Presents: Mark Farina | The Magic Bag | 2026-10-30 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Chicago house DJ and producer Mark Farina, known for pioneering the mellow downtempo "mushroom jazz" sound alongside classic house sets, plays The Magic Bag.' WHERE id = '9480d4d2-7662-4eec-8dd8-4b4cf552edc2';

-- NIRVANA GRUNGE NIGHT - The Ultimate Grunge Experience with Seven Circle Sunrise | District 142 | 2026-10-30 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Nirvana Grunge Night bills itself as "The Ultimate Grunge Experience," a Nirvana-focused tribute/dance event at District 142 with support from Seven Circle Sunrise.' WHERE id = '8b7e2333-c413-4487-9d04-d557b26668d7';

-- Dweezil Zappa w/ Like Father | Royal Oak Music Theatre | 2026-10-30 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Guitarist Dweezil Zappa, son of Frank Zappa, performs his father''s intricate catalog live with his band at Royal Oak Music Theatre, with support from Like Father.' WHERE id = '7688f5db-de49-487c-979a-561ea41e5afc';

-- Ten Years Gone - Tribute to Led Zeppelin | The Token Lounge | 2026-10-30 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Ten Years Gone is a Led Zeppelin tribute act recreating the classic rock band''s catalog live at The Token Lounge.' WHERE id = 'c48e7a26-c7b6-414b-bfb8-adab1e7f8b92';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-30 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An evening staging of Jethro Compton''s play adapted from Dorothy M. Johnson''s classic Western short story, following a young lawyer who runs afoul of a ruthless outlaw in a lawless frontier town. Presented by Meadow Brook Theatre.' WHERE id = '74ae4c30-bad1-4689-8b43-fc63a509b58a';

-- King 810 | The Crofoot Ballroom | 2026-10-30 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'King 810, the aggressive metal/hardcore band from Flint, Michigan known for lyrics drawn from their hometown''s struggles, performs at The Crofoot Ballroom.' WHERE id = '57a7ff42-e433-4fe4-83c6-818b2676efdc';

-- Oakland University Men's Soccer vs. Northern Kentucky Mens Soccer | Oakland Soccer Field | 2026-10-30 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Horizon League men''s soccer match as the Oakland University Golden Grizzlies host the Northern Kentucky Norse at Oakland Soccer Field.' WHERE id = '88544a53-0fa7-49b7-ab59-a9dc9f4bad40';

-- Oakland University Golden Grizzlies Volleyball vs. University of Wisconsin-Milwaukee Volleyball | OU Credit Union O'rena | 2026-10-30 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Horizon League volleyball as the Oakland University Golden Grizzlies host the University of Wisconsin-Milwaukee Panthers at the OU Credit Union O''rena.' WHERE id = 'a3b99ee3-b659-4853-9d6f-e09ef7bd2201';

-- Michigan Wolverines Womens Volleyball vs. Nebraska Cornhuskers Womens Volleyball | Crisler Center | 2026-10-30 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Big Ten volleyball as the Michigan Wolverines host the Nebraska Cornhuskers, one of the sport''s perennial national powers, at Crisler Center.' WHERE id = '3ff7ed45-8050-45f1-8e62-85bfa22b6fd7';

-- Lilyisthatyou - The Flowers Have Feelings Tour, James the Seventh | Blind Pig | 2026-10-30 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Indie/bedroom-pop artist lilyisthatyou brings The Flowers Have Feelings Tour, in support of new music, to the Blind Pig with support from James the Seventh.' WHERE id = 'c9fb7cef-ef7e-43db-aaa5-1bc781ff06d4';

-- Assala Nasri | Fox Theatre Detroit | 2026-10-31 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Syrian-born singer Assala Nasri, one of the most celebrated voices in Arabic pop and among the first Syrian artists to achieve pan-Arab stardom, performs at the Fox Theatre Detroit.' WHERE id = 'cbf24eeb-b22a-4fef-a98c-3878b666d400';

-- Assala Nasri - Suite Rental | Fox Theatre Detroit | 2026-10-31 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A premium suite ticket package for Syrian-born singer Assala Nasri''s concert at the Fox Theatre Detroit, one of the most celebrated voices in Arabic pop.' WHERE id = '9730173d-157a-4c39-bb91-86e6465db31f';

-- Detroit Red Wings vs. St. Louis Blues | Little Caesars Arena | 2026-10-31 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NHL regular-season hockey as the Detroit Red Wings host the St. Louis Blues at Little Caesars Arena.' WHERE id = 'd934518d-1e6d-40f0-b6e5-49bbeeedf170';

-- Alicia Villarreal - Bendita Locura Tour 2026 | The Fillmore Detroit | 2026-10-31 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Mexican regional singer Alicia Villarreal, former lead vocalist of Grupo Limite, brings her Bendita Locura Tour to The Fillmore Detroit.' WHERE id = '51a774c5-9a92-4ca0-aa27-258566b6a507';

-- L7: The Last Hurrah Tour 2026 | Saint Andrew's Hall | 2026-10-31 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'L7, the Los Angeles all-female rock/grunge band known for "Pretend We''re Dead," bring their Last Hurrah Tour 2026 to Saint Andrew''s Hall.' WHERE id = 'e539e128-72d5-402b-b32d-e16e80c9dfaf';

-- Insane Clown Posse | Masonic Temple - Detroit | 2026-10-31 3:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Detroit horrorcore hip-hop duo Insane Clown Posse (Violent J and Shaggy 2 Dope), founders of Psychopathic Records and the Gathering of the Juggalos, perform at the Masonic Temple.' WHERE id = 'd0079a73-8481-414e-80ba-4046187136c2';

-- Magic Bag Presents: 80s vs 90s - HELLABALOO | District 142 | 2026-10-31 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'HELLABALOO, presented by The Magic Bag, is an 80s-vs-90s themed dance party at District 142 spinning hits and deep cuts from both decades for a costume-friendly crowd.' WHERE id = '73e19c38-f7db-4468-9dbc-fadc3a4524f7';

-- The Prince Experience Starring Gabriel Sanchez | The Token Lounge | 2026-10-31 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'The Prince Experience, a tribute act led by Gabriel Sanchez recreating the music and stage presence of Prince, performs at The Token Lounge.' WHERE id = '65d780bf-fd43-4a55-be91-f342245094fd';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-31 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A matinee staging of Jethro Compton''s play adapted from Dorothy M. Johnson''s classic Western short story, following a young lawyer who runs afoul of a ruthless outlaw in a lawless frontier town. Presented by Meadow Brook Theatre.' WHERE id = 'ee696b8a-93cd-4d40-8d1a-dffed3179f61';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-10-31 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'An evening staging of Jethro Compton''s play adapted from Dorothy M. Johnson''s classic Western short story, following a young lawyer who runs afoul of a ruthless outlaw in a lawless frontier town. Presented by Meadow Brook Theatre.' WHERE id = 'd31dee58-5be7-47a2-9888-c437fa6de928';

-- Claudio Simonetti's Goblin with a screening of Tenebrae | The Crofoot Ballroom | 2026-10-31 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Claudio Simonetti, founding member of Italian prog-rock band Goblin, performs the group''s scores live alongside a screening of Dario Argento''s 1982 horror film "Tenebrae," which Goblin scored, at The Crofoot Ballroom.' WHERE id = '7a733ae4-ebc0-4c69-a075-a5d2e02fc76e';

-- Oakland University Women's Soccer vs. Detroit Mercy Titans Women's Soccer | Oakland Soccer Field | 2026-10-31 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Horizon League women''s soccer match as the Oakland University Golden Grizzlies host the Detroit Mercy Titans at Oakland Soccer Field.' WHERE id = 'edab7af1-84b5-4fde-943c-aec04eeac099';

-- Oakland University Golden Grizzlies Volleyball vs. University of Wisconsin-Milwaukee Volleyball | OU Credit Union O'rena | 2026-10-31 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Horizon League volleyball as the Oakland University Golden Grizzlies host the University of Wisconsin-Milwaukee Panthers at the OU Credit Union O''rena.' WHERE id = '653f7b86-621c-4d92-a9a0-17a3308d6e80';

-- Michigan Wolverines Womens Volleyball vs. Indiana Hoosiers Womens Volleyball | Crisler Center | 2026-10-31 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Big Ten volleyball as the Michigan Wolverines host the Indiana Hoosiers in conference play at Crisler Center in Ann Arbor.' WHERE id = '0035d0ae-a162-46fc-8a58-d4ede5cde12b';

-- Pajamas Performing The Music of David Bowie | Blind Pig | 2026-10-31 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Pajamas is a tribute band performing the music of David Bowie live, recreating songs and stage flair from across Bowie''s decades-spanning catalog at the Blind Pig.' WHERE id = 'a570b857-e211-4735-9728-4d3cf490f2e0';

-- MANÁ: VIVIR SIN AIRE TOUR | Little Caesars Arena | 2026-11-01 9:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Maná, one of the best-selling Latin rock bands of all time, brings their Vivir Sin Aire Tour — named for their classic hit — to Little Caesars Arena.' WHERE id = '479823d0-0ac8-4cf9-a391-21a7b321cb1b';

-- Amble | Saint Andrew's Hall | 2026-11-01 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Irish folk trio Amble, known for their storytelling-driven contemporary folk songwriting, performs at Saint Andrew''s Hall.' WHERE id = '4ff21169-ede9-4686-bbb7-59347cb62434';

-- Detroit Lions vs. Minnesota Vikings | Ford Field | 2026-11-01 1:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NFL action as the Detroit Lions host the Minnesota Vikings in an NFC North divisional matchup at Ford Field.' WHERE id = 'fa26c788-96f4-48e1-9a72-1eeec282fa55';

-- THE MAN WHO SHOT LIBERTY VALANCE | Meadow Brook Theatre | 2026-11-01 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A matinee staging of Jethro Compton''s play adapted from Dorothy M. Johnson''s classic Western short story, following a young lawyer who runs afoul of a ruthless outlaw in a lawless frontier town. Presented by Meadow Brook Theatre.' WHERE id = '786fb897-d65d-4399-9f01-c384198727eb';

-- JOURNEY - Final Frontier Tour (An Evening With) | Little Caesars Arena | 2026-11-02 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Legendary arena rock band Journey, known for hits like ''Don''t Stop Believin'''' and ''Any Way You Want It,'' bring their Final Frontier farewell tour to Little Caesars Arena in a full ''evening with'' set.' WHERE id = '2bd96a8a-a243-4b46-8992-d11be5e46d96';

-- Bowling Green Falcons Womens Basketball vs. Georgia Southern Eagles Womens Basketball | Stroh Center | 2026-11-02 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NCAA women''s college basketball as the Bowling Green Falcons host the Georgia Southern Eagles at Stroh Center, a nonconference matchup between Mid-American Conference and Sun Belt programs.' WHERE id = '12761fc9-8b5e-49a7-a97f-e531e74e6c18';

-- Big Ass Truck I.E., Chamber, Mugshot, Surfaced | TSDMAAC | 2026-11-02 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Hardcore band Big Ass Truck I.E. headlines a night of heavy music at TSDMAAC with support from fellow metalcore/hardcore acts Chamber, Mugshot, and Surfaced, part of their fall 2026 North American tour.' WHERE id = 'a299bd9a-da64-45d4-a982-2b5cadac8984';

-- KATSEYE: THE WILDWORLD TOUR | Little Caesars Arena | 2026-11-03 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'International pop group KATSEYE, formed through the HYBE x Geffen ''Dream Academy'' project, brings its global-spanning Wildworld Tour to Little Caesars Arena.' WHERE id = 'bd36189c-caed-4a16-85ad-75414329816d';

-- 20 Years of Nekrogoblikon with Special Guests Aborted | Saint Andrew's Hall | 2026-11-03 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedic melodic death metal act Nekrogoblikon celebrates 20 years as a band with a headline show at Saint Andrew''s Hall, joined by Belgian death metal veterans Aborted.' WHERE id = '8e6b5d49-8651-4695-8218-b90a077a423a';

-- The Paradox | TSDMAAC (Catacombs) | 2026-11-03 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Paradox, a fast-rising pop-punk band whose viral videos and high-energy live shows have drawn national attention, performs in the Catacombs room at TSDMAAC.' WHERE id = 'd1846b30-c3c9-405c-8eda-edef72181d98';

-- Wheel Of Fortune - Live! | Michigan Theater | 2026-11-03 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A touring live stage version of the classic TV game show ''Wheel of Fortune,'' bringing audience members up to spin the wheel and solve puzzles for prizes at the Michigan Theater.' WHERE id = '65f68d86-4cfb-40db-ae1e-f329553ec43d';

-- Motor City MACtion | Ford Field | 2026-11-04 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Motor City MACtion brings Mid-American Conference college football to Ford Field, with the Eastern Michigan Eagles taking on the Central Michigan Chippewas in a rivalry matchup relocated to the NFL stadium.' WHERE id = '34835aea-b34c-4956-86ec-1452d38f60a2';

-- Static Dress - Injury Episode USA Tour | Saint Andrew's Hall | 2026-11-04 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UK post-hardcore/emo band Static Dress brings its Injury Episode USA Tour to Saint Andrew''s Hall, showcasing the Leeds group''s intense, emotionally raw live sound.' WHERE id = '47eb96e0-7b9a-4894-848e-db13898f80db';

-- Detroit Pistons v Philadelphia 76ers | Little Caesars Arena | 2026-11-04 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NBA action as the Detroit Pistons host the Philadelphia 76ers at Little Caesars Arena in regular-season play.' WHERE id = 'e895c1cc-3d2e-4ee3-b5fd-9b7d6dd089cb';

-- Static Dress - Injury Episode USA Tour | The Shelter | 2026-11-04 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UK post-hardcore/emo band Static Dress brings its Injury Episode USA Tour to The Shelter, showcasing the Leeds group''s intense, emotionally raw live sound.' WHERE id = 'e7b85bc8-4eaa-44bb-9ea7-ba30111420c8';

-- The Surfrajettes | Small's | 2026-11-04 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Surfrajettes, a Toronto-based all-female surf-rock band known for their retro ''60s go-go style and reverb-heavy instrumentals, play a live set at Small''s.' WHERE id = '77f215ca-7c30-4d5d-9b6a-13caba9ea33f';

-- Arch Enemy w/ The Black Dahlia Murder | Royal Oak Music Theatre | 2026-11-04 5:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Melodic death metal veterans Arch Enemy bring their signature dual-guitar, growled-vocal sound to Royal Oak Music Theatre, with support from The Black Dahlia Murder.' WHERE id = 'b723882f-d35e-44da-91e3-5ccb0732b598';

-- Eastern Michigan Eagles Football vs. Central Michigan Chippewas Football | Rynearson Stadium | 2026-11-04 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'College football as the Eastern Michigan Eagles face the Central Michigan Chippewas, a Mid-American Conference matchup on the schedule for Rynearson Stadium.' WHERE id = '92aa5d7c-ea77-49f5-8a2e-a6c1888d9fd7';

-- Chat Pile w/ Soul Glo | Majestic Theatre-MI | 2026-11-05 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Oklahoma noise-rock/sludge band Chat Pile, known for their abrasive, socially charged sound, headlines Majestic Theatre with Philadelphia hardcore-punk act Soul Glo in support.' WHERE id = '2bfffaf5-821a-49ce-9f42-8bafae4abf28';

-- The String Cheese Incident: Just Keep Spinning Tour | The Fillmore Detroit | 2026-11-05 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Colorado jam band The String Cheese Incident, blending bluegrass, rock, and electronic influences, brings its ''Just Keep Spinning'' tour to The Fillmore Detroit.' WHERE id = '6a2e36f0-e6a0-43d9-a3a5-aa18baa4b790';

-- Detroit Red Wings vs. Vegas Golden Knights | Little Caesars Arena | 2026-11-05 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NHL regular-season action as the Detroit Red Wings host the Vegas Golden Knights at Little Caesars Arena in a matchup between Original Six and expansion-era franchises.' WHERE id = 'b446f0ad-840e-4e1b-b62f-d00b6d6cb039';

-- Bowling Green Falcons Womens Basketball vs. Cleveland State Vikings Womens Basketball | Stroh Center | 2026-11-05 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NCAA women''s college basketball as the Bowling Green Falcons host the Cleveland State Vikings at Stroh Center in nonconference play.' WHERE id = '2689f9d8-4bda-4802-b603-71ba7e123342';

-- Millionaire$ wsg Davvn | TSDMAAC | 2026-11-05 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Electropop/scene duo Millionaire$ (originally known simply as Millionaires) performs at TSDMAAC with support from Davvn, bringing their high-energy, dance-pop-leaning live show.' WHERE id = '179435d2-1603-4faa-a08a-c2e4b445eaba';

-- Charles Wesley Godwin | Royal Oak Music Theatre | 2026-11-05 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'West Virginia singer-songwriter Charles Wesley Godwin, known for his Appalachian-rooted country and Americana sound, performs live at Royal Oak Music Theatre.' WHERE id = '639361f0-b765-4ed2-b013-489de7b0d7c0';

-- Michigan Wolverines Womens Basketball vs. UConn Huskies Womens Basketball | Crisler Center | 2026-11-05 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Women''s college basketball as the Michigan Wolverines host the UConn Huskies at Crisler Center, a marquee nonconference matchup against one of the sport''s most storied programs.' WHERE id = '559fe762-2a9b-40a4-a4a0-a51839f49fd5';

-- Bert Kreischer | Stranahan Theatre | 2026-11-05 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Stand-up comedian Bert Kreischer, known for his ''Machine'' story, raucous storytelling style, and 2 Bears 1 Cave podcast, brings his live show to Stranahan Theatre.' WHERE id = 'bb3796b0-bb07-4681-9e80-a506fd55f086';

-- Don Lemon w/ D. L. Hughley | Jack White Theatre at the Masonic Temple - Detroit | 2026-11-06 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Former CNN anchor Don Lemon and comedian D.L. Hughley bring their ''DL + DL: Anything Goes'' live show to the Jack White Theatre, mixing news commentary, culture talk, and comedy.' WHERE id = '0b8b2f8e-1075-4206-89f0-03c946bb5714';

-- Zac Brown Band: Love & Fear Tour | Little Caesars Arena | 2026-11-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country/southern rock hitmakers Zac Brown Band, known for songs like ''Chicken Fried'' and ''Toes,'' play Little Caesars Arena on their Love & Fear Tour.' WHERE id = '34c5ae48-1a04-4762-bf6d-0c5459df3cb3';

-- Jodeci - 35th Anniversary Tour of Forever My Lady | Fox Theatre Detroit | 2026-11-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'R&B quartet Jodeci celebrates the 35th anniversary of their debut album ''Forever My Lady'' with a live performance at Fox Theatre Detroit, revisiting the new jack swing hits that launched their career.' WHERE id = '7a82db7e-18ff-49f6-abeb-e8c5ef104af1';

-- Nurse John: Against Medical Advice Tour | The Fillmore Detroit | 2026-11-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Nurse-turned-comedian John Dela Cruz, known online as Nurse John for his viral healthcare-themed comedy, brings his ''Against Medical Advice'' stand-up tour to The Fillmore Detroit.' WHERE id = '43c45194-c7f6-43bb-8be3-04519a4a47fa';

-- Nurse John: Against Medical Advice Tour | The Fillmore Detroit | 2026-11-06 9:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A second, later show of nurse-turned-comedian John Dela Cruz''s (Nurse John) ''Against Medical Advice'' stand-up tour at The Fillmore Detroit, built around his viral healthcare-themed comedy.' WHERE id = '8294ddb7-c471-4916-90d3-d17b7e4f650f';

-- Eddie Griffin | Sound Board at MotorCity Casino Hotel | 2026-11-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian and actor Eddie Griffin, known for stand-up specials, Def Comedy Jam appearances, and roles including ''Undercover Brother,'' performs at Sound Board at MotorCity Casino Hotel.' WHERE id = '3cee98f8-7c48-4775-81fd-449915791607';

-- R&B ONLY LIVE - Detroit, MI | Saint Andrew's Hall | 2026-11-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'R&B Only Live brings its touring DJ-driven R&B dance party to Saint Andrew''s Hall, taking the crowd through classic and contemporary R&B hits in a high-energy, sing-and-dance atmosphere.' WHERE id = 'd3f1f1d5-daca-49f1-9826-afeafd99156e';

-- R&B ONLY LIVE (21+) | Saint Andrew's Hall | 2026-11-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A 21-and-over edition of R&B Only Live''s touring DJ-driven R&B dance party at Saint Andrew''s Hall, spinning classic and contemporary R&B favorites for an interactive crowd.' WHERE id = 'ffa7493f-f3af-4886-b0f5-abbde1f8d53f';

-- Alice Cooper - Alice's Attic Tour | Caesars Ticket + Hotel Packages | The Colosseum at Caesars Windsor | 2026-11-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Shock-rock legend Alice Cooper brings his theatrical Alice''s Attic Tour to The Colosseum at Caesars Windsor, with this listing including a bundled Caesars ticket-and-hotel package.' WHERE id = 'b269f505-c93e-4aa9-b035-02cc0462f3c5';

-- Alice Cooper - Alice's Attic Tour | The Colosseum at Caesars Windsor | 2026-11-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Shock-rock legend Alice Cooper brings his theatrical Alice''s Attic Tour to The Colosseum at Caesars Windsor for a night of his signature horror-tinged rock spectacle.' WHERE id = '4d4aac4f-06b2-4636-8cfa-2b1c1e51851d';

-- Bowling Green Falcons Hockey vs. Bemidji State Beavers Mens Hockey | Slater Family Ice Arena | 2026-11-06 7:07 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NCAA Division I men''s hockey as the Bowling Green Falcons host the Bemidji State Beavers at Slater Family Ice Arena in College Hockey Central-affiliated conference play.' WHERE id = 'f7183b42-0ff3-4547-b9da-dbbc5ed2cef8';

-- Emo Night Karaoke | TSDMAAC | 2026-11-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Emo Night Karaoke brings its touring format to TSDMAAC, inviting attendees on stage to sing emo, pop-punk, and rock anthems backed by a live band.' WHERE id = 'af7bd168-f1f9-4be1-82f3-cfc29c33c38e';

-- CKY, Idiot Kids | The Loving Touch | 2026-11-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Rock band CKY, known for the anthem ''96 Quite Bitter Beings'' and its ties to the Jackass/Bam Margera crew, performs at The Loving Touch with support from Idiot Kids.' WHERE id = 'e7d3a061-6512-45a1-a35e-c40facf21887';

-- The Mavericks | Royal Oak Music Theatre | 2026-11-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Mavericks, known for blending country, rock, and Latin-inspired sounds on hits like ''All You Ever Wanted,'' bring their energetic live show to Royal Oak Music Theatre.' WHERE id = '42f897f7-d4ff-4b98-a995-23af36b47e3f';

-- Magic Bag Presents: HAPPY HOUR DANCE CLUB - Ladies Only Dance Party | The Magic Bag | 2026-11-06 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'The Magic Bag hosts its recurring Happy Hour Dance Club, a ladies-only dance party evening featuring DJ-spun music at the Ferndale-area music venue.' WHERE id = '03847ea6-eb65-48e6-a5ca-d6ee7d10294c';

-- EMO NIGHT WITH ALL AMERICAN THROWBACKS - POP PUNK / EMO PARTY BAND | District 142 | 2026-11-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'All American Throwbacks, a live pop-punk and emo party band, brings its high-energy cover show of 2000s-era emo and pop-punk anthems to District 142 for an Emo Night.' WHERE id = '4e2fb76c-ef89-4f2b-8300-1812650d0704';

-- Tapestry, The Carole King Songbook | Andiamo Celebrity Showroom | 2026-11-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = '''Tapestry: The Carole King Songbook'' is a tribute performance celebrating Carole King''s landmark 1971 album and songwriting catalog, staged at Andiamo Celebrity Showroom.' WHERE id = 'd8a23a02-597b-487b-a1d8-fab30dd5d072';

-- David Cross | Flagstar Strand Theatre for the Performing Arts | 2026-11-06 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian and actor David Cross, known for ''Arrested Development'' and ''Mr. Show with Bob and David,'' brings his stand-up act to the Flagstar Strand Theatre for the Performing Arts.' WHERE id = '77565aaf-28f6-489c-a5ab-f27433c7fce6';

-- Miss May I x Born Of Osiris | The Crofoot Ballroom | 2026-11-06 5:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Metalcore bands Miss May I and Born of Osiris co-headline a heavy night of music at The Crofoot Ballroom.' WHERE id = '9e0e0472-7f30-4495-8a55-557934955c1b';

-- Maddie Zahm w/ Semler | Blind Pig | 2026-11-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Pop singer-songwriter Maddie Zahm, known for her viral single ''Fat Girl,'' brings her Everything All The Time Tour to Blind Pig with support from queer indie singer-songwriter Semler.' WHERE id = '1ba3289c-4fa2-4a54-9db5-dd8a84407ad1';

-- Maddie Zahm, Semler | Blind Pig | 2026-11-06 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Pop singer-songwriter Maddie Zahm, known for her viral single ''Fat Girl,'' performs at Blind Pig alongside queer indie singer-songwriter Semler.' WHERE id = '43a6f82c-492f-4710-a793-7dbcbe7e9910';

-- Michigan Wolverines Football vs. Michigan State Spartans Football | Michigan Stadium | 2026-11-07 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'College football rivalry as the Michigan Wolverines host Michigan State in the annual battle for the Paul Bunyan Trophy at Michigan Stadium.' WHERE id = 'b2843e43-474d-4f72-9936-8f33d6c2321a';

-- SOMBR - You Are The Reason Tour | Little Caesars Arena | 2026-11-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Viral indie-pop artist sombr, known for breakout singles like ''back to friends,'' brings his You Are the Reason Tour to Little Caesars Arena.' WHERE id = 'b9b92aa9-7d9a-4d85-a7b7-29cdc9e013b3';

-- Daniel Sloss: BITTER (Brand New Tour!) | The Fillmore Detroit | 2026-11-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Scottish stand-up comedian Daniel Sloss, known for Netflix specials like ''Dark'' and ''X,'' brings his new show ''Bitter'' to The Fillmore Detroit.' WHERE id = '7204dff5-1108-494c-8507-8e201885f400';

-- Sleep: North America 2026 | Saint Andrew's Hall | 2026-11-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Doom/stoner metal pioneers Sleep, known for the epic ''Dopesmoker,'' bring their heavy, riff-driven sound to Saint Andrew''s Hall as part of their 2026 North America run.' WHERE id = '3775a2f8-b2b2-4184-8623-aff2c9c8f45b';

-- Bowling Green Falcons Hockey vs. Bemidji State Beavers Mens Hockey | Slater Family Ice Arena | 2026-11-07 6:07 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NCAA Division I men''s hockey as the Bowling Green Falcons host the Bemidji State Beavers at Slater Family Ice Arena, the second game of the weekend series.' WHERE id = '23206b2f-7d9b-4101-b383-6e2777e22517';

-- Mitchell Tenpenny: Speed of Light | Caesars Ticket + Hotel Packages | The Colosseum at Caesars Windsor | 2026-11-07 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country singer Mitchell Tenpenny brings his Speed of Light Tour to The Colosseum at Caesars Windsor, with this listing bundling the concert with a Caesars ticket-and-hotel package.' WHERE id = '72073039-178b-4f73-93a5-622f50c8031d';

-- Mitchell Tenpenny: Speed of Light Tour 2026 | The Colosseum at Caesars Windsor | 2026-11-07 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country singer Mitchell Tenpenny brings his Speed of Light Tour to The Colosseum at Caesars Windsor for a night of his radio-friendly country hits.' WHERE id = '3766bb6e-bd7d-4386-be10-84a73d60d0fb';

-- Vince Staples | Majestic Theatre-MI | 2026-11-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'West Coast rapper Vince Staples, known for albums like ''Ramona Park Broke My Heart'' and his sharp, socially conscious lyricism, performs at Majestic Theatre.' WHERE id = '3c7fadb2-61a8-4516-8de9-9edff310f65f';

-- Heal The Hurt, Magdalene Rose, Unbroken Reign | TSDMAAC (Crypt) | 2026-11-07 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Heal The Hurt headlines its first U.S. tour, the ''No Hope in Hell Tour,'' at TSDMAAC''s Crypt room, joined by rock/metalcore acts Magdalene Rose and Unbroken Reign.' WHERE id = 'c9160cd2-0432-4013-a88f-8fc26e8c0742';

-- Weatherday , Chase USA, Rinbossanova, Tequila Mockingbird | TSDMAAC (Catacombs) | 2026-11-07 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Swedish solo artist Weatherday, known for blending emo, noise pop, shoegaze, and lo-fi electronic textures, performs at TSDMAAC''s Catacombs alongside Chase USA, Rinbossanova, and Tequila Mockingbird.' WHERE id = '48cb355c-b9f2-40b0-86d8-04dc60462e5a';

-- Bee Gees Gold | Andiamo Celebrity Showroom | 2026-11-07 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = '''Bee Gees Gold'' is a tribute performance recreating the falsetto harmonies and disco-era hits of the Bee Gees, staged at Andiamo Celebrity Showroom.' WHERE id = '6e164fad-c8cc-449e-a620-068c860d1e98';

-- COMPLETELY UNCHAINED - The Ultimate Tribute to VAN HALEN | The Token Lounge | 2026-11-07 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = '''Completely Unchained'' is a tribute band recreating the guitar-driven arena rock of Van Halen, performing the group''s classic catalog live at The Token Lounge.' WHERE id = '62dbe6c4-5ff0-446a-a4ff-e57eee6ec1f7';

-- Kashmir Featuring Jean Violet - The Spirit of Led Zeppelin Live! | Emerald Theatre | 2026-11-07 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Kashmir, featuring vocalist Jean Violet, performs as a Led Zeppelin tribute act at Emerald Theatre, recreating the band''s classic rock catalog live.' WHERE id = 'b610b81f-7805-460f-b419-4b6432a0ac8b';

-- Thoughts On Bowling | Pike Room @ The Crofoot | 2026-11-07 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A live performance by Thoughts on Bowling, an independently touring band, at the Pike Room inside The Crofoot as part of the act''s ongoing 2026 U.S. tour dates.' WHERE id = 'aa181b88-ae86-427e-84f6-8dcb655ee664';

-- Oakland University Golden Grizzlies Volleyball vs. Youngstown State University Volleyball | OU Credit Union O'rena | 2026-11-07 4:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Oakland University''s Golden Grizzlies volleyball team takes on the Youngstown State Penguins in a Horizon League women''s volleyball match at the O''rena.' WHERE id = '5f7a5501-2def-4c6d-b153-83c4aa315667';

-- Toledo Walleye vs. Fort Wayne Komets | Huntington Center | 2026-11-07 7:15 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The ECHL''s Toledo Walleye host the Fort Wayne Komets in a minor-league hockey matchup at the Huntington Center, continuing an in-state division rivalry.' WHERE id = '6fce7e1c-56fa-4cfc-b246-c97d3ce2a82f';

-- Daft Disko: A French House & Disco Party | Blind Pig | 2026-11-07 9:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Daft Disko is a themed DJ dance party at the Blind Pig spotlighting French house, filter house, and classic disco tracks, in the vein of acts like Daft Punk.' WHERE id = 'c76f5286-2730-4419-8f04-4d3e9dc5fca8';

-- Detroit Pistons v Los Angeles Lakers | Little Caesars Arena | 2026-11-08 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Detroit Pistons host the Los Angeles Lakers in an NBA regular-season game at Little Caesars Arena, one of the league''s most-watched interconference matchups.' WHERE id = 'c918d679-c96e-47c5-9b3a-2507794b794d';

-- ZAYN: The Konnakol Tour | Little Caesars Arena | 2026-11-08 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'ZAYN, the former One Direction member turned R&B/pop solo artist, brings his 2026 Konnakol Tour — named for his album ''Konnakol'' — to Little Caesars Arena.' WHERE id = 'c202c943-a547-4d0c-bc60-c57629d5ec00';

-- Elmo's Got the Moves | Fox Theatre Detroit | 2026-11-08 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Sesame Street Live: Elmo''s Got the Moves is a touring family stage show featuring Elmo, Abby Cadabby, and other Sesame Street Muppets in a music- and dance-filled performance for young audiences.' WHERE id = 'f0d94d03-8207-4f71-b88b-1de2af86a81f';

-- Elmo's Got the Moves | Fox Theatre Detroit | 2026-11-08 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Sesame Street Live: Elmo''s Got the Moves is a touring family stage show featuring Elmo, Abby Cadabby, and other Sesame Street Muppets in a music- and dance-filled performance for young audiences.' WHERE id = '218a7d63-b94c-4674-a1f5-94c3eb22445e';

-- Sesame St. Live - Elmo's Got The Moves - Suite Rental | Fox Theatre Detroit | 2026-11-08 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'This is a suite-rental ticket for Sesame Street Live: Elmo''s Got the Moves, a touring family stage show featuring Elmo and other Sesame Street Muppets at the Fox Theatre.' WHERE id = '01254ec8-d205-470d-b6a4-82819a3bbb1f';

-- Sesame St. Live - Elmo's Got The Moves - Suite Rental | Fox Theatre Detroit | 2026-11-08 2:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'This is a suite-rental ticket for Sesame Street Live: Elmo''s Got the Moves, a touring family stage show featuring Elmo and other Sesame Street Muppets at the Fox Theatre.' WHERE id = 'dda3f9a8-d67c-425d-872e-de996bfaeb01';

-- Pouya - The Forever Glades Tour | The Fillmore Detroit | 2026-11-08 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Miami rapper Pouya, known for his raw, high-energy style within the SoundCloud/underground hip-hop scene, performs at The Fillmore Detroit on his Forever Glades Tour.' WHERE id = '3629c904-a9df-4046-844e-0bfcd05e92e9';

-- AJ McLean presents Alexander James : The Better Man Tour | Sound Board at MotorCity Casino Hotel | 2026-11-08 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Backstreet Boys member AJ McLean performs as his solo alter ego Alexander James on The Better Man Tour, an intimate show blending original pop/R&B-leaning music with personal career stories.' WHERE id = 'db25dd93-8c90-40fe-b6e8-4979667eb017';

-- BLITZKID: Modern Hel Tour 2026 with Special Guests | The Magic Bag | 2026-11-08 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Blitzkid, the horror-punk duo known for theatrical, monster-themed stage performances, headlines The Magic Bag on their Modern Hel Tour 2026 with supporting acts.' WHERE id = '79f4ed88-3af7-45dd-8362-c34293f297ce';

-- Basement w/ High Vis | Royal Oak Music Theatre | 2026-11-08 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UK rock band Basement, known for blending shoegaze, grunge, and post-hardcore influences, headlines Royal Oak Music Theatre with British post-punk act High Vis in support.' WHERE id = 'b232b0de-173f-423f-aa80-3437137d54c2';

-- The Queers | The Token Lounge | 2026-11-08 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Long-running pop-punk band The Queers, known for their Ramones-influenced sound dating back to the 1980s New Hampshire punk scene, plays The Token Lounge.' WHERE id = 'c23560ba-d1c5-4196-a522-25b772203678';

-- Madds Buckley | Pike Room @ The Crofoot | 2026-11-08 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Nashville-based pop artist Madds Buckley, known for candid, queer-affirming songwriting, brings her live show to the Pike Room inside The Crofoot on her 2026 tour.' WHERE id = '5d90a71b-1c90-4a59-948e-d49cf9631706';

-- Andrea Gibson's Love Letter From The Afterlife | Michigan Theater | 2026-11-08 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A touring multimedia tribute to poet Andrea Gibson, the celebrated LGBTQ+ spoken-word artist and former Colorado poet laureate who died in 2025, combining a recording of their final live performance with live orchestral music and storytelling from their wife, poet Megan Falley.' WHERE id = '464e5d83-9703-4c0d-8347-7ab7df5caca3';

-- Detroit Pistons vs. Washington Wizards | Little Caesars Arena | 2026-11-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Detroit Pistons host the Washington Wizards in an NBA regular-season game at Little Caesars Arena as both Eastern Conference teams continue their 2026-27 schedules.' WHERE id = 'f2e2f7c5-d190-4bb9-97f6-545992e79223';

-- Em Beihold: Tales Of A Failed Shapeshifter Tour | The Shelter | 2026-11-09 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Pop singer-songwriter Em Beihold, best known for her breakout hit ''Numb Little Bug,'' performs at The Shelter on her Tales of a Failed Shapeshifter Tour in support of new music.' WHERE id = '412cf406-05ce-41fa-ab28-4eeb0a9f3ba1';

-- Banda AL9, The Burkharts | TSDMAAC | 2026-11-09 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Brazilian indie-rock band Banda AL9, who released their first official U.S. single via Steven Van Zandt''s Wicked Cool Records, play TSDMAAC alongside supporting act The Burkharts.' WHERE id = '49d1b602-264a-44d0-a8bb-0feda540c1f0';

-- Palace - USA & Canada Tour 2026 | Saint Andrew's Hall | 2026-11-10 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'UK indie-rock band Palace, known for their atmospheric, guitar-driven sound, bring their USA & Canada Tour 2026 to Saint Andrew''s Hall.' WHERE id = 'd194745a-210e-45bc-b10f-19c38f1e4892';

-- Bowling Green Falcons Football vs. Kent State Golden Flashes Football | Doyt Perry Stadium | 2026-11-10 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Bowling Green Falcons football hosts the Kent State Golden Flashes in a Mid-American Conference (MAC) matchup at Doyt Perry Stadium.' WHERE id = 'a3f4e66b-6f59-4767-a9b2-50812d72e8e1';

-- Bowling Green Falcons Womens Basketball vs. Bellarmine Knights Womens Basketball | Stroh Center | 2026-11-10 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Bowling Green Falcons women''s basketball takes on the Bellarmine Knights in a non-conference NCAA Division I matchup at the Stroh Center.' WHERE id = '938fe553-dab3-468b-8934-6c685e1115ce';

-- Magic Bag Presents: Stewart Copeland - Have I Said Too Much | The Magic Bag | 2026-11-10 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Police drummer Stewart Copeland brings his spoken-word show ''Have I Said Too Much'' to The Magic Bag, sharing behind-the-scenes stories, music, and multimedia from his decades in rock.' WHERE id = '5cd616bf-56a0-4de0-ad64-f5b8982adcb2';

-- The Bends, Common People | Blind Pig | 2026-11-10 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A double bill at the Blind Pig pairing ''The Bends,'' a tribute act built around Radiohead''s music, with ''Common People,'' a tribute act celebrating the Britpop era popularized by bands like Pulp.' WHERE id = '6651cd78-e394-413f-afe2-02e2876c1ff2';

-- VOILÀ Presents: Moonbloom | Saint Andrew's Hall | 2026-11-11 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'VOILÀ, the Emmy-nominated pop-rock duo of Luke Eisner and Gus Ross, bring their theatrical Moonbloom tour — featuring aerialists, magicians, and vaudeville-style staging alongside their music — to Saint Andrew''s Hall.' WHERE id = 'f48fcbd9-82af-41a4-bdb7-de80472b0c0b';

-- A Drag Queen Christmas | Fisher Theatre - Detroit | 2026-11-11 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A Drag Queen Christmas is an annual touring holiday variety show featuring drag performers, several from RuPaul''s Drag Race, in a comedic, glamorous seasonal revue at the Fisher Theatre.' WHERE id = '2662a4bc-1d84-4dd7-b05e-217c05c0daa1';

-- The Menzingers w/ Hot Water Music | Majestic Theatre-MI | 2026-11-11 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Punk rock bands The Menzingers and Hot Water Music co-headline the Majestic Theatre, bringing decades of melodic, heartfelt punk rock to the Detroit stage.' WHERE id = '5e00ef8a-842e-40fc-8631-4230e1cad62a';

-- Psycroptic, Inferi, Cognitive, Summoning The Lich | TSDMAAC | 2026-11-11 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A death metal package show at TSDMAAC headlined by Australian technical death metal band Psycroptic, with support from Inferi, Cognitive, and Summoning The Lich.' WHERE id = '4088a58a-37a9-4003-8bb5-fdd588a54e32';

-- Battle Of The Bands: Glenn Miller Orchestra & Tommy Dorsey Orchestra | Michigan Theater | 2026-11-11 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Battle of the Bands brings together the legacy Glenn Miller Orchestra and Tommy Dorsey Orchestra, both continuing the swing-era big-band traditions of their namesakes, for a night of classic music at the Michigan Theater.' WHERE id = 'b5570cb6-0e8a-4235-8312-fc5b104d0fe1';

-- Michigan Wolverines Womens Volleyball vs. Ohio State Buckeyes Womens Volleyball | Cliff Keen Arena | 2026-11-11 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Michigan Wolverines women''s volleyball hosts Big Ten rival Ohio State Buckeyes at Cliff Keen Arena in Ann Arbor in a key conference matchup.' WHERE id = '642faa91-aa33-465e-ab8c-880d39542393';

-- Toledo Rockets Football vs. UMass Minutemen Football | Glass Bowl Stadium | 2026-11-11 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Toledo Rockets football, a Mid-American Conference program, hosts the UMass Minutemen at Glass Bowl Stadium in a matchup against the independent FBS program.' WHERE id = '90f579a3-6a46-4b82-b226-8f93f2747160';

-- Ringling Bros. and Barnum & Bailey presents The Greatest Show On Earth | Little Caesars Arena | 2026-11-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Ringling Bros. and Barnum & Bailey present The Greatest Show On Earth, the revived touring circus production featuring acrobats, aerialists, and other live performers, at Little Caesars Arena.' WHERE id = '056c62f9-fc31-49a4-89d6-3879026b15f3';

-- The War And Treaty | Saint Andrew's Hall | 2026-11-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Grammy-nominated Americana/soul duo The War and Treaty, made up of husband-and-wife Michael and Tanya Trotter, perform at Saint Andrew''s Hall.' WHERE id = '9a389db5-4c59-4de2-9dd7-20f1af2cbcf1';

-- Black Violin | Jack White Theatre at the Masonic Temple - Detroit | 2026-11-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Black Violin, the classically trained duo of Kev Marcus and Wil B, blend hip-hop with violin and viola virtuosity in a genre-crossing performance at the Jack White Theatre.' WHERE id = '54bf1a2b-bd06-42e2-a06b-1fe40dc6783d';

-- Ayria 13 Stitches Tour with special guest Access To Concrete | Small's | 2026-11-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Canadian synthpop/electro-industrial artist Ayria tours behind her album ''13 Stitches,'' performing at Small''s with support from Access To Concrete.' WHERE id = '7107e5a8-82c8-48a0-ac7d-6f6533cc1733';

-- Bela Fleck - My Bluegrass Heart | Royal Oak Music Theatre | 2026-11-12 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Grammy-winning banjo virtuoso Bela Fleck brings his acclaimed ''My Bluegrass Heart'' project, reuniting him with top bluegrass musicians, to Royal Oak Music Theatre.' WHERE id = '840abdec-f50b-4a53-b594-989f9368e88b';

-- Bulletboys | The Token Lounge | 2026-11-12 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Bulletboys, the Los Angeles glam-metal band behind the 1988 hit ''Smooth Up in Ya,'' perform their catalog of hard rock songs at The Token Lounge.' WHERE id = 'c431d92e-6785-4bc6-b046-cc69447aa334';

-- Kyle Hume | Pike Room @ The Crofoot | 2026-11-12 6:30 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Independent singer-songwriter Kyle Hume performs a live set at the Pike Room inside The Crofoot as part of his ongoing touring schedule.' WHERE id = 'a8e065d6-0833-4f48-8a0e-04c36e469c21';

-- Ethan Regan, Lily Kershaw | Blind Pig | 2026-11-12 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Rising singer-songwriter Ethan Regan, signed to Columbia Records, headlines his ''Young Regan'' tour behind his debut album, with support from L.A. singer-songwriter Lily Kershaw, at the Blind Pig.' WHERE id = 'faa0562a-225d-4870-bd58-89c1290ef5d3';

-- Motor City Cruise vs. Noblesville Boom | Wayne State Fieldhouse | 2026-11-13 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Motor City Cruise, the Detroit Pistons'' NBA G League affiliate, host the Noblesville Boom (formerly the Fort Wayne Mad Ants) at the Wayne State Fieldhouse.' WHERE id = 'e5f6d4df-2109-488d-9873-f779b9776a1a';

-- Ringling Bros. and Barnum & Bailey with Special Guest Bello Nock | Little Caesars Arena | 2026-11-13 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Ringling Bros. and Barnum & Bailey''s touring circus production comes to Little Caesars Arena with special guest Bello Nock, the famed clown and daredevil performer known for his high-wire and stunt acts.' WHERE id = '6bc601c8-4921-4286-9a83-c4fc39483a9c';

-- Ringling Bros. and Barnum & Bailey with Special Guest Bello Nock | Little Caesars Arena | 2026-11-13 11:00 AM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Ringling Bros. and Barnum & Bailey''s touring circus production comes to Little Caesars Arena with special guest Bello Nock, the famed clown and daredevil performer known for his high-wire and stunt acts.' WHERE id = 'b411635f-3aaf-41e8-9017-6dd5d6470d9d';

-- Gavin Adcock | Masonic Temple - Detroit | 2026-11-13 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Gavin Adcock, the fast-rising country and southern-rock artist known for his energetic live shows and viral fan following, performs at the Masonic Temple - Detroit.' WHERE id = '024b71ff-c431-4c9f-9481-b01334e5f6ef';

-- Michigander | Saint Andrew's Hall | 2026-11-13 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Michigander, the indie-pop/rock project of Michigan native Jason Singer known for songs like ''Nineteen'' and ''Mercury,'' plays a hometown-area show at Saint Andrew''s Hall.' WHERE id = '56b56837-4b61-4c88-aa90-921810892004';

-- Gary Owen: No Hard Feelings Tour | Sound Board at MotorCity Casino Hotel | 2026-11-13 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Stand-up comedian Gary Owen, known for his film roles in the ''Ride Along'' and ''Think Like a Man'' franchises and his candid takes on marriage and family, brings his No Hard Feelings Tour to the Sound Board.' WHERE id = '0b086df4-0fff-421a-805c-d9dd7bc5f3aa';

-- The Slackers, Some Ska Band | The Magic Bag | 2026-11-13 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Veteran NYC ska and reggae band The Slackers, performing since 1991, headline The Magic Bag alongside supporting act Some Ska Band.' WHERE id = '7c035240-5eda-41de-8efe-d9b589fb2595';

-- REDFERRIN | District 142 | 2026-11-13 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country artist Redferrin, signed to Warner Music Nashville, brings his rising country sound to District 142 as part of his current tour.' WHERE id = '8ab0c73b-4a3e-4ece-bf12-01b3920d33a8';

-- Forever Seger | Andiamo Celebrity Showroom | 2026-11-13 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Forever Seger is a tribute band recreating the music and stage presence of Detroit rock icon Bob Seger, performing at the Andiamo Celebrity Showroom.' WHERE id = 'bbbd9193-92b2-4a7c-9a80-3e7262cc9784';

-- Leslie Jones | Royal Oak Music Theatre | 2026-11-13 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedian and ''Saturday Night Live'' alum Leslie Jones brings her bold, high-energy stand-up show to Royal Oak Music Theatre.' WHERE id = '2204b6c7-9805-4ca4-ad38-489a360a715f';

-- The Fabulous Thunderbirds | The Token Lounge | 2026-11-13 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Fabulous Thunderbirds, the Texas blues-rock band led by harmonica player Kim Wilson and known for the 1986 hit ''Tuff Enuff,'' perform at The Token Lounge.' WHERE id = '6554c061-f50d-4d90-9d9e-f32e1a89d8cc';

-- The Phil Collins Experience | Emerald Theatre | 2026-11-13 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Phil Collins Experience is a tribute act recreating the hits and sound of Phil Collins and Genesis, performing at the Emerald Theatre.' WHERE id = 'b449eb5c-3112-4dbb-8c14-137012137fbf';

-- Choir! Choir! Choir! | Flagstar Strand Theatre for the Performing Arts | 2026-11-13 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Choir! Choir! Choir!, the Toronto-based mass sing-along project known for turning audiences into a one-night choir performing pop and rock hits, comes to the Flagstar Strand Theatre.' WHERE id = '873f3b0e-2f89-401e-948c-e4be4f683222';

-- Worst Party Ever & Equipment | Pike Room @ The Crofoot | 2026-11-13 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'Worst Party Ever and Equipment, two independent bands on the touring circuit, play a live show at the Pike Room inside The Crofoot.' WHERE id = '4c8b8aeb-df5a-43dd-9233-0dacfe879c89';

-- House Party | The Crofoot Ballroom | 2026-11-13 9:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'House Party is a themed dance and club night at The Crofoot Ballroom, part of the venue''s regular lineup of DJ-driven dance-party events.' WHERE id = 'c2086530-e99a-479c-88c4-8b3dff08f65a';

-- USA Hockey National Team Development Program vs. Chicago Steel | USA Hockey Arena | 2026-11-13 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The USA Hockey National Team Development Program''s junior team, based at USA Hockey Arena in Plymouth, faces the Chicago Steel in a United States Hockey League (USHL) matchup.' WHERE id = 'd8d60411-b062-4d0d-b06e-bc252b563bc7';

-- Velvet Snakes, Electric Bug, The Tape Cassettes, The Telephone Poles | Blind Pig | 2026-11-13 8:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local rock and indie showcase at the Blind Pig featuring four acts on one bill: Velvet Snakes, Electric Bug, The Tape Cassettes, and The Telephone Poles.' WHERE id = 'f9cd7813-7d6b-4b01-b8fa-d8eae236e69e';

-- Josh Ross: Later Tonight Tour | Caesars Ticket + Hotel Packages | The Colosseum at Caesars Windsor | 2026-11-14 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Canadian country singer Josh Ross, known for singles like "Trouble" and "Single Again," brings his Later Tonight tour to The Colosseum at Caesars Windsor; this listing includes a Caesars ticket-and-hotel package.' WHERE id = '824709b9-6e3c-46e7-b15c-1078961b34ab';

-- Josh Ross: Later Tonight Tour | The Colosseum at Caesars Windsor | 2026-11-14 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Canadian country singer Josh Ross, known for singles like "Trouble" and "Single Again," brings his Later Tonight tour to The Colosseum at Caesars Windsor.' WHERE id = '8d412a19-4076-4358-a34a-97a25acac28a';

-- Hovvdy | El Club | 2026-11-14 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Austin-based indie rock duo Hovvdy, known for their warm, lo-fi sound on albums like Heavy Lifter and True Love, perform at El Club.' WHERE id = 'c03e0db6-4366-4ac8-9503-f873e4f5ea39';

-- Saosin w/ Silent Planet | Majestic Theatre-MI | 2026-11-14 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Post-hardcore band Saosin, known for early-2000s hits like "Are You Six Feet Under Yet?," co-headlines with metalcore act Silent Planet at the Majestic Theatre.' WHERE id = '0033874b-3acc-4f23-9de8-1bdf8475b369';

-- Ringling Bros. and Barnum & Bailey with Special Guest Bello Nock | Little Caesars Arena | 2026-11-14 3:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Ringling Bros. and Barnum & Bailey circus returns to Little Caesars Arena with acrobats, aerialists, and other live performers, this stop featuring special guest Bello Nock, a veteran circus clown and daredevil performer.' WHERE id = '08dfa6e1-b3ff-414e-ba24-cea4116cf350';

-- Ringling Bros. and Barnum & Bailey with Special Guest Bello Nock | Little Caesars Arena | 2026-11-14 11:00 AM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Ringling Bros. and Barnum & Bailey circus returns to Little Caesars Arena with acrobats, aerialists, and other live performers, this stop featuring special guest Bello Nock, a veteran circus clown and daredevil performer.' WHERE id = '01012271-fbd3-48c7-a961-a524f969a30e';

-- Ringling Bros. and Barnum & Bailey with Special Guest Bello Nock | Little Caesars Arena | 2026-11-14 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Ringling Bros. and Barnum & Bailey circus returns to Little Caesars Arena with acrobats, aerialists, and other live performers, this stop featuring special guest Bello Nock, a veteran circus clown and daredevil performer.' WHERE id = '5706bde3-506a-4c6f-a4a0-7623fb566bf6';

-- Gary Owen: No Hard Feelings Tour | Sound Board at MotorCity Casino Hotel | 2026-11-14 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Stand-up comedian and actor Gary Owen, known for the Think Like a Man film franchise and BET''s Real Husbands of Hollywood, brings his No Hard Feelings tour to the Sound Board at MotorCity Casino Hotel.' WHERE id = 'c75a7711-c9a7-48be-ab4a-2a434be31d03';

-- Step Afrika! | Detroit Opera House | 2026-11-14 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Step Afrika!, the first professional company dedicated to the percussive dance tradition of stepping, brings its high-energy blend of dance, rhythm, and storytelling to the Detroit Opera House.' WHERE id = '92aab5c8-45ea-4c88-a9fb-7dbfe5abc747';

-- Snow White: An Original Ballet Production (Ages 3 and Up) | Stranahan Theatre | 2026-11-14 3:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A family-friendly original ballet production of Snow White, staged for young audiences ages 3 and up, at the Stranahan Theatre.' WHERE id = 'd270f5d7-6a7f-4eb7-b2c2-a262e9db383f';

-- Frank White (Celebrating 20 Years) and The Boy Detective with Bastardous, Dads On Couches | Small's | 2026-11-14 7:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local rock show at Small''s celebrating 20 years of Frank White, on a bill alongside The Boy Detective, Bastardous, and Dads On Couches.' WHERE id = 'a54f698a-f67b-4b7c-b316-c30195e1ceaa';

-- ANTHONY GOMES | The Token Lounge | 2026-11-14 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Blues-rock guitarist and singer Anthony Gomes, known for his high-energy live shows and albums like Blues in Technicolor, performs at the Token Lounge.' WHERE id = '7da6592a-35b5-4eac-9afb-515360ace8eb';

-- O Christmas Tea: A British Comedy | Flagstar Strand Theatre for the Performing Arts | 2026-11-14 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'O Christmas Tea: A British Comedy is a touring holiday show from London duo James & Jamesy, blending physical comedy, wordplay, and audience interaction in the style of classic British pantomime, staged at the Flagstar Strand Theatre.' WHERE id = '98ab9f71-649a-4692-90fd-d667cdea3fe5';

-- USA Hockey National Team Development Program vs. Chicago Steel | USA Hockey Arena | 2026-11-14 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'USA Hockey''s National Team Development Program, which trains the country''s top junior players in Plymouth, Michigan, faces the Chicago Steel in a United States Hockey League (USHL) matchup at USA Hockey Arena.' WHERE id = '22a661b3-3e4b-4e0a-9d17-e0654023df01';

-- Michigan Wolverines Womens Volleyball vs. Purdue Boilermakers Womens Volleyball | Crisler Center | 2026-11-14 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Big Ten women''s volleyball action as the Michigan Wolverines host the Purdue Boilermakers at Crisler Center in Ann Arbor.' WHERE id = '72ea7c2c-ad29-44b6-8c8f-d05e22ba70a2';

-- Motor City Cruise vs. Noblesville Boom | Wayne State Fieldhouse | 2026-11-15 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NBA G League basketball as the Motor City Cruise, the Detroit Pistons'' player-development affiliate, host the Noblesville Boom at Wayne State Fieldhouse.' WHERE id = 'fcde7af7-15d7-44f4-8777-76e6c46714a5';

-- Ringling Bros. and Barnum & Bailey with Special Guest Bello Nock | Little Caesars Arena | 2026-11-15 3:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Ringling Bros. and Barnum & Bailey circus returns to Little Caesars Arena with acrobats, aerialists, and other live performers, this stop featuring special guest Bello Nock, a veteran circus clown and daredevil performer.' WHERE id = '63cbca24-6be3-4dde-a026-c402b8ab08b2';

-- Ringling Bros. and Barnum & Bailey with Special Guest Bello Nock | Little Caesars Arena | 2026-11-15 11:00 AM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Ringling Bros. and Barnum & Bailey circus returns to Little Caesars Arena with acrobats, aerialists, and other live performers, this stop featuring special guest Bello Nock, a veteran circus clown and daredevil performer.' WHERE id = '942ab190-2389-4da7-b469-01c347f85d00';

-- PATTI LABELLE - The 80/65 Tour | Music Hall Center | 2026-11-15 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Legendary R&B and soul singer Patti LaBelle, known for hits like "Lady Marmalade" and "On My Own," brings her 80/65 Tour to the Music Hall Center.' WHERE id = 'b78779ad-b8e6-4d3f-b848-d999c5b72bb7';

-- Girl of Glass, Thus Spoke Zarathustra, XMercyX | TSDMAAC | 2026-11-15 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local heavy metal and hardcore bill at TSDMAAC featuring Girl of Glass, Thus Spoke Zarathustra, and XMercyX.' WHERE id = 'cdc0285c-34e8-4817-a244-3bdc3dc6fafd';

-- Reverend Guitars & RockCity Music Present: Polka Floyd | The Magic Bag | 2026-11-15 1:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Polka Floyd, billed as the world''s only Pink Floyd tribute polka band, reimagines Pink Floyd classics in polka arrangements, presented by Reverend Guitars & RockCity Music at The Magic Bag.' WHERE id = 'ea15b440-21d8-4625-8ad5-d802857a0c92';

-- The Wooten Brothers | Royal Oak Music Theatre | 2026-11-16 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'The Wooten Brothers — Regi, Roy "Future Man," Rudy, and Joseph Wooten, siblings of noted bassist Victor Wooten — bring their genre-blending funk, jazz, and gospel-inflected sound to the Royal Oak Music Theatre.' WHERE id = '83fb628e-e671-4e0d-8254-d43afdce3879';

-- Motor City Cruise vs. Grand Rapids Gold | Wayne State Fieldhouse | 2026-11-17 11:00 AM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NBA G League basketball as the Motor City Cruise, the Detroit Pistons'' player-development affiliate, host the Grand Rapids Gold, the Denver Nuggets'' affiliate, at Wayne State Fieldhouse.' WHERE id = 'bc1a4178-7749-4a14-9503-cd606d70691b';

-- Slow Pulp | Saint Andrew's Hall | 2026-11-17 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Indie rock band Slow Pulp, known for dreamy, hook-laden albums like Moveys and Yard, perform at Saint Andrew''s Hall.' WHERE id = '9ebb344a-1d2d-4130-a62d-c381c4f3de9f';

-- Havok , Hellripper, Slackjaw, Xoth | TSDMAAC | 2026-11-17 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A thrash and extreme metal bill at TSDMAAC led by Denver thrash act Havok and Scottish blackened speed-metal project Hellripper, with support from Slackjaw and Xoth.' WHERE id = '92b8e353-457d-4fdc-9e2b-c81560c55285';

-- Sugarland - Ride or Die Tour | Huntington Center | 2026-11-17 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country duo Sugarland, known for hits like "Stuck Like Glue" and "All I Want to Do," bring their Ride or Die tour to the Huntington Center.' WHERE id = '5b206663-49fd-44b8-8a8e-c8d35549bb5d';

-- O Christmas Tea: A British Comedy | Michigan Theater | 2026-11-17 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'O Christmas Tea: A British Comedy is a touring holiday show from London duo James & Jamesy, blending physical comedy, wordplay, and audience interaction in the style of classic British pantomime, staged at the Michigan Theater.' WHERE id = 'fc74ee84-2ee0-4736-98e3-f373ded14a3c';

-- Toledo Walleye vs. Rapid City Rush | Huntington Center | 2026-11-18 10:35 AM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'ECHL hockey as the Toledo Walleye, the AHL-affiliated minor-league hockey club, host the Rapid City Rush at the Huntington Center in Toledo.' WHERE id = '64b6b6f2-1cfc-418d-b9b8-5e451e33e465';

-- Detroit Red Wings vs. Boston Bruins | Little Caesars Arena | 2026-11-18 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NHL action as the Detroit Red Wings host the Boston Bruins in a regular-season matchup at Little Caesars Arena in downtown Detroit.' WHERE id = '7e77b4e5-817a-4490-b466-d99f41ac7693';

-- Motor City Cruise vs. Grand Rapids Gold | Wayne State Fieldhouse | 2026-11-18 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NBA G League basketball as the Motor City Cruise, the Detroit Pistons'' player-development affiliate, host the Grand Rapids Gold, the Denver Nuggets'' affiliate, at Wayne State Fieldhouse.' WHERE id = '4088a854-1f97-4f01-919d-6d8c81b996f5';

-- Magic Bag Presents: Sqwerv Fall Tour 2026 | The Magic Bag | 2026-11-18 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Denver band Sqwerv, who describe themselves as an "Everything Rock" act blending jam, funk, and experimental sounds, bring their Fall Tour 2026 to The Magic Bag.' WHERE id = '53b81179-2591-4acc-980e-90ebc4ac9124';

-- Shaun Cassidy - UNWRAPPED: Songs & Stories For The Holidays | Flagstar Strand Theatre for the Performing Arts | 2026-11-18 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = '1970s teen-idol singer and actor Shaun Cassidy, known for the hit "Da Doo Ron Ron" and his role on The Hardy Boys, performs his holiday show Unwrapped: Songs & Stories for the Holidays at the Flagstar Strand Theatre.' WHERE id = '2004d26f-81b8-47c8-b860-773eb19bc606';

-- Toledo Rockets Football vs. Bowling Green Falcons Football | Glass Bowl Stadium | 2026-11-18 Evening | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'College football''s Mid-American Conference rivalry as the Toledo Rockets host the Bowling Green Falcons at the Glass Bowl Stadium.' WHERE id = 'c9f90ed2-5288-48be-88a7-90dfd9e40f5d';

-- The Neighbourhood: THE WOURLD TOUR | Little Caesars Arena | 2026-11-19 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Alternative rock band The Neighbourhood, known for hits like "Sweater Weather," bring their Wourld Tour to Little Caesars Arena.' WHERE id = 'a2a031ad-857d-4cde-92e7-2ea9ce487289';

-- Missio | TSDMAAC CRYPT | 2026-11-19 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Austin-based alternative/electronic duo Missio, known for the single "Middle Fingers," perform at TSDMAAC''s Crypt stage.' WHERE id = 'e06f4cd9-2104-478e-b5ca-b04e27f162e8';

-- Lee Brice: Sunriser Tour | The Colosseum at Caesars Windsor | 2026-11-19 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country singer Lee Brice, known for hits like "I Drive Your Truck" and "Rumor," brings his Sunriser tour to The Colosseum at Caesars Windsor.' WHERE id = 'f396aed0-ae7f-48de-ab09-d80afdac4051';

-- Lee Brice: Sunriser Tour | Caesars Ticket + Hotel Packages | The Colosseum at Caesars Windsor | 2026-11-19 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country singer Lee Brice, known for hits like "I Drive Your Truck" and "Rumor," brings his Sunriser tour to The Colosseum at Caesars Windsor; this listing includes a Caesars ticket-and-hotel package.' WHERE id = 'af16446c-0449-432d-b78b-e74faf7a6860';

-- Missio , Oxymorrons, Kent Osborne | TSDMAAC | 2026-11-19 6:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Alternative/electronic duo Missio, known for the single "Middle Fingers," headlines a bill with hip-hop-rock act Oxymorrons and Kent Osborne at TSDMAAC.' WHERE id = '2f8cee45-889f-4130-9438-dd92dad33f9b';

-- Ventana, Deadly Apples, Aeternum, Garbage World | TSDMAAC | 2026-11-19 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local heavy metal and hardcore bill at TSDMAAC featuring four regional acts on one lineup: Ventana, Deadly Apples, Aeternum, and Garbage World.' WHERE id = '1300d18a-24c3-415a-9aaf-1f40837923af';

-- Magic Bag Presents: Surprise Chef | The Magic Bag | 2026-11-19 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Melbourne instrumental soul and funk band Surprise Chef, known for their retro grooves on Big Crown Records, perform at The Magic Bag.' WHERE id = 'a505b8da-3a39-4b74-9d7f-c49ca35cc1bf';

-- GEORGE BIRGE | District 142 | 2026-11-19 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Country singer George Birge, known for his chart-topping single "Mind on You," performs at District 142.' WHERE id = 'dea3f19e-3f9b-492e-a9d6-09e4f0c75841';

-- Greg Koch & the Koch Marshall Trio | The Token Lounge | 2026-11-19 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Blues-rock guitarist Greg Koch, a longtime Fender clinician and prolific session player, leads the Koch Marshall Trio at the Token Lounge.' WHERE id = '7c4eff8e-6e2a-42a7-a008-b51b3af615fc';

-- Token, Clark D, DJ Lucas | Blind Pig | 2026-11-19 7:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Rapper Token, who gained attention for his rapid-fire freestyle videos, headlines a hip-hop bill with Clark D and DJ Lucas at the Blind Pig.' WHERE id = 'e9bc58fd-163e-41ef-9053-142b75f9192c';

-- Dean Brody & The Reklaws | Caesars Ticket + Hotel Packages | The Colosseum at Caesars Windsor | 2026-11-20 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Canadian country singer Dean Brody, known for hits like "Canadian Girls," shares the bill with sibling country duo The Reklaws at The Colosseum at Caesars Windsor; this listing includes a Caesars ticket-and-hotel package.' WHERE id = 'f75eb98a-44a0-4536-bc1b-d638295a1365';

-- Little Big Town - For The Art Of It Tour | Fox Theatre Detroit | 2026-11-20 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Grammy-winning country group Little Big Town, known for hits like "Girl Crush" and "Pontoon," bring their For The Art Of It tour to the Fox Theatre Detroit.' WHERE id = '53fa88b3-223a-4e7c-9838-d94baa1ce8ab';

-- Little Big Town - Suite Rental | Fox Theatre Detroit | 2026-11-20 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'A premium suite rental package for Grammy-winning country group Little Big Town''s For The Art Of It tour stop at the Fox Theatre Detroit.' WHERE id = '23ab0a63-3b03-4839-b8ed-f74f59541946';

-- Boney James | Sound Board at MotorCity Casino Hotel | 2026-11-20 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Grammy-nominated smooth jazz saxophonist Boney James performs at the Sound Board at MotorCity Casino Hotel.' WHERE id = 'aa8681b0-89d0-4b0c-8a42-114e0298a1e6';

-- Detroit Pistons v Toronto Raptors (Emirates NBA CUP PLAY) | Little Caesars Arena | 2026-11-20 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'NBA action as the Detroit Pistons host the Toronto Raptors at Little Caesars Arena in an Emirates NBA Cup group-stage game.' WHERE id = 'e15e5153-aa03-4e3d-b981-dc4885620666';

-- Catch Your Breath - Not Broken Enough Tour | Saint Andrew's Hall | 2026-11-20 6:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Austin-based post-hardcore/hard rock band Catch Your Breath, known for the Gold-certified single "Dial Tone," bring their Not Broken Enough tour to Saint Andrew''s Hall.' WHERE id = '4c3228a2-f38c-4db2-86aa-edc6f7085888';

-- Bowling Green Falcons Hockey vs. Augustana Vikings Mens Hockey | Slater Family Ice Arena | 2026-11-20 7:07 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'College hockey as the Bowling Green Falcons host the Augustana Vikings in a men''s matchup at Slater Family Ice Arena.' WHERE id = 'c0460213-ef03-4b4d-b802-eb15a303342e';

-- IMomSoHard | Capitol Theatre - MI | 2026-11-20 8:00 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Comedy duo IMomSoHard — Kristin Hensley and Jen Smedley — known for their viral videos and podcast about the chaos of motherhood, bring their live stand-up show to the Capitol Theatre.' WHERE id = '1ee21fc1-bea4-4621-884f-a7e110a13914';

-- Trivium w/ In Flames | Royal Oak Music Theatre | 2026-11-20 5:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Metal bands Trivium, known for albums like Ascendancy and The Sin and the Sentence, and Swedish melodic death metal act In Flames co-headline a tour stop at the Royal Oak Music Theatre.' WHERE id = 'd9230f0c-6e9d-4155-b723-4b2e2b67cf2d';

-- Midwinter, What Lies Below, Coldstate | TSDMAAC | 2026-11-20 6:00 PM | source: Ticketmaster | confidence: generic
UPDATE events SET description = 'A local metal and hardcore bill at TSDMAAC featuring three regional acts on one lineup: Midwinter, What Lies Below, and Coldstate.' WHERE id = 'ac6c7544-f991-4c1e-b3ca-22cfa6a27967';

-- Mania: The ABBA Tribute | Royal Oak Music Theatre | 2026-10-13 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Mania: The ABBA Tribute recreates the sound, costumes, and stage show of ABBA, performing the group''s biggest hits at the Royal Oak Music Theatre.' WHERE id = '80eb8131-4c8a-4747-b8b2-c2cafed40cc4';

-- Mania: The ABBA Tribute | Royal Oak Music Theatre | 2026-10-13 7:30 PM | source: Ticketmaster | confidence: researched
UPDATE events SET description = 'Mania: The ABBA Tribute recreates the sound, costumes, and stage show of ABBA, performing the group''s biggest hits at the Royal Oak Music Theatre.' WHERE id = 'd518313d-8da3-44dc-a468-b3dfad2d1657';
