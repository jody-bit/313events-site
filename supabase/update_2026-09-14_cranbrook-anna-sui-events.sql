-- Manual Cranbrook Art Museum pull, 2026-09-14 — Jody researched Cranbrook's
-- own calendar directly and asked for four related "World of Anna Sui"
-- companion events to be added by hand: the fundraising gala, an ArtMember-
-- exclusive preview/talk, a recurring exhibition tour (8 dates), and a
-- family workshop. The exhibition itself opens to the public Oct 21, 2026.
--
-- VENUE: Cranbrook Art Museum is a brand-new venue for this site (no prior
-- migration references it) — inserted once below, in Bloomfield Hills, MI,
-- well within the 75-mile service area. No neighborhood_id set: Bloomfield
-- Hills isn't part of this project's Detroit neighborhood taxonomy, same
-- posture already used for other out-of-Detroit suburbs (e.g. Clinton
-- Township in the Mt. Elliott Cemetery Association pull).
--
-- ADDRESS DISCREPANCY: Jody gave zip 48303; Cranbrook Art Museum's own event
-- page (cranbrookartmuseum.org/events/crandemonium-gala-art-after-dark/)
-- lists 48304 for the same street address. Used the museum's own
-- self-reported zip (48304) below since it's the more authoritative source
-- for its own address — flagging the discrepancy here rather than silently
-- picking one.
--
-- 1) CRANDEMONIUM GALA & ART AFTER DARK — verified directly against
-- cranbrookartmuseum.org/events/crandemonium-gala-art-after-dark/: date,
-- time, and description all match Jody's own research. Real ticket/RSVP
-- URL confirmed on that page (a onecau.se fundraising-platform link, not a
-- generic Cranbrook URL — that's normal for a ticketed gala).
--
-- 2) ARTMEMBER PREVIEW & ANNA SUI TALK — could not find this specific
-- event independently published on cranbrookartmuseum.org/events/ or its
-- calendar as of this writing (searched directly). Jody says she confirmed
-- it against Cranbrook's own calendar; taking her word for the event's
-- existence and details, but since I can't verify a dedicated ticket page,
-- ticket_url below points at the exhibition's own page (the same "link
-- back rather than invent one" fallback this project always uses) rather
-- than a URL I can't confirm is real. time_display is explicitly "Time TBA"
-- per Jody's own note that Cranbrook hasn't published a time yet — do not
-- invent one; update this row once it's announced.
--
-- 3) EXHIBITION TOUR SERIES — independently verified in full against
-- cranbrookartmuseum.org/events/the-world-of-anna-sui-exhibition-tour/:
-- all 8 dates, the 11:30am-12:30pm time, and both prices ($22 general/$5
-- ArtMembers) matched Jody's list exactly. The schema has no real
-- recurring-event mechanism (events.is_recurring is just a flag, not a
-- date series), so per Jody's own fallback instruction this is 8 separate
-- event rows, each flagged is_recurring=true and sharing one external_id
-- prefix with a date suffix.
--
-- 4) FAMILY WORKSHOP: ANNA SUI FAIRYTALE DESIGN (Dec 5) — like #2, could
-- not find this specific workshop independently published (the museum's
-- site currently surfaces a separate, differently-named "Fall Family Day"
-- on Nov 7, which is NOT the same event and is not being added here).
-- Taking Jody's own direct-from-calendar research on faith for date/time/
-- price; ticket_url again falls back to the exhibition page rather than a
-- guessed direct link. category='family' per Jody's own instruction.

insert into venues (name, address, city, zip_code)
values ('Cranbrook Art Museum', '39221 Woodward Ave', 'Bloomfield Hills', '48304')
on conflict (lower(name), lower(city)) do update set
  address = excluded.address,
  zip_code = excluded.zip_code;

insert into events (
  external_id, title, description, category, venue_name_raw, venue_city_raw,
  start_date, end_date, time_display, is_free, price_from, is_recurring,
  ticket_url, source, note, status
) values

('cranbrook-anna-sui-crandemonium-gala-2026-10-17', 'Crandemonium Gala & Art After Dark: The World of Anna Sui',
 'Cranbrook''s signature fall fundraiser celebrates art, design, fashion, and creativity throughout the grounds and galleries of Cranbrook Art Museum. Inspired by the upcoming World of Anna Sui exhibition, the 2026 event welcomes metro Detroit-born fashion designer Anna Sui as Guest of Honor and gives gala attendees an early look at more than 100 pieces spanning her influential career.',
 'visual', 'Cranbrook Art Museum', 'Bloomfield Hills',
 '2026-10-17', '2026-10-17', '6:30 PM–11:00 PM', false, null, false,
 'http://onecau.se/cran?utm_campaign=crandemonium_2026&utm_medium=website&utm_source=cranbrookartmuseum&utm_content=cam_event',
 'Manual', 'Ticketed fundraising gala with tiered sponsorship levels — no single price, per Jody''s own note.', 'approved'),

