-- 20261006000001_reference_data.sql
--
-- Reference (non-personal) lookup data the application needs to function:
-- the neighborhoods list and the 14 event categories. Copied verbatim from the
-- committed migrations (002, 026, 032), NOT from production rows. Idempotent.
-- Venues are not seeded here (see SZ-15: sanitized venue reference snapshot).

insert into neighborhoods (name, area_note, is_district) values
  ('Downtown',            'city center, riverfront to the Fisher Fwy area', false),
  ('Midtown',              'north of downtown, Wayne State / Woodward corridor', false),
  ('New Center',           'west of Woodward at Grand Blvd, north of Midtown', false),
  ('Corktown',             'west of downtown, near Michigan Ave/Trumbull — Detroit''s oldest surviving neighborhood', false),
  ('North Corktown',       'north of Corktown, cut off by I-75 construction', false),
  ('Core City',            'west of downtown near Grand River/Trumbull, adjacent to North Corktown', false),
  ('Woodbridge',           'between Midtown and Corktown, west of the Lodge Fwy, near Wayne State', false),
  ('Eastern Market',       'northeast of downtown along Gratiot Ave — a district in its own right', true),
  ('Brush Park',           'just north of downtown, east of Woodward', false),
  ('Lafayette Park',       'east of downtown, riverfront-adjacent', false),
  ('Rivertown',            'east of downtown along E. Jefferson Ave, riverfront (includes Harbortown)', false),
  ('Indian Village',       'east side along Jefferson Ave, bounded by Mack/Burns/Seminole', false),
  ('West Village',         'just west of Indian Village, near Jefferson/Kercheval', false),
  ('Islandview',           'between West Village and the river, south to Jefferson', false),
  ('Milwaukee Junction',   'historic industrial district, east side near New Center/North End', false),
  ('North End',            'east side, north of New Center, around John R/California St; borders Highland Park', false),
  ('Poletown East',        'east side, directly bordering Hamtramck', false),
  ('Jefferson-Chalmers',   'far east side, along E. Jefferson Ave near the river', false),
  ('Belle Isle',           'island state park in the Detroit River, off the east side — city-owned, DNR-operated since 2014', true),
  ('Morningside',          'east side, roughly Harper Ave/I-94 to the north, Mack Ave to the south', false),
  ('East English Village',  'northeast side, tree-lined residential district', false),
  ('Boston-Edison',        'north of New Center, between Woodward and Linwood Aves', false),
  ('Arden Park-East Boston','adjacent to Boston-Edison, between Woodward and Oakland', false),
  ('University District',  'north-central, ~1 mile west of Woodward, near U of D Mercy', false),
  ('Palmer Park',          'north-central, Woodward (east) to 7 Mile (north) to McNichols (south)', false),
  ('Palmer Woods',         'just north/west of Palmer Park, private historic enclave', false),
  ('Sherwood Forest',      'northwest, 7 Mile (south), Livernois (west), Pembroke (east)', false),
  ('Bagley',               'northwest, west of Palmer Woods/Sherwood Forest/University District', false),
  ('Russell Woods',        'northwest, near Livernois/Elmhurst', false),
  ('Fitzgerald',           'northwest, Livernois/McNichols corridor ("Live6")', false),
  ('Grandmont-Rosedale',   'northwest, near Grand River/Southfield Fwy — umbrella name for four platted subdivisions', false),
  ('Old Redford',          'northwest, around Grand River Ave and Lahser Rd', false),
  ('Warrendale',           'west side, one of Detroit''s largest neighborhoods, near Warren Ave', false),
  ('Brightmoor',           'far northwest side, near Fenkell/Lahser', false),
  ('Mexicantown / Southwest Detroit', 'southwest, along W. Vernor Hwy from Clark St', false),
  ('Springwells',          'southwest, near Dix Hwy/Fort St, adjacent to Mexicantown', false),
  ('Delray',               'far southwest, along the river near Fort St/Zug Island — heavily industrial', false),
  ('Dexter-Fenkell',       'northwest, Dexter Ave corridor near Fenkell — surfaced via venue research, not the original city-wide pass; confirm before treating as canonical', false),
  ('Wildemere Park',       'northwest, Dexter-Linwood corridor — surfaced via venue research (single source: Metro Times), not the original city-wide pass', false)
on conflict (name) do nothing;

insert into categories (slug, label, color_var, sort_order) values
  ('music',     'Music',                'var(--c-music)',     1),
  ('theatre',   'Theatre & Comedy',     'var(--c-theatre)',   2),
  ('dance',     'Dance & Opera',        'var(--c-dance)',     3),
  ('visual',    'Visual Arts',          'var(--c-visual)',    4),
  ('museum',    'Museums & History',    'var(--c-museum)',    5),
  ('family',    'Family',               'var(--c-family)',    6),
  ('fest',      'Festivals & Parades',  'var(--c-fest)',      7),
  ('food',      'Food & Markets',       'var(--c-food)',      8),
  ('film',      'Film',                 'var(--c-film)',      9),
  ('nightlife', 'Nightlife & Club',     'var(--c-night)',    10),
  ('sports',    'Sports',               'var(--c-sports)',   11),
  ('community', 'Community',            'var(--c-community)',12),
  ('vendor',    'Vendor Markets',       'var(--c-vendor)',   13)
on conflict (slug) do update set
  label = excluded.label,
  color_var = excluded.color_var,
  sort_order = excluded.sort_order;

insert into categories (slug, label, color_var, sort_order) values
  ('training', 'Classes & Training', 'var(--c-training)', 14)
on conflict (slug) do update set
  label = excluded.label,
  color_var = excluded.color_var,
  sort_order = excluded.sort_order;
