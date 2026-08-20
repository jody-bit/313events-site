# 313.events — Foundational Items Before the Full Redesign

You asked: generate the neighborhoods reference, and what else do we need before attempting organizers + neighborhoods for real. This is that list. Nothing here has been applied to your live database — `supabase/migration_002_neighborhoods_and_organizers.sql` is ready to run in the Supabase SQL Editor when you're ready, same as `schema.sql`/`seed.sql` originally were.

## 1. Neighborhoods reference — done, researched, ready to run

39 neighborhoods (38 from the initial city-wide pass, plus "Wildemere Park" which turned up during venue-specific research below), researched via web search against Wikipedia, the City of Detroit Planning & Development Dept, Detroit Historical Society, Model D Media, Bridge Michigan, and Metro Times. Detroit has no single authoritative boundary map (the City organizes by ~7 planning "design regions," not a flat list), so treat this as a practical working set, not a legal survey. Full list is in the migration file; it spans downtown out through the northwest and southwest sides, not just the tourist-visible core, per the brief's own instruction not to reduce Detroit to its most visible neighborhoods.

It's a real table (`neighborhoods`), not a hardcoded enum, on purpose: while researching venue addresses, "Dexter-Fenkell" turned up as a real, sourced neighborhood that wasn't on the initial city-wide list. A table can grow with one `insert`; an enum needs a migration every time. That's not a hypothetical — it already happened once during this research pass.

## 2. Venue → neighborhood backfill — reviewed and resolved

I had two independent research passes verify every real venue in your current seed data against live sources (venue sites, Wikipedia, Yelp, local press). High-confidence matches (2+ independent sources) were auto-applied; everything thinner than that went back to you rather than getting guessed — all of it is now reviewed and reflected in the migration.

**Applied automatically (high confidence):**

| Venue | Neighborhood |
|---|---|
| Cliff Bell's, Comerica Park, Detroit Opera House, Fox Theatre, Spkrbox, Hart Plaza | Downtown |
| DIA – Detroit Film Theatre, DIA – Rivera Court, Detroit Historical Museum, Detroit Institute of Arts, MOCAD, Magic Stick, Majestic Theater/Theatre | Midtown |
| El Club | Mexicantown / Southwest Detroit |
| Marble Bar, Northern Lights Lounge | New Center |
| MotorCity Wine | Corktown |
| Tangent Gallery | Milwaukee Junction |
| Trumbullplex | Woodbridge |
| Eastern Market | Eastern Market (self) |
| Belle Isle Park | Belle Isle (self) |
| Andy Arts | Dexter-Fenkell |

**Reviewed with you and now resolved — all applied in the migration:**

| Venue | Resolution | Basis |
|---|---|---|
| Little Caesars Arena | Midtown | You chose the more explicitly sourced claim over common "Downtown" marketing usage |
| TV Lounge | North Corktown | No source would commit — you made the closest-on-a-map judgment call; treat as lower-confidence than the rest of this list |
| Menjo's | City confirmed Detroit (McNichols corridor); left with **no neighborhood** | Address/listings support Detroit over Highland Park; the specific stretch of McNichols didn't resolve to one commonly-recognized neighborhood name |
| Russell Industrial Center | Milwaukee Junction | One strong source (Bridge Michigan) — you accepted it |
| Moondog Cafe | Wildemere Park *(new neighborhood, added to the reference list)* | One source (Metro Times) — you accepted it |
| Big Pink | Rivertown | One source (Zillow listing description, not press) — you accepted it |
| Cannons | Morningside | Two sources (Redfin + Detroit News), thin only because the venue opened late 2025 — you accepted it |

**Data-quality issues the research surfaced — reviewed with you, all fixed in the migration:**

- **"Elektricity"** was tagged `city='Detroit'`, but every source (its own listings, Resident Advisor, Yelp) places it at 15 S Saginaw St, **Pontiac, MI** — a different city 25 miles north. Migration updates `city` to `'Pontiac'`.
- **"The Strays"** was tagged `city='Detroit'`, but every source places it in **Hamtramck, MI**, same as Paris Bar and Small's. Migration updates `city` to `'Hamtramck'`.
- **"Majestic Theater" vs "Majestic Theatre"** were two separate venue rows for the same building (4120–4140 Woodward). Since events reference venues by free-text `venue_name_raw` (not `venue_id` — see the gap below), the merge also normalizes the text on the two existing events that used the "Theater" spelling, then removes the duplicate venue row.

## 3. Organizers — schema proposed, deliberately not populated

The migration creates an `organizers` table and a nullable `events.organizer_id`, but leaves it empty. Before anyone starts filling it in, there's a real modeling question the current data doesn't answer:

**`events.source` and "organizer" are not the same thing, and the current data conflates them.** `source` records *where we found the listing* — `'Resident Advisor'`, `'19hz.info'`, `'Ticketmaster'`, `'Manual'`. An organizer is *who's actually presenting the event* — e.g. Paxahau, who both promotes events directly (so they'd be a real organizer) **and** shows up as part of the `source` string today (`'Paxahau / Resident Advisor'`). If we auto-populate organizers from the `source` field, most listing sources (Resident Advisor, 19hz.info, Ticketmaster) aren't organizers at all — they're aggregators — so it'd create a bunch of fake "organizer" entities that are really just data sources.

The honest population strategy is the same one that built the original 187-event seed set: hand-curate organizers for names that are clearly real promoters/institutions already visible in your data (Paxahau is the obvious first one — it appears on ~15 events already), and leave the rest unassigned rather than inventing an organizer for every event.

## 4. Other things this surfaced, worth knowing before Homepage v1

- **`events.venue_id` isn't actually being used.** The seed data and all four cron scripts write `venue_name_raw` as free text; `venue_id` stays null. That means the neighborhood backfill above doesn't automatically flow through to events yet — it's sitting on `venues`, one join away, but nothing populates `events.venue_id` today. Worth fixing (matching `venue_name_raw` → `venues.name`) before a homepage "what's happening in Corktown" module could actually query anything.
- **No venue photography field exists.** Venue profile pages (§19–20 of the brief) will fall back to the venue placeholder for every single venue until this is added.
- **No structured `start_time`.** NOW/TONIGHT logic can ship approximated from `time_display` (a loose string like `"7:00–9:00 PM"`), but it won't be fully reliable until there's a real time column.

## Where this leaves Homepage v1

None of the above blocks starting the homepage — the brief's own hierarchy (§9) doesn't require neighborhoods/organizers/venues to be fully wired before shipping NOW/TONIGHT, category discovery, and the hero. It just means, honestly: no neighborhood or venue discovery module on the homepage yet, because there isn't a reliable data path from events to neighborhoods yet even with this migration applied (see the `venue_id` gap above). That's the same "don't fabricate it" logic as the original audit.