('cranbrook-anna-sui-artmember-preview-talk-2026-10-18', 'The World of Anna Sui: ArtMember Preview & Anna Sui Talk',
 'Cranbrook Art Museum hosts an exclusive ArtMember preview of The World of Anna Sui before the exhibition opens to the public. Metro Detroit-born fashion icon Anna Sui will appear in person and deliver a talk about her work and creative career. The exhibition brings together more than 100 looks from Sui''s archive, tracing the music, subcultures, historical references, and distinctive visual worlds that have shaped more than three decades of her influential designs.',
 'visual', 'Cranbrook Art Museum', 'Bloomfield Hills',
 '2026-10-18', '2026-10-18', 'Time TBA', false, null, false,
 'https://cranbrookartmuseum.org/exhibition/the-world-of-anna-sui/',
 'Manual', 'ArtMember-exclusive — listed anyway since it''s useful information for anyone deciding whether to become a member. Time not yet published by Cranbrook; update when announced.', 'approved'),

('cranbrook-anna-sui-tour-2026-10-23', 'The World of Anna Sui Exhibition Tour', 'Take a guided tour through The World of Anna Sui, featuring nearly 100 looks from the metro Detroit-born designer''s archive. Explore the 12 recurring fashion archetypes that have shaped Sui''s career, including Grunge, Punk, Mod, Victorian, Schoolgirl, Fairytale, Americana, Androgyny, Hippie/Rockstar, Nomad, Retro, and Surfer. Admission to Cranbrook Art Museum is included with the general-public tour ticket.', 'visual', 'Cranbrook Art Museum', 'Bloomfield Hills', '2026-10-23', '2026-10-23', '11:30 AM–12:30 PM', false, 5.00, true, 'https://cranbrookartmuseum.org/events/the-world-of-anna-sui-exhibition-tour/', 'Manual', '$5 ArtMembers / $22 general public including museum admission. One of 8 dates in this recurring tour series.', 'approved'),
('cranbrook-anna-sui-tour-2026-11-06', 'The World of Anna Sui Exhibition Tour', 'Take a guided tour through The World of Anna Sui, featuring nearly 100 looks from the metro Detroit-born designer''s archive. Explore the 12 recurring fashion archetypes that have shaped Sui''s career, including Grunge, Punk, Mod, Victorian, Schoolgirl, Fairytale, Americana, Androgyny, Hippie/Rockstar, Nomad, Retro, and Surfer. Admission to Cranbrook Art Museum is included with the general-public tour ticket.', 'visual', 'Cranbrook Art Museum', 'Bloomfield Hills', '2026-11-06', '2026-11-06', '11:30 AM–12:30 PM', false, 5.00, true, 'https://cranbrookartmuseum.org/events/the-world-of-anna-sui-exhibition-tour/', 'Manual', '$5 ArtMembers / $22 general public including museum admission. One of 8 dates in this recurring tour series.', 'approved'),
('cranbrook-anna-sui-tour-2026-11-20', 'The World of Anna Sui Exhibition Tour', 'Take a guided tour through The World of Anna Sui, featuring nearly 100 looks from the metro Detroit-born designer''s archive. Explore the 12 recurring fashion archetypes that have shaped Sui''s career, including Grunge, Punk, Mod, Victorian, Schoolgirl, Fairytale, Americana, Androgyny, Hippie/Rockstar, Nomad, Retro, and Surfer. Admission to Cranbrook Art Museum is included with the general-public tour ticket.', 'visual', 'Cranbrook Art Museum', 'Bloomfield Hills', '2026-11-20', '2026-11-20', '11:30 AM–12:30 PM', false, 5.00, true, 'https://cranbrookartmuseum.org/events/the-world-of-anna-sui-exhibition-tour/', 'Manual', '$5 ArtMembers / $22 general public including museum admission. One of 8 dates in this recurring tour series.', 'approved'),
('cranbrook-anna-sui-tour-2026-12-04', 'The World of Anna Sui Exhibition Tour', 'Take a guided tour through The World of Anna Sui, featuring nearly 100 looks from the metro Detroit-born designer''s archive. Explore the 12 recurring fashion archetypes that have shaped Sui''s career, including Grunge, Punk, Mod, Victorian, Schoolgirl, Fairytale, Americana, Androgyny, Hippie/Rockstar, Nomad, Retro, and Surfer. Admission to Cranbrook Art Museum is included with the general-public tour ticket.', 'visual', 'Cranbrook Art Museum', 'Bloomfield Hills', '2026-12-04', '2026-12-04', '11:30 AM–12:30 PM', false, 5.00, true, 'https://cranbrookartmuseum.org/events/the-world-of-anna-sui-exhibition-tour/', 'Manual', '$5 ArtMembers / $22 general public including museum admission. One of 8 dates in this recurring tour series.', 'approved'),
('cranbrook-anna-sui-tour-2026-12-18', 'The World of Anna Sui Exhibition Tour', 'Take a guided tour through The World of Anna Sui, featuring nearly 100 looks from the metro Detroit-born designer''s archive. Explore the 12 recurring fashion archetypes that have shaped Sui''s career, including Grunge, Punk, Mod, Victorian, Schoolgirl, Fairytale, Americana, Androgyny, Hippie/Rockstar, Nomad, Retro, and Surfer. Admission to Cranbrook Art Museum is included with the general-public tour ticket.', 'visual', 'Cranbrook Art Museum', 'Bloomfield Hills', '2026-12-18', '2026-12-18', '11:30 AM–12:30 PM', false, 5.00, true, 'https://cranbrookartmuseum.org/events/the-world-of-anna-sui-exhibition-tour/', 'Manual', '$5 ArtMembers / $22 general public including museum admission. One of 8 dates in this recurring tour series.', 'approved'),
('cranbrook-anna-sui-tour-2027-01-15', 'The World of Anna Sui Exhibition Tour', 'Take a guided tour through The World of Anna Sui, featuring nearly 100 looks from the metro Detroit-born designer''s archive. Explore the 12 recurring fashion archetypes that have shaped Sui''s career, including Grunge, Punk, Mod, Victorian, Schoolgirl, Fairytale, Americana, Androgyny, Hippie/Rockstar, Nomad, Retro, and Surfer. Admission to Cranbrook Art Museum is included with the general-public tour ticket.', 'visual', 'Cranbrook Art Museum', 'Bloomfield Hills', '2027-01-15', '2027-01-15', '11:30 AM–12:30 PM', false, 5.00, true, 'https://cranbrookartmuseum.org/events/the-world-of-anna-sui-exhibition-tour/', 'Manual', '$5 ArtMembers / $22 general public including museum admission. One of 8 dates in this recurring tour series.', 'approved'),
('cranbrook-anna-sui-tour-2027-02-05', 'The World of Anna Sui Exhibition Tour', 'Take a guided tour through The World of Anna Sui, featuring nearly 100 looks from the metro Detroit-born designer''s archive. Explore the 12 recurring fashion archetypes that have shaped Sui''s career, including Grunge, Punk, Mod, Victorian, Schoolgirl, Fairytale, Americana, Androgyny, Hippie/Rockstar, Nomad, Retro, and Surfer. Admission to Cranbrook Art Museum is included with the general-public tour ticket.', 'visual', 'Cranbrook Art Museum', 'Bloomfield Hills', '2027-02-05', '2027-02-05', '11:30 AM–12:30 PM', false, 5.00, true, 'https://cranbrookartmuseum.org/events/the-world-of-anna-sui-exhibition-tour/', 'Manual', '$5 ArtMembers / $22 general public including museum admission. One of 8 dates in this recurring tour series.', 'approved'),
('cranbrook-anna-sui-tour-2027-02-19', 'The World of Anna Sui Exhibition Tour', 'Take a guided tour through The World of Anna Sui, featuring nearly 100 looks from the metro Detroit-born designer''s archive. Explore the 12 recurring fashion archetypes that have shaped Sui''s career, including Grunge, Punk, Mod, Victorian, Schoolgirl, Fairytale, Americana, Androgyny, Hippie/Rockstar, Nomad, Retro, and Surfer. Admission to Cranbrook Art Museum is included with the general-public tour ticket.', 'visual', 'Cranbrook Art Museum', 'Bloomfield Hills', '2027-02-19', '2027-02-19', '11:30 AM–12:30 PM', false, 5.00, true, 'https://cranbrookartmuseum.org/events/the-world-of-anna-sui-exhibition-tour/', 'Manual', '$5 ArtMembers / $22 general public including museum admission. One of 8 dates in this recurring tour series.', 'approved'),

('cranbrook-anna-sui-family-workshop-2026-12-05', 'Family Workshop: Anna Sui Fairytale Design',
 'A family workshop inspired by The World of Anna Sui exhibition. Kids create headpieces and brooches inspired by Sui''s Fairytale collections. Intended for families with children ages 4–16.',
 'family', 'Cranbrook Art Museum', 'Bloomfield Hills',
 '2026-12-05', '2026-12-05', '1:30 PM–3:00 PM', false, 15.00, false,
 'https://cranbrookartmuseum.org/exhibition/the-world-of-anna-sui/',
 'Manual', '$15 per participant, ages 4-16.', 'approved')

on conflict (external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  venue_name_raw = excluded.venue_name_raw,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  time_display = excluded.time_display,
  is_free = excluded.is_free,
  price_from = excluded.price_from,
  is_recurring = excluded.is_recurring,
  ticket_url = excluded.ticket_url,
  note = excluded.note;

update events e
set venue_id = v.id
from venues v
where lower(trim(e.venue_name_raw)) = lower(trim(v.name))
  and e.venue_id is null;

insert into schema_migrations (filename) values ('update_2026-09-14_cranbrook-anna-sui-events.sql')
on conflict (filename) do nothing;
