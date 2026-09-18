-- Follow-up to update_2026-09-18_fall-open-studios-40-west-howard.sql:
-- appends the full participating-studios directory now that Jody's sent
-- the remaining screenshots (3rd floor's Suite 300/308/319 and all of the
-- 4th floor). Also clears the "pending" note from the first insert.
update events
set description = description || E'\n\nParticipating studios:\n1st Floor -- Suite 106: The Velvet Tower. Suite 116A: Nickie Gunning (Ceramics/Mixed Media), Bradley Oechsler (Ceramics).\n2nd Floor -- Suite 204B: Ben Teague (Ceramics). Suite 208: Kris Shaedig (Textiles/Mixed Media). Suite 210: Lisa Farris. Suite 215: InkBird Print Studio, Claire Davis and Chris Luberger (Screenprinted art, stickers, digital art, laser-cut and 3D-printed gifts). Suite 224: Kasper and Clay, Brooke Herzing (Ceramics). Suite 227: Jeremy Paskell (Painting/Muralist), Cheryl Barill (Oil Painting/Gold Leaf). Suite 232: Mary Pop (Screen Printing). Suite 233: David Prescott (Drawing/Mixed Media), Milan''s Metals/Angie (Jewelry), Emily Molczyk (Drawing/Painting/Mixed Media), Krysten Quintana (Fabric/Textiles). Suite 252: Bruce Campbell (Painting/Furniture).\n3rd Floor -- Suite 300: Funky Monkey (Tie Dye/Ceramics/Mixed Media). Suite 308: Melissa Webb (Fiber, Installation Artist). Suite 319: Molly May Art (Ceramics/Jewelry), Brett Sauve Art (Ceramics/Illustration/Printmaking).\n4th Floor -- Suite 401: Rachel Gluski (Painting). Suite 406: Linda Kentoffio (Printmaking, Paper Making), Kira Keck (Fiber, Textiles), Jane Sasso (Floral Design/Painting). Suite 410: Mary Duprie (Photography, Painting). Suite 411: Thomas Finney (Leather).',
    note = 'Hosted by 40 West Howard Artists Guild (a collective of creatives and small businesses in Pontiac, MI) and 3 others, per the event''s own Facebook page.'
where external_id = 'fb-2236314620490132';

insert into schema_migrations (filename) values ('update_2026-09-18_fall-open-studios-studio-directory.sql')
on conflict (filename) do nothing;
