# 313.events — Service Area (75-mile radius)

As of 2026-08-24, 313.events' coverage area changed from "the City of Detroit, plus the Hamtramck and Highland Park enclaves" to a **75-mile radius from Detroit's center**, matching the regional radius used by the area's music census work (the same radius the Census-adjacent regional data this project is meant to track uses). This document is the reference for what that actually means geographically, so the change isn't just a tagline swap — it's traceable to real numbers.

Center point used: Detroit, MI (42.3314, -83.0458). Distances are great-circle (haversine), not driving distance, so actual travel time varies more than the mileage below suggests, especially across the river into Ontario.

## What's now in scope (within 75 miles)

Ordered nearest to farthest. This is not exhaustive — any city, township, or venue that falls inside the radius is in scope even if it isn't listed here — but it covers the cities worth naming explicitly, either because they're well-known regional hubs or because they were previously and explicitly excluded.

| City | Distance from Detroit |
|---|---|
| Windsor, ON | 1 mi (across the river) |
| Bloomfield Hills, MI | 20 mi |
| Rochester, MI | 25 mi |
| Pontiac, MI | 25 mi |
| Ypsilanti, MI | 30 mi |
| Milford, MI | 34 mi |
| Clarkston, MI | 34 mi |
| Monroe, MI | 34 mi |
| Ann Arbor, MI | 36 mi |
| Brighton, MI | 40 mi |
| Chatham, ON | 44 mi |
| Fenton, MI | 46 mi |
| Howell, MI | 49 mi |
| Toledo, OH | 53 mi |
| Port Huron, MI | 54 mi |
| Sarnia, ON | 55 mi |
| Flint, MI | 57 mi |
| Adrian, MI | 59 mi |
| Jackson, MI | 70 mi |
| Owosso, MI | 74 mi |

## What's just outside (nearby but still excluded)

These come up often enough in regional conversation that it's worth being explicit they're still out of scope, rather than letting that be an unstated gap:

| City | Distance from Detroit |
|---|---|
| Lansing, MI | 82 mi |
| Saginaw, MI | 88 mi |
| Bay City, MI | 97 mi |
| London, ON | 102 mi |
| Battle Creek, MI | 109 mi |
| Mount Pleasant, MI | 123 mi |
| Kalamazoo, MI | 130 mi |
| Grand Rapids, MI | 140 mi |

## Implications worth flagging

**International reach.** The radius pulls in Windsor, Chatham, and Sarnia, Ontario — meaning 313.events is now, functionally, a cross-border calendar. That has real follow-on questions this document isn't answering, just surfacing: currency display for ticket prices, whether Canadian venues/promoters should be solicited the same way Detroit ones are, and whether "Detroit arts calendar" framing still reads accurately to a Windsor venue being asked to submit their own listing.

**Cross-state reach.** Toledo, OH is inside the radius. Same open question as above, in miniature — Toledo has its own separate arts/events ecosystem and identity, and folding it in changes what "comprehensive" means for this product.

**The "313" name — resolved.** 313 is Detroit's area code, and a 75-mile radius includes cities with entirely different area codes (Ann Arbor's 734, Flint's 810, Toledo's 419, Windsor's 519). Decision (2026-08-24): keep the name. Detroit is the largest and best-known city in the service area, the name is an established domain and brand, and "313" reads as a regional identifier the way "Metro Times" or "Crain's Detroit" do — the same logic Hello Cleveland's own reach beyond city limits doesn't require a name change either.

**Neighborhood scope — resolved.** The 39-neighborhood reference system documented in `FOUNDATIONAL_ITEMS.md` stays Detroit-only, by design rather than as a temporary gap. Decision (2026-08-24): neighborhood-level granularity is a Detroit-specific feature — it's part of what makes Detroit itself feel distinct within the wider service area — while every other city/township in the 75-mile radius is tracked at the city level (the `venues.city` field), not broken into neighborhoods. So a venue in Corktown shows "Corktown," while a venue in Ann Arbor shows "Ann Arbor" — no neighborhood-equivalent list needs to be built for the other 20+ municipalities now in scope.

## Sources referencing this document

- `index.html` — footer scope note
- `sources.html` — footer scope-corrections note (Cranbrook)
- `schema.sql` — `venues.city` column comment
- `AUDIT_AND_ARCHITECTURE.md`, `FOUNDATIONAL_ITEMS.md` — scope-change notes

Distances computed via haversine formula (R = 3958.8 mi), 2026-08-24. Re-derivable from the coordinates listed above if the radius or center point ever changes.
